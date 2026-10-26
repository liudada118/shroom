const DUMMY_CELL_AREA_CM2 = 1.5625
const DUMMY_MATRIX_PARTS = new Set(['jacket', 'lefthand', 'righthand', 'leftfoot', 'rightfoot', 'foot'])

export function isDummyAreaItem(item, matrixKey = '') {
  const key = String(matrixKey).toLowerCase()
  return Boolean(
    item && (Object.prototype.hasOwnProperty.call(item, 'areaValuesCm2')
      || String(item.sensorType || '').startsWith('dummy-'))
  ) || (key.startsWith('endi-') && DUMMY_MATRIX_PARTS.has(key.slice(5)))
}

// Area cells are produced from the original ADC frame before display processing.
// Keep an unavailable frame distinct from a known empty (all-zero) frame.
export function getAreaValuesCm2(item) {
  const values = item?.areaValuesCm2
  if (!Array.isArray(values)) return null
  if (Array.isArray(item.arr) && values.length !== item.arr.length) return null
  return values.every((value) => Number.isFinite(value) && value >= 0) ? values : null
}

export function sumAreaValuesCm2(values) {
  if (!Array.isArray(values) || !values.every((value) => Number.isFinite(value) && value >= 0)) return null
  return values.reduce((sum, value) => sum + value, 0)
}

export function getAreaCellCount(values) {
  const areaCm2 = sumAreaValuesCm2(values)
  return areaCm2 === null ? null : areaCm2 / DUMMY_CELL_AREA_CM2
}

/** Convert a region's existing average pressure and fitted total area to force. */
export function calculateAreaForceN(averagePressureKpa, areaCm2) {
  if (!Number.isFinite(averagePressureKpa) || averagePressureKpa < 0
    || !Number.isFinite(areaCm2) || areaCm2 < 0) return null
  const force = averagePressureKpa * areaCm2 * 0.1
  return Number.isFinite(force) ? force : null
}
