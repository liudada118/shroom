'use strict'

const assert = require('assert')
const sdk = require('..')

function run() {
  assert.deepStrictEqual(
    sdk.flipHorizontal([1, 2, 3, 4], 2, 2),
    [2, 1, 4, 3]
  )
  assert.deepStrictEqual(
    sdk.flipVertical([1, 2, 3, 4], 2, 2),
    [3, 4, 1, 2]
  )
  assert.deepStrictEqual(
    sdk.rotateClockwise([1, 2, 3, 4], 2, 2),
    [3, 1, 4, 2]
  )

  assert.deepStrictEqual(
    sdk.applyCollectionDirection('demo', [1, 2, 3, 4], { left: false, up: true, rotateDegree: 0 }),
    [2, 1, 4, 3]
  )

  assert.deepStrictEqual(
    sdk.applyZeroBaseline('hand', [10, 5, 1, 0], { enabled: true, data: { hand: [2, 6, 1, 3] } }),
    [8, 0, 0, 0]
  )

  const frame = {
    hand: { arr: [1, 2, 3, 4] },
  }
  const stats = sdk.computeSelectionStats(frame, {
    hand: [{ xStart: 0, xEnd: 2, yStart: 0, yEnd: 1, width: 2 }],
  })
  assert.strictEqual(stats.hand.press, 3)
  assert.strictEqual(stats.hand.area, 2)

  const playbackFrame = { demo: { arr: [1, 2, 3, 4] } }
  assert.deepStrictEqual(sdk.validatePlaybackFrameData(playbackFrame), { valid: true })
  assert.strictEqual(sdk.buildPlaybackSnapshot([{ data: JSON.stringify(playbackFrame), timestamp: '123' }], 0).payload.timestamp, 123)

  const metrics = sdk.computePressureMetrics([100, 120, 0, 130], 'endi-sit')
  assert.strictEqual(metrics.activeCount, 3)
  assert.strictEqual(metrics.sensor, 'seat')
  assert(metrics.pressAver > 0)
  assert.strictEqual(metrics.pressureValues.length, 4)
  assert.strictEqual(metrics.pressureValues[2], 0)
  const activeMetricPressures = metrics.pressureValues.filter((value) => value > 0)
  assert(Math.abs(metrics.pressAver - activeMetricPressures.reduce((sum, value) => sum + value, 0) / activeMetricPressures.length) < 1e-9)
  assert(Math.abs(metrics.total - metrics.forceValues.reduce((sum, value) => sum + value, 0)) < 1e-9)

  const thresholdMetrics = sdk.computePressureMetrics([29, 30, 31], 'endi-sit')
  assert.strictEqual(thresholdMetrics.calibrationInputMinAdc, 30)
  assert.strictEqual(thresholdMetrics.calibrationValidCount, 2)
  assert.strictEqual(thresholdMetrics.activeCount, 2)
  assert.strictEqual(thresholdMetrics.pressureValues[0], 0)

  const largePointMetrics = sdk.computePressureMetrics(new Array(301).fill(120), 'endi-sit')
  assert.strictEqual(largePointMetrics.pressureCalibrationBranch, 'human')
  assert.strictEqual(largePointMetrics.normalizationScale, 1)
  assert(Math.abs(largePointMetrics.pressAver - sdk.estimatePressure(120, 301, 'seat')) < 0.01)

  const boundaryPointMetrics = sdk.computePressureMetrics(new Array(300).fill(120), 'endi-sit')
  assert.strictEqual(boundaryPointMetrics.pressureCalibrationBranch, 'weight')
  assert(Math.abs(largePointMetrics.pressAver - boundaryPointMetrics.pressAver * 2.2) < 1e-9)

  const noisyBackrest = [
    ...new Array(56).fill(106.24),
    ...new Array(245).fill(29),
    ...new Array(3200 - 301).fill(0),
  ]
  const backrestMetrics = sdk.computePressureMetrics(noisyBackrest, 'endi-back')
  assert.strictEqual(backrestMetrics.calibrationInputMinAdc, 30)
  assert.strictEqual(backrestMetrics.calibrationValidCount, 56)
  assert.strictEqual(backrestMetrics.pressureCalibrationBranch, 'weight')
  const expectedBackrestAverage = sdk.estimatePressure(106.24, 56, 'backrest')
  assert(Math.abs(backrestMetrics.pressAver - expectedBackrestAverage) < 0.01)

  const unevenBackrest = [
    142,
    ...new Array(55).fill(106.24),
    ...new Array(3200 - 56).fill(0),
  ]
  const unevenBackrestMetrics = sdk.computePressureMetrics(unevenBackrest, 'endi-back')
  const expectedBackrestMax = Math.max(...unevenBackrestMetrics.pressureValues)
  assert(Math.abs(unevenBackrestMetrics.pressMax - expectedBackrestMax) < 1e-9)
  assert.strictEqual(unevenBackrestMetrics.matrixPressMax, unevenBackrestMetrics.pressMax)
}

run()
console.log('core.test.js passed')
