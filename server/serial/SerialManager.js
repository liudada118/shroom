/**
 * 串口管理模块
 *
 * 职责：
 *   1. 枚举串口 → 筛选 CH340
 *   2. 波特率自动探测 → 确定设备大类（手套/坐垫/脚垫）
 *   3. 设备类型细分：手套通过帧类型位，脚垫通过 AT 指令获取 MAC
 *   4. 设备授权：联网模式查远程服务器，本地模式查 serial_cache.json
 *   5. 数据帧解析与实时推送
 *   6. 断线自动重连
 */
const { SerialPort, DelimiterParser } = require('serialport')
const { getPort } = require('../../util/serialport')
const { bytes4ToInt10 } = require('../../util/parseData')
const constantObj = require('../../util/config')
const { hand, jqbed, endiSit, endiBack, endiSit1024, endiBack1024 } = require('../../util/line')
const { default: axios } = require('axios')
const { state } = require('../state')
const { getTypeFromCache, setTypeToCache } = require('../../util/serialCache')

// ═══════════════════════════════════════════════════════════
//  常量
// ═══════════════════════════════════════════════════════════

const RECONNECT_INTERVAL = 3000
const MIN_HZ_INTERVAL = 50
const ONLINE_THRESHOLD = 1000
const DATA_SEND_INTERVAL = 80

// ═══════════════════════════════════════════════════════════
//  阶段一：串口枚举与筛选（由 getPort 完成）
// ═══════════════════════════════════════════════════════════

// getPort() 已在 util/serialport.js 中实现

// ═══════════════════════════════════════════════════════════
//  阶段二：波特率自动探测
// ═══════════════════════════════════════════════════════════

/**
 * 探测单个串口的波特率
 *
 * 依次尝试 BAUD_CANDIDATES 中的每个波特率，
 * 在 BAUD_DETECT_TIMEOUT 内监听是否收到包含分隔符 AA 55 03 99 的数据。
 *
 * @param {string} portPath 串口路径
 * @returns {Promise<number|null>} 匹配的波特率，或 null 表示全部失败
 */
async function detectBaudRate(portPath) {
  const { BAUD_CANDIDATES, BAUD_DETECT_TIMEOUT, splitArr } = constantObj
  const splitBuffer = Buffer.from(splitArr)

  for (const baud of BAUD_CANDIDATES) {
    try {
      const result = await tryBaudRate(portPath, baud, splitBuffer, BAUD_DETECT_TIMEOUT)
      if (result) {
        console.log(`[BaudDetect] ${portPath} → 波特率 ${baud} 匹配成功`)
        return baud
      }
    } catch (err) {
      console.warn(`[BaudDetect] ${portPath} @ ${baud} 探测异常:`, err.message)
    }
  }

  console.warn(`[BaudDetect] ${portPath} → 所有候选波特率均未匹配`)
  return null
}

/**
 * 尝试以指定波特率打开串口，监听是否收到有效数据
 *
 * @param {string} portPath 串口路径
 * @param {number} baudRate 波特率
 * @param {Buffer} delimiter 分隔符
 * @param {number} timeout 超时时间 (ms)
 * @returns {Promise<boolean>} 是否匹配
 */
function tryBaudRate(portPath, baudRate, delimiter, timeout) {
  return new Promise((resolve) => {
    let port = null
    let timer = null
    let resolved = false

    function cleanup() {
      if (resolved) return
      resolved = true
      if (timer) clearTimeout(timer)
      if (port && port.isOpen) {
        port.close(() => {})
      }
    }

    try {
      port = new SerialPort({ path: portPath, baudRate, autoOpen: true }, (err) => {
        if (err) {
          cleanup()
          resolve(false)
          return
        }
      })

      // 监听原始数据，检查是否包含分隔符
      const onData = (data) => {
        const buf = Buffer.from(data)
        if (bufferContains(buf, delimiter)) {
          port.removeListener('data', onData)
          cleanup()
          resolve(true)
        }
      }

      port.on('data', onData)

      port.on('error', () => {
        cleanup()
        resolve(false)
      })

      // 超时
      timer = setTimeout(() => {
        port.removeListener('data', onData)
        cleanup()
        resolve(false)
      }, timeout)
    } catch (err) {
      cleanup()
      resolve(false)
    }
  })
}

/**
 * 检查 buffer 中是否包含指定子序列
 */
function bufferContains(buf, sub) {
  for (let i = 0; i <= buf.length - sub.length; i++) {
    let match = true
    for (let j = 0; j < sub.length; j++) {
      if (buf[i + j] !== sub[j]) {
        match = false
        break
      }
    }
    if (match) return true
  }
  return false
}

// ═══════════════════════════════════════════════════════════
//  阶段三：MAC 地址获取与设备类型分配
// ═══════════════════════════════════════════════════════════

/**
 * 向串口持续发送 AT 指令获取 MAC 地址
 *
 * 脚垫设备可能不会立即响应，因此每 MAC_SEND_INTERVAL 毫秒发送一次，
 * 直到收到包含 Unique ID 的回复或超时。
 *
 * @param {SerialPort} port 串口实例
 * @param {DelimiterParser} parser 解析器
 * @returns {Promise<{uniqueId: string|null, version: string|null}>}
 */
function sendMacCommand(port, parser) {
  const { AT_MAC_COMMAND, MAC_SEND_INTERVAL, MAC_WAIT_TIMEOUT } = constantObj

  return new Promise((resolve) => {
    let timer = null
    let interval = null
    let resolved = false

    function cleanup() {
      if (resolved) return
      resolved = true
      if (timer) clearTimeout(timer)
      if (interval) clearInterval(interval)
    }

    // 监听解析器数据，查找 Unique ID 响应
    const onData = (data) => {
      const str = Buffer.from(data).toString()
      if (str.includes('Unique ID')) {
        parser.removeListener('data', onData)
        cleanup()

        const uniqueIdMatch = str.match(/Unique ID:\s*([^\s\-]+)/)
        const versionMatch = str.match(/Versions?:\s*([^\s\-]+)/)
        resolve({
          uniqueId: uniqueIdMatch ? uniqueIdMatch[1] : null,
          version: versionMatch ? versionMatch[1] : null,
        })
      }
    }

    parser.on('data', onData)

    // 持续发送 AT 指令
    const sendOnce = () => {
      if (port.isOpen && !resolved) {
        port.write(AT_MAC_COMMAND, (err) => {
          if (err) console.warn('[Serial] AT 指令发送失败:', err.message)
        })
      }
    }

    sendOnce()
    interval = setInterval(sendOnce, MAC_SEND_INTERVAL)

    // 超时
    timer = setTimeout(() => {
      parser.removeListener('data', onData)
      cleanup()
      resolve({ uniqueId: null, version: null })
    }, MAC_WAIT_TIMEOUT)
  })
}

/**
 * 根据 MAC 地址解析设备类型（联网查询）
 *
 * 向远程服务器查询设备详情和授权状态
 *
 * @param {string} uniqueId 设备唯一标识
 * @returns {Promise<{type: string|null, premission: boolean}>}
 */
async function resolveDeviceTypeOnline(uniqueId) {
  try {
    const [response, time] = await Promise.all([
      axios.get(`${constantObj.backendAddress}/device-manage/device/getDetail/${uniqueId}`, { timeout: 5000 }),
      axios.get(`${constantObj.timeServerAddress}/rcv/login/getSystemTime`, { timeout: 5000 }),
    ])

    if (!response.data.data) {
      console.warn(`[Auth-Online] 设备 ${uniqueId} 未注册`)
      return { type: null, premission: false }
    }

    const expireTime = response.data.data.expireTime
    const nowTime = time.data.time
    const deviceType = JSON.parse(response.data.data.typeInfo)[0]
    const premission = nowTime < expireTime

    console.log(`[Auth-Online] 设备 ${uniqueId} → 类型: ${deviceType}, 授权: ${premission}`)

    // 联网查询成功后同步写入本地缓存，方便下次离线使用
    if (deviceType) {
      setTypeToCache(uniqueId, deviceType, 'foot', '')
    }

    return { type: deviceType, premission }
  } catch (err) {
    console.error(`[Auth-Online] 设备 ${uniqueId} 联网查询失败:`, err.message)
    return { type: null, premission: false }
  }
}

/**
 * 根据 MAC 地址解析设备类型（本地缓存查询）
 *
 * 从 serial_cache.json 中查询
 *
 * @param {string} uniqueId 设备唯一标识
 * @returns {{type: string|null, premission: boolean}}
 */
function resolveDeviceTypeLocal(uniqueId) {
  const cached = getTypeFromCache(uniqueId)
  if (cached) {
    console.log(`[Auth-Local] 设备 ${uniqueId} → 类型: ${cached.type}（缓存命中）`)
    return { type: cached.type, premission: true }
  }
  console.warn(`[Auth-Local] 设备 ${uniqueId} 未在本地缓存中找到`)
  return { type: null, premission: false }
}

/**
 * 统一的设备类型解析入口
 *
 * 策略：先查本地缓存 → 缓存未命中再联网查询（自动降级）
 * AUTH_MODE 仅控制是否允许联网：
 *   'online' — 本地缓存优先，未命中时联网查询
 *   'local'  — 仅查本地缓存，不联网
 */
async function resolveDeviceType(uniqueId) {
  // 第一步：始终先查本地缓存
  const localResult = resolveDeviceTypeLocal(uniqueId)
  if (localResult.type) {
    return localResult
  }

  // 第二步：本地缓存未命中，根据 AUTH_MODE 决定是否联网
  if (constantObj.AUTH_MODE === 'online') {
    console.log(`[Auth] 本地缓存未命中，联网查询 ${uniqueId}...`)
    return resolveDeviceTypeOnline(uniqueId)
  }

  // 本地模式且缓存未命中
  console.warn(`[Auth] 本地模式下 ${uniqueId} 未在缓存中找到，请手动添加到设备管理`)
  return { type: null, premission: false }
}

// ═══════════════════════════════════════════════════════════
//  数据帧处理辅助函数
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
 * 向串口发送 AT 写入指令
 */
function portWrite(port) {
  return new Promise((resolve, reject) => {
    port.write(constantObj.AT_MAC_COMMAND, (err) => {
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
 * 根据数据包长度和类型处理矩阵数据（1024 字节）
 */
function processMatrixData(pointArr, dataItem) {
  const t = dataItem.type
  if (t === 'hand') return hand(pointArr)
  if (t === 'bed' || t === 'car-back') return jqbed(pointArr)
  if (t === 'endi-sit') return endiSit1024(pointArr)
  if (t === 'endi-back') return endiBack1024(pointArr)
  return pointArr
}

/**
 * 处理带类型前缀的 1025 长度数据包
 */
function processTypedMatrixData(pointArr, dataItem) {
  const t = dataItem.type
  if (t === 'car-back' || t === 'car-sit' || t === 'bed') return jqbed(pointArr)
  return pointArr
}

/**
 * 更新帧率并启动数据发送定时器
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

// ═══════════════════════════════════════════════════════════
//  数据帧回调绑定
// ═══════════════════════════════════════════════════════════

/**
 * 为已连接的串口绑定数据帧解析回调
 *
 * @param {string} portPath 串口路径
 * @param {Object} parserItem { port, parser }
 * @param {Object} dataItem 数据缓存对象
 * @param {Function} broadcastFn WebSocket 广播函数
 * @param {Function} onTimerStart 定时器启动回调
 * @param {Array} allPorts 所有串口列表（用于判断 MAC 收集完成）
 */
function bindDataHandler(portPath, parserItem, dataItem, broadcastFn, onTimerStart, allPorts) {
  parserItem.parser.on('data', async (data) => {
    const buffer = Buffer.from(data)
    const pointArr = Array.from(buffer)

    // ── MAC 地址响应（仅在初始化阶段，后续由 sendMacCommand 处理）──
    if (buffer.toString().includes('Unique ID')) {
      const str = buffer.toString()
      const uniqueIdMatch = str.match(/Unique ID:\s*([^\s\-]+)/)
      const versionMatch = str.match(/Versions?:\s*([^\s\-]+)/)
      const uniqueId = uniqueIdMatch ? uniqueIdMatch[1] : null
      const version = versionMatch ? versionMatch[1] : null

      console.log(`[Serial] 设备识别 - UniqueID: ${uniqueId}, Version: ${version}`)
      state.macInfo[portPath] = { uniqueId, version }

      // 所有串口的 MAC 都收集完毕后广播
      if (Object.keys(state.macInfo).length === allPorts.length) {
        broadcastFn(JSON.stringify({ macInfo: state.macInfo }))
      }

      // 解析设备类型（联网或本地）
      if (uniqueId && dataItem.deviceClass === 'foot') {
        const { type: deviceType, premission } = await resolveDeviceType(uniqueId)
        if (deviceType) {
          dataItem.type = deviceType
          dataItem.premission = premission
          console.log(`[Serial] ${portPath} 最终类型: ${deviceType}, 授权: ${premission}`)
          broadcastFn(JSON.stringify({ deviceUpdate: { path: portPath, type: deviceType, premission } }))
        }
      }
      return
    }

    // ── 陀螺仪数据 (18 bytes) ──
    if (pointArr.length === 18) {
      dataItem.rotate = bytes4ToInt10(pointArr.slice(2))
      return
    }

    // ── 手套 256 矩阵分包 (130 bytes) ──
    if (pointArr.length === 130) {
      const orderByte = pointArr[0]
      const typeByte = pointArr[1]
      const arr = pointArr.slice(2)
      dataItem[constantObj.order[orderByte]] = arr
      // 手套帧类型位细分 HL/HR
      dataItem.type = constantObj.handTypeMap[typeByte] || constantObj.type[typeByte]
      dataItem.stamp = Date.now()
      return
    }

    // ── 坐垫 1024 矩阵 ──
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

    // ── 手套 146 bytes (含四元数) ──
    if (pointArr.length === 146) {
      const rotateData = pointArr.slice(pointArr.length - 16)
      const nextData = pointArr.slice(2, pointArr.length - 16)
      dataItem.next = nextData
      dataItem.stamp = Date.now()
      // 手套帧类型位细分 HL/HR
      const typeByte = pointArr[1]
      dataItem.type = constantObj.handTypeMap[typeByte] || dataItem.type
      dataItem.rotate = bytes4ToInt10(rotateData)
      return
    }

    // ── 脚垫 4096 矩阵 ──
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

// ═══════════════════════════════════════════════════════════
//  核心入口：一键连接
// ═══════════════════════════════════════════════════════════

/**
 * 连接所有可用串口（三层识别漏斗）
 *
 * 流程：
 *   1. 枚举串口 → 筛选 CH340
 *   2. 对每个串口探测波特率 → 确定设备大类
 *   3. 根据大类进行细分和授权
 *   4. 绑定数据帧回调
 *
 * @param {Function} broadcastFn WebSocket 广播函数
 * @param {Function} onTimerStart 定时器启动回调（colAndSendData）
 * @returns {Promise<Array>} 已连接的串口信息
 */
async function connectPort(broadcastFn, onTimerStart) {
  state.macInfo = {}
  const { splitArr, BAUD_DEVICE_MAP } = constantObj
  const splitBuffer = Buffer.from(splitArr)

  // ── 阶段一：枚举与筛选 ──
  let ports = await SerialPort.list()
  ports = getPort(ports)
  console.log(`[Connect] 发现 ${ports.length} 个 CH340 串口`)

  if (!ports.length) {
    broadcastFn(JSON.stringify({ connectResult: { success: false, message: '未发现可用串口设备' } }))
    return []
  }

  const connectedPorts = []

  for (let i = 0; i < ports.length; i++) {
    const portInfo = ports[i]
    const { path: portPath } = portInfo

    // 如果已连接且打开，跳过
    if (state.parserArr[portPath]?.port?.isOpen) {
      console.log(`[Connect] ${portPath} 已连接，跳过`)
      connectedPorts.push({ path: portPath, status: 'already_connected' })
      continue
    }

    // ── 阶段二：波特率探测 ──
    console.log(`[Connect] 正在探测 ${portPath} 的波特率...`)
    broadcastFn(JSON.stringify({ connectProgress: { path: portPath, stage: 'detecting_baud' } }))

    const detectedBaud = await detectBaudRate(portPath)
    if (!detectedBaud) {
      console.warn(`[Connect] ${portPath} 波特率探测失败，跳过`)
      connectedPorts.push({ path: portPath, status: 'baud_detect_failed' })
      continue
    }

    const deviceClass = BAUD_DEVICE_MAP[detectedBaud]
    console.log(`[Connect] ${portPath} → 波特率: ${detectedBaud}, 设备大类: ${deviceClass}`)

    // ── 正式连接 ──
    const parserItem = state.parserArr[portPath] = state.parserArr[portPath] || {}
    const dataItem = state.dataMap[portPath] = state.dataMap[portPath] || {}

    parserItem.parser = new DelimiterParser({ delimiter: splitBuffer })
    dataItem.deviceClass = deviceClass
    dataItem.baudRate = detectedBaud

    const port = newSerialPortLink({ path: portPath, parser: parserItem.parser, baudRate: detectedBaud })
    if (!port) {
      console.error(`[Connect] ${portPath} 串口创建失败`)
      connectedPorts.push({ path: portPath, status: 'open_failed' })
      continue
    }
    parserItem.port = port
    parserItem.baudRate = detectedBaud

    // ── 阶段三：细分与授权 ──
    if (deviceClass === 'sit') {
      // 坐垫：波特率已唯一确定，直接授权
      dataItem.type = 'sit'
      dataItem.premission = true
      console.log(`[Connect] ${portPath} → 坐垫，直接授权`)

      // 绑定数据回调
      bindDataHandler(portPath, parserItem, dataItem, broadcastFn, onTimerStart, ports)

    } else if (deviceClass === 'hand') {
      // 手套：先授权，具体 HL/HR 由帧类型位在数据回调中动态确定
      dataItem.type = 'hand'  // 临时类型，后续由 130/146 帧更新为 HL 或 HR
      dataItem.premission = true
      console.log(`[Connect] ${portPath} → 手套，等待帧数据细分 HL/HR`)

      // 绑定数据回调
      bindDataHandler(portPath, parserItem, dataItem, broadcastFn, onTimerStart, ports)

    } else if (deviceClass === 'foot') {
      // 脚垫：需要通过 AT 指令获取 MAC 地址，再查询类型
      console.log(`[Connect] ${portPath} → 脚垫，正在获取 MAC 地址...`)
      broadcastFn(JSON.stringify({ connectProgress: { path: portPath, stage: 'getting_mac' } }))

      // 先绑定数据回调（sendMacCommand 需要监听 parser）
      bindDataHandler(portPath, parserItem, dataItem, broadcastFn, onTimerStart, ports)

      // 发送 AT 指令获取 MAC
      const { uniqueId, version } = await sendMacCommand(port, parserItem.parser)
      state.macInfo[portPath] = { uniqueId, version }

      if (uniqueId) {
        console.log(`[Connect] ${portPath} MAC: ${uniqueId}, Version: ${version}`)

        // 根据模式解析设备类型
        const { type: deviceType, premission } = await resolveDeviceType(uniqueId)
        if (deviceType) {
          dataItem.type = deviceType
          dataItem.premission = premission
          console.log(`[Connect] ${portPath} 最终类型: ${deviceType}, 授权: ${premission}`)
        } else {
          dataItem.type = 'foot'
          dataItem.premission = false
          console.warn(`[Connect] ${portPath} MAC ${uniqueId} 未能映射到具体类型`)
        }
      } else {
        dataItem.type = 'foot'
        dataItem.premission = false
        console.warn(`[Connect] ${portPath} 未能获取 MAC 地址`)
      }
    }

    connectedPorts.push({
      path: portPath,
      status: 'connected',
      baudRate: detectedBaud,
      deviceClass,
      type: dataItem.type,
      premission: dataItem.premission,
    })

    broadcastFn(JSON.stringify({
      connectProgress: {
        path: portPath,
        stage: 'connected',
        baudRate: detectedBaud,
        deviceClass,
        type: dataItem.type,
      }
    }))
  }

  // 广播最终连接结果
  broadcastFn(JSON.stringify({
    connectResult: {
      success: true,
      ports: connectedPorts,
      macInfo: state.macInfo,
      authMode: constantObj.AUTH_MODE,
    }
  }))

  console.log(`[Connect] 一键连接完成，共连接 ${connectedPorts.filter(p => p.status === 'connected').length}/${ports.length} 个设备`)
  return connectedPorts
}

// ═══════════════════════════════════════════════════════════
//  关闭与重连
// ═══════════════════════════════════════════════════════════

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
 *
 * 每 RECONNECT_INTERVAL 毫秒检测一次，
 * 如果串口断开则使用之前探测到的波特率重新连接
 */
function startReconnectMonitor() {
  setInterval(() => {
    if (!Object.keys(state.parserArr).length) return

    Object.keys(state.parserArr).forEach((portPath) => {
      const item = state.parserArr[portPath]
      if (item && !item.port.isOpen) {
        // 使用之前探测到的波特率重连，而不是全局 state.baudRate
        const baudRate = item.baudRate || state.baudRate
        console.log(`[Serial] 检测到串口断开，尝试重连: ${portPath} @ ${baudRate}`)
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
}

// ═══════════════════════════════════════════════════════════
//  导出
// ═══════════════════════════════════════════════════════════

module.exports = {
  connectPort,
  stopPort,
  portWrite,
  startReconnectMonitor,
  detectBaudRate,
  sendMacCommand,
  resolveDeviceType,
  resolveDeviceTypeOnline,
  resolveDeviceTypeLocal,
  ONLINE_THRESHOLD,
}
