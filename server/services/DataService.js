/**
 * 数据服务模块
 * 负责实时数据发送、数据采集存储、历史回放等业务逻辑
 */
const WebSocket = require('ws')
const constantObj = require('../../util/config')
const { state, resetPlaybackState } = require('../state')
const { broadcast } = require('../websocket')

const { blue } = constantObj

/**
 * 解析串口数据为前端格式
 */
function parseData(parserArr, objs, type) {
  const json = {}
  const ONLINE_THRESHOLD = 1000

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

/**
 * 开始历史数据回放
 */
function startPlayback() {
  if (!state.historyDbArr) return false

  if (state.playIndex >= state.historyDbArr.length - 1) {
    state.playIndex = 0
  }
  state.historyPlayFlag = true

  clearPlayTimer()
  broadcast(JSON.stringify({ playEnd: true }))

  state.colTimer = setInterval(() => {
    if (!state.historyPlayFlag || !state.historyDbArr) return

    broadcast(JSON.stringify({
      sitDataPlay: JSON.parse(state.historyDbArr[state.playIndex].data),
      index: state.playIndex,
      timestamp: JSON.parse(state.historyDbArr[state.playIndex].timestamp)
    }))

    if (state.playIndex < state.historyDbArr.length - 1) {
      state.playIndex++
    } else {
      state.historyPlayFlag = false
      broadcast(JSON.stringify({ playEnd: false }))
      clearPlayTimer()
    }
  }, 1000 / state.colplayHZ)

  return true
}

/**
 * 修改播放速度
 */
function changePlaySpeed(speed) {
  state.colplayHZ = state.colMaxHZ * speed

  if (state.historyPlayFlag) {
    clearPlayTimer()
    state.colTimer = setInterval(() => {
      if (!state.historyPlayFlag) return

      broadcast(JSON.stringify({
        sitDataPlay: JSON.parse(state.historyDbArr[state.playIndex].data),
        index: state.playIndex,
        timestamp: JSON.parse(state.historyDbArr[state.playIndex].timestamp)
      }))

      if (state.playIndex < state.historyDbArr.length - 1) {
        state.playIndex++
      } else {
        broadcast(JSON.stringify({ playEnd: false }))
        state.historyPlayFlag = false
        clearPlayTimer()
      }
    }, 1000 / state.colplayHZ)
  }
}

module.exports = {
  colAndSendData,
  sendData,
  storageData,
  clearPlayTimer,
  startPlayback,
  changePlaySpeed,
  parseData,
}
