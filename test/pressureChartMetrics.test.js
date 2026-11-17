'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { getCalibrationRuntime } = require('../util/calibrationRuntime')
const {
  getPressureChartMetrics, processFullAlgorithmItem, upgradeFullAlgorithmItem,
} = require('../util/fullAlgorithmProcessor')

const algorithm = getCalibrationRuntime().api
const sensors = [
  { key: 'endi-sit', type: 'endi-23x23', rows: 23, cols: 23 },
  { key: 'endi-back', type: 'new-backrest-32x25', rows: 32, cols: 25 },
]

function physical(sensor, amplitude = 110) {
  const peakRow = sensor.key === 'endi-sit' ? 10 : 18
  return Array.from({ length: sensor.rows }, (_, row) => Array.from({ length: sensor.cols }, (_, col) => {
    const distance = ((row - peakRow) / 3) ** 2 + ((col - 10) / 3) ** 2
    return Math.round(amplitude * Math.exp(-distance / 2))
  }))
}

for (const sensor of sensors) {
  test(`${sensor.key}: chart count, peak and average come from the delivered point metrics`, () => {
    const frame = { physical: physical(sensor), timestampMs: 0 }
    const expected = algorithm.calculateSensorFrame(frame, sensor.type)
    const input = {
      algorithmPhysicalFrame: frame.physical,
      algorithmTimestampMs: frame.timestampMs,
      algorithmStreamId: `pressure-chart-${sensor.key}`,
    }
    const result = processFullAlgorithmItem(sensor.key, input, new Map())
    const summary = result.algorithmMetrics.summary
    assert.ok(expected.pointPressureStats.validCount > 0)
    assert.ok(expected.maxPressureKPa > 0)
    assert.equal(summary.activePointCount, expected.pointPressureStats.validCount)
    assert.equal(summary.maxPressureKPa, expected.maxPressureKPa)
    assert.equal(summary.maximumPressureDisplayKPa, expected.maxPressureKPa)
    assert.equal(summary.algorithmAveragePressureKPa, expected.pressureMetrics.avgPressureKPa)
    assert.equal(summary.averagePressureKPa, 10 * expected.forceN / expected.areaCm2)
    assert.deepEqual(result.algorithmMetrics.pressureMetrics, expected.pressureMetrics)
    assert.deepEqual(result.algorithmPhysicalFrame, frame.physical)
    assert.equal(result.rawDisplayAvailable, true)
    assert.ok(result.pressureArr.every((value) => value === null))
    assert.ok(result.forceArr.every((value) => value === null))
  })

  test(`${sensor.key}: complete empty contact is zero points/peak; missing calibration remains unavailable`, () => {
    const result = processFullAlgorithmItem(sensor.key, {
      algorithmPhysicalFrame: physical(sensor, 0),
      algorithmTimestampMs: 0,
      algorithmStreamId: `pressure-chart-empty-${sensor.key}`,
    }, new Map())
    assert.equal(result.algorithmMetrics.status, 'complete')
    assert.equal(result.algorithmMetrics.summary.activePointCount, 0)
    assert.equal(result.algorithmMetrics.summary.maxPressureKPa, 0)
    assert.equal(result.algorithmMetrics.summary.algorithmAveragePressureKPa, 0)
    assert.equal(result.algorithmMetrics.summary.averagePressureKPa, null)

    const missing = processFullAlgorithmItem(sensor.key, { algorithmTimestampMs: 0 }, new Map())
    assert.equal(missing.algorithmMetrics.status, 'unavailable')
    for (const field of ['activePointCount', 'maxPressureKPa', 'maximumPressureDisplayKPa', 'averagePressureKPa', 'algorithmAveragePressureKPa']) {
      assert.equal(missing.algorithmMetrics.summary[field], null)
    }
  })
}

test('point metrics accept saved old field names without force/ADC inference or display multipliers', () => {
  assert.deepEqual(getPressureChartMetrics({ pointPressureCount: 12, validCount: 14, maxPressureKPa: 8.75 }), {
    activePointCount: 12, maxPressureKPa: 8.75, maximumPressureDisplayKPa: 8.75, algorithmAveragePressureKPa: null,
  })
  assert.deepEqual(getPressureChartMetrics({ validCount: 17, maxPressureKPa: 6.3 }), {
    activePointCount: 17, maxPressureKPa: 6.3, maximumPressureDisplayKPa: 6.3, algorithmAveragePressureKPa: null,
  })
  assert.deepEqual(getPressureChartMetrics({ pointPressureCount: 0, maxPressureKPa: null }), {
    activePointCount: 0, maxPressureKPa: 0, maximumPressureDisplayKPa: 0, algorithmAveragePressureKPa: 0,
  })
  for (const diagnostics of [null, {}, { validCount: -1, maxPressureKPa: -2 }, { validCount: 2.5, maxPressureKPa: NaN }]) {
    assert.deepEqual(getPressureChartMetrics(diagnostics), {
      activePointCount: null, maxPressureKPa: null, maximumPressureDisplayKPa: null, algorithmAveragePressureKPa: null,
    })
  }
})

test('legacy result upgrade reads its saved diagnostics and retains its acquired algorithm identity and F/A', () => {
  const sensor = sensors[0]
  const fresh = processFullAlgorithmItem(sensor.key, {
    algorithmPhysicalFrame: physical(sensor), algorithmTimestampMs: 0,
    algorithmStreamId: 'pressure-chart-legacy-source',
  }, new Map())
  const saved = {
    ...fresh,
    processing: {
      ...fresh.processing, version: 'backend-full-seat-backrest-v18-v2110',
      formulaFile: 'seatBackrestPressure_v2.11.0.js', formulaProfile: 'seatBackrestPressure_v2.11.0',
      algorithmVersion: '2.11.0', algorithmIdentity: 'old-acquired-identity', algorithmChecksum: 'old-sha',
    },
    algorithmMetrics: {
      ...fresh.algorithmMetrics, version: '2.11.0', identity: 'old-acquired-identity', checksum: 'old-sha',
      forceMetrics: { forceN: 321 }, areaMetrics: { areaCm2: 123 },
      pressureMetrics: { pointPressureCount: 12, validCount: 14, maxPressureKPa: 8.75, avgPressureKPa: 9.99 },
      summary: { forceN: 321, areaCm2: 123, averagePressureKPa: 9.99 },
    },
  }
  const upgraded = upgradeFullAlgorithmItem(sensor.key, saved)
  assert.equal(upgraded.algorithmMetrics.version, '2.11.0')
  assert.equal(upgraded.algorithmMetrics.identity, 'old-acquired-identity')
  assert.equal(upgraded.processing.formulaFile, 'seatBackrestPressure_v2.11.0.js')
  assert.deepEqual(upgraded.algorithmMetrics.pressureMetrics, saved.algorithmMetrics.pressureMetrics)
  assert.equal(upgraded.algorithmMetrics.summary.activePointCount, 12)
  assert.equal(upgraded.algorithmMetrics.summary.maxPressureKPa, 8.75)
  assert.equal(upgraded.algorithmMetrics.summary.algorithmAveragePressureKPa, 9.99)
  assert.equal(upgraded.algorithmMetrics.summary.averagePressureKPa, 10 * 321 / 123)
})
