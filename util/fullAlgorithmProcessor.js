'use strict'

const { createSensorSession } = require('./seatBackrestSession')
const { getCalibrationRuntime } = require('./calibrationRuntime')

const FULL_PROCESSING_VERSION = 'backend-force-area-v20-external-calibration-raw-adc'
const FULL_ADC_PREPROCESSING = 'native-force-area-raw-adc-display'
const FULL_DISTRIBUTION = 'force-over-area'
const FULL_ALGORITHM_CONTRACT = 'seat-backrest-force-area-v1'
const LEGACY_FULL_PROCESSING_VERSION = 'backend-force-area-v19-v2110-raw-adc'
const PREVIOUS_FULL_PROCESSING_VERSION = 'backend-full-seat-backrest-v18-v2110'
const RAW_DISPLAY_PROCESSING_VERSIONS = [
  PREVIOUS_FULL_PROCESSING_VERSION, LEGACY_FULL_PROCESSING_VERSION, FULL_PROCESSING_VERSION,
]
const SENSOR_TYPES = Object.freeze({
  'endi-sit': 'endi-23x23',
  'endi-back': 'new-backrest-32x25',
})
const realtimeSessions = new Map()

function finiteOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function rotateMatrix(matrix, turns) {
  let result = matrix.map((row) => row.slice())
  for (let turn = 0; turn < turns; turn++) {
    result = result[0].map((_, column) => result.map((row) => row[column]).reverse())
  }
  return result
}

function forceOverAreaPressure(forceN, areaCm2) {
  return finiteOrNull(forceN) !== null && finiteOrNull(areaCm2) !== null && areaCm2 > 0
    ? 10 * forceN / areaCm2
    : null
}

function hasZeroBaseline(item) {
  return Boolean(item.algorithmZeroApplied || item.zeroState?.enabled || item.zeroState?.zero_enabled)
}

function nativeDimensions(key) {
  return key === 'endi-sit' ? { rows: 23, cols: 23 } : { rows: 32, cols: 25 }
}

function decodeNativeRaw(raw, key) {
  if (!Array.isArray(raw) || raw.length !== 1024
    || raw.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return null
  const { rows, cols } = nativeDimensions(key)
  const axis = key === 'endi-sit'
    ? [...Array.from({ length: 11 }, (_, index) => index), ...Array.from({ length: 12 }, (_, index) => 22 - index)]
    : [...Array.from({ length: 17 }, (_, index) => 15 + index), ...Array.from({ length: 15 }, (_, index) => 14 - index)]
  return Array.from({ length: rows }, (_, row) => Array.from({ length: cols }, (_, col) => (
    raw[axis[row] * 32 + cols - 1 - col]
  )))
}

function validPhysical(matrix, key) {
  const { rows, cols } = nativeDimensions(key)
  return Array.isArray(matrix) && matrix.length === rows && matrix.every((row) => (
    Array.isArray(row) && row.length === cols && row.every((value) => (
      Number.isFinite(value) && value >= 0 && value <= 255
    ))
  ))
}

// Display only: the attachment's unfiltered source-grid interpolation. No
// force/area kernel, ADC compensation, mask or threshold is evaluated here.
function interpolateRawPhysical(physical) {
  const rows = physical.length
  const cols = physical[0].length
  const big = Array.from({ length: rows * 2 }, () => Array(cols * 2).fill(0))
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const value = physical[row][col]
      const right = col + 1 < cols ? physical[row][col + 1] : 0
      big[row * 2][col * 2] = value
      big[row * 2][col * 2 + 1] = value + (right - value) / 2
    }
  }
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols * 2; col++) {
      const value = big[row * 2][col]
      const below = row + 1 < rows ? big[(row + 1) * 2][col] : 0
      big[row * 2 + 1][col] = value + (below - value) / 2
    }
  }
  return big.map((row) => row.map((value) => Math.max(0, Math.min(255, Math.trunc(value)))))
}

function buildRawDisplayAdc(key, item, rotation = getAlgorithmOptions(item).rotation) {
  let physical = decodeNativeRaw(item.algorithmRawSourceFrame, key)
  if (!physical && validPhysical(item.algorithmPhysicalSourceFrame, key)) physical = item.algorithmPhysicalSourceFrame
  if (!physical && !hasZeroBaseline(item)) {
    physical = decodeNativeRaw(item.algorithmRawFrame, key)
    if (!physical && validPhysical(item.algorithmPhysicalFrame, key)) physical = item.algorithmPhysicalFrame
  }
  if (physical) return rotateMatrix(interpolateRawPhysical(physical), rotation)
  // V18 stored rawAdcArr as unfiltered source ADC. With tare enabled that
  // source was already baseline-subtracted and cannot recover pre-tare ADC.
  const knownRawDisplay = RAW_DISPLAY_PROCESSING_VERSIONS.includes(item.processing?.version)
  const savedRotation = item.processing?.algorithmOptions?.rotation ?? item.algorithmMetrics?.displayRotation
  if (!hasZeroBaseline(item) && knownRawDisplay && savedRotation === rotation && Array.isArray(item.rawAdcArr)) {
    const native = nativeDimensions(key)
    const rows = rotation % 2 ? native.cols * 2 : native.rows * 2
    const cols = rotation % 2 ? native.rows * 2 : native.cols * 2
    if (item.matrixMeta?.height === rows && item.matrixMeta?.width === cols
      && item.rawAdcArr.length === rows * cols && item.rawAdcArr.every((value) => (
      Number.isFinite(value) && value >= 0 && value <= 255
    ))) {
      return Array.from({ length: rows }, (_, row) => item.rawAdcArr.slice(row * cols, (row + 1) * cols))
    }
  }
  return null
}

function isFullAlgorithmSensor(key) {
  return Object.hasOwn(SENSOR_TYPES, key)
}

function getAlgorithmOptions(item) {
  return {
    rotation: item.algorithmRotation ?? item.processing?.algorithmOptions?.rotation ?? item.algorithmMetrics?.displayRotation ?? 3,
  }
}

function isFullAlgorithmMetrics(metrics) {
  return Boolean(metrics && (
    metrics.contract === FULL_ALGORITHM_CONTRACT
    || metrics.pressureMethod === 'force-over-area'
    || metrics.version === '2.11.0'
  ))
}

// Historical force and area can include recognition history from before the
// recording began. Retain their actual provenance rather than relabeling them
// with whichever replacement module is currently installed.
function savedAlgorithmRuntime(item) {
  const metrics = item.algorithmMetrics || {}
  const processing = item.processing || {}
  const version = metrics.version || processing.algorithmVersion || 'unknown'
  return {
    version,
    identity: metrics.identity || processing.algorithmIdentity,
    checksum: metrics.checksum || processing.algorithmChecksum,
    formulaFile: processing.formulaFile || (version === '2.11.0' ? 'seatBackrestPressure_v2.11.0.js' : undefined),
    formulaProfile: processing.formulaProfile || `seatBackrestPressure_v${version}`,
  }
}

function buildSummary(output) {
  const force = output.forceMetrics
  const area = output.areaMetrics
  const forceN = finiteOrNull(force?.forceN)
  const areaCm2 = finiteOrNull(area?.areaCm2)
  return {
    forceN,
    areaCm2,
    pressureMethod: 'force-over-area',
    averagePressureKPa: forceOverAreaPressure(forceN, areaCm2),
    maxPressureKPa: null,
    maximumPressureDisplayKPa: null,
    activePointCount: null,
    forceMaxN: null,
    forceAverageN: null,
  }
}

function fullProcessingMetadata(item, options, runtime) {
  return {
    ...item.processing,
    version: FULL_PROCESSING_VERSION,
    adcPreprocessing: FULL_ADC_PREPROCESSING,
    pressureDistribution: FULL_DISTRIBUTION,
    formulaFile: runtime.formulaFile,
    formulaProfile: runtime.formulaProfile,
    algorithmVersion: runtime.version,
    algorithmIdentity: runtime.identity,
    algorithmChecksum: runtime.checksum,
    algorithmContract: FULL_ALGORITHM_CONTRACT,
    calibrationMethod: 'complete-force-area-global-pressure',
    pressureMethod: 'force-over-area',
    visualizationSource: 'raw-adc-before-zero-compensation-filter',
    calibrationInputGrid: 'native-physical-before-interpolation',
    statisticsSource: 'algorithmMetrics',
    algorithmOptions: options,
    temporal: true,
    areaUnit: 'cm2',
  }
}

function rawDisplayState(key, item, options) {
  const matrix = buildRawDisplayAdc(key, item, options.rotation)
  const native = nativeDimensions(key)
  const height = options.rotation % 2 ? native.cols * 2 : native.rows * 2
  const width = options.rotation % 2 ? native.rows * 2 : native.cols * 2
  const arr = matrix ? matrix.flat() : Array(height * width).fill(null)
  return {
    arr,
    rawAdcArr: arr.slice(),
    rawDisplayAvailable: Boolean(matrix),
    rawDisplayReason: matrix ? null : hasZeroBaseline(item)
      ? 'pre_zero_native_adc_missing'
      : 'raw_adc_source_missing',
    matrixMeta: { matrix_key: key, width, height, point_count: arr.length },
  }
}

function unavailableFullAlgorithmItem(key, item, reason, runtime = getCalibrationRuntime()) {
  const display = rawDisplayState(key, item, getAlgorithmOptions(item))
  const arr = display.arr
  const missing = arr.map(() => null)
  return {
    ...item,
    ...display,
    pressureArr: missing.slice(),
    forceArr: missing.slice(),
    pointAreaArr: missing.slice(),
    calibrationValidMask: arr.map(() => 0),
    forceDistributionAvailable: false,
    algorithmMetrics: {
      contract: FULL_ALGORITHM_CONTRACT,
      version: runtime.version,
      identity: runtime.identity,
      checksum: runtime.checksum,
      sensorType: SENSOR_TYPES[key],
      status: 'unavailable',
      pressureMethod: 'force-over-area',
      reason,
      forceMetrics: null,
      areaMetrics: null,
      pressureMetrics: null,
      summary: {
        forceN: null, areaCm2: null, averagePressureKPa: null, pressureMethod: 'force-over-area',
        maxPressureKPa: null, maximumPressureDisplayKPa: null,
        activePointCount: null, forceMaxN: null, forceAverageN: null,
      },
    },
    processing: fullProcessingMetadata(item, getAlgorithmOptions(item), runtime),
  }
}

function buildFullAlgorithmItem(key, item, output, options, runtime) {
  const display = rawDisplayState(key, item, options)
  const missing = display.arr.map(() => null)
  return {
    ...item,
    ...display,
    calibrationAdcArr: output.displayAdcMatrix?.flat() ?? item.calibrationAdcArr ?? [],
    pressureArr: missing.slice(),
    forceArr: missing.slice(),
    pointAreaArr: missing.slice(),
    calibrationValidMask: display.arr.map((value) => Number.isFinite(value) && value > 0 ? 1 : 0),
    forceDistributionAvailable: false,
    forceDistributionSource: 'summary-only-force-over-area',
    algorithmMetrics: {
      ...item.algorithmMetrics,
      contract: FULL_ALGORITHM_CONTRACT,
      version: runtime.version,
      identity: runtime.identity,
      checksum: runtime.checksum,
      sensorType: SENSOR_TYPES[key],
      status: 'complete',
      pressureMethod: 'force-over-area',
      timestampMs: output.timestampMs,
      displayRotation: options.rotation,
      forceMetrics: output.forceMetrics,
      areaMetrics: output.areaMetrics,
      pressureMetrics: output.pressureMetrics,
      summary: buildSummary(output),
    },
    processing: fullProcessingMetadata(item, options, runtime),
  }
}

function processFullAlgorithmItem(key, item, sessions = realtimeSessions) {
  const type = SENSOR_TYPES[key]
  if (!type) throw new RangeError(`No complete seat/backrest algorithm for ${key}`)
  const runtime = getCalibrationRuntime()
  if (item.algorithmInputError) return unavailableFullAlgorithmItem(key, item, item.algorithmInputError, runtime)
  const raw = item.algorithmRawFrame
  const physical = item.algorithmPhysicalFrame
  if (!Array.isArray(raw) && !Array.isArray(physical)) {
    return unavailableFullAlgorithmItem(key, item, 'native_adc_required_for_complete_algorithm', runtime)
  }
  const timestampMs = item.algorithmTimestampMs ?? item.stamp
  if (!Number.isFinite(timestampMs)) return unavailableFullAlgorithmItem(key, item, 'explicit_timestamp_required', runtime)
  const options = getAlgorithmOptions(item)
  const stream = item.algorithmStreamId || `${key}:explicit-native-input`
  const cacheKey = JSON.stringify([runtime.identity, stream, type, options])
  let entry = sessions.get(cacheKey)
  if (!entry) {
    entry = { session: createSensorSession(type, options, { runtime }), lastFrameToken: null, output: null }
    sessions.set(cacheKey, entry)
    if (sessions === realtimeSessions && sessions.size > 16) sessions.delete(sessions.keys().next().value)
  }
  // A UI broadcast may revisit the same acquired device frame. Do not insert
  // duplicates into the recognizer's history; distinct frame IDs always advance.
  const frameToken = item.algorithmFrameId == null ? null
    : JSON.stringify([item.algorithmFrameId, timestampMs, raw ?? physical, Boolean(item.algorithmReset)])
  let output
  try {
    output = frameToken !== null && frameToken === entry.lastFrameToken
      ? entry.output
      : entry.session.process({
          ...(Array.isArray(raw) ? { raw } : { physical }),
          timestampMs,
          reset: Boolean(item.algorithmReset),
        })
  } catch (error) {
    return unavailableFullAlgorithmItem(key, item, `complete_algorithm_input_error: ${error.message}`, runtime)
  }
  entry.lastFrameToken = frameToken
  entry.output = output
  return buildFullAlgorithmItem(key, item, output, options, runtime)
}

// Saved V18 force/area estimates may depend on recognition history from before
// recording began. Reuse those exact estimates and change only the pressure
// convention and raw display; rerunning an empty-history kernel would lose it.
function canUpgradeFullAlgorithmItem(key, item) {
  return isFullAlgorithmSensor(key)
    && RAW_DISPLAY_PROCESSING_VERSIONS.includes(item.processing?.version)
    && isFullAlgorithmMetrics(item.algorithmMetrics)
    && item.algorithmMetrics.status === 'complete'
    && Boolean(item.algorithmMetrics.areaMetrics)
    && !hasFullAlgorithmResult(item)
}

function upgradeFullAlgorithmItem(key, item) {
  if (!canUpgradeFullAlgorithmItem(key, item)) return null
  const previous = item.algorithmMetrics
  const upgraded = buildFullAlgorithmItem(key, item, {
    timestampMs: previous.timestampMs,
    forceMetrics: previous.forceMetrics,
    areaMetrics: previous.areaMetrics,
    pressureMetrics: previous.pressureMetrics,
  }, { ...item.processing.algorithmOptions, ...getAlgorithmOptions(item) }, savedAlgorithmRuntime(item))
  upgraded.processing.upgradedFrom = item.processing.version
  return upgraded
}

function hasFullAlgorithmResult(item) {
  const legacy = item.processing?.version === LEGACY_FULL_PROCESSING_VERSION
  return [FULL_PROCESSING_VERSION, LEGACY_FULL_PROCESSING_VERSION].includes(item.processing?.version)
    && item.processing?.adcPreprocessing === (legacy ? 'native-v2110-force-area-raw-adc-display' : FULL_ADC_PREPROCESSING)
    && item.processing?.pressureMethod === 'force-over-area'
    && item.processing?.algorithmOptions?.rotation === getAlgorithmOptions(item).rotation
    && isFullAlgorithmMetrics(item.algorithmMetrics)
    && item.algorithmMetrics?.summary?.pressureMethod === 'force-over-area'
    && ['complete', 'unavailable'].includes(item.algorithmMetrics.status)
    && Array.isArray(item.arr)
    && Array.isArray(item.rawAdcArr) && item.rawAdcArr.length === item.arr.length
    && typeof item.rawDisplayAvailable === 'boolean'
    && ['pressureArr', 'forceArr', 'pointAreaArr', 'calibrationValidMask'].every((field) => (
      Array.isArray(item[field]) && item[field].length === item.arr.length
    ))
    && ['pressureArr', 'forceArr', 'pointAreaArr'].every((field) => item[field].every((value) => value === null))
}

// Rebuild stale stored sequences in their original order, with independent
// local sessions. A seek/export never shares live acquisition recognizer state.
function prepareFullAlgorithmHistory(rows) {
  const needsRebuild = rows.some((row) => {
    let data
    try { data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data } catch { return false }
    return data && typeof data === 'object' && Object.entries(data).some(([key, item]) => (
      isFullAlgorithmSensor(key) && item && typeof item === 'object' && !hasFullAlgorithmResult(item)
    ))
  })
  if (!needsRebuild) return rows
  const replayStreams = new Set()
  const streamKey = (key, item) => JSON.stringify([
    item.algorithmStreamId || `${key}:explicit-native-input`, SENSOR_TYPES[key], getAlgorithmOptions(item),
  ])
  // Warm a saved native prefix only if this stream actually has a later frame
  // whose missing metrics need the kernel. Pure V18 summary migrations never
  // instantiate a session, while mixed recordings retain predecessor history.
  for (const row of rows) {
    let data
    try { data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data } catch { continue }
    if (!data || typeof data !== 'object') continue
    for (const [key, item] of Object.entries(data)) {
      if (!isFullAlgorithmSensor(key) || !item || typeof item !== 'object'
        || hasFullAlgorithmResult(item) || canUpgradeFullAlgorithmItem(key, item)
        || item.algorithmInputError) continue
      if ((Array.isArray(item.algorithmRawFrame) || Array.isArray(item.algorithmPhysicalFrame))
        && Number.isFinite(item.algorithmTimestampMs ?? item.stamp ?? Number(row.timestamp))) {
        replayStreams.add(streamKey(key, item))
      }
    }
  }
  const sessions = new Map()
  return rows.map((row) => {
    const wasString = typeof row.data === 'string'
    let data
    try { data = wasString ? JSON.parse(row.data) : row.data } catch { return row }
    if (!data || typeof data !== 'object') return row
    const frame = { ...data }
    let changed = false
    for (const [key, item] of Object.entries(frame)) {
      if (!isFullAlgorithmSensor(key) || !item || typeof item !== 'object') continue
      let calculated
      const hasNative = Array.isArray(item.algorithmRawFrame) || Array.isArray(item.algorithmPhysicalFrame)
      if (hasNative && replayStreams.has(streamKey(key, item))) {
        const replayItem = { ...item, algorithmTimestampMs: item.algorithmTimestampMs ?? item.stamp ?? Number(row.timestamp) }
        calculated = processFullAlgorithmItem(key, replayItem, sessions)
      }
      const upgraded = upgradeFullAlgorithmItem(key, item)
      if (upgraded) {
        frame[key] = upgraded
        changed = true
        continue
      }
      // Current saved metrics retain their acquired recognition history.
      if (hasFullAlgorithmResult(item)) continue
      if (hasNative) {
        const replayItem = { ...item, algorithmTimestampMs: item.algorithmTimestampMs ?? item.stamp ?? Number(row.timestamp) }
        frame[key] = calculated || processFullAlgorithmItem(key, replayItem, sessions)
        changed = true
      } else {
        frame[key] = unavailableFullAlgorithmItem(key, item, 'historical_native_adc_missing',
          isFullAlgorithmMetrics(item.algorithmMetrics) ? savedAlgorithmRuntime(item) : getCalibrationRuntime())
        changed = true
      }
    }
    return changed ? { ...row, data: wasString ? JSON.stringify(frame) : frame } : row
  })
}

function resetFullAlgorithmSessions() {
  realtimeSessions.clear()
}

function captureAlgorithmZeroBaselines(dataMap) {
  const baselines = {}
  for (const item of Object.values(dataMap || {})) {
    if (!isFullAlgorithmSensor(item?.type)) continue
    const raw = item.algorithmRawFrame
    if (!Array.isArray(raw) || raw.length !== 1024
      || raw.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) continue
    baselines[item.type] = raw.slice()
  }
  return baselines
}

module.exports = {
  FULL_PROCESSING_VERSION, FULL_ADC_PREPROCESSING, FULL_DISTRIBUTION, FULL_ALGORITHM_CONTRACT,
  isFullAlgorithmSensor, isFullAlgorithmMetrics, processFullAlgorithmItem, hasFullAlgorithmResult,
  forceOverAreaPressure, buildRawDisplayAdc, upgradeFullAlgorithmItem,
  prepareFullAlgorithmHistory, resetFullAlgorithmSessions,
  captureAlgorithmZeroBaselines,
}
