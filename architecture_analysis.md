# Shroom (jqtools2) 项目架构文档

> 最后更新：2026-03-01（重构后）

## 1. 项目概述

本项目是一个基于 Electron 的桌面应用程序，名为 `jqtools2`。其核心功能是连接硬件传感器（通过串口），实时采集、处理、可视化和分析压力数据。应用包含一个 React 构建的前端界面用于数据展示和交互，以及一个 Node.js 后端服务处理硬件通信、数据存储和 API 请求。

## 2. 总体架构

该项目采用经典的前后端分离的 Electron 应用架构模式：

```
┌─────────────────────────────────────────────────────┐
│                  Electron 主进程                      │
│  index.js / indexsingle.js                           │
│  ├── 端口分配 (portFinder.js)                        │
│  ├── 子进程管理 (fork serialServer)                   │
│  └── 窗口管理 (BrowserWindow)                        │
└──────────────┬──────────────────┬───────────────────┘
               │ fork             │ BrowserWindow
    ┌──────────▼──────────┐  ┌───▼───────────────────┐
    │    后端服务           │  │    前端 (React)        │
    │  server/             │  │  client/src/           │
    │  ├── serialServer.js │  │  ├── page/test/Test.js │
    │  ├── state.js        │  │  ├── hooks/            │
    │  ├── api/routes.js   │  │  │   ├── useWebSocket  │
    │  ├── websocket/      │  │  │   └── useMatrixData │
    │  ├── serial/         │  │  ├── store/equipStore  │
    │  └── services/       │  │  └── components/       │
    └─────────────────────┘  └───────────────────────┘
```

1. **Electron 主进程 (`index.js`)**: 作为应用的入口和协调者，负责创建 UI 窗口、管理应用生命周期，通过 `allocatePorts()` 动态分配端口，并 `fork` 一个独立的子进程来运行核心后端服务。
2. **核心后端服务 (`server/serialServer.js`)**: 运行在独立的 Node.js 子进程中，避免了繁重的 I/O 操作阻塞主进程和 UI 渲染。采用模块化架构，拆分为状态管理、WebSocket、串口、数据服务和 API 路由五个子模块。
3. **前端渲染进程 (`client/` 目录)**: 一个标准的 React 应用，通过 HTTP 和 WebSocket 与核心后端服务通信。核心逻辑封装在自定义 Hook 中。

## 3. 后端模块结构

重构后的后端采用模块化架构，各模块职责清晰：

| 模块 | 文件 | 职责 | 行数 |
|------|------|------|------|
| **入口** | `server/serialServer.js` | 初始化、启动服务、组装模块 | ~90 |
| **状态** | `server/state.js` | 全局状态管理（串口数据、设备状态、采集标志） | ~74 |
| **WebSocket** | `server/websocket/index.js` | WS 服务创建、消息广播、noServer 模式 | ~53 |
| **串口** | `server/serial/SerialManager.js` | 串口连接、数据解析、断线重连监控 | ~384 |
| **数据服务** | `server/services/DataService.js` | 数据采集、回放控制、CSV 导出 | ~201 |
| **API 路由** | `server/api/routes.js` | Express REST API 端点定义 | ~373 |

### 3.1. 技术栈

- **运行环境**: Node.js
- **应用框架**: Electron
- **HTTP 服务**: Express.js
- **实时通信**: `ws` (WebSocket)
- **硬件交互**: `serialport`
- **数据库**: `sqlite3`
- **加密**: `crypto-js` (用于配置文件加密)

### 3.2. 数据库 (`util/db.js`)

使用 SQLite3，主要表结构：

- **matrix** — 传感器采集数据（date, data, timestamp, select）
- **remarks** — 数据备注（date, alias, remark, select_json, updated_at）

优化点：
- 提取了 `dbRun/dbAll/dbGet` 通用 Promise 包装函数
- 每行数据只解析一次 JSON（消除了内层循环中的重复 `JSON.parse`）
- 提取了 `buildCsvHeaders` 和 `colArrData` 等工具函数

## 4. 前端架构

### 4.1. 技术栈

- **核心框架**: React
- **UI 组件库**: Ant Design (`antd`)
- **路由管理**: `react-router-dom`
- **状态管理**: `zustand`
- **数据请求**: `axios`
- **3D 可视化**: `three.js`
- **图表**: `echarts`
- **样式**: Sass (`.scss`)

### 4.2. Hook 架构

| Hook | 文件 | 职责 |
|------|------|------|
| `useWebSocket` | `hooks/useWebSocket.js` | WebSocket 连接管理、自动重连（指数退避）、消息分发 |
| `useMatrixData` | `hooks/useMatrixData.js` | 矩阵数据处理、翻转、框选、统计计算、预压力置零 |
| `useWindowSize` | `hooks/useWindowsize.js` | 窗口尺寸监听 |
| `useDebounce` | `hooks/useDebounce.js` | 防抖 |

### 4.3. 页面与路由

- `/`: 主测试和展示页面 (`Test.js`) — 从 1499 行精简到 272 行
- `/data`: 数据处理相关页面 (`Data.js`)
- `/addMac`: 设备管理页面 (`Equip.js`)

### 4.4. 组件文件命名

| 文件名 | 说明 |
|--------|------|
| `CanvasMemo.js` | 带 memo 优化的 Canvas 组件（原 `canvas copy.js`） |
| `NumThreeColorBase.js` | 基础版数字颜色组件 |
| `NumThreeColorV2.js` | V2 版本 — Test.js 使用 |
| `NumThreeColorV3.js` | V3 版本 — NumThres 使用 |
| `NumThreeColorV4.js` | V4 版本 — NumThres 使用 |
| `ThreeAndCarPointV2.js` | V2 版本 — endi 类型使用 |
| `ColControlV2.js` | V2 版本 — ColAndHistory 使用 |

## 5. 端口管理

所有端口通过 `util/portFinder.js` 统一管理：

| 端口 | 默认值 | 用途 |
|------|--------|------|
| API | 19245 | Express REST API |
| WebSocket | 19999 | 实时数据推送 |
| 前端开发 | 3000 | React dev server |
| 前端生产 | 2999 | 静态文件服务 |

端口分配流程：
1. 主进程调用 `allocatePorts()` 检测可用端口
2. 通过环境变量 `API_PORT`/`WS_PORT` 传递给子进程
3. 子进程使用 `listenWithRetry()` 二次保障（端口冲突时自动递增）
4. 实际端口通过 `process.send` 回传主进程
5. 前端通过 `window.__PORTS__`（生产）或 `REACT_APP_*_PORT`（开发）获取端口

## 6. 数据流转

```
硬件传感器 → 串口 → SerialManager（解析数据包）
    → state.js（更新全局状态）
    → WebSocket（广播给前端）
    → useWebSocket Hook（接收消息）
    → useMatrixData Hook（处理矩阵数据）
    → zustand store（更新状态）
    → React 组件（重新渲染 3D/图表）
```

## 7. 后续优化方向

1. **Python 集成**: 完善 `pyWorker.js` 中的进程管理和错误处理逻辑
2. **组件版本合并**: `NumThreeColor` 的 Base/V2/V3/V4 版本存在大量重复代码，可考虑通过参数化合并
3. **前端性能**: 进一步优化 `useMemo`/`useCallback`，对 Three.js 场景进行性能分析
4. **TypeScript 迁移**: 逐步引入 TypeScript 提升类型安全
5. **测试覆盖**: 为核心数据处理逻辑添加单元测试
