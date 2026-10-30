// Shared, dependency-free adapter for the reference algorithm. Pass its API (or
// the server's formula loader) so the browser and server use the same source.
const DUMMY_GRIDS = Object.freeze({
  'endi-jacket': { width: 24, height: 54, sensorType: 'dummy-body-27x12' },
  'endi-leftHand': { width: 36, height: 4, sensorType: 'dummy-sleeve-2x18' },
  'endi-rightHand': { width: 36, height: 4, sensorType: 'dummy-sleeve-2x18' },
  'endi-leftFoot': { width: 12, height: 64, sensorType: 'dummy-left-leg-32x6' },
  'endi-rightFoot': { width: 12, height: 64, sensorType: 'dummy-right-leg-32x6' },
  'endi-foot': { width: 24, height: 64 },
})

function getPressureValues(item = {}) {
  item = item || {}
  if (!item.processing?.importedMetric
    && Array.isArray(item.pressureValuesKpa)
    && item.pressureValuesKpa.length === item.arr?.length) return item.pressureValuesKpa
  return Array.isArray(item.pressureArr) ? item.pressureArr : []
}

function normalizeDummyKey(key) {
  return DUMMY_GRIDS[key] ? key : `endi-${key}`
}

function cropValues(values, width, region) {
  const result = []
  for (let row = region.yStart; row < region.yEnd; row++) {
    result.push(values.slice(row * width + region.xStart, row * width + region.xEnd))
  }
  return result
}

function attachValues(result, values) {
  return { ...result, pressureValuesKpa: values }
}

// Head centering is a display translation. Restore the sensor coordinates before
// splitting a selection, otherwise a box crossing the neck changes adjacency.
function calculateJacketSelection(api, raw, grid, region, options) {
  const cells = []
  for (let row = region.yStart; row < region.yEnd; row++) {
    for (let col = region.xStart; col < region.xEnd; col++) {
      if (row < 10 && (col < 3 || col > 20)) continue
      cells.push({ row, col, sourceCol: row < 10 ? col + 3 : col })
    }
  }
  const left = cells.length ? Math.min(...cells.map(cell => cell.sourceCol)) : 0
  const right = cells.length ? Math.max(...cells.map(cell => cell.sourceCol)) + 1 : 1
  const height = region.yEnd - region.yStart
  const adc = Array.from({ length: height }, () => new Array(right - left).fill(0))
  const mask = adc.map(row => row.map(() => false))
  for (const cell of cells) {
    adc[cell.row - region.yStart][cell.sourceCol - left] = raw[cell.row * grid.width + cell.col]
    mask[cell.row - region.yStart][cell.sourceCol - left] = true
  }
  const result = api.calculateDummyPreparedPressureFrame(adc, grid.sensorType, mask, options)
  const pressureMatrixKpa = Array.from({ length: height }, () => new Array(region.xEnd - region.xStart).fill(0))
  for (const cell of cells) {
    pressureMatrixKpa[cell.row - region.yStart][cell.col - region.xStart]
      = result.pressureMatrixKpa[cell.row - region.yStart][cell.sourceCol - left]
  }
  return { ...result, rows: height, cols: region.xEnd - region.xStart,
    pressureMatrixKpa, pressureValuesKpa: pressureMatrixKpa.flat() }
}

function combineResults(results) {
  results = results.filter(Boolean)
  const nonZeroCount = results.reduce((sum, result) => sum + result.nonZeroCount, 0)
  const pressureSumKpa = results.reduce((sum, result) => sum + result.pressureSumKpa, 0)
  const targetAvgKpaRaw = nonZeroCount ? pressureSumKpa / nonZeroCount : null
  const round = value => Math.round((value + Number.EPSILON) * 100) / 100
  return {
    avgKpa: targetAvgKpaRaw === null ? null : round(targetAvgKpaRaw),
    maxKpa: nonZeroCount ? Math.max(...results.map(result => result.maxKpa || 0)) : null,
    nonZeroCount,
    pressureSumKpa,
    targetAvgKpaRaw,
    mode: nonZeroCount ? 'region_top50' : 'none',
    pressureValuesKpa: results.flatMap(result => result.pressureValuesKpa || []),
  }
}

function createDummyPressureStatistics(loadApiOrApi) {
  const getApi = () => typeof loadApiOrApi === 'function' ? loadApiOrApi() : loadApiOrApi

  function getDummyPressureResult(key, item = {}, selection = null) {
    key = normalizeDummyKey(key)
    const grid = DUMMY_GRIDS[key]
    // Never treat imported kPa or an old/manual metric-only item as raw ADC.
    if (!grid || !item || item.processing?.importedMetric || !item.pressureSummary
      || !Array.isArray(item.pressureValuesKpa)) return null
    if (!selection) return attachValues(item.pressureSummary, getPressureValues(item))

    const region = {
      xStart: Number(selection.xStart), xEnd: Number(selection.xEnd),
      yStart: Number(selection.yStart), yEnd: Number(selection.yEnd),
    }
    if (!Object.values(region).every(Number.isInteger)
      || region.xStart < 0 || region.yStart < 0
      || region.xEnd > grid.width || region.yEnd > grid.height
      || region.xEnd <= region.xStart || region.yEnd <= region.yStart) return null
    if (region.xStart === 0 && region.yStart === 0
      && region.xEnd === grid.width && region.yEnd === grid.height) {
      return attachValues(item.pressureSummary, getPressureValues(item))
    }
    const raw = Array.isArray(item.rawAdcArr) ? item.rawAdcArr : item.arr
    if (!Array.isArray(raw) || raw.length !== grid.width * grid.height) return null
    const options = {
      threshold: Number(item.processing?.dummyAdcThreshold) || 0,
      resultScale: Number.isFinite(Number(item.processing?.dummyResultScale))
        ? Number(item.processing.dummyResultScale) : 1,
    }
    const api = getApi()
    if (key === 'endi-jacket' && region.yStart < 10) {
      return calculateJacketSelection(api, raw, grid, region, options)
    }
    if (key !== 'endi-foot') {
      const result = api.calculateDummyPreparedPressureFrame(cropValues(raw, grid.width, region), grid.sensorType, null, options)
      return attachValues(result, result.pressureMatrixKpa.flat())
    }

    // The two leg devices remain separate contacts even where their display
    // columns touch. Crop each device before the reference regional calculation.
    const results = []
    const pressureMatrixKpa = Array.from({ length: region.yEnd - region.yStart },
      () => new Array(region.xEnd - region.xStart).fill(0))
    for (const [offset, type] of [[0, 'dummy-left-leg-32x6'], [12, 'dummy-right-leg-32x6']]) {
      const xStart = Math.max(region.xStart, offset)
      const xEnd = Math.min(region.xEnd, offset + 12)
      if (xStart >= xEnd) continue
      const result = api.calculateDummyPreparedPressureFrame(cropValues(raw, grid.width, { ...region, xStart, xEnd }), type, null, options)
      results.push(attachValues(result, result.pressureMatrixKpa.flat()))
      result.pressureMatrixKpa.forEach((row, rowIndex) => row.forEach((value, column) => {
        pressureMatrixKpa[rowIndex][xStart - region.xStart + column] = value
      }))
    }
    return { ...combineResults(results), pressureMatrixKpa, pressureValuesKpa: pressureMatrixKpa.flat() }
  }

  return { getDummyPressureResult, getPressureValues }
}

module.exports = { createDummyPressureStatistics, getPressureValues, combinePressureSummaries: combineResults }
