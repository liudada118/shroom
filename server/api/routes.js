/**
 * API 路由模块
 * 所有 HTTP API 端点定义，调用 state 和各 service 完成业务逻辑
 */
const express = require('express')
const fs = require('fs')
const HttpResult = require('../HttpResult')
const constantObj = require('../../util/config')
const { initDb, dbLoadCsv, deleteDbData, dbGetData, getCsvData, changeDbName, changeDbDataName, upsertRemark, getRemark } = require('../../util/db')
const { decryptStr } = require('../../util/aes_ecb')
const module2 = require('../../util/aes_ecb')
const { state } = require('../state')
const { broadcast } = require('../websocket')
const { connectPort, portWrite, stopPort, detectBaudRate, sendMacCommand, resolveDeviceType } = require('../serial/SerialManager')
const { colAndSendData, clearPlayTimer, startPlayback, changePlaySpeed } = require('../services/DataService')
const { getAllCached, setTypeToCache, removeFromCache, clearCache } = require('../../util/serialCache')

const router = express.Router()

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
  const config = fs.readFileSync('./config.txt', 'utf-8')
  const configResult = JSON.parse(decryptStr(config))
  configResult.value = state.file

  state.baudRate = constantObj.baudRateObj[configResult.value] || 1000000

  const { db } = initDb(state.file, state._dbPath)
  state.currentDb = db

  res.json(new HttpResult(0, configResult, 'Get device list success'))
}))

router.post('/selectSystem', asyncHandler(async (req, res) => {
  state.file = req.query.file
  const { db } = initDb(state.file, state._dbPath)
  state.currentDb = db
  state.baudRate = constantObj.blue.includes(state.file) ? 921600 : 1000000
  res.json(new HttpResult(0, {}, 'Switch success'))
}))

router.post('/changeSystemType', asyncHandler(async (req, res) => {
  const { system } = req.body
  state.file = system
  state.baudRate = constantObj.baudRateObj[system] || 1000000
  const { db } = initDb(state.file, state._dbPath)
  state.currentDb = db
  broadcast(JSON.stringify({ sitData: {} }))
  const result = JSON.parse(decryptStr(fs.readFileSync('./config.txt', 'utf-8')))
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
  const port = await connectPort(broadcast, colAndSendData)
  res.json(new HttpResult(0, port, 'Connect success'))
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

router.post('/startCol', asyncHandler(async (req, res) => {
  const { fileName, select } = req.body
  state.selectArr = select
  state.historySelectCache = null

  const sensorArr = Object.keys(state.dataMap).map((a) => state.dataMap[a].type)
  const matchCount = sensorArr.filter((a) => typeof state.file === 'string' && a.includes(state.file)).length

  if (matchCount > 0) {
    state.colFlag = true
    state.colName = String(fileName)
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
  const selectQuery = `
    SELECT 
      m.date, m.timestamp,
      COALESCE(r.select_json, m.\`select\`) AS \`select\`,
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
    state.currentDb.all(selectQuery, [0, 500], (err, rows) => {
      if (err) reject(err)
      else resolve(rows)
    })
  })

  res.json(new HttpResult(0, rows, 'success'))
  broadcast(JSON.stringify({ sitData: {} }))
}))

router.post('/getDbHistory', asyncHandler(async (req, res) => {
  const { time } = req.body
  state.historySelectCache = null

  const { length, pressArr, areaArr, rows } = await dbGetData({ db: state.currentDb, params: [time] })

  state.historyDbArr = rows
  state.colMaxHZ = 1000 / (state.historyDbArr[1].timestamp - state.historyDbArr[0].timestamp)
  state.colplayHZ = state.colMaxHZ
  state.historyFlag = true
  state.playIndex = 0

  res.json(new HttpResult(0, { length, pressArr, areaArr }, 'success'))
}))

router.post('/getDbHistorySelect', asyncHandler(async (req, res) => {
  const { selectJson } = req.body || {}
  if (!selectJson || typeof selectJson !== 'object') {
    res.json(new HttpResult(1, {}, 'selectJson required'))
    return
  }

  state.historySelectCache = selectJson

  if (!state.historyDbArr || !state.historyDbArr.length) {
    res.json(new HttpResult(1, {}, 'history not loaded'))
    return
  }

  const rows = state.historyDbArr
  const keyArr = Object.keys(JSON.parse(rows[0].data || '{}'))
  const pressArr = {}
  const areaArr = {}
  keyArr.forEach((key) => {
    pressArr[key] = []
    areaArr[key] = []
  })

  for (let i = 0; i < rows.length; i++) {
    const dataObj = JSON.parse(rows[i].data || '{}')
    for (const key of keyArr) {
      const item = dataObj[key]
      const arr = item && item.arr ? item.arr : []
      const sel = selectJson[key]

      if (!sel || typeof sel !== 'object') {
        pressArr[key].push(0)
        areaArr[key].push(0)
        continue
      }

      const { xStart, xEnd, yStart, yEnd, width } = sel
      if ([xStart, xEnd, yStart, yEnd, width].some((v) => typeof v !== 'number')) {
        pressArr[key].push(0)
        areaArr[key].push(0)
        continue
      }

      let press = 0, area = 0
      for (let y = yStart; y < yEnd; y++) {
        for (let x = xStart; x < xEnd; x++) {
          const v = arr[y * width + x] || 0
          press += v
          if (v > 0) area++
        }
      }
      pressArr[key].push(press)
      areaArr[key].push(area)
    }
  }

  res.json(new HttpResult(0, { length: rows.length, pressArr, areaArr }, 'success'))
}))

router.post('/getContrastData', asyncHandler(async (req, res) => {
  const { left, right } = req.body

  const [leftResult, rightResult] = await Promise.all([
    dbGetData({ db: state.currentDb, params: [left] }),
    dbGetData({ db: state.currentDb, params: [right] })
  ])

  state.leftDbArr = leftResult.rows
  state.rightDbArr = rightResult.rows

  broadcast(JSON.stringify({
    contrastData: {
      left: JSON.parse(state.leftDbArr[0].data),
      right: JSON.parse(state.rightDbArr[0].data)
    }
  }))

  res.json(new HttpResult(0, {
    left: { length: leftResult.length, pressArr: leftResult.pressArr, areaArr: leftResult.areaArr },
    right: { length: rightResult.length, pressArr: rightResult.pressArr, areaArr: rightResult.areaArr }
  }, 'success'))
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
  state.historyDbArr = null
  state.historySelectCache = null
  clearPlayTimer()
  res.json(new HttpResult(0, {}, 'success'))
})

router.post('/changeDbplaySpeed', asyncHandler(async (req, res) => {
  const { speed } = req.body
  changePlaySpeed(speed)
  res.json(new HttpResult(0, {}, 'success'))
}))

router.post('/getDbHistoryIndex', asyncHandler(async (req, res) => {
  const { index } = req.body

  if (!state.historyDbArr) {
    res.json(new HttpResult(555, 'Please select playback time range', 'error'))
    return
  }

  state.playIndex = index
  broadcast(JSON.stringify({
    sitDataPlay: JSON.parse(state.historyDbArr[state.playIndex].data),
    index: state.playIndex,
    timestamp: JSON.parse(state.historyDbArr[state.playIndex].timestamp)
  }))
  res.json(new HttpResult(0, state.historyDbArr[index], 'success'))
}))

// ─── 数据操作 ────────────────────────────────────────────

router.post('/downlaod', asyncHandler(async (req, res) => {
  const { fileArr, selectJson } = req.body || {}
  if (!fileArr || !fileArr.length) {
    res.json(new HttpResult(555, 'Please select data first', 'error'))
    return
  }
  const selectOverride = selectJson && typeof selectJson === 'object' ? selectJson : state.historySelectCache
  const data = await dbLoadCsv({ db: state.currentDb, params: fileArr, file: state.file, isPackaged: state._isPackaged, selectJson: selectOverride, customDownloadPath: state.downloadPath })
  res.json(new HttpResult(0, data, 'Download'))
}))

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
    defaultPath = path.resolve('resources/data')
  } else {
    defaultPath = path.resolve(__dirname, '../../data')
  }
  const currentPath = state.downloadPath || defaultPath
  // 同步默认路径到 state，确保下载时使用同一路径
  if (!state.downloadPath) {
    state.downloadPath = defaultPath
  }
  res.json(new HttpResult(0, { path: currentPath, isDefault: !state.downloadPath }, 'success'))
})

router.post('/setDownloadPath', asyncHandler(async (req, res) => {
  const { path: newPath } = req.body
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
  state.downloadPath = newPath

  // 持久化下载路径到文件
  try {
    const downloadPathFile = require('path').join(state._dbPath, 'downloadPath.json')
    fs.writeFileSync(downloadPathFile, JSON.stringify({ path: newPath }), 'utf-8')
  } catch (e) {
    console.warn('[Server] Failed to persist download path:', e.message)
  }

  res.json(new HttpResult(0, { path: newPath }, 'success'))
}))

router.post('/openFile', asyncHandler(async (req, res) => {
  const { filePath } = req.body
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
  const { folderPath } = req.body
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
  const { fileArr } = req.body
  const data = await deleteDbData({ db: state.currentDb, params: fileArr })
  res.json(new HttpResult(0, data, 'Delete success'))
}))

router.post('/changeDbName', asyncHandler(async (req, res) => {
  const { newDate, oldDate } = req.body
  const data = await changeDbName({ db: state.currentDb, params: [newDate, oldDate] })
  res.json(new HttpResult(0, data, 'Update success'))
}))

router.post('/changeDbDataName', asyncHandler(async (req, res) => {
  const { oldName, newName } = req.body
  await changeDbDataName({ db: state.currentDb, params: [oldName, newName] })
  res.json(new HttpResult(0, {}, 'success'))
}))

// ─── 备注管理 ────────────────────────────────────────────

router.post('/upsertRemark', asyncHandler(async (req, res) => {
  let { date, alias, remark, select } = req.body || {}
  if (!date) {
    res.json(new HttpResult(1, {}, 'date required'))
    return
  }
  date = String(date)
  const data = await upsertRemark({ db: state.currentDb, params: { date, alias, remark, select } })
  res.json(new HttpResult(0, data, 'success'))
}))

router.post('/getRemark', asyncHandler(async (req, res) => {
  const { date } = req.body || {}
  if (!date) {
    res.json(new HttpResult(1, {}, 'date required'))
    return
  }
  const data = await getRemark({ db: state.currentDb, params: [date] })
  res.json(new HttpResult(0, data, 'success'))
}))

// ─── Device缓存管理 ───────────────────────────────────────────

// 获取所有缓存的Device列表
router.get('/cache/devices', asyncHandler(async (req, res) => {
  const devices = getAllCached()
  res.json(new HttpResult(0, devices, 'success'))
}))

// 添加/更新Device缓存
router.post('/cache/devices', asyncHandler(async (req, res) => {
  const { mac, type, deviceClass, alias } = req.body
  if (!mac || !type) {
    res.json(new HttpResult(1, {}, 'mac and type are required'))
    return
  }
  setTypeToCache(mac, type, deviceClass || 'foot', alias || '')
  res.json(new HttpResult(0, {}, 'Device cache updated'))
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
    const { key } = req.body
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
      uploadDir = path.resolve('resources/data/csv')
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
  res.json(new HttpResult(0, { fileName, filePath }, 'Upload success'))
}))

router.post('/getCsvData', asyncHandler(async (req, res) => {
  const { fileName } = req.body
  const data = getCsvData(fileName)
  res.json(new HttpResult(0, data, 'success'))
}))

router.post('/getSysconfig', (req, res) => {
  const { config } = req.body
  const str = module2.encStr(JSON.stringify(config))
  res.json(new HttpResult(0, str, 'success'))
})

module.exports = router
