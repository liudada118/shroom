'use strict'

const fs = require('fs')
const path = require('path')
const vm = require('vm')
const { createHash } = require('crypto')
const { getCalibrationRuntime } = require('./calibrationRuntime')

const SNAPSHOT_PATH = path.join(__dirname, '..', 'server', 'kpa', 'seatBackrestPressure_v2.11.0.js')
const SNAPSHOT_SHA256 = '221d9113e8fd777aec1bef6cbb5c43181cb44ad19fa1445e12ffba0cac9f8e4f'
const SNAPSHOT_LF_SHA256 = '9642c7ff0e9f5fa279b9069240250c0942227b43f5ecaec3c912b67768e06520'
const streamingApis = new Map()

function replaceOnce(source, anchor, replacement) {
  const index = source.indexOf(anchor)
  if (index < 0 || source.indexOf(anchor, index + anchor.length) >= 0) {
    throw new Error('V2.11.0 streaming lifecycle anchor changed; review the snapshot adapter')
  }
  return source.slice(0, index) + replacement + source.slice(index + anchor.length)
}

/**
 * The delivered module deliberately creates an empty-history kernel on every
 * calculateSensorSequence call. Compile its exact local source once, adjusting
 * only those sequence-lifecycle lines so one kernel can process an endless
 * acquisition stream. No curves, masks, filtering, force or area formulas are
 * copied or changed. A checksum and unique anchors make snapshot upgrades fail
 * explicitly instead of silently changing these lifecycle edits.
 */
function loadStreamingApi(snapshotPath = SNAPSHOT_PATH) {
  const resolvedPath = path.resolve(snapshotPath)
  if (streamingApis.has(resolvedPath)) return streamingApis.get(resolvedPath)
  const bytes = fs.readFileSync(resolvedPath)
  const checksum = createHash('sha256').update(bytes).digest('hex')
  let source = bytes.toString('utf8').replace(/\r\n/g, '\n')
  const normalizedChecksum = createHash('sha256').update(source).digest('hex')
  if (checksum !== SNAPSHOT_SHA256 && normalizedChecksum !== SNAPSHOT_LF_SHA256) {
    throw new Error('V2.11.0 calibration snapshot checksum changed; review the streaming adapter')
  }
  source = replaceOnce(source,
    'function runSequence(frames, sensorType, options = {}) {',
    'let sessionPriorTime = -Infinity;\nlet sessionInitialized = false;\nfunction runSequence(frames, sensorType, options = {}) {')
  source = replaceOnce(source,
    '  const outputs = [];\n  resetLiveSeatForce();\n  resetLiveBackrestForce2();\n  let priorTime = -Infinity;',
    '  const outputs = [];\n  if (!sessionInitialized) {\n    resetLiveSeatForce();\n    resetLiveBackrestForce2();\n    sessionInitialized = true;\n  }\n  let priorTime = sessionPriorTime;')
  source = replaceOnce(source,
    '  return outputs;\n}\n\n    return module.exports;',
    '  sessionPriorTime = priorTime;\n  return outputs;\n}\n\n    return module.exports;')
  source = replaceOnce(source,
    '    calculateMatrixPressureMap,calculateSensorSequence,calculateSensorFrame,getMaximumPressureDisplay,runSelfCheck,',
    '    _createLocalKernel:createLocalKernel,\n    calculateMatrixPressureMap,calculateSensorSequence,calculateSensorFrame,getMaximumPressureDisplay,runSelfCheck,')

  // runInThisContext keeps ordinary Node arrays/objects in the caller's realm.
  // Only the local checksum-verified attachment is evaluated; no external code.
  const factory = new vm.Script(`(function(module) {\n${source}\nreturn module.exports;\n})`, {
    filename: `${resolvedPath}:streaming-lifecycle`,
  }).runInThisContext()
  const api = factory({ exports: {} })
  streamingApis.set(resolvedPath, api)
  return api
}

/**
 * One independent sensor/stream, with explicit nondecreasing timestamps.
 * frame has the original { raw | physical, timestampMs, reset? } contract.
 * process() retains only the original kernel's bounded recognition/filter state;
 * it never stores or replays an ever-growing frame list. reset() begins a new
 * acquisition history and permits a new timestamp origin.
 */
function createLegacySensorSession(sensorType, options = {}, runtimeOptions = {}) {
  const api = loadStreamingApi(runtimeOptions.sourcePath || SNAPSHOT_PATH)
  if (!Object.hasOwn(api.SENSOR_DEFINITIONS, sensorType)) throw new RangeError('Unsupported sensorType')
  const sessionOptions = structuredClone(options)
  let kernel = api._createLocalKernel()
  let lastTimestampMs = -Infinity
  return {
    sensorType,
    process(frame) {
      if (!frame || !Number.isFinite(frame.timestampMs) || frame.timestampMs < lastTimestampMs) {
        throw new RangeError('Explicit nondecreasing timestampMs required')
      }
      const output = kernel.runSequence([frame], sensorType, sessionOptions)[0]
      lastTimestampMs = frame.timestampMs
      return output
    },
    reset() {
      kernel = api._createLocalKernel()
      lastTimestampMs = -Infinity
    },
  }
}

// V2.12+ supplies the public stateful API. The old checksum/VM adapter above is
// retained only for explicit historical v2.11 diagnostic calls, never runtime.
function createSensorSession(sensorType, options = {}, runtimeOptions = {}) {
  if (runtimeOptions.sourcePath && path.basename(runtimeOptions.sourcePath) === 'seatBackrestPressure_v2.11.0.js') {
    return createLegacySensorSession(sensorType, options, runtimeOptions)
  }
  const runtime = runtimeOptions.runtime || getCalibrationRuntime(runtimeOptions)
  if (!Object.hasOwn(runtime.api.SENSOR_DEFINITIONS, sensorType)) throw new RangeError('Unsupported sensorType')
  const session = runtime.api.createSensorSession(sensorType, structuredClone(options))
  if (!session || typeof session.update !== 'function' || typeof session.reset !== 'function') {
    throw new TypeError(`Calibration session interface requires update/reset: ${runtime.filePath}`)
  }
  let lastTimestampMs = -Infinity
  return {
    sensorType,
    process(frame) {
      if (!frame || !Number.isFinite(frame.timestampMs) || frame.timestampMs < lastTimestampMs) {
        throw new RangeError('Explicit nondecreasing timestampMs required')
      }
      const output = session.update(frame)
      lastTimestampMs = frame.timestampMs
      return output
    },
    reset() {
      session.reset()
      lastTimestampMs = -Infinity
    },
  }
}

module.exports = { SNAPSHOT_SHA256, createSensorSession }
