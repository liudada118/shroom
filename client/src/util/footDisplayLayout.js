/**
 * footDisplayLayout.js — 下身热图「一个格子拆成多格」的显示布局
 *
 * 只给画 2D 下身的那两个地方用（NumThres / NumThreeColorV3、对比视图的 ContrastHeatmap），
 * 别的地方一律不要引它。
 *
 * 【背景】
 *   每条腿的规范矩阵是 12×64，但窄段每行只接 8 个通道、宽段才接满 12 个，
 *   合并成 24×64 之后，上面 16 行中间就有一条空带。
 *
 * 【这里做什么】
 *   完全以「原来屏幕上显示的样子」为基准，把每个格子原样复制成多格，
 *   不重新插值、也不丢掉原来插值出来的列。
 *
 *   纵向：所有段一律一行变两行（下面那行复制上面那行），64 → 128。
 *   横向：按规范行分三段，每段的倍数不一样：
 *     0–15 （上段）：有值的 8 列，每列变 3 列 → 24 列铺满，中间空带消失
 *     16–29（中段）：有值的 12 列，每列变 2 列 → 24 列铺满
 *     30–63（下段）：有值的 8 列，每列变 2 列 → 16 列，贴外侧（左腿贴左、右腿贴右），
 *                    中间 8 列没有源点，填 0（画出来是底色蓝，不挖空，整张图是个完整长方形）
 *
 *   【中段→下段的过渡】规范行 23–31（线序图上的 24–32 行）不按上面的等宽规则，
 *   改成逐行给定的摆位（见 FOOT_ROW_STARTS）：每个源列的起始显示列由图决定，
 *   源列之间的空档就近复制前一个源列的值，最后一个源列铺到该行 span 为止，
 *   span 之后没有源点、填 0。这样每腿铺开宽度 24 → 22 → 21 → 20 → 18 → 16
 *   一行行收窄，中间那条空带是慢慢开出来的，不再从 24 直接掉到 16。
 *
 *   于是一个源点占的格子数：等宽段上段 3×2=6、中段 2×2=4、下段 2×2=4，
 *   过渡段每个源点宽度不等（按图）。
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
 * 三段等宽布局，end 是规范行的结束行（右开区间）
 *   factor     —— 这一段每个源格子横向占几个显示格子
 *   sourceCols —— 这一段每条腿有值的源列数
 * factor × sourceCols 就是这一段在一条腿里铺开的宽度：
 *   上段 8×3=24 铺满、中段 12×2=24 铺满、下段 8×2=16 只占外侧 16 格，中间 8 格是空的
 */
const FOOT_BANDS = [
  { end: 16, factor: 3, sourceCols: 8 },
  { end: 30, factor: 2, sourceCols: 12 },
  { end: ENDI_FOOT_HEIGHT, factor: 2, sourceCols: 8 },
]

/**
 * 中段→下段的过渡段，按线序图逐行给定（键是规范行，0 基；线序图上的行号 = 键 + 1）
 *   starts —— 每个源列在一条腿 24 个显示列里的起始位置（1 基，从外侧往内数）
 *   span   —— 这一行一共铺多宽，span 之后没有源点（填 0，画出来是底色蓝）
 * 源列按 starts 的顺序一一对应：starts[0] 是最外侧那个源列，往里依次排。
 */
const FOOT_ROW_STARTS = {
  23: { starts: [1, 2, 4, 5, 7, 9, 11, 13, 15, 17, 19, 21], span: 22 },
  24: { starts: [1, 2, 4, 5, 7, 9, 11, 13, 15, 17, 19, 21], span: 22 },
  25: { starts: [1, 2, 4, 5, 7, 8, 10, 12, 14, 16, 18, 20], span: 21 },
  26: { starts: [1, 2, 4, 5, 7, 8, 10, 12, 14, 16, 18, 20], span: 21 },
  27: { starts: [1, 2, 4, 5, 7, 8, 10, 11, 13, 15, 17, 19], span: 20 },
  28: { starts: [1, 2, 4, 5, 7, 8, 10, 11, 13, 15, 17, 19], span: 20 },
  29: { starts: [1, 2, 4, 5, 7, 8, 10, 11, 13, 14, 16, 17], span: 18 },
  // 图上 31、32 行（规范行 30、31）是 1,3,5,7,9,11,13,15 八个点各占两格、正好铺到 16，
  // 跟下段等宽规则算出来的一模一样，所以不用在这儿单列。
  // （图上那行的第 9 个数 16 是最后一个点占的第二格；下段每条腿只有 8 个源列有数据，
  //   源列 8–11 一直是空的，硬当成 9 个源列会把空列摆到最外侧、外侧两格变蓝。）
}

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

/** 这一规范行属于哪一等宽段 */
export function getFootBand(canonicalRow) {
  for (const band of FOOT_BANDS) {
    if (canonicalRow < band.end) return band
  }
  return FOOT_BANDS[FOOT_BANDS.length - 1]
}

/**
 * 把「每个源列的起始位置」摊成「离外侧第几格 → 第几个源列」
 * 源列之间的空档就近归给前一个源列（也就是往里复制到下一个源列开始为止）
 */
function buildLayoutFromStarts(starts, span) {
  const sourceCols = starts.length
  const colToIndex = new Array(span).fill(-1)
  for (let i = 0; i < sourceCols; i++) {
    const from = starts[i] - 1
    const to = (i < sourceCols - 1 ? starts[i + 1] - 1 : span) - 1
    for (let col = Math.max(0, from); col <= to && col < span; col++) {
      colToIndex[col] = i
    }
  }
  return { span, sourceCols, colToIndex }
}

/** 等宽段：每个源列固定占 factor 格 */
function buildLayoutFromBand(band) {
  const span = band.factor * band.sourceCols
  const colToIndex = new Array(span)
  for (let col = 0; col < span; col++) {
    colToIndex[col] = Math.floor(col / band.factor)
  }
  return { span, sourceCols: band.sourceCols, colToIndex }
}

/** 每一规范行的横向摆位，启动时算一次 */
const FOOT_ROW_LAYOUTS = (() => {
  const rows = new Array(ENDI_FOOT_HEIGHT)
  for (let row = 0; row < ENDI_FOOT_HEIGHT; row++) {
    const explicit = FOOT_ROW_STARTS[row]
    rows[row] = explicit
      ? buildLayoutFromStarts(explicit.starts, explicit.span)
      : buildLayoutFromBand(getFootBand(row))
  }
  return rows
})()

/** 这一规范行的横向摆位 */
export function getFootRowLayout(canonicalRow) {
  return FOOT_ROW_LAYOUTS[canonicalRow] || FOOT_ROW_LAYOUTS[ENDI_FOOT_HEIGHT - 1]
}

/**
 * 单条腿本地坐标：显示列 → 规范列，落在空白处返回 -1
 *
 * 先把显示列换算成「离外侧第几格」（左腿外侧在左、右腿外侧在右），
 * 这样两条腿用同一张摆位表，有值的那块自然贴外侧、空的永远在中间。
 *
 * 里外侧是反的（按内侧亮外侧、按外侧亮内侧），所以取值顺序倒过来：
 * 左腿最外侧取规范列的最大号、右腿最外侧取最小号 —— 和等宽段原来的算法逐格一致。
 *
 * @param {object} layout getFootRowLayout 的返回值
 * @param {number} col 显示列（0–23）
 * @param {string} legKind 'left' / 'right'
 */
function visualColToCanonicalColInLeg(layout, col, legKind) {
  const offsetFromOuter = legKind === 'right' ? FOOT_SINGLE_DISPLAY_WIDTH - 1 - col : col
  if (offsetFromOuter < 0 || offsetFromOuter >= layout.span) return -1
  const sourceIndex = layout.colToIndex[offsetFromOuter]
  if (sourceIndex < 0) return -1
  return legKind === 'right'
    ? ENDI_FOOT_SINGLE_WIDTH - layout.sourceCols + sourceIndex
    : layout.sourceCols - 1 - sourceIndex
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
  const layout = getFootRowLayout(visualRowToCanonicalRow(visualRow))
  if (kind !== 'combined') return visualColToCanonicalColInLeg(layout, col, kind)
  if (col < FOOT_SINGLE_DISPLAY_WIDTH) {
    return visualColToCanonicalColInLeg(layout, col, 'left')
  }
  const local = visualColToCanonicalColInLeg(layout, col - FOOT_SINGLE_DISPLAY_WIDTH, 'right')
  return local < 0 ? -1 : ENDI_FOOT_SINGLE_WIDTH + local
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
