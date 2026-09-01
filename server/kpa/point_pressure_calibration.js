/**
 * 压力传感器标定公式导出
 *
 * 坐垫：V2.7.46（第5—70位ADC均值，6段PCHIP局部三次）
 * 靠背：V2.7.52（TOP46 ADC均值，7段中位数节点线性）
 *
 * 砝码段：有效点数 <= 300。
 * 真人段：有效点数 > 300，每个有效点先执行对应基础公式，再乘独立k。
 * 砝码段逐点压强：按各点基础曲线响应比例分配，并保证AVG(Pi)=拟合平均压强。
 * 本文件不依赖浏览器API，可在浏览器、Node.js和上位机JavaScript运行环境中使用。
 *
 * 整帧ADC矩阵直接转换为压强矩阵：
 *   const pressureMatrix = PressureCalibrationExport.adcMatrixToPressureMatrix(filteredMatrix, "seat", 2.2);
 *
 * 直接查询一个点：
 *   const p = PressureCalibrationExport.getPointPressure(filteredMatrix, row, column, "seat", 2.2);
 *
 * 一帧内反复查询多个点（推荐，整帧只计算一次）：
 *   const resolver = PressureCalibrationExport.createPointPressureResolver(filteredMatrix, "seat", 2.2);
 *   const p1 = resolver.getPointPressure(10, 15);
 *   const p2 = resolver.getPointPressure(11, 15);
 *   const pressureMatrix = resolver.pressureMatrixKPa;
 */

"use strict";

const HUMAN_VALID_POINT_THRESHOLD = 300;
const DEFAULT_HUMAN_COEFFICIENT = 2.2;
const MIN_HUMAN_COEFFICIENT = 1.0;
const MAX_HUMAN_COEFFICIENT = 6.0;
const NORMALIZATION_EPSILON = 1e-12;

const SEAT_V2746 = Object.freeze({
  key: "seat",
  version: "V2.7.46",
  calibrationId: "SeatSupplementPCHIP-20260828",
  inputLabel: "有效ADC降序第5—70位均值",
  topStartRank: 5,
  topEndRank: 70,
  lowMode: "zero-origin",
  leftSlope: 0.029128888206340246,
  highPressureClampKPa: 18.5,
  segments: Object.freeze([
    Object.freeze({ lo: 85.82545211786852, hi: 121.5036992910407, a: 2.5, b: 0.02514685021658099, c: 0.0017825667387957197, d: -1.4670793073122023e-5 }),
    Object.freeze({ lo: 121.5036992910407, hi: 139.641626683983, a: 5, b: 0.09631956352570038, c: 0.0027903094592002, d: -2.7652576622304387e-5 }),
    Object.freeze({ lo: 139.641626683983, hi: 151.33637260464792, a: 7.5, b: 0.17024862445085923, c: 0.005306109727072367, d: -0.00013549326385175618 }),
    Object.freeze({ lo: 151.33637260464792, hi: 160.67119079377784, a: 10, b: 0.23876277957790853, c: 0.004456199006891006, d: -0.000143977733492508 }),
    Object.freeze({ lo: 160.67119079377784, hi: 168.94354707035922, a: 12.5, b: 0.2843202406683852, c: 0.0183281389088602, d: -0.0019541445263075077 }),
    Object.freeze({ lo: 168.94354707035922, hi: 189.17, a: 15, b: 0.1863766889442589, c: -9.649901079908721e-5, d: -0.00014867500346334297 }),
  ]),
});

const BACKREST_V2752 = Object.freeze({
  key: "backrest",
  version: "V2.7.52",
  calibrationId: "Sheet1MedianTop46Linear-20260828",
  inputLabel: "有效ADC最高TOP46均值",
  topStartRank: 1,
  topEndRank: 46,
  lowMode: "first-segment",
  leftSlope: 0.061300639659,
  highPressureClampKPa: 18.5,
  segments: Object.freeze([
    Object.freeze({ lo: 98.304347826, hi: 139.086956522, a: 2.5, b: 0.061300639659, c: 0, d: 0 }),
    Object.freeze({ lo: 139.086956522, hi: 158.195652174, a: 5, b: 0.130830489192, c: 0, d: 0 }),
    Object.freeze({ lo: 158.195652174, hi: 171.282608696, a: 7.5, b: 0.191029900332, c: 0, d: 0 }),
    Object.freeze({ lo: 171.282608696, hi: 180.086956522, a: 10, b: 0.283950617284, c: 0, d: 0 }),
    Object.freeze({ lo: 180.086956522, hi: 188.217391304, a: 12.5, b: 0.307486631016, c: 0, d: 0 }),
    Object.freeze({ lo: 188.217391304, hi: 194.47826087, a: 15, b: 0.399305555556, c: 0, d: 0 }),
    Object.freeze({ lo: 194.47826087, hi: 196.982608696, a: 17.5, b: 0.399305555556, c: 0, d: 0 }),
  ]),
});

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function roundPressure(value) {
  return Number(Math.max(0, value).toFixed(2));
}

function evaluateSegment(adc, segment) {
  const dx = adc - segment.lo;
  return segment.a + segment.b * dx + segment.c * dx * dx + segment.d * dx * dx * dx;
}

function getProfile(sensor) {
  if (sensor === "seat" || sensor === "坐垫") return SEAT_V2746;
  if (sensor === "backrest" || sensor === "靠背") return BACKREST_V2752;
  throw new RangeError(`未知传感器类型：${sensor}`);
}

/**
 * 计算单个ADC对应的基础压强，不乘真人段k。
 * @param {number} adc
 * @param {"seat"|"backrest"|"坐垫"|"靠背"} sensor
 * @returns {number|null} 未四舍五入的基础压强；无效ADC返回null。
 */
function calculateBasePressure(adc, sensor) {
  const profile = getProfile(sensor);
  const value = Number(adc);
  if (!Number.isFinite(value) || value <= 0) return null;

  const first = profile.segments[0];
  const last = profile.segments[profile.segments.length - 1];
  if (value <= first.lo) {
    const raw = profile.lowMode === "zero-origin"
      ? profile.leftSlope * value
      : evaluateSegment(value, first);
    return clamp(raw, 0, profile.highPressureClampKPa);
  }
  if (value > last.hi) return profile.highPressureClampKPa;

  for (const segment of profile.segments) {
    if (value <= segment.hi) {
      return clamp(evaluateSegment(value, segment), 0, profile.highPressureClampKPa);
    }
  }
  return null;
}

/** 将二维矩阵或一维数组转换为正数ADC列表。 */
function flattenPositiveAdc(data) {
  if (!Array.isArray(data)) throw new TypeError("data必须是一维ADC数组或二维ADC矩阵");
  const result = [];
  for (const item of data) {
    if (Array.isArray(item)) {
      for (const value of item) {
        const number = Number(value);
        if (Number.isFinite(number) && number > 0) result.push(number);
      }
    } else {
      const number = Number(item);
      if (Number.isFinite(number) && number > 0) result.push(number);
    }
  }
  return result;
}

/**
 * 计算砝码段公式输入。
 * 坐垫V2.7.46取第5—70位；不足5点时取全部。
 * 靠背V2.7.52取TOP46；不足46点时取全部。
 */
function getCalibrationInput(data, sensor) {
  const profile = getProfile(sensor);
  const values = flattenPositiveAdc(data).sort((a, b) => b - a);
  const startIndex = values.length >= profile.topStartRank ? profile.topStartRank - 1 : 0;
  const endExclusive = Math.min(profile.topEndRank, values.length);
  const selected = values.slice(startIndex, endExclusive);
  const mean = selected.length
    ? selected.reduce((sum, value) => sum + value, 0) / selected.length
    : 0;
  return {
    mean,
    selectedCount: selected.length,
    validCount: values.length,
    maxAdc: values[0] ?? 0,
    inputLabel: profile.inputLabel,
  };
}

function normalizeHumanCoefficient(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return DEFAULT_HUMAN_COEFFICIENT;
  return clamp(number, MIN_HUMAN_COEFFICIENT, MAX_HUMAN_COEFFICIENT);
}

/** 将一维ADC数组或二维ADC矩阵统一为二维结构，并保留原始形状标记。 */
function normalizeDataShape(data) {
  if (!Array.isArray(data)) throw new TypeError("data必须是一维ADC数组或二维ADC矩阵");
  const isMatrix = data.some(Array.isArray);
  if (isMatrix && !data.every(Array.isArray)) {
    throw new TypeError("data不能混合一维数值和二维数组");
  }
  return { matrix: isMatrix ? data : [data], isMatrix };
}

/**
 * 砝码段逐点压强比例归一化。
 *
 * Pbar = F(X)
 * qi   = MAX(0, F(ADCi))
 * Pi   = Pbar × qi / AVG(q)
 *
 * 因此AVG(Pi)=Pbar。函数只适用于有效点数<=300的砝码段。
 * 为保持均值守恒，归一化后的个别Pi可能高于基础曲线18.5kPa上限；
 * 不应在归一化后直接逐点截断，否则AVG(Pi)将不再等于Pbar。
 */
function calculateWeightPointPressures(data, sensor) {
  const profile = getProfile(sensor);
  const { matrix, isMatrix } = normalizeDataShape(data);
  const validPoints = [];
  for (let row = 0; row < matrix.length; row += 1) {
    for (let column = 0; column < matrix[row].length; column += 1) {
      const adc = Number(matrix[row][column]);
      if (Number.isFinite(adc) && adc > 0) validPoints.push({ row, column, adc });
    }
  }

  const input = getCalibrationInput(validPoints.map((point) => point.adc), sensor);
  if (input.validCount > HUMAN_VALID_POINT_THRESHOLD) {
    throw new RangeError(`逐点比例归一化仅适用于砝码段：当前有效点数${input.validCount}>${HUMAN_VALID_POINT_THRESHOLD}`);
  }

  const pressureMatrixKPa = matrix.map((row) => row.map(() => 0));
  if (validPoints.length === 0) {
    return {
      ...input,
      sensor: profile.key,
      version: profile.version,
      pressureMatrixKPa: isMatrix ? pressureMatrixKPa : pressureMatrixKPa[0],
      pressureValuesKPa: [],
      relativeCurveWeights: [],
      targetAveragePressureKPa: null,
      actualAveragePressureKPa: null,
      maxPressureKPa: null,
      curveResponseMeanKPa: 0,
      normalizationScale: null,
      meanConservationErrorKPa: null,
      fallbackMode: "no-valid-points",
    };
  }

  const fittedAverage = calculateBasePressure(input.mean, sensor);
  if (fittedAverage === null || !Number.isFinite(fittedAverage)) {
    throw new RangeError("基础公式无法为排序ADC均值计算拟合平均压强");
  }
  const targetAveragePressureKPa = Math.max(0, fittedAverage);
  const curveResponses = validPoints.map(({ adc }) => {
    const response = calculateBasePressure(adc, sensor);
    return response === null ? 0 : Math.max(0, response);
  });
  const curveResponseMeanKPa = curveResponses.reduce((sum, value) => sum + value, 0) / curveResponses.length;

  let pressureValuesKPa;
  let relativeCurveWeights;
  let normalizationScale = null;
  let fallbackMode = "none";
  if (targetAveragePressureKPa <= NORMALIZATION_EPSILON) {
    pressureValuesKPa = curveResponses.map(() => 0);
    relativeCurveWeights = curveResponses.map(() => 0);
    normalizationScale = curveResponseMeanKPa > NORMALIZATION_EPSILON ? 0 : null;
    fallbackMode = "all-zero";
  } else if (curveResponseMeanKPa <= NORMALIZATION_EPSILON) {
    pressureValuesKPa = curveResponses.map(() => targetAveragePressureKPa);
    relativeCurveWeights = curveResponses.map(() => 1);
    fallbackMode = "equal-distribution";
  } else {
    normalizationScale = targetAveragePressureKPa / curveResponseMeanKPa;
    relativeCurveWeights = curveResponses.map((response) => response / curveResponseMeanKPa);
    pressureValuesKPa = curveResponses.map((response) => response * normalizationScale);
  }

  // 修正浮点累计误差，使ΣPi=N×Pbar在机器精度内严格成立。
  const targetSum = targetAveragePressureKPa * pressureValuesKPa.length;
  const currentSum = pressureValuesKPa.reduce((sum, value) => sum + value, 0);
  pressureValuesKPa[pressureValuesKPa.length - 1] += targetSum - currentSum;

  for (let index = 0; index < validPoints.length; index += 1) {
    const point = validPoints[index];
    pressureMatrixKPa[point.row][point.column] = pressureValuesKPa[index];
  }
  const actualAveragePressureKPa = pressureValuesKPa.reduce((sum, value) => sum + value, 0) / pressureValuesKPa.length;
  return {
    ...input,
    sensor: profile.key,
    version: profile.version,
    pressureMatrixKPa: isMatrix ? pressureMatrixKPa : pressureMatrixKPa[0],
    pressureValuesKPa,
    relativeCurveWeights,
    targetAveragePressureKPa,
    actualAveragePressureKPa,
    maxPressureKPa: Math.max(...pressureValuesKPa),
    curveResponseMeanKPa,
    normalizationScale,
    meanConservationErrorKPa: actualAveragePressureKPa - targetAveragePressureKPa,
    fallbackMode,
  };
}

/**
 * 复现上位机的整帧压强链路。
 * - 有效点数 <= 300：排序区间均值进入基础公式。
 * - 有效点数 > 300：全部有效点逐点进入基础公式，再乘一次独立k。
 */
function calculatePressureMetrics(data, sensor, humanCoefficient = DEFAULT_HUMAN_COEFFICIENT) {
  const profile = getProfile(sensor);
  const values = flattenPositiveAdc(data);
  const input = getCalibrationInput(values, sensor);

  if (input.validCount > HUMAN_VALID_POINT_THRESHOLD) {
    const k = normalizeHumanCoefficient(humanCoefficient);
    const pointPressures = values
      .map((adc) => calculateBasePressure(adc, sensor))
      .filter((value) => value !== null)
      .map((value) => value * k);
    const sum = pointPressures.reduce((total, value) => total + value, 0);
    return {
      ...input,
      sensor: profile.key,
      version: profile.version,
      branch: "human",
      humanCoefficient: k,
      pointPressureCount: pointPressures.length,
      avgPressureKPa: pointPressures.length ? roundPressure(sum / pointPressures.length) : null,
      maxPressureKPa: pointPressures.length ? roundPressure(Math.max(...pointPressures)) : null,
    };
  }

  const distribution = calculateWeightPointPressures(data, sensor);
  const avgPressureKPa = distribution.targetAveragePressureKPa === null
    ? null
    : roundPressure(distribution.targetAveragePressureKPa);
  return {
    ...input,
    sensor: profile.key,
    version: profile.version,
    branch: "weight",
    humanCoefficient: null,
    pointPressureCount: distribution.pressureValuesKPa.length,
    pointPressuresKPa: distribution.pressureValuesKPa,
    pressureMatrixKPa: distribution.pressureMatrixKPa,
    relativeCurveWeights: distribution.relativeCurveWeights,
    normalizationScale: distribution.normalizationScale,
    curveResponseMeanKPa: distribution.curveResponseMeanKPa,
    pointPressureAverageKPa: distribution.actualAveragePressureKPa,
    meanConservationErrorKPa: distribution.meanConservationErrorKPa,
    fallbackMode: distribution.fallbackMode,
    avgPressureKPa,
    maxPressureKPa: distribution.maxPressureKPa === null
      ? null
      : roundPressure(distribution.maxPressureKPa),
  };
}

function validateMatrixCoordinate(matrix, row, column) {
  if (!Array.isArray(matrix) || !matrix.every(Array.isArray)) {
    throw new TypeError("matrix必须是二维过滤后ADC矩阵");
  }
  if (!Number.isInteger(row) || !Number.isInteger(column)) {
    throw new TypeError("row和column必须是整数");
  }
  if (row < 0 || row >= matrix.length || column < 0 || column >= matrix[row].length) {
    throw new RangeError(`坐标越界：(${row}, ${column})`);
  }
}

/**
 * 一次计算整帧最终逐点压强，并创建可重复查询多个坐标的解析器。
 * - 砝码段：Pi=Pbar×F(ADCi)/AVG(F(ADCi))。
 * - 真人段：Pi=k×F(ADCi)，k只乘一次。
 * @param {number[][]} matrix 已完成阈值过滤的ADC矩阵，无效点必须为0。
 * @param {"seat"|"backrest"|"坐垫"|"靠背"} sensor
 * @param {number} humanCoefficient 真人段动态系数；砝码段自动忽略。
 */
function createPointPressureResolver(matrix, sensor, humanCoefficient = DEFAULT_HUMAN_COEFFICIENT) {
  if (!Array.isArray(matrix) || !matrix.every(Array.isArray)) {
    throw new TypeError("matrix必须是二维过滤后ADC矩阵");
  }
  const profile = getProfile(sensor);
  const metrics = calculatePressureMetrics(matrix, sensor, humanCoefficient);
  const k = metrics.branch === "human"
    ? metrics.humanCoefficient
    : null;
  const pressureMatrixKPa = metrics.branch === "weight"
    ? metrics.pressureMatrixKPa
    : matrix.map((matrixRow) => matrixRow.map((rawAdc) => {
        const adc = Number(rawAdc);
        if (!Number.isFinite(adc) || adc <= 0) return 0;
        const basePressure = calculateBasePressure(adc, sensor);
        return basePressure === null ? 0 : basePressure * k;
      }));

  function getPointPressure(row, column) {
    validateMatrixCoordinate(matrix, row, column);
    return pressureMatrixKPa[row][column];
  }

  function getPointPressureDetails(row, column) {
    validateMatrixCoordinate(matrix, row, column);
    const adc = Number(matrix[row][column]);
    const pressureKPa = pressureMatrixKPa[row][column];
    return {
      row,
      column,
      adc: Number.isFinite(adc) ? adc : 0,
      pressureKPa,
      pressureRoundedKPa: roundPressure(pressureKPa),
      branch: metrics.branch,
      sensor: profile.key,
      calibrationVersion: profile.version,
      humanCoefficient: k,
      normalizationScale: metrics.branch === "weight" ? metrics.normalizationScale : null,
      targetAveragePressureKPa: metrics.branch === "weight" ? metrics.avgPressureKPa : null,
    };
  }

  return Object.freeze({
    sensor: profile.key,
    calibrationVersion: profile.version,
    branch: metrics.branch,
    humanCoefficient: k,
    pressureMatrixKPa,
    avgPressureKPa: metrics.avgPressureKPa,
    maxPressureKPa: metrics.maxPressureKPa,
    validCount: metrics.validCount,
    normalizationScale: metrics.branch === "weight" ? metrics.normalizationScale : null,
    meanConservationErrorKPa: metrics.branch === "weight" ? metrics.meanConservationErrorKPa : null,
    getPointPressure,
    getPointPressureDetails,
  });
}

/**
 * 直接取得指定坐标的最终单点压强（未四舍五入，单位kPa）。
 * 砝码段仍必须传入整帧，因为归一化系数依赖全部有效点。
 */
function getPointPressure(matrix, row, column, sensor, humanCoefficient = DEFAULT_HUMAN_COEFFICIENT) {
  return createPointPressureResolver(matrix, sensor, humanCoefficient).getPointPressure(row, column);
}

/** 直接取得指定坐标的最终单点压强详情。 */
function getPointPressureDetails(matrix, row, column, sensor, humanCoefficient = DEFAULT_HUMAN_COEFFICIENT) {
  return createPointPressureResolver(matrix, sensor, humanCoefficient).getPointPressureDetails(row, column);
}

/**
 * 输入过滤后的整帧ADC二维矩阵，直接返回同尺寸的最终压强二维矩阵（单位kPa）。
 * - 砝码段：自动执行逐点曲线响应比例归一化。
 * - 真人段：自动执行Pi=k×F(ADCi)，k只乘一次。
 * - 无效ADC点输出0。
 */
function adcMatrixToPressureMatrix(matrix, sensor, humanCoefficient = DEFAULT_HUMAN_COEFFICIENT) {
  const pressureMatrixKPa = createPointPressureResolver(matrix, sensor, humanCoefficient).pressureMatrixKPa;
  return pressureMatrixKPa.map((row) => row.slice());
}

const api = Object.freeze({
  HUMAN_VALID_POINT_THRESHOLD,
  DEFAULT_HUMAN_COEFFICIENT,
  MIN_HUMAN_COEFFICIENT,
  MAX_HUMAN_COEFFICIENT,
  SEAT_V2746,
  BACKREST_V2752,
  calculateBasePressure,
  getCalibrationInput,
  calculateWeightPointPressures,
  calculatePressureMetrics,
  createPointPressureResolver,
  getPointPressure,
  getPointPressureDetails,
  adcMatrixToPressureMatrix,
});

if (typeof module !== "undefined" && module.exports) module.exports = api;
if (typeof globalThis !== "undefined") globalThis.PressureCalibrationExport = api;
