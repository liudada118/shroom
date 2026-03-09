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
 *
 * Key design decisions (aligned with web serial version):
 *   - Baud detection: open -> detect delimiter -> close (per candidate)
 *   - After detection: re-open at matched baud rate for stable connection
 *   - MAC reading: listen on RAW port (not parser), because AT response
 *     is plain text without frame delimiter AA 55 03 99
 *   - MAC timeout: 60 seconds (matching web version)
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
//  Phase 2: Baud Rate Auto-Detection
// ═══════════════════════════════════════════════════════════

/**
 * Detect baud rate for a serial port.
 *
 * Aligned with web serial version:
 *   - Open port at candidate baud rate
 *   - Listen for delimiter AA 55 03 99 within timeout
 *   - Close port after each attempt (success or failure)
 *   - Return matched baud rate (caller will re-open for stable connection)
 *
 * @param {string} portPath Serial port path
 * @returns {Promise<number|null>} Matched baud rate or null
 */
async function detectBaudRate(portPath) {
  const { BAUD_CANDIDATES, BAUD_DETECT_TIMEOUT, splitArr } = constantObj
  const splitBuffer = Buffer.from(splitArr)

  for (const baud of BAUD_CANDIDATES) {
    try {
      const matched = await tryBaudRate(portPath, baud, splitBuffer, BAUD_DETECT_TIMEOUT)
      if (matched) {
        console.log(`[BaudDetect] ${portPath} -> baud ${baud} matched`)
        return baud
      }
    } catch (err) {
      console.warn(`[BaudDetect] ${portPath} @ ${baud} error: ${err.message}`)
    }
  }

  console.warn(`[BaudDetect] ${portPath} -> all candidate baud rates failed`)
  return null
}

/**
 * Try opening a serial port at the given baud rate and listen for the delimiter.
 *
 * Uses a sliding window approach (like the web version) to match delimiter
 * byte-by-byte as data arrives, avoiding cross-packet boundary issues.
 *
 * ALWAYS closes the port when done (success or failure).
 *
 * @returns {Promise<boolean>} true if delimiter found within timeout
 */
function tryBaudRate(portPath, baudRate, delimiter, timeout) {
  return new Promise((resolve) => {
    let port = null
    let timer = null
    let resolved = false
    // Sliding window buffer — same approach as web version
    const window = []
    let totalBytes = 0

    function finish(success) {
      if (resolved) return
      resolved = true
      if (timer) clearTimeout(timer)

      // Always close port after detection attempt
      if (port) {
        port.removeAllListeners('data')
        port.removeAllListeners('error')
        if (port.isOpen) {
          port.close(() => {
            resolve(success)
          })
        } else {
          resolve(success)
        }
      } else {
        resolve(success)
      }
    }

    try {
      port = new SerialPort({
        path: portPath,
        baudRate,
        autoOpen: false,
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

        console.log(`[BaudDetect] ${portPath} @ ${baudRate} opened, listening...`)

        // Sliding window byte-by-byte matching (aligned with web version)
        const onData = (chunk) => {
          const bytes = Buffer.from(chunk)
          for (let i = 0; i < bytes.length; i++) {
            window.push(bytes[i])
            totalBytes++
            // Keep window size = delimiter length
            if (window.length > delimiter.length) {
              window.shift()
            }
            // Check if window matches delimiter
            if (window.length === delimiter.length) {
              let match = true
              for (let j = 0; j < delimiter.length; j++) {
                if (window[j] !== delimiter[j]) {
                  match = false
                  break
                }
              }
              if (match) {
                console.log(`[BaudDetect] ${portPath} @ ${baudRate} FOUND delimiter (${totalBytes} bytes received)`)
                port.removeListener('data', onData)
                finish(true)
                return
              }
            }
          }
        }

        port.on('data', onData)

        // Timeout
        timer = setTimeout(() => {
          console.log(`[BaudDetect] ${portPath} @ ${baudRate} timeout (${totalBytes} bytes, no delimiter)`)
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

// ═══════════════════════════════════════════════════════════
//  Stable Connection Helper
// ═══════════════════════════════════════════════════════════

/**
 * Open a serial port for stable data connection (after baud rate is known).
 *
 * This is the "re-open" step aligned with the web version's approach:
 * detection closes the port, then we re-open with the matched baud rate.
 *
 * @param {string} portPath Serial port path
 * @param {number} baudRate Matched baud rate
 * @param {Buffer} delimiter Frame delimiter for parser
 * @returns {Promise<{port: SerialPort, parser: DelimiterParser}>}
 */
function openStableConnection(portPath, baudRate, delimiter) {
  return new Promise((resolve, reject) => {
    const port = new SerialPort({
      path: portPath,
      baudRate,
      autoOpen: false,
    })

    port.on('error', (err) => {
      reject(err)
    })

    port.open((err) => {
      if (err) {
        reject(err)
        return
      }

      const parser = new DelimiterParser({ delimiter })
      port.pipe(parser)

      console.log(`[Connect] ${portPath} @ ${baudRate} stable connection opened`)
      resolve({ port, parser })
    })
  })
}

// ═══════════════════════════════════════════════════════════
//  Phase 3: MAC Address & Device Type Assignment
// ═══════════════════════════════════════════════════════════

/**
 * Send AT command repeatedly to get MAC address.
 *
 * CRITICAL: Listens on the RAW port, NOT the DelimiterParser!
 * The AT response is plain text (e.g., "Unique ID: xxx\r\nVersion: yyy\r\n")
 * and does NOT end with the frame delimiter AA 55 03 99.
 * If we listen on the parser, the response gets buffered forever waiting
 * for a delimiter that never comes.
 *
 * Aligned with web version:
 *   - Send AT command immediately, then every 300ms
 *   - Accumulate text in buffer, check for "Unique ID" keyword
 *   - Timeout: 60 seconds (web version uses 60s)
 *
 * @param {SerialPort} port Serial port instance (raw, not parser)
 * @returns {Promise<{uniqueId: string|null, version: string|null}>}
 */
function sendMacCommand(port) {
  const { AT_MAC_COMMAND, MAC_SEND_INTERVAL, MAC_WAIT_TIMEOUT } = constantObj

  return new Promise((resolve) => {
    let timer = null
    let interval = null
    let resolved = false
    let textBuffer = ''

    function cleanup() {
      if (resolved) return
      resolved = true
      if (timer) clearTimeout(timer)
      if (interval) clearInterval(interval)
    }

    // Listen on RAW port data, not parser!
    let foundUniqueId = false
    let collectTimer = null

    const extractAndResolve = () => {
      port.removeListener('data', onData)
      cleanup()

      // Debug: print raw AT response
      console.log(`[MAC] Raw AT response: ${JSON.stringify(textBuffer.substring(Math.max(0, textBuffer.indexOf('Unique ID') - 20)))}`)

      // Match Unique ID: allow digits and hex chars
      const uniqueIdMatch = textBuffer.match(/Unique ID:\s*([0-9A-Fa-f]+)/)
      const versionMatch = textBuffer.match(/Versions?:\s*([^\s]+)/)

      const uniqueId = uniqueIdMatch ? uniqueIdMatch[1] : null
      const version = versionMatch ? versionMatch[1] : null

      console.log(`[MAC] Response received - UniqueID: ${uniqueId}, Version: ${version}`)
      resolve({ uniqueId, version })
    }

    const onData = (data) => {
      // Try to decode as text and accumulate
      try {
        const str = Buffer.from(data).toString('utf8')
        textBuffer += str

        // Cap buffer at 10000 chars
        if (textBuffer.length > 10000) {
          textBuffer = textBuffer.slice(-10000)
        }

        // Once we detect 'Unique ID', wait fixed 500ms for remaining data
        // Do NOT reset timer on each data chunk — sensor data arrives continuously
        // and would prevent the timer from ever firing
        if (textBuffer.includes('Unique ID') && !foundUniqueId) {
          foundUniqueId = true
          if (interval) clearInterval(interval) // Stop sending AT commands
          console.log('[MAC] Detected Unique ID keyword, waiting 500ms for complete response...')
          collectTimer = setTimeout(extractAndResolve, 500)
        }
      } catch (e) {
        // Not text data, ignore (binary sensor data)
      }
    }

    port.on('data', onData)

    // Send AT command immediately, then every MAC_SEND_INTERVAL
    const sendOnce = () => {
      if (port.isOpen && !resolved) {
        port.write(AT_MAC_COMMAND, (err) => {
          if (err) console.warn('[MAC] AT command send failed:', err.message)
          else console.log('[MAC] AT command sent')
        })
      }
    }

    sendOnce()
    interval = setInterval(sendOnce, MAC_SEND_INTERVAL)

    // Timeout (60 seconds, aligned with web version)
    timer = setTimeout(() => {
      port.removeListener('data', onData)
      cleanup()
      console.warn(`[MAC] Timeout after ${MAC_WAIT_TIMEOUT}ms, device may not support MAC query`)
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
 * Unified device type resolution.
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

  console.warn(`[Auth] Local mode, ${uniqueId} not in cache, please add manually`)
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
 * Bind data frame parsing callback to a connected serial port.
 *
 * Listens on the PARSER (DelimiterParser), which splits data by AA 55 03 99.
 * This is correct for sensor data frames.
 *
 * Note: MAC response handling is done separately via sendMacCommand()
 * which listens on the RAW port. The parser-based handler here also
 * checks for "Unique ID" as a fallback in case the response happens
 * to be followed by a delimiter.
 */
function bindDataHandler(portPath, parserItem, dataItem, broadcastFn, onTimerStart, allPorts) {
  parserItem.parser.on('data', async (data) => {
    const buffer = Buffer.from(data)
    const pointArr = Array.from(buffer)
    console.log(`[Serial] ${portPath} 收到数据，长度: ${pointArr.length}`)

    // -- MAC address response (fallback, in case delimiter follows AT response) --
    if (buffer.toString().includes('Unique ID')) {
      const str = buffer.toString()
      const uniqueIdMatch = str.match(/Unique ID:\s*([0-9A-Fa-f]+)/)
      const versionMatch = str.match(/Versions?:\s*([^\s]+)/)
      const uniqueId = uniqueIdMatch ? uniqueIdMatch[1] : null
      const version = versionMatch ? versionMatch[1] : null

      console.log(`[Serial] Device identified via parser - UniqueID: ${uniqueId}, Version: ${version}`)
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
 * Aligned with web serial version:
 *   Step 1: Enumerate & filter CH340 ports
 *   Step 2: detectBaudRate() — open/detect/close per candidate
 *   Step 3: openStableConnection() — re-open at matched baud rate
 *   Step 4: For foot devices, sendMacCommand() on RAW port
 *   Step 5: bindDataHandler() on parser for sensor data
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

    // -- Phase 2: Baud rate detection (open/detect/close) --
    console.log(`[Connect] Detecting baud rate for ${portPath}...`)
    broadcastFn(JSON.stringify({ connectProgress: { path: portPath, stage: 'detecting_baud' } }))

    const detectedBaud = await detectBaudRate(portPath)
    if (!detectedBaud) {
      console.warn(`[Connect] ${portPath} baud rate detection failed, skipping`)
      connectedPorts.push({ path: portPath, status: 'baud_detect_failed' })
      continue
    }

    const deviceClass = BAUD_DEVICE_MAP[detectedBaud] || 'unknown'
    console.log(`[Connect] ${portPath} -> baud: ${detectedBaud}, device class: ${deviceClass}`)

    // -- Phase 3: Re-open for stable connection --
    // Small delay to ensure port is fully released after detection close
    await new Promise(r => setTimeout(r, 200))

    let stablePort, stableParser
    try {
      const conn = await openStableConnection(portPath, detectedBaud, splitBuffer)
      stablePort = conn.port
      stableParser = conn.parser
    } catch (err) {
      console.error(`[Connect] ${portPath} stable connection failed: ${err.message}`)
      // Retry once after longer delay
      await new Promise(r => setTimeout(r, 500))
      try {
        const conn = await openStableConnection(portPath, detectedBaud, splitBuffer)
        stablePort = conn.port
        stableParser = conn.parser
      } catch (err2) {
        console.error(`[Connect] ${portPath} retry also failed: ${err2.message}`)
        connectedPorts.push({ path: portPath, status: 'open_failed' })
        continue
      }
    }

    // Store in state
    const parserItem = state.parserArr[portPath] = {
      port: stablePort,
      parser: stableParser,
      baudRate: detectedBaud,
    }
    const dataItem = state.dataMap[portPath] = state.dataMap[portPath] || {}
    dataItem.deviceClass = deviceClass
    dataItem.baudRate = detectedBaud

    // -- Phase 4: Refinement & auth --
    if (deviceClass === 'sit') {
      // Do NOT set type yet — wait for MAC + server query to determine actual type
      dataItem.type = null
      dataItem.premission = false
      console.log(`[Connect] ${portPath} -> sit baud rate device, getting MAC for type resolution...`)
      broadcastFn(JSON.stringify({ connectProgress: { path: portPath, stage: 'getting_mac' } }))

      // Bind data handler first (frames will be ignored until type is set)
      bindDataHandler(portPath, parserItem, dataItem, broadcastFn, onTimerStart, ports)

      // Wait for MAC, then query server for device type
      const { uniqueId, version } = await sendMacCommand(stablePort)
      state.macInfo[portPath] = { uniqueId, version }

      if (uniqueId) {
        console.log(`[Connect] ${portPath} MAC: ${uniqueId}, version: ${version}`)
        const { type: deviceType, premission } = await resolveDeviceType(uniqueId)
        if (deviceType) {
          dataItem.type = deviceType
          dataItem.premission = premission
          console.log(`[Connect] ${portPath} final type from server: ${deviceType}, auth: ${premission}`)
          broadcastFn(JSON.stringify({ deviceUpdate: { path: portPath, type: deviceType, premission } }))
        } else {
          // Server returned no type — fallback to sit, no auth
          dataItem.type = 'sit'
          dataItem.premission = false
          console.warn(`[Connect] ${portPath} MAC ${uniqueId} type not resolved by server, fallback to sit`)
        }
      } else {
        // MAC read failed — fallback to sit, no auth
        dataItem.type = 'sit'
        dataItem.premission = false
        console.warn(`[Connect] ${portPath} failed to get MAC address, fallback to sit`)
      }

    } else if (deviceClass === 'hand') {
      dataItem.type = 'hand'
      dataItem.premission = true
      console.log(`[Connect] ${portPath} -> glove, waiting for frame to determine HL/HR`)
      bindDataHandler(portPath, parserItem, dataItem, broadcastFn, onTimerStart, ports)

      // Also try to get MAC for hand devices
      sendMacCommand(stablePort).then(({ uniqueId, version }) => {
        if (uniqueId) {
          state.macInfo[portPath] = { uniqueId, version }
          console.log(`[Connect] ${portPath} hand MAC: ${uniqueId}`)
        }
      }).catch(() => {})

    } else if (deviceClass === 'foot') {
      console.log(`[Connect] ${portPath} -> foot pad, getting MAC address...`)
      broadcastFn(JSON.stringify({ connectProgress: { path: portPath, stage: 'getting_mac' } }))

      // Bind data handler first for sensor data
      bindDataHandler(portPath, parserItem, dataItem, broadcastFn, onTimerStart, ports)

      // Send AT command to get MAC (listens on RAW port, not parser)
      const { uniqueId, version } = await sendMacCommand(stablePort)
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
          console.warn(`[Connect] ${portPath} MAC ${uniqueId} type not resolved`)
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
          const splitBuffer = Buffer.from(constantObj.splitArr)
          const newPort = new SerialPort({
            path: portPath,
            baudRate,
            autoOpen: true,
          }, (err) => {
            if (err) {
              console.error(`[Serial] Reconnect failed ${portPath}:`, err.message)
              return
            }
            const newParser = new DelimiterParser({ delimiter: splitBuffer })
            newPort.pipe(newParser)
            item.port = newPort
            item.parser = newParser
            console.log(`[Serial] Reconnected: ${portPath} @ ${baudRate}`)
          })
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
