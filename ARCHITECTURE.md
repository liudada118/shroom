# 架构文档

> 本文档由 Manus 自动生成和维护。最后更新于：2026-06-01

## 1. 项目概述

本项目（`jqtools2` / Shroom）是一个基于 Electron 的桌面应用程序，核心功能是连接硬件传感器（通过串口），实时采集、处理、可视化和分析压力数据。应用包含一个 React 构建的前端界面用于数据展示和交互，以及一个 Node.js 后端服务处理硬件通信、数据存储和 API 请求。支持多种传感器类型（座椅、床垫、手部），提供 3D 可视化、数据采集回放、CSV 导出等功能。

## 2. 技术栈

| 分类 | 技术 | 版本/说明 |
| :--- | :--- | :--- |
| **应用框架** | Electron | 桌面应用容器，管理主进程和渲染进程 |
| **前端框架** | React | 单页应用，Vite 构建（从 CRA/Webpack 迁移） |
| **后端框架** | Express.js | REST API 服务 |
| **实时通信** | ws + @msgpack/msgpack | WebSocket，支持 JSON/MessagePack 双模式 |
| **数据库** | SQLite3 | WAL 模式，本地嵌入式数据库 |
| **状态管理** | zustand | 轻量级状态管理，配合 shallow 比较 |
| **3D 可视化** | Three.js | 压力矩阵 3D 渲染 |
| **图表** | ECharts | 按需引入，折线图等 |
| **UI 组件库** | Ant Design (antd) | 通用 UI 组件 |
| **硬件交互** | serialport | 串口通信 |
| **编程语言** | JavaScript (ES6+) | 前后端统一 |
| **前端构建** | Vite 5 + @vitejs/plugin-react | 秒级启动 + HMR 热更新 |
| **包管理器** | npm | |
| **部署环境** | Windows 桌面 | electron-builder 打包 |
| **其他关键库** | crypto-js, axios, i18next, sass | 加密、HTTP 请求、国际化、样式预处理 |

## 3. 目录结构

```
shroom/
├── index.js                    # Electron 主进程入口
├── indexsingle.js              # 单机模式入口
├── preload.js                  # Electron preload 脚本
├── kartingcar.js               # 卡丁车模式 WebSocket 服务
├── pyWorker.js                 # Python 子进程管理
├── python.js                   # Python 集成
├── genJqtoolsConfig.js         # 配置生成工具
├── package.json
├── server/                     # 后端服务（模块化）
│   ├── serialServer.js         # 服务入口（~118 行）
│   ├── state.js                # 全局状态管理（含 lastDataTime/rescanLock）
│   ├── api/
│   │   └── routes.js           # Express REST API 路由（~373 行）
│   ├── websocket/
│   │   └── index.js            # WebSocket 服务（~80 行）
│   ├── serial/
│   │   └── SerialManager.js    # 串口管理（含 rescanPort/僵尸检测/帧验证）
│   ├── services/
│   │   └── DataService.js      # 数据采集/回放/导出（~201 行）
│   ├── equipMap.js             # 设备映射配置
│   └── HttpResult.js           # HTTP 响应封装
├── util/                       # 通用工具模块
│   ├── portFinder.js           # 端口检测与动态分配
│   ├── db.js                   # SQLite 数据库操作
│   ├── logger.js               # 统一日志模块
│   ├── config.js               # 加密配置读写
│   ├── serialCache.js          # MAC→设备类型本地缓存（serial_cache.json）
│   ├── line.js                 # 数据转换工具
│   ├── aes_ecb.js              # AES-ECB 加密
│   ├── parseData.js            # 数据解析
│   ├── serialport.js           # 串口工具
│   ├── time.js                 # 时间工具
│   ├── getServer.js            # 服务器地址获取
│   └── getWinConfig.js         # 窗口配置
├── client/                     # 前端 React 应用
│   ├── src/
│   │   ├── App.js              # 应用根组件
│   │   ├── page/
│   │   │   ├── test/Test.js    # 主测试页面（272 行）
│   │   │   ├── data/Data.js    # 数据页面
│   │   │   ├── equip/Equip.js  # 设备管理页面
│   │   │   └── equip/macConfig/MacConfig.js # MAC 地址配置页面
│   │   ├── hooks/
│   │   │   ├── useWebSocket.js # WebSocket 连接管理 Hook
│   │   │   ├── useMatrixData.js# 矩阵数据处理 Hook
│   │   │   ├── useWindowsize.js# 窗口尺寸 Hook
│   │   │   └── useDebounce.js  # 防抖 Hook
│   │   ├── store/
│   │   │   └── equipStore.js   # zustand 状态仓库（含 macInfo/rescanning 状态）
│   │   ├── components/
│   │   │   ├── three/          # Three.js 3D 可视化组件（14 个）
│   │   │   ├── chartsAside/    # ECharts 图表侧边栏
│   │   │   ├── ColAndHistory/  # 采集历史组件
│   │   │   ├── viewSetting/    # 视图设置
│   │   │   ├── title/          # 标题栏组件
│   │   │   ├── aside/          # 侧边栏
│   │   │   ├── Drawer/         # 抽屉组件
│   │   │   ├── num/            # 数值显示组件
│   │   │   └── EquipStatus/    # 设备状态组件
│   │   ├── util/
│   │   │   ├── echarts.js      # ECharts 按需引入入口
│   │   │   ├── portConfig.js   # 端口配置
│   │   │   ├── constant.js     # 常量定义
│   │   │   ├── util.js         # 工具函数
│   │   │   └── disposeThree.js # Three.js 资源清理工具
│   │   ├── scheduler/
│   │   │   └── scheduler.js    # 渲染调度器
│   │   ├── api/
│   │   │   └── request.js      # axios 请求封装
│   │   ├── library/
│   │   │   └── playback/       # 回放功能库
│   │   └── locale/             # i18n 国际化资源
│   ├── index.html              # Vite 入口 HTML（从 public/ 移出）
│   ├── vite.config.js          # Vite 构建配置
│   ├── config/                 # 旧 CRA 配置（保留备用）
│   └── package.json
├── backend/                    # 独立后端服务（备用）
│   └── index.js
├── test/
│   └── portFinder.test.js      # 端口分配单元测试
├── scripts/
│   └── migrate_remarks.py      # 数据迁移脚本
└── swagger.yaml                # API 文档
```

### 关键目录说明

| 目录 | 主要功能 |
| :--- | :--- |
| `/server` | 后端核心服务，模块化拆分为 api、websocket、serial、services |
| `/client/src/components` | 可复用的 UI 组件，包含 14 个 Three.js 3D 可视化组件 |
| `/client/src/page` | 页面级组件：test（主页）、data（数据）、equip（设备管理） |
| `/client/src/hooks` | 自定义 React Hook，封装 WebSocket、矩阵数据等核心逻辑 |
| `/client/src/store` | zustand 状态管理 |
| `/util` | 后端通用工具：端口管理、数据库、日志、加密等 |
| `/client/src/util` | 前端通用工具：echarts 按需引入、端口配置、Three.js 清理 |

## 4. 核心模块与数据流

### 4.1. 模块关系图 (Mermaid)

```mermaid
graph TD
    A[Electron 主进程<br/>index.js] -->|fork| B[后端服务<br/>serialServer.js]
    A -->|BrowserWindow| C[前端 React<br/>client/src]

    B --> B1[state.js<br/>全局状态]
    B --> B2[SerialManager<br/>串口管理]
    B --> B3[WebSocket<br/>ws + msgpack]
    B --> B4[API Routes<br/>Express REST]
    B --> B5[DataService<br/>数据服务]
    B --> B6[db.js<br/>SQLite WAL]

    B2 -->|串口数据| B1
    B1 -->|状态变更| B3
    B5 -->|structuredClone| B3
    B4 -->|查询| B6
    B5 -->|存储/导出| B6

    C --> C1[useWebSocket<br/>连接管理]
    C --> C2[useMatrixData<br/>矩阵处理]
    C --> C3[equipStore<br/>zustand + shallow]
    C --> C4[Three.js 组件<br/>14个 + disposeThree]
    C --> C5[ECharts 图表<br/>按需引入]

    B3 -->|MessagePack/JSON| C1
    C1 -->|消息分发| C2
    C2 -->|状态更新| C3
    C3 -->|shallow 比较| C4
    C3 -->|shallow 比较| C5

    A -->|portFinder| D[端口管理<br/>allocatePorts + listenWithRetry]
    D -->|env vars| B
    D -->|env vars / __PORTS__| C
```

### 4.2. 主要数据流

1. **实时数据采集流程**
    - 硬件传感器 → 串口 → `SerialManager`（解析数据包）→ `state.js`（更新全局状态）→ `DataService`（`structuredClone` 深拷贝）→ `WebSocket`（MessagePack 二进制 / JSON 广播）→ `useWebSocket` Hook（自动解码）→ `useMatrixData` Hook（处理矩阵数据）→ `zustand store`（`shallow` 比较更新）→ React 组件（`memo` 优化，按需重渲染）→ Three.js 3D 可视化 / ECharts 图表

2. **历史数据回放流程**
    - 前端发起回放请求 → `API Routes` → `DataService`（从 SQLite 读取）→ 定时器逐帧推送 → `WebSocket` 广播 → 前端渲染

3. **端口分配流程**
    - 主进程 `allocatePorts()` 检测可用端口 → 环境变量传递给子进程 → `listenWithRetry()` 二次保障 → `process.send` 回传实际端口 → 前端通过 `window.__PORTS__` 或 `REACT_APP_*_PORT` 获取

4. **历史数据页签交互状态流**
    - `ColAndHistory` 在“本地数据 / 导入数据”页签之间共享删除、下载等操作态；切换页签前统一重置 `operateStatus`、`selectArr` 和 `contrastArr`，避免编辑/选择状态跨页签残留

5. **底部控制栏与抽屉层级**
    - `ColAndHistory` 的底部固定控制层需要低于右侧历史抽屉；`colAndHContent` 保持在画布之上但低于 `Drawer`，避免抽屉底部“存储路径”等交互区被遮挡

6. **3D 单视图控制器对焦**
    - `ThreeAndCarPointV2` 的单独靠背/坐垫模式保留原有 `reset + move` 动画流程；在 tween 完成后会把期望旋转中心投影到当前相机视线方向上，再用该投影点更新 `TrackballControls.target` 与缩放基准，从而尽量贴近当前对象旋转，同时保持画面尺寸与位置不突变
    - 整体模式的默认 reset 基准只在初始化整体视图时写入一次；切换到单独靠背/坐垫或切回 `all` 后，后续的无视觉位移对焦不会覆盖这个默认基准，从而保证下一次切换模式时仍然能从整体视图起播动画
    - 在整体模式下，初始加载和切回 `all` 视图后会将座椅模型、坐垫点阵、靠背点阵的联合包围盒中心投影到当前视线，再无视觉位移地同步到 `TrackballControls.target`，使左键旋转围绕整体对象而不是场景原点

7. **非正方形矩阵框选有效区**
    - `BrushManager` 不再把整个 `.canvasThree` 都视为可框选区域；会根据当前系统与 `displayType` 读取 `systemPointConfig`，计算真实矩阵在画布中的有效矩形
    - 对 `endi-back` 这类非正方形矩阵，框选起点和最终框选区域都必须完整落在真实矩阵区域内；例如靠背按 `50 x 64` 有效区判定，而不是整个正方形 canvas
    - 当用户在有效区外起框或框选越界时，统一提示“请在有效区域框选”
    - 框选视觉样式统一由 `newSelecttBox.js` 输出：边框使用提亮后的显示色，填充层单独使用半透明色值，避免整块元素 `opacity` 把边框一起压暗

8. **更新日志双轨维护**
    - 根目录 `CHANGELOG.md` 维护面向仓库的 Markdown 版本记录，用于汇总每个版本的文字说明
    - `client/src/page/equip/changeLog/ChangeLog.js` 维护应用内时间线展示，版本号与日期需要和根目录 changelog 保持同步

9. **打包版本元数据**
    - Electron 安装包依赖根目录 `package.json` 的 `version` 字段，必须是合法 SemVer；诸如 `endi1.0.1` 这类业务前缀版本不能直接用于 `electron-builder`
    - 前端界面显示版本由 `client/src/util/version.js` 的 `APP_VERSION` 单独维护，因此可以保留业务展示版本，同时将打包元数据保持为合法的 `1.0.1`
    - 打包配置中的 `npmRebuild` 已显式关闭，避免 `electron-builder` 在本机已有 N-API 预编译二进制时仍强制重编 `sqlite3` / `serialport`，从而被缺失的 VS C++ 工具链阻塞

10. **本地串口缓存写入路径**
    - `serial_cache.json` 在开发模式下仍写入项目根目录，保持现有调试习惯不变
    - 打包后主进程会将 `SERIAL_CACHE_PATH` 传给后端子进程，统一落到 Electron `userData` 目录下的 `serial_cache.json`，不再尝试写入只读的 `app.asar`
    - `serialCache.writeCache()` 在落盘前会自动创建父目录，确保首次启动时缓存目录不存在也能正常写入

11. **本地 CSV 导入校验与列表去重**
    - `/uploadCsv` 保存后通过 `validateImportedCsv` 校验导出结构，必须包含 `sec(s)`、`time`、原始数据矩阵列和同前缀统计列；矩阵数组长度需匹配 32x32、46x46、50x64 或 4096 等受支持点阵，并且所有元素为数字
    - 校验失败会删除临时上传文件并返回“数据有误”，避免无效 CSV 进入本地导入列表；`/getCsvData` 改为等待 CSV 读取完成并处理读取错误
    - `ColAndHistory` 的导入列表从 `localStorage` 读取、上传追加和删除时统一按路径去重，切换页签和上传/删除后清空操作态，避免重复渲染和复选状态残留

12. **回放框选与采集翻转方向一致性**
    - `/getDbHistoryIndex` 拖动进度条时复用 `getPlaybackSnapshot()` 构造帧数据，和正常播放一样注入 `historySelectCache`，避免拖动时回退展示完整原始数据
    - 前端画布翻转后会通过 `/setDataDirection` 同步当前方向；`/startCol` 也会携带采集开始时的方向，后端保存每帧前按该方向翻转矩阵并写入 `dataDirection`
    - `useMatrixData` 渲染历史帧时比较“帧保存方向”和“当前显示方向”，只做差异翻转，避免已按翻转方向保存的数据在回放时被二次翻转
    - 2026-05-15 起，`/setDataDirection` 会把方向写入后端 `data_direction.json`，服务启动时加载；实时 WebSocket 输出也由后端按该方向转换并写入 `dataDirection`，前端只同步方向状态，不再只依赖本地画布翻转。多矩阵系统使用 `byKey` 分别记录 `${system}-back` 与 `${system}-sit` 的方向，当前工具提供坐垫上下翻转、坐垫左右翻转、坐垫 90 度旋转和靠背左右翻转，未命中的矩阵不继承本次翻转状态。

13. **座椅模型亮度与采集控件字号**
    - `ThreeAndCarPointV2` 为座椅 GLB 模型增加环境光、半球光、主补光，并在加载后统一处理贴图色彩空间、材质颜色、粗糙度和轻量自发光，降低黑场下模型发暗的问题
    - `ColControlV2` 将“数据采集”/采集计时文字从 `fs16` 调整为 `fs14`，与右侧“历史数据”入口字号保持一致

14. **一键连接与重连异常处理**
    - `SerialManager` 为 `/connPort` 和 `/rescanPort` 增加连接生命周期锁，防止连续点击导致重复连接；锁超过最大生命周期后会释放陈旧任务，避免界面长期卡在连接中
    - `/connPort` 总体连接超时控制为 20 秒，前端标题栏请求超时为 15 秒；后端扫描、波特率探测、稳定打开、MAC 读取和类型授权识别均按阶段返回结构化错误
    - `/rescanPort` 不再只清理死端口或僵尸端口，而是先完整释放旧串口、parser、监听器、缓存和发送定时器，再重新扫描连接，避免仍打开的旧端口被跳过
    - MAC/type/auth 校验失败的设备会立即关闭对应串口并从运行态移除；只有通过识别和授权的设备才绑定数据处理器并进入采集链路
    - 前端 `Title` 根据 `HttpResult.code` 和 `data.success` 判断真实连接结果，失败时进入 `failed` 状态并显示后端中文错误；`useWebSocket` 同步 `connectResult/macInfo`，保证异步连接结果和按钮状态一致

15. **框选矩阵坐标与分析解耦**
    - `BrushManager` 在拖拽、缩放、键盘移动和手动输入创建区域时同步生成 `matrixKey` 与 `matrixRect`，框选保存和统计优先使用矩阵坐标，不再依赖 DOM 像素反推
    - 框选仅在可解析矩阵配置的 2D 数字视图启用；起点、终点、拖动、缩放和手动输入都会校验有效矩阵范围、正尺寸和最多 4 个区域
    - 坐垫/靠背或系统类型切换时清空当前框选，避免旧坐标套用到不同矩阵；回放查询和实时统计按区域绑定的 `matrixKey` 选择对应数据源
    - 采集开始时只把框选作为可选分析方案元数据保存，仍然保存全量矩阵；导出统计修复全零框选时最小值为 `Infinity` 的异常
    - `SelectSet` 支持框选区域命名，名称会进入实时统计、图表图例、采集备注和回放筛选元数据，便于区分“左侧坐垫”“腰托区域”等实验区域
    - 框选模板以 `localStorage.selectionTemplatesV1` 保存，只持久化区域名称、坐标、颜色、设备 key、显示对象和矩阵尺寸，不保存原始压力矩阵、帧数据或统计结果
    - 模板应用严格匹配 `deviceType/displayType/matrixWidth/matrixHeight`，已有框选时通过确认弹窗覆盖；删除模板只移除本地模板，不清空当前画布区域

16. **数据对比 A/B 分析**
    - `ColAndHistory` 在历史数据面板新增 A/B 对比选择入口，只允许从本地历史记录选择两条不同记录进入对比，CSV/实时对比仍不进入 V2.0 P0。
    - `/getContrastData` 负责读取两条历史全量矩阵、校验记录非空、A/B 不同，并按双方共同存在且尺寸一致的矩阵 key 建立可比范围；一条记录同时包含坐垫/靠背而另一条只包含其中之一时，只对共同矩阵进入对比。
    - 对比视图由 `NumThresContrast` 和 `ContrastHeatmap` 渲染 A 基准图、B 对比图、`B-A` 红蓝差值图；跨记录回放使用 A/B 独立帧滑条，播放时两边各自按帧号同步递增，较短数据到末帧后保持末帧，避免按百分比重采样造成错位。
    - 指标表在前端按当前帧计算 A、B、差值和变化率；当前对比页统计范围固定为全量矩阵，框选模板管理不再嵌入右侧对比栏。
    - 压力/面积变化曲线由 `NumThresContrast` 从完整帧序列逐帧计算统计值，避免仅依赖预存趋势数组导致曲线展示不完整。
    - `Test` 在 `display='contrast'` 时继续复用主页 `Title` 的一级 header，但通过 `hideSecondTitle` 隐藏二级工具栏，并隐藏 `ViewSetting`、`ColAndHistory` 和 `ChartsAside`，让对比页独占主体视图；`contrast.scss` 将对比页整体下移到 header 下方并使用 Grid 布局承载三图、进度条、曲线和指标表，避免其它分析数据与对比内容叠加。
    - `/getContrastData` 新增 `mode='single_record_frame'` 分支，支持同一条历史记录内选择时间点 A/B 进行差值对比；服务端复用历史帧、校验至少 2 帧有效矩阵，并在帧数据中携带 `_timestamp` 供前端滑动时间点时同步显示时间。
    - `ColAndHistory` 的对比入口新增“跨记录 / 同记录时间”模式切换；同记录时间模式只允许选择一条历史记录，进入 `NumThresContrast` 后由两个独立帧滑块选择 A/B 时间点，禁止 A/B 选择同一帧。
    - `ContrastHeatmap` 改为按靠背/座椅 2D 数字矩阵同款视觉绘制：A/B 图使用 `jetWhite3NoWhite`、白色数字、格线和 `NUMBER_TEXT_COLOR_ALPHA`；`endi-back` 无效补 0 区域复用 `endiBackVisibleMask` 隐藏。差值图保留红蓝差值语义，但同样使用格子和数字展示。
    - 对比热力图支持鼠标悬停 5x5 放大镜矩阵，按当前鼠标所在格子居中展示周围 25 个点，沿用 A/B 或差值图的颜色、数字和靠背有效区隐藏规则。
    - 同记录时间点对比下，压力/面积曲线不再绘制两条完全重合的 A/B 曲线；改为单条历史趋势线，并用 A/B 垂直标记显示当前两个时间点在趋势中的位置。跨记录对比仍保留 A、B、B-A 三条曲线。
    - 数据对比页布局按新版 UI 调整为深蓝驾驶舱式 Grid：顶部导航、状态卡、数据洞察、对象条、三矩阵主区、播放条、双曲线和汇总表分区展示；右侧区域管理栏已移除，主对比区占满可用宽度。
    - 压力/面积曲线补齐坐标系细节：SVG 内绘制横纵轴、网格线、X/Y 刻度、单位和曲线说明，并放大绘图区高度以贴近新版 UI 的全宽趋势图表达。
    - 数据汇总对比表新增说明文案；`B-A` 差值和变化率按正负值显示红/绿/灰状态，变化率附带上升/下降/持平箭头，便于直接识别指标方向。
    - 新版 UI 细节继续补齐：对比页内 Ant Design 按钮、下拉框、输入框统一覆盖为暗色蓝色样式；曲线说明移动到图表标题区并使用彩色点突出曲线含义；热力图卡片和播放控制条增加右上角放大 icon；汇总表说明合并到标题行。
    - 热力图右上角放大 icon 具备实际交互：点击后打开暗色全屏弹窗，用更大的矩阵画布展示当前 A/B/差值热力图，并继续保留 5x5 鼠标悬浮放大镜，便于查看细节。
    - 数据对比页继续细化新版视觉层级：对比对象下拉框增加蓝色高亮边框和箭头；顶部状态卡、数据洞察、播放条、右侧配置分组、图表线条/坐标和汇总表差值/变化率统一加强边框、阴影、颜色和可读性。

17. **2D 数字显示基线恢复**
    - `NumThreeColorV2/V3/V4` 与 `NumThres` 恢复为当前分支修改前的 2D 数字显示实现；数字纹理字体回到固定 `40px/32px` 策略，不再使用动态字号、格内裁剪和黑色描边。
    - 2D 数字渲染前对压力值做 `Number -> Math.round -> 0..255` 归一化，保证用于 UV 偏移和放大镜展示的原始值为整数，避免小数导致贴图采样偏移。

18. **回放图表数据源修复**
    - `ChartsAside` 在回放模式下优先使用历史接口返回的 `historyChart.pressArr/areaArr` 生成曲线，不再依赖实时 `chartRef.current` 已存在。
    - 仅在实时数据路径使用当前帧 `boxStats` 生成框选多曲线，避免回放曲线被旧实时帧或空实时帧跳过。

19. **采集中方向口径锁定**
    - 根据主 PRD 的数据处理规则，采集开始后通过 `useEquipStore.collecting` 记录全局采集状态，采集结束或失败时释放。
    - 画布翻转入口在采集中会拦截并提示“采集中禁止翻转，请停止采集后再修改方向”，避免同一次采集内出现不同显示方向口径。

20. **CSV 导出 metadata 与接口兼容**
    - CSV 导出新增 `csv_format_version`、`record_id`、`system_type`、`matrix_key`、矩阵尺寸、采样率、数据方向和置零状态字段，满足 PRD 对导出数据可追溯的要求。
    - 后端新增标准 `/download` 接口并保留旧 `/downlaod` 兼容路径，前端导出调用切换到 `/download`。

21. **工具与方向状态完善**
    - 前端方向状态扩展为兼容 `left/up + byKey` 结构，支持坐垫/靠背等多矩阵对象独立保存上下/左右翻转方向，并写入 `localStorage` 持久化。
    - 采集入库按矩阵 key 读取方向并写入每个矩阵帧的 `dataDirection`，CSV metadata 可分别反映坐垫/靠背方向。
    - 新增 `noCompleted.md` 按分类维护功能完成度，未完成项置顶，后续 PRD 对齐时持续更新。

22. **MAC 配置强校验**
    - 新增 `util/deviceConfigValidation.js` 统一校验 MAC/Unique ID、设备类型、重复配置和设备大类推断，后端 `/cache/devices` 写入前必须通过校验。
    - 新增 `/cache/devices/bulk` 批量保存接口，先整体验证再清空并写入 `serial_cache.json`，避免前端逐条写入导致部分成功、部分失败。
    - `MacConfig` 页面在输入时实时解析并展示错误，保存前拦截格式错误、重复 MAC/Unique ID 和不支持的设备类型，支持冒号分隔 MAC 与硬件返回的连续十六进制 Unique ID。

23. **设备数据接收与处理质量状态**
    - `SerialManager` 增加数据质量统计，按端口/设备记录 `rawFrame`、`rawPointArray`、坏帧总数、连续坏帧、1 秒坏帧率、采样率异常和最后错误信息。
    - 未识别帧长度、空帧、矩阵尺寸不匹配会被记录为异常帧；连续 10 帧异常或矩阵尺寸错误会进入 `device_error`，并通过 WebSocket 推送 `dataQuality`。
    - `DataService.parseData` 在实时 payload 中附加 `sampleRateHz`、`frameIntervalMs`、`matrixMeta` 和 `dataQuality`，并在采集入库时跳过 `device_error/matrix_error/offline` 帧，避免异常帧污染历史数据。
    - 前端 `useWebSocket` 和 `useMatrixData` 消费 `dataQuality`，对数据不稳定或设备数据异常进行节流提示，并将连续异常同步为 `deviceError` 连接状态。

24. **连接后展示视图规则**
    - `client/src/util/displayMapping.js` 统一 3D 点图/模型颜色映射：颜色上限仅作为颜色饱和上限，超过上限的数据按最大颜色显示，不修改原始矩阵值。
    - `filter` 只作为无效点显示阈值，低于阈值的点在 `ThreeAndCarPointV2` 中隐藏；颜色上限不再承担隐藏阈值，避免调高颜色上限导致点位错误消失。
    - `CanvasMemo`、`ThreeAndCar`、`ThreeAndModel`、`ThreeAndCarPoint`、`ThreeAndCarPointV2` 渲染颜色时仅传入裁剪后的显示值，采集、统计、回放和 CSV 导出仍使用原始数据链路。
    - `ViewSetting` 在连接后切换坐垫/靠背 2D 或 3D 视图时检查 `displayStatus`，缺少对应矩阵数据时提示并阻止切换；3D 数字视图本次未纳入调整。

25. **连接后功能工具模块**
    - 方向状态从 `left/up` 扩展为 `left/up/rotateDegree/data_direction`，并继续支持 `byKey`，坐垫和靠背可分别保存上下翻转、左右翻转和 0/90/180/270 度累计旋转。
    - `SecondTitle` 的画布翻转下拉增加“顺时针旋转90°”，`IconAndTextAndSelect` 在采集中统一拦截翻转/旋转，避免同一次采集出现方向口径变化。
    - `DataService.storageData` 采集入库前按当前方向修正业务矩阵，写入 `dataDirection`、`matrixMeta` 和旋转后的矩阵尺寸；CSV 导出新增 `rotate_degree`、`data_direction`。
    - 预压力置零从纯前端展示状态升级为后端采集口径：前端点击置零时通过 `/setZeroBaseline` 同步当前基线，后端入库前扣减基线并写入 `zeroState`，CSV 导出 `zero_enabled/zero_time/zero_state`。
    - `newRuler` 将量尺数量限制为最多 8 条，按当前设备点距计算直线距离并默认以 cm 显示，超限时提示。

26. **采集、历史数据、回放与导出对比**
    - 回放通过 `validatePlaybackFrameData()` 校验历史帧，空帧、矩阵缺失、矩阵长度不匹配和非法数值会自动跳过；连续 10 个异常帧会停止回放并返回 `playError`，避免损坏历史导致软件崩溃。
    - 回放倍速限制为 PRD 指定的 `0.5x/1x/2x/4x`，后端 `changePlaySpeed()` 对非法倍速回退到 1x。
    - CSV 导出在保留旧中文业务列的同时新增标准字段：`software_version`、`device_mac`、`device_type`、`frame_index`、`timestamp`、`pressure_unit`、`pressure_conversion`、`noise_removed`、标准指标列和 `selection_1_*` 框选派生字段。
    - CSV 导出改为单条历史记录只生成一个文件；坐垫和靠背数据按行合并在同一 CSV 内，通过 `matrix_key/device_type` 区分，避免导入时需要处理同一批次的多文件关联。
    - carY 导出增加 `pressure_conversion=carY_100_div_3` 和说明字段，标明其展示、统计、采集和导出的换算口径。
    - 数据对比页从 A/B/差值调整为 A/差值/B 三栏，新增分析范围状态条、当前帧结论摘要、固定红蓝图例、差值范围提示、压力/面积趋势曲线和当前对比结果 CSV 导出。
    - 按《框选与数据对比界面体验优化方案》补齐对比页右侧区域管理栏：支持全量/框选区域显式切换，显示框选坐标、压力差、面积差和导出预览；状态条补充当前帧、采样率、置零与方向口径。
    - Designer 视角体验继续增强：实时/回放 2D 框选面板复用历史数据同款 `Drawer` 右侧抽屉，不遮挡主画布；框选画布拖拽/移动/缩放时显示行列范围与尺寸提示，框选编号在画布、区域列表和对比侧栏保持一致；差值图内部固定显示红/灰/蓝图例和当前差值范围。
    - 公共 `Drawer` 通过 `createPortal` 挂载到 `document.body`，避免被各自父级 stacking context 固定层级；打开和点击时自动提升层级，多个抽屉同时存在时最近点击的抽屉处于最上层；框选监听仅响应 2D canvas 点击，点击抽屉、工具栏、底部控制区、弹窗或普通页面区域不会误触发“请在有效区域框选”。
    - 实时框选控制点优化：移除框内编号避免遮挡矩阵，右上角删除按钮改为项目统一关闭 iconfont 并独立外置，避免和右上缩放手柄重叠。
    - 2026-05-15 起，框选工具从右侧抽屉恢复为标题栏下方小浮窗；退出框选时若存在区域，会先询问是否保存为模板，保存后写入本地模板再关闭。
    - 框选小浮窗会读取当前 2D 数字矩阵 `.canvasThree` 的实际边界并定位到矩阵右侧，同时避让右侧 `DraggablePanel` 图表面板；空间不足时优先收窄或下移，避免遮挡数字矩阵和右侧图表可视化。
    - 数据采集入口与当前框选解耦，不再把框选随 `/startCol` 或 `upsertRemark` 写入历史备注，采集只保存完整矩阵数据和采集参数。
    - 回放帧通过 `processSensorFrame(..., { source: 'playback' })` 进入前端矩阵处理链路，只更新显示和统计，不覆盖实时设备在线状态；退出回放/对比时 `/cancalDbPlay` 清理历史状态并主动推送一帧实时数据，避免传感器仍连接但 UI 显示未连接。

27. **3D 视角切换角度**
    - `ViewSetting` 的 3D 视角切换统一维护 `0/1/2` 三档序号，切换整体/靠背/座椅显示对象时重置到 0° 初始位置。
    - `ThreeAndCarPointV2.changePointRotation()` 将每档步进固定为 45°，因此靠背或座椅单独选中后点击视角切换时按 0°、向里 45°、向里 90°循环。

## 5. API 端点 (Endpoints)

| 方法 | 路径 | 描述 |
| :--- | :--- | :--- |
| `GET` | `/` | 健康检查 |
| `GET` | `/getSystem` | 获取系统配置 |
| `POST` | `/selectSystem` | 选择系统类型 |
| `POST` | `/changeSystemType` | 切换系统类型 |
| `GET` | `/getPort` | 获取可用串口列表 |
| `GET` | `/connPort` | 一键连接（波特率探测+连接+MAC识别一体化） |
| `GET` | `/rescanPort` | 重新连接（清理死端口/僵尸设备后重连） |
| `GET` | `/stopPort` | 断开所有串口连接 |
| `GET` | `/sendMac` | 发送 MAC 地址绑定（保留兼容） |
| `POST` | `/startCol` | 开始数据采集 |
| `POST` | `/setDataDirection` | 同步并持久化当前翻转方向，供实时输出和采集保存统一按显示方向转换 |
| `GET` | `/getDataDirection` | 获取后端持久化的当前翻转方向，供前端初始化同步 |
| `POST` | `/setZeroBaseline` | 同步预压力置零基线，供采集保存和 CSV 导出记录置零口径 |
| `GET` | `/endCol` | 结束数据采集 |
| `GET` | `/getColHistory` | 获取采集历史列表 |
| `POST` | `/getDbHistory` | 获取数据库历史记录 |
| `POST` | `/copReportData` | 获取历史 COP PDF 报告所需的历史帧、矩阵 key、备注与框选区域数据 |
| `POST` | `/getDbHistorySelect` | 获取历史记录（带筛选） |
| `POST` | `/getContrastData` | 获取 A/B 对比数据并完成可比性校验；支持跨记录对比与同记录双时间点对比 |
| `POST` | `/getContrastIndex` | 按帧号获取 A/B 对比帧；支持传入独立 `leftIndex` / `rightIndex` |
| `POST` | `/getDbHistoryPlay` | 开始历史数据回放 |
| `POST` | `/getDbHistoryStop` | 停止历史数据回放 |
| `POST` | `/cancalDbPlay` | 取消回放 |
| `POST` | `/changeDbplaySpeed` | 修改回放速度 |
| `POST` | `/getDbHistoryIndex` | 获取历史数据指定帧 |
| `POST` | `/downlaod` | 导出 CSV 数据 |
| `POST` | `/delete` | 删除历史记录 |
| `POST` | `/changeDbName` | 修改数据库记录名称 |
| `POST` | `/changeDbDataName` | 修改数据记录名称 |
| `POST` | `/upsertRemark` | 新增/更新备注 |
| `POST` | `/getRemark` | 获取备注 |
| `POST` | `/bindKey` | 绑定授权密钥 |
| `POST` | `/uploadCsv` | 上传并校验本地 CSV，结构不匹配时返回“数据有误” |
| `POST` | `/getCsvData` | 获取 CSV 格式数据 |
| `POST` | `/getSysconfig` | 获取系统配置 |
| `GET` | `/cache/device-types` | 获取 MAC 配置允许的设备类型 |
| `POST` | `/cache/devices/bulk` | 批量校验并保存 MAC/Unique ID 到设备类型映射 |

## 6. 外部依赖与集成

| 服务/库 | 用途 | 集成方式 |
| :--- | :--- | :--- |
| serialport | 硬件串口通信 | Node.js 原生模块 |
| electron | 桌面应用容器 | 主进程框架 |
| electron-builder | 应用打包分发 | 构建工具 |
| three.js | 3D 压力矩阵可视化 | 前端组件 |
| echarts | 折线图表 | 前端按需引入 |
| crypto-js | 配置文件 AES 加密 | 后端工具 |
| i18next | 国际化 | 前端多语言 |

## 7. 环境变量

| 变量名 | 描述 | 示例值 |
| :--- | :--- | :--- |
| `NODE_ENV` | 运行环境 | `development` / `production` |
| `API_PORT` | 后端 API 服务端口 | `19245` |
| `WS_PORT` | WebSocket 服务端口 | `19999` |
| `REACT_APP_API_PORT` | 前端 API 端口（开发模式） | `19245` |
| `REACT_APP_WS_PORT` | 前端 WebSocket 端口（开发模式） | `19999` |
| `REACT_APP_SERVER_ADDRESS` | 服务器地址 | `localhost` |
| `LOG_LEVEL` | 日志级别 | `debug` / `info` / `warn` / `error` |
| `isPackaged` | 是否为打包环境 | `true` / `false` |

## 8. 项目进度

> 记录项目从开始到现在已经完成的所有工作，每次新增追加到末尾。

| 完成日期 | 完成的功能/工作 | 说明 |
| :--- | :--- | :--- |
| 2026-03-01 | 核心功能开发 | 串口通信、数据采集、3D 可视化、历史回放、CSV 导出等核心功能 |
| 2026-03-01 | 端口冲突修复 | portFinder 动态分配、listenWithRetry 二次保障、环境变量传递 |
| 2026-03-01 | Windows spawn 修复 | 修复 React dev server 启动时 spawn EINVAL 错误 |
| 2026-03-01 | 工程化基础 | 添加 .gitignore、清理 copy 文件、重命名为有意义的文件名 |
| 2026-03-01 | 后端模块化重构 | serialServer.js 拆分为 state/websocket/serial/services/api 五个模块 |
| 2026-03-01 | db.js 优化 | 修复 JSON.parse 冗余、清理死代码、提取通用函数 |
| 2026-03-01 | 前端 Hook 封装 | 创建 useWebSocket、useMatrixData Hook，Test.js 从 1499 行精简到 272 行 |
| 2026-03-02 | Three.js 内存泄漏修复 | 14 个组件全部添加 disposeThree 资源清理 |
| 2026-03-02 | 后端性能优化 | structuredClone 替换深拷贝、SQLite WAL 模式 |
| 2026-03-02 | WebSocket 二进制传输 | 支持 MessagePack 双模式，体积减少 70-80% |
| 2026-03-02 | React 渲染优化 | 10 个组件添加 React.memo，zustand shallow 比较 |
| 2026-03-02 | 打包优化 | Webpack splitChunks、echarts 按需引入、统一日志模块 |
| 2026-03-06 | 前端迁移到 Vite | CRA/Webpack → Vite 5，启动 ~200ms，HMR <100ms |
| 2026-03-09 | WebSocket 调试工具 | 在 useWebSocket Hook 中添加 WS 数据打印调试功能，支持开关、过滤、计数、查看最近消息 |
| 2026-03-09 | 框选工具优化 | 框选边框颜色加深（红色 3px），支持同时框选多个区域 |
| 2026-03-09 | 靠背线序旋转 | endiBack / endiBack1024 输出数据旋转 180 度 |
| 2026-03-09 | 框选交互优化 | 统一框选颜色，支持单击选中/取消，选中时显示框选区域面板（可缩小/关闭） |
| 2026-03-09 | 功能面板优化 | 压力曲线/面积曲线/重心曲线/正态分布面板可拖拽、缩放、置顶，不可关闭 |
| 2026-03-09 | DraggablePanel 缩放范围 | 缩放范围从 50%-200% 扩展到 10%-1000%，动态步长 |
| 2026-03-09 | 3D 视角切换统一 | 整体/坐垫/靠背模式视角切换逻辑统一，整体模式下视角切换不再禁用 |
| 2026-03-09 | 3D 边缘外框 | 坐垫/靠背单独模式下显示有效识别范围边缘外框（青色 LineLoop） |
| 2026-03-09 | 删除编辑图标 | 历史数据面板中删除重命名图标 |
| 2026-03-09 | 版本号 V0.0.3 | 新增临时软件版本号，显示在底部工具栏右侧 |
| 2026-04-17 | MAC 地址本地配置 | 新增 MacConfig 页面（黑色主题单输入框），MAC→类型映射持久化到 serial_cache.json，启动自动检测，右上角设置按钮跳转 |
| 2026-04-17 | 3D 缩放等比例优化 | 缩放改为等比例（×1.1/÷1.1），范围 10%~300%，消除阶梯跳跃卡顿 |
| 2026-04-17 | 连接逻辑全面优化 | 一键连接合并 connPort+sendMac；新增 rescanPort（清理死端口+僵尸设备+重连）；新增 stopPort（断开所有串口）；波特率帧长度双重验证；连接重试 3 次；前端重连/断开按钮；5 秒防抖 offline 检测 |

| 2026-04-17 | 3D 透视视角缩放修复 | 新增 `threeZoom` 公用缩放工具；按钮/滚轮缩放改为基于相机到 `controls.target` 的真实距离，保留当前透视角和当前模式，不再因 `+/-` 重置整体视图 |

| 2026-04-17 | 3D 缩放交互提速 | 按钮缩放取消补间动画，改为即时到位，减少点击放大/缩小时的拖滞感 |

| 2026-04-17 | CSV 导出文件名区分修复 | 导出文件名改为保留系统类型与 back/sit 区分，并在存在别名时仍附带原始记录时间，避免多文件导出时不易区分或发生同名覆盖 |

| 2026-04-17 | 3D 缩放状态同步修复 | 按钮缩放前先同步 `TrackballControls` 的缩放/平移/旋转残留状态，避免 `+/-` 后首次滚轮缩放出现反向跳动 |

| 2026-04-17 | 3D 缩放百分比实时同步 | 缩放百分比改为监听 `TrackballControls` 的 `change` 事件实时计算，阻尼尾段继续运动时显示值也跟随真实相机距离更新 |

| 2026-04-17 | 3D 点位调参后动画修复 | `ThreeAndCarPointV2` 将 group/chair/tween 状态改为 ref 持有，并让座椅/靠背动画恢复读取当前调参值，避免改 pointSize/scale 后切换动画失效 |
| 2026-04-20 | 历史数据页签状态重置 | `ColAndHistory` 在“本地数据 / 导入数据”切换时统一清空删除/下载选择态，避免编辑状态跨页签残留 |
| 2026-04-20 | 历史抽屉层级修复 | 下调 `colAndHContent` 层级到 `Drawer` 之下，避免右侧抽屉底部“存储路径”区域被底部控制层遮挡 |
| 2026-04-20 | 下载路径打开修复 | `ColAndHistory` 底部“打开”改为显式调用目录打开逻辑，并校验 Electron `openPath` 返回值，避免点击事件对象被误当作路径导致无法打开文件夹 |
| 2026-04-20 | 靠背2D放大镜修复 | 修复 `NumThreeColorV4` 放大镜仍引用已移除的 `jetWhite3` 导致靠背 `back2D` 放大镜失效的问题，统一回当前组件的 `jet` 颜色映射 |
| 2026-04-21 | 3D靠背视角中心修复 | `ThreeAndCarPointV2` 在单独靠背/坐垫动画完成后同步控制器目标点和 reset 基准到当前点阵中心，避免左键旋转仍围绕整体原点 |
| 2026-04-21 | 3D靠背动画后对焦修正 | `ThreeAndCarPointV2` 改为保留原 `reset + move` 动画流程，仅在 tween 完成后切换控制器目标点到靠背/坐垫中心，避免动画过程中提前改视角导致进场效果丢失 |
| 2026-04-21 | 3D整体视图旋转中心修复 | `ThreeAndCarPointV2` 在初始整体视图和切回 `all` 模式后，将控制器目标点切到座椅模型、坐垫点阵、靠背点阵的联合中心，保证左键围绕整体旋转 |
| 2026-04-21 | 3D单视图收尾跳动修复 | `ThreeAndCarPointV2` 单独靠背/坐垫模式在 tween 完成后改用点阵对象自身世界坐标作为控制器锚点，避免结束瞬间因包围盒中心偏移导致画面再跳一下 |
| 2026-04-21 | 取消单视图收尾自动对焦 | `ThreeAndCarPointV2` 撤销单独靠背/坐垫模式在 tween 完成后的自动对焦，恢复动画结束即停，避免任何额外视角跳动 |
| 2026-04-21 | 3D无跳动切换旋转中心 | `ThreeAndCarPointV2` 在单视图和整体视图的 tween 完成后，通过同步平移相机与控制器目标点的方式切换旋转中心，保证动画保留且画面不额外跳动 |
| 2026-04-21 | 3D模式切换起播基准修复 | `ThreeAndCarPointV2` 将默认 reset 视图基准固定在整体模式初始视图，避免单视图对焦覆盖默认起播相机，导致再次切换到靠背/坐垫时动画看起来不动 |
| 2026-04-21 | 3D无缩放切换旋转中心 | `ThreeAndCarPointV2` 改为把目标旋转中心投影到当前视线后再更新控制器 target，避免无跳动切换时因平移相机导致画面突然变小 |
| 2026-04-22 | 靠背框选有效区域修复 | `BrushManager` 按当前矩阵真实区域计算框选有效区，靠背 `endi-back` 改为仅允许在 `50 x 64` 真实矩阵区域内框选，越界时提示“请在有效区域框选” |
| 2026-04-22 | 框选框亮度提升 | 框选改为提亮边框色并单独使用半透明填充，避免整块透明度导致边框发灰，鼠标框选和输入生成的框选视觉保持一致 |
| 2026-04-22 | changelog 补充同步 | 将“框选框亮度提升”同步补入根目录 `CHANGELOG.md` 与应用内 `ChangeLog.js`，保持版本说明与界面展示一致 |
| 2026-04-22 | 打包版本元数据修复 | 根目录 `package.json` 改为合法 SemVer `1.0.1` 以兼容 `electron-builder`，同时保留前端展示版本 `endi1.0.1` 不变 |
| 2026-04-22 | serial cache 打包写入修复 | 打包后 `serial_cache.json` 改为写入 Electron `userData` 目录，避免误写 `app.asar` 导致 ENOENT；同时默认关闭打包阶段原生模块重编 |
| 2026-04-29 | 本地 CSV 导入校验与列表去重 | 导入 CSV 必须满足软件导出结构才允许进入本地列表；历史面板导入列表统一去重并在切换/上传/删除后清空操作选中态 |
| 2026-04-29 | 回放框选与采集翻转方向修复 | 拖动回放进度条时保持框选数据展示；采集保存按当前画布翻转方向落库，回放时避免重复翻转 |
| 2026-04-30 | 座椅模型亮度与采集字号优化 | 提升座椅 3D 模型灯光和材质亮度；将数据采集文字字号调整为与历史数据入口一致 |
| 2026-05-09 | 一键连接与重连异常处理优化 | 按 PRD 为连接链路补充连接锁、阶段超时、结构化错误、重连前完整资源释放和前端失败态处理 |
| 2026-05-09 | 框选矩阵坐标与分析解耦优化 | 按框选 PRD 将框选绑定到矩阵 key/矩阵坐标，补齐边界校验、视图切换清理和采集全量保存约束 |
| 2026-05-09 | 数据对比 A/B 分析 P0 | 按数据对比 PRD 实现历史 A/B 选择、可比性校验、三图展示、同步进度、差值图和指标差值/变化率 |
| 2026-05-09 | 数据对比可比范围修正 | 对比校验改为使用双方共同存在且尺寸一致的矩阵 key，避免坐垫/靠背 key 数量不完全一致时误拦截 |
| 2026-05-09 | 数据对比独占视图 | 对比模式隐藏标题栏、调节栏、历史底栏和分析侧栏，并压缩对比页布局，优先保证三图、进度和指标表一屏展示 |
| 2026-05-09 | 框选命名与模板复用 | 按框选 PRD P1 实现区域命名、本地框选模板保存、严格匹配应用、覆盖确认和删除模板；模板可在实时、回放和对比视图复用 |
| 2026-05-09 | 2D 数字白色字体显示 | 恢复 2D 数字固定 `40px/32px` 字体策略，移除黑色描边，仅保留白色数字；渲染前将数据四舍五入并限制在 0..255 |
| 2026-05-09 | 回放图表恢复 | 修复回放曲线生成依赖实时 `chartRef.current` 的问题，历史数据加载后可直接显示压力/面积曲线 |
| 2026-05-09 | 采集中方向口径锁定 | 按主 PRD 增加采集全局状态，采集中禁止画布上下/左右翻转，避免采集数据方向口径变化 |
| 2026-05-09 | CSV 导出可追溯 metadata | 按主 PRD 为 CSV 导出补充格式版本、记录 ID、系统/矩阵、采样率、方向和置零状态字段，并新增 `/download` 标准接口 |
| 2026-05-09 | 工具与方向状态完善 | 支持坐垫/靠背独立翻转方向持久化、采集按矩阵 key 写入方向，并新增 `noCompleted.md` 功能完成度跟踪表 |
| 2026-05-11 | MAC 配置强校验 | 前后端补齐 MAC/Unique ID 格式、重复项、设备类型合法性校验，并新增批量保存接口避免部分写入 |
| 2026-05-11 | 设备数据质量状态 | 按模块二 PRD 补充异常帧统计、矩阵尺寸校验、采样率异常标记、dataQuality 推送和异常帧入库拦截 |
| 2026-05-11 | 连接后展示视图规则 | 按模块三 PRD 补齐 3D 点图/模型颜色上限映射、坐垫/靠背缺数据提示，并确认缩放范围为 10%-300% |
| 2026-05-11 | 连接后功能工具模块 | 按模块四 PRD 补齐预压力置零采集/导出口径、90° 旋转方向状态、CSV 方向字段和量尺 8 条/cm 显示规则 |
| 2026-05-11 | 采集历史回放与导出对比 | 按模块六/七 PRD 补齐回放损坏帧跳过、倍速限制、CSV 标准字段、carY 换算说明，并按体验优化方案调整对比页 A/差值/B 展示、状态条、结论摘要、趋势曲线和结果导出 |
| 2026-05-11 | 框选与数据对比体验增强 | 按 brainstorm 方案补齐对比页区域管理侧栏、全量/框选范围切换、导出预览，以及当前帧、采样率、置零、方向状态反馈 |
| 2026-05-11 | Designer 视角交互反馈优化 | 按第 4 节 UX-02/UX-03/UX-05 补齐框选编号颜色一致、拖拽尺寸/行列范围提示、选中态高亮和差值图内固定图例 |
| 2026-05-11 | UX-01 右侧框选抽屉 | 实时/回放 2D 框选区域管理改为右侧抽屉，SelectSet 支持 floating/embedded 两种布局，对比页继续嵌入侧栏 |
| 2026-05-11 | 框选抽屉样式对齐 | 框选区域管理从自定义浮层改为复用历史数据 `Drawer` 容器，保证背景、宽度、边框、标题和关闭动画一致 |
| 2026-05-11 | 抽屉层级与框选误提示修复 | Drawer 点击自动置顶；框选模式下只有点击 2D canvas 才进入框选逻辑，点击普通 UI 不再弹有效区域提示 |
| 2026-05-11 | 框选控制点样式优化 | 移除框内编号避免遮挡矩阵，右上删除按钮改为统一关闭 iconfont 并独立外置，避免与缩放调节点重叠 |
| 2026-05-11 | Drawer Portal 层级修复 | 公共 Drawer 改为 portal 到 document.body，消除父级固定层级影响，保证最后点击抽屉真正置顶 |
| 2026-05-15 | 翻转方向后端持久化 | 画布翻转改为多矩阵同时作用于坐垫和靠背；后端持久化方向并在实时输出和采集入库时统一使用该方向 |
| 2026-05-15 | CSV 单文件导出 | 多矩阵历史记录导出不再拆分坐垫/靠背两个 CSV，改为合并到同一个 CSV 文件并保留 `matrix_key/device_type` 区分 |
| 2026-05-15 | 回放/对比退出状态修复与 3D 视角角度固定 | 回放帧不再覆盖设备在线状态，退出历史模式后主动推送实时帧；靠背/座椅 3D 视角切换固定为 0°/45°/90° |
| 2026-05-15 | 定向画布翻转与浮窗交互修复 | 画布翻转菜单改为坐垫上下/左右/90 度和靠背左右四项定向操作；隐藏浮窗不再响应鼠标命中且点击选项后保持展开直到鼠标移出；坐垫单独 3D 视角切换使用与靠背一致的旋转基准 |
| 2026-05-15 | 框选退出确认与采集解耦 | 框选面板恢复为标题栏小浮窗；退出框选时提示是否保存为模板；采集启动不再携带当前框选或写入框选备注 |
| 2026-05-15 | 框选浮窗避让矩阵和图表 | 框选设置区按 2D canvas 右边界动态定位到矩阵右侧，并检测右侧图表面板边界来收窄或下移，减少遮挡 |

| 2026-05-18 | 数据对比时间维度扩展 | 按时间维度调研方案新增同记录双时间点对比：历史入口支持模式切换，对比页支持 A/B 独立帧选择、同帧拦截和当前时间点导出 |
| 2026-05-18 | 数据对比热力图 2D 化 | 对比页 A/B/差值热力图改为靠背/座椅 2D 数字矩阵同款展示口径，统一格子、数字、颜色函数和靠背有效区隐藏规则 |
| 2026-05-18 | 数据对比放大镜与时间曲线 | 对比热力图新增 5x5 悬浮放大镜；同记录时间对比的压力/面积曲线改为单趋势线并标记 A/B 时间点，避免 A/B 曲线完全重合 |
| 2026-05-18 | 数据对比新版 UI | 按新版设计图重排数据对比页：新增顶部导航、状态卡、数据洞察条和对象条，主内容按三矩阵、右侧管理、播放、曲线、汇总表分区 |
| 2026-05-18 | 数据对比曲线与汇总表细节 | 压力/面积曲线补齐横纵轴、网格、刻度、单位和曲线说明；汇总表新增说明，差值和变化率按正负着色并显示上下箭头 |
| 2026-05-18 | 数据对比新版 UI 细节 | 对比页控件统一暗色化，曲线说明移入标题区并用彩色点突出，热力图和播放框补充放大 icon，汇总表说明合并到标题 |
| 2026-05-18 | 数据对比热力图放大查看 | 热力图放大 icon 支持点击打开全屏弹窗，以更大画布展示当前热力图并保留 5x5 放大镜查看细节 |

## 9. 更新日志

| 日期 | 变更类型 | 描述 |
| :--- | :--- | :--- |
| 2026-03-02 | 初始化 | 按照 update-tech-doc 技能规范创建 ARCHITECTURE.md |
| 2026-03-02 | 优化重构 | P0: 修复 14 个 Three.js 组件内存泄漏，创建 disposeThree 工具 |
| 2026-03-02 | 优化重构 | P1: structuredClone 替换深拷贝、SQLite WAL 模式、WebSocket MessagePack |
| 2026-03-02 | 优化重构 | P1: 10 个组件添加 React.memo，zustand shallow 比较 |
| 2026-03-02 | 优化重构 | P2: Webpack splitChunks 代码分割、echarts 按需引入、统一日志模块 |
| 2026-03-06 | 依赖升级 | 前端从 CRA (react-scripts/Webpack) 迁移到 Vite 5，启动速度提升 100x |
| 2026-03-09 | 新增功能 | useWebSocket Hook 添加 WS 数据打印调试工具，支持 wsDebugOn/Off/Filter/Last/Count 控制台命令 |
| 2026-03-09 | 优化重构 | 框选工具边框加深为红色 3px，支持多区域同时框选，去除单框选限制 |
| 2026-03-09 | 优化重构 | 靠背数据线序旋转 180 度（endiBack 和 endiBack1024 函数输出 reverse） |
| 2026-03-09 | 新增功能 | 框选工具支持单击选中/取消，选中时显示框选区域面板（可缩小/关闭） |
| 2026-03-09 | 新增组件 | DraggablePanel 可拖拽缩放置顶面板组件，应用于压力/面积/重心/正态分布四个功能面板 |
| 2026-03-09 | 优化重构 | DraggablePanel 缩放范围扩展到 10%-1000%，动态步长调整 |
| 2026-03-09 | 优化重构 | 3D 视角切换逻辑统一，整体模式下同时旋转 sit/back/椅子模型，单独模式与整体一致 |
| 2026-03-09 | 新增功能 | 3D 坐垫/靠背单独模式下显示有效识别范围边缘外框（青色 LineLoop） |
| 2026-03-09 | 优化重构 | 历史数据面板删除重命名图标 |
| 2026-03-09 | 新增功能 | 临时软件版本号 V0.0.3，显示在底部工具栏右侧 |
| 2026-03-09 | 优化重构 | 框选区域面板统一为带输入框样式（X/Y/长/宽可手动输入），鼠标框选后自动填入坐标，选中框可编辑修改位置 |
| 2026-03-09 | 新增功能 | 历史数据面板底部添加固定下载路径显示，支持点击跳转、修改路径（Electron 文件夹对话框 + 手动输入） |
| 2026-03-09 | 新增功能 | 下载成功后右上角弹窗提示，点击可直接打开文件，3秒自动消失 |
| 2026-03-09 | 新增接口 | 服务端新增 getDownloadPath/setDownloadPath/openFile/openFolder API |
| 2026-03-09 | 新增接口 | Electron preload 新增 selectFolder/openPath/showItemInFolder IPC 接口 |
| 2026-03-09 | 优化重构 | 隐藏右上角固定的框选区域输入面板，仅在选中框时显示编辑面板 |
| 2026-03-09 | 优化重构 | 框选限制在有效区域内（canvas 矩阵范围），有效范围外不可框选 |
| 2026-03-09 | 优化重构 | 框选支持多选模式：点击选中不互斥，可同时选中多个框并显示各自编辑面板 |
| 2026-03-12 10:30 | serial | 串口循环断开重连修复 | 修复 MAX_PORT_DATA_KEEP=2 导致3个设备同时连接时无限循环断开重连的问题 |
| 2026-03-10 23:27 | all | 新建 all 分支并恢复靠背配置 | 基于 ld 分支新建 all 分支，将3D模型整体下靠背的方位和大小恢复为 main 分支的值 |
| 2026-03-10 23:32 | all | 框选传感点数范围校验 | 框选功能添加超出传感点数范围的校验和 message 提示（鼠标框选自动计算和手动输入确认两个场景） |
| 2026-03-10 23:54 | all | 3D缩放优化 | 优化 TrackballControls 缩放参数、滚轮实时更新百分比显示、+/- 按钮智能步长对齐、缩放平滑 easeOutCubic 动画过渡 |
| 2026-03-10 23:27 | all | 配置变更 | 新建 all 分支（基于 ld），将3D模型整体下靠背的 pointConfig 方位和大小恢复为 main 分支配置（position/scale） |
| 2026-03-10 23:32 | all | 新增功能 | 框选功能添加传感点数范围校验：初始 X+长度不超过横向点数，初始 Y+宽度不超过纵向点数，超出时 message.warning 提示 |
| 2026-03-10 23:54 | all | 优化重构 | 3D场景放大缩小功能优化：TrackballControls 配置缩放参数、滚轮实时更新百分比、+/- 按钮智能步长、缩放平滑动画 |
| 2026-03-12 10:30 | serial | 修复缺陷 | 修复串口循环断开重连问题：移除 MAX_PORT_DATA_KEEP=2 限制，允许所有设备同时连接；重连监控增加 portHistory 检查防止重复检测；stopPort 完整清理状态；同端口重连后重新绑定数据处理器 |
| 2026-04-17 14:00 | ld | 新增功能 | MAC 地址配置改为本地存储：新增 MacConfig.js 黑色主题单输入框配置页面，数据持久化到 serial_cache.json（不依赖 localStorage），启动时自动检测配置，右上角设置按钮 |
| 2026-04-17 14:20 | ld | 优化重构 | 3D 模型缩放优化：等比例缩放（乘/除 1.1），范围限制 10%~300%，移除阶梯步长，TrackballControls 配置同步 |
| 2026-04-17 14:40 | ld | 优化重构 | 连接逻辑全面优化：波特率帧长度双重验证、连接重试 3 次（500ms 间隔）、僵尸检测（5s 无数据）、rescanPort 手动重连、移除自动重连监控、前端断开/重连按钮、5 秒防抖 offline 检测、WS 固定 3 秒重连 |

| 2026-04-17 19:06 | ld | 修复缺陷 | 修复 3D 透视视角下按钮/滚轮缩放异常：新增 `client/src/util/threeZoom.js`，统一按相机到 `controls.target` 的真实距离计算缩放百分比，`+/-` 缩放保留当前透视角与当前模式，不再触发整体视图重置 |
| 2026-04-17 19:13 | ld | 优化重构 | 3D 按钮缩放交互提速：`client/src/util/threeZoom.js` 默认取消 200ms 缩放补间，按钮点击改为即时缩放到目标距离，降低放大缩小拖滞感 |

| 2026-04-17 19:36 | ld | 修复缺陷 | 修复 CSV 下载文件名区分问题：`util/db.js` 导出文件名改为显式保留系统类型与 back/sit 标识，并在有别名时附带原始记录时间，避免多文件下载时难以区分或被同名覆盖 |

| 2026-04-17 19:39 | ld | 修复缺陷 | 修复 3D 按钮缩放后首次滚轮方向异常：`client/src/util/threeZoom.js` 在程序化缩放前先清空 `TrackballControls` 的 `_zoomStart/_zoomEnd` 等阻尼残留，避免放大时先缩小的反向跳动 |

| 2026-04-17 19:53 | ld | 修复缺陷 | 修复 3D 缩放百分比被阻尼拖慢的问题：新增 `client/src/util/threeZoom.js` 的 `bindZoomValueSync`，5 个 Three 视图改为监听 `TrackballControls.change` 实时同步显示百分比，不再只在滚轮事件结束后估算一次 |

| 2026-04-17 21:42 | ld | 修复缺陷 | 修复 `ThreeAndCarPointV2` 在点位配置面板调节 pointSize/scale 后座椅与靠背动画失效的问题：将 `group/chair/tween` 改为 ref 持有，避免 React 重渲染后 `actionSit` 与动画循环引用不同实例；同时切换动画与旋转基准改为读取当前配置值 |
| 2026-04-20 16:20 | 修复缺陷 | 修复 `client/src/components/ColAndHistory/ColAndHistory.js` 在“本地数据”进入删除/下载选择态后切换到“导入数据”仍保留编辑状态的问题；抽出统一状态重置逻辑并在页签切换时执行 |
| 2026-04-20 16:32 | 修复缺陷 | 修复 `client/src/components/ColAndHistory/index.scss` 中 `colAndHContent` 层级过高导致右侧历史抽屉底部“存储路径”区域被遮挡的问题；将底部控制层降到 `Drawer` 之下 |
| 2026-04-20 16:45 | 修复缺陷 | 修复 `client/src/components/ColAndHistory/ColAndHistory.js` 底部“打开”按钮无法打开文件夹的问题：避免将 React 点击事件对象误传给 `handleOpenFolder`，并对 Electron `openPath` 的失败返回值增加提示 |
| 2026-04-20 16:57 | 修复缺陷 | 修复 `client/src/components/three/NumThreeColorV4.js` 中靠背 `back2D` 放大镜配色仍调用已移除的 `jetWhite3` 导致运行时报错的问题；改回使用当前组件一致的 `jet` 映射，恢复放大镜功能 |
| 2026-04-21 11:28 | 修复缺陷 | 修复 `client/src/components/three/ThreeAndCarPointV2.js` 中单独靠背/坐垫动画切换后 `TrackballControls` 仍围绕整体原点旋转的问题：新增默认视图快照、模式切换后的 target/reset 基准同步，以及缩放基准重绑，使左键旋转中心跟随当前点阵世界坐标 |
| 2026-04-21 11:35 | 修复缺陷 | 调整 `client/src/components/three/ThreeAndCarPointV2.js` 单视图对焦时机：保留原有靠背/坐垫 `reset + move` 动画，仅在 tween 完成后把 `TrackballControls.target` 切到当前点阵中心并重绑缩放基准，恢复进场动画同时让左键旋转围绕当前对象 |
| 2026-04-21 11:50 | 修复缺陷 | 调整 `client/src/components/three/ThreeAndCarPointV2.js` 整体视图对焦逻辑：新增联合包围盒中心计算，在模型初始加载与切回 `all` 模式动画完成后，把 `TrackballControls.target` 对齐到座椅模型、坐垫点阵、靠背点阵的整体中心，并同步整体视图的 reset 基准 |
| 2026-04-21 11:58 | 修复缺陷 | 调整 `client/src/components/three/ThreeAndCarPointV2.js` 单视图收尾对焦锚点：单独靠背/坐垫模式在 tween 完成后不再取当前点阵包围盒中心，而是改用对象自身世界坐标作为 `TrackballControls.target`，减少动画结束瞬间的额外跳动 |
| 2026-04-21 12:01 | 修复缺陷 | 撤销 `client/src/components/three/ThreeAndCarPointV2.js` 单独靠背/坐垫模式的 tween 完成后自动对焦逻辑：移除单视图 `onComplete` 中对 `TrackballControls.target` 的额外切换，避免动画结束后画面仍然再动一下 |
| 2026-04-21 14:21 | 修复缺陷 | 调整 `client/src/components/three/ThreeAndCarPointV2.js` 的控制器对焦实现：新增“无视觉位移”切换逻辑，在单独靠背/坐垫与整体模式的 tween 完成后，同步平移相机与 `TrackballControls.target` 到新旋转中心，并更新 reset / 缩放基准，使动画保留、后续旋转中心正确且切换点图时画面不再额外移动 |
| 2026-04-21 14:44 | 修复缺陷 | 调整 `client/src/components/three/ThreeAndCarPointV2.js` 的模式切换起播基准：单独靠背/坐垫与 `all` 模式 tween 完成后的无视觉位移对焦不再覆盖默认 `controls.reset()` 基准，仅更新当前旋转中心与缩放基准，从而恢复再次切换到靠背/坐垫时的进场动画 |
| 2026-04-21 14:55 | 修复缺陷 | 调整 `client/src/components/three/ThreeAndCarPointV2.js` 的无视觉位移对焦算法：取消通过平移相机补偿的方式切换旋转中心，改为将目标对象中心或整体包围盒中心投影到当前相机视线后更新 `TrackballControls.target`，避免动画结束后画面突然变小，同时保留模式切换动画与后续旋转中心修正 |
| 2026-04-22 15:27 | 修复缺陷 | 修复 `client/src/components/selectBox/newSelecttBox.js` 的框选有效区判定：不再按整个 `.canvasThree` 判断是否可框选，而是基于当前系统和 `displayType` 的 `systemPointConfig` 计算真实矩阵区域；`endi-back` 靠背改为仅允许在 `50 x 64` 有效区内起框和完成框选，越界时统一提示“请在有效区域框选” |
| 2026-04-22 15:50 | 修复缺陷 | 调整 `client/src/components/selectBox/newSelecttBox.js` 与 `client/src/components/title/SelectSet.js` 的框选视觉：边框改用提亮后的显示色，填充改为单独半透明色值，不再通过整块元素 `opacity` 降亮度，提升框选框可见度 |
| 2026-04-22 15:58 | 文档更新 | 更新根目录 `CHANGELOG.md` 与 `client/src/page/equip/changeLog/ChangeLog.js`，补充 `endi1.0.1` 的“框选框亮度提升”版本说明，并保持仓库 changelog 与应用内时间线同步 |
| 2026-04-22 16:07 | 配置变更 | 调整根目录 `package.json` 与 `package-lock.json` 的包版本元数据为合法 SemVer `1.0.1`，修复 `electron-builder` 因 `endi1.0.1` 非法版本号而无法打包的问题；前端展示版本仍由 `client/src/util/version.js` 保持为 `endi1.0.1` |
| 2026-04-22 16:46 | 修复缺陷 | 修复 `util/serialCache.js` 在打包后仍按模块相对路径写入 `app.asar/serial_cache.json` 导致 `ENOENT` 的问题：主进程在 `index.js` / `indexsingle.js` 中将 Electron `userData/serial_cache.json` 通过 `SERIAL_CACHE_PATH` 传给 `server/serialServer.js`，后端统一调用 `setCachePath()` 切到外置可写文件，并在写缓存前自动创建父目录；同时在 `package.json` 的 `build` 配置中设置 `npmRebuild: false`，避免后续打包再次卡在原生模块重编 |
| 2026-04-29 11:15 | 修复缺陷 | 修复本地 CSV 导入缺少结构校验的问题：`/uploadCsv` 保存后校验 `sec(s)`、`time`、原始矩阵数据列、同前缀统计列和受支持矩阵长度，不合格立即删除文件并返回“数据有误”；同时修复历史面板导入列表因重复路径导致频繁切换后重复显示和选中态残留的问题 |
| 2026-04-29 14:18 | 修复缺陷 | 修复回放拖动进度条时框选失效的问题：`/getDbHistoryIndex` 改用 `getPlaybackSnapshot()` 广播带框选信息的帧；同时新增 `/setDataDirection`，采集保存前按当前画布翻转方向转换矩阵，并在历史帧中记录 `dataDirection`，前端回放时按保存方向和当前方向的差异渲染 |
| 2026-04-30 16:19 | 优化重构 | 优化座椅 3D 模型显示亮度：`ThreeAndCarPointV2` 增加环境光、半球光、主补光和 GLB 材质增亮处理；同时将 `ColControlV2` 的“数据采集”/计时文字从 `fs16` 调整为 `fs14`，与旁边历史数据入口字号一致 |

| 2026-05-09 16:30 | 优化重构 | 根据 PRD 优化一键连接：新增连接锁和 20s 后端总超时，`/connPort`/`/rescanPort` 返回 code/stage/message 结构化错误；重连前完整释放旧串口资源，MAC/type/auth 失败立即关闭端口；前端连接按钮增加 15s 超时、失败态和 WebSocket 连接结果同步 |
| 2026-05-09 17:45 | 优化重构 | 根据框选 PRD 优化框选模块：框选区域新增 `matrixKey/matrixRect`，拖拽/缩放/键盘移动和手动输入统一校验有效矩阵范围；切换系统或坐垫/靠背时清空旧框选，实时/回放/采集备注按矩阵 key 使用区域，采集仍保存全量矩阵 |

| 2026-05-09 18:30 | 新增功能 | 根据数据对比 PRD 实现历史 A/B 对比 P0：后端 `/getContrastData` 校验并返回完整帧，前端新增三图对比页面、红蓝 `B-A` 差值图、同步进度条、指标差值/变化率和框选区域对比 |
| 2026-05-09 19:40 | 新增功能 | 根据框选 PRD 新增框选区域命名和本地模板能力：`BrushManager.addMatrixRange` 统一手输/模板恢复创建路径，`SelectSet` 支持保存、应用、删除模板并做设备/矩阵/显示对象严格匹配，对比页可直接应用模板 |
| 2026-05-09 20:25 | 优化重构 | 按指定提交 `5965feda29e9852cb7a238cbcf4296d2aae044c9` 恢复 `NumThreeColorV2/V3/V4` 与 `NumThres` 的 2D 数字显示实现，撤回上一版格内裁剪字号策略 |
| 2026-05-09 20:35 | 修复缺陷 | 恢复 2D 数字修改前的显示方式，并在 `NumThreeColorV2/V3/V4` 渲染前将原始数据整数化，避免小数参与 UV 偏移导致格子显示异常 |
| 2026-05-09 20:45 | 修复缺陷 | 将 2D 数字纹理字体恢复为原始固定字号策略：小于 100 使用 `40px`，100 以上使用 `32px`，撤掉动态字号和格内裁剪 |
| 2026-05-09 20:55 | 修复缺陷 | 移除 `NumThreeColorV2/V3/V4` 2D 数字纹理的黑色描边，仅保留白色数字填充 |
| 2026-05-09 21:05 | 修复缺陷 | 修复回放图表空白：`ChartsAside.buildSeries` 支持直接使用历史曲线数组，不再因为实时帧数据为空而跳过 series |
| 2026-05-09 21:20 | 优化重构 | 参考主 PRD 的数据处理模块增加采集中方向锁：`Col` 同步全局采集状态，`IconAndTextAndSelect` 在采集中禁止画布翻转 |
| 2026-05-09 21:35 | 优化重构 | 参考主 PRD 的导出规则补齐 CSV metadata 字段，新增 `/download` 接口并保留 `/downlaod` 向后兼容 |
| 2026-05-09 21:50 | 优化重构 | 完善工具和方向：前端方向支持 `byKey` 独立持久化，后端采集按矩阵 key 记录方向，并新增 `noCompleted.md` 持续维护功能完成度 |
| 2026-05-11 15:10 | 优化重构 | 实现 MAC 配置强校验：新增设备配置校验工具、批量保存接口和前端实时错误展示，拦截格式错误、重复 MAC 和非法设备类型 |
| 2026-05-11 15:45 | 优化重构 | 实现模块二数据处理异常状态：串口帧记录 rawFrame/rawPointArray，统计坏帧率与连续异常，矩阵尺寸错误进入 device_error，前端提示并阻止异常帧入库 |
| 2026-05-11 16:10 | 优化重构 | 实现模块三连接后展示视图优化：新增 3D 点图/模型颜色上限显示映射，低于过滤阈值按无效点处理；坐垫/靠背视图切换时缺少对应数据会提示并阻止切换，本次不调整 3D 数字 |
| 2026-05-11 16:45 | 优化重构 | 实现模块四连接后工具优化：置零基线同步到后端并参与采集/导出，方向状态增加 90° 累计旋转和 CSV 字段，量尺限制最多 8 条并按 cm 展示 |
| 2026-05-11 17:25 | 优化重构 | 实现模块六/七采集历史回放与导出对比优化：回放异常帧自动跳过且连续异常停止，倍速限制为 0.5/1/2/4，CSV 补齐标准 metadata 与 carY 换算说明，对比页调整为 A/差值/B 三栏、状态条、当前帧结论、趋势曲线和结果导出 |
| 2026-05-11 17:45 | 优化重构 | 按框选与数据对比体验优化方案增强对比页：新增右侧区域管理栏、全量/框选显式切换、区域差值摘要、导出预览，并扩展状态条展示当前帧、采样率、置零和方向 |
| 2026-05-11 18:05 | 优化重构 | 按 Designer 视角优化框选和对比交互：框选画布显示编号、尺寸和行列范围，拖拽/缩放时高亮反馈；区域列表编号与画布颜色一致，差值图内固定红灰蓝图例和差值范围 |
| 2026-05-11 18:15 | 优化重构 | 补齐 UX-01 框选工具右侧抽屉：实时/回放 2D 下 SelectSet 固定到右侧，不遮挡主画布；对比页使用 embedded 样式继续嵌入区域管理侧栏 |
| 2026-05-11 18:25 | 优化重构 | 框选抽屉样式对齐历史数据抽屉：SecondTitle 复用公共 Drawer 承载 SelectSet，SelectSet 通过 embedded 样式适配 Drawer 与对比侧栏 |
| 2026-05-11 18:35 | 修复缺陷 | 修复多抽屉层级固定问题，公共 Drawer 打开和点击时自动置顶；修复框选模式点击非 canvas 区域误弹“请在有效区域框选”的问题 |
| 2026-05-11 18:55 | 优化重构 | 优化实时框选控制点：移除框内编号，右上删除按钮改为统一关闭 iconfont 并独立外置，避免遮挡矩阵和 resize 手柄重叠 |
| 2026-05-11 19:05 | 修复缺陷 | 将公共 Drawer 改为 createPortal 到 document.body，解决框选抽屉受标题父级 stacking context 影响导致层级看似固定的问题 |
| 2026-05-15 | 修复缺陷 | 修复多矩阵翻转只影响单侧的问题：前端翻转同时更新坐垫和靠背方向；后端将方向持久化到 `data_direction.json`，启动时加载，并让实时 WebSocket 输出与采集入库统一按后端方向转换 |
| 2026-05-15 | 优化重构 | 调整 CSV 导出文件策略：同一条历史记录仅生成一个 CSV，坐垫和靠背行合并写入并通过 `matrix_key/device_type` 标识来源，避免导入时出现同批次多文件关联问题 |
| 2026-05-15 | 修复缺陷 | 修复退出数据回放/数据对比后设备在线状态被历史帧覆盖为未连接的问题；退出历史模式时后端立即恢复实时推送，同时将 3D 靠背/座椅视角切换固定为 0°、45°、90° 三档 |
| 2026-05-15 | 修复缺陷 | 修复坐垫单独 3D 视角切换与靠背不一致的问题，并将画布翻转菜单改为按坐垫/靠背分别作用；下拉浮窗隐藏时关闭指针命中，点击选项后不立即关闭，鼠标移出后再收起 |
| 2026-05-15 | 优化重构 | 框选工具从右侧抽屉恢复为标题栏下方小浮窗；统一退出框选事件，退出时可选择保存为本地模板；数据采集入口与当前框选解耦，不再把框选写入采集历史 |
| 2026-05-15 | 优化重构 | 框选设置浮窗改为基于数字矩阵和右侧图表位置动态定位，默认贴在矩阵右侧，并在空间不足时收窄或移动到图表下方，避免遮挡矩阵与图表 |
| 2026-05-15 | 优化重构 | 更新 `endiBack1024` 原始 1024 点靠背线序映射：按实际 32x32 原始矩阵规则填充 25x32 物理矩阵，再扩展为 50x64 输出，未接线区域保持 0 |
| 2026-05-15 | 优化重构 | 调整 3D 点图色值：`jetWhite3` 改为白色低值、青蓝中低值、黄橙红高值的连续插值色阶，让压力热点更接近参考图观感 |
| 2026-05-15 | 优化重构 | 加深 3D 点图新色阶的非零色值，并把图像润滑 slider 改为 0.1 起、0.1 步进；高度 slider 显示范围按真实值放大 10 倍但保存值保持不变 |
| 2026-05-15 | 修复缺陷 | 修复框选时图表曲线仍混入未框选矩阵整体数据的问题：存在任意框选后，压力/面积曲线只展示框选区域统计 |
| 2026-05-15 | 优化重构 | 2D 数字矩阵色值统一改用 3D 点图的 `jetWhite3`，坐垫、靠背、放大镜和旧 2D 入口共用同一套压力色阶 |
| 2026-05-15 | 修复缺陷 | 修复 2D 数字矩阵色值被实例颜色和 Gamma 二次处理导致像有蒙层、0 值偏蓝和红色不鲜艳的问题，改为直接输出压力色阶原色 |
| 2026-05-15 | 优化重构 | 加深 2D/3D 共用压力色阶的非零色值：降低低值白雾感，提高青蓝、黄橙、红色饱和度，并让高值更早进入红色区间 |
| 2026-05-15 | 修复缺陷 | 点图恢复使用指定 `jetWhite3/rainbowTextColorsxy` 色值函数；2D 数字改用去掉末尾白色的 `jetWhite3NoWhite`；本地导入 CSV 点击后会转成后端回放队列，修复再点击播放时报错 |
| 2026-05-15 | 优化重构 | 点图和 2D 数字拆分为两套配色但共用可视化颜色上限：点图按完整 `min..max` 映射确保高值进入红色，2D 数字使用低饱和深色表提升白字可读性 |
| 2026-05-15 | 优化重构 | 2D 数字撤回低饱和深色表，恢复使用去白色的原色阶，并在数字贴图和放大镜背景绘制时增加透明度以保留色相同时降低刺眼程度 |

| 2026-05-18 | 新增功能 | 按《数据对比功能调研-时间维度扩展》新增同记录双时间点对比：`/getContrastData` 支持 `single_record_frame`，历史抽屉支持跨记录/同记录时间模式切换，对比页支持 A/B 独立帧滑块与当前时间点 CSV 导出 |
| 2026-05-18 | 优化重构 | 数据对比页 `ContrastHeatmap` 改为 2D 数字矩阵展示：A/B 图复用 `jetWhite3NoWhite` 与数字格子视觉，`endi-back` 补 0 区域按统一 mask 隐藏，差值图保留红蓝差值但也显示格子数字 |
| 2026-05-18 | 优化重构 | 对比页新增热力图 5x5 鼠标悬浮放大镜；同记录时间对比的压力/面积曲线从重合 A/B 双线改为单趋势线加 A/B 帧标记 |
| 2026-05-18 | 优化重构 | 按新版 UI 还原数据对比页面视觉结构：深蓝 Grid 仪表盘、顶部导航/状态卡/洞察条、三矩阵主区、右侧管理区、播放条、曲线和汇总表 |
| 2026-05-18 | 优化重构 | 补齐新版数据对比曲线和汇总表细节：趋势图增加坐标轴、刻度、单位和说明，数据汇总差值/变化率增加颜色和方向箭头 |
| 2026-05-18 | 优化重构 | 继续对齐新版数据对比 UI 细节：去白色按钮/下拉/输入框，曲线 legend 放到标题区，热力图与播放条增加放大 icon，汇总说明合并进标题 |
| 2026-05-18 | 新增功能 | 数据对比热力图右上角放大 icon 改为可交互，点击后打开暗色全屏放大弹窗，使用更大画布并保留 5x5 悬浮放大镜 |
| 2026-05-18 | 优化重构 | 数据对比页复用主页一级 header，隐藏二级工具栏；对象选择、顶部信息、播放条、曲线坐标、右侧配置分组和汇总表视觉层级按新版 UI 继续强化 |
| 2026-05-18 | 修复缺陷 | 对比模式下主页 header 增加专用样式，去除一级 header 底部分隔线并清零对比页顶部额外留白，避免数据对比图表被灰色边线和 padding 顶下移 |
| 2026-05-18 | 优化重构 | 数据对比页移除高亮荧光阴影，统一回主页黑底、深灰边框、`#0072EF` 蓝色交互和克制的状态色；播放控制栏右侧预留放大 icon 空间，避免倍速控件遮挡 |
| 2026-05-19 | 修复缺陷 | 数据对比播放栏放大 icon 从纯展示改为可点击按钮，增加 hover/active 反馈，并打开放大的播放控制弹窗；弹窗与主播放栏共用同一套播放/进度/时间点状态 |
| 2026-05-19 | 优化重构 | 数据对比播放栏放大弹窗从单独控制条改为“3 张热力数字图 + 播放进度条”的整体放大视图，A/B/B-A 热力图在弹窗内随当前进度或时间点同步刷新 |

*变更类型：`新增功能` / `优化重构` / `修复缺陷` / `配置变更` / `文档更新` / `依赖升级` / `初始化`*

---

*此文档旨在提供项目架构的快照，具体实现细节请参考源代码。*

## 2026-05-15 框选模板与图表联动补充

- 框选模板读取增加备份 key 和旧结构兼容，打开框选面板时重新从本地存储加载，避免刷新后因结构过滤导致模板列表为空。
- 框选浮窗宽度从原 18rem 调整为 15.3rem，动态定位宽度同步缩小到约 85%。
- 实时框选存在时，压力曲线、面积曲线、压力中心轨迹、正态分布和指标行统一读取框选区域统计，不再混入整张矩阵数据。

## 2026-05-15 可视化调节直值化

- 可视化调节抽屉取消 0-100 百分比换算，滑块和右侧输入框直接读写真实参数值。
- 右侧输入框的上限使用当前参数最大值，颜色/高度/滤波等调节不再通过 `settingValueMax` 做比例折算后保存。
- 2D 数字矩阵颜色贴图改为直接使用“颜色调节”的实际值作为色阶最大值，避免配置最大值二次换算导致显示与输入不一致。
- 可视化调节移除“响应速度/连续性”项；高度调节最小值和步进统一改为 0.1。
- 可视化调节抽屉内为四个调节项增加 Max 输入，用户可直接在抽屉里修改当前系统的最大值，并通过 `/setSystemConfig` 持久化到系统配置。
- 过滤值不再隐藏 3D 点位；低于阈值的数据仍可按显示链路归零/降色，但点对象保持存在。
- 默认和当前系统配置的可视化调节最大值统一为：图像润滑 `4`、颜色调节 `500`、噪点消除 `20`、高度调节 `10`；配置中超过新最大值的当前调节值会同步压到最大值以内。

## 2026-05-15 浮窗缩放步进固定

- `DraggablePanel` 的放大/缩小状态改为整数百分比 `zoomPercent`，点击放大固定增加 10 个百分点，点击缩小固定减少 10 个百分点。
- 面板缩放显示值和 CSS `scale()` 统一由 `zoomPercent / 100` 计算，避免浮点取整或吸附到 10 倍数边界导致单次点击出现 10%、20%、25% 等不一致步进。
- 底部 3D 视图缩放控件也改为固定 `10%` 步进；`ThreeAndCarPointV2` 在靠背/坐垫/整体视图切换动画期间暂停相机 change 事件回写百分比，完成后只回写稳定的 `100%`，避免切换过程中百分比上下浮动和画面突大突小。

## 2026-05-15 加密系统配置读取容错

- 新增 `util/systemConfig.js` 统一读取加密 `config.txt`：读取密文时先 `trim()`，解密后提取第一个完整 JSON 对象，避免文件末尾换行导致解密结果残留控制字符并触发 `Unexpected non-whitespace character after JSON`。
- `server/serialServer.js` 启动读取和 `server/api/routes.js` 的系统配置 API 共用该读取函数，保证启动、切系统和保存 Max 后的配置读取口径一致。

## 2026-05-15 3D 视图缩放方向修正

- `threeZoom` 的百分比语义调整为“数值越大，画面越大”：`100% -> 110%` 对应放大，`100% -> 90%` 对应缩小。
- 相机距离、滚轮反算百分比和 `TrackballControls` 缩放边界统一使用同一方向映射，避免按钮显示为 110% 但画面实际缩小。

## 2026-05-15 可视化调节本地持久化

- 新增 `visualSettingValueBySystemV1` 本地存储结构，按系统类型分别保存图像润滑、颜色调节、噪点消除和高度调节的当前值，保留旧 `setValueData` 作为兼容备份。
- 首页初始化和切换系统时，优先读取本地保存的可视化调节值；只有本地没有记录时才回退到后端 `optimalObj` 默认值，避免切换页面后丢失上次调节记录。
- 可视化调节滑块、右侧输入、Max 修改后的当前值夹紧，以及“恢复最优”都会立即写入本地存储，保证刷新和页面切换后的显示一致。

## 2026-05-15 endi-back 1024 线序映射更新

- `util/line.js` 的 `endiBack1024()` 不再使用旧的 `arrToRealLine + lineInterp + reverse` 连续矩阵规则，而是按 1024 原始 32x32 数据的实际接线顺序显式取点。
- 映射先生成 `25 x 32` 靠背物理矩阵：上部 9 行读取原始行 `15-23` 的列 `16-6` 并居中写入列 `7-17`；中部 8 行读取原始行 `24-31` 的列 `24-0`；下部 15 行读取原始行 `14-0` 的列 `24-0`。
- 未出现在实际线序表中的位置保持为 `0`，最终按最近邻方式把每个物理点扩展成 `2 x 2`，继续输出现有前后端约定的 `50 x 64`、长度 `3200` 的靠背矩阵。

## 2026-05-15 3D 点图色值调整

- `client/src/assets/util/line.js` 的 `jetWhite3()` 从离散反向色表改为连续插值色阶，修复旧分桶使用 `(max - min) * 2 / length` 导致最大值也很难进入黄橙红区间的问题。
- 新色阶按参考图观感设置为：无压力/零值白色，低值浅青，中低值青蓝，中值青绿，高值黄橙，最高值红色。
- 该函数被 `ThreeAndCarPointV2`、`ThreeAndCarPoint`、`ThreeAndCar`、`ThreeAndModel` 和 `CanvasMemo` 的 3D 点图复用，因此坐垫、靠背和整体 3D 点图会统一使用新的压力色值。
- 色阶确认后进一步降低非零色值的亮度并提高饱和度，让青蓝、黄橙和红色热点在 3D 模型上更深，零值仍保持白色。

## 2026-05-15 可视化调节 slider 精度补充

- 图像润滑 `gauss` 的 slider 和输入框从 `0.1` 开始，步进改为 `0.1`，与图像润滑最大值 `4` 的细粒度调节口径一致。
- 高度调节 `height` 的真实保存值仍保持 `0.1-10` 口径；仅 slider 显示值、最小值、最大值和步进通过 `sliderScale: 10` 放大 10 倍，拖动后再除回真实值写入 store 和本地持久化。

## 2026-05-15 框选图表只展示框选数据

- `ChartsAside.buildSeries()` 在实时图表存在任意 `boxStats` 时进入纯框选模式：有框选统计的区域按框选颜色绘制曲线，没有框选统计的靠背/座椅整体曲线直接跳过。
- 压力曲线和面积曲线的 y 轴最大值计算同步改为只读取框选 `pressArr/areaArr`，避免没有被框选的一侧整体数据继续影响图表范围。

## 2026-05-15 2D 数字色值统一

- `NumThreeColorV2`、`NumThreeColorV3`、`NumThreeColorV4` 和 `NumThreeColorBase` 的数字贴图背景色统一调用 `client/src/assets/util/line.js` 的 `jetWhite3()`。
- V3/V4 的 2D 放大镜单元格颜色也同步改为 `jetWhite3()`，保证普通 2D 数字、放大镜和 3D 点图使用同一套压力色阶。

## 2026-05-15 2D 数字色值蒙层修复

- `NumThreeColorV2/V3/V4/Base` 和旧入口 `NumThreeColor` 的 fragment shader 不再执行 `texColor.rgb * vColor`，也不再执行 Gamma 二次提亮，直接输出数字贴图中的压力色阶原色。
- 实例颜色 `instanceColor` 固定为白色，仅保留兼容属性，不再参与染色，避免 0 值被染成蓝色、高值红色被压成粉红或暗红。
- `pressurePointColors` 的非零低值从偏白浅色调整为高饱和青蓝，高值区提高黄橙红饱和度，`jetWhite3()` 插值指数从 `0.88` 调整为 `0.78`，让高压区域更早进入鲜红色。

## 2026-05-15 点图色值与 CSV 本地回放修复

- `jetWhite3()` 恢复为指定的 `rainbowTextColorsxy` 离散反向色值函数，3D 点图继续使用带末尾白色的完整色表。
- 新增 `jetWhite3NoWhite()`，2D 数字矩阵和放大镜使用去掉末尾白色的色表，避免 2D 数字背景继续出现低值白色段。
- `/getCsvData` 读取本地导入 CSV 后会按 `frame_index/timestamp/行号` 合并为后端 `historyDbArr` 回放队列，并返回 `length/pressArr/areaArr`，前端本地数据点击后直接进入回放状态，修复再点播放时报错。
- CSV 导入校验兼容旧版 `xxx Data/Max/Aver/Area` 表头和新版 `realData` 表头，旧 CSV 没有 `sec(s)` 时仍可按有效矩阵数据导入。

## 2026-05-15 点图与 2D 数字配色拆分

- 3D 点图继续调用 `jetWhite3()`，但分桶从旧的 `2 * (max - min)` 改为完整覆盖 `min..max`，因此达到颜色上限时会进入红色段。
- 2D 数字矩阵继续调用 `jetWhite3NoWhite()`，该函数使用点图色表去掉末尾白色后的原色阶，不再使用单独的低饱和深色表。
- 2D 数字贴图和放大镜仅背景色使用 `NUMBER_TEXT_COLOR_ALPHA = 0.72` 绘制 `rgba`；绘制文字前强制 `globalAlpha = 1`，白色数字本身不参与透明度处理。
- 3D 点图和 2D 数字继续共用同一个 `color` 颜色调节值，保证切换视图时颜色上限一致。
 
## 2026-05-18 靠背 1024 线序扩展方式修正

- `util/line.js` 的 `endiBack1024()` 保留当前 1024 原始 32x32 到 `25 x 32` 靠背物理矩阵的取点规则，不改变已确认的线序、中线对齐和未接线补 0 区域。
- 靠背物理矩阵从 `25 x 32` 扩展到前后端约定的 `50 x 64` 时，不再使用手写 `2 x 2` 最近邻复制，改为调用与 `endiSit1024()` 坐垫一致的 `lineInterp(lowMatrix, 25, 32, 2, 2)` 路径。
- 线性插值后按最终 `50 x 64` 显示矩阵的顶部有效区规则清理补 0 区域，确保原始矩阵和前端点图都把顶部 9x11 之外的位置视为无效占位。
- 输出长度继续保持 `3200`，后续 2D 数字、3D 点图、采集和回放读取的仍是同一个 `endi-back` 矩阵结构，只调整靠背有效点之间的过渡方式。

| 2026-05-18 | 修复缺陷 | 靠背 `endiBack1024` 从最近邻复制改为复用坐垫同款 `lineInterp` 线性插值扩展，修复靠背点图过渡方式与坐垫不一致的问题 |

## 2026-05-18 框选、回放可视化与颜色调节解耦

- 采集写入 `matrix` 表时不再保存当前框选数组，历史列表也不再从采集行的 `matrix.select` 字段继承框选，仅使用备注/模板保存的 `remarks.select_json`，避免框选状态和采集记录耦合。
- 回放帧带有框选时，左侧可视化矩阵保持原始尺寸，但会按当前/历史框选区域把框外数据置 0，保证 2D 数字和点图展示的是框选区域数据。
- 可视化“颜色调节”恢复为单一 `color` 本地持久化值；调节面板、3D 点图和 2D 数字都读写同一个颜色上限，旧的 `color3D/color2D` 本地数据会兼容合并回 `color`。

| 2026-05-18 | 修复缺陷 | 解耦框选与采集/历史行，修复回放框选可视化仍显示整图，并将 3D/2D 颜色调节值恢复为共用 |

## 2026-05-18 endi 靠背顶部有效区显示规则
- 新增 `client/src/util/endiBackVisibleMask.js`，把 `endi` 靠背顶部 9 行 11 列实际接线区抽成前端显示层规则。
- `ThreeAndCarPointV2` 在 3D 点图渲染时隐藏顶部两侧补 0 占位点；`NumThreeColorV4` 在 2D 数字矩阵和放大镜中使用同一规则隐藏占位格。
- 3D 靠背点图在套用有效区规则前会单独翻转行号，以抵消 3D 模型坐标和 2D 数字矩阵的上下方向差异，保证两种视图看到的补 0 区域一致。
- `util/line.js` 的 `endiBack1024()` 同步按顶部窄区方向输出原始 `endi-back` 矩阵，避免原始数据和点图方向不一致。
- 该规则只在 `endi + back2D/靠背 + 50x64` 显示矩阵上生效，真实有效点即使压力值为 0 也继续展示，避免把有效零压点误当成无效补点。
| 2026-05-18 | 修复缺陷 | 靠背原始矩阵和点图统一按顶部 9x11 有效区处理，顶部补 0 区域不再作为可视点展示 |
| 2026-05-18 | 优化重构 | 框选图表面板支持多框选自适应布局，曲线画布跟随面板宽度，指标行按可用空间自动分列 |
| 2026-05-18 | 修复缺陷 | 修正 3D 靠背点图补 0 区域与 2D 数字矩阵上下相反的问题，3D 应用有效区 mask 时按模型坐标翻转行号 |

## 2026-05-18 左侧图表面板尺寸与间距修复
- `ChartsAside` 的压力曲线、面积曲线和正态分布图改为使用固定高度的 `div` 容器初始化 ECharts，避免 canvas 默认宽度导致图形只占面板局部区域。
- 左侧图表面板监听容器尺寸变化并主动 resize 图表，浮窗宽度、缩放或初始化后都能按父容器完整宽度渲染。
- 指标数据行改为紧凑的 flex 换行布局，取消横向拉满分布，并收紧图表卡片内边距，避免图表下方数据距离过远。
| 2026-05-18 | 修复缺陷 | 修复左侧图表面板曲线未铺满父容器和指标数据间距过大的问题 |

## 2026-05-18 可视化颜色共用与图表宽度修正
- `NumThreeColorV3` 和 `NumThreeColorV4` 的 2D 数字颜色纹理改为按组件实例维护当前颜色上限，初始化时直接读取 zustand 中共用的 `settingValue.color`，避免切换 3D/2D 后复用模块级旧值导致纹理回到默认上限。
- `ChartsAside` 左侧压力/面积图表面板默认宽度恢复为紧凑尺寸，仅在存在框选统计数据时追加展开 class 以容纳多列指标。
| 2026-05-18 | 修复缺陷 | 修复 2D 数字颜色调节切换视图后未稳定共用 `color` 参数，以及无框选时左侧图表面板过宽的问题 |

## 2026-05-18 框选与历史抽屉联动修正
- `SecondTitle` 启动框选时不再派发 `close-history-drawer`，避免用户在历史抽屉打开状态下框选时抽屉自动收回。
- 打开历史抽屉时仍保留清理框选模式的逻辑，避免从历史入口切换操作状态时残留旧框选工具状态。
| 2026-05-18 | 修复缺陷 | 修复启动框选会自动关闭历史数据抽屉的问题 |

## 2026-05-18 框选回放不中断与历史持久化修正
- `SecondTitle` 启动框选时不再派发 `pause-playback`，历史回放继续沿当前播放状态运行，用户可以边回放边画选区。
- `equipStore` 新增当前回放记录 `playbackRecordDate`，从历史记录进入回放时写入，退出回放或本地 CSV 回放时清空。
- `Test` 的框选订阅在回放状态下把当前选区写回 `/upsertRemark`；清空框选时写入空对象，同步清除历史曲线选区数据。
- `ColAndHistory` 监听 `history-selection-persisted`，在持久化成功后更新历史列表中的 `select/selected` 状态，避免抽屉里仍显示旧的框选标记。
| 2026-05-18 | 修复缺陷 | 修复回放中点击框选会暂停播放，以及回放框选没有写回历史记录的问题 |

## 2026-05-18 3D 缩放、视角切换与对比页崩溃修正
- `threeZoom` 的缩放百分比恢复为“数值越大画面越大”：相机距离改为按 `baseDistance * 100 / zoom` 映射，滚轮同步值也按反向距离计算。
- `ViewSetting` 的 3D 视角切换仅在 `point3D` 的 `back/sit` 单独模式渲染；整体 `all` 模式下不再显示该入口。
- `NumThresContrast` 的结论文案模板增加缺省值和旧 key 兼容，避免缺少 `pressConclusion/pressHigher/pressLower` 时对 `undefined` 调用 `replace()`。
| 2026-05-18 | 修复缺陷 | 修复 3D 缩放显示数值反向、整体 3D 误显示视角切换、以及对比页结论文案字段缺失导致崩溃的问题 |

## 2026-05-18 对比退出框选清理修正
- `NumThresContrast` 退出对比时同步停止并清空全局 `brushInstance`，同时清空 zustand 的 `selectArr`，避免对比页创建的框选区域残留到普通 2D 页面。
| 2026-05-18 | 修复缺陷 | 修复退出数据对比后对比页框选区域仍停留在页面上的问题 |

## 2026-05-18 应用模板退出提示修正
- `SecondTitle` 关闭框选时识别当前框选是否全部来自已应用模板；若所有框选区域都带有 `templateId`，直接退出并清空框选，不再弹出“是否保存模板”的确认框。
| 2026-05-18 | 修复缺陷 | 修复应用已有框选模板后退出仍提示保存模板的问题 |

## 2026-05-18 3D 缩放首次点击基准修正
- `ViewSetting` 调用 3D 缩放时携带上一次显示的百分比，`ThreeAndCarPointV2.changeCamera()` 在执行缩放前用当前相机距离重新计算 `baseCameraDistance`。
- 切换到座椅/靠背等单独模式后，第一次点击放大不再按旧的整体视图基准跳转，避免“按加号反而缩小”的问题。
| 2026-05-18 | 修复缺陷 | 修复座椅/靠背 3D 视图切换后第一次点击放大会反向缩小的问题 |

## 2026-05-18 历史数据框选标记移除
- `ColAndHistory` 加载历史列表时不再把 `remarks.select_json` 转换成历史卡片的 `selected` 状态，历史数据卡片统一作为普通数据展示，不再显示“框选”标记。
- 点击历史记录进入回放时不再自动套用记录内保存的 `select_json`，也不再基于该字段切换 2D 显示对象或重算历史选区曲线。
- `Test` 的回放框选订阅只用当前框选临时查询 `/getDbHistorySelect` 更新曲线，不再调用 `/upsertRemark` 把框选写回历史记录；后续需要框选时从框选工具或模板重新选择。
| 2026-05-18 | 修复缺陷 | 移除历史数据中的框选标记和自动套用逻辑，历史记录统一作为普通数据展示 |

## 2026-05-18 翻转基准与旧框选模板兼容
- `useMatrixData` 为每个当前帧记录实际执行后的数据方向：实时默认帧使用当前前端方向，历史/回放帧如果自带 `dataDirection` 则使用该方向作为已执行状态。
- 再次点击翻转或旋转时，新的方向从当前帧实际方向派生，而不是只从全局缓存方向派生，避免已经被后端/历史数据翻转过的数据再次操作时方向错位。
- `SelectSet` 框选模板读取兼容旧版 localStorage key 和旧字段结构，支持 `selectionTemplates/selectTemplates/selectAreaTemplates` 等旧 key，以及 `boxes/rangeArr/selectArr/x1/y1/x2/y2` 等旧坐标写法。
- 模板匹配改为缺省字段不阻断：旧模板缺少 `deviceType/matrixWidth/matrixHeight/displayType` 时仍会显示并可应用，应用时使用当前矩阵尺寸作为兜底。
| 2026-05-18 | 修复缺陷 | 修复翻转操作未基于当前帧已执行方向继续计算，以及旧框选模板因 key/字段/匹配条件变化而不再显示的问题 |

## 2026-05-18 框选模板保存实时区域修正
- `SelectSet.saveTemplateByName()` 保存前直接从 `brushInstance.rangeArr` 读取当前真实框选区域，不再先依赖派生状态 `boxes.length` 判断是否存在框选。
- 保存模板时按当前显示对象实时计算矩阵类型和矩阵尺寸，避免刚创建框选、切换视图或订阅状态未同步时误提示“请先创建框选区域”。
| 2026-05-18 | 修复缺陷 | 修复创建框选后保存模板仍提示需要先创建框选区域的问题 |

## 2026-05-18 框选保存后退出提示修正
- `SelectSet` 保存模板成功后会把当前 `brushInstance.rangeArr` 中对应显示对象的框选区域回写新模板的 `templateId`，并通知订阅方刷新派生状态。
- `SecondTitle` 退出框选时继续复用已有的 `templateId` 判断；刚保存过的框选会被视为已保存模板，不再重复弹出“是否保存模板”的确认。
| 2026-05-18 | 修复缺陷 | 修复框选已保存为模板后再次退出框选仍提示保存模板的问题 |

## 2026-05-18 回放框选模板图表联动修正
- `useMatrixData` 记录最近一帧传感器数据并暴露 `reprocessLastSensorFrame()`，框选区域变化后可在不等待下一帧 WebSocket 的情况下立即重算当前帧统计。
- `Test` 在历史回放状态监听框选变化时，写入 `selectArr` 后立即重算当前回放帧的 `boxStats`，并继续请求 `/getDbHistorySelect` 生成框选后的历史压力/面积曲线。
- `ChartsAside` 在当前帧已经有框选统计时，不再让旧的全量 `historyChart` 覆盖框选统计；后端返回框选曲线后仅保留被框选矩阵的历史曲线。
| 2026-05-18 | 修复缺陷 | 修复历史回放中应用框选模板后左侧图表仍显示全量数据、不显示框选统计的问题 |

## 2026-05-18 endi 点图初始配置调整
- `Test` 中传给 `ThreeAndCarPointV2` 的 `backPointConfig` 初始值调整为 `position [2.5, -11, -1]`、`rotation [-1.8326, 0, 0]`、`scale [0.0015, 0.0030, 0.0028]`、`pointSize 1.0`。
- `sitPointConfig` 初始值调整为 `position [0, -30, -5]`、`rotation [-0.5236, 0, 0]`、`scale [0.0018, 0.0018, 0.0018]`、`pointSize 1.0`。
- `ThreeAndCarPointV2` 内部默认点图配置同步为同一组初始值，实际建点使用配置面板状态 `configValues`，避免 props、内部默认值和初始化建点路径不一致。
| 2026-05-18 | 配置变更 | 更新 endi 3D 点图靠背和坐垫的初始位置、旋转、缩放和点大小配置 |

## 2026-05-18 历史回放与框选状态解耦
- `ColAndHistory` 打开历史抽屉和点击历史记录进入回放时不再派发 `clear-selection-mode`，历史数据选择不会关闭框选工具或触发退出保存确认。
- 历史回放仍会更新 `dataStatus/historyChart/historyStatus`，但框选区域和 `onSelect` 状态由框选工具自身控制，实现历史选择与框选互不影响。
| 2026-05-18 | 修复缺陷 | 修复选择历史数据会自动关闭框选的问题 |

## 2026-05-18 历史抽屉渲染性能优化
- `ColAndHistory` 历史/本地列表改为分批渲染，初始只渲染 60 条记录，滚动接近底部时再追加下一批，减少打开抽屉时一次性创建大量卡片导致的卡顿。
- 打开历史抽屉仅刷新历史列表，不再同步清空主画布 `status/displayStatus` 的 4096 点数组，避免抽屉打开时触发主视图大范围重绘。
- 历史卡片增加 `content-visibility: auto` 和 `contain-intrinsic-size`，让浏览器跳过屏幕外卡片的布局和绘制。
| 2026-05-18 | 优化重构 | 优化历史抽屉大量记录场景下的打开和滚动流畅度 |

## 2026-05-19 框选快捷键输入态保护
- `BrushManager.onKeyDown()` 新增输入态判断，焦点位于 `input/textarea/select/contenteditable`、Ant Design 输入控件、弹窗或 Popover 内时不再响应框选的方向键和 Delete/Backspace 快捷键。
- 框选面板中编辑模板名、区域名或手动坐标时，Delete/Backspace 只作用于输入框文本，不会误删当前框选区域。
| 2026-05-19 | 修复缺陷 | 修复框选时在输入框按删除键会删除框选区域的问题 |

## 2026-05-19 框选重新进入状态清理修正
- `BrushManager.removeChild()` 在清空框选 DOM 时同步清空 `rangeArr` 并通知订阅方，避免工具退出后面板仍保留上一轮框选数据。
- `SelectSet` 在 `onSelect` 关闭时清空面板内的框选列表和手动输入坐标，重新进入框选时重新读取当前空状态和模板列表。
| 2026-05-19 | 修复缺陷 | 修复重新进入框选后上一次框选信息仍停留在面板中的问题 |

## 2026-05-19 对比页曲线与框选模板存储修正
- `contrast.scss` 将数据对比页压力/面积 SVG 曲线宽度从高亮样式下的粗线收敛到 1.5-1.6，保留原颜色和坐标布局但降低视觉厚重感。
- `SelectSet` 框选模板读取改为确定性归并 `selectionTemplatesV1`、备份 key 和历史 key，同名同设备同视图同尺寸模板只保留最新版本。
- 框选模板读取后会立即写回 `selectionTemplatesV1` 与 `selectionTemplatesBackupV1`，并清理旧版 localStorage key，避免重启后旧 key 中的另一套模板重新覆盖当前模板列表。
| 2026-05-19 | 修复缺陷 | 修复数据对比页曲线偏粗，以及框选模板重启后因多套 localStorage key 合并顺序不稳定而显示错乱的问题 |

## 2026-05-19 左侧框选指标四列布局修正
- `ChartsAside` 在存在框选统计时，为压力、面积和压力中心指标行增加 `chartTypeContent--selection` 状态类。
- `chartsAside/index.scss` 将框选指标内容改为固定四列 grid，并对图例项、数值和单位设置 `white-space: nowrap`，避免四个框选同时展示时单列内部换行。
| 2026-05-19 | 修复缺陷 | 修复左侧可视化面板四个框选时每列数值/单位发生换行的问题 |

## 2026-05-19 历史播放条显示状态修正
- `ColAndHistory` 底部控制区改为仅在 `dataStatus === 'replay'` 且非对比页时渲染 `DataPlay`，历史抽屉打开但仍处于实时状态时继续显示采集控制。
- 框选工具不再通过底部控制区的抽屉状态间接触发播放条展示，避免点击框选后历史抽屉收起但实时状态下仍残留播放控件。
| 2026-05-19 | 修复缺陷 | 修复实时状态下点击框选后历史抽屉收起但底部仍显示历史播放控件的问题 |

## 2026-05-19 框选面板新版 UI 调整
- `SelectSet` 框选面板结构按新版设计重排：顶部展示“框选区域”和数量，右侧提供清除全部；框选项改为卡片行，包含色块编号、名称、坐标尺寸、查看图标和删除按钮。
- 手动添加区域改为 X/Y/长/宽四列输入加右侧添加按钮；模板区域改为模板名称输入加保存按钮、选择模板下拉框、应用/删除模板操作行。
- `title/index.scss` 为框选浮窗增加深色蓝边、蓝色光感背景、暗色输入框、蓝色主按钮和红色删除按钮，并将浮窗默认宽度扩大到接近设计稿。
| 2026-05-19 | 优化重构 | 按设计稿重做当前框选工具面板 UI，保持原有框选、保存、应用和删除逻辑不变 |

## 2026-05-19 框选模板重命名与紧凑尺寸恢复
- `SelectSet` 浮窗定位宽度恢复为原先的紧凑尺寸计算，`selectInputFloating/selectInputDrawer` 也恢复旧宽度，保留新版视觉但不改变原有位置和占用大小。
- 模板名称输入框新增编辑图标，选择模板后会把当前模板名填入输入框；新增“重命名模板”按钮，可将选中模板的 `templateName` 更新后写回模板持久化存储。
- `App.js` 新增中英文 `renameTemplate/templateRenamed` 文案，保持按钮和成功提示可本地化。
| 2026-05-19 | 新增功能 | 新增框选模板重命名能力，并恢复框选面板原来的浮窗尺寸和定位策略 |

## 2026-05-19 框选面板紧凑化调整
- `title/index.scss` 在保留旧浮窗尺寸的前提下压缩框选面板内部 padding、行高、按钮高度、输入框高度和区块间距。
- `selectInputFloating/selectInputEmbedded` 取消内部滚动条，依靠紧凑布局完整展示框选列表、手动添加和模板操作区。
| 2026-05-19 | 优化重构 | 缩小框选面板内部内容并避免出现滚动条 |

## 2026-05-19 框选重心计算与绘制修正
- `useMatrixData` 在计算框选统计时，先计算框内局部重心，再按框选矩阵的 `xStart/yStart/xEnd/yEnd` 投影回整张传感器矩阵坐标，避免框选重心仍按靠背/座椅整体中心语义显示。
- `ChartsAside` 在存在框选统计时向 `FootTrack` 传入全部框选重心和对应框选颜色，不再只取前两个点。
- `FootTrack.circleMove()` 兼容框选点数组，按框选颜色绘制多个重心点；无框选时继续保留原来的靠背/座椅两点绘制方式。
| 2026-05-19 | 修复缺陷 | 修复框选后压力重心图仍按靠背/座椅整体中心展示，而不是展示框选区域重心的问题 |

## 2026-05-19 框选浮层宽度与图表尺寸约束
- `SelectSet` 浮层定位宽度从约 245px 调整到约 285px，最小可用宽度同步增加，给标题区和“清除全部”操作留出更稳定的横向空间。
- `title/index.scss` 增加框选标题区间距，并让“清除全部”靠右保留左侧内边距，避免与“框选区域”标题视觉上贴得过近。
- `chartsAside/index.scss` 保持存在四个框选统计时左侧图表面板可扩展承载四列数据，但将扩展状态下的曲线图容器宽度固定为普通图表宽度，避免右侧可视化图表随面板宽度被拉伸。
| 2026-05-19 | 优化重构 | 调整框选浮层标题间距和宽度，并固定四框选状态下左侧可视化图表的绘制宽度 |

## 2026-05-19 历史抽屉首次打开性能优化
- `ColAndHistory` 将历史数据首批渲染数量从 60 条降低到 24 条，打开抽屉后先展示抽屉结构，再通过下一帧异步加载历史列表，减少点击瞬间的布局和图片解码压力。
- `ColAndHistory` 增加空闲预取和短时缓存，应用启动后在浏览器空闲阶段预先获取历史列表；用户首次点击历史按钮时优先复用已加载数据，后续滚动仍按分批方式追加渲染。
- `server/api/routes.js` 为 `matrix(date, timestamp)` 增加历史列表查询索引，优化 `/getColHistory` 按记录分组取最新帧时的数据库扫描成本。
| 2026-05-19 | 优化重构 | 优化历史数据抽屉首次打开卡顿，拆分点击、请求和首屏渲染压力 |

## 2026-05-19 历史对比选择与本地化修正
- `ColAndHistory` 重写历史对比 A/B 选择取消分支，先判断当前点击项是否已是 A 或 B，再判断空位补选，避免先取消 A 后原 B 再次点击被误选为 A 而残留 B 标记。
- 数据导入弹窗隐藏原生 file input，改用本地化按钮和“未选择文件/No file selected”文案，避免英文模式下出现系统中文控件文本。
- 历史数据对比模式切换按钮改为 i18n 文案，英文模式显示 `Across records` / `Same record time`。
- `SelectSet` 框选模板去重签名加入区域坐标和尺寸，旧模板迁移合并时不再仅按名称、设备、视图和矩阵尺寸合并不同区域模板。
| 2026-05-19 | 修复缺陷 | 修复历史对比 A/B 取消残留、导入弹窗和对比模式英文文案，并收紧框选模板去重逻辑 |

## 2026-05-19 框选模板数据库持久化
- `util/db.js` 新增 `selection_templates` 表，按 `template_id` 存储模板名称、设备类型、视图类型、矩阵尺寸、完整模板 JSON、创建时间和更新时间，并建立更新时间索引。
- `server/api/routes.js` 新增 `GET /selectionTemplates` 和 `POST /selectionTemplates/saveAll`，框选模板读写改由当前设备数据库统一管理，不再以浏览器 localStorage 作为权威数据源。
- `SelectSet` 打开框选工具时优先从数据库加载模板；若数据库为空，则把旧 localStorage 模板迁移到数据库。保存、删除、重命名模板会写入数据库，并同步一份 localStorage 缓存作为后端不可用时的兜底显示。
| 2026-05-19 | 优化重构 | 将框选模板从 localStorage 迁移到 SQLite 数据库存储，提升模板持久化稳定性 |

## 2026-05-19 视图方向翻转与靠背框选有效区
- `useMatrixData` 和后端 `DataService` 的方向处理顺序改为先按旋转角度得到当前视图矩阵，再按当前视图宽高执行左右/上下翻转，避免坐垫旋转 90 度后翻转仍沿原始矩阵轴生效。
- `BrushManager` 在创建、手动添加、拖动和键盘移动框选时复用 `endiBackVisibleMask`，`endi-back` 顶部补 0 的不可见格子会被视为区域外，不能保存为有效框选。
- `ThreeAndCarPointV2` 默认靠背点图配置和 `Test` 中 `carY` 传入配置同步为 `scale [0.0015, 0.0030, 0.0026]`，坐垫点图配置保持 `position [0, -30, -5]`、`rotation [-0.5236, 0, 0]`、`scale [0.0018, 0.0018, 0.0018]`。
| 2026-05-19 | 修复缺陷 | 修正旋转后翻转方向按视图轴生效，靠背顶部补 0 区禁止框选，并更新 endi 点图默认参数 |

## 2026-05-19 可视化调节与暗色输入提示优化
- 高度调节的默认最大值从 10 调整为 200，并在加载旧后端配置时对高度最大值做向上兼容归一，避免旧配置继续把滑块限制在 10；高度滑块步长调整为 5。
- 历史数据搜索框、框选手动输入框、模板名称输入框和模板选择下拉空状态的 placeholder/暂无数据文字统一改为白色，适配当前暗色 UI。
- 实时数据质量提示不再对 degraded/hzAbnormal 的“数据不稳定”状态弹出 message，仅保留真正 `device_error` 的严重设备异常处理。
| 2026-05-19 | 优化重构 | 调整高度调节默认最大值和步长，统一暗色输入提示文字颜色，并取消数据不稳定 message |

## 2026-05-19 历史对比英文短文案
- 历史数据抽屉中数据对比模式切换的英文文案由 `Across records` / `Same record time` 缩短为 `Records` / `Time`，避免英文界面下按钮内容撑出视窗。
| 2026-05-19 | 修复缺陷 | 缩短历史对比模式切换英文文案，修复英文界面内容溢出 |

## 2026-05-19 框选面板英文短文案
- 框选面板英文界面的标题、按钮、下拉占位和不匹配标记改为短文案：`Regions`、`Add Rect`、`Templates`、`Save`、`Rename`、`Apply`、`Delete`、`N/A` 等，避免英文内容撑出当前面板。
| 2026-05-19 | 修复缺陷 | 缩短框选面板英文文案，修复英文界面内容溢出 |

## 2026-05-19 输入与下拉提示色调整
- 历史搜索框、框选手动输入、模板名称输入和模板下拉占位/空状态提示文字统一调整为 `#aaaaaa`，保持暗色 UI 中的提示层级，不再使用纯白提示色。
| 2026-05-19 | 优化重构 | 将历史与框选相关输入框、下拉框提示文字颜色统一调整为 `#aaaaaa` |

## 2026-05-19 框选模板下拉对齐修正
- 框选模板下拉列表项文字改为白色，并对选择框 selector、选中文本、placeholder 和箭头做 flex 垂直居中，修复下拉文字与箭头 icon 高低不齐的问题。
| 2026-05-19 | 修复缺陷 | 修复框选模板下拉列表文字颜色和选择框文字/箭头垂直对齐 |

## 2026-05-19 可视化面板缩放边界与模板取消修正
- `DraggablePanel` 缩放范围从原先 10%-1000% 收紧为 50%-150%，百分比改为只读显示，并新增独立重置图标按钮恢复 100%，左右浮动可视化面板共用该边界。
- 框选模板下拉支持清空选择；应用模板前改为彻底清理旧框选 DOM 和状态，覆盖确认弹窗取消时同步清空临时模板选择，避免取消/切换模板后残留或额外生成框选框。
| 2026-05-19 | 修复缺陷 | 为左右可视化面板增加 50%-150% 缩放边界和重置图标，并修复框选模板取消后可能多出框选框的问题 |

## 2026-05-19 标题栏图标提示本地化
- `Title` 顶部设置、重连和断开连接图标的 Tooltip 从硬编码中文改为使用 i18n 文案，英文模式下设置 icon 悬停提示显示 `Device MAC Address Settings`，不再出现中文浮窗。
| 2026-05-19 | 修复缺陷 | 修复英文模式下标题栏设置 icon 悬停浮窗仍为中文的问题 |

## 2026-05-19 回放框选显示与统计解耦
- `useMatrixData` 回放帧不再把主画布显示矩阵按框选区域清零，历史回放应用框选模板后主可视化仍展示完整传感器数据。
- 框选仍通过 `computeSelectArr` 和 `computeStats` 参与左侧压力、面积、重心和曲线统计，左侧可视化继续展示框选区域的数据。
| 2026-05-19 | 修复缺陷 | 修复回放时框选导致主画布只有框选区域有数据的问题，同时保留左侧框选统计 |

## 2026-05-19 左侧框选可视化统计口径修正
- `useMatrixData.computeStats()` 在存在框选时，默认压力重心和正态分布改为基于当前框选区域数据计算；没有框选时仍使用完整矩阵数据。
- 多框选时继续保留 `boxStats` 的独立统计，左侧曲线、指标、重心图和正态分布图都优先展示框选区域结果。
| 2026-05-19 | 修复缺陷 | 修复左侧重心/正态分布等可视化仍按整张靠背或座椅数据计算，而不是按框选区域计算的问题 |

## 2026-05-19 回放退出框选残留历史框修正
- `SecondTitle` 退出框选时同时清理 `.selectHistoryBox`，避免历史回放绘制层残留一个没有删除按钮的框选框。
- `Test` 在回放状态下收到空框选列表时，清空左侧历史框选曲线、移除历史框 DOM，并延迟确认后调用 `/getDbHistorySelect` 的空选区清理后端 `historySelectCache`，避免应用模板时的临时清空和新增框选请求产生竞态。
- `useMatrixData` 只有在 `playbackHasSelection` 为 true 时才消费回放帧里的 `select` 字段，防止退出框选后旧帧缓存再次触发历史框绘制。
- `/getDbHistorySelect` 支持空对象作为清理请求，直接清空后端回放框选缓存并返回空曲线，不再遍历历史帧。
| 2026-05-19 | 修复缺陷 | 修复历史回放中应用模板并追加框选后退出，继续播放会出现无法关闭的无叉历史框选区域 |

## 2026-05-19 回放模板框选图表 Key 兼容修正
- `Test` 写入回放框选曲线时按 `endi-back/back`、`endi-sit/sit` 这类 fullKey/shortKey 候选同时过滤，避免旧历史数据 key 与模板 key 不一致导致左侧曲线为空。
- `/getDbHistorySelect` 后端按 fullKey 和 shortKey 互相匹配选区，历史行使用旧 `back/sit` key 时也能套用 `endi-back/endi-sit` 模板区域计算压力和面积曲线。
- `useMatrixData` 当前帧框选统计同样兼容 fullKey/shortKey，并按解析到的矩阵配置计算框选指标、重心和正态分布，保证左侧当前帧可视化和历史曲线都展示框选区域数据。
| 2026-05-19 | 修复缺陷 | 修复历史回放应用框选模板后，左侧可视化图表因历史数据 key 与模板 key 不一致而不显示框选区域数据的问题 |

## 2026-05-19 左侧框选曲线优先级修正
- `ChartsAside` 在当前帧已有 `boxStats` 时，压力/面积曲线优先使用当前框选统计曲线，避免 `historyChart.selection.active` 强制覆盖成旧历史曲线，导致数值行已按框选变化但曲线仍不是框选数据。
- fullKey/shortKey 匹配增加后缀兜底，`back` 可直接匹配任意 `*-back` 选区，降低系统类型状态不一致时的历史曲线查询失败概率。
| 2026-05-19 | 修复缺陷 | 修复历史回放选择框选模板后左侧数字已变为框选数据，但压力/面积曲线仍未展示框选区域数据的问题 |

## 2026-05-20 一键连接恢复实时流修正
- `/connPort` 和 `/rescanPort` 成功后会主动退出历史回放状态，清理 `historyFlag/historyPlayFlag/historyDbArr/historySelectCache`，停止回放定时器，并立即及延迟各推送一次实时帧，避免连接后实时发送仍被历史状态拦截。
- `Title` 和 `Test` 在收到连接成功结果时同步把前端 `dataStatus` 恢复为 `realtime`，清空历史曲线、回放选区、回放时间和历史框 DOM，避免 UI 仍停留在回放状态。
| 2026-05-20 | 修复缺陷 | 修复一键连接后需要打开并关闭历史数据抽屉才出现实时数据的问题 |

## 2026-05-21 2D 数字视图与框选浮层交互增强
- `SelectSet` 浮动框选模板面板支持通过标题栏拖拽，并在窗口尺寸变化时保留用户拖动位置，避免模板面板固定遮挡可视化区域。
- `ViewSetting` 的视图切换弹窗改为直接展开 3D 模型和 2D 数字的下级选项；2D 数字视图接入底部加减按钮，独立维护 50%-200% 缩放状态，重置视图可恢复 100%。
- `NumThreeColorV3` 和 `NumThreeColorV4` 接入可视化调节里的高斯润滑/过滤参数，2D 数字画布随图像润滑参数更新；滚动主画布可缩放整体 2D 数字，滚动放大镜画布可调整局部放大倍率。
- `NumThreeColorV3` 和 `NumThreeColorV4` 的数字纹理图集关闭 mipmap，并在 shader 中对每个 tile 做内缩线性采样，避免 0 值 tile 被相邻色块污染，同时改善 2D 数字缩小时的边缘断裂。
- 2D 数字主画布滚轮缩放改为按鼠标所在点补偿正交相机位置，放大/缩小时以鼠标为中心；框选浮层标题栏鼠标样式同步为 `grab/grabbing`。
- `ThreeAndCarPointV2` 对 TrackballControls 的 `target/position0/target0/up0` 做空值补齐，避免模型异步加载后默认聚焦时报 `target.copy` 空引用错误。
- `SecondTitle` 为可视化调节项补齐稳定 key，消除调节抽屉渲染时的 React 列表 key warning。
| 2026-05-21 | 新增功能 | 增强框选模板浮层拖拽、2D 数字缩放/局部放大，并让 2D 数字支持图像润滑 |

## 2026-05-21 标题栏连接状态与采集入口调整
- `Title` 的重连按钮显示条件改为连接失败、设备错误或任一设备状态不是 `online` 时出现，正常全在线状态不再常驻显示重连按钮。
- `ColAndHistory` 将非回放状态下的采集/历史入口从底部移动到顶部标题栏区域右侧；回放状态仍保留底部播放控制条。
- `ColControlV2` 改为顶部横向按钮样式，提供“开始采集/计时”和“历史数据”两个入口，保留原有采集开始、结束和历史抽屉逻辑。
| 2026-05-21 | 优化重构 | 调整标题栏重连按钮显示逻辑，并将开始采集与历史数据入口移动到顶部 |

## 2026-05-21 标题栏状态卡片与量尺拖拽
- `Title` 将连接入口固定为带链路图标的一键连接按钮；连接成功后仍保持同一按钮视觉，不再切换为绿色状态按钮。
- `EquipStatus` 将靠背/坐垫状态整理为独立状态卡片，显示设备名称、红绿状态点和“正常/断开”文字；设备断开时继续触发标题栏重连按钮。
- `ColAndHistory` 顶部采集/历史入口右移避让设置和语言区域，并降低入口层级，避免遮挡标题栏右侧图标。
- `newRuler` 增加矩阵坐标驱动的量尺编辑状态：拖拽线段或距离标签会整体移动起终点，拖拽端点只更新单端点，Esc 可恢复拖拽前坐标；距离标签在画布边缘自动夹紧显示，避免靠右时数字消失。
| 2026-05-21 | 修复缺陷 | 调整标题栏一键连接/靠背坐垫状态展示并补齐量尺整体拖拽、端点拖拽和边界标签处理 |

## 2026-05-25 标题栏设备状态与采集按钮修正
- `EquipStatus` 去掉靠背/坐垫状态卡片里的“正常/断开”文字，仅保留设备名称和在线/离线颜色点，压缩标题栏横向占用。
- `Col` 支持接收顶部按钮样式和子内容，`ColControlV2` 将“开始采集/计时”整块按钮改为同一个采集点击目标，避免只有圆形图标可点击导致标题栏采集按钮点文字无反应。
| 2026-05-25 | 修复缺陷 | 去掉座椅靠背在线离线文案，并修复标题栏开始采集按钮点击区域无反应的问题 |

## 2026-05-25 2D 数字缩小时笔画完整性修正
- `NumThreeColorV3` 和 `NumThreeColorV4` 的 2D 数字纹理图集从 1024/64px tile 提升为 2048/128px tile，给数字笔画保留更高源分辨率。
- 数字纹理启用 mipmap 并把 shader 采样区域向 tile 内部收缩，避免缩小时线性采样落到 tile 边缘导致 0 等数字笔画出现缺角或断裂。
| 2026-05-25 | 修复缺陷 | 修复 2D 数字缩小时 0 等数字笔画不完整、像缺角的问题 |

## 2026-05-25 重置视图与 2D 数字高斯核调整
- `ViewSetting` 将“重置视角”文案改为“重置视图”，Popover 改为说明会同时重置 3D 视图和 2D 数字视图；点击后会恢复 3D 控制器/缩放，也会恢复 2D 数字缩放和相机平移。
- `NumThreeColorV3` 和 `NumThreeColorV4` 监听 `reset-num-2d-view` 事件，重置 2D 数字相机位置与缩放，避免只恢复百分比但画面仍偏移。
- 2D 数字渲染的高斯润滑改为按当前润滑值乘以 0.5 的卷积核系数应用，默认显示效果对应 0.5 高斯核，同时保留可视化调节对润滑强度的控制。
| 2026-05-25 | 优化重构 | 将重置视角改为同时重置 3D/2D 的重置视图，并为 2D 数字应用 0.5 高斯卷积核系数 |

## 2026-05-25 3D 重置视图缩放基准修正
- `ViewSetting.resetView()` 不再在调用 `reset3D()` 后追加 `changeCamera(100)`，避免滚轮缩放后的 3D 相机被重置和缩放动画二次叠加导致落点偏移。
- `ThreeAndCarPointV2.reset3D()` 在 TrackballControls reset 后重新计算当前视图模式的相机目标距离并重绑缩放同步，保证滚轮缩放后重置仍回到当前模式的正确 100% 视图。
| 2026-05-25 | 修复缺陷 | 修复 3D 模式鼠标滚轮缩放后点击重置视图位置不正确的问题 |

## 2026-05-25 2D 数字视图左键拖拽
- `NumThreeColorV3` 与 `NumThreeColorV4` 为 2D 数字视图补充左键拖拽平移能力：按住矩阵区域拖动时根据正交相机世界坐标差平移视图，滚轮缩放仍保持以鼠标位置为中心；进入框选或量尺模式时禁用 2D 平移并恢复默认光标，避免交互互抢。
| 2026-05-25 | 新增功能 | 为 2D 数字视图增加鼠标左键拖拽平移，并保持重置视图可恢复默认位置 |

## 2026-05-25 2D 数字显示稳定性修正
- `NumThreeColorV3` 与 `NumThreeColorV4` 在空间高斯之后增加每个传感点的时间平滑缓存和数字切换死区，避免实时数据在整数临界值附近跳动时 2D 数字纹理反复 0/1、1/2 闪烁。
- 2D 数字渲染循环不再在每个格子内重复创建 `instanceColor` 和 `uvOffset` buffer attribute，改为初始化一次后每帧只更新数组并标记 `needsUpdate`，降低实时刷新时的渲染抖动。
| 2026-05-25 | 修复缺陷 | 修复 2D 数字加小高斯后仍因临界值和 buffer 重建导致显示抖动的问题 |

## 2026-05-25 3D 点图显示稳定性修正
- `ThreeAndCarPointV2` 在点图插值与空间高斯之后增加按矩阵对象区分的时间平滑缓存和数值死区，再进入原有高度平滑，避免实时压力值在临界范围内小幅波动时点图高度和颜色持续抖动。
- 点图隐藏/显示判断改为使用稳定后的高度值，并将 `position/color` buffer 改为复用已有 attribute 数组后标记 `needsUpdate`，不再每帧重建 BufferAttribute，降低实时点图刷新抖动。
| 2026-05-25 | 修复缺陷 | 为 3D 点图增加与 2D 数字类似的时间防抖处理，减少高度、颜色和过滤阈值附近的闪烁 |

## 2026-05-25 历史数据导出格式与字段配置
- 后端 `util/db.js` 新增 `xlsx` 依赖和 Excel 写入链路，`/download` 与兼容的 `/downlaod` 支持 `exportOptions.format` 在 `csv/xlsx` 间切换，默认仍导出 CSV。
- 后端新增 `/downloadFields`，按当前选中的历史记录解析实际矩阵 key 并返回可导出字段清单；导出时 `exportOptions.fields` 会过滤表头和记录内容，未传字段时保留原默认全字段导出。
- 前端 `ColAndHistory` 的导出确认弹窗增加导出格式单选和字段多选，支持全选/清空，并把字段配置随下载请求传给后端。
| 2026-05-25 | 新增功能 | 历史数据导出支持 CSV/XLSX 两种格式，并允许按字段配置导出内容 |

## 2026-05-25 采集信息弹窗
- `Col` 将开始采集请求抽成可复用的 `startCollect`，并支持 `onBeforeStart` 回调；未开始采集时按钮会先交给上层弹窗处理，确认后再沿用原 `/startCol`、`/upsertRemark` 流程，结束采集逻辑不变。
- `ColControlV2` 新增采集信息弹窗，只保留数据名称和备注；数据名称改为选填，留空时继续按原逻辑不写入 alias，备注留空时也不额外写入备注。
- `ColAndHistory/index.scss` 增加采集信息弹窗的深色表单样式、计数字段和底部按钮样式，匹配顶部采集入口的暗色 UI。
| 2026-05-25 | 新增功能 | 开始采集前新增采集信息弹窗，数据名称和备注均可选，确认后才真正启动采集 |

## 2026-05-25 2D 数字字体统一
- `NumThreeColorV3` 与 `NumThreeColorV4` 的 2D 数字图集绘制取消三位数单独缩小字号逻辑，所有位数统一使用相同字号和字重。
- 三位数超过单格可用宽度时只做横向压缩并保持垂直字号不变，避免 100 以上数值明显小于一位数、两位数；随后将统一字号略微缩小，并加深加粗每个方块的边框，提高网格辨识度。
| 2026-05-25 | 修复缺陷 | 统一 2D 数字一位、两位、三位数的显示字号，缩小整体字体并增强方块边框 |

## 2026-05-25 导出字段中文化与框选字段收敛
- `util/db.js` 的导出字段生成改为只暴露一套中文字段：基础信息、时间、每个矩阵的最大压强、最大压强坐标、平均压强、受力面积、数据、点数、总压力和备注。
- 下载字段选择不再返回 `avg_pressure`、`select_data`、`selection_1_*` 等英文通用/框选专用列，也不再同时暴露“原始数据特征值”和“框选数据特征值”两套字段。
- 导出时如果当前记录带框选区域，框选统计和框选数据会写入同一组矩阵字段；没有框选时同一组字段写入完整矩阵统计和数据，保持框选与非框选导出列结构一致。
| 2026-05-25 | 优化重构 | 将下载可选字段改为中文标题，并统一框选/非框选导出的字段结构 |
## 2026-05-25 对比页帧率对齐与曲线完整性
- `NumThresContrast` 的非时间点对比回放改为按帧时间戳/归一化时间轴取最近帧，A/B 即使帧率或帧数不同也通过同一时间进度对齐，并在回放条中分别展示 A、B 两条帧进度条。
- 对比页压力/面积变化曲线不再优先依赖预存趋势数组，而是从完整帧序列逐帧计算统计值，避免压力变化曲线只展示部分数据。
- 对比页取消右侧框选区域面板，并将当前统计范围固定为全量矩阵，主对比热力图区域占满可用宽度。
| 2026-05-25 | 修复缺陷 | 修复对比数据帧率不同步、回放只有单进度条、右侧框选区冗余以及压力变化曲线展示不完整的问题 |
## 2026-05-25 启动连接、置零菜单与可视化调节补充
- `Title` 在主标题栏首次挂载后会自动触发一次一键连接，并通过 message 提示“正在连接设备”；连接中、已连接或已进入重连流程时不会重复触发。
- `SecondTitle` 隐藏功能栏里的图片上传按钮；预压力置零从单按钮切换为下拉操作，包含“预压力置零”和“取消置零”，重复点击置零会以点击当时帧重新记录基准帧。
- `useMatrixData.changeWsLocalData()` 支持显式 `enable/disable` 操作，保证置零和取消置零不再依赖切换态误触。
- 可视化调节抽屉的颜色调节项显示当前可视化数据最大值，便于按实时数据范围设置颜色上限。
| 2026-05-25 | 优化重构 | 隐藏图片上传功能按钮，补齐预压力置零下拉操作、启动自动连接提示和颜色调节当前最大值显示 |
## 2026-05-25 历史 COP PDF 报告
- `ColAndHistory` 在历史数据本地列表的操作区新增“生成报告”入口，进入报告模式后要求只选择一条历史记录，并跳转到 `/copReport?date=...` 生成报告页面。
- `server/api/routes.js` 新增 `/copReportData`，按历史记录读取原始帧、矩阵 key、采样时长/帧率、备注和已保存框选 JSON，供前端报告页统一计算整体 COP 与框选区域指标。
- `client/src/page/report/CopReport.js` 新增 A4 风格报告页面，输出数据概览、整体压力热力图、COP 轨迹、整体统计表、框选区域总览和每个框选区域的局部压力/COP 分析，不包含 AI 章节。
- `preload.js` 与 `index.js` 新增 `exportCurrentPagePdf` IPC，使用 Electron `printToPDF` 将当前报告页面保存为 PDF；非 Electron 环境回退到浏览器打印。
| 2026-05-25 | 新增功能 | 新增历史 COP 分析报告页面与 PDF 导出能力，支持读取历史框选区域并生成整体/局部 COP 指标和图示 |

## 2026-05-26 SecondTitle useMemo 引用修复
- `SecondTitle` 的 React import 补充 `useMemo`，修复可视化调节中当前数据最大值计算逻辑挂载时触发 `ReferenceError: useMemo is not defined` 导致主页面崩溃的问题。
| 2026-05-26 | 修复缺陷 | 修复 `SecondTitle` 漏引入 `useMemo` 导致页面初始化崩溃的问题 |

## 2026-05-26 置零同步长 URL 修复
- `SecondTitle.wsDataZero()` 同步 `/setZeroBaseline` 时不再通过 `buildFallbackParams` 把整张置零基线矩阵编码到 query string，只通过 POST body 传输，避免 URL 过长导致浏览器报 CORS/请求失败但本地置零已生效的误报警告。
| 2026-05-26 | 修复缺陷 | 修复预压力置零实际生效后仍提示“置零状态同步失败”的问题 |

## 2026-05-26 COP 报告多传感面与滚动修复
- `CopReport` 不再只分析单个矩阵 key；会读取历史记录中的全部有效矩阵，优先显示当前主分析面，并把其余传感面（如座椅/靠背）追加为独立压力中心分析章节。
- `CopReport.scss` 将报告页改为自身 `100vh` 纵向滚动容器，规避全局 `html/body/#root overflow:hidden` 导致报告只能显示一屏、无法继续向下滚动的问题。
| 2026-05-26 | 修复缺陷 | 修复压力中心报告缺少座椅传感面、且页面不能纵向滚动的问题 |
## 2026-05-26 对比播放帧号同步修复
- `NumThresContrast` 跨记录播放改为 A/B 独立帧滑条，手动拖动互不绑定；播放时两个帧号同时递增，任一侧到末帧后保持末帧直到另一侧播放结束。
- 对比压力/面积曲线和 CSV 导出改为按同一帧序号取 A/B 数据，较短序列复用末帧，不再用百分比或时间轴重采样。
- `/getContrastIndex` 支持独立 `leftIndex` / `rightIndex`，默认按帧号同步取帧，并在返回帧中携带 `frameIndex`。
| 2026-05-26 | 修复缺陷 | 修复数据对比播放按百分比对齐导致不同帧率/帧数数据错位的问题 |

## 2026-05-26 对比退出实时恢复与导入导出字段收敛
- `NumThresContrast.exitContrast()` 改为等待 `/cancalDbPlay` 完成后再切回实时状态；后端取消历史/对比状态时会清理 A/B 与历史缓存，并立即及延迟推送实时帧，避免 UI 已回实时但数据流仍停在历史模式。
- 历史数据导出字段收敛为最大压强、最大压强坐标、平均压强、受力面积、数据、点数、总压力、备注、时间戳和设备 MAC；CSV 与 XLSX 共用同一套中文表头。
- 导入入口支持 `.csv/.xlsx/.xls`，后端用 `xlsx` 解析首个工作表，并兼容“时间戳 + 数据”简化表头，允许导入当前导出的 XLSX 文件。
| 2026-05-26 | 修复缺陷 | 修复退出对比后实时数据流未恢复，并收敛导出字段、补齐 XLSX 导入兼容 |

## 2026-05-26 退出对比残留回放消息拦截
- `Test` 的 WebSocket 分发对实时帧和回放帧增加状态保护：实时帧到达且当前不在对比页时会清理回放标记、历史图表和回放时间；回放帧、index、timestamp 只有当前仍处于 `replay` 状态时才会继续推进。
- `NumThresContrast.exitContrast()` 退出时同步清理前端回放选区、历史曲线和历史时间状态，避免旧的回放消息在退出后把页面重新打回历史逻辑。
| 2026-05-26 | 修复缺陷 | 修复退出数据对比后旧回放消息残留导致实时数据再次暂停的问题 |

## 2026-05-26 对比前后实时推送定时器恢复
- `DataService` 新增 `ensureRealtimeTimer()`，可在历史/对比流程结束后按当前实时帧率重启 `state.playtimer`，避免只补推单帧后实时流再次停止。
- `/getContrastData` 进入对比前会显式退出历史模式、停止历史回放 timer 并恢复实时推送 timer；`/cancalDbPlay` 取消对比/历史时同样恢复实时推送循环。
| 2026-05-26 | 修复缺陷 | 修复退出对比后后端实时发送定时器未恢复导致数据持续暂停的问题 |

## 2026-05-26 历史列表预取不再暂停实时流
- `/getColHistory` 只查询历史记录列表，不再设置 `state.historyFlag = true`，也不再广播空 `sitData`；避免 `ColAndHistory` 重新挂载或 idle 预取历史列表时把后端切入历史模式。
- 历史模式入口收敛到 `/getDbHistory`、CSV/XLSX 导入回放等真正加载历史帧的接口，打开历史抽屉或预取列表不再影响实时数据流。
| 2026-05-26 | 修复缺陷 | 修复退出对比后历史列表预取重新打开 historyFlag 导致实时数据暂停的问题 |

## 2026-05-26 导出靠背坐垫同帧合并
- `util/db.js` 的历史数据导出从“每个矩阵 key 一行”调整为“每个历史帧一行”，同一帧中的靠背和坐垫数据分别写入 `靠背*`、`坐垫*` 字段，避免 back/sit 被拆成两条记录。
- 导出字段顺序固定为 `时间戳`、`设备MAC` 在前，后接靠背统计/数据、坐垫统计/数据，最后写入备注；CSV 与 XLSX 共用该表头。
- CSV/XLSX 导入解析兼容新的 `靠背数据`、`坐垫数据` 中文列名，重新导入当前导出文件时仍能按同一帧恢复靠背和坐垫矩阵。
| 2026-05-26 | 优化重构 | 调整历史数据下载结构，时间戳和 MAC 前置，并将靠背/坐垫数据合并到同一行展示 |

## 2026-05-26 XLSX 导入回放矩阵 key 修复
- `util/db.js` 写入 XLSX 时把 `timestamp/device_mac` 固定为文本值，避免 Excel 将毫秒时间戳显示或读取成科学计数法，导致多帧被错误合并。
- XLSX 导入改为读取 raw cell value，并在遇到科学计数法时间戳时按行号分组，兼容已经导出的旧 XLSX 文件。
- CSV/XLSX 回放构建矩阵时只保留标准矩阵 key；重复矩阵列按数组长度归入 `endi-back/endi-sit`，无法归类时跳过，不再生成 `endi-back-3` 这类播放校验不认识的 key。
| 2026-05-26 | 修复缺陷 | 修复上传 XLSX 后因时间戳科学计数法和重复矩阵 key 导致回放无法播放的问题 |

## 2026-05-26 对比页曲线临时隐藏
- `NumThresContrast` 暂停渲染压力变化曲线和面积变化曲线，仅保留三张对比热力图、播放控制、指标表和底部时间信息。
- `contrast.scss` 移除对比页 grid 中的 `charts` 预留行，避免隐藏曲线后页面中间留下空白区域。
| 2026-05-26 | 优化重构 | 临时隐藏数据对比页的压力变化曲线和面积变化曲线 |

## 2026-06-01 对比对象、量尺选中与 COP PDF 导出修复
- `NumThresContrast` 将对比对象下拉框和状态栏里的 `endi-sit`、`endi-back` 显示为“坐垫传感器”“靠背传感器”（英文环境为 Seat/Back Sensor），底层 key 保持不变以兼容现有对比数据。
- `newRuler` 在量尺已选中时增加同一量尺再次点击取消选中；如果按住后发生拖动，仍按原逻辑拖拽整条量尺或端点。
- `CopReport` 导出 PDF 前临时切换到可打印布局，`CopReport.scss` 在打印和导出状态下解除 `100vh` 滚动容器裁剪，`index.js` 的 `printToPDF` 启用 CSS 分页和默认页边距，避免只导出首屏或内容被截断。
| 2026-06-01 | 修复缺陷 | 修复对比对象显示不友好、量尺无法再次点击取消选中、COP 报告 PDF 导出不完整的问题 |

## 2026-06-01 数据对比指标计算修正
- `NumThresContrast` 的受压面积从有效点数改为 `有效点数 * 点宽间距 * 点高间距 / 100`，按当前对比对象读取 `pointConfig`，输出单位为 `cm²`；平均压强仍按有效点数计算，点数指标保持独立。
- 对比指标表和导出 CSV 的 `B-A` 改为按 A/B 展示精度后的数值相减，避免 A/B 显示值与差值列因原始浮点精度不同而看起来不一致。
| 2026-06-01 | 修复缺陷 | 修复数据对比中 B-A 差值显示口径不一致，以及受压面积未乘传感点实际面积的问题 |

## 2026-06-01 COP PDF 导出视觉修正
- `CopReport.exportPdf()` 不再给当前可见页面添加导出态 class，避免点击“导出 PDF”时报告页先隐藏工具栏、铺满宽度而产生突然放大的视觉跳变。
- `CopReport.scss` 的打印媒体样式补齐 `.App` 和 `.App-header` 外层容器，将背景、尺寸、overflow 和布局重置为白底可分页输出，避免 Electron 打印时把主应用深色背景打印成 PDF 黑边。
| 2026-06-01 | 修复缺陷 | 修复 COP 报告导出 PDF 出现黑边，以及点击导出时报告页突然放大的问题 |

## 2026-06-01 导入数据报告与对比支持
- `index.js` 的 PDF 导出改回无页边距打印，`CopReport.scss` 将 A4 留白改为报告自身 `8mm` 内边距，避免 PDF 页边距区域露出 Electron 窗口底色形成黑边。
- `ColAndHistory` 的导入数据 tab 增加“生成报告”和“对比”入口，导入文件选择逻辑与本地历史数据一致，支持跨记录对比和同记录时间点对比。
- `CopReport` 支持通过 `source=csv&fileName=...` 请求导入数据报告；`server/api/routes.js` 复用导入文件解析链路，为 `/copReportData` 和 `/getContrastData` 增加 CSV/XLSX 导入文件数据源。
| 2026-06-01 | 新增功能 | 支持导入数据生成 COP 报告和进入数据对比，并进一步修复 PDF 黑边问题 |

## 2026-06-01 3D 部位切换与导出框选列
- `ViewSetting` 从 2D 靠背/坐垫切换到 3D 时会继承当前部位，先同步 `displayType`，再在 3D ref 可用后触发对应 `actionSit`；`ThreeAndCarPointV2` 初始化后也会按当前 `displayType` 补一次靠背/坐垫/整体动画，避免从 2D 靠背直接进入 3D 时落到整体视图。
- `util/db.js` 的下载字段选择改为固定的一套通用字段：时间戳、设备 MAC、最大压强、最大压强坐标、平均压强、受力面积、数据、点数、总压力、备注；导出时再自动展开靠背、坐垫和最多 4 个框选区域列。
- CSV/XLSX 导出的最大压强、平均压强、总压力统一格式化为 1 位小数；靠背/坐垫主列保持整面数据，框选 1-4 作为同一套字段的独立列输出，不再要求用户分别勾选每个部位或每个框选字段。
| 2026-06-01 | 修复缺陷 | 修复 2D 部位切 3D 部位时未进入对应动画，并将导出字段模板统一应用到靠背、坐垫和框选区域 |

## 2026-06-01 数据对比倍速与可视化默认值设置
- `NumThresContrast` 的非时间点数据对比回放增加 `0.5x/1x/2x/4x` 倍速下拉，播放定时器按所选倍速调整帧推进间隔，默认仍为 `1x`。
- `SecondTitle` 可视化调节抽屉取消每个调节项旁边的 `Max` 输入框；参数上限继续读取现有系统配置默认值，只用于滑块和输入框边界，不再在抽屉内编辑或保存最大值。
- `SystemSetting` 的可视化参数表取消“上限值（最大）”列，只保留默认值编辑；生成配置时仍带上现有 `maxObj` 默认上限，保持后端配置结构兼容。
| 2026-06-01 | 优化重构 | 数据对比回放补齐 0.5x/1x/2x/4x 倍速，并取消可视化编辑里的最大值设置 |

## 2026-06-01 3D 靠背切换与回放多框选导出修复
- `ThreeAndCarPointV2` 在座椅 GLB 模型异步加载完成后，会重新读取当前 `displayType`；如果当前是 `back` 或 `sit` 单部位 3D 视图，立即隐藏整椅模型并重新执行对应部位的 `actionSit()`，避免从 2D 靠背直接切到 3D 靠背时模型后加载又显示出来。
- `Test` 的历史回放框选订阅不再只发送第一个框选；会按矩阵 key 把所有框选整理为 `{ regions: [...] }` 写入 `/getDbHistorySelect`，供回放帧显示和导出缓存复用。
- `/getDbHistorySelect` 的曲线计算仍按每个矩阵的第一个框选生成压力/面积曲线，但 `state.historySelectCache` 保留完整 `regions`，`util/db.js` 导出时会按靠背、坐垫和框选 1-4 展开同一套“最大压强、坐标、平均压强、受力面积、数据、点数、总压力”字段。
| 2026-06-01 | 修复缺陷 | 修复 2D 靠背切换到 3D 靠背后座椅模型残留，以及历史回放多框选导出缺少框选字段的问题 |

## 2026-06-01 历史播放结束清屏与报告框选清理
- `DataService.finishPlayback()` 在历史播放自然结束时同步退出后端历史模式，清理回放选择缓存，并在仍有实时串口源时立即恢复实时推送；播放结束消息新增 `realtimeAvailable` 标记，供前端判断是否需要清空画面。
- `Test` 收到播放结束且无实时源时，会切回实时状态并清空当前可视化矩阵、COP、历史曲线、回放状态和历史框选 DOM，避免断开连接后保留最后一帧历史数据。
- `SecondTitle` 增加 `force-clear-selection-mode` 事件；`ColAndHistory` 进入 COP 报告前会强制停止框选、清空框选状态和历史框选 DOM，避免报告页继续残留当前框选。
| 2026-06-01 | 修复缺陷 | 修复断开连接后历史播放结束仍残留数据可视化，以及生成报告后框选浮层残留的问题 |

## 2026-06-01 跨来源数据对比与回放退出清屏修复
- `ColAndHistory` 在数据对比模式下切换“本地/导入”标签页时不再重置已选 A/B 数据，并为历史记录与导入文件分别写入 `history/csv` 来源标记；启动对比时按每条记录自身来源传递 `leftSource/rightSource`，支持本地历史数据和导入 CSV/XLSX 数据互相对比。
- `/getContrastData` 判断“同一条记录”时同时比较记录 id 和来源，避免本地记录与导入文件同名时被误判为不可对比；历史来源继续读 SQLite，导入来源复用 CSV/XLSX 回放解析链路。
- `useMatrixData` 新增 `clearMatrixData()`，退出历史回放时由 `ColAndHistory.close()` 主动调用页面级清理函数，清空最后一帧、显示矩阵、统计缓存、COP 和历史框选 DOM，避免回到实时后界面停留在历史最后一帧。
| 2026-06-01 | 修复缺陷 | 修复数据对比无法跨本地历史和导入数据选择，以及回放退出后历史最后一帧残留的问题 |

## 2026-06-01 回放清屏、跨来源对比与重复导入提示修复
- `ChartsAside` 在 `historyChart` 和实时统计缓存同时清空时会主动清理两条 ECharts 曲线、正态分布图和 COP 轨迹，并在渲染循环发现空数据时保持空图，避免退出历史回放后图表继续显示最后一帧历史曲线。
- `ColAndHistory` 的回放控制条“历史”入口接入统一 `close()` 清理流程；`Test` 从回放状态收到实时帧前也会先清空上一帧回放缓存，再处理实时帧。
- `/getContrastData` 对比链路把 `endi-back/back`、`endi-sit/sit` 归一为同一靠背/坐垫对比 key，同时保留原始矩阵尺寸，修复本地历史数据和导入 CSV/XLSX 都能回放但互相对比提示“数据为空”的问题。
- `NumThresContrast` 与 `ContrastHeatmap` 兼容归一化后的 `back/sit` key：面积计算会按当前系统补回点间距，`back` 且尺寸为 `50x64` 时继续套用 endi 靠背有效区 mask。
- `ColAndHistory` 上传导入文件前会按文件名检查已导入列表，重复导入时直接提示“该数据已导入，请勿重复导入”，避免同名文件覆盖或重复出现在导入列表。
| 2026-06-01 | 修复缺陷 | 修复回放回到实时后图表和最后一帧残留、跨来源数据对比为空，以及重复导入缺少提示的问题 |

## 2026-06-01 导入数据对比来源兜底
- `/getContrastData` 的历史/导入数据加载链路新增文件路径兜底识别：即使前端请求中的 `source/leftSource/rightSource` 丢失，只要记录值本身能解析到已存在的 `.csv/.xlsx/.xls` 文件，就按导入回放数据加载，而不是拿文件路径去查 SQLite。
- `loadHistoryPlayback()` 统一通过 `shouldLoadImportedPlayback()` 判断导入来源，保留显式 `csv/import` source 的原行为，同时兼容历史抽屉里已保存的绝对文件路径或文件名。
| 2026-06-01 | 修复缺陷 | 修复本地历史数据与导入 CSV 同时对比时因导入来源丢失而提示“数据为空”的问题 |

## 2026-06-01 可视化调节激活态与框选 2D 锁定
- `SecondTitle` 为可视化调节按钮接入 `onClickStatus`，抽屉打开时按钮和图标显示选中态；进入框选前会关闭放大镜、把 2D 数字缩放重置为 100%，并广播 `reset-num-2d-view` 恢复默认位置。
- `ViewSetting` 在框选状态下拦截 2D 数字底部放大/缩小按钮，避免框选时继续改变 2D 视图比例。
- `NumThreeColorV3` 与 `NumThreeColorV4` 在框选或量尺锁定状态下拦截滚轮缩放、停止拖动，并把 2D 相机缩放和平移恢复到初始视图，保证框选坐标和显示比例一致。
| 2026-06-01 | 修复缺陷 | 为可视化调节补充选中态，并修复框选时 2D 数字视图未重置且仍可缩放/拖动的问题 |

## 2026-06-01 导出通用字段表头展开
- `util/db.js` 的下载字段弹窗仍只暴露一套通用字段：时间戳、设备 MAC、最大压强、最大压强坐标、平均压强、受力面积、数据、点数、总压力和备注。
- CSV/XLSX 写入时把靠背、坐垫以及最多 4 个框选区域展开到第一行表头，例如“靠背最大压强(kPa)”“坐垫最大压强(kPa)”“靠背框选1最大压强(kPa)”，不再使用“数据对象”列。
- 框选区域继续复用历史回放的 `selectJson/historySelectCache` 或历史备注里的 `select_json`，因此勾选一次通用字段即可同时导出整面数据和框选数据的同类指标。
| 2026-06-01 | 优化重构 | 将历史数据下载改为第一行表头展开对象，字段选择仍保持一套通用字段 |
