const sqlite3 = require("sqlite3").verbose();
const csv = require("csv-parser");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const fs = require('fs');
const os = require('os');
const path = require('path');
const { timeStampTo_Date } = require("./time");
const constantObj = require("./config");
const { backYToX, sitYToX } = require("./line");

// ─── 传感器点位配置 ──────────────────────────────────────
const pointConfig = {
  'endi-back': { pointWidthDistance: 13, pointHeightDistance: 10 },
  'endi-sit': { pointWidthDistance: 10, pointHeightDistance: 10 },
};

// ─── 工具函数 ────────────────────────────────────────────

/**
 * 计算数组的统计指标（压力、面积、最大值、最小值、平均值）
 */
function colArrData(arr) {
  if (!arr.length) {
    return { press: 0, area: 0, max: 0, min: 0, aver: 0 }
  }
  const press = arr.reduce((a, b) => a + b, 0)
  const area = arr.filter((a) => a > 0).length
  const max = Math.max(...arr)
  const min = Math.min(...arr.filter((a) => a > 0))
  const aver = area > 0 ? (press / area).toFixed(1) : 0
  return { press, area, max, min, aver }
}

function isAllDigits(str) {
  return /^\d+$/.test(str) && str.includes('.') && str.length === 15;
}

function normalizeSelectJson(select) {
  if (select === undefined || select === null) return null;
  if (typeof select === 'string') return select;
  try { return JSON.stringify(select); } catch { return String(select); }
}

function uniquePaths(paths) {
  const seen = new Set()
  const result = []

  for (const value of paths) {
    if (!value) continue
    const normalized = path.resolve(String(value))
    if (seen.has(normalized)) continue
    seen.add(normalized)
    result.push(normalized)
  }

  return result
}

function ensureWritableDir(dirPath) {
  if (!dirPath) {
    throw new Error('Download directory is empty')
  }

  fs.mkdirSync(dirPath, { recursive: true })
  const probeFile = path.join(dirPath, `.write-test-${process.pid}-${Date.now()}.tmp`)
  fs.writeFileSync(probeFile, 'ok')
  fs.rmSync(probeFile, { force: true })
  return dirPath
}

function resolveWritableDownloadDir({ customDownloadPath, dataPath, isPackaged }) {
  const homeDir = os.homedir()
  const candidates = uniquePaths([
    customDownloadPath,
    path.join(homeDir, 'Desktop'),
    path.join(homeDir, 'Downloads'),
    path.join(homeDir, 'Documents'),
    isPackaged ? (dataPath || path.resolve('resources/data')) : path.join(__dirname, '..', 'data')
  ])

  let lastError = null
  for (const candidate of candidates) {
    try {
      return ensureWritableDir(candidate)
    } catch (err) {
      lastError = err
    }
  }

  throw new Error(`No writable download directory available${lastError ? `: ${lastError.message}` : ''}`)
}

function sanitizeFileNameSegment(value) {
  const normalized = String(value ?? '').trim()
  const sanitized = normalized
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()

  return sanitized || 'export'
}

// ─── Promise 包装的 DB 操作 ──────────────────────────────

function dbRun(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err)
      else resolve({ changes: this.changes, lastID: this.lastID })
    })
  })
}

function dbAll(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err)
      else resolve(rows)
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

// ─── 数据库初始化 ────────────────────────────────────────

async function ensureRemarksTable(db) {
  await dbRun(
    db,
    `CREATE TABLE IF NOT EXISTS remarks (
      date TEXT PRIMARY KEY,
      alias TEXT,
      remark TEXT,
      select_json TEXT,
      updated_at INTEGER
    )`
  )
}

function legacyGenDb(file, filePath) {
  let db
  if (fs.existsSync(file)) {
    db = new sqlite3.Database(file);
  } else {
    console.log(`[DB] Database not found, creating from template: ${file}`)
    const data = fs.readFileSync(`${filePath}/init.db`);
    fs.writeFileSync(file, data);
    db = new sqlite3.Database(file);
  }
  // 启用 WAL 模式：提升写入性能，支持读写并发
  db.run('PRAGMA journal_mode = WAL;')
  db.run('PRAGMA synchronous = NORMAL;')
  ensureRemarksTable(db);
  return db;
}

function openDb(file) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(file, (err) => {
      if (err) reject(err)
      else resolve(db)
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

function makeCorruptDbError(message) {
  const err = new Error(message)
  err.code = 'SQLITE_CORRUPT'
  return err
}

async function validateDb(db, file) {
  const rows = await dbAll(db, 'PRAGMA quick_check;')
  const issues = rows
    .map((row) => row.quick_check || row.integrity_check || Object.values(row)[0])
    .filter(Boolean)

  if (!issues.length || (issues.length === 1 && issues[0] === 'ok')) {
    return
  }

  throw makeCorruptDbError(`Database integrity check failed for ${path.basename(file)}: ${issues[0]}`)
}

async function configureDb(db) {
  await dbRun(db, 'PRAGMA journal_mode = WAL;')
  await dbRun(db, 'PRAGMA synchronous = NORMAL;')
  await ensureRemarksTable(db)
}

function removeSidecarFiles(file) {
  for (const suffix of ['-wal', '-shm']) {
    const sidecar = `${file}${suffix}`
    if (fs.existsSync(sidecar)) {
      fs.rmSync(sidecar, { force: true })
    }
  }
}

function createDbFromTemplate(file, filePath) {
  const templateFile = path.join(filePath, 'init.db')
  if (!fs.existsSync(templateFile)) {
    throw new Error(`Database template not found: ${templateFile}`)
  }
  fs.mkdirSync(path.dirname(file), { recursive: true })
  removeSidecarFiles(file)
  fs.copyFileSync(templateFile, file)
}

function backupCorruptDb(file, filePath) {
  const backupDir = path.join(filePath, 'corrupt-backups')
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const movedFiles = []

  fs.mkdirSync(backupDir, { recursive: true })

  for (const suffix of ['', '-wal', '-shm']) {
    const source = `${file}${suffix}`
    if (!fs.existsSync(source)) continue

    const target = path.join(backupDir, `${path.basename(file)}.${stamp}${suffix}`)
    fs.renameSync(source, target)
    movedFiles.push(target)
  }

  return { backupDir, movedFiles }
}

async function genDb(file, filePath) {
  if (!fs.existsSync(file)) {
    console.log(`[DB] Database not found, creating from template: ${file}`)
    createDbFromTemplate(file, filePath)
  }

  try {
    const db = await openDb(file)
    try {
      await validateDb(db, file)
      await configureDb(db)
      return { db, recovered: false }
    } catch (err) {
      await closeDb(db).catch(() => {})
      throw err
    }
  } catch (err) {
    if (err.code !== 'SQLITE_CORRUPT') {
      throw err
    }

    console.warn(`[DB] Corruption detected in ${file}, recreating from template`)
    const recovery = backupCorruptDb(file, filePath)
    createDbFromTemplate(file, filePath)

    const db = await openDb(file)
    try {
      await configureDb(db)
      return { db, recovered: true, ...recovery }
    } catch (recoveryErr) {
      await closeDb(db).catch(() => {})
      throw recoveryErr
    }
  }
}

/**
 * 初始化数据库
 * @param {string} fileStr - 当前系统名
 * @param {string} filePath - 数据库目录路径
 * @returns {{ db: sqlite3.Database, db1: sqlite3.Database|undefined }}
 */
const initDb = async (fileStr, filePath) => {
  console.log(`${filePath}/${fileStr}.db`)
  return genDb(`${filePath}/${fileStr}.db`, filePath)
}

// ─── 数据查询 ────────────────────────────────────────────

/**
 * 获取历史数据并计算压力/面积统计
 * 核心优化：每行只解析一次 JSON，避免重复 JSON.parse
 */
async function dbGetData({ db, params }) {
  const rows = await dbAll(db, "SELECT * FROM matrix WHERE date=?", params)

  if (!rows.length) {
    return { length: 0, pressArr: {}, areaArr: {}, rows: [] }
  }

  const length = rows.length
  // 只解析第一行获取 key 列表
  const firstData = JSON.parse(rows[0].data)
  const keyArr = Object.keys(firstData)

  const pressValue = {}
  const areaValue = {}
  keyArr.forEach((key) => {
    pressValue[key] = []
    areaValue[key] = []
  })

  for (let i = 0; i < rows.length; i++) {
    // 每行只解析一次 JSON
    const dataObj = JSON.parse(rows[i].data)

    for (const key of keyArr) {
      const item = dataObj[key]
      if (!item || !item.arr) continue
      const arr = item.arr
      const press = arr.reduce((a, b) => a + b, 0)
      const normalizedPress = (key === 'carY-back' || key === 'carY-sit')
        ? press / (100 / 3)
        : press
      pressValue[key].push(normalizedPress)
      areaValue[key].push(arr.filter((a) => a > 0).length)
    }
  }

  return { length, pressArr: pressValue, areaArr: areaValue, rows }
}

// ─── CSV 导出 ────────────────────────────────────────────

/**
 * 单条记录导出为 CSV
 * 核心优化：每行只解析一次 JSON，消除内层循环中的重复 JSON.parse
 */
function dbload(db, param, file, isPackaged, selectJson, customDownloadPath, dataPath) {
  return new Promise((resolve, reject) => {
    dbAll(db, "SELECT * FROM matrix WHERE date=?", [param]).then(async (rows) => {
      if (!rows.length) {
        resolve({})
        return
      }

      const csvWriteBackData = []
      const firstData = JSON.parse(rows[0].data)
      const keyArr = Object.keys(firstData)

      // 预处理 selectJson
      let selectOverride = selectJson
      if (typeof selectOverride === 'string') {
        try { selectOverride = JSON.parse(selectOverride) } catch { selectOverride = null }
      }

      // 如果没有外部传入的 selectJson，从 remarks 表读取该批次的框选信息
      if (!selectOverride) {
        try {
          const remarkRow = await dbGet(db, 'SELECT select_json FROM remarks WHERE date = ?', [param])
          if (remarkRow && remarkRow.select_json) {
            try { selectOverride = JSON.parse(remarkRow.select_json) } catch { selectOverride = null }
          }
        } catch (e) {
          // remarks 表可能不存在，忽略错误
        }
      }

      for (let i = 0; i < rows.length; i++) {
        const newData = {}
        // 每行只解析一次 JSON
        const rowData = JSON.parse(rows[i].data)
        const rowSelect = null // select 信息已通过 selectOverride 统一处理

        for (let j = 0; j < keyArr.length; j++) {
          const key = keyArr[j]
          const item = rowData[key]
          if (!item) continue
          const data = item.arr
          if (!data) continue

          if (j === 0) {
            newData.time = timeStampTo_Date(rows[i].timestamp)
          }

          // 框选区域计算
          const selectArr = []
          const selectObj = { width: 0, height: 0 }

          let obj = null
          if (selectOverride && typeof selectOverride === 'object') {
            obj = selectOverride[key]
          } else if (rowSelect) {
            obj = rowSelect[key]
          }

          if (obj && typeof obj === 'object') {
            const { xStart, xEnd, yStart, yEnd, width, height } = obj
            for (let y = yStart; y < yEnd; y++) {
              for (let x = xStart; x < xEnd; x++) {
                selectArr.push(data[y * width + x])
              }
            }
            selectObj.width = xEnd - xStart
            selectObj.height = yEnd - yStart
          }

          const { press, area, max, min, aver } = colArrData(data)
          const { max: selectMax, min: selectMin, aver: selectAver } = colArrData(selectArr)

          const pointInfo = pointConfig[key]
          const pointArea = pointInfo ? pointInfo.pointWidthDistance * pointInfo.pointHeightDistance : null
          const pointValue = pointInfo ? area : null
          const pressureAreaValue = pointInfo ? area * pointArea : area

          // 使用 timestamp 计算真实秒数，从0开始，整数秒
          const baseTimestamp = rows[0].timestamp || 0
          newData.sec = Math.floor((rows[i].timestamp - baseTimestamp) / 1000)
          newData[`${key}pressureArea`] = pressureAreaValue
          newData[`${key}pressure`] = press
          newData[`${key}max`] = max
          newData[`${key}min`] = min
          newData[`${key}aver`] = aver
          newData[`${key}selectMax`] = selectMax
          newData[`${key}selectMin`] = selectMin
          newData[`${key}selectAver`] = selectAver
          newData[`${key}realData`] = JSON.stringify(data)
          newData[`${key}selectData`] = JSON.stringify(selectArr)
          newData[`${key}selectW&H`] = JSON.stringify([selectObj.width, selectObj.height])

          // endi 类型需要做单位转换
          if (key === 'endi-back') {
            newData[`${key}max`] = backYToX(max)
            newData[`${key}min`] = backYToX(min)
            newData[`${key}aver`] = backYToX(aver)
            newData[`${key}selectMax`] = backYToX(selectMax)
            newData[`${key}selectMin`] = backYToX(selectMin)
            newData[`${key}selectAver`] = backYToX(selectAver)
          }
          if (key === 'endi-sit') {
            newData[`${key}max`] = sitYToX(max)
            newData[`${key}min`] = sitYToX(min)
            newData[`${key}aver`] = sitYToX(aver)
            newData[`${key}selectMax`] = sitYToX(selectMax)
            newData[`${key}selectMin`] = sitYToX(selectMin)
            newData[`${key}selectAver`] = sitYToX(selectAver)
          }

          if (pointInfo) {
            const averValue = Number(newData[`${key}aver`]) || 0
            newData[`${key}point`] = pointValue
            newData[`${key}pressTotal`] = (averValue * pointArea * pointValue) / 1000
          }
        }

        csvWriteBackData.push(newData)
      }

      // 获取备注信息
      const remarkRow = await getRemark({ db, params: [param] })
      const aliasFromDb = remarkRow?.alias

      let str = param
      if (aliasFromDb) {
        str = String(aliasFromDb)
      } else if (isAllDigits(str)) {
        str = timeStampTo_Date(Number(str))
      }
      const safeName = sanitizeFileNameSegment(str)

      // 构建 CSV 表头
      const handArr = buildCsvHeaders(keyArr, file)
      handArr.push({ id: "remark", title: "remark" })

      let csvPath
      if (customDownloadPath) {
        csvPath = customDownloadPath
      } else if (isPackaged) {
        csvPath = dataPath || path.resolve('resources/data')
      } else {
        csvPath = __dirname + "/../data"
      }
      // 确保目录存在
      if (!fs.existsSync(csvPath)) {
        fs.mkdirSync(csvPath, { recursive: true })
      }

      const csvName = file === 'endi' ? 'car' : (file === 'carY' ? 'carcushion' : file)
      const csvFilePath = path.join(csvPath, `${csvName}${safeName}.csv`)

      const csvWriter = createCsvWriter({ path: csvFilePath, header: handArr })

      const remarkText = remarkRow?.remark ?? ''
      if (remarkText) {
        csvWriteBackData.push({ remark: remarkText })
      }

      try {
        await csvWriter.writeRecords(csvWriteBackData)
        // 确保 UTF-8 BOM 以便 Excel 正确打开中文
        const content = fs.readFileSync(csvFilePath)
        const hasBom = content.length >= 3 && content[0] === 0xef && content[1] === 0xbb && content[2] === 0xbf
        if (!hasBom) {
          fs.writeFileSync(csvFilePath, Buffer.concat([Buffer.from('\ufeff'), content]))
        }
        console.log("[DB] CSV export success:", csvFilePath)
        resolve({ [param]: 'success', filePath: csvFilePath })
      } catch (err) {
        console.error("[DB] CSV export failed:", err)
        reject(err)
      }
    }).catch(reject)
  })
}

function dbloadSafe(db, param, file, isPackaged, selectJson, customDownloadPath, dataPath) {
  const writablePath = resolveWritableDownloadDir({
    customDownloadPath,
    dataPath,
    isPackaged
  })

  return dbload(db, param, file, isPackaged, selectJson, writablePath, dataPath)
}

/**
 * 构建 CSV 表头
 */
function buildCsvHeaders(keyArr, file) {
  const handArr = []
  for (let j = 0; j < keyArr.length; j++) {
    const key = keyArr[j]
    if (j === 0) {
      handArr.push({ id: "sec", title: "sec（s）" })
      handArr.push({ id: "time", title: "time" })
    }

    const res = key.replace(/endi/g, "car").replace(/carY/g, "carcushion")
    handArr.push(
      { id: `${key}max`, title: `${res} Max（Kpa）` },
      { id: `${key}min`, title: `${res} Min（Kpa）` },
      { id: `${key}aver`, title: `${res} Aver（Kpa）` },
      { id: `${key}pressureArea`, title: `${res} Area（cm²）` },
    )
    if (key === 'endi-back' || key === 'endi-sit') {
      handArr.push(
        { id: `${key}point`, title: `${res} Points` },
        { id: `${key}pressTotal`, title: `${res} Pressure Sum（N）` },
      )
    }
    handArr.push(
      { id: `${key}realData`, title: `${res} Data` },
      { id: `${key}selectData`, title: `${res}select Data` },
      { id: `${key}selectMax`, title: `${res}select Max（Kpa）` },
      { id: `${key}selectMin`, title: `${res}select Min（Kpa）` },
      { id: `${key}selectAver`, title: `${res}select Aver（Kpa）` },
      { id: `${key}selectW&H`, title: `${res}select W&H` },
    )
  }
  return handArr
}

/**
 * 批量导出 CSV
 */
async function dbLoadCsv({ db, params, file, isPackaged, selectJson, customDownloadPath, dataPath }) {
  const promises = params.map((param) => dbloadSafe(db, param, file, isPackaged, selectJson, customDownloadPath, dataPath))
  const results = await Promise.all(promises)
  return results
}

// ─── 数据删除 ────────────────────────────────────────────

async function deleteDbData({ db, params }) {
  const promises = params.map(async (param) => {
    await dbRun(db, 'DELETE FROM matrix WHERE date = ?', [param])
    await dbRun(db, 'DELETE FROM remarks WHERE date = ?', [param]).catch(() => {})
    return { [param]: 'success' }
  })
  return Promise.all(promises)
}

// ─── 数据重命名 ──────────────────────────────────────────

async function changeDbName({ db, params }) {
  await dbRun(db, 'UPDATE matrix SET "date" = ? WHERE "date" = ?', params)
  await dbRun(db, 'UPDATE remarks SET "date" = ? WHERE "date" = ?', params).catch(() => {})
  return { success: true }
}

async function changeDbDataName({ db, params }) {
  await dbRun(db, 'UPDATE matrix SET "date" = ? WHERE "date" = ?', params)
  await dbRun(db, 'UPDATE remarks SET "date" = ? WHERE "date" = ?', params).catch(() => {})
  return { success: true }
}

// ─── 备注管理 ────────────────────────────────────────────

async function upsertRemark({ db, params }) {
  const { date, alias, remark, select } = params || {}
  const selectJsonStr = normalizeSelectJson(select)
  const now = Date.now()
  const sql = `
    INSERT INTO remarks (date, alias, remark, select_json, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(date) DO UPDATE SET
      alias = COALESCE(excluded.alias, remarks.alias),
      remark = COALESCE(excluded.remark, remarks.remark),
      select_json = COALESCE(excluded.select_json, remarks.select_json),
      updated_at = excluded.updated_at
  `
  await dbRun(db, sql, [date, alias ?? null, remark ?? null, selectJsonStr, now])
  return { date, alias, remark, select: selectJsonStr, updated_at: now }
}

async function getRemark({ db, params }) {
  return dbGet(db, 'SELECT date, alias, remark, select_json as "select", updated_at FROM remarks WHERE date = ?', params)
}

async function deleteRemarkByDate({ db, params }) {
  await dbRun(db, 'DELETE FROM remarks WHERE date = ?', params)
  return { success: true }
}

// ─── CSV 读取 ────────────────────────────────────────────

async function getCsvData(file) {
  const results = []
  return new Promise((resolve) => {
    fs.createReadStream(file)
      .pipe(csv())
      .on("data", (data) => results.push({ ...data, file }))
      .on("end", () => resolve(results))
  })
}

// ─── 导出 ────────────────────────────────────────────────

module.exports = {
  initDb,
  closeDb,
  dbLoadCsv,
  ensureWritableDir,
  deleteDbData,
  dbGetData,
  getCsvData,
  changeDbDataName,
  changeDbName,
  upsertRemark,
  getRemark,
  deleteRemarkByDate,
  resolveWritableDownloadDir,
}
