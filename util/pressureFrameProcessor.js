const { loadPressureConfig, loadPressureFormula } = require('../server/services/PressureConfig')
const { distributeWeightPointPressures } = require('./weightPointPressureNormalization')
const {
  isCalibrationFormula,
  calculateCalibrationPressureDistribution,
} = require('./calibrationPressureAdapter')

const PROCESSING_VERSION = 'backend-zero-native-v15-matrix-calibration-min30'
const ADC_PREPROCESSING_MODE = 'zero-baseline-native-min30'
const NATIVE_CALIBRATION_DISTRIBUTION = 'native-adc-matrix-to-pressure-matrix-v2746-v2752'
const CURVE_PRESSURE_DISTRIBUTION = 'curve-response-mean-normalized-v1'
const POINT_PRESSURE_DISTRIBUTION = 'point-formula-v1'
const DISPLAY_DIGITS = 1
const GAUSSIAN_SIGMA_FACTOR = 0.5
const AVERAGE_FORMULA_MIN_ADC = 30
const NATIVE_CALIBRATION_MIN_ADC = 30
const NATIVE_BACKREST_CALIBRATION_MIN_ADC = NATIVE_CALIBRATION_MIN_ADC

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
  if (!Number.isFinite(numeric)) return 0
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

function normalizeCalibrationAdcMatrix(values, key) {
  const matrixConfig = getMatrixConfig(key, values)
  const count = matrixConfig.width * matrixConfig.height
  if (!count || !Array.isArray(values) || values.length !== count) return []

  return applyCalibrationInputGate(values, key)
}

// Compatibility export for callers that still use the old function name.
function processAdcMatrix(values, key) {
  return normalizeCalibrationAdcMatrix(values, key)
}

function getPressureSensor(key) {
  const value = String(key || '').toLowerCase()
  if (value.includes('back')) return 'backrest'
  if (value.includes('sit') || value.includes('seat')) return 'seat'
  return ''
}

function getCalibrationInputMinAdc(key, formula = loadPressureFormula()) {
  if (!isNativeCalibrationFormula(formula)) return 0
  return getPressureSensor(key) ? NATIVE_CALIBRATION_MIN_ADC : 0
}

function applyCalibrationInputGate(values, key, formula = loadPressureFormula()) {
  const minAdc = getCalibrationInputMinAdc(key, formula)
  return (Array.isArray(values) ? values : []).map((value) => {
    const numeric = Number(value)
    if (!Number.isFinite(numeric) || numeric <= 0) return 0
    return minAdc > 0 && numeric < minAdc ? 0 : numeric
  })
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

function usesHumanCalibrationAverage(meta, validCount) {
  if (!meta) return false
  return meta.humanThresholdMode === 'gt'
    ? validCount > meta.humanThreshold
    : validCount >= meta.humanThreshold
}

function isNativeCalibrationFormula(formula) {
  return isCalibrationFormula(formula)
}

function calcNativeCalibrationPressureValues(values, key, formula) {
  const sensor = getPressureSensor(key)
  if (!sensor) {
    throw new RangeError(`Calibration formula has no sensor mapping for ${key}`)
  }
  const calibrationAdcValues = applyCalibrationInputGate(values, key, formula)
  const { width, height } = getMatrixConfig(key, calibrationAdcValues)
  const hasConfiguredShape = width > 0
    && height > 0
    && width * height === calibrationAdcValues.length
  const calibrationAdcMatrix = hasConfiguredShape
    ? Array.from(
        { length: height },
        (_, row) => calibrationAdcValues.slice(row * width, (row + 1) * width),
      )
    : [calibrationAdcValues]
  const distribution = calculateCalibrationPressureDistribution(formula, calibrationAdcMatrix, sensor)
  const matrix = Array.isArray(distribution.pressureMatrixKPa?.[0])
    ? distribution.pressureMatrixKPa.flat()
    : distribution.pressureMatrixKPa
  if (!Array.isArray(matrix) || matrix.length !== calibrationAdcValues.length) {
    throw new RangeError(`Calibration pressure matrix length mismatch for ${key}`)
  }
  const calibratedPressureValues = Array.from({ length: calibrationAdcValues.length }, (_, index) => {
    const value = Number(matrix?.[index])
    if (!Number.isFinite(value)) {
      throw new TypeError(`Calibration pressure matrix contains a non-finite value at ${key}[${index}]`)
    }
    return value
  })
  const pressureValues = calibratedPressureValues
  if (pressureValues.length !== values.length) {
    throw new RangeError(`Rendered pressure matrix length mismatch for ${key}`)
  }
  return {
    pressureValues,
    calibrationAdcValues,
    adcAvg: Number(distribution.mean) || 0,
    targetAveragePressureKPa: distribution.targetAveragePressureKPa,
    summaryAveragePressureKPa: distribution.summaryAveragePressureKPa,
    summaryMaxPressureKPa: distribution.summaryMaxPressureKPa,
    normalizationScale: distribution.normalizationScale,
    meanConservationErrorKPa: distribution.meanConservationErrorKPa,
    fallbackMode: distribution.fallbackMode,
    branch: distribution.branch,
    humanValidPointThreshold: distribution.humanValidPointThreshold,
    humanCoefficient: distribution.humanCoefficient,
    pointPressureScale: distribution.pointPressureScale,
    matrixConversion: distribution.matrixConversion,
    validCount: Number(distribution.validCount) || 0,
    selectedCount: Number(distribution.selectedCount) || 0,
    maxAdc: Number(distribution.maxAdc) || 0,
  }
}

function calcAverageFormulaPressureValues(values, key, formula) {
  const sensor = getPressureSensor(key)
  const filteredValues = values.map((value) => (
    Number.isFinite(value) && value > AVERAGE_FORMULA_MIN_ADC ? value : 0
  ))
  const validValues = filteredValues.filter((value) => value > 0)
  if (!sensor) {
    return {
      pressureValues: values.map((value) => (value > 0 ? value : 0)),
      adcAvg: 0,
      targetAveragePressureKPa: null,
      normalizationScale: null,
      meanConservationErrorKPa: null,
      fallbackMode: 'unsupported-sensor',
    }
  }
  if (!validValues.length) {
    return {
      pressureValues: filteredValues,
      adcAvg: 0,
      targetAveragePressureKPa: 0,
      normalizationScale: null,
      meanConservationErrorKPa: null,
      fallbackMode: 'no-valid-points',
    }
  }

  const meta = getPressureCalibrationMeta(sensor)
  const useHumanAverage = usesHumanCalibrationAverage(meta, validValues.length)
  const endRank = useHumanAverage
    ? validValues.length
    : Math.min(meta.topCount, validValues.length)
  const distribution = distributeWeightPointPressures(filteredValues, {
    curve: (adc) => formula.estimatePressure(adc, validValues.length, sensor),
    startRank: 1,
    endRank,
  })

  return {
    pressureValues: distribution.pressureMatrixKPa[0],
    adcAvg: distribution.referenceAdcMean,
    targetAveragePressureKPa: distribution.targetAveragePressureKPa,
    normalizationScale: distribution.normalizationScale,
    meanConservationErrorKPa: distribution.meanConservationErrorKPa,
    fallbackMode: distribution.fallbackMode,
  }
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
  const formula = loadPressureFormula()
  const sourceValues = Array.isArray(arr) ? arr.map((value) => Number(value) || 0) : []
  const values = applyCalibrationInputGate(sourceValues, key, formula)
  const rawPress = values.reduce((sum, value) => sum + value, 0)
  const rawMax = values.length ? Math.max(...values) : 0
  const pointArea = Number(pointAreaCm2) > 0 ? Number(pointAreaCm2) : 1

  let pressureValues
  let rawAvg = 0
  let adcAvg = 0
  let targetAveragePressureKPa = null
  let summaryAveragePressureKPa = null
  let summaryMaxPressureKPa = null
  let normalizationScale = null
  let meanConservationErrorKPa = null
  let pressureDistribution = POINT_PRESSURE_DISTRIBUTION
  let pressureDistributionFallback = 'none'
  let pressureCalibrationBranch = 'point'
  let calibrationValidCount = values.filter((value) => value > 0).length
  let calibrationSelectedCount = calibrationValidCount
  let humanValidPointThreshold = null
  let humanCoefficient = null
  let pointPressureScale = 1
  let matrixConversion = null

  if (isNativeCalibrationFormula(formula)) {
    const positiveValues = values.filter((value) => Number.isFinite(value) && value > 0)
    rawAvg = positiveValues.length
      ? positiveValues.reduce((sum, value) => sum + value, 0) / positiveValues.length
      : 0
    const distribution = calcNativeCalibrationPressureValues(values, key, formula)
    pressureValues = distribution.pressureValues
    adcAvg = distribution.adcAvg
    targetAveragePressureKPa = distribution.targetAveragePressureKPa
    summaryAveragePressureKPa = distribution.summaryAveragePressureKPa
    summaryMaxPressureKPa = distribution.summaryMaxPressureKPa
    normalizationScale = distribution.normalizationScale
    meanConservationErrorKPa = distribution.meanConservationErrorKPa
    pressureDistribution = NATIVE_CALIBRATION_DISTRIBUTION
    pressureDistributionFallback = distribution.fallbackMode
    pressureCalibrationBranch = distribution.branch
    humanValidPointThreshold = distribution.humanValidPointThreshold
    humanCoefficient = distribution.humanCoefficient
    pointPressureScale = distribution.pointPressureScale
    matrixConversion = distribution.matrixConversion
    calibrationValidCount = distribution.validCount
    calibrationSelectedCount = distribution.selectedCount
  } else if (typeof formula.master === 'function') {
    pressureValues = calcPointFormulaPressureValues(values, key, formula)
    const minAdc = Number.isFinite(Number(formula.MIN_ADC)) ? Number(formula.MIN_ADC) : 30
    const rawActiveValues = values.filter((value) => Number.isFinite(value) && value > minAdc)
    rawAvg = rawActiveValues.length
      ? rawActiveValues.reduce((sum, value) => sum + value, 0) / rawActiveValues.length
      : 0
    adcAvg = rawAvg
  } else {
    const positiveValues = values.filter((value) => Number.isFinite(value) && value > AVERAGE_FORMULA_MIN_ADC)
    rawAvg = positiveValues.length
      ? positiveValues.reduce((sum, value) => sum + value, 0) / positiveValues.length
      : 0
    const distribution = calcAverageFormulaPressureValues(values, key, formula)
    pressureValues = distribution.pressureValues
    adcAvg = distribution.adcAvg
    targetAveragePressureKPa = distribution.targetAveragePressureKPa
    normalizationScale = distribution.normalizationScale
    meanConservationErrorKPa = distribution.meanConservationErrorKPa
    pressureDistribution = CURVE_PRESSURE_DISTRIBUTION
    pressureDistributionFallback = distribution.fallbackMode
    pressureCalibrationBranch = 'average-formula'
  }

  const activePressureValues = pressureValues.filter((value) => Number.isFinite(value) && value > 0)
  const activeCount = activePressureValues.length
  const pressureTotal = pressureValues.reduce((sum, value) => sum + (Number(value) || 0), 0)
  const forceValues = pressureValues.map((value) => value * pointArea * 0.1)
  const total = forceValues.reduce((sum, value) => sum + (Number(value) || 0), 0)
  const matrixMaxPressureKPa = activeCount ? Math.max(...activePressureValues) : 0
  const averagePointCount = isNativeCalibrationFormula(formula)
    ? calibrationValidCount
    : activeCount
  const matrixAveragePressureKPa = averagePointCount ? pressureTotal / averagePointCount : 0
  const resolvedAveragePressureKPa = matrixAveragePressureKPa
  const resolvedMaxPressureKPa = matrixMaxPressureKPa

  return {
    max: resolvedMaxPressureKPa,
    aver: resolvedAveragePressureKPa,
    matrixMaxPressureKPa,
    matrixAveragePressureKPa,
    total,
    pressureTotal,
    pressureValues,
    forceValues,
    effectiveArea: activeCount * pointArea,
    activeCount,
    averagePointCount,
    rawPress,
    rawAvg,
    adcAvg,
    rawMax,
    targetAveragePressureKPa,
    summaryAveragePressureKPa: resolvedAveragePressureKPa,
    summaryMaxPressureKPa: resolvedMaxPressureKPa,
    normalizationScale,
    meanConservationErrorKPa,
    pressureDistribution,
    pressureDistributionFallback,
    pressureCalibrationBranch,
    humanValidPointThreshold,
    humanCoefficient,
    pointPressureScale,
    matrixConversion,
    calibrationInputMinAdc: getCalibrationInputMinAdc(key, formula),
    calibrationValidCount,
    calibrationSelectedCount,
  }
}

function buildCanonicalMetricArrays(adcValues, key, preGateValues = adcValues) {
  const matrixConfig = getMatrixConfig(key, adcValues)
  const stats = calcPressureFormulaStats(adcValues, key, matrixConfig.pointAreaCm2)
  const source = Array.isArray(preGateValues) ? preGateValues : []
  const pressureArr = stats.pressureValues.map((value) => {
    const numeric = Number(value)
    return Number.isFinite(numeric) ? Math.max(0, numeric) : 0
  })
  const forceArr = pressureArr.map((value) => value * matrixConfig.pointAreaCm2 * 0.1)
  const calibrationValidMask = adcValues.map((value) => (
    Number.isFinite(Number(value)) && Number(value) > 0 ? 1 : 0
  ))
  const activePressureValues = pressureArr.filter((value) => Number.isFinite(value) && value > 0)
  const validPressureTotal = pressureArr.reduce((sum, value, index) => (
    calibrationValidMask[index] ? sum + value : sum
  ), 0)
  const validPointCount = calibrationValidMask.reduce((sum, value) => sum + value, 0)
  const matrixAveragePressureKPa = validPointCount
    ? validPressureTotal / validPointCount
    : 0
  const matrixMaxPressureKPa = activePressureValues.length
    ? Math.max(...activePressureValues)
    : 0
  return {
    pressureArr,
    forceArr,
    calibrationValidMask,
    calibrationDiagnostics: {
      inputMinAdc: stats.calibrationInputMinAdc,
      preGatePositiveCount: source.filter((value) => Number(value) > 0).length,
      validCount: stats.calibrationValidCount,
      selectedCount: stats.calibrationSelectedCount,
      inputMeanAdc: stats.adcAvg,
      inputMaxAdc: stats.rawMax,
      branch: stats.pressureCalibrationBranch,
      humanValidPointThreshold: stats.humanValidPointThreshold,
      humanCoefficient: stats.humanCoefficient,
      pointPressureScale: stats.pointPressureScale,
      matrixConversion: stats.matrixConversion,
      activePressureCount: activePressureValues.length,
      averagePressureKPa: matrixAveragePressureKPa,
      maxPressureKPa: matrixMaxPressureKPa,
      matrixAveragePressureKPa,
      matrixMaxPressureKPa,
      targetAveragePressureKPa: stats.targetAveragePressureKPa,
      statisticsSource: 'pressureArr+calibrationValidMask',
    },
  }
}

function getPressureDistributionMode(formula = loadPressureFormula()) {
  if (isNativeCalibrationFormula(formula)) return NATIVE_CALIBRATION_DISTRIBUTION
  return typeof formula.master === 'function'
    ? POINT_PRESSURE_DISTRIBUTION
    : CURVE_PRESSURE_DISTRIBUTION
}

function buildProcessingMetadata(config, key) {
  const pressureConfig = loadPressureConfig()
  return {
    version: PROCESSING_VERSION,
    adcPreprocessing: ADC_PREPROCESSING_MODE,
    filter: config.filter,
    gauss: config.gauss,
    coherent: config.coherent,
    filterApplied: false,
    gaussianApplied: false,
    gaussianSigma: 0,
    temporal: false,
    outputDigits: DISPLAY_DIGITS,
    formulaFile: pressureConfig.pressureFormulaFile,
    formulaProfile: pressureConfig.pressureFormulaProfile,
    pressureDistribution: getPressureDistributionMode(),
    calibrationInputGrid: 'display-matrix-post-interpolation',
    calibrationInputMinAdc: getCalibrationInputMinAdc(key),
    calibrationMethod: 'formula-weight-normalization-or-human-x2.2-gt300',
    statisticsSource: 'pressureArr+calibrationValidMask',
  }
}

function processMatrixItem(key, item = {}, processingConfig = DEFAULT_FRAME_PROCESSING_CONFIG) {
  const source = Array.isArray(item.arr) ? item.arr : []
  const config = normalizeFrameProcessingConfig(processingConfig)
  const arr = normalizeCalibrationAdcMatrix(source, key)
  if (!arr.length && source.length) return { ...item }
  const metrics = buildCanonicalMetricArrays(arr, key, source)
  return {
    ...item,
    rawAdcArr: Array.isArray(item.rawAdcArr) ? [...item.rawAdcArr] : [...source],
    calibrationAdcArr: [...arr],
    arr,
    ...metrics,
    processing: buildProcessingMetadata(config, key),
  }
}

function hasCanonicalMetricArrays(item = {}) {
  const length = Array.isArray(item.arr) ? item.arr.length : 0
  const pressureConfig = loadPressureConfig()
  return item.processing?.version === PROCESSING_VERSION
    && item.processing?.adcPreprocessing === ADC_PREPROCESSING_MODE
    && item.processing?.formulaFile === pressureConfig.pressureFormulaFile
    && item.processing?.formulaProfile === pressureConfig.pressureFormulaProfile
    && item.processing?.pressureDistribution === getPressureDistributionMode()
    && length > 0
    && Array.isArray(item.pressureArr)
    && item.pressureArr.length === length
    && Array.isArray(item.forceArr)
    && item.forceArr.length === length
    && Array.isArray(item.calibrationValidMask)
    && item.calibrationValidMask.length === length
}

function ensureProcessedMatrixItem(key, item = {}, processingConfig = DEFAULT_FRAME_PROCESSING_CONFIG) {
  if (hasCanonicalMetricArrays(item)) return { ...item }
  const source = Array.isArray(item.calibrationAdcArr)
    ? item.calibrationAdcArr
    : Array.isArray(item.rawAdcArr)
      ? item.rawAdcArr
      : item.arr
  return processMatrixItem(key, { ...item, arr: source }, item.processing || processingConfig)
}

module.exports = {
  PROCESSING_VERSION,
  ADC_PREPROCESSING_MODE,
  NATIVE_CALIBRATION_DISTRIBUTION,
  NATIVE_CALIBRATION_MIN_ADC,
  NATIVE_BACKREST_CALIBRATION_MIN_ADC,
  CURVE_PRESSURE_DISTRIBUTION,
  POINT_PRESSURE_DISTRIBUTION,
  DISPLAY_DIGITS,
  GAUSSIAN_SIGMA_FACTOR,
  DEFAULT_FRAME_PROCESSING_CONFIG,
  MATRIX_CONFIG,
  normalizeFrameProcessingConfig,
  getMatrixConfig,
  getPressurePointAreaCm2,
  gaussianBlur,
  normalizeCalibrationAdcMatrix,
  getCalibrationInputMinAdc,
  applyCalibrationInputGate,
  processAdcMatrix,
  isNativeCalibrationFormula,
  calcNativeCalibrationPressureValues,
  calcAverageFormulaPressureValues,
  calcPressureFormulaStats,
  buildCanonicalMetricArrays,
  getPressureDistributionMode,
  processMatrixItem,
  hasCanonicalMetricArrays,
  ensureProcessedMatrixItem,
}
