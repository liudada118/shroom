export const DEFAULT_EPSILON = 1e-12

function assertFunction(value, name) {
  if (typeof value !== 'function') throw new TypeError(`${name}必须是函数`)
}

function isFinitePositive(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric > 0
}

function roundTo(value, digits = 2) {
  if (!Number.isFinite(value)) return value
  const scale = 10 ** digits
  return Math.round((value + Number.EPSILON) * scale) / scale
}

function normalizeMatrix(data) {
  if (!Array.isArray(data)) throw new TypeError('data必须是一维ADC数组或二维ADC矩阵')
  const isMatrix = data.some(Array.isArray)
  if (!isMatrix) return { matrix: [data], wasMatrix: false }
  if (!data.every(Array.isArray)) throw new TypeError('data不能混合一维数值和二维数组')
  return { matrix: data, wasMatrix: true }
}

export function calculateRankMean(validAdc, startRank, endRank) {
  if (!Number.isInteger(startRank) || !Number.isInteger(endRank) || startRank < 1 || endRank < startRank) {
    throw new RangeError('startRank和endRank必须是有效的1起计闭区间')
  }

  const sorted = [...validAdc].sort((left, right) => right - left)
  const startIndex = sorted.length >= startRank ? startRank - 1 : 0
  const selected = sorted.slice(startIndex, Math.min(endRank, sorted.length))
  const mean = selected.length
    ? selected.reduce((sum, value) => sum + value, 0) / selected.length
    : 0

  return {
    mean,
    selectedCount: selected.length,
    validCount: sorted.length,
    maxAdc: sorted[0] ?? 0,
  }
}

export function distributeWeightPointPressures(data, options) {
  if (!options || typeof options !== 'object') throw new TypeError('options不能为空')
  assertFunction(options.curve, 'options.curve')

  const startRank = options.startRank ?? 1
  const endRank = options.endRank ?? 46
  const epsilon = options.epsilon ?? DEFAULT_EPSILON
  const { matrix } = normalizeMatrix(data)
  const validPoints = []

  for (let row = 0; row < matrix.length; row += 1) {
    for (let column = 0; column < matrix[row].length; column += 1) {
      const adc = Number(matrix[row][column])
      if (isFinitePositive(adc)) validPoints.push({ row, column, adc })
    }
  }

  const rankInput = calculateRankMean(validPoints.map((point) => point.adc), startRank, endRank)
  const pressureMatrixKPa = matrix.map((row) => row.map(() => 0))
  if (!validPoints.length) {
    return {
      pressureMatrixKPa,
      pressureValuesKPa: [],
      targetAveragePressureKPa: null,
      actualAveragePressureKPa: null,
      maxPressureKPa: null,
      referenceAdcMean: 0,
      selectedCount: 0,
      validCount: 0,
      curveResponseMeanKPa: 0,
      normalizationScale: null,
      meanConservationErrorKPa: null,
      fallbackMode: 'no-valid-points',
    }
  }

  const fittedTarget = options.targetAveragePressureKPa === undefined
    ? options.curve(rankInput.mean)
    : Number(options.targetAveragePressureKPa)
  if (fittedTarget === null || fittedTarget === undefined) {
    throw new RangeError('标定曲线无法为排序ADC均值计算Pbar')
  }
  if (!Number.isFinite(fittedTarget)) throw new RangeError('拟合平均压强Pbar必须是有限数值')

  const targetAveragePressureKPa = Math.max(0, Number(fittedTarget))
  const curveResponses = validPoints.map(({ adc }) => {
    const response = options.curve(adc)
    if (response === null || response === undefined) return 0
    const numeric = Number(response)
    if (!Number.isFinite(numeric)) throw new RangeError(`曲线F(${adc})返回了非有限数值`)
    return Math.max(0, numeric)
  })
  const curveResponseMeanKPa = curveResponses.reduce((sum, value) => sum + value, 0) / curveResponses.length

  let normalizationScale = null
  let fallbackMode = 'none'
  let pressureValuesKPa
  if (targetAveragePressureKPa <= epsilon) {
    pressureValuesKPa = curveResponses.map(() => 0)
    normalizationScale = curveResponseMeanKPa > epsilon ? 0 : null
    fallbackMode = 'all-zero'
  } else if (curveResponseMeanKPa <= epsilon) {
    pressureValuesKPa = curveResponses.map(() => targetAveragePressureKPa)
    fallbackMode = 'equal-distribution'
  } else {
    normalizationScale = targetAveragePressureKPa / curveResponseMeanKPa
    pressureValuesKPa = curveResponses.map((response) => response * normalizationScale)
  }

  const targetSum = targetAveragePressureKPa * pressureValuesKPa.length
  const currentSum = pressureValuesKPa.reduce((sum, value) => sum + value, 0)
  pressureValuesKPa[pressureValuesKPa.length - 1] += targetSum - currentSum

  validPoints.forEach((point, index) => {
    pressureMatrixKPa[point.row][point.column] = pressureValuesKPa[index]
  })

  const actualAveragePressureKPa = pressureValuesKPa.reduce((sum, value) => sum + value, 0) / pressureValuesKPa.length
  return {
    pressureMatrixKPa,
    pressureValuesKPa,
    targetAveragePressureKPa,
    actualAveragePressureKPa,
    maxPressureKPa: Math.max(...pressureValuesKPa),
    referenceAdcMean: rankInput.mean,
    selectedCount: rankInput.selectedCount,
    validCount: rankInput.validCount,
    curveResponseMeanKPa,
    normalizationScale,
    meanConservationErrorKPa: actualAveragePressureKPa - targetAveragePressureKPa,
    fallbackMode,
  }
}

function evaluateLocal(segment, adc) {
  const dx = adc - segment.lo
  return segment.a
    + segment.b * dx
    + (segment.c ?? 0) * dx * dx
    + (segment.d ?? 0) * dx * dx * dx
}

export function createPiecewiseCurve(config) {
  if (!config || !Array.isArray(config.segments) || !config.segments.length) {
    throw new TypeError('config.segments不能为空')
  }

  const minPressure = config.minPressure ?? 0
  const maxPressure = config.maxPressure ?? Infinity
  return function curve(adc) {
    const value = Number(adc)
    if (!Number.isFinite(value) || value <= 0) return null
    const first = config.segments[0]
    const last = config.segments[config.segments.length - 1]
    let raw
    if (value <= first.lo) {
      raw = config.lowMode === 'zero-origin'
        ? (config.leftSlope ?? first.b) * value
        : evaluateLocal(first, value)
    } else if (value > last.hi) {
      raw = Number.isFinite(config.highClampStart) && value >= config.highClampStart
        ? maxPressure
        : evaluateLocal(last, value)
    } else {
      const segment = config.segments.find((item) => value <= item.hi) ?? last
      raw = evaluateLocal(segment, value)
    }
    return Math.min(maxPressure, Math.max(minPressure, raw))
  }
}

export function formatDistribution(result, digits = 2) {
  return {
    ...result,
    pressureMatrixKPa: result.pressureMatrixKPa.map((row) => row.map((value) => roundTo(value, digits))),
    pressureValuesKPa: result.pressureValuesKPa.map((value) => roundTo(value, digits)),
    targetAveragePressureKPa: result.targetAveragePressureKPa === null
      ? null
      : roundTo(result.targetAveragePressureKPa, digits),
    actualAveragePressureKPa: result.actualAveragePressureKPa === null
      ? null
      : roundTo(result.actualAveragePressureKPa, digits),
    maxPressureKPa: result.maxPressureKPa === null ? null : roundTo(result.maxPressureKPa, digits),
    curveResponseMeanKPa: roundTo(result.curveResponseMeanKPa, digits),
    normalizationScale: result.normalizationScale === null ? null : roundTo(result.normalizationScale, 6),
    meanConservationErrorKPa: result.meanConservationErrorKPa === null
      ? null
      : roundTo(result.meanConservationErrorKPa, 12),
  }
}
