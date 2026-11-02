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
const calibrationFormula = require('../server/kpa/seatBackrestPressure_v2.11.0.js')
const { normalizePressureConfig } = require('../server/services/PressureConfig.js')
const { calcPressureFormulaStats } = require('../util/pressureFrameProcessor.js')
const CALIBRATION_FORMULA_PROFILE = 'seatBackrestPressure_v2.11.0'

setPressureFormulaProfile(CALIBRATION_FORMULA_PROFILE)

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function getExpectedPointValues(values, sensor) {
  const gatedValues = values.map((value) => {
    const adc = Number(value)
    if (!Number.isFinite(adc) || adc <= 0) return 0
    const corrected = sensor === 'seat' ? 1.0069947916666666 * adc + 6.018421875000001 : adc
    return corrected > 30 ? corrected : 0
  })
  return calibrationFormula.calculateMatrixPressureMap(
    [gatedValues], sensor === 'seat' ? 'endi-23x23' : 'new-backrest-32x25',
  ).kpa[0]
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

test('every visual mode preserves the same raw ADC including low values and decimal precision', () => {
  const raw = [0, 12, 24, 29, 30, 31.125, 140, 255]
  const initial = [...raw]
  for (const mode of [PRESSURE_METRIC_MODE, FORCE_METRIC_MODE, 'adc']) {
    assert.deepEqual(getPressureMetricPointValues(raw, 'endi-sit', mode, {
      pressureArr: raw.map(() => 999), forceArr: raw.map(() => 999),
    }), raw)
  }
  assert.deepEqual(raw, initial)
})

test('visual matrices retain raw ADC for both sensor types across the old 300-point branch boundary', () => {
  for (const key of ['endi-sit', 'endi-back']) {
    for (const count of [299, 300, 301]) {
      const raw = Array.from({ length: count }, (_, index) => index % 255)
      assert.deepEqual(getPressureMetricPointValues(raw, key, PRESSURE_METRIC_MODE), raw)
      assert.deepEqual(getPressureMetricPointValues(raw, key, FORCE_METRIC_MODE), raw)
    }
  }
})

test('unavailable pre-zero raw data stays blank instead of showing a calibrated or zeroed fallback', () => {
  const raw = [29, 30, 31]
  assert.deepEqual(getPressureMetricPointValues(raw, 'endi-back', PRESSURE_METRIC_MODE, {
    rawDisplayAvailable: false, pressureArr: [10, 20, 30], forceArr: [1, 2, 3],
  }), [null, null, null])
  assert.deepEqual(getPressureMetricPointValues([0, NaN, Infinity, 24], 'endi-sit', 'adc'), [0, null, null, 24])
})

test('matrix-only browser inputs never claim complete F, A or P', () => {
  const values = [0, 100, 120, 140]
  const pressure = getPressureMetricSummary(values, 'endi-back', PRESSURE_METRIC_MODE)
  const force = getPressureMetricSummary(values, 'endi-back', FORCE_METRIC_MODE)
  assert.equal(force.unit, 'N')
  assert.equal(pressure.unit, 'kPa')
  assert.equal(force.total, null)
  assert.equal(force.max, null)
  assert.equal(force.average, null)
  assert.equal(pressure.total, null)
  assert.equal(pressure.average, null)
  assert.equal(pressure.metrics.effectiveArea, null)
})

test('physical summaries use complete force and area with global P=10F/A and omit old point maxima', () => {
  const algorithmMetrics = { version: '2.11.0', status: 'complete', summary: {
    forceN: 100, areaCm2: 200, averagePressureKPa: 999,
    maxPressureKPa: 999, maximumPressureDisplayKPa: 999, forceAverageN: 999, forceMaxN: 999,
  } }
  const raw = [12, 24, 80]
  const pressure = getPressureMetricSummary(raw, 'endi-sit', PRESSURE_METRIC_MODE, { algorithmMetrics })
  const force = getPressureMetricSummary(raw, 'endi-sit', FORCE_METRIC_MODE, { algorithmMetrics })
  assert.equal(pressure.average, 5)
  assert.equal(pressure.total, 5)
  assert.equal(force.total, 100)
  assert.equal(force.metrics.effectiveArea, 200)
  assert.equal(force.average, null)
  assert.equal(force.max, null)
  assert.equal(pressure.max, null)
  const zeroArea = getPressureMetricSummary(raw, 'endi-sit', PRESSURE_METRIC_MODE, {
    algorithmMetrics: { ...algorithmMetrics, summary: { forceN: 0, areaCm2: 0 } },
  })
  assert.equal(zeroArea.average, null)
})

test('unknown physical units retain their existing default without changing raw visualization', () => {
  assert.equal(normalizePressureMetricMode(), FORCE_METRIC_MODE)
  assert.equal(normalizePressureMetricMode('invalid'), FORCE_METRIC_MODE)
  assert.deepEqual(getPressureMetricPointValues([1, 24, 90], 'endi-sit', 'invalid'), [1, 24, 90])
})

test('display preparation ignores filter, Gaussian, temporal state and validity masks', () => {
  const raw = [0, 12.25, 24, 31, 0, 60, 90, 180]
  for (const mode of [PRESSURE_METRIC_MODE, FORCE_METRIC_MODE]) {
    const matrix = buildPressureDisplayMetricMatrix({
      adcValues: raw, width: 4, height: 2,
      settings: { filter: 4095, gauss: 4, coherent: 10 },
      matrixKey: 'endi-sit', metricMode: mode,
      isVisibleIndex: () => false,
      previousState: { values: raw.map(() => 999), display: raw.map(() => 999) },
    })
    assert.deepEqual(matrix.values, raw)
  }
})

test('distribution explicitly describes ADC rather than a force or pressure calibration matrix', () => {
  const distribution = buildPressureDisplayNormalDistribution([0, 10, 20, 30], 'adc')
  assert.equal(distribution.unit, 'ADC')
  assert.equal(distribution.count, 3)
  assert.equal(distribution['\u03bc'], '20.000')
  assert.equal(distribution.xData.length, 256)
  assert.ok(distribution.yData.every(Number.isFinite))
})

test('automatic color range follows the unchanged raw ADC regardless of the physical unit', () => {
  const raw = [0, 12, 24, 80, 140]
  const rendered = getPressureMetricPointValues(raw, 'endi-sit', PRESSURE_METRIC_MODE)
  const renderedForce = getPressureMetricPointValues(raw, 'endi-sit', FORCE_METRIC_MODE, { forceArr: [0, 1, 2, 3, 4] })
  assert.deepEqual(rendered, raw)
  assert.deepEqual(renderedForce, raw)
  const scope = 'raw-adc-auto-range-test'
  resetPressureColorRange(scope)
  setDynamicGammaColorEnabled(true, scope)
  assert.equal(beginDynamicColorFrame(rendered, 255, scope), 140)
  assert.equal(getDynamicColorRangeMax(scope), 140)
  assert.equal(beginDynamicColorFrame([], 255, scope), 140)
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
