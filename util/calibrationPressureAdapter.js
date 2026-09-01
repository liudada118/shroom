'use strict'

const REQUIRED_CALIBRATION_EXPORTS = Object.freeze([
  'calculateBasePressure',
  'getCalibrationInput',
  'calculateWeightPointPressures',
  'calculatePressureMetrics',
  'adcMatrixToPressureMatrix',
])

const DEFAULT_HUMAN_VALID_POINT_THRESHOLD = 300
const DEFAULT_HUMAN_COEFFICIENT = 2.2

function isCalibrationFormula(formula) {
  return REQUIRED_CALIBRATION_EXPORTS.every((name) => typeof formula?.[name] === 'function')
}

function calculateCalibrationSummary(_metrics, pressureValues) {
  const validPointPressures = pressureValues.map((value) => {
    const numeric = Number(value)
    return Number.isFinite(numeric) ? Math.max(0, numeric) : 0
  })
  const pressureTotal = validPointPressures.reduce((sum, value) => sum + value, 0)
  return {
    summaryAveragePressureKPa: validPointPressures.length
      ? pressureTotal / validPointPressures.length
      : 0,
    summaryMaxPressureKPa: validPointPressures.length
      ? Math.max(...validPointPressures)
      : 0,
  }
}

/**
 * Uses the supplied calibration file as the complete pressure contract.
 * The caller applies the fixed ADC input gate; the calibration file owns
 * the complete matrix conversion through adcMatrixToPressureMatrix.
 */
function calculateCalibrationPressureDistribution(formula, data, sensor, humanCoefficient) {
  if (!isCalibrationFormula(formula)) {
    throw new TypeError(`Calibration formula must export ${REQUIRED_CALIBRATION_EXPORTS.join('/')}`)
  }
  if (!Array.isArray(data)) {
    throw new TypeError('data must be an ADC array or matrix')
  }

  const isMatrix = Array.isArray(data[0])
  const sourceValues = isMatrix ? data.flat() : data
  const sourceMatrix = isMatrix ? data : [sourceValues]
  const validAdcValues = sourceValues
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0)
  const configuredThreshold = Number(formula.HUMAN_VALID_POINT_THRESHOLD)
  const humanValidPointThreshold = Number.isFinite(configuredThreshold)
    ? configuredThreshold
    : DEFAULT_HUMAN_VALID_POINT_THRESHOLD
  const configuredCoefficient = Number(
    humanCoefficient == null ? formula.DEFAULT_HUMAN_COEFFICIENT : humanCoefficient,
  )
  const resolvedHumanCoefficient = Number.isFinite(configuredCoefficient) && configuredCoefficient > 0
    ? configuredCoefficient
    : DEFAULT_HUMAN_COEFFICIENT
  const usesHumanCoefficient = validAdcValues.length > humanValidPointThreshold
  const pointPressureScale = usesHumanCoefficient ? resolvedHumanCoefficient : 1
  const weightDistribution = usesHumanCoefficient
    ? null
    : formula.calculateWeightPointPressures(data, sensor)
  const matrixApiResult = formula.adcMatrixToPressureMatrix(
    sourceMatrix,
    sensor,
    resolvedHumanCoefficient,
  )
  const matrixApiValues = Array.isArray(matrixApiResult?.[0])
    ? matrixApiResult.flat()
    : null
  if (!Array.isArray(matrixApiValues)) {
    throw new TypeError('Calibration adcMatrixToPressureMatrix must return a two-dimensional matrix')
  }
  const pressureValues = matrixApiValues.map((value) => {
    const numeric = Number(value)
    return Number.isFinite(numeric) ? Math.max(0, numeric) : 0
  })

  if (pressureValues.length !== sourceValues.length) {
    throw new RangeError('Calibration pressure matrix length does not match the ADC matrix')
  }

  const calibrationPointPressures = pressureValues.filter((_, index) => {
    const adc = Number(sourceValues[index])
    return Number.isFinite(adc) && adc > 0
  })
  const activePointPressures = pressureValues.filter((value) => Number.isFinite(value) && value > 0)
  const actualAveragePressureKPa = calibrationPointPressures.length
    ? calibrationPointPressures.reduce((sum, value) => sum + value, 0) / calibrationPointPressures.length
    : 0
  const calibrationInput = formula.getCalibrationInput(validAdcValues, sensor)
  const calibrationSummary = calculateCalibrationSummary(null, calibrationPointPressures)

  let pressureMatrixKPa = pressureValues
  if (isMatrix) {
    let offset = 0
    pressureMatrixKPa = data.map((row) => {
      const pressureRow = pressureValues.slice(offset, offset + row.length)
      offset += row.length
      return pressureRow
    })
  }

  return {
    mean: Number(weightDistribution?.mean ?? calibrationInput.mean) || 0,
    selectedCount: Number(weightDistribution?.selectedCount ?? calibrationInput.selectedCount) || 0,
    validCount: validAdcValues.length,
    maxAdc: validAdcValues.length ? Math.max(...validAdcValues) : 0,
    inputLabel: usesHumanCoefficient
      ? `插值后有效ADC逐点基础曲线 x ${pointPressureScale}`
      : calibrationInput.inputLabel,
    branch: usesHumanCoefficient ? 'human' : 'weight',
    humanValidPointThreshold,
    humanCoefficient: usesHumanCoefficient ? pointPressureScale : null,
    pointPressureScale,
    matrixConversion: 'adcMatrixToPressureMatrix',
    pointPressureCount: activePointPressures.length,
    pointPressuresKPa: calibrationPointPressures,
    pressureMatrixKPa,
    pressureValuesKPa: activePointPressures,
    actualAveragePressureKPa,
    targetAveragePressureKPa: weightDistribution?.targetAveragePressureKPa ?? null,
    avgPressureKPa: actualAveragePressureKPa,
    maxPressureKPa: calibrationSummary.summaryMaxPressureKPa,
    ...calibrationSummary,
    normalizationScale: usesHumanCoefficient ? 1 : weightDistribution?.normalizationScale ?? null,
    meanConservationErrorKPa: usesHumanCoefficient
      ? 0
      : weightDistribution?.meanConservationErrorKPa ?? null,
    fallbackMode: usesHumanCoefficient
      ? (calibrationPointPressures.length ? 'none' : 'no-valid-points')
      : weightDistribution?.fallbackMode ?? 'none',
  }
}

module.exports = {
  REQUIRED_CALIBRATION_EXPORTS,
  DEFAULT_HUMAN_VALID_POINT_THRESHOLD,
  DEFAULT_HUMAN_COEFFICIENT,
  isCalibrationFormula,
  calculateCalibrationSummary,
  calculateCalibrationPressureDistribution,
}
