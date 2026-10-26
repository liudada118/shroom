const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const { pathToFileURL } = require('node:url')

const archive = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../client/public/model/mannequin_sensor_layout_637.json'), 'utf8'))
const helper = import(pathToFileURL(path.resolve(__dirname, '../client/src/util/mannequinSensorLayout.js')).href)
const dimensions = { jacket: [27, 12], leftHand: [2, 18], rightHand: [2, 18], leftFoot: [32, 6], rightFoot: [32, 6] }

function point(sensors, canvasId, row, col) {
  return sensors.find(sensor => sensor.canvasId === canvasId && sensor.row === row && sensor.col === col)
}

function codedPhysical(key) {
  const [rows, cols] = dimensions[key]
  const partOffset = Object.keys(dimensions).indexOf(key) * 1000
  return Array.from({ length: rows * cols }, (_, index) => partOffset + index + 1)
}

function canonicalFrame() {
  return Object.fromEntries(Object.entries(dimensions).map(([key, [rows, cols]]) => {
    const raw = codedPhysical(key)
    const values = new Array(rows * cols * 4).fill(99999)
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        if (key === 'jacket' && row < 5 && col < 3) continue
        const displayCol = col * 2 - (key === 'jacket' && row < 5 ? 3 : 0)
        values[row * 2 * cols * 2 + displayCol] = raw[row * cols + col]
      }
    }
    return [key, values]
  }))
}

test('the supplied layout retains all 637 model positions and has distinct physical cells', async () => {
  const { buildMannequinSensorLayout } = await helper
  const sensors = buildMannequinSensorLayout(archive)
  assert.equal(sensors.length, 637)
  const counts = {}
  for (const sensor of sensors) {
    counts[sensor.canvasId] = (counts[sensor.canvasId] || 0) + 1
    assert.deepEqual([sensor.x, sensor.y, sensor.z], [archive.sensors[sensor.index].x, archive.sensors[sensor.index].y, archive.sensors[sensor.index].z])
  }
  assert.deepEqual(counts, { head: 45, back: 264, 'left-arm': 36, 'right-arm': 36, 'left-leg': 128, 'right-leg': 128 })
  assert.equal(new Set(sensors.map(sensor => `${sensor.sourceKey}:${sensor.sourceIndex}`)).size, 637)
})

test('each region maps its four corners to the transposed physical matrix with jacket head centering', async () => {
  const { buildMannequinSensorLayout } = await helper
  const sensors = buildMannequinSensorLayout(archive)
  const corners = [
    ['head', 1, 1, 'jacket', 0, 3], ['head', 1, 5, 'jacket', 4, 3],
    ['head', 9, 1, 'jacket', 0, 11], ['head', 9, 5, 'jacket', 4, 11],
    ['back', 1, 1, 'jacket', 5, 0], ['back', 1, 22, 'jacket', 26, 0],
    ['back', 12, 1, 'jacket', 5, 11], ['back', 12, 22, 'jacket', 26, 11],
    ['left-arm', 1, 1, 'leftHand', 0, 0], ['left-arm', 18, 2, 'leftHand', 1, 17],
    ['right-arm', 1, 1, 'rightHand', 0, 0], ['right-arm', 18, 2, 'rightHand', 1, 17],
    ['left-leg', 1, 1, 'leftFoot', 0, 0], ['left-leg', 4, 32, 'leftFoot', 31, 3],
    ['right-leg', 1, 1, 'rightFoot', 0, 2], ['right-leg', 4, 32, 'rightFoot', 31, 5],
  ]
  for (const [canvasId, row, col, sourceKey, physicalRow, physicalCol] of corners) {
    const sensor = point(sensors, canvasId, row, col)
    assert.equal(sensor.sourceKey, sourceKey)
    assert.equal(sensor.physicalRow, physicalRow)
    assert.equal(sensor.physicalCol, physicalCol)
  }
  assert.equal(point(sensors, 'head', 1, 1).displayIndex, 3)
  assert.equal(point(sensors, 'head', 9, 5).displayIndex, 8 * 24 + 19)
  assert.equal(point(sensors, 'back', 1, 1).displayIndex, 10 * 24)
})

test('display pressure samples match all physical sensors without reading interpolated neighbours or mutating data', async () => {
  const { buildMannequinSensorLayout, readMannequinSensorValues } = await helper
  const sensors = buildMannequinSensorLayout(archive)
  const frame = canonicalFrame()
  const before = structuredClone(frame)
  const values = readMannequinSensorValues(sensors, frame)
  assert.ok(values instanceof Float32Array)
  for (const sensor of sensors) assert.equal(values[sensor.index], codedPhysical(sensor.sourceKey)[sensor.sourceIndex])
  assert.deepEqual(frame, before)
  const physical = Object.fromEntries(Object.keys(dimensions).map(key => [key, codedPhysical(key)]))
  assert.deepEqual(readMannequinSensorValues(sensors, physical), values)
})

test('combined legs, split source matrices and full backend objects agree with the current display matrix', async () => {
  const { buildMannequinSensorLayout, readMannequinSensorValues } = await helper
  const sensors = buildMannequinSensorLayout(archive)
  const frame = canonicalFrame()
  const expected = readMannequinSensorValues(sensors, frame)
  const combined = []
  for (let row = 0; row < 64; row++) combined.push(...frame.leftFoot.slice(row * 12, row * 12 + 12), ...frame.rightFoot.slice(row * 12, row * 12 + 12))
  const { leftFoot, rightFoot, ...upper } = frame
  assert.deepEqual(readMannequinSensorValues(sensors, { ...upper, foot: combined }), expected)
  const sourcePressureMatrices = { 'endi-leftFoot': leftFoot, 'endi-rightFoot': rightFoot }
  const backend = Object.fromEntries(Object.entries(upper).map(([key, pressureArr]) => [`endi-${key}`, { pressureArr, arr: pressureArr.map(() => 90000) }]))
  backend['endi-foot'] = { pressureArr: combined, sourcePressureMatrices }
  assert.deepEqual(readMannequinSensorValues(sensors, backend), expected)
  const sparseSides = { ...upper, leftFoot: [], rightFoot: [], foot: { pressureArr: combined } }
  assert.deepEqual(readMannequinSensorValues(sensors, sparseSides), expected)
})

test('unmapped extra thigh columns stay excluded and missing or invalid values stay isolated', async () => {
  const { buildMannequinSensorLayout, readMannequinSensorValues } = await helper
  const sensors = buildMannequinSensorLayout(archive)
  const frame = Object.fromEntries(Object.entries(dimensions).map(([key, [rows, cols]]) => [key, new Array(rows * cols * 4).fill(0)]))
  for (let row = 8; row <= 14; row++) {
    for (const col of [4, 5]) frame.leftFoot[row * 2 * 12 + col * 2] = 100
    for (const col of [0, 1]) frame.rightFoot[row * 2 * 12 + col * 2] = 100
  }
  assert.ok(readMannequinSensorValues(sensors, frame).every(value => value === 0))
  frame.leftHand[0] = 1.25
  frame.leftHand[2] = NaN
  frame.leftHand[4] = -2
  const values = readMannequinSensorValues(sensors, { leftHand: new Float32Array(frame.leftHand) })
  assert.equal(values[point(sensors, 'left-arm', 1, 1).index], 1.25)
  assert.equal(values.filter(value => value > 0).length, 1)
  assert.ok(readMannequinSensorValues(sensors, {}).every(value => value === 0))
})

test('invalid or ambiguous layout coordinates fail explicitly', async () => {
  const { buildMannequinSensorLayout } = await helper
  const wrong = structuredClone(archive)
  wrong.sensors[1].index = 0
  assert.throws(() => buildMannequinSensorLayout(wrong), /索引或行列重复/)
  const malformed = structuredClone(archive)
  malformed.sensors[0].x = Infinity
  assert.throws(() => buildMannequinSensorLayout(malformed), /坐标无效/)
  assert.throws(() => buildMannequinSensorLayout({ ...archive, sensorCount: 1 }), /数量/)
})
