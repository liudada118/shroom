const VISUAL_SETTING_MAP_KEY = 'visualSettingValueBySystemV1'
const LEGACY_SETTING_KEY = 'setValueData'
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

export function loadVisualSettingValue(system, fallback = {}, maxValue = {}) {
  if (typeof localStorage === 'undefined') {
    return normalizeSettingValue(fallback, fallback, maxValue)
  }

  const map = safeParse(localStorage.getItem(VISUAL_SETTING_MAP_KEY), {})
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
