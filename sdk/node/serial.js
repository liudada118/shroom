'use strict'

const DEFAULT_BAUD_CANDIDATES = [921600, 1000000, 3000000]
const DEFAULT_BAUD_DEVICE_MAP = {
  921600: 'hand',
  1000000: 'sit',
  3000000: 'foot',
}
const DEFAULT_DELIMITER = Buffer.from([0xaa, 0x55, 0x03, 0x99])
const DEFAULT_AT_MAC_COMMAND = Buffer.from('41542B4E414D453D45535033320d0a', 'hex')
const VALID_FRAME_LENGTHS = [18, 130, 146, 1024, 1025, 4096, 4097]

const DEFAULT_BAUD_DETECT_TIMEOUT = 2000
const DEFAULT_CONNECT_TIMEOUT = 2000
const DEFAULT_CONNECT_RETRIES = 3
const DEFAULT_CONNECT_RETRY_DELAY = 500
const DEFAULT_MAC_SEND_INTERVAL = 300
const DEFAULT_MAC_WAIT_TIMEOUT = 3000

class ShroomSerialError extends Error {
  constructor(message, details = {}) {
    super(message)
    this.name = 'ShroomSerialError'
    Object.assign(this, details)
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getSerialDependencies(options = {}) {
  if (options.SerialPort && options.DelimiterParser) {
    return {
      SerialPort: options.SerialPort,
      DelimiterParser: options.DelimiterParser,
    }
  }

  try {
    const serialport = require('serialport')
    return {
      SerialPort: options.SerialPort || serialport.SerialPort,
      DelimiterParser: options.DelimiterParser || serialport.DelimiterParser,
    }
  } catch (err) {
    throw new ShroomSerialError('serialport is required for node serial functions. Install optional dependency "serialport".', {
      code: 'SERIALPORT_NOT_AVAILABLE',
      cause: err,
    })
  }
}

function normalizeDelimiter(delimiter = DEFAULT_DELIMITER) {
  return Buffer.isBuffer(delimiter) ? delimiter : Buffer.from(delimiter)
}

function filterSerialPorts(ports = [], platform = process.platform) {
  if (platform === 'win32') {
    return ports.filter((port) => String(port.manufacturer || '').toLowerCase() === 'wch.cn')
  }
  if (platform === 'darwin') {
    return ports.filter((port) => String(port.path || '').toLowerCase().includes('usb'))
  }
  return [...ports]
}

async function listSerialPorts(options = {}) {
  const { SerialPort } = getSerialDependencies(options)
  return SerialPort.list()
}

async function listDevicePorts(options = {}) {
  const ports = await listSerialPorts(options)
  return filterSerialPorts(ports, options.platform || process.platform)
}

function isPortBusyError(err) {
  const message = String(err?.message || err || '').toLowerCase()
  return message.includes('busy')
    || message.includes('access denied')
    || message.includes('permission')
    || message.includes('denied')
    || message.includes('already open')
}

function openRawPort(path, baudRate, options = {}) {
  const { SerialPort } = getSerialDependencies(options)
  return new SerialPort({ path, baudRate, autoOpen: false })
}

function tryBaudRate(path, baudRate, options = {}) {
  const delimiter = normalizeDelimiter(options.delimiter)
  const timeoutMs = options.timeoutMs || DEFAULT_BAUD_DETECT_TIMEOUT

  return new Promise((resolve, reject) => {
    let port = null
    let timer = null
    let resolved = false
    const slidingWindow = []
    let delimiterFound = false
    let frameBytesAfterDelimiter = 0

    const finish = (matched, err) => {
      if (resolved) return
      resolved = true
      if (timer) clearTimeout(timer)

      const settle = () => {
        if (err) reject(err)
        else resolve(matched)
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

    const pushAndMatchDelimiter = (byte) => {
      slidingWindow.push(byte)
      if (slidingWindow.length > delimiter.length) slidingWindow.shift()
      if (slidingWindow.length !== delimiter.length) return false
      for (let i = 0; i < delimiter.length; i += 1) {
        if (slidingWindow[i] !== delimiter[i]) return false
      }
      return true
    }

    try {
      port = openRawPort(path, baudRate, options)

      port.on('error', (err) => finish(false, isPortBusyError(err) ? err : null))

      port.open((err) => {
        if (err) {
          finish(false, isPortBusyError(err) ? err : null)
          return
        }

        const onData = (chunk) => {
          const bytes = Buffer.from(chunk)
          for (let i = 0; i < bytes.length; i += 1) {
            const byte = bytes[i]

            if (!delimiterFound) {
              if (pushAndMatchDelimiter(byte)) {
                delimiterFound = true
                frameBytesAfterDelimiter = 0
              }
              continue
            }

            frameBytesAfterDelimiter += 1
            if (pushAndMatchDelimiter(byte)) {
              const frameLength = frameBytesAfterDelimiter - delimiter.length
              finish(VALID_FRAME_LENGTHS.includes(frameLength) || frameLength >= 0)
              return
            }

            if (frameBytesAfterDelimiter > 8200) {
              finish(true)
              return
            }
          }
        }

        port.on('data', onData)
        timer = setTimeout(() => finish(delimiterFound), timeoutMs)
      })
    } catch (err) {
      finish(false, err)
    }
  })
}

async function detectBaudRate(path, options = {}) {
  const candidates = options.baudCandidates || DEFAULT_BAUD_CANDIDATES
  let busyError = null

  for (const baudRate of candidates) {
    try {
      const matched = await tryBaudRate(path, baudRate, options)
      if (matched) return baudRate
    } catch (err) {
      if (isPortBusyError(err)) {
        busyError = err
        break
      }
      if (options.onError) options.onError(err, { path, baudRate, stage: 'detect_baud' })
    }
  }

  if (busyError) {
    throw new ShroomSerialError(`Serial port is busy: ${path}`, {
      code: 'PORT_BUSY',
      path,
      cause: busyError,
    })
  }
  return null
}

function openSerialConnection(path, baudRate, options = {}) {
  const { DelimiterParser } = getSerialDependencies(options)
  const delimiter = normalizeDelimiter(options.delimiter)
  const timeoutMs = options.timeoutMs || DEFAULT_CONNECT_TIMEOUT

  return new Promise((resolve, reject) => {
    const port = openRawPort(path, baudRate, options)
    const timer = setTimeout(() => {
      reject(new ShroomSerialError(`Connection timeout after ${timeoutMs}ms`, {
        code: 'CONNECT_TIMEOUT',
        path,
        baudRate,
      }))
    }, timeoutMs)

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
      resolve(createSerialConnection({ path, baudRate, port, parser }))
    })
  })
}

async function openSerialConnectionWithRetry(path, baudRate, options = {}) {
  const retries = options.retries || DEFAULT_CONNECT_RETRIES
  const retryDelayMs = options.retryDelayMs || DEFAULT_CONNECT_RETRY_DELAY
  let lastError = null

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      return await openSerialConnection(path, baudRate, options)
    } catch (err) {
      lastError = err
      if (attempt < retries) await sleep(retryDelayMs)
    }
  }

  throw lastError || new ShroomSerialError(`Failed to connect serial port: ${path}`, {
    code: 'CONNECT_FAILED',
    path,
    baudRate,
  })
}

function sendMacCommand(port, options = {}) {
  const command = options.command || DEFAULT_AT_MAC_COMMAND
  const sendIntervalMs = options.sendIntervalMs || DEFAULT_MAC_SEND_INTERVAL
  const timeoutMs = options.timeoutMs || DEFAULT_MAC_WAIT_TIMEOUT

  return new Promise((resolve) => {
    let timer = null
    let interval = null
    let resolved = false
    let textBuffer = ''
    let collectTimer = null

    const cleanup = () => {
      if (resolved) return
      resolved = true
      if (timer) clearTimeout(timer)
      if (interval) clearInterval(interval)
      if (collectTimer) clearTimeout(collectTimer)
      port.removeListener('data', onData)
    }

    const extractAndResolve = () => {
      cleanup()
      const uniqueIdMatch = textBuffer.match(/Unique ID:\s*([0-9A-Fa-f]+)/)
      const versionMatch = textBuffer.match(/Versions?:\s*([^\s]+)/)
      resolve({
        uniqueId: uniqueIdMatch ? uniqueIdMatch[1] : null,
        version: versionMatch ? versionMatch[1] : null,
        raw: textBuffer,
      })
    }

    const onData = (data) => {
      try {
        textBuffer += Buffer.from(data).toString('utf8')
        if (textBuffer.length > 10000) textBuffer = textBuffer.slice(-10000)
        if (textBuffer.includes('Unique ID') && !collectTimer) {
          if (interval) clearInterval(interval)
          collectTimer = setTimeout(extractAndResolve, 500)
        }
      } catch {
        // Ignore non-text data.
      }
    }

    const sendOnce = () => {
      if (port.isOpen && !resolved) {
        port.write(command, (err) => {
          if (err && options.onError) options.onError(err)
        })
      }
    }

    port.on('data', onData)
    sendOnce()
    interval = setInterval(sendOnce, sendIntervalMs)
    timer = setTimeout(() => {
      cleanup()
      resolve({ uniqueId: null, version: null, raw: textBuffer })
    }, timeoutMs)
  })
}

function createSerialConnection(connection) {
  return {
    ...connection,
    onFrame(handler) {
      const listener = (data) => {
        const buffer = Buffer.from(data)
        handler({
          path: connection.path,
          baudRate: connection.baudRate,
          receivedAt: Date.now(),
          buffer,
          bytes: Array.from(buffer),
          length: buffer.length,
        })
      }
      connection.parser.on('data', listener)
      return () => connection.parser.removeListener('data', listener)
    },
    readMac(options = {}) {
      return sendMacCommand(connection.port, options)
    },
    close() {
      return closeSerialConnection(connection)
    },
  }
}

function closeSerialConnection(connection) {
  return new Promise((resolve) => {
    if (!connection) {
      resolve(false)
      return
    }
    try {
      connection.parser?.removeAllListeners?.()
      connection.port?.removeAllListeners?.()
      if (connection.port?.isOpen) {
        connection.port.close((err) => resolve(!err))
        return
      }
    } catch {
      // Ignore cleanup errors and report closed=false.
    }
    resolve(false)
  })
}

async function connectSerialPort(portInfoOrPath, options = {}) {
  const path = typeof portInfoOrPath === 'string'
    ? portInfoOrPath
    : portInfoOrPath?.path || portInfoOrPath?.comName
  if (!path) {
    throw new ShroomSerialError('Serial port path is required.', { code: 'PATH_REQUIRED' })
  }

  const baudRate = options.baudRate || await detectBaudRate(path, options)
  if (!baudRate) {
    throw new ShroomSerialError(`Baud rate detection failed: ${path}`, {
      code: 'BAUD_DETECT_FAILED',
      path,
    })
  }

  const connection = await openSerialConnectionWithRetry(path, baudRate, options)
  connection.deviceClass = (options.baudDeviceMap || DEFAULT_BAUD_DEVICE_MAP)[baudRate] || 'unknown'
  if (options.onFrame) connection.onFrame(options.onFrame)
  return connection
}

async function connectSerialDevices(options = {}) {
  const ports = options.ports || await listDevicePorts(options)
  const connections = []
  const failedPorts = []

  for (const portInfo of ports) {
    const path = typeof portInfo === 'string' ? portInfo : portInfo.path || portInfo.comName
    try {
      const connection = await connectSerialPort(path, options)
      connections.push(connection)
    } catch (err) {
      failedPorts.push({
        path,
        error: err,
        code: err.code || 'CONNECT_FAILED',
        message: err.message,
      })
      if (options.onError) options.onError(err, { path, stage: 'connect' })
    }
  }

  return { connections, failedPorts }
}

module.exports = {
  DEFAULT_BAUD_CANDIDATES,
  DEFAULT_BAUD_DEVICE_MAP,
  DEFAULT_DELIMITER,
  DEFAULT_AT_MAC_COMMAND,
  VALID_FRAME_LENGTHS,
  ShroomSerialError,
  filterSerialPorts,
  listSerialPorts,
  listDevicePorts,
  isPortBusyError,
  tryBaudRate,
  detectBaudRate,
  openSerialConnection,
  openSerialConnectionWithRetry,
  sendMacCommand,
  createSerialConnection,
  closeSerialConnection,
  connectSerialPort,
  connectSerialDevices,
}
