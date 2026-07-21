import { computeScale, master } from './pressureMetrics.js'

const VISUAL_SETTING_MAP_KEY = 'visualSettingValueBySystemV1'
const LEGACY_SETTING_KEY = 'setValueData'
const VISUAL_DEFAULT_VERSION_KEY = 'visualDefaultVersion'
const PREVIOUS_PRESSURE_COLOR_VERSION = '2026-07-20-pressure-color-range-v1'
const VISUAL_DEFAULT_VERSION = '2026-07-20-rendered-metric-auto-color-v2'
const DEFAULT_SYSTEM_KEY = 'default'
export const VISUAL_COLOR_SETTING_MIN = 0.01
export const VISUAL_COLOR_SETTING_MAX = 60
export const VISUAL_COLOR_SETTING_STEP = 0.01
export const VISUAL_COLOR_SETTING_DEFAULT = 5
const VISUAL_SETTING_DEFAULTS = { gauss: 2, color: VISUAL_COLOR_SETTING_DEFAULT, filter: 30, height: 80, autoColor: 1 }
const LEGACY_DEFAULT_COLORS = new Set([200, 255, 355, 495])
const LEGACY_DEFAULT_VALUES = {
  gauss: new Set([1, 2, 2.6, 3]),
  color: new Set([50, 120, 180, ...LEGACY_DEFAULT_COLORS]),
  filter: new Set([0, 1, 6]),
  height: new Set([1, 2.02, 3.36, 10, 150]),
  autoColor: new Set([0]),
}
const SETTING_KEYS = ['gauss', 'color', 'filter', 'height', 'coherent', 'autoColor']
export const DEFAULT_HEIGHT_SETTING_MAX = 200
export const DEFAULT_FILTER_SETTING_MAX = 200

export function normalizeVisualSettingMax(maxValue = {}) {
  const heightMax = Number(maxValue?.height)
  const filterMax = Number(maxValue?.filter)
  return {
    ...maxValue,
    color: VISUAL_COLOR_SETTING_MAX,
    filter: Number.isFinite(filterMax)
      ? Math.max(filterMax, DEFAULT_FILTER_SETTING_MAX)
      : DEFAULT_FILTER_SETTING_MAX,
    height: Number.isFinite(heightMax)
      ? Math.max(heightMax, DEFAULT_HEIGHT_SETTING_MAX)
      : DEFAULT_HEIGHT_SETTING_MAX,
  }
}

export function normalizeVisualColorSetting(value, fallback = VISUAL_COLOR_SETTING_DEFAULT) {
  const numeric = Number(value)
  const fallbackValue = Number(fallback)
  const resolved = Number.isFinite(numeric)
    ? numeric
    : (Number.isFinite(fallbackValue) ? fallbackValue : VISUAL_COLOR_SETTING_DEFAULT)
  const clamped = Math.max(VISUAL_COLOR_SETTING_MIN, Math.min(VISUAL_COLOR_SETTING_MAX, resolved))
  return Number((Math.round(clamped / VISUAL_COLOR_SETTING_STEP) * VISUAL_COLOR_SETTING_STEP).toFixed(2))
}

function safeParse(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback
  } catch {
    return fallback
  }
}

function normalizeSettingValue(value = {}, fallback = {}, maxValue = {}) {
  const normalizedMax = normalizeVisualSettingMax(maxValue)
  const result = {
    ...fallback,
  }
  const legacyColor = Number(value.color ?? value.color3D ?? value.color2D ?? fallback.color)
  if (Number.isFinite(legacyColor)) result.color = normalizeVisualColorSetting(legacyColor)

  SETTING_KEYS.forEach((key) => {
    const raw = Number(value[key])
    if (!Number.isFinite(raw)) return

    if (key === 'color') {
      result[key] = normalizeVisualColorSetting(raw)
      return
    }

    const max = Number(normalizedMax?.[key])
    result[key] = Number.isFinite(max) ? Math.min(raw, max) : raw
  })

  return result
}

function isLegacyDefaultSetting(key, value) {
  const legacySet = LEGACY_DEFAULT_VALUES[key]
  const numberValue = Number(value)
  return legacySet && Number.isFinite(numberValue) && legacySet.has(numberValue)
}

function convertLegacyAdcColorSetting(value) {
  const adc = Number(value)
  if (!Number.isFinite(adc) || adc <= 0) return VISUAL_COLOR_SETTING_MIN
  const basePressure = master(adc, 'seat')
  if (!Number.isFinite(basePressure)) return VISUAL_COLOR_SETTING_DEFAULT
  return normalizeVisualColorSetting(basePressure * computeScale(adc))
}

function migrateColorSetting(value, previousVersion) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return value

  if (previousVersion === PREVIOUS_PRESSURE_COLOR_VERSION) {
    return numeric === VISUAL_COLOR_SETTING_MAX
      ? VISUAL_COLOR_SETTING_DEFAULT
      : normalizeVisualColorSetting(numeric)
  }

  if (isLegacyDefaultSetting('color', numeric)) {
    return VISUAL_COLOR_SETTING_DEFAULT
  }
  return convertLegacyAdcColorSetting(numeric)
}

function migrateVisualDefaultValue(value, previousVersion) {
  if (!value || typeof value !== 'object') return value
  let changed = false
  const nextValue = { ...value }
  Object.entries(VISUAL_SETTING_DEFAULTS).forEach(([key, defaultValue]) => {
    if (key === 'color') return
    if (!isLegacyDefaultSetting(key, nextValue[key])) return
    nextValue[key] = defaultValue
    changed = true
  })

  const sourceColor = nextValue.color ?? nextValue.color3D ?? nextValue.color2D
  const migratedColor = migrateColorSetting(sourceColor, previousVersion)
  if (Number.isFinite(Number(migratedColor)) && Number(migratedColor) !== Number(sourceColor)) {
    nextValue.color = migratedColor
    delete nextValue.color3D
    delete nextValue.color2D
    changed = true
  }
  return changed ? nextValue : value
}

function migrateVisualDefaultMap() {
  const map = safeParse(localStorage.getItem(VISUAL_SETTING_MAP_KEY), {})
  const previousVersion = localStorage.getItem(VISUAL_DEFAULT_VERSION_KEY)
  if (previousVersion === VISUAL_DEFAULT_VERSION) {
    return map
  }

  let changed = false
  const nextMap = { ...map }
  Object.keys(nextMap).forEach((key) => {
    if (!nextMap[key] || typeof nextMap[key] !== 'object') return
    const migratedValue = migrateVisualDefaultValue(nextMap[key], previousVersion)
    if (migratedValue === nextMap[key]) return
    nextMap[key] = migratedValue
    changed = true
  })

  const legacyValue = safeParse(localStorage.getItem(LEGACY_SETTING_KEY), null)
  if (legacyValue && typeof legacyValue === 'object') {
    const migratedLegacyValue = migrateVisualDefaultValue(legacyValue, previousVersion)
    if (migratedLegacyValue !== legacyValue) {
      localStorage.setItem(LEGACY_SETTING_KEY, JSON.stringify(migratedLegacyValue))
    }
  }

  if (changed) {
    localStorage.setItem(VISUAL_SETTING_MAP_KEY, JSON.stringify(nextMap))
  }
  localStorage.setItem(VISUAL_DEFAULT_VERSION_KEY, VISUAL_DEFAULT_VERSION)
  return nextMap
}

export function loadVisualSettingValue(system, fallback = {}, maxValue = {}) {
  if (typeof localStorage === 'undefined') {
    return normalizeSettingValue(fallback, fallback, maxValue)
  }

  const map = migrateVisualDefaultMap()
  if (system && map?.[system]) {
    return normalizeSettingValue(map[system], fallback, maxValue)
  }

  const legacyValue = safeParse(localStorage.getItem(LEGACY_SETTING_KEY), null)
  if (legacyValue && typeof legacyValue === 'object') {
    const normalized = normalizeSettingValue(legacyValue, fallback, maxValue)
    if (system) saveVisualSettingValue(system, normalized)
    return normalized
  }

  return normalizeSettingValue(fallback, fallback, maxValue)
}

export function saveVisualSettingValue(system, value) {
  if (typeof localStorage === 'undefined') return

  const normalizedSystem = system || DEFAULT_SYSTEM_KEY
  const map = safeParse(localStorage.getItem(VISUAL_SETTING_MAP_KEY), {})
  const nextValue = { ...(value || {}) }
  if (Object.prototype.hasOwnProperty.call(nextValue, 'color')) {
    nextValue.color = normalizeVisualColorSetting(nextValue.color)
  }
  delete nextValue.color3D
  delete nextValue.color2D
  map[normalizedSystem] = nextValue
  map[DEFAULT_SYSTEM_KEY] = nextValue
  localStorage.setItem(VISUAL_SETTING_MAP_KEY, JSON.stringify(map))
  localStorage.setItem(LEGACY_SETTING_KEY, JSON.stringify(nextValue))
  localStorage.setItem(VISUAL_DEFAULT_VERSION_KEY, VISUAL_DEFAULT_VERSION)
}
