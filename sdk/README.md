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

默认压强标定为座椅 V2.7.46 / 靠背 V2.7.52，不执行空间高斯或时序滤波。插值与置零后，有限且 `ADC >= 30` 的点为标定有效点，低于 30 的值置为 0。有效点数 `<=300` 时，坐垫以降序第 5-70 位均值、靠背以 TOP46 均值计算目标平均压强 `Pbar=F(X)`，再按 `Pi=F(ADCi)*Pbar/AVG(F(ADCi))` 生成归一化逐点矩阵；有效点数 `>300` 时逐点使用 `Pi=F(ADCi)*2.2`。

Node 配置加载器要求原生标定模块导出 `adcMatrixToPressureMatrix(matrix, sensor, humanCoefficient)`；主程序对插值后的坐垫/靠背二维矩阵分别传入 `seat` 和 `backrest`，系数为 `2.2`。

`pressureValues` 与 `forceValues` 分别返回用于热力图和格点业务的 kPa、N 矩阵。`pressMax/matrixPressMax` 取最终逐点矩阵最大值；`pressAver/matrixPressAver` 用最终矩阵总和除以门槛后 `ADC >= 30` 的有效点数，因此砝码段平均值严格保持为 `Pbar`。点数与接触面积仍按最终矩阵中大于 0 的格点计算。

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
