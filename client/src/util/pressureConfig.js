import axios from 'axios'
import { localAddress } from './constant'
import { setPressureFormulaProfile } from './pressureMetrics'

const DEFAULT_PRESSURE_CONFIG = {
  backValueMultiplier: 1,
  pressureFormulaFile: 'pressureFormula_V2.7.38中英文logo.js',
  pressureFormulaProfile: 'V2.8.1',
}

let pressureConfigCache = DEFAULT_PRESSURE_CONFIG

export function getPressureRuntimeConfig() {
  return pressureConfigCache
}

export async function loadPressureRuntimeConfig() {
  try {
    const res = await axios.get(`${localAddress}/getPressureConfig`)
    const config = res.data?.data?.config || DEFAULT_PRESSURE_CONFIG
    pressureConfigCache = { ...DEFAULT_PRESSURE_CONFIG, ...config }
    setPressureFormulaProfile(pressureConfigCache.pressureFormulaProfile)
    return pressureConfigCache
  } catch {
    setPressureFormulaProfile(DEFAULT_PRESSURE_CONFIG.pressureFormulaProfile)
    return pressureConfigCache
  }
}
