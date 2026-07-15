import test from 'node:test'
import assert from 'node:assert/strict'

import {
  FORCE_METRIC_MODE,
  PRESSURE_METRIC_MODE,
  getPressureMetricPointValues,
  getPressureMetricSummary,
  getPressurePointAreaCm2,
  normalizePressureMetricMode,
} from '../client/src/util/pressureMetrics.js'

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
