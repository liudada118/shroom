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
const BAD_FRAME_WINDOW_MS = 1000
const BAD_FRAME_RATE_THRESHOLD = 0.1
const CONSECUTIVE_BAD_FRAME_THRESHOLD = 10
const DATA_QUALITY_NOTIFY_INTERVAL = 3000
const HZ_ZERO_THRESHOLD_MS = 2000
const HZ_JUMP_FACTOR = 3
const STABLE_CONN_TIMEOUT = 2000     // 2s timeout per connection attempt
const STABLE_CONN_RETRIES = 3        // max 3 retries
const STABLE_CONN_RETRY_DELAY = 500  // 500ms between retries
const POST_DETECT_DELAY = 500        // 500ms after baud detection close
const POST_ALL_DETECT_DELAY = 1000   // 1s after all ports detected
const CONNECT_TIMEOUT = 20000
const CONNECTION_LOCK_MAX_AGE = 25000
const SCAN_TIMEOUT = 3000
const MAC_CONNECT_TIMEOUT = 3000
const TYPE_RESOLVE_TIMEOUT = 2000
const BACK_VALUE_MULTIPLIER = 1.8

const CONNECTION_ERROR_META = {
  CONN_BUSY: { stage: 'lock', message: '正在连接中，请稍后再试' },
  NO_PORT: { stage: 'scan', message: '未检测到设备，请检查 USB 连接' },
  NO_CH340: { stage: 'filter', message: '未检测到 CH340 设备' },
  BAUD_FAIL: { stage: 'detect_baud', message: '设备波特率识别失败，请重新插拔设备后重试' },
  PORT_BUSY: { stage: 'open_port', message: '串口被占用，请关闭其他程序后重试' },
  OPEN_FAIL: { stage: 'open_port', message: '串口打开失败，请重新插拔设备后重试' },
  MAC_FAIL: { stage: 'mac', message: '设备 MAC 读取失败，请重新插拔设备后重试' },
  TYPE_UNKNOWN: { stage: 'type_resolve', message: '设备类型识别失败，请在 MAC 配置中添加设备' },
  AUTH_FAIL: { stage: 'auth', message: '设备授权失败，请检查设备授权信息' },
  CONNECT_TIMEOUT: { stage: 'timeout', message: '连接超时，请重新插拔设备后重试' },
  CLEANUP_FAIL: { stage: 'cleanup', message: '串口资源释放失败，请重新插拔设备后重试' },
}

function createConnectionError(code, stage, detail) {
  const meta = CONNECTION_ERROR_META[code] || CONNECTION_ERROR_META.OPEN_FAIL
  const err = new Error(detail || meta.message)
  err.code = code
  err.stage = stage || meta.stage
  err.userMessage = meta.message
  return err
}

function normalizeConnectionError(err, fallbackCode = 'OPEN_FAIL', fallbackStage) {
  if (err?.code && err?.userMessage) return err
  return createConnectionError(fallbackCode, fallbackStage, err?.message)
}

function withTimeout(promise, timeoutMs, timeoutError) {
  let timer
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(timeoutError), timeoutMs)
    }),
  ])
}

function isPortBusyError(err) {
  const message = String(err?.message || err || '').toLowerCase()
  return message.includes('busy') || message.includes('access denied') || message.includes('permission') || message.includes('denied') || message.includes('already open')
}

async function runWithConnectionLock(mode, task) {
  const now = Date.now()
  if (state.connectionTask && now - state.connectionTaskStartedAt < CONNECTION_LOCK_MAX_AGE) {
    throw createConnectionError('CONN_BUSY')
  }

  if (state.connectionTask) {
    console.warn(`[ConnectLock] Releasing stale ${state.connectionMode} task`)
  }

  const currentTask = (async () => task())()
  state.connectionTask = currentTask
  state.connectionTaskStartedAt = now
  state.connectionMode = mode
  state.lastConnectionError = null

  try {
    return await withTimeout(currentTask, CONNECT_TIMEOUT, createConnectionError('CONNECT_TIMEOUT'))
  } catch (err) {
    const normalized = normalizeConnectionError(err)
    state.lastConnectionError = {
      code: normalized.code,
      stage: normalized.stage,
      message: normalized.userMessage,
      detail: normalized.message,
      at: Date.now(),
    }
    throw normalized
  } finally {
    if (state.connectionTask === currentTask) {
      state.connectionTask = null
      state.connectionTaskStartedAt = 0
      state.connectionMode = null
    }
  }
}

/**
 * Valid frame lengths for double-validation during baud detection.
 * After finding delimiter AA 55 03 99, we also check the next frame's length.
 */
const VALID_FRAME_LENGTHS = [18, 130, 146, 1024, 1025, 4096, 4097]

const MATRIX_POINT_COUNTS = {
  'car-back': 1024,
  'car-sit': 1024,
  bed: 1024,
  'endi-back': 3200,
  'endi-sit': 2116,
  'carY-back': 1024,
  'carY-sit': 1024,
  hand: 1024,
}

function ensureDataQuality(dataItem) {
  if (!dataItem.dataQuality) {
    dataItem.dataQuality = {
      status: 'ok',
      totalFrames: 0,
      badFrameCount: 0,
      consecutiveBadFrames: 0,
      windowTotal: 0,
      windowBad: 0,
      windowStartedAt: Date.now(),
      badFrameRate: 0,
      lastError: null,
      lastBadFrameAt: null,
      lastGoodFrameAt: null,
      lastNotifyAt: 0,
      hzAbnormal: false,
    }
  }
  return dataItem.dataQuality
}

function resetQualityWindow(quality, now) {
  if (now - quality.windowStartedAt >= BAD_FRAME_WINDOW_MS) {
    quality.badFrameRate = quality.windowTotal ? quality.windowBad / quality.windowTotal : 0
    quality.windowTotal = 0
    quality.windowBad = 0
    quality.windowStartedAt = now
  }
}

function updateQualityStatus(quality, forcedStatus) {
  if (forcedStatus) {
    quality.status = forcedStatus
    return
  }
  if (quality.consecutiveBadFrames >= CONSECUTIVE_BAD_FRAME_THRESHOLD) {
    quality.status = 'device_error'
  } else if (quality.badFrameRate > BAD_FRAME_RATE_THRESHOLD || quality.hzAbnormal) {
    quality.status = 'degraded'
  } else {
    quality.status = 'ok'
  }
}

function broadcastDataQualityIfNeeded(portPath, dataItem, broadcastFn, now = Date.now()) {
  const quality = ensureDataQuality(dataItem)
  if (quality.status === 'ok') return
  if (now - quality.lastNotifyAt < DATA_QUALITY_NOTIFY_INTERVAL) return
  quality.lastNotifyAt = now
  broadcastFn(JSON.stringify({
    dataQuality: {
      port: portPath,
      type: dataItem.type,
      status: quality.status,
      message: quality.status === 'device_error' ? '设备数据异常，请重新连接' : '设备数据不稳定，请检查连接',
      totalFrames: quality.totalFrames,
      badFrameCount: quality.badFrameCount,
      consecutiveBadFrames: quality.consecutiveBadFrames,
      badFrameRate: quality.badFrameRate,
      lastError: quality.lastError,
    }
  }))
}

function recordBadFrame(portPath, dataItem, broadcastFn, errorType, detail = {}) {
  const now = Date.now()
  const quality = ensureDataQuality(dataItem)
  resetQualityWindow(quality, now)
  quality.totalFrames++
  quality.badFrameCount++
  quality.consecutiveBadFrames++
  quality.windowTotal++
  quality.windowBad++
  quality.lastBadFrameAt = now
  quality.lastError = {
    type: errorType,
    at: now,
    ...detail,
  }
  updateQualityStatus(quality, detail.blocking ? 'device_error' : null)
  broadcastDataQualityIfNeeded(portPath, dataItem, broadcastFn, now)
}

function recordGoodFrame(portPath, dataItem, frameLength, pointCount, receivedAt) {
  const quality = ensureDataQuality(dataItem)
  resetQualityWindow(quality, receivedAt)
  quality.totalFrames++
  quality.consecutiveBadFrames = 0
  quality.windowTotal++
  quality.lastGoodFrameAt = receivedAt
  updateQualityStatus(quality)

  state.frameSeq += 1
  dataItem.rawFrame = {
    frame_id: state.frameSeq,
    received_at: receivedAt,
    port: portPath,
    baud_rate: dataItem.baudRate,
    frame_length: frameLength,
    hardware_sample_rate_hz: dataItem.hardwareSampleRateHz || null,
  }
  dataItem.rawPointArray = {
    point_count: pointCount,
    received_at: receivedAt,
  }
}

function validateMatrixPointCount(portPath, dataItem, arr, broadcastFn) {
  const expected = MATRIX_POINT_COUNTS[dataItem.type]
  if (!expected || !Array.isArray(arr)) return true
  if (arr.length === expected) return true
  recordBadFrame(portPath, dataItem, broadcastFn, 'matrix_size_mismatch', {
    expectedLength: expected,
    actualLength: arr.length,
    deviceType: dataItem.type,
    blocking: true,
  })
  dataItem.status = 'matrix_error'
  return false
}

/**
 * Track port connection history (record only, no auto-close)
 */
function trackPortAndCleanup(newPortPath) {
  state.portHistory = state.portHistory.filter(p => p.path !== newPortPath)
  state.portHistory.push({ path: newPortPath, connectedAt: Date.now() })
  console.log(`[PortTrack] Port history updated: [${state.portHistory.map(p => p.path).join(', ')}] (${state.portHistory.length} ports active)`)
}

function clearRuntimeTimers() {
  if (state.playtimer) {
    clearInterval(state.playtimer)
    state.playtimer = null
  }
  state.MaxHZ = undefined
  state.HZ = 30
  state.sendDataLength = 0
  state.oldTimeObj = {}
}

function closePortItem(portPath, item) {
  return new Promise((resolve) => {
    if (!item) {
      resolve(false)
      return
    }

    try {
      item.parser?.removeAllListeners?.()
      item.port?.removeAllListeners?.()
      if (item.port?.isOpen) {
        item.port.close((err) => {
          if (err) console.warn(`[Serial] Error closing port ${portPath}: ${err.message}`)
          else console.log(`[Serial] Port closed: ${portPath}`)
          resolve(!err)
        })
        return
      }
    } catch (err) {
      console.warn(`[Serial] Error cleaning port ${portPath}: ${err.message}`)
    }

    resolve(false)
  }).finally(() => {
    delete state.parserArr[portPath]
    delete state.dataMap[portPath]
    delete state.lastDataTime[portPath]
    delete state.macInfo[portPath]
    state.portHistory = state.portHistory.filter(p => p.path !== portPath)
  })
}

async function cleanupSerialResources() {
  const portPaths = Object.keys(state.parserArr)
  await Promise.all(portPaths.map(portPath => closePortItem(portPath, state.parserArr[portPath])))
  state.parserArr = {}
  state.dataMap = {}
  state.macInfo = {}
  state.linkIngPort = []
  state.portHistory = []
  state.lastDataTime = {}
  clearRuntimeTimers()
  return { cleaned: portPaths.length }
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
  let busyError = null

  for (const baud of BAUD_CANDIDATES) {
    try {
      const matched = await tryBaudRate(portPath, baud, splitBuffer, BAUD_DETECT_TIMEOUT)
      if (matched) {
        console.log(`[BaudDetect] ${portPath} -> baud ${baud} matched (delimiter + frame length validated)`)
        return baud
      }
    } catch (err) {
      if (isPortBusyError(err)) {
        busyError = err
        break
      }
      console.warn(`[BaudDetect] ${portPath} @ ${baud} error: ${err.message}`)
    }
  }

  if (busyError) {
    throw createConnectionError('PORT_BUSY', 'detect_baud', busyError.message)
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
  return new Promise((resolve, reject) => {
    let port = null
    let timer = null
    let resolved = false
    const window = []
    let totalBytes = 0
    let delimiterFound = false
    let frameBytesAfterDelimiter = 0

    function finish(success, err) {
      if (resolved) return
      resolved = true
      if (timer) clearTimeout(timer)

      const settle = () => {
        if (err) reject(err)
        else resolve(success)
      }

      if (port) {
        port.removeAllListeners('data')
        port.removeAllListeners('error')
        if (port.isOpen) {
          port.close(() => settle())
        } else {
          settle()
        }
      } else {
        settle()
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
          finish(false, isPortBusyError(err) ? err : null)
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
 * Send every 300ms, timeout defaults to config and can be overridden per connection flow.
 */
function sendMacCommand(port, options = {}) {
  const { AT_MAC_COMMAND, MAC_SEND_INTERVAL, MAC_WAIT_TIMEOUT } = constantObj
  const waitTimeout = options.timeoutMs || MAC_WAIT_TIMEOUT

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
      console.warn(`[MAC] Timeout after ${waitTimeout}ms, device may not support MAC query`)
      resolve({ uniqueId: null, version: null })
    }, waitTimeout)
  })
}

/**
 * Resolve device type via online server query
 */
async function resolveDeviceTypeOnline(uniqueId, timeoutMs = 5000) {
  try {
    const [response, time] = await Promise.all([
      axios.get(`${constantObj.backendAddress}/device-manage/device/getDetail/${uniqueId}`, { timeout: timeoutMs }),
      axios.get(`${constantObj.timeServerAddress}/rcv/login/getSystemTime`, { timeout: timeoutMs }),
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
async function resolveDeviceType(uniqueId, options = {}) {
  const localResult = resolveDeviceTypeLocal(uniqueId)
  if (localResult.type) {
    return localResult
  }

  if (constantObj.AUTH_MODE === 'online') {
    console.log(`[Auth] Local cache miss, querying online for ${uniqueId}...`)
    return resolveDeviceTypeOnline(uniqueId, options.timeoutMs)
  }

  console.warn(`[Auth] Local mode, ${uniqueId} not in cache, please add manually`)
  return { type: null, premission: false }
}

// ═══════════════════════════════════════════════════════════
//  Data Frame Processing Helpers
// ═══════════════════════════════════════════════════════════

function applyBackMultiplier(arr, dataItem) {
  if (!Array.isArray(arr)) return arr
  if (!String(dataItem?.type || '').endsWith('-back')) return arr
  return arr.map((value) => {
    const numeric = Number(value) || 0
    return Number((numeric * BACK_VALUE_MULTIPLIER).toFixed(4))
  })
}

function processMatrixData(pointArr, dataItem) {
  const t = dataItem.type
  if (t === 'hand') return hand(pointArr)
  if (t === 'bed') return jqbed(pointArr)
  if (t === 'car-back') return applyBackMultiplier(jqbed(pointArr), dataItem)
  if (t === 'endi-sit') return endiSit1024(pointArr)
  if (t === 'endi-back') return applyBackMultiplier(endiBack1024(pointArr), dataItem)
  if (t === 'carY-sit') return carYSitLine(pointArr)
  if (t === 'carY-back') return applyBackMultiplier(carYBackLine(pointArr), dataItem)
  return pointArr
}

function processTypedMatrixData(pointArr, dataItem) {
  const t = dataItem.type
  if (t === 'car-back') return applyBackMultiplier(jqbed(pointArr), dataItem)
  if (t === 'car-sit' || t === 'bed') return jqbed(pointArr)
  if (t === 'endi-sit') return endiSit1024(pointArr)
  if (t === 'endi-back') return applyBackMultiplier(endiBack1024(pointArr), dataItem)
  if (t === 'carY-sit') return carYSitLine(pointArr)
  if (t === 'carY-back') return applyBackMultiplier(carYBackLine(pointArr), dataItem)
  return pointArr
}

function updateHZAndStartTimer(dataItem, stamp, onTimerStart, portPath, broadcastFn) {
  if (state.oldTimeObj[dataItem.type]) {
    const intervalMs = stamp - state.oldTimeObj[dataItem.type]
    if (intervalMs < MIN_HZ_INTERVAL) return false

    const sampleRateHz = Math.max(1, Math.round(1000 / intervalMs))
    const quality = ensureDataQuality(dataItem)
    const previousHz = Number(dataItem.sampleRateHz)
    dataItem.frameIntervalMs = intervalMs
    dataItem.sampleRateHz = sampleRateHz
    dataItem.HZ = sampleRateHz

    if (intervalMs >= HZ_ZERO_THRESHOLD_MS || (previousHz > 0 && (sampleRateHz > previousHz * HZ_JUMP_FACTOR || sampleRateHz < previousHz / HZ_JUMP_FACTOR))) {
      quality.hzAbnormal = true
      quality.lastError = {
        type: 'sample_rate_abnormal',
        at: stamp,
        previousHz,
        sampleRateHz,
        intervalMs,
      }
      updateQualityStatus(quality)
      if (portPath && broadcastFn) broadcastDataQualityIfNeeded(portPath, dataItem, broadcastFn, stamp)
    } else {
      quality.hzAbnormal = false
      updateQualityStatus(quality)
    }

    if (!state.MaxHZ && state.oldTimeObj[dataItem.type]) {
      state.MaxHZ = sampleRateHz
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
    const receivedAt = Date.now()

    if (!pointArr.length) {
      recordBadFrame(portPath, dataItem, broadcastFn, 'empty_frame', { actualLength: 0 })
      return
    }

    // Update lastDataTime for zombie detection
    state.lastDataTime[portPath] = receivedAt

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
      recordGoodFrame(portPath, dataItem, pointArr.length, pointArr.length, receivedAt)
      return
    }

    // -- Glove 256 matrix split (130 bytes) --
    if (pointArr.length === 130) {
      const orderByte = pointArr[0]
      const typeByte = pointArr[1]
      const arr = pointArr.slice(2)
      dataItem[constantObj.order[orderByte]] = arr
      dataItem.type = constantObj.handTypeMap[typeByte] || constantObj.type[typeByte]
      dataItem.stamp = receivedAt
      recordGoodFrame(portPath, dataItem, pointArr.length, arr.length, receivedAt)
      return
    }

    // -- Sit pad 1024 matrix --
    if (pointArr.length === 1024) {
      if (!dataItem.premission) return
      dataItem.arr = processMatrixData(pointArr, dataItem)
      if (!validateMatrixPointCount(portPath, dataItem, dataItem.arr, broadcastFn)) return

      const stamp = receivedAt
      dataItem.stamp = stamp
      recordGoodFrame(portPath, dataItem, pointArr.length, dataItem.arr.length, stamp)
      if (!updateHZAndStartTimer(dataItem, stamp, onTimerStart, portPath, broadcastFn)) return

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
      if (!validateMatrixPointCount(portPath, dataItem, dataItem.arr, broadcastFn)) return

      const stamp = receivedAt
      dataItem.stamp = stamp
      recordGoodFrame(portPath, dataItem, pointArr.length, dataItem.arr.length, stamp)
      if (!updateHZAndStartTimer(dataItem, stamp, onTimerStart, portPath, broadcastFn)) return
      return
    }

    // -- Glove 146 bytes (with quaternion) --
    if (pointArr.length === 146) {
      const rotateData = pointArr.slice(pointArr.length - 16)
      const nextData = pointArr.slice(2, pointArr.length - 16)
      dataItem.next = nextData
      dataItem.stamp = receivedAt
      const typeByte = pointArr[1]
      dataItem.type = constantObj.handTypeMap[typeByte] || dataItem.type
      dataItem.rotate = bytes4ToInt10(rotateData)
      recordGoodFrame(portPath, dataItem, pointArr.length, nextData.length, receivedAt)
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
        dataItem.arr = applyBackMultiplier(endiBack(pointArr), dataItem)
      } else if (dataItem.type === 'carY-sit') {
        dataItem.arr = carYSitLine(pointArr)
      } else if (dataItem.type === 'carY-back') {
        dataItem.arr = applyBackMultiplier(carYBackLine(pointArr), dataItem)
      } else {
        dataItem.arr = pointArr
      }
      if (!validateMatrixPointCount(portPath, dataItem, dataItem.arr, broadcastFn)) return

      const stamp = receivedAt
      if (state.sendDataLength < 20) state.sendDataLength++

      if (state.oldTimeObj[dataItem.type]) {
        const intervalMs = stamp - state.oldTimeObj[dataItem.type]
        const sampleRateHz = Math.max(1, Math.round(1000 / intervalMs))
        dataItem.frameIntervalMs = intervalMs
        dataItem.sampleRateHz = sampleRateHz
        dataItem.HZ = sampleRateHz
        if (!state.MaxHZ && state.sendDataLength === 20) {
          state.MaxHZ = sampleRateHz
          state.HZ = state.MaxHZ
          state.playtimer = setInterval(onTimerStart, 1000 / state.HZ)
          state.sendDataLength = 0
        }
      }
      dataItem.stamp = stamp
      state.oldTimeObj[dataItem.type] = stamp
      recordGoodFrame(portPath, dataItem, pointArr.length, dataItem.arr.length, stamp)
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
        dataItem.arr = applyBackMultiplier(endiBack(matrixData), dataItem)
      } else if (dataItem.type === 'carY-sit') {
        dataItem.arr = carYSitLine(matrixData)
      } else if (dataItem.type === 'carY-back') {
        dataItem.arr = applyBackMultiplier(carYBackLine(matrixData), dataItem)
      } else {
        dataItem.arr = matrixData
      }
      if (!validateMatrixPointCount(portPath, dataItem, dataItem.arr, broadcastFn)) return

      const stamp = receivedAt
      if (state.oldTimeObj[dataItem.type]) {
        const intervalMs = stamp - state.oldTimeObj[dataItem.type]
        const sampleRateHz = Math.max(1, Math.round(1000 / intervalMs))
        dataItem.frameIntervalMs = intervalMs
        dataItem.sampleRateHz = sampleRateHz
        dataItem.HZ = sampleRateHz
        if (!state.MaxHZ) {
          state.MaxHZ = sampleRateHz
          state.HZ = state.MaxHZ
          state.playtimer = setInterval(onTimerStart, 1000 / state.HZ)
        }
      }
      dataItem.stamp = stamp
      state.oldTimeObj[dataItem.type] = stamp
      recordGoodFrame(portPath, dataItem, pointArr.length, dataItem.arr.length, stamp)
      updateArrList(dataItem, matrixData)
      return
    }

    recordBadFrame(portPath, dataItem, broadcastFn, 'frame_length_mismatch', {
      expectedLengths: VALID_FRAME_LENGTHS,
      actualLength: pointArr.length,
      deviceType: dataItem.type || dataItem.deviceClass || 'unknown',
    })
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
  try {
    return await runWithConnectionLock('connect', async () => connectPortUnlocked(broadcastFn, onTimerStart, {
      cleanupBeforeConnect: true,
    }))
  } catch (err) {
    const normalized = normalizeConnectionError(err)
    broadcastFn(JSON.stringify({ connectResult: serializeConnectionError(normalized) }))
    await cleanupSerialResources().catch((cleanupErr) => {
      console.warn(`[Connect] Cleanup after failure failed: ${cleanupErr.message}`)
    })
    throw normalized
  }
}

async function connectPortUnlocked(broadcastFn, onTimerStart, options = {}) {
  state.macInfo = {}
  const { splitArr, BAUD_DEVICE_MAP } = constantObj
  const splitBuffer = Buffer.from(splitArr)
  const connectedPorts = []
  const failedPorts = []

  if (options.cleanupBeforeConnect !== false) {
    broadcastFn(JSON.stringify({ connectProgress: { stage: 'cleaning' } }))
    await cleanupSerialResources()
  }

  const rawPorts = await withTimeout(
    SerialPort.list(),
    SCAN_TIMEOUT,
    createConnectionError('NO_PORT', 'scan', 'SerialPort.list timeout')
  )

  if (!rawPorts.length) {
    throw createConnectionError('NO_PORT')
  }

  const ports = getPort(rawPorts)
  console.log(`[Connect] Found ${ports.length} CH340 serial port(s)`)

  if (!ports.length) {
    throw createConnectionError('NO_CH340')
  }

  const detectedPorts = []
  for (const portInfo of ports) {
    const { path: portPath } = portInfo
    console.log(`[Connect] Detecting baud rate for ${portPath}...`)
    broadcastFn(JSON.stringify({ connectProgress: { path: portPath, stage: 'detecting_baud' } }))

    let detectedBaud = null
    try {
      detectedBaud = await detectBaudRate(portPath)
    } catch (err) {
      const normalized = normalizeConnectionError(err, 'BAUD_FAIL', 'detect_baud')
      failedPorts.push({ path: portPath, status: normalized.code === 'PORT_BUSY' ? 'port_busy' : 'baud_detect_failed', code: normalized.code, message: normalized.userMessage })
      continue
    }

    if (!detectedBaud) {
      console.warn(`[Connect] ${portPath} baud rate detection failed`)
      failedPorts.push({ path: portPath, status: 'baud_detect_failed', code: 'BAUD_FAIL', message: CONNECTION_ERROR_META.BAUD_FAIL.message })
      continue
    }

    detectedPorts.push({ portInfo, detectedBaud })
    await new Promise(r => setTimeout(r, POST_DETECT_DELAY))
  }

  if (detectedPorts.length > 0) {
    await new Promise(r => setTimeout(r, POST_ALL_DETECT_DELAY))
  }

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
      const code = isPortBusyError(err) ? 'PORT_BUSY' : 'OPEN_FAIL'
      console.error(`[Connect] ${portPath} all connection attempts failed: ${err.message}`)
      failedPorts.push({ path: portPath, status: code === 'PORT_BUSY' ? 'port_busy' : 'open_failed', code, message: CONNECTION_ERROR_META[code].message })
      continue
    }

    const parserItem = state.parserArr[portPath] = {
      port: stablePort,
      parser: stableParser,
      baudRate: detectedBaud,
    }
    const dataItem = state.dataMap[portPath] = state.dataMap[portPath] || {}
    dataItem.deviceClass = deviceClass
    dataItem.baudRate = detectedBaud
    dataItem.type = null
    dataItem.premission = false
    state.lastDataTime[portPath] = Date.now()
    trackPortAndCleanup(portPath)

    if (deviceClass === 'sit' || deviceClass === 'foot') {
      try {
        console.log(`[Connect] ${portPath} -> ${deviceClass} device, querying MAC...`)
        broadcastFn(JSON.stringify({ connectProgress: { path: portPath, stage: 'getting_mac' } }))
        const { uniqueId, version } = await sendMacCommand(stablePort, { timeoutMs: MAC_CONNECT_TIMEOUT })
        if (!uniqueId) {
          failedPorts.push({ path: portPath, status: 'mac_failed', code: 'MAC_FAIL', message: CONNECTION_ERROR_META.MAC_FAIL.message })
          await closePortItem(portPath, parserItem)
          continue
        }

        state.macInfo[portPath] = { uniqueId, version }
        broadcastFn(JSON.stringify({ connectProgress: { path: portPath, stage: 'resolving_type', uniqueId } }))
        const { type: deviceType, premission } = await resolveDeviceType(uniqueId, { timeoutMs: TYPE_RESOLVE_TIMEOUT })

        if (!deviceType) {
          failedPorts.push({ path: portPath, status: 'type_unknown', code: 'TYPE_UNKNOWN', message: CONNECTION_ERROR_META.TYPE_UNKNOWN.message })
          await closePortItem(portPath, parserItem)
          continue
        }

        if (!premission) {
          failedPorts.push({ path: portPath, status: 'auth_failed', code: 'AUTH_FAIL', message: CONNECTION_ERROR_META.AUTH_FAIL.message })
          await closePortItem(portPath, parserItem)
          continue
        }

        dataItem.type = deviceType
        dataItem.premission = true
        bindDataHandler(portPath, parserItem, dataItem, broadcastFn, onTimerStart, ports)
        broadcastFn(JSON.stringify({ deviceUpdate: { path: portPath, type: deviceType, premission: true } }))
      } catch (err) {
        const normalized = normalizeConnectionError(err, 'MAC_FAIL', 'mac')
        failedPorts.push({ path: portPath, status: 'mac_or_type_failed', code: normalized.code, message: normalized.userMessage })
        await closePortItem(portPath, parserItem)
        continue
      }
    } else if (deviceClass === 'hand') {
      dataItem.type = 'hand'
      dataItem.premission = true
      bindDataHandler(portPath, parserItem, dataItem, broadcastFn, onTimerStart, ports)
      sendMacCommand(stablePort, { timeoutMs: MAC_CONNECT_TIMEOUT }).then(({ uniqueId, version }) => {
        if (uniqueId) {
          state.macInfo[portPath] = { uniqueId, version }
          console.log(`[Connect] ${portPath} hand MAC: ${uniqueId}`)
        }
      }).catch(() => {})
    } else {
      failedPorts.push({ path: portPath, status: 'type_unknown', code: 'TYPE_UNKNOWN', message: CONNECTION_ERROR_META.TYPE_UNKNOWN.message })
      await closePortItem(portPath, parserItem)
      continue
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

  if (!connectedPorts.length) {
    const code = pickConnectionErrorCode(failedPorts)
    throw createConnectionError(code)
  }

  const result = {
    success: true,
    ports: connectedPorts,
    failedPorts,
    macInfo: state.macInfo,
    authMode: constantObj.AUTH_MODE,
  }

  broadcastFn(JSON.stringify({ connectResult: result }))
  if (Object.keys(state.macInfo).length > 0) {
    broadcastFn(JSON.stringify({ macInfo: state.macInfo }))
  }

  console.log(`[Connect] One-click connect done, connected ${connectedPorts.length}/${ports.length} device(s)`)
  return result
}

function pickConnectionErrorCode(failedPorts) {
  const priority = ['PORT_BUSY', 'MAC_FAIL', 'TYPE_UNKNOWN', 'AUTH_FAIL', 'OPEN_FAIL', 'BAUD_FAIL']
  const codes = new Set(failedPorts.map(item => item.code))
  return priority.find(code => codes.has(code)) || 'OPEN_FAIL'
}

function serializeConnectionError(err) {
  const normalized = normalizeConnectionError(err)
  return {
    success: false,
    code: normalized.code,
    stage: normalized.stage,
    message: normalized.userMessage,
    detail: normalized.message,
  }
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
  try {
    return await runWithConnectionLock('rescan', async () => {
      console.log('[Rescan] Starting full reconnect...')
      broadcastFn(JSON.stringify({ rescanProgress: { stage: 'cleaning' } }))
      const cleanupResult = await cleanupSerialResources()
      await new Promise(r => setTimeout(r, 1000))

      console.log(`[Rescan] Cleaned ${cleanupResult.cleaned} port(s), reconnecting...`)
      broadcastFn(JSON.stringify({ rescanProgress: { stage: 'reconnecting', cleaned: cleanupResult.cleaned } }))

      const result = await connectPortUnlocked(broadcastFn, onTimerStart, { cleanupBeforeConnect: false })
      broadcastFn(JSON.stringify({ rescanProgress: { stage: 'done', cleaned: cleanupResult.cleaned, result } }))
      console.log('[Rescan] Rescan complete')
      return result
    })
  } catch (err) {
    const normalized = normalizeConnectionError(err)
    broadcastFn(JSON.stringify({ rescanProgress: { stage: 'failed', error: serializeConnectionError(normalized) } }))
    broadcastFn(JSON.stringify({ connectResult: serializeConnectionError(normalized) }))
    await cleanupSerialResources().catch((cleanupErr) => {
      console.warn(`[Rescan] Cleanup after failure failed: ${cleanupErr.message}`)
    })
    throw normalized
  }
}

// ═══════════════════════════════════════════════════════════
//  Stop All Ports
// ═══════════════════════════════════════════════════════════

async function stopPort() {
  const result = await cleanupSerialResources()
  state.connectionTask = null
  state.connectionTaskStartedAt = 0
  state.connectionMode = null
  return result
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
