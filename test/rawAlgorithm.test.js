const assert = require('node:assert/strict')
const test = require('node:test')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const { DUMMY_MATRIX_CONFIG, FORCE_PER_KPA, processFrame, ensureProcessedFrame } = require('../util/pressureFrameProcessor')
const { endiWear1024, interpolateEndiWearSource } = require('../util/line')
const { parseData, prepareProcessedFrame, getPlaybackSnapshot } = require('../server/services/DataService')
const { loadDummyPressureFormula, normalizePressureConfig } = require('../server/services/PressureConfig')
const { state } = require('../server/state')
const formula = loadDummyPressureFormula()
const round = value => Math.round((value + Number.EPSILON) * 10) / 10

function displayed(key, matrix) {
  return matrix.flatMap((row, y) => key === 'endi-jacket' && y < 10
    ? [...new Array(3).fill(0), ...row.slice(6, 24), ...new Array(3).fill(0)] : row)
}

for (const [key, dimensions] of Object.entries(DUMMY_MATRIX_CONFIG)) {
  for (const scenario of ['zero', 'threshold', 'sparse', 'dense', 'fractional']) {
    test(`${key} ${scenario}: output equals unchanged algorithm package`, () => {
      const raw = Array.from({ length: dimensions.sourceWidth * dimensions.sourceHeight }, (_, index) => {
        if (scenario === 'zero') return 0
        if (scenario === 'threshold') return [0, 29, 30, 31, 61, 255][index % 6]
        if (scenario === 'sparse') return index === dimensions.sourceWidth + 3 ? 180 : 0
        return scenario === 'fractional' ? (index * 41.75 + 20.5) % 255 : (index * 37 + 50) % 256
      })
      const saved = [...raw]
      const matrix = Array.from({ length: dimensions.sourceHeight }, (_, y) => raw.slice(y * dimensions.sourceWidth, (y + 1) * dimensions.sourceWidth))
      const expected = formula.calculateDummyRawPressureFrame(matrix, dimensions.sensorType)
      const actual = processFrame({ [key]: { arr: raw } }, { filter: 255, gauss: 4, coherent: 10 })[key]
      const pressure = displayed(key, expected.pressureMatrixKpa)
      assert.deepEqual(actual.pressureArr, pressure.map(round))
      assert.deepEqual(actual.forceArr, pressure.map(value => round(value * FORCE_PER_KPA)))
      assert.deepEqual(actual.physicalAdcArr, saved)
      assert.deepEqual(raw, saved)
      assert.deepEqual(ensureProcessedFrame({ [key]: actual })[key], actual)
      const legacy = processFrame({ [key]: { arr: interpolateEndiWearSource(key, raw) } })[key]
      // Historical grids only retain integer physical samples. New records keep exact ADC.
      if (scenario !== 'fractional') assert.deepEqual(legacy.pressureArr, actual.pressureArr)
    })
  }
}

test('serial mapping passes original physical ADC through both frame formats and validation', () => {
  const filename = path.resolve(__dirname, '../server/serial/SerialManager.js')
  const sandbox = { require: createRequire(filename), module: { exports: {} }, console, process, Buffer, setTimeout, clearTimeout, setInterval, clearInterval }
  vm.runInNewContext(fs.readFileSync(filename, 'utf8') + '\nmodule.exports.testHooks = { processMatrixData, processTypedMatrixData, validateMatrixPointCount };', sandbox, { filename })
  const hooks = sandbox.module.exports.testHooks
  const serial = Array.from({ length: 1024 }, (_, index) => index % 256)
  for (const [key, dimensions] of Object.entries(DUMMY_MATRIX_CONFIG)) {
    const expected = endiWear1024(serial, key)
    assert.equal(expected.length, dimensions.sourceWidth * dimensions.sourceHeight)
    for (const processInput of [hooks.processMatrixData, hooks.processTypedMatrixData]) {
      const actual = processInput(serial, { type: key })
      assert.deepEqual(actual, expected)
      assert.equal(hooks.validateMatrixPointCount('test', { type: key }, actual, () => {}), true)
    }
  }
  assert.equal(endiWear1024(serial, 'endi-leftHand')[0], serial[256])
  assert.equal(endiWear1024(serial, 'endi-jacket')[3], serial[8])
})

test('live parsing, zero baseline bypass, combined legs and saved physical ADC stay consistent', () => {
  const oldZero = state.zeroState
  const oldConfig = state.frameProcessingConfig
  try {
    const parsers = {}, devices = {}, expected = {}, baseline = {}
    for (const [key, dimensions] of Object.entries(DUMMY_MATRIX_CONFIG)) {
      const raw = Array.from({ length: dimensions.sourceWidth * dimensions.sourceHeight }, (_, index) => 50.25 + index % 180)
      parsers[key] = { port: { isOpen: true } }
      devices[key] = { type: key, arr: raw, stamp: Date.now() }
      expected[key] = processFrame({ [key]: { arr: raw } })[key]
      baseline[key] = new Array(raw.length).fill(255)
    }
    state.zeroState = { enabled: true, data: baseline }
    state.frameProcessingConfig = { gauss: 4, coherent: 10, filter: 4095 }
    const parsed = parseData(parsers, devices, 'highHZ')
    for (const [key, item] of Object.entries(parsed)) {
      assert.equal(item.status, 'online')
      assert.deepEqual(item.arr, devices[key].arr)
    }
    const actual = prepareProcessedFrame(parsed)
    for (const key of ['endi-jacket', 'endi-leftHand', 'endi-rightHand']) {
      assert.deepEqual(actual[key].pressureArr, expected[key].pressureArr)
      assert.equal(actual[key].zeroState.enabled, false)
    }
    const legs = actual['endi-foot']
    assert.equal(legs.arr.length, 1536)
    for (const key of ['endi-leftFoot', 'endi-rightFoot']) {
      assert.deepEqual(legs.sourcePressureMatrices[key], expected[key].pressureArr)
      assert.deepEqual(legs.sourcePhysicalAdcMatrices[key], devices[key].arr)
    }
    const reprocessed = processFrame(JSON.parse(JSON.stringify(actual)))
    assert.deepEqual(reprocessed['endi-foot'].pressureArr, legs.pressureArr)
    const single = prepareProcessedFrame({ 'endi-rightFoot': parsed['endi-rightFoot'] })['endi-foot']
    assert.ok(single.sourcePressureMatrices['endi-leftFoot'].every(value => value === 0))
    assert.deepEqual(single.sourcePressureMatrices['endi-rightFoot'], expected['endi-rightFoot'].pressureArr)
  } finally {
    state.zeroState = oldZero
    state.frameProcessingConfig = oldConfig
  }
})

test('persisted legacy formula selections upgrade to the new raw-frame package', () => {
  for (const version of ['3', '4', '27', '28']) {
    for (const separator of ['_', '.']) {
      assert.equal(normalizePressureConfig({ dummyPressureFormulaFile: `dummyPressure${separator}v2.10.${version}.js` }).dummyPressureFormulaFile, 'dummyPressure.v2.10.34.js')
    }
  }
})

test('imported pressure-only data is never recalculated as ADC', () => {
  const item = { arr: new Array(144).fill(0), pressureArr: new Array(144).fill(12.3), forceArr: new Array(144).fill(1.9), processing: { version: 'dummy-backend-spatial-v1', importedMetric: true } }
  assert.deepEqual(ensureProcessedFrame({ 'endi-leftHand': item })['endi-leftHand'], item)
})

test('history playback matches live processing from recorded physical ADC', () => {
  const previous = state.historyDbArr
  const rawFrame = Object.fromEntries(Object.entries(DUMMY_MATRIX_CONFIG).map(([key, dimensions]) => [key, {
    arr: Array.from({ length: dimensions.sourceWidth * dimensions.sourceHeight }, (_, index) => 30.75 + index % 220),
  }]))
  try {
    const expected = prepareProcessedFrame(rawFrame)
    for (const frame of [rawFrame, expected]) {
      state.historyDbArr = [{ data: JSON.stringify(frame), timestamp: 1000 }]
      const actual = getPlaybackSnapshot(0).payload.sitDataPlay
      for (const key of Object.keys(expected)) assert.deepEqual(actual[key].pressureArr, expected[key].pressureArr)
    }
  } finally {
    state.historyDbArr = previous
  }
})
