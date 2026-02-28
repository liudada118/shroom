/**
 * 串口管理模块
 * 负责串口连接、数据解析、断线重连
 */
const { SerialPort, DelimiterParser } = require('serialport')
const { getPort } = require('../../util/serialport')
const { bytes4ToInt10 } = require('../../util/parseData')
const constantObj = require('../../util/config')
const { hand, jqbed, endiSit, endiBack, endiSit1024, endiBack1024 } = require('../../util/line')
const { default: axios } = require('axios')
const { state } = require('../state')

const RECONNECT_INTERVAL = 3000
const MIN_HZ_INTERVAL = 50
const ONLINE_THRESHOLD = 1000
const DATA_SEND_INTERVAL = 80

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
 * @param {Function} onTimerStart - 定时器启动时的回调 (用于触发 colAndSendData)
 */
function updateHZAndStartTimer(dataItem, stamp, onTimerStart) {
  if (state.oldTimeObj[dataItem.type]) {
    dataItem.HZ = stamp - state.oldTimeObj[dataItem.type]
    if (dataItem.HZ < MIN_HZ_INTERVAL) return false

    if (!state.MaxHZ && state.oldTimeObj[dataItem.type]) {
      state.MaxHZ = Math.floor(1000 / dataItem.HZ)
      state.HZ = state.MaxHZ
      console.log(`[Serial] 检测到帧率: ${state.HZ} Hz`)
      if (state.playtimer) clearInterval(state.playtimer)
      state.playtimer = setInterval(onTimerStart, DATA_SEND_INTERVAL)
    }
  }
  state.oldTimeObj[dataItem.type] = stamp
  return true
}

/**
 * 管理 arrList 缓冲区
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
 * 处理 MAC 地址响应
 */
async function handleMacResponse(buffer, portPath, dataItem, ports, broadcastFn) {
  const str = buffer.toString()
  const uniqueIdMatch = str.match(/Unique ID:\s*([^\s-]+)/)
  const versionMatch = str.match(/Versions:\s*([^\s-]+)/)
  const uniqueId = uniqueIdMatch ? uniqueIdMatch[1] : null
  const version = versionMatch ? versionMatch[1] : null

  console.log(`[Serial] 设备识别 - UniqueID: ${uniqueId}, Version: ${version}`)

  state.macInfo[portPath] = { uniqueId, version }

  if (Object.keys(state.macInfo).length === ports.length) {
    broadcastFn(JSON.stringify({ macInfo: state.macInfo }))
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
 * 连接所有可用串口并设置数据回调
 * @param {Function} broadcastFn - 广播函数
 * @param {Function} onTimerStart - 定时器启动回调
 */
async function connectPort(broadcastFn, onTimerStart) {
  state.macInfo = {}
  let ports = await SerialPort.list()
  ports = getPort(ports)

  const { splitArr } = constantObj
  const splitBuffer = Buffer.from(splitArr)

  for (let i = 0; i < ports.length; i++) {
    const portInfo = ports[i]
    const { path } = portInfo

    const parserItem = state.parserArr[path] = state.parserArr[path] || {}
    const dataItem = state.dataMap[path] = state.dataMap[path] || {}

    parserItem.parser = new DelimiterParser({ delimiter: splitBuffer })

    if (parserItem.port && parserItem.port.isOpen) continue

    const port = newSerialPortLink({ path, parser: parserItem.parser, baudRate: state.baudRate })
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
        handleMacResponse(buffer, path, dataItem, ports, broadcastFn)
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
        if (!updateHZAndStartTimer(dataItem, stamp, onTimerStart)) return

        if (state.file === 'foot') {
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
        if (!updateHZAndStartTimer(dataItem, stamp, onTimerStart)) return
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
        if (state.sendDataLength < 20) state.sendDataLength++

        if (state.oldTimeObj[dataItem.type]) {
          dataItem.HZ = stamp - state.oldTimeObj[dataItem.type]
          if (!state.MaxHZ && state.sendDataLength === 20) {
            state.MaxHZ = Math.floor(1000 / dataItem.HZ)
            state.HZ = state.MaxHZ
            state.playtimer = setInterval(onTimerStart, 1000 / state.HZ)
            state.sendDataLength = 0
          }
        }
        dataItem.stamp = stamp
        state.oldTimeObj[dataItem.type] = stamp
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
        if (state.oldTimeObj[dataItem.type]) {
          dataItem.HZ = stamp - state.oldTimeObj[dataItem.type]
          if (!state.MaxHZ) {
            state.MaxHZ = Math.floor(1000 / dataItem.HZ)
            state.HZ = state.MaxHZ
            state.playtimer = setInterval(onTimerStart, 1000 / state.HZ)
          }
        }
        dataItem.stamp = stamp
        state.oldTimeObj[dataItem.type] = stamp
        updateArrList(dataItem, matrixData)
        return
      }
    })
  }

  return ports
}

/**
 * 关闭所有已连接的串口
 */
async function stopPort() {
  Object.keys(state.parserArr).forEach((portPath) => {
    const item = state.parserArr[portPath]
    if (item?.port?.isOpen) {
      item.port.close((err) => {
        if (!err) {
          delete state.parserArr[portPath]
          delete state.dataMap[portPath]
          console.log(`[Serial] 串口已关闭: ${portPath}`)
        }
      })
    }
  })

  if (state.playtimer) clearInterval(state.playtimer)
  state.MaxHZ = undefined
}

/**
 * 启动串口断线重连监控
 */
function startReconnectMonitor() {
  setInterval(() => {
    if (!Object.keys(state.parserArr).length) return

    Object.keys(state.parserArr).forEach((portPath) => {
      const item = state.parserArr[portPath]
      if (item && !item.port.isOpen) {
        console.log(`[Serial] 检测到串口断开，尝试重连: ${portPath}`)
        try {
          item.port = new SerialPort({
            path: portPath,
            baudRate: state.baudRate,
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
}

module.exports = {
  connectPort,
  stopPort,
  portWrite,
  startReconnectMonitor,
  ONLINE_THRESHOLD,
}
