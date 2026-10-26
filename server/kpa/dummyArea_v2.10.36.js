/*
 * 独立面积模块 v2.10.36；面积模型：已批准的叠放面积拟合-v2。
 * 原始物理ADC -> 所给dummyPressure.v2.10.28 (1).js的原版2x2插值 -> 面积。
 * 单文件、无运行依赖、无文件读写、无缓存；不包含、不替代压强模块。
 * CommonJS: const area = require('./dummyArea_v2.10.36.js');
 * Browser:  <script src="dummyArea_v2.10.36.js"></script> -> DummyAreaV21036
 *
 * calculateDummyRawAreaFrame(rawMatrix, sensorType, validMask?, options?)
 * calculateDummyAreaFrame(matrix, sensorType, validMask?, options?) 自动识别尺寸。
 * calculateDummyInterpolatedAreaFrame(matrix, sensorType, validMask?, options?) 不重复插值。
 * calculateDummyDisplayedAreaFrame(matrix, rotatedMask?, filterThreshold?) 接网页旋转后的主图。
 * calculateJacketGridArea(matrix, rotatedMask?, filterThreshold?) 兼容现有面积标量入口。
 *
 * 原始/已插值传感器入口坐标：row-major、top-left、未旋转、不居中平移。
 * rawMatrix是已按线序重排的物理二维矩阵，不是1024字节串口包。
 * 物理尺寸：上衣27x12、袖子2x18、左右腿32x6；各方向插值2倍。
 * 传感器入口自动套用所给JS的固有几何，用户mask仅false排除；物理mask先置0再插值。
 * 已插值传感器入口只接受插值尺寸mask；已旋转矩阵使用Displayed入口并传同步旋转mask。
 * options只有displayFilterThreshold（默认0）：在插值后排除ADC<=门槛，不改变插值。
 * 已缩放/去噪主图可直接传Displayed入口；本模块不隐式缩放、旋转或去噪。
 *
 * 区域：掩码内可见有限正ADC，上下左右四连通；ADC>=25不超过3格的区域排除。
 * M/Q75：区域内ADC>=25的固定集合，分位数用(n-1)*q线性插值。
 * T=max(25,-20.873204449378512+0.655947193605692*M+0.3649958081705109*Q75)。
 * 面积=count(ADC>=T)*1.5625 cm2；T不取整；独立区域面积相加。
 * 55..72和63.2不参与运行计算；不输入砝码数量，不固定格数或强制限制面积。
 * 数据支持来自上衣1..5块；袖子/腿复用公式，其实际精度及6..7块外推尚未实测验证。
 */
(function attachDummyArea(root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else if (root) root.DummyAreaV21036 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createDummyAreaApi() {
  'use strict';
  var VERSION = '2.10.36';
  var AREA_MODEL_VERSION = '叠放面积拟合-v2';
  var INTERPOLATION_SOURCE_VERSION = '2.10.28';
  var CELL_SIDE_CM = 1.25;
  var CELL_AREA_CM2 = 1.5625;
  var FEATURE_MIN_ADC = 25;
  var MIN_REGION_FEATURE_CELLS = 4;
  var AREA_COEFFICIENTS = Object.freeze({
    intercept: -20.873204449378512,
    median: 0.655947193605692,
    q75: 0.3649958081705109,
  });
  var DUMMY_SENSOR_TYPES = Object.freeze([
    'dummy-body-27x12', 'dummy-sleeve-2x18',
    'dummy-left-leg-32x6', 'dummy-right-leg-32x6',
  ]);

  var SENSOR_ALIASES = Object.freeze({
    body: "dummy-body-27x12",
    sleeve: "dummy-sleeve-2x18",
    pants: "dummy-left-leg-32x6",
    leg: "dummy-left-leg-32x6",
    "left-leg": "dummy-left-leg-32x6",
    "right-leg": "dummy-right-leg-32x6",
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

  // The following functions are copied verbatim, not reimplemented.
  function requirePositiveInteger(value, name) {
    if (!Number.isInteger(value) || value <= 0) {
      throw new RangeError(name + "必须是正整数");
    }
  }

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

  function normalizeSensorType(sensorType) {
    return SENSOR_ALIASES[sensorType] || sensorType;
  }

  function isDummySensorType(sensorType) {
    return DUMMY_SENSOR_TYPES.indexOf(normalizeSensorType(sensorType)) >= 0;
  }

  function getDefinition(sensorType) {
    var normalized = normalizeSensorType(sensorType);
    var definition = SENSOR_DEFINITIONS[normalized];
    if (!definition) throw new Error("不支持的sensorType: " + String(sensorType));
    return definition;
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

  function createEmptyMatrix(rows, cols) {
    var matrix = new Array(rows);
    var row;
    for (row = 0; row < rows; row += 1) matrix[row] = new Array(cols).fill(0);
    return matrix;
  }

  function getAreaAdcThreshold(medianAdc, q75Adc) {
    return Math.max(25, -20.873204449378512 + 0.655947193605692 * medianAdc
      + 0.3649958081705109 * q75Adc);
  }

  function noMatrix(matrix) {
    return matrix == null || (Array.isArray(matrix) && (matrix.length === 0
      || (matrix.length === 1 && Array.isArray(matrix[0]) && matrix[0].length === 0)));
  }

  function requireDisplayFilter(value) {
    if (value === undefined) return 0;
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError('displayFilterThreshold必须是非负有限数值');
    }
    return value;
  }

  function optionThreshold(options) {
    if (options === undefined || options === null) return 0;
    if (typeof options !== 'object' || Array.isArray(options)) {
      throw new TypeError('options必须是对象');
    }
    return requireDisplayFilter(options.displayFilterThreshold);
  }

  function quantile(sorted, fraction) {
    var position = (sorted.length - 1) * fraction;
    var lower = Math.floor(position);
    var upper = Math.ceil(position);
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
  }

  function ascending(a, b) { return a - b; }

  // Generic displayed-grid entry. Geometry is supplied through the aligned mask,
  // so rotated or already processed webpage matrices are not interpreted twice.
  function calculateDummyDisplayedAreaFrame(matrix, validMask, displayFilterThreshold) {
    if (noMatrix(matrix)) return null;
    if (!Array.isArray(matrix) || !Array.isArray(matrix[0]) || matrix[0].length === 0) {
      throw new TypeError('matrix必须是非空二维数组');
    }
    var rows = matrix.length;
    var cols = matrix[0].length;
    var row;
    var col;
    for (row = 0; row < rows; row += 1) {
      if (!Array.isArray(matrix[row]) || matrix[row].length !== cols) {
        throw new TypeError('matrix各行列数必须一致');
      }
    }
    inspectValidMask(validMask, rows, cols);
    var filter = requireDisplayFilter(displayFilterThreshold);
    var size = rows * cols;
    var visible = new Uint8Array(size);
    var visited = new Uint8Array(size);
    var queue = new Int32Array(size);
    var keptMask = new Array(rows);
    var areaMatrix = createEmptyMatrix(rows, cols);
    var copiedAdc = new Array(rows);
    var count = 0;
    var regions = [];
    var excludedNoiseRegionCount = 0;
    for (row = 0; row < rows; row += 1) {
      keptMask[row] = new Array(cols).fill(false);
      copiedAdc[row] = matrix[row].slice();
      for (col = 0; col < cols; col += 1) {
        var adc = matrix[row][col];
        if ((!validMask || validMask[row][col] !== false)
          && Number.isFinite(adc) && adc > 0 && !(filter > 0 && adc <= filter)) {
          visible[row * cols + col] = 1;
        }
      }
    }
    var tail = 0;
    // No array/object allocation per visited cell; all traversal buffers are local.
    function enqueue(index) {
      if (visible[index] && !visited[index]) {
        visited[index] = 1;
        queue[tail] = index;
        tail += 1;
      }
    }
    for (var start = 0; start < size; start += 1) {
      if (!visible[start] || visited[start]) continue;
      tail = 0;
      enqueue(start);
      var values = [];
      for (var head = 0; head < tail; head += 1) {
        var index = queue[head];
        row = Math.floor(index / cols);
        col = index - row * cols;
        var value = matrix[row][col];
        if (value >= FEATURE_MIN_ADC) values.push(value);
        if (row > 0) enqueue(index - cols);
        if (row + 1 < rows) enqueue(index + cols);
        if (col > 0) enqueue(index - 1);
        if (col + 1 < cols) enqueue(index + 1);
      }
      if (values.length < MIN_REGION_FEATURE_CELLS) {
        excludedNoiseRegionCount += 1;
        continue;
      }
      values.sort(ascending);
      var median = quantile(values, 0.5);
      var q75 = quantile(values, 0.75);
      var threshold = getAreaAdcThreshold(median, q75);
      var retained = 0;
      for (var point = 0; point < tail; point += 1) {
        var cell = queue[point];
        row = Math.floor(cell / cols);
        col = cell - row * cols;
        if (matrix[row][col] >= threshold) {
          keptMask[row][col] = true;
          areaMatrix[row][col] = CELL_AREA_CM2;
          retained += 1;
        }
      }
      count += retained;
      regions.push({
        id: regions.length + 1,
        positiveCellCount: tail,
        featureCellCount: values.length,
        medianAdc: median,
        q75Adc: q75,
        thresholdAdc: threshold,
        retainedCellCount: retained,
        areaCm2: retained * CELL_AREA_CM2,
      });
    }
    return {
      version: VERSION,
      modelVersion: AREA_MODEL_VERSION,
      sensorType: null,
      mode: 'display-cell-count',
      unit: 'cm²',
      rows: rows,
      cols: cols,
      cellSideCm: CELL_SIDE_CM,
      cellAreaCm2: CELL_AREA_CM2,
      areaCm2: count * CELL_AREA_CM2,
      retainedCellCount: count,
      areaMatrixCm2: areaMatrix,
      retainedMask: keptMask,
      regionCount: regions.length,
      regions: regions,
      excludedNoiseRegionCount: excludedNoiseRegionCount,
      displayFilterThreshold: filter,
      adcMatrix: copiedAdc,
      inputRows: rows,
      inputCols: cols,
      inputMatrixMode: 'displayed',
      interpolationApplied: false,
      interpolationFactor: 1,
      pipeline: 'displayed_adc -> regional_area',
    };
  }

  function calculateDummyRawAreaFrame(rawMatrix, sensorType, validMask, options) {
    var definition = getDefinition(sensorType);
    if (noMatrix(rawMatrix)) return null;
    var shape = inspectMatrix(rawMatrix, definition);
    if (shape.scale !== 1) {
      throw new RangeError('原始帧入口只接受物理矩阵尺寸，已插值矩阵请使用calculateDummyInterpolatedAreaFrame');
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
          throw new TypeError('原始矩阵有效物理格必须是有限数值，坐标(' + row + ',' + column + ')');
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
    var interpolated = lineInterp2x2(prepared, shape.rows, shape.cols);
    var result = calculateDummyDisplayedAreaFrame(interpolated, combinedMask, optionThreshold(options));
    result.sensorType = definition.sensorType;
    result.inputRows = shape.rows;
    result.inputCols = shape.cols;
    result.inputMatrixMode = 'physical';
    result.interpolationApplied = true;
    result.interpolationFactor = 2;
    result.interpolatedAdcMatrix = result.adcMatrix;
    result.interpolatedValidMask = combinedMask;
    result.pipeline = 'physical_adc -> lineInterp2x2 -> regional_area';
    return result;
  }

  function calculateDummyInterpolatedAreaFrame(matrix, sensorType, validMask, options) {
    var definition = getDefinition(sensorType);
    if (noMatrix(matrix)) return null;
    var shape = inspectMatrix(matrix, definition);
    if (shape.scale !== 2) {
      throw new RangeError('此入口只接受插值后矩阵尺寸，物理矩阵请使用calculateDummyRawAreaFrame');
    }
    inspectValidMask(validMask, shape.rows, shape.cols);
    var combinedMask = new Array(shape.rows);
    for (var row = 0; row < shape.rows; row += 1) {
      combinedMask[row] = new Array(shape.cols);
      for (var col = 0; col < shape.cols; col += 1) {
        combinedMask[row][col] = isGeometryValid(definition, row, col, 2)
          && (!validMask || validMask[row][col] !== false);
      }
    }
    var result = calculateDummyDisplayedAreaFrame(matrix, combinedMask, optionThreshold(options));
    result.sensorType = definition.sensorType;
    result.inputMatrixMode = 'interpolated-2x';
    result.interpolatedAdcMatrix = result.adcMatrix;
    result.interpolatedValidMask = combinedMask;
    result.pipeline = 'interpolated_adc -> regional_area';
    return result;
  }

  function calculateDummyAreaFrame(matrix, sensorType, validMask, options) {
    var definition = getDefinition(sensorType);
    if (noMatrix(matrix)) return null;
    var shape = inspectMatrix(matrix, definition);
    return shape.scale === 1
      ? calculateDummyRawAreaFrame(matrix, definition.sensorType, validMask, options)
      : calculateDummyInterpolatedAreaFrame(matrix, definition.sensorType, validMask, options);
  }

  function calculateDummyMatrixArea(matrix, sensorType, validMask, options) {
    var result = calculateDummyAreaFrame(matrix, sensorType, validMask, options);
    return result === null ? null : result.areaCm2;
  }

  function calculateJacketGridArea(matrix, validMask, displayFilterThreshold) {
    var result = calculateDummyDisplayedAreaFrame(matrix, validMask, displayFilterThreshold);
    return result === null ? null : result.areaCm2;
  }

  function getVersion() { return VERSION; }

  function runSelfCheck() {
    var checks = [];
    function add(name, passed) { checks.push({ name: name, passed: passed }); }
    add('面积门槛系数未改变', Math.abs(getAreaAdcThreshold(70, 90) - 57.89272183836591) < 1e-10);
    add('四格区域保留三个达标格', calculateJacketGridArea([[120, 80, 60, 25]]) === 4.6875);
    add('不足四个特征格的区域排除', calculateJacketGridArea([[120, 80, 60]]) === 0);
    add('无矩阵返回null', calculateJacketGridArea(null) === null);
    add('空帧返回0', calculateJacketGridArea([[0, 0, 0, 0]]) === 0);
    add('边界补0截断与原插值一致', JSON.stringify(lineInterp2x2([[100]])) === '[[100,50],[50,25]]');
    add('分离区域面积相加', calculateJacketGridArea([[80, 80, 80, 80, 0, 100, 100, 100, 100]]) === 12.5);
    for (var i = 0; i < DUMMY_SENSOR_TYPES.length; i += 1) {
      var type = DUMMY_SENSOR_TYPES[i];
      var definition = getDefinition(type);
      var raw = createEmptyMatrix(definition.physicalRows, definition.physicalCols);
      var frame = calculateDummyRawAreaFrame(raw, type);
      add(type + '尺寸与空帧', frame.rows === definition.physicalRows * 2
        && frame.cols === definition.physicalCols * 2 && frame.areaCm2 === 0);
      var again = calculateDummyAreaFrame(frame.interpolatedAdcMatrix, type, frame.interpolatedValidMask);
      add(type + '已插值不重复插值', again.interpolationApplied === false && again.areaCm2 === 0);
    }
    return {
      pass: checks.every(function every(item) { return item.passed; }),
      passed: checks.filter(function passed(item) { return item.passed; }).length,
      total: checks.length,
      checks: checks,
    };
  }

  return Object.freeze({
    VERSION: VERSION,
    AREA_MODEL_VERSION: AREA_MODEL_VERSION,
    INTERPOLATION_SOURCE_VERSION: INTERPOLATION_SOURCE_VERSION,
    CELL_SIDE_CM: CELL_SIDE_CM,
    CELL_AREA_CM2: CELL_AREA_CM2,
    FEATURE_MIN_ADC: FEATURE_MIN_ADC,
    MIN_REGION_FEATURE_CELLS: MIN_REGION_FEATURE_CELLS,
    AREA_COEFFICIENTS: AREA_COEFFICIENTS,
    DUMMY_SENSOR_TYPES: DUMMY_SENSOR_TYPES,
    SENSOR_DEFINITIONS: SENSOR_DEFINITIONS,
    isDummySensorType: isDummySensorType,
    lineInterp: lineInterp,
    lineInterp2x2: lineInterp2x2,
    getAreaAdcThreshold: getAreaAdcThreshold,
    getJacketAreaAdcThreshold: getAreaAdcThreshold,
    calculateDummyRawAreaFrame: calculateDummyRawAreaFrame,
    calculateDummyInterpolatedAreaFrame: calculateDummyInterpolatedAreaFrame,
    calculateDummyAreaFrame: calculateDummyAreaFrame,
    calculateDummyDisplayedAreaFrame: calculateDummyDisplayedAreaFrame,
    calculateDummyMatrixArea: calculateDummyMatrixArea,
    calculateJacketGridArea: calculateJacketGridArea,
    getVersion: getVersion,
    runSelfCheck: runSelfCheck,
  });
});
