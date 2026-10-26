import {
  VISUAL_ADC_COLOR_SETTING_DEFAULT,
  VISUAL_ADC_FILTER_SETTING_DEFAULT,
  VISUAL_ADC_SETTING_MAX,
  VISUAL_COLOR_SETTING_MIN,
} from './visualSettingStorage.js'

/** The 3D mannequin always renders ADC, including when older preferences selected pressure. */
export function getMannequinHeatmapMode() {
  return 'adc'
}

/** Missing ADC stays blank rather than silently displaying pressure. */
export function getMannequinHeatmapFrame(metricMaps) {
  return metricMaps?.adc || {}
}

/** ADC color/filter controls stay independent from pressure display settings. */
export function getMannequinHeatmapRenderSettings(settings = {}) {
  const color = Number(settings.adcColor)
  const filter = Number(settings.adcFilter)
  return {
    ...settings,
    color: Number.isFinite(color) && color > 0
      ? Math.max(VISUAL_COLOR_SETTING_MIN, Math.min(VISUAL_ADC_SETTING_MAX, color))
      : VISUAL_ADC_COLOR_SETTING_DEFAULT,
    filter: Number.isFinite(filter)
      ? Math.max(0, Math.min(VISUAL_ADC_SETTING_MAX, filter))
      : VISUAL_ADC_FILTER_SETTING_DEFAULT,
    autoColorReference: VISUAL_ADC_COLOR_SETTING_DEFAULT,
  }
}
