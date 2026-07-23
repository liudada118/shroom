// Browser-safe mirror of server/kpa pressure formula files.
// Keep estimatePressure/estimateMaxPressure constants synchronized with that file.
const DEFAULT_PRESSURE_FORMULA_PROFILE = 'V2.7.38中英文logo'

const SEAT_SEGS = [
  { lo: 92.78, hi: 129.75, a: 0.001170994, b: -0.1905968, c: 10.059837 },
  { lo: 129.75, hi: 146.465, a: 0.002622218, b: -0.5732986, c: 35.228319 },
  { lo: 146.465, hi: 157.155, a: 0.004635929, b: -1.173901, c: 79.986504 },
  { lo: 157.155, hi: 164.275, a: 0.005660138, b: -1.463491, c: 100.185805 },
  { lo: 164.275, hi: 170.855, a: 0.003774891, b: -0.8869473, c: 56.338964 },
  { lo: 170.855, hi: 176.36, a: 0.01558982, b: -4.967249, c: 408.613321 },
  { lo: 176.36, hi: 179.58, a: 0.006252053, b: -1.418432, c: 73.148851 },
  { lo: 179.58, hi: 184.45, a: 0.01939872, b: -6.585739, c: 577.16918 },
  { lo: 184.45, hi: 192.2, a: 0.0, b: 0.3225806, c: -37.0 },
]

const BACK_SEGS = [
  { lo: 125.61, hi: 159.3, a: 0.001717858, b: -0.4122926, c: 27.134483 },
  { lo: 159.3, hi: 171.98, a: 0.004892941, b: -1.42029, c: 107.064504 },
  { lo: 171.98, hi: 180.43, a: 0.004443061, b: -1.266599, c: 93.902669 },
  { lo: 180.43, hi: 187.878, a: 0.004517847, b: -1.33062, c: 103.013925 },
  { lo: 187.878, hi: 193.588, a: 0.009930199, b: -3.350401, c: 291.449681 },
  { lo: 193.588, hi: 198.02, a: 0.01545079, b: -5.486578, c: 498.096996 },
  { lo: 198.02, hi: 201.528, a: 0.01816511, b: -6.542237, c: 600.699719 },
  { lo: 201.528, hi: 204.608, a: 0.04442068, b: -17.24446, c: 1691.183725 },
  { lo: 204.608, hi: 214.466, a: 0.0, b: 0.2536011, c: -29.388821 },
]

const HIGH_EXT = { adcStart: 195.235, adcEnd: 240.235, pStart: 20.0, pEnd: 22.0, slope: 0.044444 }
const P_CAP = 22.5
const MIN_ADC = 30
const SCALE_K = 0.0063636
const SCALE_B = 0.5

const PRESSURE_FORMULA_PROFILES = {
  'V2.7.38中英文logo': {
    seat: {
      topCount: 70,
      humanThreshold: 300,
      humanThresholdMode: 'gt',
      humanAlpha: 6.33442500e-04,
      segs: SEAT_SEGS,
      leftSlope: 2.6474807109609803e-02,
      pHi: 24.999991319999992,
      rightSlope: 1.428571,
    },
    backrest: {
      topCount: 46,
      humanThreshold: 300,
      humanThresholdMode: 'gt',
      humanAlpha: 6.33442500e-04,
      segs: BACK_SEGS,
      leftSlope: 1.9509221590333563e-02,
      pHi: 24.99999251260001,
      rightSlope: 1.345533,
    },
  },
  'V2.7.38': {
    seat: {
      topCount: 70,
      humanThreshold: 1128,
      humanThresholdMode: 'gte',
      humanAlpha: 6.33355500e-04,
      segs: SEAT_SEGS,
      leftSlope: 2.64748071e-02,
      pHi: 24.99999132,
      rightSlope: 0.32258060,
    },
    backrest: {
      topCount: 46,
      humanThreshold: 1000,
      humanThresholdMode: 'gte',
      humanAlpha: 4.15552300e-04,
      segs: BACK_SEGS,
      leftSlope: 1.95092216e-02,
      pHi: 24.99999251,
      rightSlope: 0.25360110,
    },
  },
}

PRESSURE_FORMULA_PROFILES['V2.7.37'] = PRESSURE_FORMULA_PROFILES['V2.7.38']
PRESSURE_FORMULA_PROFILES['V2.8.1'] = PRESSURE_FORMULA_PROFILES['V2.7.38']

const POINT_PRESSURE_FORMULA_PROFILES = new Set(['V2.8.1'])

let activePressureFormulaProfile = DEFAULT_PRESSURE_FORMULA_PROFILE

function getActiveSensorMeta(sensor) {
  return (PRESSURE_FORMULA_PROFILES[activePressureFormulaProfile] || PRESSURE_FORMULA_PROFILES[DEFAULT_PRESSURE_FORMULA_PROFILE])[sensor]
}

export function setPressureFormulaProfile(profile) {
  const nextProfile = String(profile || '').trim()
  if (!PRESSURE_FORMULA_PROFILES[nextProfile]) {
    activePressureFormulaProfile = DEFAULT_PRESSURE_FORMULA_PROFILE
    return activePressureFormulaProfile
  }
  activePressureFormulaProfile = nextProfile
  return activePressureFormulaProfile
}

export function getPressureFormulaProfile() {
  return activePressureFormulaProfile
}

export function getPressureSensor(key) {
  const value = String(key || '').toLowerCase()
  if (value.includes('back')) return 'backrest'
  if (value.includes('sit') || value.includes('seat')) return 'seat'
  return ''
}

export function master(adc, sensor = 'seat') {
  const numeric = Number(adc)
  if (!Number.isFinite(numeric) || numeric <= 0) return null
  const segments = sensor === 'backrest' ? BACK_SEGS : SEAT_SEGS
  if (numeric < segments[0].lo) {
    return (2.5 / 112.345) * numeric
  }
  for (const seg of segments) {
    if (numeric >= seg.lo && numeric <= seg.hi) {
      const p = seg.a * numeric * numeric + seg.b * numeric + seg.c
      return Math.min(Math.max(0, p), P_CAP)
    }
  }
  if (numeric > segments[segments.length - 1].hi && numeric <= HIGH_EXT.adcEnd) {
    const p = HIGH_EXT.pStart + HIGH_EXT.slope * (numeric - HIGH_EXT.adcStart)
    return Math.min(Math.max(0, p), P_CAP)
  }
  if (numeric > HIGH_EXT.adcEnd) {
    return Math.min(22.0, P_CAP)
  }
  return null
}

export function computeScale(adcMax) {
  const numeric = Number(adcMax)
  return SCALE_K * (Number.isFinite(numeric) ? numeric : 0) + SCALE_B
}

function usesHumanCalibrationAverage(meta, validCount) {
  if (!meta) return false
  return meta.humanThresholdMode === 'gt'
    ? validCount > meta.humanThreshold
    : validCount >= meta.humanThreshold
}

export function getPressurePointValuesKpa(arr, key, options = {}) {
  const values = Array.isArray(arr) ? arr.map((value) => Number(value) || 0) : []
  const sensor = getPressureSensor(key) || 'seat'

  if (!POINT_PRESSURE_FORMULA_PROFILES.has(activePressureFormulaProfile)) {
    const validValues = values.filter((value) => value > MIN_ADC)
    const adcAvg = getCalibrationAverage(validValues, sensor)
    const averagePressure = estimatePressure(adcAvg, validValues.length, sensor) || 0
    const pressureScale = adcAvg > 0 ? averagePressure / adcAvg : 0
    return values.map((value) => (value > MIN_ADC ? value * pressureScale : 0))
  }

  const adcMax = values.length ? Math.max(...values) : 0
  const scaleOverride = options.scaleOverride
  const scale = scaleOverride != null ? Number(scaleOverride) : computeScale(adcMax)
  const safeScale = Number.isFinite(scale) ? scale : computeScale(adcMax)
  return values.map((value) => {
    if (value <= MIN_ADC) return 0
    const base = master(value, sensor)
    return base == null ? 0 : safeScale * base
  })
}

function calcFiveSegment(adc, meta) {
  if (adc <= 0 || !meta?.segs?.length) return null
  const first = meta.segs[0]
  const last = meta.segs[meta.segs.length - 1]
  if (adc <= first.lo) return Math.max(0, meta.leftSlope * adc)
  if (adc > last.hi) return Math.max(0, meta.pHi + meta.rightSlope * (adc - last.hi))
  const seg = meta.segs.find((item) => adc <= item.hi)
  return seg ? Math.max(0, seg.a * adc * adc + seg.b * adc + seg.c) : null
}

export function estimatePressure(adcAvg, nValid, sensor) {
  const meta = getActiveSensorMeta(sensor)
  if (!meta || adcAvg <= 0) return null
  if (nValid !== undefined && usesHumanCalibrationAverage(meta, nValid)) {
    return Number(Math.max(0, meta.humanAlpha * adcAvg * adcAvg).toFixed(2))
  }
  return Number((calcFiveSegment(adcAvg, meta) || 0).toFixed(2))
}

export function estimateMaxPressure(adcMax, nValid, sensor, adcAvg) {
  if (adcMax <= 0 || adcAvg <= 0) return null
  const avgP = estimatePressure(adcAvg, nValid, sensor)
  if (avgP === null || avgP <= 0) return null
  return Number(Math.max(0, avgP * (adcMax / adcAvg)).toFixed(2))
}

export function getPressurePointAreaCm2(key) {
  const value = String(key || '').toLowerCase()
  if (value.includes('carY-back')) return (10 * 19) / 100
  if (value.includes('carY-sit')) return (15 * 15) / 100
  if (value.includes('back')) return (13 * 10) / 100
  if (value.includes('sit')) return (10 * 10) / 100
  return 1
}

export const PRESSURE_METRIC_MODE = 'pressure'
export const FORCE_METRIC_MODE = 'force'

export function normalizePressureMetricMode(mode) {
  return mode === PRESSURE_METRIC_MODE ? PRESSURE_METRIC_MODE : FORCE_METRIC_MODE
}

export function getPressureMetricMeta(mode) {
  const normalizedMode = normalizePressureMetricMode(mode)
  return normalizedMode === PRESSURE_METRIC_MODE
    ? { mode: normalizedMode, unit: 'kPa', label: '压强', englishLabel: 'Pressure', valuePrefix: 'pressure', trendField: 'pressureArr' }
    : { mode: normalizedMode, unit: 'N', label: '压力', englishLabel: 'Force', valuePrefix: 'force', trendField: 'forceArr' }
}

const PRESSURE_METRIC_DISPLAY = {
  [PRESSURE_METRIC_MODE]: {
    unit: 'kPa',
    valuePrefix: 'pressure',
    trendField: 'pressureArr',
    i18n: {
      curve: 'pressureCurve',
      axis: 'pressureSumAxis',
      average: 'pressAver',
      max: 'pressMax',
      total: 'pressureSum',
      data: 'pressureData',
    },
    zh: {
      name: '压强',
      curve: '压强曲线',
      axis: '压强总和',
      average: '平均压强',
      max: '最大压强',
      total: '压强总和',
      data: '压强数据',
      unitLabel: '压强单位',
    },
    en: {
      name: 'Pressure',
      curve: 'Pressure Curve',
      axis: 'Total Pressure',
      average: 'Avg Pressure',
      max: 'Max Pressure',
      total: 'Pressure Sum',
      data: 'Pressure Data',
      unitLabel: 'Pressure Unit',
    },
  },
  [FORCE_METRIC_MODE]: {
    unit: 'N',
    valuePrefix: 'force',
    trendField: 'forceArr',
    i18n: {
      curve: 'forceCurve',
      axis: 'forceTotalAxis',
      average: 'forceAver',
      max: 'forceMax',
      total: 'forceTotal',
      data: 'forceData',
    },
    zh: {
      name: '压力',
      curve: '压力曲线',
      axis: '压力总和',
      average: '平均压力',
      max: '最大压力',
      total: '压力总和',
      data: '压力数据',
      unitLabel: '压力单位',
    },
    en: {
      name: 'Force',
      curve: 'Force Curve',
      axis: 'Total Force',
      average: 'Average Force',
      max: 'Maximum Force',
      total: 'Total Force',
      data: 'Force Data',
      unitLabel: 'Force Unit',
    },
  },
}

function resolveMetricText(t, key, fallback) {
  if (typeof t !== 'function' || !key) return fallback
  const translated = t(key)
  return translated && translated !== key ? translated : fallback
}

export function getPressureMetricDisplay(mode, t, language) {
  const normalizedMode = normalizePressureMetricMode(mode)
  const config = PRESSURE_METRIC_DISPLAY[normalizedMode]
  const isEnglish = String(language || '').toLowerCase().startsWith('en')
  const fallback = isEnglish ? config.en : config.zh
  const labels = {
    average: resolveMetricText(t, config.i18n.average, fallback.average),
    max: resolveMetricText(t, config.i18n.max, fallback.max),
    total: resolveMetricText(t, config.i18n.total, fallback.total),
    data: resolveMetricText(t, config.i18n.data, fallback.data),
  }
  return {
    mode: normalizedMode,
    nextMode: normalizedMode === FORCE_METRIC_MODE ? PRESSURE_METRIC_MODE : FORCE_METRIC_MODE,
    unit: config.unit,
    name: fallback.name,
    curveLabel: resolveMetricText(t, config.i18n.curve, fallback.curve),
    axisLabel: resolveMetricText(t, config.i18n.axis, fallback.axis),
    unitLabel: fallback.unitLabel,
    valuePrefix: config.valuePrefix,
    trendField: config.trendField,
    labels,
  }
}

function getCalibrationAverage(positiveValues, sensor) {
  const meta = getActiveSensorMeta(sensor)
  if (!meta || !positiveValues.length) return 0
  if (usesHumanCalibrationAverage(meta, positiveValues.length)) {
    return positiveValues.reduce((sum, value) => sum + value, 0) / positiveValues.length
  }
  const topValues = [...positiveValues]
    .sort((left, right) => right - left)
    .slice(0, Math.min(meta.topCount, positiveValues.length))
  return topValues.reduce((sum, value) => sum + value, 0) / topValues.length
}

export function countActiveMetricPoints(values = []) {
  return Array.isArray(values)
    ? values.filter((value) => Number.isFinite(Number(value)) && Number(value) > 0).length
    : 0
}

export function computePressureMetrics(arr, key, options = {}) {
  const values = Array.isArray(arr) ? arr.map((value) => Number(value) || 0) : []
  const pressureValues = getPressurePointValuesKpa(values, key, options)
  const activePressureValues = pressureValues.filter((value) => Number.isFinite(value) && value > 0)
  const activeCount = countActiveMetricPoints(pressureValues)
  const rawPress = values.reduce((sum, value) => sum + value, 0)
  const rawMax = values.length ? Math.max(...values) : 0
  const rawActiveValues = values.filter((value) => Number.isFinite(value) && value > MIN_ADC)
  const rawAvg = rawActiveValues.length ? rawActiveValues.reduce((sum, value) => sum + value, 0) / rawActiveValues.length : 0
  const pointAreaCm2 = Number(options.pointAreaCm2) > 0 ? Number(options.pointAreaCm2) : getPressurePointAreaCm2(key)
  const effectiveArea = activeCount * pointAreaCm2
  const sensor = getPressureSensor(key)
  const pressureTotal = pressureValues.reduce((sum, value) => sum + (Number(value) || 0), 0)
  const pressMax = activePressureValues.length ? Math.max(...activePressureValues) : 0
  const pressAver = activeCount ? pressureTotal / activeCount : 0
  const forceValues = pressureValues.map((value) => value * pointAreaCm2 * 0.1)
  const total = forceValues.reduce((sum, value) => sum + (Number(value) || 0), 0)
  const activeForceValues = forceValues.filter((value) => Number.isFinite(value) && value > 0)

  return {
    activeCount,
    effectiveArea,
    rawPress,
    rawMax,
    rawAvg,
    adcAvg: rawAvg,
    sensor,
    pressureValues,
    forceValues,
    pressMax,
    pressAver,
    pressureTotal,
    forceMax: pressMax * pointAreaCm2 * 0.1,
    forceAver: activeForceValues.length ? total / activeForceValues.length : 0,
    total,
  }
}

export function getPressureMetricSummary(arr, key, mode, options = {}) {
  const metrics = computePressureMetrics(arr, key, options)
  const meta = getPressureMetricMeta(mode)
  if (meta.mode === PRESSURE_METRIC_MODE) {
    return {
      ...meta,
      max: metrics.pressMax,
      average: metrics.pressAver,
      total: metrics.pressureTotal,
      metrics,
    }
  }
  return {
    ...meta,
    max: metrics.forceMax,
    average: metrics.forceAver,
    total: metrics.total,
    metrics,
  }
}

export function getPressureMetricPointValues(arr, key, mode, options = {}) {
  const forceScale = getPressurePointAreaCm2(key) * 0.1
  const normalizedMode = normalizePressureMetricMode(mode)
  const pressureValues = getPressurePointValuesKpa(arr, key, options)
  return normalizedMode === PRESSURE_METRIC_MODE
    ? pressureValues
    : pressureValues.map((value) => value * forceScale)
}

export function convertForceTotalToMetric(value, key, mode) {
  const forceValue = Number(value) || 0
  if (normalizePressureMetricMode(mode) === FORCE_METRIC_MODE) return forceValue
  const pointAreaCm2 = getPressurePointAreaCm2(key)
  return pointAreaCm2 > 0 ? forceValue / (pointAreaCm2 * 0.1) : 0
}
