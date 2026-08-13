// Browser-safe mirror of util/gradientMetrics.js.
// 修改任意一侧时请同步另一侧，保证首页面板、数据对比与数据下载的口径一致。
//
// 【对称系数】部位数据左右平均各分一半，按中线对折，相叠加的点为对称点。
//   每行：分子 = Σ|左点 − 右点|，分母 = Σ(左点 + 右点)，行系数 = 1 − 分子/分母。
//   最终系数 = 有效行系数之和 / 有效行数（整行为 0 的行跳过）。
// 【压力梯度】grad p = sqrt((∂p/∂x)² + (∂p/∂y)²)，中心差分，d = 1.25 cm。
//   仅内部点（去掉最外一圈）且压力 > 0 的点参与计算。

export const GRADIENT_UNIT_PA_CM = 'pa/cm'
export const GRADIENT_UNIT_N_CM3 = 'N/cm³'
export const GRADIENT_UNIT_SEQUENCE = [GRADIENT_UNIT_PA_CM, GRADIENT_UNIT_N_CM3]
// 1 N/cm³ = 10000 pa/cm
export const PA_CM_PER_N_CM3 = 10000
// 传感器点间距 12.5 mm = 1.25 cm
export const GRADIENT_POINT_SPACING_CM = 1.25
// 内部压强以 kPa 存储，梯度公式要求 pa
const PA_PER_KPA = 1000

export function normalizeGradientUnit(unit) {
  const value = String(unit || '').trim()
  if (!value) return GRADIENT_UNIT_PA_CM
  const lower = value.toLowerCase()
  if (lower === 'n/cm³' || lower === 'n/cm3' || lower === 'ncm3') return GRADIENT_UNIT_N_CM3
  return GRADIENT_UNIT_PA_CM
}

export function getNextGradientUnit(unit) {
  const index = GRADIENT_UNIT_SEQUENCE.indexOf(normalizeGradientUnit(unit))
  return GRADIENT_UNIT_SEQUENCE[(index + 1) % GRADIENT_UNIT_SEQUENCE.length]
}

/** pa/cm 原始值 → 目标单位数值 */
export function convertGradientValue(paPerCm, unit) {
  const numeric = Number(paPerCm)
  if (!Number.isFinite(numeric)) return null
  return normalizeGradientUnit(unit) === GRADIENT_UNIT_N_CM3
    ? numeric / PA_CM_PER_N_CM3
    : numeric
}

/** 不同量级下保留合适的小数位 */
export function formatGradientValue(paPerCm, unit) {
  const converted = convertGradientValue(paPerCm, unit)
  if (converted === null) return '-'
  return normalizeGradientUnit(unit) === GRADIENT_UNIT_N_CM3
    ? converted.toFixed(4)
    : converted.toFixed(2)
}

function getMatrixPartName(key) {
  const text = String(key || '').trim().toLowerCase()
  if (!text) return ''
  return text.includes('-') ? text.split('-').pop() : text
}

/** 对称系数仅 上身(jacket) / 下身(foot) 有；左右臂不呈现 */
export function supportsSymmetryCoefficient(key) {
  return ['jacket', 'foot'].includes(getMatrixPartName(key))
}

/** 压力梯度 上身 / 下身 / 左臂 / 右臂 都有 */
export function supportsPressureGradient(key) {
  return ['jacket', 'foot', 'lefthand', 'righthand'].includes(getMatrixPartName(key))
}

function toNumber(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0
}

/**
 * 对称系数（0 ~ 1），无有效行时返回 null
 */
export function calcSymmetryCoefficient(values, width, height) {
  const cols = Math.floor(Number(width) || 0)
  const rows = Math.floor(Number(height) || 0)
  if (!Array.isArray(values) || cols < 2 || rows < 1) return null

  let rowSum = 0
  let rowCount = 0
  const half = Math.floor(cols / 2)

  for (let y = 0; y < rows; y++) {
    const offset = y * cols
    let numerator = 0
    let denominator = 0
    for (let x = 0; x < half; x++) {
      const left = toNumber(values[offset + x])
      const right = toNumber(values[offset + cols - 1 - x])
      numerator += Math.abs(left - right)
      denominator += left + right
    }
    // 奇数列：中间一列自身即为对称点，差值为 0，只计入分母一次
    if (cols % 2 === 1) {
      denominator += toNumber(values[offset + half])
    }
    if (denominator <= 0) continue
    rowSum += 1 - numerator / denominator
    rowCount += 1
  }

  return rowCount ? rowSum / rowCount : null
}

/** 对称系数 → 百分比字符串（保留两位小数） */
export function formatSymmetryPercent(coefficient) {
  const numeric = Number(coefficient)
  if (!Number.isFinite(numeric)) return '-'
  return `${(numeric * 100).toFixed(2)}%`
}

/**
 * 压力梯度统计，单位 pa/cm
 * @param {number[]} pressureKpaValues 行优先展开的压强矩阵（kPa）
 */
export function calcPressureGradientStats(pressureKpaValues, width, height, spacingCm = GRADIENT_POINT_SPACING_CM) {
  const cols = Math.floor(Number(width) || 0)
  const rows = Math.floor(Number(height) || 0)
  const distance = Number(spacingCm) > 0 ? Number(spacingCm) : GRADIENT_POINT_SPACING_CM
  const empty = { average: null, max: null, count: 0 }
  if (!Array.isArray(pressureKpaValues) || cols < 3 || rows < 3) return empty

  const pa = (index) => toNumber(pressureKpaValues[index]) * PA_PER_KPA
  let total = 0
  let max = 0
  let count = 0

  // 仅内部点：去掉最外一圈，保证中心差分的邻居完整
  for (let y = 1; y < rows - 1; y++) {
    for (let x = 1; x < cols - 1; x++) {
      const index = y * cols + x
      if (pa(index) <= 0) continue
      const dx = (pa(index + 1) - pa(index - 1)) / (2 * distance)
      const dy = (pa(index + cols) - pa(index - cols)) / (2 * distance)
      const gradient = Math.sqrt(dx * dx + dy * dy)
      total += gradient
      if (gradient > max) max = gradient
      count += 1
    }
  }

  if (!count) return empty
  return { average: total / count, max, count }
}

/**
 * 一个部位一帧的完整指标
 */
export function calcPartShapeMetrics(pressureKpaValues, width, height, key) {
  const gradient = supportsPressureGradient(key)
    ? calcPressureGradientStats(pressureKpaValues, width, height)
    : { average: null, max: null, count: 0 }
  return {
    symmetry: supportsSymmetryCoefficient(key)
      ? calcSymmetryCoefficient(pressureKpaValues, width, height)
      : null,
    avgGradient: gradient.average,
    maxGradient: gradient.max,
    gradientPoints: gradient.count,
  }
}

/** 框选区域按行优先取出子矩阵（xEnd / yEnd 为开区间） */
function sliceRegionValues(values, width, region) {
  const cols = Math.floor(Number(width) || 0)
  const result = []
  if (!Array.isArray(values) || !region || cols <= 0) return result
  for (let y = Math.floor(Number(region.yStart) || 0); y < Math.ceil(Number(region.yEnd) || 0); y++) {
    for (let x = Math.floor(Number(region.xStart) || 0); x < Math.ceil(Number(region.xEnd) || 0); x++) {
      const value = Number(values[y * cols + x])
      result.push(Number.isFinite(value) ? value : 0)
    }
  }
  return result
}

/**
 * 框选区域的压力梯度，单位 pa/cm
 * 与整块部位的区别：只统计框内的点，但中心差分的邻居仍取自整块矩阵，
 * 否则小框去掉最外一圈后就没有可用点了。
 */
export function calcRegionPressureGradientStats(pressureKpaValues, width, height, region, spacingCm = GRADIENT_POINT_SPACING_CM) {
  const cols = Math.floor(Number(width) || 0)
  const rows = Math.floor(Number(height) || 0)
  const distance = Number(spacingCm) > 0 ? Number(spacingCm) : GRADIENT_POINT_SPACING_CM
  const empty = { average: null, max: null, count: 0 }
  if (!Array.isArray(pressureKpaValues) || cols < 3 || rows < 3 || !region) return empty

  // 框内点 ∩ 整块矩阵的内部点（最外一圈没有邻居，取不到中心差分）
  const xFrom = Math.max(1, Math.floor(Number(region.xStart) || 0))
  const xTo = Math.min(cols - 1, Math.ceil(Number(region.xEnd) || 0))
  const yFrom = Math.max(1, Math.floor(Number(region.yStart) || 0))
  const yTo = Math.min(rows - 1, Math.ceil(Number(region.yEnd) || 0))

  const pa = (index) => toNumber(pressureKpaValues[index]) * PA_PER_KPA
  let total = 0
  let max = 0
  let count = 0

  for (let y = yFrom; y < yTo; y++) {
    for (let x = xFrom; x < xTo; x++) {
      const index = y * cols + x
      if (pa(index) <= 0) continue
      const dx = (pa(index + 1) - pa(index - 1)) / (2 * distance)
      const dy = (pa(index + cols) - pa(index - cols)) / (2 * distance)
      const gradient = Math.sqrt(dx * dx + dy * dy)
      total += gradient
      if (gradient > max) max = gradient
      count += 1
    }
  }

  if (!count) return empty
  return { average: total / count, max, count }
}

/**
 * 一个框选区域一帧的完整指标，部位能力判定与整块部位一致
 * 上身 / 下身 → 对称系数 + 平均梯度 + 最大梯度；左臂 / 右臂 → 仅两项梯度
 * 对称系数按框内自身中线对折（框只覆盖半边时，对折的仍是框自己的左右两半）
 */
export function calcRegionShapeMetrics(pressureKpaValues, width, height, region, key) {
  const regionWidth = Math.max(0, Math.ceil(Number(region?.xEnd) || 0) - Math.floor(Number(region?.xStart) || 0))
  const regionHeight = Math.max(0, Math.ceil(Number(region?.yEnd) || 0) - Math.floor(Number(region?.yStart) || 0))
  const gradient = supportsPressureGradient(key)
    ? calcRegionPressureGradientStats(pressureKpaValues, width, height, region)
    : { average: null, max: null, count: 0 }
  return {
    symmetry: supportsSymmetryCoefficient(key)
      ? calcSymmetryCoefficient(sliceRegionValues(pressureKpaValues, width, region), regionWidth, regionHeight)
      : null,
    avgGradient: gradient.average,
    maxGradient: gradient.max,
    gradientPoints: gradient.count,
  }
}
