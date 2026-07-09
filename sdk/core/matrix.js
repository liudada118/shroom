'use strict'

const DEFAULT_SIT_ROTATE_DEGREE = 270

const DEFAULT_DATA_DIRECTION = {
  left: true,
  up: true,
  rotateDegree: 0,
  byKey: {
    'endi-back': { left: true, up: true, rotateDegree: 0 },
    'endi-sit': { left: true, up: true, rotateDegree: DEFAULT_SIT_ROTATE_DEGREE },
    'endi-jacket': { left: true, up: true, rotateDegree: 0 },
    'endi-leftHand': { left: true, up: true, rotateDegree: 0 },
    'endi-rightHand': { left: true, up: true, rotateDegree: 0 },
    'endi-leftFoot': { left: true, up: true, rotateDegree: 0 },
    'endi-rightFoot': { left: true, up: true, rotateDegree: 0 },
    'endi-foot': { left: true, up: true, rotateDegree: 0 },
    'carY-back': { left: true, up: true, rotateDegree: 0 },
    'carY-sit': { left: true, up: true, rotateDegree: DEFAULT_SIT_ROTATE_DEGREE },
    'car-back': { left: true, up: true, rotateDegree: 0 },
    'car-sit': { left: true, up: true, rotateDegree: DEFAULT_SIT_ROTATE_DEGREE },
  },
}

const MATRIX_DIMENSIONS = {
  'endi-back': { width: 50, height: 64 },
  'endi-sit': { width: 46, height: 46 },
  'endi-jacket': { width: 24, height: 54 },
  'endi-leftHand': { width: 36, height: 4 },
  'endi-rightHand': { width: 36, height: 4 },
  'endi-leftFoot': { width: 12, height: 64 },
  'endi-rightFoot': { width: 12, height: 64 },
  'endi-foot': { width: 24, height: 64 },
  'carY-back': { width: 32, height: 32 },
  'carY-sit': { width: 32, height: 32 },
  'car-back': { width: 32, height: 32 },
  'car-sit': { width: 32, height: 32 },
  bed: { width: 32, height: 32 },
  hand: { width: 32, height: 32 },
  foot: { width: 32, height: 32 },
  bigHand: { width: 64, height: 64 },
}

function normalizeRotateDegree(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  return ((Math.round(numeric / 90) * 90) % 360 + 360) % 360
}

function getDataDirectionName(direction) {
  const rotateDegree = normalizeRotateDegree(direction?.rotateDegree ?? direction?.rotate_degree)
  if (rotateDegree) return `rotate${rotateDegree}`
  const left = direction?.left !== false
  const up = direction?.up !== false
  if (!left && !up) return 'both'
  if (!left) return 'horizontal'
  if (!up) return 'vertical'
  return 'none'
}

function normalizeDataDirection(direction = DEFAULT_DATA_DIRECTION) {
  const rotateDegree = normalizeRotateDegree(direction?.rotateDegree ?? direction?.rotate_degree)
  const normalized = {
    left: direction?.left !== false,
    up: direction?.up !== false,
    rotateDegree,
    rotate_degree: rotateDegree,
  }
  normalized.data_direction = getDataDirectionName(normalized)
  return normalized
}

function normalizeDataDirectionState(direction = DEFAULT_DATA_DIRECTION) {
  const base = normalizeDataDirection(direction)
  const byKey = {}
  Object.keys(DEFAULT_DATA_DIRECTION.byKey || {}).forEach((key) => {
    byKey[key] = normalizeDataDirection(DEFAULT_DATA_DIRECTION.byKey[key])
  })
  if (direction?.byKey && typeof direction.byKey === 'object') {
    Object.keys(direction.byKey).forEach((key) => {
      byKey[key] = normalizeDataDirection(direction.byKey[key])
    })
  }
  return { ...base, byKey }
}

function getDirectionForKey(directionState = DEFAULT_DATA_DIRECTION, key) {
  const normalizedState = normalizeDataDirectionState(directionState)
  return normalizeDataDirection(normalizedState.byKey?.[key] || normalizedState)
}

function getMatrixDimensions(key, arr) {
  if (MATRIX_DIMENSIONS[key]) return MATRIX_DIMENSIONS[key]
  const length = Array.isArray(arr) ? arr.length : 0
  const side = Math.sqrt(length)
  if (Number.isInteger(side) && side > 0) return { width: side, height: side }
  return null
}

function isValidMatrix(key, arr) {
  if (!Array.isArray(arr)) return false
  const dimensions = getMatrixDimensions(key, arr)
  return Boolean(dimensions && dimensions.width * dimensions.height === arr.length)
}

function flipHorizontal(arr, width, height) {
  const result = []
  for (let y = 0; y < height; y += 1) {
    for (let x = width - 1; x >= 0; x -= 1) {
      result.push(arr[y * width + x])
    }
  }
  return result
}

function flipVertical(arr, width, height) {
  const result = []
  for (let y = height - 1; y >= 0; y -= 1) {
    for (let x = 0; x < width; x += 1) {
      result.push(arr[y * width + x])
    }
  }
  return result
}

function rotateClockwise(arr, width, height) {
  const result = []
  for (let x = 0; x < width; x += 1) {
    for (let y = height - 1; y >= 0; y -= 1) {
      result.push(arr[y * width + x])
    }
  }
  return result
}

function getDirectedDimensions(key, arr, direction) {
  const dimensions = getMatrixDimensions(key, arr)
  if (!dimensions) return null
  const rotateDegree = normalizeRotateDegree(direction?.rotateDegree)
  return rotateDegree === 90 || rotateDegree === 270
    ? { width: dimensions.height, height: dimensions.width }
    : dimensions
}

function applyCollectionDirection(key, arr, direction = {}) {
  if (!Array.isArray(arr)) return []
  const dimensions = getMatrixDimensions(key, arr)
  if (!dimensions) return [...arr]

  const normalizedDirection = normalizeDataDirection(direction)
  let result = [...arr]
  let currentWidth = dimensions.width
  let currentHeight = dimensions.height
  const turns = normalizeRotateDegree(normalizedDirection.rotateDegree) / 90

  for (let i = 0; i < turns; i += 1) {
    result = rotateClockwise(result, currentWidth, currentHeight)
    const oldWidth = currentWidth
    currentWidth = currentHeight
    currentHeight = oldWidth
  }
  if (!normalizedDirection.left) {
    result = flipHorizontal(result, currentWidth, currentHeight)
  }
  if (!normalizedDirection.up) {
    result = flipVertical(result, currentWidth, currentHeight)
  }
  return result
}

function applyZeroBaseline(key, arr, zeroState) {
  if (!zeroState?.enabled || !zeroState?.data || !Array.isArray(arr)) return Array.isArray(arr) ? [...arr] : []
  const shortKey = String(key || '').includes('-') ? String(key).split('-').pop() : key
  const baseline = zeroState.data[key] || zeroState.data[shortKey]
  if (!Array.isArray(baseline) || baseline.length !== arr.length) return [...arr]
  return arr.map((value, index) => Math.max(0, (Number(value) || 0) - (Number(baseline[index]) || 0)))
}

function buildMatrixMeta(key, arr, direction) {
  const dimensions = direction ? getDirectedDimensions(key, arr, direction) : getMatrixDimensions(key, arr)
  if (!dimensions) return null
  return {
    matrix_key: key,
    width: dimensions.width,
    height: dimensions.height,
    point_count: Array.isArray(arr) ? arr.length : 0,
  }
}

function transformMatrixItem(key, item = {}, options = {}) {
  const sourceArr = Array.isArray(item.arr) ? item.arr : []
  const directionState = normalizeDataDirectionState(options.dataDirection || DEFAULT_DATA_DIRECTION)
  const direction = getDirectionForKey(directionState, key)
  const directedArr = isValidMatrix(key, sourceArr)
    ? applyCollectionDirection(key, sourceArr, direction)
    : [...sourceArr]
  const arr = applyZeroBaseline(key, directedArr, options.zeroState)
  return {
    ...item,
    arr,
    dataDirection: direction,
    matrixMeta: buildMatrixMeta(key, arr, direction),
  }
}

function buildDirectedFrame(frame = {}, options = {}) {
  const result = {}
  Object.keys(frame || {}).forEach((key) => {
    const item = frame[key]
    if (!item || typeof item !== 'object') {
      result[key] = item
      return
    }
    result[key] = transformMatrixItem(key, item, options)
  })
  return result
}

module.exports = {
  DEFAULT_DATA_DIRECTION,
  DEFAULT_SIT_ROTATE_DEGREE,
  MATRIX_DIMENSIONS,
  normalizeRotateDegree,
  getDataDirectionName,
  normalizeDataDirection,
  normalizeDataDirectionState,
  getDirectionForKey,
  getMatrixDimensions,
  getDirectedDimensions,
  isValidMatrix,
  flipHorizontal,
  flipVertical,
  rotateClockwise,
  applyCollectionDirection,
  applyZeroBaseline,
  buildMatrixMeta,
  transformMatrixItem,
  buildDirectedFrame,
}
