/**
 * 矩阵压力传感器压强标定公式（含单点压强）  V2.7.37
 * 生成日期：2026-06-01
 *
 * 包含：
 *   1. 平均压强公式 estimatePressure(adcAvg, nValid, sensor)
 *   2. 最大压强公式 estimateMaxPressure(adcMax, nValid, sensor, adcAvg)
 *   3. 单点压强公式 estimatePointPressure(adcPoint, adcAvg, nValid, sensor, pAvg)
 *
 * 单点压强说明：
 *   - 砝码模式：P[i,j] = P_avg × ADC[i,j] / ADC_avg（比例放大法）
 *   - 真人模式：P[i,j] = α × ADC[i,j]²（与平均压强公式形式相同）
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
// 1~4砝码锚点P50，5~10砝码锚点P60，右端外推斜率强制为正
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

// 端点参数
const SEAT_LEFT_SLOPE = 2.64748071e-02;
const SEAT_P_HI = 24.99999132;
const SEAT_RIGHT_SLOPE = 0.32258060;
const BACK_LEFT_SLOPE = 1.95092216e-02;
const BACK_P_HI = 24.99999251;
const BACK_RIGHT_SLOPE = 0.25360110;

// 派发阈值
const SEAT_HUMAN_THRESHOLD = 1128;
const BACK_HUMAN_THRESHOLD = 1000;

// 真人段系数
const SEAT_HUMAN_ALPHA = 6.33355500e-04;
const BACK_HUMAN_ALPHA = 4.15552300e-04;

// =====================================================================
// 核心函数
// =====================================================================

function calcFiveSegment(adc, segs, leftSlope, pHi, rightSlope) {
  if (adc <= 0 || segs.length === 0) return null;
  const first = segs[0], last = segs[segs.length - 1];
  if (adc <= first.lo) return Math.max(0, leftSlope * adc);
  if (adc > last.hi) return Math.max(0, pHi + rightSlope * (adc - last.hi));
  for (const seg of segs) {
    if (adc <= seg.hi) return Math.max(0, seg.a * adc * adc + seg.b * adc + seg.c);
  }
  return null;
}

/**
 * 计算平均压强（kPa）
 * @param {number} adcAvg  - ADC均值（坐垫TOP-70，靠背TOP-46，真人段全部点）
 * @param {number} nValid  - 有效点数
 * @param {'seat'|'backrest'} sensor
 * @returns {number|null}
 */
function estimatePressure(adcAvg, nValid, sensor) {
  if (adcAvg <= 0) return null;
  const isBackrest = sensor === 'backrest';
  const humanThresh = isBackrest ? BACK_HUMAN_THRESHOLD : SEAT_HUMAN_THRESHOLD;
  if (nValid !== undefined && nValid >= humanThresh) {
    const alpha = isBackrest ? BACK_HUMAN_ALPHA : SEAT_HUMAN_ALPHA;
    return parseFloat(Math.max(0, alpha * adcAvg * adcAvg).toFixed(2));
  }
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
 * @param {'seat'|'backrest'} sensor
 * @param {number} adcAvg  - ADC均值
 * @returns {number|null}
 */
function estimateMaxPressure(adcMax, nValid, sensor, adcAvg) {
  if (adcMax <= 0 || adcAvg <= 0) return null;
  const avgP = estimatePressure(adcAvg, nValid, sensor);
  if (avgP === null || avgP <= 0) return null;
  return parseFloat(Math.max(0, avgP * (adcMax / adcAvg)).toFixed(2));
}

/**
 * 计算单点压强（kPa）
 *
 * 砝码模式：P[i,j] = P_avg × ADC[i,j] / ADC_avg
 *   - 以平均压强为基准，按各点ADC比例分配
 *   - 所有有效点压强的均值 = P_avg
 *
 * 真人模式：P[i,j] = α × ADC[i,j]²
 *   - 直接用单点ADC代入真人段公式
 *
 * @param {number} adcPoint - 该点的ADC值（过滤后，0表示无效点）
 * @param {number} adcAvg   - 当前帧ADC均值（坐垫TOP-70，靠背TOP-46，真人段全部点）
 * @param {number} nValid   - 有效点数（用于判断砝码/真人模式）
 * @param {'seat'|'backrest'} sensor
 * @param {number|null} pAvg - 当前帧平均压强（kPa），砝码模式必须提供；真人模式可不提供
 * @returns {number} 该点压强（kPa），无效点返回0
 */
function estimatePointPressure(adcPoint, adcAvg, nValid, sensor, pAvg) {
  if (adcPoint <= 0) return 0;  // 无效点（已过滤）
  const isBackrest = sensor === 'backrest';
  const humanThresh = isBackrest ? BACK_HUMAN_THRESHOLD : SEAT_HUMAN_THRESHOLD;

  // 真人模式：P[i,j] = α × ADC[i,j]²
  if (nValid !== undefined && nValid >= humanThresh) {
    const alpha = isBackrest ? BACK_HUMAN_ALPHA : SEAT_HUMAN_ALPHA;
    return parseFloat(Math.max(0, alpha * adcPoint * adcPoint).toFixed(4));
  }

  // 砝码模式：P[i,j] = P_avg × ADC[i,j] / ADC_avg
  if (pAvg === null || pAvg === undefined || pAvg <= 0) {
    // 若未提供P_avg，自动计算
    pAvg = estimatePressure(adcAvg, nValid, sensor) || 0;
  }
  if (adcAvg <= 0) return 0;
  return parseFloat(Math.max(0, pAvg * adcPoint / adcAvg).toFixed(4));
}

// Node.js 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { estimatePressure, estimateMaxPressure, estimatePointPressure };
}

// =====================================================================
// 使用示例
// =====================================================================
/*
// 平均压强
estimatePressure(92.78, 120, 'seat')       // 坐垫1砝码 → 约2.5kPa
estimatePressure(125.61, 100, 'backrest')  // 靠背1砝码 → 约2.5kPa
estimatePressure(100, 1200, 'seat')        // 坐垫真人段 → 约6.33kPa

// 单点压强（砝码模式）
// 假设当前帧: ADC_avg=92.78, P_avg=2.5kPa, 某点ADC=120
estimatePointPressure(120, 92.78, 120, 'seat', 2.5)   // → 约3.23kPa（高于均值）
estimatePointPressure(60, 92.78, 120, 'seat', 2.5)    // → 约1.62kPa（低于均值）
estimatePointPressure(0, 92.78, 120, 'seat', 2.5)     // → 0（无效点）

// 单点压强（真人模式）
estimatePointPressure(100, 95, 1200, 'seat', null)    // → 约6.33kPa
estimatePointPressure(150, 95, 1200, 'seat', null)    // → 约14.25kPa
*/
