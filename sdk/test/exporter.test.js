'use strict'

const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const exporter = require('../node/exporter')

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shroom-sdk-export-'))

try {
  const frames = [{
    timestamp: 123,
    path: 'COM1',
    baudRate: 1000000,
    type: 'car-sit',
    data: {
      kind: 'matrix',
      type: 'car-sit',
      arr: [0, 2, 3],
      rawFrame: { port: 'COM1', baud_rate: 1000000 },
    },
  }]

  const rows = exporter.flattenFrameRows(frames)
  assert.strictEqual(rows.length, 2)
  assert.deepStrictEqual(rows.map((row) => row.value), [2, 3])

  const csvPath = path.join(tempDir, 'frames.csv')
  const result = exporter.exportFrames(csvPath, frames)
  assert.strictEqual(result.rowCount, 2)
  const text = fs.readFileSync(csvPath, 'utf8')
  assert.ok(text.includes('matrix_key'))
  assert.ok(text.includes('car-sit'))
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true })
}

console.log('exporter.test.js passed')
