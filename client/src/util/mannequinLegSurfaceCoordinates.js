const LEG_IDS = new Set(['left-leg', 'right-leg'])
const HEIGHT = 128
const WIDTH = 4
const EPSILON = 1e-6
const mix = (a, b, t) => a + (b - a) * t
const clamp = value => Math.max(0, Math.min(1, value))

function pointOf(sensor) {
  const source = sensor.position || sensor
  const point = { x: Number(source.x), y: Number(source.y), z: Number(source.z), v: Number(sensor.matrixV) }
  if (!Object.values(point).every(Number.isFinite)) throw new Error('腿部表面坐标需要有效 XYZ 与 matrixV')
  return point
}

/**
 * A leg's archived rows have four equally spaced X controls at a common Y.
 * Their X/Y registration is affine; only posterior Z needs the sampled curves.
 * Keeping this profile independent of model vertices removes triangulation-shaped edges.
 */
export function createMannequinLegSurfaceCoordinates(sensors) {
  if (!Array.isArray(sensors) || !sensors.some(sensor => LEG_IDS.has(sensor?.canvasId))) return null
  const canvasId = sensors[0]?.canvasId
  if (!LEG_IDS.has(canvasId) || sensors.some(sensor => sensor?.canvasId !== canvasId)) {
    throw new Error('腿部表面坐标每次只接受同一条腿的标定点')
  }
  if (sensors.some(sensor => !Number.isInteger(sensor.row) || sensor.row < 1 || sensor.row > WIDTH)) {
    throw new Error('腿部表面坐标需要四条有效横向控制曲线')
  }
  const curves = Array.from({ length: WIDTH }, (_, index) => sensors.filter(sensor => sensor.row === index + 1)
    .map(pointOf).sort((a, b) => a.v - b.v))
  const count = curves[0].length
  if (count < 2 || curves.some(curve => curve.length !== count || Math.abs(curve[0].v) > EPSILON
    || Math.abs(curve.at(-1).v - 1) > EPSILON)) {
    throw new Error('腿部表面坐标需要完整的 0..1 纵向边界')
  }
  for (let index = 0; index < count; index++) {
    if (index && curves[0][index].v - curves[0][index - 1].v <= EPSILON) {
      throw new Error('腿部表面纵向坐标不可重复或倒置')
    }
    if (curves.some(curve => Math.abs(curve[index].v - curves[0][index].v) > EPSILON)) {
      throw new Error('腿部表面四条控制曲线必须共用纵向坐标')
    }
  }
  const topY = curves[0][0].y
  const bottomY = curves[0].at(-1).y
  const topX = [curves[0][0].x, curves[3][0].x]
  const bottomX = [curves[0].at(-1).x, curves[3].at(-1).x]
  if (topY - bottomY <= EPSILON || Math.abs(topX[1] - topX[0]) <= EPSILON
    || Math.abs(bottomX[1] - bottomX[0]) <= EPSILON
    || Math.sign(topX[1] - topX[0]) !== Math.sign(bottomX[1] - bottomX[0])) {
    throw new Error('腿部表面需要非退化且方向一致的横纵边界')
  }
  for (let curveIndex = 0; curveIndex < WIDTH; curveIndex++) {
    for (const point of curves[curveIndex]) {
      const expectedX = mix(mix(topX[0], bottomX[0], point.v), mix(topX[1], bottomX[1], point.v), curveIndex / 3)
      if (Math.abs(point.y - mix(topY, bottomY, point.v)) > 1e-5 || Math.abs(point.x - expectedX) > 1e-5) {
        throw new Error('腿部表面 XY 控制网格必须保持仿射配准')
      }
    }
  }
  const data = new Float32Array(WIDTH * HEIGHT * 4)
  for (let row = 0; row < HEIGHT; row++) {
    const v = row / (HEIGHT - 1)
    let lower = 0
    while (lower < count - 2 && curves[0][lower + 1].v < v) lower++
    const a = curves[0][lower].v
    const amount = (v - a) / (curves[0][lower + 1].v - a)
    for (let col = 0; col < WIDTH; col++) {
      const before = curves[col][lower]
      const after = curves[col][lower + 1]
      const offset = (row * WIDTH + col) * 4
      data[offset] = mix(before.x, after.x, amount)
      data[offset + 1] = mix(before.y, after.y, amount)
      data[offset + 2] = mix(before.z, after.z, amount)
      data[offset + 3] = v
    }
  }
  return { canvasId, topY, bottomY, topX, bottomX, data, width: WIDTH, height: HEIGHT }
}

/** CPU reference for the fragment mapping. UV stays unbounded to sample zero padding. */
export function projectMannequinLegCoordinate(profile, worldPoint) {
  if (!profile || profile.width !== WIDTH || profile.height !== HEIGHT || profile.data?.length !== WIDTH * HEIGHT * 4) {
    throw new Error('腿部表面坐标需要有效标定纹理')
  }
  const x = Number(worldPoint?.x)
  const y = Number(worldPoint?.y)
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('腿部表面投影需要有效世界坐标')
  const v = (profile.topY - y) / (profile.topY - profile.bottomY)
  const firstX = mix(profile.topX[0], profile.bottomX[0], v)
  const lastX = mix(profile.topX[1], profile.bottomX[1], v)
  const u = (x - firstX) / (lastX - firstX)
  const gridX = clamp(u) * (WIDTH - 1)
  const gridY = clamp(v) * (HEIGHT - 1)
  const x0 = Math.floor(gridX), x1 = Math.min(WIDTH - 1, x0 + 1)
  const y0 = Math.floor(gridY), y1 = Math.min(HEIGHT - 1, y0 + 1)
  const z = (col, row) => profile.data[(row * WIDTH + col) * 4 + 2]
  const posteriorZ = mix(mix(z(x0, y0), z(x1, y0), gridX - x0),
    mix(z(x0, y1), z(x1, y1), gridX - x0), gridY - y0)
  return { u, v, posteriorZ }
}
