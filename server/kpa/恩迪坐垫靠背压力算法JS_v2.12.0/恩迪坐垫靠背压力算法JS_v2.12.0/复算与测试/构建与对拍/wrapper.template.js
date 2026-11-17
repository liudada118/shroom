/* seatBackrestPressure_v2.12.0.js
 * 恩迪坐垫 endi-23x23 / 恩迪靠背 new-backrest-32x25 的压力（力）、面积、逐格压强算法。
 * 与汽车座椅标定上位机 V2.7.110 同源：内核由上位机 client/src/lib 下的 sensorConfig、adcCompensation、
 * endiSeatForce、endiBackrestForce、endiPointPressure、endiCushionCore、endiBackrestCore 源码直接打包，未改写算法。
 * CommonJS（module.exports）+ 浏览器（globalThis.SeatBackrestPressureV2120），零依赖；不读写文件，
 * 不使用随机数、系统时钟、环境变量；时间戳一律由调用方显式传入。
 * 单位：压强 kPa（显示层 ÷10 得 N/cm²），力 N，面积 cm²。
 * 内核在 createLocalKernel() 函数体内，每次调用（或每个会话）新建，模块顶层只有冻结常量与函数。
 * BUILD: __BUILD_INFO__
 */
(function (factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else if (typeof globalThis !== 'undefined') globalThis.SeatBackrestPressureV2120 = api;
})(function () {
  'use strict';

  var VERSION = '2.12.0';
  var SEAT = 'endi-23x23';
  var BACK = 'new-backrest-32x25';
  var TYPES = [SEAT, BACK];

  /* ---------------- 上位机 V2.7.110 算法内核（esbuild 打包，原样嵌入） ---------------- */
  function createLocalKernel() {
    var module = { exports: {} };
    var exports = module.exports;
    /*__KERNEL__*/
    return module.exports;
  }

  /* ---------------- 通用工具 ---------------- */
  function deepFreeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      var keys = Object.keys(value);
      for (var i = 0; i < keys.length; i++) deepFreeze(value[keys[i]]);
      Object.freeze(value);
    }
    return value;
  }
  function clonePlain(v) {
    if (v === null || typeof v !== 'object') return typeof v === 'function' ? undefined : v;
    if (ArrayBuffer.isView(v)) return Array.prototype.slice.call(v);
    if (Array.isArray(v)) { var a = new Array(v.length); for (var i = 0; i < v.length; i++) a[i] = clonePlain(v[i]); return a; }
    var o = {}; var ks = Object.keys(v);
    for (var j = 0; j < ks.length; j++) { var c = clonePlain(v[ks[j]]); if (c !== undefined) o[ks[j]] = c; }
    return o;
  }
  function zeros(rows, cols) {
    var m = new Array(rows);
    for (var r = 0; r < rows; r++) { var row = new Array(cols); for (var c = 0; c < cols; c++) row[c] = 0; m[r] = row; }
    return m;
  }
  function requireType(type) {
    if (TYPES.indexOf(type) < 0) {
      throw new TypeError('不支持的 sensorType: ' + String(type) + '；仅支持 ' + TYPES.join(' / '));
    }
    return type;
  }
  function shapeOf(m) {
    if (!Array.isArray(m)) return null;
    var rows = m.length;
    if (rows === 0) return { rows: 0, cols: 0 };
    var cols = Array.isArray(m[0]) ? m[0].length : -1;
    for (var r = 0; r < rows; r++) if (!Array.isArray(m[r]) || m[r].length !== cols) return null;
    return { rows: rows, cols: cols };
  }
  /** ADC 规范化（复制，不修改输入）：非有限值、负值 → 0；大于 255 → 255。 */
  function sanitizeAdc(m, rows, cols) {
    var out = new Array(rows);
    for (var r = 0; r < rows; r++) {
      var src = m[r]; var row = new Array(cols);
      for (var c = 0; c < cols; c++) { var v = +src[c]; row[c] = v > 0 ? (v > 255 ? 255 : v) : 0; }
      out[r] = row;
    }
    return out;
  }
  /** 物理点压强 = 其 2×2 插值子格压强的平均（等面积，力等价：Σ物理×4 = Σ插值）。 */
  function aggregate2x2(interp, rows, cols) {
    var out = new Array(rows);
    for (var r = 0; r < rows; r++) {
      var a = interp[2 * r], b = interp[2 * r + 1], row = new Array(cols);
      for (var c = 0; c < cols; c++) row[c] = (a[2 * c] + a[2 * c + 1] + b[2 * c] + b[2 * c + 1]) / 4;
      out[r] = row;
    }
    return out;
  }
  /** 逐格统计：只从输出 kpa 数组统计（§2）。avgKpa 为正值格算术平均，按 0.01 kPa 四舍五入（与上位机卡片同一取整）。 */
  function statsOf(kpa) {
    var count = 0, sum = 0, max = 0;
    for (var r = 0; r < kpa.length; r++) {
      var row = kpa[r];
      for (var c = 0; c < row.length; c++) {
        var v = row[c];
        if (v > 0) { count++; sum += v; if (v > max) max = v; }
      }
    }
    return { validCount: count, avgKpa: count > 0 ? Math.round((sum * 100) / count) / 100 : 0, maxKpa: max, sumKpa: sum };
  }

  /* ---------------- 冻结常量：几何、单格修正表、拟合参数 ---------------- */
  var K0 = createLocalKernel();
  var META = clonePlain(K0.metadata());
  var GEOM = {};
  for (var ti = 0; ti < TYPES.length; ti++) GEOM[TYPES[ti]] = clonePlain(K0.sensorGeometry(TYPES[ti]));
  K0 = null;

  var SENSOR_DEFINITIONS = deepFreeze((function () {
    var d = {};
    for (var i = 0; i < TYPES.length; i++) {
      var t = TYPES[i], g = GEOM[t], seat = t === SEAT;
      d[t] = {
        sensorType: t,
        physicalRows: g.physicalRows, physicalCols: g.physicalCols,
        interpolatedRows: g.rows, interpolatedCols: g.cols,
        order: 'row-major', origin: 'top-left',
        rawFrameSize: g.frameSize, rawStride: g.rawStride,
        wireMap: g.wireMap,
        wireMapRule: 'physical[r][c] = raw[wireMap[r*physicalCols+c]]，索引超出原始帧长度时取 0',
        physicalValidMask: g.physicalValidMask,
        physicalPitchMm: seat ? [20, 20] : [26, 20],
        interpolatedCellMm: seat ? [10, 10] : [13, 10],
        algorithmPitchMm: seat ? [20, 20] : [20, 26],
        pitchNote: seat ? '坐垫行列点距均为 20 mm' : '原生 32×25：行距 26 mm、列距 20 mm（= 靠背核心 25×32 方向的行距 20 mm、列距 26 mm 转置）',
        interpolatedCellAreaCm2: seat ? 1 : 1.3,
        physicalCellAreaCm2: seat ? 4 : 5.2,
        algorithmOrientation: seat ? '原生 23×23 顺时针旋转 90° 进入坐垫核心' : '原生 32×25 转置为 25×32 进入靠背核心',
        defaultDisplayRotation: 3,
        defaultDisplayRotationNote: '上位机默认显示 = 原生插值矩阵顺时针旋转 270°；本模块所有矩阵均为原生方向（未旋转）',
      };
    }
    return d;
  })());

  /**
   * §6 单格修正表（ADC 域：ADC' = a × ADC + b，进入算法之前修正）。
   * 本版没有独立逐格多档实测数据，全部格子为 null（未标定）；null 回落到该部位全部有效格平均 a、b，
   * 当部位内没有任何已标定格时回落 a = 1、b = 0（恒等），因此当前输出与上位机 V2.7.110 完全一致。
   */
  var CELL_CALIBRATION = deepFreeze((function () {
    var d = {};
    for (var i = 0; i < TYPES.length; i++) {
      var t = TYPES[i], g = GEOM[t], n = g.physicalRows * g.physicalCols, cells = new Array(n);
      for (var k = 0; k < n; k++) cells[k] = null;
      d[t] = {
        rows: g.physicalRows, cols: g.physicalCols, order: 'row-major', origin: 'top-left',
        domain: 'adc', formula: "ADC' = a × ADC + b（物理点，未补偿原始 ADC，进入拟合算法前）",
        status: 'uncalibrated', calibratedCellCount: 0, nullFallback: '该部位全部有效格平均 a、b；无有效格时 a=1, b=0',
        cells: cells,
      };
    }
    return d;
  })());

  function cellCalibrationFallback(table) {
    var sa = 0, sb = 0, n = 0;
    for (var i = 0; i < table.cells.length; i++) {
      var e = table.cells[i];
      if (e && isFinite(e.a) && isFinite(e.b)) { sa += e.a; sb += e.b; n++; }
    }
    return n > 0 ? { a: sa / n, b: sb / n, calibrated: n } : { a: 1, b: 0, calibrated: 0 };
  }
  var CELL_FALLBACK = {};
  for (var fi = 0; fi < TYPES.length; fi++) CELL_FALLBACK[TYPES[fi]] = cellCalibrationFallback(CELL_CALIBRATION[TYPES[fi]]);
  deepFreeze(CELL_FALLBACK);

  /** 按 CELL_CALIBRATION 在 ADC 域修正物理矩阵（复制）。全部未标定时原样返回。 */
  function applyCellCalibration(physical, type) {
    var table = CELL_CALIBRATION[type], fb = CELL_FALLBACK[type];
    if (fb.calibrated === 0 && fb.a === 1 && fb.b === 0) return physical;
    var cols = table.cols, out = new Array(table.rows);
    for (var r = 0; r < table.rows; r++) {
      var row = new Array(cols);
      for (var c = 0; c < cols; c++) {
        var e = table.cells[r * cols + c] || fb, v = physical[r][c];
        var x = v > 0 ? e.a * v + e.b : 0;
        row[c] = x > 0 ? (x > 255 ? 255 : x) : 0;
      }
      out[r] = row;
    }
    return out;
  }

  var SEAT_CALIBRATION = deepFreeze(META.seat);
  var BACKREST_CALIBRATION = deepFreeze(META.backrest);
  var ADC_DEFAULTS = deepFreeze(META.adc);
  var POINT_PRESSURE_RULES = deepFreeze(META.pointPressure);
  var SOURCE_APPLICATION_VERSION = META.applicationVersion;

  /* ---------------- 输入解析 ---------------- */
  function decodeRawFrame(raw, sensorType) {
    requireType(sensorType);
    if (!raw || typeof raw.length !== 'number') throw new TypeError('raw 需要字节数组（Array 或 Uint8Array）');
    var def = SENSOR_DEFINITIONS[sensorType], R = def.physicalRows, C = def.physicalCols, map = def.wireMap;
    var out = new Array(R);
    for (var r = 0; r < R; r++) {
      var row = new Array(C);
      for (var c = 0; c < C; c++) {
        var idx = map[r * C + c];
        var v = idx < raw.length ? +raw[idx] : 0;
        row[c] = v > 0 ? (v > 255 ? 255 : v) : 0;
      }
      out[r] = row;
    }
    return out;
  }
  function framePhysical(frame, sensorType) {
    var def = SENSOR_DEFINITIONS[sensorType];
    if (!frame || typeof frame !== 'object') throw new TypeError('frame 需要 {raw|physical, timestampMs}');
    if (frame.raw != null) return decodeRawFrame(frame.raw, sensorType);
    var s = shapeOf(frame.physical);
    if (!s || s.rows !== def.physicalRows || s.cols !== def.physicalCols) {
      throw new TypeError(sensorType + ' 的 physical 需要原生方向 ' + def.physicalRows + '×' + def.physicalCols + ' 矩阵');
    }
    return sanitizeAdc(frame.physical, def.physicalRows, def.physicalCols);
  }

  /* ---------------- 结果整理 ---------------- */
  function buildResult(fr, sensorType, timestampMs, physical) {
    var def = SENSOR_DEFINITIONS[sensorType];
    var force = fr.force;
    var interp = fr.pointPressureKPa ? clonePlain(fr.pointPressureKPa) : zeros(def.interpolatedRows, def.interpolatedCols);
    var st = statsOf(interp);
    var pp = force && force.pointPressure ? force.pointPressure : null;
    var regions = [];
    if (force) {
      var cp = force.contactPressure, diag = force.endiCushion || force.endiBackrest;
      var drs = diag && diag.regions ? diag.regions : [];
      var prs = cp && cp.regions ? cp.regions : [];
      for (var i = 0; i < prs.length; i++) {
        var d = drs[i] || {};
        regions.push({
          index: i,
          forceN: prs[i].estimatedForceN,
          areaCm2: prs[i].areaCm2,
          pressureKPa: prs[i].estimatedPressureKPa,
          mode: d.mode != null ? d.mode : null,
          factorKind: d.factorKind != null ? d.factorKind : (d.overRange ? 'over_range' : 'standard'),
          forceFactor: d.forceFactor != null ? d.forceFactor : null,
          areaFactor: d.areaFactor != null ? d.areaFactor : null,
          overRange: d.overRange != null ? !!d.overRange : (d.factorKind === 'over_range'),
          diagnostics: clonePlain(d),
        });
      }
    }
    var avgP = force && force.averagePressureKPa != null ? force.averagePressureKPa : null;
    var maxP = pp && pp.maxPressureKPa != null ? pp.maxPressureKPa : null;
    var areaRegions = [];
    for (var ai = 0; ai < regions.length; ai++) areaRegions.push({ index: ai, areaCm2: regions[ai].areaCm2, factorKind: regions[ai].factorKind, areaFactor: regions[ai].areaFactor });
    return {
      sensorType: sensorType,
      timestampMs: timestampMs,
      forceN: force ? force.forceN : 0,
      areaCm2: force ? force.areaCm2 : 0,
      averagePressureKPa: avgP,
      maxPressureKPa: maxP,
      maxPressureCell: pp && pp.maxCell ? pp.maxCell.slice() : null,
      pointPressureKPa: interp,
      pointPressureStats: { validCount: st.validCount, avgKpa: st.avgKpa, maxKpa: st.maxKpa },
      physicalPressureKPa: aggregate2x2(interp, def.physicalRows, def.physicalCols),
      regions: regions,
      contourOwner: fr.contourOwner ? clonePlain(fr.contourOwner) : null,
      areaContour: clonePlain(fr.area),
      forceMetrics: force ? clonePlain(force) : null,
      /* v2.11.x 兼容字段：数值与上面同源（面积 = areaCm2；压强统计 = pointPressureKPa 直接统计） */
      areaMetrics: {
        algorithmId: sensorType === SEAT ? 'endi-cushion-contour-area' : 'endi-backrest-contour-area',
        sourceApplicationVersion: SOURCE_APPLICATION_VERSION,
        sensorType: sensorType, unit: 'cm²',
        rows: def.interpolatedRows, cols: def.interpolatedCols, cellAreaCm2: def.interpolatedCellAreaCm2,
        areaCm2: force ? force.areaCm2 : 0,
        regions: areaRegions,
      },
      pressureMetrics: {
        algorithmId: 'endi-point-pressure',
        sourceApplicationVersion: SOURCE_APPLICATION_VERSION,
        unit: 'kPa', mode: 'per-cell', grid: 'interpolated',
        avgPressureKPa: avgP, maxPressureKPa: maxP,
        validCount: st.validCount, pointPressureCount: st.validCount,
        calibrationBranch: 'endi-fitted', humanCoefficient: null,
      },
      sourcePhysical: clonePlain(physical),
      sourceMatrix: clonePlain(fr.sourceMatrix),
      displayAdcMatrix: clonePlain(fr.heatmapAdcMatrix),
    };
  }

  /* ---------------- §2 逐格接口（单帧静态） ---------------- */
  function calculateMatrixPressureMap(adcMatrix, sensorType, options) {
    requireType(sensorType);
    var o = options || {};
    var def = SENSOR_DEFINITIONS[sensorType];
    var s = shapeOf(adcMatrix);
    if (!s) throw new TypeError('adcMatrix 需要二维数组（各行等长）');
    if (s.rows === 0) return { kpa: [], avgKpa: 0, maxKpa: 0, validCount: 0, mode: 'per-cell', unit: 'kPa', grid: 'empty', sensorType: sensorType, forceN: 0, areaCm2: 0 };
    var grid, physical;
    var K = createLocalKernel();
    if (s.rows === def.physicalRows && s.cols === def.physicalCols) {
      grid = 'physical';
      physical = sanitizeAdc(adcMatrix, s.rows, s.cols);
    } else if (s.rows === def.interpolatedRows && s.cols === def.interpolatedCols) {
      grid = 'interpolated';
      var src = sanitizeAdc(adcMatrix, s.rows, s.cols);
      physical = new Array(def.physicalRows);
      for (var r = 0; r < def.physicalRows; r++) {
        var row = new Array(def.physicalCols);
        for (var c = 0; c < def.physicalCols; c++) row[c] = src[2 * r][2 * c];
        physical[r] = row;
      }
      var check = K.computeFrame(sensorType, physical, null, o.adcCompensationSettings).sourceMatrix;
      for (var rr = 0; rr < s.rows; rr++) for (var cc = 0; cc < s.cols; cc++) {
        if (Math.abs(check[rr][cc] - src[rr][cc]) > 1e-9) {
          throw new TypeError('插值形输入必须是上位机 sourceMatrix（原生方向、未补偿的 lineInterp2x2 插值 ADC）；格 (' + rr + ',' + cc + ') 与其偶数行列物理点的插值不一致。请改传原生物理矩阵或 1024 字节原始帧。');
        }
      }
    } else {
      throw new TypeError(sensorType + ' 的 adcMatrix 需要原生物理 ' + def.physicalRows + '×' + def.physicalCols + ' 或原生插值 ' + def.interpolatedRows + '×' + def.interpolatedCols + '（未旋转）');
    }
    var calibrated = applyCellCalibration(physical, sensorType);
    var fr = K.computeFrame(sensorType, calibrated, null, o.adcCompensationSettings);
    var interp = fr.pointPressureKPa ? clonePlain(fr.pointPressureKPa) : zeros(def.interpolatedRows, def.interpolatedCols);
    var kpa = grid === 'physical' ? aggregate2x2(interp, def.physicalRows, def.physicalCols) : interp;
    var mask = o.validMask;
    if (mask) {
      var ms = shapeOf(mask);
      if (!ms || ms.rows !== kpa.length || ms.cols !== kpa[0].length) throw new TypeError('validMask 需要与输出同形');
      for (var mr = 0; mr < kpa.length; mr++) for (var mc = 0; mc < kpa[mr].length; mc++) if (mask[mr][mc] === false) kpa[mr][mc] = 0;
    }
    var st = statsOf(kpa);
    var force = fr.force;
    return {
      kpa: kpa,
      avgKpa: st.avgKpa,
      maxKpa: st.maxKpa,
      validCount: st.validCount,
      mode: 'per-cell',
      unit: 'kPa',
      grid: grid,
      sensorType: sensorType,
      forceN: force ? force.forceN : 0,
      areaCm2: force ? force.areaCm2 : 0,
      hostAveragePressureKPa: force && force.averagePressureKPa != null ? force.averagePressureKPa : null,
      hostMaxPressureKPa: force && force.pointPressure && force.pointPressure.maxPressureKPa != null ? force.pointPressure.maxPressureKPa : null,
      estimation: 'static-single-frame',
    };
  }

  /* ---------------- 完整链路：单帧 / 序列 / 会话 ---------------- */
  function requireTime(frame) {
    var t = frame && frame.timestampMs;
    if (typeof t !== 'number' || !isFinite(t)) throw new TypeError('每帧需要显式有限的 timestampMs（毫秒）');
    return t;
  }
  function calculateSensorFrame(frame, sensorType, options) {
    requireType(sensorType);
    var o = options || {};
    var t = requireTime(frame);
    var physical = applyCellCalibration(framePhysical(frame, sensorType), sensorType);
    var K = createLocalKernel();
    return buildResult(K.computeFrame(sensorType, physical, null, o.adcCompensationSettings), sensorType, t, physical);
  }
  function createSensorSession(sensorType, options) {
    requireType(sensorType);
    var o = options || {};
    var K = createLocalKernel();
    var epoch = 0, frames = 0;
    function update(frame) {
      var t = requireTime(frame);
      if (frame.reset === true) { K = createLocalKernel(); epoch++; }
      var physical = applyCellCalibration(framePhysical(frame, sensorType), sensorType);
      var fr = K.computeFrame(sensorType, physical, { timestampMs: t, streamId: 'session-' + epoch }, o.adcCompensationSettings);
      frames++;
      return buildResult(fr, sensorType, t, physical);
    }
    function reset() { K = createLocalKernel(); epoch++; frames = 0; }
    return Object.freeze({
      sensorType: sensorType,
      update: update,
      reset: reset,
      frameCount: function () { return frames; },
    });
  }
  function calculateSensorSequence(frames, sensorType, options) {
    requireType(sensorType);
    if (!Array.isArray(frames)) throw new TypeError('frames 需要数组');
    var session = createSensorSession(sensorType, options);
    var out = new Array(frames.length);
    for (var i = 0; i < frames.length; i++) out[i] = session.update(frames[i]);
    return out;
  }

  /* ---------------- 显示与兼容函数 ---------------- */
  /** V2.7.110：恩迪坐垫/靠背最大压强 = 逐格压强最大值，显示保留两位小数（kPa）；不再做 ×2 / ÷3 换算。 */
  function getMaximumPressureDisplay(rawMaxKpa, sensorType) {
    requireType(sensorType);
    if (rawMaxKpa == null || typeof rawMaxKpa !== 'number' || !isFinite(rawMaxKpa)) return null;
    return Number(rawMaxKpa.toFixed(2));
  }
  /** 显示层换算：kPa → N/cm²（÷10）。算法输出一律 kPa。 */
  function kpaToNcm2(kpa) {
    if (kpa == null || typeof kpa !== 'number' || !isFinite(kpa)) return null;
    /* 显示层换算：N/cm² = kPa ÷ 10，按 0.001 N/cm² 取整；与上位机 pressureUnits.ts kPaToNcm2 写法相同 */
    return Math.round(kpa * 100) / 1000;
  }
  /** 兼容旧名：返回逐格接口的统计量（humanCoefficient 参数已不再使用，V2.7.110 恩迪链路没有 2.2 系数）。 */
  function calculatePressureMetricsFromMatrix(matrix, sensorType, humanCoefficient) {
    var t = sensorType == null ? SEAT : sensorType;
    var m = calculateMatrixPressureMap(matrix, t);
    return {
      avgPressureKPa: m.validCount > 0 ? m.avgKpa : null,
      maxPressureKPa: m.validCount > 0 ? m.maxKpa : null,
      validCount: m.validCount,
      forceN: m.forceN,
      areaCm2: m.areaCm2,
      grid: m.grid,
      mode: 'per-cell',
      unit: 'kPa',
      humanCoefficientUsed: false,
      ignoredHumanCoefficient: humanCoefficient == null ? null : humanCoefficient,
    };
  }
  /**
   * 坐垫连续拟合闭式（砝码重量与 ADC 关系）：均匀接触 nonZeroCount 个插值格、各格 ADC = adc、位置增益取 1 时的估算压强（kPa）。
   * m = exp(c0 + k·ln R)，R = (nonZeroCount/4)·[−ln(1 − adc/256)]；F = 9.8·m；S = nonZeroCount × 1 cm²；P = 10F/S。
   * 仅表达拟合关系（单调曲线），不含状态机标准档识别、超量程与真人系数，不等于上位机整帧输出。
   */
  function estimateAvgPressure(adc, nonZeroCount) {
    var n = nonZeroCount == null ? 64 : +nonZeroCount;
    if (typeof adc !== 'number' || !isFinite(adc) || adc < 0 || !(n > 0)) return null;
    if (adc === 0) return 0;
    var fit = SEAT_CALIBRATION.params.fit;
    var a = adc > 255 ? 255 : adc;
    var R = (n / 4) * -Math.log(1 - a / 256);
    var m = Math.exp(fit.c0 + fit.k * Math.log(R));
    return (10 * SEAT_CALIBRATION.gravity * m) / (n * SEAT_CALIBRATION.interpCellAreaCm2);
  }
  /**
   * 靠背连续拟合闭式：均匀接触 nonZeroCount 个插值格、各格 ADC = adc、位置增益取 1 时的估算压强（kPa）。
   * m = exp(c0 + k·ln F)，F = (nonZeroCount/4)·adc²；F力 = 9.8·m；S = nonZeroCount × 1.3 cm²；P = 10F力/S。
   */
  function estimateBackrestAvgPressure(adc, nonZeroCount) {
    var n = nonZeroCount == null ? 49 : +nonZeroCount;
    if (typeof adc !== 'number' || !isFinite(adc) || adc < 0 || !(n > 0)) return null;
    if (adc === 0) return 0;
    var cfg = BACKREST_CALIBRATION.config;
    var a = adc > 255 ? 255 : adc;
    var F = (n / 4) * Math.pow(a, cfg.fitFeatureP);
    var m = Math.exp(cfg.fitC0 + cfg.fitK * Math.log(F));
    return (10 * BACKREST_CALIBRATION.gravity * m) / (n * BACKREST_CALIBRATION.interpCellAreaCm2);
  }

  /* ---------------- 自检 ---------------- */
  function syntheticPhysical(type, peak, radius, cr, cc) {
    var def = SENSOR_DEFINITIONS[type], m = zeros(def.physicalRows, def.physicalCols);
    for (var r = 0; r < def.physicalRows; r++) for (var c = 0; c < def.physicalCols; c++) {
      var d = Math.sqrt((r - cr) * (r - cr) + (c - cc) * (c - cc));
      if (d <= radius) m[r][c] = Math.round(peak * (1 - 0.5 * d / radius));
    }
    return m;
  }
  function runSelfCheck() {
    var checks = [];
    function add(name, fn) {
      var ok = false, detail = null;
      try { var res = fn(); ok = res === true || (res && res.ok === true); if (res && res.detail != null) detail = res.detail; }
      catch (e) { ok = false; detail = String(e && e.message || e); }
      checks.push({ name: name, passed: ok, detail: detail });
    }
    add('CELL_CALIBRATION 行优先/左上原点，cells 长度 = rows×cols，null 回落恒等', function () {
      for (var i = 0; i < TYPES.length; i++) {
        var t = CELL_CALIBRATION[TYPES[i]];
        if (t.order !== 'row-major' || t.origin !== 'top-left' || t.cells.length !== t.rows * t.cols) return false;
        if (CELL_FALLBACK[TYPES[i]].a !== 1 || CELL_FALLBACK[TYPES[i]].b !== 0) return false;
      }
      return true;
    });
    add('空载：kpa 与输入同形且全为 0，avg/max/validCount = 0', function () {
      for (var i = 0; i < TYPES.length; i++) {
        var def = SENSOR_DEFINITIONS[TYPES[i]];
        var m = calculateMatrixPressureMap(zeros(def.physicalRows, def.physicalCols), TYPES[i]);
        if (m.kpa.length !== def.physicalRows || m.kpa[0].length !== def.physicalCols) return false;
        if (m.avgKpa !== 0 || m.maxKpa !== 0 || m.validCount !== 0) return false;
        for (var r = 0; r < m.kpa.length; r++) for (var c = 0; c < m.kpa[r].length; c++) if (m.kpa[r][c] !== 0) return false;
      }
      return true;
    });
    add('加载帧：输出全为有限数字，avg/max 由 kpa 直接统计，插值格平均 = 上位机平均压强，物理格力等价', function () {
      for (var i = 0; i < TYPES.length; i++) {
        var t = TYPES[i], def = SENSOR_DEFINITIONS[t];
        var phys = syntheticPhysical(t, 150, 2.6, Math.floor(def.physicalRows / 2), Math.floor(def.physicalCols / 2));
        var mp = calculateMatrixPressureMap(phys, t);
        var fr = calculateSensorFrame({ physical: phys, timestampMs: 0 }, t);
        var mi = calculateMatrixPressureMap(fr.sourceMatrix, t);
        if (!(mp.validCount > 0 && mi.validCount > 0)) return { ok: false, detail: t + ' 无接触' };
        var all = [mp.kpa, mi.kpa];
        for (var a = 0; a < all.length; a++) for (var r = 0; r < all[a].length; r++) for (var c = 0; c < all[a][r].length; c++) {
          var v = all[a][r][c]; if (typeof v !== 'number' || !isFinite(v) || v < 0) return false;
        }
        var sp = statsOf(mp.kpa), si = statsOf(mi.kpa);
        if (sp.avgKpa !== mp.avgKpa || sp.maxKpa !== mp.maxKpa || si.avgKpa !== mi.avgKpa || si.maxKpa !== mi.maxKpa) return false;
        if (mi.avgKpa !== fr.averagePressureKPa || mi.maxKpa !== fr.maxPressureKPa) return { ok: false, detail: t + ' 插值格统计与上位机卡片不一致' };
        if (fr.pressureMetrics.avgPressureKPa !== fr.averagePressureKPa || fr.pressureMetrics.maxPressureKPa !== fr.maxPressureKPa || fr.areaMetrics.areaCm2 !== fr.areaCm2) return { ok: false, detail: t + ' 兼容字段与主字段不一致' };
        if (Math.abs(sp.sumKpa * 4 - si.sumKpa) > 1e-6) return { ok: false, detail: t + ' 物理格与插值格总量不等' };
      }
      return true;
    });
    add('插值形输入只接受 sourceMatrix；不支持的 sensorType 明确报错', function () {
      var def = SENSOR_DEFINITIONS[SEAT], bad = zeros(def.interpolatedRows, def.interpolatedCols);
      bad[1][1] = 100;
      var threw = false; try { calculateMatrixPressureMap(bad, SEAT); } catch (e) { threw = true; }
      var threw2 = false; try { calculateMatrixPressureMap([[0]], 'dummy-body-27x12'); } catch (e2) { threw2 = true; }
      return threw && threw2;
    });
    add('连续拟合闭式曲线 ADC 0..255 步长 0.1 严格单调递增', function () {
      var p0 = estimateAvgPressure(0), b0 = estimateBackrestAvgPressure(0);
      if (p0 !== 0 || b0 !== 0) return false;
      var lastS = 0, lastB = 0;
      for (var k = 1; k <= 2550; k++) {
        var adc = k / 10, s = estimateAvgPressure(adc), b = estimateBackrestAvgPressure(adc);
        if (!(s > lastS) || !(b > lastB)) return { ok: false, detail: 'ADC ' + adc };
        lastS = s; lastB = b;
      }
      return true;
    });
    add('序列确定性：同一输入两次计算完全相同，且不修改输入', function () {
      for (var i = 0; i < TYPES.length; i++) {
        var t = TYPES[i], def = SENSOR_DEFINITIONS[t], frames = [];
        for (var f = 0; f < 12; f++) {
          var peak = f < 2 ? 0 : 60 + 10 * f;
          frames.push({ physical: peak ? syntheticPhysical(t, peak, 2.6, Math.floor(def.physicalRows / 2), Math.floor(def.physicalCols / 2)) : zeros(def.physicalRows, def.physicalCols), timestampMs: f * 50 });
        }
        var before = JSON.stringify(frames);
        var a = JSON.stringify(calculateSensorSequence(frames, t));
        var b = JSON.stringify(calculateSensorSequence(frames, t));
        if (a !== b || JSON.stringify(frames) !== before) return false;
      }
      return true;
    });
    add('最大压强显示：恩迪链路不再 ×2/÷3，仅保留两位小数', function () {
      return getMaximumPressureDisplay(12.345, SEAT) === 12.35 && getMaximumPressureDisplay(12.344, BACK) === 12.34 && getMaximumPressureDisplay(null, SEAT) === null;
    });
    var passed = true;
    for (var i = 0; i < checks.length; i++) if (!checks[i].passed) passed = false;
    return { passed: passed, version: VERSION, sourceApplicationVersion: SOURCE_APPLICATION_VERSION, checks: checks };
  }

  return deepFreeze({
    VERSION: VERSION,
    SOURCE_APPLICATION_VERSION: SOURCE_APPLICATION_VERSION,
    SENSOR_TYPES: TYPES.slice(),
    SENSOR_DEFINITIONS: SENSOR_DEFINITIONS,
    CELL_CALIBRATION: CELL_CALIBRATION,
    SEAT_CALIBRATION: SEAT_CALIBRATION,
    BACKREST_CALIBRATION: BACKREST_CALIBRATION,
    ADC_COMPENSATION_DEFAULTS: ADC_DEFAULTS,
    POINT_PRESSURE_RULES: POINT_PRESSURE_RULES,
    decodeRawFrame: decodeRawFrame,
    calculateMatrixPressureMap: calculateMatrixPressureMap,
    calculateDummyMatrixPressureMap: calculateMatrixPressureMap,
    calculateSensorFrame: calculateSensorFrame,
    calculateSensorSequence: calculateSensorSequence,
    createSensorSession: createSensorSession,
    getMaximumPressureDisplay: getMaximumPressureDisplay,
    kpaToNcm2: kpaToNcm2,
    calculatePressureMetricsFromMatrix: calculatePressureMetricsFromMatrix,
    estimateAvgPressure: estimateAvgPressure,
    estimateBackrestAvgPressure: estimateBackrestAvgPressure,
    runSelfCheck: runSelfCheck,
  });
});
