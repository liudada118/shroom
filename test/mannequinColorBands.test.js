const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')
const { pathToFileURL } = require('node:url')

const loadBands = () => import(pathToFileURL(path.resolve(__dirname, '../client/src/util/mannequinColorBands.js')).href)

function assertRatios(ratios) {
  assert.equal(ratios.length, 5)
  assert.ok(ratios.every(value => Number.isInteger(value) && value >= 1 && value <= 96))
  assert.equal(ratios.reduce((sum, value) => sum + value, 0), 100)
}

test('missing or damaged color proportions restore five equal visible intervals', async () => {
  const { DEFAULT_COLOR_BAND_RATIOS, normalizeColorBandRatios } = await loadBands()
  assert.ok(Object.isFrozen(DEFAULT_COLOR_BAND_RATIOS))
  for (const value of [undefined, null, {}, [], [20, 20], [20, 20, 20, 20, 0], [20, NaN, 20, 20, 20], [20, Infinity, 20, 20, 20]]) {
    const result = normalizeColorBandRatios(value)
    assert.deepEqual(result, [20, 20, 20, 20, 20])
    assert.notEqual(result, DEFAULT_COLOR_BAND_RATIOS)
  }
})

test('normalization is bounded, exactly totals 100 and is idempotent without mutating its source', async () => {
  const { normalizeColorBandRatios } = await loadBands()
  for (const input of [
    [40, 15, 15, 15, 15], [1, 1, 1, 1, 100000],
    [0.01, 0.01, 0.01, 0.01, 10], [1e308, 1, 2, 3, 4],
    [20.1, 19.9, 20, 20, 20], ['40', '15', '15', '15', '15'],
  ]) {
    const before = [...input]
    Object.freeze(input)
    const normalized = normalizeColorBandRatios(input)
    assertRatios(normalized)
    assert.deepEqual(normalizeColorBandRatios(normalized), normalized)
    assert.deepEqual(input, before)
  }
  assert.deepEqual(normalizeColorBandRatios([40, 15, 15, 15, 15]), [40, 15, 15, 15, 15])
  assert.deepEqual(normalizeColorBandRatios([1, 1, 1, 1, 100000]), [1, 1, 1, 1, 96])
})

test('editing one interval preserves its requested share and distributes the remaining visible range', async () => {
  const { updateColorBandRatio } = await loadBands()
  const original = Object.freeze([20, 20, 20, 20, 20])
  assert.deepEqual(updateColorBandRatio(original, 0, 40), [40, 15, 15, 15, 15])
  assert.deepEqual(updateColorBandRatio(original, 0, 1000), [96, 1, 1, 1, 1])
  assert.deepEqual(updateColorBandRatio(original, 0, 0), [1, 25, 25, 25, 24])
  for (let index = 0; index < 5; index++) {
    for (const requested of [1, 2, 33, 50, 96]) {
      const result = updateColorBandRatio([50, 20, 10, 10, 10], index, requested)
      assertRatios(result)
      assert.equal(result[index], requested)
    }
  }
  for (const value of [null, undefined, '', Infinity, NaN, true]) {
    assert.deepEqual(updateColorBandRatio(original, 0, value), original)
  }
  for (const index of [-1, 5, NaN]) assert.deepEqual(updateColorBandRatio(original, index, 40), original)
  assert.deepEqual(original, [20, 20, 20, 20, 20])
})

test('shader stops remain ordered with no zero-width intervals after any supported edit', async () => {
  const { getColorBandStops, updateColorBandRatio } = await loadBands()
  assert.deepEqual(getColorBandStops(), [0.2, 0.4, 0.6, 0.8])
  assert.deepEqual(getColorBandStops([40, 15, 15, 15, 15]), [0.4, 0.55, 0.7, 0.85])
  for (let index = 0; index < 5; index++) {
    for (const value of [1, 50, 96]) {
      const stops = [0, ...getColorBandStops(updateColorBandRatio(undefined, index, value)), 1]
      stops.forEach((stop, i) => { if (i) assert.ok(stop > stops[i - 1]) })
    }
  }
})

test('numeric colors reach the six mannequin palette anchors at each configured interval boundary', async () => {
  const { getColorBandRGB } = await loadBands()
  const expected = [
    [77, 148, 224], [0, 191, 230], [26, 199, 89],
    [255, 230, 26], [255, 158, 0], [242, 10, 0],
  ]
  for (const [ratios, boundaries] of [
    [[20, 20, 20, 20, 20], [0, 20, 40, 60, 80, 100]],
    [[40, 15, 15, 15, 15], [0, 40, 55, 70, 85, 100]],
  ]) {
    boundaries.forEach((value, index) => assert.deepEqual(getColorBandRGB(value, 100, ratios), expected[index]))
  }
})

test('a fixed numeric reading changes its color when interval proportions change without altering data or range', async () => {
  const { getColorBandRGB } = await loadBands()
  const original = Object.freeze([20, 20, 20, 20, 20])
  assert.deepEqual(getColorBandRGB(10, 100, original), [38, 170, 227])
  assert.deepEqual(getColorBandRGB(10, 100, [40, 15, 15, 15, 15]), [57, 159, 226])
  assert.deepEqual(getColorBandRGB(1, 10, original), getColorBandRGB(10, 100, original))
  assert.deepEqual(original, [20, 20, 20, 20, 20])
})

test('numeric color sampling clamps safely and remains continuous across narrow visible intervals', async () => {
  const { getColorBandRGB, getColorBandStops } = await loadBands()
  const blue = [77, 148, 224]
  assert.deepEqual(getColorBandRGB(-1, 100), blue)
  assert.deepEqual(getColorBandRGB(NaN, 100), blue)
  assert.deepEqual(getColorBandRGB(0, 0), blue)
  assert.deepEqual(getColorBandRGB(1000, 100), [242, 10, 0])
  assert.deepEqual(getColorBandRGB(0.5, NaN), getColorBandRGB(0.5, 1))
  const ratios = [1, 1, 1, 1, 96]
  for (const stop of getColorBandStops(ratios)) {
    const before = getColorBandRGB(stop - 1e-9, 1, ratios)
    const after = getColorBandRGB(stop + 1e-9, 1, ratios)
    assert.ok(before.every((channel, index) => Math.abs(channel - after[index]) <= 1))
  }
  for (let index = 0; index <= 100; index++) {
    assert.ok(getColorBandRGB(index, 100, ratios).every(channel => Number.isInteger(channel) && channel >= 0 && channel <= 255))
  }
})
