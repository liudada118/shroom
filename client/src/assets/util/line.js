import {
  DYNAMIC_RANGE_PERCENTILE,
  GAMMA,
  MIN_RANGE_MAX,
  PRESSURE_GAMMA,
  PRESSURE_MIN_RANGE_MAX,
  PRESSURE_RANGE_MIN,
  RANGE_DECAY_ALPHA,
  RANGE_MAX_OVERSHOOT,
  RANGE_MIN,
} from './colorMap_dynamic_gamma';

const DEFAULT_DYNAMIC_COLOR_SCOPE = 'default';

let dynamicGammaEnabled = false;
let dynamicGammaScope = DEFAULT_DYNAMIC_COLOR_SCOPE;
const dynamicColorRangeMap = new Map();
// 每个 scope 画的是 ADC 还是压强：两者量级差一个数量级，量程下限/保护值/gamma 都得分开。
// 没声明过的按 ADC 处理，保持老视图（车/床的 3D 点云）原样
const dynamicColorAdcScaleMap = new Map();

function getDynamicColorScope(scope) {
  return scope == null || scope === '' ? DEFAULT_DYNAMIC_COLOR_SCOPE : String(scope);
}

function isAdcScaleScope(scope) {
  return dynamicColorAdcScaleMap.get(getDynamicColorScope(scope)) !== false;
}

function getScopedRangeMin(scope) {
  return isAdcScaleScope(scope) ? RANGE_MIN : PRESSURE_RANGE_MIN;
}

function getScopedMinRangeMax(scope) {
  return isAdcScaleScope(scope) ? MIN_RANGE_MAX : PRESSURE_MIN_RANGE_MAX;
}

function getScopedGamma(scope) {
  return isAdcScaleScope(scope) ? GAMMA : PRESSURE_GAMMA;
}

/** 声明该 scope 的数值量纲：true = ADC(0~255)，false = 压强(kPa) */
export function setDynamicColorValueScale(isAdcScale, scope = DEFAULT_DYNAMIC_COLOR_SCOPE) {
  dynamicColorAdcScaleMap.set(getDynamicColorScope(scope), Boolean(isAdcScale));
}

function getScopedDynamicRangeMax(scope = DEFAULT_DYNAMIC_COLOR_SCOPE) {
  const key = getDynamicColorScope(scope);
  return dynamicColorRangeMap.get(key) || getScopedMinRangeMax(key);
}

function updateScopedFrameMax(frameMax, scope = DEFAULT_DYNAMIC_COLOR_SCOPE) {
  const key = getDynamicColorScope(scope);
  const value = Number(frameMax);
  const safeFrameMax = Number.isFinite(value) ? value : 0;
  const currentMax = getScopedDynamicRangeMax(key);
  // 上升不平滑：量程永远不低于本帧目标值，所以最重的那一片一定是红的。
  // 下降才平滑，但最多只让量程挂在目标值的 RANGE_MAX_OVERSHOOT 倍，
  // 否则一次重压过后量程会长时间下不来，画面整片发冷。
  const decayed = RANGE_DECAY_ALPHA * safeFrameMax + (1 - RANGE_DECAY_ALPHA) * currentMax;
  const nextMax = Math.max(
    safeFrameMax,
    Math.min(decayed, safeFrameMax * RANGE_MAX_OVERSHOOT),
    getScopedMinRangeMax(key)
  );
  dynamicColorRangeMap.set(key, nextMax);
  return nextMax;
}

// ── 帧内百分位（不排序，直方图数下来，O(n)）──────────────────────────────
// 0.1 一格，4096 格覆盖 0~409.5（压强 kPa 和 ADC 0~255 都够用）
const PERCENTILE_BIN_STEP = 0.1;
const PERCENTILE_BIN_COUNT = 4096;
const percentileBins = new Int32Array(PERCENTILE_BIN_COUNT);

/**
 * 取帧内第 percentile 分位的值，用来定动态量程。
 * 直接用绝对最大值的话，单个噪声尖峰就能把量程顶飞、整片画面发蓝。
 * 只统计 > 0 的点（<=0 按无接触处理）。全是 0 就返回 0。
 */
function getFramePercentile(values, percentile) {
  percentileBins.fill(0);
  let count = 0;
  let rawMax = 0;
  for (let i = 0; i < values.length; i++) {
    const value = Number(values[i]);
    if (!Number.isFinite(value) || value <= 0) continue;
    count++;
    if (value > rawMax) rawMax = value;
    const bin = Math.min(PERCENTILE_BIN_COUNT - 1, Math.round(value / PERCENTILE_BIN_STEP));
    percentileBins[bin]++;
  }
  if (!count) return 0;
  // 从最高一格往下数，丢掉最高的 (1 - percentile) 那部分点
  let drop = Math.floor(count * (1 - percentile));
  for (let bin = PERCENTILE_BIN_COUNT - 1; bin >= 0; bin--) {
    const binCount = percentileBins[bin];
    if (!binCount) continue;
    if (drop < binCount) {
      // 落在最后一格说明量程超出了直方图范围，退回真实最大值
      return bin === PERCENTILE_BIN_COUNT - 1 ? rawMax : Math.min(rawMax, bin * PERCENTILE_BIN_STEP);
    }
    drop -= binCount;
  }
  return rawMax;
}

function quantizeValue(value, step = 1) {
  const numeric = Number(value);
  const numericStep = Number(step);
  if (!Number.isFinite(numeric)) return 0;
  if (!Number.isFinite(numericStep) || numericStep <= 0) return numeric;
  return Math.round(numeric / numericStep) * numericStep;
}

export function lineInterp(smallMat, width, height, interp1, interp2) {

  const bigMat = new Array((width * interp1) * (height * interp2)).fill(0)
  // return bigMat
  for (let i = 0; i < height; i++) {
    for (let j = 0; j < width - 1; j++) {
      const realValue = smallMat[i * width + j]
      const rowValue = smallMat[i * width + j + 1] ? smallMat[i * width + j + 1] : 0
      const colValue = smallMat[(i + 1) * width + j] ? smallMat[(i + 1) * width + j] : 0
      bigMat[(width * interp1) * i * interp2 + (j * interp1)
      ] = smallMat[i * width + j]
      // for (let k = 0; k < interp1; k++) {
      //   // for (let z = 0; z < interp2; z++) {
      //   //   bigMat[(width * interp1) * (i * interp2 + k) + ((j * interp1) + z)
      //   //   ] = smallMat[i * width + j] * 10
      //   // }
      // }

      // for (let k = 0; k < interp2; k++) {
      //   bigMat[(width * interp1) * (i * interp2 + k) + ((j * interp1))] = realValue + (colValue - realValue) * (k) / interp2
      // }
      for (let k = 0; k < interp1; k++) {
        bigMat[(width * interp1) * (i * interp2) + ((j * interp1 + k))] = realValue + (rowValue - realValue) * (k) / interp1
      }
    }
  }

  const newWidth = width * interp1

  for (let i = 0; i < height; i++) {
    for (let j = 0; j < newWidth; j++) {
      const realValue = bigMat[i * interp2 * newWidth + j]
      // const rowValue = bigMat[i * width + j + 1] * 10 ? bigMat[i * width + j + 1] * 10 : 0
      // const colValue = bigMat[(i + 1) * width + j] * 10 ? bigMat[(i + 1) * width + j] * 10 : 0
      const colValue = bigMat[((i + 1) * interp2) * newWidth + j] ? bigMat[(((i + 1) * interp2)) * newWidth + j] : 0
      for (let k = 0; k < interp2; k++) {
        bigMat[newWidth * (i * interp2 + k) + ((j))] = realValue + (colValue - realValue) * (k) / interp2
      }
    }
  }
  for (let i = 0; i < width * interp1; i++) {
    for (let j = 0; j < width * interp1; j++) {

    }
  }
  return bigMat
}

export function addSide(arr, width, height, wnum, hnum, sideNum = 0) {

  let narr = new Array(height);
  let res = [];
  for (let i = 0; i < height; i++) {
    narr[i] = [];

    for (let j = 0; j < width; j++) {
      if (j == 0) {
        narr[i].push(
          ...new Array(wnum).fill(sideNum >= 0 ? sideNum : 1),
          arr[i * width + j]
        );
      } else if (j == width - 1) {
        narr[i].push(
          arr[i * width + j],
          ...new Array(wnum).fill(sideNum >= 0 ? sideNum : 1)
        );
      } else {
        narr[i].push(arr[i * width + j]);
      }
    }
  }
  for (let i = 0; i < height; i++) {
    res.push(...narr[i]);
  }

  return [
    ...new Array(hnum * (width + 2 * wnum)).fill(sideNum >= 0 ? sideNum : 1),
    ...res,
    ...new Array(hnum * (width + 2 * wnum)).fill(sideNum >= 0 ? sideNum : 1),
  ];
}

/**
 * 高斯return
 * @param {*} scl 
 * @param {*} tcl 
 * @param {*} w 
 * @param {*} h 
 * @param {*} r 
 */
export function gaussBlur_return(scl, w, h, r, step = 1) {
  const res = new Array(scl.length).fill(1)
  var rs = Math.ceil(r * 2.57); // significant radius
  for (var i = 0; i < h; i++) {
    for (var j = 0; j < w; j++) {
      var val = 0,
        wsum = 0;
      for (var iy = i - rs; iy < i + rs + 1; iy++)
        for (var ix = j - rs; ix < j + rs + 1; ix++) {
          var x = Math.min(w - 1, Math.max(0, ix));
          var y = Math.min(h - 1, Math.max(0, iy));
          var dsq = (ix - j) * (ix - j) + (iy - i) * (iy - i);
          var wght = Math.exp(-dsq / (2 * r * r)) / (Math.PI * 2 * r * r);
          val += scl[y * w + x] * wght;
          wsum += wght;
        }
      res[i * w + j] = quantizeValue(val / wsum, step);
    }
  }
  return res
}


export function beginDynamicColorFrame(values = [], fallbackMax = 0, scope = DEFAULT_DYNAMIC_COLOR_SCOPE) {
  if (!dynamicGammaEnabled) return null;
  const arr = Array.isArray(values) || ArrayBuffer.isView(values) ? values : [];
  const frameMax = getFramePercentile(arr, DYNAMIC_RANGE_PERCENTILE);
  const fallback = Number(fallbackMax);
  return updateScopedFrameMax(frameMax > 0 ? frameMax : (Number.isFinite(fallback) ? fallback : 0), scope);
}

export function syncDynamicColorRange(maxValue, scope = DEFAULT_DYNAMIC_COLOR_SCOPE) {
  if (!dynamicGammaEnabled) return null;
  const value = Number(maxValue);
  return updateScopedFrameMax(Number.isFinite(value) ? value : 0, scope);
}

export function setDynamicGammaColorEnabled(enabled, scope = DEFAULT_DYNAMIC_COLOR_SCOPE) {
  dynamicGammaEnabled = Boolean(enabled);
  dynamicGammaScope = getDynamicColorScope(scope);
}

export function isDynamicGammaColorEnabled() {
  return dynamicGammaEnabled;
}

export function getDynamicColorRangeMax(scope = DEFAULT_DYNAMIC_COLOR_SCOPE) {
  return getScopedDynamicRangeMax(scope);
}

export function resetPressureColorRange(scope) {
  if (scope == null) {
    dynamicColorRangeMap.clear();
    return;
  }
  dynamicColorRangeMap.set(getDynamicColorScope(scope), getScopedMinRangeMax(scope));
}

export function getPressureColorGradient() {
  const stops = rainbowTextColorsxyNoWhite
    .map((color, index) => {
      const pct = Math.round((index / (rainbowTextColorsxyNoWhite.length - 1)) * 100);
      return `rgb(${color[0]},${color[1]},${color[2]}) ${pct}%`;
    });
  return `linear-gradient(to right, ${stops.join(', ')})`;
}

export function getPressureColorLegendTicks() {
  const rangeMax = getDynamicColorRangeMax();
  const rangeMin = getScopedRangeMin(DEFAULT_DYNAMIC_COLOR_SCOPE);
  const tickCount = 6;
  return Array.from({ length: tickCount + 1 }, (_, index) => {
    const ratio = index / tickCount;
    const value = quantizeValue(rangeMin + ratio * (rangeMax - rangeMin), 0.01);
    return {
      adc: value,
      t: ratio,
      color: jetWhite3NoWhite(0, rangeMax, value),
    };
  });
}

export function jetWhite3(min, max, x) {
  return jetFromPalette(rainbowTextColorsxy, min, max, x)
}

function jetFromPalette(palette, min, max, x) {
  const value = Number(x);
  if (!Number.isFinite(value) || value <= 0) {
    return palette[palette.length - 1]
  }

  if (dynamicGammaEnabled) {
    const rangeMin = getScopedRangeMin(dynamicGammaScope);
    // 保护值一定大于量程下限（ADC 80 > 15、压强 5 > 0），分母不会退化成 0
    const rangeMax = Math.max(
      Number(getScopedDynamicRangeMax(dynamicGammaScope)) || 0,
      getScopedMinRangeMax(dynamicGammaScope)
    );
    let ratio = (value - rangeMin) / (rangeMax - rangeMin);
    ratio = Math.max(0, Math.min(1, ratio));
    ratio = Math.pow(ratio, getScopedGamma(dynamicGammaScope));
    const index = Math.round((1 - ratio) * (palette.length - 1));
    return palette[index];
  }

  const minValue = Number.isFinite(Number(min)) ? Number(min) : 0;
  const maxValue = Number.isFinite(Number(max)) && Number(max) > minValue ? Number(max) : minValue + 1;
  const ratio = Math.max(0, Math.min(1, (value - minValue) / (maxValue - minValue)));
  const index = Math.round((1 - ratio) * (palette.length - 1));
  return palette[index];
}

export function jetWhite3NoWhite(min, max, x) {
  return jetFromPalette(rainbowTextColorsxyNoWhite, min, max, x)
}

export const rainbowTextColorsxy = [
  [255, 0, 0],
  [255, 69, 0],
  [255, 136, 0],
  [255, 170, 0],
  [255, 204, 0],
  [255, 255, 0],
  [204, 255, 0],
  [153, 255, 0],
  [102, 255, 0],
  [51, 255, 0],
  [0, 255, 0],
  [0, 255, 51],
  [0, 255, 102],
  [0, 255, 153],
  [0, 255, 204],
  [0, 255, 255],
  [0, 204, 255],
  [0, 153, 255],
  // ...new Array(5).fill([0, 102, 255]),
  // [255, 255, 255],

  [0, 102, 255],
  [255, 255, 255],
  [255, 255, 255],
];

export const rainbowTextColorsxyNoWhite = rainbowTextColorsxy.slice(0, -3);
export const NUMBER_TEXT_COLOR_ALPHA = 0.72;
export const pressurePointColors = rainbowTextColorsxy;
