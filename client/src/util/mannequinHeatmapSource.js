import {
  VISUAL_COLOR_SETTING_MIN,
  VISUAL_COLOR_SETTING_MAX,
} from './visualSettingStorage.js'

/** The mannequin always renders calibrated pressure, regardless of old ADC preferences. */
export function getMannequinHeatmapMode() {
  return 'pressure'
}

/** Missing calibrated data clears heat instead of falling back to raw ADC. */
export function getMannequinHeatmapFrame(metricMaps) {
  return metricMaps?.pressure || {}
}

/** Pressure colors and visual filtering are expressed in kPa internally. */
export function getMannequinHeatmapRenderSettings(settings = {}) {
  const color = Number(settings.color)
  const filter = Number(settings.filter)
  return {
    ...settings,
    visualDataMode: 'pressure',
    color: Number.isFinite(color) && color > 0
      ? Math.max(VISUAL_COLOR_SETTING_MIN, Math.min(VISUAL_COLOR_SETTING_MAX, color)) : 20,
    filter: Number.isFinite(filter) ? Math.max(0, Math.min(VISUAL_COLOR_SETTING_MAX, filter)) : 0,
    autoColorReference: 20,
  }
}
