import { useRef } from 'react'
import { getDisplayType, getSelectArr, getSysType, useEquipStore } from '../store/equipStore'
import { systemPointConfig } from '../util/constant'
import { calcCentroidRatio, colSelectMatrix } from '../util/util'
import { matrixGenBox, removeHistoryBox } from '../assets/util/selectMatrix'
import { isMoreMatrix } from '../assets/util/util'
import { message } from 'antd'
import { formatSelectionName, getDefaultSelectionName } from '../util/selectionName'
import {
  FORCE_METRIC_MODE,
  PRESSURE_METRIC_MODE,
  normalizePressureMetricMode,
} from '../util/pressureMetrics'
import {
  buildPressureDisplayNormalDistribution,
  summarizePressureDisplayMatrix,
} from '../util/pressureDisplayMatrix'

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
  },
}
const DATA_DIRECTION_STORAGE_KEY = 'matrixDataDirection'
const DATA_QUALITY_MESSAGE_INTERVAL = 3000

function roundMetricValue(value, digits = 1) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? Number(numeric.toFixed(digits)) : 0
}

function formatMetricValue(value, digits = 1) {
  return roundMetricValue(value, digits).toFixed(digits)
}

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
  const renderedMetricDataRef = useRef({
    [PRESSURE_METRIC_MODE]: {},
    [FORCE_METRIC_MODE]: {},
    validMask: {},
  })
  const chartRef = useRef({})
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

  function computeRenderedStats(pressureValues, forceValues, validMask, fullKey, activeMode) {
    const pressureSummary = summarizePressureDisplayMatrix(
      pressureValues,
      fullKey,
      PRESSURE_METRIC_MODE,
      validMask,
    )
    const forceSummary = summarizePressureDisplayMatrix(
      forceValues,
      fullKey,
      FORCE_METRIC_MODE,
      validMask,
    )
    const activeSummary = normalizePressureMetricMode(activeMode) === PRESSURE_METRIC_MODE
      ? pressureSummary
      : forceSummary
    const activeForceTotal = forceSummary.total

    return {
      pressureSummary,
      forceSummary,
      activeSummary,
      stats: {
        pressTotal: formatMetricValue(activeForceTotal),
        areaTotal: activeSummary.activeCount,
        pressurePointTotal: pressureSummary.activeCount,
        forcePointTotal: forceSummary.activeCount,
        pressMax: formatMetricValue(pressureSummary.max),
        total: roundMetricValue(activeForceTotal),
        pressMin: 0,
        pressAver: formatMetricValue(pressureSummary.average),
        pressureTotal: roundMetricValue(pressureSummary.total),
        forceMax: roundMetricValue(forceSummary.max),
        forceAver: roundMetricValue(forceSummary.average),
      },
    }
  }

  function mapSelectionToMatrix(values, selectResult, width) {
    const source = Array.isArray(values) ? values : []
    const boxes = (selectResult?.boxes || []).map((box) => ({
      ...box,
      data: extractSelectData(source, box.matrix, width) || [],
    }))
    return {
      default: boxes.length ? boxes[0].data : [...source],
      boxes,
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

  function computeStats(data, arr, selectResult, key, fullKey, options = {}, renderedMetrics = {}) {
    const { key: matrixKey, config } = getMatrixConfigEntry(fullKey, key)
    if (!config) return
    const { width, height } = config

    if (!data[key]) data[key] = {}
    if (!data[key].areaArr) data[key].areaArr = []
    if (!data[key].pressureAreaArr) data[key].pressureAreaArr = []
    if (!data[key].forceAreaArr) data[key].forceAreaArr = []
    if (!data[key].pressArr) data[key].pressArr = []
    if (!data[key].pressureArr) data[key].pressureArr = []
    if (!data[key].forceArr) data[key].forceArr = []
    if (!data[key].data) data[key].data = {}
    if (!data[key].boxStats) data[key].boxStats = []

    const pressureSelectResult = mapSelectionToMatrix(renderedMetrics[PRESSURE_METRIC_MODE], selectResult, width)
    const forceSelectResult = mapSelectionToMatrix(renderedMetrics[FORCE_METRIC_MODE], selectResult, width)
    const validMaskSelectResult = mapSelectionToMatrix(renderedMetrics.validMask, selectResult, width)
    const activeSelectResult = normalizePressureMetricMode(useEquipStore.getState().pressureMetricMode) === PRESSURE_METRIC_MODE
      ? pressureSelectResult
      : forceSelectResult
    const selectedArr = activeSelectResult.default
    const firstBox = selectResult.boxes?.[0]
    const firstBoxWidth = Math.max(1, Number(firstBox?.matrix?.xEnd) - Number(firstBox?.matrix?.xStart) || width)
    const firstBoxHeight = Math.max(1, Number(firstBox?.matrix?.yEnd) - Number(firstBox?.matrix?.yStart) || height)
    const selectedCenter = firstBox
      ? projectBoxCenterToMatrix(calcCentroidRatio([...selectedArr], firstBoxWidth, firstBoxHeight), firstBox.matrix, width, height)
      : calcCentroidRatio([...selectedArr], width, height)
    const metricMode = useEquipStore.getState().pressureMetricMode
    const renderedStats = computeRenderedStats(
      pressureSelectResult.default,
      forceSelectResult.default,
      validMaskSelectResult.default,
      matrixKey,
      metricMode,
    )
    const { pressureSummary, forceSummary, activeSummary } = renderedStats
    const pressureNormalDis = buildPressureDisplayNormalDistribution(pressureSummary.metricValues, PRESSURE_METRIC_MODE)
    const forceNormalDis = buildPressureDisplayNormalDistribution(forceSummary.metricValues, FORCE_METRIC_MODE)
    const activeNormalDis = normalizePressureMetricMode(metricMode) === PRESSURE_METRIC_MODE
      ? pressureNormalDis
      : forceNormalDis

    data[key].center = selectedCenter
    data[key].normalDis = {
      ...activeNormalDis,
      byMode: {
        [PRESSURE_METRIC_MODE]: pressureNormalDis,
        [FORCE_METRIC_MODE]: forceNormalDis,
      },
    }

    // 默认统计（全部数据或第一个框）
    setTrendValue(data[key].areaArr, activeSummary.activeCount, options)
    setTrendValue(data[key].pressureAreaArr, pressureSummary.activeCount, options)
    setTrendValue(data[key].forceAreaArr, forceSummary.activeCount, options)
    const pressForChart = roundMetricValue(activeSummary.forceTotal)
    setTrendValue(data[key].pressArr, pressForChart, options)
    setTrendValue(data[key].pressureArr, roundMetricValue(pressureSummary.total), options)
    setTrendValue(data[key].forceArr, roundMetricValue(forceSummary.total), options)

    Object.assign(data[key].data, renderedStats.stats)

    // carY 类型压力转换
    if (matrixKey === 'carY-back' || matrixKey === 'carY-sit') {
      data[key].data.pressTotal = formatMetricValue(forceSummary.total)
    }

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
          pressureArr: [],
          forceArr: [],
          areaArr: [],
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
        if (!boxStat.pressureAreaArr) boxStat.pressureAreaArr = []
        if (!boxStat.forceAreaArr) boxStat.forceAreaArr = []
        boxStat.colorIndex = box.colorIndex
        boxStat.bgc = box.bgc
        boxStat.name = formatSelectionName(box.name, i + 1)

        const boxRenderedStats = computeRenderedStats(
          pressureSelectResult.boxes[i]?.data,
          forceSelectResult.boxes[i]?.data,
          validMaskSelectResult.boxes[i]?.data,
          matrixKey,
          metricMode,
        )
        const {
          pressureSummary: boxPressureSummary,
          forceSummary: boxForceSummary,
          activeSummary: boxActiveSummary,
          stats,
        } = boxRenderedStats
        boxStat.data = stats
        const boxWidth = Math.max(1, Number(box.matrix?.xEnd) - Number(box.matrix?.xStart) || width)
        const boxHeight = Math.max(1, Number(box.matrix?.yEnd) - Number(box.matrix?.yStart) || height)
        const activeBoxValues = normalizePressureMetricMode(metricMode) === PRESSURE_METRIC_MODE
          ? pressureSelectResult.boxes[i]?.data
          : forceSelectResult.boxes[i]?.data
        const localCenter = calcCentroidRatio([...(activeBoxValues || [])], boxWidth, boxHeight)
        boxStat.center = projectBoxCenterToMatrix(localCenter, box.matrix, width, height)
        boxStat.localCenter = localCenter
        const boxPressureNormalDis = buildPressureDisplayNormalDistribution(boxPressureSummary.metricValues, PRESSURE_METRIC_MODE)
        const boxForceNormalDis = buildPressureDisplayNormalDistribution(boxForceSummary.metricValues, FORCE_METRIC_MODE)
        const boxActiveNormalDis = normalizePressureMetricMode(metricMode) === PRESSURE_METRIC_MODE
          ? boxPressureNormalDis
          : boxForceNormalDis
        boxStat.normalDis = {
          ...boxActiveNormalDis,
          byMode: {
            [PRESSURE_METRIC_MODE]: boxPressureNormalDis,
            [FORCE_METRIC_MODE]: boxForceNormalDis,
          },
        }

        const bPressForChart = roundMetricValue(boxForceSummary.total)
        setTrendValue(boxStat.pressArr, bPressForChart, options)
        setTrendValue(boxStat.pressureArr, roundMetricValue(boxPressureSummary.total), options)
        setTrendValue(boxStat.forceArr, roundMetricValue(boxForceSummary.total), options)
        setTrendValue(boxStat.areaArr, boxActiveSummary.activeCount, options)
        setTrendValue(boxStat.pressureAreaArr, boxPressureSummary.activeCount, options)
        setTrendValue(boxStat.forceAreaArr, boxForceSummary.activeCount, options)
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
    return isDefaultDataDirection(frameDirection) ? currentDirection : frameDirection
  }

  function applyDisplayDirection(resArr, keyArr, sitData) {
    const res = { ...resArr }

    for (const fullKey of keyArr) {
      const key = fullKey.includes('-') ? fullKey.split('-')[1] : fullKey
      if (!res[key] || !systemPointConfig[fullKey]) continue

      const frameDirection = normalizeDataDirection(sitData[fullKey]?.dataDirection || DEFAULT_DATA_DIRECTION)
      const executedDirection = getExecutedDirectionForFrame(fullKey, sitData[fullKey])
      activeFrameDirectionRef.current[fullKey] = executedDirection
      const { width, height } = systemPointConfig[fullKey]
      let nextArr = res[key]

      if (isDefaultDataDirection(frameDirection)) {
        nextArr = applyDirectionToArray(nextArr, width, height, executedDirection)
      }
      res[key] = nextArr
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

  function buildRenderedMetricData(displayArr, keyArr, sitData) {
    const next = {
      [PRESSURE_METRIC_MODE]: {},
      [FORCE_METRIC_MODE]: {},
      validMask: {},
    }

    for (const fullKey of keyArr) {
      const shortKey = fullKey.includes('-') ? fullKey.split('-')[1] : fullKey
      const { config } = getMatrixConfigEntry(fullKey, shortKey)
      if (!config || !Array.isArray(displayArr[shortKey])) continue

      const { width, height } = config
      const count = width * height
      const item = sitData[fullKey] || {}
      const readMetric = (field) => {
        let values = Array.from({ length: count }, (_, index) => {
          const value = Number(item[field]?.[index])
          return Number.isFinite(value) && value > 0 ? value : 0
        })
        const frameDirection = normalizeDataDirection(item.dataDirection || DEFAULT_DATA_DIRECTION)
        if (isDefaultDataDirection(frameDirection)) {
          values = applyDirectionToArray(values, width, height, getExecutedDirectionForFrame(fullKey, item))
        }
        return values
      }
      next[PRESSURE_METRIC_MODE][shortKey] = readMetric('pressureArr')
      next[FORCE_METRIC_MODE][shortKey] = readMetric('forceArr')
      const validMaskField = Array.isArray(item.calibrationValidMask)
        ? 'calibrationValidMask'
        : Array.isArray(item.calibrationAdcArr)
          ? 'calibrationAdcArr'
          : 'arr'
      next.validMask[shortKey] = readMetric(validMaskField).map((value) => (value > 0 ? 1 : 0))
    }

    renderedMetricDataRef.current = next
    useEquipStore.getState().setMetricStatus({
      [PRESSURE_METRIC_MODE]: next[PRESSURE_METRIC_MODE],
      [FORCE_METRIC_MODE]: next[FORCE_METRIC_MODE],
    })
    return next
  }

  /**
   * 处理传感器数据帧（实时或回放）
   */
  function processSensorFrame(sitData, data, options = {}) {
    const isRealtimeFrame = options.source !== 'playback'
    if (!Object.keys(sitData).length) {
      useEquipStore.getState().setStatus(new Array(4096).fill(0))
      useEquipStore.getState().setDisplayStatus(new Array(4096).fill(0))
      useEquipStore.getState().setMetricStatus({ [PRESSURE_METRIC_MODE]: {}, [FORCE_METRIC_MODE]: {} })
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

    const statsArr = buildFilteredMatrixFromRaw(arr, keyArr)
    const resArr = applyDisplayDirection(statsArr, keyArr, sitData)
    const renderedMetricData = buildRenderedMetricData(resArr, keyArr, sitData)

    // 2. Compute selections, trends, and distribution from the zeroed/filtered matrix.
    for (let i = 0; i < keyArr.length; i++) {
      const fullKey = keyArr[i]
      const key = fullKey.includes('-') ? fullKey.split('-')[1] : fullKey
      if (!resArr[key]) continue

      const selectResult = computeSelectArr(resArr[key], key, fullKey, select, displayType, sitData[fullKey])
      computeStats(data, resArr[key], selectResult, key, fullKey, {}, {
        [PRESSURE_METRIC_MODE]: renderedMetricData[PRESSURE_METRIC_MODE][key],
        [FORCE_METRIC_MODE]: renderedMetricData[FORCE_METRIC_MODE][key],
        validMask: renderedMetricData.validMask[key],
      })
    }

    chartRef.current = data
    sitDataRef.current = sourceAdcArr
    disPlayDataRef.current = arr

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
      newObj[fullKey] = sitData[fullKey]?.status
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

    disPlayDataRef.current = resArr

    useEquipStore.getState().setDisplayStatus(resArr)
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
    if (targetPart === 'back' || targetPart === 'sit') {
      const key = `${system}-${targetPart}`
      return systemPointConfig[key] ? [key] : []
    }
    return [`${system}-back`, `${system}-sit`].filter((key) => systemPointConfig[key])
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
    })
    return true
  }

  function refreshDisplayWithCurrentSettings(data = chartRef.current) {
    const sitData = lastSensorFrameRef.current
    const currentDisplayArr = disPlayDataRef.current
    if (!sitData || !Object.keys(sitData).length || !currentDisplayArr || !Object.keys(currentDisplayArr).length) return false
    const keyArr = Object.keys(sitData)
    const sysType = getSysType()
    if (!keyArr.some(a => a.includes(sysType))) return false
    const statsArr = buildFilteredMatrixFromRaw(currentDisplayArr, keyArr)
    const resArr = applyDisplayDirection(statsArr, keyArr, sitData)
    const renderedMetricData = buildRenderedMetricData(resArr, keyArr, sitData)
    if (data && typeof data === 'object') {
      const select = getSelectArr()
      const displayType = getDisplayType()
      for (let i = 0; i < keyArr.length; i++) {
        const fullKey = keyArr[i]
        const key = fullKey.includes('-') ? fullKey.split('-')[1] : fullKey
        if (!resArr[key]) continue

        const selectResult = computeSelectArr(resArr[key], key, fullKey, select, displayType, sitData[fullKey])
        computeStats(data, resArr[key], selectResult, key, fullKey, { replaceLast: true }, {
          [PRESSURE_METRIC_MODE]: renderedMetricData[PRESSURE_METRIC_MODE][key],
          [FORCE_METRIC_MODE]: renderedMetricData[FORCE_METRIC_MODE][key],
          validMask: renderedMetricData.validMask[key],
        })
      }
      chartRef.current = data
    }
    disPlayDataRef.current = resArr
    useEquipStore.getState().setDisplayStatus(resArr)
    return true
  }

  function clearMatrixData() {
    lastSensorFrameRef.current = null
    lastSensorFrameSourceRef.current = 'realtime'
    activeFrameDirectionRef.current = {}
    sitDataRef.current = {}
    disPlayDataRef.current = {}
    renderedMetricDataRef.current = {
      [PRESSURE_METRIC_MODE]: {},
      [FORCE_METRIC_MODE]: {},
      validMask: {},
    }
    chartRef.current = {}
    useEquipStore.getState().setStatus({})
    useEquipStore.getState().setDisplayStatus({})
    useEquipStore.getState().setMetricStatus({ [PRESSURE_METRIC_MODE]: {}, [FORCE_METRIC_MODE]: {} })
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
