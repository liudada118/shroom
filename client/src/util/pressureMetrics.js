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

const PRESSURE_FORMULA_PROFILES = {
  'V2.7.38中英文logo': {
    seat: {
      topCount: 70,
      humanThreshold: 301,
      humanAlpha: 6.33442500e-04,
      segs: SEAT_SEGS,
      leftSlope: 2.6474807109609803e-02,
      pHi: 24.999991319999992,
      rightSlope: 1.428571,
    },
    backrest: {
      topCount: 46,
      humanThreshold: 301,
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
      humanAlpha: 6.33355500e-04,
      segs: SEAT_SEGS,
      leftSlope: 2.64748071e-02,
      pHi: 24.99999132,
      rightSlope: 0.32258060,
    },
    backrest: {
      topCount: 46,
      humanThreshold: 1000,
      humanAlpha: 4.15552300e-04,
      segs: BACK_SEGS,
      leftSlope: 1.95092216e-02,
      pHi: 24.99999251,
      rightSlope: 0.25360110,
    },
  },
}

PRESSURE_FORMULA_PROFILES['V2.7.37'] = PRESSURE_FORMULA_PROFILES['V2.7.38']

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
  if (nValid !== undefined && nValid >= meta.humanThreshold) {
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
  if (
    value === 'endi-jacket'
    || value === 'endi-lefthand'
    || value === 'endi-righthand'
    || value === 'endi-leftfoot'
    || value === 'endi-rightfoot'
    || value === 'endi-foot'
  ) {
    return 1.5625
  }
  if (value.includes('carY-back')) return (10 * 19) / 100
  if (value.includes('carY-sit')) return (15 * 15) / 100
  if (value.includes('back')) return (13 * 10) / 100
  if (value.includes('sit')) return (10 * 10) / 100
  return 1
}

function getCalibrationAverage(positiveValues, sensor) {
  const meta = getActiveSensorMeta(sensor)
  if (!meta || !positiveValues.length) return 0
  if (positiveValues.length >= meta.humanThreshold) {
    return positiveValues.reduce((sum, value) => sum + value, 0) / positiveValues.length
  }
  const topValues = [...positiveValues]
    .sort((left, right) => right - left)
    .slice(0, Math.min(meta.topCount, positiveValues.length))
  return topValues.reduce((sum, value) => sum + value, 0) / topValues.length
}

export function computePressureMetrics(arr, key, options = {}) {
  const values = Array.isArray(arr) ? arr.map((value) => Number(value) || 0) : []
  const positiveValues = values.filter((value) => Number.isFinite(value) && value > 0)
  const activeCount = positiveValues.length
  const rawPress = values.reduce((sum, value) => sum + value, 0)
  const rawMax = values.length ? Math.max(...values) : 0
  const rawAvg = activeCount ? rawPress / activeCount : 0
  const pointAreaCm2 = Number(options.pointAreaCm2) > 0 ? Number(options.pointAreaCm2) : getPressurePointAreaCm2(key)
  const effectiveArea = activeCount * pointAreaCm2
  const sensor = getPressureSensor(key)
  const toNewton = (kpa) => kpa * 1000 * effectiveArea / 10000

  if (!sensor || !activeCount) {
    return {
      activeCount,
      effectiveArea,
      rawPress,
      rawMax,
      rawAvg,
      pressMax: rawMax,
      pressAver: rawAvg,
      total: toNewton(rawAvg),
    }
  }

  const adcAvg = getCalibrationAverage(positiveValues, sensor)
  const pressAver = estimatePressure(adcAvg, activeCount, sensor) || 0
  const pressMax = estimateMaxPressure(rawMax, activeCount, sensor, adcAvg) || 0

  return {
    activeCount,
    effectiveArea,
    rawPress,
    rawMax,
    rawAvg,
    adcAvg,
    sensor,
    pressMax,
    pressAver,
    total: toNewton(pressAver),
  }
}

export const PRESSURE_METRIC_MODE = 'pressure'
export const FORCE_METRIC_MODE = 'force'
export const ADC_METRIC_MODE = 'adc'

const PRESSURE_METRIC_MODE_SEQUENCE = [
  FORCE_METRIC_MODE,
  PRESSURE_METRIC_MODE,
  ADC_METRIC_MODE,
]

export function normalizePressureMetricMode(mode) {
  return PRESSURE_METRIC_MODE_SEQUENCE.includes(mode) ? mode : PRESSURE_METRIC_MODE
}

// ─── 压强显示单位（内部一律 kPa，只在显示/导出层换算）──────────
// 1 kPa = 1000 N/m² = 0.1 N/cm²
export const PRESSURE_UNIT_N_CM2 = 'N/cm²'
export const PRESSURE_UNIT_KPA = 'kPa'
export const PRESSURE_UNIT_SEQUENCE = [PRESSURE_UNIT_N_CM2, PRESSURE_UNIT_KPA]
export const N_CM2_PER_KPA = 0.1

export function normalizePressureUnit(unit) {
  const lower = String(unit || '').trim().toLowerCase()
  if (lower === 'kpa') return PRESSURE_UNIT_KPA
  return PRESSURE_UNIT_N_CM2
}

export function getNextPressureUnit(unit) {
  const index = PRESSURE_UNIT_SEQUENCE.indexOf(normalizePressureUnit(unit))
  return PRESSURE_UNIT_SEQUENCE[(index + 1) % PRESSURE_UNIT_SEQUENCE.length]
}

/** kPa → 目标单位的换算系数 */
export function getPressureUnitScale(unit) {
  return normalizePressureUnit(unit) === PRESSURE_UNIT_N_CM2 ? N_CM2_PER_KPA : 1
}

/** N/cm² 数值是 kPa 的 1/10，多留一位小数保持精度等价 */
export function getPressureUnitDigits(unit) {
  return normalizePressureUnit(unit) === PRESSURE_UNIT_N_CM2 ? 2 : 1
}

export function convertPressureValue(kpaValue, unit) {
  // null / undefined / '' 被 Number() 转成 0，会把空值显示成 0.00，这里先挡掉
  if (kpaValue === null || kpaValue === undefined || kpaValue === '') return null
  const numeric = Number(kpaValue)
  if (!Number.isFinite(numeric)) return null
  return numeric * getPressureUnitScale(unit)
}

export function formatPressureValue(kpaValue, unit) {
  const converted = convertPressureValue(kpaValue, unit)
  if (converted === null) return '-'
  return converted.toFixed(getPressureUnitDigits(unit))
}

export function getPressureMetricMeta(mode) {
  const normalizedMode = normalizePressureMetricMode(mode)
  if (normalizedMode === ADC_METRIC_MODE) {
    return {
      mode: normalizedMode,
      unit: 'ADC',
      label: '原始ADC',
      englishLabel: 'Raw ADC',
      valuePrefix: 'adc',
      trendField: 'adcArr',
    }
  }
  return normalizedMode === PRESSURE_METRIC_MODE
    ? {
        mode: normalizedMode,
        unit: 'kPa',
        label: '压强',
        englishLabel: 'Pressure',
        valuePrefix: 'pressure',
        trendField: 'pressureArr',
      }
    : {
        mode: normalizedMode,
        unit: 'N',
        label: '压力',
        englishLabel: 'Force',
        valuePrefix: 'force',
        trendField: 'forceArr',
      }
}

const PRESSURE_METRIC_DISPLAY = {
  [ADC_METRIC_MODE]: {
    unit: 'ADC',
    valuePrefix: 'adc',
    trendField: 'adcArr',
    zh: {
      name: '原始ADC',
      curve: '原始ADC总和曲线',
      axis: '原始ADC总和',
      average: '平均原始ADC',
      max: '最大原始ADC',
      total: '原始ADC总和',
      data: '原始ADC数据',
    },
    en: {
      name: 'Raw ADC',
      curve: 'Raw ADC Sum Curve',
      axis: 'Raw ADC Sum',
      average: 'Average Raw ADC',
      max: 'Maximum Raw ADC',
      total: 'Raw ADC Sum',
      data: 'Raw ADC Data',
    },
  },
  [PRESSURE_METRIC_MODE]: {
    unit: 'kPa',
    valuePrefix: 'pressure',
    trendField: 'pressureArr',
    zh: {
      name: '压强',
      curve: '压强总和曲线',
      axis: '压强总和',
      average: '平均压强',
      max: '最大压强',
      total: '压强总和',
      data: '压强数据',
    },
    en: {
      name: 'Pressure',
      curve: 'Pressure Sum Curve',
      axis: 'Pressure Sum',
      average: 'Average Pressure',
      max: 'Maximum Pressure',
      total: 'Pressure Sum',
      data: 'Pressure Data',
    },
  },
  [FORCE_METRIC_MODE]: {
    unit: 'N',
    valuePrefix: 'force',
    trendField: 'forceArr',
    zh: {
      name: '压力',
      curve: '压力总和曲线',
      axis: '压力总和',
      average: '平均压力',
      max: '最大压力',
      total: '压力总和',
      data: '压力数据',
    },
    en: {
      name: 'Force',
      curve: 'Total Force Curve',
      axis: 'Total Force',
      average: 'Average Force',
      max: 'Maximum Force',
      total: 'Total Force',
      data: 'Force Data',
    },
  },
}

// pressureUnit 只作用于压强指标：adc / 压力(N) 模式下恒为原单位、系数 1，
// 所以不传第 4 个参数的老调用点行为完全不变。
export function getPressureMetricDisplay(mode, _t, language = 'zh', pressureUnit) {
  const normalizedMode = normalizePressureMetricMode(mode)
  const config = PRESSURE_METRIC_DISPLAY[normalizedMode]
  const labels = String(language || '').toLowerCase().startsWith('en') ? config.en : config.zh
  const currentIndex = PRESSURE_METRIC_MODE_SEQUENCE.indexOf(normalizedMode)
  const usePressureUnit = normalizedMode === PRESSURE_METRIC_MODE && pressureUnit !== undefined
  const unit = usePressureUnit ? normalizePressureUnit(pressureUnit) : config.unit
  const valueScale = usePressureUnit ? getPressureUnitScale(pressureUnit) : 1
  const valueDigits = usePressureUnit ? getPressureUnitDigits(pressureUnit) : 1
  return {
    mode: normalizedMode,
    nextMode: PRESSURE_METRIC_MODE_SEQUENCE[(currentIndex + 1) % PRESSURE_METRIC_MODE_SEQUENCE.length],
    unit,
    valueScale,
    valueDigits,
    /** kPa 原始值 → 当前单位下的显示文本 */
    formatValue: (value) => {
      const numeric = Number(value)
      if (!Number.isFinite(numeric)) return '-'
      return (numeric * valueScale).toFixed(valueDigits)
    },
    name: labels.name,
    curveLabel: labels.curve,
    axisLabel: labels.axis,
    valuePrefix: config.valuePrefix,
    trendField: config.trendField,
    labels: {
      average: labels.average,
      max: labels.max,
      total: labels.total,
      data: labels.data,
    },
  }
}

export function normalizeMetricValues(values = [], expectedLength) {
  const source = Array.isArray(values) ? values : []
  const length = Number.isInteger(expectedLength) && expectedLength >= 0
    ? expectedLength
    : source.length
  return Array.from({ length }, (_, index) => {
    const numeric = Number(source[index])
    return Number.isFinite(numeric) && numeric > 0 ? numeric : 0
  })
}

export function countActiveMetricPoints(values = []) {
  return normalizeMetricValues(values).filter((value) => value > 0).length
}

export function summarizeMetricValues(values = []) {
  const normalized = normalizeMetricValues(values)
  const activeValues = normalized.filter((value) => value > 0)
  const total = normalized.reduce((sum, value) => sum + value, 0)
  return {
    metricValues: normalized,
    activeCount: activeValues.length,
    total,
    max: activeValues.length ? Math.max(...activeValues) : 0,
    average: activeValues.length ? total / activeValues.length : 0,
  }
}

export function getCanonicalMetricSummary(pressureValues, forceValues, mode, adcValues = []) {
  const normalizedMode = normalizePressureMetricMode(mode)
  const adcSummary = summarizeMetricValues(adcValues)
  const pressureSummary = summarizeMetricValues(pressureValues)
  const forceSummary = summarizeMetricValues(forceValues)
  const activeSummary = normalizedMode === ADC_METRIC_MODE
    ? adcSummary
    : normalizedMode === PRESSURE_METRIC_MODE
      ? pressureSummary
      : forceSummary
  return {
    ...getPressureMetricMeta(normalizedMode),
    ...activeSummary,
    adcSummary,
    pressureSummary,
    forceSummary,
    forceTotal: forceSummary.total,
  }
}
