const fs = require('fs')
const path = require('path')
const { state } = require('../state')

const DEFAULT_PRESSURE_CONFIG = {
  backValueMultiplier: 3,
  dummyPressureFormulaFile: 'dummyPressure_v2.10.3.js',
  pressureFormulaFile: 'pressureFormula_V2.7.38中英文logo.js',
  pressureFormulaProfile: 'V2.7.38中英文logo',
}

let configCache = null
let configMtimeMs = 0
let formulaCache = null
let dummyFormulaCache = null

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

function normalizeDummyFormulaFile(fileName) {
  const baseName = path.basename(String(fileName || DEFAULT_PRESSURE_CONFIG.dummyPressureFormulaFile))
  return /^dummyPressure.*\.js$/i.test(baseName)
    ? baseName
    : DEFAULT_PRESSURE_CONFIG.dummyPressureFormulaFile
}

function normalizePressureConfig(config = {}) {
  const multiplier = Number(config.backValueMultiplier)
  const pressureFormulaFile = normalizeFormulaFile(config.pressureFormulaFile)
  const dummyPressureFormulaFile = normalizeDummyFormulaFile(config.dummyPressureFormulaFile)
  const formulaName = path.basename(pressureFormulaFile, '.js').replace(/^pressureFormula_?/i, '')
  return {
    ...DEFAULT_PRESSURE_CONFIG,
    ...config,
    backValueMultiplier: Number.isFinite(multiplier) && multiplier >= 0 ? multiplier : DEFAULT_PRESSURE_CONFIG.backValueMultiplier,
    pressureFormulaFile,
    dummyPressureFormulaFile,
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
  const dummyFormulaPath = path.join(getFormulaDir(), nextConfig.dummyPressureFormulaFile)
  if (!fs.existsSync(dummyFormulaPath)) {
    throw new Error(`Dummy pressure formula file not found: ${nextConfig.dummyPressureFormulaFile}`)
  }
  requireDummyPressureFormula(dummyFormulaPath, nextConfig.dummyPressureFormulaFile)
  fs.mkdirSync(path.dirname(configPath), { recursive: true })
  fs.writeFileSync(configPath, JSON.stringify(nextConfig, null, 2), 'utf-8')
  configCache = nextConfig
  configMtimeMs = fs.statSync(configPath).mtimeMs
  formulaCache = null
  dummyFormulaCache = null
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
  if (typeof moduleValue.estimatePressure !== 'function' || typeof moduleValue.estimateMaxPressure !== 'function') {
    throw new Error(`Pressure formula file must export estimatePressure and estimateMaxPressure: ${formulaFile}`)
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

function requireDummyPressureFormula(formulaPath, formulaFile) {
  const resolvedPath = require.resolve(formulaPath)
  delete require.cache[resolvedPath]
  const moduleValue = require(resolvedPath)
  const requiredExports = [
    'calculateDummyValuesPressure',
    'calculateDummyMatrixPressure',
    'bodyAdcToKpaRaw',
    'legAdcToKpaRaw',
  ]
  if (requiredExports.some((name) => typeof moduleValue[name] !== 'function')) {
    throw new Error(`Dummy pressure formula file has invalid exports: ${formulaFile}`)
  }
  return moduleValue
}

function loadDummyPressureFormula() {
  const config = loadPressureConfig()
  const formulaPath = path.join(getFormulaDir(), config.dummyPressureFormulaFile)
  if (!fs.existsSync(formulaPath)) {
    throw new Error(`Dummy pressure formula file not found: ${config.dummyPressureFormulaFile}`)
  }
  const stat = fs.statSync(formulaPath)
  if (dummyFormulaCache?.formulaPath === formulaPath && dummyFormulaCache?.mtimeMs === stat.mtimeMs) {
    return dummyFormulaCache.module
  }

  const moduleValue = requireDummyPressureFormula(formulaPath, config.dummyPressureFormulaFile)
  dummyFormulaCache = { formulaPath, mtimeMs: stat.mtimeMs, module: moduleValue }
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
  loadDummyPressureFormula,
}
