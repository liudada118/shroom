'use strict'

const fs = require('fs')
const path = require('path')
const { createHash } = require('crypto')

const DEFAULT_ALGORITHM_PATH = path.join(__dirname, 'seatBackrestPressure_v2.12.0.js')
const algorithmCache = new Map()
const resultVersions = new WeakMap()

// The public V2.12 session API is the upgrade contract. Versions and content
// hashes identify results; neither is a whitelist that blocks later formulas.
function loadSensorAlgorithm(sourcePath = DEFAULT_ALGORITHM_PATH) {
  const resolvedPath = path.resolve(sourcePath)
  const stat = fs.statSync(resolvedPath)
  const fileToken = `${stat.mtimeMs}:${stat.ctimeMs}:${stat.size}`
  const previous = algorithmCache.get(resolvedPath)
  if (previous?.fileToken === fileToken) return previous
  const checksum = createHash('sha256').update(fs.readFileSync(resolvedPath)).digest('hex')
  const modulePath = require.resolve(resolvedPath)
  delete require.cache[modulePath]
  const api = require(modulePath)
  if (typeof api.VERSION !== 'string' || !api.VERSION.trim()
    || typeof api.createSensorSession !== 'function'
    || !api.SENSOR_DEFINITIONS?.['endi-23x23']
    || !api.SENSOR_DEFINITIONS?.['new-backrest-32x25']) {
    throw new TypeError(`Calibration file must expose VERSION, SENSOR_DEFINITIONS and createSensorSession: ${resolvedPath}`)
  }
  const loaded = { api, version: api.VERSION, checksum, fileToken, sourcePath: resolvedPath }
  algorithmCache.set(resolvedPath, loaded)
  return loaded
}

function recordAlgorithmResult(result, version) {
  if (result && typeof result === 'object') resultVersions.set(result, version)
  return result
}

function getResultAlgorithmVersion(result) {
  return resultVersions.get(result) || result?.version || result?.algorithmVersion || null
}

/** One bounded native session per sensor/stream. New sessions use the current
 * sourcePath; existing sessions retain the implementation they started with. */
function createSensorSession(sensorType, options = {}, runtimeOptions = {}) {
  const loaded = loadSensorAlgorithm(runtimeOptions.sourcePath)
  if (!Object.hasOwn(loaded.api.SENSOR_DEFINITIONS, sensorType)) throw new RangeError('Unsupported sensorType')
  const session = loaded.api.createSensorSession(sensorType, structuredClone(options))
  if (!session || typeof session.update !== 'function' || typeof session.reset !== 'function') {
    throw new TypeError('Calibration createSensorSession must return update(frame) and reset()')
  }
  let lastTimestampMs = -Infinity
  const update = (frame) => {
    if (!frame || !Number.isFinite(frame.timestampMs)
      || (!frame.reset && frame.timestampMs < lastTimestampMs)) {
      throw new RangeError('Explicit nondecreasing timestampMs required')
    }
    const result = recordAlgorithmResult(session.update(frame), loaded.version)
    lastTimestampMs = frame.timestampMs
    return result
  }
  return {
    sensorType,
    algorithmVersion: loaded.version,
    calibrationIdentity: `${loaded.version}:${loaded.checksum}`,
    update,
    process: update,
    reset() {
      session.reset()
      lastTimestampMs = -Infinity
    },
    frameCount: () => typeof session.frameCount === 'function' ? session.frameCount() : null,
  }
}

module.exports = { DEFAULT_ALGORITHM_PATH, loadSensorAlgorithm, recordAlgorithmResult, getResultAlgorithmVersion, createSensorSession }
