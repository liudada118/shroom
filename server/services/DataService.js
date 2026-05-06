/**
 * 数据服务模块
 * 负责实时数据发送、数据采集存储、历史回放等业务逻辑
 */
const WebSocket = require('ws')
const constantObj = require('../../util/config')
const { state, resetPlaybackState } = require('../state')
const { broadcast } = require('../websocket')

const { blue } = constantObj
const DEFAULT_PLAYBACK_HZ = 1

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
      broadcast(JSON.stringify({ data: obj }))
    }
  } else {
    obj = parseData(state.parserArr, structuredClone(state.dataMap), 'highHZ')
    broadcast(JSON.stringify({ sitData: obj }))
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
  state.currentDb.run(
    insertQuery,
    [JSON.stringify(newData), timestamp, state.colName, JSON.stringify(state.selectArr)],
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

function getPlaybackSnapshot(index = state.playIndex) {
  const rows = getPlaybackRows()
  const normalizedIndex = normalizePlayIndex(index, rows)

  if (normalizedIndex < 0) {
    return null
  }

  const row = rows[normalizedIndex]
  if (!row) {
    return null
  }

  const sitDataPlay = removePlaybackSelect(parsePlaybackData(row.data))

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
      timestamp: parsePlaybackTimestamp(row.timestamp)
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
  const safeSpeed = Number.isFinite(speedValue) && speedValue > 0 ? speedValue : 1

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
}
