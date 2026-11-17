const test = require('node:test')
const assert = require('node:assert/strict')

const formula = require('../server/kpa/seatBackrestPressure_v2.11.0.js')
const {
  calculateCalibrationPressureDistribution,
} = require('../util/calibrationPressureAdapter')
const {
  calcNativeCalibrationPressureValues,
  calcPressureFormulaStats: calcRuntimePressureFormulaStats,
  ensureProcessedMatrixItem,
  processMatrixItem,
} = require('../util/pressureFrameProcessor')
const { FULL_PROCESSING_VERSION, FULL_ADC_PREPROCESSING, FULL_DISTRIBUTION } = require('../util/fullAlgorithmProcessor')
const pressureConfig = require('../server/services/PressureConfig')
const sdk = require('../sdk/core/pressure')
const browserModule = import('../client/src/util/pressureMetrics.js')

const PROFILE = 'seatBackrestPressure_v2.11.0'
const activeFormula = require('../calibration/seatBackrestPressure_v2.12.0.js')
const ACTIVE_PROFILE = 'seatBackrestPressure_v2.12.0'
const calcPressureFormulaStats = (values, key) => calcRuntimePressureFormulaStats(values, key, undefined, false, formula)
const SENSOR_TYPES = {
  'endi-sit': 'endi-23x23',
  'endi-back': 'new-backrest-32x25',
}

function nativeSeat(value = 110) {
  return Array.from({ length: 23 }, (_, row) => Array.from({ length: 23 }, (_, col) => (
    row >= 7 && row <= 13 && col >= 8 && col <= 14 ? value : 0
  )))
}

// This is the delivered snapshot's input contract, independent of the
// application's preprocessing implementation.
function referenceAdc(values, key) {
  return values.map((value) => {
    if (!Number.isFinite(value) || value <= 0) return 0
    const corrected = key === 'endi-sit'
      ? 1.0069947916666666 * value + 6.018421875000001
      : value
    return corrected > 30 ? corrected : 0
  })
}

function referenceMap(values, key) {
  return formula.calculateMatrixPressureMap([referenceAdc(values, key)], SENSOR_TYPES[key])
}

function near(actual, expected, message) {
  assert.ok(Number.isFinite(actual), `${message}: expected a finite value, received ${actual}`)
  assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: ${actual} != ${expected}`)
}

function sameValues(actual, expected, message) {
  assert.equal(actual.length, expected.length, `${message}: length`)
  actual.forEach((value, index) => near(value, expected[index], `${message}[${index}]`))
}

test('the historical V2.11.0 snapshot stays unchanged while the external calibration is active', () => {
  assert.equal(formula.VERSION, '2.11.0')
  assert.equal(formula.runSelfCheck().passed, true)
  const config = pressureConfig.loadPressureConfig()
  assert.equal(config.pressureFormulaFile, `${ACTIVE_PROFILE}.js`)
  assert.equal(config.pressureFormulaProfile, ACTIVE_PROFILE)
  assert.match(FULL_PROCESSING_VERSION, /external-calibration/)
  assert.equal(FULL_ADC_PREPROCESSING, 'native-force-area-raw-adc-display')
  assert.equal(FULL_DISTRIBUTION, 'force-over-area')
})

test('the adapter preserves the delivered matrix, top-rank input and 300/301 branch boundary', () => {
  for (const [key, type] of Object.entries(SENSOR_TYPES)) {
    for (const count of [1, 4, 5, 70, 300, 301]) {
      const values = Array.from({ length: count }, (_, index) => 40 + (index % 170))
      const matrix = [referenceAdc(values, key)]
      const expected = formula.calculateMatrixPressureMap(matrix, type)
      const metrics = formula.calculatePressureMetricsFromMatrix(matrix, type)
      const actual = calculateCalibrationPressureDistribution(
        formula,
        matrix,
        key === 'endi-sit' ? 'seat' : 'backrest',
      )
      sameValues(actual.pressureMatrixKPa.flat(), expected.kpa.flat(), `${key}, N=${count}`)
      assert.equal(actual.branch, count > 300 ? 'human' : 'weight')
      assert.equal(actual.validCount, count)
      assert.equal(actual.selectedCount, metrics.topCount)
      near(actual.mean, metrics.topMean, `${key} top ADC mean`)
      near(actual.summaryAveragePressureKPa, expected.avgKpa, `${key} mean`)
      near(actual.summaryMaxPressureKPa, expected.maxKpa, `${key} max`)
    }
  }
})

test('backend raw ADC preprocessing includes seat ADC24 after compensation and excludes ADC23', () => {
  const values = [0, -1, NaN, Infinity, -Infinity, 23, 24, 29, 30, 31, 100]
  for (const key of Object.keys(SENSOR_TYPES)) {
    const expected = referenceMap(values, key)
    const actual = calcPressureFormulaStats(values, key)
    sameValues(actual.pressureValues, expected.kpa[0], `${key} preprocessing`)
    near(actual.aver, expected.avgKpa, `${key} average`)
    near(actual.max, expected.maxKpa, `${key} maximum`)
    assert.equal(actual.calibrationValidCount, key === 'endi-sit' ? 5 : 2)
    assert.equal(actual.pressureValues[5], 0)
    assert.equal(actual.pressureValues[6] > 0, key === 'endi-sit')
  }
})

test('the native calibrated-ADC entry does not apply seat compensation a second time', () => {
  const raw = [0, 23, 24, 50, 80, 100, 140, 190]
  const corrected = referenceAdc(raw, 'endi-sit')
  const expected = formula.calculateMatrixPressureMap([corrected], 'endi-23x23')
  const actual = calcNativeCalibrationPressureValues(corrected, 'endi-sit', formula)
  sameValues(actual.calibrationAdcValues, corrected, 'preserved compensated input')
  sameValues(actual.pressureValues, expected.kpa[0], 'native calibrated pressure')
})

test('explicit curve utilities agree while public visual APIs preserve raw ADC across sparse and human frames', async () => {
  const browser = await browserModule
  browser.setPressureFormulaProfile(PROFILE)
  sdk.setPressureFormulaProfile(PROFILE)
  for (const key of Object.keys(SENSOR_TYPES)) {
    for (const count of [0, 4, 100, 300, 301]) {
      const values = [0, 23, ...Array.from({ length: count }, (_, index) => 31 + (index % 210))]
      const expected = referenceMap(values, key)
      const backend = calcPressureFormulaStats(values, key)
      const browserValues = browser.getPressureMetricPointValues(values, key, browser.PRESSURE_METRIC_MODE)
      const sdkMetrics = sdk.computePressureMetrics(values, key)
      sameValues(backend.pressureValues, expected.kpa[0], `${key} backend N=${count}`)
      assert.deepEqual(browserValues, values)
      assert.deepEqual(sdkMetrics.pressureValues, [])
      assert.equal(sdkMetrics.pressAver, null)
      assert.equal(sdkMetrics.pressMax, null)
    }
  }
})

test('empty, invalid and saturated inputs retain the snapshot pressure semantics', () => {
  for (const key of Object.keys(SENSOR_TYPES)) {
    for (const values of [[], [0, -100, NaN, Infinity], [255], Array(301).fill(255)]) {
      const expected = referenceMap(values, key)
      const actual = calcPressureFormulaStats(values, key)
      sameValues(actual.pressureValues, expected.kpa[0], `${key} empty/invalid/saturated`)
      near(actual.aver, expected.avgKpa, `${key} finite mean`)
      near(actual.max, expected.maxKpa, `${key} finite max`)
    }
    const weight = calcPressureFormulaStats([255], key)
    const human = calcPressureFormulaStats(Array(301).fill(255), key)
    near(weight.max, 27, `${key} base saturation`)
    near(human.max, 59.4, `${key} human coefficient follows base saturation`)
  }
})

test('canonical frames retain native ADC and rebuild stale results without double compensation', () => {
  const physical = nativeSeat()
  physical[2][2] = 24
  const raw = new Array(46 * 46).fill(999)
  const canonical = processMatrixItem('endi-sit', {
    arr: raw,
    algorithmPhysicalFrame: physical,
    algorithmTimestampMs: 0,
    algorithmStreamId: 'snapshot-canonical-preserve-native-test',
  })
  const expected = activeFormula.calculateSensorFrame({ physical, timestampMs: 0 }, 'endi-23x23')
  sameValues(canonical.calibrationAdcArr, expected.displayAdcMatrix.flat(), 'stored calibration ADC')
  assert.deepEqual(canonical.algorithmMetrics.pressureMetrics, expected.pressureMetrics)
  assert.ok(canonical.pressureArr.every(value => value === null))
  assert.deepEqual(canonical.algorithmPhysicalFrame, physical)
  assert.deepEqual(canonical.algorithmMetrics.forceMetrics, expected.forceMetrics)
  assert.deepEqual(canonical.algorithmMetrics.areaMetrics, expected.areaMetrics)
  assert.equal(canonical.processing.formulaFile, `${ACTIVE_PROFILE}.js`)
  assert.deepEqual(ensureProcessedMatrixItem('endi-sit', canonical), canonical)

  const stale = {
    ...canonical,
    calibrationAdcArr: raw.map(() => 999),
    pressureArr: raw.map(() => 999),
    forceArr: raw.map(() => 999),
    processing: { ...canonical.processing, version: 'backend-zero-native-v16-matrix-calibration-v2763' },
  }
  const rebuilt = ensureProcessedMatrixItem('endi-sit', stale)
  sameValues(rebuilt.calibrationAdcArr, canonical.calibrationAdcArr, 'history uses native ADC')
  assert.deepEqual(rebuilt.pressureArr, canonical.pressureArr)
  assert.deepEqual(rebuilt.forceArr, canonical.forceArr)
  assert.deepEqual(ensureProcessedMatrixItem('endi-sit', rebuilt), rebuilt)

  const changedWatermark = {
    ...canonical,
    processing: { ...canonical.processing, formulaFile: 'previous-formula.js' },
  }
  const formulaRebuilt = ensureProcessedMatrixItem('endi-sit', changedWatermark)
  sameValues(formulaRebuilt.calibrationAdcArr, canonical.calibrationAdcArr, 'formula change preserves ADC domain')
  assert.deepEqual(formulaRebuilt.pressureArr, canonical.pressureArr)
})

test('legacy history without native ADC does not invent complete force or area from old display matrices', () => {
  const rawBeforeZero = new Array(46 * 46).fill(100)
  const postZero = new Array(rawBeforeZero.length).fill(0)
  postZero[100] = 80
  postZero[101] = 120
  const legacy = {
    arr: [...postZero],
    rawAdcArr: rawBeforeZero,
    calibrationAdcArr: [...postZero],
    pressureArr: postZero.map(() => 999),
    forceArr: postZero.map(() => 999),
    processing: { version: 'backend-zero-native-v16-matrix-calibration-v2763' },
  }
  const rebuilt = ensureProcessedMatrixItem('endi-sit', legacy)
  assert.equal(rebuilt.algorithmMetrics.status, 'unavailable')
  assert.equal(rebuilt.algorithmMetrics.summary.forceN, null)
  assert.equal(rebuilt.algorithmMetrics.summary.areaCm2, null)
  assert.ok(rebuilt.pressureArr.every((value) => value === null))
  assert.ok(rebuilt.forceArr.every((value) => value === null))
  assert.equal(rebuilt.rawDisplayAvailable, false)
  assert.ok(rebuilt.arr.every(value => value === null))
  assert.deepEqual(rebuilt.calibrationAdcArr, postZero)
  assert.ok(rebuilt.rawAdcArr.every(value => value === null))
  assert.deepEqual(ensureProcessedMatrixItem('endi-sit', rebuilt), rebuilt)
})

test('fresh processing honors a new zeroed native matrix even when old full metrics are present', () => {
  const physical = nativeSeat()
  const first = processMatrixItem('endi-sit', {
    arr: [],
    algorithmPhysicalFrame: physical,
    algorithmTimestampMs: 0,
    algorithmStreamId: 'snapshot-native-zero-test',
  })
  assert.ok(first.algorithmMetrics.summary.forceN > 0)
  const zeroedPhysical = nativeSeat(0)
  const zeroed = new Array(46 * 46).fill(0)
  const next = processMatrixItem('endi-sit', {
    ...first,
    arr: zeroed,
    algorithmPhysicalFrame: zeroedPhysical,
    algorithmTimestampMs: 100,
    algorithmReset: true,
  })
  assert.deepEqual(next.arr, zeroed)
  assert.deepEqual(next.algorithmPhysicalFrame, zeroedPhysical)
  assert.deepEqual(next.calibrationAdcArr, zeroed)
  assert.ok(next.pressureArr.every(value => value === null))
  assert.equal(next.algorithmMetrics.summary.forceN, 0)
  assert.equal(next.algorithmMetrics.summary.areaCm2, 0)
  assert.equal(next.algorithmMetrics.summary.averagePressureKPa, null)
})

test('matrix-only fallbacks retain pressure curves without inventing complete force or area', async () => {
  const browser = await browserModule
  for (const [key, area] of [['endi-sit', 1], ['endi-back', 1.3]]) {
    const values = [0, 80, 100, 140, 255]
    const expected = referenceMap(values, key)
    const expectedForce = expected.kpa[0].map((value) => value * area * 0.1)
    const backend = calcPressureFormulaStats(values, key)
    const browserForce = browser.getPressureMetricPointValues(values, key, browser.FORCE_METRIC_MODE)
    const sdkMetrics = sdk.computePressureMetrics(values, key)
    sameValues(backend.forceValues, expectedForce, `${key} backend force`)
    assert.deepEqual(browserForce, values, `${key} visual matrix must remain raw ADC`)
    assert.deepEqual(sdkMetrics.forceValues, [])
    assert.equal(sdkMetrics.calibrationScope, 'matrix-only')
    assert.equal(sdkMetrics.calibrationComplete, false)
    assert.equal(sdkMetrics.total, null)
    assert.equal(sdkMetrics.effectiveArea, null)
    near(backend.total, expectedForce.reduce((sum, value) => sum + value, 0), `${key} total N`)
    near(backend.max, expected.maxKpa, `${key} unscaled pressure maximum`)
  }
})
