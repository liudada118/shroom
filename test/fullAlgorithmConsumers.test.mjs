import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { getFullAlgorithmSummary } from '../client/src/util/fullAlgorithmMetrics.js'
import { summarizePressureDisplayMatrix } from '../client/src/util/pressureDisplayMatrix.js'
import { getPressureMetricSummary } from '../client/src/util/pressureMetrics.js'
import { getRawAdcValues, getPhysicalFrameSummary, summarizeAdcValues } from '../client/src/components/contrast/adcMetrics.js'

const require = createRequire(import.meta.url)
const { processMatrixItem } = require('../util/pressureFrameProcessor')
const { getCanonicalMetricStats, getExportMetricStats, dbGetData } = require('../util/db')
const original = require('../util/calibrationRuntime').getCalibrationRuntime().api

function completeItem(key, full = false) {
  const seat = key === 'endi-sit'
  const physical = Array.from({ length: seat ? 23 : 32 }, (_, r) => (
    Array.from({ length: seat ? 23 : 25 }, (_, c) => full ? 90 : r > 10 && r < 16 && c > 8 && c < 14 ? 120 : 0)
  ))
  const frame = { physical, timestampMs: 0 }
  const type = seat ? 'endi-23x23' : 'new-backrest-32x25'
  return {
    expected: original.calculateSensorFrame(frame, type),
    actual: processMatrixItem(key, {
      algorithmPhysicalFrame: physical,
      algorithmTimestampMs: 0,
      algorithmStreamId: `consumer-test:${key}:${full}`,
    }),
    type,
  }
}

test('UI, reports and export retain original force/area and derive pressure only as 10F/A', () => {
  for (const key of ['endi-sit', 'endi-back']) {
    const { expected, actual, type } = completeItem(key)
    const algorithm = actual.algorithmMetrics
    const pressure = summarizePressureDisplayMatrix(
      actual.arr, key, 'pressure', actual.calibrationValidMask, algorithm,
    )
    const force = summarizePressureDisplayMatrix(
      actual.arr, key, 'force', actual.calibrationValidMask, algorithm,
    )
    const expectedPressure = expected.areaMetrics.areaCm2 > 0 ? 10 * expected.forceMetrics.forceN / expected.areaMetrics.areaCm2 : null
    assert.equal(pressure.average, expectedPressure)
    assert.equal(pressure.max, expected.pressureMetrics.maxPressureKPa)
    assert.equal(force.total, expected.forceMetrics.forceN)
    assert.equal(force.effectiveArea, expected.areaMetrics.areaCm2)
    const canonical = getCanonicalMetricStats(key, actual)
    assert.equal(canonical.forceTotal, expected.forceMetrics.forceN)
    assert.equal(canonical.effectiveArea, expected.areaMetrics.areaCm2)
    assert.equal(canonical.pressureAverage, expectedPressure)
    assert.equal(canonical.pressureMax, null)
    assert.equal(getExportMetricStats(canonical, 'pressure').total, expected.forceMetrics.forceN)
    assert.equal(getExportMetricStats(canonical, 'force').total, expected.forceMetrics.forceN)
    assert.equal(getExportMetricStats(canonical, 'pressure').aver, expectedPressure)
    assert.equal(getExportMetricStats(canonical, 'force').aver, expectedPressure)
    const local = getPressureMetricSummary(actual.arr, key, 'pressure', {
      algorithmMetrics: algorithm, pressureArr: actual.pressureArr,
      calibrationValidMask: actual.calibrationValidMask,
    })
    assert.equal(local.average, expectedPressure)
  }
})

test('large-area force and area never regress to matrix integration or point count', () => {
  const { expected, actual } = completeItem('endi-sit', true)
  assert.notEqual(expected.forceMetrics.forceN, actual.pressureArr.reduce((a, b) => a + b, 0) * 0.1)
  assert.notEqual(expected.areaMetrics.areaCm2, actual.pressureArr.filter((p) => p > 0).length)
  assert.equal(actual.forceDistributionAvailable, false)
  const full = getFullAlgorithmSummary(actual.algorithmMetrics)
  const canonical = getCanonicalMetricStats('endi-sit', actual)
  assert.equal(canonical.forceTotal, expected.forceMetrics.forceN)
  assert.equal(canonical.effectiveArea, expected.areaMetrics.areaCm2)
  assert.equal(canonical.forceMax, null)
  assert.equal(full.forceAverageN, null)
  assert.equal(full.forceN, expected.forceMetrics.forceN)
})

test('missing original inputs remain unavailable through UI and export summaries', () => {
  const item = processMatrixItem('endi-sit', { arr: Array(2116).fill(100) })
  const full = getFullAlgorithmSummary(item.algorithmMetrics)
  assert.equal(full.available, false)
  assert.equal(full.forceN, null)
  assert.equal(full.areaCm2, null)
  const canonical = getCanonicalMetricStats('endi-sit', item)
  assert.deepEqual(getExportMetricStats(canonical, 'pressure'), { max: null, aver: null, total: null })
  const display = summarizePressureDisplayMatrix(item.pressureArr, 'endi-sit', 'pressure', null, item.algorithmMetrics)
  assert.equal(display.max, null)
  assert.equal(display.average, null)
  assert.equal(display.effectiveArea, null)
})

test('history chart data keeps original force/area, global pressure and unavailable gaps', async () => {
  const { expected, actual } = completeItem('endi-sit', true)
  const missing = processMatrixItem('endi-sit', { arr: Array(2116).fill(100) })
  const rows = [actual, missing].map((item, index) => ({
    timestamp: index * 100,
    data: JSON.stringify({ 'endi-sit': item }),
  }))
  const db = {
    all(sql, _params, callback) {
      assert.match(sql, /ORDER BY timestamp ASC, rowid ASC/)
      callback(null, rows)
    },
  }
  const history = await dbGetData({ db, params: ['consumer-history'] })
  assert.equal(history.areaUnit, 'cm2')
  assert.deepEqual(history.forceArr['endi-sit'], [expected.forceMetrics.forceN, null])
  assert.deepEqual(history.pressureArr['endi-sit'], [10 * expected.forceMetrics.forceN / expected.areaMetrics.areaCm2, null])
  assert.deepEqual(history.areaArr['endi-sit'], [expected.areaMetrics.areaCm2, null])
})

test('report and contrast views use raw ADC independently of curve maps and expose only complete F/A/P', () => {
  const item = {
    arr: [999, 999, 999, 999], rawAdcArr: [0, 12, 24, 90],
    pressureArr: [10, 20, 30, 40], forceArr: [2, 3, 4, 5],
    algorithmMetrics: { version: '2.11.0', status: 'complete', summary: {
      forceN: 100, areaCm2: 200, averagePressureKPa: 999,
      maxPressureKPa: 999, forceAverageN: 999,
    } },
  }
  assert.deepEqual(getRawAdcValues(item), [0, 12, 24, 90])
  const adc = summarizeAdcValues(getRawAdcValues(item), 2, 2)
  assert.equal(adc.sum, 126)
  assert.equal(adc.max, 90)
  assert.equal(adc.points, 3)
  assert.deepEqual(getPhysicalFrameSummary(item), { forceN: 100, areaCm2: 200, pressureKPa: 5 })
  assert.deepEqual(getPhysicalFrameSummary(item, { xStart: 0, xEnd: 1 }), {
    forceN: null, areaCm2: null, pressureKPa: null,
  })
  const missingRaw = { ...item, rawDisplayAvailable: false }
  assert.ok(getRawAdcValues(missingRaw).every(value => value === null))
  assert.deepEqual(getPhysicalFrameSummary(missingRaw), { forceN: 100, areaCm2: 200, pressureKPa: 5 })
})
