const { loadPressureConfig, loadDummyPressureFormula } = require('../server/services/PressureConfig')

const PROCESSING_VERSION = 'dummy-backend-spatial-v1'
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
  const settings = normalizeFrameProcessingConfig(processingConfig)
  let result = values.map((value, index) => {
    const numeric = Number(value)
    const row = Math.floor(index / config.sourceWidth)
    const col = index % config.sourceWidth
    if (!isPhysicalCellValid(key, row, col) || !Number.isFinite(numeric)) return 0
    return Math.max(0, numeric)
  })

  result = gaussianBlur(
    result,
    config.sourceWidth,
    config.sourceHeight,
    settings.gauss * GAUSSIAN_SIGMA_FACTOR,
  )
  result = result.map((value, index) => {
    const row = Math.floor(index / config.sourceWidth)
    const col = index % config.sourceWidth
    if (!isPhysicalCellValid(key, row, col)) return 0
    return value
  })
  return result
}

function applyDisplayMetricFilter(adcValues, pressureValues, processingConfig) {
  const settings = normalizeFrameProcessingConfig(processingConfig)
  const length = Math.max(adcValues.length, pressureValues.length)
  const adc = Array.from({ length }, (_, index) => Math.max(0, Number(adcValues[index]) || 0))
  const pressure = Array.from({ length }, (_, index) => Math.max(0, Number(pressureValues[index]) || 0))
  const force = pressure.map((value) => value * FORCE_PER_KPA)

  if (settings.filter <= 0) {
    return { adc, pressure, force }
  }

  const activeValues = settings.filterMode === ADC_FILTER_MODE
    ? adc
    : settings.filterMode === PRESSURE_FILTER_MODE
      ? pressure
      : force
  const keepPoint = activeValues.map((value) => value >= settings.filter)

  return {
    adc: adc.map((value, index) => keepPoint[index] ? value : 0),
    pressure: pressure.map((value, index) => keepPoint[index] ? value : 0),
    force: force.map((value, index) => keepPoint[index] ? value : 0),
  }
}

function buildTopAveragePointPressures(values, validIndexes, stats) {
  const result = new Array(values.length).fill(0)
  if (!validIndexes.length || !Number.isFinite(stats?.avgKpa) || !Number.isFinite(stats?.maxKpa)) {
    return result
  }

  const validValues = validIndexes.map((index) => values[index])
  const meanAdc = validValues.reduce((sum, value) => sum + value, 0) / validValues.length
  const maxAdc = Math.max(...validValues)
  const targetAverage = Math.max(0, Number(stats.avgKpa))
  const targetMaximum = Math.max(targetAverage, Number(stats.maxKpa))

  if (Math.abs(maxAdc - meanAdc) < 1e-9) {
    validIndexes.forEach((index) => {
      result[index] = targetAverage
    })
    return result
  }

  const slope = (targetMaximum - targetAverage) / (maxAdc - meanAdc)
  const intercept = targetAverage - slope * meanAdc
  validIndexes.forEach((index) => {
    result[index] = Math.max(0, slope * values[index] + intercept)
  })
  return result
}

/**
 * ADC 矩阵按压强公式换算成 kPa 矩阵。
 * 传实际点网格（sourceWidth × sourceHeight）或插值后的显示网格（displayWidth × displayHeight）都可以，
 * 按数组长度自动认网格并选对应的遮罩。现在调用方传的是插值后的显示网格：
 * 公式统计的点数（150 阈值、Top50）和屏幕上画的格子是同一批，面板数值不再和公式内部口径打架
 */
function convertPhysicalPressureMatrix(key, adcValues) {
  const config = DUMMY_MATRIX_CONFIG[key]
  if (!config || !adcValues.length) return []
  const formula = loadDummyPressureFormula()
  const validThreshold = Number(formula.DUMMY_VALID_ADC_THRESHOLD) || 10
  const isDisplayGrid = adcValues.length === config.displayWidth * config.displayHeight
  const gridWidth = isDisplayGrid ? config.displayWidth : config.sourceWidth
  const isCellValid = isDisplayGrid ? isDisplayCellValid : isPhysicalCellValid
  const validIndexes = []
  const validValues = []

  adcValues.forEach((value, index) => {
    const row = Math.floor(index / gridWidth)
    const col = index % gridWidth
    if (isCellValid(key, row, col) && Number(value) > validThreshold) {
      validIndexes.push(index)
      validValues.push(Number(value))
    }
  })

  const stats = formula.calculateDummyValuesPressure(validValues, config.sensorType)
  if (!stats || stats.mode === 'none') return new Array(adcValues.length).fill(0)
  if (stats.mode === 'top50') {
    return buildTopAveragePointPressures(adcValues, validIndexes, stats)
  }

  const masterRaw = config.sensorType.includes('leg')
    ? formula.legAdcToKpaRaw
    : formula.bodyAdcToKpaRaw
  const multiplier = Number(formula.DUMMY_POINTWISE_MULTIPLIER) || 2
  const result = new Array(adcValues.length).fill(0)
  validIndexes.forEach((index) => {
    result[index] = Math.max(0, masterRaw(adcValues[index]) * multiplier)
  })
  return result
}

function buildProcessingMetadata(config) {
  const pressureConfig = loadPressureConfig()
  const versionMatch = String(pressureConfig.dummyPressureFormulaFile || '').match(/v(\d+(?:\.\d+)*)/i)
  return {
    version: PROCESSING_VERSION,
    filter: config.filter,
    filterMode: config.filterMode,
    filterStage: 'converted-display-matrix',
    gauss: config.gauss,
    coherent: config.coherent,
    gaussianSigma: Number((config.gauss * GAUSSIAN_SIGMA_FACTOR).toFixed(3)),
    temporal: false,
    outputDigits: DISPLAY_DIGITS,
    formulaFile: pressureConfig.dummyPressureFormulaFile,
    formulaProfile: versionMatch ? `dummy-v${versionMatch[1]}` : 'dummy',
    pointSpacingCm: DUMMY_POINT_SPACING_CM,
    pointAreaCm2: DUMMY_POINT_AREA_CM2,
  }
}

function processSingleDummyMatrix(key, sourceValues, processingConfig) {
  const config = normalizeFrameProcessingConfig(processingConfig)
  const physicalSource = recoverPhysicalMatrix(key, sourceValues)
  if (!physicalSource.length) return null
  const rawAdcArr = normalizeRawAdcMatrix(key, sourceValues)
  const physicalAdc = processPhysicalAdcMatrix(key, physicalSource, config)
  const displayAdcRaw = interpolatePhysicalMatrix(key, physicalAdc)
  // 先插值再换算：公式和屏幕显示走同一批点（原来是在实际点上换算完再插值，
  // 插值出来的中间格是「压强的线性插值」，公式统计的点数也和屏幕上的格子数不一致）
  const displayPressureRaw = convertPhysicalPressureMatrix(key, displayAdcRaw)
  const filtered = applyDisplayMetricFilter(displayAdcRaw, displayPressureRaw, config)
  const displayAdc = filtered.adc.map((value) => roundValue(value, 2))
  const pressureArr = filtered.pressure.map((value) => roundValue(value))
  const forceArr = filtered.force.map((value) => roundValue(value))

  return {
    rawAdcArr,
    arr: displayAdc,
    pressureArr,
    forceArr,
    processing: buildProcessingMetadata(config),
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

function processFootMatrixItem(item, processingConfig) {
  const source = Array.isArray(item.arr) ? item.arr : []
  const rawSource = Array.isArray(item.rawAdcArr) && item.rawAdcArr.length === source.length
    ? item.rawAdcArr
    : source
  const { left, right } = splitFootRows(source)
  const { left: rawLeft, right: rawRight } = splitFootRows(rawSource)
  const leftResult = processSingleDummyMatrix(ENDI_LEFT_FOOT_KEY, left, processingConfig)
  const rightResult = processSingleDummyMatrix(ENDI_RIGHT_FOOT_KEY, right, processingConfig)
  if (!leftResult || !rightResult) return { ...item }
  const leftRawAdc = normalizeRawAdcMatrix(ENDI_LEFT_FOOT_KEY, rawLeft)
  const rightRawAdc = normalizeRawAdcMatrix(ENDI_RIGHT_FOOT_KEY, rawRight)

  return {
    ...item,
    rawAdcArr: combineFootRows(leftRawAdc, rightRawAdc),
    arr: combineFootRows(leftResult.arr, rightResult.arr),
    pressureArr: combineFootRows(leftResult.pressureArr, rightResult.pressureArr),
    forceArr: combineFootRows(leftResult.forceArr, rightResult.forceArr),
    sourceMatrices: {
      [ENDI_LEFT_FOOT_KEY]: leftResult.arr,
      [ENDI_RIGHT_FOOT_KEY]: rightResult.arr,
    },
    sourceRawAdcMatrices: {
      [ENDI_LEFT_FOOT_KEY]: leftRawAdc,
      [ENDI_RIGHT_FOOT_KEY]: rightRawAdc,
    },
    sourcePressureMatrices: {
      [ENDI_LEFT_FOOT_KEY]: leftResult.pressureArr,
      [ENDI_RIGHT_FOOT_KEY]: rightResult.pressureArr,
    },
    sourceForceMatrices: {
      [ENDI_LEFT_FOOT_KEY]: leftResult.forceArr,
      [ENDI_RIGHT_FOOT_KEY]: rightResult.forceArr,
    },
    processing: leftResult.processing,
  }
}

function processMatrixItem(key, item = {}, processingConfig = DEFAULT_FRAME_PROCESSING_CONFIG) {
  if (!isDummyMatrixKey(key)) return { ...item }
  if (key === ENDI_FOOT_KEY) return processFootMatrixItem(item, processingConfig)

  const source = Array.isArray(item.arr) ? item.arr : []
  const result = processSingleDummyMatrix(key, source, processingConfig)
  if (!result) return { ...item }
  const rawAdcArr = Array.isArray(item.rawAdcArr)
    ? normalizeRawAdcMatrix(key, item.rawAdcArr)
    : result.rawAdcArr
  return {
    ...item,
    ...result,
    rawAdcArr,
  }
}

function hasCanonicalMetricArrays(item = {}) {
  const length = Array.isArray(item.arr) ? item.arr.length : 0
  return item.processing?.version === PROCESSING_VERSION
    && length > 0
    && Array.isArray(item.pressureArr)
    && item.pressureArr.length === length
    && Array.isArray(item.forceArr)
    && item.forceArr.length === length
}

function ensureProcessedMatrixItem(key, item = {}, processingConfig = DEFAULT_FRAME_PROCESSING_CONFIG) {
  if (!isDummyMatrixKey(key) || hasCanonicalMetricArrays(item)) return { ...item }
  const source = Array.isArray(item.rawAdcArr) ? item.rawAdcArr : item.arr
  return processMatrixItem(key, { ...item, arr: source }, item.processing || processingConfig)
}

function processFrame(frame = {}, processingConfig = DEFAULT_FRAME_PROCESSING_CONFIG) {
  return Object.fromEntries(Object.entries(frame).map(([key, item]) => [
    key,
    item && typeof item === 'object'
      ? processMatrixItem(key, item, processingConfig)
      : item,
  ]))
}

function ensureProcessedFrame(frame = {}, processingConfig = DEFAULT_FRAME_PROCESSING_CONFIG) {
  return Object.fromEntries(Object.entries(frame).map(([key, item]) => [
    key,
    item && typeof item === 'object'
      ? ensureProcessedMatrixItem(key, item, processingConfig)
      : item,
  ]))
}

module.exports = {
  PROCESSING_VERSION,
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
