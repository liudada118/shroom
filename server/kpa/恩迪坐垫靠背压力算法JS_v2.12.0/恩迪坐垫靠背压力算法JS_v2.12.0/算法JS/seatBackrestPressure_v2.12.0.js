/* seatBackrestPressure_v2.12.0.js
 * 恩迪坐垫 endi-23x23 / 恩迪靠背 new-backrest-32x25 的压力（力）、面积、逐格压强算法。
 * 与汽车座椅标定上位机 V2.7.110 同源：内核由上位机 client/src/lib 下的 sensorConfig、adcCompensation、
 * endiSeatForce、endiBackrestForce、endiPointPressure、endiCushionCore、endiBackrestCore 源码直接打包，未改写算法。
 * CommonJS（module.exports）+ 浏览器（globalThis.SeatBackrestPressureV2120），零依赖；不读写文件，
 * 不使用随机数、系统时钟、环境变量；时间戳一律由调用方显式传入。
 * 单位：压强 kPa（显示层 ÷10 得 N/cm²），力 N，面积 cm²。
 * 内核在 createLocalKernel() 函数体内，每次调用（或每个会话）新建，模块顶层只有冻结常量与函数。
 * BUILD: source application V2.7.110; esbuild kernel sha256 bde6f5f8353572580fdc926aef2e5434302d4d6dccb083cf57b2566c315f8323
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

    // kernel_entry.ts
    var kernel_entry_exports = {};
    __export(kernel_entry_exports, {
      computeFrame: () => computeFrame,
      metadata: () => metadata,
      sensorGeometry: () => sensorGeometry
    });
    module.exports = __toCommonJS(kernel_entry_exports);

    // lib/sensorConfig.ts
    function buildAxis(segments) {
      const out = [];
      for (const seg of segments) {
        const [a, b] = seg;
        if (a <= b) for (let i = a; i <= b; i++) out.push(i);
        else for (let i = a; i >= b; i--) out.push(i);
      }
      return out;
    }
    function createEndiConfig() {
      const realX = buildAxis([[22, 0]]);
      const realY = buildAxis([[0, 10], [22, 11]]);
      const physicalRows = realY.length;
      const physicalCols = realX.length;
      const wireMap = new Array(physicalRows * physicalCols);
      for (let r = 0; r < physicalRows; r++) {
        for (let c = 0; c < physicalCols; c++) {
          wireMap[r * physicalCols + c] = realY[r] * 32 + realX[c];
        }
      }
      const interpFactor = 2;
      return {
        type: "endi-23x23",
        name: "\u6069\u8FEA\u5EA7\u6905 46\xD746\uFF082\xD72 \u63D2\u503C\uFF09",
        rows: physicalRows * interpFactor,
        // 46
        cols: physicalCols * interpFactor,
        // 46
        physicalRows,
        physicalCols,
        interpFactor,
        matrixSize: physicalRows * interpFactor,
        rawStride: 32,
        frameSize: 1024,
        delimiter: new Uint8Array([170, 85, 3, 153]),
        wireMap
      };
    }
    function expandMask(physMask, interp) {
      var _a, _b;
      const pR = physMask.length;
      const pC = (_b = (_a = physMask[0]) == null ? void 0 : _a.length) != null ? _b : 0;
      const R = pR * interp;
      const C = pC * interp;
      const out = new Array(R);
      for (let r = 0; r < R; r++) {
        const row = new Array(C);
        const pr = Math.floor(r / interp);
        for (let c = 0; c < C; c++) {
          const pc = Math.floor(c / interp);
          row[c] = !!physMask[pr][pc];
        }
        out[r] = row;
      }
      return out;
    }
    function createNewBackrestConfig() {
      const realX = buildAxis([[24, 0]]);
      const realY = buildAxis([[15, 31], [14, 0]]);
      const physicalRows = realY.length;
      const physicalCols = realX.length;
      const wireMap = new Array(physicalRows * physicalCols);
      for (let r = 0; r < physicalRows; r++) {
        for (let c = 0; c < physicalCols; c++) {
          wireMap[r * physicalCols + c] = realY[r] * 32 + realX[c];
        }
      }
      const physicalValidMask = [];
      for (let r = 0; r < physicalRows; r++) {
        const rowMask = [];
        for (let c = 0; c < physicalCols; c++) {
          if (r <= 8) {
            rowMask.push(c >= 8 && c <= 18);
          } else {
            rowMask.push(true);
          }
        }
        physicalValidMask.push(rowMask);
      }
      const interpFactor = 2;
      const validMask = expandMask(physicalValidMask, interpFactor);
      return {
        type: "new-backrest-32x25",
        name: "\u65B0\u9760\u80CC\u6D4B\u91CF\u7CFB\u7EDF 64\xD750\uFF082\xD72 \u63D2\u503C\u3001\u4E0D\u89C4\u5219\uFF09",
        rows: physicalRows * interpFactor,
        // 64
        cols: physicalCols * interpFactor,
        // 50
        physicalRows,
        physicalCols,
        interpFactor,
        matrixSize: physicalRows * interpFactor,
        rawStride: 32,
        frameSize: 1024,
        delimiter: new Uint8Array([170, 85, 3, 153]),
        wireMap,
        physicalValidMask,
        validMask
      };
    }
    var SENSOR_CONFIGS = {
      "endi-23x23": createEndiConfig(),
      "new-backrest-32x25": createNewBackrestConfig()
    };
    function getSensorConfig(type) {
      return SENSOR_CONFIGS[type];
    }
    var SENSOR_TYPES = Object.keys(SENSOR_CONFIGS);
    var SENSOR_LIST = Object.values(SENSOR_CONFIGS);
    function lineInterp(smallMat, width, height, interp1, interp2) {
      const interpValue = 1;
      const newWidth = width * interp1;
      const bigLen = newWidth * (height * interp2);
      let bigMat = new Array(bigLen).fill(0);
      for (let i = 0; i < height; i++) {
        for (let j = 0; j < width; j++) {
          const realValue = smallMat[i * width + j] * interpValue;
          const rightRaw = j === width - 1 ? 0 : smallMat[i * width + j + 1] * interpValue;
          const rowValue = rightRaw ? rightRaw : 0;
          bigMat[newWidth * i * interp2 + j * interp1] = smallMat[i * width + j] * interpValue;
          for (let k = 0; k < interp1; k++) {
            bigMat[newWidth * (i * interp2) + (j * interp1 + k)] = realValue + (rowValue - realValue) * k / interp1;
          }
        }
      }
      for (let i = 0; i < height; i++) {
        for (let j = 0; j < newWidth; j++) {
          const realValue = bigMat[i * interp2 * newWidth + j];
          const downRaw = bigMat[(i + 1) * interp2 * newWidth + j];
          const colValue = downRaw ? downRaw : 0;
          for (let k = 0; k < interp2; k++) {
            bigMat[newWidth * (i * interp2 + k) + j] = realValue + (colValue - realValue) * k / interp2;
          }
        }
      }
      bigMat = bigMat.map((a) => Math.trunc(a));
      return bigMat;
    }
    function lineInterp2x2(small, rows, cols) {
      const flat = new Array(rows * cols);
      for (let r = 0; r < rows; r++) {
        const srcRow = small[r];
        for (let c = 0; c < cols; c++) {
          flat[r * cols + c] = srcRow[c];
        }
      }
      const flatBig = lineInterp(flat, cols, rows, 2, 2);
      const bigRows = rows * 2;
      const bigCols = cols * 2;
      const big = new Array(bigRows);
      for (let r = 0; r < bigRows; r++) {
        const row = new Array(bigCols);
        for (let c = 0; c < bigCols; c++) {
          let v = flatBig[r * bigCols + c];
          if (v < 0) v = 0;
          else if (v > 255) v = 255;
          row[c] = v;
        }
        big[r] = row;
      }
      return big;
    }

    // lib/adcCompensation.ts
    var ADC_COMPENSATION_VERSION = "ConfigurableAffine-20260903";
    var ADC_POST_COMPENSATION_FILTER_THRESHOLD = 30;
    var MIN_ADC_COMPENSATION_SCALE = 1e-3;
    var MAX_ADC_COMPENSATION_SCALE = 10;
    var MIN_ADC_COMPENSATION_OFFSET = -1e3;
    var MAX_ADC_COMPENSATION_OFFSET = 1e3;
    var DEFAULT_SEAT_ADC_COMPENSATION = {
      sensor: "seat",
      enabled: true,
      scale: 1.0069947916666666,
      offset: 6.018421875000001,
      source: "\u300AADC\u8865\u507F\u7ED3\u679C.json\u300Bsensor_id=file1\uFF1Bmanual_override=true"
    };
    var DEFAULT_BACKREST_ADC_COMPENSATION = {
      sensor: "backrest",
      enabled: false,
      scale: 1,
      offset: 0,
      source: "\u9ED8\u8BA4\u6052\u7B49\u8865\u507F\uFF1B\u53EF\u7531\u7528\u6237\u5355\u72EC\u542F\u7528\u5E76\u7F16\u8F91"
    };
    var DEFAULT_ADC_COMPENSATION_SETTINGS = {
      version: ADC_COMPENSATION_VERSION,
      seat: DEFAULT_SEAT_ADC_COMPENSATION,
      backrest: DEFAULT_BACKREST_ADC_COMPENSATION
    };
    function isBackrestSensorType(sensorType) {
      return sensorType === "backrest" || sensorType === "backrest-32x25" || sensorType === "new-backrest-32x25";
    }
    function finiteOrDefault(value, fallback) {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : fallback;
    }
    function normalizeAdcCompensationProfile(profile, fallback) {
      const scale = Math.min(
        MAX_ADC_COMPENSATION_SCALE,
        Math.max(MIN_ADC_COMPENSATION_SCALE, finiteOrDefault(profile == null ? void 0 : profile.scale, fallback.scale))
      );
      const offset = Math.min(
        MAX_ADC_COMPENSATION_OFFSET,
        Math.max(MIN_ADC_COMPENSATION_OFFSET, finiteOrDefault(profile == null ? void 0 : profile.offset, fallback.offset))
      );
      return {
        sensor: fallback.sensor,
        enabled: typeof (profile == null ? void 0 : profile.enabled) === "boolean" ? profile.enabled : fallback.enabled,
        scale,
        offset,
        source: typeof (profile == null ? void 0 : profile.source) === "string" && profile.source.trim() ? profile.source.trim() : fallback.source
      };
    }
    function normalizeAdcCompensationSettings(settings) {
      return {
        version: ADC_COMPENSATION_VERSION,
        seat: normalizeAdcCompensationProfile(settings == null ? void 0 : settings.seat, DEFAULT_SEAT_ADC_COMPENSATION),
        backrest: normalizeAdcCompensationProfile(settings == null ? void 0 : settings.backrest, DEFAULT_BACKREST_ADC_COMPENSATION)
      };
    }
    function getAdcCompensationProfile(sensorType, settings = DEFAULT_ADC_COMPENSATION_SETTINGS) {
      const normalized = normalizeAdcCompensationSettings(settings);
      return isBackrestSensorType(sensorType) ? normalized.backrest : normalized.seat;
    }
    function compensateAndFilterAdcMatrix(matrix, sensorType, settings = DEFAULT_ADC_COMPENSATION_SETTINGS) {
      const profile = getAdcCompensationProfile(sensorType, settings);
      return matrix.map((row) => row.map((value) => {
        if (!Number.isFinite(value) || value <= 0) return 0;
        const corrected = profile.enabled ? profile.scale * value + profile.offset : value;
        return corrected > ADC_POST_COMPENSATION_FILTER_THRESHOLD ? corrected : 0;
      }));
    }

    // lib/endiCushion/endiCushionCore.js
    var EndiCushion = (function() {
      "use strict";
      const DEFAULT_PARAMS2 = {
        "sensor": { "n_phys": 23, "n_int": 46, "phys_mm": 20, "cell_mm": 10, "cell_area": 1, "adc_full": 256, "map": "\u7269\u7406 (r,c) \u2192 \u63D2\u503C (2r, 2c+1)" },
        "standard": { "mb": 1.625, "base_area": 63.62, "g": 9.8 },
        "region": { "min_cells": 3, "adc_min": 1 },
        "anchors": { "names": ["P01", "P02", "P03", "P04", "P05", "P06", "P07", "P08", "P09", "P10", "P11", "P12", "P13", "P14", "P15", "P16", "P17", "P18", "P19", "P20", "P21", "P22", "P23", "P24", "P25", "P26", "P27", "P28", "P29", "P30", "P31"], "nodes": [[2.9961971785694983, 2.387142783137075], [5.19108346138937, 2.361871920699561], [8.18221140017864, 2.6256203212658895], [11.087998201359081, 2.780055337631023], [14.062013178416342, 2.867220391602328], [17.061788313636768, 2.7329253112976826], [19.1409410988449, 2.8318643275489572], [19.44904891797475, 6.538010159264819], [17.23645299906759, 6.262477914421152], [15.05402869003486, 6.041422812290979], [12.973224247447373, 5.915073353933789], [10.601228347689649, 5.790468424388541], [8.181100420852282, 5.602904613047399], [5.869947934003757, 5.382689793679897], [2.502395612474254, 5.626379018009182], [2.7130259291205734, 12.978895804762768], [4.426228541772183, 12.996448684346328], [6.161312451990305, 12.705848823064144], [7.990894719501658, 12.764539170748652], [10.062495324940695, 12.696526858447097], [12.242223515907387, 12.226788067310094], [14.90552473047786, 12.467270688635066], [17.57421872297612, 12.674180343988741], [19.635234643123493, 12.67181463799765], [19.643967982003918, 17.31566020313129], [17.05665354030182, 17.37986223847954], [14.576105018151859, 17.513624853572974], [12.025701077446742, 17.52695610151983], [8.958915746699528, 16.97666337955281], [5.748690032558099, 16.821260263417283], [3.067961217680117, 17.016005676862083]], "l": [[1.348052557847364, 1.9007983513165492, 2.152333939795332, 2.3498115853644714, 2.505832095067284], [1.31571119546001, 1.873005724363256, 2.165956281205026, 2.3511698991150944, 2.494532934958594], [1.2218458303136406, 1.7812271039494232, 2.080170214855758, 2.282493413352673, 2.442021294718552], [1.2120137576817065, 1.7175579879840175, 2.0538242688359274, 2.2721387983581014, 2.4070622557065176], [1.3319730815643998, 1.8527107071805955, 2.1320889759045865, 2.335177027886101, 2.494039333678201], [1.4908890400019859, 1.9454470276827087, 2.207264268472185, 2.407237379895953, 2.5564912415525227], [1.6489614779403934, 2.0324580125430183, 2.283129411412508, 2.465245686499782, 2.5952884233140296], [1.4201612214755448, 1.8879518945810916, 2.191600617015329, 2.407723017262277, 2.5531380457339186], [1.516592120068564, 2.0068674828402955, 2.3121455316052835, 2.5170265563009058, 2.6466026832515492], [1.5013649755414316, 2.0127191525331205, 2.2732590478198813, 2.470116308185548, 2.6080391979515802], [1.4441148081903368, 1.9108081295296158, 2.2076987250193647, 2.3867310576793987, 2.5420690930184255], [1.2481393314889917, 1.8307773489909875, 2.1425139975876357, 2.3521165748313835, 2.517292724853788], [1.3047323840754, 1.8444688081580913, 2.1047148282708537, 2.3021191655537385, 2.4538678563643335], [1.3682669638411618, 1.9107016583842957, 2.182984052846397, 2.381702166961271, 2.5168782273340713], [1.3858008410220997, 1.938905455949234, 2.2219595925663747, 2.396423669969733, 2.5341355006294], [1.2422219023925696, 1.7478803305909645, 2.038994273017633, 2.263413377778945, 2.413953119058115], [1.141903665512242, 1.7721731761598716, 2.056241075977648, 2.2334035435066126, 2.385645626958497], [1.1022158293356488, 1.7116283813315443, 2.0166398297238226, 2.2212820198085796, 2.37376704524865], [1.3229154921160626, 1.8673443791702795, 2.143495516885768, 2.3246950173608956, 2.4855499783573527], [1.3455850787373347, 1.821547574313972, 2.131473661410498, 2.3417739208635027, 2.479565173831379], [1.2745145526324637, 1.770954527490599, 2.0980653760481567, 2.295872475022325, 2.471236665694037], [1.3602213996992376, 1.900265414599385, 2.1894380396112805, 2.4056127621439933, 2.556493557849227], [1.3010904295407166, 1.9295542718872405, 2.2404707679039073, 2.430064063232005, 2.5576022186579377], [1.5984115046513738, 2.028694809341932, 2.307010717000983, 2.4902982023225135, 2.606233875011536], [1.350671673509677, 1.8826187240229635, 2.2082029423677896, 2.3966618095842374, 2.526636873992053], [1.4970561940938203, 1.9969350153265653, 2.3171407509744966, 2.5012872672646878, 2.6084265210465705], [1.3470393417073094, 1.946211952852353, 2.230248345893691, 2.4004160344082672, 2.5230380539618578], [1.238632784631291, 1.799916923253807, 2.1353802065560075, 2.3025649875228504, 2.434916510584571], [1.2931179012823206, 1.793372210304294, 2.083990675122328, 2.3058712597195514, 2.4511598798556444], [1.198904295153062, 1.7459174131625825, 2.045127233171188, 2.235189750903116, 2.404723010510289], [1.4349864998773698, 1.9720140907718477, 2.221332374913343, 2.3900150584666666, 2.505318969290888]], "sigma": 2.5, "decay": 0.72, "rho_up": [0.6296802145360182, 0.77779982743487, 0.8688559018632924, 0.8080285824437334], "rho_dn": [1.181942414571771, 1.1780204997086912, 1.0622422307746293, 1.1646892747150017], "max_level": 5, "max_track": 10 },
        "fit": { "feature": "R", "c0": -1.4429954583426408, "k": 1.392308009996943, "Fbar": [3.9346283446422414, 6.700358013868023, 8.946056628077962, 10.82468173839455, 12.417077759966318], "gains": [1.003835435122186, 1.017155154961332, 1.0675603087818677, 1.1129230708181563, 1.0322494049525939, 0.993696591822984, 0.9091194283390603, 0.9514963319519909, 0.8668736549462106, 0.9015933834684143, 0.9757356470566099, 1.004823733523368, 1.0500537398562622, 0.9901036681711687, 0.9550460024708446, 1.1181188829316608, 1.1219618001196192, 1.1387509688557271, 1.0325309968487422, 1.0382627997628993, 1.0504348705391076, 0.9614602508942488, 0.9435806180769474, 0.8907083698018038, 0.9587971871677737, 0.9052629782517002, 0.9579553556735679, 1.038529101194005, 1.0878994213541968, 1.1073639178949397, 0.9721979184978883], "nodes": [[3.000885710013539, 2.3771490517425278], [5.268817940923544, 2.3679101638982103], [8.22054956657622, 2.50605708237751], [11.245773124937145, 2.8182012448439644], [14.133234526507422, 2.872270882932253], [17.095737581144597, 2.649641228944973], [19.17924444230143, 2.8528371252793656], [19.520274906945147, 6.501548472314104], [17.289673284081942, 6.271728100529386], [15.046969066696104, 5.99492321459991], [12.943944873958815, 5.881468675665816], [10.610716826164028, 5.8012063163255485], [8.182652749483395, 5.519720453897116], [5.88639091053639, 5.316416569136417], [2.5001457859246496, 5.5794700381999665], [2.711617172740988, 12.993327831283796], [4.371442466002357, 13.010406553799708], [6.045921954909009, 12.60234677858548], [7.945242156051836, 12.782935844688662], [10.061819289638695, 12.680008943690284], [12.310039212136296, 12.268311660959125], [14.975224118230855, 12.530409331550374], [17.57349864878549, 12.65308771985804], [19.650207313463056, 12.706594003644138], [19.53074735898327, 17.42327707297632], [17.114473106248916, 17.37768032924975], [14.570982948661046, 17.50803159118869], [11.978853244282035, 17.54019183834351], [8.922998162590599, 16.93091736254363], [5.6804800316417605, 16.857849983636413], [2.9524638864023163, 17.095456940119497]], "sigma": 2.5, "env": [3.62850598429448, 12.668815276961315] },
        "fit_Q": { "feature": "Q", "c0": -8.868217069379444, "k": 0.8734302135570636, "Fbar": [43025.00870967742, 104527.05935483873, 164627.05048387093, 218875.9382258065, 266395.27887096774], "gains": [1.0158011107029072, 1.0381314305933547, 1.086388566101098, 1.147891417001745, 1.0315902725371977, 1.0040908357913185, 0.8669311498146105, 0.9391186538745262, 0.8062959160538594, 0.8633892915388801, 0.9687824555946454, 1.014167496632034, 1.0854623995835533, 1.0003265321855064, 0.9678951341052504, 1.183901807927511, 1.174532710894101, 1.1976371906271897, 1.0264639467622012, 1.0652298037988557, 1.058829631645204, 0.9397870578023457, 0.9194380776014921, 0.836827827388799, 0.9368899628100565, 0.8819918079499398, 0.9579549147937613, 1.0567770083534032, 1.1325106910895806, 1.1374278422249382, 0.9669299657633982], "nodes": [[3.000885710013539, 2.3771490517425278], [5.268817940923544, 2.3679101638982103], [8.22054956657622, 2.50605708237751], [11.245773124937145, 2.8182012448439644], [14.133234526507422, 2.872270882932253], [17.095737581144597, 2.649641228944973], [19.17924444230143, 2.8528371252793656], [19.520274906945147, 6.501548472314104], [17.289673284081942, 6.271728100529386], [15.046969066696104, 5.99492321459991], [12.943944873958815, 5.881468675665816], [10.610716826164028, 5.8012063163255485], [8.182652749483395, 5.519720453897116], [5.88639091053639, 5.316416569136417], [2.5001457859246496, 5.5794700381999665], [2.711617172740988, 12.993327831283796], [4.371442466002357, 13.010406553799708], [6.045921954909009, 12.60234677858548], [7.945242156051836, 12.782935844688662], [10.061819289638695, 12.680008943690284], [12.310039212136296, 12.268311660959125], [14.975224118230855, 12.530409331550374], [17.57349864878549, 12.65308771985804], [19.650207313463056, 12.706594003644138], [19.53074735898327, 17.42327707297632], [17.114473106248916, 17.37768032924975], [14.570982948661046, 17.50803159118869], [11.978853244282035, 17.54019183834351], [8.922998162590599, 16.93091736254363], [5.6804800316417605, 16.857849983636413], [2.9524638864023163, 17.095456940119497]], "sigma": 2.5, "env": [35498.9050231098, 274171.41991460504] },
        "track": { "match": 3, "drop": 2 },
        "plateau": { "adj": 0.018, "rng": 0.029, "n": 3, "span": 150, "fast_n": 2, "fast_span": 80, "fast_dev": 0.3 },
        "filter": { "median_n": 3, "readout": "hybrid", "band": 0.049, "steady": "mean3" },
        "first": { "min_ms": 300, "light": 0.6, "commit_ms": 400 },
        "step": { "commit_ms": 600, "enter": 0.25, "clear": 0.4, "ambig_ms": 3e3, "cont_ms": 700, "cont_ratio": 0.75, "pre_commit_ms": 400, "pre_resid": 0.3, "follow": 0.03 },
        "residual": { "a": 0.08, "b": 0.92, "c": 0.35, "soft": 0.8, "soft_w": 0.2 },
        "smooth_ms": 120,
        "creep": { "tau": 2e3, "band": 0.2 },
        "area": { "T": 29, "N_min": 39, "N_max": 131, "span_max": 16, "ecc_max": 1.734 },
        "over": { "level": 5, "force_in": 90, "hold_ms": 500, "gain": 2 }
      };
      const ST_FIRST = "\u9996\u6B21\u63A5\u89E6\u786E\u8BA4\u4E2D";
      const ST_TENT = "\u6682\u5B9A\u6863";
      const ST_CONF = "\u5DF2\u786E\u8BA4";
      const ST_JUDGE = "\u52A0\u51CF\u5757\u5224\u65AD\u4E2D";
      const N_PHYS2 = 23;
      const N_INT2 = 46;
      const ADC_FULL = 256;
      function pyRound(x) {
        const f = Math.floor(x);
        const diff = x - f;
        if (diff > 0.5) return f + 1;
        if (diff < 0.5) return f;
        return f % 2 === 0 ? f : f + 1;
      }
      function median2(arr) {
        const s = arr.slice().sort(function(a, b) {
          return a - b;
        });
        const n = s.length;
        const h = n >> 1;
        return n % 2 === 1 ? s[h] : (s[h - 1] + s[h]) / 2;
      }
      function mean(arr) {
        let s = 0;
        for (let i = 0; i < arr.length; i++) s += arr[i];
        return s / arr.length;
      }
      function argminAbs(arr, x) {
        let bi = 0;
        let bv = Infinity;
        for (let i = 0; i < arr.length; i++) {
          const v = Math.abs(arr[i] - x);
          if (v < bv) {
            bv = v;
            bi = i;
          }
        }
        return bi;
      }
      function uRes(t, a, b, c) {
        return a * t + b * t * t * t / (t * t + c * c);
      }
      function soft(u, s0, w) {
        const au = Math.abs(u);
        if (au <= s0) return u;
        const v = s0 + w * (1 - Math.exp(-(au - s0) / w));
        return u < 0 ? -v : v;
      }
      function sCurve(tau) {
        tau = Math.min(Math.max(tau, 0), 1);
        return 3 * tau * tau - 2 * tau * tau * tau;
      }
      function toGrid(a) {
        const g = new Float64Array(N_PHYS2 * N_PHYS2);
        if (a.length === N_PHYS2 * N_PHYS2 && typeof a[0] === "number") {
          for (let i = 0; i < g.length; i++) g[i] = Number(a[i]);
        } else {
          if (a.length !== N_PHYS2) throw new Error("\u7269\u7406\u77E9\u9635\u5E94\u4E3A 23\xD723");
          for (let r = 0; r < N_PHYS2; r++) {
            const row = a[r];
            if (!row || row.length !== N_PHYS2) throw new Error("\u7269\u7406\u77E9\u9635\u5E94\u4E3A 23\xD723");
            for (let c = 0; c < N_PHYS2; c++) g[r * N_PHYS2 + c] = Number(row[c]);
          }
        }
        return g;
      }
      function interpolate3(a) {
        const n = N_PHYS2;
        const W = 2 * n;
        const t = new Float64Array(n * W);
        for (let r = 0; r < n; r++) {
          for (let c = 0; c < n; c++) {
            const v = a[r * n + c];
            const left = c > 0 ? a[r * n + c - 1] : 0;
            t[r * W + 2 * c + 1] = v;
            t[r * W + 2 * c] = (left + v) / 2;
          }
        }
        const b = new Float64Array(W * W);
        for (let r = 0; r < n; r++) {
          for (let j = 0; j < W; j++) {
            const v = t[r * W + j];
            const down = r + 1 < n ? t[(r + 1) * W + j] : 0;
            b[2 * r * W + j] = v;
            b[(2 * r + 1) * W + j] = (v + down) / 2;
          }
        }
        for (let i = 0; i < b.length; i++) {
          b[i] = Math.min(255, Math.max(0, Math.floor(b[i])));
        }
        return b;
      }
      function components82(mask, H, W) {
        const lab = new Int32Array(H * W);
        const comps = [];
        const stack = [];
        for (let s = 0; s < H * W; s++) {
          if (!mask[s] || lab[s]) continue;
          const id = comps.length + 1;
          const cells = [];
          lab[s] = id;
          stack.push(s);
          while (stack.length) {
            const p = stack.pop();
            cells.push(p);
            const r = p / W | 0;
            const c = p - r * W;
            for (let dr = -1; dr <= 1; dr++) {
              const rr = r + dr;
              if (rr < 0 || rr >= H) continue;
              for (let dc = -1; dc <= 1; dc++) {
                const cc = c + dc;
                if (dr === 0 && dc === 0 || cc < 0 || cc >= W) continue;
                const q = rr * W + cc;
                if (mask[q] && !lab[q]) {
                  lab[q] = id;
                  stack.push(q);
                }
              }
            }
          }
          cells.sort(function(x, y) {
            return x - y;
          });
          comps.push(cells);
        }
        return comps;
      }
      function contactRegions2(a, minCells) {
        const n = N_PHYS2;
        const mask = new Uint8Array(n * n);
        for (let i = 0; i < mask.length; i++) mask[i] = a[i] >= 1 ? 1 : 0;
        const out = [];
        const comps = components82(mask, n, n);
        for (let k = 0; k < comps.length; k++) {
          const cells = comps[k];
          if (cells.length < minCells) continue;
          let s1 = 0, R = 0, Q = 0, S15 = 0, sr = 0, sc = 0, peak = -Infinity;
          for (let i = 0; i < cells.length; i++) {
            const p = cells[i];
            const v = a[p];
            const r = p / n | 0;
            const c = p - r * n;
            s1 += v;
            R += -Math.log(1 - Math.min(v, 255) / ADC_FULL);
            Q += v * v;
            S15 += Math.pow(v, 1.5);
            sr += v * r;
            sc += v * c;
            if (v > peak) peak = v;
          }
          out.push({
            n: cells.length,
            cells,
            R,
            x: R > 0 ? Math.log(R) : -Infinity,
            Q,
            S1: s1,
            S15,
            cy: sr / s1,
            cx: sc / s1,
            peak
          });
        }
        out.sort(function(p, q) {
          return q.R - p.R;
        });
        return out;
      }
      function areaRegions2(b, T) {
        const W = N_INT2;
        const mask = new Uint8Array(W * W);
        for (let i = 0; i < mask.length; i++) mask[i] = b[i] >= T ? 1 : 0;
        const out = [];
        const comps = components82(mask, W, W);
        for (let k = 0; k < comps.length; k++) {
          const cells = comps[k];
          let sw = 0, si = 0, sj = 0;
          let imin = Infinity, imax = -Infinity, jmin = Infinity, jmax = -Infinity;
          for (let q = 0; q < cells.length; q++) {
            const p = cells[q];
            const i = p / W | 0;
            const j = p - i * W;
            const w = b[p];
            sw += w;
            si += w * i;
            sj += w * j;
            if (i < imin) imin = i;
            if (i > imax) imax = i;
            if (j < jmin) jmin = j;
            if (j > jmax) jmax = j;
          }
          const ci = si / sw;
          const cj = sj / sw;
          let cii = 0, cij = 0, cjj = 0;
          for (let q = 0; q < cells.length; q++) {
            const p = cells[q];
            const i = p / W | 0;
            const j = p - i * W;
            const w = b[p];
            const di = i - ci;
            const dj = j - cj;
            cii += w * di * di;
            cij += w * di * dj;
            cjj += w * dj * dj;
          }
          cii /= sw;
          cij /= sw;
          cjj /= sw;
          const m = (cii + cjj) / 2;
          const h = Math.sqrt((cii - cjj) / 2 * ((cii - cjj) / 2) + cij * cij);
          const ev0 = m + h;
          const ev1 = m - h;
          const ecc = ev1 > 1e-9 ? Math.sqrt(ev0 / ev1) : 99;
          const span = Math.max(imax - imin + 1, jmax - jmin + 1);
          out.push({ N: cells.length, cells, span, ecc, ci, cj, pr: ci / 2, pc: (cj - 1) / 2 });
        }
        return out;
      }
      function Track(id, t, cy, cx) {
        this.id = id;
        this.cy = cy;
        this.cx = cx;
        this.missed = 0;
        this.t_start = t;
        this.raw = [];
        this.flt = [];
        this.state = ST_FIRST;
        this.L = null;
        this.A = null;
        this.hist = {};
        this.added = 0;
        this.first_level = null;
        this.tent = null;
        this.judge_t0 = null;
        this.ambig_t0 = null;
        this.cont = null;
        this.last_commit_t = -1e18;
        this.frozen = false;
        this.over = false;
        this.over_exit_t0 = null;
        this.exit_t0 = null;
        this.out_m = 0;
        this.out_S = 0;
        this.mode = null;
        this.sm = null;
        this.prev_t = t;
        this.events = [];
      }
      Track.prototype.resetBase = function() {
        this.L = null;
        this.A = null;
        this.hist = {};
        this.tent = null;
        this.cont = null;
      };
      function has(obj, k) {
        return Object.prototype.hasOwnProperty.call(obj, k);
      }
      function EndiAlgorithm2(params, opts) {
        const p = params || DEFAULT_PARAMS2;
        if (!p) throw new Error("\u7F3A\u5C11\u53C2\u6570");
        opts = opts || {};
        this.p = p;
        this.mb = p.standard.mb;
        this.g = p.standard.g;
        this.base_area = p.standard.base_area;
        this.cell_area = p.sensor.cell_area;
        const an = p.anchors;
        this.nodes = an.nodes;
        this.lt = an.l;
        this.sigma = an.sigma;
        this.decay = an.decay;
        this.max_track = an.max_track;
        this.rho_up = an.rho_up || [1, 1, 1, 1];
        this.rho_dn = an.rho_dn || [1, 1, 1, 1];
        this.lv_cur = null;
        const fit = p.fit;
        this.fit_feat = fit.feature;
        this.fit_nodes = fit.nodes;
        this.fit_g = fit.gains;
        this.fit_sigma = fit.sigma;
        this.c0 = fit.c0;
        this.k = fit.k;
        this.pl = p.plateau;
        this.readout = p.filter.readout || "hybrid";
        this.band = p.filter.band !== void 0 ? p.filter.band : 0.05;
        this.steady = p.filter.steady || "none";
        this.medn = p.filter.median_n;
        this.ar = p.area;
        this.ov = p.over;
        this.st = p.step;
        this.fi = p.first;
        this.cr = p.creep;
        this.res = p.residual;
        this.smooth_ms = p.smooth_ms;
        this.maxEvents = opts.maxEvents || 100;
        this.tracks = [];
        this.nextId = 1;
        this.last_t = null;
        this.last_a = null;
        this.last_out = null;
      }
      const EP = EndiAlgorithm2.prototype;
      EP._w = function(nodes, cy, cx, sigma) {
        const w = new Array(nodes.length);
        let s = 0;
        for (let i = 0; i < nodes.length; i++) {
          const d2 = (nodes[i][0] - cy) * (nodes[i][0] - cy) + (nodes[i][1] - cx) * (nodes[i][1] - cx);
          w[i] = Math.exp(-d2 / (2 * sigma * sigma));
          s += w[i];
        }
        for (let i = 0; i < w.length; i++) w[i] /= s;
        return w;
      };
      EP.anchors = function(cy, cx) {
        const w = this._w(this.nodes, cy, cx, this.sigma);
        const nl = this.lt[0].length;
        const lv = new Array(nl).fill(0);
        for (let i = 0; i < w.length; i++) {
          for (let n = 0; n < nl; n++) lv[n] += w[i] * this.lt[i][n];
        }
        const d = [];
        for (let n = 1; n < nl; n++) d.push(lv[n] - lv[n - 1]);
        while (d.length < this.max_track - 1) d.push(d[d.length - 1] * this.decay);
        return { lv, d };
      };
      EP.mfit = function(reg) {
        const w = this._w(this.fit_nodes, reg.cy, reg.cx, this.fit_sigma);
        let gp = 0;
        for (let i = 0; i < w.length; i++) gp += w[i] * this.fit_g[i];
        const F = reg[this.fit_feat];
        return Math.exp(this.c0 + this.k * Math.log(Math.max(gp * F, 1e-9)));
      };
      EP.u = function(t) {
        return uRes(t, this.res.a, this.res.b, this.res.c);
      };
      EP.S = function(u) {
        return soft(u, this.res.soft, this.res.soft_w);
      };
      EP.D = function(d, n) {
        n = Math.max(1, n);
        return n - 1 < d.length ? d[n - 1] : d[d.length - 1];
      };
      EP.E_table = function(L, A, hist, d, useHist) {
        if (useHist === void 0) useHist = true;
        const M = this.max_track;
        const lv = this.lv_cur;
        const Lc = Math.min(L, 5);
        const e = A - lv[Lc - 1];
        const xh = {};
        xh[L] = A;
        let en = e;
        for (let n = L + 1; n <= M; n++) {
          let inc;
          if (n <= 5) {
            en = this.rho_up[n - 2] * en;
            inc = lv[n - 1] + en - xh[n - 1];
            inc = Math.max(inc, 0.3 * this.D(d, n - 1));
          } else {
            inc = this.D(d, n - 1);
          }
          xh[n] = xh[n - 1] + inc;
        }
        en = e;
        for (let n = L - 1; n >= 1; n--) {
          let inc;
          if (n + 1 <= 5) {
            en = this.rho_dn[n - 1] * en;
            inc = xh[n + 1] - (lv[n - 1] + en);
            inc = Math.max(inc, 0.3 * this.D(d, n));
          } else {
            inc = this.D(d, n);
          }
          xh[n] = xh[n + 1] - inc;
        }
        const E = {};
        E[L] = 0;
        for (let n = L + 1; n <= M; n++) {
          const pred = E[n - 1] + (xh[n] - xh[n - 1]);
          E[n] = useHist && has(hist, n) && hist[n] - A > E[n - 1] ? hist[n] - A : pred;
        }
        for (let n = L - 1; n >= 1; n--) {
          const pred = E[n + 1] - (xh[n + 1] - xh[n]);
          E[n] = useHist && has(hist, n) && hist[n] - A < E[n + 1] ? hist[n] - A : pred;
        }
        return E;
      };
      EP.lam = function(x, L, A, hist, d, useHist) {
        const E = this.E_table(L, A, hist, d, useHist);
        const dl = x - A;
        if (dl < E[1]) return Math.exp(dl - E[1]);
        const M = this.max_track;
        for (let n = 1; n < M; n++) {
          if (dl < E[n + 1]) return n + (dl - E[n]) / (E[n + 1] - E[n]);
        }
        return M + (dl - E[M]) / (E[M] - E[M - 1]);
      };
      EP.absLevel = function(x, lv, d) {
        if (x <= lv[0]) return Math.exp(x - lv[0]);
        const nh = argminAbs(lv, x) + 1;
        const D = x >= lv[nh - 1] ? this.D(d, nh) : this.D(d, nh - 1);
        return Math.max(0, nh + this.u((x - lv[nh - 1]) / D));
      };
      EP.plateau = function(tr, t, fast) {
        const nMin = fast ? this.pl.fast_n : this.pl.n;
        const span = fast ? this.pl.fast_span : this.pl.span;
        const s = tr.flt;
        if (s.length < nMin) return null;
        let idx = s.length - 1;
        while (idx > 0 && s[idx][0] > t - span) idx -= 1;
        const cnt = s.length - idx;
        if (cnt < nMin || t - s[idx][0] < span) return null;
        let mx = -Infinity, mn = Infinity, sum = 0;
        for (let i = idx; i < s.length; i++) {
          const v = s[i][1];
          if (i > idx && !(Math.abs(v - s[i - 1][1]) < this.pl.adj)) return null;
          if (v > mx) mx = v;
          if (v < mn) mn = v;
          sum += v;
        }
        if (mx - mn < this.pl.rng) return sum / cnt;
        return null;
      };
      EP._event = function(tr, ev) {
        tr.events.push(ev);
        if (tr.events.length > this.maxEvents) tr.events.shift();
      };
      EP.commit = function(tr, t, Lnew, Anew, kind, d) {
        const ev = { t, kind, frm: tr.L, to: Lnew };
        if (kind === "step" && tr.L !== null) {
          const E = this.E_table(tr.L, tr.A, tr.hist, d, false);
          const pred = has(E, Lnew) ? E[Lnew] : 0;
          const step = Anew - tr.A;
          if (Math.abs(pred) > 1e-9 && Math.abs(step) < this.st.cont_ratio * Math.abs(pred)) {
            tr.cont = { L: tr.L, A: tr.A, t, dir: Lnew > tr.L ? 1 : -1 };
          } else {
            tr.cont = null;
          }
          if (Lnew > tr.L) tr.added += Lnew - tr.L;
        }
        if (kind === "first") {
          tr.first_level = Lnew;
          tr.cont = null;
        }
        tr.L = Lnew;
        tr.A = Anew;
        tr.hist[Lnew] = Anew;
        tr.state = ST_CONF;
        tr.tent = null;
        tr.last_commit_t = t;
        this._event(tr, ev);
      };
      EP.startSmooth = function(tr) {
        tr.sm = [tr.prev_t, tr.out_m, tr.out_S];
      };
      EP.runState = function(tr, t, xf, xr, lv, d, dt) {
        const mb = this.mb;
        if (tr.state === ST_FIRST) {
          const dur = t - tr.t_start;
          const pl = this.plateau(tr, t);
          if (dur >= this.fi.min_ms && pl !== null && Math.exp(pl) >= this.fi.light * Math.exp(lv[0])) {
            const nh = argminAbs(lv, pl) + 1;
            tr.tent = { level: nh, A: pl, t0: t, kind: "first", last: pl };
            tr.state = ST_TENT;
            this.startSmooth(tr);
          } else {
            return mb * this.absLevel(xr, lv, d);
          }
        }
        if (tr.state === ST_TENT) {
          const te = tr.tent;
          const Lp = te.level;
          const Dm = Math.min(this.D(d, Lp), this.D(d, Lp - 1));
          const dev = (xf - te.A) / Dm;
          const pl = this.plateau(tr, t);
          if (pl !== null && Math.abs((pl - te.A) / Dm) < this.st.enter) {
            te.last = pl;
            const dirn = te.kind === "first" || Lp > (tr.L || 0) ? 1 : -1;
            const follow = this.st.follow !== void 0 ? this.st.follow : 0.03;
            if ((pl - te.A) * dirn > follow) {
              te.A = pl;
              te.t0 = t;
              if (te.kind === "step" && tr.L !== null) {
                te.resid = this.lam(pl, tr.L, tr.A, tr.hist, d) - Lp;
              }
              te.n_follow = (te.n_follow || 0) + 1;
            }
          }
          if (te.kind === "first") {
            if (Math.abs(dev) >= this.st.enter) {
              tr.state = ST_FIRST;
              tr.tent = null;
              tr.t_start = Math.min(tr.t_start, t);
              return mb * this.absLevel(xr, lv, d);
            }
            if (pl !== null && t - te.t0 >= this.fi.commit_ms) this.commit(tr, t, Lp, pl, "first", d);
          } else {
            if (Math.abs(dev) >= this.st.enter) {
              const dirn = Lp > (tr.L || 0) ? 1 : -1;
              const preResid = this.st.pre_resid !== void 0 ? this.st.pre_resid : 0.3;
              const short = (te.resid !== void 0 ? te.resid : 0) * dirn < -preResid;
              if (t - te.t0 >= this.st.pre_commit_ms && !short) this.commit(tr, t, Lp, te.last, "step", d);
              tr.state = ST_JUDGE;
              tr.tent = null;
              tr.judge_t0 = t;
              tr.ambig_t0 = null;
            } else if (pl !== null && t - te.t0 >= this.st.commit_ms) {
              this.commit(tr, t, Lp, pl, "step", d);
            }
          }
          if (tr.state === ST_TENT) return mb * (Lp + this.u((xr - te.A) / Dm));
        }
        if (tr.state === ST_CONF) {
          const lf = this.lam(xf, tr.L, tr.A, tr.hist, d);
          if (Math.abs(lf - tr.L) >= this.st.enter) {
            tr.state = ST_JUDGE;
            tr.judge_t0 = t;
            tr.ambig_t0 = null;
            if (t - tr.last_commit_t > this.st.cont_ms) tr.cont = null;
          } else {
            const pl = this.plateau(tr, t);
            if (pl !== null && Math.abs(lf - tr.L) < this.cr.band) {
              tr.A += (pl - tr.A) * Math.min(1, dt / this.cr.tau);
            }
            const lr = this.lam(xr, tr.L, tr.A, tr.hist, d);
            const dv = lr - tr.L;
            if (Math.abs(dv) < this.st.enter) return mb * (tr.L + this.u(dv));
            return mb * Math.max(0, tr.L + this.S(this.u(dv)));
          }
        }
        if (tr.state === ST_JUDGE) {
          let pl = this.plateau(tr, t);
          let fast = false;
          if (pl === null) {
            const pf = this.plateau(tr, t, true);
            if (pf !== null) {
              const lp = this.lam(pf, tr.L, tr.A, tr.hist, d);
              const k = pyRound(lp - tr.L);
              if (k !== 0 && tr.L + k >= 1 && Math.abs(lp - tr.L - k) <= this.pl.fast_dev) {
                pl = pf;
                fast = true;
              }
            }
          }
          if (pl !== null) {
            const lp = this.lam(pl, tr.L, tr.A, tr.hist, d);
            const k = pyRound(lp - tr.L);
            const resid = Math.abs(lp - tr.L - k);
            let clear = resid <= this.st.clear;
            if (!clear) {
              if (tr.ambig_t0 === null) tr.ambig_t0 = t;
              if (t - tr.ambig_t0 >= this.st.ambig_ms) clear = true;
            } else {
              tr.ambig_t0 = null;
            }
            if (clear) {
              let done = false;
              if (tr.cont !== null && k !== 0 && (k > 0 ? 1 : -1) === tr.cont.dir) {
                const lprev = this.lam(pl, tr.cont.L, tr.cont.A, {}, d, false);
                const kp = pyRound(lprev - tr.cont.L);
                if (tr.cont.L + kp === tr.L) {
                  tr.A = pl;
                  tr.hist[tr.L] = pl;
                  tr.state = ST_CONF;
                  this._event(tr, { t, kind: "cont", frm: tr.L, to: tr.L });
                  tr.cont = null;
                  this.startSmooth(tr);
                  done = true;
                }
              }
              if (!done) {
                if (k === 0) {
                  tr.state = ST_CONF;
                  this.startSmooth(tr);
                } else if (tr.L + k >= 1) {
                  tr.tent = { level: tr.L + k, A: pl, t0: t, kind: "step", last: pl, resid: lp - tr.L - k };
                  this._event(tr, { t, kind: "tent", frm: tr.L, to: tr.L + k, resid: lp - tr.L - k, fast });
                  tr.state = ST_TENT;
                  this.startSmooth(tr);
                } else {
                  this._event(tr, { t, kind: "clear", frm: tr.L, to: 0 });
                  tr.resetBase();
                  tr.state = ST_FIRST;
                  tr.t_start = t;
                  return mb * this.absLevel(xr, lv, d);
                }
              }
            }
          }
          if (tr.state === ST_TENT) {
            const te = tr.tent;
            const Dm = Math.min(this.D(d, te.level), this.D(d, te.level - 1));
            return mb * (te.level + this.u((xr - te.A) / Dm));
          }
          const lr = this.lam(xr, tr.L, tr.A, tr.hist, d);
          const dv = lr - tr.L;
          if (tr.state === ST_CONF && Math.abs(dv) < this.st.enter) return mb * (tr.L + this.u(dv));
          let uu = this.u(dv);
          if (!(tr.L >= this.ov.level && uu > 0)) uu = this.S(uu);
          return mb * Math.max(0, tr.L + uu);
        }
        return mb * this.absLevel(xr, lv, d);
      };
      EP.levelNow = function(tr) {
        if (tr.state === ST_TENT && tr.tent) return tr.tent.level;
        return tr.L !== null ? tr.L : 0;
      };
      EP.reset = function() {
        this.tracks = [];
      };
      EP.process = function(t, a) {
        const g = toGrid(a);
        if (this.last_t !== null) {
          if (t === this.last_t && this.last_a !== null) {
            let same = true;
            for (let i = 0; i < g.length; i++) {
              if (g[i] !== this.last_a[i]) {
                same = false;
                break;
              }
            }
            if (same) return this.last_out;
          }
          if (t < this.last_t) this.reset();
        }
        this.last_t = t;
        this.last_a = g;
        const regs = contactRegions2(g, this.p.region.min_cells);
        const b = interpolate3(g);
        const areas = areaRegions2(b, this.ar.T);
        for (let i = 0; i < areas.length; i++) {
          const ar = areas[i];
          ar.fp = this.ar.N_min <= ar.N && ar.N <= this.ar.N_max && ar.span <= this.ar.span_max && ar.ecc <= this.ar.ecc_max;
        }
        for (let i = 0; i < regs.length; i++) regs[i].areas = [];
        if (regs.length) {
          for (let i = 0; i < areas.length; i++) {
            const ar = areas[i];
            let bj = 0, bd = Infinity;
            for (let j = 0; j < regs.length; j++) {
              const dd = Math.hypot(ar.pr - regs[j].cy, ar.pc - regs[j].cx);
              if (dd < bd) {
                bd = dd;
                bj = j;
              }
            }
            regs[bj].areas.push(ar);
          }
        }
        for (let i = 0; i < regs.length; i++) {
          const rg = regs[i];
          rg.footprint = rg.areas.length === 1 && rg.areas[0].fp;
          rg.NT = 0;
          for (let j = 0; j < rg.areas.length; j++) rg.NT += rg.areas[j].N;
        }
        const used = /* @__PURE__ */ new Set();
        const pairs = [];
        for (let i = 0; i < regs.length; i++) {
          const rg = regs[i];
          let best = null, bd = this.p.track.match;
          for (let j = 0; j < this.tracks.length; j++) {
            const tr = this.tracks[j];
            if (used.has(tr.id)) continue;
            const dd = Math.hypot(tr.cy - rg.cy, tr.cx - rg.cx);
            if (dd <= bd) {
              best = tr;
              bd = dd;
            }
          }
          if (best === null) {
            best = new Track(this.nextId++, t, rg.cy, rg.cx);
            this.tracks.push(best);
          }
          used.add(best.id);
          pairs.push([rg, best]);
        }
        for (let j = 0; j < this.tracks.length; j++) {
          if (!used.has(this.tracks[j].id)) this.tracks[j].missed += 1;
        }
        const drop = this.p.track.drop;
        this.tracks = this.tracks.filter(function(tr) {
          return used.has(tr.id) || tr.missed < drop;
        });
        const outs = [];
        for (let i = 0; i < pairs.length; i++) outs.push(this.stepRegion(pairs[i][1], pairs[i][0], t));
        let totM = 0, totS = 0, anyNull = false;
        const Ps = [];
        for (let i = 0; i < outs.length; i++) {
          totM += outs[i].m;
          totS += outs[i].S;
          if (outs[i].P === null) anyNull = true;
          else Ps.push(outs[i].P);
        }
        const avgP = !outs.length || anyNull ? null : mean(Ps);
        const res = { t, m: totM, F: this.g * totM, S: totS, P: avgP, regions: outs };
        this.last_out = res;
        return res;
      };
      EP.stepRegion = function(tr, rg, t) {
        const mb = this.mb;
        const dt = tr.raw.length ? Math.max(1, t - tr.prev_t) : 85;
        tr.cy = rg.cy;
        tr.cx = rg.cx;
        tr.missed = 0;
        const x = rg.x;
        tr.raw.push([t, x]);
        tr.raw = tr.raw.filter(function(s) {
          return s[0] > t - 1500;
        });
        const xsArr = tr.raw.slice(-this.medn).map(function(s) {
          return s[1];
        });
        const xf = median2(xsArr);
        tr.flt.push([t, xf]);
        tr.flt = tr.flt.filter(function(s) {
          return s[0] > t - 1500;
        });
        let xr;
        if (this.readout === "raw") {
          xr = x;
        } else if (this.readout === "flt") {
          xr = xf;
        } else {
          let xs = xf;
          if (this.steady === "mean3") {
            const vals = tr.flt.slice(-3).map(function(s) {
              return s[1];
            });
            if (Math.max.apply(null, vals) - Math.min.apply(null, vals) <= this.band) xs = mean(vals);
          } else if (this.steady === "med5") {
            const vals = tr.raw.slice(-5).map(function(s) {
              return s[1];
            });
            if (Math.max.apply(null, vals) - Math.min.apply(null, vals) <= 2 * this.band) xs = median2(vals);
          }
          xr = Math.abs(x - xs) <= this.band ? xs : x;
        }
        const an = this.anchors(rg.cy, rg.cx);
        const lv = an.lv, d = an.d;
        this.lv_cur = lv;
        const mf = this.mfit(rg);
        const peak = rg.peak;
        const ov = this.ov;
        const hasBase = tr.L !== null;
        const forceIn = ov.force_in;
        const gg = this.g;
        let m;
        if (!rg.footprint) {
          if (hasBase) {
            tr.frozen = true;
            m = mb * Math.max(0, this.lam(xr, tr.L, tr.A, tr.hist, d));
          } else {
            m = mf;
            tr.tent = null;
            tr.hist = {};
            tr.state = ST_FIRST;
            tr.t_start = t;
          }
          if (gg * m > forceIn) tr.frozen = true;
          tr.exit_t0 = null;
        } else {
          if (tr.frozen) {
            const mz = hasBase ? mb * Math.max(0, this.lam(xr, tr.L, tr.A, tr.hist, d)) : mf;
            const ok = gg * mz <= forceIn;
            if (ok) {
              if (tr.exit_t0 === null) tr.exit_t0 = t;
              if (t - tr.exit_t0 >= ov.hold_ms) {
                tr.frozen = false;
                tr.exit_t0 = null;
                if (hasBase) {
                  tr.state = ST_JUDGE;
                  tr.judge_t0 = t;
                  tr.ambig_t0 = null;
                  tr.cont = null;
                } else {
                  tr.state = ST_FIRST;
                  tr.t_start = t;
                }
              }
            } else {
              tr.exit_t0 = null;
            }
          }
          if (!tr.frozen) {
            m = this.runState(tr, t, xf, xr, lv, d, dt);
            if (gg * m > forceIn || this.levelNow(tr) > ov.level) {
              tr.frozen = true;
              tr.exit_t0 = null;
              if (tr.state === ST_TENT && tr.tent && tr.tent.level > ov.level) {
                tr.tent = null;
                tr.state = ST_JUDGE;
              }
            }
          }
          if (tr.frozen) {
            m = tr.L !== null ? mb * Math.max(0, this.lam(xr, tr.L, tr.A, tr.hist, d)) : mf;
          }
        }
        if (gg * m > forceIn && gg * mf > forceIn) {
          tr.over = true;
          tr.over_exit_t0 = null;
        } else if (tr.over) {
          if (tr.over_exit_t0 === null) tr.over_exit_t0 = t;
          if (t - tr.over_exit_t0 >= ov.hold_ms) {
            tr.over = false;
            tr.over_exit_t0 = null;
          }
        }
        let mode;
        if (tr.over) {
          mode = "\u8D85\u91CF\u7A0B\u4F30\u7B97";
        } else if (tr.frozen || !rg.footprint) {
          mode = "\u4F30\u7B97";
        } else {
          mode = "\u6807\u51C6\u6863";
        }
        let S_ = mode === "\u6807\u51C6\u6863" ? rg.NT > 0 ? this.base_area : 0 : rg.NT * this.cell_area;
        if (tr.mode !== null && mode !== tr.mode) this.startSmooth(tr);
        if (tr.sm !== null) {
          const t0 = tr.sm[0], m0 = tr.sm[1], S0 = tr.sm[2];
          const tau = (t - t0) / this.smooth_ms;
          if (tau >= 1) {
            tr.sm = null;
          } else {
            const s = sCurve(tau);
            m = m0 + (m - m0) * s;
            S_ = S0 + (S_ - S0) * s;
          }
        }
        tr.mode = mode;
        tr.out_m = m;
        tr.out_S = S_;
        tr.prev_t = t;
        const F = this.g * m;
        const P = S_ > 0 ? 10 * F / S_ : null;
        return {
          track: tr.id,
          m,
          F,
          S: S_,
          P,
          mode,
          state: tr.state,
          level: this.levelNow(tr),
          L: tr.L,
          added: tr.added,
          first: tr.first_level,
          footprint: rg.footprint,
          NT: rg.NT,
          mfit: mf,
          peak,
          over: tr.over,
          frozen: tr.frozen,
          cy: rg.cy,
          cx: rg.cx,
          adcSum: rg.S1,
          nCells: rg.n
        };
      };
      function parseCaptureCSV(text) {
        const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
        const h = lines.findIndex(function(l) {
          return l.startsWith("\u5E27\u5E8F\u53F7,\u91C7\u96C6\u7C7B\u578B");
        });
        if (h < 0) throw new Error("\u672A\u627E\u5230\u5E27\u5143\u6570\u636E\u8868\u5934\uFF08\u5E27\u5E8F\u53F7,\u91C7\u96C6\u7C7B\u578B,\u2026\uFF09");
        const metas = [];
        let i = h + 1;
        while (i < lines.length && lines[i].trim() && !lines[i].startsWith("---")) {
          metas.push(lines[i].split(","));
          i++;
        }
        const frames = metas.map(function(m, k2) {
          return { index: k2, t: Number(m[4]), srcT: Number(m[5]), phys: null };
        });
        let k = -1;
        while (i < lines.length) {
          const l = lines[i];
          if (/^--- 帧序号 #\d+ ---/.test(l)) {
            k++;
            i++;
            continue;
          }
          if (l.startsWith("\u63D2\u503C\u524D\u539F\u59CB\u7269\u7406\u77E9\u9635") && k >= 0 && k < frames.length) {
            const rows = [];
            for (let r = 0; r < N_PHYS2; r++) {
              rows.push(lines[i + 2 + r].split(",").slice(1, 1 + N_PHYS2).map(Number));
            }
            frames[k].phys = rows;
            i += 2 + N_PHYS2;
            continue;
          }
          i++;
        }
        return frames.filter(function(f) {
          return f.phys !== null;
        });
      }
      function replayGroups(frames, opts) {
        opts = opts || {};
        const size = opts.groupSize || 100;
        const per = opts.framesPerStep || 20;
        const params = opts.params || DEFAULT_PARAMS2;
        const mb = params.standard.mb;
        const groups = [];
        for (let s = 0, gi = 0; s + size <= frames.length; s += size, gi++) {
          const alg = new EndiAlgorithm2(params);
          const t0 = frames[s].t;
          const rows = [];
          for (let k = 0; k < size; k++) {
            const f = frames[s + k];
            const out = alg.process(f.t - t0, f.phys);
            rows.push({ k, step: Math.floor(k / per) + 1, truth: mb * (Math.floor(k / per) + 1), out });
          }
          groups.push({ group: gi + 1, frames: rows });
        }
        return groups;
      }
      return {
        EndiAlgorithm: EndiAlgorithm2,
        DEFAULT_PARAMS: DEFAULT_PARAMS2,
        STATES: { FIRST: ST_FIRST, TENT: ST_TENT, CONF: ST_CONF, JUDGE: ST_JUDGE },
        interpolate: interpolate3,
        contactRegions: contactRegions2,
        areaRegions: areaRegions2,
        parseCaptureCSV,
        replayGroups,
        pyRound,
        version: "1.1.0"
      };
    })();
    var EndiAlgorithm = EndiCushion.EndiAlgorithm;
    var DEFAULT_PARAMS = EndiCushion.DEFAULT_PARAMS;
    var STATES = EndiCushion.STATES;
    var interpolate = EndiCushion.interpolate;
    var contactRegions = EndiCushion.contactRegions;
    var areaRegions = EndiCushion.areaRegions;
    var ENDI_CUSHION_CORE_VERSION = EndiCushion.version;
    var ENDI_CUSHION_CORE_SOURCE_SHA256 = "9581beef0c0cb2aebfe899feaf2be43a9932be299a04c4fa56b88b9aecb8d2a5";

    // lib/pressureUnits.ts
    var PRESSURE_UNITS_PER_KPA = 100;
    function roundForceN(value) {
      return Math.round(value * 100) / 100;
    }
    function roundAreaCm2(value) {
      return Math.round(value * 100) / 100;
    }
    function pressureUnitsFromKPa(kPa) {
      return Math.round(kPa * PRESSURE_UNITS_PER_KPA);
    }
    function roundPressureKPa(kPa) {
      return pressureUnitsFromKPa(kPa) / PRESSURE_UNITS_PER_KPA;
    }
    function pressureKPaFromForceArea(forceN, areaCm2) {
      if (!(areaCm2 > 0) || !Number.isFinite(forceN)) return null;
      return roundPressureKPa(10 * forceN / areaCm2);
    }

    // lib/endiSeatForce.ts
    var ENDI_SEAT_ALGORITHM_ID = "endi-cushion-anchor-state-machine-g9p8";
    var ENDI_SEAT_ALGORITHM_LABEL = "\u6069\u8FEA\u5750\u57AB\u5B9E\u6D4B\u62DF\u5408\u7B97\u6CD5\uFF08\u4F4D\u7F6E\u951A\u70B9\uFF0B\u76F8\u5BF9\u6863\u4F4D\u72B6\u6001\u673A\uFF0Cg=9.8\uFF09";
    var ENDI_SEAT_MODEL_VERSION = `endi-cushion-${ENDI_CUSHION_CORE_VERSION}-fit-20261109`;
    var ENDI_SEAT_PRESSURE_VERSION = "endi-cushion-region-pressure-mean-g9p8-20261109";
    var ENDI_SEAT_CONTACT_VERSION = "endi-algo-orientation-adc1-8conn-min3-20261109";
    var ENDI_SEAT_AREA_VERSION = "endi-cushion-t29-contour-count-20261109";
    var ENDI_SEAT_CALCULATION_MODE = "endi_cushion_fitted";
    var N_PHYS = 23;
    var N_INT = 46;
    var ENDI_SEAT_GRAVITY = DEFAULT_PARAMS.standard.g;
    var ENDI_SEAT_UNIT_MASS_KG = DEFAULT_PARAMS.standard.mb;
    var ENDI_SEAT_BASE_AREA_CM2 = DEFAULT_PARAMS.standard.base_area;
    var ENDI_SEAT_AREA_THRESHOLD_ADC = DEFAULT_PARAMS.area.T;
    var ENDI_SEAT_OVER_RANGE_FORCE_THRESHOLD_N = DEFAULT_PARAMS.over.force_in;
    var ENDI_SEAT_OVER_RANGE_GAIN = DEFAULT_PARAMS.over.gain;
    var ENDI_SEAT_HUMAN_AREA_THRESHOLD_CM2 = 600;
    var ENDI_SEAT_HUMAN_FORCE_THRESHOLD_N = 300;
    var ENDI_SEAT_HUMAN_FORCE_FACTOR = 0.4;
    var ENDI_SEAT_HUMAN_AREA_FACTOR = 0.9;
    var ENDI_SEAT_HUMAN_EXIT_HOLD_MS = Number(DEFAULT_PARAMS.over.hold_ms) > 0 ? Number(DEFAULT_PARAMS.over.hold_ms) : 500;
    var ENDI_SEAT_HUMAN_PEAK_PRESSURE_GAIN = 1.5;
    var ENDI_SEAT_HUMAN_VERSION = "endi-cushion-human-frame-area-gt600-force-gt300-force0.4-area0.9-peak1.5-v110-20261114";
    var ENDI_SEAT_OVER_RANGE_VERSION = "endi-cushion-over-range-base-force-gt90n-gain2-20261113";
    var FACTOR_SMOOTH_MS = Number(DEFAULT_PARAMS.smooth_ms) > 0 ? Number(DEFAULT_PARAMS.smooth_ms) : 120;
    function isAdcMatrix(m, rows, cols) {
      if (!Array.isArray(m) || m.length !== rows) return false;
      for (const row of m) {
        if (!Array.isArray(row) || row.length !== cols) return false;
        for (const v of row) if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 255) return false;
      }
      return true;
    }
    function endiNativeToAlgorithm(native) {
      const out = new Array(N_PHYS);
      for (let r = 0; r < N_PHYS; r++) {
        const row = new Array(N_PHYS);
        for (let c = 0; c < N_PHYS; c++) row[c] = native[N_PHYS - 1 - c][r];
        out[r] = row;
      }
      return out;
    }
    function endiSeatBaseTotals(regions) {
      let areaCm2 = 0, forceN = 0;
      for (const r of regions) {
        areaCm2 += r.S;
        forceN += r.F;
      }
      return { areaCm2, forceN };
    }
    function isEndiSeatHumanFrame(regions) {
      const { areaCm2, forceN } = endiSeatBaseTotals(regions);
      return areaCm2 > ENDI_SEAT_HUMAN_AREA_THRESHOLD_CM2 && forceN > ENDI_SEAT_HUMAN_FORCE_THRESHOLD_N;
    }
    function isEndiSeatOverRangeRegion(r) {
      return r.over === true;
    }
    function endiSeatFactorKinds(regions, humanActive = isEndiSeatHumanFrame(regions)) {
      const human = humanActive;
      return regions.map((r) => {
        if (human && r.mode !== "\u6807\u51C6\u6863") return "human";
        if (isEndiSeatOverRangeRegion(r)) return "over_range";
        return "standard";
      });
    }
    function endiSeatKindHumanWeight(kind) {
      return kind === "human" ? 1 : 0;
    }
    function endiSeatPeakPressureGain(humanWeight) {
      const w = Math.min(Math.max(Number.isFinite(humanWeight) ? humanWeight : 0, 0), 1);
      return 1 + (ENDI_SEAT_HUMAN_PEAK_PRESSURE_GAIN - 1) * w;
    }
    function endiSeatKindFactors(kind) {
      if (kind === "human") return [ENDI_SEAT_HUMAN_FORCE_FACTOR, ENDI_SEAT_HUMAN_AREA_FACTOR];
      if (kind === "over_range") return [ENDI_SEAT_OVER_RANGE_GAIN, 1];
      return [1, 1];
    }
    function regionLabel(r, kind, massKg) {
      if (kind === "human") {
        return `\u771F\u4EBA\u4F30\u7B97 ${massKg.toFixed(2)} kg\uFF08\u538B\u529B\xD7${ENDI_SEAT_HUMAN_FORCE_FACTOR}\uFF0C\u9762\u79EF\xD7${ENDI_SEAT_HUMAN_AREA_FACTOR}\uFF0C\u6700\u5927\u538B\u5F3A\xD7${ENDI_SEAT_HUMAN_PEAK_PRESSURE_GAIN}\uFF09`;
      }
      if (kind === "over_range") {
        return `\u8D85\u91CF\u7A0B\u4F30\u7B97 ${massKg.toFixed(2)} kg\uFF08\u538B\u529B\xD7${ENDI_SEAT_OVER_RANGE_GAIN}\uFF09`;
      }
      if (r.mode === "\u6807\u51C6\u6863") {
        return r.level > 0 ? `${r.level}\u5757\uFF08${(r.level * ENDI_SEAT_UNIT_MASS_KG).toFixed(3)} kg\uFF0C${r.state}\uFF09` : `\u6807\u51C6\u6863\uFF08${r.state}\uFF09`;
      }
      return `${r.mode} ${massKg.toFixed(2)} kg`;
    }
    function smoothStep(tau) {
      const x = Math.min(Math.max(tau, 0), 1);
      return 3 * x * x - 2 * x * x * x;
    }
    var SCOPE_NOTE = "\u6069\u8FEA\u5750\u57AB\u5B9E\u6D4B\u62DF\u5408\u7B97\u6CD5\uFF1A\u672A\u8865\u507F\u539F\u59CB\u7269\u7406ADC\u987A\u65F6\u948890\xB0\u8FDB\u5165\u7B97\u6CD5\u65B9\u5411\uFF1B\u63A5\u89E6\u533A=ADC\u22651\u516B\u90BB\u57DF\u8FDE\u901A\uFF08\u22653\u683C\uFF09\uFF0C\u54CD\u5E94\u91CFR=\u03A3\u2212ln(1\u2212ADC/256)\u7ECF3\u5E27\u4E2D\u503C\u6EE4\u6CE2\uFF0C\u630931\u4E2A\u4F4D\u7F6E\u951A\u70B9\uFF08\u03C3=2.5\u683C\uFF09\u4E0E\u76F8\u5BF9\u6863\u4F4D\u72B6\u6001\u673A\u8BC6\u522B\u6807\u51C6\u781D\u7801\u5757\u6570\uFF08\u6BCF\u57571.625kg\uFF09\uFF0C\u975E\u781D\u7801\u8F6E\u5ED3\u6309\u8FDE\u7EED\u62DF\u5408\u4F30\u7B97\uFF1BF=9.8m\u3002\u9762\u79EF=46\xD746\u63D2\u503C\u77E9\u9635T29\u8F6E\u5ED3\uFF1A\u6807\u51C6\u6863\u6BCF\u533A\u53D6\u781D\u7801\u5E95\u976263.62cm\xB2\uFF0C\u4F30\u7B97\u6309\u8F6E\u5ED3\u683C\u6570\xD71cm\xB2\uFF1B\u5404\u533AF\u2C7C\u53D62\u4F4D\u5C0F\u6570\uFF0CP\u2C7C=F\u2C7C/S\u2C7C\uFF08N/cm\xB2\uFF0C3\u4F4D\u5C0F\u6570\uFF0C\u5185\u90E8\u5B58kPa=10F\u2C7C/S\u2C7C\uFF09\uFF0C\u603B\u529B=\u03A3F\u2C7C\u3002\u9010\u683C\u538B\u5F3A P\u1D62=P\u533A\xD7ADC\u1D62/mean(ADC\u533A)\uFF08ADC\u53D6\u70ED\u529B\u56FE\u663E\u793A\u503C\uFF0C\u63090.001N/cm\xB2\u4FDD\u548C\u53D6\u6574\uFF0C\u533A\u5185\u683C\u5B50\u5E73\u5747=P\u533A\uFF09\uFF0C\u5E73\u5747\u538B\u5F3A=\u5168\u90E8\u538B\u5F3A\u683C\u5B50\u7684\u5E73\u5747\u503C\uFF08\u4E0E\u70ED\u529B\u56FE\u683C\u5B50\u663E\u793A\u7684\u538B\u5F3A\u540C\u6B65\uFF0C\u540C\u4E00\u5E27\u3001\u540C\u4E000.001N/cm\xB2\u53D6\u6574\uFF09\uFF0C\u6700\u5927\u538B\u5F3A=MAX(P\u1D62)\uFF0C\u89C1 pointPressure\u3002V2.7.103\uFF08\u4EC5\u5750\u57AB\uFF0C\u4E24\u8005\u4E92\u65A5\uFF09\uFF1A\u771F\u4EBA\u4F30\u7B97=\u5168\u5E27\u57FA\u51C6\u9762\u79EF>600cm\xB2\u4E14\u57FA\u51C6\u529B>300N\u65F6\uFF0C\u975E\u6807\u51C6\u6863\u63A5\u89E6\u533A\u538B\u529B\xD70.4\u3001\u9762\u79EF\xD70.9\uFF08\u538B\u5F3A=0.4F/0.9S\uFF0C\u4E0D\u518D\u4E58\xD72\uFF0C\u6761\u4EF6\u8FDE\u7EED\u4E0D\u6EE1\u8DB3500ms\u540E\u9000\u51FA\uFF09\uFF1B\u5426\u5219\u57FA\u51C6\u4F30\u7B97\u529B\u4E0E\u8FDE\u7EED\u62DF\u5408\u4F30\u7B97\u529B\u5747>90N\uFF08\u8D85\u8FC75\u5757\uFF09\u7684\u63A5\u89E6\u533A\u6309\u8D85\u91CF\u7A0B\u4F30\u7B97\u538B\u529B\xD72\u3001\u9762\u79EF\u53D6T29\u8F6E\u5ED3\uFF08\u4EFB\u4E00\u56DE\u843D\u226490N\u6301\u7EED500ms\u540E\u53D6\u6D88\uFF09\uFF1B\u7CFB\u6570\u5207\u6362\u6309120ms S\u66F2\u7EBF\u8FC7\u6E21\u3002V2.7.110\uFF1A\u771F\u4EBA\u4F30\u7B97\u533A\u9010\u683C\u538B\u5F3A\u6539\u4E3A\u6309ADC\u1D62^\u03B3\u5206\u914D\uFF08\u03B3\u22651\u81EA\u52A8\u6C42\u89E3\uFF09\uFF0C\u6700\u5927\u683C=\u539F\u6BD4\u4F8B\u5206\u914D\u6700\u5927\u683C\xD71.5\uFF0C\u533A\u5185\u4FDD\u548C\u53D6\u6574\uFF0C\u683C\u5B50\u5E73\u5747\u4ECD=\u533A\u538B\u5F3A\u3001\u5E73\u5747\u538B\u5F3A\u4ECD=\u683C\u5B50\u5E73\u5747\u3002";
    function toForceFrame(out, native, liveResult) {
      const regions = out.regions;
      let rawAdcSum = 0;
      for (const row of native) for (const v of row) rawAdcSum += v;
      const noContact = regions.length === 0;
      const humanRaw = isEndiSeatHumanFrame(regions);
      const humanFrame = liveResult ? liveResult.humanActive : humanRaw;
      const kinds = liveResult ? liveResult.kinds : endiSeatFactorKinds(regions, humanFrame);
      const factors = regions.map((r, i) => {
        var _a;
        return (_a = liveResult == null ? void 0 : liveResult.factors[i]) != null ? _a : endiSeatKindFactors(kinds[i]);
      });
      const fF = factors.map((f) => f[0]);
      const fS = factors.map((f) => f[1]);
      const hW = regions.map((r, i) => {
        var _a;
        return (_a = liveResult == null ? void 0 : liveResult.humanWeights[i]) != null ? _a : endiSeatKindHumanWeight(kinds[i]);
      });
      const baseTotals = endiSeatBaseTotals(regions);
      const mOut = regions.map((r, i) => r.m * fF[i]);
      const FOut = regions.map((r, i) => r.F * fF[i]);
      const SOut = regions.map((r, i) => r.S * fS[i]);
      const regionF = FOut.map((v) => roundForceN(v));
      const regionS = SOut.map((v) => roundAreaCm2(v));
      const regionP = regions.map((r, i) => r.P === null ? null : pressureKPaFromForceArea(regionF[i], regionS[i]));
      const totalF = roundForceN(regionF.reduce((s, v) => s + v, 0));
      const totalS = roundAreaCm2(SOut.reduce((s, v) => s + v, 0));
      const complete = !noContact && regionP.every((p) => p !== null);
      const arithmeticMeanP = complete ? roundPressureKPa(regionP.reduce((s, p) => s + p, 0) / regionP.length) : null;
      const prRegions = regions.map((r, i) => ({
        index: i,
        center: [r.cy, r.cx],
        rawAdcSum: r.adcSum,
        forceShare: totalF > 0 ? regionF[i] / totalF : 0,
        estimatedForceN: regionF[i],
        areaCm2: regionS[i],
        estimatedPressureKPa: regionP[i]
      }));
      const contactPressure = {
        version: ENDI_SEAT_PRESSURE_VERSION,
        method: "endi_region_force_over_region_area_then_arithmetic_mean",
        status: noContact ? "no_contact" : complete ? "estimated" : "incomplete",
        scope: "complete_frame",
        independentlyValidated: false,
        totalForceN: totalF,
        areaCm2: totalS,
        rawAdcSum,
        assignedRawAdcSum: regions.reduce((s, r) => s + r.adcSum, 0),
        regions: prRegions,
        // 各区算术平均；接入逐格压强后（attachEndiPointPressure）改为全部压强格子的平均值。
        averagePressureKPa: arithmeticMeanP,
        globalAreaMeanPressureKPa: totalS > 0 ? pressureKPaFromForceArea(totalF, totalS) : null
      };
      const anyOver = kinds.some((k) => k === "over_range");
      const anyEstimate = regions.some((r) => r.mode !== "\u6807\u51C6\u6863");
      const diagnostics = {
        version: ENDI_SEAT_MODEL_VERSION,
        coreVersion: ENDI_CUSHION_CORE_VERSION,
        coreSourceSha256: ENDI_CUSHION_CORE_SOURCE_SHA256,
        gravityMS2: ENDI_SEAT_GRAVITY,
        unitMassKg: ENDI_SEAT_UNIT_MASS_KG,
        baseAreaCm2: ENDI_SEAT_BASE_AREA_CM2,
        areaThresholdAdc: ENDI_SEAT_AREA_THRESHOLD_ADC,
        inputOrientation: "native-rotated-90cw",
        massKg: mOut.reduce((s, v) => s + v, 0),
        humanVersion: ENDI_SEAT_HUMAN_VERSION,
        humanForceFactor: ENDI_SEAT_HUMAN_FORCE_FACTOR,
        humanAreaFactor: ENDI_SEAT_HUMAN_AREA_FACTOR,
        humanPeakPressureGain: ENDI_SEAT_HUMAN_PEAK_PRESSURE_GAIN,
        humanAreaThresholdCm2: ENDI_SEAT_HUMAN_AREA_THRESHOLD_CM2,
        humanForceThresholdN: ENDI_SEAT_HUMAN_FORCE_THRESHOLD_N,
        baseAreaTotalCm2: baseTotals.areaCm2,
        baseForceTotalN: baseTotals.forceN,
        humanConditionMet: humanRaw,
        humanExitHoldMs: ENDI_SEAT_HUMAN_EXIT_HOLD_MS,
        humanEstimateActive: humanFrame && kinds.some((k) => k === "human"),
        overRangeVersion: ENDI_SEAT_OVER_RANGE_VERSION,
        overRangeForceThresholdN: ENDI_SEAT_OVER_RANGE_FORCE_THRESHOLD_N,
        overRangeGain: ENDI_SEAT_OVER_RANGE_GAIN,
        overRangeActive: anyOver,
        regions: regions.map((r, i) => ({
          track: r.track,
          mode: r.mode,
          state: r.state,
          level: r.level,
          massKg: mOut[i],
          forceN: FOut[i],
          areaCm2: SOut[i],
          pressureKPa: r.P === null || !(SOut[i] > 0) ? null : 10 * FOut[i] / SOut[i],
          footprint: r.footprint,
          contourCells: r.NT,
          fitMassKg: r.mfit,
          peakAdc: r.peak,
          overRange: r.over,
          frozen: r.frozen,
          center: [r.cy, r.cx],
          adcSum: r.adcSum,
          cells: r.nCells,
          factorKind: kinds[i],
          humanEstimate: kinds[i] === "human",
          overRangeEstimate: kinds[i] === "over_range",
          forceFactor: fF[i],
          areaFactor: fS[i],
          humanWeight: hW[i],
          peakPressureGain: endiSeatPeakPressureGain(hW[i]),
          coreMassKg: r.m,
          coreForceN: r.F,
          coreAreaCm2: r.S,
          corePressureKPa: r.P
        }))
      };
      return {
        algorithmId: ENDI_SEAT_ALGORITHM_ID,
        algorithmLabel: ENDI_SEAT_ALGORITHM_LABEL,
        modelVersion: ENDI_SEAT_MODEL_VERSION,
        status: noContact ? "no_contact" : anyOver ? "over_range_estimate" : anyEstimate ? "estimated" : "standard_recognized",
        forceN: totalF,
        averagePressureKPa: arithmeticMeanP,
        areaCm2: totalS,
        contactPressure,
        seedCount: regions.length,
        regionForcesN: regionF,
        forceAggregation: "regional_sum",
        regionCenters: regions.map((r) => [r.cy, r.cx]),
        contactDetectionVersion: ENDI_SEAT_CONTACT_VERSION,
        forceEstimateComplete: true,
        calibratedSeedCount: regions.length,
        detectedContactCount: regions.length,
        detectedContactCenters: regions.map((r) => [r.cy, r.cx]),
        inputMode: "native-uncompensated-physical-adc-23x23-rotated-90cw",
        accepted: false,
        independentlyValidated: false,
        forceMeaning: ENDI_SEAT_CALCULATION_MODE,
        calculationMode: ENDI_SEAT_CALCULATION_MODE,
        loadLabel: noContact ? "\u65E0\u63A5\u89E6" : regions.map((r, i) => regionLabel(r, kinds[i], mOut[i])).join("\uFF1B"),
        scopeNote: SCOPE_NOTE,
        endiCushion: diagnostics
      };
    }
    function blendFactors(b, t) {
      const to = endiSeatKindFactors(b.kind);
      const s = smoothStep((t - b.t0) / FACTOR_SMOOTH_MS);
      if (s >= 1) return to;
      return [b.from[0] + (to[0] - b.from[0]) * s, b.from[1] + (to[1] - b.from[1]) * s];
    }
    function blendHuman(b, t) {
      const to = endiSeatKindHumanWeight(b.kind);
      const s = smoothStep((t - b.t0) / FACTOR_SMOOTH_MS);
      if (s >= 1) return to;
      return b.fromHuman + (to - b.fromHuman) * s;
    }
    function latchHuman(state, out, t) {
      const h = state.human;
      if (out.regions.length === 0) {
        h.on = false;
        h.offSince = null;
        return false;
      }
      if (isEndiSeatHumanFrame(out.regions)) {
        h.on = true;
        h.offSince = null;
        return true;
      }
      if (h.on) {
        if (h.offSince === null) h.offSince = t;
        if (t - h.offSince >= ENDI_SEAT_HUMAN_EXIT_HOLD_MS) {
          h.on = false;
          h.offSince = null;
        }
      }
      return h.on;
    }
    function liveFactors(state, out, t) {
      const humanActive = latchHuman(state, out, t);
      const kinds = endiSeatFactorKinds(out.regions, humanActive);
      const seen = /* @__PURE__ */ new Set();
      const humanWeights = [];
      const result = out.regions.map((r, i) => {
        const kind = kinds[i];
        seen.add(r.track);
        let b = state.factors.get(r.track);
        if (!b) {
          b = { from: endiSeatKindFactors(kind), fromHuman: endiSeatKindHumanWeight(kind), kind, t0: t };
          state.factors.set(r.track, b);
        } else if (b.kind !== kind) {
          b = { from: blendFactors(b, t), fromHuman: blendHuman(b, t), kind, t0: t };
          state.factors.set(r.track, b);
        }
        humanWeights.push(blendHuman(b, t));
        return blendFactors(b, t);
      });
      for (const id of Array.from(state.factors.keys())) if (!seen.has(id)) state.factors.delete(id);
      return { humanActive, kinds, factors: result, humanWeights };
    }
    var live = null;
    function calculateEndiSeatForce(native, context) {
      if (!isAdcMatrix(native, N_PHYS, N_PHYS)) return null;
      const isLive = !!context && !context.static && typeof context.streamId === "string" && Number.isFinite(context.timestampMs);
      if (!isLive) {
        const out2 = new EndiAlgorithm().process(0, endiNativeToAlgorithm(native));
        return toForceFrame(out2, native);
      }
      if (!live || live.streamId !== context.streamId) {
        live = { streamId: context.streamId, alg: new EndiAlgorithm(), lastRawT: null, lastT: null, results: /* @__PURE__ */ new WeakMap(), factors: /* @__PURE__ */ new Map(), human: { on: false, offSince: null } };
      }
      const cached = live.results.get(native);
      if (cached) return cached;
      const rawT = context.timestampMs;
      let t = rawT;
      if (live.lastRawT !== null && live.lastT !== null && rawT >= live.lastRawT) t = Math.max(rawT, live.lastT + 1e-3);
      if (live.lastT !== null && t < live.lastT) {
        live.factors.clear();
        live.human = { on: false, offSince: null };
      }
      const out = live.alg.process(t, endiNativeToAlgorithm(native));
      live.lastRawT = rawT;
      live.lastT = t;
      const frame = toForceFrame(out, native, liveFactors(live, out, t));
      live.results.set(native, frame);
      return frame;
    }
    function analyzeEndiSeatArea(sourceMatrix, options = {}) {
      var _a, _b;
      if (!isAdcMatrix(sourceMatrix, N_INT, N_INT)) throw new TypeError("\u9700\u8981 46\xD746 \u8865\u507F\u524D\u63D2\u503C ADC \u77E9\u9635");
      const T = ENDI_SEAT_AREA_THRESHOLD_ADC;
      const sel = options.selection;
      const r0 = sel ? Math.max(0, Math.min(sel.startRow, sel.endRow)) : 0;
      const r1 = sel ? Math.min(N_INT - 1, Math.max(sel.startRow, sel.endRow)) : N_INT - 1;
      const c0 = sel ? Math.max(0, Math.min(sel.startCol, sel.endCol)) : 0;
      const c1 = sel ? Math.min(N_INT - 1, Math.max(sel.startCol, sel.endCol)) : N_INT - 1;
      let count = 0;
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
        if (((_b = (_a = options.validMask) == null ? void 0 : _a[r]) == null ? void 0 : _b[c]) === false) continue;
        if (sourceMatrix[r][c] >= T) count++;
      }
      return {
        version: ENDI_SEAT_AREA_VERSION,
        modelVersion: ENDI_SEAT_AREA_VERSION,
        algorithmId: "endi-cushion-t29-contour-count",
        algorithmLabel: "\u6069\u8FEA\u5750\u57ABT29\u8F6E\u5ED3\u683C\u6570\u9762\u79EF",
        sensorType: "endi-23x23",
        status: count > 0 ? "measured" : "no_contact",
        unit: "cm\xB2",
        scope: sel ? "selection" : "full_frame",
        rows: N_INT,
        cols: N_INT,
        cellAreaCm2: 1,
        areaCm2: count,
        retainedCellCount: count,
        thresholdAdc: T
      };
    }

    // lib/endiBackrest/endiBackrestCore.js
    var EndiBackrest = (function() {
      "use strict";
      const CALIB2 = {
        "version": "1.0.0",
        "fittedOn": "2026-11-09",
        "sensor": "\u6069\u8FEA\u9760\u80CC new-backrest-32x25\uFF08\u7269\u7406 25\xD732\uFF0C\u63D2\u503C 50\xD764\uFF09",
        "data": "44 \u843D\u70B9 \xD7 2 \u8F6E \xD7 5 \u6863 \xD7 20 \u5E27 = 8800 \u5E27\uFF1B1.625 kg/\u6863\uFF1B\u5E95\u9762 63.62 cm\xB2",
        "nodeIds": ["P01", "P02", "P03", "P04", "P05", "P06", "P07", "P08", "P09", "P10", "P11", "P12", "P13", "P14", "P15", "P16", "P17", "P18", "P19", "P20", "P21", "P22", "P23", "P24", "P25", "P26", "P27", "P28", "P29", "P30", "P31", "P32", "P33", "P34", "P35", "P36", "P37", "P38", "P39", "P40", "P41", "P42", "P43", "P44"],
        "nodeFiles": ["sensor_capture_2026-11-09T05-43-06.csv", "sensor_capture_2026-11-09T05-44-04.csv", "sensor_capture_2026-11-09T05-46-22.csv", "sensor_capture_2026-11-09T05-47-24.csv", "sensor_capture_2026-11-09T05-48-25.csv", "sensor_capture_2026-11-09T05-49-32.csv", "sensor_capture_2026-11-09T05-51-51.csv", "sensor_capture_2026-11-09T05-52-51.csv", "sensor_capture_2026-11-09T05-54-02.csv", "sensor_capture_2026-11-09T05-55-07.csv", "sensor_capture_2026-11-09T05-56-18.csv", "sensor_capture_2026-11-09T05-57-26.csv", "sensor_capture_2026-11-09T05-58-30.csv", "sensor_capture_2026-11-09T05-59-34.csv", "sensor_capture_2026-11-09T06-00-32.csv", "sensor_capture_2026-11-09T06-02-37.csv", "sensor_capture_2026-11-09T06-05-48.csv", "sensor_capture_2026-11-09T06-09-05.csv", "sensor_capture_2026-11-09T06-10-13.csv", "sensor_capture_2026-11-09T06-11-25.csv", "sensor_capture_2026-11-09T06-12-25.csv", "sensor_capture_2026-11-09T06-13-22.csv", "sensor_capture_2026-11-09T06-14-20.csv", "sensor_capture_2026-11-09T06-16-27.csv", "sensor_capture_2026-11-09T06-17-40.csv", "sensor_capture_2026-11-09T06-19-08.csv", "sensor_capture_2026-11-09T06-20-19.csv", "sensor_capture_2026-11-09T06-21-32.csv", "sensor_capture_2026-11-09T06-22-49.csv", "sensor_capture_2026-11-09T06-24-04.csv", "sensor_capture_2026-11-09T06-25-22.csv", "sensor_capture_2026-11-09T06-26-26.csv", "sensor_capture_2026-11-09T06-32-15.csv", "sensor_capture_2026-11-09T06-33-24.csv", "sensor_capture_2026-11-09T06-34-55.csv", "sensor_capture_2026-11-09T06-35-55.csv", "sensor_capture_2026-11-09T06-37-06.csv", "sensor_capture_2026-11-09T06-38-08.csv", "sensor_capture_2026-11-09T06-39-07.csv", "sensor_capture_2026-11-09T06-40-01.csv", "sensor_capture_2026-11-09T06-41-10.csv", "sensor_capture_2026-11-09T06-42-15.csv", "sensor_capture_2026-11-09T06-43-17.csv", "sensor_capture_2026-11-09T06-44-24.csv"],
        "sigmaMm": 35,
        "plateau": {
          "diff": 0.021,
          "range": 0.033
        },
        "nodes": [
          [3.253, 11.519, 1.3598, 1.8706, 2.1185, 2.2739, 2.3946],
          [5.942, 11.343, 1.3724, 1.856, 2.1081, 2.2579, 2.3628],
          [8.305, 11.338, 1.456, 1.9049, 2.12, 2.2581, 2.3685],
          [11.311, 10.646, 1.367, 1.8111, 2.0624, 2.2193, 2.3352],
          [14.179, 11.086, 1.411, 1.9095, 2.1349, 2.2848, 2.3963],
          [16.724, 10.931, 1.4343, 1.9316, 2.1463, 2.3021, 2.428],
          [18.56, 10.953, 1.5025, 1.9793, 2.1837, 2.3297, 2.4396],
          [21.273, 11.342, 1.4586, 1.8906, 2.1024, 2.2504, 2.3621],
          [21.597, 13.784, 1.3716, 1.7997, 2.0569, 2.2097, 2.3225],
          [18.697, 13.795, 1.4862, 1.8997, 2.1252, 2.2726, 2.3883],
          [15.689, 13.693, 1.4645, 1.9094, 2.1416, 2.3017, 2.4189],
          [11.829, 13.962, 1.3708, 1.8252, 2.0874, 2.2501, 2.3697],
          [8.682, 14.299, 1.4739, 1.8932, 2.1407, 2.2782, 2.3944],
          [5.522, 14.277, 1.3303, 1.789, 2.0339, 2.1858, 2.3094],
          [2.581, 14.375, 1.424, 1.8738, 2.1114, 2.2621, 2.3664],
          [2.639, 17.631, 1.3441, 1.8285, 2.0469, 2.2173, 2.325],
          [5.337, 17.31, 1.3351, 1.7926, 2.026, 2.1647, 2.2876],
          [8.726, 17.026, 1.4764, 1.9068, 2.1454, 2.3044, 2.422],
          [11.618, 16.98, 1.3793, 1.8316, 2.0737, 2.2388, 2.3478],
          [14.028, 16.908, 1.5003, 1.9125, 2.1277, 2.2622, 2.3658],
          [16.806, 16.669, 1.4865, 1.8998, 2.1034, 2.244, 2.354],
          [19.597, 16.733, 1.371, 1.8258, 2.0514, 2.1941, 2.3012],
          [21.583, 16.843, 1.4916, 1.901, 2.1039, 2.249, 2.3523],
          [21.769, 21.615, 1.4048, 1.8093, 2.0376, 2.1816, 2.2899],
          [19.008, 21.65, 1.4692, 1.8595, 2.0878, 2.2273, 2.3356],
          [16.416, 21.795, 1.456, 1.9083, 2.142, 2.3028, 2.4097],
          [12.938, 21.875, 1.4237, 1.8971, 2.1446, 2.3075, 2.4197],
          [9.868, 22.207, 1.4806, 1.9208, 2.1822, 2.3461, 2.4551],
          [6.231, 22.335, 1.4787, 1.9084, 2.143, 2.2903, 2.393],
          [3.218, 22.704, 1.4727, 1.8958, 2.1225, 2.339, 2.4098],
          [3.72, 25.708, 1.5897, 1.9659, 2.1673, 2.3044, 2.4197],
          [6.892, 25.679, 1.5605, 1.9506, 2.1788, 2.3249, 2.433],
          [8.203, 25.928, 1.7583, 2.114, 2.3027, 2.4373, 2.5346],
          [11.135, 25.768, 1.7377, 2.1129, 2.312, 2.4469, 2.5418],
          [15.032, 26.218, 1.4897, 1.9188, 2.1333, 2.293, 2.4157],
          [18.153, 26.388, 1.4889, 1.9043, 2.1147, 2.2569, 2.3615],
          [21.442, 26.524, 1.501, 1.9109, 2.1378, 2.2939, 2.411],
          [21.311, 29.636, 1.3807, 1.8466, 2.0727, 2.2374, 2.3512],
          [18.593, 29.535, 1.4606, 1.8832, 2.1169, 2.2776, 2.3917],
          [16.01, 29.579, 1.4913, 1.9136, 2.1388, 2.2905, 2.411],
          [13.629, 29.451, 1.5738, 1.9924, 2.1931, 2.3378, 2.4728],
          [9.827, 29.203, 1.5045, 1.9735, 2.1808, 2.3215, 2.4225],
          [6.905, 29.163, 1.5544, 1.9608, 2.1715, 2.3092, 2.416],
          [3.323, 29.398, 1.5494, 2.0035, 2.1875, 2.32, 2.4248]
        ],
        "fit": {
          "feature": "S2",
          "p": 2,
          "c0": -12.04558,
          "k": 1.13724,
          "envelope": [48436.204, 245129.829],
          "gains": [
            [3.253, 11.519, 1.0014],
            [5.942, 11.343, 1.0261],
            [8.305, 11.338, 1.0225],
            [11.311, 10.646, 1.0898],
            [14.179, 11.086, 1.0193],
            [16.724, 10.931, 0.9637],
            [18.56, 10.953, 0.9586],
            [21.273, 11.342, 1.0343],
            [21.597, 13.784, 1.137],
            [18.697, 13.795, 1.0177],
            [15.689, 13.693, 0.9725],
            [11.829, 13.962, 1.0421],
            [8.682, 14.299, 0.9758],
            [5.522, 14.277, 1.144],
            [2.581, 14.375, 1.0385],
            [2.639, 17.631, 1.1155],
            [5.337, 17.31, 1.1759],
            [8.726, 17.026, 0.9916],
            [11.618, 16.98, 1.0785],
            [14.028, 16.908, 0.9981],
            [16.806, 16.669, 1.0225],
            [19.597, 16.733, 1.1113],
            [21.583, 16.843, 1.0401],
            [21.769, 21.615, 1.1593],
            [19.008, 21.65, 1.056],
            [16.416, 21.795, 0.997],
            [12.938, 21.875, 0.9841],
            [9.868, 22.207, 0.9121],
            [6.231, 22.335, 0.9745],
            [3.218, 22.704, 0.9556],
            [3.72, 25.708, 0.9446],
            [6.892, 25.679, 0.9256],
            [8.203, 25.928, 0.806],
            [11.135, 25.768, 0.7956],
            [15.032, 26.218, 0.9707],
            [18.153, 26.388, 1.0225],
            [21.442, 26.524, 1.0011],
            [21.311, 29.636, 1.0559],
            [18.593, 29.535, 1.0322],
            [16.01, 29.579, 0.9738],
            [13.629, 29.451, 0.8976],
            [9.827, 29.203, 0.9345],
            [6.905, 29.163, 0.9518],
            [3.323, 29.398, 0.935]
          ],
          "gainsFormat": "[\u884Cr, \u5217c, \u589E\u76CAg]"
        },
        "overrange": {
          "mfitIn": 9.4,
          "mfitOut": 9,
          "peakIn": 184,
          "peakOut": 176,
          "lambdaIn": 5.5,
          "lambdaOut": 5.3
        },
        "area": {
          "threshold": 39,
          "nMin": 32,
          "nMax": 102,
          "spanMaxMm": 182,
          "eccMax": 1.704
        },
        "nodesFormat": "[\u884Cr, \u5217c, lnR(1\u5757), lnR(2\u5757), lnR(3\u5757), lnR(4\u5757), lnR(5\u5757)]\uFF08\u7269\u7406\u683C\u5750\u6807\uFF0C\u4E24\u8F6E\u52A0\u8377\u5254\u5E27\u5747\u503C\uFF09"
      };
      const DEFAULT_CONFIG2 = {
        // ---- 输入与几何
        rows: 25,
        cols: 32,
        pitchRowMm: 20,
        // 物理行间距（插值后 10 mm）
        pitchColMm: 26,
        // 物理列间距（插值后 13 mm）
        interpCellAreaCm2: 1.3,
        // 插值格面积 1.0 cm × 1.3 cm
        adcFull: 256,
        // 饱和线性化满量程 Σ−ln(1 − a/256)
        // ---- 标准件
        blockMassKg: 1.625,
        baseAreaCm2: 63.62,
        g: 9.8,
        // ---- 接触区与轨迹
        regionThreshold: 1,
        // 物理接触区 ADC ≥ 1，8 邻域
        minRegionCells: 3,
        // 格数 < 3 的连通区视为孤立噪声
        matchDistMm: 60,
        // 轨迹匹配距离
        trackLostFrames: 2,
        // 连续 2 帧未匹配即删除轨迹
        sampleKeepMs: 1e3,
        // 轨迹保存最近 1 s 的响应样本
        // ---- 时间平滑（本传感器存在逐帧交替的共模增益波动，ln R 取 120 ms 内样本均值 ≈ 相邻 2 帧均值）
        smoothWindowMs: 120,
        // ---- 位置锚点
        sigmaMm: CALIB2.sigmaMm,
        // 高斯核宽
        decay: 0.8,
        // 5 块以上档间增量逐档衰减
        maxStdLevel: 5,
        // 最大标准档
        maxLevel: 10,
        // 最大跟踪档
        incrementModel: "scaled",
        // 'scaled'：按基准等效载荷缩放预测增量；'anchor'：直接用锚点档间增量
        scaleMin: 0.5,
        // 灵敏度缩放系数 s 的限幅
        scaleMax: 2,
        // ---- 平台判定（ln R）
        platDiff: CALIB2.plateau.diff,
        platRange: CALIB2.plateau.range,
        platWindowMs: 150,
        platMinSamples: 3,
        fastWindowMs: 80,
        fastMinSamples: 2,
        fastTol: 0.3,
        // ---- 首次接触
        firstMinContactMs: 300,
        lightTouchRatio: 0.6,
        // ---- 提交
        commitFirstMs: 400,
        commitChangeMs: 600,
        // ---- 加减块判断
        enterJudge: 0.25,
        clearTol: 0.4,
        fuzzyTimeoutMs: 3e3,
        fuzzyAbsMs: 1e3,
        // 模糊平台持续该时长后，允许用绝对锚点在相邻两档间裁决
        tentDeviation: 0.25,
        tentStableCommitMs: 400,
        // ---- 续接（防重复计数）
        contWindowMs: 700,
        contStepRatio: 0.7,
        // 文档 0.75；本数据跨轮真实单块步长/预测增量 p1 ≈ 0.71，取 0.70 避免误判为续接
        // ---- 恒载蠕变跟随
        creepTauMs: 1e3,
        // 本传感器 5 块保持期蠕变中位 0.107 块/s，τ = 1 s 时稳态滞后约 0.1 块
        creepBand: 0.25,
        // 跟随带宽 = 进入判断门限
        // ---- 同档重锚：判断中平台取整仍为原档（k = 0）但偏离基准 ≥ enterJudge，
        //      且窗口内平台 λ 极差 < reanchorRange，持续 reanchorMs 后将锚点更新为平台均值（不计数）；
        //      用于纠正过渡段锚点偏差与超出跟随带宽的蠕变
        reanchorMs: 600,
        reanchorRange: 0.15,
        // 重锚窗口内平台 λ 的极差上限（块）
        histMaxAgeMs: 1e4,
        // 历史锚点有效期：本数据两轮之间同档响应漂移达 0.08（≈0.4 块），同轮相邻档间隔 4–5 s
        // ---- 读数
        residualA: 0.08,
        residualC: 0.35,
        softKnee: 0.8,
        softWidth: 0.2,
        smoothMs: 120,
        // ---- 连续拟合 m = exp(c0 + k·ln(g(p)·F))，F = Σa^p（p = null 时 F = R）
        fitFeatureP: CALIB2.fit.p,
        fitC0: CALIB2.fit.c0,
        fitK: CALIB2.fit.k,
        // ---- 超量程（V2.7.103：基准估算力与连续拟合估算力均 > 90 N 即超过 5 块砝码时启动；原 m_fit / 峰值 / λ 门限已删除）
        ovrForceInN: 90,
        // 超量程启动门限（N）：5 块 = 79.63 N，6 块 = 95.55 N
        ovrHoldMs: 500,
        // 回落 ≤ 90 N 后恢复计数前的保持时间
        overrangeMultiplier: 2,
        // 规定压力倍率（非拟合值）
        overrangeAreaMultiplier: 2,
        // V2.7.108：规定超量程面积倍率（非拟合值），面积 = T39 轮廓 × 2
        // ---- 面积
        areaThreshold: CALIB2.area.threshold,
        fpNMin: CALIB2.area.nMin,
        fpNMax: CALIB2.area.nMax,
        fpSpanMaxMm: CALIB2.area.spanMaxMm,
        fpEccMax: CALIB2.area.eccMax,
        // ---- 输出
        returnAreaMap: false,
        returnInterpolated: false
      };
      const STATE2 = {
        FIRST: "first_contact",
        // 首次接触确认中
        TENT: "tentative",
        // 暂定档
        CONF: "confirmed",
        // 已确认
        JUDGE: "judging",
        // 加减块判断中
        EST: "estimate",
        // 非砝码轮廓估算 / 冻结
        OVR: "overrange"
        // 超量程估算
      };
      function toFlat(input, rows, cols) {
        const n = rows * cols;
        const a = new Float64Array(n);
        if (input == null) throw new Error("matrix is required");
        if (Array.isArray(input) && Array.isArray(input[0])) {
          if (input.length !== rows || input[0].length !== cols) {
            throw new Error("matrix must be " + rows + "\xD7" + cols + ", got " + input.length + "\xD7" + input[0].length);
          }
          for (let r = 0; r < rows; r++) {
            const row = input[r];
            for (let c = 0; c < cols; c++) a[r * cols + c] = +row[c] || 0;
          }
        } else {
          if (input.length !== n) throw new Error("flat matrix must have length " + n + ", got " + input.length);
          for (let i = 0; i < n; i++) a[i] = +input[i] || 0;
        }
        return a;
      }
      function interpolate3(a, rows, cols) {
        rows = rows || 25;
        cols = cols || 32;
        const R2 = rows * 2, C2 = cols * 2;
        const tmp = new Float64Array(R2 * C2);
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const v = a[r * cols + c];
            const vr = c + 1 < cols ? a[r * cols + c + 1] : 0;
            tmp[2 * r * C2 + 2 * c] = v;
            tmp[2 * r * C2 + 2 * c + 1] = (v + vr) / 2;
          }
        }
        for (let r = 0; r < rows; r++) {
          const i = 2 * r + 1;
          for (let j = 0; j < C2; j++) {
            const up = tmp[2 * r * C2 + j];
            const dn = r + 1 < rows ? tmp[(2 * r + 2) * C2 + j] : 0;
            tmp[i * C2 + j] = (up + dn) / 2;
          }
        }
        const b = new Float64Array(R2 * C2);
        for (let k = 0; k < b.length; k++) b[k] = Math.min(255, Math.floor(tmp[k]));
        return b;
      }
      function components(mask, rows, cols) {
        const lab = new Int32Array(rows * cols);
        const out = [];
        const stack = [];
        let id = 0;
        for (let s = 0; s < rows * cols; s++) {
          if (!mask[s] || lab[s]) continue;
          id++;
          const cells = [];
          lab[s] = id;
          stack.push(s);
          while (stack.length) {
            const p = stack.pop();
            cells.push(p);
            const pr = p / cols | 0, pc = p - pr * cols;
            for (let dr = -1; dr <= 1; dr++) {
              const rr = pr + dr;
              if (rr < 0 || rr >= rows) continue;
              for (let dc = -1; dc <= 1; dc++) {
                const cc = pc + dc;
                if (dr === 0 && dc === 0 || cc < 0 || cc >= cols) continue;
                const q = rr * cols + cc;
                if (mask[q] && !lab[q]) {
                  lab[q] = id;
                  stack.push(q);
                }
              }
            }
          }
          out.push(cells);
        }
        return out;
      }
      function residual(t, cfg) {
        const a = cfg.residualA, c2 = cfg.residualC * cfg.residualC;
        return a * t + (1 - a) * t * t * t / (t * t + c2);
      }
      function softLimit(u, cfg) {
        const au = Math.abs(u);
        if (au <= cfg.softKnee) return u;
        return Math.sign(u) * (cfg.softKnee + cfg.softWidth * (1 - Math.exp(-(au - cfg.softKnee) / cfg.softWidth)));
      }
      function smoothStep2(tau) {
        if (tau <= 0) return 0;
        if (tau >= 1) return 1;
        return 3 * tau * tau - 2 * tau * tau * tau;
      }
      class EndiBackrestAlgorithm2 {
        /**
         * @param {object} [options] 覆盖 DEFAULT_CONFIG 中的任意参数；options.calib 可替换整套标定参数
         */
        constructor(options) {
          options = options || {};
          this.calib = options.calib || CALIB2;
          const base = Object.assign({}, DEFAULT_CONFIG2);
          if (options.calib) {
            base.sigmaMm = this.calib.sigmaMm;
            base.platDiff = this.calib.plateau.diff;
            base.platRange = this.calib.plateau.range;
            base.fitFeatureP = this.calib.fit.p;
            base.fitC0 = this.calib.fit.c0;
            base.fitK = this.calib.fit.k;
            base.ovrMfitIn = this.calib.overrange.mfitIn;
            base.ovrMfitOut = this.calib.overrange.mfitOut;
            base.ovrPeakIn = this.calib.overrange.peakIn;
            base.ovrPeakOut = this.calib.overrange.peakOut;
            base.areaThreshold = this.calib.area.threshold;
            base.fpNMin = this.calib.area.nMin;
            base.fpNMax = this.calib.area.nMax;
            base.fpSpanMaxMm = this.calib.area.spanMaxMm;
            base.fpEccMax = this.calib.area.eccMax;
          }
          const cfgOverride = Object.assign({}, options);
          delete cfgOverride.calib;
          this.cfg = Object.assign(base, cfgOverride);
          this.reset();
        }
        reset() {
          this.tracks = [];
          this.nextTrackId = 1;
          this.lastTs = null;
          this.lastInput = null;
          this.lastResult = null;
        }
        // ------------------------------------------------------------------ 特征
        /** 物理接触区及特征：R、x = ln R、ADC 加权中心、连续拟合特征 F = Σa^p、峰值 */
        regionsOf(a) {
          const { rows, cols, regionThreshold, minRegionCells, adcFull } = this.cfg;
          const fp = this.cfg.fitFeatureP;
          const mask = new Uint8Array(rows * cols);
          for (let i = 0; i < a.length; i++) mask[i] = a[i] >= regionThreshold ? 1 : 0;
          const comps = components(mask, rows, cols);
          const regs = [];
          for (const cells of comps) {
            if (cells.length < minRegionCells) continue;
            let R = 0, S = 0, sr = 0, sc = 0, F = 0, peak = 0;
            for (const p of cells) {
              const v = a[p];
              const r = p / cols | 0, c = p - r * cols;
              const rv = -Math.log(1 - Math.min(v, 255) / adcFull);
              R += rv;
              S += v;
              sr += v * r;
              sc += v * c;
              F += fp == null ? rv : Math.pow(v, fp);
              if (v > peak) peak = v;
            }
            regs.push({ cells, n: cells.length, R, x: Math.log(R), r: sr / S, c: sc / S, sumAdc: S, F, lf: Math.log(F), peak });
          }
          return regs;
        }
        /** 插值矩阵上的 T 轮廓面积区及形状特征（跨度、偏心率均按 mm 坐标计算） */
        areaRegionsOf(b) {
          const { rows, cols, areaThreshold, pitchRowMm, pitchColMm } = this.cfg;
          const R2 = rows * 2, C2 = cols * 2;
          const mask = new Uint8Array(R2 * C2);
          for (let k = 0; k < b.length; k++) mask[k] = b[k] >= areaThreshold ? 1 : 0;
          const comps = components(mask, R2, C2);
          const hy = pitchRowMm / 2, hx = pitchColMm / 2;
          const out = [];
          for (const cells of comps) {
            let w = 0, si = 0, sj = 0, imin = 1e9, imax = -1, jmin = 1e9, jmax = -1;
            for (const p of cells) {
              const i = p / C2 | 0, j = p - i * C2, v = b[p];
              w += v;
              si += v * i;
              sj += v * j;
              if (i < imin) imin = i;
              if (i > imax) imax = i;
              if (j < jmin) jmin = j;
              if (j > jmax) jmax = j;
            }
            const ic = si / w, jc = sj / w;
            let cyy = 0, cxx = 0, cxy = 0;
            for (const p of cells) {
              const i = p / C2 | 0, j = p - i * C2, v = b[p];
              const dy = (i - ic) * hy, dx = (j - jc) * hx;
              cyy += v * dy * dy;
              cxx += v * dx * dx;
              cxy += v * dx * dy;
            }
            cyy /= w;
            cxx /= w;
            cxy /= w;
            const tr = cxx + cyy, det = cxx * cyy - cxy * cxy;
            const disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
            const mu1 = tr / 2 + disc, mu2 = tr / 2 - disc;
            const ecc = mu2 > 1e-9 ? Math.sqrt(mu1 / mu2) : Infinity;
            const spanR = (imax - imin + 1) * hy, spanC = (jmax - jmin + 1) * hx;
            const span = Math.max(spanR, spanC);
            const N = cells.length;
            const isFootprint = N >= this.cfg.fpNMin && N <= this.cfg.fpNMax && span <= this.cfg.fpSpanMaxMm && ecc <= this.cfg.fpEccMax;
            out.push({ cells, N, i: ic, j: jc, r: ic / 2, c: jc / 2, spanRowMm: spanR, spanColMm: spanC, spanMm: span, ecc, isFootprint });
          }
          return out;
        }
        distMm(r1, c1, r2, c2) {
          const dy = (r1 - r2) * this.cfg.pitchRowMm, dx = (c1 - c2) * this.cfg.pitchColMm;
          return Math.sqrt(dy * dy + dx * dx);
        }
        /** 位置锚点 ℓ1..ℓ5、档间增量 Δ1..Δmax、连续拟合增益 g(p) */
        positionModel(r, c) {
          const s2 = 2 * this.cfg.sigmaMm * this.cfg.sigmaMm;
          const l = [0, 0, 0, 0, 0, 0];
          let dmin = Infinity;
          for (const nd of this.calib.nodes) {
            const d = this.distMm(r, c, nd[0], nd[1]);
            if (d * d < dmin) dmin = d * d;
          }
          let ws = 0;
          for (const nd of this.calib.nodes) {
            const d = this.distMm(r, c, nd[0], nd[1]);
            const w = Math.exp(-(d * d - dmin) / s2);
            ws += w;
            for (let n = 1; n <= 5; n++) l[n] += w * nd[1 + n];
          }
          for (let n = 1; n <= 5; n++) l[n] /= ws;
          let gmin = Infinity;
          for (const gn of this.calib.fit.gains) {
            const d = this.distMm(r, c, gn[0], gn[1]);
            if (d * d < gmin) gmin = d * d;
          }
          let gw = 0, gs = 0;
          for (const gn of this.calib.fit.gains) {
            const d = this.distMm(r, c, gn[0], gn[1]);
            const w = Math.exp(-(d * d - gmin) / s2);
            gw += w;
            gs += w * gn[2];
          }
          const gain = gs / gw;
          const D = new Array(this.cfg.maxLevel + 1).fill(0);
          for (let n = 1; n <= 4; n++) D[n] = Math.max(1e-3, l[n + 1] - l[n]);
          for (let n = 5; n <= this.cfg.maxLevel; n++) D[n] = D[4] * Math.pow(this.cfg.decay, n - 4);
          D[0] = D[1];
          const C = new Array(this.cfg.maxLevel + 2).fill(0);
          for (let n = 1; n <= 5; n++) C[n] = l[n];
          for (let n = 5; n <= this.cfg.maxLevel; n++) C[n + 1] = C[n] + D[n];
          return { l, D, C, gain };
        }
        /** 连续锚点曲线 ℓ(n)：n ≤ 1 时 ℓ1 + ln n（与“低于 1 块按响应比例”一致），1–5 块线性插值，5 块以上按衰减增量 */
        levelCurve(pm, n) {
          if (n <= 1) return pm.C[1] + Math.log(Math.max(n, 1e-6));
          const maxL = this.cfg.maxLevel;
          const i = Math.min(Math.floor(n), maxL);
          return pm.C[i] + (n - i) * pm.D[i];
        }
        levelCurveInverse(pm, x) {
          if (x <= pm.C[1]) return Math.exp(x - pm.C[1]);
          const maxL = this.cfg.maxLevel;
          for (let i = 1; i <= maxL; i++) {
            if (x < pm.C[i + 1] || i === maxL) return i + (x - pm.C[i]) / pm.D[i];
          }
          return maxL;
        }
        /** 预测档位偏移 P[n] = 第 n 档相对基准 (L, A) 的预期 ln R 偏移（P[L] = 0）
         *  incrementModel = 'scaled'（默认）：由基准在锚点曲线上的等效载荷 nA 求灵敏度 s = nA / L，P[n] = ℓ(s·n) − ℓ(s·L)；
         *                   基准恰在锚点上时 s = 1，与“锚点档间增量”完全等价。
         *  incrementModel = 'anchor'：P[n] = ℓn − ℓL（框架原始做法）。 */
        predictedOffsets(pm, L, A) {
          const maxL = this.cfg.maxLevel;
          const P = new Array(maxL + 2).fill(0);
          if (this.cfg.incrementModel === "scaled") {
            const nA = this.levelCurveInverse(pm, A);
            const s = Math.min(this.cfg.scaleMax, Math.max(this.cfg.scaleMin, nA / L));
            const base = this.levelCurve(pm, s * L);
            for (let n = 1; n <= maxL + 1; n++) P[n] = this.levelCurve(pm, s * n) - base;
          } else {
            for (let n = 1; n <= maxL + 1; n++) P[n] = pm.C[n] - pm.C[L];
          }
          return P;
        }
        /** 有效期内的历史锚点（过期返回 undefined，改用预测增量） */
        histAt(tr, n) {
          const h = tr.hist[n];
          if (h === void 0) return void 0;
          if (tr.nowTs !== null && tr.histT[n] !== void 0 && tr.nowTs - tr.histT[n] > this.cfg.histMaxAgeMs) return void 0;
          return h;
        }
        /** 相对已确认基准 (L, A) 的连续档位 λ；useHist=false 时只用预测增量（续接判定） */
        lambdaRel(x, tr, pm, L, A, useHist) {
          const maxL = this.cfg.maxLevel;
          const P = this.predictedOffsets(pm, L, A);
          const E = new Array(maxL + 2).fill(0);
          E[L] = 0;
          for (let n = L + 1; n <= maxL; n++) {
            const h = useHist ? this.histAt(tr, n) : void 0;
            const pred = E[n - 1] + (P[n] - P[n - 1]);
            E[n] = h !== void 0 && h - A > E[n - 1] ? h - A : pred;
          }
          for (let n = L - 1; n >= 1; n--) {
            const h = useHist ? this.histAt(tr, n) : void 0;
            const pred = E[n + 1] - (P[n + 1] - P[n]);
            E[n] = h !== void 0 && h - A < E[n + 1] ? h - A : pred;
          }
          const d = x - A;
          if (d < E[1]) return Math.exp(d - E[1]);
          for (let n = 1; n < maxL; n++) {
            if (d < E[n + 1]) return n + (d - E[n]) / (E[n + 1] - E[n]);
          }
          return maxL + (d - E[maxL]) / (E[maxL] - E[maxL - 1]);
        }
        nearestLevel(x, pm) {
          let best = 1, bd = Infinity;
          for (let n = 1; n <= 5; n++) {
            const dd = Math.abs(x - pm.l[n]);
            if (dd < bd) {
              bd = dd;
              best = n;
            }
          }
          return best;
        }
        /** 首次确认前的绝对连续读数（块） */
        absoluteBlocks(x, pm) {
          const l = pm.l, D = pm.D;
          if (x <= l[1]) return Math.exp(x - l[1]);
          const n = this.nearestLevel(x, pm);
          const dlt = x > l[n] ? D[n] : D[n - 1];
          return Math.max(0, n + residual((x - l[n]) / dlt, this.cfg));
        }
        tentativeBlocks(x, tr, pm) {
          const Lp = tr.tent.L;
          const dlt = Math.min(pm.D[Lp], pm.D[Math.max(1, Lp - 1)]);
          return { blocks: Lp + residual((x - tr.tent.A) / dlt, this.cfg), t: (x - tr.tent.A) / dlt };
        }
        plateau(tr, t, windowMs, minSamples) {
          const s = tr.samples;
          if (!s.length) return null;
          let k = s.length - 1;
          while (k > 0 && s[k - 1].t >= t - windowMs) k--;
          if (k > 0) k--;
          const n = s.length - k;
          if (n < minSamples || t - s[k].t < windowMs) return null;
          let mn = Infinity, mx = -Infinity, sum = 0;
          for (let i = k; i < s.length; i++) {
            const v = s[i].xs;
            if (i > k && Math.abs(v - s[i - 1].xs) >= this.cfg.platDiff) return null;
            if (v < mn) mn = v;
            if (v > mx) mx = v;
            sum += v;
          }
          if (mx - mn >= this.cfg.platRange) return null;
          return sum / n;
        }
        // ------------------------------------------------------------------ 状态动作
        startSmooth(tr, t) {
          if (!tr.lastOut || tr.prevTs == null) return;
          tr.smooth = { m0: tr.lastOut.m, S0: tr.lastOut.S, t0: tr.prevTs };
        }
        commit(tr, newL, Anew, t) {
          const prevL = tr.L, prevA = tr.A;
          if (prevL === 0) {
            if (tr.firstLevel === null) tr.firstLevel = newL;
          } else if (newL > prevL) {
            tr.addCount += newL - prevL;
          }
          if (prevL > 0 && prevA !== null) {
            tr.hist[prevL] = prevA;
            tr.histT[prevL] = t;
          }
          tr.L = newL;
          tr.A = Anew;
          tr.hist[newL] = Anew;
          tr.histT[newL] = t;
          tr.lastCommit = prevL > 0 ? { t, prevL, prevA, newL, stepLn: Anew - prevA, dir: Math.sign(newL - prevL) } : null;
          tr.tent = null;
          tr.state = STATE2.CONF;
          tr.fuzzySince = null;
        }
        clearBase(tr) {
          tr.L = 0;
          tr.A = null;
          tr.hist = {};
          tr.histT = {};
          tr.tent = null;
          tr.lastCommit = null;
          tr.fuzzySince = null;
        }
        /** 标准砝码识别状态机（未冻结、砝码轮廓），返回块数读数 */
        runStateMachine(tr, x, t, pm) {
          const cfg = this.cfg;
          const confReading = () => tr.L + residual(this.lambdaRel(x, tr, pm, tr.L, tr.A, true) - tr.L, cfg);
          for (let guard = 0; guard < 4; guard++) {
            switch (tr.state) {
              case STATE2.FIRST: {
                const plat = this.plateau(tr, t, cfg.platWindowMs, cfg.platMinSamples);
                if (plat !== null && t - tr.contactSince >= cfg.firstMinContactMs && Math.exp(plat) >= cfg.lightTouchRatio * Math.exp(pm.l[1])) {
                  const n = this.nearestLevel(plat, pm);
                  tr.tent = { L: n, A: plat, since: t, isFirst: true, lastStable: plat };
                  tr.state = STATE2.TENT;
                  this.startSmooth(tr, t);
                  return this.tentativeBlocks(x, tr, pm).blocks;
                }
                return this.absoluteBlocks(x, pm);
              }
              case STATE2.TENT: {
                const tb = this.tentativeBlocks(x, tr, pm);
                if (Math.abs(tb.t) >= cfg.tentDeviation) {
                  if (tr.tent.isFirst) {
                    tr.tent = null;
                    tr.state = STATE2.FIRST;
                    continue;
                  }
                  if (t - tr.tent.since >= cfg.tentStableCommitMs) {
                    this.commit(tr, tr.tent.L, tr.tent.lastStable, t);
                  } else {
                    tr.tent = null;
                  }
                  tr.state = STATE2.JUDGE;
                  tr.fuzzySince = null;
                  continue;
                }
                const plat = this.plateau(tr, t, cfg.platWindowMs, cfg.platMinSamples);
                if (plat !== null) tr.tent.lastStable = plat;
                const need = tr.tent.isFirst ? cfg.commitFirstMs : cfg.commitChangeMs;
                if (plat !== null && t - tr.tent.since >= need) {
                  this.commit(tr, tr.tent.L, plat, t);
                  this.startSmooth(tr, t);
                  return confReading();
                }
                return tb.blocks;
              }
              case STATE2.CONF: {
                const lam = this.lambdaRel(x, tr, pm, tr.L, tr.A, true);
                if (Math.abs(lam - tr.L) >= cfg.enterJudge) {
                  tr.state = STATE2.JUDGE;
                  tr.fuzzySince = null;
                  tr.offset = null;
                  if (tr.lastCommit && t - tr.lastCommit.t > cfg.contWindowMs) tr.lastCommit = null;
                  continue;
                }
                const plat = this.plateau(tr, t, cfg.platWindowMs, cfg.platMinSamples);
                if (plat !== null && Math.abs(this.lambdaRel(plat, tr, pm, tr.L, tr.A, true) - tr.L) < cfg.creepBand) {
                  const dt = tr.prevTs != null ? t - tr.prevTs : 0;
                  tr.A += (plat - tr.A) * Math.min(1, dt / cfg.creepTauMs);
                }
                return tr.L + residual(lam - tr.L, cfg);
              }
              case STATE2.JUDGE: {
                const lam = this.lambdaRel(x, tr, pm, tr.L, tr.A, true);
                const u = residual(lam - tr.L, cfg);
                const noLimit = tr.L >= cfg.maxStdLevel && lam > tr.L || tr.fuzzySince !== null;
                let blocks = Math.max(0, tr.L + (noLimit ? u : softLimit(u, cfg)));
                let plat = this.plateau(tr, t, cfg.platWindowMs, cfg.platMinSamples);
                let fast = false;
                if (plat === null) {
                  plat = this.plateau(tr, t, cfg.fastWindowMs, cfg.fastMinSamples);
                  fast = plat !== null;
                }
                if (plat === null) return blocks;
                let lp = this.lambdaRel(plat, tr, pm, tr.L, tr.A, true);
                let k = Math.round(lp - tr.L);
                let dev = Math.abs(lp - tr.L - k);
                const lc = tr.lastCommit;
                if (lc && lc.reanchor && t - lc.t <= cfg.contWindowMs && Math.abs(lp - tr.L) >= cfg.enterJudge) {
                  const dirNow = Math.sign(plat - tr.A);
                  if (dirNow === lc.dir) {
                    const lam2 = this.lambdaRel(plat, tr, pm, lc.prevL, lc.prevA, false);
                    const k2 = Math.round(lam2 - lc.prevL);
                    if (k2 !== 0 && Math.abs(lam2 - lc.prevL - k2) <= cfg.clearTol) {
                      tr.A = lc.prevA;
                      tr.hist[tr.L] = lc.prevA;
                      tr.histT[tr.L] = t;
                      tr.lastCommit = null;
                      lp = lam2;
                      k = k2;
                      dev = Math.abs(lam2 - lc.prevL - k2);
                    }
                  }
                } else if (lc && t - lc.t <= cfg.contWindowMs && Math.sign(plat - tr.A) === -lc.dir && Math.abs(lp - tr.L) >= cfg.enterJudge) {
                  const lam2 = this.lambdaRel(plat, tr, pm, lc.prevL, lc.prevA, false);
                  if (Math.abs(lam2 - lc.prevL) <= cfg.clearTol) {
                    if (lc.newL > lc.prevL) tr.addCount -= lc.newL - lc.prevL;
                    delete tr.hist[lc.newL];
                    delete tr.histT[lc.newL];
                    tr.L = lc.prevL;
                    tr.A = plat;
                    tr.hist[tr.L] = plat;
                    tr.histT[tr.L] = t;
                    tr.lastCommit = null;
                    tr.state = STATE2.CONF;
                    tr.fuzzySince = null;
                    tr.offset = null;
                    this.startSmooth(tr, t);
                    return confReading();
                  }
                } else if (lc && t - lc.t <= cfg.contWindowMs && Math.abs(lp - tr.L) >= cfg.enterJudge) {
                  const pred = Math.abs(this.predictedOffsets(pm, lc.prevL, lc.prevA)[lc.newL]);
                  const dirNow = Math.sign(plat - tr.A);
                  if (Math.abs(lc.stepLn) < cfg.contStepRatio * pred && dirNow === lc.dir) {
                    const lam2 = this.lambdaRel(plat, tr, pm, lc.prevL, lc.prevA, false);
                    const k2 = Math.round(lam2 - lc.prevL);
                    if (lc.prevL + k2 === tr.L && Math.abs(lam2 - lc.prevL - k2) <= cfg.clearTol) {
                      tr.A = plat;
                      tr.hist[tr.L] = plat;
                      tr.histT[tr.L] = t;
                      tr.lastCommit = null;
                      tr.state = STATE2.CONF;
                      tr.fuzzySince = null;
                      this.startSmooth(tr, t);
                      return confReading();
                    }
                  }
                }
                if (k === 0) {
                  if (fast) return blocks;
                  if (Math.abs(lp - tr.L) < cfg.enterJudge || !(cfg.reanchorMs > 0)) {
                    tr.state = STATE2.CONF;
                    tr.fuzzySince = null;
                    tr.offset = null;
                    this.startSmooth(tr, t);
                    return confReading();
                  }
                  const of = tr.offset;
                  if (!of || Math.max(of.max, lp) - Math.min(of.min, lp) >= cfg.reanchorRange) {
                    tr.offset = { since: t, min: lp, max: lp };
                  } else {
                    of.min = Math.min(of.min, lp);
                    of.max = Math.max(of.max, lp);
                    if (t - of.since >= cfg.reanchorMs) {
                      tr.lastCommit = { t, prevL: tr.L, prevA: tr.A, newL: tr.L, stepLn: plat - tr.A, dir: Math.sign(plat - tr.A), reanchor: true };
                      tr.A = plat;
                      tr.hist[tr.L] = plat;
                      tr.histT[tr.L] = t;
                      tr.offset = null;
                      tr.state = STATE2.CONF;
                      tr.fuzzySince = null;
                      this.startSmooth(tr, t);
                      return confReading();
                    }
                  }
                  return blocks;
                }
                tr.offset = null;
                let clear = fast ? dev <= cfg.fastTol : dev <= cfg.clearTol;
                if (!clear && !fast) {
                  if (tr.fuzzySince === null) tr.fuzzySince = t;
                  if (t - tr.fuzzySince >= cfg.fuzzyAbsMs) {
                    const kAbs = this.nearestLevel(plat, pm) - tr.L;
                    const lo = Math.floor(lp - tr.L);
                    if (kAbs === lo || kAbs === lo + 1) {
                      k = kAbs;
                      clear = true;
                    }
                  }
                  if (t - tr.fuzzySince >= cfg.fuzzyTimeoutMs) clear = true;
                }
                if (!clear) return blocks;
                if (tr.L + k < 1) {
                  this.clearBase(tr);
                  tr.state = STATE2.FIRST;
                  tr.contactSince = t;
                  continue;
                }
                tr.tent = { L: tr.L + k, A: plat, since: t, isFirst: false, lastStable: plat };
                tr.state = STATE2.TENT;
                tr.fuzzySince = null;
                this.startSmooth(tr, t);
                return this.tentativeBlocks(x, tr, pm).blocks;
              }
              default:
                return 0;
            }
          }
          return tr.L;
        }
        // ------------------------------------------------------------------ 每帧处理
        /**
         * 处理一帧
         * @param {number[][]|ArrayLike<number>} matrix 25×32 物理 ADC 矩阵
         * @param {number} [timestampMs] 时间戳（ms）；必须显式传入
         */
        process(matrix, timestampMs) {
          const cfg = this.cfg;
          const t = timestampMs == null ? (() => { throw new TypeError("timestampMs 必须显式传入"); })() : +timestampMs;
          const a = toFlat(matrix, cfg.rows, cfg.cols);
          if (this.lastTs !== null) {
            if (t === this.lastTs && this.lastInput && sameArray(a, this.lastInput)) return this.lastResult;
            if (t < this.lastTs) this.reset();
          }
          const regs = this.regionsOf(a);
          const b = interpolate3(a, cfg.rows, cfg.cols);
          const areas = this.areaRegionsOf(b);
          for (const reg of regs) {
            reg.areas = [];
          }
          for (const ar of areas) {
            let best = null, bd = Infinity;
            for (const reg of regs) {
              const dd = this.distMm(ar.r, ar.c, reg.r, reg.c);
              if (dd < bd) {
                bd = dd;
                best = reg;
              }
            }
            if (best) best.areas.push(ar);
          }
          for (const reg of regs) {
            reg.contourCells = reg.areas.reduce((s, ar) => s + ar.N, 0);
            reg.contourAreaCm2 = reg.contourCells * cfg.interpCellAreaCm2;
            reg.footprint = reg.areas.length === 1 && reg.areas[0].isFootprint;
          }
          regs.sort((p, q) => q.R - p.R);
          const matched = /* @__PURE__ */ new Set();
          for (const reg of regs) {
            let best = null, bd = Infinity;
            for (const tr of this.tracks) {
              if (matched.has(tr)) continue;
              const dd = this.distMm(reg.r, reg.c, tr.r, tr.c);
              if (dd <= cfg.matchDistMm && dd < bd) {
                bd = dd;
                best = tr;
              }
            }
            if (!best) {
              best = this.newTrack(t);
              this.tracks.push(best);
            }
            matched.add(best);
            reg.track = best;
          }
          for (const tr of this.tracks) if (!matched.has(tr)) tr.missed++;
          this.tracks = this.tracks.filter((tr) => matched.has(tr) || tr.missed < cfg.trackLostFrames);
          const outRegions = [];
          for (const reg of regs) outRegions.push(this.processRegion(reg, reg.track, t));
          let totalM = 0, totalF = 0, totalS = 0, pSum = 0, anyZero = false;
          for (const o of outRegions) {
            totalM += o.massKg;
            totalF += o.forceN;
            totalS += o.areaCm2;
            if (o.areaCm2 > 0) pSum += o.pressureKPa;
            else anyZero = true;
          }
          const result = {
            timestamp: t,
            totalMassKg: totalM,
            totalForceN: totalF,
            totalAreaCm2: totalS,
            avgPressureKPa: outRegions.length && !anyZero ? pSum / outRegions.length : null,
            regionCount: outRegions.length,
            regions: outRegions
          };
          if (cfg.returnInterpolated) result.interpolated = b;
          if (cfg.returnAreaMap) {
            const map = new Float64Array(b.length);
            for (const reg of regs) {
              const o = outRegions.find((q) => q.trackId === reg.track.id);
              if (!o || reg.contourCells === 0) continue;
              const per = o.areaCm2 / reg.contourCells;
              for (const ar of reg.areas) for (const p of ar.cells) map[p] = per;
            }
            result.areaMap = map;
          }
          this.lastTs = t;
          this.lastInput = a;
          this.lastResult = result;
          return result;
        }
        newTrack(t) {
          return {
            id: this.nextTrackId++,
            createdTs: t,
            contactSince: t,
            prevTs: null,
            r: 0,
            c: 0,
            missed: 0,
            samples: [],
            state: STATE2.FIRST,
            L: 0,
            A: null,
            hist: {},
            histT: {},
            nowTs: null,
            addCount: 0,
            firstLevel: null,
            tent: null,
            lastCommit: null,
            fuzzySince: null,
            offset: null,
            frozen: false,
            ovr: false,
            ovrExitSince: null,
            exitSince: null,
            mfitHighSince: null,
            smooth: null,
            lastOut: null,
            mode: "standard"
          };
        }
        processRegion(reg, tr, t) {
          const cfg = this.cfg;
          tr.nowTs = t;
          tr.missed = 0;
          tr.r = reg.r;
          tr.c = reg.c;
          tr.samples.push({ t, xr: reg.x, xs: reg.x, fr: reg.lf });
          while (tr.samples.length && tr.samples[0].t < t - cfg.sampleKeepMs) tr.samples.shift();
          let sm = 0, sf = 0, sn = 0;
          for (let i = tr.samples.length - 1; i >= 0 && tr.samples[i].t >= t - cfg.smoothWindowMs; i--) {
            sm += tr.samples[i].xr;
            sf += tr.samples[i].fr;
            sn++;
          }
          const x = sm / sn;
          const lfs = sf / sn;
          tr.samples[tr.samples.length - 1].xs = x;
          const pm = this.positionModel(reg.r, reg.c);
          const mFit = Math.exp(cfg.fitC0 + cfg.fitK * (Math.log(pm.gain) + lfs));
          const hasBase = tr.L > 0;
          const lam = hasBase ? this.lambdaRel(x, tr, pm, tr.L, tr.A, true) : null;
          const forceIn = cfg.ovrForceInN;
          if (!reg.footprint && hasBase) {
            tr.frozen = true;
            tr.exitSince = null;
          }
          const noBaseNonFp = !reg.footprint && !hasBase;
          if (noBaseNonFp && cfg.g * mFit > forceIn) {
            tr.frozen = true;
            tr.exitSince = null;
          }
          if (tr.frozen) {
            tr.tent = null;
            if (tr.state === STATE2.TENT) tr.state = tr.L > 0 ? STATE2.JUDGE : STATE2.FIRST;
          }
          if (tr.frozen && !hasBase) {
            tr.tent = null;
            tr.hist = {};
            tr.histT = {};
            tr.lastCommit = null;
          }
          if (tr.frozen && reg.footprint) {
            const mz = hasBase ? cfg.blockMassKg * Math.max(0, lam) : mFit;
            const exitOk = cfg.g * mz <= forceIn;
            if (exitOk) {
              if (tr.exitSince === null) tr.exitSince = t;
              if (t - tr.exitSince >= cfg.ovrHoldMs) {
                tr.frozen = false;
                tr.exitSince = null;
                tr.tent = null;
                tr.fuzzySince = null;
                if (hasBase) {
                  tr.state = STATE2.JUDGE;
                } else {
                  tr.state = STATE2.FIRST;
                }
                this.startSmooth(tr, t);
              }
            } else {
              tr.exitSince = null;
            }
          }
          let blocks = null, m;
          if (!tr.frozen && noBaseNonFp) {
            tr.tent = null;
            tr.fuzzySince = null;
            tr.state = STATE2.FIRST;
          } else if (!tr.frozen) {
            blocks = this.runStateMachine(tr, x, t, pm);
            if (cfg.g * cfg.blockMassKg * blocks > forceIn || tr.L > cfg.maxStdLevel || tr.tent && tr.tent.L > cfg.maxStdLevel) {
              tr.frozen = true;
              tr.tent = null;
              tr.exitSince = null;
              if (tr.state === STATE2.TENT) tr.state = STATE2.JUDGE;
            }
          }
          let mode;
          if (tr.frozen) {
            const lamNow = tr.L > 0 ? this.lambdaRel(x, tr, pm, tr.L, tr.A, true) : null;
            m = tr.L > 0 ? cfg.blockMassKg * Math.max(0, lamNow) : mFit;
          } else if (noBaseNonFp) {
            m = mFit;
          } else {
            m = cfg.blockMassKg * blocks;
          }
          if (cfg.g * m > forceIn && cfg.g * mFit > forceIn) {
            tr.ovr = true;
            tr.ovrExitSince = null;
          } else if (tr.ovr) {
            if (tr.ovrExitSince === null || tr.ovrExitSince === void 0) tr.ovrExitSince = t;
            if (t - tr.ovrExitSince >= cfg.ovrHoldMs) {
              tr.ovr = false;
              tr.ovrExitSince = null;
            }
          }
          if (tr.ovr) {
            mode = "overrange";
            m *= cfg.overrangeMultiplier;
          } else if (tr.frozen || noBaseNonFp) {
            mode = "estimate";
          } else {
            mode = "standard";
          }
          let S;
          if (mode === "standard") S = reg.contourCells > 0 ? cfg.baseAreaCm2 : 0;
          else if (mode === "overrange") S = reg.contourAreaCm2 * cfg.overrangeAreaMultiplier;
          else S = reg.contourAreaCm2;
          if (tr.lastOut && tr.lastOut.mode !== mode) this.startSmooth(tr, t);
          if (tr.smooth) {
            const tau = (t - tr.smooth.t0) / cfg.smoothMs;
            if (tau >= 1) tr.smooth = null;
            else {
              const s = smoothStep2(tau);
              m = tr.smooth.m0 + (m - tr.smooth.m0) * s;
              S = tr.smooth.S0 + (S - tr.smooth.S0) * s;
            }
          }
          tr.lastOut = { m, S, mode };
          tr.prevTs = t;
          const F = cfg.g * m;
          const P = S > 0 ? 10 * F / S : null;
          return {
            trackId: tr.id,
            state: tr.frozen ? tr.ovr ? STATE2.OVR : STATE2.EST : noBaseNonFp ? STATE2.EST : tr.state,
            mode,
            blocks: tr.L,
            // 已确认标准档块数（冻结期间保持）
            tentativeBlocks: tr.tent ? tr.tent.L : null,
            // 暂定档
            firstLevel: tr.firstLevel,
            // 首次接触定档
            addCount: tr.addCount,
            // 累计加块次数
            massKg: m,
            forceN: F,
            areaCm2: S,
            pressureKPa: P,
            contourAreaCm2: reg.contourAreaCm2,
            // T 轮廓面积
            footprint: reg.footprint,
            // 是否标准砝码轮廓
            center: { r: reg.r, c: reg.c },
            // 物理格坐标（行, 列）
            lnR: x,
            massFitKg: mFit,
            // 连续拟合质量
            peak: reg.peak,
            cells: reg.n
          };
        }
      }
      function sameArray(p, q) {
        if (p.length !== q.length) return false;
        for (let i = 0; i < p.length; i++) if (p[i] !== q[i]) return false;
        return true;
      }
      function estimateMassFit2(matrix, options) {
        const algo = new EndiBackrestAlgorithm2(options);
        const a = toFlat(matrix, algo.cfg.rows, algo.cfg.cols);
        return algo.regionsOf(a).map((reg) => {
          const pm = algo.positionModel(reg.r, reg.c);
          return { center: { r: reg.r, c: reg.c }, massFitKg: Math.exp(algo.cfg.fitC0 + algo.cfg.fitK * (Math.log(pm.gain) + reg.lf)) };
        });
      }
      return {
        EndiBackrestAlgorithm: EndiBackrestAlgorithm2,
        CALIB: CALIB2,
        DEFAULT_CONFIG: DEFAULT_CONFIG2,
        STATE: STATE2,
        interpolate: interpolate3,
        estimateMassFit: estimateMassFit2,
        residual: (t) => residual(t, DEFAULT_CONFIG2)
      };
    })();
    var EndiBackrestAlgorithm = EndiBackrest.EndiBackrestAlgorithm;
    var CALIB = EndiBackrest.CALIB;
    var DEFAULT_CONFIG = EndiBackrest.DEFAULT_CONFIG;
    var STATE = EndiBackrest.STATE;
    var interpolate2 = EndiBackrest.interpolate;
    var estimateMassFit = EndiBackrest.estimateMassFit;
    var ENDI_BACKREST_CORE_VERSION = EndiBackrest.CALIB.version;
    var ENDI_BACKREST_CORE_SOURCE_SHA256 = "a2df8072820a6caba2d3d150e106ff429463cdbeb862b8ad7043b191a1acfe5e";

    // lib/endiBackrestForce.ts
    var ENDI_BACKREST_ALGORITHM_ID = "endi-backrest-anchor-state-machine-g9p8";
    var ENDI_BACKREST_ALGORITHM_LABEL = "\u6069\u8FEA\u9760\u80CC\u5B9E\u6D4B\u62DF\u5408\u7B97\u6CD5\uFF08\u4F4D\u7F6E\u951A\u70B9\uFF0B\u76F8\u5BF9\u6863\u4F4D\u72B6\u6001\u673A\uFF0Cg=9.8\uFF09";
    var ENDI_BACKREST_MODEL_VERSION = `endi-backrest-${ENDI_BACKREST_CORE_VERSION}-fit-${CALIB.fittedOn.replace(/-/g, "")}`;
    var ENDI_BACKREST_PRESSURE_VERSION = "endi-backrest-region-pressure-mean-g9p8-20261109";
    var ENDI_BACKREST_CONTACT_VERSION = "endi-backrest-orientation-transpose-adc1-8conn-min3-20261109";
    var ENDI_BACKREST_AREA_VERSION = "endi-backrest-t39-contour-count-20261109";
    var ENDI_BACKREST_CALCULATION_MODE = "endi_backrest_fitted";
    var NATIVE_ROWS = 32;
    var NATIVE_COLS = 25;
    var ALG_ROWS = DEFAULT_CONFIG.rows;
    var ALG_COLS = DEFAULT_CONFIG.cols;
    var ENDI_BACKREST_GRAVITY = DEFAULT_CONFIG.g;
    var ENDI_BACKREST_UNIT_MASS_KG = DEFAULT_CONFIG.blockMassKg;
    var ENDI_BACKREST_BASE_AREA_CM2 = DEFAULT_CONFIG.baseAreaCm2;
    var ENDI_BACKREST_AREA_THRESHOLD_ADC = DEFAULT_CONFIG.areaThreshold;
    var ENDI_BACKREST_CELL_AREA_CM2 = DEFAULT_CONFIG.interpCellAreaCm2;
    var ENDI_BACKREST_OVER_RANGE_GAIN = DEFAULT_CONFIG.overrangeMultiplier;
    var ENDI_BACKREST_OVER_RANGE_AREA_GAIN = DEFAULT_CONFIG.overrangeAreaMultiplier;
    var ENDI_BACKREST_OVER_RANGE_FORCE_THRESHOLD_N = DEFAULT_CONFIG.ovrForceInN;
    var ENDI_BACKREST_POSITION_COUNT = CALIB.nodeIds.length;
    var MODE_LABEL = {
      standard: "\u6807\u51C6\u6863",
      estimate: "\u4F30\u7B97",
      overrange: "\u8D85\u91CF\u7A0B\u4F30\u7B97"
    };
    var STATE_LABEL = {
      first_contact: "\u9996\u6B21\u63A5\u89E6\u786E\u8BA4\u4E2D",
      tentative: "\u6682\u5B9A\u6863",
      confirmed: "\u5DF2\u786E\u8BA4",
      judging: "\u52A0\u51CF\u5757\u5224\u65AD\u4E2D",
      estimate: "\u4F30\u7B97",
      overrange: "\u8D85\u91CF\u7A0B\u4F30\u7B97"
    };
    function isAdcMatrix2(m, rows, cols) {
      if (!Array.isArray(m) || m.length !== rows) return false;
      for (const row of m) {
        if (!Array.isArray(row) || row.length !== cols) return false;
        for (const v of row) if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 255) return false;
      }
      return true;
    }
    function endiBackrestNativeToAlgorithm(native) {
      const out = new Array(ALG_ROWS);
      for (let r = 0; r < ALG_ROWS; r++) {
        const row = new Array(ALG_COLS);
        for (let c = 0; c < ALG_COLS; c++) row[c] = native[c][r];
        out[r] = row;
      }
      return out;
    }
    function regionLabel2(r) {
      if (r.mode === "\u6807\u51C6\u6863") {
        return r.level > 0 ? `${r.level}\u5757\uFF08${(r.level * ENDI_BACKREST_UNIT_MASS_KG).toFixed(3)} kg\uFF0C${r.state}\uFF09` : `\u6807\u51C6\u6863\uFF08${r.state}\uFF09`;
      }
      return `${r.mode} ${r.massKg.toFixed(2)} kg`;
    }
    var SCOPE_NOTE2 = "\u6069\u8FEA\u9760\u80CC\u5B9E\u6D4B\u62DF\u5408\u7B97\u6CD5\uFF1A\u672A\u8865\u507F\u539F\u59CB\u7269\u7406ADC\uFF08\u539F\u751F32\xD725\uFF09\u8F6C\u7F6E\u4E3A25\xD732\u8FDB\u5165\u7B97\u6CD5\u65B9\u5411\uFF1B\u63A5\u89E6\u533A=ADC\u22651\u516B\u90BB\u57DF\u8FDE\u901A\uFF08\u22653\u683C\uFF09\uFF0C\u54CD\u5E94\u91CFR=\u03A3\u2212ln(1\u2212ADC/256)\u53D6120ms\u65F6\u95F4\u5E73\u5747\uFF0C\u630944\u4E2A\u4F4D\u7F6E\u951A\u70B9\uFF08\u03C3=35mm\uFF09\u4E0E\u76F8\u5BF9\u6863\u4F4D\u72B6\u6001\u673A\u8BC6\u522B\u6807\u51C6\u781D\u7801\u5757\u6570\uFF08\u6BCF\u57571.625kg\uFF09\uFF0C\u975E\u781D\u7801\u8F6E\u5ED3\u6309\u8FDE\u7EED\u62DF\u5408m=e^c0\xD7(g\xB7\u03A3ADC\xB2)^k\u4F30\u7B97\uFF0C\u57FA\u51C6\u4F30\u7B97\u529B\u4E0E\u8FDE\u7EED\u62DF\u5408\u4F30\u7B97\u529B\u5747>90N\uFF08\u8D85\u8FC75\u5757\uFF0CV2.7.103\uFF09\u6309\u8D85\u91CF\u7A0B\u4F30\u7B97\u538B\u529B\xD72\u3001\u9762\u79EF\xD72\uFF08V2.7.108\uFF0C\u533A\u538B\u5F3A=2F/2S=F/S\uFF1B\u56DE\u843D\u226490N\u6301\u7EED500ms\u53D6\u6D88\uFF09\uFF1BF=9.8m\u3002\u9762\u79EF=50\xD764\u63D2\u503C\u77E9\u9635T39\u8F6E\u5ED3\uFF1A\u6807\u51C6\u6863\u6BCF\u533A\u53D6\u781D\u7801\u5E95\u976263.62cm\xB2\uFF0C\u4F30\u7B97\u6309\u8F6E\u5ED3\u683C\u6570\xD71.30cm\xB2\uFF0C\u8D85\u91CF\u7A0B\u4F30\u7B97\u6309\u8F6E\u5ED3\u683C\u6570\xD71.30cm\xB2\xD72\uFF1B\u5404\u533AF\u2C7C\u53D62\u4F4D\u5C0F\u6570\uFF0CP\u2C7C=F\u2C7C/S\u2C7C\uFF08N/cm\xB2\uFF0C3\u4F4D\u5C0F\u6570\uFF0C\u5185\u90E8\u5B58kPa=10F\u2C7C/S\u2C7C\uFF09\uFF0C\u603B\u529B=\u03A3F\u2C7C\u3002\u9010\u683C\u538B\u5F3A P\u1D62=P\u533A\xD7ADC\u1D62/mean(ADC\u533A)\uFF08ADC\u53D6\u70ED\u529B\u56FE\u663E\u793A\u503C\uFF0C\u63090.001N/cm\xB2\u4FDD\u548C\u53D6\u6574\uFF0C\u533A\u5185\u683C\u5B50\u5E73\u5747=P\u533A\uFF09\uFF0C\u5E73\u5747\u538B\u5F3A=\u5168\u90E8\u538B\u5F3A\u683C\u5B50\u7684\u5E73\u5747\u503C\uFF0C\u6700\u5927\u538B\u5F3A=MAX(P\u1D62)\uFF0C\u89C1 pointPressure\u3002";
    function toForceFrame2(out, algInput) {
      let rawAdcSum = 0;
      for (const row of algInput) for (const v of row) rawAdcSum += v;
      const adcSums = out.regions.map((r) => regionAdcSum(algInput, r));
      const regions = out.regions.map((r, i) => ({
        track: r.trackId,
        mode: MODE_LABEL[r.mode],
        state: STATE_LABEL[r.state],
        level: r.blocks,
        tentativeLevel: r.tentativeBlocks,
        addCount: r.addCount,
        massKg: r.massKg,
        forceN: r.forceN,
        areaCm2: r.areaCm2,
        pressureKPa: r.pressureKPa,
        footprint: r.footprint,
        contourAreaCm2: r.contourAreaCm2,
        fitMassKg: r.massFitKg,
        peakAdc: r.peak,
        overRange: r.mode === "overrange",
        center: [r.center.r, r.center.c],
        adcSum: adcSums[i],
        cells: r.cells
      }));
      const noContact = regions.length === 0;
      const regionF = regions.map((r) => roundForceN(r.forceN));
      const regionS = regions.map((r) => roundAreaCm2(r.areaCm2));
      const regionP = regions.map((r, i) => r.pressureKPa === null ? null : pressureKPaFromForceArea(regionF[i], regionS[i]));
      const totalF = roundForceN(regionF.reduce((s, v) => s + v, 0));
      const totalS = roundAreaCm2(out.totalAreaCm2);
      const complete = !noContact && regionP.every((p) => p !== null);
      const arithmeticMeanP = complete ? roundPressureKPa(regionP.reduce((s, p) => s + p, 0) / regionP.length) : null;
      const contactPressure = {
        version: ENDI_BACKREST_PRESSURE_VERSION,
        method: "endi_region_force_over_region_area_then_arithmetic_mean",
        status: noContact ? "no_contact" : complete ? "estimated" : "incomplete",
        scope: "complete_frame",
        independentlyValidated: false,
        totalForceN: totalF,
        areaCm2: totalS,
        rawAdcSum,
        assignedRawAdcSum: adcSums.reduce((s, v) => s + v, 0),
        regions: regions.map((r, i) => ({
          index: i,
          center: r.center,
          rawAdcSum: r.adcSum,
          forceShare: totalF > 0 ? regionF[i] / totalF : 0,
          estimatedForceN: regionF[i],
          areaCm2: regionS[i],
          estimatedPressureKPa: regionP[i]
        })),
        // 各区算术平均；接入逐格压强后（attachEndiPointPressure）改为全部压强格子的平均值。
        averagePressureKPa: arithmeticMeanP,
        globalAreaMeanPressureKPa: totalS > 0 ? pressureKPaFromForceArea(totalF, totalS) : null
      };
      const anyOver = regions.some((r) => r.overRange);
      const anyEstimate = regions.some((r) => r.mode !== "\u6807\u51C6\u6863");
      const diagnostics = {
        version: ENDI_BACKREST_MODEL_VERSION,
        coreVersion: ENDI_BACKREST_CORE_VERSION,
        coreSourceSha256: ENDI_BACKREST_CORE_SOURCE_SHA256,
        gravityMS2: ENDI_BACKREST_GRAVITY,
        unitMassKg: ENDI_BACKREST_UNIT_MASS_KG,
        baseAreaCm2: ENDI_BACKREST_BASE_AREA_CM2,
        areaThresholdAdc: ENDI_BACKREST_AREA_THRESHOLD_ADC,
        cellAreaCm2: ENDI_BACKREST_CELL_AREA_CM2,
        inputOrientation: "native-transposed",
        massKg: out.totalMassKg,
        regions
      };
      return {
        algorithmId: ENDI_BACKREST_ALGORITHM_ID,
        algorithmLabel: ENDI_BACKREST_ALGORITHM_LABEL,
        modelVersion: ENDI_BACKREST_MODEL_VERSION,
        status: noContact ? "no_contact" : anyOver ? "over_range_estimate" : anyEstimate ? "estimated" : "standard_recognized",
        forceN: totalF,
        averagePressureKPa: arithmeticMeanP,
        areaCm2: totalS,
        contactPressure,
        seedCount: regions.length,
        regionForcesN: regionF,
        forceAggregation: "regional_sum",
        regionCenters: regions.map((r) => r.center),
        contactDetectionVersion: ENDI_BACKREST_CONTACT_VERSION,
        forceEstimateComplete: true,
        calibratedSeedCount: regions.length,
        detectedContactCount: regions.length,
        detectedContactCenters: regions.map((r) => r.center),
        inputMode: "native-uncompensated-physical-adc-32x25-transposed-25x32",
        accepted: false,
        independentlyValidated: false,
        forceMeaning: ENDI_BACKREST_CALCULATION_MODE,
        calculationMode: ENDI_BACKREST_CALCULATION_MODE,
        loadLabel: noContact ? "\u65E0\u63A5\u89E6" : regions.map(regionLabel2).join("\uFF1B"),
        scopeNote: SCOPE_NOTE2,
        endiBackrest: diagnostics
      };
    }
    function regionAdcSum(a, region) {
      let best = 0, bd = Infinity;
      for (const c of componentSums(a)) {
        const d = Math.hypot(c.r - region.center.r, c.c - region.center.c);
        if (d < bd) {
          bd = d;
          best = c.sum;
        }
      }
      return bd < 0.01 ? best : 0;
    }
    var componentCache = /* @__PURE__ */ new WeakMap();
    function componentSums(a) {
      const hit = componentCache.get(a);
      if (hit) return hit;
      const R = a.length, C = a[0].length;
      const lab = new Int32Array(R * C);
      const out = [];
      const stack = [];
      let id = 0;
      for (let s = 0; s < R * C; s++) {
        const sr = s / C | 0, sc = s - sr * C;
        if (a[sr][sc] < 1 || lab[s]) continue;
        id++;
        lab[s] = id;
        stack.push(s);
        let n = 0, sum = 0, wr = 0, wc = 0;
        while (stack.length) {
          const p = stack.pop();
          const pr = p / C | 0, pc = p - pr * C, v = a[pr][pc];
          n++;
          sum += v;
          wr += v * pr;
          wc += v * pc;
          for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
            const rr = pr + dr, cc = pc + dc;
            if (dr === 0 && dc === 0 || rr < 0 || rr >= R || cc < 0 || cc >= C) continue;
            const q = rr * C + cc;
            if (a[rr][cc] >= 1 && !lab[q]) {
              lab[q] = id;
              stack.push(q);
            }
          }
        }
        if (n >= 3) out.push({ r: wr / sum, c: wc / sum, sum });
      }
      componentCache.set(a, out);
      return out;
    }
    var live2 = null;
    function calculateEndiBackrestForce(native, context) {
      if (!isAdcMatrix2(native, NATIVE_ROWS, NATIVE_COLS)) return null;
      const input = endiBackrestNativeToAlgorithm(native);
      const isLive = !!context && !context.static && typeof context.streamId === "string" && Number.isFinite(context.timestampMs);
      if (!isLive) {
        const out2 = new EndiBackrestAlgorithm().process(input, 0);
        return toForceFrame2(out2, input);
      }
      if (!live2 || live2.streamId !== context.streamId) {
        live2 = { streamId: context.streamId, alg: new EndiBackrestAlgorithm(), lastRawT: null, lastT: null, results: /* @__PURE__ */ new WeakMap() };
      }
      const cached = live2.results.get(native);
      if (cached) return cached;
      const rawT = context.timestampMs;
      let t = rawT;
      if (live2.lastRawT !== null && live2.lastT !== null && rawT >= live2.lastRawT) t = Math.max(rawT, live2.lastT + 1e-3);
      const out = live2.alg.process(input, t);
      live2.lastRawT = rawT;
      live2.lastT = t;
      const frame = toForceFrame2(out, input);
      live2.results.set(native, frame);
      return frame;
    }
    function analyzeEndiBackrestArea(sourceMatrix, options = {}) {
      var _a, _b;
      const R = Array.isArray(sourceMatrix) ? sourceMatrix.length : 0;
      const C = R ? (_b = (_a = sourceMatrix[0]) == null ? void 0 : _a.length) != null ? _b : 0 : 0;
      const okShape = R === 2 * NATIVE_ROWS && C === 2 * NATIVE_COLS || R === 2 * NATIVE_COLS && C === 2 * NATIVE_ROWS;
      if (!okShape || !isAdcMatrix2(sourceMatrix, R, C)) throw new TypeError("\u9700\u8981 64\xD750 \u6216 50\xD764 \u8865\u507F\u524D\u63D2\u503C ADC \u77E9\u9635");
      const T = ENDI_BACKREST_AREA_THRESHOLD_ADC;
      const sel = options.selection;
      const r0 = sel ? Math.max(0, Math.min(sel.startRow, sel.endRow)) : 0;
      const r1 = sel ? Math.min(R - 1, Math.max(sel.startRow, sel.endRow)) : R - 1;
      const c0 = sel ? Math.max(0, Math.min(sel.startCol, sel.endCol)) : 0;
      const c1 = sel ? Math.min(C - 1, Math.max(sel.startCol, sel.endCol)) : C - 1;
      let count = 0;
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (sourceMatrix[r][c] >= T) count++;
      const areaCm2 = Math.round(count * ENDI_BACKREST_CELL_AREA_CM2 * 1e6) / 1e6;
      return {
        version: ENDI_BACKREST_AREA_VERSION,
        modelVersion: ENDI_BACKREST_AREA_VERSION,
        algorithmId: "endi-backrest-t39-contour-count",
        algorithmLabel: "\u6069\u8FEA\u9760\u80CCT39\u8F6E\u5ED3\u683C\u6570\u9762\u79EF",
        sensorType: "new-backrest-32x25",
        status: count > 0 ? "measured" : "no_contact",
        unit: "cm\xB2",
        scope: sel ? "selection" : "full_frame",
        rows: R,
        cols: C,
        cellAreaCm2: ENDI_BACKREST_CELL_AREA_CM2,
        areaCm2,
        retainedCellCount: count,
        thresholdAdc: T
      };
    }

    // lib/endiPointPressure.ts
    var ENDI_POINT_PRESSURE_VERSION = "endi-point-pressure-region-mean-ratio-sum-preserving-human-peak1.5-20261114";
    var ENDI_POINT_PRESSURE_FORMULA = "P\u1D62 = P_\u533A \xD7 ADC\u1D62 / mean(ADC_\u533A)";
    var ENDI_POINT_PRESSURE_HUMAN_PEAK_RULE = "\u771F\u4EBA\u533A P\u1D62 = P_\u533A \xD7 ADC\u1D62^\u03B3 / mean(ADC_\u533A^\u03B3)\uFF0C\u03B3\u22651 \u4F7F max(P\u1D62) = 1.5 \xD7 P_\u533A \xD7 max(ADC)/mean(ADC)";
    var PEAK_GAMMA_MAX = 64;
    var SEAT = {
      sensorType: "endi-23x23",
      rows: 46,
      cols: 46,
      algRows: 46,
      algCols: 46,
      threshold: ENDI_SEAT_AREA_THRESHOLD_ADC,
      // 算法方向 = 原生顺时针 90°：native[R][C] = alg[C][45 − R]
      algIndex: (R, C) => C * 46 + (45 - R)
    };
    var BACKREST = {
      sensorType: "new-backrest-32x25",
      rows: 64,
      cols: 50,
      algRows: 50,
      algCols: 64,
      threshold: ENDI_BACKREST_AREA_THRESHOLD_ADC,
      // 算法方向 = 原生转置：native[R][C] = alg[C][R]
      algIndex: (R, C) => C * 64 + R
    };
    var store = /* @__PURE__ */ new WeakMap();
    function flatten(m) {
      const out = [];
      for (const row of m) for (const v of row) out.push(v);
      return out;
    }
    function components8(mask, rows, cols) {
      const lab = new Int32Array(rows * cols);
      const out = [];
      const stack = [];
      let id = 0;
      for (let s = 0; s < rows * cols; s++) {
        if (!mask[s] || lab[s]) continue;
        id++;
        const cells = [];
        lab[s] = id;
        stack.push(s);
        while (stack.length) {
          const p = stack.pop();
          cells.push(p);
          const pr = p / cols | 0, pc = p - pr * cols;
          for (let dr = -1; dr <= 1; dr++) {
            const rr = pr + dr;
            if (rr < 0 || rr >= rows) continue;
            for (let dc = -1; dc <= 1; dc++) {
              const cc = pc + dc;
              if (dr === 0 && dc === 0 || cc < 0 || cc >= cols) continue;
              const q = rr * cols + cc;
              if (mask[q] && !lab[q]) {
                lab[q] = id;
                stack.push(q);
              }
            }
          }
        }
        out.push(cells);
      }
      return out;
    }
    function median(values) {
      if (!values.length) return null;
      const s = [...values].sort((a, b) => a - b);
      const m = s.length >> 1;
      return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
    }
    function isMatrix(m, rows, cols) {
      return Array.isArray(m) && m.length === rows && m.every((row) => Array.isArray(row) && row.length === cols);
    }
    function displayedRegionPressure(force, k, fallback) {
      var _a, _b;
      const shown = (_b = (_a = force.contactPressure) == null ? void 0 : _a.regions) == null ? void 0 : _b[k];
      return shown && shown.index === k ? shown.estimatedPressureKPa : fallback;
    }
    function regionInputs(force, geom) {
      var _a, _b;
      if (geom.sensorType === "endi-23x23") {
        const regs2 = (_a = force.endiCushion) == null ? void 0 : _a.regions;
        if (!regs2) return null;
        return regs2.map((r, k) => ({
          center: r.center,
          pressureKPa: displayedRegionPressure(force, k, r.pressureKPa),
          contourCells: r.contourCells,
          peakGain: Number.isFinite(r.peakPressureGain) && r.peakPressureGain > 1 ? r.peakPressureGain : 1
        }));
      }
      const regs = (_b = force.endiBackrest) == null ? void 0 : _b.regions;
      if (!regs) return null;
      return regs.map((r, k) => ({
        center: r.center,
        pressureKPa: displayedRegionPressure(force, k, r.pressureKPa),
        contourCells: Math.round(r.contourAreaCm2 / ENDI_BACKREST_CELL_AREA_CM2),
        peakGain: 1
      }));
    }
    function apportionUnits(weights, totalUnits) {
      const n = weights.length;
      if (!n) return [];
      const wsum = weights.reduce((s, w) => s + w, 0);
      const exact = weights.map((w) => totalUnits * w / wsum);
      const units = exact.map((v) => Math.max(1, Math.floor(v)));
      let diff = totalUnits - units.reduce((s, u) => s + u, 0);
      const order = exact.map((v, i) => i).sort((a, b) => {
        const ra = exact[a] - Math.floor(exact[a]), rb = exact[b] - Math.floor(exact[b]);
        return rb - ra || weights[b] - weights[a] || a - b;
      });
      for (let t = 0; diff > 0 && n > 0; t = (t + 1) % n) {
        units[order[t]] += 1;
        diff -= 1;
      }
      for (let t = n - 1, guard = 0; diff < 0 && guard < 4 * n; guard++, t = (t - 1 + n) % n) {
        const i = order[t];
        if (units[i] > 1) {
          units[i] -= 1;
          diff += 1;
        }
      }
      return units;
    }
    function peakSharpenedWeights(adcs, gain) {
      const n = adcs.length;
      let amax = 0, sum = 0;
      for (const a of adcs) {
        sum += a;
        if (a > amax) amax = a;
      }
      const baseRatio = amax / (sum / n);
      const target = gain * baseRatio;
      const logs = adcs.map((a) => Math.log(a / amax));
      const ratioAt = (g) => {
        let ws = 0;
        for (const l of logs) ws += Math.exp(g * l);
        return n / ws;
      };
      let gamma;
      if (ratioAt(PEAK_GAMMA_MAX) <= target) {
        gamma = PEAK_GAMMA_MAX;
      } else {
        let lo = 1, hi = PEAK_GAMMA_MAX;
        for (let it = 0; it < 100 && hi - lo > 1e-12; it++) {
          const mid = (lo + hi) / 2;
          if (ratioAt(mid) < target) lo = mid;
          else hi = mid;
        }
        gamma = (lo + hi) / 2;
      }
      const weights = logs.map((l) => Math.exp(gamma * l));
      return { weights, gamma, applied: ratioAt(gamma) / baseRatio };
    }
    function calculateEndiPointPressure(sensorType, nativePhysical, heatmapNative, force) {
      const geom = sensorType === "endi-23x23" ? SEAT : sensorType === "new-backrest-32x25" ? BACKREST : null;
      if (!geom || !force || !nativePhysical) return null;
      const regions = regionInputs(force, geom);
      if (!regions) return null;
      let b;
      if (geom === SEAT) {
        if (!isMatrix(nativePhysical, 23, 23)) return null;
        b = interpolate(flatten(endiNativeToAlgorithm(nativePhysical)));
      } else {
        if (!isMatrix(nativePhysical, 32, 25)) return null;
        b = interpolate2(flatten(endiBackrestNativeToAlgorithm(nativePhysical)), 25, 32);
      }
      const { rows, cols, algRows, algCols, threshold } = geom;
      const useHeatmap = isMatrix(heatmapNative, rows, cols);
      const mask = new Uint8Array(algRows * algCols);
      for (let k = 0; k < mask.length; k++) mask[k] = b[k] >= threshold ? 1 : 0;
      const owner = new Int32Array(algRows * algCols).fill(-1);
      const assignedCells = new Array(regions.length).fill(0);
      if (regions.length) {
        for (const cells of components8(mask, algRows, algCols)) {
          let w = 0, si = 0, sj = 0;
          for (const p of cells) {
            const i = p / algCols | 0, j = p - i * algCols, v = b[p];
            w += v;
            si += v * i;
            sj += v * j;
          }
          const ci = si / w, cj = sj / w;
          let best = 0, bd = Infinity;
          for (let k = 0; k < regions.length; k++) {
            const [cr, cc] = regions[k].center;
            const dd = geom === SEAT ? Math.hypot(ci / 2 - cr, (cj - 1) / 2 - cc) : Math.hypot((ci / 2 - cr) * DEFAULT_CONFIG.pitchRowMm, (cj / 2 - cc) * DEFAULT_CONFIG.pitchColMm);
            if (dd < bd) {
              bd = dd;
              best = k;
            }
          }
          for (const p of cells) owner[p] = best;
          assignedCells[best] += cells.length;
        }
      }
      const membershipMatchesCore = regions.every((r, k) => r.contourCells === assignedCells[k]);
      const heatPts = regions.map(() => []);
      const rawPts = regions.map(() => []);
      for (let R = 0; R < rows; R++) {
        for (let C = 0; C < cols; C++) {
          const a = geom.algIndex(R, C);
          const k = owner[a];
          if (k < 0) continue;
          rawPts[k].push({ R, C, adc: b[a] });
          const adc = useHeatmap ? heatmapNative[R][C] : b[a];
          if (Number.isFinite(adc) && adc > 0) heatPts[k].push({ R, C, adc });
        }
      }
      const matrixKPa = Array.from({ length: rows }, () => new Array(cols).fill(0));
      const regionIndexMatrix = Array.from({ length: rows }, () => new Array(cols).fill(-1));
      const contourOwnerMatrix = Array.from({ length: rows }, (_, R) => Array.from({ length: cols }, (_2, C) => owner[geom.algIndex(R, C)]));
      let maxUnits = 0;
      let maxCell = null;
      let pointCount = 0;
      let totalUnits = 0;
      const outRegions = regions.map((r, k) => {
        const usedHeat = heatPts[k].length > 0;
        const pts = usedHeat ? heatPts[k] : rawPts[k];
        const adcs = pts.map((p) => p.adc);
        const meanAdc = adcs.length ? adcs.reduce((s, v) => s + v, 0) / adcs.length : null;
        const med = median(adcs);
        const P = r.pressureKPa;
        const base = { index: k, contourCells: assignedCells[k], meanAdc, medianAdc: med, regionPressureKPa: P, peakGain: r.peakGain };
        if (P === null || !Number.isFinite(P) || P <= 0 || meanAdc === null || meanAdc <= 0) {
          return {
            ...base,
            pointCount: 0,
            meanPressureKPa: null,
            maxPressureKPa: null,
            minPressureKPa: null,
            peakGainApplied: 1,
            peakExponent: 1,
            baseMaxPressureKPa: null,
            adcSource: "none"
          };
        }
        const regionUnits = pressureUnitsFromKPa(P);
        const adcMax = adcs.reduce((m, v) => v > m ? v : m, 0);
        const baseMaxPressureKPa = regionUnits * adcMax / meanAdc / PRESSURE_UNITS_PER_KPA;
        const sharpen = r.peakGain > 1 && pts.length > 1 ? peakSharpenedWeights(adcs, r.peakGain) : null;
        const units = apportionUnits(sharpen ? sharpen.weights : adcs, regionUnits * pts.length);
        let lo = Infinity, hi = -Infinity, sum = 0;
        pts.forEach((p, i) => {
          const u = units[i];
          matrixKPa[p.R][p.C] = u / PRESSURE_UNITS_PER_KPA;
          regionIndexMatrix[p.R][p.C] = k;
          sum += u;
          if (u < lo) lo = u;
          if (u > hi) hi = u;
          if (u > maxUnits) {
            maxUnits = u;
            maxCell = [p.R, p.C];
          }
        });
        pointCount += pts.length;
        totalUnits += sum;
        return {
          ...base,
          pointCount: pts.length,
          meanPressureKPa: Math.round(sum / pts.length) / PRESSURE_UNITS_PER_KPA,
          maxPressureKPa: hi / PRESSURE_UNITS_PER_KPA,
          minPressureKPa: lo / PRESSURE_UNITS_PER_KPA,
          peakGainApplied: sharpen ? sharpen.applied : 1,
          peakExponent: sharpen ? sharpen.gamma : 1,
          baseMaxPressureKPa,
          adcSource: usedHeat ? useHeatmap ? "heatmap" : "raw" : "raw"
        };
      });
      return {
        matrixKPa,
        regionIndexMatrix,
        contourOwnerMatrix,
        summary: {
          version: ENDI_POINT_PRESSURE_VERSION,
          sensorType: geom.sensorType,
          formula: ENDI_POINT_PRESSURE_FORMULA,
          humanPeakRule: ENDI_POINT_PRESSURE_HUMAN_PEAK_RULE,
          adcSource: useHeatmap ? "heatmap" : "raw",
          thresholdAdc: threshold,
          rows,
          cols,
          pointCount,
          meanPressureKPa: pointCount > 0 ? Math.round(totalUnits / pointCount) / PRESSURE_UNITS_PER_KPA : null,
          sumPressureKPa: totalUnits / PRESSURE_UNITS_PER_KPA,
          maxPressureKPa: pointCount > 0 ? maxUnits / PRESSURE_UNITS_PER_KPA : null,
          maxCell,
          membershipMatchesCore,
          regions: outRegions
        }
      };
    }
    function attachEndiPointPressure(force, sensorType, nativePhysical, heatmapNative) {
      if (!force) return null;
      const result = calculateEndiPointPressure(sensorType, nativePhysical, heatmapNative, force);
      if (result) {
        force.pointPressure = result.summary;
        store.set(force, result);
        const cp = force.contactPressure;
        const mean = result.summary.meanPressureKPa;
        if (cp && cp.status !== "no_contact") {
          if (cp.status === "incomplete" && mean !== null) cp.status = "estimated";
          cp.averagePressureKPa = mean;
          force.averagePressureKPa = mean;
        }
      }
      return result;
    }
    function endiPointPressureMatrix(force) {
      var _a, _b;
      return force ? (_b = (_a = store.get(force)) == null ? void 0 : _a.matrixKPa) != null ? _b : null : null;
    }
    function endiContourOwnerMatrix(force) {
      var _a, _b;
      return force ? (_b = (_a = store.get(force)) == null ? void 0 : _a.contourOwnerMatrix) != null ? _b : null : null;
    }

    // lib/version.ts
    var APP_VERSION = "V2.7.110";
    var APP_NAME = "\u77E9\u9635\u538B\u529B\u4F20\u611F\u5668\u5B9E\u65F6\u70ED\u529B\u56FE";
    var APP_FULL_TITLE = `${APP_NAME} ${APP_VERSION}`;

    // kernel_entry.ts
    function sensorGeometry(type) {
      const cfg = getSensorConfig(type);
      return {
        physicalRows: cfg.physicalRows,
        physicalCols: cfg.physicalCols,
        rows: cfg.rows,
        cols: cfg.cols,
        rawStride: cfg.rawStride,
        frameSize: cfg.frameSize,
        wireMap: Array.from(cfg.wireMap),
        physicalValidMask: cfg.physicalValidMask ? cfg.physicalValidMask.map((r) => r.slice()) : null
      };
    }
    function computeFrame(type, physical, ctx, adcSettings) {
      const cfg = getSensorConfig(type);
      const sourceMatrix = lineInterp2x2(physical, cfg.physicalRows, cfg.physicalCols);
      const settings = adcSettings ? normalizeAdcCompensationSettings(adcSettings) : DEFAULT_ADC_COMPENSATION_SETTINGS;
      const heat = compensateAndFilterAdcMatrix(sourceMatrix, type, settings);
      const context = ctx ? { timestampMs: ctx.timestampMs, streamId: ctx.streamId } : void 0;
      const force = type === "endi-23x23" ? calculateEndiSeatForce(physical, context) : calculateEndiBackrestForce(physical, context);
      attachEndiPointPressure(force, type, physical, heat);
      const area = type === "endi-23x23" ? analyzeEndiSeatArea(sourceMatrix) : analyzeEndiBackrestArea(sourceMatrix);
      return {
        sourceMatrix,
        heatmapAdcMatrix: heat,
        force,
        pointPressureKPa: endiPointPressureMatrix(force),
        contourOwner: endiContourOwnerMatrix(force),
        area
      };
    }
    function metadata() {
      return {
        applicationVersion: APP_VERSION,
        adc: {
          compensationVersion: ADC_COMPENSATION_VERSION,
          postCompensationFilterThreshold: ADC_POST_COMPENSATION_FILTER_THRESHOLD,
          defaultSettings: DEFAULT_ADC_COMPENSATION_SETTINGS
        },
        pointPressure: {
          version: ENDI_POINT_PRESSURE_VERSION,
          formula: ENDI_POINT_PRESSURE_FORMULA,
          humanPeakRule: ENDI_POINT_PRESSURE_HUMAN_PEAK_RULE
        },
        seat: {
          algorithmId: ENDI_SEAT_ALGORITHM_ID,
          algorithmLabel: ENDI_SEAT_ALGORITHM_LABEL,
          modelVersion: ENDI_SEAT_MODEL_VERSION,
          coreVersion: ENDI_CUSHION_CORE_VERSION,
          coreSourceSha256: ENDI_CUSHION_CORE_SOURCE_SHA256,
          gravity: ENDI_SEAT_GRAVITY,
          unitMassKg: ENDI_SEAT_UNIT_MASS_KG,
          baseAreaCm2: ENDI_SEAT_BASE_AREA_CM2,
          areaThresholdAdc: ENDI_SEAT_AREA_THRESHOLD_ADC,
          interpCellAreaCm2: 1,
          overRange: {
            forceThresholdN: ENDI_SEAT_OVER_RANGE_FORCE_THRESHOLD_N,
            forceGain: ENDI_SEAT_OVER_RANGE_GAIN,
            version: ENDI_SEAT_OVER_RANGE_VERSION
          },
          human: {
            frameAreaThresholdCm2: ENDI_SEAT_HUMAN_AREA_THRESHOLD_CM2,
            frameForceThresholdN: ENDI_SEAT_HUMAN_FORCE_THRESHOLD_N,
            forceFactor: ENDI_SEAT_HUMAN_FORCE_FACTOR,
            areaFactor: ENDI_SEAT_HUMAN_AREA_FACTOR,
            peakPressureGain: ENDI_SEAT_HUMAN_PEAK_PRESSURE_GAIN,
            exitHoldMs: ENDI_SEAT_HUMAN_EXIT_HOLD_MS,
            version: ENDI_SEAT_HUMAN_VERSION
          },
          params: DEFAULT_PARAMS
        },
        backrest: {
          algorithmId: ENDI_BACKREST_ALGORITHM_ID,
          algorithmLabel: ENDI_BACKREST_ALGORITHM_LABEL,
          modelVersion: ENDI_BACKREST_MODEL_VERSION,
          coreVersion: ENDI_BACKREST_CORE_VERSION,
          coreSourceSha256: ENDI_BACKREST_CORE_SOURCE_SHA256,
          gravity: ENDI_BACKREST_GRAVITY,
          unitMassKg: ENDI_BACKREST_UNIT_MASS_KG,
          baseAreaCm2: ENDI_BACKREST_BASE_AREA_CM2,
          areaThresholdAdc: ENDI_BACKREST_AREA_THRESHOLD_ADC,
          interpCellAreaCm2: ENDI_BACKREST_CELL_AREA_CM2,
          positionCount: ENDI_BACKREST_POSITION_COUNT,
          overRange: {
            forceThresholdN: ENDI_BACKREST_OVER_RANGE_FORCE_THRESHOLD_N,
            forceGain: ENDI_BACKREST_OVER_RANGE_GAIN,
            areaGain: ENDI_BACKREST_OVER_RANGE_AREA_GAIN
          },
          calib: CALIB,
          config: DEFAULT_CONFIG
        }
      };
    }
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
