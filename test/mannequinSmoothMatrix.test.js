const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')
const { pathToFileURL } = require('node:url')

const helper = import(pathToFileURL(path.resolve(__dirname, '../client/src/util/mannequinSmoothMatrix.js')).href)

function sample(field, u, v, channel = 0) {
  const x = (field.uvOffset[0] + u * field.uvScale[0]) * field.width - 0.5
  const y = (field.uvOffset[1] + v * field.uvScale[1]) * field.height - 0.5
  const x0 = Math.floor(x), y0 = Math.floor(y), tx = x - x0, ty = y - y0
  const at = (col, row) => field.data[(row * field.width + col) * 4 + channel] || 0
  return (at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx) * (1 - ty)
    + (at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx) * ty
}

test('world-space smoothing follows display controls and compensates matrix aspect ratio', async () => {
  const { getMannequinMatrixSmoothing } = await helper
  const initial = getMannequinMatrixSmoothing(24, 128)
  const stronger = getMannequinMatrixSmoothing(24, 128, { gauss: 2.3, heightSetting: 150.1 })
  assert.ok(Math.abs(initial.sigmaWorld - 0.055) < 1e-12)
  assert.ok(initial.sigmaX > 3 && initial.sigmaX < 4)
  assert.ok(initial.sigmaY > 1.9 && initial.sigmaY < 2.1)
  assert.ok(stronger.sigmaWorld > initial.sigmaWorld)
  assert.ok(stronger.sigmaX > initial.sigmaX)
  assert.ok(stronger.sigmaY > initial.sigmaY)
  const wider = getMannequinMatrixSmoothing(24, 128, { worldWidth: 0.778 })
  assert.equal(wider.sigmaX, initial.sigmaX / 2)
})

test('constant pressure stays bounded and does not intensify as a denser matrix repeats it', async () => {
  const { createSmoothMannequinMatrix } = await helper
  for (const [width, height] of [[24, 128], [48, 256]]) {
    const values = new Float32Array(width * height).fill(0.25)
    const field = createSmoothMannequinMatrix(values, width, height)
    assert.ok(Math.abs(sample(field, 0.5, 0.5) - 0.25) < 1e-6)
    for (let offset = 0; offset < field.data.length; offset += 4) {
      assert.ok(field.data[offset] >= 0 && field.data[offset] <= 0.250001)
      assert.ok(field.data[offset + 1] >= 0 && field.data[offset + 1] <= 1)
    }
  }
})

test('tiny positive pressure keeps contact coverage, source zeros clear it, and inputs are unchanged', async () => {
  const { createSmoothMannequinMatrix } = await helper
  const values = new Float64Array(24 * 128)
  values[64 * 24 + 12] = 1e-12
  const before = values.slice()
  const weak = createSmoothMannequinMatrix(values, 24, 128)
  assert.deepEqual(values, before)
  assert.equal(weak.activeCount, 1)
  assert.ok(sample(weak, 12 / 23, 64 / 127, 1) > 0.01)
  assert.ok(sample(weak, 12 / 23, 64 / 127) > 0)
  const highValues = values.slice()
  highValues[64 * 24 + 12] = 1
  const high = createSmoothMannequinMatrix(highValues, 24, 128)
  for (let index = 1; index < weak.data.length; index += 4) assert.equal(weak.data[index], high.data[index])
  const empty = createSmoothMannequinMatrix(new Float32Array(values.length), 24, 128)
  assert.equal(empty.activeCount, 0)
  assert.ok(empty.data.every(value => value === 0))
})

test('an isolated hotspot forms a continuous rounded field without a conditional red plateau', async () => {
  const { createSmoothMannequinMatrix } = await helper
  const values = new Float32Array(24 * 128)
  for (let y = 60; y <= 67; y++) for (let x = 9; x <= 14; x++) values[y * 24 + x] = 0.8
  const field = createSmoothMannequinMatrix(values, 24, 128)
  const center = sample(field, 11.5 / 23, 63.5 / 127)
  const shoulder = sample(field, 8 / 23, 63.5 / 127)
  const edge = sample(field, 4 / 23, 63.5 / 127)
  assert.ok(center > shoulder && shoulder > edge && edge >= 0)
  assert.ok(center < 0.8)
  assert.ok(Math.abs(sample(field, 11 / 23, 63 / 127) - sample(field, 12 / 23, 64 / 127)) < 1e-6)
  let previous = sample(field, 0.2, 0.5)
  for (let step = 1; step <= 80; step++) {
    const current = sample(field, 0.2 + step / 400, 0.5)
    assert.ok(Math.abs(current - previous) < 0.025, 'subcell motion cannot step across a visible block boundary')
    previous = current
  }
})

test('zero padding prevents clamp-to-edge bands and moves neither pressure axes nor hotspot center', async () => {
  const { createSmoothMannequinMatrix } = await helper
  const values = new Float32Array(24 * 128)
  values[20 * 24 + 3] = 1
  const field = createSmoothMannequinMatrix(values, 24, 128)
  let maximum = -1, at = -1
  for (let offset = 0; offset < field.data.length; offset += 4) {
    if (field.data[offset] > maximum) { maximum = field.data[offset]; at = offset / 4 }
  }
  const u = ((at % field.width + 0.5) / field.width - field.uvOffset[0]) / field.uvScale[0]
  const v = ((Math.floor(at / field.width) + 0.5) / field.height - field.uvOffset[1]) / field.uvScale[1]
  assert.ok(Math.abs(u - 3 / 23) < 0.01)
  assert.ok(Math.abs(v - 20 / 127) < 0.005)
  for (let x = 0; x < field.width; x++) {
    assert.equal(field.data[x * 4], 0)
    assert.equal(field.data[((field.height - 1) * field.width + x) * 4], 0)
  }
})

test('invalid matrices fail clearly and nonfinite or negative readings never enter the display field', async () => {
  const { createSmoothMannequinMatrix } = await helper
  assert.throws(() => createSmoothMannequinMatrix([1], 2, 2), /完整输入/)
  assert.throws(() => createSmoothMannequinMatrix([], 0, 0), /有效尺寸/)
  const result = createSmoothMannequinMatrix([NaN, -2, Infinity, 0], 2, 2)
  assert.ok(result.data.every(value => value === 0))
})
