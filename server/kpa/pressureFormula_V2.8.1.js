/**
 * 坐垫 8bit 压强标定 V2.8.1
 * 
 * 计算链路：
 *   1. 扫描整帧找 ADC_max
 *   2. 动态系数 scale = 0.0063636 × ADC_max + 0.5
 *      锚点：ADC_max=110 → scale=1.2，ADC_max=220 → scale=1.9
 *   3. 逐点 P_i = scale × master(ADC_i)
 *   4. 平均压强 = mean(P_i)，最大压强 = max(P_i)
 */

// ===================== 7 段分段二次基准公式 =====================
// 基于 80 组新传感器数据（10只×8级砝码）PCHIP 拟合
// 节点：(112.345, 2.5) (147.405, 5.0) (163.910, 7.5) (173.995, 10.0)
//       (181.185, 12.5) (186.475, 15.0) (190.905, 17.5) (195.235, 20.0)
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

// 高压延伸：ADC 195.235→240.235，压强 20→22 kPa
const HIGH_EXT = { adcStart: 195.235, adcEnd: 240.235, pStart: 20.0, pEnd: 22.0, slope: 0.044444 };

// 压强封顶
const P_CAP = 22.5;

// 有效点最小 ADC 阈值
const MIN_ADC = 30;

// 动态系数参数：scale = K × ADC_max + B
const SCALE_K = 0.0063636; // (1.9-1.2)/(220-110)
const SCALE_B = 0.5;       // 1.2 - K×110

/**
 * 基准公式 master(adc)：7段分段二次 + 低ADC外推 + 高压延伸 + 封顶
 * @param {number} adc - 单点 ADC 值
 * @returns {number|null} 压强 kPa，无效返回 null
 * @param {'seat'|'backrest'} [sensor='seat'] - Sensor type used to select calibration segments.
 */
function master(adc, sensor = 'seat') {
  if (adc <= 0) return null;
  const segments = sensor === 'backrest' ? BACK_SEGS : SEAT_SEGS;

  // 低 ADC 外推：过原点线性
  if (adc < segments[0].lo) {
    return (2.5 / 112.345) * adc;
  }

  // 7 段分段二次
  for (const seg of segments) {
    if (adc >= seg.lo && adc <= seg.hi) {
      const p = seg.a * adc * adc + seg.b * adc + seg.c;
      return Math.min(p, P_CAP);
    }
  }

  // 高压延伸
  if (adc > segments[segments.length - 1].hi && adc <= HIGH_EXT.adcEnd) {
    const p = HIGH_EXT.pStart + HIGH_EXT.slope * (adc - HIGH_EXT.adcStart);
    return Math.min(p, P_CAP);
  }

  // 超出高压延伸范围
  if (adc > HIGH_EXT.adcEnd) {
    return Math.min(22.0, P_CAP);
  }

  return null;
}

/**
 * 计算动态缩放系数
 * @param {number} adcMax - 当前帧 ADC 最大值
 * @returns {number} 缩放系数
 */
function computeScale(adcMax) {
  return SCALE_K * adcMax + SCALE_B;
}

/**
 * 计算整帧压强（主函数）
 * @param {number[][]} matrix - 二维 ADC 矩阵（如 46×46）
 * @param {number|null} [scaleOverride=null] - 可选固定系数覆盖，null 则使用动态计算
 * @returns {{ avg: number, max: number, count: number, scale: number, adcMax: number }|null}
 * @param {'seat'|'backrest'} [sensor='seat'] - Sensor type forwarded to master().
 */
function calcPressure(matrix, scaleOverride, sensor = 'seat') {
  if (!matrix || matrix.length === 0) return null;

  // 第一遍：找 ADC 最大值
  let adcMax = 0;
  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < matrix[r].length; c++) {
      if (matrix[r][c] > adcMax) adcMax = matrix[r][c];
    }
  }

  // 确定缩放系数
  const scale = (scaleOverride != null) ? scaleOverride : computeScale(adcMax);

  // 第二遍：逐点计算压强
  let sum = 0, mx = 0, n = 0;
  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < matrix[r].length; c++) {
      const adc = matrix[r][c];
      if (adc > MIN_ADC) {
        const base = master(adc, sensor);
        if (base === null) continue;
        const p = scale * base;
        sum += p;
        n++;
        if (p > mx) mx = p;
      }
    }
  }

  if (n === 0) return null;

  return {
    avg: Math.round((sum / n) * 100) / 100,
    max: Math.round(mx * 100) / 100,
    count: n,
    scale: Math.round(scale * 10000) / 10000,
    adcMax: adcMax,
  };
}

// ===================== 导出 =====================
module.exports = { master, computeScale, calcPressure, SEAT_SEGS, BACK_SEGS, HIGH_EXT, P_CAP, MIN_ADC, SCALE_K, SCALE_B };

// ===================== 测试验证 =====================
if (require.main === module) {
  console.log("=== 坐垫 8bit 压强标定 V2.8.1 验证 ===\n");

  // 验证动态系数锚点
  console.log("动态系数验证：");
  console.log(`  ADC_max=110 → scale=${computeScale(110).toFixed(4)}（期望 1.2）`);
  console.log(`  ADC_max=220 → scale=${computeScale(220).toFixed(4)}（期望 1.9）`);
  console.log(`  ADC_max=165 → scale=${computeScale(165).toFixed(4)}（中间值）`);

  // 验证 master 公式节点
  console.log("\nmaster 公式节点验证：");
  const nodes = [112.345, 147.405, 163.910, 173.995, 181.185, 186.475, 190.905, 195.235];
  const expected = [2.5, 5.0, 7.5, 10.0, 12.5, 15.0, 17.5, 20.0];
  for (let i = 0; i < nodes.length; i++) {
    const p = master(nodes[i]);
    console.log(`  ADC=${nodes[i].toFixed(3)} → P=${p.toFixed(4)} kPa（期望 ${expected[i].toFixed(1)}）`);
  }

  // 模拟一帧数据
  console.log("\n模拟帧计算：");
  const testMatrix = Array.from({ length: 10 }, () =>
    Array.from({ length: 10 }, () => Math.floor(Math.random() * 180) + 40)
  );
  const result = calcPressure(testMatrix);
  console.log(`  矩阵 10×10，ADC_max=${result.adcMax}，scale=${result.scale}`);
  console.log(`  平均压强=${result.avg} kPa，最大压强=${result.max} kPa，有效点=${result.count}`);
}
