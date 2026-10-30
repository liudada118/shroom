const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const sqlite3 = require('sqlite3').verbose()
const areaFormula = require('../server/kpa/dummyArea_v2.10.36')
const { DUMMY_MATRIX_CONFIG, DUMMY_POINT_AREA_CM2, processFrame } = require('../util/pressureFrameProcessor')
const { buildCsvPlaybackData, dbGetData, dbLoadCsv, getCsvData } = require('../util/db')

const run = (db, sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, (error) => error ? reject(error) : resolve())
})

async function createHistory(t, frame, selection = {}) {
  const db = new sqlite3.Database(':memory:')
  t.after(() => new Promise((resolve, reject) => db.close((error) => error ? reject(error) : resolve())))
  await run(db, 'CREATE TABLE matrix (data TEXT, timestamp INTEGER, date TEXT)')
  await run(db, 'CREATE TABLE remarks (date TEXT, alias TEXT, remark TEXT, select_json TEXT, updated_at INTEGER)')
  await run(db, 'INSERT INTO remarks VALUES (?, ?, ?, ?, ?)', ['area', 'area', '', JSON.stringify(selection), 1000])
  await run(db, 'INSERT INTO matrix VALUES (?, ?, ?)', [JSON.stringify(frame), 1000, 'area'])
  return db
}

test('recorded raw ADC history uses the area package equally in every metric mode', async (t) => {
  const raw = Object.fromEntries(Object.entries(DUMMY_MATRIX_CONFIG).map(([key, dimensions]) => [key, {
    arr: Array.from({ length: dimensions.sourceWidth * dimensions.sourceHeight }, (_, index) => index % 11 ? 80 : 20),
  }]))
  const expected = {}
  for (const [key, dimensions] of Object.entries(DUMMY_MATRIX_CONFIG)) {
    const matrix = Array.from({ length: dimensions.sourceHeight }, (_, row) => raw[key].arr.slice(row * dimensions.sourceWidth, (row + 1) * dimensions.sourceWidth))
    expected[key] = areaFormula.calculateDummyRawAreaFrame(matrix, dimensions.sensorType).retainedCellCount
  }
  expected['endi-foot'] = expected['endi-leftFoot'] + expected['endi-rightFoot']
  const canonical = processFrame(raw)
  const history = await dbGetData({ db: await createHistory(t, raw), params: ['area'] })
  for (const key of ['endi-jacket', 'endi-leftHand', 'endi-rightHand', 'endi-foot']) {
    for (const field of ['areaArr', 'adcAreaArr', 'pressureAreaArr', 'forceAreaArr']) {
      assert.deepEqual(history[field][key], [expected[key]], `${key} ${field}`)
    }
    const summaries = key === 'endi-foot'
      ? [canonical['endi-leftFoot'].pressureSummary, canonical['endi-rightFoot'].pressureSummary]
      : [canonical[key].pressureSummary]
    const pressure = Number((summaries.reduce((sum, value) => sum + value.pressureSumKpa, 0)
      / summaries.reduce((sum, value) => sum + value.nonZeroCount, 0)).toFixed(2))
    const areaCm2 = expected[key] * DUMMY_POINT_AREA_CM2
    const force = pressure * areaCm2 * 0.1
    for (const field of ['forceArr', 'pressArr']) {
      assert.equal(history[field][key].length, 1, `${key} ${field}`)
      assert.ok(Math.abs(history[field][key][0] - force) <= 1e-10 * Math.max(1, Math.abs(force)), `${key} ${field}`)
    }
  }
})

test('CSV full and selected areas sum the canonical area cells and preserve unknown imported area', async (t) => {
  const frame = processFrame({ 'endi-leftHand': { arr: new Array(36).fill(80) } })
  const item = frame['endi-leftHand']
  item.forceArr.fill(999)
  assert.equal(item.areaValuesCm2[0], DUMMY_POINT_AREA_CM2)
  const selection = { 'endi-leftHand': [{ xStart: 0, xEnd: 1, yStart: 0, yEnd: 1, width: 36, height: 4 }] }
  const db = await createHistory(t, frame, selection)
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'shroom-area-export-'))
  t.after(() => {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()))
    assert.ok(path.basename(directory).startsWith('shroom-area-export-'))
    fs.rmSync(directory, { recursive: true, force: true })
  })
  const [result] = await dbLoadCsv({
    db, params: ['area'], file: 'endi', customDownloadPath: directory,
    exportOptions: { pressureUnit: 'kPa', format: 'csv', fields: [] },
  })
  const rows = await getCsvData(result.filePath)
  const areaHeaders = Object.keys(rows[0]).filter((header) => header.includes('左臂') && header.includes('受力面积'))
  assert.equal(areaHeaders.length, 2)
  const fullHeader = areaHeaders.find((header) => !header.includes('框选'))
  const selectedHeader = areaHeaders.find((header) => header.includes('框选'))
  assert.equal(Number(rows[0][fullHeader]), item.areaCm2)
  // The selected single cell belongs to a larger fitted region. Refitting that
  // one-cell crop would discard it as noise and incorrectly export zero area.
  assert.equal(Number(rows[0][selectedHeader]), DUMMY_POINT_AREA_CM2)
  const forceHeaders = Object.keys(rows[0]).filter(header => header.includes('左臂') && header.includes('压力总和(N)'))
  assert.equal(forceHeaders.length, 2)
  const fullForce = forceHeaders.find(header => !header.includes('框选'))
  const selectedForce = forceHeaders.find(header => header.includes('框选'))
  assert.equal(Number(rows[0][fullForce]), Number((item.pressureSummary.avgKpa * item.areaCm2 * 0.1).toFixed(1)))
  // Pressure follows the backup's cropped-ADC calculation: a single-cell contact
  // is below its three-cell minimum, while the original fitted area stays known.
  assert.equal(Number(rows[0][selectedForce]), 0)

  const imported = buildCsvPlaybackData(rows)
  for (const field of ['areaArr', 'adcAreaArr', 'pressureAreaArr', 'forceAreaArr']) {
    assert.deepEqual(imported[field]['endi-leftHand'], [null])
  }
  const importedFrame = JSON.parse(imported.rows[0].data)
  const importedDb = await createHistory(t, importedFrame)
  const history = await dbGetData({ db: importedDb, params: ['area'] })
  assert.deepEqual(history.areaArr['endi-leftHand'], [null])
  assert.deepEqual(history.forceArr['endi-leftHand'], [null])
  const [unknownResult] = await dbLoadCsv({
    db: importedDb, params: ['area'], file: 'endi', customDownloadPath: directory,
    exportOptions: { pressureUnit: 'kPa', format: 'csv', fields: [] },
  })
  const unknownRows = await getCsvData(unknownResult.filePath)
  const unknownForceHeader = Object.keys(unknownRows[0]).find(header => header.includes('左臂') && header.includes('压力总和(N)'))
  assert.equal(unknownRows[0][unknownForceHeader], '')
})

test('combined recorded legs preserve physical masks and imported legs keep unknown area', async (t) => {
  const physicalMask = Array.from({ length: 32 }, () => new Array(6).fill(true))
  for (let row = 0; row < 12; row++) physicalMask[row].fill(false)
  const frame = processFrame({
    'endi-leftFoot': { arr: new Array(192).fill(80), physicalMask },
    'endi-rightFoot': { arr: new Array(192).fill(100) },
  })
  const expectedArea = frame['endi-leftFoot'].areaCm2 + frame['endi-rightFoot'].areaCm2
  const history = await dbGetData({ db: await createHistory(t, frame), params: ['area'] })
  assert.deepEqual(history.areaArr['endi-foot'], [expectedArea / DUMMY_POINT_AREA_CM2])

  const imported = Object.fromEntries(['endi-leftFoot', 'endi-rightFoot'].map((key) => [key, {
    arr: new Array(768).fill(0),
    pressureArr: new Array(768).fill(10),
    forceArr: new Array(768).fill(1.6),
    processing: { importedMetric: true },
  }]))
  const importedHistory = await dbGetData({ db: await createHistory(t, imported), params: ['area'] })
  assert.deepEqual(importedHistory.areaArr['endi-foot'], [null])
  assert.deepEqual(importedHistory.pressureAreaArr['endi-foot'], [null])
  assert.deepEqual(importedHistory.pressureArr['endi-foot'], [15360])
  assert.deepEqual(importedHistory.forceArr['endi-foot'], [null])
})

test('combined leg history uses the whole lower-body pressure mean and summed area rather than adding side forces', async t => {
  const leg = pressure => {
    const pressureArr = new Array(768).fill(0)
    pressureArr.splice(0, pressure.length, ...pressure)
    const areaValuesCm2 = new Array(768).fill(0)
    areaValuesCm2[0] = DUMMY_POINT_AREA_CM2
    return {
      arr: new Array(768).fill(0), pressureArr, forceArr: new Array(768).fill(999),
      areaValuesCm2, areaCm2: DUMMY_POINT_AREA_CM2, processing: { importedMetric: true },
    }
  }
  const frame = { 'endi-leftFoot': leg([1]), 'endi-rightFoot': leg([9, 9, 9]) }
  const before = structuredClone(frame)
  const history = await dbGetData({ db: await createHistory(t, frame), params: ['area'] })
  assert.deepEqual(history.pressureArr['endi-foot'], [28])
  assert.deepEqual(history.areaArr['endi-foot'], [2])
  assert.deepEqual(history.forceArr['endi-foot'], [2.1875]) // ((1 + 9 + 9 + 9) / 4) * 3.125 * 0.1
  assert.notEqual(history.forceArr['endi-foot'][0], 1.5625) // Separate side forces would incorrectly give (1 + 9) * 1.5625 * 0.1.
  assert.deepEqual(frame, before)
})

test('downsampled recorded forces average each frame product instead of multiplying averaged pressure and area', async t => {
  const frame = (pressure, area) => ({ 'endi-leftHand': {
    arr: [0, 0], pressureArr: pressure, forceArr: [999, 999], areaValuesCm2: area,
    processing: { importedMetric: true },
  } })
  const first = frame([1, 9], [1.5625, 1.5625])
  const second = frame([9, 9], [1.5625, 0])
  const db = await createHistory(t, first)
  await run(db, 'INSERT INTO matrix VALUES (?, ?, ?)', [JSON.stringify(second), 1100, 'area'])
  await run(db, `WITH RECURSIVE sample(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM sample WHERE n<499)
    INSERT INTO matrix SELECT ?, 1100+n*100, 'area' FROM sample`, [JSON.stringify(first)])
  const history = await dbGetData({ db, params: ['area'] })
  assert.equal(history.forceArr['endi-leftHand'].length, 251)
  assert.equal(history.forceArr['endi-leftHand'][0], 1.484375)
  assert.equal(history.forceArr['endi-leftHand'][1], 1.5625)
  assert.notEqual(history.forceArr['endi-leftHand'][0], 7 * 2.34375 * 0.1)
})
