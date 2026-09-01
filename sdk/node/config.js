'use strict'

const fs = require('fs')
const path = require('path')

const AES_KEY_TEXT = 'JIANXINGZHEPSVMC'

const POINT_PRESSURE_CALIBRATION_FILE = 'point_pressure_calibration.js'
const LEGACY_POINT_PRESSURE_CALIBRATION_FILE = 'pressureFormula_calibration_v2746_seat_v2752_backrest.js'
const DEFAULT_PRESSURE_CONFIG = {
  pressureFormulaFile: POINT_PRESSURE_CALIBRATION_FILE,
  pressureFormulaProfile: 'point_pressure_calibration',
}

function stringToHex(str) {
  let result = ''
  for (let i = 0; i < str.length; i += 1) {
    result += str.charCodeAt(i).toString(16)
  }
  return result
}

function getCryptoJS() {
  try {
    return require('crypto-js')
  } catch (err) {
    throw new Error('crypto-js is required for encrypted config functions')
  }
}

function encryptString(src, keyText = AES_KEY_TEXT) {
  const CryptoJS = getCryptoJS()
  const key = CryptoJS.enc.Hex.parse(stringToHex(keyText))
  const encrypted = CryptoJS.AES.encrypt(String(src), key, {
    mode: CryptoJS.mode.ECB,
    padding: CryptoJS.pad.Pkcs7,
  })
  return encrypted.ciphertext.toString()
}

function decryptString(encrypted, keyText = AES_KEY_TEXT) {
  const CryptoJS = getCryptoJS()
  const key = CryptoJS.enc.Hex.parse(stringToHex(keyText))
  const decrypted = CryptoJS.AES.decrypt(CryptoJS.format.Hex.parse(String(encrypted)), key, {
    mode: CryptoJS.mode.ECB,
    padding: CryptoJS.pad.Pkcs7,
  })
  return CryptoJS.enc.Utf8.stringify(decrypted)
}

function extractFirstJsonObject(text) {
  const source = String(text || '').trim()
  if (!source) throw new Error('Empty JSON content')
  try {
    return JSON.parse(source)
  } catch {
    // Continue and defensively extract first full object.
  }

  let depth = 0
  let inString = false
  let escaped = false
  let start = -1
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i]
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') inString = true
    else if (char === '{') {
      if (depth === 0) start = i
      depth += 1
    } else if (char === '}') {
      depth -= 1
      if (depth === 0 && start >= 0) return JSON.parse(source.slice(start, i + 1))
    }
  }
  return JSON.parse(source)
}

function readEncryptedSystemConfig(configPath, options = {}) {
  const encrypted = fs.readFileSync(configPath, 'utf8').trim()
  return extractFirstJsonObject(decryptString(encrypted, options.keyText || AES_KEY_TEXT))
}

function writeEncryptedSystemConfig(configPath, config, options = {}) {
  fs.mkdirSync(path.dirname(configPath), { recursive: true })
  const payload = encryptString(JSON.stringify(config), options.keyText || AES_KEY_TEXT)
  fs.writeFileSync(configPath, payload, 'utf8')
  return config
}

function normalizeFormulaFile(fileName, fallback = DEFAULT_PRESSURE_CONFIG.pressureFormulaFile) {
  const baseName = path.basename(String(fileName || fallback))
  if (baseName.toLowerCase() === LEGACY_POINT_PRESSURE_CALIBRATION_FILE.toLowerCase()) {
    return POINT_PRESSURE_CALIBRATION_FILE
  }
  const isSupportedFormula = /^pressureFormula.*\.js$/i.test(baseName)
    || baseName.toLowerCase() === POINT_PRESSURE_CALIBRATION_FILE
  return isSupportedFormula ? baseName : fallback
}

function normalizePressureConfig(config = {}) {
  const pressureFormulaFile = normalizeFormulaFile(config.pressureFormulaFile)
  const formulaName = path.basename(pressureFormulaFile, '.js').replace(/^pressureFormula_?/i, '')
  return {
    pressureFormulaFile,
    pressureFormulaProfile: String(formulaName || DEFAULT_PRESSURE_CONFIG.pressureFormulaProfile),
  }
}

function loadPressureConfig(configPath, options = {}) {
  if (!fs.existsSync(configPath)) {
    const initial = normalizePressureConfig(options.defaultConfig || DEFAULT_PRESSURE_CONFIG)
    savePressureConfig(configPath, initial, { validateFormula: false })
    return initial
  }
  return normalizePressureConfig(JSON.parse(fs.readFileSync(configPath, 'utf8')))
}

function savePressureConfig(configPath, config = {}, options = {}) {
  const nextConfig = normalizePressureConfig(config)
  if (options.validateFormula && options.formulaDir) {
    loadPressureFormula(options.formulaDir, nextConfig.pressureFormulaFile)
  }
  fs.mkdirSync(path.dirname(configPath), { recursive: true })
  fs.writeFileSync(configPath, JSON.stringify(nextConfig, null, 2), 'utf8')
  return nextConfig
}

function listPressureFormulaFiles(formulaDir) {
  try {
    return fs.readdirSync(formulaDir)
      .filter((file) => (
        /^pressureFormula.*\.js$/i.test(file)
        || file.toLowerCase() === POINT_PRESSURE_CALIBRATION_FILE
      ))
      .sort()
  } catch {
    return []
  }
}

function loadPressureFormula(formulaDir, formulaFile) {
  const formulaPath = path.join(formulaDir, normalizeFormulaFile(formulaFile))
  const resolvedPath = require.resolve(formulaPath)
  delete require.cache[resolvedPath]
  const moduleValue = require(resolvedPath)
  const hasLegacyAverageFormula = typeof moduleValue.estimatePressure === 'function'
    && typeof moduleValue.estimateMaxPressure === 'function'
  const hasPointFormula = typeof moduleValue.master === 'function'
  const hasNativeCalibrationFormula = typeof moduleValue.calculateBasePressure === 'function'
    && typeof moduleValue.getCalibrationInput === 'function'
    && typeof moduleValue.calculateWeightPointPressures === 'function'
    && typeof moduleValue.calculatePressureMetrics === 'function'
    && typeof moduleValue.adcMatrixToPressureMatrix === 'function'
  if (!hasLegacyAverageFormula && !hasPointFormula && !hasNativeCalibrationFormula) {
    throw new Error(`Pressure formula file must export calculateBasePressure/getCalibrationInput/calculateWeightPointPressures/calculatePressureMetrics/adcMatrixToPressureMatrix, master, or estimatePressure/estimateMaxPressure: ${formulaFile}`)
  }
  return moduleValue
}

module.exports = {
  AES_KEY_TEXT,
  DEFAULT_PRESSURE_CONFIG,
  encryptString,
  decryptString,
  extractFirstJsonObject,
  readEncryptedSystemConfig,
  writeEncryptedSystemConfig,
  normalizeFormulaFile,
  normalizePressureConfig,
  loadPressureConfig,
  savePressureConfig,
  listPressureFormulaFiles,
  loadPressureFormula,
}
