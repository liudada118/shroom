'use strict'

const REQUIRED_CALIBRATION_EXPORTS = Object.freeze([
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

function getFilteredCalibrationMatrix(formula, sourceMatrix) {
  if (typeof formula.filterAdcMatrix !== 'function') return sourceMatrix
  const filtered = formula.filterAdcMatrix(sourceMatrix)
  if (!Array.isArray(filtered) || !filtered.every((row) => Array.isArray(row))) {
    throw new TypeError('Calibration filterAdcMatrix must return a two-dimensional matrix')
  }
  return filtered
}

/**
 * Uses the selected calibration file as the complete pressure contract.
 * V2.7.63 owns ADC filtering and accepts an options object. Older native
 * calibration files keep their positional matrix API for compatibility.
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
  const filteredMatrix = getFilteredCalibrationMatrix(formula, sourceMatrix)
  const filteredValues = filteredMatrix.flat().map((value) => {
    const numeric = Number(value)
    return Number.isFinite(numeric) && numeric > 0 ? numeric : 0
  })
  const validAdcValues = filteredValues.filter((value) => value > 0)
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
  const hasStructuredMatrixApi = typeof formula.calculatePressureFromMatrix === 'function'
  const formulaResult = hasStructuredMatrixApi
    ? formula.calculatePressureFromMatrix(sourceMatrix, {
        sensorType: sensor,
        humanCoefficient: resolvedHumanCoefficient,
      })
    : null
  const branch = formulaResult?.calibrationBranch
    || (validAdcValues.length > humanValidPointThreshold ? 'human' : 'weight')
  const usesHumanCoefficient = branch === 'human'
  const pointPressureScale = usesHumanCoefficient ? resolvedHumanCoefficient : 1
  const weightDistribution = !hasStructuredMatrixApi
    && !usesHumanCoefficient
    && typeof formula.calculateWeightPointPressures === 'function'
    ? formula.calculateWeightPointPressures(data, sensor)
    : null
  const matrixApiResult = hasStructuredMatrixApi
    ? formulaResult?.pressureMatrixKPa
    : formula.adcMatrixToPressureMatrix(sourceMatrix, sensor, resolvedHumanCoefficient)
  const matrixApiValues = Array.isArray(matrixApiResult?.[0])
    ? matrixApiResult.flat()
    : null
  if (!Array.isArray(matrixApiValues)) {
    throw new TypeError('Calibration matrix API must return a two-dimensional pressure matrix')
  }

  const pressureValues = matrixApiValues.map((value) => {
    const numeric = Number(value)
    return Number.isFinite(numeric) ? Math.max(0, numeric) : 0
  })
  if (pressureValues.length !== sourceValues.length) {
    throw new RangeError('Calibration pressure matrix length does not match the ADC matrix')
  }

  const calibrationPointPressures = pressureValues.filter((_, index) => filteredValues[index] > 0)
  const activePointPressures = pressureValues.filter((value) => value > 0)
  const actualAveragePressureKPa = calibrationPointPressures.length
    ? calibrationPointPressures.reduce((sum, value) => sum + value, 0) / calibrationPointPressures.length
    : 0
  const calibrationInput = formulaResult
    ? {
        mean: formulaResult.topMean,
        selectedCount: formulaResult.topCount,
        inputLabel: formulaResult.inputLabel,
      }
    : formula.getCalibrationInput(validAdcValues, sensor)
  const calibrationSummary = calculateCalibrationSummary(null, calibrationPointPressures)
  const normalization = formulaResult?.normalization || {}

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
    mean: Number(calibrationInput?.mean) || 0,
    selectedCount: Number(calibrationInput?.selectedCount) || 0,
    validCount: Number(formulaResult?.validPointCount ?? validAdcValues.length) || 0,
    maxAdc: Number(formulaResult?.maxAdc ?? formulaResult?.max)
      || (validAdcValues.length ? Math.max(...validAdcValues) : 0),
    inputLabel: usesHumanCoefficient
      ? `插值后有效ADC逐点基础曲线 x ${pointPressureScale}`
      : calibrationInput?.inputLabel,
    branch,
    humanValidPointThreshold,
    humanCoefficient: usesHumanCoefficient
      ? Number(formulaResult?.humanCoefficient) || pointPressureScale
      : null,
    pointPressureScale,
    matrixConversion: hasStructuredMatrixApi
      ? 'calculatePressureFromMatrix'
      : 'adcMatrixToPressureMatrix',
    pointPressureCount: activePointPressures.length,
    pointPressuresKPa: calibrationPointPressures,
    pressureMatrixKPa,
    pressureValuesKPa: activePointPressures,
    actualAveragePressureKPa,
    targetAveragePressureKPa: normalization.targetAveragePressureKPa
      ?? weightDistribution?.targetAveragePressureKPa
      ?? null,
    avgPressureKPa: actualAveragePressureKPa,
    maxPressureKPa: calibrationSummary.summaryMaxPressureKPa,
    ...calibrationSummary,
    normalizationScale: normalization.scale ?? weightDistribution?.normalizationScale ?? null,
    meanConservationErrorKPa: normalization.meanConservationErrorKPa
      ?? weightDistribution?.meanConservationErrorKPa
      ?? null,
    fallbackMode: normalization.fallbackMode
      ?? weightDistribution?.fallbackMode
      ?? (calibrationPointPressures.length ? 'none' : 'no-valid-points'),
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
