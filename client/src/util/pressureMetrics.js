// Browser-safe mirror of server/kpa/pressureFormula_V2.7.38.js.
// Keep estimatePressure/estimateMaxPressure constants synchronized with that file.
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

const SENSOR_META = {
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
  const meta = SENSOR_META[sensor]
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
  if (value.includes('carY-back')) return (10 * 19) / 100
  if (value.includes('carY-sit')) return (15 * 15) / 100
  if (value.includes('back')) return (13 * 10) / 100
  if (value.includes('sit')) return (10 * 10) / 100
  return 1
}

function getCalibrationAverage(positiveValues, sensor) {
  const meta = SENSOR_META[sensor]
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
