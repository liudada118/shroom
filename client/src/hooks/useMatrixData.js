import { useRef } from 'react'
import { getDisplayType, getSelectArr, getSettingValue, getSysType, useEquipStore } from '../store/equipStore'
import { systemPointConfig } from '../util/constant'
import { backYToX, calcCentroidRatio, colSelectMatrix, kurtosis, mean, normalPDF, sitYToX, skewness, variance } from '../util/util'
import { matrixGenBox, removeHistoryBox } from '../assets/util/selectMatrix'
import { isMoreMatrix } from '../assets/util/util'

/**
 * 矩阵数据处理 Hook
 * 
 * 封装传感器数据的预处理、框选、翻转、统计计算逻辑
 * 从 Test.js 中抽取，消除 sitData / sitDataPlay 之间的重复代码
 */
export function useMatrixData() {
  const sitDataRef = useRef({})
  const disPlayDataRef = useRef({})
  const chartRef = useRef({})
  const wsLocalDataRef = useRef({ data: {}, flag: false })
  const dataDirection = useRef({ left: true, up: true })

  /**
   * 限制 endi 类型数据值上限为 255
   */
  function clampEndi(arr, fullKey, shortKey) {
    if (!fullKey.includes('endi')) return arr
    return arr.map(a => a > 255 ? 255 : a)
  }

  /**
   * 计算框选区域数据
   */
  function computeSelectArr(arr, key, fullKey, select, displayType, sitDataItem) {
    const config = systemPointConfig[fullKey]
    if (!config) return arr  // 未知设备类型，跳过框选计算
    const { width, height } = config

    // 实时框选
    if (select.length && displayType.includes(key)) {
      const matrix = colSelectMatrix('canvasThree', select[0], systemPointConfig[fullKey])
      if (matrix) {
        const { xStart, xEnd, yStart, yEnd } = matrix
        const newArr = []
        for (let y = yStart; y < yEnd; y++) {
          for (let x = xStart; x < xEnd; x++) {
            newArr.push(arr[y * width + x])
          }
        }
        return [...newArr]
      }
    }

    // 回放框选
    if (sitDataItem?.select) {
      const matrixObj = sitDataItem.select
      const { xStart, xEnd, yStart, yEnd } = matrixObj

      if (displayType.includes(key) && displayType.includes('2D')) {
        const canvas = document.querySelector('.canvasThree')
        if (canvas) {
          const canvasInfo = canvas.getBoundingClientRect()
          const canvasObj = {
            canvasX1: canvasInfo.left, canvasX2: canvasInfo.right,
            canvasY1: canvasInfo.top, canvasY2: canvasInfo.bottom
          }
          const max = Math.max(width, height)
          matrixGenBox(matrixObj, canvasObj, max)
        }
      } else {
        removeHistoryBox()
      }

      const newArr = []
      for (let y = yStart; y < yEnd; y++) {
        for (let x = xStart; x < xEnd; x++) {
          newArr.push(arr[y * width + x])
        }
      }
      return [...newArr]
    }

    // 无框选，使用全部数据
    return [...arr]
  }

  /**
   * 计算统计指标（压力、面积、重心、正态分布等）
   */
  function computeStats(data, arr, selectedArr, key, fullKey) {
    if (!systemPointConfig[fullKey]) return  // 未知设备类型，跳过统计计算
    const { width, height } = systemPointConfig[fullKey]

    if (!data[key]) data[key] = {}
    if (!data[key].areaArr) data[key].areaArr = []
    if (!data[key].pressArr) data[key].pressArr = []
    if (!data[key].data) data[key].data = {}

    const arrSmooth = calcCentroidRatio([...arr], width, height)
    const mu = mean(arr)
    const v = variance(arr, mu)
    const sigma = Math.sqrt(v)
    const sk = skewness(arr, mu, sigma)
    const ku = kurtosis(arr, mu, sigma)
    const xData = Array.from({ length: 256 }, (_, i) => i)
    const yData = xData.map(x => normalPDF(x, mu, sigma))

    const area = selectedArr.filter(a => a > 0).length
    const press = selectedArr.reduce((a, b) => a + b, 0)

    data[key].center = arrSmooth
    data[key].normalDis = {
      μ: mu.toFixed(3),
      Var: v.toFixed(3),
      Skew: sk.toFixed(3),
      Kurt: ku.toFixed(3),
      yData
    }

    // 滑动窗口（保留最近 20 帧）
    if (data[key].areaArr.length < 20) {
      data[key].areaArr.push(area)
    } else {
      data[key].areaArr.shift()
      data[key].areaArr.push(area)
    }
    if (data[key].pressArr.length < 20) {
      data[key].pressArr.push(press)
    } else {
      data[key].pressArr.shift()
      data[key].pressArr.push(press)
    }

    data[key].data.pressTotal = press.toFixed(1)
    data[key].data.areaTotal = area
    const positiveSelected = selectedArr.filter(a => a > 0)
    const min = positiveSelected.length ? Math.min(...positiveSelected).toFixed(1) : 0
    data[key].data.pressMax = Math.max(...selectedArr)
    data[key].data.total = press
    data[key].data.pressMin = min || 0
    data[key].data.pressAver = (press / (area || 1)).toFixed(2)

    // endi 类型单位转换
    if (fullKey === 'endi-back') {
      data[key].data.pressMax = backYToX(Math.max(...selectedArr)).toFixed(2)
      data[key].data.pressMin = backYToX(min || 0).toFixed(2)
      data[key].data.pressAver = backYToX(press / (area || 1)).toFixed(2)
    } else if (fullKey === 'endi-sit') {
      data[key].data.pressMax = sitYToX(Math.max(...selectedArr)).toFixed(2)
      data[key].data.pressMin = sitYToX(min || 0).toFixed(2)
      data[key].data.pressAver = sitYToX(press / (area || 1)).toFixed(2)
    }
  }

  /**
   * 水平翻转矩阵数据
   */
  function flipHorizontal(resArr, keyArr) {
    const res = {}
    for (const fullKey of keyArr) {
      const key = fullKey.includes('-') ? fullKey.split('-')[1] : fullKey
      if (!resArr[key]) continue
      res[key] = []
      if (!systemPointConfig[fullKey]) continue
      const { width, height } = systemPointConfig[fullKey]
      for (let y = 0; y < height; y++) {
        for (let x = width - 1; x >= 0; x--) {
          res[key].push(resArr[key][y * width + x])
        }
      }
    }
    return res
  }

  /**
   * 垂直翻转矩阵数据
   */
  function flipVertical(resArr, keyArr) {
    const res = {}
    for (const fullKey of keyArr) {
      const key = fullKey.includes('-') ? fullKey.split('-')[1] : fullKey
      if (!resArr[key]) continue
      res[key] = []
      if (!systemPointConfig[fullKey]) continue
      const { width, height } = systemPointConfig[fullKey]
      for (let y = height - 1; y >= 0; y--) {
        for (let x = 0; x < width; x++) {
          res[key].push(resArr[key][y * width + x])
        }
      }
    }
    return res
  }

  /**
   * 处理传感器数据帧（实时或回放）
   * 统一处理 sitData 和 sitDataPlay，消除重复代码
   */
  function processSensorFrame(sitData, data) {
    if (!Object.keys(sitData).length) {
      useEquipStore.getState().setStatus(new Array(4096).fill(0))
      useEquipStore.getState().setDisplayStatus(new Array(4096).fill(0))
      return
    }

    const select = getSelectArr()
    const displayType = getDisplayType()
    const keyArr = Object.keys(sitData)
    const arr = {}
    const selectedArr = {}

    // 1. 解析矩阵数据 + 框选计算
    for (let i = 0; i < keyArr.length; i++) {
      const fullKey = keyArr[i]
      const key = fullKey.includes('-') ? fullKey.split('-')[1] : fullKey
      if (!sitData[fullKey]?.arr) continue

      arr[key] = clampEndi([...sitData[fullKey].arr], fullKey, key)
      selectedArr[key] = computeSelectArr(arr[key], key, fullKey, select, displayType, sitData[fullKey])
      computeStats(data, arr[key], selectedArr[key], key, fullKey)
    }

    chartRef.current = data
    sitDataRef.current = arr
    disPlayDataRef.current = arr

    // 2. 设备状态更新
    const stamp = sitData[keyArr[0]]?.stamp
    const cop = sitData[keyArr[0]]?.cop
    const newObj = {}
    for (const fullKey of keyArr) {
      newObj[fullKey] = sitData[fullKey]?.status
    }
    useEquipStore.getState().setEquipStatus(newObj)

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

    // 5. 翻转处理
    if (!dataDirection.current.left) {
      resArr = flipHorizontal(resArr, keyArr)
    }
    if (!dataDirection.current.up) {
      resArr = flipVertical(resArr, keyArr)
    }
    disPlayDataRef.current = resArr

    useEquipStore.getState().setDisplayStatus(resArr)
  }

  /**
   * 切换翻转方向
   */
  function changeDataDirection(dir) {
    if (dir === 'left') {
      dataDirection.current.left = !dataDirection.current.left
    } else {
      dataDirection.current.up = !dataDirection.current.up
    }
  }

  /**
   * 预压力置零：记录当前帧作为基准
   */
  function changeWsLocalData() {
    wsLocalDataRef.current.data = { ...sitDataRef.current }
    wsLocalDataRef.current.flag = !wsLocalDataRef.current.flag
  }

  return {
    sitDataRef,
    disPlayDataRef,
    chartRef,
    dataDirection,
    processSensorFrame,
    changeDataDirection,
    changeWsLocalData,
  }
}
