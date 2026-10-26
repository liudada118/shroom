const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')
const { pathToFileURL } = require('node:url')
const { calculateAreaForceN: backendForce } = require('../util/areaMetrics')

async function frontendForce() {
  return (await import(pathToFileURL(path.resolve(__dirname, '../client/src/util/areaMetrics.js')).href)).calculateAreaForceN
}

test('front and backend convert the existing mean pressure and total area without intermediate rounding', async () => {
  const calculateFrontendForce = await frontendForce()
  for (const [pressure, area, expected] of [[2, 100, 20], [0.1234, 1.5625, 0.01928125], [0, 42, 0], [4, 0, 0]]) {
    const backend = backendForce(pressure, area)
    assert.ok(Math.abs(backend - expected) < 1e-14)
    assert.equal(calculateFrontendForce(pressure, area), backend)
  }
  // These are the already calculated mean (1 + 9) / 2 and summed area (0 + 10).
  assert.equal(backendForce(5, 10), 5)
  assert.notEqual(backendForce(5, 10), 9, 'the calculation is not the per-cell pressure-area weighted sum')
})

test('unknown or invalid pressure and area stay unknown in both helpers', async () => {
  const calculateFrontendForce = await frontendForce()
  for (const [pressure, area] of [
    [2, null], [2, undefined], [2, NaN], [2, Infinity], [2, -1],
    [null, 2], [undefined, 2], [NaN, 2], [Infinity, 2], [-1, 2], [Number.MAX_VALUE, Number.MAX_VALUE],
  ]) {
    assert.equal(backendForce(pressure, area), null)
    assert.equal(calculateFrontendForce(pressure, area), null)
  }
})
