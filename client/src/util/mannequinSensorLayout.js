const CANVAS_SOURCES = {
  head: { key: 'jacket', rows: 9, cols: 5, sourceRows: 27, sourceCols: 12 },
  back: { key: 'jacket', rows: 12, cols: 22, sourceRows: 27, sourceCols: 12 },
  'left-arm': { key: 'leftHand', rows: 18, cols: 2, sourceRows: 2, sourceCols: 18 },
  'right-arm': { key: 'rightHand', rows: 18, cols: 2, sourceRows: 2, sourceCols: 18 },
  // 点表左右腿名称与当前采集部位相反，仅在 3D 取样时交换数据绑定。
  'left-leg': { key: 'rightFoot', rows: 4, cols: 32, sourceRows: 32, sourceCols: 6 },
  'right-leg': { key: 'leftFoot', rows: 4, cols: 32, sourceRows: 32, sourceCols: 6 },
}

/** 将点位行列转为现有物理矩阵索引，不改变传感器线序。 */
function getPhysicalCell(point, definition) {
  const row = point.col - 1
  const col = point.row - 1
  // 臂点表从肩到腕、横向两列的方向都与当前 2D 数字相反；
  // 仅翻转取样的物理格，模型点位及 2× 显示矩阵的原始格锚点不变。
  if (point.canvasId === 'left-arm' || point.canvasId === 'right-arm') {
    return { row: definition.sourceRows - 1 - row, col: definition.sourceCols - 1 - col }
  }
  if (point.canvasId === 'head') return { row, col: col + 3 }
  if (point.canvasId === 'back') return { row: row + 5, col }
  // 腿内外侧按四个有效物理列反向；右腿源前两列的偏移仍跟随数据源。
  if (definition.key === 'leftFoot' || definition.key === 'rightFoot') {
    return { row, col: definition.rows - 1 - col + (definition.key === 'rightFoot' ? 2 : 0) }
  }
  return { row, col }
}

/** 校验归一化模型点位，并预计算物理矩阵与 2x 显示矩阵的一对一取样位置。 */
export function buildMannequinSensorLayout(archive) {
  if (archive?.kind !== 'mannequin-sensor-layout' || archive.coordinateSpace !== 'normalized-world') {
    throw new Error('人体点位必须使用 mannequin-sensor-layout 的 normalized-world 坐标')
  }
  const points = archive.sensors
  if (!Array.isArray(points) || !points.length || archive.sensorCount !== points.length) {
    throw new Error('人体点位数量与 sensorCount 不一致')
  }
  const indices = new Set()
  const cells = new Set()
  return points.map((point) => {
    const definition = CANVAS_SOURCES[point.canvasId]
    if (!definition || !Number.isInteger(point.row) || !Number.isInteger(point.col)
      || point.row < 1 || point.row > definition.rows || point.col < 1 || point.col > definition.cols) {
      throw new Error(`人体点位区域或行列无效：${point.canvasId} (${point.row}, ${point.col})`)
    }
    if (![point.x, point.y, point.z].every(Number.isFinite)) {
      throw new Error(`人体点位坐标无效：${point.index}`)
    }
    const cellKey = `${point.canvasId}:${point.row}:${point.col}`
    if (!Number.isInteger(point.index) || point.index < 0 || point.index >= points.length
      || indices.has(point.index) || cells.has(cellKey)) {
      throw new Error(`人体点位索引或行列重复：${point.index}`)
    }
    indices.add(point.index)
    cells.add(cellKey)
    const physical = getPhysicalCell(point, definition)
    const displayWidth = definition.sourceCols * 2
    const displayRow = physical.row * 2
    const displayCol = physical.col * 2 - (point.canvasId === 'head' ? 3 : 0)
    const isLeg = definition.key === 'leftFoot' || definition.key === 'rightFoot'
    const sideOffset = definition.key === 'rightFoot' ? 12 : 0
    return {
      ...point,
      sourceKey: definition.key,
      sourceMatrixKey: `endi-${definition.key}`,
      sourceRows: definition.sourceRows,
      sourceCols: definition.sourceCols,
      physicalRow: physical.row,
      physicalCol: physical.col,
      sourceIndex: physical.row * definition.sourceCols + physical.col,
      displayWidth,
      displayRow,
      displayCol,
      displayIndex: displayRow * displayWidth + displayCol,
      ...(isLeg ? {
        combinedDisplayIndex: displayRow * 24 + sideOffset + displayCol,
        combinedSourceIndex: physical.row * 12 + sideOffset / 2 + physical.col,
      } : {}),
    }
  }).sort((left, right) => left.index - right.index)
}

/** 读取压力数据；显式 pressureArr 优先，纯数组已视为当前展示指标。 */
function metricValues(source) {
  if (Array.isArray(source) || ArrayBuffer.isView(source)) return source.length ? source : null
  if (!source || typeof source !== 'object') return null
  for (const field of ['pressureArr', 'arr', 'data', 'default']) {
    if (Array.isArray(source[field]) || ArrayBuffer.isView(source[field])) return source[field].length ? source[field] : null
  }
  return null
}

/** 仅接受已知尺寸，防止把缺帧、裁剪数据或其它部位误作物理矩阵。 */
function sampleMatrix(values, sensor, combined = false) {
  if (!values) return 0
  let index
  if (combined && values.length === 24 * 64) index = sensor.combinedDisplayIndex
  else if (combined && values.length === 12 * 32) index = sensor.combinedSourceIndex
  else if (!combined && values.length === sensor.sourceRows * sensor.sourceCols * 4) index = sensor.displayIndex
  else if (!combined && values.length === sensor.sourceRows * sensor.sourceCols) index = sensor.sourceIndex
  else return 0
  const value = Number(values[index])
  return Number.isFinite(value) && value > 0 ? value : 0
}

/** Read calibrated upper-body samples; the live legs use the complete processed 2D matrix instead. */
export function readMannequinSensorValues(sensors, frame) {
  const values = new Float32Array(sensors.length)
  if (!frame || typeof frame !== 'object') return values
  const sources = new Map()
  for (const sensor of sensors) {
    if (!sources.has(sensor.sourceKey)) {
      sources.set(sensor.sourceKey, metricValues(frame[sensor.sourceKey] ?? frame[sensor.sourceMatrixKey]))
    }
    let source = sources.get(sensor.sourceKey)
    let combined = false
    if (!source && sensor.combinedDisplayIndex !== undefined) {
      const foot = frame.foot ?? frame['endi-foot']
      const pressureSource = foot?.sourcePressureMatrices?.[sensor.sourceMatrixKey]
      source = metricValues(pressureSource)
      if (!source) {
        source = metricValues(foot)
        combined = true
      }
    }
    values[sensor.index] = sampleMatrix(source, sensor, combined)
  }
  return values
}
