# SHROOM-SEAT SDK

这是从当前软件后台和通用工具中拆出的独立 JavaScript SDK。它不要求启动本项目的 Express/Electron 后台服务，调用方可以直接使用底层函数、串口连接、协议解析、设备缓存、配置读写、采集、历史存储和数据导出能力。

## 能力边界

- `core/*`：矩阵方向、置零、框选统计、回放帧处理、压强计算、线序和字节转换。
- `node/serial`：列串口、筛选 CH340/USB 串口、探测波特率、打开连接、读取 MAC。
- `node/protocol`：解析串口原始帧，支持 18/130/146/1024/1025/4096/4097 字节帧和 MAC 文本。
- `node/device-cache`：读写本地设备 MAC/type 缓存。
- `node/auth`：本地缓存优先，可选在线校验设备类型和权限。
- `node/config`：读写加密系统配置、压强配置、动态加载压强公式。
- `node/collector`：事件式采集器，直接连接串口、解析帧、内存录制。
- `node/history-store`：轻量 SQLite 历史数据存储，表结构兼容原软件 `matrix` 表。
- `node/exporter`：把 SDK 帧或历史行导出为 CSV/XLSX。
- `api-client.js`：可选 HTTP/WebSocket client，仅在调用方确实要连接已启动后台服务时使用。

## 使用

仓库内直接使用：

```js
const sdk = require('./sdk')
```

作为独立包复制到外部项目后：

```js
const {
  computePressureMetrics,
  createCollector,
  createHistoryStore,
  exportFrames,
} = require('@shroom-seat/core-sdk')
```

校验：

```bash
cd sdk
npm test
npm run pack:check
```

## 串口直连

```js
const { serial, protocol } = require('@shroom-seat/core-sdk')

const ports = await serial.listDevicePorts()
const connection = await serial.connectSerialPort(ports[0], {
  onFrame(frame) {
    const parsed = protocol.parseSerialFrame(frame)
    console.log(parsed.kind, parsed.type, parsed.arr?.length)
  },
})

const mac = await connection.readMac()
console.log(mac.uniqueId, mac.version)

await connection.close()
```

## 采集、存储、导出

```js
const {
  createCollector,
  createHistoryStore,
  exportFrames,
} = require('@shroom-seat/core-sdk')

const collector = createCollector()
await collector.connectAll()

collector.startRecord('demo')
collector.on('matrix', (frame) => {
  console.log(frame.type, frame.data.arr.length)
})

// ...采集一段时间后
const record = collector.stopRecord()

const store = await createHistoryStore({ dbPath: './data/shroom-sdk.db' })
await store.appendFrames(record.recordName, record.frames)

exportFrames('./exports/demo.csv', record.frames)

await store.close()
await collector.disconnectAll()
```

## 算法函数

```js
const {
  applyCollectionDirection,
  applyZeroBaseline,
  computeSelectionStats,
  computePressureMetrics,
} = require('@shroom-seat/core-sdk')

const directed = applyCollectionDirection('hand', [1, 2, 3, 4], {
  left: false,
  up: true,
  rotateDegree: 0,
})

const zeroed = applyZeroBaseline('hand', directed, {
  enabled: true,
  data: { hand: [1, 1, 1, 1] },
})

const selection = computeSelectionStats(
  { hand: { arr: zeroed } },
  { hand: [{ xStart: 0, xEnd: 2, yStart: 0, yEnd: 1, width: 2 }] }
)

const pressure = computePressureMetrics(zeroed, 'hand')
console.log(selection.hand.press, pressure.pressAver)
```

坐垫与靠背的总力、面积模型使用附件 V2.12.0，独立 SDK 内包含同一份未修改附件，并直接使用其公开实时会话接口。应用最终压强统一由总力除以总面积计算：`P(kPa) = 10 × forceN / areaCm2`。面积不大于0或总力不可用时压强为 `null`；总力为0且面积大于0时为0。

```js
const sdk = require('@shroom-seat/core-sdk')

// raw 是未做线序、插值、方向、补偿的1024字节ADC；时间由调用方显式提供。
const results = sdk.calculateSensorSequence([
  { raw: rawFrame0, timestampMs: 0 },
  { raw: rawFrame1, timestampMs: 100 },
], 'endi-23x23') // 靠背使用 'new-backrest-32x25'
const latest = results[results.length - 1]
console.log(latest.forceMetrics?.forceN, latest.areaMetrics.areaCm2)
const latestSummary = sdk.computePressureMetrics(rawFrame1, 'endi-sit', { algorithmMetrics: latest })
console.log(latestSummary.pressAver) // 10 × forceN / areaCm2

// 无界采集流使用独立会话，保留加载方向和识别历史，不会重跑全部历史帧。
const session = sdk.createSensorSession('new-backrest-32x25')
const frame = session.process({ raw: rawFrame0, timestampMs: 0 })
const metrics = sdk.computePressureMetrics(rawFrame0, 'endi-back', {
  algorithmMetrics: frame,
})
session.reset() // 新采集/去皮后明确重置历史
```

也可提供原生方向 `physical`：坐垫 `23×23`、靠背 `32×25`，数值必须在 `0..255`。完整算法内部负责线序解码、2倍插值、靠背有效区、默认 ADC 补偿、过滤、面积分区以及总力识别/人体估算。V2.12.0 返回原生方向矩阵：坐垫 `46×46`、靠背 `64行×50列`；应用显示层自行旋转270°，得到靠背 `50行×64列`。

`calculateSensorFrame` 只代表空历史的一帧，连续加载时不可反复调用它。`calculateSensorSequence` 一次计算完整显式序列；`createSensorSession` 则保留原算法的有限内部状态。二者逐帧结果一致。去皮应在原始ADC层减去原始基线，再把处理后的 `raw` 或 `physical` 传入；不要把插值/补偿后的显示矩阵当原生输入。

`computePressureMetrics(..., { algorithmMetrics })` 的 `total` 取 `forceMetrics.forceN`，`effectiveArea` 取 `areaMetrics.areaCm2`，`pressAver` 与压强趋势字段 `pressureTotal` 均按上述 `10F/A` 换算，标记 `pressureMethod:'force-over-area'`。附件的原分区均压、逐点曲线、最大值和力矩阵保留在 `algorithmMetrics` 中供诊断，不作为应用指标。应用 `pressMax/rawMaxPressureKPa/forceMax/forceAver/matrixPressureTotal` 均为 `null`，`pressureValues/forceValues` 为空数组；可视化使用采集到的原始 ADC，包含低于30的值，不能使用已补偿/过滤的 `displayAdcMatrix` 冒充原始 ADC。不可用结果标记 `calibrationComplete:false`、`calibrationScope:'unavailable'`。

仅传 ADC 数组给 `computePressureMetrics(arr, key)` 时，结果明确标为 `calibrationScope:'matrix-only'`、`calibrationComplete:false`。对 `endi-sit/endi-back`，缺少完整模型结果时总力、面积、压强及逐点物理指标均不可用，不使用逐点曲线或固定格点面积兜底。Node 配置加载器支持 `seatBackrestPressure*.js` 原始导出，旧 V2.7.63 / V2.11.0 配置自动迁移到 `seatBackrestPressure_v2.12.0.js`。应用 V18 历史中已经保存的附件总力和面积可直接迁移为新 `10F/A` 摘要，保留采集前识别历史产生的估计值；若旧记录只保存了去皮后 ADC，不能恢复去皮前原始图，原始显示需明确标记不可用。

## 配置和设备缓存

```js
const { config, deviceCache, auth } = require('@shroom-seat/core-sdk')

const pressureConfig = config.loadPressureConfig('./data/pressure_config.json')

const cache = deviceCache.createDeviceCache({ cachePath: './data/serial_cache.json' })
cache.set('AABBCCDDEE', 'car-sit', 'sit', 'seat demo')

const device = await auth.resolveDeviceType('AABBCCDDEE', {
  cache,
  authMode: 'local',
})
```

## 依赖说明

核心算法没有第三方运行时依赖。Node 侧能力按需使用可选依赖：

- 串口：`serialport`
- 加密配置：`crypto-js`
- 在线鉴权 fallback：`axios`
- 历史 SQLite：`sqlite3`
- XLSX 导出：`xlsx`
- API WebSocket：`ws`
