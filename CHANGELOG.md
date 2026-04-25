# 项目优化修改说明

## 一、一键启动方案

### 改动核心：`index.js` (Electron 主进程)

完全重写了 Electron 主进程，实现了 **一条命令同时启动前端和后端**：

```bash
# 开发模式（自动启动 React dev server + API 服务）
npm run dev

# 等价于
npm start
```

#### 启动流程

```
npm run dev
  └── electron .  (启动 Electron 主进程)
        ├── 1. 获取硬件指纹（授权校验）
        ├── 2. fork() 启动后端 API 子进程 (serialServer.js → :19245)
        ├── 3. spawn() 启动 React dev server (client/ → :3000)
        │      └── 自动设置 BROWSER=none 阻止打开浏览器
        ├── 4. 创建 BrowserWindow 加载 http://127.0.0.1:3000
        └── 5. 窗口关闭时自动清理所有子进程
```

#### 开发 vs 生产模式

| 特性 | 开发模式 (`!app.isPackaged`) | 生产模式 (`app.isPackaged`) |
|------|------|------|
| 前端 | 自动启动 React dev server (:3000) | 内置静态文件服务器 (:2999) |
| 后端 | fork 子进程 (:19245) | fork 子进程 (:19245) |
| DevTools | 自动打开 (detach 模式) | 不打开 |
| 热更新 | 支持 (CRA HMR) | 不支持 |

#### 进程管理

- 所有子进程在窗口关闭时自动清理
- 监听 `window-all-closed`、`before-quit`、`uncaughtException` 事件
- 后端子进程通过 `process.send({ type: 'ready' })` 通知主进程启动完成
- 设置 15 秒超时保护，启动失败自动退出

---

## 二、后端优化 (`server/serialServer.js`)

### 2.1 结构性优化

| 优化项 | 修改前 | 修改后 |
|--------|--------|--------|
| 文件行数 | ~1487 行（含大量注释代码） | ~680 行（精简 54%） |
| 中间件 | 重复注册 `express.json()` 和 `cors()` | 只注册一次 |
| 错误处理 | 各路由手动 try-catch | 统一 `asyncHandler` 包装器 |
| 日志输出 | `console.log` 无前缀 | 统一 `[Server]`、`[Serial]`、`[DB]`、`[WS]` 前缀 |
| 魔法数字 | 硬编码 `19245`、`19999`、`1000`、`80` 等 | 提取为常量 `API_PORT`、`WS_PORT`、`ONLINE_THRESHOLD` 等 |

### 2.2 清理内容

- **删除 ~800 行注释代码**：包括旧版串口连接逻辑、废弃的 CSV 处理代码、调试用 `console.log`
- **删除重复函数**：`changeDbName` 和 `changeDbDataName` 在 `db.js` 中有重复实现
- **删除未使用变量**：`linkIngPort`、多余的 `sendMacNum`/`successNum` 计数器

### 2.3 功能优化

- **串口数据处理重构**：将 1024/1025/4096/4097 等不同长度的数据包处理逻辑提取为独立函数 `processMatrixData()`、`processTypedMatrixData()`
- **帧率检测逻辑提取**：`updateHZAndStartTimer()` 统一管理帧率计算和定时器启动
- **对比数据并行查询**：`/getContrastData` 路由使用 `Promise.all` 并行查询左右数据
- **MAC 响应处理提取**：`handleMacResponse()` 独立函数处理设备识别逻辑
- **后端进程通信**：添加 `process.send({ type: 'ready' })` 通知主进程启动完成

---

## 三、前端优化

### 3.1 `store/equipStore.js`

- **修复重复定义**：`setDisplay` 被定义了两次，已合并
- **添加注释分组**：按功能分组 (实时数据/系统配置/设备状态/可视化设置/框选工具/历史数据)
- **安全的 localStorage 读取**：添加 try-catch 防止 JSON 解析失败

### 3.2 `util/constant.js`

- **API 地址环境变量化**：`serverAddress`、`localAddress`、`wsAddress` 改为从 `process.env.REACT_APP_*` 读取
- **添加 `.env` 文件**：`client/.env` 提供默认配置
- **添加注释**：各配置区块添加中文注释

### 3.3 其他

- **`preload.js`**：添加 `platform` 信息暴露，保留 `getPath` 功能

---

## 四、工具模块优化

### 4.1 `util/getWinConfig.js`

- **移除副作用调用**：文件末尾的 `getHardwareFingerprint().then(...)` 会在 `require` 时立即执行，已删除
- **简化返回值**：直接返回 UUID 字符串

### 4.2 `util/getServer.js`

- **清理死代码**：移除注释掉的远程授权逻辑，保留 TODO 标记
- **简化结构**：保持接口不变

### 4.3 `server/HttpResult.js`

- **升级为 class 语法**：添加 `static success()` 和 `static error()` 工厂方法
- **添加 JSDoc 注释**

---

## 五、脚本配置 (`package.json`)

### 根目录 package.json

```json
{
  "scripts": {
    "dev": "electron .",              // 开发模式一键启动
    "start": "electron .",            // 同 dev
    "build:client": "cd client && npm run build",  // 单独构建前端
    "build:win": "npm run build:client && electron-builder -w",  // 构建 Windows 安装包
    "build:mac": "npm run build:client && electron-builder -m",  // 构建 macOS 安装包
    "install:all": "npm install && cd client && npm install"     // 一键安装所有依赖
  }
}
```

### 新增 `build.files` 和 `build.extraResources`

明确指定打包文件范围，避免将开发文件打入生产包。

---

## 六、使用方式

### 首次使用

```bash
# 1. 安装所有依赖（根目录 + client）
npm run install:all

# 2. 一键启动开发环境
npm run dev
```

### 日常开发

```bash
# 启动后 Electron 会自动：
# - 启动后端 API 服务 (localhost:19245)
# - 启动前端 React dev server (localhost:3000)
# - 打开 Electron 窗口加载前端页面
# - 打开 DevTools (detach 模式)
npm run dev
```

### 构建发布

```bash
# Windows
npm run build:win

# macOS
npm run build:mac
```

---

## 七、endi1.0.1（2026-04-22）

### 更新内容

- **框选框亮度提升**
  - 框选边框改为更亮的显示色，提升深色界面下的可见度
  - 填充层改为单独半透明色值，不再通过整体 `opacity` 把边框一起压暗
  - 鼠标拖拽框选与输入生成框选统一复用同一套视觉样式
