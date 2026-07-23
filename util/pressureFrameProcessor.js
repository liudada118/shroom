const { loadPressureConfig, loadPressureFormula } = require('../server/services/PressureConfig')

const PROCESSING_VERSION = 'backend-spatial-v1'
const DISPLAY_DIGITS = 1
const GAUSSIAN_SIGMA_FACTOR = 0.5

const DEFAULT_FRAME_PROCESSING_CONFIG = Object.freeze({
  filter: 30,
  gauss: 2,
  coherent: 1,
})

const MATRIX_CONFIG = Object.freeze({
  'endi-back': { width: 50, height: 64, pointAreaCm2: 1.3 },
  'endi-sit': { width: 46, height: 46, pointAreaCm2: 1 },
  'carY-back': { width: 32, height: 32, pointAreaCm2: 1.9 },
  'carY-sit': { width: 32, height: 32, pointAreaCm2: 2.25 },
  'car-back': { width: 32, height: 32, pointAreaCm2: 1 },
  'car-sit': { width: 32, height: 32, pointAreaCm2: 1 },
  bed: { width: 32, height: 32, pointAreaCm2: 1 },
  hand: { width: 32, height: 32, pointAreaCm2: 1 },
  foot: { width: 32, height: 32, pointAreaCm2: 1 },
  bigHand: { width: 64, height: 64, pointAreaCm2: 1 },
})

function clampNumber(value, fallback, min, max) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.max(min, Math.min(max, numeric))
}

function normalizeFrameProcessingConfig(config = {}, fallback = DEFAULT_FRAME_PROCESSING_CONFIG) {
  return {
    filter: clampNumber(config.filter, Number(fallback.filter) || 0, 0, 4095),
    gauss: clampNumber(config.gauss, Number(fallback.gauss) || 0, 0, 4),
    coherent: clampNumber(config.coherent, Number(fallback.coherent) || 1, 1, 10),
  }
}

function roundDisplayValue(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return 0
  const scale = 10 ** DISPLAY_DIGITS
  return Math.round(numeric * scale) / scale
}

function getMatrixConfig(key, values = []) {
  if (MATRIX_CONFIG[key]) return MATRIX_CONFIG[key]
  const length = Array.isArray(values) ? values.length : 0
  const side = Math.sqrt(length)
  if (Number.isInteger(side) && side > 0) {
    return { width: side, height: side, pointAreaCm2: 1 }
  }
  return { width: length, height: length ? 1 : 0, pointAreaCm2: 1 }
}

function getPressurePointAreaCm2(key) {
  return MATRIX_CONFIG[key]?.pointAreaCm2 || 1
}

function gaussianBlur(values, width, height, sigma) {
  const source = Array.isArray(values) ? values : []
  if (!source.length || width * height !== source.length || sigma <= 0.01) {
    return [...source]
  }

  const radius = Math.ceil(sigma * 2.57)
  const kernel = Array.from(
    { length: radius * 2 + 1 },
    (_, index) => Math.exp(-((index - radius) ** 2) / (2 * sigma * sigma)),
  )
  const weightSum = kernel.reduce((sum, weight) => sum + weight, 0)
  const horizontal = new Array(source.length).fill(0)
  const result = new Array(source.length).fill(0)

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      let total = 0
      for (let offset = -radius; offset <= radius; offset++) {
        const sourceCol = Math.min(width - 1, Math.max(0, col + offset))
        total += source[row * width + sourceCol] * kernel[offset + radius]
      }
      horizontal[row * width + col] = total / weightSum
    }
  }

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      let total = 0
      for (let offset = -radius; offset <= radius; offset++) {
        const sourceRow = Math.min(height - 1, Math.max(0, row + offset))
        total += horizontal[sourceRow * width + col] * kernel[offset + radius]
      }
      result[row * width + col] = Math.round(total / weightSum)
    }
  }

  return result
}

function processAdcMatrix(values, key, processingConfig = DEFAULT_FRAME_PROCESSING_CONFIG) {
  const config = normalizeFrameProcessingConfig(processingConfig)
  const matrixConfig = getMatrixConfig(key, values)
  const count = matrixConfig.width * matrixConfig.height
  if (!count || !Array.isArray(values) || values.length !== count) return []

  let result = values.map((value) => {
    const numeric = Number(value)
    return Number.isFinite(numeric) ? Math.max(0, numeric) : 0
  })

  if (config.filter > 0) {
    result = result.map((value) => (value < config.filter ? 0 : value))
  }

  const sigma = config.gauss * GAUSSIAN_SIGMA_FACTOR
  result = gaussianBlur(result, matrixConfig.width, matrixConfig.height, sigma)

  if (config.filter > 0) {
    result = result.map((value) => (value < config.filter ? 0 : value))
  }

  return result
}

function getPressureSensor(key) {
  const value = String(key || '').toLowerCase()
  if (value.includes('back')) return 'backrest'
  if (value.includes('sit') || value.includes('seat')) return 'seat'
  return ''
}

function getPressureCalibrationMeta(sensor) {
  const config = loadPressureConfig()
  const profileText = `${config.pressureFormulaProfile || ''} ${config.pressureFormulaFile || ''}`.toLowerCase()
  const isLogoProfile = profileText.includes('logo')
  if (sensor === 'backrest') {
    return isLogoProfile
      ? { topCount: 46, humanThreshold: 300, humanThresholdMode: 'gt' }
      : { topCount: 46, humanThreshold: 1000, humanThresholdMode: 'gte' }
  }
  if (sensor === 'seat') {
    return isLogoProfile
      ? { topCount: 70, humanThreshold: 300, humanThresholdMode: 'gt' }
      : { topCount: 70, humanThreshold: 1128, humanThresholdMode: 'gte' }
  }
  return null
}

function getCalibrationAverage(positiveValues, sensor) {
  const meta = getPressureCalibrationMeta(sensor)
  if (!meta || !positiveValues.length) return 0
  const useHumanAverage = meta.humanThresholdMode === 'gt'
    ? positiveValues.length > meta.humanThreshold
    : positiveValues.length >= meta.humanThreshold
  if (useHumanAverage) {
    return positiveValues.reduce((sum, value) => sum + value, 0) / positiveValues.length
  }
  const topValues = [...positiveValues]
    .sort((left, right) => right - left)
    .slice(0, Math.min(meta.topCount, positiveValues.length))
  return topValues.reduce((sum, value) => sum + value, 0) / topValues.length
}

function calcPointFormulaPressureValues(values, key, formula) {
  const sensor = getPressureSensor(key) || 'seat'
  const minAdc = Number.isFinite(Number(formula.MIN_ADC)) ? Number(formula.MIN_ADC) : 30
  const adcMax = values.length ? Math.max(...values) : 0
  const scale = typeof formula.computeScale === 'function' ? formula.computeScale(adcMax) : 1
  const safeScale = Number.isFinite(Number(scale)) ? Number(scale) : 1
  return values.map((value) => {
    if (value <= minAdc) return 0
    const base = formula.master(value, sensor)
    return base == null ? 0 : safeScale * base
  })
}

function calcPressureFormulaStats(arr, key, pointAreaCm2 = getPressurePointAreaCm2(key)) {
  const values = Array.isArray(arr) ? arr.map((value) => Number(value) || 0) : []
  const formula = loadPressureFormula()
  const rawPress = values.reduce((sum, value) => sum + value, 0)
  const rawMax = values.length ? Math.max(...values) : 0
  const pointArea = Number(pointAreaCm2) > 0 ? Number(pointAreaCm2) : 1

  let pressureValues
  let rawAvg = 0
  let adcAvg = 0

  if (typeof formula.master === 'function') {
    pressureValues = calcPointFormulaPressureValues(values, key, formula)
    const minAdc = Number.isFinite(Number(formula.MIN_ADC)) ? Number(formula.MIN_ADC) : 30
    const rawActiveValues = values.filter((value) => Number.isFinite(value) && value > minAdc)
    rawAvg = rawActiveValues.length
      ? rawActiveValues.reduce((sum, value) => sum + value, 0) / rawActiveValues.length
      : 0
    adcAvg = rawAvg
  } else {
    const positiveValues = values.filter((value) => Number.isFinite(value) && value > 30)
    rawAvg = positiveValues.length
      ? positiveValues.reduce((sum, value) => sum + value, 0) / positiveValues.length
      : 0
    const sensor = getPressureSensor(key)
    adcAvg = getCalibrationAverage(positiveValues, sensor)
    const calibrationPressure = sensor && positiveValues.length
      ? formula.estimatePressure(adcAvg, positiveValues.length, sensor) || 0
      : 0
    const pressureScale = adcAvg > 0 ? calibrationPressure / adcAvg : 0
    pressureValues = sensor
      ? values.map((value) => (value > 30 ? value * pressureScale : 0))
      : values.map((value) => (value > 0 ? value : 0))
  }

  const activePressureValues = pressureValues.filter((value) => Number.isFinite(value) && value > 0)
  const activeCount = activePressureValues.length
  const pressureTotal = pressureValues.reduce((sum, value) => sum + (Number(value) || 0), 0)
  const forceValues = pressureValues.map((value) => value * pointArea * 0.1)
  const total = forceValues.reduce((sum, value) => sum + (Number(value) || 0), 0)

  return {
    max: activeCount ? Math.max(...activePressureValues) : 0,
    aver: activeCount ? pressureTotal / activeCount : 0,
    total,
    pressureTotal,
    pressureValues,
    forceValues,
    effectiveArea: activeCount * pointArea,
    activeCount,
    rawPress,
    rawAvg,
    adcAvg,
    rawMax,
  }
}

function isVisibleMetricIndex(key, index, width, height) {
  if (key !== 'endi-back' || width !== 50 || height !== 64) return true
  const row = Math.floor(index / width)
  const col = index % width
  return row >= 18 || (col >= 14 && col <= 34)
}

function buildCanonicalMetricArrays(adcValues, key) {
  const matrixConfig = getMatrixConfig(key, adcValues)
  const visibleAdcValues = adcValues.map((value, index) => (
    isVisibleMetricIndex(key, index, matrixConfig.width, matrixConfig.height) ? value : 0
  ))
  const stats = calcPressureFormulaStats(visibleAdcValues, key, matrixConfig.pointAreaCm2)
  return {
    pressureArr: stats.pressureValues.map(roundDisplayValue),
    forceArr: stats.forceValues.map(roundDisplayValue),
  }
}

function buildProcessingMetadata(config) {
  const pressureConfig = loadPressureConfig()
  return {
    version: PROCESSING_VERSION,
    filter: config.filter,
    gauss: config.gauss,
    coherent: config.coherent,
    gaussianSigma: Number((config.gauss * GAUSSIAN_SIGMA_FACTOR).toFixed(3)),
    temporal: false,
    outputDigits: DISPLAY_DIGITS,
    formulaFile: pressureConfig.pressureFormulaFile,
    formulaProfile: pressureConfig.pressureFormulaProfile,
  }
}

function processMatrixItem(key, item = {}, processingConfig = DEFAULT_FRAME_PROCESSING_CONFIG) {
  const source = Array.isArray(item.arr) ? item.arr : []
  const config = normalizeFrameProcessingConfig(processingConfig)
  const arr = processAdcMatrix(source, key, config)
  if (!arr.length && source.length) return { ...item }
  const metrics = buildCanonicalMetricArrays(arr, key)
  return {
    ...item,
    rawAdcArr: Array.isArray(item.rawAdcArr) ? [...item.rawAdcArr] : [...source],
    arr,
    ...metrics,
    processing: buildProcessingMetadata(config),
  }
}

function hasCanonicalMetricArrays(item = {}) {
  const length = Array.isArray(item.arr) ? item.arr.length : 0
  return item.processing?.version === PROCESSING_VERSION
    && length > 0
    && Array.isArray(item.pressureArr)
    && item.pressureArr.length === length
    && Array.isArray(item.forceArr)
    && item.forceArr.length === length
}

function ensureProcessedMatrixItem(key, item = {}, processingConfig = DEFAULT_FRAME_PROCESSING_CONFIG) {
  if (hasCanonicalMetricArrays(item)) return { ...item }
  const source = Array.isArray(item.rawAdcArr) ? item.rawAdcArr : item.arr
  return processMatrixItem(key, { ...item, arr: source }, item.processing || processingConfig)
}

module.exports = {
  PROCESSING_VERSION,
  DISPLAY_DIGITS,
  GAUSSIAN_SIGMA_FACTOR,
  DEFAULT_FRAME_PROCESSING_CONFIG,
  MATRIX_CONFIG,
  normalizeFrameProcessingConfig,
  getMatrixConfig,
  getPressurePointAreaCm2,
  gaussianBlur,
  processAdcMatrix,
  calcPressureFormulaStats,
  buildCanonicalMetricArrays,
  processMatrixItem,
  hasCanonicalMetricArrays,
  ensureProcessedMatrixItem,
}
