export const DEFAULT_COLOR_BAND_RATIOS = Object.freeze([20, 20, 20, 20, 20])

const BAND_COUNT = DEFAULT_COLOR_BAND_RATIOS.length
const TOTAL_PERCENT = 100
const COLOR_BAND_RGB = Object.freeze([
  [0.30, 0.58, 0.88],
  [0.0, 0.75, 0.90],
  [0.10, 0.78, 0.35],
  [1.0, 0.90, 0.10],
  [1.0, 0.62, 0.0],
  [0.95, 0.04, 0.0],
])

/** Allocate integer percentages while keeping each visible gradient interval at least 1%. */
function distributePercentages(total, weights) {
  const largest = Math.max(...weights)
  const scaled = weights.map(value => value / largest)
  const sum = scaled.reduce((acc, value) => acc + value, 0)
  const exact = scaled.map(value => value / sum * total)
  const result = exact.map(value => Math.max(1, Math.floor(value)))
  let remainder = total - result.reduce((acc, value) => acc + value, 0)

  const order = exact.map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index)
  for (let index = 0; remainder > 0; index++, remainder--) {
    result[order[index % order.length].index]++
  }
  while (remainder < 0) {
    const index = result.reduce((best, value, candidate) => value > result[best] ? candidate : best, 0)
    result[index]--
    remainder++
  }
  return result
}

/** Normalize persisted proportions without mutating user settings or accepting zero-width bands. */
export function normalizeColorBandRatios(value) {
  if (!Array.isArray(value) || value.length !== BAND_COUNT) return [...DEFAULT_COLOR_BAND_RATIOS]
  const numeric = value.map(item => typeof item === 'number' || typeof item === 'string' ? Number(item) : NaN)
  if (!numeric.every(item => Number.isFinite(item) && item > 0)) return [...DEFAULT_COLOR_BAND_RATIOS]
  if (numeric.every(Number.isInteger) && numeric.reduce((acc, item) => acc + item, 0) === TOTAL_PERCENT) {
    return [...numeric]
  }
  return distributePercentages(TOTAL_PERCENT, numeric)
}

/** Set one requested percentage and redistribute only the remaining share proportionally. */
export function updateColorBandRatio(ratios, index, value) {
  const normalized = normalizeColorBandRatios(ratios)
  if (!Number.isInteger(index) || index < 0 || index >= BAND_COUNT
    || value === null || value === undefined || value === '' || typeof value === 'boolean') return normalized
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return normalized
  const requested = Math.max(1, Math.min(TOTAL_PERCENT - BAND_COUNT + 1, Math.round(numeric)))
  const otherIndices = normalized.map((_, candidate) => candidate).filter(candidate => candidate !== index)
  const otherValues = distributePercentages(TOTAL_PERCENT - requested, otherIndices.map(candidate => normalized[candidate]))
  const result = [...normalized]
  result[index] = requested
  otherIndices.forEach((candidate, offset) => { result[candidate] = otherValues[offset] })
  return result
}

/** Four ascending shader stops delimit the five continuous color transitions. */
export function getColorBandStops(ratios) {
  const normalized = normalizeColorBandRatios(ratios)
  let cumulative = 0
  return normalized.slice(0, -1).map(value => {
    cumulative += value
    return cumulative / TOTAL_PERCENT
  })
}

/** Sample the same continuous blue-to-red palette used by the mannequin shader. */
export function getColorBandRGB(value, max, ratios) {
  const numeric = Number(value)
  const range = Number(max)
  const safeMax = Number.isFinite(range) && range > 0 ? range : 1
  const t = Math.max(0, Math.min(1, Number.isFinite(numeric) ? numeric / safeMax : 0))
  const stops = [0, ...getColorBandStops(ratios), 1]
  let index = 0
  while (index < BAND_COUNT - 1 && t >= stops[index + 1]) index++
  const amount = (t - stops[index]) / (stops[index + 1] - stops[index])
  return COLOR_BAND_RGB[index].map((channel, channelIndex) => Math.round(
    (channel + (COLOR_BAND_RGB[index + 1][channelIndex] - channel) * amount) * 255,
  ))
}
