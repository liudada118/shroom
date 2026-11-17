const fs = require('fs')
const path = require('path')
const { state } = require('../state')
const {
  DEFAULT_CALIBRATION_FILE, DEFAULT_CALIBRATION_PROFILE, getCalibrationRuntime,
} = require('../../util/calibrationRuntime')

const DEFAULT_PRESSURE_CONFIG = {
  pressureFormulaFile: DEFAULT_CALIBRATION_FILE,
  pressureFormulaProfile: DEFAULT_CALIBRATION_PROFILE,
}

function getPressureConfigPath() {
  if (process.env.PRESSURE_CONFIG_PATH) return process.env.PRESSURE_CONFIG_PATH
  return path.join(state._dbPath || path.join(__dirname, '..', '..', 'db'), 'pressure_config.json')
}

// Keep the existing API. Selection follows the single prefixed file in
// calibration/, so a saved filename never pins an old algorithm version.
function normalizePressureConfig(_config = {}) {
  const runtime = getCalibrationRuntime()
  return { pressureFormulaFile: runtime.formulaFile, pressureFormulaProfile: runtime.formulaProfile }
}

function loadPressureConfig() {
  const runtime = getCalibrationRuntime()
  const config = { pressureFormulaFile: runtime.formulaFile, pressureFormulaProfile: runtime.formulaProfile }
  const configPath = getPressureConfigPath()
  if (!fs.existsSync(configPath)) {
    try {
      fs.mkdirSync(path.dirname(configPath), { recursive: true })
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8')
    } catch (error) {
      console.warn('[PressureConfig] Config seed failed:', error.message)
    }
  }
  return {
    ...config, algorithmVersion: runtime.version,
    algorithmChecksum: runtime.checksum, algorithmPath: runtime.filePath,
  }
}

function savePressureConfig(config = {}) {
  const nextConfig = normalizePressureConfig(config)
  const configPath = getPressureConfigPath()
  fs.mkdirSync(path.dirname(configPath), { recursive: true })
  fs.writeFileSync(configPath, JSON.stringify(nextConfig, null, 2), 'utf8')
  return loadPressureConfig()
}

function listPressureFormulaFiles() {
  return [getCalibrationRuntime().formulaFile]
}

function loadPressureFormula() {
  return getCalibrationRuntime().api
}

module.exports = {
  DEFAULT_PRESSURE_CONFIG, getPressureConfigPath, normalizePressureConfig,
  loadPressureConfig, savePressureConfig, listPressureFormulaFiles, loadPressureFormula,
}
