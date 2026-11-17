'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { getCalibrationRuntime } = require('../util/calibrationRuntime')
const original = getCalibrationRuntime().api
const { processMatrixItem, ensureProcessedMatrixItem } = require('../util/pressureFrameProcessor')
const {
  FULL_ALGORITHM_CONTRACT, hasFullAlgorithmResult, processFullAlgorithmItem,
  prepareFullAlgorithmHistory, upgradeFullAlgorithmItem,
} = require('../util/fullAlgorithmProcessor')

const SENSORS = [
  { key: 'endi-sit', type: 'endi-23x23', rows: 23, cols: 23 },
  { key: 'endi-back', type: 'new-backrest-32x25', rows: 32, cols: 25 },
]
let streamCounter = 0

function uniqueStream() {
  streamCounter += 1
  return `full-algorithm-regression-${streamCounter}`
}

function physical(sensor, step) {
  const levels = [0, 50, 80, 120, 170, 130, 65, 0]
  const amplitude = levels[step % levels.length]
  return Array.from({ length: sensor.rows }, (_, row) => Array.from({ length: sensor.cols }, (_, col) => {
    const peakRow = sensor.key === 'endi-sit' ? 9 : 18
    const first = Math.exp(-(((row - peakRow) / 3) ** 2 + ((col - 7) / 3) ** 2) / 2)
    const second = Math.exp(-(((row - peakRow - 5) / 4) ** 2 + ((col - 17) / 3) ** 2) / 2)
    return Math.min(255, Math.round(amplitude * (first + second * 0.6)))
  }))
}

function frames(sensor) {
  return Array.from({ length: 8 }, (_, i) => ({ physical: physical(sensor, i), timestampMs: i * 100 }))
}

function itemFor(frame, streamId) {
  return {
    // Legacy/display data must never override the complete algorithm source.
    arr: [999],
    algorithmPhysicalFrame: frame.physical,
    algorithmTimestampMs: frame.timestampMs,
    algorithmStreamId: streamId,
    ...(frame.reset ? { algorithmReset: true } : {}),
  }
}

function rotate(matrix, count = 3) {
  let out = matrix.map((row) => [...row])
  for (let turn = 0; turn < count; turn++) {
    out = out[0].map((_, col) => out.map((row) => row[col]).reverse())
  }
  return out
}

function assertOriginalMetrics(actual, expected, sensor, rotation = 3) {
  assert.equal(actual.algorithmMetrics.version, original.VERSION)
  assert.equal(actual.algorithmMetrics.status, 'complete')
  assert.deepEqual(actual.algorithmMetrics.forceMetrics, expected.forceMetrics)
  assert.deepEqual(actual.algorithmMetrics.areaMetrics, expected.areaMetrics)
  assert.deepEqual(actual.algorithmMetrics.pressureMetrics, expected.pressureMetrics)
  const rawDisplay = rotate(expected.sourceMatrix, rotation + (sensor.key === 'endi-sit' ? 2 : 0)).flat()
  assert.deepEqual(actual.arr, rawDisplay)
  assert.deepEqual(actual.rawAdcArr, rawDisplay)
  assert.deepEqual(actual.calibrationAdcArr, expected.displayAdcMatrix.flat())
  assert.equal(actual.rawDisplayAvailable, true)
  for (const field of ['pressureArr', 'forceArr', 'pointAreaArr']) {
    assert.equal(actual[field].length, rawDisplay.length)
    assert.ok(actual[field].every(value => value === null), `${field} must not drive raw ADC visualization`)
  }
  const summary = actual.algorithmMetrics.summary
  assert.equal(summary.forceN, expected.forceMetrics?.forceN ?? null)
  assert.equal(summary.areaCm2, expected.areaMetrics.areaCm2)
  assert.equal(summary.averagePressureKPa, expected.areaMetrics.areaCm2 > 0
    ? 10 * expected.forceMetrics.forceN / expected.areaMetrics.areaCm2 : null)
  assert.equal(summary.pressureMethod, 'force-over-area')
  assert.equal(summary.activePointCount, expected.pressureMetrics.pointPressureCount)
  assert.equal(summary.maxPressureKPa, expected.pressureMetrics.pointPressureCount === 0 ? 0 : expected.pressureMetrics.maxPressureKPa)
  assert.equal(summary.maximumPressureDisplayKPa, summary.maxPressureKPa)
  for (const field of ['forceMaxN', 'forceAverageN']) {
    assert.equal(summary[field], null)
  }
}

for (const sensor of SENSORS) {
  test(`${sensor.key}: original force/area and diagnostics persist while visualization contains only raw ADC`, () => {
    const source = frames(sensor)
    const expected = original.calculateSensorSequence(source, sensor.type)
    const streamId = uniqueStream()
    source.forEach((frame, i) => {
      const actual = processMatrixItem(sensor.key, itemFor(frame, streamId))
      assertOriginalMetrics(actual, expected[i], sensor)
      assert.deepEqual(ensureProcessedMatrixItem(sensor.key, actual), actual)
    })
  })
}

test('complete large-contact seat force and area cannot be replaced by point-curve integration or positive cell count', () => {
  const sensor = SENSORS[0]
  const frame = { physical: Array.from({ length: 23 }, () => new Array(23).fill(90)), timestampMs: 0 }
  const expected = original.calculateSensorFrame(frame, sensor.type)
  const actual = processMatrixItem(sensor.key, itemFor(frame, uniqueStream()))
  assertOriginalMetrics(actual, expected, sensor)
  const pointCurve = original.calculateMatrixPressureMap(frame.physical, sensor.type).kpa.flat()
  const oldIntegratedForce = pointCurve.reduce((sum, value) => sum + value * 0.1, 0)
  const oldCountArea = pointCurve.filter((value) => value > 0).length
  assert.notEqual(actual.algorithmMetrics.summary.forceN, oldIntegratedForce)
  assert.notEqual(actual.algorithmMetrics.summary.areaCm2, oldCountArea)
  assert.ok(actual.forceArr.every((value) => value === null))
  assert.ok(actual.algorithmMetrics.summary.forceN > 0)
  assert.notEqual(actual.algorithmMetrics.summary.averagePressureKPa, expected.forceMetrics.averagePressureKPa)
})

test('missing native acquisition input keeps complete total force and area unavailable', () => {
  for (const sensor of SENSORS) {
    const actual = processMatrixItem(sensor.key, {
      arr: new Array(sensor.rows * sensor.cols * 4).fill(90),
      algorithmTimestampMs: 0,
      algorithmStreamId: uniqueStream(),
    })
    assert.equal(actual.algorithmMetrics.version, original.VERSION)
    assert.equal(actual.algorithmMetrics.status, 'unavailable')
    assert.equal(actual.algorithmMetrics.summary.forceN, null)
    assert.equal(actual.algorithmMetrics.summary.areaCm2, null)
    assert.equal(actual.algorithmMetrics.summary.averagePressureKPa, null)
    assert.ok(actual.forceArr.every((value) => value === null))
  }
})

test('history uses independent complete sequences, preserves row data types, and remains repeatable after seeking or live input', () => {
  const sources = SENSORS.map((sensor) => frames(sensor))
  const expected = SENSORS.map((sensor, i) => original.calculateSensorSequence(sources[i], sensor.type))
  const sharedStreamId = uniqueStream()
  const rows = Array.from({ length: 8 }, (_, index) => {
    const data = Object.fromEntries(SENSORS.map((sensor, i) => [sensor.key, itemFor(sources[i][index], sharedStreamId)]))
    return { timestamp: index * 100, data: index % 2 ? data : JSON.stringify(data) }
  })
  const prepared = prepareFullAlgorithmHistory(rows)
  assert.equal(prepared.length, rows.length)
  prepared.forEach((row, index) => {
    assert.equal(typeof row.data, typeof rows[index].data)
    const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data
    SENSORS.forEach((sensor, i) => assertOriginalMetrics(data[sensor.key], expected[i][index], sensor))
  })
  const sought = prepared[5]
  const soughtData = typeof sought.data === 'string' ? JSON.parse(sought.data) : sought.data
  assertOriginalMetrics(soughtData['endi-sit'], expected[0][5], SENSORS[0])
  // A live stream sharing persisted IDs must not advance the replay kernel.
  processMatrixItem('endi-sit', itemFor({ ...sources[0][3], timestampMs: 5000 }, sharedStreamId))
  assert.deepEqual(prepareFullAlgorithmHistory(rows), prepared)
})

test('complete raw wire input takes precedence over mismatching display/native fields', () => {
  const raw = Array.from({ length: 1024 }, (_, index) => {
    const row = Math.floor(index / 32)
    const col = index % 32
    return row >= 12 && row <= 23 && col >= 6 && col <= 19 ? 70 + index % 29 : 0
  })
  for (const sensor of SENSORS) {
    const expected = original.calculateSensorFrame({ raw, timestampMs: 0 }, sensor.type)
    const actual = processMatrixItem(sensor.key, {
      ...itemFor({ physical: physical(sensor, 0), timestampMs: 0 }, uniqueStream()),
      algorithmRawFrame: raw,
    })
    assertOriginalMetrics(actual, expected, sensor)
  }
})

test('a changed algorithm rotation invalidates canonical maps and retains complete scalar metrics', () => {
  for (const sensor of SENSORS) {
    const frame = frames(sensor)[3]
    const first = processMatrixItem(sensor.key, itemFor(frame, uniqueStream()))
    const rotated = ensureProcessedMatrixItem(sensor.key, { ...first, algorithmRotation: 0 })
    const expected = original.calculateSensorFrame(frame, sensor.type, { rotation: 0 })
    assertOriginalMetrics(rotated, expected, sensor, 0)
    assert.equal(rotated.processing.algorithmOptions.rotation, 0)
    assert.equal(rotated.matrixMeta.height, expected.displayAdcMatrix.length)
    assert.equal(rotated.matrixMeta.width, expected.displayAdcMatrix[0].length)
  }
})

test('V18 upgrades preserve acquired history-dependent force/area without rerunning recognition and keep missing pre-zero ADC blank', () => {
  const sensor = SENSORS[0]
  const physical = Array.from({ length: 23 }, () => new Array(23).fill(90))
  const expected = original.calculateSensorFrame({ physical, timestampMs: 500 }, sensor.type)
  const force = { ...expected.forceMetrics, forceN: 321.123, averagePressureKPa: 999 }
  const area = { ...expected.areaMetrics, areaCm2: 70 }
  const old = {
    arr: Array(2116).fill(90),
    rawAdcArr: Array(2116).fill(90),
    algorithmPhysicalFrame: physical,
    algorithmTimestampMs: 500,
    zeroState: { enabled: true },
    processing: { version: 'backend-full-seat-backrest-v18-v2110' },
    algorithmMetrics: {
      version: '2.11.0', status: 'complete', timestampMs: 500,
      forceMetrics: force, areaMetrics: area, pressureMetrics: expected.pressureMetrics,
      summary: { forceN: 321.123, areaCm2: 70, averagePressureKPa: 999 },
    },
  }
  const upgraded = upgradeFullAlgorithmItem(sensor.key, old)
  assert.equal(upgraded.algorithmMetrics.status, 'complete')
  assert.equal(upgraded.algorithmMetrics.version, '2.11.0')
  assert.equal(upgraded.processing.formulaFile, 'seatBackrestPressure_v2.11.0.js')
  assert.deepEqual(upgraded.algorithmMetrics.forceMetrics, force)
  assert.deepEqual(upgraded.algorithmMetrics.areaMetrics, area)
  assert.equal(upgraded.algorithmMetrics.summary.forceN, 321.123)
  assert.equal(upgraded.algorithmMetrics.summary.areaCm2, 70)
  assert.equal(upgraded.algorithmMetrics.summary.averagePressureKPa, 10 * 321.123 / 70)
  assert.equal(upgraded.rawDisplayAvailable, false)
  assert.ok(upgraded.arr.every(value => value === null))
  assert.ok(upgraded.pressureArr.every(value => value === null))
  const withRaw = upgradeFullAlgorithmItem(sensor.key, { ...old, algorithmPhysicalSourceFrame: physical })
  assert.equal(withRaw.rawDisplayAvailable, true)
  assert.deepEqual(withRaw.arr, rotate(expected.sourceMatrix, 5).flat())
  assert.deepEqual(withRaw.algorithmMetrics.summary, upgraded.algorithmMetrics.summary)
})

test('a replacement module with the same version starts a fresh session and preserves acquired history provenance', () => {
  const { state } = require('../server/state')
  const { getPlaybackSnapshot } = require('../server/services/DataService')
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'shroom-calibration-replacement-'))
  const file = path.join(directory, 'seatBackrestPressure_v2.99.0.js')
  const previousDirectory = process.env.PRESSURE_FORMULA_DIR
  const previousPath = process.env.PRESSURE_FORMULA_PATH
  const previousHistory = state.historyDbArr
  const previousIndex = state.playIndex
  const previousBadFrames = state.playbackConsecutiveBadFrames
  const source = (force) => `
    module.exports = {
      VERSION: '2.99.0',
      SENSOR_DEFINITIONS: {
        'endi-23x23': { physicalRows: 23, physicalCols: 23 },
        'new-backrest-32x25': { physicalRows: 32, physicalCols: 25 },
      },
      calculateSensorSequence() {}, calculateSensorFrame() {},
      calculateMatrixPressureMap() {}, calculatePressureMetricsFromMatrix() {},
      createSensorSession(_type, options) {
        if (Object.keys(options).some(key => key !== 'rotation')) throw new Error('App pinned algorithm tuning');
        let frames = 0;
        return {
          update(frame) {
            frames++;
            return { timestampMs: frame.timestampMs, forceMetrics: { forceN: ${force} * frames },
              areaMetrics: { areaCm2: 40 }, pressureMetrics: {} };
          },
          reset() { frames = 0; },
        };
      },
    };
  `
  try {
    process.env.PRESSURE_FORMULA_DIR = directory
    delete process.env.PRESSURE_FORMULA_PATH
    fs.writeFileSync(file, source(100))
    const input = {
      algorithmPhysicalFrame: Array.from({ length: 23 }, () => Array(23).fill(80)),
      algorithmTimestampMs: 0, algorithmFrameId: 'same-frame', algorithmStreamId: uniqueStream(),
    }
    const first = processFullAlgorithmItem('endi-sit', input)
    const initialRuntime = getCalibrationRuntime()
    assert.equal(first.algorithmMetrics.contract, FULL_ALGORITHM_CONTRACT)
    assert.equal(first.algorithmMetrics.version, '2.99.0')
    assert.equal(first.algorithmMetrics.identity, initialRuntime.identity)
    assert.equal(first.algorithmMetrics.checksum, initialRuntime.checksum)
    assert.equal(first.processing.formulaFile, path.basename(file))
    assert.equal(first.algorithmMetrics.summary.forceN, 100)
    // Reconstructed native rows are cached for seeking, but replacement of
    // the calibration must invalidate that cache while saved results stay put.
    state.historyDbArr = [{ timestamp: 0, data: { 'endi-sit': input } }]
    assert.equal(getPlaybackSnapshot(0).payload.sitDataPlay['endi-sit'].algorithmMetrics.summary.forceN, 100)
    const advanced = processFullAlgorithmItem('endi-sit', {
      ...input, algorithmTimestampMs: 100, algorithmFrameId: 'next-frame',
    })
    assert.equal(advanced.algorithmMetrics.summary.forceN, 200)
    fs.writeFileSync(file, source(300))
    const modifiedTime = new Date(Date.now() + 2000)
    fs.utimesSync(file, modifiedTime, modifiedTime)
    const replaced = processFullAlgorithmItem('endi-sit', input)
    assert.equal(replaced.algorithmMetrics.version, '2.99.0')
    assert.notEqual(replaced.algorithmMetrics.identity, first.algorithmMetrics.identity)
    assert.notEqual(replaced.algorithmMetrics.checksum, first.algorithmMetrics.checksum)
    assert.equal(replaced.algorithmMetrics.summary.forceN, 300)
    assert.equal(replaced.algorithmMetrics.summary.averagePressureKPa, 75)
    assert.deepEqual(replaced.rawAdcArr, first.rawAdcArr)
    assert.equal(getPlaybackSnapshot(0).payload.sitDataPlay['endi-sit'].algorithmMetrics.summary.forceN, 300)
    const recorded = [{ timestamp: 0, data: { 'endi-sit': first } }]
    assert.equal(prepareFullAlgorithmHistory(recorded), recorded)
    assert.equal(hasFullAlgorithmResult(first), true)
    assert.equal(first.algorithmMetrics.summary.forceN, 100)
    assert.equal(first.algorithmMetrics.identity, initialRuntime.identity)
  } finally {
    if (previousDirectory === undefined) delete process.env.PRESSURE_FORMULA_DIR
    else process.env.PRESSURE_FORMULA_DIR = previousDirectory
    if (previousPath === undefined) delete process.env.PRESSURE_FORMULA_PATH
    else process.env.PRESSURE_FORMULA_PATH = previousPath
    state.historyDbArr = previousHistory
    state.playIndex = previousIndex
    state.playbackConsecutiveBadFrames = previousBadFrames
    if (fs.existsSync(file)) fs.unlinkSync(file)
    fs.rmdirSync(directory)
  }
})

test('saved V19 force/area remain exactly attributed to the old algorithm after an upgrade', () => {
  const missing = Array(2116).fill(null)
  const item = {
    arr: Array(2116).fill(12), rawAdcArr: Array(2116).fill(12), rawDisplayAvailable: true,
    matrixMeta: { matrix_key: 'endi-sit', width: 46, height: 46 },
    pressureArr: missing, forceArr: missing, pointAreaArr: missing,
    calibrationValidMask: Array(2116).fill(1),
    processing: {
      version: 'backend-force-area-v19-v2110-raw-adc',
      adcPreprocessing: 'native-v2110-force-area-raw-adc-display',
      pressureMethod: 'force-over-area',
      formulaFile: 'seatBackrestPressure_v2.11.0.js', formulaProfile: 'seatBackrestPressure_v2.11.0',
      algorithmOptions: { rotation: 3, filterThreshold: 30, humanCoefficient: 2.2 },
    },
    algorithmMetrics: {
      version: '2.11.0', status: 'complete', pressureMethod: 'force-over-area',
      forceMetrics: { forceN: 321 }, areaMetrics: { areaCm2: 70 }, pressureMetrics: null,
      summary: { forceN: 321, areaCm2: 70, averagePressureKPa: 10 * 321 / 70, pressureMethod: 'force-over-area' },
    },
  }
  const rows = [{ timestamp: 100, data: { 'endi-sit': item } }]
  assert.equal(hasFullAlgorithmResult(item), false)
  const migrated = prepareFullAlgorithmHistory(rows)
  assert.equal(migrated[0].data['endi-sit'].algorithmMetrics.forceMetrics, item.algorithmMetrics.forceMetrics)
  const restored = ensureProcessedMatrixItem('endi-sit', item)
  assert.deepEqual(restored.rawAdcArr, item.rawAdcArr)
  assert.equal(hasFullAlgorithmResult(restored), true)
  assert.equal(restored.algorithmMetrics.version, '2.11.0')
  assert.equal(restored.algorithmMetrics.summary.forceN, 321)
})
