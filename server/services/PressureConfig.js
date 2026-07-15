const fs = require('fs')
const path = require('path')
const { state } = require('../state')

const DEFAULT_PRESSURE_CONFIG = {
  backValueMultiplier: 1,
  pressureFormulaFile: 'pressureFormula_V2.8.1.js',
  pressureFormulaProfile: 'V2.8.1',
}

let configCache = null
let configMtimeMs = 0
let formulaCache = null

function getPressureConfigPath() {
  if (process.env.PRESSURE_CONFIG_PATH) return process.env.PRESSURE_CONFIG_PATH
  const basePath = state._dbPath || path.join(__dirname, '..', '..', 'db')
  return path.join(basePath, 'pressure_config.json')
}

function getFormulaDir() {
  return path.join(__dirname, '..', 'kpa')
}

function normalizeFormulaFile(fileName) {
  const baseName = path.basename(String(fileName || DEFAULT_PRESSURE_CONFIG.pressureFormulaFile))
  return /^pressureFormula.*\.js$/i.test(baseName)
    ? baseName
    : DEFAULT_PRESSURE_CONFIG.pressureFormulaFile
}

function normalizePressureConfig(config = {}) {
  const multiplier = Number(config.backValueMultiplier)
  const pressureFormulaFile = normalizeFormulaFile(config.pressureFormulaFile)
  const formulaName = path.basename(pressureFormulaFile, '.js').replace(/^pressureFormula_?/i, '')
  return {
    ...DEFAULT_PRESSURE_CONFIG,
    ...config,
    backValueMultiplier: Number.isFinite(multiplier) && multiplier >= 0 ? multiplier : DEFAULT_PRESSURE_CONFIG.backValueMultiplier,
    pressureFormulaFile,
    pressureFormulaProfile: String(config.pressureFormulaProfile || formulaName || DEFAULT_PRESSURE_CONFIG.pressureFormulaProfile),
  }
}

function writeDefaultConfigIfMissing(configPath) {
  if (fs.existsSync(configPath)) return
  fs.mkdirSync(path.dirname(configPath), { recursive: true })
  fs.writeFileSync(configPath, JSON.stringify(DEFAULT_PRESSURE_CONFIG, null, 2), 'utf-8')
}

function loadPressureConfig(options = {}) {
  const configPath = getPressureConfigPath()
  try {
    writeDefaultConfigIfMissing(configPath)
    const stat = fs.statSync(configPath)
    if (!options.force && configCache && stat.mtimeMs === configMtimeMs) {
      return configCache
    }
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    configCache = normalizePressureConfig(parsed)
    configMtimeMs = stat.mtimeMs
    return configCache
  } catch (err) {
    console.warn('[PressureConfig] Load failed:', err.message)
    configCache = normalizePressureConfig(configCache || DEFAULT_PRESSURE_CONFIG)
    return configCache
  }
}

function savePressureConfig(config = {}) {
  const configPath = getPressureConfigPath()
  const nextConfig = normalizePressureConfig({
    ...loadPressureConfig(),
    ...config,
  })
  const formulaPath = path.join(getFormulaDir(), nextConfig.pressureFormulaFile)
  if (!fs.existsSync(formulaPath)) {
    throw new Error(`Pressure formula file not found: ${nextConfig.pressureFormulaFile}`)
  }
  requirePressureFormula(formulaPath, nextConfig.pressureFormulaFile)
  fs.mkdirSync(path.dirname(configPath), { recursive: true })
  fs.writeFileSync(configPath, JSON.stringify(nextConfig, null, 2), 'utf-8')
  configCache = nextConfig
  configMtimeMs = fs.statSync(configPath).mtimeMs
  formulaCache = null
  return nextConfig
}

function listPressureFormulaFiles() {
  try {
    return fs.readdirSync(getFormulaDir())
      .filter((file) => /^pressureFormula.*\.js$/i.test(file))
      .sort()
  } catch {
    return []
  }
}

function getBackValueMultiplier() {
  return loadPressureConfig().backValueMultiplier
}

function requirePressureFormula(formulaPath, formulaFile) {
  const resolvedPath = require.resolve(formulaPath)
  delete require.cache[resolvedPath]
  const moduleValue = require(resolvedPath)
  const hasLegacyAverageFormula = typeof moduleValue.estimatePressure === 'function' && typeof moduleValue.estimateMaxPressure === 'function'
  const hasPointFormula = typeof moduleValue.master === 'function'
  if (!hasLegacyAverageFormula && !hasPointFormula) {
    throw new Error(`Pressure formula file must export master or estimatePressure/estimateMaxPressure: ${formulaFile}`)
  }
  return moduleValue
}

function loadPressureFormula() {
  const config = loadPressureConfig()
  const formulaPath = path.join(getFormulaDir(), config.pressureFormulaFile)
  if (!fs.existsSync(formulaPath)) {
    throw new Error(`Pressure formula file not found: ${config.pressureFormulaFile}`)
  }
  const stat = fs.statSync(formulaPath)
  if (formulaCache?.formulaPath === formulaPath && formulaCache?.mtimeMs === stat.mtimeMs) {
    return formulaCache.module
  }

  const moduleValue = requirePressureFormula(formulaPath, config.pressureFormulaFile)
  formulaCache = { formulaPath, mtimeMs: stat.mtimeMs, module: moduleValue }
  return moduleValue
}

module.exports = {
  DEFAULT_PRESSURE_CONFIG,
  getPressureConfigPath,
  normalizePressureConfig,
  loadPressureConfig,
  savePressureConfig,
  listPressureFormulaFiles,
  getBackValueMultiplier,
  loadPressureFormula,
}
