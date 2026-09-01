'use strict'

const DEFAULT_EPSILON = 1e-12

function calculateRankMean(validAdc, startRank, endRank) {
  if (!Number.isInteger(startRank) || !Number.isInteger(endRank) || startRank < 1 || endRank < startRank) {
    throw new RangeError('startRank and endRank must be a valid one-based closed interval')
  }

  const sorted = [...validAdc].sort((left, right) => right - left)
  const startIndex = sorted.length >= startRank ? startRank - 1 : 0
  const selected = sorted.slice(startIndex, Math.min(endRank, sorted.length))
  return {
    mean: selected.length ? selected.reduce((sum, value) => sum + value, 0) / selected.length : 0,
    selectedCount: selected.length,
    validCount: sorted.length,
    maxAdc: sorted[0] ?? 0,
  }
}

function distributeWeightPointPressures(data, options) {
  if (!Array.isArray(data)) throw new TypeError('data must be an ADC array or matrix')
  if (!options || typeof options.curve !== 'function') throw new TypeError('options.curve must be a function')

  const isMatrix = data.some(Array.isArray)
  if (isMatrix && !data.every(Array.isArray)) throw new TypeError('data cannot mix values and rows')
  const matrix = isMatrix ? data : [data]
  const validPoints = []
  matrix.forEach((row, rowIndex) => {
    row.forEach((value, columnIndex) => {
      const adc = Number(value)
      if (Number.isFinite(adc) && adc > 0) validPoints.push({ row: rowIndex, column: columnIndex, adc })
    })
  })

  const pressureMatrixKPa = matrix.map((row) => row.map(() => 0))
  if (!validPoints.length) {
    return {
      pressureMatrixKPa,
      pressureValuesKPa: [],
      targetAveragePressureKPa: null,
      actualAveragePressureKPa: null,
      maxPressureKPa: null,
      referenceAdcMean: 0,
      selectedCount: 0,
      validCount: 0,
      curveResponseMeanKPa: 0,
      normalizationScale: null,
      meanConservationErrorKPa: null,
      fallbackMode: 'no-valid-points',
    }
  }

  const rankInput = calculateRankMean(
    validPoints.map((point) => point.adc),
    options.startRank ?? 1,
    options.endRank ?? 46,
  )
  const fittedTarget = options.targetAveragePressureKPa === undefined
    ? options.curve(rankInput.mean)
    : Number(options.targetAveragePressureKPa)
  if (fittedTarget === null || fittedTarget === undefined || !Number.isFinite(Number(fittedTarget))) {
    throw new RangeError('calibrated target pressure must be finite')
  }

  const epsilon = options.epsilon ?? DEFAULT_EPSILON
  const targetAveragePressureKPa = Math.max(0, Number(fittedTarget))
  const curveResponses = validPoints.map(({ adc }) => {
    const response = options.curve(adc)
    if (response === null || response === undefined) return 0
    const numeric = Number(response)
    if (!Number.isFinite(numeric)) throw new RangeError(`curve returned a non-finite response for ADC ${adc}`)
    return Math.max(0, numeric)
  })
  const curveResponseMeanKPa = curveResponses.reduce((sum, value) => sum + value, 0) / curveResponses.length

  let normalizationScale = null
  let fallbackMode = 'none'
  let pressureValuesKPa
  if (targetAveragePressureKPa <= epsilon) {
    pressureValuesKPa = curveResponses.map(() => 0)
    normalizationScale = curveResponseMeanKPa > epsilon ? 0 : null
    fallbackMode = 'all-zero'
  } else if (curveResponseMeanKPa <= epsilon) {
    pressureValuesKPa = curveResponses.map(() => targetAveragePressureKPa)
    fallbackMode = 'equal-distribution'
  } else {
    normalizationScale = targetAveragePressureKPa / curveResponseMeanKPa
    pressureValuesKPa = curveResponses.map((response) => response * normalizationScale)
  }

  const targetSum = targetAveragePressureKPa * pressureValuesKPa.length
  const currentSum = pressureValuesKPa.reduce((sum, value) => sum + value, 0)
  pressureValuesKPa[pressureValuesKPa.length - 1] += targetSum - currentSum
  validPoints.forEach((point, index) => {
    pressureMatrixKPa[point.row][point.column] = pressureValuesKPa[index]
  })

  const actualAveragePressureKPa = pressureValuesKPa.reduce((sum, value) => sum + value, 0) / pressureValuesKPa.length
  return {
    pressureMatrixKPa,
    pressureValuesKPa,
    targetAveragePressureKPa,
    actualAveragePressureKPa,
    maxPressureKPa: Math.max(...pressureValuesKPa),
    referenceAdcMean: rankInput.mean,
    selectedCount: rankInput.selectedCount,
    validCount: rankInput.validCount,
    curveResponseMeanKPa,
    normalizationScale,
    meanConservationErrorKPa: actualAveragePressureKPa - targetAveragePressureKPa,
    fallbackMode,
  }
}

module.exports = {
  DEFAULT_EPSILON,
  calculateRankMean,
  distributeWeightPointPressures,
}
