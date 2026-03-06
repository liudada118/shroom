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
const { connectPort, portWrite, stopPort } = require('../serial/SerialManager')
const { colAndSendData, clearPlayTimer, startPlayback, changePlaySpeed } = require('../services/DataService')
const { getAllCached, setTypeToCache, removeFromCache, clearCache } = require('../../util/serialCache')

const router = express.Router()

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

  res.json(new HttpResult(0, configResult, '获取设备列表成功'))
}))

router.post('/selectSystem', asyncHandler(async (req, res) => {
  state.file = req.query.file
  const { db } = initDb(state.file, state._dbPath)
  state.currentDb = db
  state.baudRate = constantObj.blue.includes(state.file) ? 921600 : 1000000
  res.json(new HttpResult(0, {}, '切换成功'))
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
  res.json(new HttpResult(0, portsRes, '获取设备列表成功'))
}))

router.get('/connPort', asyncHandler(async (req, res) => {
  const port = await connectPort(broadcast, colAndSendData)
  res.json(new HttpResult(0, port, '连接成功'))
}))

router.get('/sendMac', asyncHandler(async (req, res) => {
  if (!Object.keys(state.parserArr).length) {
    res.json(new HttpResult(0, {}, '请先连接串口'))
    return
  }

  const tasks = Object.keys(state.parserArr).map((key) => portWrite(state.parserArr[key].port))
  await Promise.all(tasks)
  res.json(new HttpResult(0, {}, '发送成功'))
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
    res.json(new HttpResult(0, {}, '开始采集'))
  } else {
    res.json(new HttpResult(0, '请选择正确传感器类型', 'error'))
  }
}))

router.get('/endCol', (req, res) => {
  state.colFlag = false
  res.json(new HttpResult(0, 'success', '停止采集'))
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
    res.json(new HttpResult(1, '请选择回放时间段', 'error'))
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
    res.json(new HttpResult(555, '请选择回放时间段', 'error'))
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
    res.json(new HttpResult(555, '请选择先数据', 'error'))
    return
  }
  const selectOverride = selectJson && typeof selectJson === 'object' ? selectJson : state.historySelectCache
  const data = await dbLoadCsv({ db: state.currentDb, params: fileArr, file: state.file, isPackaged: state._isPackaged, selectJson: selectOverride })
  res.json(new HttpResult(0, data, '下载'))
}))

router.post('/delete', asyncHandler(async (req, res) => {
  const { fileArr } = req.body
  const data = await deleteDbData({ db: state.currentDb, params: fileArr })
  res.json(new HttpResult(0, data, '删除成功'))
}))

router.post('/changeDbName', asyncHandler(async (req, res) => {
  const { newDate, oldDate } = req.body
  const data = await changeDbName({ db: state.currentDb, params: [newDate, oldDate] })
  res.json(new HttpResult(0, data, '修改成功'))
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

// ─── 设备缓存管理 ───────────────────────────────────────────

// 获取所有缓存的设备列表
router.get('/cache/devices', asyncHandler(async (req, res) => {
  const devices = getAllCached()
  res.json(new HttpResult(0, devices, 'success'))
}))

// 添加/更新设备缓存
router.post('/cache/devices', asyncHandler(async (req, res) => {
  const { mac, type, deviceClass, alias } = req.body
  if (!mac || !type) {
    res.json(new HttpResult(1, {}, 'mac 和 type 必填'))
    return
  }
  setTypeToCache(mac, type, deviceClass || 'foot', alias || '')
  res.json(new HttpResult(0, {}, '设备缓存已更新'))
}))

// 删除单个设备缓存
router.delete('/cache/devices', asyncHandler(async (req, res) => {
  const { mac } = req.body
  if (!mac) {
    res.json(new HttpResult(1, {}, 'mac 必填'))
    return
  }
  removeFromCache(mac)
  res.json(new HttpResult(0, {}, '设备缓存已删除'))
}))

// 清空所有设备缓存
router.post('/cache/clear', asyncHandler(async (req, res) => {
  clearCache()
  res.json(new HttpResult(0, {}, '缓存已清空'))
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
    res.json(new HttpResult(1, {}, '模式只能是 online 或 local'))
    return
  }
  constantObj.AUTH_MODE = mode
  console.log(`[Auth] 授权模式已切换为: ${mode}`)
  res.json(new HttpResult(0, { mode }, `已切换为${mode === 'online' ? '联网' : '本地'}模式`))
}))

// ─── 其他 ──────────────────────────────────────────────────

router.post('/bindKey', (req, res) => {
  try {
    const { key } = req.body
    res.json(new HttpResult(0, {}, '绑定成功'))
  } catch {
    res.json(new HttpResult(1, {}, '绑定失败'))
  }
})

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
