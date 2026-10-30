const { loadPressureConfig, loadDummyPressureFormula } = require('../server/services/PressureConfig')
const { loadAreaFormula } = require('../server/services/AreaFormula')

const PROCESSING_VERSION = 'dummy-raw-algorithm-v2.10.34-statistics-v2'
const STATISTICS_REVISION = 'backup-v2.10.34-prepared-float64-v1'
const DISPLAY_DIGITS = 1
const GAUSSIAN_SIGMA_FACTOR = 0.5
const DUMMY_POINT_SPACING_CM = 1.25
const DUMMY_POINT_AREA_CM2 = DUMMY_POINT_SPACING_CM * DUMMY_POINT_SPACING_CM
const FORCE_PER_KPA = DUMMY_POINT_AREA_CM2 * 0.1
const ADC_FILTER_MODE = 'adc'
const PRESSURE_FILTER_MODE = 'pressure'
const FORCE_FILTER_MODE = 'force'
const FILTER_MODES = new Set([ADC_FILTER_MODE, PRESSURE_FILTER_MODE, FORCE_FILTER_MODE])

const DEFAULT_FRAME_PROCESSING_CONFIG = Object.freeze({
  filter: 0,
  filterMode: PRESSURE_FILTER_MODE,
  gauss: 2,
  coherent: 1,
})

const DUMMY_MATRIX_CONFIG = Object.freeze({
  'endi-jacket': {
    sourceWidth: 12,
    sourceHeight: 27,
    displayWidth: 24,
    displayHeight: 54,
    sensorType: 'dummy-body-27x12',
  },
  'endi-leftHand': {
    sourceWidth: 18,
    sourceHeight: 2,
    displayWidth: 36,
    displayHeight: 4,
    sensorType: 'dummy-sleeve-2x18',
  },
  'endi-rightHand': {
    sourceWidth: 18,
    sourceHeight: 2,
    displayWidth: 36,
    displayHeight: 4,
    sensorType: 'dummy-sleeve-2x18',
  },
  'endi-leftFoot': {
    sourceWidth: 6,
    sourceHeight: 32,
    displayWidth: 12,
    displayHeight: 64,
    sensorType: 'dummy-left-leg-32x6',
  },
  'endi-rightFoot': {
    sourceWidth: 6,
    sourceHeight: 32,
    displayWidth: 12,
    displayHeight: 64,
    sensorType: 'dummy-right-leg-32x6',
  },
})

const ENDI_FOOT_KEY = 'endi-foot'
const ENDI_LEFT_FOOT_KEY = 'endi-leftFoot'
const ENDI_RIGHT_FOOT_KEY = 'endi-rightFoot'
const ENDI_SINGLE_FOOT_WIDTH = 12
const ENDI_FOOT_HEIGHT = 64

function clampNumber(value, fallback, min, max) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.max(min, Math.min(max, numeric))
}

function normalizeFrameProcessingConfig(config = {}, fallback = DEFAULT_FRAME_PROCESSING_CONFIG) {
  const fallbackFilterMode = FILTER_MODES.has(fallback.filterMode)
    ? fallback.filterMode
    : PRESSURE_FILTER_MODE
  return {
    filter: clampNumber(config.filter, Number(fallback.filter) || 0, 0, 4095),
    filterMode: FILTER_MODES.has(config.filterMode) ? config.filterMode : fallbackFilterMode,
    gauss: clampNumber(config.gauss, Number(fallback.gauss) || 0, 0, 4),
    coherent: clampNumber(config.coherent, Number(fallback.coherent) || 1, 1, 10),
  }
}

function roundValue(value, digits = DISPLAY_DIGITS) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return 0
  const scale = 10 ** digits
  return Math.round((numeric + Number.EPSILON) * scale) / scale
}

function isDummyMatrixKey(key) {
  return Boolean(DUMMY_MATRIX_CONFIG[key] || key === ENDI_FOOT_KEY)
}

function isPhysicalCellValid(key, row, col) {
  if (key === 'endi-jacket') {
    return row >= 5 || col >= 3
  }
  if (key === ENDI_LEFT_FOOT_KEY) {
    return col < 4 || (row >= 8 && row <= 14)
  }
  if (key === ENDI_RIGHT_FOOT_KEY) {
    return col >= 2 || (row >= 8 && row <= 14)
  }
  return true
}

function isDisplayCellValid(key, row, col) {
  if (key === 'endi-jacket') {
    return row >= 10 || (col >= 3 && col <= 20)
  }
  if (key === ENDI_LEFT_FOOT_KEY) {
    return col < 8 || (row >= 16 && row <= 29)
  }
  if (key === ENDI_RIGHT_FOOT_KEY) {
    return col >= 4 || (row >= 16 && row <= 29)
  }
  return true
}

function normalizeRawAdcMatrix(key, values) {
  const config = DUMMY_MATRIX_CONFIG[key]
  if (!config || !Array.isArray(values)) return []
  const displayLength = config.displayWidth * config.displayHeight
  const source = values.length === displayLength
    ? values
    : interpolatePhysicalMatrix(key, recoverPhysicalMatrix(key, values))
  if (source.length !== displayLength) return []
  return source.map((value) => {
    const numeric = Number(value)
    return Number.isFinite(numeric) && numeric > 0 ? numeric : 0
  })
}

function gaussianBlur(values, width, height, sigma) {
  const source = Array.isArray(values) ? values : []
  if (!source.length || width * height !== source.length || sigma <= 0.01) {
    return [...source]
  }

  const radius = Math.max(1, Math.ceil(sigma * 2.57))
  const kernel = Array.from(
    { length: radius * 2 + 1 },
    (_, index) => Math.exp(-((index - radius) ** 2) / (2 * sigma * sigma)),
  )
  const weightSum = kernel.reduce((sum, weight) => sum + weight, 0)
  const horizontal = new Array(source.length).fill(0)
  const result = new Array(source.length).fill(0)

  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      let total = 0
      for (let offset = -radius; offset <= radius; offset += 1) {
        const sourceCol = Math.min(width - 1, Math.max(0, col + offset))
        total += source[row * width + sourceCol] * kernel[offset + radius]
      }
      horizontal[row * width + col] = total / weightSum
    }
  }

  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      let total = 0
      for (let offset = -radius; offset <= radius; offset += 1) {
        const sourceRow = Math.min(height - 1, Math.max(0, row + offset))
        total += horizontal[sourceRow * width + col] * kernel[offset + radius]
      }
      result[row * width + col] = total / weightSum
    }
  }

  return result
}

function recoverPhysicalMatrix(key, values) {
  const config = DUMMY_MATRIX_CONFIG[key]
  if (!config || !Array.isArray(values)) return []
  const sourceCount = config.sourceWidth * config.sourceHeight
  if (values.length === sourceCount) return [...values]
  if (values.length !== config.displayWidth * config.displayHeight) return []

  const result = new Array(sourceCount).fill(0)
  for (let row = 0; row < config.sourceHeight; row += 1) {
    for (let col = 0; col < config.sourceWidth; col += 1) {
      if (!isPhysicalCellValid(key, row, col)) continue
      const displayRow = row * 2
      const displayCol = key === 'endi-jacket' && row < 5
        ? col * 2 - 3
        : col * 2
      if (displayCol < 0 || displayCol >= config.displayWidth) continue
      result[row * config.sourceWidth + col] = Number(
        values[displayRow * config.displayWidth + displayCol],
      ) || 0
    }
  }
  return result
}

function interpolateMatrix2x(values, width, height) {
  const nextWidth = width * 2
  const nextHeight = height * 2
  const result = new Array(nextWidth * nextHeight).fill(0)

  for (let row = 0; row < nextHeight; row += 1) {
    const sourceY = row / 2
    const y0 = Math.min(height - 1, Math.floor(sourceY))
    const y1 = Math.min(height - 1, y0 + 1)
    const fy = sourceY - y0
    for (let col = 0; col < nextWidth; col += 1) {
      const sourceX = col / 2
      const x0 = Math.min(width - 1, Math.floor(sourceX))
      const x1 = Math.min(width - 1, x0 + 1)
      const fx = sourceX - x0
      const v00 = Number(values[y0 * width + x0]) || 0
      const v10 = Number(values[y0 * width + x1]) || 0
      const v01 = Number(values[y1 * width + x0]) || 0
      const v11 = Number(values[y1 * width + x1]) || 0
      const top = v00 + (v10 - v00) * fx
      const bottom = v01 + (v11 - v01) * fx
      result[row * nextWidth + col] = top + (bottom - top) * fy
    }
  }
  return result
}

function centerJacketHead(values) {
  const width = 24
  const result = [...values]
  for (let row = 0; row < 10; row += 1) {
    const rowStart = row * width
    for (let col = 0; col < width; col += 1) {
      result[rowStart + col] = 0
    }
    for (let col = 0; col < 18; col += 1) {
      result[rowStart + 3 + col] = values[rowStart + 6 + col] || 0
    }
  }
  return result
}

function interpolatePhysicalMatrix(key, values) {
  const config = DUMMY_MATRIX_CONFIG[key]
  if (!config || values.length !== config.sourceWidth * config.sourceHeight) return []
  let result = interpolateMatrix2x(values, config.sourceWidth, config.sourceHeight)
  if (key === 'endi-jacket') result = centerJacketHead(result)
  return result.map((value, index) => {
    const row = Math.floor(index / config.displayWidth)
    const col = index % config.displayWidth
    return isDisplayCellValid(key, row, col) ? value : 0
  })
}

function processPhysicalAdcMatrix(key, values, processingConfig) {
  const config = DUMMY_MATRIX_CONFIG[key]
  if (!config || values.length !== config.sourceWidth * config.sourceHeight) return []
  // 试验版：可视化调节只影响渲染，不影响数值。
  // 原来这里会按「图像润滑」参数对 ADC 做空间高斯平滑再进公式，
  // 导致面板滑块改变显示的 kPa。现在只保留结构掩码，ADC 原值直接进公式；
  // 画面的平滑交给前端渲染层（3D 人体的 WebGL blur / 2D 的显示模糊）。
  return values.map((value, index) => {
    const numeric = Number(value)
    const row = Math.floor(index / config.sourceWidth)
    const col = index % config.sourceWidth
    if (!isPhysicalCellValid(key, row, col) || !Number.isFinite(numeric)) return 0
    return Math.max(0, numeric)
  })
}

function applyDisplayMetricFilter(adcValues, pressureValues, processingConfig) {
  // 试验版：噪点消除同样只影响渲染。后端不再按阈值清零 kPa/N 矩阵，
  // 统计（平均/最大/点数/面积）始终基于未过滤数值；
  // 前端渲染层自己按 filter 隐藏低值点（shouldHideDisplayPoint / 2D 数字过滤）。
  const length = Math.max(adcValues.length, pressureValues.length)
  const adc = Array.from({ length }, (_, index) => Math.max(0, Number(adcValues[index]) || 0))
  const pressure = Array.from({ length }, (_, index) => Math.max(0, Number(pressureValues[index]) || 0))
  const force = pressure.map((value) => value * FORCE_PER_KPA)
  return { adc, pressure, force }
}

// The package receives physical ADC values unchanged, before any display transforms.
function calculateRawDummyFrame(key, physicalAdc, physicalMask) {
  const dimensions = DUMMY_MATRIX_CONFIG[key]
  if (!dimensions || physicalAdc.length !== dimensions.sourceWidth * dimensions.sourceHeight) return null
  const matrix = Array.from({ length: dimensions.sourceHeight }, (_, row) =>
    physicalAdc.slice(row * dimensions.sourceWidth, (row + 1) * dimensions.sourceWidth))
  return loadDummyPressureFormula().calculateDummyRawPressureFrame(matrix, dimensions.sensorType, physicalMask)
}

function positionAlgorithmOutput(key, matrix) {
  const flat = matrix.flat()
  return key === 'endi-jacket' ? centerJacketHead(flat) : flat
}

// Keep the area fit on the original physical ADC grid, before display positioning.
function calculateRawDummyArea(key, physicalAdc, physicalMask, formula) {
  const dimensions = DUMMY_MATRIX_CONFIG[key]
  if (!dimensions || physicalAdc.length !== dimensions.sourceWidth * dimensions.sourceHeight) return null
  const rawMatrix = Array.from({ length: dimensions.sourceHeight }, (_, row) =>
    physicalAdc.slice(row * dimensions.sourceWidth, (row + 1) * dimensions.sourceWidth))
  return formula.api.calculateDummyRawAreaFrame(rawMatrix, dimensions.sensorType, physicalMask)
}

function buildAreaFields(key, physicalAdc, physicalMask, formula) {
  const area = calculateRawDummyArea(key, physicalAdc, physicalMask, formula)
  return {
    areaCm2: area === null ? null : area.areaCm2,
    areaValuesCm2: area === null ? null : positionAlgorithmOutput(key, area.areaMatrixCm2),
  }
}

function buildAreaMetadata(formula) {
  return {
    areaFormulaFile: formula.fileName,
    areaFormulaVersion: formula.version,
    areaFormulaRevision: formula.revision,
  }
}

function getDummyCalibrationOptions(pressureConfig = loadPressureConfig()) {
  return {
    threshold: pressureConfig.dummyAdcThreshold,
    resultScale: pressureConfig.dummyResultScale,
  }
}

// Only scalar statistics travel with a frame; the precise matrix is carried once.
function buildPressureSummary(result) {
  if (!result) return null
  const values = Array.isArray(result.pressureMatrixKpa) ? result.pressureMatrixKpa.flat() : []
  const maxKpaRaw = values.reduce((maximum, value) => Math.max(maximum, Number(value) || 0), 0)
  return {
    unit: 'kPa',
    avgKpa: result.avgKpa,
    maxKpa: result.maxKpa,
    maxKpaRaw,
    nonZeroCount: result.nonZeroCount,
    effectivePointCount: result.nonZeroCount,
    pressureSumKpa: result.pressureSumKpa,
    targetAvgKpaRaw: result.targetAvgKpaRaw,
    inputPointCount: result.inputPointCount,
    ignoredPointCount: result.ignoredPointCount,
    regionCount: result.regionCount ?? result.regions?.length ?? 0,
    topCount: result.topCount,
    topAverageAdc: result.topAverageAdc,
    distributionScale: result.distributionScale,
    mode: result.mode,
    allocationMode: result.allocationMode,
    rows: result.rows,
    cols: result.cols,
  }
}

function combinePressureSummaries(summaries) {
  const parts = summaries.filter(Boolean)
  if (!parts.length) return null
  const nonZeroCount = parts.reduce((sum, part) => sum + (Number(part.nonZeroCount) || 0), 0)
  const pressureSumKpa = parts.reduce((sum, part) => sum + (Number(part.pressureSumKpa) || 0), 0)
  const maxKpaRaw = parts.reduce((maximum, part) => Math.max(maximum, Number(part.maxKpaRaw ?? part.maxKpa) || 0), 0)
  return {
    unit: 'kPa',
    avgKpa: nonZeroCount ? roundValue(pressureSumKpa / nonZeroCount, 2) : null,
    maxKpa: nonZeroCount ? roundValue(maxKpaRaw, 2) : null,
    maxKpaRaw,
    nonZeroCount,
    effectivePointCount: nonZeroCount,
    pressureSumKpa,
    targetAvgKpaRaw: nonZeroCount ? pressureSumKpa / nonZeroCount : null,
    inputPointCount: parts.reduce((sum, part) => sum + (Number(part.inputPointCount) || 0), 0),
    ignoredPointCount: parts.reduce((sum, part) => sum + (Number(part.ignoredPointCount) || 0), 0),
    regionCount: parts.reduce((sum, part) => sum + (Number(part.regionCount) || 0), 0),
    topCount: Math.max(...parts.map((part) => Number(part.topCount) || 0)),
    topAverageAdc: null,
    distributionScale: null,
    mode: nonZeroCount ? 'region_top50' : 'none',
    allocationMode: nonZeroCount ? 'regional_normalized_master_weights' : 'none',
  }
}

function buildPhysicalValidMask(key, physicalMask) {
  const dimensions = DUMMY_MATRIX_CONFIG[key]
  return Array.from({ length: dimensions.sourceHeight }, (_, row) =>
    Array.from({ length: dimensions.sourceWidth }, (_, col) => isPhysicalCellValid(key, row, col)
      && !(physicalMask?.length === dimensions.sourceHeight && physicalMask[row]?.[col] === false)))
}

// Match the backup's physical ADC comparison card independently of pressure fitting.
function buildPhysicalAdcStats(matrix, validMask, options) {
  let total = 0
  let sum = 0
  let max = 0
  let nonZeroCount = 0
  let nonZeroMin = Infinity
  let min = Infinity
  let maxR = 0
  let maxC = 0
  for (let row = 0; row < matrix.length; row += 1) {
    for (let col = 0; col < matrix[row].length; col += 1) {
      if (validMask[row]?.[col] === false) continue
      total += 1
      const raw = Number(matrix[row][col]) || 0
      let value = raw > 0 ? Math.max(0, Math.min(255, Math.round(raw * options.resultScale))) : 0
      if (options.threshold > 0 && value > 0 && value <= options.threshold) value = 0
      if (value > max) { max = value; maxR = row; maxC = col }
      min = Math.min(min, value)
      sum += value
      if (value > 0) {
        nonZeroCount += 1
        nonZeroMin = Math.min(nonZeroMin, value)
      }
    }
  }
  return {
    rows: matrix.length,
    cols: matrix[0]?.length || 0,
    total,
    max,
    min: Number.isFinite(min) ? min : 0,
    sum,
    nonZeroCount,
    nonZeroMin: Number.isFinite(nonZeroMin) ? nonZeroMin : 0,
    avg: total ? roundValue(sum / total, 2) : 0,
    avgNonZero: nonZeroCount ? roundValue(sum / nonZeroCount, 2) : 0,
    maxR,
    maxC,
  }
}

function convertPhysicalPressureMatrix(key, adcValues) {
  const result = calculateRawDummyFrame(key, recoverPhysicalMatrix(key, adcValues))
  return result ? positionAlgorithmOutput(key, result.pressureMatrixKpa) : []
}

function buildProcessingMetadata(config, areaFormula) {
  const pressureConfig = loadPressureConfig()
  const pressureFormula = loadDummyPressureFormula()
  const versionMatch = String(pressureConfig.dummyPressureFormulaFile || '').match(/v(\d+(?:\.\d+)*)/i)
  return {
    version: PROCESSING_VERSION,
    filter: config.filter,
    filterMode: config.filterMode,
    filterStage: 'render-only',
    inputStage: 'raw-physical-adc',
    interpolationStage: 'algorithm-package',
    zeroBaselineApplied: false,
    gauss: config.gauss,
    coherent: config.coherent,
    gaussianSigma: 0,
    temporal: false,
    outputDigits: DISPLAY_DIGITS,
    pressurePrecision: 'float64',
    statisticsRevision: STATISTICS_REVISION,
    summaryDigits: 2,
    summaryStage: 'interpolated',
    dummyAdcThreshold: pressureConfig.dummyAdcThreshold,
    dummyResultScale: pressureConfig.dummyResultScale,
    formulaFile: pressureConfig.dummyPressureFormulaFile,
    masterSourceVersion: pressureFormula.MASTER_SOURCE_VERSION,
    ruleVersion: pressureFormula.RULE_VERSION,
    ruleScope: pressureFormula.RULE_SCOPE,
    contactSplitSourceVersion: pressureFormula.CONTACT_SPLIT_SOURCE_VERSION,
    masterSourceSha256: pressureFormula.MASTER_SOURCE_SHA256,
    ...buildAreaMetadata(areaFormula),
    formulaProfile: versionMatch ? `dummy-v${versionMatch[1]}` : 'dummy',
    pointSpacingCm: DUMMY_POINT_SPACING_CM,
    pointAreaCm2: DUMMY_POINT_AREA_CM2,
  }
}

function processSingleDummyMatrix(key, sourceValues, processingConfig, physicalMask, areaFormula = loadAreaFormula()) {
  const config = normalizeFrameProcessingConfig(processingConfig)
  const physicalAdcArr = recoverPhysicalMatrix(key, sourceValues)
  const interpolated = calculateRawDummyFrame(key, physicalAdcArr, physicalMask)
  if (!interpolated) return null
  const formula = loadDummyPressureFormula()
  const options = getDummyCalibrationOptions()
  const result = formula.calculateDummyPreparedPressureFrame(
    interpolated.interpolatedAdcMatrix,
    DUMMY_MATRIX_CONFIG[key].sensorType,
    interpolated.interpolatedValidMask,
    options,
  )
  const dimensions = DUMMY_MATRIX_CONFIG[key]
  const physicalMatrix = Array.from({ length: dimensions.sourceHeight }, (_, row) =>
    physicalAdcArr.slice(row * dimensions.sourceWidth, (row + 1) * dimensions.sourceWidth))
  const physicalValidMask = buildPhysicalValidMask(key, physicalMask)
  const physicalResult = formula.calculateDummyPreparedPressureFrame(
    physicalMatrix, dimensions.sensorType, physicalValidMask, options,
  )
  // Geometry and interpolation are supplied by the unchanged package. Only position
  // the returned head/neck cells for display, after all pressure calculations.
  const rawDisplayAdc = positionAlgorithmOutput(key, interpolated.interpolatedAdcMatrix.map((row, y) =>
    row.map((value, x) => interpolated.interpolatedValidMask[y][x] ? value : 0)))
  const displayAdc = positionAlgorithmOutput(key, result.preparedAdcMatrix)
  const pressureValues = positionAlgorithmOutput(key, result.pressureMatrixKpa)
  return {
    physicalAdcArr,
    rawAdcArr: rawDisplayAdc,
    arr: displayAdc,
    pressureArr: pressureValues.map((value) => roundValue(value)),
    forceArr: pressureValues.map((value) => roundValue(value * FORCE_PER_KPA)),
    pressureValuesKpa: pressureValues,
    pressureSummary: buildPressureSummary(result),
    physicalPressureSummary: buildPressureSummary(physicalResult),
    physicalAdcStats: buildPhysicalAdcStats(physicalMatrix, physicalValidMask, options),
    ...buildAreaFields(key, physicalAdcArr, physicalMask, areaFormula),
    processing: buildProcessingMetadata(config, areaFormula),
  }
}

function splitFootRows(values) {
  const singleLength = ENDI_SINGLE_FOOT_WIDTH * ENDI_FOOT_HEIGHT
  const left = []
  const right = []
  if (!Array.isArray(values) || values.length !== singleLength * 2) {
    return {
      left: new Array(singleLength).fill(0),
      right: new Array(singleLength).fill(0),
    }
  }
  for (let row = 0; row < ENDI_FOOT_HEIGHT; row += 1) {
    const start = row * ENDI_SINGLE_FOOT_WIDTH * 2
    left.push(...values.slice(start, start + ENDI_SINGLE_FOOT_WIDTH))
    right.push(...values.slice(start + ENDI_SINGLE_FOOT_WIDTH, start + ENDI_SINGLE_FOOT_WIDTH * 2))
  }
  return { left, right }
}

function combineFootRows(leftValues, rightValues) {
  const combined = []
  for (let row = 0; row < ENDI_FOOT_HEIGHT; row += 1) {
    const start = row * ENDI_SINGLE_FOOT_WIDTH
    combined.push(
      ...leftValues.slice(start, start + ENDI_SINGLE_FOOT_WIDTH),
      ...rightValues.slice(start, start + ENDI_SINGLE_FOOT_WIDTH),
    )
  }
  return combined
}

function processFootMatrixItem(item, processingConfig, areaFormula) {
  const source = Array.isArray(item.rawAdcArr) ? item.rawAdcArr : item.arr
  const { left, right } = splitFootRows(source)
  const physical = item.sourcePhysicalAdcMatrices || {}
  const masks = item.sourcePhysicalMasks || {}
  const leftResult = processSingleDummyMatrix(ENDI_LEFT_FOOT_KEY, physical[ENDI_LEFT_FOOT_KEY] || left, processingConfig, masks[ENDI_LEFT_FOOT_KEY], areaFormula)
  const rightResult = processSingleDummyMatrix(ENDI_RIGHT_FOOT_KEY, physical[ENDI_RIGHT_FOOT_KEY] || right, processingConfig, masks[ENDI_RIGHT_FOOT_KEY], areaFormula)
  if (!leftResult || !rightResult) return { ...item }
  const result = { ...item, processing: leftResult.processing }
  delete result.physicalAdcArr
  for (const [field, sourceField] of [
    ['arr', 'sourceMatrices'], ['rawAdcArr', 'sourceRawAdcMatrices'],
    ['pressureArr', 'sourcePressureMatrices'], ['forceArr', 'sourceForceMatrices'],
    ['pressureValuesKpa', 'sourcePrecisePressureMatrices'],
    ['areaValuesCm2', 'sourceAreaMatrices'],
  ]) {
    result[field] = combineFootRows(leftResult[field], rightResult[field])
    result[sourceField] = { [ENDI_LEFT_FOOT_KEY]: leftResult[field], [ENDI_RIGHT_FOOT_KEY]: rightResult[field] }
  }
  result.sourcePhysicalAdcMatrices = {
    [ENDI_LEFT_FOOT_KEY]: leftResult.physicalAdcArr,
    [ENDI_RIGHT_FOOT_KEY]: rightResult.physicalAdcArr,
  }
  result.sourcePressureSummaries = {
    [ENDI_LEFT_FOOT_KEY]: leftResult.pressureSummary,
    [ENDI_RIGHT_FOOT_KEY]: rightResult.pressureSummary,
  }
  result.sourcePhysicalPressureSummaries = {
    [ENDI_LEFT_FOOT_KEY]: leftResult.physicalPressureSummary,
    [ENDI_RIGHT_FOOT_KEY]: rightResult.physicalPressureSummary,
  }
  result.sourcePhysicalAdcStats = {
    [ENDI_LEFT_FOOT_KEY]: leftResult.physicalAdcStats,
    [ENDI_RIGHT_FOOT_KEY]: rightResult.physicalAdcStats,
  }
  result.pressureSummary = combinePressureSummaries(Object.values(result.sourcePressureSummaries))
  result.physicalPressureSummary = combinePressureSummaries(Object.values(result.sourcePhysicalPressureSummaries))
  delete result.physicalAdcStats
  result.areaCm2 = leftResult.areaCm2 === null || rightResult.areaCm2 === null
    ? null : leftResult.areaCm2 + rightResult.areaCm2
  return result
}

function processMatrixItem(key, item = {}, processingConfig = DEFAULT_FRAME_PROCESSING_CONFIG, areaFormula) {
  if (!isDummyMatrixKey(key) || item.processing?.importedMetric) return { ...item }
  areaFormula = areaFormula || loadAreaFormula()
  if (key === ENDI_FOOT_KEY) return processFootMatrixItem(item, processingConfig, areaFormula)
  const source = item.physicalAdcArr || item.rawAdcArr || item.arr || []
  const result = processSingleDummyMatrix(key, source, processingConfig, item.physicalMask, areaFormula)
  return result ? { ...item, ...result } : { ...item }
}

function hasCanonicalMetricArrays(item = {}) {
  const length = Array.isArray(item.arr) ? item.arr.length : 0
  const pressureFormula = item.processing?.importedMetric ? null : loadDummyPressureFormula()
  const pressureConfig = item.processing?.importedMetric ? null : loadPressureConfig()
  const hasCurrentMaster = !pressureFormula?.MASTER_SOURCE_SHA256
    || item.processing?.masterSourceSha256 === pressureFormula.MASTER_SOURCE_SHA256
  const hasCurrentRule = !pressureFormula?.RULE_VERSION
    || item.processing?.ruleVersion === pressureFormula.RULE_VERSION
  const hasCurrentScope = !pressureFormula?.RULE_SCOPE
    || item.processing?.ruleScope === pressureFormula.RULE_SCOPE
  const hasCurrentContactSplit = !pressureFormula?.CONTACT_SPLIT_SOURCE_VERSION
    || item.processing?.contactSplitSourceVersion === pressureFormula.CONTACT_SPLIT_SOURCE_VERSION
  return (item.processing?.importedMetric || (item.processing?.version === PROCESSING_VERSION
    && item.processing?.formulaFile === pressureConfig.dummyPressureFormulaFile
    && item.processing?.statisticsRevision === STATISTICS_REVISION
    && item.processing?.pressurePrecision === 'float64'
    && item.processing?.dummyAdcThreshold === pressureConfig.dummyAdcThreshold
    && item.processing?.dummyResultScale === pressureConfig.dummyResultScale
    && Array.isArray(item.pressureValuesKpa) && item.pressureValuesKpa.length === length
    && item.pressureSummary && item.physicalPressureSummary
    && hasCurrentMaster && hasCurrentRule && hasCurrentScope && hasCurrentContactSplit))
    && length > 0
    && Array.isArray(item.pressureArr)
    && item.pressureArr.length === length
    && Array.isArray(item.forceArr)
    && item.forceArr.length === length
}

function ensureProcessedMatrixItem(key, item = {}, processingConfig = DEFAULT_FRAME_PROCESSING_CONFIG, areaFormula) {
  if (!isDummyMatrixKey(key) || item.processing?.importedMetric) return { ...item }
  areaFormula = areaFormula || loadAreaFormula()
  if (hasCanonicalMetricArrays(item)) {
    if (item.processing?.areaFormulaRevision === areaFormula.revision
      && (item.areaValuesCm2 === null
        || (Array.isArray(item.areaValuesCm2) && item.areaValuesCm2.length === item.arr.length))) return { ...item }
    if (key === ENDI_FOOT_KEY) return refreshFootArea(item, areaFormula)
    const source = item.physicalAdcArr || item.rawAdcArr || item.arr || []
    return {
      ...item,
      ...buildAreaFields(key, recoverPhysicalMatrix(key, source), item.physicalMask, areaFormula),
      processing: {
        ...item.processing,
        ...buildAreaMetadata(areaFormula),
      },
    }
  }
  const source = Array.isArray(item.rawAdcArr) ? item.rawAdcArr : item.arr
  return processMatrixItem(key, { ...item, arr: source }, item.processing || processingConfig, areaFormula)
}

function refreshFootArea(item, formula) {
  const { left, right } = splitFootRows(item.rawAdcArr || item.arr)
  const physical = item.sourcePhysicalAdcMatrices || {}
  const masks = item.sourcePhysicalMasks || {}
  const leftArea = buildAreaFields(ENDI_LEFT_FOOT_KEY,
    recoverPhysicalMatrix(ENDI_LEFT_FOOT_KEY, physical[ENDI_LEFT_FOOT_KEY] || left), masks[ENDI_LEFT_FOOT_KEY], formula)
  const rightArea = buildAreaFields(ENDI_RIGHT_FOOT_KEY,
    recoverPhysicalMatrix(ENDI_RIGHT_FOOT_KEY, physical[ENDI_RIGHT_FOOT_KEY] || right), masks[ENDI_RIGHT_FOOT_KEY], formula)
  return {
    ...item,
    areaCm2: leftArea.areaCm2 === null || rightArea.areaCm2 === null ? null : leftArea.areaCm2 + rightArea.areaCm2,
    areaValuesCm2: leftArea.areaValuesCm2 && rightArea.areaValuesCm2
      ? combineFootRows(leftArea.areaValuesCm2, rightArea.areaValuesCm2) : null,
    sourceAreaMatrices: {
      [ENDI_LEFT_FOOT_KEY]: leftArea.areaValuesCm2,
      [ENDI_RIGHT_FOOT_KEY]: rightArea.areaValuesCm2,
    },
    processing: { ...item.processing, ...buildAreaMetadata(formula) },
  }
}

function getFrameAreaFormula(frame) {
  return Object.entries(frame).some(([key, item]) =>
    isDummyMatrixKey(key) && item && typeof item === 'object' && !item.processing?.importedMetric)
    ? loadAreaFormula() : undefined
}

function processFrame(frame = {}, processingConfig = DEFAULT_FRAME_PROCESSING_CONFIG) {
  const areaFormula = getFrameAreaFormula(frame)
  return Object.fromEntries(Object.entries(frame).map(([key, item]) => [
    key,
    item && typeof item === 'object'
      ? processMatrixItem(key, item, processingConfig, areaFormula)
      : item,
  ]))
}

function ensureProcessedFrame(frame = {}, processingConfig = DEFAULT_FRAME_PROCESSING_CONFIG) {
  const areaFormula = getFrameAreaFormula(frame)
  return Object.fromEntries(Object.entries(frame).map(([key, item]) => [
    key,
    item && typeof item === 'object'
      ? ensureProcessedMatrixItem(key, item, processingConfig, areaFormula)
      : item,
  ]))
}

module.exports = {
  PROCESSING_VERSION,
  STATISTICS_REVISION,
  DISPLAY_DIGITS,
  GAUSSIAN_SIGMA_FACTOR,
  DUMMY_POINT_SPACING_CM,
  DUMMY_POINT_AREA_CM2,
  FORCE_PER_KPA,
  ADC_FILTER_MODE,
  PRESSURE_FILTER_MODE,
  FORCE_FILTER_MODE,
  DEFAULT_FRAME_PROCESSING_CONFIG,
  DUMMY_MATRIX_CONFIG,
  normalizeFrameProcessingConfig,
  getDummyCalibrationOptions,
  buildPressureSummary,
  combinePressureSummaries,
  isDummyMatrixKey,
  gaussianBlur,
  recoverPhysicalMatrix,
  interpolatePhysicalMatrix,
  processPhysicalAdcMatrix,
  convertPhysicalPressureMatrix,
  applyDisplayMetricFilter,
  processSingleDummyMatrix,
  processMatrixItem,
  hasCanonicalMetricArrays,
  ensureProcessedMatrixItem,
  processFrame,
  ensureProcessedFrame,
  splitFootRows,
  combineFootRows,
}
