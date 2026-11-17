# seatBackrestPressure_v2.12.0.js 接口与接入说明

本文件是恩迪坐垫（`endi-23x23`）与恩迪靠背（`new-backrest-32x25`）的压力（力）、面积、逐格压强算法单文件。计算链与汽车座椅标定上位机 **V2.7.110** 的源码相同，在 31 个坐垫位置、44 个靠背位置的全部真实采集帧上与上位机逐帧对拍，零差异（见 `复算与测试/对拍结果/`）。

| 项目 | 内容 |
| --- | --- |
| 文件 | `seatBackrestPressure_v2.12.0.js`（单文件，标定参数全部内联，约 185 KB）、`seatBackrestPressure_v2.12.0.d.ts`（类型声明）、`seatBackrestPressure_v2.12.0.build.json`（构建来源与源码哈希） |
| 版本 | `VERSION = "2.12.0"`，高于已发布的 2.11.1，没有覆盖旧文件 |
| 来源 | `SOURCE_APPLICATION_VERSION = "V2.7.110"` |
| 加载 | Node：`const alg = require('./seatBackrestPressure_v2.12.0.js')`；浏览器：`<script>` 引入后用 `globalThis.SeatBackrestPressureV2120` |
| 依赖 | 无第三方 npm 包；不 require 任何 Node 内置模块；不读写文件 |
| 单位 | 压强 kPa（显示 N/cm² 时 ÷10，可用 `kpaToNcm2`），力 N，面积 cm² |
| 方向 | 所有矩阵都是**原生方向**，行优先，左上角为原点（`order: "row-major"`，`origin: "top-left"`）；不做显示旋转。上位机默认显示旋转为 3（顺时针 270°），由显示层自行处理 |

## 1. 传感器定义

| sensorType | 原始帧 | 原生物理点 | 物理点距 mm（行, 列） | 插值网格（= 上位机热力图） | 插值格尺寸 / 面积 |
| --- | --- | --- | --- | --- | --- |
| `endi-23x23` | 1024 字节 | 23 × 23 = 529 | 20, 20 | 46 × 46 | 10 × 10 mm / 1 cm² |
| `new-backrest-32x25` | 1024 字节 | 32 × 25 = 800 | 26, 20 | 64 × 50 | 13 × 10 mm / 1.3 cm² |

原始帧解码规则：`physical[r][c] = raw[wireMap[r × cols + c]]`，索引超出帧长时取 0。`wireMap`、有效掩码、点距等全部在 `SENSOR_DEFINITIONS[sensorType]` 中。不支持的 sensorType 或尺寸不符的矩阵会抛出 `TypeError`，不会静默返回。

## 2. 推荐接入方式

### 2.1 实时（与上位机界面一致）

坐垫的标准档识别、加减判断、超量程与真人估算的 500 ms 防抖、120 ms 过渡都依赖前后帧，所以实时显示必须用会话，每个传感器一个会话，按时间顺序逐帧调用：

```js
const alg = require('./seatBackrestPressure_v2.12.0.js');
const seat = alg.createSensorSession('endi-23x23');
// 每收到一帧：raw 为 1024 字节原始帧；timestampMs 必须由调用方给出（模块不读系统时钟）
const r = seat.update({ raw: frameBytes, timestampMs: t });
r.forceN;              // 压力 N（= 上位机“压力”卡片）
r.areaCm2;             // 面积 cm²（= 上位机“面积”卡片）
r.averagePressureKPa;  // 平均压强 kPa（= 上位机“平均压强”卡片；无接触为 null）
r.maxPressureKPa;      // 最大压强 kPa（= 上位机“最大压强”卡片；无接触为 null）
r.pointPressureKPa;    // 插值网格逐格压强 kPa（坐垫 46×46 / 靠背 64×50，= 上位机压强热力图）
r.physicalPressureKPa; // 物理点压强 kPa（23×23 / 32×25）
r.regions;             // 各接触区：力、面积、压强、模式、系数类别
seat.reset();          // 换传感器、断线重连或时间回退时清空历史
```

`averagePressureKPa` 与 `maxPressureKPa` 由 `pointPressureKPa` 直接统计（`pointPressureStats` 同值），面板数字和热力图格子来自同一个数组。

一段已采集的数据可以直接用 `calculateSensorSequence(frames, sensorType)`，结果与逐帧调用会话相同。

### 2.2 对接文档 §2 逐格接口

```js
const map = alg.calculateDummyMatrixPressureMap(adcMatrix, 'endi-23x23');
// { kpa, avgKpa, maxKpa, validCount, mode: 'per-cell', unit: 'kPa', grid, sensorType, forceN, areaCm2, ... }
```

`calculateDummyMatrixPressureMap` 与 `calculateMatrixPressureMap` 是同一个函数，前者按对接文档命名。输入可以是两种形状，输出与输入同形：

| 输入 | grid | 输出 kpa |
| --- | --- | --- |
| 原生物理 ADC（23×23 / 32×25） | `physical` | 物理点压强：每个物理点 = 它对应的 2×2 插值子格压强的平均（力等价：物理点压强总和 × 4 = 插值格压强总和） |
| 上位机 `sourceMatrix`（46×46 / 64×50，原生方向、未补偿的插值 ADC） | `interpolated` | 与上位机压强热力图逐格相同 |

规则：无效格和无接触格输出 0，不会出现 null 或 undefined；`avgKpa` = kpa 中正值格的算术平均（按 0.01 kPa 四舍五入），`maxKpa` = kpa 最大值，`validCount` = 正值格数；无接触时三者为 0。这个接口是**单帧静态**估算，没有历史帧，所以与实时会话可能不同（例如实时的标准档锁定、防抖），实时显示请用 2.1。物理形输出的平均值按物理点统计，数值上不等于插值网格的平均（同一组压强、统计单元不同）。

### 2.3 单位换算

`kpaToNcm2(kpa)` 返回 N/cm²，按 0.001 N/cm² 取整，写法与上位机 `kPaToNcm2` 相同。算法内部一律 kPa。

## 3. 计算链（与上位机 V2.7.110 相同）

1. 原始 1024 字节 → `wireMap` → 原生物理 ADC。
2. 力与面积：原生物理 ADC 进入恩迪坐垫/靠背核心（坐垫顺时针转 90° 到算法方向，靠背转置为 25×32），在**未补偿**的物理 ADC 上做接触区识别、位置锚点 + 状态机标准档识别、连续拟合、超量程估算与（仅坐垫）真人估算。
3. 逐格压强：物理 ADC 做 2× 线性插值；坐垫按 `ADC' = 1.0069947916666666 × ADC + 6.018421875` 补偿（靠背默认不补偿），≤30 置 0，作为热力图 ADC。每个接触区的压强按 `P_i = P_区 × ADC_i / mean(ADC_区)` 分到区内各格，再用最大余数法按 0.01 kPa 取整保和，保证区内格子平均严格等于区压强。坐垫真人估算区的最大格按 V2.7.110 规则放大到 1.5 倍（区内平均不变）。
4. 卡片：压力 = 各区力（两位小数）求和；面积 = 各区面积求和；平均压强 = 全部有压强格的算术平均；最大压强 = 逐格最大。

全部公式、阈值和状态机条件见 `交接文档/完整逻辑说明/`。

## 4. 单格修正表 CELL_CALIBRATION（对接文档 §6）

```js
alg.CELL_CALIBRATION['endi-23x23'] = {
  rows: 23, cols: 23, order: 'row-major', origin: 'top-left', domain: 'adc',
  formula: "ADC'[i] = a[i] × ADC[i] + b[i]（进入算法之前）",
  status: 'uncalibrated', calibratedCellCount: 0,
  cells: [null, null, ...]   // 长度严格 = 529；index i = row × cols + col
}
// new-backrest-32x25：rows 32, cols 25, cells 长度 800
```

本版**没有**独立的逐格多档实测，所以 cells 全部为 null，没有填 0，也没有编造系数。按 §6 的回落规则，null 格使用该部位全部有效格的平均 a、b；全部为 null 时回落为恒等（a = 1，b = 0），输出与上位机完全一致。以后补测单格数据，只需要把系数填进这张表重新发布版本，接口不变。

## 5. 全部导出

| 名称 | 说明 |
| --- | --- |
| `VERSION`、`SOURCE_APPLICATION_VERSION` | `"2.12.0"`、`"V2.7.110"` |
| `SENSOR_TYPES`、`SENSOR_DEFINITIONS` | 两种传感器的尺寸、wireMap、掩码、点距、方向 |
| `CELL_CALIBRATION` | §6 单格修正表（本版全为 null） |
| `SEAT_CALIBRATION`、`BACKREST_CALIBRATION` | 坐垫 31 位置 / 靠背 44 位置实测拟合参数（只读） |
| `ADC_COMPENSATION_DEFAULTS`、`POINT_PRESSURE_RULES` | 热力图 ADC 补偿默认值、逐格压强规则常量 |
| `decodeRawFrame(raw, type)` | 原始帧 → 原生物理矩阵 |
| `createSensorSession(type, opts)` | 实时会话：`update(frame)`、`reset()`、`frameCount()` |
| `calculateSensorSequence(frames, type, opts)` | 一段帧序列 |
| `calculateSensorFrame(frame, type, opts)` | 单帧静态完整结果 |
| `calculateDummyMatrixPressureMap` / `calculateMatrixPressureMap` | §2 逐格接口 |
| `calculatePressureMetricsFromMatrix(matrix, type)` | 旧名保留：返回逐格接口的统计量 |
| `estimateAvgPressure(adc, n)`、`estimateBackrestAvgPressure(adc, n)` | 坐垫 / 靠背连续拟合闭式曲线（均匀接触、位置增益 1），严格单调递增，只表达拟合关系，不等于整帧输出 |
| `getMaximumPressureDisplay(rawMaxKpa, type)` | 最大压强显示值（两位小数）；恩迪链路不做 ×2 或 ÷3 |
| `kpaToNcm2(kpa)` | kPa → N/cm² |
| `runSelfCheck()` | 7 项自检，返回 `{ passed, version, sourceApplicationVersion, checks }` |

## 6. 从 v2.11.1 迁移

v2.11.1 的 13 个导出名全部保留，函数参数个数不变。行为上的变化：

1. 计算链换成 V2.7.110 恩迪实测拟合算法（v2.11.1 是 V2.7.95 的旧算法）。
2. v2.11.1 `SequenceOptions` 里的 `rotation`、`filterThreshold`、`resultScale`、`humanCoefficient`、`seatForceMethod`、`backrestPressureMethod` 在本版不再生效（V2.7.110 没有这些可选分支），传入会被忽略。可选项只剩 `adcCompensationSettings`。
3. 单帧结果新增 `forceN`、`areaCm2`、`averagePressureKPa`、`maxPressureKPa`、`pointPressureKPa` 等顶层字段；v2.11.1 的 `forceMetrics`、`areaMetrics`、`pressureMetrics`、`sourcePhysical`、`sourceMatrix`、`displayAdcMatrix` 字段仍在，数值与顶层字段同源。
4. `getMaximumPressureDisplay` 不再做 ×2 / ÷3 换算（V2.7.99 起上位机最大压强 = 格子最大值）。

## 7. 技术底线自查（对接文档 §11）

| # | 要求 | 本文件 |
| --- | --- | --- |
| 1 | CommonJS，require 直接加载，无副作用 | `module.exports`，同时挂浏览器全局；加载只定义冻结常量和函数 |
| 2 | 无第三方依赖，不 require Node 内置 | 构建时检查 `require(`、`import(`、`fs`、`process.`、`window.`、`document.`、`localStorage`、`fetch(` 等计数全部为 0（`build.json`） |
| 3 | 现有导出不删 | v2.11.1 的 13 个导出全部保留；原假人函数名不属于本项目，未加入 |
| 4 | sensorType 字符串不改 | `endi-23x23`、`new-backrest-32x25` |
| 5 | 矩阵维度不改 | 23×23、32×25（插值 46×46、64×50） |
| 6 | 算法单位 kPa | 是；N/cm² 只在 `kpaToNcm2` |
| 7 | 文件名带新版本号，不覆盖旧版 | `seatBackrestPressure_v2.12.0.js`。按本项目先例沿用 `seatBackrestPressure` 前缀，没有使用 `dummyPressure` 前缀（本文件不含假人传感衣算法，用假人名字会误导软件按假人 sensorType 调用） |
| 8 | 无状态，可重复加载 | 模块顶层没有可变变量和缓存；每个会话 / 每次调用新建内部算法实例；`delete require.cache` 后重载结果相同 |
| 9 | 纯函数 | 不用 `Math.random`、`Date.now`、`performance`、环境变量；时间戳由调用方传入；不修改输入 |
| 10 | 性能 | **耗时达标，写法部分符合。** 真实数据实测（Node，`复算与测试/对拍结果/parity_*.json`）：实时逐帧（含力、面积、逐格压强全部计算）p50 1.07 ms（坐垫 46×46 = 2116 格）/ 1.38 ms（靠背 64×50 = 3200 格），p95 2.01 / 2.40 ms；逐格接口 p50 1.28 / 1.38 ms，p95 2.64 / 2.51 ms。格数比文档的 1296 格多，30 Hz 每帧预算 33 ms。逐格循环里没有字符串拼接和 `Object.keys`（`Object.keys` 只在加载时冻结常量、每帧克隆结果对象时使用；标签字符串每帧按接触区拼一次）。**但**接触区归属和逐格分配沿用上位机源码，循环里有 `push({R, C, adc})` 这类小对象分配；为了与上位机逐帧完全一致，本版没有改写这部分 |
| 11 | 曲线全域单调递增 + 自检断言 | `runSelfCheck` 检查两条连续拟合闭式曲线在 ADC 0–255、步长 0.1 严格单调递增 |
| 12 | 不读写文件，标定表内联 | 是 |

## 8. 自检项目

`runSelfCheck()` 的 7 项（两种传感器都检查）：

1. CELL_CALIBRATION 行优先、左上原点，cells 长度 = rows × cols，null 回落恒等。
2. 空载：kpa 与输入同形且全为 0，avgKpa / maxKpa / validCount = 0。
3. 加载帧：输出全是有限数字；avgKpa / maxKpa 由 kpa 直接统计；插值格平均 = 上位机平均压强；物理格压强总和 × 4 = 插值格压强总和；兼容字段 areaMetrics / pressureMetrics 与顶层字段相同。
4. 插值形输入只接受 `sourceMatrix`（2× 线性插值结构）；不支持的 sensorType 抛错。
5. 两条连续拟合闭式曲线在 ADC 0–255、步长 0.1 严格单调递增。
6. 序列确定性：同一输入算两次结果完全相同，且不修改输入。
7. 最大压强显示：恩迪链路不做 ×2 / ÷3，只保留两位小数。

运行示例：`node 接入示例.cjs`（合成帧）或 `node 接入示例.cjs <上位机导出的原始采集 CSV>`。
