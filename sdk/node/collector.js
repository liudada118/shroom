'use strict'

const { EventEmitter } = require('events')
const serial = require('./serial')
const protocol = require('./protocol')
const { resolveDeviceType } = require('./auth')
const { createDeviceCache } = require('./device-cache')

function normalizeRecordName(value) {
  const text = String(value || '').trim()
  return text || new Date().toISOString()
}

function buildFrameRecord(parsed, context = {}) {
  return {
    timestamp: parsed.rawFrame?.received_at || Date.now(),
    path: parsed.rawFrame?.port || context.path || '',
    baudRate: parsed.rawFrame?.baud_rate || context.baudRate || null,
    type: parsed.type || context.type || '',
    kind: parsed.kind,
    data: parsed,
  }
}

class ShroomCollector extends EventEmitter {
  constructor(options = {}) {
    super()
    this.options = { ...options }
    this.connections = new Map()
    this.accumulators = new Map()
    this.macInfo = new Map()
    this.recording = false
    this.recordName = ''
    this.frames = []
    this.cache = options.cache === false ? null : options.cache || createDeviceCache(options)
  }

  async connectAll(options = {}) {
    const merged = { ...this.options, ...options }
    const result = await serial.connectSerialDevices({
      ...merged,
      onFrame: (frame) => this.handleRawFrame(frame),
    })
    result.connections.forEach((connection) => this.registerConnection(connection))
    this.emit('connected', result)
    return result
  }

  async connectPort(portInfoOrPath, options = {}) {
    const merged = { ...this.options, ...options }
    const connection = await serial.connectSerialPort(portInfoOrPath, {
      ...merged,
      onFrame: (frame) => this.handleRawFrame(frame),
    })
    this.registerConnection(connection)
    this.emit('connected', { connections: [connection], failedPorts: [] })
    return connection
  }

  registerConnection(connection) {
    if (!connection?.path) return connection
    this.connections.set(connection.path, connection)
    if (!this.accumulators.has(connection.path)) {
      this.accumulators.set(connection.path, protocol.createFrameAccumulator({
        type: this.options.typeByPath?.[connection.path] || '',
      }))
    }
    return connection
  }

  async readMac(connectionOrPath, options = {}) {
    const connection = typeof connectionOrPath === 'string'
      ? this.connections.get(connectionOrPath)
      : connectionOrPath
    if (!connection) return { uniqueId: null, version: null, raw: '' }
    const mac = await connection.readMac(options)
    if (mac.uniqueId) {
      this.macInfo.set(connection.path, mac)
      this.emit('mac', { path: connection.path, ...mac })
      if (options.resolveType !== false) {
        const auth = await resolveDeviceType(mac.uniqueId, {
          ...this.options,
          ...options,
          cache: this.cache || false,
        })
        this.emit('device-type', { path: connection.path, uniqueId: mac.uniqueId, ...auth })
      }
    }
    return mac
  }

  handleRawFrame(frame, context = {}) {
    const path = frame?.path || context.path || ''
    let accumulator = this.accumulators.get(path)
    if (!accumulator) {
      accumulator = protocol.createFrameAccumulator({
        type: this.options.typeByPath?.[path] || context.type || '',
      })
      this.accumulators.set(path, accumulator)
    }
    const parsed = accumulator.push(frame, {
      ...this.options,
      ...context,
      path,
      baudRate: frame?.baudRate,
      receivedAt: frame?.receivedAt,
    })
    if (parsed.kind === 'matrix' && this.macInfo.has(path)) {
      parsed.macInfo = { [path]: this.macInfo.get(path) }
      parsed.deviceMac = this.macInfo.get(path).uniqueId
    }
    return this.pushParsedFrame(parsed, { path, baudRate: frame?.baudRate })
  }

  pushParsedFrame(parsed, context = {}) {
    const record = buildFrameRecord(parsed, context)
    this.emit('frame', record)
    if (parsed.kind === 'matrix') this.emit('matrix', record)
    if (parsed.kind === 'mac') this.emit('mac', parsed)
    if (this.recording) this.frames.push(record)
    return record
  }

  startRecord(name = '') {
    this.recording = true
    this.recordName = normalizeRecordName(name)
    this.frames = []
    this.emit('record-start', { recordName: this.recordName })
    return this.recordName
  }

  stopRecord() {
    const result = {
      recordName: this.recordName,
      frames: [...this.frames],
      count: this.frames.length,
    }
    this.recording = false
    this.recordName = ''
    this.frames = []
    this.emit('record-stop', result)
    return result
  }

  getFrames() {
    return [...this.frames]
  }

  async disconnectAll() {
    const results = []
    for (const connection of this.connections.values()) {
      results.push(await serial.closeSerialConnection(connection))
    }
    this.connections.clear()
    this.accumulators.clear()
    this.emit('disconnected', results)
    return results
  }
}

function createCollector(options = {}) {
  return new ShroomCollector(options)
}

module.exports = {
  ShroomCollector,
  createCollector,
  normalizeRecordName,
  buildFrameRecord,
}
