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

// ─── CSV 导出 ────────────────────────────────────────────

/**
 * 单条记录导出为 CSV
 * 核心优化：每行只解析一次 JSON，消除内层循环中的重复 JSON.parse
 * 多矩阵系统（carY/endi）分别导出 back 和 sit 两个独立 CSV 文件
 */
function dbload(db, param, file, isPackaged, selectJson, customDownloadPath, dataPath) {
  return new Promise((resolve, reject) => {
    dbAll(db, "SELECT * FROM matrix WHERE date=?", [param]).then(async (rows) => {
      if (!rows.length) {
        resolve({})
        return
      }

      const firstData = JSON.parse(rows[0].data)
      // 过滤掉无效 key（如 "null"、"undefined"）
      const keyArr = Object.keys(firstData).filter(k => k && k !== 'null' && k !== 'undefined')

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

      // 合并导出：同一条记录内的 back/sit 行写入同一个 CSV，通过 matrix_key 区分来源
      const csvDataRows = []

      for (let i = 0; i < rows.length; i++) {
        const rowData = JSON.parse(rows[i].data)

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

          if (pointInfo) {
            const averValue = Number(rowEntry[`${key}aver`]) || 0
            const pointValue = area
            rowEntry[`${key}point`] = pointValue
            rowEntry[`${key}pressTotal`] = (averValue * pointArea * pointValue) / 1000
          }

          csvDataRows.push(rowEntry)
        }
      }

      // 获取备注信息
      const remarkRow = await getRemark({ db, params: [param] })
      const aliasFromDb = remarkRow?.alias

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

      const remarkText = remarkRow?.remark ?? ''

      // 单个 key 的 CSV 表头（保留 ld 分支的中文表头）
      function buildSingleKeyHeaders(key) {
        const res = key.replace(/endi/g, "car")
        const headers = [
          { id: 'csv_format_version', title: 'csv_format_version' },
          { id: 'software_version', title: 'software_version' },
          { id: 'record_id', title: 'record_id' },
          { id: 'frame_index', title: 'frame_index' },
          { id: 'created_at', title: 'created_at' },
          { id: 'device_mac', title: 'device_mac' },
          { id: 'device_type', title: 'device_type' },
          { id: 'system_type', title: 'system_type' },
          { id: 'matrix_key', title: 'matrix_key' },
          { id: 'matrix_width', title: 'matrix_width' },
          { id: 'matrix_height', title: 'matrix_height' },
          { id: 'sample_rate_hz', title: 'sample_rate_hz' },
          { id: 'hardware_sample_rate_hz', title: 'hardware_sample_rate_hz' },
          { id: 'baud_rate', title: 'baud_rate' },
          { id: 'pressure_unit', title: 'pressure_unit' },
          { id: 'pressure_conversion', title: 'pressure_conversion' },
          { id: 'pressure_conversion_desc', title: 'pressure_conversion_desc' },
          { id: 'noise_removed', title: 'noise_removed' },
          { id: 'data_direction_left', title: 'data_direction_left' },
          { id: 'data_direction_up', title: 'data_direction_up' },
          { id: 'rotate_degree', title: 'rotate_degree' },
          { id: 'data_direction', title: 'data_direction' },
          { id: 'zero_enabled', title: 'zero_enabled' },
          { id: 'zero_time', title: 'zero_time' },
          { id: 'zero_state', title: 'zero_state' },
          { id: 'timestamp', title: 'timestamp' },
          { id: 'avg_pressure', title: 'avg_pressure' },
          { id: 'max_pressure', title: 'max_pressure' },
          { id: 'max_pressure_coord', title: 'max_pressure_coord' },
          { id: 'min_pressure_non_zero', title: 'min_pressure_non_zero' },
          { id: 'pressure_sum', title: 'pressure_sum' },
          { id: 'contact_area', title: 'contact_area' },
          { id: 'active_sensor_count', title: 'active_sensor_count' },
          { id: 'real_data', title: 'real_data' },
          { id: 'select_data', title: 'select_data' },
          { id: 'selection_1_id', title: 'selection_1_id' },
          { id: 'selection_1_name', title: 'selection_1_name' },
          { id: 'selection_1_row_range', title: 'selection_1_row_range' },
          { id: 'selection_1_column_range', title: 'selection_1_column_range' },
          { id: 'selection_1_avg_pressure', title: 'selection_1_avg_pressure' },
          { id: 'selection_1_max_pressure', title: 'selection_1_max_pressure' },
          { id: 'selection_1_max_pressure_coord', title: 'selection_1_max_pressure_coord' },
          { id: 'selection_1_min_pressure_non_zero', title: 'selection_1_min_pressure_non_zero' },
          { id: 'selection_1_pressure_sum', title: 'selection_1_pressure_sum' },
          { id: 'selection_1_contact_area', title: 'selection_1_contact_area' },
          { id: 'selection_1_active_sensor_count', title: 'selection_1_active_sensor_count' },
          { id: 'selection_1_data', title: 'selection_1_data' },
          { id: 'sec', title: 'sec(s)' },
          { id: 'time', title: 'time' },
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
        ]
        if (key === 'endi-back' || key === 'endi-sit') {
          headers.push(
            { id: `${key}point`, title: `${res} Points` },
            { id: `${key}pressTotal`, title: `${res} Pressure Total (N)` },
          )
        }
        headers.push({ id: 'remark', title: 'remark' })
        return headers
      }

      function buildCombinedHeaders(keys) {
        const headers = []
        const seen = new Set()
        sortExportKeys(keys).forEach((key) => {
          buildSingleKeyHeaders(key).forEach((header) => {
            if (seen.has(header.id)) return
            seen.add(header.id)
            headers.push(header)
          })
        })
        return headers
      }

      // 写入单个 CSV 文件的辅助函数
      async function writeSingleCsv(filePath, headers, records) {
        const csvWriter = createCsvWriter({ path: filePath, header: headers })
        if (remarkText) {
          records.push({ remark: remarkText })
        }
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
        const csvFilePath = path.join(csvPath, `${csvBaseName}_${safeName}.csv`)
        const headers = buildCombinedHeaders(keyArr)
        await writeSingleCsv(csvFilePath, headers, [...csvDataRows])
        resolve({ [param]: 'success', filePath: csvFilePath, filePaths: [csvFilePath] })
      } catch (err) {
        console.error('[DB] CSV export failed:', err)
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

function normalizeCsvHeader(header) {
  return String(header ?? '').replace(/^\uFEFF/, '').trim()
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
  if (/select\s*Data$/i.test(normalized) || /selectData$/i.test(normalized)) return false
  return /realData$/i.test(normalized) || /\sData$/i.test(normalized) || /原始数据$/.test(normalized)
}

function getMetricPrefix(realDataHeader) {
  const normalized = normalizeCsvHeader(realDataHeader)
  if (/realData$/i.test(normalized)) {
    return normalized.replace(/realData$/i, '')
  }
  if (/\sData$/i.test(normalized)) {
    return normalized.replace(/\sData$/i, '').trim()
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

  if (/\sData$/i.test(realDataHeader)) {
    return [
      (header) => header.startsWith(`${prefix} `) && /Max/i.test(header),
      (header) => header.startsWith(`${prefix} `) && /Aver/i.test(header),
      (header) => header.startsWith(`${prefix} `) && /Area/i.test(header),
    ].every((tester) => normalizedHeaders.some(tester))
  }

  const matches = (tester) => normalizedHeaders.some((header) => header.startsWith(`${prefix} `) && tester(header))
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
  const timeHeader = normalizedHeaders.find((header) => header === 'time')
  const realDataColumns = normalizedHeaders
    .filter(isOriginalDataColumn)
    .filter((header) => hasImportMetricHeaders(normalizedHeaders, header))

  if (!timeHeader || !realDataColumns.length) {
    return { valid: false, reason: 'missing required headers' }
  }

  return { valid: true, secHeader, timeHeader, realDataColumns }
}

async function validateImportedCsv(file) {
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
  return text.replace(/\s*原始数据$/, '').replace(/realData$/i, '').replace(/\sData$/i, '').trim()
}

function getCsvRowMatrixEntries(row) {
  const entries = []
  const fallbackKey = normalizeCsvMatrixKey(row.matrix_key || row.device_type)

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
    const key = fallbackKey || normalizeCsvMatrixKey(header)
    if (!key || entries.some((entry) => entry.key === key)) return
    entries.push({ key, arr })
  })

  return entries
}

function getCsvFrameGroupKey(row, rowIndex) {
  const frameIndex = normalizeCsvHeader(row.frame_index)
  if (frameIndex) return `frame:${frameIndex}`
  const timestamp = normalizeCsvHeader(row.timestamp)
  if (timestamp) return `timestamp:${timestamp}`
  return `row:${rowIndex}`
}

function getCsvFrameTimestamp(row, rowIndex) {
  const rawTimestamp = Number(row.timestamp)
  if (Number.isFinite(rawTimestamp)) return rawTimestamp

  const parsedTime = Date.parse(row.time)
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
      const matrixSize = inferExportMatrixSize(key, numericArr)
      frame.data[key] = {
        arr: numericArr,
        matrixMeta: {
          matrix_key: key,
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
        deviceMac: row.device_mac || '',
        deviceType: key,
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
  resolveWritableDownloadDir,
  validateImportedCsv,
}

