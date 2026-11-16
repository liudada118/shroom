import * as THREE from 'three'
import { getFootRowLayout, FOOT_SINGLE_DISPLAY_WIDTH, FOOT_DISPLAY_HEIGHT } from './footDisplayLayout.js'

const LEG_IDS = new Set(['left-leg', 'right-leg'])

/** The 2D canvas pads each leg at the inside edge; padding has no sensor location. */
export function getMannequinLegRowLayouts(canvasId) {
  if (!LEG_IDS.has(canvasId)) throw new TypeError('腿部矩阵投影需要有效的腿部区域')
  return Array.from({ length: FOOT_DISPLAY_HEIGHT }, (_, displayRow) => {
    const { span } = getFootRowLayout(Math.floor(displayRow / 2))
    return { start: canvasId === 'left-leg' ? FOOT_SINGLE_DISPLAY_WIDTH - span : 0, span }
  })
}

/**
 * Register each complete 2D data row against the full calibrated leg width.
 * C1 convex interpolation smooths between samples without overshooting or flipping them again.
 */
export function warpMannequinLegDisplayMatrix(values, width, height, canvasId) {
  if (width !== FOOT_SINGLE_DISPLAY_WIDTH || height !== FOOT_DISPLAY_HEIGHT
    || values?.length !== width * height) {
    throw new RangeError('腿部矩阵投影需要完整的 24×128 显示矩阵')
  }
  const layouts = getMannequinLegRowLayouts(canvasId)
  const result = new Float32Array(width * height)
  const read = index => {
    const numeric = Number(values[index])
    return Number.isFinite(numeric) && numeric > 0 ? numeric : 0
  }
  for (let row = 0; row < height; row++) {
    const { start, span } = layouts[row]
    const offset = row * width
    for (let col = 0; col < width; col++) {
      const location = col * (span - 1) / (width - 1)
      const lower = Math.floor(location)
      const fraction = location - lower
      const mix = fraction * fraction * (3 - 2 * fraction)
      const a = read(offset + start + lower)
      const b = read(offset + start + Math.min(span - 1, lower + 1))
      result[offset + col] = a + (b - a) * mix
    }
  }
  return result
}

/**
 * Leg archive columns mark display rows 0,4,...,124, rather than the full 0..127 range.
 * Add a geometry-only endpoint to cover the final interpolated display rows accurately.
 */
export function extendMannequinLegCalibration(sensors, model) {
  const legs = (Array.isArray(sensors) ? sensors : []).filter(sensor => LEG_IDS.has(sensor.canvasId))
  if (!legs.length) return []
  const result = legs.map(sensor => ({
    ...sensor,
    ...(sensor.position ? { position: { ...sensor.position } } : {}),
    matrixU: (sensor.row - 1) / 3,
    matrixV: (sensor.col - 1) * 4 / (FOOT_DISPLAY_HEIGHT - 1),
  }))
  let nextIndex = Math.max(-1, ...sensors.map(sensor => Number.isInteger(sensor.index) ? sensor.index : -1)) + 1
  let ray
  let originZ
  if (model?.isObject3D) {
    model.updateMatrixWorld(true)
    originZ = new THREE.Box3().setFromObject(model).min.z - 1
    ray = new THREE.Raycaster()
  }
  for (const canvasId of LEG_IDS) {
    if (!legs.some(sensor => sensor.canvasId === canvasId)) continue
    for (let row = 1; row <= 4; row++) {
      const last = legs.find(sensor => sensor.canvasId === canvasId && sensor.row === row && sensor.col === 32)
      const previous = legs.find(sensor => sensor.canvasId === canvasId && sensor.row === row && sensor.col === 31)
      if (!last || !previous) throw new Error('腿部标定网格缺少末尾连续点位')
      const lastPosition = last.position || last
      const previousPosition = previous.position || previous
      let position = Object.fromEntries(['x', 'y', 'z'].map(axis => [axis,
        Number(lastPosition[axis]) + 0.75 * (Number(lastPosition[axis]) - Number(previousPosition[axis])),
      ]))
      if (!Object.values(position).every(Number.isFinite)) throw new Error('腿部标定点位缺少有效三维坐标')
      if (ray) {
        ray.set(new THREE.Vector3(position.x, position.y, originZ), new THREE.Vector3(0, 0, 1))
        const hit = ray.intersectObject(model, true)[0]
        if (hit) position = { x: hit.point.x, y: hit.point.y, z: hit.point.z }
      }
      const ghost = {
        ...last,
        ...position,
        position,
        index: nextIndex++,
        col: 32.75,
        matrixU: (row - 1) / 3,
        matrixV: 1,
        calibrationOnly: true,
        calibrationFromIndex: last.index,
      }
      // This endpoint carries no measured channel and must never be used to read source data.
      for (const key of ['sourceIndex', 'displayIndex', 'combinedSourceIndex', 'combinedDisplayIndex']) delete ghost[key]
      result.push(ghost)
    }
  }
  return result
}
