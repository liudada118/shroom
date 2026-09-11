/**
 * footDisplayLayout.js — 下身热图「一个格子拆成多格」的显示布局
 *
 * 只给画 2D 下身的那两个地方用（NumThres / NumThreeColorV3、对比视图的 ContrastHeatmap），
 * 别的地方一律不要引它。
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
 *   另外每条腿块内部的取值顺序是倒过来的：源数据里外侧本来就是反的
 *   （按内侧亮外侧、按外侧亮内侧），这里统一倒一下。腿的左右位置不变。
 *
 * 【只改显示，不改数值】
 *   展开只发生在画布内部：sitData / 入库数组 / 统计 / 导出拿到的永远是规范的 24×64，
 *   受力面积 / 压强 / 对称系数 / 梯度全部保持原口径，3D 也完全不受影响。
 *   又因为横纵都正好 ×2，画出来的整体外框跟规范尺寸一模一样（格子小一半、数量多一倍），
 *   所以框选、标尺这些还按 systemPointConfig 的 24×64 算，坐标一点不用换。
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
 *
 * 里外侧是反的（按内侧亮外侧、按外侧亮内侧），所以这里把每条腿块内部的取值顺序
 * 倒过来。只倒顺序：有值的那一块占哪几个显示格子（blockStart / span）一点不动，
 * 两条腿在屏幕上的左右位置、中间的空带都还在原地。
 *
 * @param {object} band getFootBand 的返回值
 * @param {number} col 显示列（0–23）
 * @param {string} legKind 'left' / 'right'
 */
function visualColToCanonicalColInLeg(band, col, legKind) {
  const { span, blockStart, sourceStart } = getLegBandGeometry(band, legKind)
  if (col < blockStart || col >= blockStart + span) return -1
  const sourceIndex = Math.floor((col - blockStart) / band.factor)
  return sourceStart + (band.sourceCols - 1 - sourceIndex)
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
 * 这个显示格子是不是空的（下段中间那一块）——渲染时按它决定画不画
 * 跟里外侧倒不倒无关：倒的只是块内部的取值顺序，空的还是原来那几格
 */
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
