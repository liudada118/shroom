const test = require('node:test')
const assert = require('node:assert/strict')

const calibration = require('../server/kpa/point_pressure_calibration')
const {
  calculateCalibrationPressureDistribution,
} = require('../util/calibrationPressureAdapter')
const {
  normalizePressureConfig,
  listPressureFormulaFiles,
} = require('../server/services/PressureConfig')

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

test('legacy calibration filename migrates to point_pressure_calibration.js', () => {
  const config = normalizePressureConfig({
    pressureFormulaFile: 'pressureFormula_calibration_v2746_seat_v2752_backrest.js',
    pressureFormulaProfile: 'calibration_v2746_seat_v2752_backrest',
  })

  assert.deepEqual(config, {
    pressureFormulaFile: 'point_pressure_calibration.js',
    pressureFormulaProfile: 'point_pressure_calibration',
  })
  assert.ok(listPressureFormulaFiles().includes('point_pressure_calibration.js'))
})

test('seat V2.7.46 and backrest V2.7.52 preserve calibration nodes and clamps', () => {
  assert.ok(Math.abs(calibration.calculateBasePressure(calibration.SEAT_V2746.segments[0].lo, 'seat') - 2.5) < 1e-12)
  assert.ok(Math.abs(calibration.calculateBasePressure(calibration.SEAT_V2746.segments[1].lo, 'seat') - 5) < 1e-12)
  assert.ok(Math.abs(calibration.calculateBasePressure(calibration.BACKREST_V2752.segments[0].lo, 'backrest') - 2.5) < 1e-12)
  assert.equal(calibration.calculateBasePressure(1000, 'seat'), 18.5)
  assert.equal(calibration.calculateBasePressure(1000, 'backrest'), 18.5)
})

test('seat calibration input skips the highest four values while backrest uses TOP46', () => {
  const values = Array.from({ length: 80 }, (_, index) => index + 100)
  const seatInput = calibration.getCalibrationInput(values, 'seat')
  const backInput = calibration.getCalibrationInput(values, 'backrest')
  const sorted = [...values].sort((left, right) => right - left)

  assert.equal(seatInput.selectedCount, 66)
  assert.equal(seatInput.mean, mean(sorted.slice(4, 70)))
  assert.equal(backInput.selectedCount, 46)
  assert.equal(backInput.mean, mean(sorted.slice(0, 46)))
})

test('weight branch preserves the fitted average pressure', () => {
  const values = Array.from({ length: 120 }, (_, index) => 60 + (index % 130))
  for (const sensor of ['seat', 'backrest']) {
    const result = calibration.calculateWeightPointPressures(values, sensor)
    const target = calibration.calculateBasePressure(result.mean, sensor)
    assert.ok(Math.abs(result.actualAveragePressureKPa - target) < 1e-12)
    assert.ok(Math.abs(result.meanConservationErrorKPa) < 1e-12)
  }
})

test('the supplied formula and application adapter both apply 2.2 above 300 points', () => {
  const boundary = new Array(300).fill(120)
  const human = new Array(301).fill(120)
  const weightResult = calibration.calculatePressureMetrics(boundary, 'seat')
  const humanResult = calibration.calculatePressureMetrics(human, 'seat')
  const expected = calibration.calculateBasePressure(120, 'seat') * calibration.DEFAULT_HUMAN_COEFFICIENT

  assert.equal(weightResult.branch, 'weight')
  assert.equal(humanResult.branch, 'human')
  assert.equal(humanResult.humanCoefficient, 2.2)
  assert.equal(humanResult.avgPressureKPa, Number(expected.toFixed(2)))
  const distribution = calculateCalibrationPressureDistribution(calibration, human, 'seat')
  const humanPointPressure = calibration.calculateBasePressure(120, 'seat') * 2.2
  assert.equal(distribution.pressureMatrixKPa.length, human.length)
  assert.equal(distribution.branch, 'human')
  assert.equal(distribution.humanValidPointThreshold, 300)
  assert.equal(distribution.humanCoefficient, 2.2)
  assert.ok(distribution.pressureMatrixKPa.every((value) => Math.abs(value - humanPointPressure) < 1e-12))

  const boundaryDistribution = calculateCalibrationPressureDistribution(calibration, boundary, 'seat')
  const expectedBoundary = calibration.calculateWeightPointPressures(boundary, 'seat')
  assert.equal(boundaryDistribution.branch, 'weight')
  assert.equal(boundaryDistribution.humanCoefficient, null)
  assert.deepEqual(boundaryDistribution.pressureMatrixKPa, expectedBoundary.pressureMatrixKPa)
})

test('the application adapter consumes the supplied normalized weight pressure matrix', () => {
  const values = [0, ...Array.from({ length: 80 }, (_, index) => index + 100)]
  for (const sensor of ['seat', 'backrest']) {
    const result = calculateCalibrationPressureDistribution(calibration, values, sensor)
    const expected = calibration.calculateWeightPointPressures(values, sensor)
    assert.equal(result.pressureMatrixKPa.length, values.length)
    assert.equal(result.pressureMatrixKPa[0], 0)
    assert.deepEqual(result.pressureMatrixKPa, expected.pressureMatrixKPa)
    assert.equal(result.branch, 'weight')
    assert.equal(result.normalizationScale, expected.normalizationScale)
    assert.equal(result.selectedCount, expected.selectedCount)
  }
})

test('the application adapter consumes adcMatrixToPressureMatrix for seat and backrest', () => {
  const matrix = [
    [0, 96, 104],
    [112, 120, 128],
  ]

  for (const sensor of ['seat', 'backrest']) {
    const expected = calibration.adcMatrixToPressureMatrix(matrix, sensor, 2.2)
    const result = calculateCalibrationPressureDistribution(calibration, matrix, sensor, 2.2)

    assert.equal(result.matrixConversion, 'adcMatrixToPressureMatrix')
    assert.deepEqual(result.pressureMatrixKPa, expected)
  }
})

test('adapter average and maximum are derived from the final heatmap matrix', () => {
  const values = Array.from({ length: 80 }, (_, index) => index + 100)
  const result = calculateCalibrationPressureDistribution(calibration, values, 'backrest')
  const expected = calibration.calculateWeightPointPressures(values, 'backrest')
  const expectedAverage = mean(expected.pressureValuesKPa)
  const expectedMax = Math.max(...expected.pressureValuesKPa)

  assert.ok(Math.abs(result.summaryAveragePressureKPa - expectedAverage) < 1e-12)
  assert.ok(Math.abs(result.summaryMaxPressureKPa - expectedMax) < 1e-12)
  assert.equal(result.summaryMaxPressureKPa, result.maxPressureKPa)
  assert.ok(Math.abs(result.summaryAveragePressureKPa - expected.targetAveragePressureKPa) < 1e-12)
})
