# 功能实现文档

> 生成日期：2026-05-08  
> 适用项目：`jqtools2` / Shroom 压力传感器桌面工具  
> 文档范围：当前代码中的主要功能、实现路径、数据流、核心 API、关键状态和扩展注意事项。

## 1. 项目定位

本项目是一个基于 Electron + React + Node.js 的桌面端压力传感器工具，主要用于连接串口硬件传感器，实时采集压力矩阵数据，并提供 2D/3D 可视化、框选统计、历史回放、CSV 导入导出、设备 MAC 配置和打包发布能力。

整体由三部分组成：

| 层级 | 主要文件 | 职责 |
| :--- | :--- | :--- |
| Electron 主进程 | `index.js`、`preload.js` | 启动窗口、启动后端子进程、启动前端服务、注入端口、提供文件夹选择/打开文件能力 |
| Node 后端 | `server/serialServer.js`、`server/api/routes.js`、`server/serial/SerialManager.js`、`server/services/DataService.js` | 串口连接、数据解析、WebSocket 推送、SQLite 存储、历史回放、CSV 导入导出、设备缓存 |
| React 前端 | `client/src/App.js`、`client/src/page/test/Test.js`、`client/src/components/**`、`client/src/hooks/**` | 页面路由、实时渲染、3D/2D 可视化、框选、图表、采集和历史交互 |

## 2. 启动与运行机制

### 2.1 Electron 启动流程

入口文件是 `index.js`。

启动步骤：

1. `app.whenReady()` 后并行获取硬件 UUID 和动态分配端口。
2. 通过 `fork()` 启动后端子进程 `server/serialServer.js`。
3. 开发模式下启动 Vite dev server；生产/静态模式下启动本地静态文件服务器。
4. 创建 `BrowserWindow`，加载本地前端 URL。
5. 隐藏菜单栏，窗口最大化显示。
6. 应用退出时清理后端子进程、前端 dev server 或静态服务器。

### 2.2 端口分配

端口由 `util/portFinder.js` 负责分配，`index.js` 将结果传给后端和前端。

常用端口：

| 名称 | 默认用途 |
| :--- | :--- |
| `API_PORT` | Express API 服务 |
| `WS_PORT` | WebSocket 实时数据服务 |
| `frontend` | Vite 开发服务 |
| `frontendProd` | 静态文件服务 |

前端通过 `window.__PORTS__` 或 Vite 环境变量读取 API/WS 端口，最终由 `client/src/util/portConfig.js` 生成 `localAddress` 和 `wsAddress`。

### 2.3 preload 暴露能力

`preload.js` 使用 `contextBridge.exposeInMainWorld('electronAPI', ...)` 暴露安全 API：

| API | 用途 |
| :--- | :--- |
| `platform` | 获取平台 |
| `getPath(file)` | 获取文件路径 |
| `selectFolder()` | 打开文件夹选择弹窗 |
| `openPath(filePath)` | 打开文件或文件夹 |
| `showItemInFolder(filePath)` | 在系统文件管理器中定位文件 |

这些能力主要用于历史数据导出后的存储路径选择和打开导出文件。

## 3. 前端路由与页面

前端路由定义在 `client/src/App.js`，使用 `HashRouter`。

| 路由 | 页面 | 实现文件 | 功能 |
| :--- | :--- | :--- | :--- |
| `/` | 主可视化页面 | `client/src/page/test/Test.js` | 实时数据、3D/2D 可视化、采集、历史、图表、框选 |
| `/macConfig` | 设备密钥配置页 | `client/src/page/equip/macConfig/MacConfig.js` | 首次启动或手动配置 MAC 与设备类型 |
| `/addMac` | 设备管理页 | `client/src/page/equip/Equip.js` | 设备添加、设备列表、系统配置、更新日志、MAC 配置 |
| `/data` | 数据调试页 | `client/src/page/data/Data.js` | 床垫矩阵变换调试/展示 |

### 3.1 首次启动守卫

`RequireMacConfig` 会在进入 `/` 前调用 `hasMacConfig()`：

1. 前端请求后端 `/cache/devices`。
2. 如果没有设备缓存，跳转到 `/macConfig`。
3. 如果已有缓存，正常进入主页面。

设备缓存最终写入 `serial_cache.json`。打包后该文件存放在 Electron `userData` 目录，避免写入只读的 `app.asar`。

## 4. 全局状态设计

### 4.1 后端状态

后端集中状态在 `server/state.js`。

核心字段：

| 字段 | 说明 |
| :--- | :--- |
| `file` | 当前系统类型，如 `endi`、`carY`、`bed` |
| `baudRate` | 当前系统对应波特率 |
| `parserArr` | 串口解析器集合，按端口路径存储 |
| `dataMap` | 每个端口的最新传感器数据、类型、时间戳 |
| `macInfo` | 串口读取到的 MAC 信息 |
| `colFlag` | 是否正在采集 |
| `colName` | 本次采集批次名称，通常是时间戳 |
| `selectArr` | 本次采集绑定的框选区域 |
| `dataDirection` | 当前画布翻转方向，用于采集保存一致性 |
| `historyFlag` | 是否处于历史模式 |
| `historyPlayFlag` | 是否正在播放历史数据 |
| `historyDbArr` | 当前加载的历史帧数组 |
| `historySelectCache` | 历史回放框选缓存 |
| `currentDb` | 当前系统对应的 SQLite 数据库连接 |
| `downloadPath` | 用户选择的导出路径 |

### 4.2 前端状态

前端核心状态由 `zustand` 管理，入口是 `client/src/store/equipStore.js`。主页面还通过 `pageContext` 传递部分交互对象。

主要状态类型：

| 状态 | 用途 |
| :--- | :--- |
| `systemType` | 当前系统类型 |
| `displayType` | 当前显示子类型，如 `all`、`back2D`、`sit2D`、`back`、`sit` |
| `status` / `displayStatus` | 原始矩阵和展示矩阵 |
| `settingValue` | 可视化调节参数 |
| `settingValueMax` / `settingValueOptimal` | 调节参数上限和默认值 |
| `selectArr` | 当前框选区域 |
| `history` / `historyChart` | 历史回放进度和历史图表数据 |
| `connectState` | 串口连接状态：空闲、连接中、已连接、重连中 |

## 5. 串口连接实现

串口连接核心在 `server/serial/SerialManager.js`。

### 5.1 一键连接流程

前端点击顶部“一键连接”：

1. `Title.js` 调用 `GET /connPort`。
2. 后端 `routes.js` 调用 `connectPort(broadcast, colAndSendData)`。
3. `SerialManager` 枚举串口并过滤 CH340 设备。
4. 对每个端口执行波特率自动检测。
5. 检测成功后建立稳定连接。
6. 读取 MAC 并解析设备类型。
7. 绑定数据帧监听。
8. 定时调用 `colAndSendData()` 推送前端并按需存储。

### 5.2 波特率检测

实现函数：`detectBaudRate(portPath)`。

检测逻辑：

1. 遍历 `constantObj.BAUD_CANDIDATES`。
2. 每个波特率临时打开串口。
3. 使用滑动窗口查找帧分隔符 `AA 55 03 99`。
4. 查找到分隔符后继续验证下一帧长度。
5. 长度符合 `VALID_FRAME_LENGTHS` 或至少连续发现分隔符则认为匹配。
6. 检测完成后关闭临时串口，再进入稳定连接阶段。

### 5.3 稳定连接与重试

实现函数：`newSerialPortLinkWithRetry()`。

策略：

- 最多重试 3 次。
- 每次连接超时 2 秒。
- 每次失败后等待 500ms。
- 稳定连接后使用 `DelimiterParser` 按协议分隔数据帧。

### 5.4 设备类型解析

设备类型解析优先级：

1. 从本地 `serial_cache.json` 查询 MAC 对应类型。
2. 如果本地未命中且授权模式为 online，则请求远端设备管理接口。
3. 解析成功后写入本地缓存。

相关函数：

- `sendMacCommand(port)`：发送 AT 指令读取 `Unique ID`。
- `resolveDeviceType(uniqueId)`：本地缓存优先，必要时远端查询。
- `setTypeToCache()` / `getTypeFromCache()`：维护 `serial_cache.json`。

## 6. 实时数据处理与 WebSocket 推送

### 6.1 数据帧转换

串口原始数据会在 `SerialManager.bindDataHandler()` 中按设备类型转换。

关键转换函数来自 `util/line.js`：

| 类型 | 转换 |
| :--- | :--- |
| `hand` | `hand(pointArr)` |
| `bed` / `car-back` / `car-sit` | `jqbed(pointArr)` |
| `endi-sit` | `endiSit1024(pointArr)` |
| `endi-back` | `endiBack1024(pointArr)` |
| `carY-sit` | `carYSitLine(pointArr)` |
| `carY-back` | `carYBackLine(pointArr)` |

### 6.2 后端推送

实时推送在 `server/services/DataService.js`：

- `parseData()` 将 `state.dataMap` 转换为前端结构。
- `sendData()` 按当前波特率选择推送结构。
- `colAndSendData()` 是定时器回调，负责“推送前端 + 采集落库”。

推送结构：

```json
{
  "sitData": {
    "endi-back": {
      "status": "online",
      "arr": [0, 1, 2],
      "stamp": 1710000000000,
      "HZ": 80
    }
  }
}
```

历史回放结构：

```json
{
  "sitDataPlay": {
    "endi-back": {
      "arr": [0, 1, 2],
      "select": {
        "xStart": 0,
        "xEnd": 10,
        "yStart": 0,
        "yEnd": 10,
        "width": 50,
        "height": 64
      }
    }
  },
  "index": 0,
  "timestamp": 1710000000000
}
```

### 6.3 WebSocket 传输

WebSocket 服务在 `server/websocket/index.js`。

特点：

- 使用 `ws` 创建 noServer WebSocket。
- 如果安装了 `@msgpack/msgpack`，广播时自动使用 MessagePack 二进制编码。
- 如果不可用，则退回 JSON 字符串。

前端通过 `client/src/hooks/useWebSocket.js` 连接并分发消息。

## 7. 前端矩阵处理

矩阵处理核心在 `client/src/hooks/useMatrixData.js`。

主要职责：

1. 接收实时帧或回放帧。
2. 根据系统类型和显示模式拆分 key。
3. 处理框选数据。
4. 计算压力、面积、最大/最小、平均、重心、正态分布等统计。
5. 按当前翻转方向处理展示矩阵。
6. 更新 `disPlayDataRef`、`chartRef`、`zustand` 状态。

### 7.1 支持的矩阵尺寸

前端配置来自 `client/src/util/constant.js`：

| 系统 key | 尺寸 |
| :--- | :--- |
| `endi-back` | 50 x 64 |
| `endi-sit` | 46 x 46 |
| `carY-back` / `carY-sit` | 32 x 32 |
| `car-back` / `car-sit` | 32 x 32 |
| `bed` / `hand` / `foot` | 32 x 32 |
| `bigHand` | 64 x 64 |

### 7.2 画布翻转一致性

画布翻转由 `IconAndTextAndSelect.js` 触发：

1. 用户选择上下翻转或左右翻转。
2. 调用 `changeDataDirection('up' | 'left')` 修改前端方向。
3. 同步调用 `/setDataDirection` 将方向写入后端 `state.dataDirection`。

采集保存时，后端 `storageData()` 根据 `state.dataDirection` 对矩阵执行翻转后落库，并写入 `dataDirection`。

回放时，前端比较：

- 帧保存方向：`sitData[key].dataDirection`
- 当前显示方向：`dataDirection.current`

只有两者不同的轴才再次翻转，避免重复翻转。

## 8. 可视化实现

主页面 `Test.js` 根据 `display` 和 `systemType` 决定渲染组件。

### 8.1 视图模式

| 模式 | 状态值 | 组件 |
| :--- | :--- | :--- |
| 3D 点图/模型 | `point3D` | `CanvasMemo`、`ThreeAndModel`、`ThreeAndCarPoint`、`ThreeAndCarPointV2` |
| 2D 数字 | `num` | `NumThres` |
| 3D 数字 | `num3D` | `Num3D` |
| 对比模式 | `contrast` | `NumThresContrast` |

### 8.2 座椅 3D 模型

人体工学椅/汽车座椅类主要由 `ThreeAndCarPointV2.js` 实现。

核心对象：

- `group`：整组 3D 场景对象。
- `pointGroup`：坐垫/靠背点阵集合。
- `chairRef`：GLB 座椅模型。
- `controls`：`TrackballControls`。
- `camera`：透视相机。

实现细节：

1. 加载 `chair3.glb`。
2. 初始化坐垫和靠背点阵。
3. 使用 `TrackballControls` 控制左键旋转。
4. `actionSit(type)` 控制整体、靠背、坐垫模式切换。
5. 切换单独靠背/坐垫时使用 TWEEN 执行动画。
6. 动画完成后重新计算控制器 target，确保左键围绕当前视觉对象旋转。
7. 整体模式下 target 使用座椅模型、坐垫点阵、靠背点阵的联合包围盒中心。

### 8.3 视角和缩放

缩放工具在 `client/src/util/threeZoom.js`。

前端 `ViewSetting.js` 提供：

- 重置视角。
- 放大/缩小，范围 10% 到 300%。
- 3D 模型/2D 数字视图切换。
- 座椅整体/靠背/坐垫切换。

## 9. 可视化调节

实现位置：`SecondTitle.js` 和 `ViewSetting.js`。

功能项：

| 功能 | 实现 |
| :--- | :--- |
| 画布翻转 | `IconAndTextAndSelect.js` + `useMatrixData.changeDataDirection()` |
| 预压力置零 | `pageInfo.changeWsLocalData()` |
| 框选工具 | `BrushManager` |
| 量尺工具 | `newRuler` |
| 放大镜 | 2D 模式下开启 `onMagnifier` |
| 高斯润滑 | 修改 `settingValue.gauss` |
| 颜色调节 | 修改 `settingValue.color` |
| 噪点消除 | 修改 `settingValue.filter` |
| 高度调节 | 修改 `settingValue.height` |
| 响应速度 | 修改 `settingValue.coherent` |

调节参数写入 `localStorage.setItem('setValueData', ...)`，并同步到 zustand 的 `settingValue`。

## 10. 框选功能实现

框选核心在：

- `client/src/components/selectBox/newSelecttBox.js`
- `client/src/components/title/SelectSet.js`
- `client/src/hooks/useMatrixData.js`
- `client/src/components/chartsAside/ChartsAside.js`

### 10.1 启动条件

框选只能在 2D 数字模式下使用。用户点击“框选工具”时：

1. 如果当前不是 `display === 'num'`，提示“请在2D模式下使用”。
2. 如果量尺工具已开启，提示不能同时使用。
3. 调用 `brushInstance.startBrush()` 开始框选。

### 10.2 有效区域限制

框选不再将整个 canvas 视为有效区域，而是根据 `systemPointConfig` 获取真实矩阵尺寸。

例如：

- `endi-back` 的有效区域是 50 x 64。
- `endi-sit` 的有效区域是 46 x 46。
- 32 点阵设备是 32 x 32。

框选起点或结束区域超出真实矩阵时，提示“请在有效区域框选”。

### 10.3 多框选

支持最多 4 个框选区域。

实现细节：

- 每个框选有 `colorIndex` 和颜色。
- 框选 DOM 由 `BrushManager` 创建。
- `SelectSet` 可以列出现有框选、删除单个框选、清空全部、手动输入坐标创建框选。
- 输入创建时会校验 `X + 长 <= 矩阵宽度`，`Y + 宽 <= 矩阵高度`。

### 10.4 框选统计

`useMatrixData` 会在每帧数据中根据框选区域截取子矩阵，并计算：

- 框选压力总和。
- 框选面积。
- 框选最大值/最小值。
- 框选平均压强。

`ChartsAside` 会在多框选模式下为每个框选区域生成独立曲线和统计行。

## 11. 量尺与放大镜

### 11.1 量尺

实现对象：`newRuler`。

触发逻辑：

1. 只允许 2D 数字模式。
2. 不允许和框选工具同时使用。
3. 多矩阵系统根据当前 `displayType` 选择 `back` 或 `sit` 的点距配置。
4. 点距配置来自 `pointConfig`，例如 `pointWidthDistance`、`pointHeightDistance`。

### 11.2 放大镜

放大镜通过主页面状态 `onMagnifier` 控制。

限制：

- 只允许 2D 数字模式。
- 开启后由 2D 数字渲染组件根据鼠标位置放大局部数据。

## 12. 图表和统计实现

图表组件：`client/src/components/chartsAside/ChartsAside.js`。

使用 ECharts 和自定义重心轨迹组件 `FootTrack`。

### 12.1 图表类型

| 图表 | 数据来源 | 说明 |
| :--- | :--- | :--- |
| 压力曲线 | `chartRef.current[key].pressArr` | 最近帧压力总和变化 |
| 面积曲线 | `chartRef.current[key].areaArr` | 有压力点数量变化 |
| 压力重心 | `chartRef.current[key].center` | 重心坐标移动轨迹 |
| 正态分布 | `chartRef.current[key].normalDis` | 灰度/压力分布统计 |

### 12.2 统计字段

| 字段 | 说明 |
| :--- | :--- |
| `pressAver` | 平均压强 |
| `pressMax` | 最大压强 |
| `pressMin` | 最小压强 |
| `pressTotal` | 压力总和 |
| `areaTotal` | 受力面积 |
| `pointTotal` | 受力点数 |
| `pressureCenter` | 压力重心 |
| `μ` | 均值 |
| `Var` | 方差 |
| `Skew` | 偏度 |
| `Kurt` | 峰度 |

`carY` 系统压力统计存在特殊分压处理，部分压力值会除以 `100 / 3`。

## 13. 数据采集实现

采集组件：

- `client/src/components/ColAndHistory/ColControlV2.js`
- `client/src/components/col/Col.js`

后端接口：

- `POST /startCol`
- `GET /endCol`

### 13.1 开始采集

前端点击采集按钮后：

1. 获取当前系统类型、显示类型和框选区域。
2. 如果有框选，将 DOM 坐标转换成矩阵坐标。
3. 生成 `fileName`，默认使用当前时间戳。
4. 读取当前画布翻转方向 `dataDirection`。
5. 调用 `/startCol`。
6. 如果填写了名称、备注或存在框选，再调用 `/upsertRemark` 保存元信息。

后端 `/startCol`：

1. 解析 `fileName`、`select`、`dataDirection`。
2. 初始化当前数据库。
3. 校验当前已连接设备类型是否匹配当前系统。
4. 匹配成功则设置 `state.colFlag = true`。

### 13.2 采集落库

落库发生在 `DataService.storageData()`：

1. 从实时数据对象中移除 `status`。
2. 根据 `state.dataDirection` 对矩阵做左右/上下翻转。
3. 写入每个设备数据的 `dataDirection`。
4. 插入 SQLite `matrix` 表：

```sql
INSERT INTO matrix (data, timestamp, date, `select`) VALUES (?, ?, ?, ?)
```

字段含义：

| 字段 | 说明 |
| :--- | :--- |
| `data` | 一帧矩阵 JSON |
| `timestamp` | 帧时间戳 |
| `date` | 采集批次名 |
| `select` | 当前采集绑定的框选 JSON |

### 13.3 结束采集

点击采集按钮进入停止逻辑：

1. 调用 `GET /endCol`。
2. 后端设置 `state.colFlag = false`。
3. 前端停止计时并切换按钮状态。

## 14. 历史数据与回放实现

历史面板组件：`client/src/components/ColAndHistory/ColAndHistory.js`。

### 14.1 历史列表

点击“历史数据”后调用 `GET /getColHistory`。

后端查询逻辑：

1. 每个采集批次按 `date` 分组。
2. 取每个批次最新一帧的 `timestamp`。
3. 左连接 `remarks` 表，拿到别名、备注和框选信息。
4. 返回最多 500 条。

前端处理：

- 使用 `normalizeHistoryList()` 去重。
- 根据 `alias || date` 展示名称。
- 如果存在 `select`，显示“框选”标记。

### 14.2 加载历史数据

选择历史记录后调用 `POST /getDbHistory`。

后端：

1. 调用 `dbGetData()` 查询该 `date` 的所有帧。
2. 计算 `pressArr` 和 `areaArr`。
3. 存入 `state.historyDbArr`。
4. 根据前两帧时间差推算 `colMaxHZ`。
5. 返回总帧数和图表数据。

### 14.3 播放控制

| 操作 | API | 后端实现 |
| :--- | :--- | :--- |
| 播放 | `/getDbHistoryPlay` | `startPlayback()` |
| 暂停 | `/getDbHistoryStop` | 设置 `historyPlayFlag = false` |
| 取消回放 | `/cancalDbPlay` | 清空历史状态和定时器 |
| 倍速 | `/changeDbplaySpeed` | `changePlaySpeed(speed)` |
| 拖动进度条 | `/getDbHistoryIndex` | `getPlaybackSnapshot(index)` |

### 14.4 回放快照

`getPlaybackSnapshot()` 是回放关键函数。

它负责：

1. 标准化播放索引。
2. 读取对应帧。
3. 解析帧 JSON。
4. 将 `historySelectCache` 注入到每个 key 的 `select` 字段。
5. 返回统一 payload：

```json
{
  "sitDataPlay": {},
  "index": 10,
  "timestamp": 1710000000000
}
```

拖动进度条和正常播放现在共用这套逻辑，因此框选回放不会在拖动时退回全量原始数据。

### 14.5 历史框选

历史回放期间如果重新框选：

1. `Test.js` 监听 `brushInstance.subscribe()`。
2. 将当前框选转成矩阵坐标。
3. 调用 `/getDbHistorySelect`。
4. 后端遍历 `historyDbArr` 所有帧，计算框选区域的压力和面积曲线。
5. 前端更新 `historyChart`。

## 15. CSV 导出实现

后端实现：`util/db.js`。

入口接口：`POST /downlaod`。

### 15.1 导出流程

1. 前端选择历史数据。
2. 选择或确认下载路径。
3. 调用 `/downlaod`，携带 `fileArr`。
4. 后端解析下载请求。
5. 调用 `dbLoadCsv()`。
6. 对每个采集批次调用 `dbload()`。
7. 查询 `matrix` 表所有帧。
8. 如果是多矩阵系统，按 `back` 和 `sit` 分别生成 CSV。
9. 写入 UTF-8 BOM，保证 Excel 打开中文正常。
10. 返回导出的文件路径。

### 15.2 导出字段

每帧导出字段包括：

- `sec(s)`：按检测帧率计算的秒数。
- `time`：帧时间。
- `{key}max`：原始最大压强。
- `{key}maxCoord`：最大压强坐标。
- `{key}aver`：原始平均压强。
- `{key}pressureArea`：原始受力面积。
- `{key}realData`：完整原始矩阵。
- `{key}selectMax`：框选最大压强。
- `{key}selectMaxCoord`：框选最大压强坐标。
- `{key}selectAver`：框选平均压强。
- `{key}selectArea`：框选受力面积。
- `{key}selectData`：框选原始矩阵。
- `remark`：备注。

`endi-back` 和 `endi-sit` 会额外导出：

- `{key}point`
- `{key}pressTotal`

### 15.3 下载路径

下载路径管理接口：

| API | 说明 |
| :--- | :--- |
| `GET /getDownloadPath` | 获取当前下载路径 |
| `POST /setDownloadPath` | 设置并持久化下载路径 |
| `POST /openFile` | 打开文件 |
| `POST /openFolder` | 打开文件夹 |

路径优先级：

1. 用户自定义路径。
2. 桌面。
3. 下载目录。
4. 文档目录。
5. 打包资源目录或开发环境 `data` 目录。

## 16. CSV 导入实现

前端入口在历史面板“导入数据”页签。

后端接口：

- `POST /uploadCsv`
- `POST /getCsvData`

### 16.1 上传校验

`/uploadCsv` 使用 `multer` 保存文件，保存后调用 `validateImportedCsv(filePath)`。

校验要求：

1. 文件必须是 `.csv`。
2. 必须包含基础列 `sec(s)` 和 `time`。
3. 必须包含原始矩阵数据列。
4. 必须包含同前缀统计列。
5. 矩阵长度必须是受支持尺寸，如 32x32、46x46、50x64、4096。
6. 矩阵元素必须能解析为数字。

校验失败：

- 删除已上传临时文件。
- 返回“数据有误”。
- 前端不加入本地导入列表。

### 16.2 导入列表去重

前端 `ColAndHistory.js` 使用：

- `normalizeCsvList()`
- `readStoredCsvList()`
- `persistCsvList()`

导入列表写入 `localStorage` 的 `csvArr`，按路径去重。切换“本地数据/导入数据”页签时会清空操作状态，避免重复选中和复制显示。

## 17. 备注、重命名和删除

备注数据存储在 SQLite `remarks` 表。

建表逻辑在 `ensureRemarksTable()`：

```sql
CREATE TABLE IF NOT EXISTS remarks (
  date TEXT PRIMARY KEY,
  alias TEXT,
  remark TEXT,
  select_json TEXT,
  updated_at INTEGER
)
```

相关 API：

| API | 说明 |
| :--- | :--- |
| `/upsertRemark` | 新增或更新别名、备注、框选信息 |
| `/getRemark` | 查询备注 |
| `/changeDbName` | 修改采集批次名称，同时更新 remarks |
| `/changeDbDataName` | 修改数据记录名称，同时更新 remarks |
| `/delete` | 删除 matrix 和 remarks 记录 |

`upsertRemark()` 使用 SQLite `ON CONFLICT(date) DO UPDATE`，保证同一个采集批次可以重复更新。

## 18. 设备管理功能

设备管理页面：`client/src/page/equip/Equip.js`。

菜单项：

| 菜单 | 组件 | 功能 |
| :--- | :--- | :--- |
| 设备添加 | `Addequip` | 设备录入/添加入口 |
| 设备列表 | `EquipList` | 展示设备列表 |
| 配置系统 | `SystemSetting` | 系统配置 |
| 更新日志 | `ChangeLog` | 应用内版本更新说明 |
| MAC 地址配置 | `MacConfig` | 配置 MAC 与设备类型 |

### 18.1 MAC 配置格式

输入格式：

```text
MAC地址:类型,MAC地址:类型
```

示例：

```text
AA:BB:CC:DD:EE:FF:endi-back,11:22:33:44:55:66:endi-sit
```

支持类型：

- `endi-back`
- `endi-sit`
- `carY-back`
- `carY-sit`
- `hand`
- `bed`
- `car-back`
- `car-sit`

保存时前端会先调用 `/cache/clear` 清空缓存，再逐个调用 `/cache/devices` 写入。

## 19. API 端点清单

### 19.1 系统管理

| 方法 | 路径 | 说明 |
| :--- | :--- | :--- |
| `GET` | `/getSystem` | 获取当前系统配置并初始化数据库 |
| `POST` | `/selectSystem` | 选择系统文件 |
| `POST` | `/changeSystemType` | 切换系统类型、重置前端实时数据 |
| `POST` | `/getSysconfig` | 加密系统配置 |

### 19.2 串口和设备

| 方法 | 路径 | 说明 |
| :--- | :--- | :--- |
| `GET` | `/getPort` | 获取串口列表 |
| `GET` | `/connPort` | 一键连接 |
| `GET` | `/rescanPort` | 清理死端口/僵尸设备并重连 |
| `GET` | `/stopPort` | 断开所有串口 |
| `GET` | `/sendMac` | 对已连接端口发送 MAC 查询 |
| `GET` | `/sendMacConnected` | 从已连接端口读取 MAC |
| `GET` | `/readMacOnly` | 独立读取 MAC，不依赖一键连接 |

### 19.3 采集和历史

| 方法 | 路径 | 说明 |
| :--- | :--- | :--- |
| `POST` | `/setDataDirection` | 同步画布翻转方向 |
| `POST` | `/startCol` | 开始采集 |
| `GET` | `/endCol` | 结束采集 |
| `GET` | `/getColHistory` | 获取历史列表 |
| `POST` | `/getDbHistory` | 加载历史数据 |
| `POST` | `/getDbHistorySelect` | 计算历史框选图表 |
| `POST` | `/getContrastData` | 获取对比数据 |

### 19.4 回放控制

| 方法 | 路径 | 说明 |
| :--- | :--- | :--- |
| `POST` | `/getDbHistoryPlay` | 开始播放 |
| `POST` | `/getDbHistoryStop` | 暂停播放 |
| `POST` | `/cancalDbPlay` | 取消播放并退出历史模式 |
| `POST` | `/changeDbplaySpeed` | 修改播放倍速 |
| `POST` | `/getDbHistoryIndex` | 跳转到指定帧 |

### 19.5 数据操作

| 方法 | 路径 | 说明 |
| :--- | :--- | :--- |
| `POST` | `/downlaod` | 导出 CSV |
| `GET` | `/getDownloadPath` | 获取下载路径 |
| `POST` | `/setDownloadPath` | 设置下载路径 |
| `POST` | `/openFile` | 打开文件 |
| `POST` | `/openFolder` | 打开文件夹 |
| `POST` | `/delete` | 删除历史 |
| `POST` | `/changeDbName` | 修改历史名称 |
| `POST` | `/changeDbDataName` | 修改数据名称 |

### 19.6 备注和缓存

| 方法 | 路径 | 说明 |
| :--- | :--- | :--- |
| `POST` | `/upsertRemark` | 新增/更新备注 |
| `POST` | `/getRemark` | 获取备注 |
| `GET` | `/cache/devices` | 获取设备缓存 |
| `POST` | `/cache/devices` | 写入设备缓存 |
| `DELETE` | `/cache/devices` | 删除单个设备缓存 |
| `POST` | `/cache/clear` | 清空设备缓存 |
| `GET` | `/auth/mode` | 获取授权模式 |
| `POST` | `/auth/mode` | 切换授权模式 |
| `POST` | `/bindKey` | 绑定授权 key，当前为兼容接口 |

### 19.7 CSV 导入

| 方法 | 路径 | 说明 |
| :--- | :--- | :--- |
| `POST` | `/uploadCsv` | 上传并校验 CSV |
| `POST` | `/getCsvData` | 读取 CSV 数据 |

## 20. 数据库存储

每个系统类型对应一个 SQLite 数据库：

```text
db/{system}.db
```

例如：

- `endi.db`
- `carY.db`
- `bed.db`

数据库初始化：

1. `initDb(system, dbPath)` 打开对应数据库。
2. 如果数据库不存在，从 `init.db` 模板复制。
3. 执行 `PRAGMA quick_check` 检查完整性。
4. 如果损坏，将原文件移动到 `corrupt-backups`，再从模板重建。
5. 开启 WAL 模式和 `synchronous=NORMAL`。
6. 确保 `remarks` 表存在。

## 21. 打包和发布

根目录 `package.json` 定义脚本：

| 命令 | 说明 |
| :--- | :--- |
| `npm run dev` | Electron 开发模式启动 |
| `npm run dev:static` | 使用静态 build 启动 |
| `npm run build:client` | 安装/构建前端并同步 build |
| `npm run build:win` | 构建 Windows 安装包 |
| `npm run build:mac` | 构建 macOS 包 |
| `npm run install:all` | 安装根目录和 client 依赖 |
| `npm run rebuild:native` | 重新构建原生依赖 |

打包配置：

- `asar: true`
- `npmRebuild: false`
- `extraResources` 包含 `db` 和 `data`
- Windows 输出 NSIS x64 安装包
- macOS 输出 dmg

## 22. 关键扩展点

### 22.1 新增设备类型

需要修改：

1. `client/src/util/constant.js`：添加 `systemPointConfig` 和 `pointConfig`。
2. `util/db.js`：添加导出点距配置。
3. `server/services/DataService.js`：添加矩阵尺寸。
4. `server/serial/SerialManager.js`：添加原始数据转换函数。
5. `client/src/page/test/Test.js`：添加对应可视化组件映射。
6. `client/src/App.js`：添加 i18n 名称。

### 22.2 新增可视化参数

需要修改：

1. `config.txt` 中的默认值和最大值。
2. `SecondTitle.js` 的 `setType` 配置。
3. `useMatrixData.js` 或 Three.js 渲染组件中消费该参数。
4. `equipStore.js` 中确认状态字段存在。

### 22.3 修改 CSV 格式

需要同步修改：

1. `util/db.js` 的导出表头。
2. `validateImportedCsv()` 的导入校验逻辑。
3. 前端导入/回放读取逻辑。
4. 如涉及历史兼容，需要考虑老 CSV 的降级解析。

## 23. 当前已知注意事项

1. `README.md` 前半部分仍是 Codeup 模板，项目实际说明主要在 `CHANGELOG.md`、`ARCHITECTURE.md` 和本文档中。
2. `ARCHITECTURE.md` 当前在部分终端下存在编码显示问题，但内容仍可作为结构参考。
3. `/downlaod` 接口路径拼写保留了历史拼写，不建议直接改名，否则会影响前端调用。
4. 前端构建存在既有 warning，如 `App.js` 重复 i18n key、Sass legacy API 提示、部分 unreachable code 提示。
5. 部分页面如 `/data` 更偏调试用途，不是主业务入口。
6. 打包后文件写入必须使用 `userData`、`data` 或用户选择目录，不能写入 `app.asar`。

