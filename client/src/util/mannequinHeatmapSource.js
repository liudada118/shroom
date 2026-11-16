import {
  VISUAL_COLOR_SETTING_MIN,
  VISUAL_COLOR_SETTING_MAX,
  VISUAL_PRESSURE_FILTER_SETTING_MAX,
  normalizeMannequinAutoColor3D,
} from './visualSettingStorage.js'

/** The mannequin always renders calibrated pressure, regardless of old ADC preferences. */
export function getMannequinHeatmapMode() {
  return 'pressure'
}

/** Missing calibrated data clears heat instead of falling back to raw ADC. */
export function getMannequinHeatmapFrame(metricMaps) {
  return metricMaps?.pressure || {}
}

/** Keep 3D's default-on preference independent of the existing 2D control. */
export function getMannequinAutoColor(settings = {}, display = 'point3D') {
  return display === 'point3D'
    ? normalizeMannequinAutoColor3D(settings.autoColor3D)
    : Number(settings.autoColor) === 1 ? 1 : 0
}

/** Pressure colors and visual filtering are expressed in kPa internally. */
export function getMannequinHeatmapRenderSettings(settings = {}, display = 'point3D') {
  const numericColor = Number(settings.colorRange2D)
  const color = Number(display === 'num' && Number.isFinite(numericColor) && numericColor > 0
    ? numericColor : settings.color)
  const filter = Number(settings.filter)
  return {
    ...settings,
    visualDataMode: 'pressure',
    autoColor: getMannequinAutoColor(settings, display),
    color: Number.isFinite(color) && color > 0
      ? Math.max(VISUAL_COLOR_SETTING_MIN, Math.min(VISUAL_COLOR_SETTING_MAX, color)) : 40,
    filter: Number.isFinite(filter) ? Math.max(0, Math.min(VISUAL_PRESSURE_FILTER_SETTING_MAX, filter)) : 0,
    autoColorReference: 20,
  }
}
