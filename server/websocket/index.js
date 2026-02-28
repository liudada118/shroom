/**
 * WebSocket 服务模块
 * 负责 WebSocket 服务器的创建、连接管理和消息广播
 */
const WebSocket = require('ws')
const http = require('http')

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
 * @param {string} data - JSON 字符串
 */
function broadcast(data) {
  if (!wsServer) return
  wsServer.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data)
    }
  })
}

/**
 * 获取底层 HTTP 服务器 (用于 listenWithRetry)
 */
function getHttpServer() {
  return wsHttpServer
}

module.exports = { createWsServer, broadcast, getHttpServer }
