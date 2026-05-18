const VISUAL_SETTING_MAP_KEY = 'visualSettingValueBySystemV1'
const LEGACY_SETTING_KEY = 'setValueData'
const SETTING_KEYS = ['gauss', 'color', 'color3D', 'color2D', 'filter', 'height', 'coherent']

function safeParse(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback
  } catch {
    return fallback
  }
}

function normalizeSettingValue(value = {}, fallback = {}, maxValue = {}) {
  const fallbackColor = Number(value.color ?? fallback.color)
  const result = {
    ...fallback,
    color3D: value.color3D ?? fallback.color3D ?? fallbackColor,
    color2D: value.color2D ?? fallback.color2D ?? fallbackColor,
  }

  SETTING_KEYS.forEach((key) => {
    const raw = Number(value[key])
    if (!Number.isFinite(raw)) return

    const max = Number(maxValue?.[key] ?? (key === 'color2D' || key === 'color3D' ? maxValue?.color : undefined))
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
  if (nextValue.color3D === undefined && nextValue.color !== undefined) nextValue.color3D = nextValue.color
  if (nextValue.color2D === undefined && nextValue.color !== undefined) nextValue.color2D = nextValue.color
  map[normalizedSystem] = nextValue
  localStorage.setItem(VISUAL_SETTING_MAP_KEY, JSON.stringify(map))
  localStorage.setItem(LEGACY_SETTING_KEY, JSON.stringify(nextValue))
}
