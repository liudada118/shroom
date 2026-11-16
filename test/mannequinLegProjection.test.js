const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')
const { pathToFileURL } = require('node:url')

const load = file => import(pathToFileURL(path.resolve(__dirname, file)).href)
const helper = load('../client/src/util/mannequinLegProjection.js')

test('leg registration uses complete 4/6/4 row spans and preserves transition placements', async () => {
  const { getMannequinLegRowLayouts } = await helper
  const left = getMannequinLegRowLayouts('right-leg')
  const right = getMannequinLegRowLayouts('left-leg')
  assert.equal(left.length, 128)
  for (const [displayRow, span] of [[0, 24], [30, 24], [32, 24], [44, 24], [46, 22],
    [48, 22], [50, 21], [52, 21], [54, 20], [56, 20], [58, 18], [60, 16], [127, 16]]) {
    assert.deepEqual(left[displayRow], { start: 0, span })
    assert.deepEqual(right[displayRow], { start: 24 - span, span })
    assert.deepEqual(left[displayRow + (displayRow % 2 ? -1 : 1)], left[displayRow])
  }
  assert.throws(() => getMannequinLegRowLayouts('back'), /腿部区域/)
})

test('each valid span fills the leg patch without admitting inside padding or flipping direction', async () => {
  const { getMannequinLegRowLayouts, warpMannequinLegDisplayMatrix } = await helper
  for (const canvasId of ['left-leg', 'right-leg']) {
    const layouts = getMannequinLegRowLayouts(canvasId)
    const input = new Float64Array(24 * 128).fill(999)
    for (let row = 0; row < 128; row++) {
      const { start, span } = layouts[row]
      for (let col = 0; col < span; col++) input[row * 24 + start + col] = 1 + col
    }
    const original = input.slice()
    const output = warpMannequinLegDisplayMatrix(input, 24, 128, canvasId)
    for (let row = 0; row < 128; row++) {
      const rowValues = output.slice(row * 24, row * 24 + 24)
      assert.equal(rowValues[0], 1)
      assert.equal(rowValues[23], layouts[row].span)
      for (let col = 1; col < 24; col++) assert.ok(rowValues[col] > rowValues[col - 1])
      assert.ok(rowValues.every(value => value < 100), 'padding never becomes a measured point')
    }
    assert.deepEqual(input, original)
  }
})

test('the six-column thigh and its interpolated hotspots are retained while narrow rows stretch to full width', async () => {
  const { warpMannequinLegDisplayMatrix } = await helper
  const values = new Float64Array(24 * 128)
  values[36 * 24 + 2] = 64.4
  values[38 * 24 + 4] = 73.7
  for (let col = 0; col < 16; col++) values[90 * 24 + col] = 5
  const output = warpMannequinLegDisplayMatrix(values, 24, 128, 'right-leg')
  assert.equal(output[36 * 24 + 2], Math.fround(64.4))
  assert.equal(output[38 * 24 + 4], Math.fround(73.7))
  assert.ok(output.slice(90 * 24, 91 * 24).every(value => value === 5))
  assert.throws(() => warpMannequinLegDisplayMatrix(values, 12, 128, 'right-leg'), /24×128/)
})

function calibration() {
  const sensors = [{ canvasId: 'head', index: 0, row: 1, col: 1, x: 0, y: 5, z: 0 }]
  for (const [side, canvasId] of [[1, 'left-leg'], [-1, 'right-leg']]) {
    for (let row = 1; row <= 4; row++) for (let col = 1; col <= 32; col++) {
      sensors.push({ canvasId, index: sensors.length, row, col, x: side * row / 10, y: 4 - col / 10, z: -0.5,
        sourceIndex: col * 6 + row, displayIndex: col * 24 + row })
    }
  }
  return sensors
}

test('physical anchors retain their 4n display-row registration and final rows receive geometry-only endpoints', async () => {
  const { extendMannequinLegCalibration } = await helper
  const sensors = calibration()
  const before = structuredClone(sensors)
  const result = extendMannequinLegCalibration(sensors)
  assert.equal(result.length, 264)
  assert.ok(result.every(sensor => sensor.canvasId.endsWith('-leg')))
  for (const original of sensors.slice(1)) {
    const projected = result.find(sensor => sensor.index === original.index)
    assert.equal(projected.matrixU, (original.row - 1) / 3)
    assert.equal(projected.matrixV * 127, (original.col - 1) * 4)
    assert.deepEqual([projected.x, projected.y, projected.z], [original.x, original.y, original.z])
  }
  const endpoints = result.filter(sensor => sensor.calibrationOnly)
  assert.equal(endpoints.length, 8)
  for (const point of endpoints) {
    assert.equal(point.col, 32.75)
    assert.equal(point.matrixV, 1)
    assert.ok(Math.abs(point.position.y - 0.725) < 1e-12)
    assert.equal(Object.hasOwn(point, 'sourceIndex'), false)
    assert.equal(Object.hasOwn(point, 'displayIndex'), false)
  }
  assert.equal(new Set(result.map(sensor => sensor.index)).size, result.length)
  assert.deepEqual(sensors, before)
})

test('optional model projection puts endpoints on the posterior surface and preserves aligned input positions', async () => {
  const [{ extendMannequinLegCalibration }, THREE] = await Promise.all([
    helper, load('../client/node_modules/three/build/three.module.js'),
  ])
  const model = new THREE.Group()
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 8), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }))
  mesh.position.set(0, 4, -0.75)
  model.add(mesh)
  const sensors = calibration().map(sensor => ({ ...sensor, position: { x: sensor.x, y: sensor.y, z: sensor.z } }))
  const before = structuredClone(sensors)
  const result = extendMannequinLegCalibration(sensors, model)
  for (const point of result.filter(sensor => sensor.calibrationOnly)) assert.ok(Math.abs(point.position.z + 0.75) < 1e-7)
  for (const point of result.filter(sensor => !sensor.calibrationOnly)) {
    assert.notEqual(point.position, sensors.find(sensor => sensor.index === point.index).position)
  }
  assert.deepEqual(sensors, before)
  mesh.geometry.dispose()
  mesh.material.dispose()
})
