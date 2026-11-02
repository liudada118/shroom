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
  return {
    ...store.settingValue,
    colorLimit: Math.max(1, Math.min(255, Number(store.threeAdcColor) || 255)),
    height: (Number(store.settingValue.height) || 1) * 0.02,
    filter: 0,
    gauss: 0,
    coherent: 1,
    autoColor: 0,
    mode: 'adc',
  }
}

export function prepareRawAdcDisplayMatrix(values, width, height) {
  if (!Array.isArray(values) || values.length !== width * height) return null
  return values.map(value => Number.isFinite(value) ? value : null)
}

export function createThreeDisplayProcessor() {
  let previousFrame
  let previousContext

  return (frame, store) => {
    const context = JSON.stringify([store.systemType, frame?.orientation])
    if (frame === previousFrame && context === previousContext) return null
    const matrices = {}
    for (const [key, values] of Object.entries(frame?.adc || {})) {
      const { width, height } = frame.dimensions?.[key] || {}
      if (!width || !height || values.length !== width * height) continue
      matrices[key] = prepareRawAdcDisplayMatrix(values, width, height)
    }
    previousFrame = frame
    previousContext = context
    // Legacy renderer aliases carry the same raw ADC. A statistics unit change
    // cannot change the visual matrix or introduce a pressure/force substitute.
    return { adc: matrices, pressure: matrices, force: matrices, mode: 'adc' }
  }
}
