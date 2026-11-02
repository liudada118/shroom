import { getFullAlgorithmSummary } from '../../util/fullAlgorithmMetrics.js'

// A missing pre-zero acquisition matrix must remain missing. A calibrated or
// zeroed matrix cannot stand in for the raw ADC required by the display.
export function getRawAdcValues(item = {}) {
  const source = Array.isArray(item.rawAdcArr) ? item.rawAdcArr : Array.isArray(item.arr) ? item.arr : []
  if (item.rawDisplayAvailable === false) return source.map(() => null)
  return source.map((value) => value != null && Number.isFinite(Number(value)) ? Number(value) : null)
}

export function summarizeAdcValues(values = [], width = 1, height = 1) {
  const numeric = values.filter((value) => value != null && Number.isFinite(Number(value))).map(Number)
  const positive = numeric.filter((value) => value > 0)
  const available = numeric.length > 0
  const sum = numeric.reduce((total, value) => total + value, 0)
  let weight = 0
  let weightedX = 0
  let weightedY = 0
  values.forEach((value, index) => {
    if (value == null || !Number.isFinite(Number(value)) || Number(value) <= 0) return
    weight += Number(value)
    weightedX += (index % width) * Number(value)
    weightedY += Math.floor(index / width) * Number(value)
  })
  return {
    sum: available ? sum : null,
    max: available ? Math.max(...numeric) : null,
    average: available ? sum / numeric.length : null,
    points: available ? positive.length : null,
    center: weight > 0 ? {
      x: width > 1 ? weightedX / weight / (width - 1) : 0.5,
      y: height > 1 ? weightedY / weight / (height - 1) : 0.5,
    } : null,
  }
}

export function getPhysicalFrameSummary(item = {}, selection = null) {
  const full = selection ? null : getFullAlgorithmSummary(item.algorithmMetrics)
  return {
    forceN: full?.forceN ?? null,
    areaCm2: full?.areaCm2 ?? null,
    pressureKPa: full?.averagePressureKPa ?? null,
  }
}
