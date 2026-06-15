'use strict'

const { bytes4ToFloat32LE } = require('../core/bytes')
const line = require('../core/line')

const ORDER_MAP = { 1: 'last', 2: 'next' }
const HAND_TYPE_MAP = { 1: 'HL', 2: 'HR' }
const TYPE_CONFIG = {
  1: 'car-back',
  2: 'car-sit',
  3: 'bed',
  4: 'endi-back',
  5: 'endi-sit',
  6: 'carY-back',
  7: 'carY-sit',
}

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

function normalizeBytes(input) {
  if (!input) return []
  if (Array.isArray(input)) return input.map((value) => Number(value) & 0xff)
  if (Buffer.isBuffer(input)) return Array.from(input)
  if (input.buffer && Buffer.isBuffer(input.buffer)) return Array.from(input.buffer)
  if (input.bytes) return normalizeBytes(input.bytes)
  if (input.data) return normalizeBytes(input.data)
  return Array.from(input).map((value) => Number(value) & 0xff)
}

function applyBackMultiplier(arr, type, multiplier = 1) {
  if (!Array.isArray(arr)) return arr
  if (!String(type || '').endsWith('-back')) return arr
  const safeMultiplier = Number(multiplier)
  if (!Number.isFinite(safeMultiplier) || safeMultiplier === 1) return arr
  return arr.map((value) => Number(((Number(value) || 0) * safeMultiplier).toFixed(4)))
}

function transformMatrixByType(rawArr, type, options = {}) {
  const arr = Array.isArray(rawArr) ? rawArr : []
  const multiplier = options.backValueMultiplier ?? 1
  if (type === 'hand') return line.hand(arr)
  if (type === 'bed') return line.jqbed(arr)
  if (type === 'car-back') return applyBackMultiplier(line.jqbed(arr), type, multiplier)
  if (type === 'car-sit') return line.jqbed(arr)
  if (type === 'endi-sit') return arr.length === 1024 ? line.endiSit1024(arr) : line.endiSit(arr)
  if (type === 'endi-back') return applyBackMultiplier(arr.length === 1024 ? line.endiBack1024(arr) : line.endiBack(arr), type, multiplier)
  if (type === 'carY-sit') return line.carYSitLine(arr)
  if (type === 'carY-back') return applyBackMultiplier(line.carYBackLine(arr), type, multiplier)
  return [...arr]
}

function validateMatrixPointCount(type, arr) {
  const expectedLength = MATRIX_POINT_COUNTS[type]
  if (!expectedLength || !Array.isArray(arr)) return { valid: true }
  if (arr.length === expectedLength) return { valid: true }
  return {
    valid: false,
    reason: 'matrix_size_mismatch',
    type,
    expectedLength,
    actualLength: arr.length,
  }
}

function parseMacText(buffer) {
  const text = Buffer.from(buffer || []).toString('utf8')
  if (!text.includes('Unique ID')) return null
  const uniqueIdMatch = text.match(/Unique ID:\s*([0-9A-Fa-f]+)/)
  const versionMatch = text.match(/Versions?:\s*([^\s]+)/)
  return {
    kind: 'mac',
    uniqueId: uniqueIdMatch ? uniqueIdMatch[1] : null,
    version: versionMatch ? versionMatch[1] : null,
    rawText: text,
  }
}

function parseSerialFrame(input, context = {}) {
  const bytes = normalizeBytes(input)
  const receivedAt = context.receivedAt || Date.now()
  const rawFrame = {
    received_at: receivedAt,
    frame_length: bytes.length,
    port: context.path || input?.path || '',
    baud_rate: context.baudRate || input?.baudRate || null,
  }

  const mac = parseMacText(bytes)
  if (mac) return { ...mac, rawFrame }

  if (bytes.length === 18) {
    return {
      kind: 'rotate',
      rotate: bytes4ToFloat32LE(bytes.slice(2)),
      rawFrame,
    }
  }

  if (bytes.length === 130) {
    const orderByte = bytes[0]
    const typeByte = bytes[1]
    return {
      kind: 'hand_packet',
      order: orderByte,
      orderName: ORDER_MAP[orderByte] || String(orderByte),
      type: HAND_TYPE_MAP[typeByte] || context.type || '',
      arr: bytes.slice(2),
      rawFrame,
    }
  }

  if (bytes.length === 146) {
    const typeByte = bytes[1]
    return {
      kind: 'hand_packet_with_rotate',
      type: HAND_TYPE_MAP[typeByte] || context.type || '',
      next: bytes.slice(2, bytes.length - 16),
      rotate: bytes4ToFloat32LE(bytes.slice(bytes.length - 16)),
      rawFrame,
    }
  }

  if (bytes.length === 1025 || bytes.length === 4097) {
    const typeCode = bytes[0]
    const type = TYPE_CONFIG[typeCode] || context.type || ''
    const sourceArr = bytes.slice(1)
    const arr = transformMatrixByType(sourceArr, type, context)
    return {
      kind: 'matrix',
      type,
      typeCode,
      arr,
      sourceArr,
      validation: validateMatrixPointCount(type, arr),
      rawFrame: {
        ...rawFrame,
        point_count: arr.length,
      },
    }
  }

  if (bytes.length === 1024 || bytes.length === 4096) {
    const type = context.type || ''
    const arr = type ? transformMatrixByType(bytes, type, context) : [...bytes]
    return {
      kind: 'matrix',
      type,
      arr,
      sourceArr: bytes,
      validation: validateMatrixPointCount(type, arr),
      rawFrame: {
        ...rawFrame,
        point_count: arr.length,
      },
    }
  }

  return {
    kind: 'unknown',
    bytes,
    validation: {
      valid: false,
      reason: 'frame_length_mismatch',
      actualLength: bytes.length,
    },
    rawFrame,
  }
}

function createFrameAccumulator(initial = {}) {
  const state = { ...initial }
  return {
    state,
    push(frame, context = {}) {
      const parsed = parseSerialFrame(frame, { ...context, type: state.type })
      if (parsed.type) state.type = parsed.type
      if (parsed.kind === 'hand_packet') {
        state[parsed.orderName] = parsed.arr
        state.stamp = parsed.rawFrame.received_at
      }
      if (parsed.kind === 'hand_packet_with_rotate') {
        state.next = parsed.next
        state.rotate = parsed.rotate
        state.stamp = parsed.rawFrame.received_at
      }
      if (parsed.kind === 'matrix') {
        state.arr = parsed.arr
        state.stamp = parsed.rawFrame.received_at
      }
      if (parsed.kind === 'rotate') {
        state.rotate = parsed.rotate
      }
      if (parsed.kind === 'mac') {
        state.uniqueId = parsed.uniqueId
        state.version = parsed.version
      }
      return parsed
    },
  }
}

module.exports = {
  ORDER_MAP,
  HAND_TYPE_MAP,
  TYPE_CONFIG,
  MATRIX_POINT_COUNTS,
  normalizeBytes,
  applyBackMultiplier,
  transformMatrixByType,
  validateMatrixPointCount,
  parseMacText,
  parseSerialFrame,
  createFrameAccumulator,
}
