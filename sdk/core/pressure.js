'use strict'

const { distributeWeightPointPressures } = require('./weightPointPressureNormalization')

const DEFAULT_PRESSURE_FORMULA_PROFILE = 'point_pressure_calibration'
const LEGACY_NATIVE_CALIBRATION_PROFILE = 'calibration_v2746_seat_v2752_backrest'
const LEGACY_PRESSURE_FORMULA_PROFILE = 'V2.7.38中英文logo'
const MIN_ADC = 30
const NATIVE_CALIBRATION_MIN_ADC = 30
const NATIVE_BACKREST_CALIBRATION_MIN_ADC = NATIVE_CALIBRATION_MIN_ADC
const NATIVE_HUMAN_VALID_POINT_THRESHOLD = 300
const NATIVE_HUMAN_COEFFICIENT = 2.2

const NATIVE_SEAT_PROFILE = {
  topStartRank: 5,
  topEndRank: 70,
  lowMode: 'zero-origin',
  leftSlope: 0.029128888206340246,
  highPressureClampKPa: 18.5,
  segments: [
    { lo: 85.82545211786852, hi: 121.5036992910407, a: 2.5, b: 0.02514685021658099, c: 0.0017825667387957197, d: -1.4670793073122023e-5 },
    { lo: 121.5036992910407, hi: 139.641626683983, a: 5, b: 0.09631956352570038, c: 0.0027903094592002, d: -2.7652576622304387e-5 },
    { lo: 139.641626683983, hi: 151.33637260464792, a: 7.5, b: 0.17024862445085923, c: 0.005306109727072367, d: -0.00013549326385175618 },
    { lo: 151.33637260464792, hi: 160.67119079377784, a: 10, b: 0.23876277957790853, c: 0.004456199006891006, d: -0.000143977733492508 },
    { lo: 160.67119079377784, hi: 168.94354707035922, a: 12.5, b: 0.2843202406683852, c: 0.0183281389088602, d: -0.0019541445263075077 },
    { lo: 168.94354707035922, hi: 189.17, a: 15, b: 0.1863766889442589, c: -9.649901079908721e-5, d: -0.00014867500346334297 },
  ],
}

const NATIVE_BACKREST_PROFILE = {
  topStartRank: 1,
  topEndRank: 46,
  lowMode: 'first-segment',
  leftSlope: 0.061300639659,
  highPressureClampKPa: 18.5,
  segments: [
    { lo: 98.304347826, hi: 139.086956522, a: 2.5, b: 0.061300639659, c: 0, d: 0 },
    { lo: 139.086956522, hi: 158.195652174, a: 5, b: 0.130830489192, c: 0, d: 0 },
    { lo: 158.195652174, hi: 171.282608696, a: 7.5, b: 0.191029900332, c: 0, d: 0 },
    { lo: 171.282608696, hi: 180.086956522, a: 10, b: 0.283950617284, c: 0, d: 0 },
    { lo: 180.086956522, hi: 188.217391304, a: 12.5, b: 0.307486631016, c: 0, d: 0 },
    { lo: 188.217391304, hi: 194.47826087, a: 15, b: 0.399305555556, c: 0, d: 0 },
    { lo: 194.47826087, hi: 196.982608696, a: 17.5, b: 0.399305555556, c: 0, d: 0 },
  ],
}

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
  return (PRESSURE_FORMULA_PROFILES[activePressureFormulaProfile] || PRESSURE_FORMULA_PROFILES[LEGACY_PRESSURE_FORMULA_PROFILE])[sensor]
}

function setPressureFormulaProfile(profile) {
  const configuredProfile = String(profile || '').trim()
  const nextProfile = configuredProfile === LEGACY_NATIVE_CALIBRATION_PROFILE
    ? DEFAULT_PRESSURE_FORMULA_PROFILE
    : configuredProfile
  if (nextProfile !== DEFAULT_PRESSURE_FORMULA_PROFILE && !PRESSURE_FORMULA_PROFILES[nextProfile]) {
    activePressureFormulaProfile = DEFAULT_PRESSURE_FORMULA_PROFILE
    return activePressureFormulaProfile
  }
  activePressureFormulaProfile = nextProfile
  return activePressureFormulaProfile
}

function getPressureFormulaProfile() {
  return activePressureFormulaProfile
}

function getPressureSensor(key) {
  const value = String(key || '').toLowerCase()
  if (value.includes('back')) return 'backrest'
  if (value.includes('sit') || value.includes('seat')) return 'seat'
  return ''
}

function getNativeProfile(sensor) {
  return sensor === 'backrest' ? NATIVE_BACKREST_PROFILE : NATIVE_SEAT_PROFILE
}

function evaluateNativeSegment(adc, segment) {
  const dx = adc - segment.lo
  return segment.a + segment.b * dx + segment.c * dx * dx + segment.d * dx * dx * dx
}

function calculateNativeBasePressure(adc, sensor) {
  const value = Number(adc)
  if (!Number.isFinite(value) || value <= 0) return null
  const profile = getNativeProfile(sensor)
  const first = profile.segments[0]
  const last = profile.segments[profile.segments.length - 1]
  let raw
  if (value <= first.lo) {
    raw = profile.lowMode === 'zero-origin'
      ? profile.leftSlope * value
      : evaluateNativeSegment(value, first)
  } else if (value > last.hi) {
    raw = profile.highPressureClampKPa
  } else {
    raw = evaluateNativeSegment(value, profile.segments.find((segment) => value <= segment.hi) || last)
  }
  return Math.min(profile.highPressureClampKPa, Math.max(0, raw))
}

function getNativeCalibrationAverage(positiveValues, sensor) {
  if (!positiveValues.length) return 0
  const profile = getNativeProfile(sensor)
  const sorted = [...positiveValues].sort((left, right) => right - left)
  const startIndex = sorted.length >= profile.topStartRank ? profile.topStartRank - 1 : 0
  const selected = sorted.slice(startIndex, Math.min(profile.topEndRank, sorted.length))
  return selected.length
    ? selected.reduce((sum, value) => sum + value, 0) / selected.length
    : 0
}

function getNativePressureDistribution(values, sensor) {
  const minAdc = NATIVE_CALIBRATION_MIN_ADC
  const filteredValues = values.map((value) => (
    Number.isFinite(value) && value > 0 && (minAdc === 0 || value >= minAdc) ? value : 0
  ))
  const validValues = filteredValues.filter((value) => value > 0)
  const adcAvg = getNativeCalibrationAverage(validValues, sensor)
  if (!validValues.length) {
    return {
      pressureValues: filteredValues,
      adcAvg: 0,
      summaryAveragePressureKPa: 0,
      summaryMaxPressureKPa: 0,
      normalizationScale: null,
      meanConservationErrorKPa: null,
      branch: 'weight',
      validCount: 0,
      selectedCount: 0,
    }
  }
  const usesHumanCoefficient = validValues.length > NATIVE_HUMAN_VALID_POINT_THRESHOLD
  if (!usesHumanCoefficient) {
    const profile = getNativeProfile(sensor)
    const distribution = distributeWeightPointPressures(filteredValues, {
      curve: (adc) => calculateNativeBasePressure(adc, sensor),
      startRank: profile.topStartRank,
      endRank: profile.topEndRank,
    })
    return {
      pressureValues: distribution.pressureMatrixKPa[0],
      adcAvg: distribution.referenceAdcMean,
      summaryAveragePressureKPa: distribution.actualAveragePressureKPa || 0,
      summaryMaxPressureKPa: distribution.maxPressureKPa || 0,
      normalizationScale: distribution.normalizationScale,
      meanConservationErrorKPa: distribution.meanConservationErrorKPa,
      branch: 'weight',
      validCount: distribution.validCount,
      selectedCount: distribution.selectedCount,
    }
  }
  const pressureValues = filteredValues.map((value) => (
    value > 0
      ? Math.max(0, calculateNativeBasePressure(value, sensor) || 0) * NATIVE_HUMAN_COEFFICIENT
      : 0
  ))
  const activePressureValues = pressureValues.filter((value) => value > 0)
  const validPointPressures = pressureValues.filter((_, index) => filteredValues[index] > 0)
  return {
    pressureValues,
    adcAvg,
    summaryAveragePressureKPa: validPointPressures.length
      ? validPointPressures.reduce((sum, value) => sum + value, 0) / validPointPressures.length
      : 0,
    summaryMaxPressureKPa: activePressureValues.length ? Math.max(...activePressureValues) : 0,
    normalizationScale: 1,
    meanConservationErrorKPa: 0,
    branch: 'human',
    validCount: validValues.length,
    selectedCount: validValues.length,
  }
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

function estimatePressure(adcAvg, nValid, sensor) {
  if (activePressureFormulaProfile === DEFAULT_PRESSURE_FORMULA_PROFILE) {
    const basePressure = calculateNativeBasePressure(adcAvg, sensor)
    if (basePressure === null) return null
    const pointPressureScale = Number(nValid) > NATIVE_HUMAN_VALID_POINT_THRESHOLD
      ? NATIVE_HUMAN_COEFFICIENT
      : 1
    return Number((Math.max(0, basePressure) * pointPressureScale).toFixed(2))
  }
  const meta = getActiveSensorMeta(sensor)
  if (!meta || adcAvg <= 0) return null
  if (nValid !== undefined && nValid >= meta.humanThreshold) {
    return Number(Math.max(0, meta.humanAlpha * adcAvg * adcAvg).toFixed(2))
  }
  return Number((calcFiveSegment(adcAvg, meta) || 0).toFixed(2))
}

function estimateMaxPressure(adcMax, nValid, sensor, adcAvg) {
  if (adcMax <= 0 || adcAvg <= 0) return null
  const avgP = estimatePressure(adcAvg, nValid, sensor)
  if (avgP === null || avgP <= 0) return null
  return Number(Math.max(0, avgP * (adcMax / adcAvg)).toFixed(2))
}

function getPressurePointAreaCm2(key) {
  const value = String(key || '').toLowerCase()
  if (value.includes('cary-back')) return (10 * 19) / 100
  if (value.includes('cary-sit')) return (15 * 15) / 100
  if (value.includes('back')) return (13 * 10) / 100
  if (value.includes('sit')) return (10 * 10) / 100
  return 1
}

function computePressureMetrics(arr, key, options = {}) {
  if (options.profile) setPressureFormulaProfile(options.profile)
  const values = Array.isArray(arr) ? arr.map((value) => Number(value) || 0) : []
  const rawPress = values.reduce((sum, value) => sum + value, 0)
  const rawMax = values.length ? Math.max(...values) : 0
  const pointAreaCm2 = Number(options.pointAreaCm2) > 0 ? Number(options.pointAreaCm2) : getPressurePointAreaCm2(key)
  const sensor = getPressureSensor(key)

  if (!sensor) {
    const pressureValues = values.map((value) => (value > 0 ? value : 0))
    const activePressureValues = pressureValues.filter((value) => value > 0)
    const activeCount = activePressureValues.length
    const pressureTotal = pressureValues.reduce((sum, value) => sum + value, 0)
    const forceValues = pressureValues.map((value) => value * pointAreaCm2 * 0.1)
    const total = forceValues.reduce((sum, value) => sum + value, 0)
    return {
      activeCount,
      effectiveArea: activeCount * pointAreaCm2,
      rawPress,
      rawMax,
      rawAvg: activeCount ? pressureTotal / activeCount : 0,
      pressMax: activeCount ? Math.max(...activePressureValues) : 0,
      pressAver: activeCount ? pressureTotal / activeCount : 0,
      pressureTotal,
      pressureValues,
      forceValues,
      total,
    }
  }

  const isNativeCalibration = activePressureFormulaProfile === DEFAULT_PRESSURE_FORMULA_PROFILE
  const nativeMinAdc = NATIVE_CALIBRATION_MIN_ADC
  const filteredValues = values.map((value) => {
    if (!Number.isFinite(value) || value <= 0) return 0
    if (isNativeCalibration) return nativeMinAdc === 0 || value >= nativeMinAdc ? value : 0
    return value > MIN_ADC ? value : 0
  })
  const validValues = filteredValues.filter((value) => value > 0)
  const rawAvg = validValues.length
    ? validValues.reduce((sum, value) => sum + value, 0) / validValues.length
    : 0
  if (!validValues.length) {
    const pressureValues = filteredValues
    return {
      activeCount: 0,
      effectiveArea: 0,
      rawPress,
      rawMax,
      rawAvg,
      adcAvg: 0,
      sensor,
      pressMax: 0,
      pressAver: 0,
      matrixPressMax: 0,
      matrixPressAver: 0,
      pressureTotal: 0,
      pressureValues,
      forceValues: pressureValues.map((value) => value * pointAreaCm2 * 0.1),
      forceMax: 0,
      forceAver: 0,
      total: 0,
      calibrationInputMinAdc: isNativeCalibration ? nativeMinAdc : MIN_ADC,
      calibrationValidCount: 0,
    }
  }

  let distribution
  if (isNativeCalibration) {
    distribution = getNativePressureDistribution(filteredValues, sensor)
  } else {
    const meta = getActiveSensorMeta(sensor)
    const endRank = validValues.length >= meta.humanThreshold
      ? validValues.length
      : Math.min(meta.topCount, validValues.length)
    const legacyDistribution = distributeWeightPointPressures(filteredValues, {
      curve: (adc) => estimatePressure(adc, validValues.length, sensor),
      startRank: 1,
      endRank,
    })
    distribution = {
      pressureValues: legacyDistribution.pressureMatrixKPa[0],
      adcAvg: legacyDistribution.referenceAdcMean,
      normalizationScale: legacyDistribution.normalizationScale,
      meanConservationErrorKPa: legacyDistribution.meanConservationErrorKPa,
      branch: 'average-formula',
    }
  }
  const pressureValues = distribution.pressureValues
  const activePressureValues = pressureValues.filter((value) => value > 0)
  const activeCount = activePressureValues.length
  const pressureTotal = pressureValues.reduce((sum, value) => sum + value, 0)
  const forceValues = pressureValues.map((value) => value * pointAreaCm2 * 0.1)
  const total = forceValues.reduce((sum, value) => sum + value, 0)
  const matrixPressMax = activeCount ? Math.max(...activePressureValues) : 0
  const averagePointCount = isNativeCalibration ? validValues.length : activeCount
  const matrixPressAver = averagePointCount ? pressureTotal / averagePointCount : 0
  const pressMax = matrixPressMax
  const pressAver = matrixPressAver

  return {
    activeCount,
    averagePointCount,
    effectiveArea: activeCount * pointAreaCm2,
    rawPress,
    rawMax,
    rawAvg,
    adcAvg: distribution.adcAvg,
    sensor,
    pressMax,
    pressAver,
    matrixPressMax,
    matrixPressAver,
    pressureTotal,
    pressureValues,
    forceValues,
    forceMax: pressMax * pointAreaCm2 * 0.1,
    forceAver: pressAver * pointAreaCm2 * 0.1,
    total,
    normalizationScale: distribution.normalizationScale,
    meanConservationErrorKPa: distribution.meanConservationErrorKPa,
    pressureCalibrationBranch: distribution.branch,
    calibrationInputMinAdc: isNativeCalibration ? nativeMinAdc : MIN_ADC,
    calibrationValidCount: validValues.length,
  }
}

module.exports = {
  DEFAULT_PRESSURE_FORMULA_PROFILE,
  NATIVE_CALIBRATION_MIN_ADC,
  NATIVE_BACKREST_CALIBRATION_MIN_ADC,
  PRESSURE_FORMULA_PROFILES,
  setPressureFormulaProfile,
  getPressureFormulaProfile,
  getPressureSensor,
  estimatePressure,
  estimateMaxPressure,
  getPressurePointAreaCm2,
  computePressureMetrics,
}
