'use strict'

const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { createHistoryStore } = require('../node/history-store');

try {
  require('sqlite3')
} catch {
  console.log('history-store.test.js skipped: sqlite3 not installed')
  process.exit(0)
}

(async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shroom-sdk-history-'))
  const dbPath = path.join(tempDir, 'history.db')
  let store
  try {
    store = await createHistoryStore({ dbPath })
    await store.appendFrame('demo', {
      timestamp: 123,
      data: { 'car-sit': { arr: [1, 2, 3] } },
    })
    await store.appendFrame('demo', {
      timestamp: 124,
      data: { 'car-sit': { arr: [4, 5, 6] } },
    })

    const records = await store.listRecords()
    assert.strictEqual(records.length, 1)
    assert.strictEqual(records[0].date, 'demo')
    assert.strictEqual(records[0].frame_count, 2)

    const rows = await store.readRecord('demo')
    assert.strictEqual(rows.length, 2)
    assert.deepStrictEqual(rows[0].data['car-sit'].arr, [1, 2, 3])

    await store.deleteRecord('demo')
    assert.strictEqual((await store.listRecords()).length, 0)
  } finally {
    if (store) await store.close()
    fs.rmSync(tempDir, { recursive: true, force: true })
  }

  console.log('history-store.test.js passed')
})().catch((err) => {
  console.error(err)
  process.exit(1)
})
