const assert = require('node:assert/strict')
const test = require('node:test')
const area = require('../server/kpa/dummyArea_v2.10.36.js')
const { DUMMY_MATRIX_CONFIG, processFrame, ensureProcessedFrame } = require('../util/pressureFrameProcessor')
const { prepareProcessedFrame, getPlaybackSnapshot, buildDirectedFrame } = require('../server/services/DataService')
const { state } = require('../server/state')

function rawFrame(valueAt) {
  return Object.fromEntries(Object.entries(DUMMY_MATRIX_CONFIG).map(([key, config]) => [key, {
    arr: Array.from({ length: config.sourceWidth * config.sourceHeight }, (_, index) => valueAt(index)),
  }]))
}

function displayArea(key, matrix) {
  return matrix.flatMap((row, y) => key === 'endi-jacket' && y < 10
    ? [...new Array(3).fill(0), ...row.slice(6, 24), ...new Array(3).fill(0)] : row)
}

test('area package self-check, unavailable and zero frames remain distinct', () => {
  const checks = area.runSelfCheck()
  assert.equal(checks.pass, true)
  assert.equal(checks.passed, checks.total)
  assert.equal(area.calculateDummyRawAreaFrame(null, 'sleeve'), null)
  assert.equal(area.calculateDummyRawAreaFrame([new Array(18).fill(0), new Array(18).fill(0)], 'sleeve').areaCm2, 0)
})

for (const [key, config] of Object.entries(DUMMY_MATRIX_CONFIG)) {
  test(`${key}: raw ADC area and positioned cells equal the provided formula`, () => {
    for (const valueAt of [() => 0, index => index === 20 ? 90 : 0, index => (index * 13.75 + 10) % 255]) {
      const raw = rawFrame(valueAt)[key]
      const saved = structuredClone(raw)
      const matrix = Array.from({ length: config.sourceHeight }, (_, y) =>
        raw.arr.slice(y * config.sourceWidth, (y + 1) * config.sourceWidth))
      const expected = area.calculateDummyRawAreaFrame(matrix, config.sensorType)
      const actual = processFrame({ [key]: raw }, { gauss: 4, filter: 4095, coherent: 10 })[key]
      assert.equal(actual.areaCm2, expected.areaCm2)
      assert.deepEqual(actual.areaValuesCm2, displayArea(key, expected.areaMatrixCm2))
      assert.equal(actual.areaValuesCm2.reduce((sum, value) => sum + value, 0), actual.areaCm2)
      assert.equal(actual.processing.areaFormulaVersion, '2.10.36')
      assert.deepEqual(raw, saved)
      assert.deepEqual(ensureProcessedFrame({ [key]: actual })[key], actual)
    }
  })
}

test('physical masks are applied before interpolation and area fitting', () => {
  const key = 'endi-leftHand'
  const raw = rawFrame(() => 80)[key]
  const physicalMask = Array.from({ length: 2 }, () => new Array(18).fill(true))
  physicalMask[0].fill(false, 0, 9)
  const matrix = [raw.arr.slice(0, 18), raw.arr.slice(18)]
  const expected = area.calculateDummyRawAreaFrame(matrix, 'sleeve', physicalMask)
  const actual = processFrame({ [key]: { ...raw, physicalMask } })[key]
  assert.equal(actual.areaCm2, expected.areaCm2)
  assert.deepEqual(actual.areaValuesCm2, expected.areaMatrixCm2.flat())
  assert.ok(actual.areaCm2 < processFrame({ [key]: raw })[key].areaCm2)
})

test('render controls and rounded pressure activity cannot change raw ADC area', () => {
  const raw = rawFrame(() => 25)
  const normal = processFrame(raw, { gauss: 0, filter: 0, coherent: 1 })
  const filtered = processFrame(raw, { gauss: 4, filter: 4095, coherent: 10 })
  for (const key of Object.keys(raw)) {
    assert.equal(filtered[key].areaCm2, normal[key].areaCm2)
    assert.deepEqual(filtered[key].areaValuesCm2, normal[key].areaValuesCm2)
  }
  const sleeve = normal['endi-leftHand']
  assert.ok(sleeve.areaCm2 > 0)
  assert.ok(sleeve.areaCm2 !== sleeve.pressureArr.filter(value => value > 0).length * 1.5625)
})

test('combined legs preserve independent area fits, missing legs and replay results', () => {
  const raw = rawFrame(index => (index * 31.25 + 30) % 250)
  const singles = processFrame(raw)
  const frame = prepareProcessedFrame(raw)
  const foot = frame['endi-foot']
  assert.equal(foot.areaCm2, singles['endi-leftFoot'].areaCm2 + singles['endi-rightFoot'].areaCm2)
  for (const key of ['endi-leftFoot', 'endi-rightFoot']) {
    assert.deepEqual(foot.sourceAreaMatrices[key], singles[key].areaValuesCm2)
  }
  const rightOnly = prepareProcessedFrame({ 'endi-rightFoot': raw['endi-rightFoot'] })['endi-foot']
  assert.equal(rightOnly.areaCm2, singles['endi-rightFoot'].areaCm2)
  assert.ok(rightOnly.sourceAreaMatrices['endi-leftFoot'].every(value => value === 0))
  const history = state.historyDbArr
  try {
    for (const data of [raw, frame]) {
      state.historyDbArr = [{ data: JSON.stringify(data), timestamp: 1000 }]
      const replay = getPlaybackSnapshot(0).payload.sitDataPlay
      for (const key of Object.keys(frame)) {
        assert.equal(replay[key].areaCm2, frame[key].areaCm2)
        assert.deepEqual(replay[key].areaValuesCm2, frame[key].areaValuesCm2)
      }
    }
  } finally {
    state.historyDbArr = history
  }
})

test('existing pressure frames gain area from physical ADC without recalibrating pressure', () => {
  const key = 'endi-jacket'
  const current = processFrame(rawFrame(index => 30 + index % 180))[key]
  const legacy = structuredClone(current)
  delete legacy.areaCm2
  delete legacy.areaValuesCm2
  delete legacy.processing.areaFormulaVersion
  legacy.pressureArr[500] = 123.4
  const upgraded = ensureProcessedFrame({ [key]: legacy })[key]
  assert.equal(upgraded.areaCm2, current.areaCm2)
  assert.deepEqual(upgraded.areaValuesCm2, current.areaValuesCm2)
  assert.deepEqual(upgraded.pressureArr, legacy.pressureArr)
})

test('combined imported legs preserve unavailable area through live preparation and direction', () => {
  const importedLeg = {
    arr: new Array(768).fill(0),
    pressureArr: new Array(768).fill(1),
    forceArr: new Array(768).fill(0.2),
    processing: { importedMetric: true },
  }
  for (const frame of [
    { 'endi-leftFoot': importedLeg },
    { 'endi-leftFoot': rawFrame(() => 80)['endi-leftFoot'], 'endi-rightFoot': importedLeg },
  ]) {
    const prepared = prepareProcessedFrame(frame)
    for (const foot of [prepared['endi-foot'], buildDirectedFrame(prepared)['endi-foot'], ensureProcessedFrame(prepared)['endi-foot']]) {
      assert.equal(foot.areaValuesCm2, null)
      assert.equal(foot.areaCm2, null)
      const importedKey = frame['endi-rightFoot'] ? 'endi-rightFoot' : 'endi-leftFoot'
      assert.equal(foot.sourceAreaMatrices[importedKey], null)
    }
  }
})
