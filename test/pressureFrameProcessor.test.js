const test = require('node:test')
const assert = require('node:assert/strict')

const {
  PROCESSING_VERSION,
  ensureProcessedMatrixItem,
  normalizeFrameProcessingConfig,
  processMatrixItem,
} = require('../util/pressureFrameProcessor')

function hasAtMostOneDecimal(value) {
  return Math.abs(Number(value) * 10 - Math.round(Number(value) * 10)) < 1e-9
}

test('frame processing settings are normalized to backend limits', () => {
  assert.deepEqual(normalizeFrameProcessingConfig({
    filter: -1,
    gauss: 99,
    coherent: 0,
  }), {
    filter: 0,
    gauss: 4,
    coherent: 1,
  })
})

test('spatial Gaussian processing is deterministic and has no temporal state', () => {
  const values = new Array(46 * 46).fill(0)
  values[23 * 46 + 23] = 1000
  const config = { filter: 0, gauss: 1, coherent: 7 }

  const first = processMatrixItem('endi-sit', { arr: values }, config)
  const second = processMatrixItem('endi-sit', { arr: values }, config)
  const differentCoherent = processMatrixItem('endi-sit', { arr: values }, {
    ...config,
    coherent: 1,
  })

  assert.deepEqual(first.arr, second.arr)
  assert.deepEqual(first.pressureArr, second.pressureArr)
  assert.deepEqual(first.forceArr, second.forceArr)
  assert.deepEqual(first.arr, differentCoherent.arr)
  assert.deepEqual(first.pressureArr, differentCoherent.pressureArr)
  assert.deepEqual(first.forceArr, differentCoherent.forceArr)
  assert.equal(first.processing.version, PROCESSING_VERSION)
  assert.equal(first.processing.temporal, false)
  assert.equal(first.processing.coherent, 7)
  assert.ok(first.arr.filter((value) => value > 0).length > 1)
  assert.deepEqual(first.rawAdcArr, values)
})

test('canonical pressure and force matrices have display precision and are not processed twice', () => {
  const values = new Array(46 * 46).fill(0)
  values[100] = 500
  values[101] = 700
  const processed = processMatrixItem('endi-sit', { arr: values }, {
    filter: 30,
    gauss: 0.5,
    coherent: 1,
  })
  const ensured = ensureProcessedMatrixItem('endi-sit', processed, {
    filter: 4095,
    gauss: 4,
    coherent: 10,
  })

  assert.equal(processed.pressureArr.length, values.length)
  assert.equal(processed.forceArr.length, values.length)
  assert.ok(processed.pressureArr.every(hasAtMostOneDecimal))
  assert.ok(processed.forceArr.every(hasAtMostOneDecimal))
  assert.deepEqual(ensured.arr, processed.arr)
  assert.deepEqual(ensured.pressureArr, processed.pressureArr)
  assert.deepEqual(ensured.forceArr, processed.forceArr)

  const displayedForceTotal = processed.forceArr.reduce((sum, value) => sum + value, 0)
  const activePointCount = processed.forceArr.filter((value) => value > 0).length
  assert.ok(displayedForceTotal > 0)
  assert.ok(activePointCount > 0)
})

test('endi backrest padding is excluded from canonical metric matrices', () => {
  const values = new Array(50 * 64).fill(600)
  const processed = processMatrixItem('endi-back', { arr: values }, {
    filter: 0,
    gauss: 0,
    coherent: 1,
  })

  assert.equal(processed.pressureArr[0], 0)
  assert.equal(processed.forceArr[13 * 50], 0)
  assert.ok(processed.pressureArr[18 * 50] > 0)
  assert.ok(processed.forceArr[18 * 50] > 0)
})
