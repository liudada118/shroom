/*
 * 假人单帧压强模块 V2.10.34，保留 V2.10.28 的函数签名、帧字段和矩阵输出形状。
 * 标定算法完整采用用户备份软件 client/src/lib/dummyPressure.ts + bodyPressureRegions.ts。
 * 两个TypeScript模块的实际代码已独立内嵌；来源SHA256见MASTER_SOURCE_SHA256和CONTACT_SPLIT_SOURCE_SHA256。
 * 四类传感器统一：ADC>30，四连通/峰谷拆分，每区至少3点，各区Top50经本部位master守恒分配。
 * 整帧均压按有效点数加权，不相加各区均压，不再按100点阈值切换或乘2。
 *
 * 原始物理矩阵入口：calculateDummyRawPressureFrame(rawMatrix, sensorType, validMask)。
 * 物理ADC先按现有线序/几何与mask准备，再先横后纵2x插值；右/下补0，截断并限幅[0,255]。
 * 袖子2x18→4x36；上衣27x12→54x24；左右腿32x6→64x12。
 * 已插值入口：calculateDummyInterpolatedPressureFrame(matrix, sensorType, validMask)，不重复插值。
 * 自动识别入口：calculateDummyPressureFrame/calculateDummyMatrixPressure/calculateDummyMatrixPressureMap。
 * 扁平入口：calculateDummyValuesPressure(values, sensorType)，保留原列下标及零间隔的接触拓扑。
 * 扁平pressureValuesKpa沿用旧接口的有效ADC点顺序，忽略小区的点对应0；输入数据不会被修改。
 *
 * 本文件为独立UMD：CommonJS require或浏览器DummyPressureV21034，无其他运行时依赖与文件读写。
 */
(function attachDummyPressure(root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else if (root) {
    root.DummyPressureV21034 = api;
    root.DummyPressureV21028 = api; // 兼容原浏览器全局名。
    root.DummyPressureV21027 = api; // 兼容原浏览器全局名。
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createDummyPressureApi() {
  "use strict";

  var VERSION = "2.10.34";
  var SOURCE_ALGORITHM_VERSION = "V2.10.34";
  var MASTER_SOURCE_VERSION = "V2.10.34";
  var RULE_VERSION = "V2.10.34";
  var RULE_SCOPE = "contact-region";
  var CONTACT_SPLIT_SOURCE_VERSION = "V2.10.34";
  var CONTACT_SPLIT_SOURCE_FILE = "client/src/lib/bodyPressureRegions.ts";
  var CONTACT_SPLIT_SOURCE_SHA256 = "5939938a16cb36b7fae9082a1208810d19103783e12c55b81b7acb9533b8c6ec";
  var CALIBRATION_VERSION = MASTER_SOURCE_VERSION;
  var MASTER_SOURCE_FILE = "client/src/lib/dummyPressure.ts";
  var MASTER_SOURCE_SHA256 = "b02af65068451bec0bb8572bce68192a79c4a2b1787fdeb05daea47cd03ec99d";
  var DUMMY_TOP_N = 50;
  var DUMMY_LEG_TOP_N = 50;
  var DUMMY_MIN_VALID_POINTS = 3;
  var DUMMY_BODY_POINTWISE_THRESHOLD = null;
  var DUMMY_POINTWISE_THRESHOLD = 100; // 历史兼容常量，不参与V2.10.34计算。
  var DUMMY_LEG_POINTWISE_THRESHOLD = null;
  var DUMMY_POINTWISE_MULTIPLIER = 2; // 历史兼容常量，不参与V2.10.34计算。
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

  /* BEGIN exact backup V2.10.34 TypeScript bundle (esbuild, no runtime imports). */
  var referencePressure = (() => {
    var __defProp = Object.defineProperty;
    var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
    var __getOwnPropNames = Object.getOwnPropertyNames;
    var __hasOwnProp = Object.prototype.hasOwnProperty;
    var __export = (target, all) => {
      for (var name in all)
        __defProp(target, name, { get: all[name], enumerable: true });
    };
    var __copyProps = (to, from, except, desc) => {
      if (from && typeof from === "object" || typeof from === "function") {
        for (let key of __getOwnPropNames(from))
          if (!__hasOwnProp.call(to, key) && key !== except)
            __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
      }
      return to;
    };
    var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

    // dummyPressureStandalone.ts
    var dummyPressureStandalone_exports = {};
    __export(dummyPressureStandalone_exports, {
      BODY_CONTACT_SPLIT_CONFIG: () => BODY_CONTACT_SPLIT_CONFIG,
      DUMMY_BODY_MASTER_CONFIG: () => DUMMY_BODY_MASTER_CONFIG,
      DUMMY_BODY_POINTWISE_THRESHOLD: () => DUMMY_BODY_POINTWISE_THRESHOLD,
      DUMMY_LEG_LINEAR_CONFIG: () => DUMMY_LEG_LINEAR_CONFIG,
      DUMMY_LEG_MASTER_CONFIG: () => DUMMY_LEG_MASTER_CONFIG,
      DUMMY_LEG_POINTWISE_MULTIPLIER: () => DUMMY_LEG_POINTWISE_MULTIPLIER,
      DUMMY_LEG_POINTWISE_THRESHOLD: () => DUMMY_LEG_POINTWISE_THRESHOLD,
      DUMMY_LEG_TOP_N: () => DUMMY_LEG_TOP_N,
      DUMMY_LEG_TYPES: () => DUMMY_LEG_TYPES,
      DUMMY_MASTER_CONFIG: () => DUMMY_MASTER_CONFIG,
      DUMMY_MIN_VALID_POINTS: () => DUMMY_MIN_VALID_POINTS,
      DUMMY_POINTWISE_MULTIPLIER: () => DUMMY_POINTWISE_MULTIPLIER,
      DUMMY_POINTWISE_THRESHOLD: () => DUMMY_POINTWISE_THRESHOLD,
      DUMMY_SEAT_TYPES: () => DUMMY_SEAT_TYPES,
      DUMMY_SENSOR_TYPES: () => DUMMY_SENSOR_TYPES,
      DUMMY_SLEEVE_MASTER_CONFIG: () => DUMMY_SLEEVE_MASTER_CONFIG,
      DUMMY_TOP_N: () => DUMMY_TOP_N,
      DUMMY_VALID_ADC_THRESHOLD: () => DUMMY_VALID_ADC_THRESHOLD,
      adcToDummyKpa: () => adcToDummyKpa,
      bodyAdcToKpa: () => bodyAdcToKpa,
      bodyAdcToKpaRaw: () => bodyAdcToKpaRaw,
      calculateDummyEffectivePointCount: () => calculateDummyEffectivePointCount,
      calculateDummyMatrixPressure: () => calculateDummyMatrixPressure,
      calculateDummyPressureFrame: () => calculateDummyPressureFrame,
      calculateDummyTopAdcAverage: () => calculateDummyTopAdcAverage,
      dummyPointAdcToKpa: () => dummyPointAdcToKpa,
      formatDummyPointPressure: () => formatDummyPointPressure,
      formatDummyPressureKpa: () => formatDummyPressureKpa,
      getDummyPointwiseThreshold: () => getDummyPointwiseThreshold,
      getDummyTopN: () => getDummyTopN,
      isDummyLegSensor: () => isDummyLegSensor,
      isDummySensorType: () => isDummySensorType,
      isDummySleeveSensor: () => isDummySleeveSensor,
      legAdcToKpa: () => legAdcToKpa,
      legAdcToKpaRaw: () => legAdcToKpaRaw,
      masterAdcToKpa: () => masterAdcToKpa,
      sleeveAdcToKpa: () => sleeveAdcToKpa,
      sleeveAdcToKpaRaw: () => sleeveAdcToKpaRaw,
      splitBodyPressureContact: () => splitBodyPressureContact
    });

    // bodyPressureRegions.ts
    var BODY_CONTACT_SPLIT_CONFIG = {
      sigma: 1,
      radius: 4,
      minimumProminence: 8,
      prominenceFraction: 0.25,
      minimumPeakDistance: 4,
      minimumRegionPoints: 3
    };
    var KERNEL = Array.from({ length: 9 }, (_, i) => Math.exp(-0.5 * (i - 4) ** 2));
    var kernelSum = KERNEL.reduce((sum, value) => sum + value, 0);
    for (let i = 0; i < KERNEL.length; i++) KERNEL[i] /= kernelSum;
    var stableSurface = (value) => Math.round(value * 1e10) / 1e10;
    function earlier(a, b) {
      return a.level !== b.level ? a.level < b.level : a.distance !== b.distance ? a.distance < b.distance : a.serial < b.serial;
    }
    var FloodQueue = class {
      constructor() {
        this.values = [];
      }
      push(value) {
        const values = this.values;
        let i = values.length;
        values.push(value);
        while (i > 0) {
          const parent = i - 1 >> 1;
          if (!earlier(value, values[parent])) break;
          values[i] = values[parent];
          i = parent;
        }
        values[i] = value;
      }
      pop() {
        const values = this.values;
        if (!values.length) return void 0;
        const first = values[0];
        const last = values.pop();
        if (values.length) {
          let i = 0;
          while (i * 2 + 1 < values.length) {
            let child = i * 2 + 1;
            if (child + 1 < values.length && earlier(values[child + 1], values[child])) child++;
            if (!earlier(values[child], last)) break;
            values[i] = values[child];
            i = child;
          }
          values[i] = last;
        }
        return first;
      }
    };
    function splitBodyPressureContact(points) {
      if (points.length < BODY_CONTACT_SPLIT_CONFIG.minimumRegionPoints) return [points];
      let r0 = Infinity, r1 = -Infinity, c0 = Infinity, c1 = -Infinity;
      for (const point of points) {
        r0 = Math.min(r0, point.row);
        r1 = Math.max(r1, point.row);
        c0 = Math.min(c0, point.column);
        c1 = Math.max(c1, point.column);
      }
      const rows = r1 - r0 + 1, cols = c1 - c0 + 1;
      const signal = new Float64Array(rows * cols);
      const byCell = new Int32Array(rows * cols).fill(-1);
      const cells = points.map((point, index) => {
        const cell = (point.row - r0) * cols + point.column - c0;
        signal[cell] = point.adc;
        byCell[cell] = index;
        return cell;
      });
      const vertical = new Float64Array(signal.length);
      const smooth = new Float64Array(signal.length);
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        for (let k = -4; k <= 4; k++) {
          if (r + k >= 0 && r + k < rows) vertical[r * cols + c] += signal[(r + k) * cols + c] * KERNEL[k + 4];
        }
      }
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        for (let k = -4; k <= 4; k++) {
          if (c + k >= 0 && c + k < cols) smooth[r * cols + c] += vertical[r * cols + c + k] * KERNEL[k + 4];
        }
      }
      const surface = cells.map((cell) => stableSurface(smooth[cell]));
      const adjacent = cells.map((cell) => {
        const r = Math.floor(cell / cols), c = cell % cols;
        return [
          r > 0 ? byCell[cell - cols] : -1,
          r + 1 < rows ? byCell[cell + cols] : -1,
          c > 0 ? byCell[cell - 1] : -1,
          c + 1 < cols ? byCell[cell + 1] : -1
        ].filter((i) => i >= 0);
      });
      const order = points.map((_, i) => i).sort((a, b) => surface[b] - surface[a] || a - b);
      const parent = new Int32Array(points.length).fill(-1);
      const birth = new Float64Array(points.length);
      const peak = new Int32Array(points.length);
      const find = (value) => {
        while (parent[value] !== value) {
          parent[value] = parent[parent[value]];
          value = parent[value];
        }
        return value;
      };
      const maxima = [];
      for (const cell of order) {
        parent[cell] = cell;
        birth[cell] = surface[cell];
        peak[cell] = cell;
        for (const neighbor of adjacent[cell]) {
          if (parent[neighbor] < 0) continue;
          let a = find(cell), b = find(neighbor);
          if (a === b) continue;
          if (birth[a] < birth[b]) [a, b] = [b, a];
          const prominence = birth[b] - surface[cell];
          if (prominence > 1e-8) maxima.push({ point: peak[b], height: birth[b], prominence });
          parent[b] = a;
        }
      }
      const leader = find(order[0]);
      maxima.push({ point: peak[leader], height: birth[leader], prominence: birth[leader] });
      const candidates = maxima.filter((m) => m.prominence >= Math.max(
        BODY_CONTACT_SPLIT_CONFIG.minimumProminence,
        BODY_CONTACT_SPLIT_CONFIG.prominenceFraction * m.height
      )).sort((a, b) => b.height - a.height);
      let seeds = [];
      for (const candidate of candidates) {
        const current = points[candidate.point];
        if (seeds.every((index) => Math.hypot(current.row - points[index].row, current.column - points[index].column) >= BODY_CONTACT_SPLIT_CONFIG.minimumPeakDistance)) seeds.push(candidate.point);
      }
      while (seeds.length > 1) {
        const labels = new Int32Array(points.length);
        const queue = new FloodQueue();
        let serial = 0;
        seeds.forEach((point, i) => {
          labels[point] = i + 1;
          queue.push({ level: -surface[point], distance: 0, serial: serial++, point, label: i + 1 });
        });
        let entry;
        while (entry = queue.pop()) {
          for (const neighbor of adjacent[entry.point]) {
            if (labels[neighbor]) continue;
            labels[neighbor] = entry.label;
            queue.push({
              level: Math.max(entry.level, -surface[neighbor]),
              distance: entry.distance + 1,
              serial: serial++,
              point: neighbor,
              label: entry.label
            });
          }
        }
        const groups = seeds.map(() => []);
        points.forEach((point, i) => groups[labels[i] - 1].push(point));
        const keep = seeds.filter((_, i) => groups[i].length >= BODY_CONTACT_SPLIT_CONFIG.minimumRegionPoints);
        if (keep.length === seeds.length) return groups;
        seeds = keep;
      }
      return [points];
    }

    // dummyPressure.ts
    var DUMMY_TOP_N = 50;
    var DUMMY_LEG_TOP_N = 50;
    var DUMMY_MIN_VALID_POINTS = 3;
    var DUMMY_BODY_POINTWISE_THRESHOLD = null;
    var DUMMY_POINTWISE_THRESHOLD = 100;
    var DUMMY_POINTWISE_MULTIPLIER = 2;
    var DUMMY_LEG_POINTWISE_THRESHOLD = null;
    var DUMMY_LEG_POINTWISE_MULTIPLIER = DUMMY_POINTWISE_MULTIPLIER;
    var DUMMY_VALID_ADC_THRESHOLD = 30;
    var DUMMY_SEAT_TYPES = ["dummy-sleeve-2x18", "dummy-body-27x12"];
    var DUMMY_LEG_TYPES = ["dummy-left-leg-32x6", "dummy-right-leg-32x6"];
    var DUMMY_SENSOR_TYPES = [...DUMMY_SEAT_TYPES, ...DUMMY_LEG_TYPES];
    var DUMMY_BODY_MASTER_CONFIG = {
      name: "上衣压力等级中位 ADC 单调三次 PCHIP + 6 ADC 线性过渡 master (V2.10.22，第9节点-2 ADC)",
      model: "median_pchip_linear_exponential",
      pchipNodes: [
        { adc: 89.28, pressureKpa: 2.5 },
        { adc: 118.54, pressureKpa: 5 },
        { adc: 132.12, pressureKpa: 7.5 },
        { adc: 142.41, pressureKpa: 10 },
        { adc: 148.85, pressureKpa: 12.5 },
        { adc: 153.84, pressureKpa: 15 },
        { adc: 158.15, pressureKpa: 17.5 },
        { adc: 162.67, pressureKpa: 20 },
        { adc: 164.03, pressureKpa: 22.5 },
        { adc: 167.59, pressureKpa: 25 },
        { adc: 176.6, pressureKpa: 27 }
      ],
      measuredMaxAdc: 176.6,
      measuredMaxPressureKpa: 27,
      linearExtensionAdc: 6,
      linearEndPressureKpa: 29,
      doublingAdcIncrement: 25.029777726248,
      sourceFitX0AdcAt20Kpa: 165.483291566698,
      sourceFitLogSlope: 0.027692901956,
      sourceFitLogIntercept: -1.586980295202,
      sampleCount: 40,
      measuredAdcRange: [82.94, 176.6],
      measuredPressureRangeKpa: [2.5, 25],
      trainingMaeKpa: 1.687391549158,
      trainingRmseKpa: 2.707131489027,
      trainingR2: 0.857870334082,
      highPressureCap: null
    };
    var DUMMY_SLEEVE_MASTER_CONFIG = {
      name: "袖子 F/G 四节点中位 PCHIP + 最高真实点线性衔接 + 连续指数续接 master (V2.10.21)",
      model: "median_pchip_linear_exponential",
      pchipNodes: [
        { adc: 98.75, pressureKpa: 2.5 },
        { adc: 128.39, pressureKpa: 5 },
        { adc: 141.55, pressureKpa: 7.5 },
        { adc: 150.41, pressureKpa: 10 }
      ],
      measuredMaxAdc: 150.41,
      measuredMaxPressureKpa: 10,
      linearExtensionAdc: 9.39,
      linearEndPressureKpa: 12.5,
      doublingAdcIncrement: 26.234349786138,
      sourceFitX0AdcAt20Kpa: 176.474492594458,
      sourceFitLogSlope: 0.026421359256489,
      sourceFitLogIntercept: -1.666963694890764,
      sampleCount: 20,
      measuredAdcRange: [89.52, 159.8],
      measuredPressureRangeKpa: [2.5, 12.5],
      trainingMaeKpa: 0.715897690274,
      trainingRmseKpa: 1.035500855627,
      trainingR2: 0.91421903824,
      highPressureCap: null
    };
    var DUMMY_MASTER_CONFIG = DUMMY_BODY_MASTER_CONFIG;
    var DUMMY_LEG_MASTER_CONFIG = {
      name: "裤子/左右腿 C/D 锚定指数 + 20/22.5/25 kPa局部PCHIP + 6 ADC线性过渡 master (V2.10.25，第10点178 ADC)",
      model: "anchored_exponential_pchip_linear_exponential",
      pchipNodes: [
        { adc: 172.841043963987, pressureKpa: 20 },
        { adc: 175.105401868358, pressureKpa: 22.5 },
        { adc: 178, pressureKpa: 25 }
      ],
      measuredMaxAdc: 178,
      measuredMaxPressureKpa: 25,
      linearExtensionAdc: 6,
      linearEndPressureKpa: 27,
      doublingAdcIncrement: 25.095529605267,
      sourceFitX0AdcAt20Kpa: 175.454766882345,
      sourceFitLogSlope: 0.027620344797,
      sourceFitLogIntercept: -1.850388884008,
      sampleCount: 30,
      measuredAdcRange: [88.58, 182.92],
      measuredPressureRangeKpa: [2.5, 25],
      trainingMaeKpa: 1.969298356806,
      trainingRmseKpa: 2.233360203062,
      trainingR2: 0.903265012429,
      highPressureCap: null
    };
    var DUMMY_LEG_LINEAR_CONFIG = {
      name: "反放砝码腿部 master（低 ADC 连续延伸，V2.10.7）",
      slope: 0.387427822782,
      intercept: -51.874539247424,
      firstCalibrationAdc: 132.156,
      firstCalibrationKpa: 2.5,
      lowSlope: 0.0189170374406005,
      joinAdc: 140.7680353218587,
      pCap: 27.5
    };
    var round = (value, digits = 2) => {
      const factor = 10 ** digits;
      return Math.round((value + Number.EPSILON) * factor) / factor;
    };
    function isDummySensorType(sensorType) {
      return DUMMY_SENSOR_TYPES.includes(sensorType);
    }
    function isDummyLegSensor(sensorType) {
      return DUMMY_LEG_TYPES.includes(sensorType);
    }
    function isDummySleeveSensor(sensorType) {
      return sensorType === "dummy-sleeve-2x18";
    }
    function getDummyPointwiseThreshold(sensorType) {
      return null;
    }
    function getDummyTopN(sensorType) {
      if (isDummyLegSensor(sensorType)) return DUMMY_LEG_TOP_N;
      if (isDummySensorType(sensorType)) return DUMMY_TOP_N;
      return null;
    }
    function pchipEndpointSlope(h0, h1, delta0, delta1) {
      let slope = ((2 * h0 + h1) * delta0 - h0 * delta1) / (h0 + h1);
      if (Math.sign(slope) !== Math.sign(delta0)) return 0;
      if (Math.sign(delta0) !== Math.sign(delta1) && Math.abs(slope) > 3 * Math.abs(delta0)) {
        slope = 3 * delta0;
      }
      return slope;
    }
    function pchipSlopes(nodes) {
      if (nodes.length < 2) return nodes.map(() => 0);
      if (nodes.length === 2) {
        const delta2 = (nodes[1].pressureKpa - nodes[0].pressureKpa) / (nodes[1].adc - nodes[0].adc);
        return [delta2, delta2];
      }
      const h = nodes.slice(0, -1).map((node, index) => nodes[index + 1].adc - node.adc);
      const delta = nodes.slice(0, -1).map(
        (node, index) => (nodes[index + 1].pressureKpa - node.pressureKpa) / h[index]
      );
      const slopes = new Array(nodes.length).fill(0);
      slopes[0] = pchipEndpointSlope(h[0], h[1], delta[0], delta[1]);
      slopes[nodes.length - 1] = pchipEndpointSlope(
        h[h.length - 1],
        h[h.length - 2],
        delta[delta.length - 1],
        delta[delta.length - 2]
      );
      for (let index = 1; index < nodes.length - 1; index += 1) {
        const previous = delta[index - 1];
        const next = delta[index];
        if (previous === 0 || next === 0 || Math.sign(previous) !== Math.sign(next)) {
          slopes[index] = 0;
          continue;
        }
        const weight1 = 2 * h[index] + h[index - 1];
        const weight2 = h[index] + 2 * h[index - 1];
        slopes[index] = (weight1 + weight2) / (weight1 / previous + weight2 / next);
      }
      return slopes;
    }
    function monotonePchip(adc, nodes) {
      if (nodes.length === 0) return 0;
      const first = nodes[0];
      if (adc <= first.adc) return Math.max(0, first.pressureKpa / first.adc * adc);
      const last = nodes[nodes.length - 1];
      if (adc >= last.adc) return last.pressureKpa;
      let segmentIndex = 0;
      while (segmentIndex < nodes.length - 2 && adc > nodes[segmentIndex + 1].adc) {
        segmentIndex += 1;
      }
      const left = nodes[segmentIndex];
      const right = nodes[segmentIndex + 1];
      const h = right.adc - left.adc;
      const delta = (right.pressureKpa - left.pressureKpa) / h;
      const slopes = pchipSlopes(nodes);
      const dx = adc - left.adc;
      const c2 = (3 * delta - 2 * slopes[segmentIndex] - slopes[segmentIndex + 1]) / h;
      const c3 = (slopes[segmentIndex] + slopes[segmentIndex + 1] - 2 * delta) / (h * h);
      return Math.max(
        0,
        left.pressureKpa + slopes[segmentIndex] * dx + c2 * dx * dx + c3 * dx * dx * dx
      );
    }
    function adcToDummyKpa(adc, config) {
      if (!Number.isFinite(adc) || adc <= 0) return 0;
      const linearEndAdc = config.measuredMaxAdc + config.linearExtensionAdc;
      if (adc <= config.measuredMaxAdc) {
        if (config.model === "anchored_exponential_pchip_linear_exponential" && config.pchipNodes) {
          const firstLocalNode = config.pchipNodes[0];
          if (adc > firstLocalNode.adc) return monotonePchip(adc, config.pchipNodes);
          return firstLocalNode.pressureKpa * Math.pow(
            2,
            (adc - firstLocalNode.adc) / config.doublingAdcIncrement
          );
        }
        if ((config.model === "median_pchip_linear_exponential" || config.model === "median_pchip_exponential") && config.pchipNodes) {
          return monotonePchip(adc, config.pchipNodes);
        }
        return config.measuredMaxPressureKpa * Math.pow(
          2,
          (adc - config.measuredMaxAdc) / config.doublingAdcIncrement
        );
      }
      if (adc <= linearEndAdc) {
        const progress = (adc - config.measuredMaxAdc) / config.linearExtensionAdc;
        return config.measuredMaxPressureKpa + progress * (config.linearEndPressureKpa - config.measuredMaxPressureKpa);
      }
      return config.linearEndPressureKpa * Math.pow(
        2,
        (adc - linearEndAdc) / config.doublingAdcIncrement
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
    function masterAdcToKpa(adc) {
      return bodyAdcToKpa(adc);
    }
    function legAdcToKpaRaw(adc) {
      return adcToDummyKpa(adc, DUMMY_LEG_MASTER_CONFIG);
    }
    function legAdcToKpa(adc) {
      return round(legAdcToKpaRaw(adc));
    }
    function dummyPointAdcToKpa(adc, sensorType, nonZeroCount) {
      if (!isDummySensorType(sensorType)) return null;
      if (!Number.isFinite(adc) || adc <= DUMMY_VALID_ADC_THRESHOLD) return 0;
      const basePressure = isDummyLegSensor(sensorType) ? legAdcToKpaRaw(adc) : isDummySleeveSensor(sensorType) ? sleeveAdcToKpaRaw(adc) : bodyAdcToKpaRaw(adc);
      return round(basePressure);
    }
    function formatDummyPointPressure(adc, sensorType, nonZeroCount) {
      const pressure = dummyPointAdcToKpa(adc, sensorType, nonZeroCount);
      if (pressure === null) return String(adc);
      return round(pressure, 1).toString();
    }
    function formatDummyPressureKpa(pressureKpa) {
      if (!Number.isFinite(pressureKpa) || pressureKpa <= 0) return "0";
      return round(pressureKpa, 1).toString();
    }
    function matrixPoints(matrix, validMask) {
      var _a;
      const points = [];
      for (let row = 0; row < matrix.length; row += 1) {
        for (let column = 0; column < matrix[row].length; column += 1) {
          if (((_a = validMask == null ? void 0 : validMask[row]) == null ? void 0 : _a[column]) === false) continue;
          const adc = matrix[row][column];
          if (Number.isFinite(adc) && adc > DUMMY_VALID_ADC_THRESHOLD) {
            points.push({ row, column, adc });
          }
        }
      }
      return points;
    }
    function matrixValues(matrix, validMask) {
      return matrixPoints(matrix, validMask).map((point) => point.adc);
    }
    function calculateDummyEffectivePointCount(matrix, validMask, sensorType) {
      if (isDummySensorType(sensorType)) {
        return bodyPointGroups(matrixPoints(matrix, validMask)).filter((group) => group.length >= DUMMY_MIN_VALID_POINTS).reduce((sum, group) => sum + group.length, 0);
      }
      return matrixValues(matrix, validMask).length;
    }
    function bodyPointGroups(points) {
      const byCell = new Map(points.map((point, index) => [`${point.row},${point.column}`, index]));
      const visited = /* @__PURE__ */ new Set();
      const groups = [];
      for (let index = 0; index < points.length; index += 1) {
        if (visited.has(index)) continue;
        const group = [index];
        visited.add(index);
        for (let head = 0; head < group.length; head += 1) {
          const { row, column } = points[group[head]];
          for (const [r, c] of [[row - 1, column], [row, column - 1], [row, column + 1], [row + 1, column]]) {
            const neighbor = byCell.get(`${r},${c}`);
            if (neighbor === void 0 || visited.has(neighbor)) continue;
            visited.add(neighbor);
            group.push(neighbor);
          }
        }
        groups.push(group.sort((a, b) => a - b).map((pointIndex) => points[pointIndex]));
      }
      return groups;
    }
    function topAverage(values, topCount) {
      const top = [...values].sort((a, b) => b - a).slice(0, Math.min(topCount, values.length));
      return top.length === 0 ? 0 : top.reduce((sum, value) => sum + value, 0) / top.length;
    }
    function calculateDummyTopAdcAverage(matrix, sensorType, validMask, effectivePointCount) {
      const topCount = getDummyTopN(sensorType);
      if (!isDummySensorType(sensorType) || topCount === null) return null;
      const values = matrixValues(matrix, validMask);
      if (values.length === 0) return null;
      return round(topAverage(values, topCount));
    }
    function emptyPressureMatrix(matrix) {
      return matrix.map((row) => row.map(() => 0));
    }
    function getDummyMasterRaw(sensorType) {
      if (isDummyLegSensor(sensorType)) return legAdcToKpaRaw;
      if (isDummySleeveSensor(sensorType)) return sleeveAdcToKpaRaw;
      return bodyAdcToKpaRaw;
    }
    function calculateRegionalPressureFrame(matrix, sensorType, validMask) {
      const masterRaw = getDummyMasterRaw(sensorType);
      const pressureMatrixKpa = emptyPressureMatrix(matrix);
      const groups = bodyPointGroups(matrixPoints(matrix, validMask)).filter((group) => group.length >= DUMMY_MIN_VALID_POINTS).flatMap((group) => splitBodyPressureContact(group));
      const regions = [];
      let nonZeroCount = 0;
      let pressureSumKpa = 0;
      let maxKpaRaw = 0;
      for (const group of groups) {
        if (group.length < DUMMY_MIN_VALID_POINTS) continue;
        const topAverageAdc = topAverage(group.map((point) => point.adc), DUMMY_TOP_N);
        const targetAvgKpaRaw2 = masterRaw(topAverageAdc);
        const weights = group.map((point) => masterRaw(point.adc));
        const weightSum = weights.reduce((sum, value) => sum + value, 0);
        const distributionScale = weightSum > 0 ? targetAvgKpaRaw2 * group.length / weightSum : 0;
        let regionSumKpa = 0;
        group.forEach((point, index) => {
          const pressure = weights[index] * distributionScale;
          pressureMatrixKpa[point.row][point.column] = pressure;
          regionSumKpa += pressure;
          maxKpaRaw = Math.max(maxKpaRaw, pressure);
        });
        nonZeroCount += group.length;
        pressureSumKpa += regionSumKpa;
        regions.push({ id: regions.length + 1, nonZeroCount: group.length, targetAvgKpaRaw: targetAvgKpaRaw2, topAverageAdc, distributionScale });
      }
      const targetAvgKpaRaw = nonZeroCount > 0 ? pressureSumKpa / nonZeroCount : null;
      return {
        avgKpa: targetAvgKpaRaw === null ? null : round(targetAvgKpaRaw),
        maxKpa: nonZeroCount > 0 ? round(maxKpaRaw) : null,
        nonZeroCount,
        topCount: DUMMY_TOP_N,
        mode: nonZeroCount > 0 ? "region_top50" : "none",
        pressureMatrixKpa,
        pressureSumKpa,
        targetAvgKpaRaw,
        topAverageAdc: regions.length === 1 ? regions[0].topAverageAdc : null,
        distributionScale: regions.length === 1 ? regions[0].distributionScale : null,
        allocationMode: nonZeroCount > 0 ? "regional_normalized_master_weights" : "none",
        regions
      };
    }
    function calculateDummyPressureFrame(matrix, sensorType, validMask) {
      if (!isDummySensorType(sensorType)) return null;
      return calculateRegionalPressureFrame(matrix, sensorType, validMask);
    }
    function calculateDummyMatrixPressure(matrix, sensorType, validMask) {
      const result = calculateDummyPressureFrame(matrix, sensorType, validMask);
      if (!result) return null;
      return {
        avgKpa: result.avgKpa,
        maxKpa: result.maxKpa,
        nonZeroCount: result.nonZeroCount,
        topCount: result.topCount,
        mode: result.mode
      };
    }
    return __toCommonJS(dummyPressureStandalone_exports);
  })();
  /* END exact backup bundle. Below are V2.10.28-compatible physical/matrix adapters. */

  function freezeMasterConfig(config) {
    if (config.pchipNodes) {
      config.pchipNodes.forEach(function freezeNode(node) { Object.freeze(node); });
      Object.freeze(config.pchipNodes);
    }
    Object.freeze(config.measuredAdcRange);
    Object.freeze(config.measuredPressureRangeKpa);
    return Object.freeze(config);
  }
  var DUMMY_BODY_MASTER_CONFIG = freezeMasterConfig(referencePressure.DUMMY_BODY_MASTER_CONFIG);
  var DUMMY_SLEEVE_MASTER_CONFIG = freezeMasterConfig(referencePressure.DUMMY_SLEEVE_MASTER_CONFIG);
  var DUMMY_LEG_MASTER_CONFIG = freezeMasterConfig(referencePressure.DUMMY_LEG_MASTER_CONFIG);

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

  function adcToDummyKpa(adc, config) { return referencePressure.adcToDummyKpa(adc, config); }
  function bodyAdcToKpaRaw(adc) { return referencePressure.bodyAdcToKpaRaw(adc); }
  function bodyAdcToKpa(adc) { return referencePressure.bodyAdcToKpa(adc); }
  function sleeveAdcToKpaRaw(adc) { return referencePressure.sleeveAdcToKpaRaw(adc); }
  function sleeveAdcToKpa(adc) { return referencePressure.sleeveAdcToKpa(adc); }
  function legAdcToKpaRaw(adc) { return referencePressure.legAdcToKpaRaw(adc); }
  function legAdcToKpa(adc) { return referencePressure.legAdcToKpa(adc); }
  function masterAdcToKpaRaw(adc) { return bodyAdcToKpaRaw(adc); }
  function masterAdcToKpa(adc) { return bodyAdcToKpa(adc); }

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

  /** 保留旧点列表输出顺序；真正压强由内嵌备份区域算法统一计算。 */
  function calculateRegionalPointSet(points, sensorType) {
    var rows = 1;
    var cols = 1;
    var index;
    for (index = 0; index < points.length; index += 1) {
      rows = Math.max(rows, points[index].row + 1);
      cols = Math.max(cols, points[index].column + 1);
    }
    var matrix = createEmptyMatrix(rows, cols);
    for (index = 0; index < points.length; index += 1) {
      matrix[points[index].row][points[index].column] = points[index].adc;
    }
    var result = referencePressure.calculateDummyPressureFrame(matrix, normalizeSensorType(sensorType));
    var pointKpas = new Array(points.length);
    for (index = 0; index < points.length; index += 1) {
      pointKpas[index] = result.pressureMatrixKpa[points[index].row][points[index].column];
    }
    return Object.assign({}, result, {
      pointKpas: pointKpas,
      inputPointCount: points.length,
      ignoredPointCount: points.length - result.nonZeroCount,
      regionCount: result.regions.length,
    });
  }

  function createEmptyMatrix(rows, cols) {
    var matrix = new Array(rows);
    var row;
    for (row = 0; row < rows; row += 1) matrix[row] = new Array(cols).fill(0);
    return matrix;
  }

  /**
   * 备份网页的最终矩阵入口：允许原始物理网格及任意框选尺寸，不做插值或固有几何裁剪。
   * 与 applyFilter 一致，先按原ADC和mask过滤，再 round(ADC * resultScale)。
   * validMask必须由调用者按输入矩阵的实际方向提供，避免框选坐标被误认成整帧坐标。
   */
  function calculateDummyPreparedPressureFrame(matrix, sensorType, validMask, options) {
    var normalizedType = normalizeSensorType(sensorType);
    if (!isDummySensorType(normalizedType)) return null;
    if (!Array.isArray(matrix) || !matrix.length || !Array.isArray(matrix[0]) || !matrix[0].length) {
      throw new TypeError("matrix必须是非空二维数组");
    }
    var rows = matrix.length;
    var cols = matrix[0].length;
    inspectValidMask(validMask, rows, cols);
    options = options || {};
    var threshold = Number(options.threshold);
    var resultScale = Number(options.resultScale);
    threshold = Number.isFinite(threshold) && threshold >= 0 ? threshold : 0;
    resultScale = Number.isFinite(resultScale) && resultScale > 0 ? resultScale : 1;
    var prepared = createEmptyMatrix(rows, cols);
    var inputPointCount = 0;
    for (var row = 0; row < rows; row += 1) {
      if (!Array.isArray(matrix[row]) || matrix[row].length !== cols) {
        throw new TypeError("matrix各行列数必须一致");
      }
      for (var column = 0; column < cols; column += 1) {
        var adc = Number(matrix[row][column]);
        if (validMask && validMask[row][column] === false) continue;
        if (!Number.isFinite(adc) || adc <= 0 || adc <= threshold) continue;
        var scaled = Math.round(adc * resultScale);
        if (scaled <= 0) continue;
        prepared[row][column] = scaled;
        if (scaled > DUMMY_VALID_ADC_THRESHOLD) inputPointCount += 1;
      }
    }
    var result = referencePressure.calculateDummyPressureFrame(prepared, normalizedType);
    return Object.assign({}, result, {
      version: VERSION,
      sourceAlgorithmVersion: SOURCE_ALGORITHM_VERSION,
      calibrationVersion: CALIBRATION_VERSION,
      masterSourceVersion: MASTER_SOURCE_VERSION,
      ruleVersion: RULE_VERSION,
      ruleScope: RULE_SCOPE,
      masterSourceFile: MASTER_SOURCE_FILE,
      masterSourceSha256: MASTER_SOURCE_SHA256,
      contactSplitSourceVersion: CONTACT_SPLIT_SOURCE_VERSION,
      contactSplitSourceFile: CONTACT_SPLIT_SOURCE_FILE,
      contactSplitSourceSha256: CONTACT_SPLIT_SOURCE_SHA256,
      sensorType: normalizedType,
      unit: "kPa",
      order: "row-major",
      origin: "top-left",
      matrixMode: "prepared",
      rows: rows,
      cols: cols,
      effectivePointCount: result.nonZeroCount,
      inputPointCount: inputPointCount,
      ignoredPointCount: inputPointCount - result.nonZeroCount,
      regionCount: result.regions.length,
      preparedAdcMatrix: prepared,
      interpolationApplied: false,
      interpolationFactor: 1,
      threshold: threshold,
      resultScale: resultScale,
      pipeline: "adc -> mask/filter/round_scale -> pressure_calibration",
    });
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

    var result = calculateRegionalPointSet(points, definition.sensorType);
    var index;
    for (index = 0; index < points.length; index += 1) {
      pressureMatrixKpa[points[index].row][points[index].column] = result.pointKpas[index];
    }

    return {
      version: VERSION,
      sourceAlgorithmVersion: SOURCE_ALGORITHM_VERSION,
      calibrationVersion: CALIBRATION_VERSION,
      masterSourceVersion: MASTER_SOURCE_VERSION,
      ruleVersion: RULE_VERSION,
      ruleScope: RULE_SCOPE,
      masterSourceFile: MASTER_SOURCE_FILE,
      masterSourceSha256: MASTER_SOURCE_SHA256,
      contactSplitSourceVersion: CONTACT_SPLIT_SOURCE_VERSION,
      contactSplitSourceFile: CONTACT_SPLIT_SOURCE_FILE,
      contactSplitSourceSha256: CONTACT_SPLIT_SOURCE_SHA256,
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
      inputPointCount: result.inputPointCount,
      ignoredPointCount: result.ignoredPointCount,
      regionCount: result.regionCount,
      regions: result.regions,
      topCount: result.topCount,
      mode: result.mode,
      targetAvgKpaRaw: result.targetAvgKpaRaw,
      topAverageAdc: result.topAverageAdc,
      distributionScale: result.distributionScale,
      allocationMode: result.allocationMode,
    };
  }

  /** 严格原始帧入口：物理ADC先插值，再执行备份V2.10.34区域标定。 */
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

  /** 已插值帧兼容入口：不插值、不缩放，执行相同V2.10.34区域标定。 */
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
      inputPointCount: frame.inputPointCount,
      ignoredPointCount: frame.ignoredPointCount,
      regionCount: frame.regionCount,
      regions: frame.regions,
      ruleScope: frame.ruleScope,
      contactSplitSourceVersion: frame.contactSplitSourceVersion,
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
    var result = calculateRegionalPointSet(points, normalizeSensorType(sensorType));
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
      inputPointCount: result.inputPointCount,
      ignoredPointCount: result.ignoredPointCount,
      regionCount: result.regionCount,
      regions: result.regions,
      ruleVersion: RULE_VERSION,
      ruleScope: RULE_SCOPE,
      contactSplitSourceVersion: CONTACT_SPLIT_SOURCE_VERSION,
    };
  }

  function calibratePressureFrame(frame) {
    if (!frame || typeof frame !== "object") {
      throw new TypeError("frame必须是对象");
    }
    return calculateDummyPressureFrame(frame.adcMatrix, frame.sensorType, frame.validMask || null);
  }

  // 调用getVersion()即可返回本文件编号字符串，例如"2.10.34"。
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
    add("袖子有效区域使用Top50守恒分配", sleeveResult.mode === "region_top50" && sleeveResult.allocationMode === "regional_normalized_master_weights", sleeveResult.mode + "/" + sleeveResult.allocationMode, "region_top50/regional_normalized_master_weights");
    add("袖子守恒平均", close(sleeveResult.pressureSumKpa / sleeveResult.nonZeroCount, sleeveResult.targetAvgKpaRaw, 1e-10), sleeveResult.pressureSumKpa / sleeveResult.nonZeroCount, sleeveResult.targetAvgKpaRaw);

    var body99 = calculateDummyValuesPressure(new Array(99).fill(176.6), "dummy-body-27x12");
    var body100 = calculateDummyValuesPressure(new Array(100).fill(176.6), "dummy-body-27x12");
    add("上衣N=99使用Top50守恒分配", body99.mode === "region_top50" && close(body99.avgKpa, 27), body99, "region_top50/27 kPa");
    add("上衣N=100仍按区域Top50且不乘2", body100.mode === "region_top50" && close(body100.avgKpa, 27), body100, "region_top50/27 kPa");

    var leg99 = calculateDummyValuesPressure(new Array(99).fill(178), "dummy-left-leg-32x6");
    var leg100 = calculateDummyValuesPressure(new Array(100).fill(178), "dummy-right-leg-32x6");
    add("腿部N=99使用Top50守恒分配", leg99.mode === "region_top50" && close(leg99.avgKpa, 25), leg99, "region_top50/25 kPa");
    add("腿部N=100仍按区域Top50且不乘2", leg100.mode === "region_top50" && close(leg100.avgKpa, 25), leg100, "region_top50/25 kPa");

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
    add("ADC30无效；袖子独立1点不构成有效区域", thresholdFrame.nonZeroCount === 0 && thresholdFrame.inputPointCount === 1, thresholdFrame.nonZeroCount, 0);
    add("袖子物理2x18输出4x36压强矩阵", thresholdFrame.pressureMatrixKpa.length === 4 && thresholdFrame.pressureMatrixKpa[0].length === 36, [thresholdFrame.pressureMatrixKpa.length, thresholdFrame.pressureMatrixKpa[0].length], [4, 36]);

    var preparedAgain = calculateDummyPressureFrame(bodyFrame.interpolatedAdcMatrix, "dummy-body-27x12", bodyFrame.interpolatedValidMask);
    add("已插值输入不会重复插值", preparedAgain.rows === 54 && preparedAgain.cols === 24 && preparedAgain.interpolationApplied === false, [preparedAgain.rows, preparedAgain.cols], [54, 24]);
    add("整帧链路等于插值后单独标定", JSON.stringify(bodyFrame.pressureMatrixKpa) === JSON.stringify(preparedAgain.pressureMatrixKpa), true, true);
    var first = calculateDummyPressureFrame(bodyMatrix, "dummy-body-27x12");
    var second = calculateDummyPressureFrame(bodyMatrix, "dummy-body-27x12");
    add("相同输入得到相同结果", JSON.stringify(first) === JSON.stringify(second), true, true);


    var twoContacts = calculateDummyValuesPressure(new Array(50).fill(71.424).concat([0], new Array(50).fill(71.424)), "body");
    add("两个相同2kPa接触不共用Top50或乘2", twoContacts.regionCount === 2 && twoContacts.nonZeroCount === 100 && close(twoContacts.targetAvgKpaRaw, 2), twoContacts.targetAvgKpaRaw, 2);
    var tinySleeve = calculateDummyValuesPressure([120, 120, 0, 120, 120, 120], "sleeve");
    add("袖子同样排除独立不足3点区", tinySleeve.nonZeroCount === 3 && tinySleeve.ignoredPointCount === 2 && tinySleeve.pressureValuesKpa[0] === 0 && tinySleeve.pressureValuesKpa[1] === 0, tinySleeve.nonZeroCount, 3);
    add("四部位100点阈值均停用", DUMMY_SENSOR_TYPES.every(function noPointwise(type) { return getDummyPointwiseThreshold(type) === null; }), true, true);

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
    MASTER_SOURCE_VERSION: MASTER_SOURCE_VERSION,
    RULE_VERSION: RULE_VERSION,
    RULE_SCOPE: RULE_SCOPE,
    MASTER_SOURCE_FILE: MASTER_SOURCE_FILE,
    MASTER_SOURCE_SHA256: MASTER_SOURCE_SHA256,
    CONTACT_SPLIT_SOURCE_VERSION: CONTACT_SPLIT_SOURCE_VERSION,
    CONTACT_SPLIT_SOURCE_FILE: CONTACT_SPLIT_SOURCE_FILE,
    CONTACT_SPLIT_SOURCE_SHA256: CONTACT_SPLIT_SOURCE_SHA256,
    BODY_CONTACT_SPLIT_CONFIG: Object.freeze(referencePressure.BODY_CONTACT_SPLIT_CONFIG),
    splitBodyPressureContact: referencePressure.splitBodyPressureContact,
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
    calculateDummyPreparedPressureFrame: calculateDummyPreparedPressureFrame,
    lineInterp: lineInterp,
    lineInterp2x2: lineInterp2x2,
    calibratePressureFrame: calibratePressureFrame,
    getVersion: getVersion,
    runSelfCheck: runSelfCheck,
  });
});
