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
}

run()
console.log('core.test.js passed')
