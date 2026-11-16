const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const { pathToFileURL } = require('node:url')

const load = file => import(pathToFileURL(path.resolve(__dirname, file)).href)
const helpers = Promise.all([
  load('../client/src/util/mannequinLegSurfaceCoordinates.js'),
  load('../client/src/util/mannequinLegProjection.js'),
  load('../client/src/util/mannequinSensorLayout.js'),
])
const archive = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../client/public/model/mannequin_sensor_layout_637.json'), 'utf8'))
const near = (actual, expected, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} should equal ${expected}`)

async function fixtures() {
  const [surface, leg, layout] = await helpers
  const extended = leg.extendMannequinLegCalibration(layout.buildMannequinSensorLayout(archive))
  return { ...surface, extended }
}

test('all archived leg anchors and geometry-only endpoints retain exact matrix directions and registration', async () => {
  const f = await fixtures()
  const before = structuredClone(f.extended)
  for (const canvasId of ['left-leg', 'right-leg']) {
    const points = f.extended.filter(point => point.canvasId === canvasId)
    const profile = f.createMannequinLegSurfaceCoordinates(points)
    assert.deepEqual([profile.width, profile.height], [4, 128])
    for (const point of points) {
      const projected = f.projectMannequinLegCoordinate(profile, point.position || point)
      near(projected.u, point.matrixU)
      near(projected.v, point.matrixV)
      near(projected.posteriorZ, (point.position || point).z)
    }
    assert.equal(points.filter(point => point.calibrationOnly).length, 4)
  }
  assert.deepEqual(f.extended, before)
})

test('fragment coordinates depend only on world position rather than triangle subdivision or interpolated vertex distance', async () => {
  const f = await fixtures()
  const profile = f.createMannequinLegSurfaceCoordinates(f.extended.filter(point => point.canvasId === 'right-leg'))
  const v = 0.37, u = 0.82
  const y = profile.topY + (profile.bottomY - profile.topY) * v
  const firstX = profile.topX[0] + (profile.bottomX[0] - profile.topX[0]) * v
  const lastX = profile.topX[1] + (profile.bottomX[1] - profile.topX[1]) * v
  const point = { x: firstX + (lastX - firstX) * u, y, z: -0.5 }
  const expected = f.projectMannequinLegCoordinate(profile, point)
  // Different vertex coordinates, all reconstructing the same fragment world coordinate.
  for (const vertices of [
    [{ x: point.x - 1, y: y - 1 }, { x: point.x + 1, y: y - 1 }, { x: point.x, y: y + 1 }],
    [{ x: point.x - 0.1, y: y - 0.1 }, { x: point.x + 0.1, y: y - 0.1 }, { x: point.x, y: y + 0.1 }],
  ]) {
    const fragment = { x: vertices[0].x * 0.25 + vertices[1].x * 0.25 + vertices[2].x * 0.5,
      y: vertices[0].y * 0.25 + vertices[1].y * 0.25 + vertices[2].y * 0.5 }
    const actual = f.projectMannequinLegCoordinate(profile, fragment)
    near(actual.u, expected.u)
    near(actual.v, expected.v)
    near(actual.posteriorZ, expected.posteriorZ)
  }
  near(expected.u, u)
  near(expected.v, v)
})

test('UV remains outside the data rectangle so the Gaussian zero border can fade instead of repeating edge pixels', async () => {
  const f = await fixtures()
  for (const canvasId of ['left-leg', 'right-leg']) {
    const profile = f.createMannequinLegSurfaceCoordinates(f.extended.filter(point => point.canvasId === canvasId))
    const y = (profile.topY + profile.bottomY) / 2
    const firstX = (profile.topX[0] + profile.bottomX[0]) / 2
    const lastX = (profile.topX[1] + profile.bottomX[1]) / 2
    assert.ok(f.projectMannequinLegCoordinate(profile, { x: firstX - 0.2 * (lastX - firstX), y }).u < 0)
    assert.ok(f.projectMannequinLegCoordinate(profile, { x: lastX + 0.2 * (lastX - firstX), y }).u > 1)
    assert.ok(f.projectMannequinLegCoordinate(profile, { x: firstX, y: profile.topY + 0.1 }).v < 0)
    assert.ok(f.projectMannequinLegCoordinate(profile, { x: lastX, y: profile.bottomY - 0.1 }).v > 1)
  }
})

test('left and right profiles preserve their existing source direction without a second horizontal reversal', async () => {
  const f = await fixtures()
  const left = f.createMannequinLegSurfaceCoordinates(f.extended.filter(point => point.canvasId === 'left-leg'))
  const right = f.createMannequinLegSurfaceCoordinates(f.extended.filter(point => point.canvasId === 'right-leg'))
  assert.ok(left.topX[0] > left.topX[1])
  assert.ok(right.topX[0] > right.topX[1])
  assert.ok(left.topX.every(x => x < 0))
  assert.ok(right.topX.every(x => x > 0))
  near(f.projectMannequinLegCoordinate(left, { x: left.topX[0], y: left.topY }).u, 0)
  near(f.projectMannequinLegCoordinate(right, { x: right.topX[1], y: right.topY }).u, 1)
})

test('non-leg inputs are ignored while ambiguous, missing, duplicate or non-affine leg grids fail clearly', async () => {
  const f = await fixtures()
  assert.equal(f.createMannequinLegSurfaceCoordinates(null), null)
  assert.equal(f.createMannequinLegSurfaceCoordinates(archive.sensors.filter(point => point.canvasId === 'head')), null)
  assert.throws(() => f.createMannequinLegSurfaceCoordinates(f.extended), /同一条腿/)
  const points = f.extended.filter(point => point.canvasId === 'right-leg')
  assert.throws(() => f.createMannequinLegSurfaceCoordinates(points.filter(point => point.row !== 4)), /完整/)
  assert.throws(() => f.createMannequinLegSurfaceCoordinates([...points, { ...points[0] }]), /完整|重复/)
  const wrong = structuredClone(points)
  wrong.find(point => point.row === 2 && point.col === 10).x += 0.1
  assert.throws(() => f.createMannequinLegSurfaceCoordinates(wrong), /仿射配准/)
  assert.throws(() => f.projectMannequinLegCoordinate(null, { x: 0, y: 0 }), /标定纹理/)
})
