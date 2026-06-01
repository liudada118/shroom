/**
 * 矩阵压力传感器压强标定公式  V2.7.37
 * 生成日期：2026-05-15
 *
 * 坐垫砝码段：X轴 = ADC TOP-70 均值（最高70个点位的均值）
 * 靠背砝码段：X轴 = ADC TOP-46 均值（最高46个点位的均值）
 * 真人段：X轴 = 全部有效点均值
 *
 * 使用方式：
 *   const p = estimatePressure(adcAvg, nValid, 'seat');    // 坐垫
 *   const p = estimatePressure(adcAvg, nValid, 'backrest'); // 靠背
 *
 * @param {number} adcAvg  - ADC均值（坐垫TOP-70，靠背TOP-46，真人段全部点）
 * @param {number} nValid  - 有效点数
 * @param {'seat'|'backrest'} sensor - 传感器类型
 * @returns {number|null} 压强（kPa），无法计算时返回 null
 */

// =====================================================================
// 坐垫砝码段（9段，X轴=TOP-70均值，范围[92.780,192.200]）
// =====================================================================
const SEAT_SEGS = [
  { lo: 92.78, hi: 129.75, a: 0.001170994, b: -0.1905968, c: 10.059837 },
  { lo: 129.75, hi: 146.465, a: 0.002622218, b: -0.5732986, c: 35.228319 },
  { lo: 146.465, hi: 157.155, a: 0.004635929, b: -1.173901, c: 79.986504 },
  { lo: 157.155, hi: 164.275, a: 0.005660138, b: -1.463491, c: 100.185805 },
  { lo: 164.275, hi: 170.855, a: 0.003774891, b: -0.8869473, c: 56.338964 },
  { lo: 170.855, hi: 176.36, a: 0.01558982, b: -4.967249, c: 408.613321 },
  { lo: 176.36, hi: 179.58, a: 0.006252053, b: -1.418432, c: 73.148851 },
  { lo: 179.58, hi: 184.45, a: 0.01939872, b: -6.585739, c: 577.16918 },
  { lo: 184.45, hi: 192.2, a: 0.0, b: 0.3225806, c: -37.0 },
];

// =====================================================================
// 靠背砝码段（9段，X轴=TOP-46均值，范围[125.610,214.466]）
// 5~10砝码锚点用P70（70百分位），确保单调性
// 右端外推斜率强制为正（ADC>153.33时压强持续递增）
// =====================================================================
const BACK_SEGS = [
  { lo: 125.61, hi: 159.3, a: 0.001717858, b: -0.4122926, c: 27.134483 },
  { lo: 159.3, hi: 171.98, a: 0.004892941, b: -1.42029, c: 107.064504 },
  { lo: 171.98, hi: 180.43, a: 0.004443061, b: -1.266599, c: 93.902669 },
  { lo: 180.43, hi: 187.878, a: 0.004517847, b: -1.33062, c: 103.013925 },
  { lo: 187.878, hi: 193.588, a: 0.009930199, b: -3.350401, c: 291.449681 },
  { lo: 193.588, hi: 198.02, a: 0.01545079, b: -5.486578, c: 498.096996 },
  { lo: 198.02, hi: 201.528, a: 0.01816511, b: -6.542237, c: 600.699719 },
  { lo: 201.528, hi: 204.608, a: 0.04442068, b: -17.24446, c: 1691.183725 },
  { lo: 204.608, hi: 214.466, a: 0.0, b: 0.2536011, c: -29.388821 },
];

// =====================================================================
// 核心计算函数
// =====================================================================

/**
 * 分段二次公式计算（通用）
 */
function calcFiveSegment(adc, segs, leftSlope, pHi, rightSlope) {
  if (adc <= 0) return null;
  if (segs.length === 0) return null;
  const first = segs[0], last = segs[segs.length - 1];
  if (adc <= first.lo) return Math.max(0, leftSlope * adc);
  if (adc > last.hi) return Math.max(0, pHi + rightSlope * (adc - last.hi));
  for (const seg of segs) {
    if (adc <= seg.hi) return Math.max(0, seg.a * adc * adc + seg.b * adc + seg.c);
  }
  return null;
}

// 坐垫端点参数
const SEAT_LEFT_SLOPE = 2.64748071e-02;
const SEAT_P_HI = 24.99999132;
const SEAT_RIGHT_SLOPE = 0.32258060;

// 靠背端点参数
const BACK_LEFT_SLOPE = 1.95092216e-02;
const BACK_P_HI = 24.99999251;
const BACK_RIGHT_SLOPE = 0.25360110;

// 派发阈值
const SEAT_HUMAN_THRESHOLD = 1128;
const BACK_HUMAN_THRESHOLD = 1000;

// 真人段系数
const SEAT_HUMAN_ALPHA = 6.33355500e-04;
const BACK_HUMAN_ALPHA = 4.15552300e-04;

/**
 * 计算平均压强（kPa）
 * @param {number} adcAvg  - ADC均值
 * @param {number} nValid  - 有效点数
 * @param {'seat'|'backrest'} sensor - 传感器类型
 * @returns {number|null} 压强（kPa）
 */
function estimatePressure(adcAvg, nValid, sensor) {
  if (adcAvg <= 0) return null;
  const isBackrest = sensor === 'backrest';
  const humanThresh = isBackrest ? BACK_HUMAN_THRESHOLD : SEAT_HUMAN_THRESHOLD;
  
  // 真人段：N_valid 超过阈值
  if (nValid !== undefined && nValid >= humanThresh) {
    const alpha = isBackrest ? BACK_HUMAN_ALPHA : SEAT_HUMAN_ALPHA;
    return Math.max(0, parseFloat((alpha * adcAvg * adcAvg).toFixed(2)));
  }
  
  // 砝码段：分段二次公式
  if (isBackrest) {
    return parseFloat((calcFiveSegment(adcAvg, BACK_SEGS, BACK_LEFT_SLOPE, BACK_P_HI, BACK_RIGHT_SLOPE) || 0).toFixed(2));
  } else {
    return parseFloat((calcFiveSegment(adcAvg, SEAT_SEGS, SEAT_LEFT_SLOPE, SEAT_P_HI, SEAT_RIGHT_SLOPE) || 0).toFixed(2));
  }
}

/**
 * 计算最大压强（kPa）
 * @param {number} adcMax  - ADC最大值
 * @param {number} nValid  - 有效点数
 * @param {'seat'|'backrest'} sensor - 传感器类型
 * @param {number} adcAvg  - ADC均值（用于比例放大）
 * @returns {number|null} 最大压强（kPa）
 */
function estimateMaxPressure(adcMax, nValid, sensor, adcAvg) {
  if (adcMax <= 0 || adcAvg <= 0) return null;
  const avgP = estimatePressure(adcAvg, nValid, sensor);
  if (avgP === null || avgP <= 0) return null;
  return parseFloat(Math.max(0, avgP * (adcMax / adcAvg)).toFixed(2));
}

// Node.js 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { estimatePressure, estimateMaxPressure };
}

// =====================================================================
// 使用示例
// =====================================================================
/*
// 坐垫砝码段（ADC TOP-70均值）
estimatePressure(141, 120, 'seat')      // → 约 2.47 kPa（1砝码）
estimatePressure(195, 120, 'seat')      // → 约 25.0 kPa（10砝码）

// 坐垫真人段（全部点均值）
estimatePressure(100, 1200, 'seat')     // → 约 6.33 kPa

// 靠背砝码段（ADC TOP-46均值）
estimatePressure(105, 100, 'backrest')  // → 约 2.5 kPa（1砝码）
estimatePressure(154, 100, 'backrest')  // → 约 26.1 kPa（超出右端，外推）
estimatePressure(160, 100, 'backrest')  // → 约 36.2 kPa（外推，持续递增）

// 靠背真人段（全部点均值）
estimatePressure(90, 1200, 'backrest')  // → 约 3.37 kPa
*/
