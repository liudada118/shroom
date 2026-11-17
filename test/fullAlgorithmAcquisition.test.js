'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { getFullAlgorithmInput } = require('../server/services/DataService')
const { processMatrixItem, resetFullAlgorithmSessions } = require('../util/pressureFrameProcessor')
const { captureAlgorithmZeroBaselines, prepareFullAlgorithmHistory } = require('../util/fullAlgorithmProcessor')
const reference = require('../util/calibrationRuntime').getCalibrationRuntime().api

function wire(level) {
  return Array.from({ length: 1024 }, (_, index) => {
    const row = Math.floor(index / 32)
    const col = index % 32
    return row >= 3 && row < 25 && col >= 4 && col < 23
      ? Math.min(255, level + (level ? index % 23 : 0))
      : 0
  })
}

function acquisition(raw, index = 0, epoch = 100) {
  return {
    arr: [],
    algorithmRawFrame: raw,
    algorithmStreamStartedAt: epoch,
    rawFrame: { received_at: index * 100, frame_id: index, port: 'test-acquisition' },
  }
}

function assertAlgorithmOutput(actual, expected, rawExpected = expected) {
  assert.equal(actual.algorithmMetrics.status, 'complete')
  assert.deepEqual(actual.algorithmMetrics.forceMetrics, expected.forceMetrics)
  assert.deepEqual(actual.algorithmMetrics.areaMetrics, expected.areaMetrics)
  assert.deepEqual(actual.algorithmMetrics.pressureMetrics, expected.pressureMetrics)
  for (const field of ['pressureArr', 'forceArr', 'pointAreaArr']) assert.ok(actual[field].every(value => value === null))
  let raw = rawExpected.sourceMatrix
  for (let i = 0; i < 3; i++) raw = raw[0].map((_, column) => raw.map(row => row[column]).reverse())
  const display = rawExpected.sensorType === 'endi-23x23' ? raw.flat().reverse() : raw.flat()
  assert.deepEqual(actual.arr, display)
  assert.deepEqual(actual.rawAdcArr, display)
  assert.equal(actual.rawDisplayAvailable, true)
  assert.equal(actual.algorithmMetrics.summary.pressureMethod, 'force-over-area')
  for (const field of ['forceMaxN', 'forceAverageN']) {
    assert.equal(actual.algorithmMetrics.summary[field], null)
  }
  assert.equal(actual.algorithmMetrics.summary.activePointCount, expected.pointPressureStats.validCount)
  assert.equal(actual.algorithmMetrics.summary.maxPressureKPa, expected.pointPressureStats.maxKpa)
  assert.equal(actual.algorithmMetrics.summary.maximumPressureDisplayKPa, expected.pointPressureStats.maxKpa)
  assert.equal(actual.algorithmMetrics.summary.algorithmAveragePressureKPa, expected.pointPressureStats.avgKpa)
  assert.equal(actual.algorithmMetrics.summary.averagePressureKPa,
    expected.areaMetrics.areaCm2 > 0 ? 10 * expected.forceMetrics.forceN / expected.areaMetrics.areaCm2 : null)
}

test('acquired wire ADC enters the complete seat/backrest kernel exactly once', () => {
  resetFullAlgorithmSessions()
  for (const [key, type] of [['endi-sit', 'endi-23x23'], ['endi-back', 'new-backrest-32x25']]) {
    const frames = [0, 70, 120, 150, 90, 0].map((level, index) => ({ raw: wire(level), timestampMs: index * 100 }))
    const expected = reference.calculateSensorSequence(frames, type)
    frames.forEach((frame, index) => {
      const source = acquisition(frame.raw, index)
      const input = getFullAlgorithmInput(key, source, { enabled: false })
      assert.equal(input.algorithmTimestampMs, frame.timestampMs)
      assert.deepEqual(input.algorithmRawFrame, frame.raw)
      const actual = processMatrixItem(key, { ...source, ...input })
      assertAlgorithmOutput(actual, expected[index])
    })
  }
})

test('raw zero capture is isolated and raw baseline subtraction gives true empty-load results', () => {
  resetFullAlgorithmSessions()
  const raw = wire(90)
  const dataMap = {
    seatPort: { type: 'endi-sit', algorithmRawFrame: raw },
    backPort: { type: 'endi-back', algorithmRawFrame: raw },
  }
  const baselines = captureAlgorithmZeroBaselines(dataMap)
  assert.notEqual(baselines['endi-sit'], raw)
  const first = raw[100]
  raw[100] = 255
  assert.equal(baselines['endi-sit'][100], first)
  raw[100] = first
  for (const [key, type] of [['endi-sit', 'endi-23x23'], ['endi-back', 'new-backrest-32x25']]) {
    const input = getFullAlgorithmInput(key, acquisition(raw), {
      enabled: true, zeroTime: 500, algorithmRawData: baselines,
    })
    assert.deepEqual(input.algorithmRawSourceFrame, raw)
    assert.ok(input.algorithmRawFrame.every((value) => value === 0))
    const actual = processMatrixItem(key, { arr: [], ...input })
    const expected = reference.calculateSensorFrame({ raw: Array(1024).fill(0), timestampMs: 0 }, type)
    const rawExpected = reference.calculateSensorFrame({ raw, timestampMs: 0 }, type)
    assertAlgorithmOutput(actual, expected, rawExpected)
    assert.equal(actual.algorithmMetrics.summary.forceN, 0)
    assert.equal(actual.algorithmMetrics.summary.areaCm2, 0)
    assert.equal(actual.algorithmMetrics.summary.averagePressureKPa, null)
    assert.ok(actual.arr.some((value) => value > 0), 'tare must not erase the original ADC visualization')
  }
})

test('legacy display-only tare cannot silently bypass the missing raw baseline', () => {
  const input = getFullAlgorithmInput('endi-back', acquisition(wire(100)), {
    enabled: true, zeroTime: 500, data: { 'endi-back': Array(3200).fill(0) },
  })
  assert.equal(input.algorithmInputError, 'zero_baseline_requires_raw_recapture')
  const actual = processMatrixItem('endi-back', { arr: Array(3200).fill(100), ...input })
  assert.equal(actual.algorithmMetrics.status, 'unavailable')
  assert.equal(actual.algorithmMetrics.summary.forceN, null)
  assert.equal(actual.algorithmMetrics.summary.areaCm2, null)
  assert.equal(actual.algorithmMetrics.summary.averagePressureKPa, null)
  assert.equal(actual.rawDisplayAvailable, true)
  assert.ok(actual.arr.some((value) => value > 0))
})

test('zero recapture and connection epochs create distinct recognition streams', () => {
  const raw = wire(100)
  const source = acquisition(raw)
  const baseline = { 'endi-sit': Array(1024).fill(0) }
  const off = getFullAlgorithmInput('endi-sit', source, { enabled: false })
  const firstZero = getFullAlgorithmInput('endi-sit', source, { enabled: true, zeroTime: 1, algorithmRawData: baseline })
  const nextZero = getFullAlgorithmInput('endi-sit', source, { enabled: true, zeroTime: 2, algorithmRawData: baseline })
  const reconnect = getFullAlgorithmInput('endi-sit', { ...source, algorithmStreamStartedAt: 101 }, { enabled: false })
  assert.equal(new Set([off.algorithmStreamId, firstZero.algorithmStreamId, nextZero.algorithmStreamId, reconnect.algorithmStreamId]).size, 4)
})

test('revisiting a broadcast frame ID does not advance recognition history', () => {
  resetFullAlgorithmSessions()
  for (const [key, type] of [['endi-sit', 'endi-23x23'], ['endi-back', 'new-backrest-32x25']]) {
    const frames = [70, 120, 90].map((level, index) => ({ raw: wire(level), timestampMs: index * 100 }))
    const expected = reference.calculateSensorSequence(frames, type)
    frames.forEach((frame, index) => {
      const source = acquisition(frame.raw, index)
      const input = { ...source, ...getFullAlgorithmInput(key, source, { enabled: false }) }
      const result = processMatrixItem(key, input)
      const duplicate = processMatrixItem(key, input)
      assertAlgorithmOutput(result, expected[index])
      assertAlgorithmOutput(duplicate, expected[index])
    })
  }
})

test('history rebuild uses recorded explicit timestamps and rejects missing times', () => {
  const rows = [80, 120].map((level, index) => ({
    timestamp: String(1000 + index * 100),
    data: JSON.stringify({ 'endi-sit': { arr: [], algorithmRawFrame: wire(level), algorithmStreamId: 'test-history' } }),
  }))
  const expected = reference.calculateSensorSequence(rows.map((row) => ({
    raw: JSON.parse(row.data)['endi-sit'].algorithmRawFrame,
    timestampMs: Number(row.timestamp),
  })), 'endi-23x23')
  const rebuilt = prepareFullAlgorithmHistory(rows)
  rebuilt.forEach((row, index) => {
    const item = JSON.parse(row.data)['endi-sit']
    assert.equal(item.algorithmMetrics.timestampMs, 1000 + index * 100)
    assertAlgorithmOutput(item, expected[index])
  })
  const missing = getFullAlgorithmInput('endi-sit', { algorithmRawFrame: wire(100) }, { enabled: false })
  assert.equal(missing.algorithmInputError, 'explicit_timestamp_required')
})
