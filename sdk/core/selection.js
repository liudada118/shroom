'use strict'

const { getMatrixDimensions } = require('./matrix')

function getMatrixKeyCandidates(key, systemType = '') {
  const value = String(key || '')
  const candidates = [value]
  if (value.includes('-')) candidates.push(value.split('-').pop())
  if (value && !value.includes('-') && systemType) candidates.push(`${systemType}-${value}`)
  return [...new Set(candidates.filter(Boolean))]
}

function getSelectionForMatrixKey(selectJson = {}, key, options = {}) {
  for (const candidate of getMatrixKeyCandidates(key, options.systemType || '')) {
    if (selectJson[candidate]) return selectJson[candidate]
  }
  if (typeof key === 'string' && !key.includes('-')) {
    const matchedKey = Object.keys(selectJson || {}).find((selectKey) => (
      typeof selectKey === 'string' && selectKey.endsWith(`-${key}`)
    ))
    if (matchedKey) return selectJson[matchedKey]
  }
  return null
}

function getSelectionRegions(selection) {
  if (!selection) return []
  if (Array.isArray(selection)) return selection
  for (const key of ['regions', 'selections', 'boxes', 'areas', 'rangeArr', 'selectArr']) {
    if (Array.isArray(selection[key])) return selection[key]
  }
  return [selection]
}

function normalizeRegion(region, matrixWidth) {
  if (!region || typeof region !== 'object') return null
  const width = Number(region.width) || Number(region.matrixWidth) || Number(matrixWidth)
  const xStart = Number(region.xStart ?? region.left ?? region.x)
  const yStart = Number(region.yStart ?? region.top ?? region.y)
  const xEnd = Number(region.xEnd ?? (Number.isFinite(xStart) ? xStart + Number(region.w ?? region.widthCells) : NaN))
  const yEnd = Number(region.yEnd ?? (Number.isFinite(yStart) ? yStart + Number(region.h ?? region.heightCells) : NaN))
  if (![width, xStart, yStart, xEnd, yEnd].every(Number.isFinite)) return null
  return {
    width,
    xStart: Math.trunc(Math.min(xStart, xEnd)),
    xEnd: Math.trunc(Math.max(xStart, xEnd)),
    yStart: Math.trunc(Math.min(yStart, yEnd)),
    yEnd: Math.trunc(Math.max(yStart, yEnd)),
  }
}

function computeRegionStats(arr, region, options = {}) {
  const values = Array.isArray(arr) ? arr : []
  const normalized = normalizeRegion(region, options.width)
  if (!normalized) return { press: 0, area: 0, values: [] }

  const width = normalized.width
  const height = options.height || Math.ceil(values.length / width)
  let press = 0
  let area = 0
  const selectedValues = []

  const xStart = Math.max(0, normalized.xStart)
  const xEnd = Math.min(width, normalized.xEnd)
  const yStart = Math.max(0, normalized.yStart)
  const yEnd = Math.min(height, normalized.yEnd)

  for (let y = yStart; y < yEnd; y += 1) {
    for (let x = xStart; x < xEnd; x += 1) {
      const value = Number(values[y * width + x]) || 0
      selectedValues.push(value)
      press += value
      if (value > 0) area += 1
    }
  }

  return { press, area, values: selectedValues }
}

function computeSelectionStats(frame = {}, selectJson = {}, options = {}) {
  const result = {}
  Object.keys(frame || {}).forEach((key) => {
    const item = frame[key]
    const arr = Array.isArray(item?.arr) ? item.arr : []
    const dimensions = getMatrixDimensions(key, arr) || {
      width: Number(item?.width) || Number(item?.matrixMeta?.width) || arr.length,
      height: Number(item?.height) || Number(item?.matrixMeta?.height) || 1,
    }
    const selection = getSelectionForMatrixKey(selectJson, key, options)
    const regions = getSelectionRegions(selection)
    const stats = regions.map((region) => computeRegionStats(arr, region, dimensions))
    result[key] = {
      press: stats.reduce((sum, item) => sum + item.press, 0),
      area: stats.reduce((sum, item) => sum + item.area, 0),
      regions: stats,
    }
  })
  return result
}

module.exports = {
  getMatrixKeyCandidates,
  getSelectionForMatrixKey,
  getSelectionRegions,
  normalizeRegion,
  computeRegionStats,
  computeSelectionStats,
}
