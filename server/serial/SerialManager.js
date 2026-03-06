/**
 * Serial Port Manager
 *
 * Responsibilities:
 *   1. Enumerate serial ports -> filter CH340
 *   2. Auto-detect baud rate -> determine device class (hand/sit/foot)
 *   3. Device type refinement: hand via frame type byte, foot via AT command MAC
 *   4. Device auth: online mode queries remote server, local mode queries serial_cache.json
 *   5. Data frame parsing and real-time push
 *   6. Auto-reconnect on disconnect
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
//  Constants
// ═══════════════════════════════════════════════════════════

const RECONNECT_INTERVAL = 3000
const MIN_HZ_INTERVAL = 50
const ONLINE_THRESHOLD = 1000
const DATA_SEND_INTERVAL = 80

// ═══════════════════════════════════════════════════════════
//  Phase 2: Baud Rate Auto-Detection (returns reusable port)
// ═══════════════════════════════════════════════════════════

/**
 * Detect baud rate for a serial port.
 *
 * Tries each candidate baud rate in order. On success, returns
 * the matched baud rate AND the already-open SerialPort instance
 * so the caller can reuse it without re-opening.
 *
 * @param {string} portPath Serial port path
 * @returns {Promise<{baud: number, port: SerialPort}|null>}
 */
async function detectBaudRate(portPath) {
  const { BAUD_CANDIDATES, BAUD_DETECT_TIMEOUT, splitArr } = constantObj
  const splitBuffer = Buffer.from(splitArr)

  for (const baud of BAUD_CANDIDATES) {
    try {
      const result = await tryBaudRate(portPath, baud, splitBuffer, BAUD_DETECT_TIMEOUT)
      if (result) {
        console.log(`[BaudDetect] ${portPath} -> baud ${baud} matched`)
        return result  // { baud, port } — port is already open
      }
    } catch (err) {
      console.warn(`[BaudDetect] ${portPath} @ ${baud} detect error:`, err.message)
    }
  }

  console.warn(`[BaudDetect] ${portPath} -> all candidate baud rates failed`)
  return null
}

/**
 * Try opening a serial port at the given baud rate and listen for the delimiter.
 *
 * Uses an accumulation buffer for cross-packet delimiter matching.
 * On SUCCESS: returns { baud, port } with the port still OPEN for reuse.
 * On FAILURE: closes the port and returns null.
 *
 * @param {string} portPath Serial port path
 * @param {number} baudRate Baud rate to try
 * @param {Buffer} delimiter Delimiter bytes
 * @param {number} timeout Timeout in ms
 * @returns {Promise<{baud: number, port: SerialPort}|null>}
 */
function tryBaudRate(portPath, baudRate, delimiter, timeout) {
  return new Promise((resolve) => {
    let port = null
    let timer = null
    let resolved = false
    let accumBuf = Buffer.alloc(0)

    function finish(success) {
      if (resolved) return
      resolved = true
      if (timer) clearTimeout(timer)
      if (success) {
        // Keep port OPEN — caller will reuse it
        port.removeAllListeners('data')
        port.removeAllListeners('error')
        resolve({ baud: baudRate, port })
      } else {
        // Close port on failure
        if (port && port.isOpen) {
          port.removeAllListeners('data')
          port.removeAllListeners('error')
          port.close(() => {})
        }
        resolve(null)
      }
    }

    try {
      port = new SerialPort({
        path: portPath,
        baudRate,
        autoOpen: false,  // manual open for better control
      })

      port.on('error', (err) => {
        console.log(`[BaudDetect] ${portPath} @ ${baudRate} error: ${err.message}`)
        finish(false)
      })

      port.open((err) => {
        if (err) {
          console.log(`[BaudDetect] ${portPath} @ ${baudRate} open failed: ${err.message}`)
          finish(false)
          return
        }

        console.log(`[BaudDetect] ${portPath} @ ${baudRate} opened, waiting for data...`)

        // Listen for raw data, accumulate and check for delimiter
        const onData = (data) => {
          accumBuf = Buffer.concat([accumBuf, Buffer.from(data)])
          // Cap buffer at 64KB to prevent memory issues
          if (accumBuf.length > 65536) {
            accumBuf = accumBuf.slice(accumBuf.length - 65536)
          }
          if (bufferContains(accumBuf, delimiter)) {
            console.log(`[BaudDetect] ${portPath} @ ${baudRate} delimiter FOUND (${accumBuf.length} bytes)`)
            port.removeListener('data', onData)
            finish(true)
          }
        }

        port.on('data', onData)

        // Timeout
        timer = setTimeout(() => {
          console.log(`[BaudDetect] ${portPath} @ ${baudRate} timeout (${accumBuf.length} bytes, no delimiter)`)
          port.removeListener('data', onData)
          finish(false)
        }, timeout)
      })
    } catch (err) {
      console.log(`[BaudDetect] ${portPath} @ ${baudRate} exception: ${err.message}`)
      finish(false)
    }
  })
}

/**
 * Check if buffer contains the given subsequence
 */
function bufferContains(buf, sub) {
  if (buf.length < sub.length) return false
  const idx = buf.indexOf(sub)
  return idx !== -1
}

// ═══════════════════════════════════════════════════════════
//  Phase 3: MAC Address & Device Type Assignment
// ═══════════════════════════════════════════════════════════

/**
 * Send AT command repeatedly to get MAC address from foot pad device.
 *
 * @param {SerialPort} port Serial port instance
 * @param {DelimiterParser} parser Parser instance
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

    const sendOnce = () => {
      if (port.isOpen && !resolved) {
        port.write(AT_MAC_COMMAND, (err) => {
          if (err) console.warn('[Serial] AT command send failed:', err.message)
        })
      }
    }

    sendOnce()
    interval = setInterval(sendOnce, MAC_SEND_INTERVAL)

    timer = setTimeout(() => {
      parser.removeListener('data', onData)
      cleanup()
      resolve({ uniqueId: null, version: null })
    }, MAC_WAIT_TIMEOUT)
  })
}

/**
 * Resolve device type via online server query
 */
async function resolveDeviceTypeOnline(uniqueId) {
  try {
    const [response, time] = await Promise.all([
      axios.get(`${constantObj.backendAddress}/device-manage/device/getDetail/${uniqueId}`, { timeout: 5000 }),
      axios.get(`${constantObj.timeServerAddress}/rcv/login/getSystemTime`, { timeout: 5000 }),
    ])

    if (!response.data.data) {
      console.warn(`[Auth-Online] Device ${uniqueId} not registered`)
      return { type: null, premission: false }
    }

    const expireTime = response.data.data.expireTime
    const nowTime = time.data.time
    const deviceType = JSON.parse(response.data.data.typeInfo)[0]
    const premission = nowTime < expireTime

    console.log(`[Auth-Online] Device ${uniqueId} -> type: ${deviceType}, auth: ${premission}`)

    if (deviceType) {
      setTypeToCache(uniqueId, deviceType, 'foot', '')
    }

    return { type: deviceType, premission }
  } catch (err) {
    console.error(`[Auth-Online] Device ${uniqueId} query failed:`, err.message)
    return { type: null, premission: false }
  }
}

/**
 * Resolve device type via local cache
 */
function resolveDeviceTypeLocal(uniqueId) {
  const cached = getTypeFromCache(uniqueId)
  if (cached) {
    console.log(`[Auth-Local] Device ${uniqueId} -> type: ${cached.type} (cache hit)`)
    return { type: cached.type, premission: true }
  }
  console.warn(`[Auth-Local] Device ${uniqueId} not found in local cache`)
  return { type: null, premission: false }
}

/**
 * Unified device type resolution entry point.
 *
 * Strategy: local cache first -> online fallback (if AUTH_MODE = 'online')
 */
async function resolveDeviceType(uniqueId) {
  const localResult = resolveDeviceTypeLocal(uniqueId)
  if (localResult.type) {
    return localResult
  }

  if (constantObj.AUTH_MODE === 'online') {
    console.log(`[Auth] Local cache miss, querying online for ${uniqueId}...`)
    return resolveDeviceTypeOnline(uniqueId)
  }

  console.warn(`[Auth] In local mode, ${uniqueId} not found in cache, please add manually`)
  return { type: null, premission: false }
}

// ═══════════════════════════════════════════════════════════
//  Data Frame Processing Helpers
// ═══════════════════════════════════════════════════════════

function processMatrixData(pointArr, dataItem) {
  const t = dataItem.type
  if (t === 'hand') return hand(pointArr)
  if (t === 'bed' || t === 'car-back') return jqbed(pointArr)
  if (t === 'endi-sit') return endiSit1024(pointArr)
  if (t === 'endi-back') return endiBack1024(pointArr)
  return pointArr
}

function processTypedMatrixData(pointArr, dataItem) {
  const t = dataItem.type
  if (t === 'car-back' || t === 'car-sit' || t === 'bed') return jqbed(pointArr)
  return pointArr
}

function updateHZAndStartTimer(dataItem, stamp, onTimerStart) {
  if (state.oldTimeObj[dataItem.type]) {
    dataItem.HZ = stamp - state.oldTimeObj[dataItem.type]
    if (dataItem.HZ < MIN_HZ_INTERVAL) return false

    if (!state.MaxHZ && state.oldTimeObj[dataItem.type]) {
      state.MaxHZ = Math.floor(1000 / dataItem.HZ)
      state.HZ = state.MaxHZ
      console.log(`[Serial] Frame rate detected: ${state.HZ} Hz`)
      if (state.playtimer) clearInterval(state.playtimer)
      state.playtimer = setInterval(onTimerStart, DATA_SEND_INTERVAL)
    }
  }
  state.oldTimeObj[dataItem.type] = stamp
  return true
}

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
//  Data Frame Callback Binding
// ═══════════════════════════════════════════════════════════

/**
 * Bind data frame parsing callback to a connected serial port
 */
function bindDataHandler(portPath, parserItem, dataItem, broadcastFn, onTimerStart, allPorts) {
  parserItem.parser.on('data', async (data) => {
    const buffer = Buffer.from(data)
    const pointArr = Array.from(buffer)

    // -- MAC address response --
    if (buffer.toString().includes('Unique ID')) {
      const str = buffer.toString()
      const uniqueIdMatch = str.match(/Unique ID:\s*([^\s\-]+)/)
      const versionMatch = str.match(/Versions?:\s*([^\s\-]+)/)
      const uniqueId = uniqueIdMatch ? uniqueIdMatch[1] : null
      const version = versionMatch ? versionMatch[1] : null

      console.log(`[Serial] Device identified - UniqueID: ${uniqueId}, Version: ${version}`)
      state.macInfo[portPath] = { uniqueId, version }

      if (Object.keys(state.macInfo).length === allPorts.length) {
        broadcastFn(JSON.stringify({ macInfo: state.macInfo }))
      }

      if (uniqueId && dataItem.deviceClass === 'foot') {
        const { type: deviceType, premission } = await resolveDeviceType(uniqueId)
        if (deviceType) {
          dataItem.type = deviceType
          dataItem.premission = premission
          console.log(`[Serial] ${portPath} final type: ${deviceType}, auth: ${premission}`)
          broadcastFn(JSON.stringify({ deviceUpdate: { path: portPath, type: deviceType, premission } }))
        }
      }
      return
    }

    // -- Gyroscope data (18 bytes) --
    if (pointArr.length === 18) {
      dataItem.rotate = bytes4ToInt10(pointArr.slice(2))
      return
    }

    // -- Glove 256 matrix split (130 bytes) --
    if (pointArr.length === 130) {
      const orderByte = pointArr[0]
      const typeByte = pointArr[1]
      const arr = pointArr.slice(2)
      dataItem[constantObj.order[orderByte]] = arr
      dataItem.type = constantObj.handTypeMap[typeByte] || constantObj.type[typeByte]
      dataItem.stamp = Date.now()
      return
    }

    // -- Sit pad 1024 matrix --
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

    // -- 1025 matrix (with type prefix) --
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

    // -- Glove 146 bytes (with quaternion) --
    if (pointArr.length === 146) {
      const rotateData = pointArr.slice(pointArr.length - 16)
      const nextData = pointArr.slice(2, pointArr.length - 16)
      dataItem.next = nextData
      dataItem.stamp = Date.now()
      const typeByte = pointArr[1]
      dataItem.type = constantObj.handTypeMap[typeByte] || dataItem.type
      dataItem.rotate = bytes4ToInt10(rotateData)
      return
    }

    // -- Foot pad 4096 matrix --
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

    // -- 4097 matrix (with type prefix) --
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
//  Core Entry: One-Click Connect
// ═══════════════════════════════════════════════════════════

/**
 * Connect all available serial ports (three-layer identification funnel)
 *
 * Key change: detectBaudRate now returns the already-open SerialPort instance.
 * We REUSE that instance instead of closing and re-opening, which solves:
 *   1. CH340 chip instability on rapid open/close cycles
 *   2. Windows serial port exclusive lock release delay
 *   3. Faster connection (no redundant open/close)
 */
async function connectPort(broadcastFn, onTimerStart) {
  state.macInfo = {}
  const { splitArr, BAUD_DEVICE_MAP } = constantObj
  const splitBuffer = Buffer.from(splitArr)

  // -- Phase 1: Enumerate & filter --
  let ports = await SerialPort.list()
  ports = getPort(ports)
  console.log(`[Connect] Found ${ports.length} CH340 serial port(s)`)

  if (!ports.length) {
    broadcastFn(JSON.stringify({ connectResult: { success: false, message: 'No CH340 serial ports found' } }))
    return []
  }

  const connectedPorts = []

  for (let i = 0; i < ports.length; i++) {
    const portInfo = ports[i]
    const { path: portPath } = portInfo

    // Skip if already connected and open
    if (state.parserArr[portPath]?.port?.isOpen) {
      console.log(`[Connect] ${portPath} already connected, skipping`)
      connectedPorts.push({ path: portPath, status: 'already_connected' })
      continue
    }

    // -- Phase 2: Baud rate detection (returns reusable port) --
    console.log(`[Connect] Detecting baud rate for ${portPath}...`)
    broadcastFn(JSON.stringify({ connectProgress: { path: portPath, stage: 'detecting_baud' } }))

    const detectResult = await detectBaudRate(portPath)
    if (!detectResult) {
      console.warn(`[Connect] ${portPath} baud rate detection failed, skipping`)
      connectedPorts.push({ path: portPath, status: 'baud_detect_failed' })
      continue
    }

    const { baud: detectedBaud, port: detectedPort } = detectResult
    const deviceClass = BAUD_DEVICE_MAP[detectedBaud]
    console.log(`[Connect] ${portPath} -> baud: ${detectedBaud}, device class: ${deviceClass}`)

    // -- Reuse the already-open port, just pipe the parser --
    const parserItem = state.parserArr[portPath] = state.parserArr[portPath] || {}
    const dataItem = state.dataMap[portPath] = state.dataMap[portPath] || {}

    parserItem.parser = new DelimiterParser({ delimiter: splitBuffer })
    dataItem.deviceClass = deviceClass
    dataItem.baudRate = detectedBaud

    // Pipe the already-open port to the parser (no re-open needed!)
    detectedPort.pipe(parserItem.parser)
    parserItem.port = detectedPort
    parserItem.baudRate = detectedBaud

    console.log(`[Connect] ${portPath} port reused from detection, parser attached`)

    // -- Phase 3: Refinement & auth --
    if (deviceClass === 'sit') {
      dataItem.type = 'sit'
      dataItem.premission = true
      console.log(`[Connect] ${portPath} -> sit pad, direct auth`)
      bindDataHandler(portPath, parserItem, dataItem, broadcastFn, onTimerStart, ports)

    } else if (deviceClass === 'hand') {
      dataItem.type = 'hand'
      dataItem.premission = true
      console.log(`[Connect] ${portPath} -> glove, waiting for frame to determine HL/HR`)
      bindDataHandler(portPath, parserItem, dataItem, broadcastFn, onTimerStart, ports)

    } else if (deviceClass === 'foot') {
      console.log(`[Connect] ${portPath} -> foot pad, getting MAC address...`)
      broadcastFn(JSON.stringify({ connectProgress: { path: portPath, stage: 'getting_mac' } }))

      // Bind data handler first (sendMacCommand listens on parser)
      bindDataHandler(portPath, parserItem, dataItem, broadcastFn, onTimerStart, ports)

      // Send AT command to get MAC
      const { uniqueId, version } = await sendMacCommand(detectedPort, parserItem.parser)
      state.macInfo[portPath] = { uniqueId, version }

      if (uniqueId) {
        console.log(`[Connect] ${portPath} MAC: ${uniqueId}, version: ${version}`)
        const { type: deviceType, premission } = await resolveDeviceType(uniqueId)
        if (deviceType) {
          dataItem.type = deviceType
          dataItem.premission = premission
          console.log(`[Connect] ${portPath} final type: ${deviceType}, auth: ${premission}`)
        } else {
          dataItem.type = 'foot'
          dataItem.premission = false
          console.warn(`[Connect] ${portPath} MAC ${uniqueId} failed to map to specific type`)
        }
      } else {
        dataItem.type = 'foot'
        dataItem.premission = false
        console.warn(`[Connect] ${portPath} failed to get MAC address`)
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

  // Broadcast final connect result
  broadcastFn(JSON.stringify({
    connectResult: {
      success: true,
      ports: connectedPorts,
      macInfo: state.macInfo,
      authMode: constantObj.AUTH_MODE,
    }
  }))

  console.log(`[Connect] One-click connect done, connected ${connectedPorts.filter(p => p.status === 'connected').length}/${ports.length} device(s)`)
  return connectedPorts
}

// ═══════════════════════════════════════════════════════════
//  Close & Reconnect
// ═══════════════════════════════════════════════════════════

async function stopPort() {
  Object.keys(state.parserArr).forEach((portPath) => {
    const item = state.parserArr[portPath]
    if (item?.port?.isOpen) {
      item.port.close((err) => {
        if (!err) {
          delete state.parserArr[portPath]
          delete state.dataMap[portPath]
          console.log(`[Serial] Port closed: ${portPath}`)
        }
      })
    }
  })

  if (state.playtimer) clearInterval(state.playtimer)
  state.MaxHZ = undefined
}

/**
 * Start serial port disconnect monitor.
 * Checks every RECONNECT_INTERVAL ms and reconnects using the detected baud rate.
 */
function startReconnectMonitor() {
  setInterval(() => {
    if (!Object.keys(state.parserArr).length) return

    Object.keys(state.parserArr).forEach((portPath) => {
      const item = state.parserArr[portPath]
      if (item && !item.port.isOpen) {
        const baudRate = item.baudRate || state.baudRate
        console.log(`[Serial] Port disconnected, reconnecting: ${portPath} @ ${baudRate}`)
        try {
          item.port = new SerialPort({
            path: portPath,
            baudRate,
            autoOpen: true,
          }, (err) => {
            if (err) console.error(`[Serial] Reconnect failed ${portPath}:`, err.message)
          })
          item.port.pipe(item.parser)
        } catch (err) {
          console.error(`[Serial] Reconnect error ${portPath}:`, err.message)
        }
      }
    })
  }, RECONNECT_INTERVAL)
}

/**
 * Send AT command to a port (used by /sendMac API)
 */
function portWrite(port) {
  return new Promise((resolve, reject) => {
    port.write(constantObj.AT_MAC_COMMAND, (err) => {
      if (err) {
        console.error('[Serial] Write error:', err.message)
        reject(err)
      } else {
        resolve()
      }
    })
  })
}

// ═══════════════════════════════════════════════════════════
//  Exports
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
