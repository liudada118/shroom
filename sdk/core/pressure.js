'use strict'

const { distributeWeightPointPressures } = require('./weightPointPressureNormalization')

const DEFAULT_PRESSURE_FORMULA_PROFILE = 'adc-matrix-to-pressure-filter30-v2.7.63'
const LEGACY_NATIVE_CALIBRATION_PROFILES = new Set([
  'point_pressure_calibration',
  'calibration_v2746_seat_v2752_backrest',
])
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
  leftSlope: 0.042221396731054977,
  highPressureClampKPa: 27,
  segments: [
    { lo: 53.84, hi: 61.33375, a: 2.2732, b: 0.06000000000000003 },
    { lo: 61.33375, hi: 68.8275, a: 2.7228250000000003, b: 0.06382641966890193 },
    { lo: 68.8275, hi: 76.32125, a: 3.201124232393834, b: 0.06682641966890183 },
    { lo: 76.32125, hi: 83.815, a: 3.7019047147876676, b: 0.06982641966890177 },
    { lo: 83.815, hi: 91.30875, a: 4.2251664471815, b: 0.07282641966890172 },
    { lo: 91.30875, hi: 98.8025, a: 4.770909429575332, b: 0.07582641966890165 },
    { lo: 98.8025, hi: 106.29625, a: 5.339133661969163, b: 0.07882641966890166 },
    { lo: 106.29625, hi: 113.79, a: 5.929839144362996, b: 0.12623356167051475 },
    { lo: 113.79, hi: 121.28375, a: 6.875801897131416, b: 0.1292335616705143 },
    { lo: 121.28375, hi: 128.7775, a: 7.844245899899832, b: 0.15661037138419087 },
    { lo: 128.7775, hi: 136.27125, a: 9.017844870460113, b: 0.15961037138419065 },
    { lo: 136.27125, hi: 143.765, a: 10.213925091020393, b: 0.3384472701670871 },
    { lo: 143.765, hi: 151.25875, a: 12.750164321834994, b: 0.3414472701670874 },
    { lo: 151.25875, hi: 158.7525, a: 15.308884802649617, b: 0.3444472701670879 },
    { lo: 158.7525, hi: 166.24625, a: 17.890086533464224, b: 0.4839608686196772 },
    { lo: 166.24625, hi: 173.74, a: 21.516768292682933, b: 0.7317073170731694 },
  ],
}

const NATIVE_BACKREST_PROFILE = {
  topStartRank: 1,
  topEndRank: 46,
  lowMode: 'zero-origin',
  leftSlope: 0.033439088248883412,
  highPressureClampKPa: 27,
  segments: [
    { lo: 64.93, hi: 77.99578947368421, a: 2.171199999999999, b: 0.04000000000000015 },
    { lo: 77.99578947368421, hi: 107.9942105263158, a: 2.693831578947369, b: 0.07152099258507517 },
    { lo: 107.9942105263158, hi: 116.5842105263158, a: 4.839348428616596, b: 0.07452099258507523 },
    { lo: 116.5842105263158, hi: 128.00263157894736, a: 5.479483754922392, b: 0.14953903662226653 },
    { lo: 128.00263157894736, hi: 135.86894736842106, a: 7.186983438880322, b: 0.1525390366222664 },
    { lo: 135.86894736842106, hi: 142.54315789473685, a: 8.386903671173163, b: 0.15553903662226615 },
    { lo: 142.54315789473685, hi: 148.77052631578945, a: 9.42500394665051, b: 0.15853903662226654 },
    { lo: 148.77052631578945, hi: 154.32736842105265, a: 10.412284936816114, b: 0.2465713823659119 },
    { lo: 154.32736842105265, hi: 159.07789473684213, a: 11.782443176299966, b: 0.2495713823659125 },
    { lo: 159.07789473684213, hi: 162.78105263157894, a: 12.96803859589719, b: 0.39822322147755757 },
    { lo: 162.78105263157894, hi: 165.38210526315788, a: 14.442722062379335, b: 0.4012232214775568 },
    { lo: 165.38210526315788, hi: 170.20105263157893, a: 15.486324778454113, b: 0.40422322147755524 },
    { lo: 170.20105263157893, hi: 173.70842105263156, a: 17.434255207848057, b: 0.44139613105542036 },
    { lo: 173.70842105263156, hi: 175.1836842105263, a: 18.982394059086648, b: 0.5020594652919378 },
    { lo: 175.1836842105263, hi: 178.69052631578947, a: 19.72306389130418, b: 0.5050594652919369 },
    { lo: 178.69052631578947, hi: 180.56894736842105, a: 21.49422768985164, b: 0.5080594652919352 },
    { lo: 180.56894736842105, hi: 181.79736842105265, a: 22.448577285444756, b: 0.5110594652919322 },
    { lo: 181.79736842105265, hi: 189.43, a: 23.076373491756016, b: 0.514059465291931 },
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
  const nextProfile = LEGACY_NATIVE_CALIBRATION_PROFILES.has(configuredProfile)
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
  return segment.a
    + segment.b * dx
    + (Number(segment.c) || 0) * dx * dx
    + (Number(segment.d) || 0) * dx * dx * dx
}

function calculateNativeBasePressure(adc, sensor) {
  const value = Number(adc)
  if (!Number.isFinite(value) || value <= NATIVE_CALIBRATION_MIN_ADC) return null
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
    Number.isFinite(value) && value > 0 && (minAdc === 0 || value > minAdc) ? value : 0
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
    if (isNativeCalibration) return nativeMinAdc === 0 || value > nativeMinAdc ? value : 0
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
