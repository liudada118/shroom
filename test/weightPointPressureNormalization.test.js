const test = require('node:test')
const assert = require('node:assert/strict')

const {
  calculateRankMean,
  distributeWeightPointPressures,
} = require('../util/weightPointPressureNormalization')

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

test('rank mean uses the requested descending closed interval', () => {
  const result = calculateRankMean([10, 40, 20, 30], 2, 3)

  assert.equal(result.mean, 25)
  assert.equal(result.selectedCount, 2)
  assert.equal(result.validCount, 4)
  assert.equal(result.maxAdc, 40)
})

test('curve-response normalization preserves matrix shape and target average', () => {
  const result = distributeWeightPointPressures([
    [0, 40, 80],
    [120, -1, 160],
  ], {
    curve: (adc) => adc * adc * 0.001,
    startRank: 1,
    endRank: 2,
  })
  const activeValues = result.pressureValuesKPa

  assert.deepEqual(result.pressureMatrixKPa.map((row) => row.length), [3, 3])
  assert.equal(result.pressureMatrixKPa[0][0], 0)
  assert.equal(result.pressureMatrixKPa[1][1], 0)
  assert.equal(result.referenceAdcMean, 140)
  assert.equal(result.targetAveragePressureKPa, 19.6)
  assert.ok(Math.abs(mean(activeValues) - 19.6) < 1e-12)
  assert.ok(Math.abs(result.meanConservationErrorKPa) < 1e-12)
  assert.equal(result.fallbackMode, 'none')
})

test('explicit target pressure is preserved when curve responses are all zero', () => {
  const result = distributeWeightPointPressures([10, 20, 0], {
    curve: () => 0,
    startRank: 1,
    endRank: 2,
    targetAveragePressureKPa: 3.5,
  })

  assert.deepEqual(result.pressureMatrixKPa, [[3.5, 3.5, 0]])
  assert.equal(result.actualAveragePressureKPa, 3.5)
  assert.equal(result.fallbackMode, 'equal-distribution')
})

test('empty effective data returns an all-zero matrix without calling the curve', () => {
  let curveCalls = 0
  const result = distributeWeightPointPressures([[0, -1], [NaN, null]], {
    curve: () => {
      curveCalls += 1
      return 1
    },
    startRank: 1,
    endRank: 2,
  })

  assert.equal(curveCalls, 0)
  assert.deepEqual(result.pressureMatrixKPa, [[0, 0], [0, 0]])
  assert.equal(result.validCount, 0)
  assert.equal(result.fallbackMode, 'no-valid-points')
})
