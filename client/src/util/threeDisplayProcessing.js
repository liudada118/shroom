import { normalizeVisualColorSetting } from './visualSettingStorage'

// Separable Gaussian convolution keeps calibrated decimals; the legacy blur rounds to ADC integers.
export function blurThreeMatrix(values, width, height, sigma) {
  if (sigma <= 0) return [...values]
  const radius = Math.ceil(sigma * 3)
  const kernel = Array.from({ length: radius * 2 + 1 }, (_, i) => Math.exp(-((i - radius) ** 2) / (2 * sigma ** 2)))
  const total = kernel.reduce((sum, weight) => sum + weight, 0)
  const horizontal = new Array(values.length).fill(0)
  const result = new Array(values.length).fill(0)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let offset = -radius; offset <= radius; offset++) {
        const sourceX = Math.max(0, Math.min(width - 1, x + offset))
        horizontal[y * width + x] += values[y * width + sourceX] * kernel[offset + radius] / total
      }
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let offset = -radius; offset <= radius; offset++) {
        const sourceY = Math.max(0, Math.min(height - 1, y + offset))
        result[y * width + x] += horizontal[sourceY * width + x] * kernel[offset + radius] / total
      }
    }
  }
  return result
}

export function getThreeDisplaySettings(store) {
  const adc = store.threeDisplaySource === 'adc'
  return {
    ...store.settingValue,
    colorLimit: adc ? store.threeAdcColor : normalizeVisualColorSetting(store.settingValue.color),
    // ADC and kPa have different magnitudes; this affects geometry only, not matrix values.
    height: (Number(store.settingValue.height) || 1) * (adc ? 0.02 : 1),
    mode: adc ? 'adc' : store.pressureMetricMode,
  }
}

export function createThreeDisplayProcessor() {
  let previousFrame
  let previousContext
  let previousAt = 0
  let previousIndex
  let result = { pressure: {}, force: {} }
  let previousDimensions = {}

  return (frame, store) => {
    const mode = store.threeDisplaySource === 'adc' ? 'adc' : store.pressureMetricMode
    const sigma = Math.max(0, Math.min(4, Number(store.settingValue.gauss) || 0))
    const coherent = Math.max(1, Math.min(10, Number(store.settingValue.coherent) || 1))
    const context = JSON.stringify([mode, sigma, coherent, store.systemType, store.dataStatus,
      store.display, store.playbackRecordDate, frame?.orientation])
    if (frame === previousFrame && context === previousContext) return null
    const now = Date.now()
    const index = Number(store.history?.index)
    const seek = store.dataStatus !== 'realtime' && Number.isFinite(previousIndex)
      && Number.isFinite(index) && (index < previousIndex || index > previousIndex + 1)
    const reset = context !== previousContext || now - previousAt > 1000 || seek
    const matrices = {}
    for (const [key, values] of Object.entries(frame?.[mode] || {})) {
      const { width, height } = frame.dimensions?.[key] || {}
      if (!width || !height || values.length !== width * height) continue
      const clean = values.map(value => Number.isFinite(value) && value > 0 ? value : 0)
      const spatial = blurThreeMatrix(clean, width, height, sigma)
      const previous = result[store.pressureMetricMode]?.[key]
      const sameShape = previousDimensions[key]?.width === width && previousDimensions[key]?.height === height
      matrices[key] = !reset && sameShape && previous?.length === spatial.length && coherent > 1
        ? spatial.map((value, i) => previous[i] + (value - previous[i]) / coherent)
        : spatial
    }
    previousFrame = frame
    previousContext = context
    previousAt = now
    previousIndex = index
    previousDimensions = frame?.dimensions || {}
    // Renderers select by the global physical unit; ADC is an independent display-only source.
    result = { pressure: matrices, force: matrices, mode }
    return result
  }
}
