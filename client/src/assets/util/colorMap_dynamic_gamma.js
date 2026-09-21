/**
 * colorMap_dynamic_gamma.js
 * 热力图颜色映射模块 · 动态归一化 + Gamma 校正
 * V3.0 | 2026-06-02
 *
 * 核心逻辑：
 *   1. RANGE_MAX 跟随当前帧最大值（指数平滑，防闪烁）
 *   2. RANGE_MAX 有最低保护值 MIN_RANGE_MAX = 80（防止轻触变红）
 *   3. 归一化后做 Gamma 校正（gamma=2），让高压区颜色层次更丰富
 *   4. Jet 色谱（蓝→青→黄→红）
 *
 * 适用：坐垫 46×46 / 靠背 64×50
 */

// ── 配置参数 ──────────────────────────────────────────────────────────────

/** 量程下限（低于此值显示背景色） */
export const RANGE_MIN = 15;

/** RANGE_MAX 的最低保护值（防止轻触变红） */
export const MIN_RANGE_MAX = 80;

/** 指数平滑系数（0~1，越小越平滑、越不闪） */
export const SMOOTH_ALPHA = 0.08;

/** Gamma 校正指数（>1 压缩低压区颜色，拉伸高压区颜色） */
export const GAMMA = 2.0;

// ── 压强(kPa) 量纲的对应参数 ──────────────────────────────────────────────
// 上面三个常量都是按 ADC（0~255）定的。2D 数值视图改成显示压强之后量级差了一个数量级，
// 直接套用会把所有压强值都压到 RANGE_MIN=15 以下、RANGE_MAX 又被 80 顶住，
// 结果整张图只剩最低档颜色，要 60kPa 以上才见绿色。压强单独用下面这一套。

/** 压强量程下限：压强本身 <=0 已经按无接触处理，不需要再截一刀 */
export const PRESSURE_RANGE_MIN = 0;

/**
 * 压强 RANGE_MAX 的最低保护值（防止没人躺的时候一点噪声就铺满红色）。
 *
 * 原来取 5kPa（「色彩调节」的默认满量程），但假人实测整帧峰值才 2.9kPa
 * （面板上的 0.29 N/cm²，1 N/cm² = 10kPa）—— 比保护值还低，
 * 于是量程被这条线顶死在 5，最高的格子算出来 ratio 只有 2.9/5=0.58，
 * 过完 gamma 落在色谱第 5 档，自动配色开了也只是黄绿，永远出不了红。
 *
 * 降到 1kPa：正常接触（峰值 2~3kPa）时这条线不起作用，量程跟着帧走、红核出得来；
 * 轻触/空载（峰值几百 Pa）时仍然被顶住，最多到绿，不会假红。
 */
export const PRESSURE_MIN_RANGE_MAX = 2;

/**
 * 压强的 gamma。原来取 1.0（线性），理由是 ADC→压强 的标定本身就是平方关系。
 * 但实测线性映射下压力分布太尖：一帧 390 个有值格子里有 200 个挤在最低一档，
 * 自动配色开起来整片发蓝、看不出层次。<1 把中低段抬起来，红黄绿蓝才铺得开。
 * 觉得偏红/偏蓝就调这一个数：越小越暖。
 */
export const PRESSURE_GAMMA = 0.6;

/**
 * 动态量程取帧内第几百分位（而不是绝对最大值）。
 *
 * 两个作用：
 * 1. 避开噪声尖峰 —— 实测有单帧冒到 160kPa 的孤立点，按绝对最大值算会把量程顶飞。
 * 2. 让红色看得见 —— 量程压到峰值上会导致「只有最高那一两格是红的」，
 *    390 个有值格里才 13 个落进红档，等于没有红色。取 0.9 表示
 *    「受力最重的那 10% 面积算满量程」，红核才有面积。
 *
 * 调大 → 红区变小、整体偏冷；调小 → 红区变大、接近以前手动固定量程的观感。
 */
export const DYNAMIC_RANGE_PERCENTILE = 0.9;

/**
 * 量程「下降」时的平滑系数。上升不平滑、立即跟上，
 * 这样本帧峰值永远落在色谱顶端（=一定有红色）；只有掉下来时慢慢收，避免闪烁。
 */
export const RANGE_DECAY_ALPHA = 0.15;

/**
 * 量程最多比本帧目标值高多少倍。
 * 只有下降平滑、没有这个上限的话，一次重压过后量程会挂在高位几十帧下不来，
 * 那段时间画面整片发冷、一格红都没有（实测 400 帧里有 26 帧是这样）。
 * 卡到 1.5 倍之后无红帧归零，帧间抖动只从 4.7% 涨到 7.1%。
 */
export const RANGE_MAX_OVERSHOOT = 1.5;

/** 背景色（无接触区域） */
const BG_COLOR = [0, 0, 20];

// ── Jet 色谱锚点（10个，蓝→红）──────────────────────────────────────────
const JET = [
  [  0,   0, 143],   // t=0.000  深蓝
  [  0,   0, 255],   // t=0.111  纯蓝
  [  0, 127, 255],   // t=0.222  蓝青
  [  0, 255, 255],   // t=0.333  青色
  [  0, 255, 127],   // t=0.444  青绿
  [127, 255,   0],   // t=0.556  黄绿
  [255, 255,   0],   // t=0.667  黄色
  [255, 127,   0],   // t=0.778  橙色
  [255,   0,   0],   // t=0.889  红色
  [143,   0,   0],   // t=1.000  深红
];

// ── 内部状态 ──────────────────────────────────────────────────────────────
let smoothedMax = MIN_RANGE_MAX;

// ── 核心函数 ──────────────────────────────────────────────────────────────

/**
 * 每帧调用一次：更新动态 RANGE_MAX
 * @param {number} frameMax - 当前帧有效点的最大 ADC 值
 * @returns {number} 当前使用的 RANGE_MAX
 */
export function updateFrameMax(frameMax) {
  // 指数平滑
  smoothedMax = SMOOTH_ALPHA * frameMax + (1 - SMOOTH_ALPHA) * smoothedMax;
  // 最低保护
  smoothedMax = Math.max(smoothedMax, MIN_RANGE_MAX);
  return smoothedMax;
}

/**
 * 获取当前的动态 RANGE_MAX（供图例显示用）
 */
export function getCurrentRangeMax() {
  return smoothedMax;
}

/**
 * 将 ADC 值映射为 [R, G, B] 颜色（动态归一化 + Gamma 校正）
 * 注意：必须先调用 updateFrameMax() 更新当前帧的 RANGE_MAX
 *
 * @param {number} adcValue - ADC 原始值
 * @returns {[number, number, number]} RGB 数组
 */
export function adcToColor(adcValue) {
  // 无效值或低于下限 → 背景色
  if (!adcValue || adcValue < RANGE_MIN) {
    return BG_COLOR;
  }

  // 动态归一化
  const rangeMax = smoothedMax;
  let t = (adcValue - RANGE_MIN) / (rangeMax - RANGE_MIN);
  t = Math.max(0, Math.min(1, t));  // clamp [0, 1]

  // Gamma 校正
  t = Math.pow(t, GAMMA);

  // Jet 色谱插值
  const n = JET.length - 1;
  const idx = t * n;
  const lo = Math.floor(idx);
  const hi = Math.min(lo + 1, n);
  const frac = idx - lo;

  return [
    Math.round(JET[lo][0] + (JET[hi][0] - JET[lo][0]) * frac),
    Math.round(JET[lo][1] + (JET[hi][1] - JET[lo][1]) * frac),
    Math.round(JET[lo][2] + (JET[hi][2] - JET[lo][2]) * frac),
  ];
}

/**
 * 重置平滑状态（传感器断开或切换时调用）
 */
export function reset() {
  smoothedMax = MIN_RANGE_MAX;
}

/**
 * 返回图例的 CSS linear-gradient 字符串
 */
export function getGradient() {
  const stops = JET.map((c, i) => {
    const pct = Math.round((i / (JET.length - 1)) * 100);
    return `rgb(${c[0]},${c[1]},${c[2]}) ${pct}%`;
  });
  return `linear-gradient(to right, ${stops.join(', ')})`;
}

/**
 * 返回图例刻度（基于当前动态 RANGE_MAX）
 */
export function getLegendTicks() {
  const rangeMax = smoothedMax;
  const tickCount = 6;
  const ticks = [];
  for (let i = 0; i <= tickCount; i++) {
    const t_linear = i / tickCount;
    // 反 gamma：ADC = RANGE_MIN + t_linear * (rangeMax - RANGE_MIN)
    const adc = Math.round(RANGE_MIN + t_linear * (rangeMax - RANGE_MIN));
    // gamma 校正后的 t
    const t_gamma = Math.pow(t_linear, GAMMA);
    const color = adcToColor(adc);
    ticks.push({ adc, t: t_gamma, color });
  }
  return ticks;
}

// ── 使用示例 ──────────────────────────────────────────────────────────────
/*
import { updateFrameMax, adcToColor, reset } from '@/lib/colorMap_dynamic_gamma';

// 在 Heatmap.tsx 的渲染函数中：

// 1. 每帧开始时，找到当前帧最大值并更新
const frameMax = Math.max(...matrix.flat().filter(v => v > 0));
updateFrameMax(frameMax);

// 2. 渲染每个像素
for (let r = 0; r < rows; r++) {
  for (let c = 0; c < cols; c++) {
    const [red, green, blue] = adcToColor(matrix[r][c]);
    // 填充像素颜色...
  }
}

// 3. 传感器断开时重置
reset();
*/
