/**
 * footDisplayLayout.js — 下身热图「一个格子拆成多格」的显示布局（浏览器侧）
 *
 * Node 侧镜像文件：util/footDisplayLayout.js
 * 两边逻辑必须保持一致，修改时请同步。
 *
 * 【背景】
 *   每条腿物理上是 6×32 通道矩阵，但窄段每行只接 4 个通道、宽段才接满 6 个，
 *   双线性 2× 插值成 12×64 之后，窄段内侧 4 列是空的 —— 合并成 24×64 后
 *   上面 16 行中间就有一条空带。
 *
 * 【这里做什么】
 *   完全以「原来屏幕上显示的样子」为基准，把每个格子原样复制成多格，
 *   不重新插值、也不丢掉原来插值出来的列。
 *
 *   纵向：所有段一律一行变两行（下面那行复制上面那行），64 → 128。
 *   横向：分三段，每段的倍数不一样（规范行号）：
 *     0–15 （上段）：原来有值的 8 列，每列变 3 列 → 24 列铺满，中间空带消失
 *     16–29（中段）：原来有值的 12 列，每列变 2 列 → 24 列铺满
 *     30–63（下段）：原来有值的 8 列，每列变 2 列 → 16 列，贴外侧（左腿贴左、右腿贴右），
 *                    中间空 8 列；两腿合起来有值的那块 16×34 → 32×68
 *
 *   于是一个源点占的格子数：上段 3×2=6，中段 2×2=4，下段 2×2=4。
 *   下身显示尺寸 = 规范尺寸 × 2：合并 24×64 → 48×128，单腿 12×64 → 24×128，
 *   长宽比和原来一样。
 *
 * 【只改显示，不改数值】
 *   规范数组（入库、统计、导出用的那一份）一个字节都不动，
 *   受力面积 / 压强 / 对称系数 / 梯度全部保持原口径。
 *   框选因此有两套坐标：屏幕上画的框、存进记录的框是显示坐标（48×128），
 *   取数和算指标之前先用 footVisualRectToCanonicalRect 换回规范坐标（24×64）。
 *   老记录里存的框是 24×64（那时显示=规范），按尺寸区分，原样放行不做换算。
 */

export const ENDI_FOOT_COMBINED_WIDTH = 24
export const ENDI_FOOT_SINGLE_WIDTH = 12
export const ENDI_FOOT_HEIGHT = 64

// 显示尺寸 = 规范尺寸 × 2（横向 12→24 / 24→48，纵向 64→128）
export const FOOT_DISPLAY_SCALE_X = 2
export const FOOT_DISPLAY_SCALE_Y = 2
export const FOOT_SINGLE_DISPLAY_WIDTH = ENDI_FOOT_SINGLE_WIDTH * FOOT_DISPLAY_SCALE_X
export const FOOT_DISPLAY_HEIGHT = ENDI_FOOT_HEIGHT * FOOT_DISPLAY_SCALE_Y

/**
 * 三段横向布局，end 是规范行的结束行（右开区间）
 *   factor     —— 这一段每个源格子横向占几个显示格子
 *   sourceCols —— 这一段每条腿原来有值的源列数
 * factor × sourceCols 就是这一段在一条腿里铺开的宽度：
 *   上段 8×3=24 铺满、中段 12×2=24 铺满、下段 8×2=16 只占外侧 16 格，中间 8 格是空的
 */
const FOOT_BANDS = [
  { end: 16, factor: 3, sourceCols: 8 },
  { end: 30, factor: 2, sourceCols: 12 },
  { end: ENDI_FOOT_HEIGHT, factor: 2, sourceCols: 8 },
]

const COMBINED_KEYS = ['endi-foot', 'foot']
const LEFT_KEYS = ['endi-leftFoot', 'leftFoot']
const RIGHT_KEYS = ['endi-rightFoot', 'rightFoot']

/** 'combined'（24 列合并）/ 'left' / 'right'（单腿 12 列）/ null（不是下身） */
export function getFootLayoutKind(key) {
  const text = String(key || '')
  if (COMBINED_KEYS.includes(text)) return 'combined'
  if (LEFT_KEYS.includes(text)) return 'left'
  if (RIGHT_KEYS.includes(text)) return 'right'
  return null
}

export function isEndiFootKey(key) {
  return getFootLayoutKind(key) !== null
}

/** 参数既收 getFootLayoutKind 的结果，也收部位 key，省得两边传混 */
function normalizeFootKind(kindOrKey) {
  if (kindOrKey === 'combined' || kindOrKey === 'left' || kindOrKey === 'right') return kindOrKey
  return getFootLayoutKind(kindOrKey)
}

/** 该部位规范数组的宽度 */
export function getFootCanonicalWidth(kind) {
  return kind === 'combined' ? ENDI_FOOT_COMBINED_WIDTH : ENDI_FOOT_SINGLE_WIDTH
}

/**
 * 该部位画到屏幕上的宽度：下身 = 规范宽度 × 2，其它部位原样
 * @param {string} key 部位 key
 * @param {number} canonicalWidth 规范宽度（不传就按 key 推断）
 */
export function getFootDisplayWidth(key, canonicalWidth) {
  const kind = getFootLayoutKind(key)
  const base = Number(canonicalWidth) || (kind ? getFootCanonicalWidth(kind) : 0)
  if (!kind) return base
  return base * FOOT_DISPLAY_SCALE_X
}

/**
 * 该部位画到屏幕上的高度：下身 = 规范高度 × 2（每行复制一份），其它部位原样
 * @param {string} key 部位 key
 * @param {number} canonicalHeight 规范高度（不传就按 key 推断）
 */
export function getFootDisplayHeight(key, canonicalHeight) {
  const kind = getFootLayoutKind(key)
  const base = Number(canonicalHeight) || (kind ? ENDI_FOOT_HEIGHT : 0)
  if (!kind) return base
  return base * FOOT_DISPLAY_SCALE_Y
}

/** 显示行 → 规范行（一行拆成两行，取上面那行的值） */
export function visualRowToCanonicalRow(row) {
  return Math.floor(row / FOOT_DISPLAY_SCALE_Y)
}

/** 规范行 → 它占的第一个显示行 */
export function canonicalRowToVisualRow(row) {
  return row * FOOT_DISPLAY_SCALE_Y
}

/** 这一规范行属于哪一段 */
export function getFootBand(canonicalRow) {
  for (const band of FOOT_BANDS) {
    if (canonicalRow < band.end) return band
  }
  return FOOT_BANDS[FOOT_BANDS.length - 1]
}

/**
 * 一条腿在这一段里的摆放：有值的那一块占哪几个显示格子、对应哪几个规范列
 * 左腿贴左（外侧在左），右腿贴右（外侧在右）—— 空的永远在中间
 */
function getLegBandGeometry(band, legKind) {
  const span = band.factor * band.sourceCols
  return {
    span,
    blockStart: legKind === 'right' ? FOOT_SINGLE_DISPLAY_WIDTH - span : 0,
    sourceStart: legKind === 'right' ? ENDI_FOOT_SINGLE_WIDTH - band.sourceCols : 0,
  }
}

/**
 * 单条腿本地坐标：显示列 → 规范列，落在空白处返回 -1
 * @param {object} band getFootBand 的返回值
 * @param {number} col 显示列（0–23）
 * @param {string} legKind 'left' / 'right'
 */
function visualColToCanonicalColInLeg(band, col, legKind) {
  const { span, blockStart, sourceStart } = getLegBandGeometry(band, legKind)
  if (col < blockStart || col >= blockStart + span) return -1
  return sourceStart + Math.floor((col - blockStart) / band.factor)
}

/**
 * 合并/单腿坐标：显示列 → 规范列，落在空白处返回 -1
 * @param {number} visualRow 显示行（0–127）
 * @param {number} col 显示列（合并 0–47 / 单腿 0–23）
 * @param {string} kindOrKey getFootLayoutKind 的结果或部位 key
 */
export function visualColToCanonicalCol(visualRow, col, kindOrKey) {
  const kind = normalizeFootKind(kindOrKey)
  if (!kind) return -1
  const band = getFootBand(visualRowToCanonicalRow(visualRow))
  if (kind !== 'combined') return visualColToCanonicalColInLeg(band, col, kind)
  if (col < FOOT_SINGLE_DISPLAY_WIDTH) {
    return visualColToCanonicalColInLeg(band, col, 'left')
  }
  const local = visualColToCanonicalColInLeg(band, col - FOOT_SINGLE_DISPLAY_WIDTH, 'right')
  return local < 0 ? -1 : ENDI_FOOT_SINGLE_WIDTH + local
}

/**
 * 反查：规范列 → 它占的第一个显示列，这一段没有这一列就返回 -1
 * 给「按规范坐标裁一块出来画」的地方用（比如 3D 人体图谱只取每条腿外侧 8 列）
 * @param {number} canonicalRow 规范行（0–63）
 * @param {number} canonicalCol 规范列（合并 0–23 / 单腿 0–11）
 * @param {string} kindOrKey getFootLayoutKind 的结果或部位 key
 */
export function canonicalColToVisualCol(canonicalRow, canonicalCol, kindOrKey) {
  const kind = normalizeFootKind(kindOrKey)
  if (!kind) return -1
  const band = getFootBand(canonicalRow)
  const isRight = kind === 'combined'
    ? canonicalCol >= ENDI_FOOT_SINGLE_WIDTH
    : kind === 'right'
  const local = kind === 'combined' && isRight ? canonicalCol - ENDI_FOOT_SINGLE_WIDTH : canonicalCol
  const { span, blockStart, sourceStart } = getLegBandGeometry(band, isRight ? 'right' : 'left')
  if (local < sourceStart || local >= sourceStart + span / band.factor) return -1
  const visual = blockStart + (local - sourceStart) * band.factor
  return kind === 'combined' && isRight ? visual + FOOT_SINGLE_DISPLAY_WIDTH : visual
}

/** 这个显示格子是不是空的（下段中间那一块）——渲染时按它决定画不画 */
export function isFootVisualNullCell(visualRow, col, key) {
  const kind = getFootLayoutKind(key)
  if (!kind) return false
  return visualColToCanonicalCol(visualRow, col, kind) < 0
}

/**
 * 规范数组 → 显示用数组（纯函数，不改入参），长度变成原来的 4 倍
 * 不是下身、或者长度不对（老数据 / 其它部位）就原样返回
 */
export function expandFootVisualArr(arr, key) {
  const kind = getFootLayoutKind(key)
  if (!kind || !Array.isArray(arr)) return arr
  const width = getFootCanonicalWidth(kind)
  if (arr.length !== width * ENDI_FOOT_HEIGHT) return arr

  const displayWidth = width * FOOT_DISPLAY_SCALE_X
  const result = new Array(displayWidth * FOOT_DISPLAY_HEIGHT)
  for (let row = 0; row < FOOT_DISPLAY_HEIGHT; row++) {
    const sourceOffset = visualRowToCanonicalRow(row) * width
    const targetOffset = row * displayWidth
    for (let col = 0; col < displayWidth; col++) {
      const canonicalCol = visualColToCanonicalCol(row, col, kind)
      result[targetOffset + col] = canonicalCol < 0 ? 0 : arr[sourceOffset + canonicalCol]
    }
  }
  return result
}

/**
 * 一段之内、一条腿之内：显示列区间 [a, b) → 规范列区间 [start, end)
 * 整段都落在空白处返回 null
 */
function mapLegRange(band, a, b, legKind) {
  const { span, blockStart } = getLegBandGeometry(band, legKind)
  const from = Math.max(a, blockStart)
  const to = Math.min(b, blockStart + span)
  if (to <= from) return null
  return [
    visualColToCanonicalColInLeg(band, from, legKind),
    visualColToCanonicalColInLeg(band, to - 1, legKind) + 1,
  ]
}

/** 框在合并坐标下横跨两条腿时，按腿拆成若干段 */
function getLegSegments(kind, xStart, xEnd) {
  if (kind !== 'combined') {
    return [{ a: xStart, b: xEnd, legKind: kind, base: 0 }]
  }
  const segments = []
  const leftEnd = Math.min(FOOT_SINGLE_DISPLAY_WIDTH, xEnd)
  if (xStart < leftEnd) {
    segments.push({ a: xStart, b: leftEnd, legKind: 'left', base: 0 })
  }
  const rightStart = Math.max(FOOT_SINGLE_DISPLAY_WIDTH, xStart)
  if (rightStart < xEnd) {
    segments.push({
      a: rightStart - FOOT_SINGLE_DISPLAY_WIDTH,
      b: xEnd - FOOT_SINGLE_DISPLAY_WIDTH,
      legKind: 'right',
      base: ENDI_FOOT_SINGLE_WIDTH,
    })
  }
  return segments
}

/** 框覆盖到的所有段（入参是规范行区间） */
function getTouchedBands(yStart, yEnd) {
  let start = 0
  const touched = []
  for (const band of FOOT_BANDS) {
    if (yStart < band.end && yEnd > start) touched.push(band)
    start = band.end
  }
  return touched
}

/**
 * 框选区域：显示坐标（48×128 / 24×128）→ 规范坐标（24×64 / 12×64）
 * 框同时压到两段时，两段的列映射不同，取并集，可能比拖出来的范围略宽一点。
 * 不是下身 / 尺寸对不上（老记录存的就是规范坐标）/ 区间非法，一律原样返回。
 */
export function footVisualRectToCanonicalRect(rect, key) {
  const kind = getFootLayoutKind(key)
  if (!kind || !rect) return rect
  const canonicalWidth = getFootCanonicalWidth(kind)
  const displayWidth = canonicalWidth * FOOT_DISPLAY_SCALE_X
  if (Number(rect.width) !== displayWidth || Number(rect.height) !== FOOT_DISPLAY_HEIGHT) return rect

  const xStart = Math.max(0, Math.floor(Number(rect.xStart)))
  const xEnd = Math.min(displayWidth, Math.ceil(Number(rect.xEnd)))
  const visualYStart = Math.max(0, Math.floor(Number(rect.yStart)))
  const visualYEnd = Math.min(FOOT_DISPLAY_HEIGHT, Math.ceil(Number(rect.yEnd)))
  if (!(xEnd > xStart) || !(visualYEnd > visualYStart)) return rect

  // 行只是整体拆成两份，直接除回去；末行向上取整保证边界那一行不被漏掉
  const yStart = visualRowToCanonicalRow(visualYStart)
  const yEnd = Math.min(ENDI_FOOT_HEIGHT, Math.ceil(visualYEnd / FOOT_DISPLAY_SCALE_Y))

  let lo = Infinity
  let hi = -Infinity
  for (const band of getTouchedBands(yStart, yEnd)) {
    for (const segment of getLegSegments(kind, xStart, xEnd)) {
      const mapped = mapLegRange(band, segment.a, segment.b, segment.legKind)
      if (!mapped) continue
      lo = Math.min(lo, segment.base + mapped[0])
      hi = Math.max(hi, segment.base + mapped[1])
    }
  }
  // 整个框都压在空白上（下段中间那块），没有对应的规范列
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
    return { ...rect, xStart: 0, xEnd: 0, yStart, yEnd, width: canonicalWidth, height: ENDI_FOOT_HEIGHT }
  }

  return {
    ...rect,
    xStart: Math.max(0, lo),
    xEnd: Math.min(canonicalWidth, hi),
    yStart,
    yEnd,
    width: canonicalWidth,
    height: ENDI_FOOT_HEIGHT,
  }
}


/** 渲染用的整个部位 map：只把下身那几项换成显示数组，其它原样带过去 */
export function expandFootVisualMap(matrixMap) {
  if (!matrixMap || typeof matrixMap !== 'object') return matrixMap
  const result = { ...matrixMap }
  for (const key of Object.keys(result)) {
    if (!isEndiFootKey(key)) continue
    result[key] = expandFootVisualArr(result[key], key)
  }
  return result
}
