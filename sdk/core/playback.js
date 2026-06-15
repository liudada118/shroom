'use strict'

const { isValidMatrix } = require('./matrix')

function parsePlaybackData(value) {
  if (!value) return {}
  if (typeof value === 'object') {
    try {
      return JSON.parse(JSON.stringify(value))
    } catch {
      return { ...value }
    }
  }
  try {
    return JSON.parse(value)
  } catch {
    return {}
  }
}

function removePlaybackSelect(data) {
  if (!data || typeof data !== 'object') return data
  const result = { ...data }
  Object.keys(result).forEach((key) => {
    if (result[key] && typeof result[key] === 'object' && 'select' in result[key]) {
      result[key] = { ...result[key] }
      delete result[key].select
    }
  })
  return result
}

function validatePlaybackFrameData(frame) {
  const keys = Object.keys(frame || {})
  if (!keys.length) return { valid: false, reason: 'empty_frame' }

  for (const key of keys) {
    const item = frame[key]
    if (!item || !Array.isArray(item.arr) || !item.arr.length) {
      return { valid: false, reason: 'missing_matrix', key }
    }
    if (!isValidMatrix(key, item.arr)) {
      return { valid: false, reason: 'matrix_size_mismatch', key, actualLength: item.arr.length }
    }
    if (item.arr.some((value) => !Number.isFinite(Number(value)))) {
      return { valid: false, reason: 'invalid_number', key }
    }
  }

  return { valid: true }
}

function parsePlaybackTimestamp(value) {
  if (value === undefined || value === null || value === '') return null
  if (typeof value === 'number') return value
  try {
    return JSON.parse(value)
  } catch {
    const numericValue = Number(value)
    return Number.isFinite(numericValue) ? numericValue : value
  }
}

function clampFrameIndex(rows = [], index = 0) {
  if (!Array.isArray(rows) || !rows.length) return 0
  const value = Number(index)
  const safeIndex = Number.isFinite(value) ? Math.round(value) : 0
  return Math.max(0, Math.min(rows.length - 1, safeIndex))
}

function buildPlaybackSnapshot(rows = [], index = 0, options = {}) {
  const normalizedIndex = clampFrameIndex(rows, index)
  const row = rows[normalizedIndex]
  if (!row) return null
  const frame = removePlaybackSelect(parsePlaybackData(row.data))
  const validation = validatePlaybackFrameData(frame)
  if (!validation.valid && options.validate !== false) {
    return { row, index: normalizedIndex, valid: false, validation }
  }
  return {
    row,
    index: normalizedIndex,
    valid: validation.valid,
    validation,
    payload: {
      sitDataPlay: frame,
      index: normalizedIndex,
      timestamp: parsePlaybackTimestamp(row.timestamp),
    },
  }
}

module.exports = {
  parsePlaybackData,
  removePlaybackSelect,
  validatePlaybackFrameData,
  parsePlaybackTimestamp,
  clampFrameIndex,
  buildPlaybackSnapshot,
}
