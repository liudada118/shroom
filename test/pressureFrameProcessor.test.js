const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const sqlite3 = require('sqlite3').verbose()

const {
  DUMMY_POINT_AREA_CM2,
  DUMMY_POINT_SPACING_CM,
  FORCE_PER_KPA,
  PROCESSING_VERSION,
  ensureProcessedFrame,
  processFrame,
} = require('../util/pressureFrameProcessor')
const {
  buildCsvPlaybackData,
  dbLoadCsv,
  getCsvData,
  getExportFieldOptions,
  validateImportedCsv,
} = require('../util/db')
const formula = require('../server/kpa/dummyPressure_v2.10.3')

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) reject(error)
      else resolve(this)
    })
  })
}

function close(db) {
  return new Promise((resolve, reject) => {
    db.close((error) => (error ? reject(error) : resolve()))
  })
}

function assertOneDecimal(values) {
  values.forEach((value) => {
    assert.equal(Number((Number(value) || 0).toFixed(1)), value)
  })
}

test('dummy formula self-check passes', () => {
  const result = formula.runSelfCheck()
  assert.equal(result.pass, true)
  assert.equal(result.passed, result.total)
})

test('dummy point geometry uses 1.25 cm spacing', () => {
  assert.equal(DUMMY_POINT_SPACING_CM, 1.25)
  assert.equal(DUMMY_POINT_AREA_CM2, 1.5625)
  assert.equal(FORCE_PER_KPA, 0.15625)
})

test('all dummy sensor matrices produce canonical pressure and force arrays', () => {
  const sourceFrame = {
    'endi-jacket': { arr: new Array(12 * 27).fill(176.36) },
    'endi-leftHand': { arr: new Array(18 * 2).fill(176.36) },
    'endi-rightHand': { arr: new Array(18 * 2).fill(176.36) },
    'endi-leftFoot': { arr: new Array(6 * 32).fill(176.36) },
    'endi-rightFoot': { arr: new Array(6 * 32).fill(176.36) },
  }
  const expectedLengths = {
    'endi-jacket': 24 * 54,
    'endi-leftHand': 36 * 4,
    'endi-rightHand': 36 * 4,
    'endi-leftFoot': 12 * 64,
    'endi-rightFoot': 12 * 64,
  }
  const processed = processFrame(sourceFrame, { filter: 0, gauss: 0, coherent: 1 })

  Object.entries(expectedLengths).forEach(([key, expectedLength]) => {
    const item = processed[key]
    assert.equal(item.processing.version, PROCESSING_VERSION)
    assert.equal(item.pressureArr.length, expectedLength)
    assert.equal(item.forceArr.length, expectedLength)
    assertOneDecimal(item.pressureArr)
    assertOneDecimal(item.forceArr)
    const index = item.pressureArr.findIndex((value) => value > 0)
    assert.notEqual(index, -1)
    assert.ok(Math.abs(item.forceArr[index] - item.pressureArr[index] * FORCE_PER_KPA) <= 0.1)
  })

  assert.deepEqual(ensureProcessedFrame(processed), processed)
})

test('combined lower-body matrix keeps canonical left/right sources', () => {
  const physicalLeft = new Array(6 * 32).fill(176.36)
  const physicalRight = new Array(6 * 32).fill(180)
  const left = processFrame({ 'endi-leftFoot': { arr: physicalLeft } }, { filter: 0, gauss: 0 })['endi-leftFoot']
  const right = processFrame({ 'endi-rightFoot': { arr: physicalRight } }, { filter: 0, gauss: 0 })['endi-rightFoot']
  const combinedAdc = []
  for (let row = 0; row < 64; row++) {
    combinedAdc.push(
      ...left.arr.slice(row * 12, row * 12 + 12),
      ...right.arr.slice(row * 12, row * 12 + 12),
    )
  }
  const item = processFrame({ 'endi-foot': { arr: combinedAdc } }, { filter: 0, gauss: 0 })['endi-foot']

  assert.equal(item.pressureArr.length, 24 * 64)
  assert.equal(item.forceArr.length, 24 * 64)
  assert.equal(item.sourcePressureMatrices['endi-leftFoot'].length, 12 * 64)
  assert.equal(item.sourcePressureMatrices['endi-rightFoot'].length, 12 * 64)
})

test('backend threshold and Gaussian configuration are deterministic', () => {
  const source = { 'endi-leftHand': { arr: new Array(18 * 2).fill(20) } }
  const filtered = processFrame(source, { filter: 30, gauss: 2, coherent: 1 })
  assert.ok(filtered['endi-leftHand'].pressureArr.every((value) => value === 0))
  assert.ok(filtered['endi-leftHand'].forceArr.every((value) => value === 0))
})

test('CSV export follows metric mode and preserves three-decimal elapsed seconds', async (t) => {
  const db = new sqlite3.Database(':memory:')
  const pressureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shroom-dummy-pressure-'))
  const forceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shroom-dummy-force-'))
  t.after(async () => {
    await close(db)
    fs.rmSync(pressureDir, { recursive: true, force: true })
    fs.rmSync(forceDir, { recursive: true, force: true })
  })

  await run(db, 'CREATE TABLE matrix (data TEXT, timestamp INTEGER, date TEXT)')
  await run(db, 'CREATE TABLE remarks (date TEXT, alias TEXT, remark TEXT, select_json TEXT, updated_at INTEGER)')
  await run(db, 'INSERT INTO remarks (date, alias, remark, select_json, updated_at) VALUES (?, ?, ?, ?, ?)', [
    'sample',
    'sample',
    'not exported',
    '{}',
    Date.now(),
  ])

  const frame = processFrame({
    'endi-leftHand': { arr: new Array(18 * 2).fill(176.36) },
  }, { filter: 0, gauss: 0, coherent: 1 })
  await run(db, 'INSERT INTO matrix (data, timestamp, date) VALUES (?, ?, ?)', [JSON.stringify(frame), 1000, 'sample'])
  await run(db, 'INSERT INTO matrix (data, timestamp, date) VALUES (?, ?, ?)', [JSON.stringify(frame), 1125, 'sample'])

  const pressureFields = await getExportFieldOptions({
    db,
    params: ['sample'],
    exportOptions: { metricMode: 'pressure' },
  })
  assert.ok(pressureFields.fields.some((field) => field.label === '秒数(s)'))
  assert.ok(pressureFields.fields.some((field) => field.label === '压强数据(kPa)'))
  assert.ok(!pressureFields.fields.some((field) => /MAC|备注/.test(field.label)))

  const [pressureResult] = await dbLoadCsv({
    db,
    params: ['sample'],
    file: 'endi',
    customDownloadPath: pressureDir,
    exportOptions: { metricMode: 'pressure', format: 'csv', fields: [] },
  })
  const pressureRows = await getCsvData(pressureResult.filePath)
  const pressureHeaders = Object.keys(pressureRows[0])
  const pressureDataHeader = pressureHeaders.find((header) => header.includes('压强数据(kPa)'))
  const totalForceHeader = pressureHeaders.find((header) => header.includes('压力总和(N)'))

  assert.equal(pressureRows[0]['秒数(s)'], '0.000')
  assert.equal(pressureRows[1]['秒数(s)'], '0.125')
  assert.ok(pressureDataHeader)
  assert.ok(totalForceHeader)
  assert.ok(JSON.parse(pressureRows[0][pressureDataHeader]).some((value) => value > 0))
  assert.equal(Number(pressureRows[0][totalForceHeader]), Number(frame['endi-leftHand'].forceArr.reduce((sum, value) => sum + value, 0).toFixed(1)))
  assert.equal((await validateImportedCsv(pressureResult.filePath)).valid, true)

  const pressurePlayback = buildCsvPlaybackData(pressureRows)
  const importedPressureItem = JSON.parse(pressurePlayback.rows[0].data)['endi-leftHand']
  assert.deepEqual(importedPressureItem.pressureArr, frame['endi-leftHand'].pressureArr)

  const [forceResult] = await dbLoadCsv({
    db,
    params: ['sample'],
    file: 'endi',
    customDownloadPath: forceDir,
    exportOptions: { metricMode: 'force', format: 'csv', fields: [] },
  })
  const forceRows = await getCsvData(forceResult.filePath)
  const forceDataHeader = Object.keys(forceRows[0]).find((header) => header.includes('压力数据(N)'))
  assert.ok(forceDataHeader)
  assert.deepEqual(JSON.parse(forceRows[0][forceDataHeader]), frame['endi-leftHand'].forceArr)
  assert.equal((await validateImportedCsv(forceResult.filePath)).valid, true)
})
