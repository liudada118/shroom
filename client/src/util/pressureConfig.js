import axios from 'axios'
import { localAddress } from './constant'
import { setPressureFormulaProfile } from './pressureMetrics'

const DEFAULT_PRESSURE_CONFIG = {
  pressureFormulaFile: 'point_pressure_calibration.js',
  pressureFormulaProfile: 'point_pressure_calibration',
}

let pressureConfigCache = DEFAULT_PRESSURE_CONFIG

export function getPressureFormulaProfileFromFile(fileName) {
  const profile = String(fileName || '')
    .split(/[\\/]/)
    .pop()
    .replace(/^pressureFormula_?/i, '')
    .replace(/\.js$/i, '')
    .trim()
  return profile || DEFAULT_PRESSURE_CONFIG.pressureFormulaProfile
}

export function getPressureRuntimeConfig() {
  return pressureConfigCache
}

export async function loadPressureRuntimeConfig() {
  try {
    const res = await axios.get(`${localAddress}/getPressureConfig`)
    const config = res.data?.data?.config || DEFAULT_PRESSURE_CONFIG
    const pressureFormulaFile = config.pressureFormulaFile || DEFAULT_PRESSURE_CONFIG.pressureFormulaFile
    pressureConfigCache = {
      pressureFormulaFile,
      pressureFormulaProfile: getPressureFormulaProfileFromFile(pressureFormulaFile),
    }
    setPressureFormulaProfile(pressureConfigCache.pressureFormulaProfile)
    return pressureConfigCache
  } catch {
    pressureConfigCache = {
      ...pressureConfigCache,
      pressureFormulaProfile: getPressureFormulaProfileFromFile(pressureConfigCache.pressureFormulaFile),
    }
    setPressureFormulaProfile(pressureConfigCache.pressureFormulaProfile)
    return pressureConfigCache
  }
}
