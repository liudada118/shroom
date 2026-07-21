import test from 'node:test'
import assert from 'node:assert/strict'

import {
  FORCE_METRIC_MODE,
  PRESSURE_METRIC_MODE,
  computeScale,
  getPressureMetricPointValues,
  getPressureMetricSummary,
  getPressurePointAreaCm2,
  master,
  normalizePressureMetricMode,
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
