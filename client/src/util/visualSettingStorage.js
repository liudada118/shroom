const VISUAL_SETTING_MAP_KEY = 'visualSettingValueBySystemV1'
const LEGACY_SETTING_KEY = 'setValueData'
const VISUAL_DEFAULT_VERSION_KEY = 'visualDefaultVersion'
const VISUAL_DEFAULT_VERSION = '2026-06-04-visual-defaults'
const VISUAL_SETTING_DEFAULTS = { gauss: 2, color: 180, filter: 10, height: 80, autoColor: 0 }
const LEGACY_DEFAULT_COLORS = new Set([200, 255, 355, 495])
const LEGACY_DEFAULT_VALUES = {
  gauss: new Set([1, 2, 2.6, 3]),
  color: new Set([50, 180, ...LEGACY_DEFAULT_COLORS]),
  filter: new Set([0, 1, 6]),
  height: new Set([1, 2.02, 3.36, 10, 150]),
}
const SETTING_KEYS = ['gauss', 'color', 'filter', 'height', 'coherent', 'autoColor']
export const DEFAULT_HEIGHT_SETTING_MAX = 200
export const DEFAULT_FILTER_SETTING_MAX = 200

export function normalizeVisualSettingMax(maxValue = {}) {
  const heightMax = Number(maxValue?.height)
  const filterMax = Number(maxValue?.filter)
  return {
    ...maxValue,
    filter: Number.isFinite(filterMax)
      ? Math.max(filterMax, DEFAULT_FILTER_SETTING_MAX)
      : DEFAULT_FILTER_SETTING_MAX,
    height: Number.isFinite(heightMax)
      ? Math.max(heightMax, DEFAULT_HEIGHT_SETTING_MAX)
      : DEFAULT_HEIGHT_SETTING_MAX,
  }
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
  if (Number.isFinite(legacyColor)) result.color = legacyColor

  SETTING_KEYS.forEach((key) => {
    const raw = Number(value[key])
    if (!Number.isFinite(raw)) return

    const max = Number(normalizedMax?.[key])
    result[key] = Number.isFinite(max) ? Math.min(raw, max) : raw
  })

  return result
}

function isLegacyDefaultColor(value) {
  const color = Number(value)
  return Number.isFinite(color) && LEGACY_DEFAULT_COLORS.has(color)
}

function isLegacyDefaultSetting(key, value) {
  const legacySet = LEGACY_DEFAULT_VALUES[key]
  const numberValue = Number(value)
  return legacySet && Number.isFinite(numberValue) && legacySet.has(numberValue)
}

function migrateVisualDefaultValue(value) {
  if (!value || typeof value !== 'object') return value
  let changed = false
  const nextValue = { ...value }
  Object.entries(VISUAL_SETTING_DEFAULTS).forEach(([key, defaultValue]) => {
    if (!isLegacyDefaultSetting(key, nextValue[key])) return
    nextValue[key] = defaultValue
    changed = true
  })
  return changed ? nextValue : value
}

function migrateVisualDefaultMap() {
  const map = safeParse(localStorage.getItem(VISUAL_SETTING_MAP_KEY), {})
  if (localStorage.getItem(VISUAL_DEFAULT_VERSION_KEY) === VISUAL_DEFAULT_VERSION) {
    return map
  }

  let changed = false
  const nextMap = { ...map }
  Object.keys(nextMap).forEach((key) => {
    if (!nextMap[key] || typeof nextMap[key] !== 'object') return
    const migratedValue = migrateVisualDefaultValue(nextMap[key])
    if (migratedValue === nextMap[key]) return
    nextMap[key] = migratedValue
    changed = true
  })

  const legacyValue = safeParse(localStorage.getItem(LEGACY_SETTING_KEY), null)
  if (legacyValue && typeof legacyValue === 'object') {
    const migratedLegacyValue = migrateVisualDefaultValue(legacyValue)
    if (migratedLegacyValue !== legacyValue) {
      localStorage.setItem(LEGACY_SETTING_KEY, JSON.stringify(migratedLegacyValue))
    } else if (isLegacyDefaultColor(legacyValue.color)) {
      localStorage.setItem(LEGACY_SETTING_KEY, JSON.stringify({ ...legacyValue, color: VISUAL_SETTING_DEFAULTS.color }))
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

  const normalizedSystem = system || 'default'
  const map = safeParse(localStorage.getItem(VISUAL_SETTING_MAP_KEY), {})
  const nextValue = { ...(value || {}) }
  delete nextValue.color3D
  delete nextValue.color2D
  map[normalizedSystem] = nextValue
  localStorage.setItem(VISUAL_SETTING_MAP_KEY, JSON.stringify(map))
  localStorage.setItem(LEGACY_SETTING_KEY, JSON.stringify(nextValue))
}
