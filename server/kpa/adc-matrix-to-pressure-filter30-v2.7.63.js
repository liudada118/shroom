/*
 * ADC矩阵转压强矩阵模块 V2.7.63（内置ADC≤30过滤）
 *
 * 功能：
 * 1. 输入一帧原始ADC二维矩阵，内部先将ADC≤30及非法值过滤为0。
 * 2. adcMatrixToPressureMatrix() 直接返回同形状的逐点压强矩阵。
 * 3. 有效点数 N <= 300：执行砝码段比例归一化，严格保持 AVG(Pi) = Pbar。
 * 4. 有效点数 N > 300：执行真人段逐点 k * F(ADCi)。
 * 5. calculatePressureFromMatrix() 返回矩阵、平均/最大压强和归一化审计字段。
 *
 * Node.js：
 *   const calibration = require("./adc-matrix-to-pressure-filter30-v2.7.63.js");
 *   const pressureMatrix = calibration.adcMatrixToPressureMatrix(adcMatrix, {
 *     sensorType: "seat", // "seat" 或 "backrest"
 *     humanCoefficient: 2.2,
 *   });
 *
 * 浏览器：
 *   <script src="adc-matrix-to-pressure-filter30-v2.7.63.js"></script>
 *   <script>
 *     const pressureMatrix = PressureMatrixFilter30V2763.adcMatrixToPressureMatrix(adcMatrix, {
 *       sensorType: "backrest",
 *       humanCoefficient: 2.2,
 *     });
 *   </script>
 *
 * 注意：
 * - ADC≤30、NaN、Infinity和负数均在文件内部过滤为0，且不参与有效点数和TOP均值。
 * - 砝码段归一化后的单点压强及最大压强可能高于基础曲线 27kPa 上限；这是保持平均值守恒所必需的。
 * - 本文件不依赖任何第三方库。
 */

(function universalModule(root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof define === "function" && define.amd) define(function defineModule() { return api; });
  if (root) root.PressureMatrixFilter30V2763 = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function createPressureCalibration() {
  "use strict";

  var VERSION = "V2.7.63";
  var ADC_FILTER_THRESHOLD = 30;
  var HUMAN_VALID_POINT_THRESHOLD = 300;
  var DEFAULT_HUMAN_COEFFICIENT = 2.2;
  var MIN_HUMAN_COEFFICIENT = 1;
  var MAX_HUMAN_COEFFICIENT = 6;
  var NORMALIZATION_EPSILON = 1e-12;

  var SEAT_SEGMENTS = [
    { lo: 53.84, hi: 61.33375, a: 2.2732, b: 0.06000000000000003 },
    { lo: 61.33375, hi: 68.8275, a: 2.7228250000000003, b: 0.06382641966890193 },
    { lo: 68.8275, hi: 76.32125, a: 3.201124232393834, b: 0.06682641966890183 },
    { lo: 76.32125, hi: 83.815, a: 3.7019047147876676, b: 0.06982641966890177 },
    { lo: 83.815, hi: 91.30875, a: 4.2251664471815, b: 0.07282641966890172 },
    { lo: 91.30875, hi: 98.8025, a: 4.770909429575332, b: 0.07582641966890165 },
    { lo: 98.8025, hi: 106.29625, a: 5.339133661969163, b: 0.07882641966890166 },
    { lo: 106.29625, hi: 113.79, a: 5.929839144362996, b: 0.12623356167051475 },
    { lo: 113.79, hi: 121.28375, a: 6.875801897131416, b: 0.1292335616705143 },
    { lo: 121.28375, hi: 128.7775, a: 7.844245899899832, b: 0.15661037138419087 },
    { lo: 128.7775, hi: 136.27125, a: 9.017844870460113, b: 0.15961037138419065 },
    { lo: 136.27125, hi: 143.765, a: 10.213925091020393, b: 0.3384472701670871 },
    { lo: 143.765, hi: 151.25875, a: 12.750164321834994, b: 0.3414472701670874 },
    { lo: 151.25875, hi: 158.7525, a: 15.308884802649617, b: 0.3444472701670879 },
    { lo: 158.7525, hi: 166.24625, a: 17.890086533464224, b: 0.4839608686196772 },
    { lo: 166.24625, hi: 173.74, a: 21.516768292682933, b: 0.7317073170731694 }
  ];

  var BACKREST_SEGMENTS = [
    { lo: 64.93, hi: 77.99578947368421, a: 2.171199999999999, b: 0.04000000000000015 },
    { lo: 77.99578947368421, hi: 107.9942105263158, a: 2.693831578947369, b: 0.07152099258507517 },
    { lo: 107.9942105263158, hi: 116.5842105263158, a: 4.839348428616596, b: 0.07452099258507523 },
    { lo: 116.5842105263158, hi: 128.00263157894736, a: 5.479483754922392, b: 0.14953903662226653 },
    { lo: 128.00263157894736, hi: 135.86894736842106, a: 7.186983438880322, b: 0.1525390366222664 },
    { lo: 135.86894736842106, hi: 142.54315789473685, a: 8.386903671173163, b: 0.15553903662226615 },
    { lo: 142.54315789473685, hi: 148.77052631578945, a: 9.42500394665051, b: 0.15853903662226654 },
    { lo: 148.77052631578945, hi: 154.32736842105265, a: 10.412284936816114, b: 0.2465713823659119 },
    { lo: 154.32736842105265, hi: 159.07789473684213, a: 11.782443176299966, b: 0.2495713823659125 },
    { lo: 159.07789473684213, hi: 162.78105263157894, a: 12.96803859589719, b: 0.39822322147755757 },
    { lo: 162.78105263157894, hi: 165.38210526315788, a: 14.442722062379335, b: 0.4012232214775568 },
    { lo: 165.38210526315788, hi: 170.20105263157893, a: 15.486324778454113, b: 0.40422322147755524 },
    { lo: 170.20105263157893, hi: 173.70842105263156, a: 17.434255207848057, b: 0.44139613105542036 },
    { lo: 173.70842105263156, hi: 175.1836842105263, a: 18.982394059086648, b: 0.5020594652919378 },
    { lo: 175.1836842105263, hi: 178.69052631578947, a: 19.72306389130418, b: 0.5050594652919369 },
    { lo: 178.69052631578947, hi: 180.56894736842105, a: 21.49422768985164, b: 0.5080594652919352 },
    { lo: 180.56894736842105, hi: 181.79736842105265, a: 22.448577285444756, b: 0.5110594652919322 },
    { lo: 181.79736842105265, hi: 189.43, a: 23.076373491756016, b: 0.514059465291931 }
  ];

  var SEAT_PROFILE = {
    key: "seat",
    name: "坐垫",
    calibrationId: "SeatProcessedConvexIncreasing27Linear17Node-20260901",
    topStartRank: 5,
    topEndRank: 70,
    inputLabel: "有效ADC降序第5—70位均值",
    leftSlope: 0.042221396731054977,
    clampKPa: 27,
    segments: SEAT_SEGMENTS
  };

  var BACKREST_PROFILE = {
    key: "backrest",
    name: "靠背",
    calibrationId: "BackrestProcessedConvexIncreasing27Linear19Node-20260901",
    topStartRank: 1,
    topEndRank: 46,
    inputLabel: "有效ADC最高TOP46均值",
    leftSlope: 0.033439088248883412,
    clampKPa: 27,
    segments: BACKREST_SEGMENTS
  };

  function isBackrest(sensorType) {
    return sensorType === "backrest" || sensorType === "new-backrest-32x25" || sensorType === "backrest-32x25";
  }

  function getProfile(sensorType) {
    return isBackrest(sensorType) ? BACKREST_PROFILE : SEAT_PROFILE;
  }

  function normalizeAndFilterMatrix(matrix) {
    if (!Array.isArray(matrix)) throw new TypeError("adcMatrix 必须是二维数组");
    return matrix.map(function normalizeRow(row, rowIndex) {
      if (!Array.isArray(row) && !ArrayBuffer.isView(row)) {
        throw new TypeError("adcMatrix 第 " + rowIndex + " 行不是数组或数值型数组");
      }
      return Array.prototype.map.call(row, function filterAdc(value) {
        return Number.isFinite(value) && value > ADC_FILTER_THRESHOLD ? Number(value) : 0;
      });
    });
  }

  function roundPressure(value) {
    return Number(Math.max(0, value).toFixed(2));
  }

  function normalizeHumanCoefficient(value) {
    if (!Number.isFinite(value)) return DEFAULT_HUMAN_COEFFICIENT;
    return Math.min(MAX_HUMAN_COEFFICIENT, Math.max(MIN_HUMAN_COEFFICIENT, Number(value)));
  }

  function calculateBasePressureForProfile(adc, profile) {
    if (!Number.isFinite(adc) || adc <= ADC_FILTER_THRESHOLD) return null;
    var first = profile.segments[0];
    var last = profile.segments[profile.segments.length - 1];
    if (adc <= first.lo) return Math.min(profile.clampKPa, Math.max(0, profile.leftSlope * adc));
    if (adc > last.hi) return profile.clampKPa;
    for (var index = 0; index < profile.segments.length; index += 1) {
      var segment = profile.segments[index];
      if (adc <= segment.hi) {
        var pressure = segment.a + segment.b * (adc - segment.lo);
        return Math.min(profile.clampKPa, Math.max(0, pressure));
      }
    }
    return null;
  }

  function estimateBasePressure(adc, sensorType) {
    return calculateBasePressureForProfile(adc, getProfile(sensorType));
  }

  function getInputSummary(matrix, profile) {
    var values = [];
    for (var row = 0; row < matrix.length; row += 1) {
      for (var column = 0; column < matrix[row].length; column += 1) {
        var value = matrix[row][column];
        if (Number.isFinite(value) && value > 0) values.push(value);
      }
    }
    values.sort(function descending(a, b) { return b - a; });
    var startIndex = values.length >= profile.topStartRank ? profile.topStartRank - 1 : 0;
    var endExclusive = Math.min(profile.topEndRank, values.length);
    var selected = values.slice(startIndex, endExclusive);
    var selectedSum = selected.reduce(function sumValues(sum, value) { return sum + value; }, 0);
    return {
      topMean: selected.length > 0 ? selectedSum / selected.length : 0,
      topCount: selected.length,
      validCount: values.length,
      max: values.length > 0 ? values[0] : 0
    };
  }

  function calculateWeightDistribution(matrix, profile) {
    var input = getInputSummary(matrix, profile);
    if (input.validCount > HUMAN_VALID_POINT_THRESHOLD) {
      throw new RangeError("砝码段逐点压强仅适用于有效点数≤" + HUMAN_VALID_POINT_THRESHOLD);
    }

    var pressureMatrix = matrix.map(function zeroRow(row) { return row.map(function zero() { return 0; }); });
    var validPoints = [];
    for (var row = 0; row < matrix.length; row += 1) {
      for (var column = 0; column < matrix[row].length; column += 1) {
        var adc = matrix[row][column];
        if (!Number.isFinite(adc) || adc <= ADC_FILTER_THRESHOLD) continue;
        var response = calculateBasePressureForProfile(adc, profile);
        validPoints.push({ row: row, column: column, response: response === null ? 0 : Math.max(0, response) });
      }
    }

    if (validPoints.length === 0) {
      return {
        input: input,
        targetAveragePressureKPa: null,
        actualAveragePressureKPa: null,
        maxPressureKPa: null,
        pointPressuresKPa: [],
        pressureMatrixKPa: pressureMatrix,
        curveResponseMeanKPa: 0,
        normalizationScale: null,
        meanConservationErrorKPa: null,
        fallbackMode: "no-valid-points"
      };
    }

    var fittedAverage = calculateBasePressureForProfile(input.topMean, profile);
    if (fittedAverage === null || !Number.isFinite(fittedAverage)) {
      throw new RangeError("基础公式无法为排序ADC均值计算砝码段目标平均压强");
    }
    var targetAverage = Math.max(0, fittedAverage);
    var responseSum = validPoints.reduce(function sumResponse(sum, point) { return sum + point.response; }, 0);
    var responseMean = responseSum / validPoints.length;
    var pointPressures;
    var scale = null;
    var fallbackMode = "none";

    if (targetAverage <= NORMALIZATION_EPSILON) {
      pointPressures = validPoints.map(function zeroPoint() { return 0; });
      scale = responseMean > NORMALIZATION_EPSILON ? 0 : null;
      fallbackMode = "all-zero";
    } else if (responseMean <= NORMALIZATION_EPSILON) {
      pointPressures = validPoints.map(function equalPoint() { return targetAverage; });
      fallbackMode = "equal-distribution";
    } else {
      scale = targetAverage / responseMean;
      pointPressures = validPoints.map(function scalePoint(point) { return point.response * scale; });
    }

    var targetSum = targetAverage * pointPressures.length;
    var currentSum = pointPressures.reduce(function sumPressure(sum, value) { return sum + value; }, 0);
    pointPressures[pointPressures.length - 1] += targetSum - currentSum;

    for (var index = 0; index < validPoints.length; index += 1) {
      var point = validPoints[index];
      pressureMatrix[point.row][point.column] = pointPressures[index];
    }
    var actualAverage = pointPressures.reduce(function sumPressure(sum, value) { return sum + value; }, 0) / pointPressures.length;
    return {
      input: input,
      targetAveragePressureKPa: targetAverage,
      actualAveragePressureKPa: actualAverage,
      maxPressureKPa: Math.max.apply(Math, pointPressures),
      pointPressuresKPa: pointPressures,
      pressureMatrixKPa: pressureMatrix,
      curveResponseMeanKPa: responseMean,
      normalizationScale: scale,
      meanConservationErrorKPa: actualAverage - targetAverage,
      fallbackMode: fallbackMode
    };
  }

  function buildResult(profile, input, values) {
    return {
      version: VERSION,
      adcFilterThreshold: ADC_FILTER_THRESHOLD,
      sensorType: profile.key,
      sensorName: profile.name,
      calibrationId: profile.calibrationId,
      calibrationBranch: values.calibrationBranch,
      pressureMatrixKPa: values.pressureMatrixKPa,
      pointPressuresKPa: values.pointPressuresKPa,
      avgPressureKPa: values.avgPressureKPa,
      maxPressureKPa: values.maxPressureKPa,
      validPointCount: input.validCount,
      pointPressureCount: values.pointPressuresKPa.length,
      topMeanAdc: input.topMean,
      topCount: input.topCount,
      maxAdc: input.max,
      inputLabel: profile.inputLabel,
      humanCoefficient: values.humanCoefficient,
      normalization: values.normalization,
      // 与上位机 PressureMetrics 对齐的扁平审计字段。
      topMean: input.topMean,
      validCount: input.validCount,
      max: input.max,
      curveResponseMeanKPa: values.normalization.curveResponseMeanKPa,
      normalizationScale: values.normalization.scale,
      meanConservationErrorKPa: values.normalization.meanConservationErrorKPa,
      pointPressureFallbackMode: values.normalization.fallbackMode
    };
  }

  function calculateWeightNormalizedPressureMatrix(adcMatrix, sensorType) {
    var matrix = normalizeAndFilterMatrix(adcMatrix);
    var profile = getProfile(sensorType);
    var distribution = calculateWeightDistribution(matrix, profile);
    var normalization = {
      applied: true,
      targetAveragePressureKPa: distribution.targetAveragePressureKPa,
      actualAveragePressureKPa: distribution.actualAveragePressureKPa,
      curveResponseMeanKPa: distribution.curveResponseMeanKPa,
      scale: distribution.normalizationScale,
      meanConservationErrorKPa: distribution.meanConservationErrorKPa,
      fallbackMode: distribution.fallbackMode
    };
    return buildResult(profile, distribution.input, {
      calibrationBranch: "weight",
      pressureMatrixKPa: distribution.pressureMatrixKPa,
      pointPressuresKPa: distribution.pointPressuresKPa,
      avgPressureKPa: distribution.targetAveragePressureKPa === null ? null : roundPressure(distribution.targetAveragePressureKPa),
      maxPressureKPa: distribution.maxPressureKPa === null ? null : roundPressure(distribution.maxPressureKPa),
      humanCoefficient: null,
      normalization: normalization
    });
  }

  function calculateHumanPressureMatrix(matrix, profile, humanCoefficient) {
    var input = getInputSummary(matrix, profile);
    var coefficient = normalizeHumanCoefficient(humanCoefficient);
    var pressureMatrix = matrix.map(function zeroRow(row) { return row.map(function zero() { return 0; }); });
    var pointPressures = [];
    var pressureSum = 0;
    var pressureMax = 0;

    for (var row = 0; row < matrix.length; row += 1) {
      for (var column = 0; column < matrix[row].length; column += 1) {
        var adc = matrix[row][column];
        if (!Number.isFinite(adc) || adc <= ADC_FILTER_THRESHOLD) continue;
        var basePressure = calculateBasePressureForProfile(adc, profile);
        if (basePressure === null) continue;
        var pointPressure = basePressure * coefficient;
        pressureMatrix[row][column] = pointPressure;
        pointPressures.push(pointPressure);
        pressureSum += pointPressure;
        if (pointPressure > pressureMax) pressureMax = pointPressure;
      }
    }

    var hasPoints = pointPressures.length > 0;
    var normalization = {
      applied: false,
      targetAveragePressureKPa: null,
      actualAveragePressureKPa: hasPoints ? pressureSum / pointPressures.length : null,
      curveResponseMeanKPa: null,
      scale: null,
      meanConservationErrorKPa: null,
      fallbackMode: null
    };
    return buildResult(profile, input, {
      calibrationBranch: "human",
      pressureMatrixKPa: pressureMatrix,
      pointPressuresKPa: pointPressures,
      avgPressureKPa: hasPoints ? roundPressure(pressureSum / pointPressures.length) : null,
      maxPressureKPa: hasPoints ? roundPressure(pressureMax) : null,
      humanCoefficient: coefficient,
      normalization: normalization
    });
  }

  /**
   * 主入口。
   * @param {Array<Array<number>>} adcMatrix 一帧ADC二维矩阵。
   * @param {Object} [options]
   * @param {"seat"|"backrest"|string} [options.sensorType="seat"] 传感器类型。
   * @param {number} [options.humanCoefficient=2.2] 真人段动态系数，自动限制到1—6。
   * @returns {Object} 压强矩阵、平均/最大压强、分支和归一化审计字段。
   */
  function calculatePressureFromMatrix(adcMatrix, options) {
    var settings = options || {};
    var matrix = normalizeAndFilterMatrix(adcMatrix);
    var profile = getProfile(settings.sensorType || "seat");
    var input = getInputSummary(matrix, profile);
    if (input.validCount > HUMAN_VALID_POINT_THRESHOLD) {
      return calculateHumanPressureMatrix(matrix, profile, settings.humanCoefficient);
    }
    return calculateWeightNormalizedPressureMatrix(matrix, profile.key);
  }

  /**
   * 最简入口：输入一帧原始ADC矩阵，内部过滤ADC≤30，直接返回同形压强矩阵。
   * @param {Array<Array<number>>} adcMatrix 一帧原始ADC二维矩阵。
   * @param {Object} [options] 与 calculatePressureFromMatrix 相同。
   * @returns {Array<Array<number>>} 同形逐点压强矩阵，单位kPa。
   */
  function adcMatrixToPressureMatrix(adcMatrix, options) {
    return calculatePressureFromMatrix(adcMatrix, options).pressureMatrixKPa;
  }

  /** 仅执行本文件的ADC≤30过滤，返回新矩阵且不修改输入。 */
  function filterAdcMatrix(adcMatrix) {
    return normalizeAndFilterMatrix(adcMatrix);
  }

  function getCalibrationInfo(sensorType) {
    var profile = getProfile(sensorType);
    return {
      version: VERSION,
      adcFilterThreshold: ADC_FILTER_THRESHOLD,
      sensorType: profile.key,
      sensorName: profile.name,
      calibrationId: profile.calibrationId,
      inputLabel: profile.inputLabel,
      topStartRank: profile.topStartRank,
      topEndRank: profile.topEndRank,
      humanThreshold: HUMAN_VALID_POINT_THRESHOLD,
      defaultHumanCoefficient: DEFAULT_HUMAN_COEFFICIENT,
      humanCoefficientRange: [MIN_HUMAN_COEFFICIENT, MAX_HUMAN_COEFFICIENT],
      clampKPa: profile.clampKPa,
      clampAdc: profile.segments[profile.segments.length - 1].hi,
      segments: profile.segments.map(function copySegment(segment) {
        return { lo: segment.lo, hi: segment.hi, a: segment.a, b: segment.b };
      })
    };
  }

  return {
    VERSION: VERSION,
    ADC_FILTER_THRESHOLD: ADC_FILTER_THRESHOLD,
    HUMAN_VALID_POINT_THRESHOLD: HUMAN_VALID_POINT_THRESHOLD,
    DEFAULT_HUMAN_COEFFICIENT: DEFAULT_HUMAN_COEFFICIENT,
    adcMatrixToPressureMatrix: adcMatrixToPressureMatrix,
    calculatePressureFromMatrix: calculatePressureFromMatrix,
    calculateWeightNormalizedPressureMatrix: calculateWeightNormalizedPressureMatrix,
    filterAdcMatrix: filterAdcMatrix,
    estimateBasePressure: estimateBasePressure,
    getCalibrationInfo: getCalibrationInfo
  };
}));
