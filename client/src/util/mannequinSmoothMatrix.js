const DEFAULT_WORLD_WIDTH = 0.389
const DEFAULT_WORLD_HEIGHT = 3.517

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const positive = (value, fallback) => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : fallback

/** A world-space footprint gives equally sized smoothing on differently shaped matrices. */
export function getMannequinMatrixSmoothing(width, height, options = {}) {
  const gauss = clamp(Number.isFinite(Number(options.gauss)) ? Number(options.gauss) : 1, 0, 4)
  const size = clamp(Number.isFinite(Number(options.heightSetting)) ? Number(options.heightSetting) : 100, 0, 400)
  const sigmaWorld = clamp((0.025 + 0.0003 * size) * (0.75 + 0.25 * gauss), 0.025, 0.14)
  const worldWidth = positive(options.worldWidth, DEFAULT_WORLD_WIDTH)
  const worldHeight = positive(options.worldHeight, DEFAULT_WORLD_HEIGHT)
  return {
    sigmaWorld,
    sigmaX: Math.max(0.35, sigmaWorld * Math.max(1, width - 1) / worldWidth),
    sigmaY: Math.max(0.35, sigmaWorld * Math.max(1, height - 1) / worldHeight),
  }
}

function gaussianKernel(sigma) {
  const radius = Math.ceil(3 * sigma)
  const weights = new Float64Array(radius * 2 + 1)
  let sum = 0
  for (let offset = -radius; offset <= radius; offset++) {
    const weight = Math.exp(-(offset * offset) / (2 * sigma * sigma))
    weights[offset + radius] = weight
    sum += weight
  }
  for (let index = 0; index < weights.length; index++) weights[index] /= sum
  return { radius, weights }
}

/** Both channels use the same positive, unit-sum kernel; omitted samples are genuine zero. */
function convolve(source, width, height, kernel, horizontal) {
  const target = new Float32Array(source.length)
  const { radius, weights } = kernel
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      let pressure = 0
      let coverage = 0
      for (let offset = -radius; offset <= radius; offset++) {
        const x = horizontal ? col + offset : col
        const y = horizontal ? row : row + offset
        if (x < 0 || x >= width || y < 0 || y >= height) continue
        const index = (y * width + x) * 2
        const weight = weights[offset + radius]
        pressure += source[index] * weight
        coverage += source[index + 1] * weight
      }
      const index = (row * width + col) * 2
      target[index] = pressure
      target[index + 1] = coverage
    }
  }
  return target
}

/** Nonnegative cubic B-spline weights form a C2 field without Catmull-Rom overshoot. */
function splineAxis(sourceLength, scale) {
  const length = sourceLength * scale
  const indices = new Int32Array(length * 4)
  const weights = new Float32Array(length * 4)
  for (let index = 0; index < length; index++) {
    const coordinate = (index + 0.5) / scale - 0.5
    const base = Math.floor(coordinate)
    const t = coordinate - base
    const t2 = t * t
    const t3 = t2 * t
    const offset = index * 4
    for (let tap = 0; tap < 4; tap++) indices[offset + tap] = base + tap - 1
    weights[offset] = (1 - t) ** 3 / 6
    weights[offset + 1] = (3 * t3 - 6 * t2 + 4) / 6
    weights[offset + 2] = (-3 * t3 + 3 * t2 + 3 * t + 1) / 6
    weights[offset + 3] = t3 / 6
  }
  return { length, indices, weights }
}

function upsample(source, width, height, scale) {
  const xAxis = splineAxis(width, scale)
  const yAxis = splineAxis(height, scale)
  const horizontal = new Float32Array(xAxis.length * height * 2)
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < xAxis.length; col++) {
      let pressure = 0
      let coverage = 0
      for (let tap = 0; tap < 4; tap++) {
        const x = xAxis.indices[col * 4 + tap]
        if (x < 0 || x >= width) continue
        const index = (row * width + x) * 2
        const weight = xAxis.weights[col * 4 + tap]
        pressure += source[index] * weight
        coverage += source[index + 1] * weight
      }
      const offset = (row * xAxis.length + col) * 2
      horizontal[offset] = pressure
      horizontal[offset + 1] = coverage
    }
  }
  const data = new Float32Array(xAxis.length * yAxis.length * 4)
  for (let row = 0; row < yAxis.length; row++) {
    for (let col = 0; col < xAxis.length; col++) {
      let pressure = 0
      let coverage = 0
      for (let tap = 0; tap < 4; tap++) {
        const y = yAxis.indices[row * 4 + tap]
        if (y < 0 || y >= height) continue
        const index = (y * xAxis.length + col) * 2
        const weight = yAxis.weights[row * 4 + tap]
        pressure += horizontal[index] * weight
        coverage += horizontal[index + 1] * weight
      }
      const offset = (row * xAxis.length + col) * 4
      data[offset] = clamp(pressure, 0, 1)
      data[offset + 1] = clamp(coverage, 0, 1)
      data[offset + 3] = data[offset + 1]
    }
  }
  return { data, width: xAxis.length, height: yAxis.length }
}

/**
 * Reconstruct a continuous display field from the COMPLETE processed leg matrix.
 * R is a bounded pressure mean INCLUDING zero cells, never R/G. G/A are independent
 * contact coverage, so weak nonzero readings have the same visible footprint as strong ones.
 * The input remains untouched; callers cache the result until source values/settings change.
 */
export function createSmoothMannequinMatrix(values, width, height, options = {}) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1
    || width > 512 || height > 512 || values?.length !== width * height) {
    throw new RangeError('平滑矩阵需要有效尺寸和完整输入格子')
  }
  const smoothing = getMannequinMatrixSmoothing(width, height, options)
  const xKernel = gaussianKernel(smoothing.sigmaX)
  const yKernel = gaussianKernel(smoothing.sigmaY)
  const paddingX = xKernel.radius + 2
  const paddingY = yKernel.radius + 2
  const paddedWidth = width + paddingX * 2
  const paddedHeight = height + paddingY * 2
  const requestedScale = Number(options.scale)
  const scale = Number.isFinite(requestedScale) ? clamp(Math.round(requestedScale), 2, 8) : 4
  if (paddedWidth * scale > 4096 || paddedHeight * scale > 4096
    || paddedWidth * paddedHeight * scale * scale > 4 * 1024 * 1024) {
    throw new RangeError('平滑矩阵尺寸超过显示纹理上限')
  }
  const source = new Float32Array(paddedWidth * paddedHeight * 2)
  let activeCount = 0
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const numeric = Number(values[row * width + col])
      if (!Number.isFinite(numeric) || numeric <= 0) continue
      const offset = ((row + paddingY) * paddedWidth + col + paddingX) * 2
      source[offset] = Math.min(1, numeric)
      source[offset + 1] = 1
      activeCount++
    }
  }
  const blurredX = convolve(source, paddedWidth, paddedHeight, xKernel, true)
  const blurred = convolve(blurredX, paddedWidth, paddedHeight, yKernel, false)
  return {
    ...upsample(blurred, paddedWidth, paddedHeight, scale),
    sourceWidth: width, sourceHeight: height, activeCount,
    padding: [paddingX, paddingY], scale,
    uvOffset: [(paddingX + 0.5) / paddedWidth, (paddingY + 0.5) / paddedHeight],
    uvScale: [(width - 1) / paddedWidth, (height - 1) / paddedHeight],
    ...smoothing,
  }
}
