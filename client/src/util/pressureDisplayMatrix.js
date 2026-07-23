import {
  FORCE_METRIC_MODE,
  PRESSURE_METRIC_MODE,
  getPressureMetricMeta,
  getPressureMetricPointValues,
  getPressurePointAreaCm2,
  normalizePressureMetricMode,
} from './pressureMetrics.js'

export const PRESSURE_DISPLAY_DIGITS = 1
export const PRESSURE_DISPLAY_VISIBLE_THRESHOLD = 0.05

const DISPLAY_SCALE = 10 ** PRESSURE_DISPLAY_DIGITS
const NORMAL_DISTRIBUTION_SAMPLE_COUNT = 256

function toFiniteNonNegative(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? Math.max(0, numeric) : 0
}

export function normalizePressureDisplayValue(value) {
  return Math.round(toFiniteNonNegative(value) * DISPLAY_SCALE) / DISPLAY_SCALE
}

export function preparePressureDisplayAdcMatrix(data, width, height, settings = {}) {
  const safeWidth = Math.max(1, Number(width) || 1)
  const safeHeight = Math.max(1, Number(height) || 1)
  const count = safeWidth * safeHeight
  return Array.from({ length: count }, (_, index) => toFiniteNonNegative(data?.[index]))
}

export function maskPressureDisplayMatrix(values, isVisibleIndex) {
  if (typeof isVisibleIndex !== 'function') return [...values]
  return values.map((value, index) => (isVisibleIndex(index) ? value : 0))
}

export function stabilizePressureDisplayMetricValues(values, previousState = null) {
  const source = Array.from(values || [], toFiniteNonNegative)
  const display = source.map(normalizePressureDisplayValue)
  return { values: display, state: { values: source, display } }
}

export function buildPressureDisplayMetricMatrix({
  adcValues,
  width,
  height,
  settings,
  matrixKey,
  metricMode,
  previousState,
  isVisibleIndex,
}) {
  const preparedAdc = maskPressureDisplayMatrix(
    preparePressureDisplayAdcMatrix(adcValues, width, height, settings),
    isVisibleIndex,
  )
  return convertPreparedPressureDisplayMetricMatrix({
    preparedAdc,
    matrixKey,
    metricMode,
    previousState,
  })
}

export function convertPreparedPressureDisplayMetricMatrix({
  preparedAdc,
  matrixKey,
  metricMode,
  previousState,
}) {
  const metricValues = getPressureMetricPointValues(preparedAdc, matrixKey, metricMode)
  return stabilizePressureDisplayMetricValues(metricValues, previousState)
}

export function summarizePressureDisplayMatrix(values, matrixKey, metricMode) {
  const mode = normalizePressureMetricMode(metricMode)
  const metricValues = Array.from(values || [], normalizePressureDisplayValue)
  const activeValues = metricValues.filter((value) => value > 0)
  const activeCount = activeValues.length
  const total = activeValues.reduce((sum, value) => sum + value, 0)
  const max = activeCount ? Math.max(...activeValues) : 0
  const average = activeCount ? total / activeCount : 0
  const forceScale = getPressurePointAreaCm2(matrixKey) * 0.1
  const pressureValues = mode === PRESSURE_METRIC_MODE
    ? metricValues
    : metricValues.map((value) => (forceScale > 0 ? value / forceScale : 0))
  const forceValues = mode === FORCE_METRIC_MODE
    ? metricValues
    : metricValues.map((value) => value * forceScale)
  const pressureTotal = pressureValues.reduce((sum, value) => sum + value, 0)
  const forceTotal = forceValues.reduce((sum, value) => sum + value, 0)

  return {
    mode,
    metricValues,
    pressureValues,
    forceValues,
    activeCount,
    effectiveArea: activeCount * getPressurePointAreaCm2(matrixKey),
    max,
    average,
    total,
    pressureTotal,
    forceTotal,
  }
}

export function buildPressureDisplayNormalDistribution(values, metricMode) {
  const meta = getPressureMetricMeta(metricMode)
  const activeValues = Array.from(values || [], toFiniteNonNegative).filter((value) => value > 0)
  const count = activeValues.length
  const average = count
    ? activeValues.reduce((sum, value) => sum + value, 0) / count
    : 0
  const distributionVariance = count
    ? activeValues.reduce((sum, value) => sum + (value - average) ** 2, 0) / count
    : 0
  const standardDeviation = Math.sqrt(distributionVariance)
  const hasSpread = standardDeviation > Number.EPSILON
  const skew = count >= 3 && hasSpread
    ? (count / ((count - 1) * (count - 2)))
      * activeValues.reduce((sum, value) => sum + ((value - average) / standardDeviation) ** 3, 0)
    : 0
  const normalizedFourthMoment = count >= 4 && hasSpread
    ? activeValues.reduce((sum, value) => sum + ((value - average) / standardDeviation) ** 4, 0)
    : 0
  const excessKurtosis = count >= 4 && hasSpread
    ? (count * (count + 1) * normalizedFourthMoment) / ((count - 1) * (count - 2) * (count - 3))
      - (3 * (count - 1) ** 2) / ((count - 2) * (count - 3))
    : 0
  const observedMax = count ? Math.max(...activeValues) : 0
  const rawDomainMax = Math.max(observedMax, average + standardDeviation * 4, 0.1)
  const domainMax = Math.ceil(rawDomainMax * DISPLAY_SCALE) / DISPLAY_SCALE
  const xData = Array.from(
    { length: NORMAL_DISTRIBUTION_SAMPLE_COUNT },
    (_, index) => domainMax * index / (NORMAL_DISTRIBUTION_SAMPLE_COUNT - 1),
  )
  let yData = new Array(NORMAL_DISTRIBUTION_SAMPLE_COUNT).fill(0)

  if (count && hasSpread) {
    yData = xData.map((value) => {
      const exponent = -((value - average) ** 2) / (2 * standardDeviation ** 2)
      return (1 / (standardDeviation * Math.sqrt(2 * Math.PI))) * Math.exp(exponent)
    })
  } else if (count) {
    const peakIndex = Math.max(
      0,
      Math.min(NORMAL_DISTRIBUTION_SAMPLE_COUNT - 1, Math.round(average / domainMax * (NORMAL_DISTRIBUTION_SAMPLE_COUNT - 1))),
    )
    yData[peakIndex] = 1
  }

  return {
    mode: meta.mode,
    unit: meta.unit,
    count,
    ['\u03bc']: average.toFixed(3),
    Var: distributionVariance.toFixed(3),
    Skew: skew.toFixed(3),
    Kurt: excessKurtosis.toFixed(3),
    min: 0,
    max: domainMax,
    xData,
    yData,
  }
}
