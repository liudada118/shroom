/**
 * colorMap_dynamic_gamma.js
 * 热力图颜色映射模块 · 动态归一化 + Gamma 校正
 * V3.0 | 2026-06-02
 *
 * 核心逻辑：
 *   1. RANGE_MAX 跟随当前帧已经换算后的实际渲染最大值（指数平滑，防闪烁）
 *   2. RANGE_MAX 最低为 0.01，适配 kPa/N 小数值
 *   3. 归一化后做 Gamma 校正（gamma=2），让高压区颜色层次更丰富
 *   4. Jet 色谱（蓝→青→黄→红）
 *
 * 适用：坐垫 46×46 / 靠背 64×50
 */

// ── 配置参数 ──────────────────────────────────────────────────────────────

/** 渲染量程从 0 开始，无接触点仍由值为 0 单独判定 */
export const RANGE_MIN = 0;

/** 动态上限的最低有效值，与颜色调节最小值一致 */
export const MIN_RANGE_MAX = 0.01;

/** 动态颜色上限精度 */
export const COLOR_RANGE_STEP = 0.01;

/** 指数平滑系数（0~1，越小越平滑、越不闪） */
export const SMOOTH_ALPHA = 0.08;

/** Gamma 校正指数（>1 压缩低压区颜色，拉伸高压区颜色） */
export const GAMMA = 2.0;

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
let hasRenderedFrame = false;

function normalizeRangeMax(value) {
  const numeric = Number(value);
  const safeValue = Number.isFinite(numeric) ? numeric : MIN_RANGE_MAX;
  const clamped = Math.max(safeValue, MIN_RANGE_MAX);
  return Number((Math.round(clamped / COLOR_RANGE_STEP) * COLOR_RANGE_STEP).toFixed(2));
}

// ── 核心函数 ──────────────────────────────────────────────────────────────

/**
 * 每帧调用一次：更新动态 RANGE_MAX
 * @param {number} frameMax - 当前帧实际渲染值的最大值（kPa 或 N）
 * @returns {number} 当前使用的 RANGE_MAX
 */
export function updateFrameMax(frameMax) {
  const targetMax = normalizeRangeMax(frameMax);
  smoothedMax = hasRenderedFrame
    ? normalizeRangeMax(SMOOTH_ALPHA * targetMax + (1 - SMOOTH_ALPHA) * smoothedMax)
    : targetMax;
  hasRenderedFrame = true;
  return smoothedMax;
}

/**
 * 获取当前的动态 RANGE_MAX（供图例显示用）
 */
export function getCurrentRangeMax() {
  return smoothedMax;
}

/**
 * 将当前渲染值映射为 [R, G, B] 颜色（动态归一化 + Gamma 校正）
 * 注意：必须先调用 updateFrameMax() 更新当前帧的 RANGE_MAX
 *
 * @param {number} adcValue - 保留旧 API 名称，实际应传入已经换算后的 kPa/N 值
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
  hasRenderedFrame = false;
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
    const adc = Number((RANGE_MIN + t_linear * (rangeMax - RANGE_MIN)).toFixed(2));
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
