/**
 * serialServer.js — 后端服务入口
 * 
 * 重构后的模块化架构：
 *   server/state.js           — 全局状态管理
 *   server/websocket/index.js — WebSocket 服务
 *   server/serial/SerialManager.js — 串口管理
 *   server/services/DataService.js — 数据处理服务
 *   server/api/routes.js      — API 路由
 */
const express = require('express')
const os = require('os')
const fs = require('fs')
const path = require('path')
const cors = require('cors')
const http = require('http')
const { listenWithRetry, DEFAULT_PORTS } = require('../util/portFinder')
const { decryptStr } = require('../util/aes_ecb')
const { initDb } = require('../util/db')

// ─── 模块导入 ────────────────────────────────────────────
const { state } = require('./state')
const { createWsServer, getHttpServer } = require('./websocket')
const { startReconnectMonitor, setReconnectCallbacks } = require('./serial/SerialManager')
const routes = require('./api/routes')

// ─── Port配置 ────────────────────────────────────────────
let API_PORT = parseInt(process.env.API_PORT, 10) || DEFAULT_PORTS.api
let WS_PORT = parseInt(process.env.WS_PORT, 10) || DEFAULT_PORTS.ws

// ─── 环境变量 ────────────────────────────────────────────
let { isPackaged, appPath } = process.env
isPackaged = isPackaged === 'true'
const resourcesRoot = isPackaged
  ? (process.env.RESOURCES_PATH || (appPath ? path.resolve(appPath, '..') : path.resolve('resources')))
  : path.join(__dirname, '..')

// ─── 路径配置 ────────────────────────────────────────────
let dbPath = path.join(__dirname, '..', 'db')
let csvPath = path.join(__dirname, '..', 'data')
const configPath = path.join(__dirname, '..', 'config.txt')

if (isPackaged) {
  if (os.platform() === 'darwin') {
    dbPath = path.join(__dirname, '../../db')
    csvPath = path.join(__dirname, '../../data')
  } else {
    dbPath = path.join(resourcesRoot, 'db')
    csvPath = path.join(resourcesRoot, 'data')
  }
}

// ─── 配置文件读取 ─────────────────────────────────────────
const config = fs.readFileSync(configPath, 'utf-8')
const result = JSON.parse(decryptStr(config))
console.log('[Server] Config loaded:', Object.keys(result))

// ─── 初始化全局状态 ──────────────────────────────────────
state.file = result.value
state._dbPath = dbPath
state._dataPath = csvPath
state._isPackaged = isPackaged
state._configPath = configPath
state._defaultDownloadPath = process.env.DEFAULT_DOWNLOAD_PATH || null

// initDb 是 async 函数，在 startServer 中 await 初始化
const dbInitPromise = initDb(state.file, dbPath).then(({ db }) => {
  state.currentDb = db
  console.log('[Server] Database initialized:', dbPath)
}).catch((err) => {
  console.error('[Server] Database initialization failed:', err)
})

// ─── Express 应用配置 ─────────────────────────────────────
const app = express()
app.use(cors())
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ limit: '50mb', extended: true }))
app.use(routes)

// ─── 创建 WebSocket 服务 ─────────────────────────────────
createWsServer()

// ═══════════════════════════════════════════════════════════
//  启动服务（带Port冲突自动重试）
// ═══════════════════════════════════════════════════════════

async function startServer() {
  try {
    // 0. 等待数据库初始化完成
    await dbInitPromise

    // 1. 启动 WebSocket HTTP 服务器
    const wsHttpServer = getHttpServer()
    const actualWsPort = await listenWithRetry(wsHttpServer, WS_PORT, '0.0.0.0')
    if (actualWsPort !== WS_PORT) {
      console.log(`[Server] WebSocket port changed from ${WS_PORT} switched to ${actualWsPort}`)
      WS_PORT = actualWsPort
    }
    console.log(`[Server] WebSocket service started, port: ${WS_PORT}`)

    // 2. 启动 Express API 服务器
    const apiServer = http.createServer(app)
    const actualApiPort = await listenWithRetry(apiServer, API_PORT, '0.0.0.0')
    if (actualApiPort !== API_PORT) {
      console.log(`[Server] API port changed from ${API_PORT} switched to ${actualApiPort}`)
      API_PORT = actualApiPort
    }
    console.log(`[Server] API service started, port: ${API_PORT}`)

    // 3. 通知主进程actually using的Port
    process.send?.({ type: 'ready', apiPort: API_PORT, wsPort: WS_PORT })
    console.log(`[Server] All services started — API: ${API_PORT}, WS: ${WS_PORT}`)
  } catch (err) {
    console.error('[Server] Service startup failed:', err)
    process.send?.({ type: 'error', code: 'START_FAILED', message: err.message })
    process.exit(1)
  }
}

startServer()

// ─── 串口断线重连监控 ─────────────────────────────────────
const { broadcast } = require('./websocket')
setReconnectCallbacks(broadcast, null)
startReconnectMonitor()
