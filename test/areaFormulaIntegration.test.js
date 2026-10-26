const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { processFrame, ensureProcessedFrame } = require('../util/pressureFrameProcessor')
const { prepareProcessedFrame, getPlaybackSnapshot, colAndSendData, startPlayback, clearPlayTimer } = require('../server/services/DataService')
const { state } = require('../server/state')
const { dbGetData } = require('../util/db')

function historyStats(frame) {
  // The history aggregator only needs SELECT rows; this fixture never opens a database.
  return dbGetData({
    db: { all(sql, _params, callback) {
      assert.equal(sql, 'SELECT * FROM matrix WHERE date=?')
      callback(null, [{ data: JSON.stringify(frame), timestamp: 1000 }])
    } },
    params: ['area'],
  })
}

function formulaSource(count, version = '1.0.0') {
  return `module.exports = {
    VERSION: ${JSON.stringify(version)},
    calculateDummyRawAreaFrame(raw) {
      const rows = raw.length * 2, cols = raw[0].length * 2;
      const areaMatrixCm2 = Array.from({length: rows}, () => new Array(cols).fill(0));
      for (let i = 0; i < ${count}; i++) areaMatrixCm2[2][i] = 1.5625;
      return { areaCm2: ${count} * 1.5625, areaMatrixCm2 };
    }
  }`
}

function withFormulaDirectory(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'shroom-area-replacement-'))
  const previous = process.env.DUMMY_AREA_FORMULA_DIR
  process.env.DUMMY_AREA_FORMULA_DIR = directory
  t.after(() => {
    if (previous === undefined) delete process.env.DUMMY_AREA_FORMULA_DIR
    else process.env.DUMMY_AREA_FORMULA_DIR = previous
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()))
    assert.ok(path.basename(directory).startsWith('shroom-area-replacement-'))
    fs.rmSync(directory, { recursive: true, force: true })
  })
  return directory
}

test('same-name same-version area replacement updates realtime and recorded aggregate forces without recalibrating pressure', async t => {
  const directory = withFormulaDirectory(t)
  const fileName = 'dummyArea_custom_1.0.js'
  const formulaPath = path.join(directory, fileName)
  fs.writeFileSync(formulaPath, formulaSource(1))
  const source = { 'endi-leftHand': { arr: new Array(36).fill(80) } }
  const old = processFrame(source)
  assert.equal(old['endi-leftHand'].areaCm2, 1.5625)
  const oldStats = await historyStats(old)
  const stat = fs.statSync(formulaPath)
  fs.writeFileSync(formulaPath, formulaSource(2))
  fs.utimesSync(formulaPath, stat.atime, stat.mtime)
  const live = processFrame(source)
  const history = ensureProcessedFrame(old)
  for (const frame of [live, history]) {
    const item = frame['endi-leftHand']
    assert.equal(item.areaCm2, 3.125)
    assert.equal(item.processing.areaFormulaFile, fileName)
    assert.equal(item.processing.areaFormulaVersion, '1.0.0')
    assert.notEqual(item.processing.areaFormulaRevision, old['endi-leftHand'].processing.areaFormulaRevision)
    assert.deepEqual(item.pressureArr, old['endi-leftHand'].pressureArr)
    assert.deepEqual(item.forceArr, old['endi-leftHand'].forceArr)
    const updatedStats = await historyStats(frame)
    assert.equal(updatedStats.forceArr['endi-leftHand'][0], oldStats.forceArr['endi-leftHand'][0] * 2)
    assert.deepEqual(updatedStats.pressureArr, oldStats.pressureArr)
  }
})

test('renamed formulas refresh combined-leg aggregate forces while preserving recorded pressure and legacy point forces', async t => {
  const directory = withFormulaDirectory(t)
  fs.writeFileSync(path.join(directory, 'dummyArea_v2.9.js'), formulaSource(1, '2.9'))
  const raw = {
    'endi-leftFoot': { arr: new Array(192).fill(80) },
    'endi-rightFoot': { arr: new Array(192).fill(100) },
  }
  const old = prepareProcessedFrame(raw)
  const oldFoot = old['endi-foot']
  // Existing calibrated pressure values must remain exactly as recorded.
  oldFoot.pressureArr[0] = 99.9
  oldFoot.forceArr[0] = 55.5
  const oldStats = await historyStats(old)
  fs.writeFileSync(path.join(directory, 'dummyArea_v2.10.js'), formulaSource(3, '2.10'))
  const updated = ensureProcessedFrame(old)['endi-foot']
  assert.equal(updated.areaCm2, 9.375)
  assert.equal(updated.processing.areaFormulaFile, 'dummyArea_v2.10.js')
  assert.deepEqual(updated.pressureArr, oldFoot.pressureArr)
  assert.deepEqual(updated.forceArr, oldFoot.forceArr)
  const refreshedStats = await historyStats({ 'endi-foot': updated })
  assert.ok(Math.abs(refreshedStats.forceArr['endi-foot'][0] - oldStats.forceArr['endi-foot'][0] * 3) < 1e-12)
  assert.deepEqual(refreshedStats.pressureArr, oldStats.pressureArr)
  for (const key of ['endi-leftFoot', 'endi-rightFoot']) {
    assert.equal(updated.sourceAreaMatrices[key].reduce((sum, value) => sum + value, 0), 4.6875)
  }
  const previousRows = state.historyDbArr
  try {
    state.historyDbArr = [{ data: JSON.stringify(old), timestamp: 1000 }]
    const replay = getPlaybackSnapshot(0).payload.sitDataPlay['endi-foot']
    assert.equal(replay.areaCm2, updated.areaCm2)
    assert.deepEqual(replay.pressureArr, oldFoot.pressureArr)
    assert.deepEqual(replay.forceArr, oldFoot.forceArr)
    const replayStats = await historyStats({ 'endi-foot': replay })
    assert.deepEqual(replayStats.forceArr, refreshedStats.forceArr)
  } finally {
    state.historyDbArr = previousRows
  }
})

test('temporary invalid formulas skip a realtime or playback tick and recover after replacement', t => {
  const directory = withFormulaDirectory(t)
  const filePath = path.join(directory, 'dummyArea.js')
  const previous = Object.fromEntries(['parserArr', 'dataMap', 'baudRate', 'colFlag', 'historyFlag',
    'historyDbArr', 'historyPlayFlag', 'playIndex', 'colplayHZ'].map(key => [key, state[key]]))
  const previousError = console.error
  const errors = []
  console.error = (...args) => errors.push(args)
  t.after(() => { clearPlayTimer(); Object.assign(state, previous); console.error = previousError })
  state.parserArr = { sensor: { port: { isOpen: true } } }
  state.dataMap = { sensor: { type: 'endi-leftHand', arr: new Array(36).fill(80), stamp: Date.now() } }
  state.baudRate = 115200
  state.colFlag = false
  state.historyFlag = false
  fs.writeFileSync(filePath, 'module.exports = {')
  assert.doesNotThrow(colAndSendData)
  assert.doesNotThrow(colAndSendData)
  assert.equal(errors.length, 1)
  fs.writeFileSync(filePath, formulaSource(2))
  assert.doesNotThrow(colAndSendData)
  assert.equal(prepareProcessedFrame({ 'endi-leftHand': { arr: new Array(36).fill(80) } })['endi-leftHand'].areaCm2, 3.125)

  fs.writeFileSync(filePath, 'module.exports = {')
  state.historyDbArr = [{ data: JSON.stringify({ 'endi-leftHand': { arr: new Array(36).fill(80) } }), timestamp: 1000 }]
  state.playIndex = 0
  state.colplayHZ = 1
  assert.doesNotThrow(startPlayback)
  clearPlayTimer()
  assert.equal(state.historyPlayFlag, true)
  assert.equal(state.playIndex, 0)
  fs.writeFileSync(filePath, formulaSource(3))
  assert.doesNotThrow(startPlayback)
  clearPlayTimer()
  assert.equal(getPlaybackSnapshot(0).payload.sitDataPlay['endi-leftHand'].areaCm2, 4.6875)
})
