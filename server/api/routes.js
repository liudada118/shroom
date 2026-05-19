/**
 * API 路由模块
 * 所有 HTTP API 端点定义，调用 state 和各 service 完成业务逻辑
 */
const express = require('express')
const fs = require('fs')
const path = require('path')
const HttpResult = require('../HttpResult')
const constantObj = require('../../util/config')
const { initDb, dbLoadCsv, deleteDbData, dbGetData, getCsvData, buildCsvPlaybackData, changeDbName, changeDbDataName, upsertRemark, getRemark, ensureWritableDir, resolveWritableDownloadDir, validateImportedCsv, listSelectionTemplates, replaceSelectionTemplates } = require('../../util/db')
const module2 = require('../../util/aes_ecb')
const { readEncryptedSystemConfig } = require('../../util/systemConfig')
const { state } = require('../state')
const { broadcast } = require('../websocket')
const { connectPort, rescanPort, portWrite, stopPort, detectBaudRate, sendMacCommand, resolveDeviceType } = require('../serial/SerialManager')
const { colAndSendData, sendData, clearPlayTimer, startPlayback, changePlaySpeed, getPlaybackSnapshot, saveDataDirection } = require('../services/DataService')
const { getAllCached, setTypeToCache, removeFromCache, clearCache } = require('../../util/serialCache')
const { validateDeviceList, validateDeviceAgainstCache, SUPPORTED_DEVICE_TYPES } = require('../../util/deviceConfigValidation')

const router = express.Router()
const historyIndexReady = new WeakSet()

function ensureHistoryListIndex(db) {
  if (!db || historyIndexReady.has(db)) return Promise.resolve()
  return new Promise((resolve, reject) => {
    db.run('CREATE INDEX IF NOT EXISTS idx_matrix_date_timestamp ON matrix(date, timestamp)', (err) => {
      if (err) {
        reject(err)
        return
      }
      historyIndexReady.add(db)
      resolve()
    })
  })
}

const CONTRAST_MATRIX_DIMENSIONS = {
  'endi-back': { width: 50, height: 64 },
  'endi-sit': { width: 46, height: 46 },
  'carY-back': { width: 32, height: 32 },
  'carY-sit': { width: 32, height: 32 },
  'car-back': { width: 32, height: 32 },
  'car-sit': { width: 32, height: 32 },
  bed: { width: 32, height: 32 },
  hand: { width: 32, height: 32 },
  foot: { width: 32, height: 32 },
  bigHand: { width: 64, height: 64 },
}

function parseMatrixFrame(row) {
  if (!row || !row.data) return {}
  if (typeof row.data === 'object') return row.data
  try {
    return JSON.parse(row.data)
  } catch {
    return {}
  }
}

function getComparableKeys(frame) {
  return Object.keys(frame || {})
    .filter((key) => key && key !== 'null' && key !== 'undefined' && Array.isArray(frame[key]?.arr))
    .sort()
}

function getContrastCommonKeys(leftFrame, rightFrame) {
  const leftKeys = getComparableKeys(leftFrame)
  const rightKeySet = new Set(getComparableKeys(rightFrame))
  return leftKeys.filter((key) => {
    if (!rightKeySet.has(key)) return false
    const leftArr = leftFrame[key]?.arr
    const rightArr = rightFrame[key]?.arr
    if (!Array.isArray(leftArr) || !Array.isArray(rightArr)) return false
    if (leftArr.length !== rightArr.length) return false
    const size = inferMatrixSize(key, leftArr)
    return size.width * size.height === leftArr.length
  })
}

function inferMatrixSize(key, arr) {
  if (CONTRAST_MATRIX_DIMENSIONS[key]) return CONTRAST_MATRIX_DIMENSIONS[key]
  const length = Array.isArray(arr) ? arr.length : 0
  const side = Math.sqrt(length)
  if (Number.isInteger(side) && side > 0) return { width: side, height: side }
  return { width: length, height: 1 }
}

function normalizeContrastFrame(row, keys) {
  const frame = parseMatrixFrame(row)
  const result = {
    _timestamp: row?.timestamp ?? '',
  }
  keys.forEach((key) => {
    const source = frame[key] || {}
    const arr = Array.isArray(source.arr) ? source.arr.map((value) => Number(value) || 0) : []
    const size = inferMatrixSize(key, arr)
    result[key] = {
      ...source,
      arr,
      width: size.width,
      height: size.height,
    }
  })
  return result
}

function buildDiffFrame(leftFrame, rightFrame, keys) {
  const diff = {}
  keys.forEach((key) => {
    const leftArr = leftFrame[key]?.arr || []
    const rightArr = rightFrame[key]?.arr || []
    const size = inferMatrixSize(key, leftArr.length ? leftArr : rightArr)
    const length = Math.min(leftArr.length, rightArr.length)
    diff[key] = {
      arr: Array.from({ length }, (_, index) => (Number(rightArr[index]) || 0) - (Number(leftArr[index]) || 0)),
      width: size.width,
      height: size.height,
      diff: true,
    }
  })
  return diff
}

function buildContrastFrame(leftRows, rightRows, keys, progress = 0) {
  const safeProgress = Math.min(100, Math.max(0, Number(progress) || 0))
  const leftIndex = leftRows.length > 1 ? Math.round((leftRows.length - 1) * safeProgress / 100) : 0
  const rightIndex = rightRows.length > 1 ? Math.round((rightRows.length - 1) * safeProgress / 100) : 0
  const left = normalizeContrastFrame(leftRows[leftIndex], keys)
  const right = normalizeContrastFrame(rightRows[rightIndex], keys)
  return {
    progress: safeProgress,
    leftIndex,
    rightIndex,
    left,
    right,
    diff: buildDiffFrame(left, right, keys),
    leftTimestamp: leftRows[leftIndex]?.timestamp ?? '',
    rightTimestamp: rightRows[rightIndex]?.timestamp ?? '',
  }
}

function clampFrameIndex(rows, index) {
  if (!Array.isArray(rows) || !rows.length) return 0
  const value = Number(index)
  const safeIndex = Number.isFinite(value) ? Math.round(value) : 0
  return Math.max(0, Math.min(rows.length - 1, safeIndex))
}

function buildContrastFrameByIndex(leftRows, rightRows, keys, leftIndex = 0, rightIndex = 0) {
  const safeLeftIndex = clampFrameIndex(leftRows, leftIndex)
  const safeRightIndex = clampFrameIndex(rightRows, rightIndex)
  const left = normalizeContrastFrame(leftRows[safeLeftIndex], keys)
  const right = normalizeContrastFrame(rightRows[safeRightIndex], keys)
  return {
    progress: null,
    leftIndex: safeLeftIndex,
    rightIndex: safeRightIndex,
    left,
    right,
    diff: buildDiffFrame(left, right, keys),
    leftTimestamp: leftRows[safeLeftIndex]?.timestamp ?? '',
    rightTimestamp: rightRows[safeRightIndex]?.timestamp ?? '',
  }
}

function validateContrastResults(leftResult, rightResult, leftId, rightId) {
  if (!leftId) return '请先选择基准数据 A。'
  if (!rightId) return '请先选择对比数据 B。'
  if (String(leftId) === String(rightId)) return 'A 和 B 不能是同一条历史记录。'
  if (!leftResult.rows.length || !rightResult.rows.length) return '数据为空，不能对比。'

  const leftFirst = parseMatrixFrame(leftResult.rows[0])
  const rightFirst = parseMatrixFrame(rightResult.rows[0])
  const leftKeys = getComparableKeys(leftFirst)
  const rightKeys = getComparableKeys(rightFirst)
  if (!leftKeys.length || !rightKeys.length) return '数据缺少全量矩阵，不能对比。'
  const commonKeys = getContrastCommonKeys(leftFirst, rightFirst)
  if (!commonKeys.length) return '请分别选择坐垫对坐垫、靠背对靠背。'

  for (const key of commonKeys) {
    const leftArr = leftFirst[key]?.arr
    const rightArr = rightFirst[key]?.arr
    if (!Array.isArray(leftArr) || !Array.isArray(rightArr)) return '数据缺少全量矩阵，不能对比。'
    if (leftArr.length !== rightArr.length) return '两组数据矩阵尺寸不同，不能直接对比。'
    const size = inferMatrixSize(key, leftArr)
    if (size.width * size.height !== leftArr.length) return '两组数据矩阵尺寸不同，不能直接对比。'
  }

  return ''
}

function validateSingleRecordContrastResult(result, recordId) {
  if (!recordId) return '请选择一条历史数据。'
  if (!result.rows.length) return '数据为空，不能对比。'
  if (result.rows.length < 2) return '同记录时间点对比至少需要 2 帧数据。'

  const firstFrame = parseMatrixFrame(result.rows[0])
  const keys = getComparableKeys(firstFrame).filter((key) => {
    const arr = firstFrame[key]?.arr
    if (!Array.isArray(arr)) return false
    const size = inferMatrixSize(key, arr)
    return size.width * size.height === arr.length
  })

  if (!keys.length) return '数据缺少有效矩阵，不能对比。'
  return ''
}

function getMatrixKeyCandidates(key) {
  const candidates = [key]
  if (typeof key === 'string' && key.includes('-')) {
    candidates.push(key.split('-').pop())
  }
  if (typeof key === 'string' && !key.includes('-')) {
    const systemType = state.file || state.type || state.currentType || ''
    if (systemType) candidates.push(`${systemType}-${key}`)
  }
  return [...new Set(candidates.filter(Boolean))]
}

function getSelectionForMatrixKey(selectJson, key) {
  for (const candidate of getMatrixKeyCandidates(key)) {
    if (selectJson[candidate]) return selectJson[candidate]
  }
  if (typeof key === 'string' && !key.includes('-')) {
    const matchedKey = Object.keys(selectJson).find((selectKey) => (
      typeof selectKey === 'string' && selectKey.endsWith(`-${key}`)
    ))
    if (matchedKey) return selectJson[matchedKey]
  }
  return null
}

function readSystemConfig() {
  const configPath = state._configPath || path.join(__dirname, '..', '..', 'config.txt')
  return readEncryptedSystemConfig(configPath)
}

function resolveCurrentSystemFile() {
  const currentFile = normalizeRequestString(state.file)
  if (currentFile) {
    return currentFile
  }

  try {
    const configResult = readSystemConfig()
    const configFile = normalizeRequestString(configResult.value)
    if (configFile) {
      state.file = configFile
      state.baudRate = constantObj.baudRateObj[configFile] || 1000000
      return configFile
    }
  } catch (err) {
    console.warn('[Server] Failed to resolve current system file:', err.message)
  }

  return ''
}

function mergeSystemConfigGroup(currentGroup = {}, incomingGroup = {}) {
  const nextGroup = { ...currentGroup }
  Object.keys(incomingGroup || {}).forEach((system) => {
    nextGroup[system] = {
      ...(currentGroup?.[system] || {}),
      ...(incomingGroup?.[system] || {}),
    }
  })
  return nextGroup
}

async function ensureCurrentDb() {
  if (state.currentDb) {
    return state.currentDb
  }

  const systemFile = resolveCurrentSystemFile()
  if (!systemFile || !state._dbPath) {
    return null
  }

  const { db } = await initDb(systemFile, state._dbPath)
  state.currentDb = db
  return db
}

function normalizeRequestString(value) {
  if (value === undefined || value === null) return ''
  return String(value).trim()
}

function tryParseRequestJson(value) {
  if (typeof value !== 'string') {
    return value
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return ''
  }

  if (!/^[\[{"]/.test(trimmed)) {
    return value
  }

  try {
    return JSON.parse(trimmed)
  } catch (err) {
    return value
  }
}

function pushDownloadCandidate(target, value) {
  const normalized = normalizeRequestString(value)
  if (!normalized || target.includes(normalized)) {
    return
  }
  target.push(normalized)
}

function collectDownloadCandidates(source, target = [], depth = 0) {
  if (depth > 3 || source === undefined || source === null) {
    return target
  }

  const parsedSource = tryParseRequestJson(source)

  if (typeof parsedSource === 'string' || typeof parsedSource === 'number') {
    pushDownloadCandidate(target, parsedSource)
    return target
  }

  if (Array.isArray(parsedSource)) {
    parsedSource.slice(0, 500).forEach((item) => collectDownloadCandidates(item, target, depth + 1))
    return target
  }

  if (typeof parsedSource !== 'object') {
    return target
  }

  ;[
    parsedSource.fileArr,
    parsedSource.files,
    parsedSource.selection,
    parsedSource.selected,
    parsedSource.value,
  ].forEach((value) => collectDownloadCandidates(value, target, depth + 1))

  ;['data', 'payload', 'params', 'body', 'query'].forEach((key) => {
    if (parsedSource[key] !== undefined && parsedSource[key] !== parsedSource) {
      collectDownloadCandidates(parsedSource[key], target, depth + 1)
    }
  })

  return target
}

function resolveDownloadRequest(req) {
  const fileArr = []
  ;[req.body, req.query, req.headers].forEach((source) => collectDownloadCandidates(source, fileArr))

  let selectJson = req.body && req.body.selectJson
  if (selectJson === undefined) {
    selectJson = req.query && req.query.selectJson
  }
  if (selectJson === undefined) {
    selectJson = req.headers && (req.headers['x-select-json'] || req.headers.selectjson)
  }
  selectJson = tryParseRequestJson(selectJson)

  return { fileArr, selectJson }
}

function extractPathCandidate(source, depth = 0) {
  if (depth > 3 || source === undefined || source === null) {
    return ''
  }

  const parsedSource = tryParseRequestJson(source)

  if (typeof parsedSource === 'string' || typeof parsedSource === 'number') {
    return normalizeRequestString(parsedSource)
  }

  if (Array.isArray(parsedSource)) {
    for (const item of parsedSource.slice(0, 8)) {
      const candidate = extractPathCandidate(item, depth + 1)
      if (candidate) {
        return candidate
      }
    }
    return ''
  }

  if (typeof parsedSource !== 'object') {
    return ''
  }

  for (const key of ['path', 'folderPath', 'selectedPath', 'filePath', 'value']) {
    const candidate = extractPathCandidate(parsedSource[key], depth + 1)
    if (candidate) {
      return candidate
    }
  }

  for (const key of ['data', 'payload', 'params', 'body', 'query']) {
    const candidate = extractPathCandidate(parsedSource[key], depth + 1)
    if (candidate) {
      return candidate
    }
  }

  return ''
}

function resolveDownloadPathRequest(req) {
  for (const source of [req.body, req.query, req.headers]) {
    const candidate = extractPathCandidate(source)
    if (candidate) {
      return candidate
    }
  }
  return ''
}

function extractRequestValue(source, keys, depth = 0) {
  if (depth > 3 || source === undefined || source === null) {
    return undefined
  }

  const parsedSource = tryParseRequestJson(source)

  if (typeof parsedSource !== 'object' || parsedSource === null) {
    return undefined
  }

  for (const key of keys) {
    if (parsedSource[key] !== undefined) {
      return tryParseRequestJson(parsedSource[key])
    }
  }

  for (const key of ['data', 'payload', 'params', 'body', 'query']) {
    const nestedValue = extractRequestValue(parsedSource[key], keys, depth + 1)
    if (nestedValue !== undefined) {
      return nestedValue
    }
  }

  return undefined
}

function resolveRequestValue(req, keys) {
  for (const source of [req.body, req.query, req.headers]) {
    const value = extractRequestValue(source, keys)
    if (value !== undefined) {
      return value
    }
  }
  return undefined
}

function normalizeRotateDegree(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  return ((Math.round(numeric / 90) * 90) % 360 + 360) % 360
}

function getDataDirectionName(direction) {
  const rotateDegree = normalizeRotateDegree(direction?.rotateDegree ?? direction?.rotate_degree)
  if (rotateDegree) return `rotate${rotateDegree}`
  const left = direction?.left !== false
  const up = direction?.up !== false
  if (!left && !up) return 'both'
  if (!left) return 'horizontal'
  if (!up) return 'vertical'
  return 'none'
}

function normalizeDataDirection(value, fallback = { left: true, up: true, rotateDegree: 0 }) {
  const parsedValue = tryParseRequestJson(value)
  const source = parsedValue && typeof parsedValue === 'object' ? parsedValue : fallback
  const byKey = {}
  if (source?.byKey && typeof source.byKey === 'object') {
    Object.keys(source.byKey).forEach((key) => {
      const rotateDegree = normalizeRotateDegree(source.byKey[key]?.rotateDegree ?? source.byKey[key]?.rotate_degree)
      byKey[key] = {
        left: source.byKey[key]?.left !== false,
        up: source.byKey[key]?.up !== false,
        rotateDegree,
        rotate_degree: rotateDegree,
      }
      byKey[key].data_direction = getDataDirectionName(byKey[key])
    })
  }
  const rotateDegree = normalizeRotateDegree(source?.rotateDegree ?? source?.rotate_degree)
  const normalized = {
    left: source?.left !== false,
    up: source?.up !== false,
    rotateDegree,
    rotate_degree: rotateDegree,
    byKey,
  }
  normalized.data_direction = getDataDirectionName(normalized)
  return {
    ...normalized,
  }
}

function resolveDataDirection(req) {
  return normalizeDataDirection(resolveRequestValue(req, ['dataDirection', 'direction']), state.dataDirection)
}

function resolveZeroState(req) {
  const parsedValue = tryParseRequestJson(resolveRequestValue(req, ['zeroState', 'zero']))
  const source = parsedValue && typeof parsedValue === 'object' ? parsedValue : {}
  const enabled = Boolean(source.enabled)
  const data = source.data && typeof source.data === 'object' ? source.data : {}
  return {
    enabled,
    zeroTime: enabled ? (source.zeroTime || Date.now()) : null,
    data: enabled ? data : {},
  }
}

// ─── 通用错误处理包装器 ──────────────────────────────────
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch((err) => {
      console.error('[Server] Route error:', err)
      res.json(new HttpResult(1, {}, err.message || 'Internal server error'))
    })
  }
}

// ═══════════════════════════════════════════════════════════
//  路由定义
// ═══════════════════════════════════════════════════════════

router.get('/', (req, res) => {
  res.send('jqtools2 API Server')
})

// ─── 系统管理 ────────────────────────────────────────────

router.get('/getSystem', asyncHandler(async (req, res) => {
  const configResult = readSystemConfig()
  const systemFile = resolveCurrentSystemFile()
  if (!systemFile) {
    res.json(new HttpResult(1, {}, 'system type not configured'))
    return
  }
  configResult.value = systemFile

  state.baudRate = constantObj.baudRateObj[configResult.value] || 1000000

  const { db } = await initDb(systemFile, state._dbPath)
  state.currentDb = db

  res.json(new HttpResult(0, configResult, 'Get device list success'))
}))

router.post('/setSystemConfig', asyncHandler(async (req, res) => {
  const incoming = resolveRequestValue(req, ['config'])
  if (!incoming || typeof incoming !== 'object') {
    res.json(new HttpResult(1, {}, 'config required'))
    return
  }

  const current = readSystemConfig()
  const nextConfig = {
    ...current,
    ...incoming,
    optimalObj: mergeSystemConfigGroup(current.optimalObj, incoming.optimalObj),
    maxObj: mergeSystemConfigGroup(current.maxObj, incoming.maxObj),
  }

  const configPath = state._configPath || path.join(__dirname, '..', '..', 'config.txt')
  fs.writeFileSync(configPath, module2.encStr(JSON.stringify(nextConfig)), 'utf-8')

  if (nextConfig.value) {
    state.file = nextConfig.value
    state.baudRate = constantObj.baudRateObj[nextConfig.value] || 1000000
  }

  res.json(new HttpResult(0, nextConfig, 'System config updated'))
}))

router.post('/selectSystem', asyncHandler(async (req, res) => {
  const systemFile = resolveRequestValue(req, ['file'])
  if (!systemFile) {
    res.json(new HttpResult(1, {}, 'system file required'))
    return
  }
  state.file = systemFile
  const { db } = await initDb(state.file, state._dbPath)
  state.currentDb = db
  state.baudRate = constantObj.blue.includes(state.file) ? 921600 : 1000000
  res.json(new HttpResult(0, {}, 'Switch success'))
}))

router.post('/changeSystemType', asyncHandler(async (req, res) => {
  const system = resolveRequestValue(req, ['system'])
  if (!system) {
    res.json(new HttpResult(1, {}, 'system required'))
    return
  }
  state.file = system
  state.baudRate = constantObj.baudRateObj[system] || 1000000
  const { db } = await initDb(state.file, state._dbPath)
  state.currentDb = db
  broadcast(JSON.stringify({ sitData: {} }))
  const result = readSystemConfig()
  res.json(new HttpResult(0, { optimalObj: result.optimalObj[state.file], maxObj: result.maxObj[state.file] }, 'success'))
}))

// ─── 串口管理 ────────────────────────────────────────────

router.get('/getPort', asyncHandler(async (req, res) => {
  const { SerialPort } = require('serialport')
  const { getPort } = require('../../util/serialport')
  const ports = await SerialPort.list()
  const portsRes = getPort(ports)
  res.json(new HttpResult(0, portsRes, 'Get device list success'))
}))

router.get('/connPort', asyncHandler(async (req, res) => {
  try {
    const result = await connectPort(broadcast, colAndSendData)
    res.json(new HttpResult(0, result, 'Connect success'))
  } catch (err) {
    res.json(new HttpResult(1, {
      success: false,
      code: err.code || 'OPEN_FAIL',
      stage: err.stage || 'connect',
      message: err.userMessage || err.message,
      detail: err.message,
    }, err.userMessage || err.message))
  }
}))

router.get('/rescanPort', asyncHandler(async (req, res) => {
  try {
    const result = await rescanPort(broadcast, colAndSendData)
    res.json(new HttpResult(0, result, 'Rescan complete'))
  } catch (err) {
    res.json(new HttpResult(1, {
      success: false,
      code: err.code || 'OPEN_FAIL',
      stage: err.stage || 'rescan',
      message: err.userMessage || err.message,
      detail: err.message,
    }, err.userMessage || err.message))
  }
}))

router.get('/stopPort', asyncHandler(async (req, res) => {
  const result = await stopPort()
  res.json(new HttpResult(0, result, 'All ports stopped'))
}))

router.get('/sendMac', asyncHandler(async (req, res) => {
  if (!Object.keys(state.parserArr).length) {
    res.json(new HttpResult(0, {}, 'Please connect serial port first'))
    return
  }

  const tasks = Object.keys(state.parserArr).map((key) => portWrite(state.parserArr[key].port))
  await Promise.all(tasks)
  res.json(new HttpResult(0, {}, 'Send success'))
}))

/**
 * Read MAC addresses from already-connected serial ports.
 * Uses existing connections (from one-click connect) — no re-open/close.
 * Results are pushed via WebSocket using macReaderResult events.
 */
router.get('/sendMacConnected', asyncHandler(async (req, res) => {
  const connectedPorts = Object.keys(state.parserArr)
  if (!connectedPorts.length) {
    res.json(new HttpResult(1, {}, '没有已连接的设备，请先一键连接'))
    return
  }

  broadcast(JSON.stringify({ macReaderLog: { message: `检测到 ${connectedPorts.length} 个已连接设备，开始读取 MAC...`, type: 'info', timestamp: Date.now() } }))

  const results = []

  for (const portPath of connectedPorts) {
    const parserItem = state.parserArr[portPath]
    const dataItem = state.dataMap[portPath] || {}
    const port = parserItem.port

    if (!port || !port.isOpen) {
      broadcast(JSON.stringify({ macReaderLog: { message: `${portPath}: 端口未打开，跳过`, type: 'warning', timestamp: Date.now() } }))
      results.push({ path: portPath, status: 'not_open' })
      continue
    }

    const deviceClass = dataItem.deviceClass || 'unknown'
    const baudRate = dataItem.baudRate || parserItem.baudRate
    const deviceLabel = { hand: '手套', sit: '坐垫', foot: '脚垫' }[deviceClass] || '未知'

    broadcast(JSON.stringify({
      macReaderDetect: { path: portPath, baudRate, deviceClass, deviceLabel }
    }))
    broadcast(JSON.stringify({ macReaderLog: { message: `${portPath}: 发送 AT 指令读取 MAC (${deviceLabel})...`, type: 'info', timestamp: Date.now() } }))
    broadcast(JSON.stringify({ macReaderStatus: { path: portPath, stage: 'reading' } }))

    try {
      const { uniqueId, version } = await sendMacCommand(port)

      if (uniqueId) {
        broadcast(JSON.stringify({ macReaderLog: { message: `${portPath}: MAC 读取成功 - ${uniqueId}`, type: 'success', timestamp: Date.now() } }))
        state.macInfo[portPath] = { uniqueId, version }

        // Auto-resolve device type via server query
        const { type: deviceType, premission } = await resolveDeviceType(uniqueId)
        if (deviceType) {
          dataItem.type = deviceType
          dataItem.premission = premission
          console.log(`[sendMacConnected] ${portPath} type resolved: ${deviceType}, auth: ${premission}`)
          broadcast(JSON.stringify({ macReaderLog: { message: `${portPath}: 设备类型已更新为 ${deviceType}`, type: 'success', timestamp: Date.now() } }))
          broadcast(JSON.stringify({ deviceUpdate: { path: portPath, type: deviceType, premission } }))
        } else {
          console.warn(`[sendMacConnected] ${portPath} type not resolved for MAC ${uniqueId}`)
          broadcast(JSON.stringify({ macReaderLog: { message: `${portPath}: 服务器未返回设备类型`, type: 'warning', timestamp: Date.now() } }))
        }

        const result = {
          path: portPath, status: 'success',
          baudRate, deviceClass, deviceLabel,
          uniqueId, version, deviceType: deviceType || null,
          premission: premission || false,
          timestamp: Date.now()
        }
        results.push(result)

        broadcast(JSON.stringify({
          macReaderResult: {
            path: portPath, uniqueId, version,
            baudRate, deviceClass, deviceLabel,
            deviceType: deviceType || null
          }
        }))
      } else {
        broadcast(JSON.stringify({ macReaderLog: { message: `${portPath}: MAC 读取超时`, type: 'warning', timestamp: Date.now() } }))
        results.push({ path: portPath, status: 'mac_timeout', baudRate, deviceClass, deviceLabel })
      }
    } catch (err) {
      broadcast(JSON.stringify({ macReaderLog: { message: `${portPath}: 错误 - ${err.message}`, type: 'error', timestamp: Date.now() } }))
      results.push({ path: portPath, status: 'error', error: err.message })
    }
  }

  broadcast(JSON.stringify({ macReaderLog: { message: `MAC 读取完成: ${results.filter(r => r.status === 'success').length}/${connectedPorts.length} 成功`, type: 'success', timestamp: Date.now() } }))
  broadcast(JSON.stringify({ macReaderDone: { results } }))
  res.json(new HttpResult(0, { results }, 'MAC reading complete'))
}))

/**
 * Standalone MAC reading API for the addMac page.
 * Independent from one-click connect — opens ports temporarily,
 * detects baud rate, reads MAC via AT command, then closes ports.
 * Progress is pushed via WebSocket.
 */
router.get('/readMacOnly', asyncHandler(async (req, res) => {
  const { SerialPort, DelimiterParser } = require('serialport')
  const { getPort } = require('../../util/serialport')

  const sendLog = (msg, type = 'info') => {
    broadcast(JSON.stringify({ macReaderLog: { message: msg, type, timestamp: Date.now() } }))
  }

  sendLog('Enumerating serial ports...', 'info')
  let ports = await SerialPort.list()
  ports = getPort(ports)
  sendLog(`Found ${ports.length} CH340 serial port(s)`, ports.length ? 'success' : 'warning')

  if (!ports.length) {
    res.json(new HttpResult(0, { ports: [], results: [] }, 'No CH340 serial ports found'))
    return
  }

  const results = []

  for (const portInfo of ports) {
    const portPath = portInfo.path || portInfo.comName
    sendLog(`Detecting baud rate for ${portPath}...`, 'info')

    // Phase 1: Baud rate detection
    broadcast(JSON.stringify({ macReaderStatus: { path: portPath, stage: 'detecting' } }))
    const detectedBaud = await detectBaudRate(portPath)

    if (!detectedBaud) {
      sendLog(`${portPath}: All candidate baud rates failed`, 'error')
      results.push({ path: portPath, status: 'baud_detect_failed' })
      continue
    }

    const deviceClass = constantObj.BAUD_DEVICE_MAP[detectedBaud] || 'unknown'
    const deviceLabel = { hand: 'Glove', sit: 'Sit Pad', foot: 'Foot Pad' }[deviceClass] || 'Unknown'
    sendLog(`${portPath}: Baud ${detectedBaud} matched -> ${deviceLabel}`, 'success')

    broadcast(JSON.stringify({
      macReaderDetect: { path: portPath, baudRate: detectedBaud, deviceClass, deviceLabel }
    }))

    // Phase 2: Re-open and read MAC
    await new Promise(r => setTimeout(r, 200))
    sendLog(`${portPath}: Opening stable connection for MAC reading...`, 'info')
    broadcast(JSON.stringify({ macReaderStatus: { path: portPath, stage: 'reading' } }))

    let tempPort = null
    try {
      tempPort = new SerialPort({ path: portPath, baudRate: detectedBaud, autoOpen: false })
      await new Promise((resolve, reject) => {
        tempPort.open((err) => err ? reject(err) : resolve())
      })

      sendLog(`${portPath}: Sending AT commands...`, 'info')
      const { uniqueId, version } = await sendMacCommand(tempPort)

      if (uniqueId) {
        sendLog(`${portPath}: MAC read success - ${uniqueId}`, 'success')
        results.push({
          path: portPath, status: 'success',
          baudRate: detectedBaud, deviceClass, deviceLabel,
          uniqueId, version, timestamp: Date.now()
        })

        broadcast(JSON.stringify({
          macReaderResult: {
            path: portPath, uniqueId, version,
            baudRate: detectedBaud, deviceClass, deviceLabel
          }
        }))
      } else {
        sendLog(`${portPath}: MAC read timeout, device may not support AT query`, 'warning')
        results.push({
          path: portPath, status: 'mac_timeout',
          baudRate: detectedBaud, deviceClass, deviceLabel
        })
      }
    } catch (err) {
      sendLog(`${portPath}: Error - ${err.message}`, 'error')
      results.push({ path: portPath, status: 'error', error: err.message })
    } finally {
      // Always close the temporary port
      if (tempPort && tempPort.isOpen) {
        tempPort.close(() => {
          sendLog(`${portPath}: Port closed`, 'info')
        })
      }
    }
  }

  sendLog(`MAC reading complete: ${results.filter(r => r.status === 'success').length}/${ports.length} successful`, 'success')
  broadcast(JSON.stringify({ macReaderDone: { results } }))
  res.json(new HttpResult(0, { results }, 'MAC reading complete'))
}))

// ─── 数据采集 ────────────────────────────────────────────

router.post('/setDataDirection', asyncHandler(async (req, res) => {
  state.dataDirection = saveDataDirection(resolveDataDirection(req))
  res.json(new HttpResult(0, { dataDirection: state.dataDirection }, 'success'))
}))

router.get('/getDataDirection', asyncHandler(async (req, res) => {
  res.json(new HttpResult(0, { dataDirection: state.dataDirection }, 'success'))
}))

router.post('/setZeroBaseline', asyncHandler(async (req, res) => {
  state.zeroState = resolveZeroState(req)
  res.json(new HttpResult(0, { zeroState: state.zeroState }, 'success'))
}))

router.post('/startCol', asyncHandler(async (req, res) => {
  const fileName = resolveRequestValue(req, ['fileName', 'filename'])
  state.selectArr = []
  state.dataDirection = saveDataDirection(resolveDataDirection(req))
  state.historySelectCache = null
  const currentFile = resolveCurrentSystemFile()
  const db = await ensureCurrentDb()

  if (!currentFile || !db) {
    res.json(new HttpResult(1, {}, 'System or database not initialized'))
    return
  }

  const sensorArr = Object.keys(state.dataMap).map((a) => state.dataMap[a].type)
  const matchCount = sensorArr.filter((a) => typeof a === 'string' && a.includes(currentFile)).length

  if (matchCount > 0) {
    state.colFlag = true
    state.colName = String(fileName ?? Date.now())
    res.json(new HttpResult(0, {}, 'Collection started'))
  } else {
    res.json(new HttpResult(0, 'Please select correct sensor type', 'error'))
  }
}))

router.get('/endCol', (req, res) => {
  state.colFlag = false
  res.json(new HttpResult(0, 'success', 'Collection stopped'))
})

// ─── 历史数据管理 ─────────────────────────────────────────

router.get('/getColHistory', asyncHandler(async (req, res) => {
  const db = await ensureCurrentDb()
  if (!db) {
    res.json(new HttpResult(1, {}, 'Database not initialized'))
    return
  }
  await ensureHistoryListIndex(db)
  const selectQuery = `
    SELECT 
      m.date, m.timestamp,
      r.select_json AS \`select\`,
      r.alias, r.remark
    FROM matrix m
    INNER JOIN (
      SELECT date, MAX(timestamp) AS max_ts FROM matrix GROUP BY date
    ) t ON m.date = t.date AND m.timestamp = t.max_ts
    LEFT JOIN remarks r ON r.date = m.date
    ORDER BY m.timestamp DESC
    LIMIT ?, ?
  `

  state.historyFlag = true

  const rows = await new Promise((resolve, reject) => {
    db.all(selectQuery, [0, 500], (err, rows) => {
      if (err) reject(err)
      else resolve(rows)
    })
  })

  res.json(new HttpResult(0, rows, 'success'))
  broadcast(JSON.stringify({ sitData: {} }))
}))

router.post('/getDbHistory', asyncHandler(async (req, res) => {
  const time = resolveRequestValue(req, ['time', 'date', 'timestamp'])
  state.historySelectCache = null
  const db = await ensureCurrentDb()

  if (!time) {
    res.json(new HttpResult(1, {}, 'playback time required'))
    return
  }
  if (!db) {
    res.json(new HttpResult(1, {}, 'Database not initialized'))
    return
  }

  const { length, pressArr, areaArr, rows } = await dbGetData({ db, params: [time] })

  state.historyDbArr = rows
  state.colMaxHZ = state.historyDbArr.length > 1
    ? 1000 / (state.historyDbArr[1].timestamp - state.historyDbArr[0].timestamp)
    : 1
  state.colplayHZ = state.colMaxHZ
  state.historyFlag = true
  state.playIndex = 0

  res.json(new HttpResult(0, { length, pressArr, areaArr }, 'success'))
}))

router.post('/getDbHistorySelect', asyncHandler(async (req, res) => {
  const selectJson = resolveRequestValue(req, ['selectJson', 'select'])
  if (!selectJson || typeof selectJson !== 'object') {
    res.json(new HttpResult(1, {}, 'selectJson required'))
    return
  }

  if (!Object.keys(selectJson).length) {
    state.historySelectCache = null
    res.json(new HttpResult(0, { pressArr: {}, areaArr: {} }, 'success'))
    return
  }

  state.historySelectCache = selectJson

  if (!state.historyDbArr || !state.historyDbArr.length) {
    res.json(new HttpResult(1, {}, 'history not loaded'))
    return
  }

  // ─── [PERF-PLAYBACK-OPT] 开始 ──────────────────────────────────
  // 长时录制框选回放卡死优化：pressArr/areaArr 降采样到 ~500 点
  // 如需回滚：删除标记区段，恢复原循环（直接 push 到 pressArr/areaArr）
  const PLAYBACK_CHART_TARGET_POINTS = 500
  const rows = state.historyDbArr
  const keyArr = Object.keys(JSON.parse(rows[0].data || '{}'))
  const pressArr = {}
  const areaArr = {}
  const pressBucket = {}
  const areaBucket = {}
  const bucketCount = {}
  const bucketSize = Math.max(1, Math.ceil(rows.length / PLAYBACK_CHART_TARGET_POINTS))
  keyArr.forEach((key) => {
    pressArr[key] = []
    areaArr[key] = []
    pressBucket[key] = 0
    areaBucket[key] = 0
    bucketCount[key] = 0
  })

  for (let i = 0; i < rows.length; i++) {
    const dataObj = JSON.parse(rows[i].data || '{}')
    for (const key of keyArr) {
      const item = dataObj[key]
      const arr = item && item.arr ? item.arr : []
      const sel = getSelectionForMatrixKey(selectJson, key)

      let press = 0
      let area = 0
      if (sel && typeof sel === 'object') {
        const { xStart, xEnd, yStart, yEnd, width } = sel
        if ([xStart, xEnd, yStart, yEnd, width].every((v) => typeof v === 'number')) {
          for (let y = yStart; y < yEnd; y++) {
            for (let x = xStart; x < xEnd; x++) {
              const v = arr[y * width + x] || 0
              press += v
              if (v > 0) area++
            }
          }
        }
      }

      pressBucket[key] += press
      areaBucket[key] += area
      bucketCount[key]++
      if (bucketCount[key] >= bucketSize) {
        pressArr[key].push(pressBucket[key] / bucketCount[key])
        areaArr[key].push(areaBucket[key] / bucketCount[key])
        pressBucket[key] = 0
        areaBucket[key] = 0
        bucketCount[key] = 0
      }
    }
  }

  // flush 尾部
  for (const key of keyArr) {
    if (bucketCount[key] > 0) {
      pressArr[key].push(pressBucket[key] / bucketCount[key])
      areaArr[key].push(areaBucket[key] / bucketCount[key])
    }
  }
  // ─── [PERF-PLAYBACK-OPT] 结束 ──────────────────────────────────

  res.json(new HttpResult(0, { length: rows.length, pressArr, areaArr }, 'success'))
}))

router.post('/getContrastData', asyncHandler(async (req, res) => {
  const mode = resolveRequestValue(req, ['mode', 'compareMode']) || 'record_pair'
  const left = resolveRequestValue(req, ['left'])
  const right = resolveRequestValue(req, ['right'])
  const db = await ensureCurrentDb()

  if (!db) {
    res.json(new HttpResult(1, {}, 'Database not initialized'))
    return
  }

  if (mode === 'single_record_frame') {
    const record = resolveRequestValue(req, ['record', 'left'])
    if (!record) {
      res.json(new HttpResult(1, {}, '请选择一条历史数据。'))
      return
    }

    const result = await dbGetData({ db, params: [record] })
    const validateMessage = validateSingleRecordContrastResult(result, record)
    if (validateMessage) {
      res.json(new HttpResult(1, {}, validateMessage))
      return
    }

    state.leftDbArr = result.rows
    state.rightDbArr = result.rows
    state.historyDbArr = null
    state.historySelectCache = null

    const firstFrame = parseMatrixFrame(result.rows[0])
    const keys = getComparableKeys(firstFrame).filter((key) => {
      const arr = firstFrame[key]?.arr
      if (!Array.isArray(arr)) return false
      const size = inferMatrixSize(key, arr)
      return size.width * size.height === arr.length
    })
    const frames = result.rows.map((row) => normalizeContrastFrame(row, keys))
    const frameA = clampFrameIndex(result.rows, resolveRequestValue(req, ['frameA', 'leftIndex']) ?? 0)
    const defaultFrameB = result.rows.length > 1 ? result.rows.length - 1 : 0
    let frameB = clampFrameIndex(result.rows, resolveRequestValue(req, ['frameB', 'rightIndex']) ?? defaultFrameB)
    if (frameA === frameB && result.rows.length > 1) {
      frameB = frameA === 0 ? 1 : 0
    }
    const initialFrame = buildContrastFrameByIndex(result.rows, result.rows, keys, frameA, frameB)
    const name = result.rows[0]?.name || record
    const payload = {
      mode: 'single_record_frame',
      keys,
      record: {
        id: record,
        name,
        date: record,
        length: result.length,
        pressArr: result.pressArr,
        areaArr: result.areaArr,
        frames,
      },
      left: {
        id: record,
        name: `${name} A`,
        date: record,
        length: result.length,
        pressArr: result.pressArr,
        areaArr: result.areaArr,
        frames,
      },
      right: {
        id: record,
        name: `${name} B`,
        date: record,
        length: result.length,
        pressArr: result.pressArr,
        areaArr: result.areaArr,
        frames,
      },
      time: {
        frameA,
        frameB,
      },
      frame: initialFrame,
      warnings: [],
    }

    broadcast(JSON.stringify({
      contrastData: initialFrame
    }))

    res.json(new HttpResult(0, payload, 'success'))
    return
  }

  if (!left) {
    res.json(new HttpResult(1, {}, '请先选择基准数据 A。'))
    return
  }
  if (!right) {
    res.json(new HttpResult(1, {}, '请先选择对比数据 B。'))
    return
  }
  if (String(left) === String(right)) {
    res.json(new HttpResult(1, {}, 'A 和 B 不能是同一条历史记录。'))
    return
  }

  const [leftResult, rightResult] = await Promise.all([
    dbGetData({ db, params: [left] }),
    dbGetData({ db, params: [right] })
  ])

  const validateMessage = validateContrastResults(leftResult, rightResult, left, right)
  if (validateMessage) {
    res.json(new HttpResult(1, {}, validateMessage))
    return
  }

  state.leftDbArr = leftResult.rows
  state.rightDbArr = rightResult.rows
  state.historyDbArr = null
  state.historySelectCache = null

  const keys = getContrastCommonKeys(parseMatrixFrame(leftResult.rows[0]), parseMatrixFrame(rightResult.rows[0]))
  const leftFrames = leftResult.rows.map((row) => normalizeContrastFrame(row, keys))
  const rightFrames = rightResult.rows.map((row) => normalizeContrastFrame(row, keys))
  const initialFrame = buildContrastFrame(leftResult.rows, rightResult.rows, keys, 0)
  const payload = {
    mode: 'history-ab',
    keys,
    left: {
      id: left,
      name: leftResult.rows[0]?.name || left,
      date: left,
      length: leftResult.length,
      pressArr: leftResult.pressArr,
      areaArr: leftResult.areaArr,
      frames: leftFrames,
    },
    right: {
      id: right,
      name: rightResult.rows[0]?.name || right,
      date: right,
      length: rightResult.length,
      pressArr: rightResult.pressArr,
      areaArr: rightResult.areaArr,
      frames: rightFrames,
    },
    frame: initialFrame,
    warnings: leftResult.length !== rightResult.length ? ['两组数据帧数不同，已按进度百分比对齐。'] : [],
  }

  broadcast(JSON.stringify({
    contrastData: initialFrame
  }))

  res.json(new HttpResult(0, payload, 'success'))
}))

router.post('/getContrastIndex', asyncHandler(async (req, res) => {
  const progress = resolveRequestValue(req, ['progress', 'index'])
  if (!Array.isArray(state.leftDbArr) || !Array.isArray(state.rightDbArr) || !state.leftDbArr.length || !state.rightDbArr.length) {
    res.json(new HttpResult(1, {}, '请先选择 A/B 数据并开始对比。'))
    return
  }

  const keys = getContrastCommonKeys(parseMatrixFrame(state.leftDbArr[0]), parseMatrixFrame(state.rightDbArr[0]))
  const frame = buildContrastFrame(state.leftDbArr, state.rightDbArr, keys, progress)
  broadcast(JSON.stringify({ contrastData: frame }))
  res.json(new HttpResult(0, frame, 'success'))
}))

// ─── 回放控制 ────────────────────────────────────────────

router.post('/getDbHistoryPlay', asyncHandler(async (req, res) => {
  if (!state.historyDbArr) {
    res.json(new HttpResult(1, 'Please select playback time range', 'error'))
    return
  }
  startPlayback()
  res.json(new HttpResult(0, {}, 'success'))
}))

router.post('/getDbHistoryStop', (req, res) => {
  state.historyPlayFlag = false
  res.json(new HttpResult(0, {}, 'success'))
})

router.post('/cancalDbPlay', (req, res) => {
  state.historyFlag = false
  state.historyPlayFlag = false
  state.historyDbArr = null
  state.leftDbArr = null
  state.rightDbArr = null
  state.historySelectCache = null
  clearPlayTimer()
  try {
    if (Object.keys(state.parserArr || {}).length) {
      sendData()
    }
  } catch (err) {
    console.warn('[Playback] Failed to push realtime frame after cancel:', err.message)
  }
  res.json(new HttpResult(0, {}, 'success'))
})

router.post('/changeDbplaySpeed', asyncHandler(async (req, res) => {
  const speed = resolveRequestValue(req, ['speed'])
  changePlaySpeed(speed)
  res.json(new HttpResult(0, {}, 'success'))
}))

router.post('/getDbHistoryIndex', asyncHandler(async (req, res) => {
  const index = resolveRequestValue(req, ['index'])

  if (!state.historyDbArr) {
    res.json(new HttpResult(555, 'Please select playback time range', 'error'))
    return
  }

  const snapshot = getPlaybackSnapshot(index)
  if (!snapshot) {
    res.json(new HttpResult(1, {}, 'Playback frame not found'))
    return
  }

  broadcast(JSON.stringify(snapshot.payload))
  if (snapshot.payload?.playError) {
    res.json(new HttpResult(1, snapshot.payload.playError, snapshot.payload.playError.message))
    return
  }
  res.json(new HttpResult(0, snapshot.row, 'success'))
}))

// ─── 数据操作 ────────────────────────────────────────────

const handleDownload = asyncHandler(async (req, res) => {
  const { fileArr, selectJson } = resolveDownloadRequest(req)
  const db = await ensureCurrentDb()
  const currentFile = resolveCurrentSystemFile()
  if (!fileArr || !fileArr.length) {
    res.json(new HttpResult(1, {}, 'Please select data first'))
    return
  }
  if (!db || !currentFile) {
    res.json(new HttpResult(1, {}, 'Database not initialized'))
    return
  }
  const selectOverride = selectJson && typeof selectJson === 'object' ? selectJson : state.historySelectCache
  const resolvedDownloadPath = resolveWritableDownloadDir({
    customDownloadPath: state.downloadPath || state._defaultDownloadPath,
    dataPath: state._dataPath,
    isPackaged: state._isPackaged
  })
  state.downloadPath = resolvedDownloadPath
  const data = await dbLoadCsv({
    db,
    params: fileArr,
    file: currentFile,
    isPackaged: state._isPackaged,
    selectJson: selectOverride,
    customDownloadPath: resolvedDownloadPath,
    dataPath: state._dataPath
  })
  res.json(new HttpResult(0, data, 'Download'))
})

router.post('/downlaod', handleDownload)
router.post('/download', handleDownload)

// ─── 下载路径管理 ─────────────────────────────────────

router.get('/getDownloadPath', (req, res) => {
  const path = require('path')
  const os = require('os')
  let defaultPath
  // 默认路径为用户桌面
  const desktopPath = path.join(os.homedir(), 'Desktop')
  if (fs.existsSync(desktopPath)) {
    defaultPath = desktopPath
  } else if (state._isPackaged) {
    defaultPath = state._dataPath || path.resolve('resources/data')
  } else {
    defaultPath = path.resolve(__dirname, '../../data')
  }
  const currentPath = state.downloadPath || defaultPath
  res.json(new HttpResult(0, { path: currentPath, isDefault: !state.downloadPath }, 'success'))
})

router.post('/setDownloadPath', asyncHandler(async (req, res) => {
  const newPath = resolveDownloadPathRequest(req)
  if (!newPath) {
    res.json(new HttpResult(1, {}, 'path required'))
    return
  }
  const fs = require('fs')
  // 确保目录存在
  if (!fs.existsSync(newPath)) {
    try {
      fs.mkdirSync(newPath, { recursive: true })
    } catch (err) {
      res.json(new HttpResult(1, {}, `无法创建目录: ${err.message}`))
      return
    }
  }
  const writablePath = ensureWritableDir(newPath)
  state.downloadPath = writablePath
  try {
    const downloadPathFile = require('path').join(state._dbPath, 'downloadPath.json')
    fs.writeFileSync(downloadPathFile, JSON.stringify({ path: writablePath }), 'utf-8')
  } catch (e) {
    console.warn('[Server] Failed to persist download path:', e.message)
  }
  res.json(new HttpResult(0, { path: writablePath }, 'success'))
}))

router.post('/openFile', asyncHandler(async (req, res) => {
  const filePath = resolveRequestValue(req, ['filePath', 'path'])
  if (!filePath) {
    res.json(new HttpResult(1, {}, 'filePath required'))
    return
  }
  // 检查文件是否存在
  if (!fs.existsSync(filePath)) {
    console.error('[Server] File not found:', filePath)
    res.json(new HttpResult(1, {}, `文件不存在: ${filePath}`))
    return
  }
  const { spawn } = require('child_process')
  const platform = process.platform
  try {
    if (platform === 'win32') {
      // Windows: 使用 cmd /c start 打开文件
      const child = spawn('cmd', ['/c', 'start', '""', filePath], {
        shell: true,
        detached: true,
        stdio: 'ignore'
      })
      child.unref()
    } else if (platform === 'darwin') {
      spawn('open', [filePath], { detached: true, stdio: 'ignore' }).unref()
    } else {
      spawn('xdg-open', [filePath], { detached: true, stdio: 'ignore' }).unref()
    }
    res.json(new HttpResult(0, {}, 'success'))
  } catch (err) {
    console.error('[Server] Open file error:', err)
    res.json(new HttpResult(1, {}, err.message))
  }
}))

router.post('/openFolder', asyncHandler(async (req, res) => {
  const folderPath = resolveRequestValue(req, ['folderPath', 'path'])
  if (!folderPath) {
    res.json(new HttpResult(1, {}, 'folderPath required'))
    return
  }
  // 检查路径是否存在
  if (!fs.existsSync(folderPath)) {
    console.error('[Server] Folder not found:', folderPath)
    res.json(new HttpResult(1, {}, `路径不存在: ${folderPath}`))
    return
  }
  const { spawn } = require('child_process')
  const platform = process.platform
  try {
    if (platform === 'win32') {
      // Windows: explorer.exe 的退出码总是1（已知行为），使用 spawn + detached 忽略退出码
      const normalizedPath = folderPath.replace(/\//g, '\\\\')
      const child = spawn('explorer', [normalizedPath], {
        detached: true,
        stdio: 'ignore'
      })
      child.unref()
      // explorer 即使成功也返回退出码1，不等待结果
    } else if (platform === 'darwin') {
      spawn('open', [folderPath], { detached: true, stdio: 'ignore' }).unref()
    } else {
      spawn('xdg-open', [folderPath], { detached: true, stdio: 'ignore' }).unref()
    }
    res.json(new HttpResult(0, {}, 'success'))
  } catch (err) {
    console.error('[Server] Open folder error:', err)
    res.json(new HttpResult(1, {}, err.message))
  }
}))

router.post('/delete', asyncHandler(async (req, res) => {
  const fileArr = resolveRequestValue(req, ['fileArr']) || []
  const db = await ensureCurrentDb()
  if (!db) {
    res.json(new HttpResult(1, {}, 'Database not initialized'))
    return
  }
  const data = await deleteDbData({ db, params: fileArr })
  res.json(new HttpResult(0, data, 'Delete success'))
}))

router.post('/changeDbName', asyncHandler(async (req, res) => {
  const newDate = resolveRequestValue(req, ['newDate'])
  const oldDate = resolveRequestValue(req, ['oldDate'])
  const db = await ensureCurrentDb()
  if (!db) {
    res.json(new HttpResult(1, {}, 'Database not initialized'))
    return
  }
  const data = await changeDbName({ db, params: [newDate, oldDate] })
  res.json(new HttpResult(0, data, 'Update success'))
}))

router.post('/changeDbDataName', asyncHandler(async (req, res) => {
  const oldName = resolveRequestValue(req, ['oldName'])
  const newName = resolveRequestValue(req, ['newName'])
  const db = await ensureCurrentDb()
  if (!db) {
    res.json(new HttpResult(1, {}, 'Database not initialized'))
    return
  }
  await changeDbDataName({ db, params: [oldName, newName] })
  res.json(new HttpResult(0, {}, 'success'))
}))

// ─── 备注管理 ────────────────────────────────────────────

router.post('/upsertRemark', asyncHandler(async (req, res) => {
  let date = resolveRequestValue(req, ['date'])
  const alias = resolveRequestValue(req, ['alias'])
  const remark = resolveRequestValue(req, ['remark'])
  const select = resolveRequestValue(req, ['select', 'selectJson'])
  const db = await ensureCurrentDb()
  if (!date) {
    res.json(new HttpResult(1, {}, 'date required'))
    return
  }
  if (!db) {
    res.json(new HttpResult(1, {}, 'Database not initialized'))
    return
  }
  date = String(date)
  const data = await upsertRemark({ db, params: { date, alias, remark, select } })
  res.json(new HttpResult(0, data, 'success'))
}))

router.post('/getRemark', asyncHandler(async (req, res) => {
  const date = resolveRequestValue(req, ['date'])
  const db = await ensureCurrentDb()
  if (!date) {
    res.json(new HttpResult(1, {}, 'date required'))
    return
  }
  if (!db) {
    res.json(new HttpResult(1, {}, 'Database not initialized'))
    return
  }
  const data = await getRemark({ db, params: [date] })
  res.json(new HttpResult(0, data, 'success'))
}))

router.get('/selectionTemplates', asyncHandler(async (req, res) => {
  const db = await ensureCurrentDb()
  if (!db) {
    res.json(new HttpResult(1, [], 'Database not initialized'))
    return
  }
  const data = await listSelectionTemplates({ db })
  res.json(new HttpResult(0, data, 'success'))
}))

router.post('/selectionTemplates/saveAll', asyncHandler(async (req, res) => {
  const templates = resolveRequestValue(req, ['templates'])
  const db = await ensureCurrentDb()
  if (!db) {
    res.json(new HttpResult(1, [], 'Database not initialized'))
    return
  }
  if (!Array.isArray(templates)) {
    res.json(new HttpResult(1, [], 'templates required'))
    return
  }
  const data = await replaceSelectionTemplates({ db, templates })
  res.json(new HttpResult(0, data, 'success'))
}))

// ─── Device缓存管理 ───────────────────────────────────────────

// 获取所有缓存的Device列表
router.get('/cache/devices', asyncHandler(async (req, res) => {
  const devices = getAllCached()
  res.json(new HttpResult(0, devices, 'success'))
}))

router.get('/cache/device-types', asyncHandler(async (req, res) => {
  res.json(new HttpResult(0, SUPPORTED_DEVICE_TYPES, 'success'))
}))

// 添加/更新Device缓存
router.post('/cache/devices', asyncHandler(async (req, res) => {
  const validation = validateDeviceAgainstCache(req.body, getAllCached())
  if (!validation.valid) {
    res.json(new HttpResult(1, {
      code: validation.errors[0]?.code || 'INVALID_DEVICE_CONFIG',
      errors: validation.errors,
    }, validation.errors[0]?.message || '设备配置有误'))
    return
  }

  const device = validation.devices[0]
  setTypeToCache(device.mac, device.type, device.deviceClass, device.alias)
  res.json(new HttpResult(0, device, 'Device cache updated'))
}))

router.post('/cache/devices/bulk', asyncHandler(async (req, res) => {
  const validation = validateDeviceList(req.body?.devices)
  if (!validation.valid) {
    res.json(new HttpResult(1, {
      code: validation.errors[0]?.code || 'INVALID_DEVICE_CONFIG',
      errors: validation.errors,
    }, validation.errors[0]?.message || '设备配置有误'))
    return
  }

  clearCache()
  validation.devices.forEach((device) => {
    setTypeToCache(device.mac, device.type, device.deviceClass, device.alias)
  })

  res.json(new HttpResult(0, {
    count: validation.devices.length,
    devices: validation.devices,
  }, 'Device cache updated'))
}))

// 删除单个Device缓存
router.delete('/cache/devices', asyncHandler(async (req, res) => {
  const { mac } = req.body
  if (!mac) {
    res.json(new HttpResult(1, {}, 'mac is required'))
    return
  }
  removeFromCache(mac)
  res.json(new HttpResult(0, {}, 'Device cache deleted'))
}))

// 清空所有Device缓存
router.post('/cache/clear', asyncHandler(async (req, res) => {
  clearCache()
  res.json(new HttpResult(0, {}, 'Cache cleared'))
}))

// ─── 授权模式管理 ──────────────────────────────────────────

// 获取当前授权模式
router.get('/auth/mode', (req, res) => {
  res.json(new HttpResult(0, { mode: constantObj.AUTH_MODE }, 'success'))
})

// 切换授权模式（online / local）
router.post('/auth/mode', asyncHandler(async (req, res) => {
  const { mode } = req.body
  if (!['online', 'local'].includes(mode)) {
    res.json(new HttpResult(1, {}, 'Mode must be online or local'))
    return
  }
  constantObj.AUTH_MODE = mode
  console.log(`[Auth] Auth mode switched to: ${mode}`)
  res.json(new HttpResult(0, { mode }, `Switched to ${mode} mode`))
}))

// ─── 其他 ──────────────────────────────────────────────────

router.post('/bindKey', (req, res) => {
  try {
    const key = resolveRequestValue(req, ['key'])
    res.json(new HttpResult(0, {}, 'Bindkey success'))
  } catch {
    res.json(new HttpResult(1, {}, 'Bindkey failed'))
  }
})

// ─── CSV文件上传 ───────────────────────────────────────
const multer = require('multer')
const csvUploadStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const path = require('path')
    let uploadDir
    if (state._isPackaged) {
      uploadDir = path.join(state._dataPath || path.resolve('resources/data'), 'csv')
    } else {
      uploadDir = path.resolve(__dirname, '../../data/csv')
    }
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true })
    }
    cb(null, uploadDir)
  },
  filename: (req, file, cb) => {
    // 保留原始文件名，解码中文
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8')
    cb(null, originalName)
  }
})
const csvUpload = multer({
  storage: csvUploadStorage,
  fileFilter: (req, file, cb) => {
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8')
    if (originalName.toLowerCase().endsWith('.csv')) {
      cb(null, true)
    } else {
      cb(new Error('Only CSV files are allowed'))
    }
  },
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB限制
})

router.post('/uploadCsv', csvUpload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) {
    res.json(new HttpResult(1, {}, 'No file uploaded'))
    return
  }
  const filePath = req.file.path
  const fileName = req.file.filename
  const validation = await validateImportedCsv(filePath)
  if (!validation.valid) {
    fs.rm(filePath, { force: true }, () => {})
    console.warn('[CSV] Import validation failed:', validation.reason || 'invalid data')
    res.json(new HttpResult(1, {}, '数据有误'))
    return
  }
  res.json(new HttpResult(0, { fileName, filePath }, 'Upload success'))
}))

router.post('/getCsvData', asyncHandler(async (req, res) => {
  const fileName = resolveRequestValue(req, ['fileName'])
  let csvFilePath = String(fileName || '').trim()
  if (!csvFilePath) {
    res.json(new HttpResult(1, {}, 'CSV file required'))
    return
  }
  if (!fs.existsSync(csvFilePath)) {
    const fallbackPath = path.join(state._dataPath || path.resolve('resources/data'), 'csv', path.basename(csvFilePath))
    if (fs.existsSync(fallbackPath)) {
      csvFilePath = fallbackPath
    }
  }
  if (!fs.existsSync(csvFilePath)) {
    res.json(new HttpResult(1, {}, 'CSV file not found'))
    return
  }

  const data = await getCsvData(csvFilePath)
  const playback = buildCsvPlaybackData(data)
  if (!playback.length) {
    res.json(new HttpResult(1, {}, 'No playback data found in CSV'))
    return
  }

  state.historySelectCache = null
  state.historyDbArr = playback.rows
  state.colMaxHZ = state.historyDbArr.length > 1
    ? 1000 / (state.historyDbArr[1].timestamp - state.historyDbArr[0].timestamp)
    : 1
  if (!Number.isFinite(state.colMaxHZ) || state.colMaxHZ <= 0) {
    state.colMaxHZ = 1
  }
  state.colplayHZ = state.colMaxHZ
  state.historyFlag = true
  state.playIndex = 0
  state.playbackSkippedFrameCount = 0
  state.playbackConsecutiveBadFrames = 0

  res.json(new HttpResult(0, {
    length: playback.length,
    pressArr: playback.pressArr,
    areaArr: playback.areaArr,
    initialIndex: 0,
    initialTimestamp: state.historyDbArr[0]?.timestamp || '',
  }, 'success'))
}))

router.post('/getSysconfig', (req, res) => {
  const config = resolveRequestValue(req, ['config'])
  const str = module2.encStr(JSON.stringify(config))
  res.json(new HttpResult(0, str, 'success'))
})

module.exports = router
