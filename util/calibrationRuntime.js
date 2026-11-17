'use strict'

const fs = require('fs')
const path = require('path')
const { createHash } = require('crypto')

const CALIBRATION_FILE_PREFIX = 'seatBackrestPressure'
const DEFAULT_CALIBRATION_FILE = 'seatBackrestPressure_v2.12.0.js'
const DEFAULT_CALIBRATION_PROFILE = 'seatBackrestPressure_v2.12.0'
const CALIBRATION_CONTRACT = 'seat-backrest-force-area-v1'
const REQUIRED_FUNCTIONS = [
  'createSensorSession', 'calculateSensorSequence', 'calculateSensorFrame',
  'calculateMatrixPressureMap', 'calculatePressureMetricsFromMatrix',
]
const runtimes = new Map()

function getCalibrationDirectory() {
  if (process.env.PRESSURE_FORMULA_DIR) return path.resolve(process.env.PRESSURE_FORMULA_DIR)
  const packaged = process.env.isPackaged === 'true'
    || ['1', 'true'].includes(process.env.IS_PACKAGED)
    || /\.asar$/i.test(process.env.appPath || '')
  if (packaged) {
    const resources = process.env.RESOURCES_PATH || process.resourcesPath
      || path.dirname(process.env.appPath || path.resolve(__dirname, '..'))
    return path.join(resources, 'calibration')
  }
  return path.resolve(__dirname, '..', 'calibration')
}

function validateCalibrationApi(api, filePath) {
  const fail = (detail) => { throw new TypeError(`标定文件接口不兼容 (calibration contract): ${detail}: ${filePath}`) }
  if (!api || typeof api.VERSION !== 'string' || !api.VERSION.trim()) fail('VERSION required')
  for (const name of REQUIRED_FUNCTIONS) {
    if (typeof api[name] !== 'function') fail(`${name} required`)
  }
  for (const [type, rows, cols] of [['endi-23x23', 23, 23], ['new-backrest-32x25', 32, 25]]) {
    const definition = api.SENSOR_DEFINITIONS?.[type]
    if ((definition?.physicalRows ?? definition?.rows) !== rows
      || (definition?.physicalCols ?? definition?.cols) !== cols) fail(`${type} geometry required`)
  }
  return api
}

function findCalibrationFile() {
  const directory = getCalibrationDirectory()
  let files
  try {
    files = fs.readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && /^seatBackrestPressure.*\.js$/i.test(entry.name))
      .map((entry) => entry.name)
  } catch (cause) {
    throw new Error(`找不到标定文件夹 (calibration directory not found): ${directory}`, { cause })
  }
  if (files.length === 0) throw new Error(`找不到标定文件 (calibration file not found): ${directory}/${CALIBRATION_FILE_PREFIX}*.js`)
  if (files.length !== 1) {
    throw new Error(`标定文件夹中存在多个标定文件，请仅保留一个 (multiple calibration files): ${directory}: ${files.sort().join(', ')}`)
  }
  return path.join(directory, files[0])
}

// The file lives outside app.asar. Its checksum identifies results and sessions;
// it is deliberately not pinned so future compatible calibrations can replace it.
function getCalibrationRuntime(options = {}) {
  const filePath = path.resolve(options.sourcePath || process.env.PRESSURE_FORMULA_PATH || findCalibrationFile())
  let stat
  try { stat = fs.statSync(filePath) } catch (cause) {
    throw new Error(`找不到标定文件 (calibration file not found): ${filePath}`, { cause })
  }
  if (!stat.isFile()) throw new TypeError(`标定文件不是文件: ${filePath}`)
  const stamp = `${stat.mtimeMs}:${stat.ctimeMs}:${stat.size}:${stat.ino}`
  const previous = runtimes.get(filePath)
  if (previous?.stamp === stamp) return previous.runtime
  const checksum = createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
  if (previous?.runtime.checksum === checksum) {
    previous.stamp = stamp
    return previous.runtime
  }
  let api
  try {
    const resolved = require.resolve(filePath)
    delete require.cache[resolved]
    api = validateCalibrationApi(require(resolved), filePath)
  } catch (cause) {
    throw new Error(`无法加载标定文件 (calibration interface): ${filePath}: ${cause.message}`, { cause })
  }
  const version = api.VERSION.trim()
  const runtime = Object.freeze({
    api, version, checksum, identity: `${version}:${checksum}`,
    contract: CALIBRATION_CONTRACT, filePath,
    formulaFile: path.basename(filePath), formulaProfile: `seatBackrestPressure_v${version}`,
  })
  runtimes.set(filePath, { stamp, runtime })
  return runtime
}

module.exports = {
  DEFAULT_CALIBRATION_FILE, DEFAULT_CALIBRATION_PROFILE, CALIBRATION_FILE_PREFIX, CALIBRATION_CONTRACT,
  getCalibrationDirectory, getCalibrationRuntime, validateCalibrationApi,
}
