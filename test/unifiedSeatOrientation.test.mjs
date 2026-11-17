import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { getPressureMetricPointValues } from '../client/src/util/pressureMetrics.js'
import { prepareChairModelAdc } from '../client/src/util/chairModelDisplay.js'

const require = createRequire(import.meta.url)
const csv = require('csv-parser')
const { endiSit1024 } = require('../util/line.js')
const {
  buildRawDisplayAdc, processFullAlgorithmItem, prepareFullAlgorithmHistory,
  FULL_PROCESSING_VERSION, FULL_RAW_DISPLAY_ORIENTATION,
} = require('../util/fullAlgorithmProcessor.js')
const { ensureProcessedMatrixItem } = require('../util/pressureFrameProcessor.js')
const { dbLoadCsv, buildCsvPlaybackData } = require('../util/db.js')

const raw = Array.from({ length: 1024 }, (_, i) => (i * 73 + Math.floor(i / 32) * 19) % 251)

function turn(values, width = 46) {
  return values.map((_, i) => values[(width - 1 - i % width) * width + Math.floor(i / width)])
}

function legacyDisplay() {
  let values = endiSit1024(raw)
  for (let i = 0; i < 3; i++) values = turn(values)
  return values
}

function frame() {
  return processFullAlgorithmItem('endi-sit', {
    algorithmRawFrame: raw.slice(), algorithmTimestampMs: 0, algorithmStreamId: 'unified-display-test',
  }, new Map())
}

function oldSavedFrame() {
  const item = frame()
  item.arr = item.rawAdcArr = item.rawAdcArr.slice().reverse()
  item.processing = { ...item.processing, version: 'backend-force-area-v20-external-calibration-raw-adc' }
  delete item.processing.rawDisplayOrientation
  delete item.algorithmRawFrame
  return item
}

test('seat canonical ADC and 2D match car上海, and the model uses the same display matrix', () => {
  const item = frame()
  const expected = legacyDisplay()
  assert.deepEqual(item.arr, expected)
  assert.deepEqual(item.rawAdcArr, expected)
  assert.equal(item.processing.rawDisplayOrientation, FULL_RAW_DISPLAY_ORIENTATION)
  assert.deepEqual(getPressureMetricPointValues(item.rawAdcArr, 'endi-sit', 'adc'), expected)
  assert.deepEqual(prepareChairModelAdc(item.rawAdcArr, 46, 46), expected.slice().reverse())
  assert.deepEqual(item.algorithmRawFrame, raw)
})

test('old raw-only history changes coordinates exactly once while retaining acquired force/area and identity', () => {
  const old = oldSavedFrame()
  old.zeroState = { enabled: true } // v20 explicitly stored pre-zero display ADC.
  const force = old.algorithmMetrics.forceMetrics
  const area = old.algorithmMetrics.areaMetrics
  const identity = old.algorithmMetrics.identity
  const first = prepareFullAlgorithmHistory([{ timestamp: 0, data: { 'endi-sit': old } }])
  const item = first[0].data['endi-sit']
  assert.deepEqual(item.rawAdcArr, legacyDisplay())
  assert.equal(item.processing.version, FULL_PROCESSING_VERSION)
  assert.equal(item.algorithmMetrics.forceMetrics, force)
  assert.equal(item.algorithmMetrics.areaMetrics, area)
  assert.equal(item.algorithmMetrics.identity, identity)
  assert.equal(prepareFullAlgorithmHistory(first), first)
  assert.deepEqual(ensureProcessedMatrixItem('endi-sit', item), item)
})

test('already saved CSV measurements retain their declared layout during schema migration', () => {
  const old = oldSavedFrame()
  old.rawDisplaySource = 'csv-declared-raw-adc'
  old.algorithmMetrics.source = 'csv-saved-force-area'
  const declared = old.rawAdcArr.slice()
  const item = ensureProcessedMatrixItem('endi-sit', old)
  assert.deepEqual(item.rawAdcArr, declared)
  assert.equal(item.processing.rawDisplayOrientation, FULL_RAW_DISPLAY_ORIENTATION)
})

test('CSV download, selection and import share the exact 2D seat cell order', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'shroom-unified-seat-'))
  t.after(() => {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()))
    assert.ok(path.basename(directory).startsWith('shroom-unified-seat-'))
    fs.rmSync(directory, { recursive: true, force: true })
  })
  const item = frame()
  const expected = legacyDisplay()
  const stored = [{ timestamp: 100, data: JSON.stringify({ 'endi-sit': item }) }]
  const db = {
    all(_sql, _params, callback) { callback(null, stored) },
    get(_sql, _params, callback) { callback(null, null) },
  }
  const region = { xStart: 2, xEnd: 6, yStart: 3, yEnd: 5, width: 46, height: 46 }
  const [result] = await dbLoadCsv({
    db, params: ['orientation'], file: 'endi', isPackaged: false,
    customDownloadPath: directory, selectJson: { 'endi-sit': { regions: [region] } },
  })
  const rows = []
  await new Promise((resolve, reject) => fs.createReadStream(result.filePath).pipe(csv())
    .on('data', row => rows.push(row)).on('end', resolve).on('error', reject))
  const row = rows[0]
  const completeHeader = Object.keys(row).find(key => key.includes('原始ADC数据') && !key.includes('框选'))
  const regionHeader = Object.keys(row).find(key => key.includes('原始ADC数据') && key.includes('框选'))
  assert.deepEqual(JSON.parse(row[completeHeader]), expected)
  const selected = []
  for (let y = region.yStart; y < region.yEnd; y++) selected.push(...expected.slice(y * 46 + region.xStart, y * 46 + region.xEnd))
  assert.deepEqual(JSON.parse(row[regionHeader]), selected)
  const imported = JSON.parse(buildCsvPlaybackData([row]).rows[0].data)['endi-sit']
  assert.deepEqual(imported.rawAdcArr, expected)
  assert.deepEqual(ensureProcessedMatrixItem('endi-sit', imported).rawAdcArr, expected)
})

test('backrest source keeps its existing rotation and is not given a seat-only half turn', () => {
  const api = require('../util/calibrationRuntime.js').getCalibrationRuntime().api
  const source = api.calculateSensorFrame({ raw, timestampMs: 0 }, 'new-backrest-32x25').sourceMatrix
  let expected = source
  for (let i = 0; i < 3; i++) expected = expected[0].map((_, col) => expected.map(row => row[col]).reverse())
  assert.deepEqual(buildRawDisplayAdc('endi-back', { algorithmRawFrame: raw }, 3), expected)
})
