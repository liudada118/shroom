# 睡眠监护仪 (Sleep Monitor)

基于串口通信协议 V1.3 的睡眠检测桌面软件，采用 Electron + React + TypeScript 技术栈开发。

## 功能特性

### 实时监测
- **心率监测** — 实时显示心率数据 (BPM)
- **呼吸率监测** — 实时显示呼吸频率 (次/分)
- **在/离床检测** — 自动识别在床、离床、体动状态
- **睡眠分期** — 觉醒、浅睡、深睡、快速眼动 (REM) 四阶段分期
- **疲劳度评估** — 清醒/正常、轻度疲劳、重度疲劳分级
- **憋气检测** — 实时检测异常呼吸暂停
- **情绪压力** — 深度放松、正常、中等压力、高压力/交感兴奋、极高应激分级

### AD 采样波形
- 实时绘制原始 AD 采样信号波形
- 支持缩放、自动滚动
- 采样率 125Hz，每 4 秒上报一次

### 历史数据
- 自动记录所有检测数据
- 趋势图表展示
- 睡眠分期统计
- 数据导出为 CSV 格式

### 设备管理
- 串口自动扫描与连接
- 设备信息查询（SN、固件版本、硬件版本）
- 系统时间同步
- 传感器压力阈值配置
- 自动上报开关管理
- 轮询模式支持

## 通信协议

| 参数 | 值 |
|---|---|
| 波特率 | 115200 |
| 数据位 | 8 |
| 停止位 | 1 |
| 校验位 | None |
| 帧头 | 0xAA55 |
| 帧尾 | 0xFEEF |
| CRC32 多项式 | 0x04C11DB7 |

## 技术架构

```
sleep-monitor/
├── main.js              # Electron 主进程
├── preload.js           # 预加载脚本
├── package.json         # 项目配置
├── server/
│   ├── serialServer.js  # 串口服务 + REST API + WebSocket
│   └── protocol.js      # 协议解析核心模块
└── client/
    ├── src/
    │   ├── App.tsx          # 主应用组件
    │   ├── components/      # UI 组件
    │   ├── pages/           # 页面组件
    │   ├── hooks/           # React Hooks
    │   └── lib/             # 工具库
    ├── index.html
    └── package.json
```

## 快速开始

### 环境要求
- Node.js >= 18
- npm 或 pnpm

### 安装依赖

```bash
cd sleep-monitor

# 安装主进程依赖
npm install

# 安装前端依赖
cd client && npm install
```

### 开发模式

```bash
# 启动前端开发服务器
cd client && npm run dev

# 另一个终端启动后端服务
node server/serialServer.js

# 或使用 Electron 启动完整应用
npm start
```

### 生产构建

```bash
# 构建前端
npm run build:client

# 打包 Electron 应用
npm run build        # Windows
npm run build:mac    # macOS
```

## API 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/ports | 列出可用串口 |
| POST | /api/connect | 连接串口 |
| POST | /api/disconnect | 断开串口 |
| GET | /api/status | 获取连接状态 |
| GET | /api/device | 获取设备信息 |
| POST | /api/syncTime | 同步系统时间 |
| POST | /api/threshold | 设置压力阈值 |
| GET | /api/threshold | 读取压力阈值 |
| POST | /api/switches | 设置自动上报开关 |
| GET | /api/switches | 查询开关状态 |
| POST | /api/polling/start | 开始轮询 |
| POST | /api/polling/stop | 停止轮询 |
| GET | /api/history | 获取历史数据 |
| GET | /api/adSamples | 获取 AD 采样数据 |
| POST | /api/query/:type | 手动查询指标 |
| GET | /api/export | 导出 CSV |
| POST | /api/clearHistory | 清除历史数据 |

## WebSocket 消息类型

| 类型 | 说明 |
|---|---|
| status | 连接状态变更 |
| vitals | 心率/呼吸率/在离床数据 |
| sleep | 睡眠状态 |
| fatigue | 疲劳度 |
| breath | 憋气状态 |
| stress | 情绪压力 |
| sleepGroup | 睡眠组数据上报 |
| adData | AD 采样数据 |
| deviceInfo | 设备信息 |
| switches | 开关状态 |
| thresholds | 阈值数据 |
| error | 错误信息 |

## 协议版本

本软件基于《睡眠监护仪串口通信协议 V1.3》(2026.5.30) 开发。
