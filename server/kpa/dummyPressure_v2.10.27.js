/*
 * 假人单帧压强标定模块（软件端 CommonJS 兼容版）
 * 文件版本：2.10.27
 * 算法内容：严格复刻上位机 V2.10.26
 *
 * CommonJS加载：
 *   const pressure = require("./dummyPressure.v2.10.27.js");
 *
 * 单帧矩阵入口：
 *   const result = pressure.calculateDummyPressureFrame(matrix, sensorType, validMask);
 *   // result.pressureMatrixKpa 与输入 matrix 同尺寸，单位 kPa
 *
 * 软件端兼容入口：
 *   calculateDummyValuesPressure(values, sensorType)
 *   calculateDummyMatrixPressure(matrix, sensorType, validMask)
 *   bodyAdcToKpaRaw(adc)
 *   legAdcToKpaRaw(adc)
 *
 * V2.10.26算法规则：
 * - 有效点：ADC>30；若传入validMask，则有效区完全以validMask为准。
 * - 仅在未传validMask时，才使用内置几何规则作为兼容兜底。
 * - 软件端传入54×24上衣插值后矩阵时，应同时传入软件端最终validMask；
 *   模块不会再用物理列号反推逻辑覆盖软件端头颈居中平移后的掩码。
 * - 袖子：N>=1始终使用自身Top50 ADC均值确定Pavg，再按袖子master权重守恒分配。
 * - 上衣/左右腿：3<=N<100使用自身Top50 ADC均值确定Pavg，再按本部位master权重守恒分配。
 * - 上衣/左右腿：N>=100时Pi=2*M(ADCi)，只乘一次2。
 * - 低点数守恒分配：Pi=Pavg*N*M(ADCi)/sum(M(ADCj))，所以sum(Pi)/N=Pavg。
 * - 上衣、袖子、腿部均保留各自高压指数外推且不封顶。
 *
 * 仅包含算法；无第三方依赖、不读写文件、不使用随机数/时间/可变缓存。
 */
(function attachDummyPressure(root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else if (root) {
    root.DummyPressureV21027 = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createDummyPressureApi() {
  "use strict";

  var VERSION = "2.10.27";
  var SOURCE_ALGORITHM_VERSION = "V2.10.26";
  var CALIBRATION_VERSION = "V2.10.26";
  var DUMMY_TOP_N = 50;
  var DUMMY_LEG_TOP_N = 50;
  var DUMMY_MIN_VALID_POINTS = 3;
  var DUMMY_BODY_POINTWISE_THRESHOLD = 100;
  var DUMMY_POINTWISE_THRESHOLD = DUMMY_BODY_POINTWISE_THRESHOLD;
  var DUMMY_LEG_POINTWISE_THRESHOLD = 100;
  var DUMMY_POINTWISE_MULTIPLIER = 2;
  var DUMMY_LEG_POINTWISE_MULTIPLIER = DUMMY_POINTWISE_MULTIPLIER;
  var DUMMY_VALID_ADC_THRESHOLD = 30;
  var VALID_ADC_THRESHOLD = DUMMY_VALID_ADC_THRESHOLD;

  var DUMMY_SEAT_TYPES = Object.freeze(["dummy-sleeve-2x18", "dummy-body-27x12"]);
  var DUMMY_LEG_TYPES = Object.freeze(["dummy-left-leg-32x6", "dummy-right-leg-32x6"]);
  var DUMMY_SENSOR_TYPES = Object.freeze([
    "dummy-sleeve-2x18",
    "dummy-body-27x12",
    "dummy-left-leg-32x6",
    "dummy-right-leg-32x6",
  ]);

  var SENSOR_ALIASES = Object.freeze({
    body: "dummy-body-27x12",
    sleeve: "dummy-sleeve-2x18",
    pants: "dummy-left-leg-32x6",
    leg: "dummy-left-leg-32x6",
    "left-leg": "dummy-left-leg-32x6",
    "right-leg": "dummy-right-leg-32x6",
  });

  var BODY_NODES = Object.freeze([
    Object.freeze({ adc: 89.28, pressureKpa: 2.5 }),
    Object.freeze({ adc: 118.54, pressureKpa: 5 }),
    Object.freeze({ adc: 132.12, pressureKpa: 7.5 }),
    Object.freeze({ adc: 142.41, pressureKpa: 10 }),
    Object.freeze({ adc: 148.85, pressureKpa: 12.5 }),
    Object.freeze({ adc: 153.84, pressureKpa: 15 }),
    Object.freeze({ adc: 158.15, pressureKpa: 17.5 }),
    Object.freeze({ adc: 162.67, pressureKpa: 20 }),
    Object.freeze({ adc: 164.03, pressureKpa: 22.5 }),
    Object.freeze({ adc: 167.59, pressureKpa: 25 }),
    Object.freeze({ adc: 176.6, pressureKpa: 27 }),
  ]);

  var SLEEVE_NODES = Object.freeze([
    Object.freeze({ adc: 98.75, pressureKpa: 2.5 }),
    Object.freeze({ adc: 128.39, pressureKpa: 5 }),
    Object.freeze({ adc: 141.55, pressureKpa: 7.5 }),
    Object.freeze({ adc: 150.41, pressureKpa: 10 }),
  ]);

  var LEG_NODES = Object.freeze([
    Object.freeze({ adc: 172.841043963987, pressureKpa: 20 }),
    Object.freeze({ adc: 175.105401868358, pressureKpa: 22.5 }),
    Object.freeze({ adc: 178, pressureKpa: 25 }),
  ]);

  function pchipEndpointSlope(h0, h1, delta0, delta1) {
    var slope = ((2 * h0 + h1) * delta0 - h0 * delta1) / (h0 + h1);
    if (Math.sign(slope) !== Math.sign(delta0)) return 0;
    if (Math.sign(delta0) !== Math.sign(delta1) && Math.abs(slope) > 3 * Math.abs(delta0)) {
      slope = 3 * delta0;
    }
    return slope;
  }

  function buildPchipSlopes(nodes) {
    var length = nodes.length;
    var slopes = new Array(length);
    var index;
    if (length === 2) {
      var onlySlope = (nodes[1].pressureKpa - nodes[0].pressureKpa) / (nodes[1].adc - nodes[0].adc);
      slopes[0] = onlySlope;
      slopes[1] = onlySlope;
      return Object.freeze(slopes);
    }
    var h = new Array(length - 1);
    var delta = new Array(length - 1);
    for (index = 0; index < length - 1; index += 1) {
      h[index] = nodes[index + 1].adc - nodes[index].adc;
      delta[index] = (nodes[index + 1].pressureKpa - nodes[index].pressureKpa) / h[index];
    }
    slopes[0] = pchipEndpointSlope(h[0], h[1], delta[0], delta[1]);
    slopes[length - 1] = pchipEndpointSlope(
      h[length - 2],
      h[length - 3],
      delta[length - 2],
      delta[length - 3],
    );
    for (index = 1; index < length - 1; index += 1) {
      var previous = delta[index - 1];
      var next = delta[index];
      if (previous === 0 || next === 0 || Math.sign(previous) !== Math.sign(next)) {
        slopes[index] = 0;
      } else {
        var weight1 = 2 * h[index] + h[index - 1];
        var weight2 = h[index] + 2 * h[index - 1];
        slopes[index] = (weight1 + weight2) / (weight1 / previous + weight2 / next);
      }
    }
    return Object.freeze(slopes);
  }

  var BODY_SLOPES = buildPchipSlopes(BODY_NODES);
  var SLEEVE_SLOPES = buildPchipSlopes(SLEEVE_NODES);
  var LEG_SLOPES = buildPchipSlopes(LEG_NODES);

  var DUMMY_BODY_MASTER_CONFIG = Object.freeze({
    name: "上衣压力等级中位ADC单调三次PCHIP+6ADC线性过渡master",
    model: "median_pchip_linear_exponential",
    pchipNodes: BODY_NODES,
    slopes: BODY_SLOPES,
    measuredMaxAdc: 176.6,
    measuredMaxPressureKpa: 27,
    linearExtensionAdc: 6,
    linearEndPressureKpa: 29,
    doublingAdcIncrement: 25.029777726248,
    highPressureCap: null,
  });

  var DUMMY_SLEEVE_MASTER_CONFIG = Object.freeze({
    name: "袖子F/G四节点中位PCHIP+最高真实点线性衔接+连续指数续接master",
    model: "median_pchip_linear_exponential",
    pchipNodes: SLEEVE_NODES,
    slopes: SLEEVE_SLOPES,
    measuredMaxAdc: 150.41,
    measuredMaxPressureKpa: 10,
    linearExtensionAdc: 9.39,
    linearEndPressureKpa: 12.5,
    doublingAdcIncrement: 26.234349786138,
    highPressureCap: null,
  });

  var DUMMY_LEG_MASTER_CONFIG = Object.freeze({
    name: "裤子/左右腿锚定指数+20/22.5/25kPa局部PCHIP+6ADC线性过渡master",
    model: "anchored_exponential_pchip_linear_exponential",
    pchipNodes: LEG_NODES,
    slopes: LEG_SLOPES,
    measuredMaxAdc: 178,
    measuredMaxPressureKpa: 25,
    linearExtensionAdc: 6,
    linearEndPressureKpa: 27,
    doublingAdcIncrement: 25.095529605267,
    highPressureCap: null,
  });

  var SENSOR_DEFINITIONS = Object.freeze({
    "dummy-body-27x12": Object.freeze({
      sensorType: "dummy-body-27x12",
      part: "body",
      physicalRows: 27,
      physicalCols: 12,
    }),
    "dummy-sleeve-2x18": Object.freeze({
      sensorType: "dummy-sleeve-2x18",
      part: "sleeve",
      physicalRows: 2,
      physicalCols: 18,
    }),
    "dummy-left-leg-32x6": Object.freeze({
      sensorType: "dummy-left-leg-32x6",
      part: "left_leg",
      physicalRows: 32,
      physicalCols: 6,
    }),
    "dummy-right-leg-32x6": Object.freeze({
      sensorType: "dummy-right-leg-32x6",
      part: "right_leg",
      physicalRows: 32,
      physicalCols: 6,
    }),
  });

  function round(value, digits) {
    var precision = digits === undefined ? 2 : digits;
    var factor = Math.pow(10, precision);
    return Math.round((value + Number.EPSILON) * factor) / factor;
  }

  function normalizeSensorType(sensorType) {
    return SENSOR_ALIASES[sensorType] || sensorType;
  }

  function isDummySensorType(sensorType) {
    return DUMMY_SENSOR_TYPES.indexOf(normalizeSensorType(sensorType)) >= 0;
  }

  function isDummyLegSensor(sensorType) {
    return DUMMY_LEG_TYPES.indexOf(normalizeSensorType(sensorType)) >= 0;
  }

  function isDummySleeveSensor(sensorType) {
    return normalizeSensorType(sensorType) === "dummy-sleeve-2x18";
  }

  function getDefinition(sensorType) {
    var normalized = normalizeSensorType(sensorType);
    var definition = SENSOR_DEFINITIONS[normalized];
    if (!definition) throw new Error("不支持的sensorType: " + String(sensorType));
    return definition;
  }

  function getDummyPointwiseThreshold(sensorType) {
    var normalized = normalizeSensorType(sensorType);
    if (normalized === "dummy-sleeve-2x18") return null;
    if (normalized === "dummy-body-27x12") return DUMMY_BODY_POINTWISE_THRESHOLD;
    if (DUMMY_LEG_TYPES.indexOf(normalized) >= 0) return DUMMY_LEG_POINTWISE_THRESHOLD;
    return null;
  }

  function getDummyTopN(sensorType) {
    if (isDummyLegSensor(sensorType)) return DUMMY_LEG_TOP_N;
    if (isDummySensorType(sensorType)) return DUMMY_TOP_N;
    return null;
  }

  function monotonePchip(adc, nodes, slopes) {
    var first = nodes[0];
    if (adc <= first.adc) return Math.max(0, (first.pressureKpa / first.adc) * adc);
    var lastIndex = nodes.length - 1;
    if (adc >= nodes[lastIndex].adc) return nodes[lastIndex].pressureKpa;
    var segmentIndex = 0;
    while (segmentIndex < lastIndex - 1 && adc > nodes[segmentIndex + 1].adc) segmentIndex += 1;
    var left = nodes[segmentIndex];
    var right = nodes[segmentIndex + 1];
    var h = right.adc - left.adc;
    var delta = (right.pressureKpa - left.pressureKpa) / h;
    var dx = adc - left.adc;
    var c2 = (3 * delta - 2 * slopes[segmentIndex] - slopes[segmentIndex + 1]) / h;
    var c3 = (slopes[segmentIndex] + slopes[segmentIndex + 1] - 2 * delta) / (h * h);
    return Math.max(0, left.pressureKpa + slopes[segmentIndex] * dx + c2 * dx * dx + c3 * dx * dx * dx);
  }

  function adcToDummyKpa(adc, config) {
    if (!Number.isFinite(adc) || adc <= 0) return 0;
    var linearEndAdc = config.measuredMaxAdc + config.linearExtensionAdc;
    if (adc <= config.measuredMaxAdc) {
      if (config.model === "anchored_exponential_pchip_linear_exponential") {
        var firstLocalNode = config.pchipNodes[0];
        if (adc > firstLocalNode.adc) return monotonePchip(adc, config.pchipNodes, config.slopes);
        return firstLocalNode.pressureKpa * Math.pow(
          2,
          (adc - firstLocalNode.adc) / config.doublingAdcIncrement,
        );
      }
      return monotonePchip(adc, config.pchipNodes, config.slopes);
    }
    if (adc <= linearEndAdc) {
      var progress = (adc - config.measuredMaxAdc) / config.linearExtensionAdc;
      return config.measuredMaxPressureKpa
        + progress * (config.linearEndPressureKpa - config.measuredMaxPressureKpa);
    }
    return config.linearEndPressureKpa * Math.pow(
      2,
      (adc - linearEndAdc) / config.doublingAdcIncrement,
    );
  }

  function bodyAdcToKpaRaw(adc) {
    return adcToDummyKpa(adc, DUMMY_BODY_MASTER_CONFIG);
  }

  function bodyAdcToKpa(adc) {
    return round(bodyAdcToKpaRaw(adc));
  }

  function sleeveAdcToKpaRaw(adc) {
    return adcToDummyKpa(adc, DUMMY_SLEEVE_MASTER_CONFIG);
  }

  function sleeveAdcToKpa(adc) {
    return round(sleeveAdcToKpaRaw(adc));
  }

  function legAdcToKpaRaw(adc) {
    return adcToDummyKpa(adc, DUMMY_LEG_MASTER_CONFIG);
  }

  function legAdcToKpa(adc) {
    return round(legAdcToKpaRaw(adc));
  }

  function masterAdcToKpaRaw(adc) {
    return bodyAdcToKpaRaw(adc);
  }

  function masterAdcToKpa(adc) {
    return bodyAdcToKpa(adc);
  }

  function getDummyMasterRaw(sensorType) {
    if (isDummyLegSensor(sensorType)) return legAdcToKpaRaw;
    if (isDummySleeveSensor(sensorType)) return sleeveAdcToKpaRaw;
    return bodyAdcToKpaRaw;
  }

  function inspectMatrix(matrix, definition) {
    if (!Array.isArray(matrix) || matrix.length === 0 || !Array.isArray(matrix[0]) || matrix[0].length === 0) {
      throw new TypeError("matrix必须是非空二维数组");
    }
    var rows = matrix.length;
    var cols = matrix[0].length;
    var row;
    for (row = 1; row < rows; row += 1) {
      if (!Array.isArray(matrix[row]) || matrix[row].length !== cols) {
        throw new TypeError("matrix各行列数必须一致");
      }
    }
    var physical = rows === definition.physicalRows && cols === definition.physicalCols;
    var interpolated = rows === definition.physicalRows * 2 && cols === definition.physicalCols * 2;
    if (!physical && !interpolated) {
      throw new RangeError(
        definition.sensorType + "矩阵尺寸必须为"
        + definition.physicalRows + "x" + definition.physicalCols
        + "或" + (definition.physicalRows * 2) + "x" + (definition.physicalCols * 2)
        + "，实际为" + rows + "x" + cols,
      );
    }
    return {
      rows: rows,
      cols: cols,
      scale: interpolated ? 2 : 1,
      mode: interpolated ? "interpolated-2x" : "physical",
    };
  }

  function inspectValidMask(validMask, rows, cols) {
    if (validMask === undefined || validMask === null) return;
    if (!Array.isArray(validMask) || validMask.length !== rows) {
      throw new TypeError("validMask行数必须与matrix一致");
    }
    var row;
    for (row = 0; row < rows; row += 1) {
      if (!Array.isArray(validMask[row]) || validMask[row].length !== cols) {
        throw new TypeError("validMask各行列数必须与matrix一致");
      }
    }
  }

  function isFallbackGeometryValid(definition, row, column, scale) {
    var physicalRow = Math.floor(row / scale);
    var physicalColumn = Math.floor(column / scale);
    if (definition.part === "body") return physicalRow >= 5 || physicalColumn >= 3;
    if (definition.part === "left_leg") {
      return (physicalRow >= 8 && physicalRow <= 14) || physicalColumn <= 3;
    }
    if (definition.part === "right_leg") {
      return (physicalRow >= 8 && physicalRow <= 14) || physicalColumn >= 2;
    }
    return true;
  }

  function topAverage(values, topCount) {
    var count = Math.min(topCount, values.length);
    if (count === 0) return 0;
    var top = values.slice().sort(function descending(a, b) { return b - a; }).slice(0, count);
    var sum = 0;
    var index;
    for (index = 0; index < top.length; index += 1) sum += top[index];
    return sum / count;
  }

  function calculatePointSet(points, sensorType) {
    var nonZeroCount = points.length;
    var isSleeve = isDummySleeveSensor(sensorType);
    var minimumValidPoints = isSleeve ? 1 : DUMMY_MIN_VALID_POINTS;
    var topCount = getDummyTopN(sensorType) || DUMMY_TOP_N;
    var threshold = getDummyPointwiseThreshold(sensorType);
    var masterRaw = getDummyMasterRaw(sensorType);
    var pointKpas = new Array(nonZeroCount);
    var index;

    if (nonZeroCount < minimumValidPoints) {
      return {
        avgKpa: null,
        maxKpa: null,
        nonZeroCount: nonZeroCount,
        topCount: topCount,
        mode: "none",
        pointKpas: pointKpas.fill(0),
        pressureSumKpa: 0,
        targetAvgKpaRaw: null,
        topAverageAdc: null,
        distributionScale: null,
        allocationMode: "none",
      };
    }

    var pointwise = !isSleeve && threshold !== null && nonZeroCount >= threshold;
    var topAverageAdc = null;
    var distributionScale;
    var allocationMode;

    if (pointwise) {
      distributionScale = DUMMY_POINTWISE_MULTIPLIER;
      allocationMode = "pointwise_x2";
      for (index = 0; index < nonZeroCount; index += 1) {
        pointKpas[index] = masterRaw(points[index].adc) * distributionScale;
      }
    } else {
      var adcValues = new Array(nonZeroCount);
      var weights = new Array(nonZeroCount);
      var weightSum = 0;
      for (index = 0; index < nonZeroCount; index += 1) adcValues[index] = points[index].adc;
      topAverageAdc = topAverage(adcValues, topCount);
      var requestedAvgKpaRaw = masterRaw(topAverageAdc);
      for (index = 0; index < nonZeroCount; index += 1) {
        weights[index] = masterRaw(points[index].adc);
        weightSum += weights[index];
      }
      distributionScale = weightSum > 0 ? (requestedAvgKpaRaw * nonZeroCount) / weightSum : 0;
      allocationMode = "normalized_master_weights";
      for (index = 0; index < nonZeroCount; index += 1) {
        pointKpas[index] = weights[index] * distributionScale;
      }
    }

    var pressureSumKpa = 0;
    var maxPressureKpaRaw = 0;
    for (index = 0; index < nonZeroCount; index += 1) {
      var pointKpa = pointKpas[index];
      pressureSumKpa += pointKpa;
      if (pointKpa > maxPressureKpaRaw) maxPressureKpaRaw = pointKpa;
    }
    var targetAvgKpaRaw = pressureSumKpa / nonZeroCount;
    return {
      avgKpa: round(targetAvgKpaRaw),
      maxKpa: round(maxPressureKpaRaw),
      nonZeroCount: nonZeroCount,
      topCount: pointwise ? 0 : topCount,
      mode: pointwise ? "pointwise_x2" : "top50",
      pointKpas: pointKpas,
      pressureSumKpa: pressureSumKpa,
      targetAvgKpaRaw: targetAvgKpaRaw,
      topAverageAdc: topAverageAdc,
      distributionScale: distributionScale,
      allocationMode: allocationMode,
    };
  }

  function createEmptyMatrix(rows, cols) {
    var matrix = new Array(rows);
    var row;
    for (row = 0; row < rows; row += 1) matrix[row] = new Array(cols).fill(0);
    return matrix;
  }

  function calculateDummyPressureFrame(matrix, sensorType, validMask) {
    var definition = getDefinition(sensorType);
    var shape = inspectMatrix(matrix, definition);
    inspectValidMask(validMask, shape.rows, shape.cols);
    var pressureMatrixKpa = createEmptyMatrix(shape.rows, shape.cols);
    var points = [];
    var row;
    var column;

    for (row = 0; row < shape.rows; row += 1) {
      for (column = 0; column < shape.cols; column += 1) {
        // 外部掩码是软件端最终插值/平移后的坐标真源，优先级最高。
        // 只有完全未传validMask时，才启用旧几何规则兜底。
        if (validMask) {
          if (validMask[row][column] === false) continue;
        } else if (!isFallbackGeometryValid(definition, row, column, shape.scale)) {
          continue;
        }
        var adc = matrix[row][column];
        if (Number.isFinite(adc) && adc > DUMMY_VALID_ADC_THRESHOLD) {
          points.push({ row: row, column: column, adc: adc });
        }
      }
    }

    var result = calculatePointSet(points, definition.sensorType);
    var index;
    for (index = 0; index < points.length; index += 1) {
      pressureMatrixKpa[points[index].row][points[index].column] = result.pointKpas[index];
    }

    return {
      version: VERSION,
      sourceAlgorithmVersion: SOURCE_ALGORITHM_VERSION,
      calibrationVersion: CALIBRATION_VERSION,
      sensorType: definition.sensorType,
      unit: "kPa",
      order: "row-major",
      origin: "top-left",
      matrixMode: shape.mode,
      rows: shape.rows,
      cols: shape.cols,
      pressureMatrixKpa: pressureMatrixKpa,
      pressureSumKpa: result.pressureSumKpa,
      avgKpa: result.avgKpa,
      maxKpa: result.maxKpa,
      nonZeroCount: result.nonZeroCount,
      effectivePointCount: result.nonZeroCount,
      topCount: result.topCount,
      mode: result.mode,
      targetAvgKpaRaw: result.targetAvgKpaRaw,
      topAverageAdc: result.topAverageAdc,
      distributionScale: result.distributionScale,
      allocationMode: result.allocationMode,
    };
  }

  function calculateDummyMatrixPressureMap(matrix, sensorType, validMask) {
    return calculateDummyPressureFrame(matrix, sensorType, validMask).pressureMatrixKpa;
  }

  function calculateDummyMatrixPressure(matrix, sensorType, validMask) {
    var frame = calculateDummyPressureFrame(matrix, sensorType, validMask);
    return {
      avgKpa: frame.avgKpa,
      maxKpa: frame.maxKpa,
      nonZeroCount: frame.nonZeroCount,
      topCount: frame.topCount,
      mode: frame.mode,
      unit: frame.unit,
      pressureMatrixKpa: frame.pressureMatrixKpa,
      pressureSumKpa: frame.pressureSumKpa,
      targetAvgKpaRaw: frame.targetAvgKpaRaw,
      topAverageAdc: frame.topAverageAdc,
      distributionScale: frame.distributionScale,
      allocationMode: frame.allocationMode,
    };
  }

  function calculateDummyValuesPressure(values, sensorType) {
    if (!isDummySensorType(sensorType)) return null;
    var points = [];
    var index;
    if (Array.isArray(values)) {
      for (index = 0; index < values.length; index += 1) {
        var adc = values[index];
        if (Number.isFinite(adc) && adc > DUMMY_VALID_ADC_THRESHOLD) {
          points.push({ row: 0, column: index, adc: adc });
        }
      }
    }
    var result = calculatePointSet(points, normalizeSensorType(sensorType));
    return {
      avgKpa: result.avgKpa,
      maxKpa: result.maxKpa,
      nonZeroCount: result.nonZeroCount,
      topCount: result.topCount,
      mode: result.mode,
      unit: "kPa",
      pressureValuesKpa: result.pointKpas,
      pressureSumKpa: result.pressureSumKpa,
      targetAvgKpaRaw: result.targetAvgKpaRaw,
      topAverageAdc: result.topAverageAdc,
      distributionScale: result.distributionScale,
      allocationMode: result.allocationMode,
    };
  }

  function calibratePressureFrame(frame) {
    if (!frame || typeof frame !== "object") {
      throw new TypeError("frame必须是对象");
    }
    return calculateDummyPressureFrame(frame.adcMatrix, frame.sensorType, frame.validMask || null);
  }

  function runSelfCheck() {
    var checks = [];
    function add(name, passed, actual, expected) {
      checks.push({ name: name, passed: Boolean(passed), actual: actual, expected: expected });
    }
    function close(actual, expected, tolerance) {
      return Math.abs(actual - expected) <= (tolerance === undefined ? 1e-9 : tolerance);
    }

    add("兼容阈值DUMMY_VALID_ADC_THRESHOLD=30", DUMMY_VALID_ADC_THRESHOLD === 30, DUMMY_VALID_ADC_THRESHOLD, 30);
    add("上衣89.28 ADC=2.5 kPa", close(bodyAdcToKpaRaw(89.28), 2.5), bodyAdcToKpaRaw(89.28), 2.5);
    add("上衣176.60 ADC=27 kPa", close(bodyAdcToKpaRaw(176.6), 27), bodyAdcToKpaRaw(176.6), 27);
    add("上衣182.60 ADC=29 kPa", close(bodyAdcToKpaRaw(182.6), 29), bodyAdcToKpaRaw(182.6), 29);
    add("袖子159.80 ADC=12.5 kPa", close(sleeveAdcToKpaRaw(159.8), 12.5), sleeveAdcToKpaRaw(159.8), 12.5);
    add("腿部175.105401868358 ADC=22.5 kPa", close(legAdcToKpaRaw(175.105401868358), 22.5), legAdcToKpaRaw(175.105401868358), 22.5);
    add("腿部178 ADC=25 kPa", close(legAdcToKpaRaw(178), 25), legAdcToKpaRaw(178), 25);
    add("腿部184 ADC=27 kPa", close(legAdcToKpaRaw(184), 27), legAdcToKpaRaw(184), 27);

    var sleeveValues = [100, 120, 140, 160];
    var sleeveResult = calculateDummyValuesPressure(sleeveValues, "dummy-sleeve-2x18");
    add("袖子N>=1始终Top50守恒分配", sleeveResult.mode === "top50" && sleeveResult.allocationMode === "normalized_master_weights", sleeveResult.mode + "/" + sleeveResult.allocationMode, "top50/normalized_master_weights");
    add("袖子守恒平均", close(sleeveResult.pressureSumKpa / sleeveResult.nonZeroCount, sleeveResult.targetAvgKpaRaw, 1e-10), sleeveResult.pressureSumKpa / sleeveResult.nonZeroCount, sleeveResult.targetAvgKpaRaw);

    var body99 = calculateDummyValuesPressure(new Array(99).fill(176.6), "dummy-body-27x12");
    var body100 = calculateDummyValuesPressure(new Array(100).fill(176.6), "dummy-body-27x12");
    add("上衣N=99使用Top50守恒分配", body99.mode === "top50" && close(body99.avgKpa, 27), body99, "top50/27 kPa");
    add("上衣N=100逐点master乘2一次", body100.mode === "pointwise_x2" && close(body100.avgKpa, 54), body100, "pointwise_x2/54 kPa");

    var leg99 = calculateDummyValuesPressure(new Array(99).fill(178), "dummy-left-leg-32x6");
    var leg100 = calculateDummyValuesPressure(new Array(100).fill(178), "dummy-right-leg-32x6");
    add("腿部N=99使用Top50守恒分配", leg99.mode === "top50" && close(leg99.avgKpa, 25), leg99, "top50/25 kPa");
    add("腿部N=100逐点master乘2一次", leg100.mode === "pointwise_x2" && close(leg100.avgKpa, 50), leg100, "pointwise_x2/50 kPa");

    var bodyMatrix = new Array(27);
    var row;
    for (row = 0; row < 27; row += 1) bodyMatrix[row] = new Array(12).fill(0);
    bodyMatrix[0][0] = 255;
    bodyMatrix[0][3] = 89.28;
    bodyMatrix[5][0] = 118.54;
    bodyMatrix[5][1] = 132.12;
    var bodyFrame = calculateDummyPressureFrame(bodyMatrix, "dummy-body-27x12");
    add("软件端上衣物理矩阵保持27x12", bodyFrame.rows === 27 && bodyFrame.cols === 12, [bodyFrame.rows, bodyFrame.cols], [27, 12]);
    add("上衣头颈前3列被固有掩码排除", bodyFrame.pressureMatrixKpa[0][0] === 0, bodyFrame.pressureMatrixKpa[0][0], 0);
    add("上衣头颈第4列参与计算", bodyFrame.pressureMatrixKpa[0][3] > 0, bodyFrame.pressureMatrixKpa[0][3], ">0");

    var shiftedBodyMatrix = new Array(54);
    var shiftedBodyMask = new Array(54);
    for (row = 0; row < 54; row += 1) {
      shiftedBodyMatrix[row] = new Array(24).fill(100);
      shiftedBodyMask[row] = new Array(24);
      for (var maskColumn = 0; maskColumn < 24; maskColumn += 1) {
        // 软件端头颈居中平移后的最终54×24掩码：前10行仅前3列无效。
        shiftedBodyMask[row][maskColumn] = !(row < 10 && maskColumn < 3);
      }
    }
    var shiftedBodyFrame = calculateDummyPressureFrame(
      shiftedBodyMatrix,
      "dummy-body-27x12",
      shiftedBodyMask,
    );
    var shiftedMaskMismatchCount = 0;
    for (row = 0; row < 54; row += 1) {
      for (maskColumn = 0; maskColumn < 24; maskColumn += 1) {
        if ((shiftedBodyFrame.pressureMatrixKpa[row][maskColumn] > 0) !== shiftedBodyMask[row][maskColumn]) {
          shiftedMaskMismatchCount += 1;
        }
      }
    }
    add("54×24上衣与软件端头颈平移validMask逐格零差异", shiftedMaskMismatchCount === 0, shiftedMaskMismatchCount, 0);
    add("54×24上衣以软件端validMask保留旧几何会漏掉的格", shiftedBodyFrame.pressureMatrixKpa[0][3] > 0, shiftedBodyFrame.pressureMatrixKpa[0][3], ">0");

    var fallbackBodyFrame = calculateDummyPressureFrame(shiftedBodyMatrix, "dummy-body-27x12");
    var fallbackMismatchCount = 0;
    for (row = 0; row < 54; row += 1) {
      for (maskColumn = 0; maskColumn < 24; maskColumn += 1) {
        if ((fallbackBodyFrame.pressureMatrixKpa[row][maskColumn] > 0) !== shiftedBodyMask[row][maskColumn]) {
          fallbackMismatchCount += 1;
        }
      }
    }
    add("未传validMask时旧几何兜底可复现反馈中的30格差异", fallbackMismatchCount === 30, fallbackMismatchCount, 30);

    var overrideBodyMask = shiftedBodyMask.map(function cloneMaskRow(maskRow) { return maskRow.slice(); });
    overrideBodyMask[12][0] = false;
    var overrideBodyFrame = calculateDummyPressureFrame(
      shiftedBodyMatrix,
      "dummy-body-27x12",
      overrideBodyMask,
    );
    add("validMask=false可排除内置几何原本有效的格", overrideBodyFrame.pressureMatrixKpa[12][0] === 0, overrideBodyFrame.pressureMatrixKpa[12][0], 0);

    var thresholdFrame = calculateDummyPressureFrame(
      [[30, 31].concat(new Array(16).fill(0)), new Array(18).fill(0)],
      "dummy-sleeve-2x18",
    );
    add("ADC30无效且31有效", thresholdFrame.nonZeroCount === 1, thresholdFrame.nonZeroCount, 1);
    add("输出压强矩阵与输入同尺寸", thresholdFrame.pressureMatrixKpa.length === 2 && thresholdFrame.pressureMatrixKpa[0].length === 18, [thresholdFrame.pressureMatrixKpa.length, thresholdFrame.pressureMatrixKpa[0].length], [2, 18]);

    var first = calculateDummyPressureFrame(bodyMatrix, "dummy-body-27x12");
    var second = calculateDummyPressureFrame(bodyMatrix, "dummy-body-27x12");
    add("相同输入得到相同结果", JSON.stringify(first) === JSON.stringify(second), true, true);

    return {
      version: VERSION,
      sourceAlgorithmVersion: SOURCE_ALGORITHM_VERSION,
      pass: checks.every(function everyCheck(item) { return item.passed; }),
      passed: checks.filter(function passedCheck(item) { return item.passed; }).length,
      total: checks.length,
      checks: checks,
    };
  }

  return Object.freeze({
    VERSION: VERSION,
    SOURCE_ALGORITHM_VERSION: SOURCE_ALGORITHM_VERSION,
    CALIBRATION_VERSION: CALIBRATION_VERSION,
    DUMMY_TOP_N: DUMMY_TOP_N,
    DUMMY_LEG_TOP_N: DUMMY_LEG_TOP_N,
    DUMMY_MIN_VALID_POINTS: DUMMY_MIN_VALID_POINTS,
    DUMMY_BODY_POINTWISE_THRESHOLD: DUMMY_BODY_POINTWISE_THRESHOLD,
    DUMMY_POINTWISE_THRESHOLD: DUMMY_POINTWISE_THRESHOLD,
    DUMMY_LEG_POINTWISE_THRESHOLD: DUMMY_LEG_POINTWISE_THRESHOLD,
    DUMMY_POINTWISE_MULTIPLIER: DUMMY_POINTWISE_MULTIPLIER,
    DUMMY_LEG_POINTWISE_MULTIPLIER: DUMMY_LEG_POINTWISE_MULTIPLIER,
    DUMMY_VALID_ADC_THRESHOLD: DUMMY_VALID_ADC_THRESHOLD,
    VALID_ADC_THRESHOLD: VALID_ADC_THRESHOLD,
    DUMMY_SEAT_TYPES: DUMMY_SEAT_TYPES,
    DUMMY_LEG_TYPES: DUMMY_LEG_TYPES,
    DUMMY_SENSOR_TYPES: DUMMY_SENSOR_TYPES,
    DUMMY_BODY_MASTER_CONFIG: DUMMY_BODY_MASTER_CONFIG,
    DUMMY_SLEEVE_MASTER_CONFIG: DUMMY_SLEEVE_MASTER_CONFIG,
    DUMMY_LEG_MASTER_CONFIG: DUMMY_LEG_MASTER_CONFIG,
    DUMMY_MASTER_CONFIG: DUMMY_BODY_MASTER_CONFIG,
    isDummySensorType: isDummySensorType,
    isDummyLegSensor: isDummyLegSensor,
    isDummySleeveSensor: isDummySleeveSensor,
    getDummyPointwiseThreshold: getDummyPointwiseThreshold,
    getDummyTopN: getDummyTopN,
    adcToDummyKpa: adcToDummyKpa,
    bodyAdcToKpaRaw: bodyAdcToKpaRaw,
    bodyAdcToKpa: bodyAdcToKpa,
    sleeveAdcToKpaRaw: sleeveAdcToKpaRaw,
    sleeveAdcToKpa: sleeveAdcToKpa,
    masterAdcToKpaRaw: masterAdcToKpaRaw,
    masterAdcToKpa: masterAdcToKpa,
    legAdcToKpaRaw: legAdcToKpaRaw,
    legAdcToKpa: legAdcToKpa,
    topAverage: topAverage,
    calculateDummyValuesPressure: calculateDummyValuesPressure,
    calculateDummyMatrixPressure: calculateDummyMatrixPressure,
    calculateDummyMatrixPressureMap: calculateDummyMatrixPressureMap,
    calculateDummyPressureFrame: calculateDummyPressureFrame,
    calibratePressureFrame: calibratePressureFrame,
    runSelfCheck: runSelfCheck,
  });
});
