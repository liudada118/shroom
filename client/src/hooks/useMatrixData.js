import { useRef } from 'react'
import { getDisplayType, getSelectArr, getSettingValue, getSysType, useEquipStore } from '../store/equipStore'
import { getSystemMatrixParts, systemPointConfig } from '../util/constant'
import { calcCentroidRatio, colSelectMatrix, kurtosis, mean, normalPDF, skewness, variance } from '../util/util'
import { matrixGenBox, removeHistoryBox } from '../assets/util/selectMatrix'
import { isMoreMatrix } from '../assets/util/util'
import { message } from 'antd'
import { formatSelectionName, getDefaultSelectionName } from '../util/selectionName'
import {
  ADC_METRIC_MODE,
  FORCE_METRIC_MODE,
  PRESSURE_METRIC_MODE,
  getCanonicalMetricSummary,
  normalizePressureMetricMode,
  summarizeMetricValues,
} from '../util/pressureMetrics'
import { calcPartShapeMetrics } from '../util/gradientMetrics'

/**
 * 矩阵数据处理 Hook
 * 
 * 封装传感器数据的预处理、框选、翻转、统计计算逻辑
 * 支持多框选（最多4个），每个框独立计算统计数据
 */

const DEFAULT_SIT_ROTATE_DEGREE = 270
const DEFAULT_DATA_DIRECTION = {
  left: true,
  up: true,
  rotateDegree: 0,
  byKey: {
    'endi-back': { left: false, up: true, rotateDegree: 0 },
    'endi-sit': { left: true, up: true, rotateDegree: DEFAULT_SIT_ROTATE_DEGREE },
    'carY-back': { left: false, up: true, rotateDegree: 0 },
    'carY-sit': { left: true, up: true, rotateDegree: DEFAULT_SIT_ROTATE_DEGREE },
    'car-back': { left: false, up: true, rotateDegree: 0 },
    'car-sit': { left: true, up: true, rotateDegree: DEFAULT_SIT_ROTATE_DEGREE },
    'endi-jacket': { left: true, up: true, rotateDegree: 0 },
    'endi-leftHand': { left: true, up: true, rotateDegree: 0 },
    'endi-rightHand': { left: true, up: true, rotateDegree: 0 },
    'endi-leftFoot': { left: true, up: true, rotateDegree: 0 },
    'endi-rightFoot': { left: true, up: true, rotateDegree: 0 },
    'endi-foot': { left: true, up: true, rotateDegree: 0 },
  },
}
const DATA_DIRECTION_STORAGE_KEY = 'matrixDataDirection'
const DATA_QUALITY_MESSAGE_INTERVAL = 3000

function normalizeRotateDegree(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  return ((Math.round(numeric / 90) * 90) % 360 + 360) % 360
}

function getDataDirectionName(direction) {
  const rotateDegree = normalizeRotateDegree(direction?.rotateDegree ?? direction?.rotate_degree)
  if (rotateDegree) return `rotate${rotateDegree}`
  const left = direction?.left !== false
  const up = direction?.up !== false
  if (!left && !up) return 'both'
  if (!left) return 'horizontal'
  if (!up) return 'vertical'
  return 'none'
}

function normalizeDataDirection(direction) {
  const rotateDegree = normalizeRotateDegree(direction?.rotateDegree ?? direction?.rotate_degree)
  const normalized = {
    left: direction?.left !== false,
    up: direction?.up !== false,
    rotateDegree,
    rotate_degree: rotateDegree,
  }
  normalized.data_direction = getDataDirectionName(normalized)
  return normalized
}

function isSeatDirectionKey(key) {
  const value = String(key || '').toLowerCase()
  return value === 'sit' || value.endsWith('-sit')
}

function isBackDirectionKey(key) {
  const value = String(key || '').toLowerCase()
  return value === 'back' || value.endsWith('-back')
}

function shouldMigrateLegacySeatDirection(key, direction) {
  const normalized = normalizeDataDirection(direction)
  return isSeatDirectionKey(key)
    && normalized.left === true
    && (normalized.up === true || normalized.up === false)
    && (normalized.rotateDegree === 90 || normalized.rotateDegree === 270)
}

function shouldMigrateLegacyBackDirection(key, direction) {
  const normalized = normalizeDataDirection(direction)
  return isBackDirectionKey(key)
    && normalized.left === true
    && normalized.up === true
    && normalized.rotateDegree === 0
}

function normalizeDataDirectionState(direction) {
  const base = normalizeDataDirection(direction)
  const byKey = {}
  Object.keys(DEFAULT_DATA_DIRECTION.byKey || {}).forEach((key) => {
    byKey[key] = normalizeDataDirection(DEFAULT_DATA_DIRECTION.byKey[key])
  })
  if (direction?.byKey && typeof direction.byKey === 'object') {
    Object.keys(direction.byKey).forEach((key) => {
      byKey[key] = normalizeDataDirection(direction.byKey[key])
    })
  }
  return { ...base, byKey }
}

function loadStoredDataDirection() {
  try {
    const storedDirection = JSON.parse(localStorage.getItem(DATA_DIRECTION_STORAGE_KEY) || '{}')
    if (storedDirection?.byKey && typeof storedDirection.byKey === 'object') {
      Object.keys(storedDirection.byKey).forEach((key) => {
        if (shouldMigrateLegacySeatDirection(key, storedDirection.byKey[key])) {
          storedDirection.byKey[key] = { left: true, up: true, rotateDegree: DEFAULT_SIT_ROTATE_DEGREE }
        } else if (shouldMigrateLegacyBackDirection(key, storedDirection.byKey[key])) {
          storedDirection.byKey[key] = { left: false, up: true, rotateDegree: 0 }
        }
      })
    }
    return normalizeDataDirectionState(storedDirection)
  } catch {
    return normalizeDataDirectionState(DEFAULT_DATA_DIRECTION)
  }
}

function persistDataDirection(direction) {
  try {
    localStorage.setItem(DATA_DIRECTION_STORAGE_KEY, JSON.stringify(normalizeDataDirectionState(direction)))
  } catch { }
}

export function useMatrixData() {
  const sitDataRef = useRef({})
  const disPlayDataRef = useRef({})
  const chartRef = useRef({})
  const renderedMetricDataRef = useRef({
    [ADC_METRIC_MODE]: {},
    [PRESSURE_METRIC_MODE]: {},
    [FORCE_METRIC_MODE]: {},
  })
  const wsLocalDataRef = useRef({ data: {}, flag: false })
  const dataDirection = useRef(loadStoredDataDirection())
  const activeFrameDirectionRef = useRef({})
  const lastSensorFrameRef = useRef(null)
  const lastSensorFrameSourceRef = useRef('realtime')

  /**
   * 限制 endi 类型数据值上限为 255
   */
  function clampEndi(arr, fullKey, shortKey) {
    if (!fullKey.includes('endi')) return arr
    return arr.map(a => a > 255 ? 255 : a)
  }

  /**
   * 从矩阵中提取框选区域的数据
   */
  function extractSelectData(arr, matrix, width) {
    if (!matrix) return null
    const { xStart, xEnd, yStart, yEnd } = matrix
    if (
      !Number.isFinite(xStart) || !Number.isFinite(xEnd) ||
      !Number.isFinite(yStart) || !Number.isFinite(yEnd) ||
      xStart < 0 || yStart < 0 || xEnd <= xStart || yEnd <= yStart ||
      xEnd > width || yEnd > Math.ceil(arr.length / width)
    ) {
      return null
    }
    const newArr = []
    for (let y = yStart; y < yEnd; y++) {
      for (let x = xStart; x < xEnd; x++) {
        if (y * width + x >= arr.length) return null
        newArr.push(arr[y * width + x])
      }
    }
    return newArr
  }

  function getMatrixKeyCandidates(key) {
    const candidates = [key]
    if (typeof key === 'string' && key.includes('-')) {
      candidates.push(key.split('-').pop())
    }
    if (typeof key === 'string' && !key.includes('-')) {
      const systemType = getSysType()
      if (systemType) candidates.push(`${systemType}-${key}`)
    }
    return [...new Set(candidates.filter(Boolean))]
  }

  function matrixKeysMatch(a, b) {
    if (!a || !b) return true
    if (typeof a === 'string' && typeof b === 'string') {
      if (a.endsWith(`-${b}`) || b.endsWith(`-${a}`)) return true
    }
    const aCandidates = new Set(getMatrixKeyCandidates(a))
    return getMatrixKeyCandidates(b).some(candidate => aCandidates.has(candidate))
  }

  function getMatrixConfigEntry(matrixKey, shortKey) {
    const candidates = [
      matrixKey,
      shortKey,
      ...getMatrixKeyCandidates(matrixKey),
      ...getMatrixKeyCandidates(shortKey),
    ]
    for (const candidate of candidates) {
      if (candidate && systemPointConfig[candidate]) {
        return { key: candidate, config: systemPointConfig[candidate] }
      }
    }
    return { key: matrixKey, config: null }
  }

  /**
   * 计算框选区域数据 — 支持多框
   * 返回: { default: [...全部数据], boxes: [{data, colorIndex, bgc, matrix}] }
   */
  function computeSelectArr(arr, key, fullKey, select, displayType, sitDataItem) {
    const { config } = getMatrixConfigEntry(fullKey, key)
    if (!config) return { default: arr, boxes: [] }
    const { width, height } = config

    // 实时框选 — 支持多个框
    const currentSelect = select
      .map((sel, originalIndex) => ({ sel, originalIndex }))
      .filter(({ sel }) => {
        if (sel?.matrixKey) return matrixKeysMatch(sel.matrixKey, fullKey)
        return displayType.includes(key)
      })

    if (currentSelect.length) {
      const boxes = []
      for (let i = 0; i < currentSelect.length; i++) {
        const { sel, originalIndex } = currentSelect[i]
        const matrix = colSelectMatrix('canvasThree', sel, systemPointConfig[fullKey])
        if (matrix) {
          const data = extractSelectData(arr, matrix, width)
          if (data) {
            boxes.push({
              data,
              colorIndex: sel.colorIndex != null ? sel.colorIndex : originalIndex,
              bgc: sel.bgc || '#FF6B6B',
              name: formatSelectionName(sel.name, originalIndex + 1),
              matrix,
            })
          }
        }
      }

      // 如果有框选，default 使用第一个框的数据（兼容旧逻辑）
      // boxes 包含所有框的独立数据
      return {
        default: boxes.length > 0 ? boxes[0].data : [...arr],
        boxes,
      }
    }

    // 回放框选只在当前回放确实处于框选状态时生效，避免退出框选后旧帧缓存重新绘制历史框。
    if (sitDataItem?.select && useEquipStore.getState().playbackHasSelection) {
      const regionsRaw = Array.isArray(sitDataItem.select?.regions)
        ? sitDataItem.select.regions
        : (sitDataItem.select ? [sitDataItem.select] : [])
      const regions = regionsRaw.filter(Boolean)
      if (!regions.length) return { default: [...arr], boxes: [] }

      if (displayType.includes(key) && displayType.includes('2D')) {
        const canvas = document.querySelector('.canvasThree')
        if (canvas) {
          const canvasInfo = canvas.getBoundingClientRect()
          const canvasObj = {
            canvasX1: canvasInfo.left, canvasX2: canvasInfo.right,
            canvasY1: canvasInfo.top, canvasY2: canvasInfo.bottom
          }
          const max = Math.max(width, height)
          matrixGenBox(regions, canvasObj, max, config)
        }
      } else {
        removeHistoryBox()
      }

      const PLAYBACK_FALLBACK_COLORS = ['#FF6B6B', '#4ECDC4', '#FFD93D', '#6C5CE7']
      const boxes = []
      regions.forEach((region, index) => {
        const data = extractSelectData(arr, region, width)
        if (!data) return
        const colorIndex = Number.isFinite(Number(region.colorIndex)) ? Number(region.colorIndex) : index
        boxes.push({
          data,
          colorIndex,
          bgc: region.bgc || region.color || PLAYBACK_FALLBACK_COLORS[colorIndex % PLAYBACK_FALLBACK_COLORS.length],
          name: formatSelectionName(region.name || region.regionName, index + 1),
          matrix: region,
        })
      })

      return {
        default: boxes.length > 0 ? boxes[0].data : [...arr],
        boxes,
      }
    }

    // 无框选，使用全部数据
    return { default: [...arr], boxes: [] }
  }

  /**
   * 计算单个数据集的统计指标
   */
  function computeSingleStats(adcValues, pressureValues, forceValues, mode) {
    const summary = getCanonicalMetricSummary(pressureValues, forceValues, mode, adcValues)
    const positiveValues = summary.metricValues.filter((value) => value > 0)
    const minimum = positiveValues.length ? Math.min(...positiveValues) : 0
    const stats = {
      metricMode: summary.mode,
      metricUnit: summary.unit,
      areaTotal: summary.activeCount,
      pressMax: summary.max.toFixed(1),
      pressAver: summary.average.toFixed(1),
      pressMin: minimum.toFixed(1),
      adcMax: summary.adcSummary.max.toFixed(1),
      adcAver: summary.adcSummary.average.toFixed(1),
      adcTotal: summary.adcSummary.total.toFixed(1),
      pressureMax: summary.pressureSummary.max.toFixed(1),
      pressureAver: summary.pressureSummary.average.toFixed(1),
      pressureTotal: summary.pressureSummary.total.toFixed(1),
      forceMax: summary.forceSummary.max.toFixed(1),
      forceAver: summary.forceSummary.average.toFixed(1),
      forceTotal: summary.forceSummary.total.toFixed(1),
      pressTotal: summary.forceSummary.total.toFixed(1),
      total: summary.forceSummary.total,
    }

    // carY 类型压力转换
    return {
      area: summary.activeCount,
      press: summary.total,
      stats,
      summary,
    }
  }

  function projectBoxCenterToMatrix(center, matrix, matrixWidth, matrixHeight) {
    const cx = Number(center?.x)
    const cy = Number(center?.y)
    const xStart = Number(matrix?.xStart)
    const yStart = Number(matrix?.yStart)
    const xEnd = Number(matrix?.xEnd)
    const yEnd = Number(matrix?.yEnd)
    if (![cx, cy, xStart, yStart, xEnd, yEnd, matrixWidth, matrixHeight].every(Number.isFinite)) {
      return center
    }
    const boxWidth = Math.max(1, xEnd - xStart)
    const boxHeight = Math.max(1, yEnd - yStart)
    const globalX = matrixWidth > 1 ? (xStart + cx * (boxWidth - 1)) / (matrixWidth - 1) : 0.5
    const globalY = matrixHeight > 1 ? (yStart + cy * (boxHeight - 1)) / (matrixHeight - 1) : 0.5
    return {
      x: Math.max(0, Math.min(1, globalX)).toFixed(2),
      y: Math.max(0, Math.min(1, globalY)).toFixed(2),
    }
  }

  /**
   * 计算统计指标（压力、面积、重心、正态分布等）
   * 支持多框选：data[key].boxStats = [{colorIndex, bgc, pressArr, areaArr, data}]
   */
  function setTrendValue(target, value, options = {}) {
    if (!Array.isArray(target)) return
    if (options.replaceLast && target.length > 0) {
      target[target.length - 1] = value
      return
    }
    if (target.length < 20) {
      target.push(value)
    } else {
      target.shift()
      target.push(value)
    }
  }

  function computeStats(data, arr, selectResult, key, fullKey, options = {}, metricData = {}) {
    const { key: matrixKey, config } = getMatrixConfigEntry(fullKey, key)
    if (!config) return
    const { width, height } = config

    if (!data[key]) data[key] = {}
    if (!data[key].areaArr) data[key].areaArr = []
    if (!data[key].pressArr) data[key].pressArr = []
    if (!data[key].adcArr) data[key].adcArr = []
    if (!data[key].pressureArr) data[key].pressureArr = []
    if (!data[key].forceArr) data[key].forceArr = []
    if (!data[key].adcAreaArr) data[key].adcAreaArr = []
    if (!data[key].pressureAreaArr) data[key].pressureAreaArr = []
    if (!data[key].forceAreaArr) data[key].forceAreaArr = []
    if (!data[key].data) data[key].data = {}
    if (!data[key].boxStats) data[key].boxStats = []

    const selectedArr = selectResult.default
    const metricMode = normalizePressureMetricMode(metricData.mode)
    const adcSelectResult = metricData.adcSelectResult || { default: [], boxes: [] }
    const pressureSelectResult = metricData.pressureSelectResult || { default: [], boxes: [] }
    const forceSelectResult = metricData.forceSelectResult || { default: [], boxes: [] }
    const {
      summary: activeSummary,
      stats: activeStats,
    } = computeSingleStats(
      adcSelectResult.default,
      pressureSelectResult.default,
      forceSelectResult.default,
      metricMode,
    )
    const adcSummary = activeSummary.adcSummary
    const pressureSummary = activeSummary.pressureSummary
    const forceSummary = activeSummary.forceSummary
    const firstBox = selectResult.boxes?.[0]
    const firstBoxWidth = Math.max(1, Number(firstBox?.matrix?.xEnd) - Number(firstBox?.matrix?.xStart) || width)
    const firstBoxHeight = Math.max(1, Number(firstBox?.matrix?.yEnd) - Number(firstBox?.matrix?.yStart) || height)
    const selectedCenter = firstBox
      ? projectBoxCenterToMatrix(calcCentroidRatio([...selectedArr], firstBoxWidth, firstBoxHeight), firstBox.matrix, width, height)
      : calcCentroidRatio([...selectedArr], width, height)
    const mu = mean(selectedArr)
    const v = variance(selectedArr, mu)
    const sigma = Math.sqrt(v)
    const sk = skewness(selectedArr, mu, sigma)
    const ku = kurtosis(selectedArr, mu, sigma)
    const selectedMax = selectedArr.length ? Math.max(...selectedArr, 1) : 1
    const xData = Array.from({ length: 256 }, (_, i) => selectedMax * i / 255)
    const yData = xData.map(x => normalPDF(x, mu, sigma))

    data[key].center = selectedCenter
    data[key].normalDis = {
      μ: mu.toFixed(3),
      Var: v.toFixed(3),
      Skew: sk.toFixed(3),
      Kurt: ku.toFixed(3),
      xData,
      yData
    }

    // 默认统计（全部数据或第一个框）
    setTrendValue(data[key].areaArr, activeSummary.activeCount, options)
    setTrendValue(data[key].adcAreaArr, adcSummary.activeCount, options)
    setTrendValue(data[key].pressureAreaArr, pressureSummary.activeCount, options)
    setTrendValue(data[key].forceAreaArr, forceSummary.activeCount, options)
    setTrendValue(data[key].pressArr, Number(forceSummary.total.toFixed(1)), options)
    setTrendValue(data[key].adcArr, Number(adcSummary.total.toFixed(1)), options)
    setTrendValue(data[key].pressureArr, Number(pressureSummary.total.toFixed(1)), options)
    setTrendValue(data[key].forceArr, Number(forceSummary.total.toFixed(1)), options)

    data[key].data = activeStats

    // carY 类型压力转换
    data[key].data.pressTotal = forceSummary.total.toFixed(1)

    // 对称系数 / 压力梯度：始终基于整块部位的压强矩阵（kPa），不受框选影响
    data[key].shape = calcPartShapeMetrics(
      Array.isArray(metricData.pressureValues) ? metricData.pressureValues : pressureSelectResult.default,
      width,
      height,
      fullKey || key,
    )

    // ─── 多框选独立统计 ───────────────────────────────────
    const boxes = selectResult.boxes
    if (boxes.length > 0) {
      // 确保每个框都有自己的滑动窗口
      while (data[key].boxStats.length < boxes.length) {
        data[key].boxStats.push({
          colorIndex: 0,
          bgc: '#FF6B6B',
          name: getDefaultSelectionName(data[key].boxStats.length + 1),
          pressArr: [],
          adcArr: [],
          pressureArr: [],
          forceArr: [],
          areaArr: [],
          adcAreaArr: [],
          pressureAreaArr: [],
          forceAreaArr: [],
          data: {},
        })
      }
      // 如果框数减少了，截断
      if (data[key].boxStats.length > boxes.length) {
        data[key].boxStats.length = boxes.length
      }

      for (let i = 0; i < boxes.length; i++) {
        const box = boxes[i]
        const boxStat = data[key].boxStats[i]
        boxStat.colorIndex = box.colorIndex
        boxStat.bgc = box.bgc
        boxStat.name = formatSelectionName(box.name, i + 1)

        const adcBox = adcSelectResult.boxes[i]?.data || []
        const pressureBox = pressureSelectResult.boxes[i]?.data || []
        const forceBox = forceSelectResult.boxes[i]?.data || []
        const {
          summary: boxSummary,
          stats,
        } = computeSingleStats(adcBox, pressureBox, forceBox, metricMode)
        boxStat.data = stats
        const boxWidth = Math.max(1, Number(box.matrix?.xEnd) - Number(box.matrix?.xStart) || width)
        const boxHeight = Math.max(1, Number(box.matrix?.yEnd) - Number(box.matrix?.yStart) || height)
        const boxMu = mean(box.data)
        const boxVariance = variance(box.data, boxMu)
        const boxSigma = Math.sqrt(boxVariance)
        const boxMax = box.data.length ? Math.max(...box.data, 1) : 1
        const boxXData = Array.from({ length: 256 }, (_, index) => boxMax * index / 255)
        const localCenter = calcCentroidRatio([...box.data], boxWidth, boxHeight)
        boxStat.center = projectBoxCenterToMatrix(localCenter, box.matrix, width, height)
        boxStat.localCenter = localCenter
        boxStat.normalDis = {
          ['\u03bc']: boxMu.toFixed(3),
          Var: boxVariance.toFixed(3),
          Skew: skewness(box.data, boxMu, boxSigma).toFixed(3),
          Kurt: kurtosis(box.data, boxMu, boxSigma).toFixed(3),
          xData: boxXData,
          yData: boxXData.map(x => normalPDF(x, boxMu, boxSigma)),
        }

        setTrendValue(boxStat.pressArr, Number(boxSummary.forceSummary.total.toFixed(1)), options)
        setTrendValue(boxStat.adcArr, Number(boxSummary.adcSummary.total.toFixed(1)), options)
        setTrendValue(boxStat.pressureArr, Number(boxSummary.pressureSummary.total.toFixed(1)), options)
        setTrendValue(boxStat.forceArr, Number(boxSummary.forceSummary.total.toFixed(1)), options)
        setTrendValue(boxStat.areaArr, boxSummary.activeCount, options)
        setTrendValue(boxStat.adcAreaArr, boxSummary.adcSummary.activeCount, options)
        setTrendValue(boxStat.pressureAreaArr, boxSummary.pressureSummary.activeCount, options)
        setTrendValue(boxStat.forceAreaArr, boxSummary.forceSummary.activeCount, options)
      }
    } else {
      // 无框选时清空 boxStats
      data[key].boxStats = []
    }
  }

  /**
   * 水平翻转矩阵数据
   */
  function flipHorizontalArray(arr, width, height) {
    const res = []
    for (let y = 0; y < height; y++) {
      for (let x = width - 1; x >= 0; x--) {
        res.push(arr[y * width + x])
      }
    }
    return res
  }

  function flipHorizontal(resArr, keyArr) {
    const res = {}
    for (const fullKey of keyArr) {
      const key = fullKey.includes('-') ? fullKey.split('-')[1] : fullKey
      if (!resArr[key]) continue
      if (!systemPointConfig[fullKey]) continue
      const { width, height } = systemPointConfig[fullKey]
      res[key] = flipHorizontalArray(resArr[key], width, height)
    }
    return res
  }

  /**
   * 垂直翻转矩阵数据
   */
  function flipVerticalArray(arr, width, height) {
    const res = []
    for (let y = height - 1; y >= 0; y--) {
      for (let x = 0; x < width; x++) {
        res.push(arr[y * width + x])
      }
    }
    return res
  }

  function flipVertical(resArr, keyArr) {
    const res = {}
    for (const fullKey of keyArr) {
      const key = fullKey.includes('-') ? fullKey.split('-')[1] : fullKey
      if (!resArr[key]) continue
      if (!systemPointConfig[fullKey]) continue
      const { width, height } = systemPointConfig[fullKey]
      res[key] = flipVerticalArray(resArr[key], width, height)
    }
    return res
  }

  function rotateClockwiseArray(arr, width, height) {
    const res = []
    for (let x = 0; x < width; x++) {
      for (let y = height - 1; y >= 0; y--) {
        res.push(arr[y * width + x])
      }
    }
    return res
  }

  function applyDirectionToArray(arr, width, height, direction) {
    const normalized = normalizeDataDirection(direction)
    let nextArr = [...arr]
    let currentWidth = width
    let currentHeight = height

    const turns = normalizeRotateDegree(normalized.rotateDegree) / 90
    for (let i = 0; i < turns; i++) {
      nextArr = rotateClockwiseArray(nextArr, currentWidth, currentHeight)
      const oldWidth = currentWidth
      currentWidth = currentHeight
      currentHeight = oldWidth
    }

    if (!normalized.left) {
      nextArr = flipHorizontalArray(nextArr, currentWidth, currentHeight)
    }
    if (!normalized.up) {
      nextArr = flipVerticalArray(nextArr, currentWidth, currentHeight)
    }

    return nextArr
  }

  function isDefaultDataDirection(direction) {
    const normalized = normalizeDataDirection(direction)
    return normalized.left === true
      && normalized.up === true
      && normalizeRotateDegree(normalized.rotateDegree) === 0
  }

  function getExecutedDirectionForFrame(fullKey, frameItem) {
    const currentDirection = getCurrentDirectionForKey(fullKey)
    const frameDirection = normalizeDataDirection(frameItem?.dataDirection || DEFAULT_DATA_DIRECTION)
    return frameDirection || currentDirection
  }

  function applyDisplayDirection(resArr, keyArr, sitData) {
    const res = { ...resArr }

    for (const fullKey of keyArr) {
      const key = fullKey.includes('-') ? fullKey.split('-')[1] : fullKey
      if (!res[key] || !systemPointConfig[fullKey]) continue

      const executedDirection = getExecutedDirectionForFrame(fullKey, sitData[fullKey])
      activeFrameDirectionRef.current[fullKey] = executedDirection
    }

    return res
  }

  function buildFilteredMatrixFromRaw(rawArr, keyArr) {
    const resArr = {}
    for (let i = 0; i < keyArr.length; i++) {
      const key = keyArr[i].includes('-') ? keyArr[i].split('-')[1] : keyArr[i]
      if (!rawArr[key]) continue
      resArr[key] = [...rawArr[key]]
    }
    return resArr
  }

  function buildStatsMatrixFromRaw(rawArr, keyArr, sitData = {}) {
    const resArr = {}
    const wsLocalData = wsLocalDataRef.current.data
    const zeroEnabled = wsLocalDataRef.current.flag

    for (let i = 0; i < keyArr.length; i++) {
      const fullKey = keyArr[i]
      const key = fullKey.includes('-') ? fullKey.split('-')[1] : fullKey
      if (!rawArr[key]) continue
      const zeroed = rawArr[key].map((value, index) => {
        if (!zeroEnabled || !wsLocalData[key]) return value
        return Math.max(0, value - (Number(wsLocalData[key][index]) || 0))
      })
      resArr[key] = zeroed
    }

    return applyDisplayDirection(resArr, keyArr, sitData)
  }

  function buildDisplayMatrixFromRaw(rawArr, keyArr, sitData) {
    return applyDisplayDirection(buildFilteredMatrixFromRaw(rawArr, keyArr), keyArr, sitData)
  }

  function splitEndiFootDisplayParts(matrixMap, sitData = {}, sourceField = 'sourceMatrices') {
    const sourceMatrices = sitData?.['endi-foot']?.[sourceField] || {}
    const sourceLeft = sourceMatrices['endi-leftFoot']
    const sourceRight = sourceMatrices['endi-rightFoot']
    const singleWidth = 12
    const height = 64
    const singleLength = singleWidth * height

    if (Array.isArray(sourceLeft) || Array.isArray(sourceRight)) {
      return {
        ...matrixMap,
        leftFoot: Array.isArray(sourceLeft) && sourceLeft.length === singleLength
          ? sourceLeft
          : new Array(singleLength).fill(0),
        rightFoot: Array.isArray(sourceRight) && sourceRight.length === singleLength
          ? sourceRight
          : new Array(singleLength).fill(0),
      }
    }

    if (!Array.isArray(matrixMap?.foot)) return matrixMap
    const foot = matrixMap.foot
    const combinedWidth = 24
    if (foot.length !== combinedWidth * height) return matrixMap

    const leftFoot = []
    const rightFoot = []
    for (let row = 0; row < height; row++) {
      const start = row * combinedWidth
      leftFoot.push(...foot.slice(start, start + singleWidth))
      rightFoot.push(...foot.slice(start + singleWidth, start + combinedWidth))
    }
    return {
      ...matrixMap,
      leftFoot,
      rightFoot,
    }
  }

  function buildCanonicalMetricMaps(sitData, keyArr) {
    const adcMap = {}
    const pressureMap = {}
    const forceMap = {}

    for (const fullKey of keyArr) {
      const key = fullKey.includes('-') ? fullKey.split('-')[1] : fullKey
      const item = sitData[fullKey] || {}
      const rawAdcValues = Array.isArray(item.rawAdcArr) ? item.rawAdcArr : item.arr
      const count = Math.max(
        Array.isArray(item.arr) ? item.arr.length : 0,
        Array.isArray(rawAdcValues) ? rawAdcValues.length : 0,
      )
      adcMap[key] = Array.from({ length: count }, (_, index) => {
        const value = Number(rawAdcValues?.[index])
        return Number.isFinite(value) && value > 0 ? value : 0
      })
      pressureMap[key] = Array.from({ length: count }, (_, index) => {
        const value = Number(item.pressureArr?.[index])
        return Number.isFinite(value) && value > 0 ? value : 0
      })
      forceMap[key] = Array.from({ length: count }, (_, index) => {
        const value = Number(item.forceArr?.[index])
        return Number.isFinite(value) && value > 0 ? value : 0
      })
    }

    const metricMaps = {
      [ADC_METRIC_MODE]: splitEndiFootDisplayParts(
        adcMap,
        sitData,
        'sourceRawAdcMatrices',
      ),
      [PRESSURE_METRIC_MODE]: splitEndiFootDisplayParts(
        pressureMap,
        sitData,
        'sourcePressureMatrices',
      ),
      [FORCE_METRIC_MODE]: splitEndiFootDisplayParts(
        forceMap,
        sitData,
        'sourceForceMatrices',
      ),
    }
    renderedMetricDataRef.current = metricMaps
    useEquipStore.getState().setMetricStatus(metricMaps)
    return metricMaps
  }

  /**
   * 处理传感器数据帧（实时或回放）
   */
  function processSensorFrame(sitData, data, options = {}) {
    const isRealtimeFrame = options.source !== 'playback'
    if (!Object.keys(sitData).length) {
      useEquipStore.getState().setStatus(new Array(4096).fill(0))
      useEquipStore.getState().setDisplayStatus(new Array(4096).fill(0))
      useEquipStore.getState().setMetricStatus({
        [ADC_METRIC_MODE]: {},
        [PRESSURE_METRIC_MODE]: {},
        [FORCE_METRIC_MODE]: {},
      })
      return
    }
    lastSensorFrameRef.current = sitData
    lastSensorFrameSourceRef.current = options.source || 'realtime'

    const select = getSelectArr()
    const displayType = getDisplayType()
    const keyArr = Object.keys(sitData)
    const arr = {}
    const sourceAdcArr = {}

    // 1. 解析矩阵数据
    for (let i = 0; i < keyArr.length; i++) {
      const fullKey = keyArr[i]
      const key = fullKey.includes('-') ? fullKey.split('-')[1] : fullKey
      if (!sitData[fullKey]?.arr) continue

      arr[key] = clampEndi([...sitData[fullKey].arr], fullKey, key)
      const rawAdc = Array.isArray(sitData[fullKey].rawAdcArr)
        ? sitData[fullKey].rawAdcArr
        : sitData[fullKey].arr
      sourceAdcArr[key] = clampEndi([...rawAdc], fullKey, key)
    }

    const metricMode = normalizePressureMetricMode(useEquipStore.getState().pressureMetricMode)
    const metricMaps = buildCanonicalMetricMaps(sitData, keyArr)
    const activeMetricMap = metricMaps[metricMode]

    // 2. Compute selections, trends, and distribution from the canonical metric matrices.
    for (let i = 0; i < keyArr.length; i++) {
      const fullKey = keyArr[i]
      const key = fullKey.includes('-') ? fullKey.split('-')[1] : fullKey
      const adcValues = metricMaps[ADC_METRIC_MODE][key]
      const pressureValues = metricMaps[PRESSURE_METRIC_MODE][key]
      const forceValues = metricMaps[FORCE_METRIC_MODE][key]
      const activeValues = activeMetricMap[key]
      if (!activeValues) continue

      const adcSelectResult = computeSelectArr(
        adcValues,
        key,
        fullKey,
        select,
        displayType,
        sitData[fullKey],
      )
      const pressureSelectResult = computeSelectArr(
        pressureValues,
        key,
        fullKey,
        select,
        displayType,
        sitData[fullKey],
      )
      const forceSelectResult = computeSelectArr(
        forceValues,
        key,
        fullKey,
        select,
        displayType,
        sitData[fullKey],
      )
      const selectResult = metricMode === ADC_METRIC_MODE
        ? adcSelectResult
        : metricMode === PRESSURE_METRIC_MODE
          ? pressureSelectResult
          : forceSelectResult
      computeStats(data, activeValues, selectResult, key, fullKey, {
        replaceLast: Boolean(options.replaceLast),
      }, {
        mode: metricMode,
        adcSelectResult,
        pressureSelectResult,
        forceSelectResult,
        pressureValues,
      })
    }

    chartRef.current = data
    sitDataRef.current = sourceAdcArr
    disPlayDataRef.current = activeMetricMap

    // 3. Update device status.
    let stamp, cop
    for (const k of keyArr) {
      if (sitData[k]?.stamp != null) { stamp = sitData[k].stamp; break }
    }
    for (const k of keyArr) {
      if (sitData[k]?.cop != null) { cop = sitData[k].cop; break }
    }
    const newObj = {}
    const dataQualityObj = {}
    for (const fullKey of keyArr) {
      if (fullKey === 'endi-foot') {
        const sourceStatuses = sitData[fullKey]?.sourceStatuses || {}
        newObj['endi-leftFoot'] = sourceStatuses['endi-leftFoot'] || sitData[fullKey]?.status
        newObj['endi-rightFoot'] = sourceStatuses['endi-rightFoot'] || sitData[fullKey]?.status
      } else {
        newObj[fullKey] = sitData[fullKey]?.status
      }
      if (sitData[fullKey]?.dataQuality) {
        dataQualityObj[fullKey] = sitData[fullKey].dataQuality
      }
    }
    if (isRealtimeFrame) {
      useEquipStore.getState().setEquipStatus(newObj)
    }
    if (isRealtimeFrame && Object.keys(dataQualityObj).length) {
      const prevQuality = useEquipStore.getState().dataQuality || {}
      useEquipStore.getState().setDataQuality({ ...prevQuality, ...dataQualityObj })

      const severeEntry = Object.entries(dataQualityObj).find(([, quality]) => quality?.status === 'device_error')
      if (severeEntry) {
        const now = Date.now()
        const [qualityKey, quality] = severeEntry
        if (!window.__dataQualityMessageAt || now - window.__dataQualityMessageAt > DATA_QUALITY_MESSAGE_INTERVAL) {
          window.__dataQualityMessageAt = now
          message.warning(`${qualityKey} 设备数据异常，请重新连接`)
        }
        if (quality?.status === 'device_error') {
          useEquipStore.getState().setConnectState('deviceError')
          useEquipStore.getState().setConnectionError(quality)
        }
      }
    }

    // 检测设备断开：5 秒防抖
    const allOffline = Object.values(newObj).every(s => s === 'offline' || s === undefined)
    if (isRealtimeFrame && allOffline && useEquipStore.getState().connectState === 'connected') {
      if (!window.__offlineDebounceTimer) {
        window.__offlineDebounceTimer = setTimeout(() => {
          const currentStatus = useEquipStore.getState().equipStatus
          const stillAllOffline = Object.values(currentStatus).every(s => s === 'offline' || s === undefined)
          if (stillAllOffline && useEquipStore.getState().connectState === 'connected') {
            console.warn('[MatrixData] All devices offline for 5s, setting connectState to idle')
            useEquipStore.getState().setConnectState('idle')
          }
          window.__offlineDebounceTimer = null
        }, 5000)
      }
    } else if ((!isRealtimeFrame || !allOffline) && window.__offlineDebounceTimer) {
      clearTimeout(window.__offlineDebounceTimer)
      window.__offlineDebounceTimer = null
    }

    const sysType = getSysType()
    if (!arr || !keyArr.some(a => a.includes(sysType))) return

    useEquipStore.getState().setEquipStamp(stamp)
    if (cop) useEquipStore.getState().setEquipCop(cop)

    disPlayDataRef.current = activeMetricMap
    useEquipStore.getState().setDisplayStatus(activeMetricMap)
  }

  /**
   * 切换翻转方向
   */
  function getCurrentDirectionForKey(fullKey) {
    const state = normalizeDataDirectionState(dataDirection.current)
    return normalizeDataDirection(state.byKey?.[fullKey] || state)
  }

  function getDirectionTargetKeys(targetPart) {
    const system = getSysType()
    if (!isMoreMatrix(system)) return []
    if (targetPart) {
      const key = `${system}-${targetPart}`
      return systemPointConfig[key] ? [key] : []
    }
    return getSystemMatrixParts(system).map((part) => `${system}-${part.key}`).filter((key) => systemPointConfig[key])
  }

  function setDataDirection(direction) {
    dataDirection.current = normalizeDataDirectionState(direction || DEFAULT_DATA_DIRECTION)
    persistDataDirection(dataDirection.current)
    return dataDirection.current
  }

  function changeDataDirection(dir, targetPart) {
    const state = normalizeDataDirectionState(dataDirection.current)
    const targetKeys = getDirectionTargetKeys(targetPart)
    const getDirectionBaseForKey = (key) => normalizeDataDirection(
      activeFrameDirectionRef.current[key] || state.byKey?.[key] || state
    )
    const applyChange = (direction) => {
      const next = normalizeDataDirection(direction)
      if (dir === 'rotate') {
        const rotateDelta = targetPart === 'sit' ? -90 : 90
        next.rotateDegree = normalizeRotateDegree(next.rotateDegree + rotateDelta)
      } else {
        const prop = dir === 'left' ? 'left' : 'up'
        next[prop] = !next[prop]
      }
      next.rotate_degree = next.rotateDegree
      next.data_direction = getDataDirectionName(next)
      return normalizeDataDirection(next)
    }

    if (targetKeys.length) {
      const byKey = { ...state.byKey }
      getDirectionTargetKeys().forEach((key) => {
        if (!byKey[key]) {
          byKey[key] = getDirectionBaseForKey(key)
        }
      })
      targetKeys.forEach((key) => {
        byKey[key] = applyChange(getDirectionBaseForKey(key))
      })
      dataDirection.current = { ...normalizeDataDirection(DEFAULT_DATA_DIRECTION), byKey }
      persistDataDirection(dataDirection.current)
      return normalizeDataDirectionState(dataDirection.current)
    }

    const system = getSysType()
    const baseDirection = activeFrameDirectionRef.current[system] || state
    dataDirection.current = applyChange(baseDirection)
    persistDataDirection(dataDirection.current)
    return normalizeDataDirectionState(dataDirection.current)
  }

  /**
   * 预压力置零：记录当前帧作为基准
   */
  function changeWsLocalData(action = 'toggle') {
    const enabled = action === 'enable'
      ? true
      : action === 'disable'
        ? false
        : !wsLocalDataRef.current.flag
    if (enabled && !Object.values(sitDataRef.current || {}).some((arr) => Array.isArray(arr) && arr.length > 0)) {
      return {
        enabled: false,
        error: 'no_data',
        data: {},
      }
    }
    const zeroTime = enabled ? Date.now() : null
    wsLocalDataRef.current = {
      data: enabled ? { ...sitDataRef.current } : {},
      flag: enabled,
      zeroTime,
    }
    refreshDisplayWithCurrentSettings(chartRef.current)
    return {
      enabled,
      zeroTime,
      data: wsLocalDataRef.current.data,
    }
  }

  function reprocessLastSensorFrame(data, options = {}) {
    if (!lastSensorFrameRef.current || !Object.keys(lastSensorFrameRef.current).length) return false
    processSensorFrame(lastSensorFrameRef.current, data, {
      source: options.source || lastSensorFrameSourceRef.current || 'realtime',
      replaceLast: Boolean(options.replaceLast),
    })
    return true
  }

  function refreshDisplayWithCurrentSettings(data = chartRef.current) {
    return reprocessLastSensorFrame(data, {
      source: lastSensorFrameSourceRef.current || 'realtime',
      replaceLast: true,
    })
  }

  function clearMatrixData() {
    lastSensorFrameRef.current = null
    lastSensorFrameSourceRef.current = 'realtime'
    activeFrameDirectionRef.current = {}
    sitDataRef.current = {}
    disPlayDataRef.current = {}
    renderedMetricDataRef.current = {
      [ADC_METRIC_MODE]: {},
      [PRESSURE_METRIC_MODE]: {},
      [FORCE_METRIC_MODE]: {},
    }
    chartRef.current = {}
    useEquipStore.getState().setStatus({})
    useEquipStore.getState().setDisplayStatus({})
    useEquipStore.getState().setMetricStatus({
      [ADC_METRIC_MODE]: {},
      [PRESSURE_METRIC_MODE]: {},
      [FORCE_METRIC_MODE]: {},
    })
    useEquipStore.getState().setEquipCop({})
  }

  return {
    sitDataRef,
    disPlayDataRef,
    renderedMetricDataRef,
    chartRef,
    dataDirection,
    setDataDirection,
    processSensorFrame,
    reprocessLastSensorFrame,
    clearMatrixData,
    changeDataDirection,
    changeWsLocalData,
    refreshDisplayWithCurrentSettings,
  }
}
