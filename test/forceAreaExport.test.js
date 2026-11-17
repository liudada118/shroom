'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { getExportFieldOptions, buildCsvPlaybackData, validateImportedCsv } = require('../util/db')

test('export fields are always force, area, converted pressure and original ADC', async () => {
  for (const mode of ['force', 'pressure']) {
    const result = await getExportFieldOptions({ exportOptions: { metricMode: mode } })
    assert.deepEqual(result.fields, [
      { value: 'timestamp', label: '时间戳' },
      { value: 'elapsed_seconds', label: '秒数(s)' },
      { value: 'avg_pressure', label: '换算压强(kPa)' },
      { value: 'contact_area', label: '受力面积(cm²)' },
      { value: 'real_data', label: '原始ADC数据' },
      { value: 'total_pressure_n', label: '总压力(N)' },
    ])
  }
})

function csvRow(prefix, values, force, area) {
  return {
    时间戳: '100', '秒数(s)': '0',
    [`${prefix}原始ADC数据`]: JSON.stringify(values),
    [`${prefix}总压力(N)`]: String(force),
    [`${prefix}受力面积(cm²)`]: String(area),
    [`${prefix}换算压强(kPa)`]: '999', // Conversion must use the declared force and area.
  }
}

test('ADC CSV replay retains raw low values and computes global pressure from saved force and area', () => {
  for (const [prefix, key, length, width, height] of [
    ['坐垫', 'endi-sit', 2116, 46, 46], ['靠背', 'endi-back', 3200, 64, 50],
  ]) {
    const values = Array.from({ length }, (_, i) => i % 31)
    const replay = buildCsvPlaybackData([csvRow(prefix, values, 100, 200)])
    const item = JSON.parse(replay.rows[0].data)[key]
    assert.deepEqual(item.rawAdcArr, values)
    assert.deepEqual(item.arr, values)
    assert.equal(item.matrixMeta.width, width)
    assert.equal(item.matrixMeta.height, height)
    assert.deepEqual(replay.forceArr[key], [100])
    assert.deepEqual(replay.areaArr[key], [200])
    assert.deepEqual(replay.pressureArr[key], [5])
    assert.equal(item.algorithmMetrics.version, 'unknown')
    assert.equal(item.algorithmMetrics.source, 'csv-saved-force-area')
    assert.equal(item.processing.formulaFile, null)
  }
})

test('zero-area saved data never produces an infinite or fabricated pressure', () => {
  const replay = buildCsvPlaybackData([csvRow('坐垫', Array(2116).fill(0), 0, 0)])
  assert.deepEqual(replay.forceArr['endi-sit'], [0])
  assert.deepEqual(replay.areaArr['endi-sit'], [0])
  assert.deepEqual(replay.pressureArr['endi-sit'], [null])
})

test('downsampled history keeps pressure consistent with its displayed force and area', () => {
  const first = csvRow('坐垫', Array(2116).fill(10), 100, 100)
  const second = csvRow('坐垫', Array(2116).fill(10), 300, 1000)
  const rows = Array.from({ length: 501 }, (_, index) => ({
    ...(index % 2 ? second : first), 时间戳: String(100 + index),
  }))
  const replay = buildCsvPlaybackData(rows)
  assert.equal(replay.forceArr['endi-sit'][0], 200)
  assert.equal(replay.areaArr['endi-sit'][0], 550)
  assert.equal(replay.pressureArr['endi-sit'][0], 10 * 200 / 550)
})

test('the new ADC export headers pass the existing CSV import validator', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'shroom-force-area-export-'))
  const file = path.join(directory, 'roundtrip.csv')
  const row = csvRow('坐垫', Array(2116).fill(23), 100, 200)
  const quote = value => `"${String(value).replace(/"/g, '""')}"`
  fs.writeFileSync(file, `${Object.keys(row).map(quote).join(',')}\n${Object.values(row).map(quote).join(',')}\n`, 'utf8')
  try {
    assert.equal((await validateImportedCsv(file)).valid, true)
  } finally {
    fs.unlinkSync(file)
    fs.rmdirSync(directory)
  }
})
