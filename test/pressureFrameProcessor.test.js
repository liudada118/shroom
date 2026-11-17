const test = require('node:test')
const assert = require('node:assert/strict')

const {
  NATIVE_CALIBRATION_MIN_ADC,
  NATIVE_BACKREST_CALIBRATION_MIN_ADC,
  NATIVE_CALIBRATION_DISTRIBUTION,
  calcNativeCalibrationPressureValues,
  calcPressureFormulaStats,
  ensureProcessedMatrixItem,
  normalizeFrameProcessingConfig,
  processMatrixItem,
} = require('../util/pressureFrameProcessor')
const calibrationFormula = require('../server/kpa/seatBackrestPressure_v2.11.0')
const activeFormula = require('../calibration/seatBackrestPressure_v2.12.0.js')
const { endiBack1024 } = require('../util/line')
const {
  FULL_PROCESSING_VERSION,
  FULL_ADC_PREPROCESSING,
  FULL_DISTRIBUTION,
} = require('../util/fullAlgorithmProcessor')

let streamIndex = 0

function processPhysical(key, physical, item = {}, config = {}) {
  streamIndex += 1
  return processMatrixItem(key, {
    arr: [],
    algorithmPhysicalFrame: physical,
    algorithmTimestampMs: 0,
    algorithmStreamId: `frame-processor-test-${streamIndex}`,
    ...item,
  }, config)
}

function contactPhysical(rows = 23, cols = 23, value = 110) {
  return Array.from({ length: rows }, (_, row) => Array.from({ length: cols }, (_, col) => (
    row >= 7 && row <= 13 && col >= 8 && col <= 14 ? value : 0
  )))
}

function rawDisplay(output) {
  let matrix = output.sourceMatrix
  for (let i = 0; i < 3; i++) matrix = matrix[0].map((_, col) => matrix.map(row => row[col]).reverse())
  return output.sensorType === 'endi-23x23' ? matrix.flat().reverse() : matrix.flat()
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function prepareReferenceAdc(values, sensor) {
  return values.map((value) => {
    if (!Number.isFinite(value) || value <= 0) return 0
    const corrected = sensor === 'seat'
      ? 1.0069947916666666 * value + 6.018421875000001
      : value
    return corrected > 30 ? corrected : 0
  })
}

function referenceMetrics(values, sensor) {
  return calibrationFormula.calculatePressureMetricsFromMatrix(
    [prepareReferenceAdc(values, sensor)],
    sensor === 'seat' ? 'endi-23x23' : 'new-backrest-32x25',
  )
}

function referenceBasePressure(value, sensor) {
  return calibrationFormula.calculateMatrixPressureMap(
    [[value]], sensor === 'seat' ? 'endi-23x23' : 'new-backrest-32x25',
  ).kpa[0][0]
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

test('native input uses complete kernel compensation and filtering independently of legacy visual settings', () => {
  const physical = contactPhysical()
  physical[2][2] = 24
  physical[3][3] = 29
  const expected = activeFormula.calculateSensorFrame({ physical, timestampMs: 0 }, 'endi-23x23')
  const firstConfig = { filter: 0, gauss: 0, coherent: 7 }
  const ignoredProcessingConfig = { filter: 4095, gauss: 4, coherent: 1 }

  const first = processPhysical('endi-sit', physical, {}, firstConfig)
  const second = processPhysical('endi-sit', physical, {}, ignoredProcessingConfig)

  assert.deepEqual(first.arr, rawDisplay(expected))
  assert.deepEqual(second.arr, rawDisplay(expected))
  assert.deepEqual(first.pressureArr, second.pressureArr)
  assert.deepEqual(first.forceArr, second.forceArr)
  assert.deepEqual(first.calibrationAdcArr, expected.displayAdcMatrix.flat())
  assert.equal(first.processing.version, FULL_PROCESSING_VERSION)
  assert.equal(first.processing.adcPreprocessing, FULL_ADC_PREPROCESSING)
  assert.equal(first.processing.temporal, true)
  assert.equal(first.processing.pressureDistribution, FULL_DISTRIBUTION)
  assert.equal(first.processing.calibrationInputGrid, 'native-physical-before-interpolation')
  assert.deepEqual(first.algorithmMetrics.forceMetrics, expected.forceMetrics)
  assert.deepEqual(first.algorithmMetrics.areaMetrics, expected.areaMetrics)
  assert.deepEqual(first.algorithmPhysicalFrame, physical)
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
  const gatedInterpolatedValues = interpolatedValues.map((value) => (value > 30 ? value : 0))
  const interpolatedCount = gatedInterpolatedValues.filter((value) => value > 0).length
  const result = calcNativeCalibrationPressureValues(
    interpolatedValues,
    'endi-back',
    calibrationFormula,
  )

  assert.equal(interpolatedValues.length, 50 * 64)
  assert.ok(interpolatedCount > 300)
  assert.equal(result.calibrationAdcValues.length, 50 * 64)
  assert.deepEqual(result.calibrationAdcValues, gatedInterpolatedValues)
  assert.equal(result.branch, 'human')
  assert.equal(result.humanCoefficient, 2.2)
  const firstActiveIndex = gatedInterpolatedValues.findIndex((value) => value > 0)
  const expectedPressure = referenceBasePressure(
    gatedInterpolatedValues[firstActiveIndex],
    'backrest',
  ) * 2.2
  assert.ok(Math.abs(result.pressureValues[firstActiveIndex] - expectedPressure) < 1e-12)
})

test('native calibration derives average and maximum from the normalized heatmap matrix', () => {
  const seatValues = [0, ...Array.from({ length: 100 }, (_, index) => index + 70)]
  const seatDistribution = referenceMetrics(seatValues, 'seat')
  const seatPressures = seatDistribution.pressureMatrixKPa[0].filter((value) => value > 0)
  const seatStats = calcPressureFormulaStats(seatValues, 'endi-sit', undefined, false, calibrationFormula)

  assert.equal(seatStats.calibrationSelectedCount, seatDistribution.topCount)
  assert.ok(Math.abs(seatStats.adcAvg - seatDistribution.topMean) < 1e-12)
  assert.ok(Math.abs(seatStats.aver - mean(seatPressures)) < 1e-12)
  assert.ok(Math.abs(seatStats.max - Math.max(...seatPressures)) < 1e-12)
  assert.ok(Math.abs(seatStats.total - seatPressures.reduce((sum, value) => sum + value, 0) * 0.1) < 1e-12)
  assert.equal(seatStats.pressureDistribution, NATIVE_CALIBRATION_DISTRIBUTION)
  assert.equal(seatStats.pressureCalibrationBranch, 'weight')
  assert.equal(seatStats.normalizationScale, seatDistribution.normalizationScale)

  const backValues = Array.from({ length: 80 }, (_, index) => index + 100)
  const backDistribution = referenceMetrics(backValues, 'backrest')
  const backPressures = backDistribution.pressureMatrixKPa[0].filter((value) => value > 0)
  const backStats = calcPressureFormulaStats(backValues, 'endi-back', undefined, false, calibrationFormula)

  assert.equal(backStats.calibrationSelectedCount, backDistribution.topCount)
  assert.ok(Math.abs(backStats.adcAvg - backDistribution.topMean) < 1e-12)
  assert.ok(Math.abs(backStats.aver - mean(backPressures)) < 1e-12)
  assert.ok(Math.abs(backStats.max - Math.max(...backPressures)) < 1e-12)
  assert.equal(backStats.matrixMaxPressureKPa, backStats.max)
  assert.equal(backStats.matrixAveragePressureKPa, backStats.aver)
  assert.ok(Math.abs(backStats.total - backPressures.reduce((sum, value) => sum + value, 0) * 1.3 * 0.1) < 1e-12)
})

test('more than 300 effective points multiply every direct point pressure by 2.2', () => {
  const values = Array.from({ length: 301 }, (_, index) => 70 + (index % 120))
  const expectedPressureValues = prepareReferenceAdc(values, 'seat').map((value) => (
    referenceBasePressure(value, 'seat') * 2.2
  ))
  const stats = calcPressureFormulaStats(values, 'endi-sit', undefined, false, calibrationFormula)

  assert.ok(Math.abs(stats.aver - mean(expectedPressureValues)) < 1e-12)
  assert.ok(Math.abs(stats.max - Math.max(...expectedPressureValues)) < 1e-12)
  assert.equal(stats.normalizationScale, null)
  assert.equal(stats.pressureCalibrationBranch, 'human')
  assert.equal(stats.humanValidPointThreshold, 300)
  assert.equal(stats.humanCoefficient, 2.2)
  assert.equal(stats.pointPressureScale, 2.2)
})

test('canonical pressure and force matrices preserve formula precision and are not processed twice', () => {
  const physical = contactPhysical()
  const expected = activeFormula.calculateSensorFrame({ physical, timestampMs: 0 }, 'endi-23x23')
  const processed = processPhysical('endi-sit', physical, {}, {
    filter: 30,
    gauss: 0.5,
    coherent: 1,
  })
  const ensured = ensureProcessedMatrixItem('endi-sit', processed, {
    filter: 4095,
    gauss: 4,
    coherent: 10,
  })

  assert.equal(processed.pressureArr.length, 46 * 46)
  assert.equal(processed.forceArr.length, 46 * 46)
  assert.ok(processed.pressureArr.every(value => value === null))
  assert.deepEqual(processed.algorithmMetrics.pressureMetrics, expected.pressureMetrics)
  assert.deepEqual(processed.calibrationAdcArr, expected.displayAdcMatrix.flat())
  assert.deepEqual(processed.algorithmPhysicalFrame, physical)
  assert.deepEqual(ensured.arr, processed.arr)
  assert.deepEqual(ensured.pressureArr, processed.pressureArr)
  assert.deepEqual(ensured.forceArr, processed.forceArr)

  assert.deepEqual(processed.algorithmMetrics.forceMetrics, expected.forceMetrics)
  assert.deepEqual(processed.algorithmMetrics.areaMetrics, expected.areaMetrics)
  assert.equal(processed.processing.statisticsSource, 'algorithmMetrics')
  assert.ok(processed.forceArr.every(value => value === null))
  assert.deepEqual(processed.arr, rawDisplay(expected))
  assert.equal(processed.algorithmMetrics.summary.forceN, expected.forceMetrics.forceN)
  assert.equal(processed.algorithmMetrics.summary.areaCm2, expected.areaMetrics.areaCm2)
})

test('legacy native inputs are recalculated and complete saved force/area keep their acquired algorithm identity', () => {
  const physical = contactPhysical()
  const values = new Array(46 * 46).fill(999)
  const legacyItem = {
    arr: [...values],
    rawAdcArr: [...values],
    pressureArr: new Array(values.length).fill(999),
    forceArr: new Array(values.length).fill(999),
    algorithmPhysicalFrame: physical,
    algorithmTimestampMs: 0,
    algorithmStreamId: 'legacy-native-reprocessing-test',
    processing: {
      version: 'backend-spatial-v1',
      filter: 30,
      gauss: 0,
      coherent: 1,
    },
  }
  const recalculated = ensureProcessedMatrixItem('endi-sit', legacyItem)

  assert.equal(recalculated.processing.version, FULL_PROCESSING_VERSION)
  assert.equal(recalculated.processing.pressureDistribution, FULL_DISTRIBUTION)
  assert.notEqual(recalculated.pressureArr[100], 999)
  assert.notEqual(recalculated.forceArr[100], 999)

  const staleFormulaItem = {
    ...recalculated,
    pressureArr: new Array(values.length).fill(777),
    forceArr: new Array(values.length).fill(777),
    processing: {
      ...recalculated.processing,
      formulaFile: 'previous-formula.js',
    },
  }
  const formulaRecalculated = ensureProcessedMatrixItem('endi-sit', staleFormulaItem)
  assert.deepEqual(formulaRecalculated.algorithmMetrics, recalculated.algorithmMetrics)
  assert.equal(formulaRecalculated.processing.formulaFile, 'previous-formula.js')
})

test('complete backrest metrics match the external algorithm independently of raw display', () => {
  const physical = Array.from({ length: 32 }, () => new Array(25).fill(100))
  const expected = activeFormula.calculateSensorFrame({ physical, timestampMs: 0 }, 'new-backrest-32x25')
  const processed = processPhysical('endi-back', physical)
  assert.deepEqual(processed.algorithmMetrics.pressureMetrics, expected.pressureMetrics)
  assert.deepEqual(processed.algorithmMetrics.forceMetrics, expected.forceMetrics)
  assert.deepEqual(processed.algorithmMetrics.areaMetrics, expected.areaMetrics)
  assert.deepEqual(processed.calibrationAdcArr, expected.displayAdcMatrix.flat())
  assert.deepEqual(processed.arr, rawDisplay(expected))
})

test('native backrest ADC is preserved while display interpolation follows the supplied complete algorithm', () => {
  const physical = Array.from({ length: 32 }, () => new Array(25).fill(106.24))
  const expected = activeFormula.calculateSensorFrame({ physical, timestampMs: 0 }, 'new-backrest-32x25')
  const processed = processPhysical('endi-back', physical, {}, {
    filter: 0,
    gauss: 0,
    coherent: 1,
  })
  assert.equal(Math.max(...processed.calibrationAdcArr), Math.max(...expected.displayAdcMatrix.flat()))
  assert.deepEqual(processed.algorithmPhysicalFrame, physical)
  assert.deepEqual(processed.algorithmMetrics.pressureMetrics, expected.pressureMetrics)
  assert.deepEqual(processed.arr, rawDisplay(expected))
})

test('complete seat and backrest matrices apply the delivered calibration threshold after interpolation', () => {
  for (const [key, type, rows, cols] of [
    ['endi-sit', 'endi-23x23', 23, 23], ['endi-back', 'new-backrest-32x25', 32, 25],
  ]) {
    const physical = contactPhysical(rows, cols, 31)
    const processed = processPhysical(key, physical)
    const expected = activeFormula.calculateSensorFrame({ physical, timestampMs: 0 }, type)
    assert.equal(Object.hasOwn(processed.processing.algorithmOptions, 'filterThreshold'), false)
    assert.deepEqual(processed.calibrationAdcArr, expected.displayAdcMatrix.flat())
    assert.ok(processed.calibrationAdcArr.every((value) => value === 0 || value > 30))
    assert.deepEqual(processed.arr, rawDisplay(expected))
    assert.equal(processed.algorithmMetrics.pressureMetrics.validCount, expected.pressureMetrics.validCount)
  }
  assert.equal(NATIVE_BACKREST_CALIBRATION_MIN_ADC, NATIVE_CALIBRATION_MIN_ADC)
})

test('explicit point-map calibration filters ADC below 30 before counting the 300-point branch', () => {
  const buildValues = (noiseCount) => [
    ...new Array(56).fill(106.24),
    ...new Array(noiseCount).fill(29),
    ...new Array(50 * 64 - 56 - noiseCount).fill(0),
  ]
  const belowBoundary = calcNativeCalibrationPressureValues(buildValues(243), 'endi-back', calibrationFormula)
  const aboveBoundary = calcNativeCalibrationPressureValues(buildValues(245), 'endi-back', calibrationFormula)

  assert.equal(belowBoundary.validCount, 56)
  assert.equal(belowBoundary.selectedCount, 46)
  assert.equal(belowBoundary.branch, 'weight')
  assert.ok(Math.abs(belowBoundary.adcAvg - 106.24) < 1e-9)
  assert.ok(Math.abs(
    belowBoundary.summaryAveragePressureKPa
      - referenceBasePressure(106.24, 'backrest'),
  ) < 1e-12)
  assert.equal(belowBoundary.pressureValues.filter((value) => value > 0).length, 56)

  assert.equal(aboveBoundary.validCount, 56)
  assert.equal(aboveBoundary.selectedCount, 46)
  assert.equal(aboveBoundary.branch, 'weight')
  assert.equal(aboveBoundary.humanCoefficient, null)
  assert.equal(aboveBoundary.pressureValues.filter((value) => value > 0).length, 56)
  assert.ok(Math.abs(
    aboveBoundary.summaryAveragePressureKPa
      - referenceBasePressure(106.24, 'backrest'),
  ) < 1e-12)
  assert.equal(buildValues(243).filter((value) => value > 0).length, 299)
  assert.equal(buildValues(245).filter((value) => value > 0).length, 301)
})
