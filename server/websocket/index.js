/**
 * WebSocket 服务模块
 * 负责 WebSocket 服务器的创建、连接管理和消息广播
 * 支持 JSON 和 MessagePack 两种传输格式
 */
const WebSocket = require('ws')
const http = require('http')

let msgpack = null
try {
  msgpack = require('@msgpack/msgpack')
  console.log('[WS] MessagePack 已加载，启用二进制传输')
} catch {
  console.log('[WS] MessagePack 未安装，使用 JSON 传输')
}

let wsHttpServer = null
let wsServer = null

/**
 * 创建 WebSocket 服务器 (noServer 模式)
 */
function createWsServer() {
  wsHttpServer = http.createServer()
  wsServer = new WebSocket.Server({ noServer: true })

  wsHttpServer.on('upgrade', (request, socket, head) => {
    wsServer.handleUpgrade(request, socket, head, (ws) => {
      wsServer.emit('connection', ws, request)
    })
  })

  wsServer.on('connection', (ws, req) => {
    const clientName = `${req.connection.remoteAddress}:${req.connection.remotePort}`
    console.log(`[WS] 客户端已连接: ${clientName}`)
    broadcast(JSON.stringify({}))
  })

  return { wsHttpServer, wsServer }
}

/**
 * 向所有已连接的 WebSocket 客户端广播数据
 * 如果 msgpack 可用，自动使用二进制格式传输（体积更小、解析更快）
 * @param {string|Object} data - JSON 字符串或对象
 */
function broadcast(data) {
  if (!wsServer) return
  let payload
  if (msgpack) {
    // 二进制模式：将对象编码为 MessagePack
    const obj = typeof data === 'string' ? JSON.parse(data) : data
    payload = Buffer.from(msgpack.encode(obj))
  } else {
    // JSON 回退模式
    payload = typeof data === 'string' ? data : JSON.stringify(data)
  }
  wsServer.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload)
    }
  })
}

/**
 * 检查 msgpack 是否可用
 */
function isBinaryMode() {
  return msgpack !== null
}

/**
 * 获取底层 HTTP 服务器 (用于 listenWithRetry)
 */
function getHttpServer() {
  return wsHttpServer
}

module.exports = { createWsServer, broadcast, getHttpServer, isBinaryMode }
