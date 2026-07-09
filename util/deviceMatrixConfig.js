const DEVICE_MATRIX_CONFIG = Object.freeze({
  'endi-back': { pointWidthDistance: 13, pointHeightDistance: 10, width: 50, height: 64 },
  'endi-sit': { pointWidthDistance: 10, pointHeightDistance: 10, width: 46, height: 46 },
  'endi-jacket': { pointWidthDistance: 10, pointHeightDistance: 10, width: 24, height: 54 },
  'endi-leftHand': { pointWidthDistance: 10, pointHeightDistance: 10, width: 36, height: 4 },
  'endi-rightHand': { pointWidthDistance: 10, pointHeightDistance: 10, width: 36, height: 4 },
  'endi-leftFoot': { pointWidthDistance: 10, pointHeightDistance: 10, width: 12, height: 64 },
  'endi-rightFoot': { pointWidthDistance: 10, pointHeightDistance: 10, width: 12, height: 64 },
  'endi-foot': { pointWidthDistance: 10, pointHeightDistance: 10, width: 24, height: 64 },
  'carY-back': { pointWidthDistance: 10, pointHeightDistance: 19, width: 32, height: 32 },
  'carY-sit': { pointWidthDistance: 15, pointHeightDistance: 15, width: 32, height: 32 },
  'car-back': { pointWidthDistance: 10, pointHeightDistance: 10, width: 32, height: 32 },
  'car-sit': { pointWidthDistance: 10, pointHeightDistance: 10, width: 32, height: 32 },
  bed: { pointWidthDistance: 10, pointHeightDistance: 10, width: 32, height: 32 },
  hand: { pointWidthDistance: 10, pointHeightDistance: 10, width: 32, height: 32 },
  foot: { pointWidthDistance: 10, pointHeightDistance: 10, width: 32, height: 32 },
  bigHand: { pointWidthDistance: 10, pointHeightDistance: 10, width: 64, height: 64 },
})

const MATRIX_DIMENSIONS = Object.freeze(Object.fromEntries(
  Object.entries(DEVICE_MATRIX_CONFIG).map(([key, config]) => [
    key,
    { width: config.width, height: config.height },
  ])
))

function getMatrixConfig(key) {
  return DEVICE_MATRIX_CONFIG[key] || null
}

function getMatrixDimensions(key) {
  return MATRIX_DIMENSIONS[key] || null
}

function getMatrixPointCount(key) {
  const dimensions = getMatrixDimensions(key)
  return dimensions ? dimensions.width * dimensions.height : 0
}

module.exports = {
  DEVICE_MATRIX_CONFIG,
  MATRIX_DIMENSIONS,
  getMatrixConfig,
  getMatrixDimensions,
  getMatrixPointCount,
}
