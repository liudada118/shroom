/**
 * 数据服务模块
 * 负责实时数据发送、数据采集存储、历史回放等业务逻辑
 */
const WebSocket = require('ws')
const fs = require('fs')
const path = require('path')
const constantObj = require('../../util/config')
const { state, resetPlaybackState } = require('../state')
const { broadcast } = require('../websocket')

const { blue } = constantObj
const DEFAULT_PLAYBACK_HZ = 1
const DEFAULT_DATA_DIRECTION = { left: true, up: true, rotateDegree: 0 }
const MATRIX_DIMENSIONS = {
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

function normalizeDataDirection(direction) {
  const rotateDegree = normalizeRotateDegree(direction?.rotateDegree ?? direction?.rotate_degree)
  const normalized = {
    left: direction?.left !== false,
    up: direction?.up !== false,
    rotateDegree,
    rotate_degree: rotateDegree,
  }
  normalized.data_direction = getDataDirectionName(normalized)
  return normalized
}

function normalizeDataDirectionState(direction) {
  const base = normalizeDataDirection(direction)
  const byKey = {}
  if (direction?.byKey && typeof direction.byKey === 'object') {
    Object.keys(direction.byKey).forEach((key) => {
      byKey[key] = normalizeDataDirection(direction.byKey[key])
    })
  }
  return { ...base, byKey }
}

function getDataDirectionPath() {
  if (state._dataDirectionPath) return state._dataDirectionPath
  const basePath = state._dbPath || path.join(__dirname, '..', '..', 'db')
  state._dataDirectionPath = path.join(basePath, 'data_direction.json')
  return state._dataDirectionPath
}

function loadPersistedDataDirection() {
  const directionPath = getDataDirectionPath()
  try {
    if (!fs.existsSync(directionPath)) {
      state.dataDirection = normalizeDataDirectionState(state.dataDirection || DEFAULT_DATA_DIRECTION)
      return state.dataDirection
    }
    const payload = JSON.parse(fs.readFileSync(directionPath, 'utf-8'))
    state.dataDirection = normalizeDataDirectionState(payload.dataDirection || payload)
  } catch (err) {
    console.warn('[DataDirection] Load failed:', err.message)
    state.dataDirection = normalizeDataDirectionState(state.dataDirection || DEFAULT_DATA_DIRECTION)
  }
  return state.dataDirection
}

function saveDataDirection(direction) {
  const normalized = normalizeDataDirectionState(direction || DEFAULT_DATA_DIRECTION)
  state.dataDirection = normalized
  const directionPath = getDataDirectionPath()
  try {
    fs.mkdirSync(path.dirname(directionPath), { recursive: true })
    fs.writeFileSync(directionPath, JSON.stringify({
      dataDirection: normalized,
      updatedAt: new Date().toISOString(),
    }, null, 2))
  } catch (err) {
    console.error('[DataDirection] Persist failed:', err.message)
  }
  return normalized
}

function getDirectionForKey(directionState, key) {
  const state = normalizeDataDirectionState(directionState || DEFAULT_DATA_DIRECTION)
  return normalizeDataDirection(state.byKey?.[key] || state)
}

function getMatrixDimensions(key, arr) {
  if (MATRIX_DIMENSIONS[key]) {
    return MATRIX_DIMENSIONS[key]
  }

  const length = Array.isArray(arr) ? arr.length : 0
  const side = Math.sqrt(length)
  if (Number.isInteger(side) && side > 0) {
    return { width: side, height: side }
  }

  return null
}

function cloneQuality(dataQuality) {
  if (!dataQuality || typeof dataQuality !== 'object') return null
  return {
    status: dataQuality.status || 'ok',
    totalFrames: dataQuality.totalFrames || 0,
    badFrameCount: dataQuality.badFrameCount || 0,
    consecutiveBadFrames: dataQuality.consecutiveBadFrames || 0,
    badFrameRate: Number(dataQuality.badFrameRate || 0),
    lastError: dataQuality.lastError || null,
    hzAbnormal: Boolean(dataQuality.hzAbnormal),
  }
}

function buildMatrixMeta(type, arr) {
  const dimensions = getMatrixDimensions(type, arr)
  if (!dimensions) return null
  return {
    matrix_key: type,
    width: dimensions.width,
    height: dimensions.height,
    point_count: Array.isArray(arr) ? arr.length : 0,
  }
}

function isValidMatrix(type, arr) {
  if (!Array.isArray(arr)) return false
  const dimensions = getMatrixDimensions(type, arr)
  return Boolean(dimensions && dimensions.width * dimensions.height === arr.length)
}

function flipHorizontal(arr, width, height) {
  const result = []
  for (let y = 0; y < height; y++) {
    for (let x = width - 1; x >= 0; x--) {
      result.push(arr[y * width + x])
    }
  }
  return result
}

function flipVertical(arr, width, height) {
  const result = []
  for (let y = height - 1; y >= 0; y--) {
    for (let x = 0; x < width; x++) {
      result.push(arr[y * width + x])
    }
  }
  return result
}

function rotateClockwise(arr, width, height) {
  const result = []
  for (let x = 0; x < width; x++) {
    for (let y = height - 1; y >= 0; y--) {
      result.push(arr[y * width + x])
    }
  }
  return result
}

function getDirectedDimensions(key, arr, direction) {
  const dimensions = getMatrixDimensions(key, arr)
  if (!dimensions) return null
  const rotateDegree = normalizeRotateDegree(direction?.rotateDegree)
  return rotateDegree === 90 || rotateDegree === 270
    ? { width: dimensions.height, height: dimensions.width }
    : dimensions
}

function applyCollectionDirection(key, arr, direction) {
  const dimensions = getMatrixDimensions(key, arr)
  if (!dimensions) {
    return [...arr]
  }

  let result = [...arr]
  let currentWidth = dimensions.width
  let currentHeight = dimensions.height
  const turns = normalizeRotateDegree(direction.rotateDegree) / 90
  for (let i = 0; i < turns; i++) {
    result = rotateClockwise(result, currentWidth, currentHeight)
    const oldWidth = currentWidth
    currentWidth = currentHeight
    currentHeight = oldWidth
  }
  if (!direction.left) {
    result = flipHorizontal(result, currentWidth, currentHeight)
  }
  if (!direction.up) {
    result = flipVertical(result, currentWidth, currentHeight)
  }
  return result
}

function buildDirectedFrame(frame, directionState = state.dataDirection || DEFAULT_DATA_DIRECTION) {
  const normalizedState = normalizeDataDirectionState(directionState)
  const directedFrame = {}

  Object.keys(frame || {}).forEach((key) => {
    const item = frame[key]
    if (!item || typeof item !== 'object') {
      directedFrame[key] = item
      return
    }

    const nextItem = { ...item }
    if (Array.isArray(nextItem.arr) && isValidMatrix(key, nextItem.arr)) {
      const direction = getDirectionForKey(normalizedState, key)
      nextItem.arr = applyCollectionDirection(key, nextItem.arr, direction)
      nextItem.dataDirection = direction
      const directedDimensions = getDirectedDimensions(key, item.arr, direction)
      if (directedDimensions) {
        nextItem.matrixMeta = {
          matrix_key: key,
          width: directedDimensions.width,
          height: directedDimensions.height,
          point_count: nextItem.arr.length,
        }
      }
    }
    directedFrame[key] = nextItem
  })

  return directedFrame
}

function applyZeroBaseline(key, arr, zeroState) {
  if (!zeroState?.enabled || !zeroState?.data || !Array.isArray(arr)) return [...arr]
  const shortKey = key.includes('-') ? key.split('-')[1] : key
  const baseline = zeroState.data[key] || zeroState.data[shortKey]
  if (!Array.isArray(baseline) || baseline.length !== arr.length) return [...arr]
  return arr.map((value, index) => Math.max(0, value - (Number(baseline[index]) || 0)))
}

function buildZeroMeta(zeroState, key) {
  const shortKey = key.includes('-') ? key.split('-')[1] : key
  const baseline = zeroState?.data?.[key] || zeroState?.data?.[shortKey]
  return {
    enabled: Boolean(zeroState?.enabled),
    zero_enabled: Boolean(zeroState?.enabled),
    zero_time: zeroState?.enabled ? (zeroState.zeroTime || null) : null,
    has_baseline: Array.isArray(baseline),
  }
}

function getDeviceMacForItem(item = {}) {
  const port = item.rawFrame?.port
  return port && state.macInfo?.[port]?.uniqueId ? state.macInfo[port].uniqueId : ''
}

/**
 * 解析串口数据为前端格式
 */
function parseData(parserArr, objs, type) {
  const json = {}
  const ONLINE_THRESHOLD = 1000

  Object.keys(objs).forEach((key) => {
    const obj = parserArr[key]
    const data = objs[key]

    // 跳过 type 为 null/undefined 的设备，避免产生无效 key
    if (!data || !data.type) return

    if (!obj?.port?.isOpen) {
      json[data.type] = { status: 'offline' }
      return
    }

    let blueArr = []
    if (type === 'blue') {
      const { order } = constantObj
      const lastData = data[order[1]]
      const nextData = data[order[2]]
      if (lastData?.length && nextData?.length) {
        blueArr = [...lastData, ...nextData]
      }
    } else if (type === 'highHZ') {
      blueArr = data.arr
    }

    const dataStamp = Date.now() - data.stamp
    json[data.type] = {}

    if (dataStamp < ONLINE_THRESHOLD) {
      if (Array.isArray(blueArr) && blueArr.length && !isValidMatrix(data.type, blueArr)) {
        json[data.type].status = 'matrix_error'
        json[data.type].dataQuality = {
          ...(cloneQuality(data.dataQuality) || {}),
          status: 'device_error',
          lastError: {
            type: 'matrix_size_mismatch',
            expected: getMatrixDimensions(data.type, blueArr),
            actualLength: blueArr.length,
          },
        }
        return
      }

      const quality = cloneQuality(data.dataQuality)
      json[data.type].status = quality?.status === 'device_error' ? 'device_error' : 'online'
      json[data.type].arr = blueArr
      json[data.type].rotate = data.rotate
      json[data.type].stamp = data.stamp
      json[data.type].HZ = data.HZ
      json[data.type].sampleRateHz = data.sampleRateHz || data.HZ
      json[data.type].frameIntervalMs = data.frameIntervalMs
      json[data.type].rawFrame = data.rawFrame
      json[data.type].rawPointArray = data.rawPointArray
      json[data.type].matrixMeta = buildMatrixMeta(data.type, blueArr)
      if (quality) json[data.type].dataQuality = quality
      if (data.cop) json[data.type].cop = data.cop
      if (data.breatheData) json[data.type].cop = data.breatheData
    } else {
      json[data.type].status = 'offline'
    }
  })

  return json
}

/**
 * 发送实时数据给前端
 */
function sendData() {
  let obj
  if (state.baudRate === 921600) {
    obj = parseData(state.parserArr, structuredClone(state.dataMap))

    Object.keys(obj).forEach((key) => {
      if (!Object.values(constantObj.type).includes(key)) {
        delete obj[key]
      }
    })

    if (Object.keys(obj).some((a) => Object.values(constantObj.type).includes(a))) {
      broadcast(JSON.stringify({ data: buildDirectedFrame(obj) }))
    }
  } else {
    obj = parseData(state.parserArr, structuredClone(state.dataMap), 'highHZ')
    broadcast(JSON.stringify({ sitData: buildDirectedFrame(obj) }))
  }
  return obj
}

/**
 * 将采集数据存入数据库
 */
function storageData(data) {
  const timestamp = Date.now()
  const directionState = normalizeDataDirectionState(state.dataDirection || DEFAULT_DATA_DIRECTION)
  const newData = {}

  Object.keys(data || {}).forEach((key) => {
    const item = data[key]
    if (!item || typeof item !== 'object') return
    if (item.status && item.status !== 'online') return
    if (item.dataQuality?.status === 'device_error') return

    const nextItem = { ...item }
    if (nextItem.status) delete nextItem.status
    if (Array.isArray(nextItem.arr)) {
      const direction = getDirectionForKey(directionState, key)
      nextItem.arr = applyCollectionDirection(key, nextItem.arr, direction)
      nextItem.arr = applyZeroBaseline(key, nextItem.arr, state.zeroState)
      nextItem.dataDirection = direction
      const directedDimensions = getDirectedDimensions(key, item.arr, direction)
      if (directedDimensions) {
        nextItem.matrixMeta = {
          matrix_key: key,
          width: directedDimensions.width,
          height: directedDimensions.height,
          point_count: nextItem.arr.length,
        }
      }
      nextItem.zeroState = buildZeroMeta(state.zeroState, key)
      nextItem.deviceMac = getDeviceMacForItem(item)
      nextItem.deviceType = key
      nextItem.softwareVersion = 'endi1.0.1'
      nextItem.pressureUnit = 'software_unit'
    }
    newData[key] = nextItem
  })

  const insertQuery = 'INSERT INTO matrix (data, timestamp, date, `select`) VALUES (?, ?, ?, ?)'
  state.currentDb.run(
    insertQuery,
    [JSON.stringify(newData), timestamp, state.colName, JSON.stringify([])],
    function (err) {
      if (err) {
        console.error('[DB] Data insert failed:', err)
      }
    }
  )
}

/**
 * 采集数据并发送到前端 (定时器回调)
 */
function colAndSendData() {
  if (state.historyFlag || !Object.keys(state.parserArr).length) return

  const obj = sendData()
  if (state.colFlag) {
    storageData(obj)
  }
}

/**
 * 清除回放定时器
 */
function clearPlayTimer() {
  if (state.colTimer) {
    clearInterval(state.colTimer)
    state.colTimer = null
  }
}

function getPlaybackRows() {
  return Array.isArray(state.historyDbArr) ? state.historyDbArr : []
}

function parsePlaybackData(value) {
  if (!value) return {}
  if (typeof value === 'object') {
    try {
      return JSON.parse(JSON.stringify(value))
    } catch {
      return { ...value }
    }
  }

  try {
    return JSON.parse(value)
  } catch {
    return {}
  }
}

function removePlaybackSelect(data) {
  if (!data || typeof data !== 'object') return data

  for (const key of Object.keys(data)) {
    if (data[key] && typeof data[key] === 'object' && 'select' in data[key]) {
      data[key] = { ...data[key] }
      delete data[key].select
    }
  }

  return data
}

function validatePlaybackFrameData(sitDataPlay) {
  const keys = Object.keys(sitDataPlay || {})
  if (!keys.length) {
    return { valid: false, reason: 'empty_frame' }
  }

  for (const key of keys) {
    const item = sitDataPlay[key]
    if (!item || !Array.isArray(item.arr) || !item.arr.length) {
      return { valid: false, reason: 'missing_matrix', key }
    }
    if (!isValidMatrix(key, item.arr)) {
      return { valid: false, reason: 'matrix_size_mismatch', key, actualLength: item.arr.length }
    }
    if (item.arr.some((value) => !Number.isFinite(Number(value)))) {
      return { valid: false, reason: 'invalid_number', key }
    }
  }

  return { valid: true }
}

function parsePlaybackTimestamp(value) {
  if (value === undefined || value === null || value === '') return null
  if (typeof value === 'number') return value

  try {
    return JSON.parse(value)
  } catch {
    const numericValue = Number(value)
    return Number.isFinite(numericValue) ? numericValue : value
  }
}

function normalizePlayIndex(index = state.playIndex, rows = getPlaybackRows()) {
  if (!rows.length) {
    state.playIndex = 0
    return -1
  }

  const rawIndex = Number(index)
  const nextIndex = Number.isFinite(rawIndex) ? Math.trunc(rawIndex) : 0
  state.playIndex = Math.min(rows.length - 1, Math.max(0, nextIndex))
  return state.playIndex
}

function getPlaybackSnapshot(index = state.playIndex, options = {}) {
  const rows = getPlaybackRows()
  let normalizedIndex = normalizePlayIndex(index, rows)

  if (normalizedIndex < 0) {
    return null
  }

  const maxSkips = options.skipBadFrames === false ? 0 : rows.length
  let skippedInThisLookup = 0
  let row = rows[normalizedIndex]
  let sitDataPlay = removePlaybackSelect(parsePlaybackData(row?.data))
  let validation = validatePlaybackFrameData(sitDataPlay)

  while (!validation.valid && skippedInThisLookup < maxSkips) {
    console.warn('[Playback] Skip bad frame:', {
      index: normalizedIndex,
      ...validation,
    })
    state.playbackSkippedFrameCount = (state.playbackSkippedFrameCount || 0) + 1
    state.playbackConsecutiveBadFrames = (state.playbackConsecutiveBadFrames || 0) + 1
    skippedInThisLookup += 1

    if (state.playbackConsecutiveBadFrames >= 10) {
      state.historyPlayFlag = false
      return {
        row,
        payload: {
          playError: {
            type: 'too_many_bad_frames',
            skipped_frame_count: state.playbackSkippedFrameCount,
            message: '历史数据损坏较多，建议检查文件',
          },
          index: normalizedIndex,
        }
      }
    }

    if (normalizedIndex >= rows.length - 1) {
      return null
    }

    normalizedIndex += 1
    state.playIndex = normalizedIndex
    row = rows[normalizedIndex]
    sitDataPlay = removePlaybackSelect(parsePlaybackData(row?.data))
    validation = validatePlaybackFrameData(sitDataPlay)
  }

  if (!validation.valid || !row) {
    return null
  }

  if (skippedInThisLookup === 0) {
    state.playbackConsecutiveBadFrames = 0
  }

  // 将缓存的框选信息注入到每帧数据中，供前端渲染框选框
  const selectCache = state.historySelectCache
  if (selectCache && typeof selectCache === 'object' && Object.keys(selectCache).length) {
    for (const key of Object.keys(selectCache)) {
      if (sitDataPlay[key]) {
        sitDataPlay[key].select = selectCache[key]
      }
    }
  }

  return {
    row,
    payload: {
      sitDataPlay,
      index: normalizedIndex,
      timestamp: parsePlaybackTimestamp(row.timestamp),
      playbackQuality: {
        skipped_frame_count: state.playbackSkippedFrameCount || 0,
        skipped_in_lookup: skippedInThisLookup,
      }
    }
  }
}

function finishPlayback() {
  state.historyPlayFlag = false
  broadcast(JSON.stringify({ playEnd: false }))
  clearPlayTimer()
}

function getPlaybackIntervalMs() {
  const hz = Number(state.colplayHZ)
  const safeHz = Number.isFinite(hz) && hz > 0 ? hz : DEFAULT_PLAYBACK_HZ
  return 1000 / safeHz
}

function runPlaybackTick() {
  if (!state.historyPlayFlag) return

  const snapshot = getPlaybackSnapshot()
  if (!snapshot) {
    finishPlayback()
    return
  }

  broadcast(JSON.stringify(snapshot.payload))

  if (snapshot.payload?.playError) {
    finishPlayback()
    return
  }

  const rows = getPlaybackRows()
  if (state.playIndex < rows.length - 1) {
    state.playIndex++
    return
  }

  finishPlayback()
}

/**
 * 开始历史数据回放
 */
function startPlayback() {
  const rows = getPlaybackRows()
  if (!rows.length) {
    state.historyPlayFlag = false
    clearPlayTimer()
    return false
  }

  if (state.playIndex >= rows.length - 1 || state.playIndex < 0) {
    state.playIndex = 0
  }
  state.historyPlayFlag = true
  state.playbackSkippedFrameCount = 0
  state.playbackConsecutiveBadFrames = 0

  clearPlayTimer()
  broadcast(JSON.stringify({ playEnd: true }))

  runPlaybackTick()
  if (state.historyPlayFlag) {
    state.colTimer = setInterval(runPlaybackTick, getPlaybackIntervalMs())
  }

  return true
}

/**
 * 修改播放速度
 */
function changePlaySpeed(speed) {
  const baseHz = Number(state.colMaxHZ)
  const safeBaseHz = Number.isFinite(baseHz) && baseHz > 0 ? baseHz : DEFAULT_PLAYBACK_HZ
  const speedValue = Number(speed)
  const allowedSpeeds = [0.5, 1, 2, 4]
  const safeSpeed = allowedSpeeds.includes(speedValue) ? speedValue : 1

  state.colplayHZ = safeBaseHz * safeSpeed

  if (state.historyPlayFlag) {
    if (!getPlaybackRows().length) {
      finishPlayback()
      return
    }

    clearPlayTimer()
    state.colTimer = setInterval(runPlaybackTick, getPlaybackIntervalMs())
  }
}

module.exports = {
  colAndSendData,
  sendData,
  storageData,
  clearPlayTimer,
  startPlayback,
  changePlaySpeed,
  getPlaybackSnapshot,
  parseData,
  buildDirectedFrame,
  normalizeDataDirectionState,
  saveDataDirection,
  loadPersistedDataDirection,
}
