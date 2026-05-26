const sqlite3 = require("sqlite3").verbose();
const csv = require("csv-parser");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const XLSX = require("xlsx");
const fs = require('fs');
const os = require('os');
const path = require('path');
const { timeStampTo_Date } = require("./time");
const constantObj = require("./config");
const { backYToX, sitYToX } = require("./line");

// ─── 传感器点位配置 ──────────────────────────────────────
const pointConfig = {
  'endi-back': { pointWidthDistance: 13, pointHeightDistance: 10, width: 50, height: 64 },
  'endi-sit': { pointWidthDistance: 10, pointHeightDistance: 10, width: 46, height: 46 },
  'carY-back': { pointWidthDistance: 10, pointHeightDistance: 19, width: 32, height: 32 },
  'carY-sit': { pointWidthDistance: 15, pointHeightDistance: 15, width: 32, height: 32 },
  'car-back': { pointWidthDistance: 10, pointHeightDistance: 10, width: 32, height: 32 },
  'car-sit': { pointWidthDistance: 10, pointHeightDistance: 10, width: 32, height: 32 },
};

const CSV_IMPORT_INVALID_MESSAGE = '数据有误'
const CSV_FORMAT_VERSION = '2.0'
const SOFTWARE_VERSION = 'endi1.0.1'
const PRESSURE_UNIT = 'software_unit'
const validImportMatrixLengths = new Set([
  ...Object.values(pointConfig).map((config) => config.width * config.height),
  4096,
])

/**
 * 将一维数组索引转换为矩阵中的二维点位置坐标
 * @param {number} index - 一维数组索引
 * @param {string} key - 传感器 key
 * @param {object} [selectInfo] - 框选区域信息 { xStart, yStart, selectWidth }
 * @returns {string} 二维点位置坐标字符串，如 "(2, 3)" 表示第2行第3列（从0开始）
 */
function indexToCoord(index, key, selectInfo) {
  if (index === '' || index === undefined || index === null || index < 0) return ''
  const config = pointConfig[key]
  if (!config) return String(index)
  let col, row
  if (selectInfo) {
    // 框选区域：索引是在子数组中的位置，需要加上偏移量
    const { xStart, yStart, selectWidth } = selectInfo
    col = (index % selectWidth) + xStart
    row = Math.floor(index / selectWidth) + yStart
  } else {
    // 完整矩阵
    col = index % config.width
    row = Math.floor(index / config.width)
  }
  return `(${row}, ${col})`
}

// ─── 工具函数 ────────────────────────────────────────────

/**
 * 计算数组的统计指标（压力、面积、最大值、最小值、平均值）
 */
function colArrData(arr) {
  if (!arr.length) {
    return { press: 0, area: 0, max: 0, min: 0, aver: 0, maxIndex: '' }
  }
  const press = arr.reduce((a, b) => a + b, 0)
  const area = arr.filter((a) => a > 0).length
  const max = Math.max(...arr)
  const maxIndex = arr.indexOf(max)
  const positiveArr = arr.filter((a) => a > 0)
  const min = positiveArr.length ? Math.min(...positiveArr) : 0
  const aver = area > 0 ? Number((press / area).toFixed(1)) : 0
  return { press, area, max, min, aver, maxIndex }
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

function buildExportRecordName(param) {
  let value = String(param ?? '').trim()
  if (isAllDigits(value)) {
    value = timeStampTo_Date(Number(value))
  }
  return sanitizeFileNameSegment(value)
}

function buildExportFileStem(param, aliasFromDb) {
  const recordName = buildExportRecordName(param)
  const aliasName = aliasFromDb ? sanitizeFileNameSegment(aliasFromDb) : ''
  if (aliasName && aliasName !== recordName) {
    return `${aliasName}_${recordName}`
  }
  return recordName
}

function buildCsvBaseName(file, key) {
  const keyText = String(key ?? '').trim()
  const normalizedFile = sanitizeFileNameSegment(file || 'export')
  const segments = keyText.split('-').filter(Boolean)
  const part = segments[segments.length - 1]

  if (part === 'back' || part === 'sit') {
    const systemPrefix = segments.length > 1 ? segments.slice(0, -1).join('-') : normalizedFile
    return sanitizeFileNameSegment(`${systemPrefix}-${part}`)
  }

  if (keyText) {
    return sanitizeFileNameSegment(keyText)
  }

  return normalizedFile
}

function sortExportKeys(keys) {
  const getRank = (key) => {
    if (/-back$/.test(key) || key === 'back') return 0
    if (/-sit$/.test(key) || key === 'sit') return 1
    return 2
  }

  return [...keys].sort((a, b) => {
    const rankDiff = getRank(a) - getRank(b)
    if (rankDiff !== 0) return rankDiff
    return String(a).localeCompare(String(b))
  })
}

function inferExportMatrixSize(key, data, item = {}) {
  if (item.matrixMeta?.width && item.matrixMeta?.height) {
    return { width: item.matrixMeta.width, height: item.matrixMeta.height }
  }
  if (pointConfig[key]) {
    return { width: pointConfig[key].width, height: pointConfig[key].height }
  }

  const length = Array.isArray(data) ? data.length : 0
  const side = Math.sqrt(length)
  if (Number.isInteger(side) && side > 0) {
    return { width: side, height: side }
  }

  return { width: length, height: 1 }
}

function normalizeExportDirection(direction) {
  const rotateDegree = ((Math.round(Number(direction?.rotateDegree ?? direction?.rotate_degree) / 90) * 90) % 360 + 360) % 360 || 0
  const normalized = {
    left: direction?.left !== false,
    up: direction?.up !== false,
    rotateDegree,
    rotate_degree: rotateDegree,
  }
  if (rotateDegree) normalized.data_direction = `rotate${rotateDegree}`
  else if (!normalized.left && !normalized.up) normalized.data_direction = 'both'
  else if (!normalized.left) normalized.data_direction = 'horizontal'
  else if (!normalized.up) normalized.data_direction = 'vertical'
  else normalized.data_direction = 'none'
  return normalized
}

function normalizeExportZeroState(zeroState) {
  return {
    zero_enabled: Boolean(zeroState?.zero_enabled ?? zeroState?.enabled),
    zero_time: zeroState?.zero_time || zeroState?.zeroTime || '',
    has_baseline: Boolean(zeroState?.has_baseline),
  }
}

function getDeviceMacFromItem(item = {}) {
  const port = item.rawFrame?.port
  if (port && item.macInfo?.[port]?.uniqueId) return item.macInfo[port].uniqueId
  return item.deviceMac || item.device_mac || item.uniqueId || ''
}

function getPressureConversion(key) {
  if (key === 'carY-back' || key === 'carY-sit') {
    return {
      pressure_conversion: 'carY_100_div_3',
      pressure_conversion_desc: 'carY 数据按 100/3 规则换算后用于展示、统计、采集和导出',
    }
  }
  return {
    pressure_conversion: 'none',
    pressure_conversion_desc: '',
  }
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

async function ensureSelectionTemplatesTable(db) {
  await dbRun(
    db,
    `CREATE TABLE IF NOT EXISTS selection_templates (
      template_id TEXT PRIMARY KEY,
      template_name TEXT NOT NULL,
      device_type TEXT,
      display_type TEXT,
      matrix_width INTEGER,
      matrix_height INTEGER,
      template_json TEXT NOT NULL,
      created_at INTEGER,
      updated_at INTEGER
    )`
  )
  await dbRun(db, 'CREATE INDEX IF NOT EXISTS idx_selection_templates_updated_at ON selection_templates(updated_at DESC)')
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
  ensureSelectionTemplatesTable(db);
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
  await ensureSelectionTemplatesTable(db)
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

// ─── [PERF-PLAYBACK-OPT] 开始 ──────────────────────────────────
// 长时录制（如 30 分钟 5 万+ 帧）回放卡死优化。如需回滚此优化：
//   直接还原本函数到 git 历史中的版本（删除 PERF-PLAYBACK-OPT 标记区段，
//   恢复原 dbGetData 与 /getDbHistory response 中的 rows 字段即可）。
const PLAYBACK_CHART_TARGET_POINTS = 500

/**
 * 获取历史数据并计算压力/面积统计
 * 核心优化：每行只解析一次 JSON，避免重复 JSON.parse
 * [PERF-PLAYBACK-OPT] pressArr/areaArr 在长录制下按 bucket 降采样到约 500 点，
 * 防止前端 echarts 一次性绘制几万点导致卡死。回放本身仍按原始帧逐帧推送，不丢精度。
 */
async function dbGetData({ db, params }) {
  const rows = await dbAll(db, "SELECT * FROM matrix WHERE date=?", params)

  if (!rows.length) {
    return { length: 0, pressArr: {}, areaArr: {}, rows: [] }
  }

  const length = rows.length
  // 只解析第一行获取 key 列表
  const firstData = JSON.parse(rows[0].data)
  const keyArr = Object.keys(firstData).filter(k => k && k !== 'null' && k !== 'undefined')

  // [PERF-PLAYBACK-OPT] bucket 大小：当帧数 ≤ 500 时不降采样（bucket=1）；否则按比例聚合
  const bucketSize = Math.max(1, Math.ceil(length / PLAYBACK_CHART_TARGET_POINTS))

  const pressValue = {}
  const areaValue = {}
  // bucket 累加器
  const pressBucket = {}
  const areaBucket = {}
  const bucketCount = {}
  keyArr.forEach((key) => {
    pressValue[key] = []
    areaValue[key] = []
    pressBucket[key] = 0
    areaBucket[key] = 0
    bucketCount[key] = 0
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
      const area = arr.filter((a) => a > 0).length

      // [PERF-PLAYBACK-OPT] 累加到当前 bucket
      pressBucket[key] += normalizedPress
      areaBucket[key] += area
      bucketCount[key]++

      // bucket 满了，写出平均值
      if (bucketCount[key] >= bucketSize) {
        pressValue[key].push(pressBucket[key] / bucketCount[key])
        areaValue[key].push(areaBucket[key] / bucketCount[key])
        pressBucket[key] = 0
        areaBucket[key] = 0
        bucketCount[key] = 0
      }
    }
  }

  // [PERF-PLAYBACK-OPT] flush 剩余不满一个 bucket 的尾部
  for (const key of keyArr) {
    if (bucketCount[key] > 0) {
      pressValue[key].push(pressBucket[key] / bucketCount[key])
      areaValue[key].push(areaBucket[key] / bucketCount[key])
    }
  }

  return { length, pressArr: pressValue, areaArr: areaValue, rows }
}
// ─── [PERF-PLAYBACK-OPT] 结束 ──────────────────────────────────

function getExportKeyLabel(key) {
  const text = String(key || '').toLowerCase()
  if (text === 'back' || text.endsWith('-back')) return '靠背'
  if (text === 'sit' || text.endsWith('-sit')) return '坐垫'
  return String(key || '数据')
}

function getExportKeyFieldId(key, field) {
  return `${key}_${field}`
}

function buildSingleKeyExportHeaders(key) {
  const label = getExportKeyLabel(key)
  return [
    { id: getExportKeyFieldId(key, 'max_pressure'), title: `${label}最大压强(kPa)` },
    { id: getExportKeyFieldId(key, 'max_pressure_coord'), title: `${label}最大压强坐标` },
    { id: getExportKeyFieldId(key, 'avg_pressure'), title: `${label}平均压强(kPa)` },
    { id: getExportKeyFieldId(key, 'contact_area'), title: `${label}受力面积(cm²)` },
    { id: getExportKeyFieldId(key, 'real_data'), title: `${label}数据` },
    { id: getExportKeyFieldId(key, 'point_count'), title: `${label}点数` },
    { id: getExportKeyFieldId(key, 'total_pressure_n'), title: `${label}总压力(N)` },
  ]
}

function buildExportHeadersForKeys(keys) {
  const headers = [
    { id: 'timestamp', title: '时间戳' },
    { id: 'device_mac', title: '设备MAC' },
  ]
  sortExportKeys(keys).forEach((key) => {
    headers.push(...buildSingleKeyExportHeaders(key))
  })
  headers.push({ id: 'remark', title: '备注' })
  return headers
}

function normalizeExportOptions(options = {}) {
  const format = String(options.format || 'csv').toLowerCase() === 'xlsx' ? 'xlsx' : 'csv'
  const fields = Array.isArray(options.fields)
    ? options.fields.map((field) => String(field || '').trim()).filter(Boolean)
    : []
  return { format, fields }
}

function filterExportHeaders(headers, fields) {
  if (!Array.isArray(fields) || !fields.length) return headers
  const selected = new Set(fields)
  const filtered = headers.filter((header) => selected.has(header.id))
  return filtered.length ? filtered : headers
}

function recordsForHeaders(records, headers) {
  const ids = headers.map((header) => header.id)
  return records.map((record) => {
    const next = {}
    ids.forEach((id) => {
      const value = record[id] === undefined || record[id] === null ? '' : record[id]
      next[id] = id === 'timestamp' || id === 'device_mac' ? String(value) : value
    })
    return next
  })
}

async function writeXlsxFile(filePath, headers, records) {
  const rows = recordsForHeaders(records, headers)
  const sheetRows = [
    headers.map((header) => header.title),
    ...rows.map((row) => headers.map((header) => row[header.id])),
  ]
  const workbook = XLSX.utils.book_new()
  const worksheet = XLSX.utils.aoa_to_sheet(sheetRows)
  worksheet['!cols'] = headers.map((header) => ({ wch: Math.min(60, Math.max(10, String(header.title).length + 2)) }))
  XLSX.utils.book_append_sheet(workbook, worksheet, 'data')
  XLSX.writeFile(workbook, filePath, { bookType: 'xlsx' })
}

async function getExportFieldOptions({ db, params }) {
  const selected = Array.isArray(params) ? params.map((item) => String(item || '').trim()).filter(Boolean) : []
  const keySet = new Set()
  for (const param of selected) {
    const row = await dbGet(db, 'SELECT data FROM matrix WHERE date = ? ORDER BY timestamp ASC LIMIT 1', [param])
    let frame = {}
    try {
      frame = row?.data ? JSON.parse(row.data) : {}
    } catch {
      frame = {}
    }
    Object.keys(frame || {})
      .filter((key) => key && key !== 'null' && key !== 'undefined' && Array.isArray(frame[key]?.arr))
      .forEach((key) => keySet.add(key))
  }
  const headers = buildExportHeadersForKeys([...keySet])
  return {
    fields: headers.map((header) => ({ value: header.id, label: header.title })),
    defaultFields: headers.map((header) => header.id),
  }
}

// ─── CSV 导出 ────────────────────────────────────────────

/**
 * 单条记录导出为 CSV
 * 核心优化：每行只解析一次 JSON，消除内层循环中的重复 JSON.parse
 * 多矩阵系统（carY/endi）分别导出 back 和 sit 两个独立 CSV 文件
 */
function dbload(db, param, file, isPackaged, selectJson, customDownloadPath, dataPath, exportOptions = {}) {
  return new Promise((resolve, reject) => {
    dbAll(db, "SELECT * FROM matrix WHERE date=?", [param]).then(async (rows) => {
      if (!rows.length) {
        resolve({})
        return
      }

      const firstData = JSON.parse(rows[0].data)
      // 过滤掉无效 key（如 "null"、"undefined"）
      const keyArr = Object.keys(firstData).filter(k => k && k !== 'null' && k !== 'undefined' && Array.isArray(firstData[k]?.arr))

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

      // 根据前几帧 timestamp 自动推算帧率
      let detectedHz = 12 // 默认帧率
      if (rows.length >= 2) {
        const sampleCount = Math.min(rows.length, 10)
        const totalMs = rows[sampleCount - 1].timestamp - rows[0].timestamp
        if (totalMs > 0) {
          detectedHz = Math.round((sampleCount - 1) * 1000 / totalMs)
          if (detectedHz < 1) detectedHz = 1
        }
      }

      // 合并导出：同一历史帧只写一行，靠背/坐垫分别落到同一行的中文字段组。
      const csvDataRows = []
      const remarkRow = await getRemark({ db, params: [param] })
      const aliasFromDb = remarkRow?.alias
      const remarkText = remarkRow?.remark ?? ''

      for (let i = 0; i < rows.length; i++) {
        const rowData = JSON.parse(rows[i].data)
        const frameEntry = {
          timestamp: rows[i].timestamp,
          device_mac: '',
          remark: remarkText,
        }
        const frameDeviceMacSet = new Set()
        let hasFrameMatrixData = false

        for (let j = 0; j < keyArr.length; j++) {
          const key = keyArr[j]
          const item = rowData[key]
          if (!item) continue
          const data = item.arr
          if (!data) continue

          const rowEntry = {}
          rowEntry.time = timeStampTo_Date(rows[i].timestamp)
          rowEntry.sec = (i / detectedHz).toFixed(2)

          // 框选区域计算
          const selectArr = []
          let obj = null
          if (selectOverride && typeof selectOverride === 'object') {
            obj = selectOverride[key]
          }

          if (obj && typeof obj === 'object') {
            const { xStart, xEnd, yStart, yEnd, width, height } = obj
            for (let y = yStart; y < yEnd; y++) {
              for (let x = xStart; x < xEnd; x++) {
                selectArr.push(data[y * width + x])
              }
            }
          }

          const { press, area, max, min, aver, maxIndex } = colArrData(data)
          const { press: selectPress, area: selectArea, max: selectMax, min: selectMin, aver: selectAver, maxIndex: selectMaxIndex } = colArrData(selectArr)

          const pointInfo = pointConfig[key]
          const matrixSize = inferExportMatrixSize(key, data, item)
          const dataDirection = normalizeExportDirection(item.dataDirection)
          const zeroState = normalizeExportZeroState(item.zeroState)
          const pressureConversion = getPressureConversion(key)
          const pointArea = pointInfo ? pointInfo.pointWidthDistance * pointInfo.pointHeightDistance : null
          const pressureAreaValue = pointInfo ? (area * pointArea / 100) : area

          // 计算框选区域受力面积
          const selectAreaValue = pointInfo ? (selectArea * pointArea / 100) : selectArea

          rowEntry.csv_format_version = CSV_FORMAT_VERSION
          rowEntry.software_version = SOFTWARE_VERSION
          rowEntry.record_id = String(param)
          rowEntry.frame_index = i
          rowEntry.created_at = new Date().toISOString()
          rowEntry.device_mac = getDeviceMacFromItem(item)
          if (rowEntry.device_mac) frameDeviceMacSet.add(rowEntry.device_mac)
          rowEntry.device_type = key
          rowEntry.system_type = String(file || '')
          rowEntry.matrix_key = key
          rowEntry.matrix_width = matrixSize.width
          rowEntry.matrix_height = matrixSize.height
          rowEntry.sample_rate_hz = detectedHz
          rowEntry.hardware_sample_rate_hz = item.rawFrame?.hardware_sample_rate_hz || item.hardwareSampleRateHz || ''
          rowEntry.baud_rate = item.rawFrame?.baud_rate || item.baudRate || ''
          rowEntry.pressure_unit = PRESSURE_UNIT
          rowEntry.pressure_conversion = pressureConversion.pressure_conversion
          rowEntry.pressure_conversion_desc = pressureConversion.pressure_conversion_desc
          rowEntry.noise_removed = Boolean(item.noiseRemoved || item.noise_removed)
          rowEntry.data_direction_left = dataDirection.left
          rowEntry.data_direction_up = dataDirection.up
          rowEntry.rotate_degree = dataDirection.rotateDegree
          rowEntry.data_direction = dataDirection.data_direction
          rowEntry.zero_enabled = zeroState.zero_enabled
          rowEntry.zero_time = zeroState.zero_time
          rowEntry.zero_state = zeroState.has_baseline ? 'baseline_recorded' : (zeroState.zero_enabled ? 'enabled_no_baseline' : 'disabled')
          rowEntry.timestamp = rows[i].timestamp
          rowEntry.avg_pressure = aver
          rowEntry.max_pressure = max
          rowEntry.max_pressure_coord = indexToCoord(maxIndex, key)
          rowEntry.min_pressure_non_zero = min
          rowEntry.pressure_sum = press
          rowEntry.contact_area = pressureAreaValue
          rowEntry.active_sensor_count = area
          rowEntry.real_data = JSON.stringify(data)
          rowEntry[`${key}max`] = max
          rowEntry[`${key}maxCoord`] = indexToCoord(maxIndex, key)
          rowEntry[`${key}aver`] = aver
          rowEntry[`${key}pressureArea`] = pressureAreaValue
          rowEntry[`${key}realData`] = JSON.stringify(data)
          rowEntry[`${key}selectMax`] = selectMax
          const selectWidth = (obj && obj.xEnd && obj.xStart !== undefined) ? (obj.xEnd - obj.xStart) : 0
          const selectCoordInfo = (obj && selectWidth > 0) ? { xStart: obj.xStart, yStart: obj.yStart, selectWidth } : null
          rowEntry[`${key}selectMaxCoord`] = indexToCoord(selectMaxIndex, key, selectCoordInfo)
          rowEntry[`${key}selectAver`] = selectAver
          rowEntry[`${key}selectArea`] = selectAreaValue
          rowEntry[`${key}selectData`] = JSON.stringify(selectArr)
          rowEntry.select_data = JSON.stringify(selectArr)
          rowEntry.selection_1_id = obj ? (obj.region_id || 1) : ''
          rowEntry.selection_1_name = obj ? (obj.name || obj.regionName || '框选1') : ''
          rowEntry.selection_1_row_range = obj ? `${obj.yStart}-${obj.yEnd}` : ''
          rowEntry.selection_1_column_range = obj ? `${obj.xStart}-${obj.xEnd}` : ''
          rowEntry.selection_1_avg_pressure = selectAver
          rowEntry.selection_1_max_pressure = selectMax
          rowEntry.selection_1_max_pressure_coord = rowEntry[`${key}selectMaxCoord`]
          rowEntry.selection_1_min_pressure_non_zero = selectMin
          rowEntry.selection_1_pressure_sum = selectPress
          rowEntry.selection_1_contact_area = selectAreaValue
          rowEntry.selection_1_active_sensor_count = selectArea
          rowEntry.selection_1_data = JSON.stringify(selectArr)

          // endi 类型需要做单位转换
          if (key === 'endi-back') {
            rowEntry[`${key}max`] = backYToX(max)
            rowEntry[`${key}aver`] = backYToX(aver)
            rowEntry[`${key}selectMax`] = backYToX(selectMax)
            rowEntry[`${key}selectAver`] = backYToX(selectAver)
          }
          if (key === 'endi-sit') {
            rowEntry[`${key}max`] = sitYToX(max)
            rowEntry[`${key}aver`] = sitYToX(aver)
            rowEntry[`${key}selectMax`] = sitYToX(selectMax)
            rowEntry[`${key}selectAver`] = sitYToX(selectAver)
          }

          const hasSelectionData = Boolean(obj && selectArr.length)
          if (hasSelectionData) {
            rowEntry[`${key}max`] = rowEntry[`${key}selectMax`]
            rowEntry[`${key}maxCoord`] = rowEntry[`${key}selectMaxCoord`]
            rowEntry[`${key}aver`] = rowEntry[`${key}selectAver`]
            rowEntry[`${key}pressureArea`] = selectAreaValue
            rowEntry[`${key}realData`] = JSON.stringify(selectArr)
          }

          if (pointInfo) {
            const averValue = Number(rowEntry[`${key}aver`]) || 0
            const pointValue = hasSelectionData ? selectArea : area
            rowEntry[`${key}point`] = pointValue
            rowEntry[`${key}pressTotal`] = (averValue * pointArea * pointValue) / 1000
          }

          const activePointCount = pointInfo
            ? (rowEntry[`${key}point`] ?? (hasSelectionData ? selectArea : area))
            : (hasSelectionData ? selectArea : area)
          rowEntry.max_pressure = rowEntry[`${key}max`]
          rowEntry.max_pressure_coord = rowEntry[`${key}maxCoord`]
          rowEntry.avg_pressure = rowEntry[`${key}aver`]
          rowEntry.contact_area = rowEntry[`${key}pressureArea`]
          rowEntry.real_data = rowEntry[`${key}realData`]
          rowEntry.point_count = activePointCount
          rowEntry.total_pressure_n = pointInfo ? rowEntry[`${key}pressTotal`] : press
          rowEntry.remark = remarkText

          frameEntry[getExportKeyFieldId(key, 'max_pressure')] = rowEntry[`${key}max`]
          frameEntry[getExportKeyFieldId(key, 'max_pressure_coord')] = rowEntry[`${key}maxCoord`]
          frameEntry[getExportKeyFieldId(key, 'avg_pressure')] = rowEntry[`${key}aver`]
          frameEntry[getExportKeyFieldId(key, 'contact_area')] = rowEntry[`${key}pressureArea`]
          frameEntry[getExportKeyFieldId(key, 'real_data')] = rowEntry[`${key}realData`]
          frameEntry[getExportKeyFieldId(key, 'point_count')] = activePointCount
          frameEntry[getExportKeyFieldId(key, 'total_pressure_n')] = rowEntry.total_pressure_n
          hasFrameMatrixData = true
        }

        if (hasFrameMatrixData) {
          frameEntry.device_mac = [...frameDeviceMacSet].filter(Boolean).join(' / ')
          csvDataRows.push(frameEntry)
        }
      }

      const safeName = buildExportFileStem(param, aliasFromDb)

      let csvPath
      if (customDownloadPath) {
        csvPath = customDownloadPath
      } else if (isPackaged) {
        csvPath = dataPath || path.resolve('resources/data')
      } else {
        csvPath = __dirname + "/../data"
      }
      if (!fs.existsSync(csvPath)) {
        fs.mkdirSync(csvPath, { recursive: true })
      }

      // 单个 key 的 CSV 表头（保留 ld 分支的中文表头）
      function buildSingleKeyHeaders(key) {
        return buildSingleKeyExportHeaders(key)
      }

      function buildCombinedHeaders(keys) {
        return buildExportHeadersForKeys(keys)
      }

      // 写入单个 CSV 文件的辅助函数
      async function writeSingleCsv(filePath, headers, records) {
        const csvWriter = createCsvWriter({ path: filePath, header: headers })
        await csvWriter.writeRecords(records)
        // 确保 UTF-8 BOM
        const content = fs.readFileSync(filePath)
        const hasBom = content.length >= 3 && content[0] === 0xef && content[1] === 0xbb && content[2] === 0xbf
        if (!hasBom) {
          fs.writeFileSync(filePath, Buffer.concat([Buffer.from('\ufeff'), content]))
        }
        console.log('[DB] CSV export success:', filePath)
      }

      try {
        const csvBaseName = buildCsvBaseName(file)
        const normalizedExportOptions = normalizeExportOptions(exportOptions)
        const fileExt = normalizedExportOptions.format === 'xlsx' ? 'xlsx' : 'csv'
        const exportFilePath = path.join(csvPath, `${csvBaseName}_${safeName}.${fileExt}`)
        const headers = filterExportHeaders(buildCombinedHeaders(keyArr), normalizedExportOptions.fields)
        const records = [...csvDataRows]
        if (normalizedExportOptions.format === 'xlsx') {
          await writeXlsxFile(exportFilePath, headers, records)
        } else {
          await writeSingleCsv(exportFilePath, headers, records)
        }
        resolve({ [param]: 'success', filePath: exportFilePath, filePaths: [exportFilePath], format: normalizedExportOptions.format })
      } catch (err) {
        console.error('[DB] data export failed:', err)
        reject(err)
      }
    }).catch(reject)
  })
}

function dbloadSafe(db, param, file, isPackaged, selectJson, customDownloadPath, dataPath, exportOptions = {}) {
  const writablePath = resolveWritableDownloadDir({
    customDownloadPath,
    dataPath,
    isPackaged
  })

  return dbload(db, param, file, isPackaged, selectJson, writablePath, dataPath, exportOptions)
}

/**
 * 构建 CSV 表头（保留中文表头）
 */
function buildCsvHeaders(keyArr, file) {
  const handArr = []
  for (let j = 0; j < keyArr.length; j++) {
    const key = keyArr[j]
    if (j === 0) {
      handArr.push({ id: "sec", title: "sec(s)" })
      handArr.push({ id: "time", title: "time" })
    }

    const res = key.replace(/endi/g, "car")
    handArr.push(
      { id: `${key}max`, title: `${res} ` + '\u539f\u59cb\u6700\u5927\u538b\u5f3a(Kpa)' },
      { id: `${key}maxCoord`, title: `${res} ` + '\u539f\u59cb\u6700\u5927\u538b\u5f3a\u5750\u6807' },
      { id: `${key}aver`, title: `${res} ` + '\u539f\u59cb\u5e73\u5747\u538b\u5f3a(Kpa)' },
      { id: `${key}pressureArea`, title: `${res} ` + '\u539f\u59cb\u53d7\u529b\u9762\u79ef(cm\u00b2)' },
      { id: `${key}realData`, title: `${res} ` + '\u539f\u59cb\u6570\u636e' },
      { id: `${key}selectMax`, title: `${res} ` + '\u6846\u9009\u533a\u57df1\u6700\u5927\u538b\u5f3a' },
      { id: `${key}selectMaxCoord`, title: `${res} ` + '\u6846\u9009\u533a\u57df1\u6700\u5927\u538b\u5f3a\u5750\u6807' },
      { id: `${key}selectAver`, title: `${res} ` + '\u6846\u9009\u533a\u57df1\u5e73\u5747\u538b\u5f3a' },
      { id: `${key}selectArea`, title: `${res} ` + '\u6846\u9009\u533a\u57df1\u53d7\u529b\u9762\u79ef' },
      { id: `${key}selectData`, title: `${res} ` + '\u6846\u9009\u533a\u57df1\u539f\u59cb\u6570\u636e' },
    )
    if (key === 'endi-back' || key === 'endi-sit') {
      handArr.push(
        { id: `${key}point`, title: `${res} Points` },
        { id: `${key}pressTotal`, title: `${res} Pressure Total (N)` },
      )
    }
  }
  return handArr
}

/**
 * 批量导出 CSV
 */
async function dbLoadCsv({ db, params, file, isPackaged, selectJson, customDownloadPath, dataPath, exportOptions }) {
  const promises = params.map((param) => dbloadSafe(db, param, file, isPackaged, selectJson, customDownloadPath, dataPath, exportOptions))
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

// ─── 框选模板管理 ────────────────────────────────────────

function normalizeSelectionTemplateRow(row) {
  if (!row) return null
  try {
    const template = JSON.parse(row.template_json || '{}')
    return {
      ...template,
      templateId: template.templateId || row.template_id,
      templateName: template.templateName || row.template_name,
      deviceType: template.deviceType || row.device_type,
      displayType: template.displayType || row.display_type,
      matrixWidth: template.matrixWidth ?? row.matrix_width,
      matrixHeight: template.matrixHeight ?? row.matrix_height,
      createdAt: template.createdAt || row.created_at,
      updatedAt: template.updatedAt || row.updated_at,
    }
  } catch {
    return null
  }
}

async function listSelectionTemplates({ db }) {
  await ensureSelectionTemplatesTable(db)
  const rows = await dbAll(
    db,
    `SELECT template_id, template_name, device_type, display_type, matrix_width, matrix_height, template_json, created_at, updated_at
     FROM selection_templates
     ORDER BY updated_at DESC, created_at DESC`
  )
  return rows.map(normalizeSelectionTemplateRow).filter(Boolean)
}

async function replaceSelectionTemplates({ db, templates }) {
  await ensureSelectionTemplatesTable(db)
  const safeTemplates = Array.isArray(templates) ? templates.filter(Boolean) : []
  const now = Date.now()

  await dbRun(db, 'BEGIN TRANSACTION')
  try {
    await dbRun(db, 'DELETE FROM selection_templates')
    for (const template of safeTemplates) {
      const templateId = String(template.templateId || template.id || `selection-template-${now}`).trim()
      const templateName = String(template.templateName || template.name || '').trim()
      if (!templateId || !templateName) continue
      const createdAt = Number(template.createdAt) || now
      const updatedAt = Number(template.updatedAt) || createdAt
      const matrixWidth = Number(template.matrixWidth)
      const matrixHeight = Number(template.matrixHeight)
      const normalized = {
        ...template,
        templateId,
        templateName,
        createdAt,
        updatedAt,
      }
      await dbRun(
        db,
        `INSERT INTO selection_templates
          (template_id, template_name, device_type, display_type, matrix_width, matrix_height, template_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          templateId,
          templateName,
          normalized.deviceType || null,
          normalized.displayType || null,
          Number.isFinite(matrixWidth) ? matrixWidth : null,
          Number.isFinite(matrixHeight) ? matrixHeight : null,
          JSON.stringify(normalized),
          createdAt,
          updatedAt,
        ]
      )
    }
    await dbRun(db, 'COMMIT')
  } catch (err) {
    await dbRun(db, 'ROLLBACK').catch(() => {})
    throw err
  }

  return listSelectionTemplates({ db })
}

// ─── CSV 读取 ────────────────────────────────────────────

function normalizeCsvHeader(header) {
  return String(header ?? '').replace(/^\uFEFF/, '').trim()
}

function isSpreadsheetImportFile(file) {
  return /\.(xlsx|xls)$/i.test(String(file || ''))
}

function normalizeImportedRow(row = {}, file = '') {
  const normalized = {}
  Object.entries(row || {}).forEach(([key, value]) => {
    const header = normalizeCsvHeader(key)
    if (header) normalized[header] = value
  })
  return { ...normalized, file }
}

function readXlsxRows(file) {
  const workbook = XLSX.readFile(file, { cellDates: false })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) return []
  const worksheet = workbook.Sheets[sheetName]
  return XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: true })
    .map((row) => normalizeImportedRow(row, file))
}

function isEmptyCsvValue(value) {
  return value === undefined || value === null || String(value).trim() === ''
}

function isOriginalDataColumn(header) {
  const normalized = normalizeCsvHeader(header)
  if (!normalized) return false
  if (/selectData$/i.test(normalized) || normalized.includes('框选区域')) return false
  return /realData$/i.test(normalized) || normalized.endsWith(' 原始数据')
}

function getMetricPrefix(realDataHeader) {
  const normalized = normalizeCsvHeader(realDataHeader)
  if (/realData$/i.test(normalized)) {
    return normalized.replace(/realData$/i, '')
  }
  return normalized.replace(/\s*原始数据$/, '').trim()
}

function hasImportMetricHeaders(headers, realDataHeader) {
  const normalizedHeaders = headers.map(normalizeCsvHeader)
  const prefix = getMetricPrefix(realDataHeader)
  if (!prefix) return false

  if (/realData$/i.test(realDataHeader)) {
    return [
      `${prefix}max`,
      `${prefix}maxCoord`,
      `${prefix}aver`,
      `${prefix}pressureArea`,
    ].every((header) => normalizedHeaders.includes(header))
  }

  const matches = (tester) => normalizedHeaders.some((header) => header.startsWith(`${prefix} `) && tester(header))
  return [
    (header) => /原始最大压强\s*\(/.test(header),
    (header) => header.includes('原始最大压强坐标'),
    (header) => header.includes('原始平均压强'),
    (header) => header.includes('原始受力面积'),
  ].every(matches)
}

function isOriginalDataColumn(header) {
  const normalized = normalizeCsvHeader(header)
  if (!normalized) return false
  if (/select\s*Data$/i.test(normalized) || /selectData$/i.test(normalized) || normalized.includes('框选')) return false
  return normalized === '数据' || /数据$/.test(normalized) || /realData$/i.test(normalized) || /\sData$/i.test(normalized) || /原始数据$/.test(normalized)
}

function getMetricPrefix(realDataHeader) {
  const normalized = normalizeCsvHeader(realDataHeader)
  if (normalized === '数据') return ''
  if (/realData$/i.test(normalized)) {
    return normalized.replace(/realData$/i, '')
  }
  if (/\sData$/i.test(normalized)) {
    return normalized.replace(/\sData$/i, '').trim()
  }
  if (/数据$/.test(normalized)) {
    return normalized.replace(/\s*数据$/, '').trim()
  }
  return normalized.replace(/\s*原始数据$/, '').trim()
}

function hasImportMetricHeaders(headers, realDataHeader) {
  const normalizedHeaders = headers.map(normalizeCsvHeader)
  const prefix = getMetricPrefix(realDataHeader)
  if (!prefix) {
    return normalizedHeaders.includes('数据') && [
      '最大压强(kPa)',
      '最大压强坐标',
      '平均压强(kPa)',
      '受力面积(cm²)',
    ].every((header) => normalizedHeaders.includes(header))
  }

  if (/realData$/i.test(realDataHeader)) {
    return [
      `${prefix}max`,
      `${prefix}maxCoord`,
      `${prefix}aver`,
      `${prefix}pressureArea`,
    ].every((header) => normalizedHeaders.includes(header))
  }

  if (/\sData$/i.test(realDataHeader)) {
    return [
      (header) => header.startsWith(`${prefix} `) && /Max/i.test(header),
      (header) => header.startsWith(`${prefix} `) && /Aver/i.test(header),
      (header) => header.startsWith(`${prefix} `) && /Area/i.test(header),
    ].every((tester) => normalizedHeaders.some(tester))
  }

  const hasPrefix = (header) => header.startsWith(`${prefix} `) || header.startsWith(prefix)
  const matches = (tester) => normalizedHeaders.some((header) => hasPrefix(header) && tester(header))
  return [
    (header) => /最大|Max/i.test(header),
    (header) => /平均|Aver/i.test(header),
    (header) => /面积|Area/i.test(header),
  ].every(matches)
}
function parseMatrixCsvValue(value) {
  if (Array.isArray(value)) {
    return value
  }

  const text = String(value ?? '').trim()
  if (!text || !text.startsWith('[') || !text.endsWith(']')) {
    return null
  }

  try {
    const parsed = JSON.parse(text)
    return Array.isArray(parsed) ? parsed : null
  } catch (err) {
    return null
  }
}

function isNumericMatrixValue(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value)
  }
  if (typeof value === 'string' && value.trim() !== '') {
    return Number.isFinite(Number(value))
  }
  return false
}

function isValidMatrixCsvValue(value) {
  const matrix = parseMatrixCsvValue(value)
  if (!matrix || !validImportMatrixLengths.has(matrix.length)) {
    return false
  }
  return matrix.every(isNumericMatrixValue)
}

function analyzeImportHeaders(headers) {
  const normalizedHeaders = headers.map(normalizeCsvHeader).filter(Boolean)
  const secHeader = normalizedHeaders.find((header) => header === 'sec(s)' || header === 'sec')
  const timeHeader = normalizedHeaders.find((header) => header === 'time' || header === '时间' || header === 'timestamp' || header === '时间戳')
  const realDataColumns = normalizedHeaders
    .filter(isOriginalDataColumn)
    .filter((header) => hasImportMetricHeaders(normalizedHeaders, header))

  if (!timeHeader || !realDataColumns.length) {
    return { valid: false, reason: 'missing required headers' }
  }

  return { valid: true, secHeader, timeHeader, realDataColumns }
}

async function validateImportedCsv(file) {
  if (isSpreadsheetImportFile(file)) {
    try {
      const rows = readXlsxRows(file)
      const headers = Object.keys(rows[0] || {}).filter((header) => header !== 'file')
      const headerInfo = analyzeImportHeaders(headers)
      if (!headerInfo.valid) {
        return { valid: false, message: CSV_IMPORT_INVALID_MESSAGE, reason: headerInfo.reason || 'missing headers', rowCount: 0 }
      }

      let dataRowCount = 0
      for (const row of rows) {
        const filledDataColumns = headerInfo.realDataColumns.filter((header) => !isEmptyCsvValue(row[header]))
        if (!filledDataColumns.length) {
          const hasNonRemarkValue = Object.entries(row).some(([key, value]) => key !== 'remark' && key !== '备注' && key !== 'file' && !isEmptyCsvValue(value))
          if (hasNonRemarkValue) {
            return { valid: false, message: CSV_IMPORT_INVALID_MESSAGE, reason: 'missing matrix data', rowCount: dataRowCount }
          }
          continue
        }

        if (headerInfo.secHeader && (isEmptyCsvValue(row[headerInfo.secHeader]) || !Number.isFinite(Number(row[headerInfo.secHeader])))) {
          return { valid: false, message: CSV_IMPORT_INVALID_MESSAGE, reason: 'invalid sec value', rowCount: dataRowCount }
        }

        if (isEmptyCsvValue(row[headerInfo.timeHeader])) {
          return { valid: false, message: CSV_IMPORT_INVALID_MESSAGE, reason: 'invalid time value', rowCount: dataRowCount }
        }

        const allColumnsValid = filledDataColumns.every((header) => isValidMatrixCsvValue(row[header]))
        if (!allColumnsValid) {
          return { valid: false, message: CSV_IMPORT_INVALID_MESSAGE, reason: 'invalid matrix data', rowCount: dataRowCount }
        }
        dataRowCount += 1
      }

      if (!dataRowCount) {
        return { valid: false, message: CSV_IMPORT_INVALID_MESSAGE, reason: 'missing data rows', rowCount: 0 }
      }
      return { valid: true, message: 'success', reason: '', rowCount: dataRowCount }
    } catch (err) {
      return { valid: false, message: CSV_IMPORT_INVALID_MESSAGE, reason: err.message, rowCount: 0 }
    }
  }

  return new Promise((resolve) => {
    let settled = false
    let headerInfo = null
    let dataRowCount = 0

    const settle = (valid, reason = '') => {
      if (settled) return
      settled = true
      resolve({
        valid,
        message: valid ? 'success' : CSV_IMPORT_INVALID_MESSAGE,
        reason,
        rowCount: dataRowCount,
      })
    }

    const fail = (reason, stream) => {
      if (settled) return
      if (stream && !stream.destroyed) {
        stream.destroy()
      }
      settle(false, reason)
    }

    const input = fs.createReadStream(file)
    const parser = csv({ mapHeaders: ({ header }) => normalizeCsvHeader(header) })

    input.on('error', (err) => settle(false, err.message))
    parser.on('error', (err) => settle(false, err.message))

    parser.on('headers', (headers) => {
      headerInfo = analyzeImportHeaders(headers)
      if (!headerInfo.valid) {
        fail(headerInfo.reason, input)
      }
    })

    parser.on('data', (row) => {
      if (settled || !headerInfo?.valid) return

      const filledDataColumns = headerInfo.realDataColumns.filter((header) => !isEmptyCsvValue(row[header]))
      if (!filledDataColumns.length) {
        const hasNonRemarkValue = Object.entries(row).some(([key, value]) => key !== 'remark' && !isEmptyCsvValue(value))
        if (hasNonRemarkValue) {
          fail('missing matrix data', input)
        }
        return
      }

      if (headerInfo.secHeader && (isEmptyCsvValue(row[headerInfo.secHeader]) || !Number.isFinite(Number(row[headerInfo.secHeader])))) {
        fail('invalid sec value', input)
        return
      }

      if (isEmptyCsvValue(row[headerInfo.timeHeader])) {
        fail('invalid time value', input)
        return
      }

      const allColumnsValid = filledDataColumns.every((header) => isValidMatrixCsvValue(row[header]))
      if (!allColumnsValid) {
        fail('invalid matrix data', input)
        return
      }

      dataRowCount += 1
    })

    parser.on('end', () => {
      if (settled) return
      if (!headerInfo?.valid) {
        settle(false, headerInfo?.reason || 'missing headers')
        return
      }
      if (!dataRowCount) {
        settle(false, 'missing data rows')
        return
      }
      settle(true)
    })

    input.pipe(parser)
  })
}

async function getCsvData(file) {
  if (isSpreadsheetImportFile(file)) {
    return readXlsxRows(file)
  }

  const results = []
  return new Promise((resolve, reject) => {
    fs.createReadStream(file)
      .on("error", reject)
      .pipe(csv({ mapHeaders: ({ header }) => normalizeCsvHeader(header) }))
      .on("error", reject)
      .on("data", (data) => results.push({ ...data, file }))
      .on("end", () => resolve(results))
  })
}

// ─── 导出 ────────────────────────────────────────────────

function normalizeCsvMatrixKey(value) {
  const text = normalizeCsvHeader(value)
  if (!text) return ''
  if (text === '数据') return ''
  const normalized = text
    .replace(/\s*原始数据$/, '')
    .replace(/\s*数据$/, '')
    .replace(/realData$/i, '')
    .replace(/\sData$/i, '')
    .trim()
  const lower = normalized.toLowerCase()
  if (lower === 'back') return 'endi-back'
  if (lower === 'sit') return 'endi-sit'
  if (lower.endsWith('-back') || lower.endsWith('-sit')) return normalized
  if (normalized.includes('靠背')) return 'endi-back'
  if (normalized.includes('坐垫')) return 'endi-sit'
  return normalized
}

function getImportCell(row, names = []) {
  for (const name of names) {
    if (row[name] !== undefined) return row[name]
  }
  return ''
}

function inferImportMatrixKey(arr = []) {
  const length = Array.isArray(arr) ? arr.length : 0
  const exact = Object.entries(pointConfig).find(([, config]) => config.width * config.height === length)
  if (exact) return exact[0]
  if (length === 4096) return 'endi-sit'
  return 'endi-sit'
}

function isScientificTimestamp(value) {
  return /^[+-]?\d+(?:\.\d+)?e[+-]?\d+$/i.test(normalizeCsvHeader(value))
}

function resolveImportMatrixKey(preferredKey, arr, frameData = {}) {
  const inferredKey = inferImportMatrixKey(arr)
  const normalizedKey = normalizeCsvMatrixKey(preferredKey) || inferredKey
  const key = normalizedKey && pointConfig[normalizedKey] ? normalizedKey : inferredKey
  if (!frameData[key]) return key
  if (inferredKey && inferredKey !== key && !frameData[inferredKey]) return inferredKey
  return ''
}

function getCsvRowMatrixEntries(row) {
  const entries = []
  const fallbackKey = normalizeCsvMatrixKey(row.matrix_key || row.device_type || row['矩阵标识'] || row['设备类型'])

  if (!isEmptyCsvValue(row.real_data)) {
    const arr = parseMatrixCsvValue(row.real_data)
    if (arr && fallbackKey) {
      entries.push({ key: fallbackKey, arr })
    }
  }

  Object.keys(row || {}).forEach((header) => {
    if (!isOriginalDataColumn(header) || isEmptyCsvValue(row[header])) return
    const arr = parseMatrixCsvValue(row[header])
    if (!arr) return
    const key = fallbackKey || normalizeCsvMatrixKey(header) || inferImportMatrixKey(arr)
    if (!key || entries.some((entry) => entry.key === key)) return
    entries.push({ key, arr })
  })

  return entries
}

function getCsvFrameGroupKey(row, rowIndex) {
  const frameIndex = normalizeCsvHeader(row.frame_index)
  if (frameIndex) return `frame:${frameIndex}`
  const timestampValue = getImportCell(row, ['timestamp', '时间戳'])
  if (isScientificTimestamp(timestampValue)) return `row:${rowIndex}`
  const timestamp = normalizeCsvHeader(timestampValue)
  if (timestamp) return `timestamp:${timestamp}`
  return `row:${rowIndex}`
}

function getCsvFrameTimestamp(row, rowIndex) {
  const timestampValue = getImportCell(row, ['timestamp', '时间戳'])
  const rawTimestamp = Number(timestampValue)
  if (Number.isFinite(rawTimestamp)) return rawTimestamp

  const parsedTime = Date.parse(getImportCell(row, ['time', '时间']))
  if (Number.isFinite(parsedTime)) return parsedTime + rowIndex

  return Date.now() + rowIndex
}

function buildCsvPlaybackData(csvRows) {
  const groups = new Map()

  csvRows.forEach((row, rowIndex) => {
    const entries = getCsvRowMatrixEntries(row)
    if (!entries.length) return

    const groupKey = getCsvFrameGroupKey(row, rowIndex)
    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        frameIndex: Number(row.frame_index),
        timestamp: getCsvFrameTimestamp(row, rowIndex),
        data: {},
      })
    }

    const frame = groups.get(groupKey)
    entries.forEach(({ key, arr }) => {
      const numericArr = arr.map((value) => Number(value))
      const matrixKey = resolveImportMatrixKey(key, numericArr, frame.data)
      if (!matrixKey) return
      const matrixSize = inferExportMatrixSize(matrixKey, numericArr)
      frame.data[matrixKey] = {
        arr: numericArr,
        matrixMeta: {
          matrix_key: matrixKey,
          width: Number(row.matrix_width) || matrixSize.width,
          height: Number(row.matrix_height) || matrixSize.height,
          point_count: numericArr.length,
        },
        dataDirection: normalizeExportDirection({
          left: row.data_direction_left === '' ? undefined : row.data_direction_left !== 'false',
          up: row.data_direction_up === '' ? undefined : row.data_direction_up !== 'false',
          rotateDegree: row.rotate_degree,
          data_direction: row.data_direction,
        }),
        deviceMac: row.device_mac || row['设备MAC'] || '',
        deviceType: matrixKey,
        pressureUnit: row.pressure_unit || PRESSURE_UNIT,
      }
    })
  })

  const rows = Array.from(groups.values())
    .filter((frame) => Object.keys(frame.data).length)
    .sort((a, b) => {
      const aIndex = Number.isFinite(a.frameIndex) ? a.frameIndex : Number.MAX_SAFE_INTEGER
      const bIndex = Number.isFinite(b.frameIndex) ? b.frameIndex : Number.MAX_SAFE_INTEGER
      if (aIndex !== bIndex) return aIndex - bIndex
      return a.timestamp - b.timestamp
    })
    .map((frame) => ({
      data: JSON.stringify(frame.data),
      timestamp: frame.timestamp,
      date: 'csv-import',
      select: '{}',
    }))

  if (!rows.length) {
    return { length: 0, pressArr: {}, areaArr: {}, rows: [] }
  }

  const firstData = JSON.parse(rows[0].data)
  const keyArr = Object.keys(firstData).filter(Boolean)
  const bucketSize = Math.max(1, Math.ceil(rows.length / PLAYBACK_CHART_TARGET_POINTS))
  const pressArr = {}
  const areaArr = {}
  const pressBucket = {}
  const areaBucket = {}
  const bucketCount = {}

  keyArr.forEach((key) => {
    pressArr[key] = []
    areaArr[key] = []
    pressBucket[key] = 0
    areaBucket[key] = 0
    bucketCount[key] = 0
  })

  rows.forEach((row) => {
    const dataObj = JSON.parse(row.data)
    keyArr.forEach((key) => {
      const arr = dataObj[key]?.arr || []
      const press = arr.reduce((sum, value) => sum + Number(value || 0), 0)
      const normalizedPress = (key === 'carY-back' || key === 'carY-sit')
        ? press / (100 / 3)
        : press
      const area = arr.filter((value) => Number(value) > 0).length

      pressBucket[key] += normalizedPress
      areaBucket[key] += area
      bucketCount[key] += 1

      if (bucketCount[key] >= bucketSize) {
        pressArr[key].push(pressBucket[key] / bucketCount[key])
        areaArr[key].push(areaBucket[key] / bucketCount[key])
        pressBucket[key] = 0
        areaBucket[key] = 0
        bucketCount[key] = 0
      }
    })
  })

  keyArr.forEach((key) => {
    if (bucketCount[key] > 0) {
      pressArr[key].push(pressBucket[key] / bucketCount[key])
      areaArr[key].push(areaBucket[key] / bucketCount[key])
    }
  })

  return { length: rows.length, pressArr, areaArr, rows }
}

module.exports = {
  initDb,
  closeDb,
  dbLoadCsv,
  getExportFieldOptions,
  ensureWritableDir,
  deleteDbData,
  dbGetData,
  getCsvData,
  buildCsvPlaybackData,
  changeDbDataName,
  changeDbName,
  upsertRemark,
  getRemark,
  deleteRemarkByDate,
  listSelectionTemplates,
  replaceSelectionTemplates,
  resolveWritableDownloadDir,
  validateImportedCsv,
}

