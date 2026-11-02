'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')
const { createSensorSession } = require('../util/seatBackrestSession')
const original = require('../server/kpa/seatBackrestPressure_v2.11.0')

const TYPES = ['endi-23x23', 'new-backrest-32x25']

function physicalFrame(type, step) {
  const { rows, cols } = original.SENSOR_DEFINITIONS[type]
  const amplitudes = [0, 40, 65, 100, 145, 180, 155, 105, 55, 0]
  const amplitude = amplitudes[step % amplitudes.length]
  return Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => {
    if (!amplitude) return 0
    const r1 = type === 'endi-23x23' ? 8 : 18
    const r2 = type === 'endi-23x23' ? 15 : 25
    const d1 = ((r - r1) / 3) ** 2 + ((c - 7) / 3) ** 2
    const d2 = ((r - r2) / 4) ** 2 + ((c - 17) / 3) ** 2
    const value = amplitude * Math.exp(-d1 / 2) + amplitude * 0.7 * Math.exp(-d2 / 2)
    return Math.max(0, Math.min(255, Math.round(value)))
  }))
}

function framesFor(type) {
  return Array.from({ length: 10 }, (_, i) => ({
    physical: physicalFrame(type, i),
    timestampMs: i * 125,
    ...(i === 6 ? { reset: true } : {}),
  }))
}

for (const type of TYPES) {
  test(`${type}: streaming loading/unloading and explicit frame reset exactly match one complete sequence`, () => {
    const frames = framesFor(type)
    const expected = original.calculateSensorSequence(frames, type)
    const session = createSensorSession(type)
    const actual = frames.map((frame) => session.process(frame))
    assert.deepEqual(actual, expected)
    assert.ok(actual.some((frame) => frame.areaMetrics.areaCm2 > 0))
    assert.equal(actual[0].areaMetrics.areaCm2, 0)
    assert.equal(actual.at(-1).areaMetrics.areaCm2, 0)
    assert.ok(actual.some((frame) => frame.forceMetrics?.forceN > 0))
  })

  test(`${type}: session reset starts empty history and accepts a new timestamp origin`, () => {
    const session = createSensorSession(type)
    for (const frame of framesFor(type).slice(0, 4)) session.process(frame)
    session.reset()
    const frames = framesFor(type).slice(0, 5)
    assert.deepEqual(frames.map((frame) => session.process(frame)), original.calculateSensorSequence(frames, type))
  })

  test(`${type}: decreasing timestamps fail without consuming recognition history`, () => {
    const frames = framesFor(type).slice(1, 4)
    const expected = original.calculateSensorSequence(frames, type)
    const session = createSensorSession(type)
    assert.deepEqual(session.process(frames[0]), expected[0])
    assert.throws(() => session.process({ ...frames[1], timestampMs: frames[0].timestampMs - 1 }), /nondecreasing/)
    assert.deepEqual(session.process(frames[1]), expected[1])
    assert.deepEqual(session.process(frames[2]), expected[2])
  })
}

test('interleaved seat/backrest sessions keep independent kernels and support original options', () => {
  const options = { rotation: 0, filterThreshold: 45, resultScale: 1.1, humanCoefficient: 3 }
  const framesByType = TYPES.map((type) => framesFor(type).slice(1, 5))
  const expected = TYPES.map((type, i) => original.calculateSensorSequence(framesByType[i], type, options))
  const sessions = TYPES.map((type) => createSensorSession(type, options))
  for (let i = 0; i < 4; i++) {
    TYPES.forEach((_, j) => assert.deepEqual(sessions[j].process(framesByType[j][i]), expected[j][i]))
  }
})

test('explicit local snapshot path works for a packaged SDK without changing algorithm options', () => {
  const type = TYPES[0]
  const frame = framesFor(type)[2]
  const session = createSensorSession(type, {}, {
    sourcePath: path.join(__dirname, '..', 'server', 'kpa', 'seatBackrestPressure_v2.11.0.js'),
  })
  assert.deepEqual(session.process(frame), original.calculateSensorFrame(frame, type))
  assert.throws(() => createSensorSession('other-sensor'), /Unsupported/)
  assert.throws(() => createSensorSession(type, {}, {
    sourcePath: path.join(__dirname, '..', 'package.json'),
  }), /checksum changed/)
})

test('raw wire frames take priority over physical input and preserve the complete sequence result', () => {
  const frames = Array.from({ length: 4 }, (_, i) => ({
    raw: Array.from({ length: 1024 }, (_, index) => {
      const row = Math.floor(index / 32)
      const col = index % 32
      return (row > 11 && row < 22 && col > 5 && col < 20) ? 45 + i * 30 + (index % 19) : 0
    }),
    physical: [], // The delivered raw-first contract explicitly ignores this.
    timestampMs: i * 80,
  }))
  for (const type of TYPES) {
    const session = createSensorSession(type)
    assert.deepEqual(frames.map((frame) => session.process(frame)), original.calculateSensorSequence(frames, type))
  }
})
