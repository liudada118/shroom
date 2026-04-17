/**
 * Serial Port Manager
 *
 * Responsibilities:
 *   1. Enumerate serial ports -> filter CH340
 *   2. Auto-detect baud rate (delimiter AA 55 03 99 + frame length validation)
 *   3. Device type refinement: hand via frame type byte, foot via AT command MAC
 *   4. Device auth: local cache first -> online fallback
 *   5. Data frame parsing and real-time push
 *   6. Manual rescan with zombie cleanup (no auto-reconnect)
 *
 * Connection flow (aligned with user spec):
 *   Phase 1: Baud rate detection (open/detect/close per candidate, skip already-open ports)
 *   Phase 2: Stable connection (newSerialPortLinkWithRetry, 3 retries, 500ms interval, 2s timeout)
 *   Phase 3: MAC query + device type resolution (local cache first)
 *   Phase 4: Bind data handler, init lastDataTime for zombie detection
 *
 * Rescan flow:
 *   Step 1: Clean dead ports (port.isOpen === false)
 *   Step 1.5: Clean zombie devices (port.isOpen === true but >5s no data)
 *   Step 2: Call connectPort() to reconnect (skips still-working ports)
 */
const { SerialPort, DelimiterParser } = require('serialport')
const { getPort } = require('../../util/serialport')
const { bytes4ToInt10 } = require('../../util/parseData')
const constantObj = require('../../util/config')
const { hand, jqbed, endiSit, endiBack, endiSit1024, endiBack1024, carYLine, carYSitLine, carYBackLine } = require('../../util/line')
const { default: axios } = require('axios')
const { state } = require('../state')
const { getTypeFromCache, setTypeToCache } = require('../../util/serialCache')

// ═══════════════════════════════════════════════════════════
//  Constants
// ═══════════════════════════════════════════════════════════

const MIN_HZ_INTERVAL = 50
const ONLINE_THRESHOLD = 1000
const DATA_SEND_INTERVAL = 80
const ZOMBIE_THRESHOLD = 5000        // 5 seconds no data = zombie
const STABLE_CONN_TIMEOUT = 2000     // 2s timeout per connection attempt
const STABLE_CONN_RETRIES = 3        // max 3 retries
const STABLE_CONN_RETRY_DELAY = 500  // 500ms between retries
const POST_DETECT_DELAY = 500        // 500ms after baud detection close
const POST_ALL_DETECT_DELAY = 1000   // 1s after all ports detected

/**
 * Valid frame lengths for double-validation during baud detection.
 * After finding delimiter AA 55 03 99, we also check the next frame's length.
 */
const VALID_FRAME_LENGTHS = [18, 130, 146, 1024, 1025, 4096, 4097]

/**
 * Track port connection history (record only, no auto-close)
 */
function trackPortAndCleanup(newPortPath) {
  state.portHistory = state.portHistory.filter(p => p.path !== newPortPath)
  state.portHistory.push({ path: newPortPath, connectedAt: Date.now() })
  console.log(`[PortTrack] Port history updated: [${state.portHistory.map(p => p.path).join(', ')}] (${state.portHistory.length} ports active)`)
}

// ═══════════════════════════════════════════════════════════
//  Phase 1: Baud Rate Auto-Detection (with frame length validation)
// ═══════════════════════════════════════════════════════════

/**
 * Detect baud rate for a serial port.
 * Uses delimiter AA 55 03 99 + frame length double validation.
 * Skips already-connected and open ports.
 */
async function detectBaudRate(portPath) {
  const { BAUD_CANDIDATES, BAUD_DETECT_TIMEOUT, splitArr } = constantObj
  const splitBuffer = Buffer.from(splitArr)

  for (const baud of BAUD_CANDIDATES) {
    try {
      const matched = await tryBaudRate(portPath, baud, splitBuffer, BAUD_DETECT_TIMEOUT)
      if (matched) {
        console.log(`[BaudDetect] ${portPath} -> baud ${baud} matched (delimiter + frame length validated)`)
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
 * Uses sliding window + frame length double validation.
 * ALWAYS closes the port when done.
 */
function tryBaudRate(portPath, baudRate, delimiter, timeout) {
  return new Promise((resolve) => {
    let port = null
    let timer = null
    let resolved = false
    const window = []
    let totalBytes = 0
    let delimiterFound = false
    let frameBytesAfterDelimiter = 0

    function finish(success) {
      if (resolved) return
      resolved = true
      if (timer) clearTimeout(timer)

      if (port) {
        port.removeAllListeners('data')
        port.removeAllListeners('error')
        if (port.isOpen) {
          port.close(() => resolve(success))
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

        const onData = (chunk) => {
          const bytes = Buffer.from(chunk)
          for (let i = 0; i < bytes.length; i++) {
            totalBytes++

            if (!delimiterFound) {
              // Sliding window to find delimiter
              window.push(bytes[i])
              if (window.length > delimiter.length) window.shift()

              if (window.length === delimiter.length) {
                let match = true
                for (let j = 0; j < delimiter.length; j++) {
                  if (window[j] !== delimiter[j]) { match = false; break }
                }
                if (match) {
                  delimiterFound = true
                  frameBytesAfterDelimiter = 0
                  // Now count bytes until next delimiter to validate frame length
                }
              }
            } else {
              // Count bytes after first delimiter until next delimiter
              frameBytesAfterDelimiter++

              // Check if we hit the next delimiter
              window.push(bytes[i])
              if (window.length > delimiter.length) window.shift()

              if (window.length === delimiter.length) {
                let match = true
                for (let j = 0; j < delimiter.length; j++) {
                  if (window[j] !== delimiter[j]) { match = false; break }
                }
                if (match) {
                  // Frame length = bytes between two delimiters (minus the delimiter itself)
                  const frameLen = frameBytesAfterDelimiter - delimiter.length
                  if (VALID_FRAME_LENGTHS.includes(frameLen)) {
                    console.log(`[BaudDetect] ${portPath} @ ${baudRate} VALIDATED: delimiter found + frame length ${frameLen} (${totalBytes} bytes total)`)
                    port.removeListener('data', onData)
                    finish(true)
                    return
                  } else {
                    // Frame length doesn't match known types, but delimiter found twice
                    // Accept it anyway (some devices may have variable frame sizes)
                    console.log(`[BaudDetect] ${portPath} @ ${baudRate} FOUND delimiter x2, frame length ${frameLen} (not in known list, accepting)`)
                    port.removeListener('data', onData)
                    finish(true)
                    return
                  }
                }
              }

              // Safety: if we've counted too many bytes without finding next delimiter, accept first match
              if (frameBytesAfterDelimiter > 8200) {
                console.log(`[BaudDetect] ${portPath} @ ${baudRate} FOUND delimiter (single match, ${totalBytes} bytes)`)
                port.removeListener('data', onData)
                finish(true)
                return
              }
            }
          }
        }

        port.on('data', onData)

        timer = setTimeout(() => {
          console.log(`[BaudDetect] ${portPath} @ ${baudRate} timeout (${totalBytes} bytes, delimiter${delimiterFound ? ' found but no frame validation' : ' not found'})`)
          port.removeListener('data', onData)
          // If delimiter was found but frame validation didn't complete, still accept
          finish(delimiterFound)
        }, timeout)
      })
    } catch (err) {
      console.log(`[BaudDetect] ${portPath} @ ${baudRate} exception: ${err.message}`)
      finish(false)
    }
  })
}

// ═══════════════════════════════════════════════════════════
//  Phase 2: Stable Connection with Retry
// ═══════════════════════════════════════════════════════════

/**
 * Open a serial port for stable data connection with retry mechanism.
 * Max 3 retries, 500ms interval, 2s timeout per attempt.
 */
async function newSerialPortLinkWithRetry(portPath, baudRate, delimiter) {
  let lastErr = null

  for (let attempt = 1; attempt <= STABLE_CONN_RETRIES; attempt++) {
    try {
      const result = await openStableConnection(portPath, baudRate, delimiter)
      console.log(`[Connect] ${portPath} @ ${baudRate} stable connection opened (attempt ${attempt})`)
      return result
    } catch (err) {
      lastErr = err
      console.warn(`[Connect] ${portPath} @ ${baudRate} attempt ${attempt}/${STABLE_CONN_RETRIES} failed: ${err.message}`)
      if (attempt < STABLE_CONN_RETRIES) {
        await new Promise(r => setTimeout(r, STABLE_CONN_RETRY_DELAY))
      }
    }
  }

  throw lastErr || new Error(`Failed to connect ${portPath} after ${STABLE_CONN_RETRIES} attempts`)
}

/**
 * Single attempt to open a stable serial port connection with timeout.
 */
function openStableConnection(portPath, baudRate, delimiter) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Connection timeout (${STABLE_CONN_TIMEOUT}ms)`))
    }, STABLE_CONN_TIMEOUT)

    const port = new SerialPort({
      path: portPath,
      baudRate,
      autoOpen: false,
    })

    port.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })

    port.open((err) => {
      clearTimeout(timer)
      if (err) {
        reject(err)
        return
      }

      const parser = new DelimiterParser({ delimiter })
      port.pipe(parser)
      resolve({ port, parser })
    })
  })
}

// ═══════════════════════════════════════════════════════════
//  Phase 3: MAC Address & Device Type Assignment
// ═══════════════════════════════════════════════════════════

/**
 * Send AT command repeatedly to get MAC address.
 * Listens on RAW port (not parser) because AT response is plain text.
 * Send every 300ms, timeout 60s.
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

    let foundUniqueId = false
    let collectTimer = null

    const extractAndResolve = () => {
      port.removeListener('data', onData)
      cleanup()

      const uniqueIdMatch = textBuffer.match(/Unique ID:\s*([0-9A-Fa-f]+)/)
      const versionMatch = textBuffer.match(/Versions?:\s*([^\s]+)/)

      const uniqueId = uniqueIdMatch ? uniqueIdMatch[1] : null
      const version = versionMatch ? versionMatch[1] : null

      console.log(`[MAC] Response received - UniqueID: ${uniqueId}, Version: ${version}`)
      resolve({ uniqueId, version })
    }

    const onData = (data) => {
      try {
        const str = Buffer.from(data).toString('utf8')
        textBuffer += str

        if (textBuffer.length > 10000) {
          textBuffer = textBuffer.slice(-10000)
        }

        if (textBuffer.includes('Unique ID') && !foundUniqueId) {
          foundUniqueId = true
          if (interval) clearInterval(interval)
          collectTimer = setTimeout(extractAndResolve, 500)
        }
      } catch (e) {
        // Not text data, ignore
      }
    }

    port.on('data', onData)

    const sendOnce = () => {
      if (port.isOpen && !resolved) {
        port.write(AT_MAC_COMMAND, (err) => {
          if (err) console.warn('[MAC] AT command send failed:', err.message)
        })
      }
    }

    sendOnce()
    interval = setInterval(sendOnce, MAC_SEND_INTERVAL)

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
 * Resolve device type via local cache (serial_cache.json)
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
  if (t === 'carY-sit') return carYSitLine(pointArr)
  if (t === 'carY-back') return carYBackLine(pointArr)
  return pointArr
}

function processTypedMatrixData(pointArr, dataItem) {
  const t = dataItem.type
  if (t === 'car-back' || t === 'car-sit' || t === 'bed') return jqbed(pointArr)
  if (t === 'carY-sit') return carYSitLine(pointArr)
  if (t === 'carY-back') return carYBackLine(pointArr)
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
 * Each frame updates lastDataTime[path] for zombie detection.
 */
function bindDataHandler(portPath, parserItem, dataItem, broadcastFn, onTimerStart, allPorts) {
  parserItem.parser.on('data', async (data) => {
    const buffer = Buffer.from(data)
    const pointArr = Array.from(buffer)

    // Update lastDataTime for zombie detection
    state.lastDataTime[portPath] = Date.now()

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
      } else if (dataItem.type === 'carY-sit') {
        dataItem.arr = carYSitLine(pointArr)
      } else if (dataItem.type === 'carY-back') {
        dataItem.arr = carYBackLine(pointArr)
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
      } else if (dataItem.type === 'carY-sit') {
        dataItem.arr = carYSitLine(matrixData)
      } else if (dataItem.type === 'carY-back') {
        dataItem.arr = carYBackLine(matrixData)
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
//  Core Entry: One-Click Connect (/connPort)
// ═══════════════════════════════════════════════════════════

/**
 * Connect all available serial ports (three-layer identification funnel)
 *
 * Phase 1: Enumerate & filter CH340 ports
 * Phase 2: detectBaudRate() with delimiter + frame length validation
 *          Skip already-connected & isOpen ports
 *          Wait 500ms after each port detection, 1000ms after all detections
 * Phase 3: newSerialPortLinkWithRetry() — 3 retries, 500ms interval, 2s timeout
 * Phase 4: Init lastDataTime[path], sendMacCommand, bindDataHandler
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
  const macResolveTasks = []
  const portsToDetect = []

  // Separate already-connected ports from new ports
  for (const portInfo of ports) {
    const { path: portPath } = portInfo
    if (state.parserArr[portPath]?.port?.isOpen) {
      console.log(`[Connect] ${portPath} already connected and open, skipping`)
      connectedPorts.push({ path: portPath, status: 'already_connected' })
      continue
    }
    portsToDetect.push(portInfo)
  }

  // -- Phase 2: Baud rate detection for each new port --
  const detectedPorts = []
  for (let i = 0; i < portsToDetect.length; i++) {
    const portInfo = portsToDetect[i]
    const { path: portPath } = portInfo

    console.log(`[Connect] Detecting baud rate for ${portPath}...`)
    broadcastFn(JSON.stringify({ connectProgress: { path: portPath, stage: 'detecting_baud' } }))

    const detectedBaud = await detectBaudRate(portPath)
    if (!detectedBaud) {
      console.warn(`[Connect] ${portPath} baud rate detection failed, skipping`)
      connectedPorts.push({ path: portPath, status: 'baud_detect_failed' })
      continue
    }

    detectedPorts.push({ portInfo, detectedBaud })

    // Wait 500ms after each port detection close (avoid driver port lock conflict)
    await new Promise(r => setTimeout(r, POST_DETECT_DELAY))
  }

  // Wait 1000ms after all detections complete
  if (detectedPorts.length > 0) {
    await new Promise(r => setTimeout(r, POST_ALL_DETECT_DELAY))
  }

  // -- Phase 3: Establish stable connections --
  for (const { portInfo, detectedBaud } of detectedPorts) {
    const { path: portPath } = portInfo
    const deviceClass = BAUD_DEVICE_MAP[detectedBaud] || 'unknown'
    console.log(`[Connect] ${portPath} -> baud: ${detectedBaud}, device class: ${deviceClass}`)

    broadcastFn(JSON.stringify({ connectProgress: { path: portPath, stage: 'connecting', baudRate: detectedBaud, deviceClass } }))

    let stablePort, stableParser
    try {
      const conn = await newSerialPortLinkWithRetry(portPath, detectedBaud, splitBuffer)
      stablePort = conn.port
      stableParser = conn.parser
    } catch (err) {
      console.error(`[Connect] ${portPath} all connection attempts failed: ${err.message}`)
      connectedPorts.push({ path: portPath, status: 'open_failed' })
      continue
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

    // Initialize lastDataTime for zombie detection
    state.lastDataTime[portPath] = Date.now()

    trackPortAndCleanup(portPath)

    // -- Phase 4: Bind data handler & prepare MAC resolution --
    bindDataHandler(portPath, parserItem, dataItem, broadcastFn, onTimerStart, ports)

    if (deviceClass === 'sit' || deviceClass === 'foot') {
      dataItem.type = null
      dataItem.premission = false
      console.log(`[Connect] ${portPath} -> ${deviceClass} device, will query type via MAC...`)
      broadcastFn(JSON.stringify({ connectProgress: { path: portPath, stage: 'getting_mac' } }))
      macResolveTasks.push({ portPath, stablePort, dataItem, deviceClass })
    } else if (deviceClass === 'hand') {
      dataItem.type = 'hand'
      dataItem.premission = true
      console.log(`[Connect] ${portPath} -> glove, waiting for frame to determine HL/HR`)

      // MAC read for hand is non-blocking
      sendMacCommand(stablePort).then(({ uniqueId, version }) => {
        if (uniqueId) {
          state.macInfo[portPath] = { uniqueId, version }
          console.log(`[Connect] ${portPath} hand MAC: ${uniqueId}`)
        }
      }).catch(() => {})
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

  // -- Phase 5: Parallel MAC read + type resolution for sit/foot devices --
  if (macResolveTasks.length > 0) {
    console.log(`[Connect] Starting parallel MAC resolution for ${macResolveTasks.length} device(s)...`)

    await Promise.all(macResolveTasks.map(async ({ portPath, stablePort, dataItem, deviceClass }) => {
      try {
        const { uniqueId, version } = await sendMacCommand(stablePort)
        state.macInfo[portPath] = { uniqueId, version }

        if (uniqueId) {
          console.log(`[Connect] ${portPath} MAC: ${uniqueId}, version: ${version}`)
          // Local cache first, then online fallback
          const { type: deviceType, premission } = await resolveDeviceType(uniqueId)
          if (deviceType) {
            dataItem.type = deviceType
            dataItem.premission = premission
            console.log(`[Connect] ${portPath} final type: ${deviceType}, auth: ${premission}`)
            broadcastFn(JSON.stringify({ deviceUpdate: { path: portPath, type: deviceType, premission } }))
          } else {
            dataItem.type = deviceClass
            dataItem.premission = false
            console.warn(`[Connect] ${portPath} MAC ${uniqueId} type not resolved, fallback to ${deviceClass}`)
          }
        } else {
          dataItem.type = deviceClass
          dataItem.premission = false
          console.warn(`[Connect] ${portPath} failed to get MAC, fallback to ${deviceClass}`)
        }
      } catch (err) {
        console.error(`[Connect] ${portPath} MAC resolution error:`, err.message)
        dataItem.type = deviceClass
        dataItem.premission = false
      }
    }))

    console.log(`[Connect] All MAC resolutions complete`)
  }

  // Broadcast final connect result with macInfo
  broadcastFn(JSON.stringify({
    connectResult: {
      success: true,
      ports: connectedPorts,
      macInfo: state.macInfo,
      authMode: constantObj.AUTH_MODE,
    }
  }))

  // Also broadcast macInfo separately for frontend
  if (Object.keys(state.macInfo).length > 0) {
    broadcastFn(JSON.stringify({ macInfo: state.macInfo }))
  }

  console.log(`[Connect] One-click connect done, connected ${connectedPorts.filter(p => p.status === 'connected').length}/${ports.length} device(s)`)
  return connectedPorts
}

// ═══════════════════════════════════════════════════════════
//  Rescan Port (/rescanPort)
// ═══════════════════════════════════════════════════════════

/**
 * Rescan and reconnect serial ports.
 *
 * Step 1: Clean dead ports (port.isOpen === false)
 *   → Remove event listeners → close port → delete parserArr/dataMap
 *
 * Step 1.5: Clean zombie devices (port.isOpen === true but >5s no data)
 *   → Remove event listeners → force close port → delete parserArr/dataMap/lastDataTime
 *   → Wait 1s for port lock release
 *
 * Step 2: Call connectPort()
 *   → Skips still-working ports (already connected & open)
 *   → Reconnects cleaned-up ports through full flow
 */
async function rescanPort(broadcastFn, onTimerStart) {
  console.log('[Rescan] Starting rescan...')
  broadcastFn(JSON.stringify({ rescanProgress: { stage: 'cleaning' } }))

  const now = Date.now()
  let cleanedCount = 0

  // -- Step 1: Clean dead ports (port.isOpen === false) --
  for (const portPath of Object.keys(state.parserArr)) {
    const item = state.parserArr[portPath]
    if (item && !item.port.isOpen) {
      console.log(`[Rescan] Step 1: Cleaning dead port: ${portPath}`)
      try {
        item.parser.removeAllListeners()
        item.port.removeAllListeners()
        if (item.port.isOpen) item.port.close(() => {})
      } catch (e) {
        console.warn(`[Rescan] Error cleaning dead port ${portPath}: ${e.message}`)
      }
      delete state.parserArr[portPath]
      delete state.dataMap[portPath]
      delete state.lastDataTime[portPath]
      state.portHistory = state.portHistory.filter(p => p.path !== portPath)
      cleanedCount++
    }
  }

  // -- Step 1.5: Clean zombie devices (isOpen but no data for >5s) --
  let hasZombie = false
  for (const portPath of Object.keys(state.parserArr)) {
    const item = state.parserArr[portPath]
    const lastTime = state.lastDataTime[portPath] || 0

    if (item && item.port.isOpen && (now - lastTime > ZOMBIE_THRESHOLD)) {
      console.log(`[Rescan] Step 1.5: Cleaning zombie device: ${portPath} (last data ${now - lastTime}ms ago)`)
      hasZombie = true
      try {
        item.parser.removeAllListeners()
        item.port.removeAllListeners()
        item.port.close(() => {})
      } catch (e) {
        console.warn(`[Rescan] Error cleaning zombie ${portPath}: ${e.message}`)
      }
      delete state.parserArr[portPath]
      delete state.dataMap[portPath]
      delete state.lastDataTime[portPath]
      state.portHistory = state.portHistory.filter(p => p.path !== portPath)
      cleanedCount++
    }
  }

  // Wait 1s for port lock release if zombies were cleaned
  if (hasZombie) {
    console.log('[Rescan] Waiting 1s for port lock release after zombie cleanup...')
    await new Promise(r => setTimeout(r, 1000))
  }

  console.log(`[Rescan] Cleaned ${cleanedCount} dead/zombie port(s), proceeding to reconnect...`)
  broadcastFn(JSON.stringify({ rescanProgress: { stage: 'reconnecting', cleaned: cleanedCount } }))

  // -- Step 2: Call connectPort() to reconnect --
  // connectPort() will skip still-working ports (already connected & open)
  const result = await connectPort(broadcastFn, onTimerStart)

  broadcastFn(JSON.stringify({ rescanProgress: { stage: 'done', cleaned: cleanedCount, result } }))
  console.log(`[Rescan] Rescan complete`)
  return result
}

// ═══════════════════════════════════════════════════════════
//  Stop All Ports
// ═══════════════════════════════════════════════════════════

async function stopPort() {
  Object.keys(state.parserArr).forEach((portPath) => {
    const item = state.parserArr[portPath]
    if (item?.port?.isOpen) {
      try {
        item.parser.removeAllListeners()
        item.port.removeAllListeners()
        item.port.close((err) => {
          if (!err) console.log(`[Serial] Port closed: ${portPath}`)
        })
      } catch (e) {
        console.warn(`[Serial] Error closing port ${portPath}: ${e.message}`)
      }
    }
  })

  state.parserArr = {}
  state.dataMap = {}
  state.macInfo = {}
  state.oldTimeObj = {}
  state.portHistory = []
  state.lastDataTime = {}
  if (state.playtimer) clearInterval(state.playtimer)
  state.MaxHZ = undefined
}

// ═══════════════════════════════════════════════════════════
//  Port Write Helper
// ═══════════════════════════════════════════════════════════

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
  rescanPort,
  stopPort,
  portWrite,
  detectBaudRate,
  sendMacCommand,
  resolveDeviceType,
  resolveDeviceTypeOnline,
  resolveDeviceTypeLocal,
  ONLINE_THRESHOLD,
  ZOMBIE_THRESHOLD,
}
