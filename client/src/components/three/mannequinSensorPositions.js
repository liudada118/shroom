import * as THREE from 'three'

/** Keep head channels in the same top-to-bottom, left-to-right order as the 2D jacket matrix. */
export function alignMannequinHeadToDisplay(sensors, normalizedModel) {
  const head = sensors.filter(sensor => sensor.canvasId === 'head')
  if (!head.length) return sensors
  const minRow = Math.min(...head.map(sensor => sensor.row))
  const maxRow = Math.max(...head.map(sensor => sensor.row))
  const minCol = Math.min(...head.map(sensor => sensor.col))
  const maxCol = Math.max(...head.map(sensor => sensor.col))
  const corner = (row, col) => head.find(sensor => sensor.row === row && sensor.col === col)
  const corners = [corner(minRow, minCol), corner(minRow, maxCol), corner(maxRow, minCol), corner(maxRow, maxCol)]
  if (minRow === maxRow || minCol === maxCol || corners.some(point => !point)) {
    throw new Error('头部点位缺少有效的四角边界')
  }
  normalizedModel.updateMatrixWorld(true)
  const bounds = new THREE.Box3().setFromObject(normalizedModel)
  const ray = new THREE.Raycaster()
  const direction = new THREE.Vector3(0, 0, 1)
  const originZ = bounds.min.z - 1
  const [topLeft, topRight, bottomLeft, bottomRight] = corners
  return sensors.map(sensor => {
    if (sensor.canvasId !== 'head') return sensor
    // The archive's head row runs vertically, while the physical matrix's row is archive col.
    // Exchange only placement axes; each channel still reads its original physical/display cell.
    const u = (sensor.row - minRow) / (maxRow - minRow)
    const v = (sensor.col - minCol) / (maxCol - minCol)
    const interpolate = axis => (1 - v) * ((1 - u) * topLeft[axis] + u * topRight[axis])
      + v * ((1 - u) * bottomLeft[axis] + u * bottomRight[axis])
    const x = interpolate('x')
    const y = interpolate('y')
    ray.set(new THREE.Vector3(x, y, originZ), direction)
    const hit = ray.intersectObject(normalizedModel, true)[0]
    if (!hit) throw new Error(`头部点位无法贴合模型：${sensor.index}`)
    return { ...sensor, position: { x: hit.point.x, y: hit.point.y, z: hit.point.z } }
  })
}
