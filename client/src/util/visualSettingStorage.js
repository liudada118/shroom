const VISUAL_SETTING_MAP_KEY = 'visualSettingValueBySystemV1'
const LEGACY_SETTING_KEY = 'setValueData'
const VISUAL_COLOR_DEFAULT_VERSION_KEY = 'visualColorDefaultVersion'
const VISUAL_COLOR_DEFAULT_VERSION = '180'
const VISUAL_COLOR_DEFAULT = 180
const LEGACY_DEFAULT_COLORS = new Set([200, 255, 355, 495])
const SETTING_KEYS = ['gauss', 'color', 'filter', 'height', 'coherent']
export const DEFAULT_HEIGHT_SETTING_MAX = 200

export function normalizeVisualSettingMax(maxValue = {}) {
  const heightMax = Number(maxValue?.height)
  return {
    ...maxValue,
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

function migrateVisualColorDefaultMap() {
  const map = safeParse(localStorage.getItem(VISUAL_SETTING_MAP_KEY), {})
  if (localStorage.getItem(VISUAL_COLOR_DEFAULT_VERSION_KEY) === VISUAL_COLOR_DEFAULT_VERSION) {
    return map
  }

  let changed = false
  const nextMap = { ...map }
  Object.keys(nextMap).forEach((key) => {
    if (!nextMap[key] || typeof nextMap[key] !== 'object') return
    if (!isLegacyDefaultColor(nextMap[key].color)) return
    nextMap[key] = { ...nextMap[key], color: VISUAL_COLOR_DEFAULT }
    changed = true
  })

  const legacyValue = safeParse(localStorage.getItem(LEGACY_SETTING_KEY), null)
  if (legacyValue && typeof legacyValue === 'object' && isLegacyDefaultColor(legacyValue.color)) {
    localStorage.setItem(LEGACY_SETTING_KEY, JSON.stringify({ ...legacyValue, color: VISUAL_COLOR_DEFAULT }))
  }

  if (changed) {
    localStorage.setItem(VISUAL_SETTING_MAP_KEY, JSON.stringify(nextMap))
  }
  localStorage.setItem(VISUAL_COLOR_DEFAULT_VERSION_KEY, VISUAL_COLOR_DEFAULT_VERSION)
  return nextMap
}

export function loadVisualSettingValue(system, fallback = {}, maxValue = {}) {
  if (typeof localStorage === 'undefined') {
    return normalizeSettingValue(fallback, fallback, maxValue)
  }

  const map = migrateVisualColorDefaultMap()
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
