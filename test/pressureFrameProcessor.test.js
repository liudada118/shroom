const test = require('node:test')
const assert = require('node:assert/strict')

const {
  ADC_PREPROCESSING_MODE,
  NATIVE_CALIBRATION_MIN_ADC,
  NATIVE_BACKREST_CALIBRATION_MIN_ADC,
  NATIVE_CALIBRATION_DISTRIBUTION,
  PROCESSING_VERSION,
  calcNativeCalibrationPressureValues,
  calcPressureFormulaStats,
  ensureProcessedMatrixItem,
  normalizeFrameProcessingConfig,
  processMatrixItem,
} = require('../util/pressureFrameProcessor')
const calibrationFormula = require('../server/kpa/point_pressure_calibration')
const { endiBack1024 } = require('../util/line')

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

test('frame processing settings are normalized to backend limits', () => {
  assert.deepEqual(normalizeFrameProcessingConfig({
    filter: -1,
    gauss: 99,
    coherent: 0,
  }), {
    filter: 0,
    gauss: 4,
    coherent: 1,
  })
})

test('zeroed ADC applies the fixed 30 gate without configurable filter or Gaussian processing', () => {
  const values = new Array(46 * 46).fill(0)
  values[22 * 46 + 22] = 29
  values[23 * 46 + 23] = 1000
  const expectedCalibrationValues = values.map((value) => (value >= 30 ? value : 0))
  const firstConfig = { filter: 0, gauss: 0, coherent: 7 }
  const ignoredProcessingConfig = { filter: 4095, gauss: 4, coherent: 1 }

  const first = processMatrixItem('endi-sit', { arr: values }, firstConfig)
  const second = processMatrixItem('endi-sit', { arr: values }, ignoredProcessingConfig)

  assert.deepEqual(first.arr, expectedCalibrationValues)
  assert.deepEqual(second.arr, expectedCalibrationValues)
  assert.deepEqual(first.pressureArr, second.pressureArr)
  assert.deepEqual(first.forceArr, second.forceArr)
  assert.deepEqual(first.calibrationAdcArr, expectedCalibrationValues)
  assert.equal(first.processing.version, PROCESSING_VERSION)
  assert.equal(first.processing.adcPreprocessing, ADC_PREPROCESSING_MODE)
  assert.equal(first.processing.filterApplied, false)
  assert.equal(first.processing.gaussianApplied, false)
  assert.equal(first.processing.gaussianSigma, 0)
  assert.equal(first.processing.temporal, false)
  assert.equal(first.processing.coherent, 7)
  assert.equal(first.processing.pressureDistribution, NATIVE_CALIBRATION_DISTRIBUTION)
  assert.equal(first.processing.calibrationInputGrid, 'display-matrix-post-interpolation')
  assert.equal(first.arr.filter((value) => value > 0).length, 1)
  assert.deepEqual(first.rawAdcArr, values)
})

test('native processor consumes the formula weight distribution as the final matrix', () => {
  let matrixApiCalls = 0
  const formula = {
    calculateBasePressure: (value) => ({ 100: 1.25, 120: 2.345 }[value] ?? 0),
    getCalibrationInput: () => ({ mean: 110, validCount: 2, selectedCount: 2, maxAdc: 120 }),
    calculateWeightPointPressures: () => ({
      pressureMatrixKPa: [1.25, 2.345],
      mean: 15,
      validCount: 2,
      selectedCount: 2,
      targetAveragePressureKPa: 1.7975,
      normalizationScale: 1,
      meanConservationErrorKPa: 0,
      fallbackMode: 'none',
    }),
    calculatePressureMetrics: () => {
      throw new Error('frame calibration must not be called')
    },
    adcMatrixToPressureMatrix: (matrix) => {
      matrixApiCalls += 1
      return matrix.map((row) => row.map((value) => ({ 100: 1.25, 120: 2.345 }[value] ?? 0)))
    },
  }

  const result = calcNativeCalibrationPressureValues([100, 120], 'endi-sit', formula)
  assert.deepEqual(result.pressureValues, [1.25, 2.345])
  assert.equal(result.matrixConversion, 'adcMatrixToPressureMatrix')
  assert.equal(matrixApiCalls, 1)
  assert.equal(result.branch, 'weight')
  assert.throws(
    () => calcNativeCalibrationPressureValues([100, 120], 'bed', formula),
    /no sensor mapping/,
  )
})

test('backrest calibration runs after 25x32 ADC interpolation produces the 50x64 matrix', () => {
  const rawValues = new Array(32 * 32).fill(0)
  for (let sourceRow = 15; sourceRow <= 23; sourceRow += 1) {
    for (let sourceColumn = 6; sourceColumn <= 16; sourceColumn += 1) {
      rawValues[sourceRow * 32 + sourceColumn] = 100
    }
  }
  rawValues[24 * 32 + 24] = 100
  const interpolatedValues = endiBack1024(rawValues)
  const gatedInterpolatedValues = interpolatedValues.map((value) => (value >= 30 ? value : 0))
  const interpolatedCount = gatedInterpolatedValues.filter((value) => value > 0).length
  const result = calcNativeCalibrationPressureValues(
    interpolatedValues,
    'endi-back',
    calibrationFormula,
  )

  assert.equal(interpolatedValues.length, 50 * 64)
  assert.ok(interpolatedCount > calibrationFormula.HUMAN_VALID_POINT_THRESHOLD)
  assert.equal(result.calibrationAdcValues.length, 50 * 64)
  assert.deepEqual(result.calibrationAdcValues, gatedInterpolatedValues)
  assert.equal(result.branch, 'human')
  assert.equal(result.humanCoefficient, 2.2)
  const firstActiveIndex = gatedInterpolatedValues.findIndex((value) => value > 0)
  const expectedPressure = calibrationFormula.calculateBasePressure(
    gatedInterpolatedValues[firstActiveIndex],
    'backrest',
  ) * 2.2
  assert.ok(Math.abs(result.pressureValues[firstActiveIndex] - expectedPressure) < 1e-12)
})

test('native calibration derives average and maximum from the normalized heatmap matrix', () => {
  const seatValues = [0, ...Array.from({ length: 100 }, (_, index) => index + 70)]
  const seatDistribution = calibrationFormula.calculateWeightPointPressures(seatValues, 'seat')
  const seatStats = calcPressureFormulaStats(seatValues, 'endi-sit')

  assert.equal(seatStats.calibrationSelectedCount, seatDistribution.selectedCount)
  assert.ok(Math.abs(seatStats.adcAvg - seatDistribution.mean) < 1e-12)
  assert.ok(Math.abs(seatStats.aver - seatDistribution.actualAveragePressureKPa) < 1e-12)
  assert.ok(Math.abs(seatStats.max - seatDistribution.maxPressureKPa) < 1e-12)
  assert.ok(Math.abs(seatStats.total - seatDistribution.pressureValuesKPa.reduce((sum, value) => sum + value, 0) * 0.1) < 1e-12)
  assert.equal(seatStats.pressureDistribution, NATIVE_CALIBRATION_DISTRIBUTION)
  assert.equal(seatStats.pressureCalibrationBranch, 'weight')
  assert.equal(seatStats.normalizationScale, seatDistribution.normalizationScale)

  const backValues = Array.from({ length: 80 }, (_, index) => index + 100)
  const backDistribution = calibrationFormula.calculateWeightPointPressures(backValues, 'backrest')
  const backStats = calcPressureFormulaStats(backValues, 'endi-back')

  assert.equal(backStats.calibrationSelectedCount, backDistribution.selectedCount)
  assert.ok(Math.abs(backStats.adcAvg - backDistribution.mean) < 1e-12)
  assert.ok(Math.abs(backStats.aver - backDistribution.actualAveragePressureKPa) < 1e-12)
  assert.ok(Math.abs(backStats.max - backDistribution.maxPressureKPa) < 1e-12)
  assert.equal(backStats.matrixMaxPressureKPa, backStats.max)
  assert.equal(backStats.matrixAveragePressureKPa, backStats.aver)
  assert.ok(Math.abs(backStats.total - backDistribution.pressureValuesKPa.reduce((sum, value) => sum + value, 0) * 1.3 * 0.1) < 1e-12)
})

test('more than 300 effective points multiply every direct point pressure by 2.2', () => {
  const values = Array.from({ length: 301 }, (_, index) => 70 + (index % 120))
  const expectedPressureValues = values.map((value) => (
    calibrationFormula.calculateBasePressure(value, 'seat') * 2.2
  ))
  const stats = calcPressureFormulaStats(values, 'endi-sit')

  assert.ok(Math.abs(stats.aver - mean(expectedPressureValues)) < 1e-12)
  assert.ok(Math.abs(stats.max - Math.max(...expectedPressureValues)) < 1e-12)
  assert.equal(stats.normalizationScale, 1)
  assert.equal(stats.pressureCalibrationBranch, 'human')
  assert.equal(stats.humanValidPointThreshold, 300)
  assert.equal(stats.humanCoefficient, 2.2)
  assert.equal(stats.pointPressureScale, 2.2)
})

test('canonical pressure and force matrices preserve formula precision and are not processed twice', () => {
  const values = new Array(46 * 46).fill(0)
  values[100] = 500
  values[101] = 700
  const processed = processMatrixItem('endi-sit', { arr: values }, {
    filter: 30,
    gauss: 0.5,
    coherent: 1,
  })
  const ensured = ensureProcessedMatrixItem('endi-sit', processed, {
    filter: 4095,
    gauss: 4,
    coherent: 10,
  })

  assert.equal(processed.pressureArr.length, values.length)
  assert.equal(processed.forceArr.length, values.length)
  assert.deepEqual(processed.calibrationAdcArr, values)
  assert.deepEqual(ensured.arr, processed.arr)
  assert.deepEqual(ensured.pressureArr, processed.pressureArr)
  assert.deepEqual(ensured.forceArr, processed.forceArr)

  const activePressures = processed.pressureArr.filter((value) => value > 0)
  const validCount = processed.calibrationValidMask.reduce((sum, value) => sum + value, 0)
  const heatmapAverage = processed.pressureArr.reduce((sum, value) => sum + value, 0) / validCount
  const heatmapMax = Math.max(...activePressures)
  assert.equal(processed.calibrationDiagnostics.averagePressureKPa, heatmapAverage)
  assert.equal(processed.calibrationDiagnostics.maxPressureKPa, heatmapMax)
  assert.equal(processed.calibrationDiagnostics.statisticsSource, 'pressureArr+calibrationValidMask')
  processed.forceArr.forEach((value, index) => {
    assert.ok(Math.abs(value - processed.pressureArr[index] * 0.1) < 1e-12)
  })

  const displayedForceTotal = processed.forceArr.reduce((sum, value) => sum + value, 0)
  const activePointCount = processed.forceArr.filter((value) => value > 0).length
  assert.ok(displayedForceTotal > 0)
  assert.ok(activePointCount > 0)
})

test('frames with an old processing version or formula watermark are recalculated from raw ADC', () => {
  const values = new Array(46 * 46).fill(0)
  values[100] = 500
  const legacyItem = {
    arr: [...values],
    rawAdcArr: [...values],
    pressureArr: new Array(values.length).fill(999),
    forceArr: new Array(values.length).fill(999),
    processing: {
      version: 'backend-spatial-v1',
      filter: 30,
      gauss: 0,
      coherent: 1,
    },
  }
  const recalculated = ensureProcessedMatrixItem('endi-sit', legacyItem)

  assert.equal(recalculated.processing.version, PROCESSING_VERSION)
  assert.equal(recalculated.processing.pressureDistribution, NATIVE_CALIBRATION_DISTRIBUTION)
  assert.notEqual(recalculated.pressureArr[100], 999)
  assert.notEqual(recalculated.forceArr[100], 999)

  const staleFormulaItem = {
    ...recalculated,
    pressureArr: new Array(values.length).fill(777),
    forceArr: new Array(values.length).fill(777),
    processing: {
      ...recalculated.processing,
      formulaFile: 'pressureFormula_previous.js',
    },
  }
  const formulaRecalculated = ensureProcessedMatrixItem('endi-sit', staleFormulaItem)
  assert.notEqual(formulaRecalculated.pressureArr[100], 777)
  assert.notEqual(formulaRecalculated.forceArr[100], 777)
})

test('backend pressure matrices do not add a backrest validity mask after calibration', () => {
  const values = new Array(50 * 64).fill(600)
  const processed = processMatrixItem('endi-back', { arr: values }, {
    filter: 0,
    gauss: 0,
    coherent: 1,
  })

  assert.ok(processed.pressureArr[0] > 0)
  assert.ok(processed.forceArr[13 * 50] > 0)
  assert.ok(processed.pressureArr[18 * 50] > 0)
  assert.ok(processed.forceArr[18 * 50] > 0)
  assert.equal(processed.pressureArr.filter((value) => value > 0).length, values.length)
})

test('backrest ADC 106.24 reaches the supplied calibration without a pre-calibration multiplier', () => {
  const values = new Array(50 * 64).fill(0)
  values.fill(106.24, 0, 56)
  const processed = processMatrixItem('endi-back', { arr: values }, {
    filter: 0,
    gauss: 0,
    coherent: 1,
  })
  const activePressures = processed.pressureArr.filter((value) => value > 0)

  assert.equal(Math.max(...processed.calibrationAdcArr), 106.24)
  assert.equal(activePressures.length, 56)
  assert.ok(Math.abs(mean(activePressures) - calibrationFormula.calculateBasePressure(106.24, 'backrest')) < 1e-12)
  assert.ok(Math.abs(calibrationFormula.calculateBasePressure(106.24, 'backrest') - 2.986460554) < 1e-9)
})

test('seat and backrest both filter finite ADC values below 30', () => {
  for (const [key, length] of [['endi-sit', 46 * 46], ['endi-back', 50 * 64]]) {
    const processed = processMatrixItem(key, {
      arr: [29, 30, 31, ...new Array(length - 3).fill(0)],
    })

    assert.equal(processed.processing.calibrationInputMinAdc, NATIVE_CALIBRATION_MIN_ADC)
    assert.deepEqual(processed.calibrationAdcArr.slice(0, 3), [0, 30, 31])
    assert.equal(processed.calibrationDiagnostics.validCount, 2)
  }
  assert.equal(NATIVE_BACKREST_CALIBRATION_MIN_ADC, NATIVE_CALIBRATION_MIN_ADC)
})

test('ADC values below 30 do not enter calibration count or switch the branch', () => {
  const buildValues = (noiseCount) => [
    ...new Array(56).fill(106.24),
    ...new Array(noiseCount).fill(29),
    ...new Array(50 * 64 - 56 - noiseCount).fill(0),
  ]
  const belowBoundary = processMatrixItem('endi-back', { arr: buildValues(243) })
  const aboveBoundary = processMatrixItem('endi-back', { arr: buildValues(245) })

  assert.equal(belowBoundary.processing.calibrationInputMinAdc, NATIVE_CALIBRATION_MIN_ADC)
  assert.equal(belowBoundary.calibrationDiagnostics.validCount, 56)
  assert.equal(belowBoundary.calibrationDiagnostics.selectedCount, 46)
  assert.equal(belowBoundary.calibrationDiagnostics.branch, 'weight')
  assert.ok(Math.abs(belowBoundary.calibrationDiagnostics.inputMeanAdc - 106.24) < 1e-9)
  assert.ok(Math.abs(
    belowBoundary.calibrationDiagnostics.averagePressureKPa
      - calibrationFormula.calculateBasePressure(106.24, 'backrest'),
  ) < 1e-12)
  assert.equal(belowBoundary.pressureArr.filter((value) => value > 0).length, 56)

  assert.equal(aboveBoundary.processing.calibrationInputMinAdc, NATIVE_CALIBRATION_MIN_ADC)
  assert.equal(aboveBoundary.calibrationDiagnostics.validCount, 56)
  assert.equal(aboveBoundary.calibrationDiagnostics.selectedCount, 46)
  assert.equal(aboveBoundary.calibrationDiagnostics.branch, 'weight')
  assert.equal(aboveBoundary.calibrationDiagnostics.humanCoefficient, null)
  assert.equal(aboveBoundary.pressureArr.filter((value) => value > 0).length, 56)
  assert.ok(Math.abs(
    aboveBoundary.calibrationDiagnostics.averagePressureKPa
      - calibrationFormula.calculateBasePressure(106.24, 'backrest'),
  ) < 1e-12)
  assert.equal(belowBoundary.calibrationDiagnostics.preGatePositiveCount, 299)
  assert.equal(aboveBoundary.calibrationDiagnostics.preGatePositiveCount, 301)
})
