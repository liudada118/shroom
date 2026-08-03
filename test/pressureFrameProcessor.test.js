const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const sqlite3 = require('sqlite3').verbose()

const {
  ADC_FILTER_MODE,
  DEFAULT_FRAME_PROCESSING_CONFIG,
  DUMMY_POINT_AREA_CM2,
  DUMMY_POINT_SPACING_CM,
  FORCE_FILTER_MODE,
  FORCE_PER_KPA,
  PRESSURE_FILTER_MODE,
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
const { interpolateEndiWearSource } = require('../util/line')
const { buildDirectedFrame } = require('../server/services/DataService')
const formula = require('../server/kpa/dummyPressure_v2.10.4')

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
  assert.equal(formula.VERSION, '2.10.4')
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
    assert.equal(item.processing.formulaFile, 'dummyPressure_v2.10.4.js')
    assert.equal(item.processing.formulaProfile, 'dummy-v2.10.4')
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

test('backend threshold follows the converted display metric', () => {
  const source = { 'endi-leftHand': { arr: new Array(18 * 2).fill(20) } }
  const unfiltered = processFrame(source, {
    filter: 0,
    filterMode: PRESSURE_FILTER_MODE,
    gauss: 0,
    coherent: 1,
  })['endi-leftHand']
  assert.ok(unfiltered.pressureArr.some((value) => value === 0.4))
  assert.ok(unfiltered.forceArr.some((value) => value === 0.1))

  const pressureFiltered = processFrame(source, {
    filter: 0.5,
    filterMode: PRESSURE_FILTER_MODE,
    gauss: 0,
    coherent: 1,
  })['endi-leftHand']
  assert.ok(pressureFiltered.arr.every((value) => value === 0))
  assert.ok(pressureFiltered.pressureArr.every((value) => value === 0))
  assert.ok(pressureFiltered.forceArr.every((value) => value === 0))
  assert.equal(pressureFiltered.processing.filterMode, PRESSURE_FILTER_MODE)
  assert.equal(pressureFiltered.processing.filterStage, 'converted-display-matrix')

  const pressureRetained = processFrame(source, {
    filter: 0.3,
    filterMode: PRESSURE_FILTER_MODE,
    gauss: 0,
    coherent: 1,
  })['endi-leftHand']
  assert.ok(pressureRetained.pressureArr.some((value) => value > 0))

  const forceFiltered = processFrame(source, {
    filter: 0.1,
    filterMode: FORCE_FILTER_MODE,
    gauss: 0,
    coherent: 1,
  })['endi-leftHand']
  assert.ok(forceFiltered.pressureArr.every((value) => value === 0))
  assert.ok(forceFiltered.forceArr.every((value) => value === 0))

  const adcFiltered = processFrame(source, {
    filter: 30,
    filterMode: ADC_FILTER_MODE,
    gauss: 0,
    coherent: 1,
  })['endi-leftHand']
  assert.ok(adcFiltered.arr.every((value) => value === 0))
  assert.ok(adcFiltered.pressureArr.every((value) => value === 0))
})

test('dummy processing starts with pressure filtering disabled', () => {
  assert.equal(DEFAULT_FRAME_PROCESSING_CONFIG.filter, 0)
  assert.equal(DEFAULT_FRAME_PROCESSING_CONFIG.filterMode, PRESSURE_FILTER_MODE)
})

test('raw ADC keeps the normalized line-order matrix before zeroing and filtering', () => {
  const source = Array.from({ length: 18 * 2 }, (_, index) => index + 1)
  const expected = interpolateEndiWearSource('endi-leftHand', source)
  const item = processFrame({
    'endi-leftHand': {
      arr: new Array(expected.length).fill(0),
      rawAdcArr: expected,
    },
  }, { filter: 200, filterMode: ADC_FILTER_MODE, gauss: 2, coherent: 1 })['endi-leftHand']

  assert.deepEqual(item.rawAdcArr, expected)
  assert.ok(item.pressureArr.every((value) => value === 0))
  assert.ok(item.forceArr.every((value) => value === 0))
})

test('dummy matrices ignore configured direction flips and keep source line order', () => {
  const left = processFrame({
    'endi-leftFoot': { arr: Array.from({ length: 6 * 32 }, (_, index) => index + 20) },
  }, { filter: 0, gauss: 0 })['endi-leftFoot']
  const right = processFrame({
    'endi-rightFoot': { arr: Array.from({ length: 6 * 32 }, (_, index) => index + 80) },
  }, { filter: 0, gauss: 0 })['endi-rightFoot']
  const combined = []
  for (let row = 0; row < 64; row++) {
    combined.push(
      ...left.rawAdcArr.slice(row * 12, row * 12 + 12),
      ...right.rawAdcArr.slice(row * 12, row * 12 + 12),
    )
  }
  const processed = processFrame({ 'endi-foot': { arr: combined } }, { filter: 0, gauss: 0 })
  const original = processed['endi-foot']
  const directed = buildDirectedFrame(processed, {
    left: true,
    up: true,
    rotateDegree: 0,
    byKey: {
      'endi-foot': { left: false, up: false, rotateDegree: 270 },
    },
  })['endi-foot']

  assert.deepEqual(directed.rawAdcArr, original.rawAdcArr)
  assert.deepEqual(directed.pressureArr, original.pressureArr)
  assert.deepEqual(directed.forceArr, original.forceArr)
  assert.equal(directed.matrixMeta.width, 24)
  assert.equal(directed.matrixMeta.height, 64)
  assert.equal(directed.dataDirection.data_direction, 'none')

  for (let row = 0; row < 64; row++) {
    const combinedStart = row * 24
    const sourceStart = row * 12
    assert.deepEqual(
      directed.sourceRawAdcMatrices['endi-leftFoot'].slice(sourceStart, sourceStart + 12),
      directed.rawAdcArr.slice(combinedStart, combinedStart + 12),
    )
    assert.deepEqual(
      directed.sourceRawAdcMatrices['endi-rightFoot'].slice(sourceStart, sourceStart + 12),
      directed.rawAdcArr.slice(combinedStart + 12, combinedStart + 24),
    )
  }
})

test('CSV export is pressure-only and preserves three-decimal elapsed seconds', async (t) => {
  const db = new sqlite3.Database(':memory:')
  const pressureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shroom-dummy-pressure-'))
  t.after(async () => {
    await close(db)
    fs.rmSync(pressureDir, { recursive: true, force: true })
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

  const legacyModeFields = await getExportFieldOptions({
    db,
    params: ['sample'],
    exportOptions: { metricMode: 'adc' },
  })
  assert.ok(legacyModeFields.fields.some((field) => field.label === '压强数据(kPa)'))
  assert.ok(!legacyModeFields.fields.some((field) => /原始ADC数据|压力数据\(N\)/.test(field.label)))
})
