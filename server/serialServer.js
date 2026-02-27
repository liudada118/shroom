const express = require('express')
const os = require('os')
const fs = require('fs')
const path = require('path')
const cors = require('cors')
const WebSocket = require('ws')
const HttpResult = require('./HttpResult')
const { SerialPort, DelimiterParser } = require('serialport')
const { getPort } = require('../util/serialport')
const constantObj = require('../util/config')
const { bytes4ToInt10 } = require('../util/parseData')
const { initDb, dbLoadCsv, deleteDbData, dbGetData, getCsvData, changeDbName, changeDbDataName, upsertRemark, getRemark } = require('../util/db')
const { hand, jqbed, endiSit, endiBack, endiSit1024, endiBack1024 } = require('../util/line')
const { decryptStr } = require('../util/aes_ecb')
const { default: axios } = require('axios')
const module2 = require('../util/aes_ecb')

// ─── 常量配置 ────────────────────────────────────────────
const API_PORT = 19245
const WS_PORT = 19999
const RECONNECT_INTERVAL = 3000  // 串口断线重连间隔 (ms)
const DATA_SEND_INTERVAL = 80    // 数据发送间隔 (ms)
const MIN_HZ_INTERVAL = 50       // 最小数据帧间隔 (ms)
const ONLINE_THRESHOLD = 1000    // 设备在线判定阈值 (ms)

const { blue, splitArr } = constantObj
const splitBuffer = Buffer.from(splitArr)

// ─── 环境变量 ────────────────────────────────────────────
let { isPackaged, appPath } = process.env
isPackaged = isPackaged === 'true'

// ─── 路径配置 ────────────────────────────────────────────
let dbPath = path.join(__dirname, '..', 'db')
let csvPath, nameTxt

if (isPackaged) {
  if (os.platform() === 'darwin') {
    dbPath = path.join(__dirname, '../../db')
    csvPath = path.join(__dirname, '../../data')
    nameTxt = path.join(__dirname, '../../config.txt')
  } else {
    dbPath = 'resources/db'
    csvPath = 'resources/data'
    nameTxt = 'resources/config.txt'
  }
}

// ─── 配置文件读取 ─────────────────────────────────────────
const config = fs.readFileSync('./config.txt', 'utf-8')
const result = JSON.parse(decryptStr(config))
console.log('[Server] 配置加载完成:', Object.keys(result))

// ─── 全局状态 ────────────────────────────────────────────
let file = result.value           // 当前系统类型
let baudRate = 1000000            // 当前波特率
let parserArr = {}                // 串口解析器集合
let dataMap = {}                  // 串口数据缓存
let HZ = 30                       // 发送频率
let MaxHZ                         // 串口最大频率
let colFlag = false               // 采集开关
let colName                       // 采集命名
let historyFlag = false           // 历史数据模式开关
let historyPlayFlag = false       // 历史播放开关
let playIndex = 0                 // 数据播放索引
let colTimer                      // 回放定时器
let colMaxHZ                      // 采集最大频率
let colplayHZ                     // 回放频率
let playtimer                     // 数据发送定时器
let linkIngPort = []
let currentDb
let macInfo = {}
let selectArr = []
let historySelectCache = null
let historyDbArr                  // 历史回放数据
let leftDbArr, rightDbArr         // 对比数据
let sendDataLength = 0
const oldTimeObj = {}

// ─── 初始化数据库 ─────────────────────────────────────────
const { db } = initDb(file, dbPath)
currentDb = db
console.log('[Server] 数据库初始化完成:', dbPath)

// ─── Express 应用配置 ─────────────────────────────────────
const app = express()
app.use(cors())
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ limit: '50mb', extended: true }))

// ─── 通用错误处理包装器 ──────────────────────────────────
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch((err) => {
      console.error('[Server] 路由错误:', err)
      res.json(new HttpResult(1, {}, err.message || '服务器内部错误'))
    })
  }
}

// ═══════════════════════════════════════════════════════════
//  API 路由
// ═══════════════════════════════════════════════════════════

app.get('/', (req, res) => {
  res.send('jqtools2 API Server')
})

// ─── 系统管理 ────────────────────────────────────────────

// 查询系统列表和当前系统
app.get('/getSystem', asyncHandler(async (req, res) => {
  const config = fs.readFileSync('./config.txt', 'utf-8')
  const configResult = JSON.parse(decryptStr(config))
  configResult.value = file

  baudRate = constantObj.baudRateObj[configResult.value] || 1000000

  const { db } = initDb(file, dbPath)
  currentDb = db

  res.json(new HttpResult(0, configResult, '获取设备列表成功'))
}))

// 切换系统类型
app.post('/selectSystem', asyncHandler(async (req, res) => {
  file = req.query.file
  const { db } = initDb(file, dbPath)
  currentDb = db
  baudRate = blue.includes(file) ? 921600 : 1000000
  res.json(new HttpResult(0, {}, '切换成功'))
}))

// 修改系统类型（含通知前端）
app.post('/changeSystemType', asyncHandler(async (req, res) => {
  const { system } = req.body
  file = system
  baudRate = constantObj.baudRateObj[system] || 1000000
  const { db } = initDb(file, dbPath)
  currentDb = db
  socketSendData(wsServer, JSON.stringify({ sitData: {} }))
  res.json(new HttpResult(0, { optimalObj: result.optimalObj[file], maxObj: result.maxObj[file] }, 'success'))
}))

// ─── 串口管理 ────────────────────────────────────────────

// 查询可用串口
app.get('/getPort', asyncHandler(async (req, res) => {
  const ports = await SerialPort.list()
  const portsRes = getPort(ports)
  res.json(new HttpResult(0, portsRes, '获取设备列表成功'))
}))

// 一键连接
app.get('/connPort', asyncHandler(async (req, res) => {
  const port = await connectPort()
  res.json(new HttpResult(0, port, '连接成功'))
}))

// 发送 MAC 指令
app.get('/sendMac', asyncHandler(async (req, res) => {
  if (!Object.keys(parserArr).length) {
    res.json(new HttpResult(0, {}, '请先连接串口'))
    return
  }

  const tasks = Object.keys(parserArr).map((key) => portWrite(parserArr[key].port))
  await Promise.all(tasks)
  res.json(new HttpResult(0, {}, '发送成功'))
}))

// ─── 数据采集 ────────────────────────────────────────────

// 开始采集
app.post('/startCol', asyncHandler(async (req, res) => {
  const { fileName, select } = req.body
  selectArr = select
  historySelectCache = null

  const sensorArr = Object.keys(dataMap).map((a) => dataMap[a].type)
  const matchCount = sensorArr.filter((a) => typeof file === 'string' && a.includes(file)).length

  if (matchCount > 0) {
    colFlag = true
    colName = String(fileName)
    res.json(new HttpResult(0, {}, '开始采集'))
  } else {
    res.json(new HttpResult(0, '请选择正确传感器类型', 'error'))
  }
}))

// 停止采集
app.get('/endCol', (req, res) => {
  colFlag = false
  res.json(new HttpResult(0, 'success', '停止采集'))
})

// ─── 历史数据管理 ─────────────────────────────────────────

// 获取采集历史列表
app.get('/getColHistory', asyncHandler(async (req, res) => {
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

  historyFlag = true

  const rows = await new Promise((resolve, reject) => {
    currentDb.all(selectQuery, [0, 500], (err, rows) => {
      if (err) reject(err)
      else resolve(rows)
    })
  })

  res.json(new HttpResult(0, rows, 'success'))
  socketSendData(wsServer, JSON.stringify({ sitData: {} }))
}))

// 获取某个时间段的历史数据
app.post('/getDbHistory', asyncHandler(async (req, res) => {
  const { time } = req.body
  historySelectCache = null

  const { length, pressArr, areaArr, rows } = await dbGetData({ db: currentDb, params: [time] })

  historyDbArr = rows
  colMaxHZ = 1000 / (historyDbArr[1].timestamp - historyDbArr[0].timestamp)
  colplayHZ = colMaxHZ
  historyFlag = true
  playIndex = 0

  res.json(new HttpResult(0, { length, pressArr, areaArr }, 'success'))
}))

// 历史回放：根据框选区域重新计算
app.post('/getDbHistorySelect', asyncHandler(async (req, res) => {
  const { selectJson } = req.body || {}
  if (!selectJson || typeof selectJson !== 'object') {
    res.json(new HttpResult(1, {}, 'selectJson required'))
    return
  }

  historySelectCache = selectJson

  if (!historyDbArr || !historyDbArr.length) {
    res.json(new HttpResult(1, {}, 'history not loaded'))
    return
  }

  const rows = historyDbArr
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

// 对比数据
app.post('/getContrastData', asyncHandler(async (req, res) => {
  const { left, right } = req.body

  const [leftResult, rightResult] = await Promise.all([
    dbGetData({ db: currentDb, params: [left] }),
    dbGetData({ db: currentDb, params: [right] })
  ])

  leftDbArr = leftResult.rows
  rightDbArr = rightResult.rows

  socketSendData(wsServer, JSON.stringify({
    contrastData: {
      left: JSON.parse(leftDbArr[0].data),
      right: JSON.parse(rightDbArr[0].data)
    }
  }))

  res.json(new HttpResult(0, {
    left: { length: leftResult.length, pressArr: leftResult.pressArr, areaArr: leftResult.areaArr },
    right: { length: rightResult.length, pressArr: rightResult.pressArr, areaArr: rightResult.areaArr }
  }, 'success'))
}))

// ─── 回放控制 ────────────────────────────────────────────

// 开始播放
app.post('/getDbHistoryPlay', asyncHandler(async (req, res) => {
  if (!historyDbArr) {
    res.json(new HttpResult(1, '请选择回放时间段', 'error'))
    return
  }

  if (playIndex >= historyDbArr.length - 1) {
    playIndex = 0
  }
  historyPlayFlag = true

  clearPlayTimer()
  socketSendData(wsServer, JSON.stringify({ playEnd: true }))

  colTimer = setInterval(() => {
    if (!historyPlayFlag || !historyDbArr) return

    socketSendData(wsServer, JSON.stringify({
      sitDataPlay: JSON.parse(historyDbArr[playIndex].data),
      index: playIndex,
      timestamp: JSON.parse(historyDbArr[playIndex].timestamp)
    }))

    if (playIndex < historyDbArr.length - 1) {
      playIndex++
    } else {
      historyPlayFlag = false
      socketSendData(wsServer, JSON.stringify({ playEnd: false }))
      clearPlayTimer()
    }
  }, 1000 / colplayHZ)

  res.json(new HttpResult(0, {}, 'success'))
}))

// 暂停播放
app.post('/getDbHistoryStop', (req, res) => {
  historyPlayFlag = false
  res.json(new HttpResult(0, {}, 'success'))
})

// 取消播放
app.post('/cancalDbPlay', (req, res) => {
  historyFlag = false
  historyDbArr = null
  historySelectCache = null
  clearPlayTimer()
  res.json(new HttpResult(0, {}, 'success'))
})

// 修改播放速度
app.post('/changeDbplaySpeed', asyncHandler(async (req, res) => {
  const { speed } = req.body
  colplayHZ = colMaxHZ * speed

  if (historyPlayFlag) {
    clearPlayTimer()
    colTimer = setInterval(() => {
      if (!historyPlayFlag) return

      socketSendData(wsServer, JSON.stringify({
        sitDataPlay: JSON.parse(historyDbArr[playIndex].data),
        index: playIndex,
        timestamp: JSON.parse(historyDbArr[playIndex].timestamp)
      }))

      if (playIndex < historyDbArr.length - 1) {
        playIndex++
      } else {
        socketSendData(wsServer, JSON.stringify({ playEnd: false }))
        historyPlayFlag = false
        clearPlayTimer()
      }
    }, 1000 / colplayHZ)
  }

  res.json(new HttpResult(0, {}, 'success'))
}))

// 跳转到指定帧
app.post('/getDbHistoryIndex', asyncHandler(async (req, res) => {
  const { index } = req.body

  if (!historyDbArr) {
    res.json(new HttpResult(555, '请选择回放时间段', 'error'))
    return
  }

  playIndex = index
  socketSendData(wsServer, JSON.stringify({
    sitDataPlay: JSON.parse(historyDbArr[playIndex].data),
    index: playIndex,
    timestamp: JSON.parse(historyDbArr[playIndex].timestamp)
  }))
  res.json(new HttpResult(0, historyDbArr[index], 'success'))
}))

// ─── 数据操作 ────────────────────────────────────────────

// 下载为 CSV
app.post('/downlaod', asyncHandler(async (req, res) => {
  const { fileArr, selectJson } = req.body || {}
  if (!fileArr || !fileArr.length) {
    res.json(new HttpResult(555, '请选择先数据', 'error'))
    return
  }
  const selectOverride = selectJson && typeof selectJson === 'object' ? selectJson : historySelectCache
  const data = await dbLoadCsv({ db: currentDb, params: fileArr, file, isPackaged, selectJson: selectOverride })
  res.json(new HttpResult(0, data, '下载'))
}))

// 删除数据
app.post('/delete', asyncHandler(async (req, res) => {
  const { fileArr } = req.body
  const data = await deleteDbData({ db: currentDb, params: fileArr })
  res.json(new HttpResult(0, data, '删除成功'))
}))

// 修改数据名称（date 字段）
app.post('/changeDbName', asyncHandler(async (req, res) => {
  const { newDate, oldDate } = req.body
  const data = await changeDbName({ db: currentDb, params: [newDate, oldDate] })
  res.json(new HttpResult(0, data, '修改成功'))
}))

app.post('/changeDbDataName', asyncHandler(async (req, res) => {
  const { oldName, newName } = req.body
  await changeDbDataName({ db: currentDb, params: [oldName, newName] })
  res.json(new HttpResult(0, {}, 'success'))
}))

// ─── 备注管理 ────────────────────────────────────────────

app.post('/upsertRemark', asyncHandler(async (req, res) => {
  let { date, alias, remark, select } = req.body || {}
  if (!date) {
    res.json(new HttpResult(1, {}, 'date required'))
    return
  }
  date = String(date)
  const data = await upsertRemark({ db: currentDb, params: { date, alias, remark, select } })
  res.json(new HttpResult(0, data, 'success'))
}))

app.post('/getRemark', asyncHandler(async (req, res) => {
  const { date } = req.body || {}
  if (!date) {
    res.json(new HttpResult(1, {}, 'date required'))
    return
  }
  const data = await getRemark({ db: currentDb, params: [date] })
  res.json(new HttpResult(0, data, 'success'))
}))

// ─── 其他 ────────────────────────────────────────────────

app.post('/bindKey', (req, res) => {
  try {
    const { key } = req.body
    res.json(new HttpResult(0, {}, '绑定成功'))
  } catch {
    res.json(new HttpResult(1, {}, '绑定失败'))
  }
})

app.post('/getCsvData', asyncHandler(async (req, res) => {
  const { fileName } = req.body
  const data = getCsvData(fileName)
  res.json(new HttpResult(0, data, 'success'))
}))

app.post('/getSysconfig', (req, res) => {
  const { config } = req.body
  const str = module2.encStr(JSON.stringify(config))
  res.json(new HttpResult(0, str, 'success'))
})

// ═══════════════════════════════════════════════════════════
//  WebSocket 服务
// ═══════════════════════════════════════════════════════════

const wsServer = new WebSocket.Server({ port: WS_PORT })

wsServer.on('connection', (ws, req) => {
  const clientName = `${req.connection.remoteAddress}:${req.connection.remotePort}`
  console.log(`[WS] 客户端已连接: ${clientName}`)
  socketSendData(wsServer, JSON.stringify({}))
})

/**
 * 向所有 WebSocket 客户端广播数据
 */
function socketSendData(server, data) {
  server.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data)
    }
  })
}

// ═══════════════════════════════════════════════════════════
//  串口通信核心逻辑
// ═══════════════════════════════════════════════════════════

/**
 * 创建串口连接并绑定解析器
 */
function newSerialPortLink({ path, parser, baudRate = 1000000 }) {
  try {
    const port = new SerialPort({
      path,
      baudRate,
      autoOpen: true,
    }, (err) => {
      if (err) console.error(`[Serial] 串口打开错误 ${path}:`, err.message)
    })
    port.pipe(parser)
    return port
  } catch (e) {
    console.error(`[Serial] 串口创建失败 ${path}:`, e.message)
    return null
  }
}

/**
 * 向串口发送写入指令
 */
function portWrite(port) {
  return new Promise((resolve, reject) => {
    const command = Buffer.from('41542B4E414D453D45535033320d0a', 'hex')
    port.write(command, (err) => {
      if (err) {
        console.error('[Serial] 写入错误:', err.message)
        reject(err)
      } else {
        resolve()
      }
    })
  })
}

/**
 * 解析蓝牙/高频串口数据为前端格式
 */
function parseData(parserArr, objs, type) {
  const json = {}

  Object.keys(objs).forEach((key) => {
    const obj = parserArr[key]
    const data = objs[key]

    if (!obj?.port?.isOpen) {
      if (data.type) {
        json[data.type] = { status: 'offline' }
      }
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
      json[data.type].status = 'online'
      json[data.type].arr = blueArr
      json[data.type].rotate = data.rotate
      json[data.type].stamp = data.stamp
      json[data.type].HZ = data.HZ
      if (data.cop) json[data.type].cop = data.cop
      if (data.breatheData) json[data.type].cop = data.breatheData
    } else {
      json[data.type].status = 'offline'
    }
  })

  return json
}

/**
 * 根据数据包长度和类型处理矩阵数据
 */
function processMatrixData(pointArr, dataItem) {
  const type = dataItem.type
  if (type === 'hand') return hand(pointArr)
  if (type === 'bed' || type === 'car-back') return jqbed(pointArr)
  if (type === 'endi-sit') return endiSit1024(pointArr)
  if (type === 'endi-back') return endiBack1024(pointArr)
  return pointArr
}

/**
 * 处理带类型前缀的 1025 长度数据包
 */
function processTypedMatrixData(pointArr, dataItem) {
  const type = dataItem.type
  if (type === 'car-back' || type === 'car-sit' || type === 'bed') return jqbed(pointArr)
  return pointArr
}

/**
 * 更新帧率并启动数据发送定时器
 */
function updateHZAndStartTimer(dataItem, stamp) {
  if (oldTimeObj[dataItem.type]) {
    dataItem.HZ = stamp - oldTimeObj[dataItem.type]
    if (dataItem.HZ < MIN_HZ_INTERVAL) return false

    if (!MaxHZ && oldTimeObj[dataItem.type]) {
      MaxHZ = Math.floor(1000 / dataItem.HZ)
      HZ = MaxHZ
      console.log(`[Serial] 检测到帧率: ${HZ} Hz`)
      if (playtimer) clearInterval(playtimer)
      playtimer = setInterval(() => colAndSendData(), DATA_SEND_INTERVAL)
    }
  }
  oldTimeObj[dataItem.type] = stamp
  return true
}

/**
 * 管理 arrList 缓冲区（用于算法计算）
 */
function updateArrList(dataItem, data, maxLength = 3) {
  if (!dataItem.arrList) {
    dataItem.arrList = []
  } else {
    if (dataItem.arrList.length < maxLength) {
      dataItem.arrList.push(data)
    } else {
      dataItem.arrList.shift()
      dataItem.arrList.push(data)
    }
  }
}

/**
 * 连接所有可用串口并设置数据回调
 */
async function connectPort() {
  macInfo = {}
  let ports = await SerialPort.list()
  ports = getPort(ports)

  for (let i = 0; i < ports.length; i++) {
    const portInfo = ports[i]
    const { path } = portInfo

    const parserItem = parserArr[path] = parserArr[path] || {}
    const dataItem = dataMap[path] = dataMap[path] || {}

    parserItem.parser = new DelimiterParser({ delimiter: splitBuffer })

    if (parserItem.port && parserItem.port.isOpen) continue

    const port = newSerialPortLink({ path, parser: parserItem.parser, baudRate })
    if (!port) continue

    // 发送 MAC 查询指令
    const command = Buffer.from('41542B4E414D453D45535033320d0a', 'hex')
    port.write(command, (err) => {
      if (err) console.error('[Serial] MAC 指令发送失败:', err.message)
    })

    parserItem.port = port

    parserItem.parser.on('data', async (data) => {
      const buffer = Buffer.from(data)
      const pointArr = Array.from(buffer)

      // ── MAC 地址响应 ──
      if (buffer.toString().includes('Unique ID')) {
        handleMacResponse(buffer, path, dataItem, ports)
        return
      }

      // ── 陀螺仪数据 (18 bytes) ──
      if (pointArr.length === 18) {
        dataItem.rotate = bytes4ToInt10(pointArr.slice(2))
        return
      }

      // ── 256 矩阵分包 (130 bytes) ──
      if (pointArr.length === 130) {
        const order = pointArr[0]
        const type = pointArr[1]
        const arr = pointArr.slice(2)
        dataItem[constantObj.order[order]] = arr
        dataItem.type = constantObj.type[type]
        dataItem.stamp = Date.now()
        return
      }

      // ── 1024 矩阵 ──
      if (pointArr.length === 1024) {
        if (!dataItem.premission) return
        dataItem.arr = processMatrixData(pointArr, dataItem)

        const stamp = Date.now()
        dataItem.stamp = stamp
        if (!updateHZAndStartTimer(dataItem, stamp)) return

        if (file === 'foot') {
          updateArrList(dataItem, dataItem.arr, 60)
        }
        return
      }

      // ── 1025 矩阵（带类型前缀）──
      if (pointArr.length === 1025) {
        const typeCode = pointArr[0]
        const matrixData = pointArr.slice(1)
        dataItem.premission = true

        if (!Object.keys(constantObj.typeConfig).includes(String(typeCode))) {
          dataItem.premission = false
          return
        }

        dataItem.type = constantObj.typeConfig[typeCode]
        dataItem.arr = processTypedMatrixData(matrixData, dataItem)

        const stamp = Date.now()
        dataItem.stamp = stamp
        if (!updateHZAndStartTimer(dataItem, stamp)) return
        return
      }

      // ── 146 bytes (含四元数) ──
      if (pointArr.length === 146) {
        const rotateData = pointArr.slice(pointArr.length - 16)
        const nextData = pointArr.slice(2, pointArr.length - 16)
        dataItem.next = nextData
        dataItem.stamp = Date.now()
        dataItem.rotate = bytes4ToInt10(rotateData)
        return
      }

      // ── 4096 矩阵 ──
      if (pointArr.length === 4096) {
        if (!dataItem.premission) {
          dataItem.status = 'expired'
          return
        }

        if (dataItem.type === 'endi-sit') {
          dataItem.arr = endiSit(pointArr)
        } else if (dataItem.type === 'endi-back') {
          dataItem.arr = endiBack(pointArr)
        } else {
          dataItem.arr = pointArr
        }

        const stamp = Date.now()
        if (sendDataLength < 20) sendDataLength++

        if (oldTimeObj[dataItem.type]) {
          dataItem.HZ = stamp - oldTimeObj[dataItem.type]
          if (!MaxHZ && sendDataLength === 20) {
            MaxHZ = Math.floor(1000 / dataItem.HZ)
            HZ = MaxHZ
            playtimer = setInterval(() => colAndSendData(), 1000 / HZ)
            sendDataLength = 0
          }
        }
        dataItem.stamp = stamp
        oldTimeObj[dataItem.type] = stamp
        updateArrList(dataItem, pointArr)
        return
      }

      // ── 4097 矩阵（带类型前缀）──
      if (pointArr.length === 4097) {
        const typeCode = pointArr[0]
        const matrixData = pointArr.slice(1)
        dataItem.premission = true

        if (!Object.keys(constantObj.typeConfig).includes(String(typeCode))) {
          dataItem.premission = false
          return
        }

        dataItem.type = constantObj.typeConfig[typeCode]

        if (dataItem.type === 'endi-sit') {
          dataItem.arr = endiSit(matrixData)
        } else if (dataItem.type === 'endi-back') {
          dataItem.arr = endiBack(matrixData)
        } else {
          dataItem.arr = matrixData
        }

        const stamp = Date.now()
        if (oldTimeObj[dataItem.type]) {
          dataItem.HZ = stamp - oldTimeObj[dataItem.type]
          if (!MaxHZ) {
            MaxHZ = Math.floor(1000 / dataItem.HZ)
            HZ = MaxHZ
            playtimer = setInterval(() => colAndSendData(), 1000 / HZ)
          }
        }
        dataItem.stamp = stamp
        oldTimeObj[dataItem.type] = stamp
        updateArrList(dataItem, matrixData)
        return
      }
    })
  }

  return ports
}

/**
 * 处理 MAC 地址响应
 */
async function handleMacResponse(buffer, portPath, dataItem, ports) {
  const str = buffer.toString()
  const uniqueIdMatch = str.match(/Unique ID:\s*([^\s-]+)/)
  const versionMatch = str.match(/Versions:\s*([^\s-]+)/)
  const uniqueId = uniqueIdMatch ? uniqueIdMatch[1] : null
  const version = versionMatch ? versionMatch[1] : null

  console.log(`[Serial] 设备识别 - UniqueID: ${uniqueId}, Version: ${version}`)

  macInfo[portPath] = { uniqueId, version }

  if (Object.keys(macInfo).length === ports.length) {
    socketSendData(wsServer, JSON.stringify({ macInfo }))
  }

  try {
    const response = await axios.get(`${constantObj.backendAddress}/device-manage/device/getDetail/${uniqueId}`)
    const time = await axios.get('http://sensor.bodyta.com:8080/rcv/login/getSystemTime')

    if (!response.data.data) {
      dataItem.premission = false
    } else {
      const expireTime = response.data.data.expireTime
      const nowTime = time.data.time
      dataItem.premission = nowTime < expireTime
      dataItem.type = JSON.parse(response.data.data.typeInfo)[0]
    }
  } catch (err) {
    console.error('[Serial] 设备授权查询失败:', err.message)
  }
}

/**
 * 关闭所有已连接的串口
 */
async function stopPort() {
  Object.keys(parserArr).forEach((portPath) => {
    const item = parserArr[portPath]
    if (item?.port?.isOpen) {
      item.port.close((err) => {
        if (!err) {
          delete parserArr[portPath]
          delete dataMap[portPath]
          console.log(`[Serial] 串口已关闭: ${portPath}`)
        }
      })
    }
  })

  if (playtimer) clearInterval(playtimer)
  MaxHZ = undefined
}

/**
 * 清除回放定时器
 */
function clearPlayTimer() {
  if (colTimer) {
    clearInterval(colTimer)
    colTimer = null
  }
}

/**
 * 采集数据并发送到前端
 */
function colAndSendData() {
  if (historyFlag || !Object.keys(parserArr).length) return

  const obj = sendData()
  if (colFlag) {
    storageData(obj)
  }
}

/**
 * 发送实时数据给前端
 */
function sendData() {
  let obj
  if (baudRate === 921600) {
    obj = parseData(parserArr, JSON.parse(JSON.stringify({ ...dataMap })))

    // 过滤无效类型
    Object.keys(obj).forEach((key) => {
      if (!Object.values(constantObj.type).includes(key)) {
        delete obj[key]
      }
    })

    if (Object.keys(obj).some((a) => Object.values(constantObj.type).includes(a))) {
      socketSendData(wsServer, JSON.stringify({ data: obj }))
    }
  } else {
    obj = parseData(parserArr, JSON.parse(JSON.stringify({ ...dataMap })), 'highHZ')
    socketSendData(wsServer, JSON.stringify({ sitData: obj }))
  }
  return obj
}

/**
 * 将采集数据存入数据库
 */
function storageData(data) {
  const timestamp = Date.now()
  const newData = { ...data }

  Object.keys(newData).forEach((key) => {
    if (newData[key].status) delete newData[key].status
  })

  const insertQuery = 'INSERT INTO matrix (data, timestamp, date, `select`) VALUES (?, ?, ?, ?)'
  currentDb.run(
    insertQuery,
    [JSON.stringify(newData), timestamp, colName, JSON.stringify(selectArr)],
    function (err) {
      if (err) {
        console.error('[DB] 数据插入失败:', err)
      }
    }
  )
}

// ═══════════════════════════════════════════════════════════
//  启动服务
// ═══════════════════════════════════════════════════════════

app.listen(API_PORT, () => {
  process.send?.({ type: 'ready', port: API_PORT })
  console.log(`[Server] API 服务已启动，端口: ${API_PORT}`)
})

// ─── 串口断线重连监控 ─────────────────────────────────────
setInterval(() => {
  if (!Object.keys(parserArr).length) return

  Object.keys(parserArr).forEach((portPath) => {
    const item = parserArr[portPath]
    if (item && !item.port.isOpen) {
      console.log(`[Serial] 检测到串口断开，尝试重连: ${portPath}`)
      try {
        item.port = new SerialPort({
          path: portPath,
          baudRate,
          autoOpen: true,
        }, (err) => {
          if (err) console.error(`[Serial] 重连失败 ${portPath}:`, err.message)
        })
        item.port.pipe(item.parser)
      } catch (err) {
        console.error(`[Serial] 重连异常 ${portPath}:`, err.message)
      }
    }
  })
}, RECONNECT_INTERVAL)
