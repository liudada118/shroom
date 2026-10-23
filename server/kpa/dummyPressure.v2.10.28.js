/*
 * 假人单帧压强模块：原始物理ADC矩阵 → 2×2插值 → 现有标定 → 插值后压强矩阵。
 * 文件版本：2.10.28；标定公式版本：V2.10.26（原节点、阈值和分配规则不变）。
 *
 * CommonJS加载（所有运算已内嵌，无需其他JS文件）：
 *   const pressure = require("./dummyPressure.v2.10.28.js");
 *
 * 推荐原始帧入口（只接受已按线序重排的物理矩阵，不接受1024字节串口数据）：
 *   const result = pressure.calculateDummyRawPressureFrame(rawMatrix, sensorType, validMask);
 *   const pressureMatrix = result.pressureMatrixKpa;
 *   // 袖子2×18→4×36；上衣27×12→54×24；左右腿32×6→64×12。
 *
 * 原矩阵接口名称保留，但物理矩阵输入现自动先插值，再标定：
 *   calculateDummyPressureFrame(matrix, sensorType, validMask)
 *   calculateDummyMatrixPressure(matrix, sensorType, validMask)
 *   calculateDummyMatrixPressureMap(matrix, sensorType, validMask)
 *   calibratePressureFrame({adcMatrix, sensorType, validMask})
 *   // 已插值尺寸输入不会重复插值；可显式调用calculateDummyInterpolatedPressureFrame。
 *
 * validMask：原始帧入口可传物理尺寸掩码（扩成2×2块），也可传插值后尺寸掩码。
 * 固有无效物理格在插值前置0；物理掩码false的格也置0；输出标定仍按固有几何与掩码交集。
 * 有效物理格必须是有限数值；无效物理格的null/undefined等占位会转换为0。
 * 不做头颈居中平移、不旋转；掩码也必须与本文件的未旋转坐标对齐。
 *
 * 插值规则与网页一致：先横后纵，右/下边界衔接0，最后Math.trunc截断并限幅[0,255]。
 * ADC>30判断、有效点计数、Top50均值及所有压强计算都在插值后执行。
 * 袖子N>=1始终Top50守恒分配；上衣/腿3<=N<100用Top50守恒分配，N>=100逐点master×2一次。
 * 原有calculateDummyValuesPressure为已经准备好的扁平有效点入口，不承担二维插值。
 * 三套master及高压指数外推未变；不进行重新拟合、不加载外部依赖、不读写文件。
 */
(function attachDummyPressure(root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else if (root) {
    root.DummyPressureV21028 = api;
    root.DummyPressureV21027 = api; // 兼容原浏览器全局名。
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createDummyPressureApi() {
  "use strict";

  var VERSION = "2.10.28";
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

  function requirePositiveInteger(value, name) {
    if (!Number.isInteger(value) || value <= 0) {
      throw new RangeError(name + "必须是正整数");
    }
  }

  /**
   * 行优先扁平数组插值底层函数，与网页lineInterp数值规则一致。
   * width=列数；height=行数；interp1=列方向倍率；interp2=行方向倍率。
   * 此底层函数仅截断，不做[0,255]限幅；二维lineInterp2x2负责限幅。
   */
  function lineInterp(smallMat, width, height, interp1, interp2) {
    requirePositiveInteger(width, "width");
    requirePositiveInteger(height, "height");
    requirePositiveInteger(interp1, "interp1");
    requirePositiveInteger(interp2, "interp2");
    if (!Array.isArray(smallMat) || smallMat.length !== width * height) {
      throw new TypeError("smallMat必须是长度等于width×height的一维数组");
    }
    for (var index = 0; index < smallMat.length; index += 1) {
      if (!Number.isFinite(smallMat[index])) {
        throw new TypeError("smallMat每个元素必须是有限数值，无效物理格请填0");
      }
    }

    var interpValue = 1;
    var newWidth = width * interp1;
    var bigLen = newWidth * (height * interp2);
    var bigMat = new Array(bigLen).fill(0);
    var i;
    var j;
    var k;

    // 第一轮：横向插值，仅填充i*interp2行。
    for (i = 0; i < height; i += 1) {
      for (j = 0; j < width; j += 1) {
        var realValue = smallMat[i * width + j] * interpValue;
        var rightRaw = j === width - 1 ? 0 : smallMat[i * width + j + 1] * interpValue;
        var rowValue = rightRaw ? rightRaw : 0;
        bigMat[newWidth * i * interp2 + j * interp1] = smallMat[i * width + j] * interpValue;
        for (k = 0; k < interp1; k += 1) {
          bigMat[newWidth * (i * interp2) + (j * interp1 + k)] =
            realValue + (rowValue - realValue) * k / interp1;
        }
      }
    }

    // 第二轮：纵向插值；下边界越界按0处理。
    for (i = 0; i < height; i += 1) {
      for (j = 0; j < newWidth; j += 1) {
        var verticalRealValue = bigMat[i * interp2 * newWidth + j];
        var downRaw = bigMat[((i + 1) * interp2) * newWidth + j];
        var colValue = downRaw ? downRaw : 0;
        for (k = 0; k < interp2; k += 1) {
          bigMat[newWidth * (i * interp2 + k) + j] =
            verticalRealValue + (colValue - verticalRealValue) * k / interp2;
        }
      }
    }

    return bigMat.map(function truncate(value) { return Math.trunc(value); });
  }

  /**
   * 推荐入口：输入一帧物理ADC二维矩阵，return一帧2倍尺寸的ADC二维矩阵。
   * lineInterp2x2(matrix)：自动取行列数。
   * lineInterp2x2(matrix, rows, cols)：兼容网页原函数调用签名。
   * 不修改输入矩阵。新增参数校验不改变合法输入的数值计算。
   */
  function lineInterp2x2(small, rows, cols) {
    if (!Array.isArray(small) || small.length === 0 ||
        !Array.isArray(small[0]) || small[0].length === 0) {
      throw new TypeError("small必须是非空二维ADC矩阵");
    }
    if (rows === undefined) rows = small.length;
    if (cols === undefined) cols = small[0].length;
    requirePositiveInteger(rows, "rows");
    requirePositiveInteger(cols, "cols");
    if (rows !== small.length) throw new RangeError("rows必须等于输入矩阵行数");

    var flat = new Array(rows * cols);
    var r;
    var c;
    for (r = 0; r < rows; r += 1) {
      if (!Array.isArray(small[r]) || small[r].length !== cols) {
        throw new TypeError("输入矩阵各行列数必须一致且等于cols");
      }
      for (c = 0; c < cols; c += 1) {
        if (!Number.isFinite(small[r][c])) {
          throw new TypeError("每个ADC必须是有限数值，无效物理格请填0");
        }
        flat[r * cols + c] = small[r][c];
      }
    }

    var flatBig = lineInterp(flat, cols, rows, 2, 2);
    var bigRows = rows * 2;
    var bigCols = cols * 2;
    var big = new Array(bigRows);
    for (r = 0; r < bigRows; r += 1) {
      var row = new Array(bigCols);
      for (c = 0; c < bigCols; c += 1) {
        var v = flatBig[r * bigCols + c];
        if (v < 0) v = 0;
        else if (v > 255) v = 255;
        row[c] = v;
      }
      big[r] = row;
    }
    return big;
  }

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

  function isGeometryValid(definition, row, column, scale) {
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

  function calculatePreparedPressureFrame(matrix, sensorType, validMask) {
    var definition = getDefinition(sensorType);
    var shape = inspectMatrix(matrix, definition);
    inspectValidMask(validMask, shape.rows, shape.cols);
    var pressureMatrixKpa = createEmptyMatrix(shape.rows, shape.cols);
    var points = [];
    var row;
    var column;

    for (row = 0; row < shape.rows; row += 1) {
      for (column = 0; column < shape.cols; column += 1) {
        if (!isGeometryValid(definition, row, column, shape.scale)) continue;
        if (validMask && validMask[row][column] === false) continue;
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

  /** 严格原始帧入口：物理ADC先插值，再执行原有整帧标定。 */
  function calculateDummyRawPressureFrame(rawMatrix, sensorType, validMask) {
    var definition = getDefinition(sensorType);
    var shape = inspectMatrix(rawMatrix, definition);
    if (shape.scale !== 1) {
      throw new RangeError("原始帧入口只接受物理矩阵尺寸，已插值矩阵请使用calculateDummyInterpolatedPressureFrame");
    }

    var outputRows = shape.rows * 2;
    var outputCols = shape.cols * 2;
    var physicalMask = null;
    var finalMask = null;
    if (validMask !== undefined && validMask !== null) {
      if (Array.isArray(validMask) && validMask.length === shape.rows) {
        inspectValidMask(validMask, shape.rows, shape.cols);
        physicalMask = validMask;
      } else {
        inspectValidMask(validMask, outputRows, outputCols);
        finalMask = validMask;
      }
    }

    // 无效物理格先置0；不在此处过滤ADC<=30，避免改变插值结果。
    var prepared = createEmptyMatrix(shape.rows, shape.cols);
    var combinedMask = new Array(outputRows);
    var row;
    var column;
    for (row = 0; row < shape.rows; row += 1) {
      for (column = 0; column < shape.cols; column += 1) {
        var physicalValid = isGeometryValid(definition, row, column, 1)
          && (!physicalMask || physicalMask[row][column] !== false);
        if (!physicalValid) continue;
        var adc = rawMatrix[row][column];
        if (!Number.isFinite(adc)) {
          throw new TypeError("原始矩阵有效物理格必须是有限数值，坐标(" + row + "," + column + ")");
        }
        prepared[row][column] = adc;
      }
    }
    for (row = 0; row < outputRows; row += 1) {
      combinedMask[row] = new Array(outputCols);
      for (column = 0; column < outputCols; column += 1) {
        var pr = Math.floor(row / 2);
        var pc = Math.floor(column / 2);
        combinedMask[row][column] = isGeometryValid(definition, pr, pc, 1)
          && (!physicalMask || physicalMask[pr][pc] !== false)
          && (!finalMask || finalMask[row][column] !== false);
      }
    }

    var interpolatedAdcMatrix = lineInterp2x2(prepared, shape.rows, shape.cols);
    var result = calculatePreparedPressureFrame(interpolatedAdcMatrix, definition.sensorType, combinedMask);
    result.inputRows = shape.rows;
    result.inputCols = shape.cols;
    result.inputMatrixMode = "physical";
    result.interpolationApplied = true;
    result.interpolationFactor = 2;
    result.interpolatedAdcMatrix = interpolatedAdcMatrix;
    result.interpolatedValidMask = combinedMask;
    result.pipeline = "physical_adc -> lineInterp2x2 -> pressure_calibration";
    return result;
  }

  /** 已插值帧兼容入口：不插值、不缩放，保留原有矩阵标定算法。 */
  function calculateDummyInterpolatedPressureFrame(matrix, sensorType, validMask) {
    var definition = getDefinition(sensorType);
    var shape = inspectMatrix(matrix, definition);
    if (shape.scale !== 2) {
      throw new RangeError("此入口只接受插值后矩阵尺寸，物理矩阵请使用calculateDummyRawPressureFrame");
    }
    inspectValidMask(validMask, shape.rows, shape.cols);
    var result = calculatePreparedPressureFrame(matrix, definition.sensorType, validMask);
    var combinedMask = new Array(shape.rows);
    for (var row = 0; row < shape.rows; row += 1) {
      combinedMask[row] = new Array(shape.cols);
      for (var column = 0; column < shape.cols; column += 1) {
        combinedMask[row][column] = isGeometryValid(definition, row, column, 2)
          && (!validMask || validMask[row][column] !== false);
      }
    }
    result.inputRows = shape.rows;
    result.inputCols = shape.cols;
    result.inputMatrixMode = "interpolated-2x";
    result.interpolationApplied = false;
    result.interpolationFactor = 1;
    result.interpolatedAdcMatrix = matrix.map(function copyRow(rowValues) { return rowValues.slice(); });
    result.interpolatedValidMask = combinedMask;
    result.pipeline = "interpolated_adc -> pressure_calibration";
    return result;
  }

  /** 自动识别尺寸：物理矩阵先插值，插值后矩阵不重复插值。 */
  function calculateDummyPressureFrame(matrix, sensorType, validMask) {
    var definition = getDefinition(sensorType);
    var shape = inspectMatrix(matrix, definition);
    return shape.scale === 1
      ? calculateDummyRawPressureFrame(matrix, definition.sensorType, validMask)
      : calculateDummyInterpolatedPressureFrame(matrix, definition.sensorType, validMask);
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

  // 调用getVersion()即可返回本文件编号字符串，例如"2.10.28"。
  function getVersion() {
    return VERSION;
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
    add("上衣物理矩阵27x12输出插值后54x24压强矩阵", bodyFrame.rows === 54 && bodyFrame.cols === 24 && bodyFrame.interpolationApplied, [bodyFrame.rows, bodyFrame.cols], [54, 24]);
    add("上衣头颈前3列被固有掩码排除", bodyFrame.pressureMatrixKpa[0][0] === 0, bodyFrame.pressureMatrixKpa[0][0], 0);
    add("上衣物理第4列对应插值后第7列参与计算", bodyFrame.pressureMatrixKpa[0][6] > 0, bodyFrame.pressureMatrixKpa[0][6], ">0");

    var thresholdFrame = calculateDummyPressureFrame(
      [[30, 31].concat(new Array(16).fill(0)), new Array(18).fill(0)],
      "dummy-sleeve-2x18",
    );
    add("ADC30无效且31有效", thresholdFrame.nonZeroCount === 1, thresholdFrame.nonZeroCount, 1);
    add("袖子物理2x18输出4x36压强矩阵", thresholdFrame.pressureMatrixKpa.length === 4 && thresholdFrame.pressureMatrixKpa[0].length === 36, [thresholdFrame.pressureMatrixKpa.length, thresholdFrame.pressureMatrixKpa[0].length], [4, 36]);

    var preparedAgain = calculateDummyPressureFrame(bodyFrame.interpolatedAdcMatrix, "dummy-body-27x12", bodyFrame.interpolatedValidMask);
    add("已插值输入不会重复插值", preparedAgain.rows === 54 && preparedAgain.cols === 24 && preparedAgain.interpolationApplied === false, [preparedAgain.rows, preparedAgain.cols], [54, 24]);
    add("整帧链路等于插值后单独标定", JSON.stringify(bodyFrame.pressureMatrixKpa) === JSON.stringify(preparedAgain.pressureMatrixKpa), true, true);
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
    calculateDummyRawPressureFrame: calculateDummyRawPressureFrame,
    calculateDummyInterpolatedPressureFrame: calculateDummyInterpolatedPressureFrame,
    lineInterp: lineInterp,
    lineInterp2x2: lineInterp2x2,
    calibratePressureFrame: calibratePressureFrame,
    getVersion: getVersion,
    runSelfCheck: runSelfCheck,
  });
});
