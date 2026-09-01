import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

import {
  FORCE_METRIC_MODE,
  PRESSURE_METRIC_MODE,
  computeScale,
  getPressureFormulaProfile,
  getPressureMetricPointValues,
  getPressureMetricSummary,
  getPressurePointAreaCm2,
  master,
  normalizePressureMetricMode,
  setPressureFormulaProfile,
} from '../client/src/util/pressureMetrics.js'
import {
  beginDynamicColorFrame,
  getDynamicColorRangeMax,
  resetPressureColorRange,
  setDynamicGammaColorEnabled,
} from '../client/src/assets/util/line.js'
import {
  VISUAL_COLOR_SETTING_DEFAULT,
  loadVisualSettingValue,
} from '../client/src/util/visualSettingStorage.js'
import {
  buildPressureDisplayNormalDistribution,
  buildPressureDisplayMetricMatrix,
  summarizePressureDisplayMatrix,
} from '../client/src/util/pressureDisplayMatrix.js'

const require = createRequire(import.meta.url)
const calibrationFormula = require('../server/kpa/point_pressure_calibration.js')
const { calculateCalibrationPressureDistribution } = require('../util/calibrationPressureAdapter.js')
const { normalizePressureConfig } = require('../server/services/PressureConfig.js')
const { calcPressureFormulaStats } = require('../util/pressureFrameProcessor.js')
const CALIBRATION_FORMULA_PROFILE = 'point_pressure_calibration'

setPressureFormulaProfile(CALIBRATION_FORMULA_PROFILE)

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function getExpectedPointValues(values, sensor) {
  const gatedValues = values.map((value) => (
    Number.isFinite(Number(value)) && Number(value) >= 30 ? Number(value) : 0
  ))
  return calculateCalibrationPressureDistribution(calibrationFormula, gatedValues, sensor).pressureMatrixKPa
}

test('formula file name overrides a stale configured profile', () => {
  const normalized = normalizePressureConfig({
    backValueMultiplier: 3,
    pressureFormulaFile: 'point_pressure_calibration.js',
    pressureFormulaProfile: 'V2.8.1',
  })

  assert.equal(normalized.pressureFormulaProfile, CALIBRATION_FORMULA_PROFILE)
  assert.equal(Object.hasOwn(normalized, 'backValueMultiplier'), false)
  assert.equal(
    setPressureFormulaProfile('calibration_v2746_seat_v2752_backrest'),
    CALIBRATION_FORMULA_PROFILE,
  )
})

test('seat point matrix applies the V2.7.46 base curve to every point', () => {
  const values = [0, ...Array.from({ length: 100 }, (_, index) => index + 70)]
  const pointValues = getPressureMetricPointValues(values, 'endi-sit', PRESSURE_METRIC_MODE)
  const expectedValues = getExpectedPointValues(values, 'seat')
  const activeExpectedValues = expectedValues.filter((value) => value > 0)

  assert.equal(getPressureFormulaProfile(), CALIBRATION_FORMULA_PROFILE)
  assert.equal(pointValues[0], 0)
  pointValues.forEach((value, index) => {
    assert.ok(Math.abs(value - expectedValues[index]) < 1e-9)
  })
  assert.ok(Math.abs(mean(pointValues.filter((value) => value > 0)) - mean(activeExpectedValues)) < 1e-9)
  assert.ok(Math.abs(Math.max(...pointValues) - Math.max(...expectedValues)) < 1e-9)
})

test('browser fallback applies weight normalization through 300 points and 2.2 above 300', () => {
  const backValues = Array.from({ length: 80 }, (_, index) => index + 100)
  const backPointValues = getPressureMetricPointValues(backValues, 'endi-back', PRESSURE_METRIC_MODE)
  const backExpectedValues = getExpectedPointValues(backValues, 'backrest')
  const activeBackExpectedValues = backExpectedValues.filter((value) => value > 0)
  assert.ok(Math.abs(backPointValues[0] - backExpectedValues[0]) < 1e-9)
  assert.ok(Math.abs(mean(backPointValues) - mean(activeBackExpectedValues)) < 1e-9)

  const backSummary = getPressureMetricSummary(backValues, 'endi-back', PRESSURE_METRIC_MODE)
  assert.ok(Math.abs(backSummary.average - mean(activeBackExpectedValues)) < 1e-9)
  assert.ok(Math.abs(backSummary.max - Math.max(...activeBackExpectedValues)) < 1e-9)
  assert.equal(backSummary.metrics.matrixPressMax, backSummary.max)
  assert.equal(backSummary.metrics.matrixPressAver, backSummary.average)

  const boundaryValues = Array.from({ length: 300 }, (_, index) => 70 + (index % 120))
  const boundaryPointValues = getPressureMetricPointValues(boundaryValues, 'endi-sit', PRESSURE_METRIC_MODE)
  const boundaryExpectedValues = getExpectedPointValues(boundaryValues, 'seat')
  const boundaryBasePressure = calibrationFormula.calculateBasePressure(boundaryValues[0], 'seat')
  assert.ok(Math.abs(boundaryPointValues[0] - boundaryExpectedValues[0]) < 1e-9)
  assert.ok(Math.abs(mean(boundaryPointValues) - mean(boundaryExpectedValues)) < 1e-9)

  const humanValues = Array.from({ length: 301 }, (_, index) => 70 + (index % 120))
  const humanPointValues = getPressureMetricPointValues(humanValues, 'endi-sit', PRESSURE_METRIC_MODE)
  const humanExpectedValues = getExpectedPointValues(humanValues, 'seat')
  assert.ok(Math.abs(humanPointValues[0] - humanExpectedValues[0]) < 1e-9)
  assert.ok(Math.abs(humanPointValues[0] - boundaryBasePressure * 2.2) < 1e-9)
  assert.ok(Math.abs(mean(humanPointValues) - mean(humanExpectedValues)) < 1e-9)
})

test('browser native fallback filters ADC values below 30 before branch counting', () => {
  const seatValues = getPressureMetricPointValues([29, 30, 31], 'endi-sit', PRESSURE_METRIC_MODE)
  assert.equal(seatValues[0], 0)
  assert.ok(seatValues[1] > 0)
  assert.ok(seatValues[2] > 0)

  const buildValues = (noiseCount) => [
    ...new Array(56).fill(106.24),
    ...new Array(noiseCount).fill(29),
    ...new Array(50 * 64 - 56 - noiseCount).fill(0),
  ]
  const belowBoundary = getPressureMetricPointValues(buildValues(243), 'endi-back', PRESSURE_METRIC_MODE)
  const aboveBoundary = getPressureMetricPointValues(buildValues(245), 'endi-back', PRESSURE_METRIC_MODE)
  const activeBelow = belowBoundary.filter((value) => value > 0)
  const activeAbove = aboveBoundary.filter((value) => value > 0)
  const expectedBelow = getExpectedPointValues(buildValues(243), 'backrest')
  const expectedAbove = getExpectedPointValues(buildValues(245), 'backrest')

  assert.equal(activeBelow.length, 56)
  assert.equal(activeAbove.length, 56)
  belowBoundary.forEach((value, index) => {
    assert.ok(Math.abs(value - expectedBelow[index]) < 1e-9)
  })
  aboveBoundary.forEach((value, index) => {
    assert.ok(Math.abs(value - expectedAbove[index]) < 1e-9)
  })
})

test('browser fallback and backend canonical calculation produce the same point pressures', () => {
  const values = [0, 30, ...Array.from({ length: 100 }, (_, index) => index + 31)]
  const browserValues = getPressureMetricPointValues(values, 'endi-sit', PRESSURE_METRIC_MODE)
  const backendValues = calcPressureFormulaStats(values, 'endi-sit').pressureValues

  assert.equal(browserValues.length, backendValues.length)
  browserValues.forEach((value, index) => {
    assert.ok(Math.abs(value - backendValues[index]) < 1e-9)
  })
})

test('pressure and force summaries use the same point area conversion', () => {
  const values = [0, 100, 120, 140]
  const matrixKey = 'endi-back'
  const pointAreaCm2 = getPressurePointAreaCm2(matrixKey)
  const pressure = getPressureMetricSummary(values, matrixKey, PRESSURE_METRIC_MODE)
  const force = getPressureMetricSummary(values, matrixKey, FORCE_METRIC_MODE)

  assert.equal(force.unit, 'N')
  assert.equal(pressure.unit, 'kPa')
  assert.ok(Math.abs(force.total - pressure.total * pointAreaCm2 * 0.1) < 1e-9)
  assert.ok(Math.abs(force.max - pressure.max * pointAreaCm2 * 0.1) < 1e-9)
  assert.ok(Math.abs(force.average - pressure.average * pointAreaCm2 * 0.1) < 1e-9)
})

test('2D point values switch between kPa and N consistently', () => {
  const values = [80, 100, 120]
  const matrixKey = 'endi-sit'
  const pointAreaCm2 = getPressurePointAreaCm2(matrixKey)
  const pressureValues = getPressureMetricPointValues(values, matrixKey, PRESSURE_METRIC_MODE)
  const forceValues = getPressureMetricPointValues(values, matrixKey, FORCE_METRIC_MODE)

  forceValues.forEach((value, index) => {
    assert.ok(Math.abs(value - pressureValues[index] * pointAreaCm2 * 0.1) < 1e-9)
  })
})

test('unknown modes keep the existing force display as the default', () => {
  assert.equal(normalizePressureMetricMode(), FORCE_METRIC_MODE)
  assert.equal(normalizePressureMetricMode('invalid'), FORCE_METRIC_MODE)
})

test('left-side totals use the heatmap matrix while average uses the ADC valid-point mask', () => {
  const adcValues = [31, 0]
  const matrixKey = 'endi-sit'
  const settings = { filter: 30, gauss: 0 }
  const pressureMatrix = buildPressureDisplayMetricMatrix({
    adcValues,
    width: 2,
    height: 1,
    settings,
    matrixKey,
    metricMode: PRESSURE_METRIC_MODE,
  }).values
  const forceMatrix = buildPressureDisplayMetricMatrix({
    adcValues,
    width: 2,
    height: 1,
    settings,
    matrixKey,
    metricMode: FORCE_METRIC_MODE,
  }).values
  const pressureSummary = summarizePressureDisplayMatrix(pressureMatrix, matrixKey, PRESSURE_METRIC_MODE)
  const forceSummary = summarizePressureDisplayMatrix(forceMatrix, matrixKey, FORCE_METRIC_MODE)

  assert.deepEqual(pressureMatrix, [0.9, 0])
  assert.deepEqual(forceMatrix, [0.1, 0])
  assert.equal(pressureSummary.activeCount, pressureMatrix.filter((value) => value > 0).length)
  assert.equal(forceSummary.activeCount, forceMatrix.filter((value) => value > 0).length)
  assert.equal(forceSummary.total, forceMatrix.reduce((sum, value) => sum + value, 0))
  assert.equal(forceSummary.forceTotal, forceSummary.total)
  assert.equal(getPressureMetricPointValues(adcValues, matrixKey, FORCE_METRIC_MODE).filter((value) => value > 0).length, 1)

  const maskedSummary = summarizePressureDisplayMatrix(
    [2, 0],
    matrixKey,
    PRESSURE_METRIC_MODE,
    [1, 1],
  )
  assert.equal(maskedSummary.activeCount, 1)
  assert.equal(maskedSummary.averagePointCount, 2)
  assert.equal(maskedSummary.average, 1)
})

test('normal distribution uses active values from the final displayed kPa or N matrix', () => {
  const pressureDistribution = buildPressureDisplayNormalDistribution([0, 0.1, 0.2, 0.3], PRESSURE_METRIC_MODE)
  const forceDistribution = buildPressureDisplayNormalDistribution([0, 0.1, 0.1], FORCE_METRIC_MODE)

  assert.equal(pressureDistribution.unit, 'kPa')
  assert.equal(pressureDistribution.count, 3)
  assert.equal(pressureDistribution['\u03bc'], '0.200')
  assert.equal(forceDistribution.unit, 'N')
  assert.equal(forceDistribution.count, 2)
  assert.equal(forceDistribution['\u03bc'], '0.100')
  assert.equal(pressureDistribution.xData.length, 256)
  assert.equal(pressureDistribution.yData.length, 256)
  assert.ok(pressureDistribution.max < 255)
  assert.ok(pressureDistribution.yData.every(Number.isFinite))
  assert.ok(forceDistribution.yData.every(Number.isFinite))
})

test('automatic color range follows the rendered metric matrix instead of raw ADC', () => {
  const rawValues = [0, 80, 100, 120, 140]
  const renderedValues = getPressureMetricPointValues(rawValues, 'endi-sit', PRESSURE_METRIC_MODE)
  const renderedForceValues = getPressureMetricPointValues(rawValues, 'endi-sit', FORCE_METRIC_MODE)
  const expectedMax = Number(Math.max(...renderedValues).toFixed(2))
  const expectedForceMax = Number(Math.max(...renderedForceValues).toFixed(2))
  const scope = 'pressure-auto-range-test'
  const forceScope = 'force-auto-range-test'

  resetPressureColorRange(scope)
  setDynamicGammaColorEnabled(true, scope)
  assert.equal(beginDynamicColorFrame(renderedValues, VISUAL_COLOR_SETTING_DEFAULT, scope), expectedMax)
  assert.equal(getDynamicColorRangeMax(scope), expectedMax)
  assert.notEqual(expectedMax, Math.max(...rawValues))
  assert.equal(beginDynamicColorFrame([], VISUAL_COLOR_SETTING_DEFAULT, scope), expectedMax)
  resetPressureColorRange(forceScope)
  assert.equal(beginDynamicColorFrame(renderedForceValues, VISUAL_COLOR_SETTING_DEFAULT, forceScope), expectedForceMax)
  assert.equal(getDynamicColorRangeMax(scope), expectedMax)
  assert.equal(getDynamicColorRangeMax(forceScope), expectedForceMax)
  setDynamicGammaColorEnabled(false, scope)
})

test('legacy ADC color settings migrate into the pressure range', () => {
  const values = new Map([
    ['visualSettingValueBySystemV1', JSON.stringify({ endi: { color: 110 } })],
    ['setValueData', JSON.stringify({ color: 110 })],
    ['visualDefaultVersion', '2026-06-05-visual-defaults-filter-30'],
  ])
  globalThis.localStorage = {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  }

  const setting = loadVisualSettingValue('endi', { color: VISUAL_COLOR_SETTING_DEFAULT }, { color: 60 })
  const expected = Number((master(110, 'seat') * computeScale(110)).toFixed(2))
  assert.equal(setting.color, expected)
  delete globalThis.localStorage
})

test('the previous 60 kPa default migrates to the 5 kPa manual default', () => {
  const values = new Map([
    ['visualSettingValueBySystemV1', JSON.stringify({ endi: { color: 60 } })],
    ['setValueData', JSON.stringify({ color: 60 })],
    ['visualDefaultVersion', '2026-07-20-pressure-color-range-v1'],
  ])
  globalThis.localStorage = {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  }

  const setting = loadVisualSettingValue('endi', { color: VISUAL_COLOR_SETTING_DEFAULT }, { color: 60 })
  assert.equal(setting.color, VISUAL_COLOR_SETTING_DEFAULT)
  delete globalThis.localStorage
})
