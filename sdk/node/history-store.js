'use strict'

const fs = require('fs')
const path = require('path')

function getSqlite3(options = {}) {
  if (options.sqlite3) return options.sqlite3
  try {
    return require('sqlite3').verbose()
  } catch (err) {
    throw new Error('sqlite3 is required for history-store functions')
  }
}

function dbRun(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) reject(err)
      else resolve({ changes: this.changes, lastID: this.lastID })
    })
  })
}

function dbAll(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err)
      else resolve(rows || [])
    })
  })
}

function dbGet(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err)
      else resolve(row || null)
    })
  })
}

function closeDb(db) {
  return new Promise((resolve, reject) => {
    if (!db) {
      resolve()
      return
    }
    db.close((err) => {
      if (err) reject(err)
      else resolve()
    })
  })
}

function serializeFrameData(frame) {
  if (typeof frame === 'string') return frame
  if (frame?.data && typeof frame.data !== 'string') return JSON.stringify(frame.data)
  return JSON.stringify(frame || {})
}

function parseFrameData(value) {
  if (!value) return {}
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch {
    return {}
  }
}

async function createHistoryStore(options = {}) {
  const sqlite3 = getSqlite3(options)
  const dbPath = options.dbPath || path.join(process.cwd(), 'data', 'shroom-sdk.db')
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })

  const db = await new Promise((resolve, reject) => {
    const instance = new sqlite3.Database(dbPath, (err) => {
      if (err) reject(err)
      else resolve(instance)
    })
  })

  await dbRun(db, 'PRAGMA journal_mode = WAL;')
  await dbRun(db, 'PRAGMA synchronous = NORMAL;')
  await dbRun(db, `CREATE TABLE IF NOT EXISTS matrix (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    data TEXT,
    timestamp INTEGER,
    date TEXT,
    "select" TEXT
  )`)
  await dbRun(db, 'CREATE INDEX IF NOT EXISTS idx_matrix_date_timestamp ON matrix(date, timestamp)')

  return {
    db,
    dbPath,
    async appendFrame(recordName, frame, options = {}) {
      const timestamp = Number(frame?.timestamp || frame?.rawFrame?.received_at || Date.now())
      const date = String(recordName || options.recordName || new Date(timestamp).toISOString())
      const select = options.select === undefined ? [] : options.select
      return dbRun(db, 'INSERT INTO matrix (data, timestamp, date, "select") VALUES (?, ?, ?, ?)', [
        serializeFrameData(frame),
        timestamp,
        date,
        typeof select === 'string' ? select : JSON.stringify(select),
      ])
    },
    async appendFrames(recordName, frames = [], options = {}) {
      const results = []
      for (const frame of frames) {
        results.push(await this.appendFrame(recordName, frame, options))
      }
      return results
    },
    async listRecords() {
      return dbAll(db, `SELECT date, COUNT(*) AS frame_count, MIN(timestamp) AS start_time, MAX(timestamp) AS end_time
        FROM matrix GROUP BY date ORDER BY end_time DESC`)
    },
    async readRecord(recordName, options = {}) {
      const rows = await dbAll(
        db,
        'SELECT id, data, timestamp, date, "select" FROM matrix WHERE date = ? ORDER BY timestamp ASC, id ASC',
        [recordName]
      )
      if (options.parseData === false) return rows
      return rows.map((row) => ({
        ...row,
        data: parseFrameData(row.data),
        select: parseFrameData(row.select),
      }))
    },
    async getRecordMeta(recordName) {
      return dbGet(
        db,
        'SELECT date, COUNT(*) AS frame_count, MIN(timestamp) AS start_time, MAX(timestamp) AS end_time FROM matrix WHERE date = ? GROUP BY date',
        [recordName]
      )
    },
    async deleteRecord(recordName) {
      return dbRun(db, 'DELETE FROM matrix WHERE date = ?', [recordName])
    },
    async clear() {
      return dbRun(db, 'DELETE FROM matrix')
    },
    close() {
      return closeDb(db)
    },
  }
}

module.exports = {
  createHistoryStore,
  serializeFrameData,
  parseFrameData,
}
