import { expandFootVisualArr } from './footDisplayLayout.js'

/** The numeric view stores kPa in a 1024-tile, one-decimal atlas. */
export function normalizePressureDisplayValue(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? Math.max(0, Math.min(102.3, Math.round(numeric * 10) / 10)) : 0
}

/** Shared display-only rounding and filtering; never alters the measurement matrix. */
export function preparePressureDisplayValues(values, count, filter = 0) {
  const threshold = Number(filter)
  return Array.from({ length: count }, (_, index) => {
    const value = normalizePressureDisplayValue(values?.[index])
    return Number.isFinite(threshold) && threshold > 0 && value < threshold ? 0 : value
  })
}

function valuesOf(source) {
  if (Array.isArray(source) || ArrayBuffer.isView(source)) return source.length ? source : null
  if (!source || typeof source !== 'object') return null
  for (const key of ['pressureValuesKpa', 'pressureArr', 'arr', 'data', 'default']) {
    if ((Array.isArray(source[key]) || ArrayBuffer.isView(source[key])) && source[key].length) return source[key]
  }
  return null
}

function sourceOf(frame, key) {
  return valuesOf(frame?.[key] ?? frame?.[`endi-${key}`])
}

/** Older physical grids are copied into 2x blocks, already-processed grids are kept. */
function canonicalMatrix(values, width, height) {
  if (values?.length === width * height) return Array.from(values)
  if (values?.length === width * height / 4) {
    return Array.from({ length: width * height }, (_, index) => (
      values[Math.floor(Math.floor(index / width) / 2) * (width / 2) + Math.floor(index % width / 2)]
    ))
  }
  return new Array(width * height).fill(0)
}

function footMatrix(frame) {
  const combinedItem = frame?.foot ?? frame?.['endi-foot']
  const combined = valuesOf(combinedItem)
  if (combined?.length === 24 * 64 || combined?.length === 12 * 32) {
    return canonicalMatrix(combined, 24, 64)
  }
  const sides = ['leftFoot', 'rightFoot'].map(key => {
    const source = sourceOf(frame, key)
      ?? valuesOf(combinedItem?.sourcePrecisePressureMatrices?.[`endi-${key}`])
      ?? valuesOf(combinedItem?.sourcePressureMatrices?.[`endi-${key}`])
    return canonicalMatrix(source, 12, 64)
  })
  return Array.from({ length: 24 * 64 }, (_, index) => {
    const row = Math.floor(index / 24)
    const col = index % 24
    return sides[col < 12 ? 0 : 1][row * 12 + col % 12]
  })
}

/** 3D consumes every cell in the same expanded/reversed leg layout as the 2D canvas. */
export function getMannequinDisplayRegions(frame = {}, settings = {}) {
  const filter = settings.filter
  const jacket = canonicalMatrix(sourceOf(frame, 'jacket'), 24, 54)
  const foot = expandFootVisualArr(footMatrix(frame), 'endi-foot')
  const region = (canvasId, width, height, values) => ({
    canvasId, width, height,
    values: preparePressureDisplayValues(values, width * height, filter),
  })
  return [
    region('head', 18, 10, Array.from({ length: 18 * 10 }, (_, i) => jacket[Math.floor(i / 18) * 24 + i % 18 + 3])),
    region('back', 24, 44, jacket.slice(10 * 24)),
    region('left-arm', 36, 4, canonicalMatrix(sourceOf(frame, 'leftHand'), 36, 4)),
    region('right-arm', 36, 4, canonicalMatrix(sourceOf(frame, 'rightHand'), 36, 4)),
    // The archived model's leg labels are opposite to the acquisition sources.
    region('left-leg', 24, 128, Array.from({ length: 24 * 128 }, (_, i) => foot[Math.floor(i / 24) * 48 + 24 + i % 24])),
    region('right-leg', 24, 128, Array.from({ length: 24 * 128 }, (_, i) => foot[Math.floor(i / 24) * 48 + i % 24])),
  ]
}

/** Keep independently saved 3D color controls, applying them once to each matrix cell. */
export function normalizeMannequinDisplayRegions(regions, settings = {}) {
  const color = Number(settings.color)
  const manualRange = Number.isFinite(color) && color > 0 ? color : 40
  const reference = Number(settings.autoColorReference) || 20
  return regions.map(region => {
    const maxValue = region.values.reduce((max, value) => Math.max(max, value), 0)
    const rangeMax = Number(settings.autoColor) === 1 && maxValue > 0
      ? maxValue * manualRange / reference : manualRange
    return { ...region, maxValue, rangeMax, values: region.values.map(value => Math.min(1, value / rangeMax)) }
  })
}

/** UV axes follow each 2D canvas, while the archived XYZ and source channels stay intact. */
export function alignMannequinMatrixCoordinates(sensors) {
  const limits = new Map()
  for (const sensor of sensors) {
    const limit = limits.get(sensor.canvasId) || { row: 1, col: 1 }
    limit.row = Math.max(limit.row, sensor.row)
    limit.col = Math.max(limit.col, sensor.col)
    limits.set(sensor.canvasId, limit)
  }
  return sensors.map(sensor => {
    const limit = limits.get(sensor.canvasId)
    const u = (sensor.row - 1) / Math.max(1, limit.row - 1)
    const v = (sensor.col - 1) / Math.max(1, limit.col - 1)
    const arm = sensor.canvasId.endsWith('-arm')
    return { ...sensor, matrixU: arm ? 1 - u : u, matrixV: arm ? 1 - v : v }
  })
}
