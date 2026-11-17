'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const sdk = require('..')
const reference = require('../core/seatBackrestPressure_v2.12.0.js')
const {
  buildRawDisplayAdc, upgradeFullAlgorithmItem, processFullAlgorithmItem,
  prepareFullAlgorithmHistory, forceOverAreaPressure, FULL_PROCESSING_VERSION,
} = require('../../util/fullAlgorithmProcessor')

function framesFor(type) {
  const rows = type === 'endi-23x23' ? 23 : 32
  const cols = type === 'endi-23x23' ? 23 : 25
  return [0, 60, 110, 150, 80, 0].map((level, frameIndex) => ({
    timestampMs: frameIndex * 100,
    physical: Array.from({ length: rows }, (_, row) => Array.from({ length: cols }, (_, col) => (
      row >= 8 && row < rows - 3 && col >= 5 && col < cols - 4
        ? Math.min(255, level + (level ? (row * 3 + col * 7) % 29 : 0))
        : 0
    ))),
  }))
}

test('standalone SDK complete sequence and streaming session match the delivered kernel', () => {
  for (const type of ['endi-23x23', 'new-backrest-32x25']) {
    const frames = framesFor(type)
    const before = structuredClone(frames)
    const expected = reference.calculateSensorSequence(frames, type)
    assert.deepEqual(sdk.calculateSensorSequence(frames, type), expected)
    const session = sdk.createSensorSession(type)
    assert.deepEqual(frames.map((frame) => session.process(frame)), expected)
    assert.deepEqual(frames, before)
  }
})

test('SDK preserves kernel force/area and calculates global pressure as 10F/A', () => {
  for (const [key, type] of [['endi-sit', 'endi-23x23'], ['endi-back', 'new-backrest-32x25']]) {
    const outputs = reference.calculateSensorSequence(framesFor(type), type)
    const output = outputs[2]
    const metrics = sdk.computePressureMetrics(output.displayAdcMatrix.flat(), key, { algorithmMetrics: output })
    assert.equal(metrics.calibrationComplete, true)
    assert.equal(metrics.total, output.forceMetrics?.forceN ?? null)
    assert.equal(metrics.effectiveArea, output.areaMetrics.areaCm2)
    const expectedPressure = forceOverAreaPressure(output.forceMetrics?.forceN, output.areaMetrics.areaCm2)
    assert.equal(metrics.pressAver, expectedPressure)
    assert.equal(metrics.pressureTotal, expectedPressure)
    assert.equal(metrics.pressureMethod, 'force-over-area')
    assert.equal(metrics.pressMax, null)
    assert.deepEqual(metrics.pressureValues, [])
    assert.equal(metrics.matrixPressureTotal, null)
    assert.equal(metrics.algorithmMetrics, output)
  }
})

test('native pressure grids remain diagnostics and do not become application point metrics', () => {
  for (const [key, type, rows, cols] of [['endi-sit', 'endi-23x23', 23, 23], ['endi-back', 'new-backrest-32x25', 32, 25]]) {
    const physical = Array.from({ length: rows }, (_, row) => Array.from({ length: cols }, (_, col) => (
      row > 9 && row < 15 && col > 8 && col < 15 ? 120 : 0
    )))
    const output = reference.calculateSensorFrame({ physical, timestampMs: 0 }, type)
    const pressureMap = output.pointPressureKPa
    assert.ok(Array.isArray(pressureMap), 'reference patch load must provide the native pressure map')
    const metrics = sdk.computePressureMetrics(output.displayAdcMatrix.flat(), key, { algorithmMetrics: output })
    assert.deepEqual(metrics.algorithmMetrics.pointPressureKPa, pressureMap)
    assert.deepEqual(metrics.forceValues, [])
    assert.equal(metrics.forceGrid, null)
    assert.equal(metrics.forceMax, null)
    assert.equal(metrics.forceAver, null)
    assert.equal(metrics.total, output.forceMetrics.forceN)
  }
})

test('broad contact estimates keep force-grid statistics unavailable', () => {
  const physical = Array.from({ length: 23 }, () => Array(23).fill(110))
  const output = reference.calculateSensorFrame({ physical, timestampMs: 0 }, 'endi-23x23')
  assert.ok(output.forceMetrics, 'reference must return force diagnostics')
  const metrics = sdk.computePressureMetrics(output.displayAdcMatrix.flat(), 'endi-sit', { algorithmMetrics: output })
  assert.equal(metrics.calibrationComplete, true)
  assert.equal(metrics.total, output.forceMetrics.forceN)
  assert.deepEqual(metrics.forceValues, [])
  assert.equal(metrics.forceGrid, null)
  assert.equal(metrics.forceMax, null)
  assert.equal(metrics.forceAver, null)
})

test('unavailable full results do not claim completed calibration or synthesize metrics', () => {
  const unavailable = {
    version: '2.11.0', status: 'unavailable', reason: 'native_adc_required',
    forceMetrics: null, areaMetrics: null, pressureMetrics: null,
  }
  const metrics = sdk.computePressureMetrics([100], 'endi-sit', { algorithmMetrics: unavailable })
  assert.equal(metrics.calibrationComplete, false)
  assert.equal(metrics.calibrationScope, 'unavailable')
  assert.equal(metrics.unavailableReason, 'native_adc_required')
  assert.equal(metrics.total, null)
  assert.equal(metrics.effectiveArea, null)
  assert.equal(metrics.pressureTotal, null)
  assert.deepEqual(metrics.forceValues, [])
  assert.equal(metrics.forceGrid, null)
  assert.equal(metrics.forceMax, null)
  assert.equal(metrics.forceAver, null)
})

test('a display ADC matrix alone does not claim full seat/backrest force or area', () => {
  for (const key of ['endi-sit', 'endi-back']) {
    const metrics = sdk.computePressureMetrics(Array(301).fill(120), key)
    assert.equal(metrics.calibrationScope, 'matrix-only')
    assert.equal(metrics.calibrationComplete, false)
    assert.equal(metrics.total, null)
    assert.equal(metrics.effectiveArea, null)
    assert.equal(metrics.pressAver, null)
    assert.equal(metrics.pressMax, null)
    assert.deepEqual(metrics.pressureValues, [])
  }
})

test('force-over-area pressure keeps unknown/zero-area results unavailable', () => {
  for (const [force, area, expected] of [
    [100, 200, 5], [0, 200, 0], [100, 0, null], [0, 0, null],
    [100, -1, null], [null, 200, null], [NaN, 200, null], [Infinity, 200, null],
  ]) {
    assert.equal(forceOverAreaPressure(force, area), expected)
    const result = sdk.computePressureMetrics([], 'endi-sit', { algorithmMetrics: {
      status: 'complete', forceMetrics: { forceN: force, averagePressureKPa: 999 },
      areaMetrics: { areaCm2: area }, pressureMetrics: { maxPressureKPa: 999 },
    } })
    assert.equal(result.pressAver, expected)
    assert.equal(result.pressureTotal, expected)
    assert.equal(result.pressMax, null)
    assert.equal(result.forceMax, null)
    assert.equal(result.forceAver, null)
  }
})

function legacyComplete(key, overrides = {}) {
  const rows = key === 'endi-sit' ? 46 : 50
  const cols = key === 'endi-sit' ? 46 : 64
  return {
    arr: Array(rows * cols).fill(999),
    rawAdcArr: Array(rows * cols).fill(20),
    matrixMeta: { width: cols, height: rows },
    algorithmRotation: 3,
    processing: { version: 'backend-full-seat-backrest-v18-v2110', algorithmOptions: { rotation: 3 } },
    algorithmMetrics: {
      version: '2.11.0', status: 'complete', timestampMs: 500,
      forceMetrics: { forceN: 123, averagePressureKPa: 999 },
      areaMetrics: { areaCm2: 200 },
      pressureMetrics: { maxPressureKPa: 999, pressureMatrixKPa: [[999]] },
    },
    ...overrides,
  }
}

test('V18 saved force/area migrate without rerunning recognition or losing pre-recording history', () => {
  const item = legacyComplete('endi-sit')
  const upgraded = upgradeFullAlgorithmItem('endi-sit', item)
  assert.equal(upgraded.processing.version, FULL_PROCESSING_VERSION)
  assert.equal(upgraded.algorithmMetrics.forceMetrics, item.algorithmMetrics.forceMetrics)
  assert.equal(upgraded.algorithmMetrics.areaMetrics, item.algorithmMetrics.areaMetrics)
  assert.equal(upgraded.algorithmMetrics.pressureMetrics, item.algorithmMetrics.pressureMetrics)
  assert.equal(upgraded.algorithmMetrics.summary.averagePressureKPa, 10 * 123 / 200)
  assert.equal(upgraded.algorithmMetrics.summary.maxPressureKPa, item.algorithmMetrics.pressureMetrics.maxPressureKPa)
  assert.equal(upgraded.algorithmMetrics.summary.forceMaxN, null)
  assert.equal(upgraded.rawDisplayAvailable, true)
  assert.deepEqual(upgraded.arr, item.rawAdcArr)
  assert.ok(upgraded.pressureArr.every((value) => value === null))
  const history = prepareFullAlgorithmHistory([{ timestamp: 500, data: { 'endi-sit': item } }])
  assert.equal(history[0].data['endi-sit'].algorithmMetrics.forceMetrics, item.algorithmMetrics.forceMetrics)
  assert.equal(history[0].data['endi-sit'].algorithmMetrics.summary.averagePressureKPa, 6.15)
})

test('raw display reconstructs pre-zero ADC without touching the force/area session', () => {
  for (const [key, type] of [['endi-sit', 'endi-23x23'], ['endi-back', 'new-backrest-32x25']]) {
    const rawSource = Array.from({ length: 1024 }, (_, index) => index % 25)
    const rawZeroed = Array(1024).fill(0)
    const source = reference.calculateSensorFrame({ raw: rawSource, timestampMs: 0 }, type)
    const display = key === 'endi-sit' ? source.sourceMatrix.slice().reverse().map(row => row.slice().reverse()) : source.sourceMatrix
    assert.deepEqual(buildRawDisplayAdc(key, { algorithmRawSourceFrame: rawSource }, 0), display)
    const output = processFullAlgorithmItem(key, {
      algorithmRawSourceFrame: rawSource, algorithmRawFrame: rawZeroed,
      algorithmTimestampMs: 0, algorithmStreamId: `raw-display-${key}`,
      zeroState: { enabled: true },
    }, new Map())
    assert.equal(output.algorithmMetrics.summary.forceN, 0)
    assert.equal(output.algorithmMetrics.summary.areaCm2, 0)
    assert.equal(output.algorithmMetrics.summary.averagePressureKPa, null)
    assert.equal(output.rawDisplayAvailable, true)
    assert.ok(output.arr.some((value) => value > 0 && value <= 30))
    assert.deepEqual(output.arr, output.rawAdcArr)
  }
})

test('unknown layouts, changed rotations and zeroed-only V18 history cannot masquerade as raw ADC', () => {
  const cases = [
    legacyComplete('endi-back', { zeroState: { enabled: true } }),
    legacyComplete('endi-back', { matrixMeta: { width: 50, height: 64 } }),
    legacyComplete('endi-back', { algorithmRotation: 0 }),
  ]
  for (const item of cases) {
    const upgraded = upgradeFullAlgorithmItem('endi-back', item)
    assert.equal(upgraded.rawDisplayAvailable, false)
    assert.ok(upgraded.arr.every((value) => value === null))
    assert.equal(upgraded.algorithmMetrics.summary.forceN, 123)
    assert.equal(upgraded.algorithmMetrics.summary.areaCm2, 200)
    assert.equal(upgraded.algorithmMetrics.summary.averagePressureKPa, 6.15)
  }
  const unknown = legacyComplete('endi-back', { processing: { version: 'backend-zero-native-v17-seat-backrest-v2110' } })
  assert.equal(buildRawDisplayAdc('endi-back', unknown, 3), null)
})

test('mixed saved and stale history warms the native prefix but preserves saved force/area estimates', () => {
  const type = 'endi-23x23'
  const frames = framesFor(type).slice(0, 3)
  const expected = reference.calculateSensorSequence(frames, type)
  const stream = 'mixed-saved-history'
  const sessions = new Map()
  const savedItems = frames.slice(0, 2).map((frame) => processFullAlgorithmItem('endi-sit', {
    algorithmPhysicalFrame: frame.physical,
    algorithmTimestampMs: frame.timestampMs,
    algorithmStreamId: stream,
  }, sessions))
  const legacy = {
    ...savedItems[0],
    processing: { ...savedItems[0].processing, version: 'backend-full-seat-backrest-v18-v2110' },
    algorithmMetrics: {
      ...savedItems[0].algorithmMetrics,
      forceMetrics: { ...savedItems[0].algorithmMetrics.forceMetrics, forceN: 123 },
    },
  }
  const current = {
    ...savedItems[1],
    algorithmMetrics: {
      ...savedItems[1].algorithmMetrics,
      forceMetrics: { ...savedItems[1].algorithmMetrics.forceMetrics, forceN: 987 },
    },
  }
  const stale = {
    algorithmPhysicalFrame: frames[2].physical,
    algorithmTimestampMs: frames[2].timestampMs,
    algorithmStreamId: stream,
  }
  const rows = [legacy, current, stale].map((item, index) => ({ timestamp: index * 100, data: { 'endi-sit': item } }))
  const migrated = prepareFullAlgorithmHistory(rows)
  assert.equal(migrated[0].data['endi-sit'].algorithmMetrics.forceMetrics, legacy.algorithmMetrics.forceMetrics)
  assert.equal(migrated[1].data['endi-sit'], current)
  assert.deepEqual(migrated[2].data['endi-sit'].algorithmMetrics.forceMetrics, expected[2].forceMetrics)
  assert.deepEqual(migrated[2].data['endi-sit'].algorithmMetrics.areaMetrics, expected[2].areaMetrics)
})
