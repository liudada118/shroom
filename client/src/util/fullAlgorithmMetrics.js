// Force and area come from the complete delivered algorithm. The application
// exposes their global pressure ratio independently of any calibration map.
function finiteOrNull(value) {
  return value == null || !Number.isFinite(Number(value)) ? null : Number(value)
}

export function getFullAlgorithmSummary(algorithmMetrics) {
  if (!algorithmMetrics || !['complete', 'unavailable'].includes(algorithmMetrics.status)) return null
  const hasRatioContract = algorithmMetrics.pressureMethod === 'force-over-area'
    || algorithmMetrics.summary?.pressureMethod === 'force-over-area'
  // V2.11 saved summaries predate the explicit pressure-method contract.
  const legacySummary = algorithmMetrics.version === '2.11.0' && algorithmMetrics.summary
    && !algorithmMetrics.pressureMethod && !algorithmMetrics.summary.pressureMethod
  if (!hasRatioContract && !legacySummary) return null
  const source = algorithmMetrics.summary || {}
  const unavailable = algorithmMetrics.status === 'unavailable'
  const metric = (key) => unavailable ? null : finiteOrNull(source[key])
  const forceN = metric('forceN')
  const areaCm2 = metric('areaCm2')
  return {
    source: 'seat-backrest-force-area',
    algorithmVersion: algorithmMetrics.version || null,
    available: !unavailable,
    forceN,
    areaCm2,
    averagePressureKPa: forceN == null || areaCm2 == null || areaCm2 <= 0 ? null : 10 * forceN / areaCm2,
    maxPressureKPa: null,
    maximumPressureDisplayKPa: null,
    forceMaxN: null,
    forceAverageN: null,
    activePointCount: null,
  }
}

export function applyFullAlgorithmSummary(spatialSummary, algorithmMetrics, mode) {
  const full = getFullAlgorithmSummary(algorithmMetrics)
  if (!full) return spatialSummary
  const pressure = mode === 'pressure'
  return {
    ...spatialSummary,
    spatialTotal: spatialSummary.total,
    spatialMaximum: spatialSummary.max,
    spatialAverage: spatialSummary.average,
    activeCount: full.activePointCount,
    effectiveArea: full.areaCm2,
    max: pressure ? full.maximumPressureDisplayKPa : full.forceMaxN,
    average: pressure ? full.averagePressureKPa : full.forceAverageN,
    total: pressure ? full.averagePressureKPa : full.forceN,
    forceTotal: full.forceN,
    pressureTotal: full.averagePressureKPa,
    algorithmMetricsSource: full.source,
    areaUnit: 'cm2',
    fullAlgorithmSummary: full,
  }
}
