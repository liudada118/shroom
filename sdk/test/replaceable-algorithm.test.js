'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const sdk = require('..')

function replacementSource(version, forceN) {
  return `module.exports = {
    VERSION: '${version}',
    SENSOR_DEFINITIONS: { 'endi-23x23': {}, 'new-backrest-32x25': {} },
    createSensorSession(sensorType) {
      let count = 0
      return {
        update(frame) {
          count++
          return { sensorType, timestampMs: frame.timestampMs,
            forceN: ${forceN}, areaCm2: 200,
            forceMetrics: { forceN: ${forceN} }, areaMetrics: { areaCm2: 200 }, pressureMetrics: {} }
        },
        reset() { count = 0 }, frameCount() { return count }
      }
    }
  }`
}

test('SDK sessions accept future files and retain their implementation when the file is replaced', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shroom-sdk-replace-'))
  const sourcePath = path.join(tempDir, 'seatBackrestPressure_future.js')
  try {
    fs.writeFileSync(sourcePath, replacementSource('2.13.0', 100))
    const first = sdk.createSensorSession('endi-23x23', {}, { sourcePath })
    const firstResult = first.process({ raw: [10], timestampMs: 0 })
    assert.equal(sdk.computePressureMetrics([], 'endi-sit', { algorithmMetrics: firstResult }).algorithmVersion, '2.13.0')
    assert.equal(sdk.computePressureMetrics([], 'endi-sit', { algorithmMetrics: firstResult }).pressureTotal, 5)

    fs.writeFileSync(sourcePath, replacementSource('2.140.0', 300))
    const second = sdk.createSensorSession('endi-23x23', {}, { sourcePath })
    const secondResult = second.update({ raw: [10], timestampMs: 0 })
    const secondMetrics = sdk.computePressureMetrics([], 'endi-sit', { algorithmMetrics: secondResult })
    assert.equal(secondMetrics.algorithmVersion, '2.140.0')
    assert.equal(secondMetrics.total, 300)
    assert.equal(secondMetrics.pressureTotal, 15)
    assert.notEqual(first.calibrationIdentity, second.calibrationIdentity)
    assert.equal(first.update({ raw: [10], timestampMs: 1 }).forceN, 100)
    assert.equal(first.frameCount(), 2)
    first.reset()
    assert.equal(first.frameCount(), 0)

    fs.writeFileSync(sourcePath, 'module.exports = { VERSION: "broken" }')
    assert.throws(() => sdk.createSensorSession('endi-23x23', {}, { sourcePath }), /must expose/)
  } finally {
    fs.unlinkSync(sourcePath)
    fs.rmdirSync(tempDir)
  }
})

test('SDK does not expose physical values from explicitly unavailable results', () => {
  const result = sdk.computePressureMetrics([], 'endi-sit', { algorithmMetrics: {
    version: '2.13.0', status: 'unavailable', forceN: 999, areaCm2: 20,
  } })
  assert.equal(result.algorithmVersion, '2.13.0')
  assert.equal(result.total, null)
  assert.equal(result.effectiveArea, null)
  assert.equal(result.pressureTotal, null)
})

test('future native profiles keep their version and cannot synthesize complete metrics from ADC alone', () => {
  const profile = 'seatBackrestPressure_v3.1.0'
  try {
    assert.equal(sdk.setPressureFormulaProfile(profile), profile)
    assert.equal(sdk.getPressureFormulaProfile(), profile)
    const result = sdk.computePressureMetrics([100, 120], 'endi-sit')
    assert.equal(result.calibrationComplete, false)
    assert.equal(result.total, null)
    assert.equal(result.effectiveArea, null)
    assert.equal(result.pressureTotal, null)
  } finally {
    sdk.setPressureFormulaProfile(sdk.DEFAULT_PRESSURE_FORMULA_PROFILE)
  }
})
