import { useRef } from 'react'
import { getDisplayType, getSelectArr, getSettingValue, getSysType, useEquipStore } from '../store/equipStore'
import { systemPointConfig } from '../util/constant'
import { calcCentroidRatio, colSelectMatrix, kurtosis, mean, normalPDF, skewness, variance } from '../util/util'
import { matrixGenBox, removeHistoryBox } from '../assets/util/selectMatrix'
import { isMoreMatrix } from '../assets/util/util'
import { message } from 'antd'
import { formatSelectionName, getDefaultSelectionName } from '../util/selectionName'
import { computePressureMetrics } from '../util/pressureMetrics'

/**
 * 矩阵数据处理 Hook
 * 
 * 封装传感器数据的预处理、框选、翻转、统计计算逻辑
 * 支持多框选（最多4个），每个框独立计算统计数据
 */

const DEFAULT_SIT_ROTATE_DEGREE = 90
const DEFAULT_DATA_DIRECTION = {
  left: true,
  up: true,
  rotateDegree: 0,
  byKey: {
    'endi-sit': { left: true, up: false, rotateDegree: DEFAULT_SIT_ROTATE_DEGREE },
    'carY-sit': { left: true, up: false, rotateDegree: DEFAULT_SIT_ROTATE_DEGREE },
    'car-sit': { left: true, up: false, rotateDegree: DEFAULT_SIT_ROTATE_DEGREE },
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

function shouldMigrateLegacySeatDirection(key, direction) {
  const normalized = normalizeDataDirection(direction)
  return isSeatDirectionKey(key)
    && normalized.left === true
    && normalized.up === true
    && (normalized.rotateDegree === 90 || normalized.rotateDegree === 270)
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
          storedDirection.byKey[key] = { left: true, up: false, rotateDegree: DEFAULT_SIT_ROTATE_DEGREE }
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
    if (select.length && displayType.includes(key)) {
      const boxes = []
      for (let i = 0; i < select.length; i++) {
        const sel = select[i]
        if (sel.matrixKey && !matrixKeysMatch(sel.matrixKey, fullKey)) continue
        const matrix = colSelectMatrix('canvasThree', sel, systemPointConfig[fullKey])
        if (matrix) {
          const data = extractSelectData(arr, matrix, width)
          if (data) {
            boxes.push({
              data,
              colorIndex: sel.colorIndex != null ? sel.colorIndex : i,
              bgc: sel.bgc || '#FF6B6B',
              name: formatSelectionName(sel.name, i + 1),
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
  function computeSingleStats(arr, selectedArr, fullKey) {
    const stats = {}
    if (!Array.isArray(selectedArr) || !selectedArr.length) {
      stats.pressTotal = '0.0'
      stats.areaTotal = 0
      stats.pressMax = 0
      stats.total = 0
      stats.pressMin = 0
      stats.pressAver = '0.00'
      return { area: 0, press: 0, stats }
    }
    const area = selectedArr.filter(a => a > 0).length
    const press = selectedArr.reduce((a, b) => a + b, 0)
    const pressureMetrics = computePressureMetrics(selectedArr, fullKey)

    stats.pressTotal = pressureMetrics.total.toFixed(2)
    stats.areaTotal = area
    const positiveSelected = selectedArr.filter(a => a > 0)
    const min = positiveSelected.length ? Math.min(...positiveSelected).toFixed(1) : 0
    stats.pressMax = pressureMetrics.pressMax.toFixed(2)
    stats.total = pressureMetrics.total
    stats.pressMin = min || 0
    stats.pressAver = pressureMetrics.pressAver.toFixed(2)

    // carY 类型压力转换
    if (fullKey === 'carY-back' || fullKey === 'carY-sit') {
      stats.pressTotal = pressureMetrics.total.toFixed(2)
    }

    return { area, press, stats }
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
  function computeStats(data, arr, selectResult, key, fullKey) {
    const { key: matrixKey, config } = getMatrixConfigEntry(fullKey, key)
    if (!config) return
    const { width, height } = config

    if (!data[key]) data[key] = {}
    if (!data[key].areaArr) data[key].areaArr = []
    if (!data[key].pressArr) data[key].pressArr = []
    if (!data[key].data) data[key].data = {}
    if (!data[key].boxStats) data[key].boxStats = []

    const selectedArr = selectResult.default
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
    const xData = Array.from({ length: 256 }, (_, i) => i)
    const yData = xData.map(x => normalPDF(x, mu, sigma))

    const area = selectedArr.filter(a => a > 0).length
    const press = selectedArr.reduce((a, b) => a + b, 0)
    const pressureMetrics = computePressureMetrics(selectedArr, matrixKey)

    data[key].center = selectedCenter
    data[key].normalDis = {
      μ: mu.toFixed(3),
      Var: v.toFixed(3),
      Skew: sk.toFixed(3),
      Kurt: ku.toFixed(3),
      yData
    }

    // 默认统计（全部数据或第一个框）
    if (data[key].areaArr.length < 20) {
      data[key].areaArr.push(area)
    } else {
      data[key].areaArr.shift()
      data[key].areaArr.push(area)
    }
    const pressForChart = pressureMetrics.total
    if (data[key].pressArr.length < 20) {
      data[key].pressArr.push(pressForChart)
    } else {
      data[key].pressArr.shift()
      data[key].pressArr.push(pressForChart)
    }

    data[key].data.pressTotal = pressureMetrics.total.toFixed(2)
    data[key].data.areaTotal = area
    const positiveSelected = selectedArr.filter(a => a > 0)
    const min = positiveSelected.length ? Math.min(...positiveSelected).toFixed(1) : 0
    data[key].data.pressMax = pressureMetrics.pressMax.toFixed(2)
    data[key].data.total = pressureMetrics.total
    data[key].data.pressMin = min || 0
    data[key].data.pressAver = pressureMetrics.pressAver.toFixed(2)

    // carY 类型压力转换
    if (matrixKey === 'carY-back' || matrixKey === 'carY-sit') {
      data[key].data.pressTotal = pressureMetrics.total.toFixed(2)
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
          areaArr: [],
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

        const { area: bArea, press: bPress, stats } = computeSingleStats(arr, box.data, matrixKey)
        boxStat.data = stats
        const boxWidth = Math.max(1, Number(box.matrix?.xEnd) - Number(box.matrix?.xStart) || width)
        const boxHeight = Math.max(1, Number(box.matrix?.yEnd) - Number(box.matrix?.yStart) || height)
        const boxMu = mean(box.data)
        const boxVariance = variance(box.data, boxMu)
        const boxSigma = Math.sqrt(boxVariance)
        const localCenter = calcCentroidRatio([...box.data], boxWidth, boxHeight)
        boxStat.center = projectBoxCenterToMatrix(localCenter, box.matrix, width, height)
        boxStat.localCenter = localCenter
        boxStat.normalDis = {
          ['\u03bc']: boxMu.toFixed(3),
          Var: boxVariance.toFixed(3),
          Skew: skewness(box.data, boxMu, boxSigma).toFixed(3),
          Kurt: kurtosis(box.data, boxMu, boxSigma).toFixed(3),
          yData: xData.map(x => normalPDF(x, boxMu, boxSigma)),
        }

        const bPressForChart = Number(stats.pressTotal) || bPress
        if (boxStat.pressArr.length < 20) {
          boxStat.pressArr.push(bPressForChart)
        } else {
          boxStat.pressArr.shift()
          boxStat.pressArr.push(bPressForChart)
        }
        if (boxStat.areaArr.length < 20) {
          boxStat.areaArr.push(bArea)
        } else {
          boxStat.areaArr.shift()
          boxStat.areaArr.push(bArea)
        }
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

  /**
   * 处理传感器数据帧（实时或回放）
   */
  function processSensorFrame(sitData, data, options = {}) {
    const isRealtimeFrame = options.source !== 'playback'
    if (!Object.keys(sitData).length) {
      useEquipStore.getState().setStatus(new Array(4096).fill(0))
      useEquipStore.getState().setDisplayStatus(new Array(4096).fill(0))
      return
    }
    lastSensorFrameRef.current = sitData
    lastSensorFrameSourceRef.current = options.source || 'realtime'

    const select = getSelectArr()
    const displayType = getDisplayType()
    const keyArr = Object.keys(sitData)
    const arr = {}

    // 1. 解析矩阵数据 + 框选计算
    for (let i = 0; i < keyArr.length; i++) {
      const fullKey = keyArr[i]
      const key = fullKey.includes('-') ? fullKey.split('-')[1] : fullKey
      if (!sitData[fullKey]?.arr) continue

      arr[key] = clampEndi([...sitData[fullKey].arr], fullKey, key)
      const selectResult = computeSelectArr(arr[key], key, fullKey, select, displayType, sitData[fullKey])
      computeStats(data, arr[key], selectResult, key, fullKey)
    }

    chartRef.current = data
    sitDataRef.current = arr
    disPlayDataRef.current = arr

    // 2. 设备状态更新
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

    // 3. 预压力置零
    let resArr = {}
    for (let i = 0; i < keyArr.length; i++) {
      const key = keyArr[i].includes('-') ? keyArr[i].split('-')[1] : keyArr[i]
      if (!arr[key]) continue
      const wsLocalData = wsLocalDataRef.current.data
      const flag = wsLocalDataRef.current.flag
      resArr[key] = arr[key].map((a, index) => {
        if (!flag || !wsLocalData[key]) return a
        return Math.max(0, a - wsLocalData[key][index])
      })
      disPlayDataRef.current = resArr
    }

    // 4. 噪点过滤
    const settingValue = getSettingValue()
    const { filter } = settingValue
    if (filter) {
      for (const fullKey of keyArr) {
        const key = fullKey.includes('-') ? fullKey.split('-')[1] : fullKey
        if (!resArr[key]) continue
        resArr[key] = resArr[key].map(a => a < filter ? 0 : a)
        disPlayDataRef.current = resArr
      }
    }

    // 5. 翻转处理：实时帧按当前方向翻转；历史帧按保存方向和当前方向的差异修正，避免重复翻转
    resArr = applyDisplayDirection(resArr, keyArr, sitData)
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
        next.rotateDegree = normalizeRotateDegree(next.rotateDegree + 90)
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

  function clearMatrixData() {
    lastSensorFrameRef.current = null
    lastSensorFrameSourceRef.current = 'realtime'
    activeFrameDirectionRef.current = {}
    sitDataRef.current = {}
    disPlayDataRef.current = {}
    chartRef.current = {}
    useEquipStore.getState().setStatus({})
    useEquipStore.getState().setDisplayStatus({})
    useEquipStore.getState().setEquipCop({})
  }

  return {
    sitDataRef,
    disPlayDataRef,
    chartRef,
    dataDirection,
    setDataDirection,
    processSensorFrame,
    reprocessLastSensorFrame,
    clearMatrixData,
    changeDataDirection,
    changeWsLocalData,
  }
}
