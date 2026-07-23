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
const logoFormula = require('../server/kpa/pressureFormula_V2.7.38中英文logo.js')
const { normalizePressureConfig } = require('../server/services/PressureConfig.js')
const LOGO_FORMULA_PROFILE = 'V2.7.38中英文logo'

setPressureFormulaProfile(LOGO_FORMULA_PROFILE)

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function topMean(values, count) {
  return mean([...values].sort((left, right) => right - left).slice(0, count))
}

test('formula file name overrides a stale configured profile', () => {
  const normalized = normalizePressureConfig({
    pressureFormulaFile: 'pressureFormula_V2.7.38中英文logo.js',
    pressureFormulaProfile: 'V2.8.1',
  })

  assert.equal(normalized.pressureFormulaProfile, LOGO_FORMULA_PROFILE)
})

test('seat point matrix expands the V2.7.38 logo TOP-70 pressure formula', () => {
  const values = [0, 30, ...Array.from({ length: 100 }, (_, index) => index + 31)]
  const validValues = values.filter((value) => value > 30)
  const adcAvg = topMean(validValues, 70)
  const averagePressure = logoFormula.estimatePressure(adcAvg, validValues.length, 'seat')
  const pointValues = getPressureMetricPointValues(values, 'endi-sit', PRESSURE_METRIC_MODE)

  assert.equal(getPressureFormulaProfile(), LOGO_FORMULA_PROFILE)
  assert.equal(pointValues[0], 0)
  assert.equal(pointValues[1], 0)
  pointValues.slice(2).forEach((value, index) => {
    assert.ok(Math.abs(value - averagePressure * validValues[index] / adcAvg) < 1e-9)
  })
  assert.equal(
    Number(Math.max(...pointValues).toFixed(2)),
    logoFormula.estimateMaxPressure(Math.max(...validValues), validValues.length, 'seat', adcAvg),
  )
})

test('backrest uses TOP-46 and more than 300 points switches to full-frame average', () => {
  const backValues = Array.from({ length: 80 }, (_, index) => index + 41)
  const backAdcAvg = topMean(backValues, 46)
  const backPressure = logoFormula.estimatePressure(backAdcAvg, backValues.length, 'backrest')
  const backPointValues = getPressureMetricPointValues(backValues, 'endi-back', PRESSURE_METRIC_MODE)
  assert.ok(Math.abs(backPointValues[0] - backPressure * backValues[0] / backAdcAvg) < 1e-9)

  const boundaryValues = Array.from({ length: 300 }, (_, index) => 31 + (index % 120))
  const boundaryAdcAvg = topMean(boundaryValues, 70)
  const boundaryPressure = logoFormula.estimatePressure(boundaryAdcAvg, boundaryValues.length, 'seat')
  const boundaryPointValues = getPressureMetricPointValues(boundaryValues, 'endi-sit', PRESSURE_METRIC_MODE)
  assert.ok(Math.abs(boundaryPointValues[0] - boundaryPressure * boundaryValues[0] / boundaryAdcAvg) < 1e-9)

  const humanValues = Array.from({ length: 301 }, (_, index) => 31 + (index % 120))
  const humanAdcAvg = mean(humanValues)
  const humanPressure = logoFormula.estimatePressure(humanAdcAvg, humanValues.length, 'seat')
  const humanPointValues = getPressureMetricPointValues(humanValues, 'endi-sit', PRESSURE_METRIC_MODE)
  assert.ok(Math.abs(mean(humanPointValues) - humanPressure) < 1e-9)
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

test('left-side totals and point counts use the exact rounded 2D number matrix', () => {
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

  assert.deepEqual(pressureMatrix, [0.8, 0])
  assert.deepEqual(forceMatrix, [0.1, 0])
  assert.equal(pressureSummary.activeCount, pressureMatrix.filter((value) => value > 0).length)
  assert.equal(forceSummary.activeCount, forceMatrix.filter((value) => value > 0).length)
  assert.equal(forceSummary.total, forceMatrix.reduce((sum, value) => sum + value, 0))
  assert.equal(forceSummary.forceTotal, forceSummary.total)
  assert.equal(getPressureMetricPointValues(adcValues, matrixKey, FORCE_METRIC_MODE).filter((value) => value > 0).length, 1)
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
