/**
 * 假人压强标定 JavaScript 独立模块
 * 版本：V2.10.4
 * 作者：Manus AI
 *
 * 浏览器用法：
 *   <script src="dummyPressure_v2.10.4.js"></script>
 *   const result = DummyPressureV2104.calculateDummyMatrixPressure(matrix, "dummy-left-leg-32x6");
 *
 * Node.js CommonJS 用法：
 *   const calibration = require("./dummyPressure_v2.10.4.js");
 *   const result = calibration.calculateDummyMatrixPressure(matrix, "dummy-body-27x12");
 *
 * 计算口径：
 * - 可调用 bodyAdcToKpa / legAdcToKpa 把热力图单点 ADC 转为基础压强。
 * - 有效点必须满足：未被 validMask 排除、数值有限、ADC > 10。
 * - 3 <= N < 100：各部位分别取自身 Top50 ADC 均值并代入自身 master。
 * - N >= 100：每个有效点代入该部位自身 master 后乘以 2 一次，再取均值与最大值。
 * - 上衣/袖子 master：上衣数据九段单调三次 Hermite；左右腿 master：低 ADC 标定延伸连续接回反放砝码全局线性式。
 */
(function attachDummyPressure(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.DummyPressureV2104 = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createDummyPressureApi() {
  "use strict";

  const VERSION = "2.10.4";
  const DUMMY_TOP_N = 50;
  const DUMMY_LEG_TOP_N = 50;
  const DUMMY_MIN_VALID_POINTS = 3;
  const DUMMY_POINTWISE_THRESHOLD = 150;
  const DUMMY_POINTWISE_MULTIPLIER = 2;
  const DUMMY_VALID_ADC_THRESHOLD = 10;

  const DUMMY_SEAT_TYPES = Object.freeze(["dummy-sleeve-2x18", "dummy-body-27x12"]);
  const DUMMY_LEG_TYPES = Object.freeze(["dummy-left-leg-32x6", "dummy-right-leg-32x6"]);
  const DUMMY_SENSOR_TYPES = Object.freeze([...DUMMY_SEAT_TYPES, ...DUMMY_LEG_TYPES]);

  const DUMMY_BODY_MASTER_CONFIG = Object.freeze({
    name: "上衣/袖子九段单调三次 master 公式 (V2.10.4)",
    segments: Object.freeze([
      Object.freeze({ lo: 125.42, hi: 150.912, a: -0.860843369158, b: 2.776245786873, c: 0.584597582285, d: 2.5 }),
      Object.freeze({ lo: 150.912, hi: 162.9, a: -0.232038299136, b: 1.060452943962, c: 1.671585355174, d: 5 }),
      Object.freeze({ lo: 162.9, hi: 170.584, a: -0.104092571153, b: 0.619394886779, c: 1.984697684375, d: 7.5 }),
      Object.freeze({ lo: 170.584, hi: 176.204, a: -0.08865395, b: 0.459424542929, c: 2.129229407071, d: 10 }),
      Object.freeze({ lo: 176.204, hi: 180.724, a: 0.234573499059, b: 0.027852261432, c: 2.237574239509, d: 12.5 }),
      Object.freeze({ lo: 180.724, hi: 183.832, a: -0.477064448841, b: 0.916295931434, c: 2.060768517408, d: 15 }),
      Object.freeze({ lo: 183.832, hi: 187.036, a: 0.499600813529, b: -0.53781933867, c: 2.538218525141, d: 17.5 }),
      Object.freeze({ lo: 187.036, hi: 189.296, a: 0.045135831524, b: 0.365999008752, c: 2.088865159724, d: 20 }),
      Object.freeze({ lo: 189.296, hi: 190.896, a: -0.104437655436, b: 0.511502666552, c: 2.092934988885, d: 22.5 }),
    ]),
    highExt: Object.freeze({ adcStart: 190.896, adcEnd: 255, pStart: 25, pEnd: 27.5, slope: 0.03899912642 }),
    pCap: 27.5,
  });

  const DUMMY_LEG_MASTER_CONFIG = Object.freeze({
    name: "反放砝码腿部 master（低 ADC 连续延伸，V2.10.4）",
    slope: 0.387427822782,
    intercept: -51.874539247424,
    firstCalibrationAdc: 132.156,
    firstCalibrationKpa: 2.5,
    lowSlope: 0.0189170374406005,
    joinAdc: 140.7680353218587,
    pCap: 27.5,
  });

  function round(value, digits) {
    const precision = digits === undefined ? 2 : digits;
    const factor = 10 ** precision;
    return Math.round((value + Number.EPSILON) * factor) / factor;
  }

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(value, maximum));
  }

  function isDummySensorType(sensorType) {
    return DUMMY_SENSOR_TYPES.includes(sensorType);
  }

  function isDummyLegSensor(sensorType) {
    return DUMMY_LEG_TYPES.includes(sensorType);
  }

  function getDummyTopN(sensorType) {
    if (isDummyLegSensor(sensorType)) return DUMMY_LEG_TOP_N;
    if (isDummySensorType(sensorType)) return DUMMY_TOP_N;
    return null;
  }

  function evaluateBodyMasterSegment(adc, segment) {
    const t = (adc - segment.lo) / (segment.hi - segment.lo);
    return ((segment.a * t + segment.b) * t + segment.c) * t + segment.d;
  }

  /** 单个 ADC 按上衣/袖子九段 master 转换为基础压强，返回未四舍五入的 kPa。 */
  function bodyAdcToKpaRaw(adc) {
    if (!Number.isFinite(adc) || adc <= 0) return 0;
    const segments = DUMMY_BODY_MASTER_CONFIG.segments;
    const first = segments[0];
    const last = segments[segments.length - 1];
    let pressure;

    if (adc <= first.lo) {
      pressure = (first.d / first.lo) * adc;
    } else if (adc > last.hi) {
      const ext = DUMMY_BODY_MASTER_CONFIG.highExt;
      pressure = adc >= ext.adcEnd ? ext.pEnd : ext.pStart + ext.slope * (adc - ext.adcStart);
    } else {
      const segment = segments.find((item) => adc <= item.hi) || last;
      pressure = evaluateBodyMasterSegment(adc, segment);
    }
    return clamp(pressure, 0, DUMMY_BODY_MASTER_CONFIG.pCap);
  }

  function bodyAdcToKpa(adc) {
    return round(bodyAdcToKpaRaw(adc));
  }

  /** 兼容旧接口名；其含义固定为上衣/袖子九段 master。 */
  function masterAdcToKpaRaw(adc) {
    return bodyAdcToKpaRaw(adc);
  }

  /** 兼容旧接口名；其含义固定为上衣/袖子九段 master。 */
  function masterAdcToKpa(adc) {
    return bodyAdcToKpa(adc);
  }

  /** 单个 ADC 按反放砝码腿部 master 转换；低端连续延伸消除有效点伪零。 */
  function legAdcToKpaRaw(adc) {
    if (!Number.isFinite(adc) || adc <= 0) return 0;
    const pressure = adc <= DUMMY_LEG_MASTER_CONFIG.joinAdc
      ? DUMMY_LEG_MASTER_CONFIG.lowSlope * adc
      : DUMMY_LEG_MASTER_CONFIG.slope * adc + DUMMY_LEG_MASTER_CONFIG.intercept;
    return clamp(pressure, 0, DUMMY_LEG_MASTER_CONFIG.pCap);
  }

  function legAdcToKpa(adc) {
    return round(legAdcToKpaRaw(adc));
  }

  /** 从矩阵中提取统计有效点；validMask 中 false 表示排除。 */
  function extractValidValues(matrix, validMask) {
    const values = [];
    if (!Array.isArray(matrix)) return values;
    for (let row = 0; row < matrix.length; row += 1) {
      const rowValues = Array.isArray(matrix[row]) ? matrix[row] : [];
      for (let column = 0; column < rowValues.length; column += 1) {
        if (validMask && validMask[row] && validMask[row][column] === false) continue;
        const value = rowValues[column];
        if (Number.isFinite(value) && value > DUMMY_VALID_ADC_THRESHOLD) values.push(value);
      }
    }
    return values;
  }

  function topAverage(values, topCount) {
    const count = Math.min(topCount, values.length);
    if (count === 0) return 0;
    const top = [...values].sort((a, b) => b - a).slice(0, count);
    return top.reduce((sum, value) => sum + value, 0) / count;
  }

  function emptyResult(nonZeroCount, topCount) {
    return { avgKpa: null, maxKpa: null, nonZeroCount, topCount, mode: "none" };
  }

  function calculateTop50ValuesPressure(values, topCount, masterRaw) {
    const nonZeroCount = values.length;
    if (nonZeroCount < DUMMY_MIN_VALID_POINTS) return emptyResult(nonZeroCount, topCount);
    const topAvg = topAverage(values, topCount);
    const maxAdc = Math.max(...values);
    const avgKpa = round(masterRaw(topAvg));
    const maxKpa = round(avgKpa * (maxAdc / topAvg));
    return { avgKpa, maxKpa, nonZeroCount, topCount, mode: "top50" };
  }

  function calculatePointwiseValuesPressure(values, masterRaw) {
    const pointKpas = values.map((value) => masterRaw(value) * DUMMY_POINTWISE_MULTIPLIER);
    const avgKpa = round(pointKpas.reduce((sum, value) => sum + value, 0) / pointKpas.length);
    const maxKpa = round(Math.max(...pointKpas));
    return { avgKpa, maxKpa, nonZeroCount: values.length, topCount: 0, mode: "pointwise_x2" };
  }

  function calculateBodyValuesPressure(values) {
    if (values.length < DUMMY_POINTWISE_THRESHOLD) {
      return calculateTop50ValuesPressure(values, DUMMY_TOP_N, bodyAdcToKpaRaw);
    }
    return calculatePointwiseValuesPressure(values, bodyAdcToKpaRaw);
  }

  function calculateLegValuesPressure(values) {
    if (values.length < DUMMY_POINTWISE_THRESHOLD) {
      return calculateTop50ValuesPressure(values, DUMMY_LEG_TOP_N, legAdcToKpaRaw);
    }
    return calculatePointwiseValuesPressure(values, legAdcToKpaRaw);
  }

  /**
   * 由一维 ADC 数组计算压强统计。函数会再次执行有限值与 ADC>10 筛选。
   */
  function calculateDummyValuesPressure(values, sensorType) {
    if (!isDummySensorType(sensorType)) return null;
    const validValues = Array.isArray(values)
      ? values.filter((value) => Number.isFinite(value) && value > DUMMY_VALID_ADC_THRESHOLD)
      : [];
    return isDummyLegSensor(sensorType)
      ? calculateLegValuesPressure(validValues)
      : calculateBodyValuesPressure(validValues);
  }

  /** 假人矩阵统一入口。 */
  function calculateDummyMatrixPressure(matrix, sensorType, validMask) {
    if (!isDummySensorType(sensorType)) return null;
    const values = extractValidValues(matrix, validMask || null);
    return isDummyLegSensor(sensorType)
      ? calculateLegValuesPressure(values)
      : calculateBodyValuesPressure(values);
  }

  /** 内置自检：覆盖两个 master、Top50 独立分支、N=100 边界、倍率和有效点阈值。 */
  function runSelfCheck() {
    const checks = [];
    function add(name, passed, actual, expected) {
      checks.push({ name, passed: Boolean(passed), actual, expected });
    }
    function equal(actual, expected, tolerance) {
      return Math.abs(actual - expected) <= (tolerance === undefined ? 1e-9 : tolerance);
    }

    const bodyNodes = [
      [125.42, 2.5], [150.912, 5], [162.9, 7.5], [170.584, 10], [176.204, 12.5],
      [180.724, 15], [183.832, 17.5], [187.036, 20], [189.296, 22.5], [190.896, 25],
    ];
    bodyNodes.forEach(([adc, expected]) => {
      const actual = bodyAdcToKpa(adc);
      add(`上衣 master 节点 ADC=${adc}`, equal(actual, expected), actual, expected);
    });

    [[11, 0.21], [126.72, 2.4], [132.156, 2.5], [140.7680353218587, 2.66], [154.024, 7.8], [176.36, 16.45], [185.092, 19.84], [255, 27.5]].forEach(([adc, expected]) => {
      const actual = legAdcToKpa(adc);
      add(`腿部低 ADC 修复 master ADC=${adc}`, equal(actual, expected), actual, expected);
    });

    let bodyMonotonic = true;
    let legMonotonic = true;
    let previousBody = bodyAdcToKpa(0);
    let previousLeg = legAdcToKpa(0);
    for (let adc = 0.25; adc <= 255; adc += 0.25) {
      const currentBody = bodyAdcToKpa(adc);
      const currentLeg = legAdcToKpa(adc);
      if (currentBody < previousBody) bodyMonotonic = false;
      if (currentLeg < previousLeg) legMonotonic = false;
      previousBody = currentBody;
      previousLeg = currentLeg;
    }
    add("上衣 master 0–255 ADC 全域单调", bodyMonotonic, bodyMonotonic, true);
    add("腿部 master 0–255 ADC 全域单调", legMonotonic, legMonotonic, true);

    const lowValues = [...Array(50).fill(176.36), ...Array(10).fill(126.72)];
    const lowBody = calculateDummyValuesPressure(lowValues, "dummy-body-27x12");
    const lowLeg = calculateDummyValuesPressure(lowValues, "dummy-left-leg-32x6");
    add("N<100 上衣使用自身 Top50 master", lowBody.mode === "top50" && lowBody.avgKpa === bodyAdcToKpa(176.36), lowBody, `avgKpa=${bodyAdcToKpa(176.36)}`);
    add("N<100 腿部使用自身 Top50 master", lowLeg.mode === "top50" && lowLeg.avgKpa === legAdcToKpa(176.36), lowLeg, `avgKpa=${legAdcToKpa(176.36)}`);
    add("N<100 两类部位不共用 master", lowBody.avgKpa !== lowLeg.avgKpa, [lowBody.avgKpa, lowLeg.avgKpa], "不同");

    const bodyBoundary = calculateDummyMatrixPressure([Array(100).fill(176.36)], "dummy-sleeve-2x18");
    const legBoundary = calculateDummyMatrixPressure([Array(100).fill(176.36)], "dummy-right-leg-32x6");
    add("上衣/袖子 N=100 进入逐点×2", bodyBoundary.mode === "pointwise_x2", bodyBoundary.mode, "pointwise_x2");
    add("上衣/袖子 N=100 只乘一次 2", bodyBoundary.avgKpa === round(bodyAdcToKpaRaw(176.36) * 2), bodyBoundary.avgKpa, round(bodyAdcToKpaRaw(176.36) * 2));
    add("腿部 N=100 进入逐点×2", legBoundary.mode === "pointwise_x2", legBoundary.mode, "pointwise_x2");
    add("腿部 N=100 只乘一次 2", legBoundary.avgKpa === round(legAdcToKpaRaw(176.36) * 2), legBoundary.avgKpa, round(legAdcToKpaRaw(176.36) * 2));

    const thresholdResult = calculateDummyMatrixPressure([[10, 9, 8, 176.36, 176.36]], "dummy-left-leg-32x6");
    add("ADC>10 有效点阈值", thresholdResult.nonZeroCount === 2, thresholdResult.nonZeroCount, 2);
    add("不足 3 点不输出", thresholdResult.mode === "none" && thresholdResult.avgKpa === null, thresholdResult, "mode=none, avgKpa=null");

    return {
      version: VERSION,
      pass: checks.every((item) => item.passed),
      passed: checks.filter((item) => item.passed).length,
      total: checks.length,
      checks,
    };
  }

  return Object.freeze({
    VERSION,
    DUMMY_TOP_N,
    DUMMY_LEG_TOP_N,
    DUMMY_MIN_VALID_POINTS,
    DUMMY_POINTWISE_THRESHOLD,
    DUMMY_POINTWISE_MULTIPLIER,
    DUMMY_VALID_ADC_THRESHOLD,
    DUMMY_SEAT_TYPES,
    DUMMY_LEG_TYPES,
    DUMMY_SENSOR_TYPES,
    DUMMY_BODY_MASTER_CONFIG,
    DUMMY_LEG_MASTER_CONFIG,
    DUMMY_MASTER_CONFIG: DUMMY_BODY_MASTER_CONFIG,
    DUMMY_LEG_LINEAR_CONFIG: DUMMY_LEG_MASTER_CONFIG,
    isDummySensorType,
    isDummyLegSensor,
    getDummyTopN,
    bodyAdcToKpaRaw,
    bodyAdcToKpa,
    masterAdcToKpaRaw,
    masterAdcToKpa,
    legAdcToKpaRaw,
    legAdcToKpa,
    extractValidValues,
    topAverage,
    calculateDummyValuesPressure,
    calculateDummyMatrixPressure,
    runSelfCheck,
  });
});
