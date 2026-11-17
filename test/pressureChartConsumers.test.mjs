import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { getFullAlgorithmSummary, getPressureChartMetrics } from '../client/src/util/fullAlgorithmMetrics.js'
import { getPressureMetricPointValues } from '../client/src/util/pressureMetrics.js'

const require = createRequire(import.meta.url)
const { getCalibrationRuntime } = require('../util/calibrationRuntime')
const { processFullAlgorithmItem } = require('../util/fullAlgorithmProcessor')
const { dbGetData, buildCsvPlaybackData } = require('../util/db')
const algorithm = getCalibrationRuntime().api

const sensors = [
  { key: 'endi-sit', type: 'endi-23x23', rows: 23, cols: 23, peakRow: 10 },
  { key: 'endi-back', type: 'new-backrest-32x25', rows: 32, cols: 25, peakRow: 18 },
]

function loadedFrame(sensor, amplitude = 140) {
  return {
    timestampMs: 0,
    physical: Array.from({ length: sensor.rows }, (_, row) => Array.from({ length: sensor.cols }, (_, col) => {
      const distance = ((row - sensor.peakRow) / 3) ** 2 + ((col - 10) / 3) ** 2
      return Math.round(amplitude * Math.exp(-distance / 2))
    })),
  }
}

function processFrame(sensor, frame = loadedFrame(sensor)) {
  return processFullAlgorithmItem(sensor.key, {
    algorithmPhysicalFrame: frame.physical,
    algorithmTimestampMs: frame.timestampMs,
    algorithmStreamId: `chart-consumer:${sensor.key}`,
  }, new Map())
}

for (const sensor of sensors) {
  test(`${sensor.key}: chart diagnostics equal the delivered pressure grid and preserve raw ADC`, () => {
    const frame = loadedFrame(sensor)
    const original = algorithm.calculateSensorFrame(frame, sensor.type)
    const actual = processFrame(sensor, frame)
    const rawBefore = actual.rawAdcArr.slice()
    const full = getFullAlgorithmSummary(actual.algorithmMetrics)
    const positive = original.pointPressureKPa.flat().filter(value => value > 0)

    assert.ok(positive.length > 0)
    assert.equal(full.activePointCount, positive.length)
    assert.equal(full.maxPressureKPa, Math.max(...positive))
    assert.equal(full.maximumPressureDisplayKPa, original.maxPressureKPa)
    assert.equal(full.algorithmAveragePressureKPa, original.pressureMetrics.avgPressureKPa)
    const pointMean = positive.reduce((sum, value) => sum + value, 0) / positive.length
    assert.ok(Math.abs(full.algorithmAveragePressureKPa - pointMean) <= 0.00501)
    assert.notEqual(full.algorithmAveragePressureKPa, 10 * original.forceN / original.areaCm2)
    assert.notEqual(full.activePointCount, actual.rawAdcArr.filter(value => value > 0).length)

    for (const mode of ['force', 'pressure', 'adc']) {
      assert.deepEqual(getPressureMetricPointValues(actual.rawAdcArr, sensor.key, mode, {
        algorithmMetrics: actual.algorithmMetrics,
        pressureArr: actual.pressureArr,
        forceArr: actual.forceArr,
      }), rawBefore)
    }
    assert.deepEqual(actual.rawAdcArr, rawBefore)
    assert.ok(actual.pressureArr.every(value => value === null))
    assert.ok(actual.forceArr.every(value => value === null))
  })

  test(`${sensor.key}: empty contact has zero chart diagnostics; unavailable input has gaps`, () => {
    const empty = getFullAlgorithmSummary(processFrame(sensor, loadedFrame(sensor, 0)).algorithmMetrics)
    assert.equal(empty.activePointCount, 0)
    assert.equal(empty.maxPressureKPa, 0)
    assert.equal(empty.algorithmAveragePressureKPa, 0)
    assert.equal(empty.averagePressureKPa, null)

    const missing = processFullAlgorithmItem(sensor.key, { algorithmTimestampMs: 0 }, new Map())
    const unavailable = getFullAlgorithmSummary(missing.algorithmMetrics)
    for (const field of ['activePointCount', 'maxPressureKPa', 'maximumPressureDisplayKPa', 'algorithmAveragePressureKPa']) {
      assert.equal(unavailable[field], null)
    }
  })
}

test('legacy saved diagnostics supply chart values independently of stale summary, F/A or display multipliers', () => {
  const saved = {
    version: '2.11.0', status: 'complete', pressureMethod: 'force-over-area',
    summary: { forceN: 500, areaCm2: 100, activePointCount: null, maxPressureKPa: null, algorithmAveragePressureKPa: null },
    pressureMetrics: { validCount: 100, pointPressureCount: 37, maxPressureKPa: 11.75, avgPressureKPa: 7.35 },
  }
  const before = structuredClone(saved)
  const actual = getFullAlgorithmSummary(saved)
  assert.equal(actual.activePointCount, 37)
  assert.equal(actual.maxPressureKPa, 11.75)
  assert.equal(actual.maximumPressureDisplayKPa, 11.75)
  assert.equal(actual.algorithmAveragePressureKPa, 7.35)
  assert.equal(actual.averagePressureKPa, 50)
  assert.deepEqual(saved, before)

  const missing = getFullAlgorithmSummary({ ...saved, pressureMetrics: null })
  assert.equal(missing.activePointCount, null)
  assert.equal(missing.maxPressureKPa, null)
  assert.equal(missing.algorithmAveragePressureKPa, null)
  const unavailable = getFullAlgorithmSummary({ ...saved, status: 'unavailable' })
  assert.equal(unavailable.activePointCount, null)
  assert.equal(unavailable.maxPressureKPa, null)
  assert.equal(unavailable.algorithmAveragePressureKPa, null)
})

test('future compatible versions retain the exact algorithm chart values and reject invalid diagnostics', () => {
  const diagnostics = { validCount: 99, pointPressureCount: 6, maxPressureKPa: 17.42, avgPressureKPa: 8.16 }
  const full = getFullAlgorithmSummary({
    version: '8.15.0', status: 'complete', pressureMethod: 'force-over-area',
    summary: { forceN: 999, areaCm2: 1 }, pressureMetrics: diagnostics,
  })
  assert.equal(full.activePointCount, 6)
  assert.equal(full.algorithmAveragePressureKPa, 8.16)
  assert.equal(full.maxPressureKPa, 17.42)
  assert.deepEqual(getPressureChartMetrics({ validCount: 4, maxPressureKPa: NaN, avgPressureKPa: Infinity }), {
    activePointCount: 4, maxPressureKPa: null, maximumPressureDisplayKPa: null, algorithmAveragePressureKPa: null,
  })
  assert.deepEqual(getPressureChartMetrics({ validCount: -1, pointPressureCount: 1.5, maxPressureKPa: -1, avgPressureKPa: -2 }), {
    activePointCount: null, maxPressureKPa: null, maximumPressureDisplayKPa: null, algorithmAveragePressureKPa: null,
  })
})

test('historical formula-average curve uses saved pressure diagnostics and leaves unavailable gaps', async () => {
  const sensor = sensors[0]
  const loaded = processFrame(sensor)
  const missing = processFullAlgorithmItem(sensor.key, { algorithmTimestampMs: 100 }, new Map())
  const rows = [loaded, missing].map((item, index) => ({
    timestamp: index * 100,
    data: JSON.stringify({ [sensor.key]: item }),
  }))
  const db = { all(sql, _params, callback) {
    assert.match(sql, /ORDER BY timestamp ASC, rowid ASC/)
    callback(null, rows)
  } }
  const history = await dbGetData({ db, params: ['chart-formula-average'] })
  assert.deepEqual(history.algorithmPressureArr[sensor.key], [loaded.algorithmMetrics.pressureMetrics.avgPressureKPa, null])
  assert.deepEqual(history.pressureArr[sensor.key], [10 * loaded.algorithmMetrics.summary.forceN / loaded.algorithmMetrics.summary.areaCm2, null])
  assert.notEqual(history.algorithmPressureArr[sensor.key][0], history.pressureArr[sensor.key][0])
})

test('downsampled formula-average curve averages acquired diagnostics and retains missing buckets', async () => {
  const sensor = sensors[0]
  const loaded = processFrame(sensor)
  const withAverage = value => JSON.stringify({ [sensor.key]: {
    ...loaded,
    algorithmMetrics: { ...loaded.algorithmMetrics,
      pressureMetrics: { ...loaded.algorithmMetrics.pressureMetrics, avgPressureKPa: value },
    },
  } })
  const first = withAverage(10)
  const second = withAverage(14)
  const missing = JSON.stringify({ [sensor.key]: processFullAlgorithmItem(sensor.key, { algorithmTimestampMs: 0 }, new Map()) })
  const rows = Array.from({ length: 501 }, (_, index) => ({
    timestamp: index * 100,
    data: index === 1 ? second : index === 3 ? missing : first,
  }))
  const history = await dbGetData({ db: { all(_sql, _params, callback) { callback(null, rows) } }, params: ['chart-buckets'] })
  assert.equal(history.algorithmPressureArr[sensor.key].length, 251)
  assert.equal(history.algorithmPressureArr[sensor.key][0], 12)
  assert.equal(history.algorithmPressureArr[sensor.key][1], null)
  assert.equal(history.algorithmPressureArr[sensor.key].at(-1), 10)
  assert.notEqual(history.algorithmPressureArr[sensor.key][0], history.pressureArr[sensor.key][0])
})

test('ADC and force/area-only CSV cannot fabricate an algorithm-average curve', () => {
  const history = buildCsvPlaybackData([{
    时间戳: '100', '秒数(s)': '0',
    坐垫原始ADC数据: JSON.stringify(Array(2116).fill(80)),
    '坐垫总压力(N)': '100', '坐垫受力面积(cm²)': '200', '坐垫换算压强(kPa)': '999',
  }])
  assert.deepEqual(history.algorithmPressureArr['endi-sit'], [null])
  assert.deepEqual(history.pressureArr['endi-sit'], [5])
  const full = getFullAlgorithmSummary(JSON.parse(history.rows[0].data)['endi-sit'].algorithmMetrics)
  assert.equal(full.algorithmAveragePressureKPa, null)
  assert.equal(full.maxPressureKPa, null)
  assert.equal(full.activePointCount, null)
})
