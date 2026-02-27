const net = require('net')

// ─── 默认端口配置 ────────────────────────────────────────
// 集中管理所有服务的首选端口，方便统一修改
const DEFAULT_PORTS = {
  api: 19245,          // 后端 API 端口
  ws: 19999,           // WebSocket 端口
  frontend: 3000,      // React dev server 端口（开发模式）
  frontendProd: 2999   // 静态文件服务端口（生产模式）
}

/**
 * 检测指定端口是否可用
 * 通过尝试绑定端口来检测，比简单的连接测试更可靠
 * @param {number} port 要检测的端口号
 * @param {string} host 主机地址，默认 127.0.0.1
 * @returns {Promise<boolean>} 端口是否可用
 */
function isPortAvailable(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    if (port < 1 || port > 65535) {
      resolve(false)
      return
    }

    const server = net.createServer()

    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false)
      } else {
        // 其他错误（如权限不足）也视为不可用
        console.log(`[PortFinder] 端口 ${port} 检测异常: ${err.code || err.message}`)
        resolve(false)
      }
    })

    server.once('listening', () => {
      server.close(() => {
        resolve(true)
      })
    })

    server.listen(port, host)
  })
}

/**
 * 从指定端口开始，查找第一个可用端口
 * @param {number} startPort 起始端口号
 * @param {number} maxAttempts 最大尝试次数，默认 100
 * @param {string} host 主机地址，默认 127.0.0.1
 * @returns {Promise<number>} 可用的端口号
 * @throws {Error} 如果在最大尝试次数内未找到可用端口
 */
async function findAvailablePort(startPort, maxAttempts = 100, host = '127.0.0.1') {
  for (let i = 0; i < maxAttempts; i++) {
    const port = startPort + i
    if (port > 65535) break

    const available = await isPortAvailable(port, host)
    if (available) {
      return port
    }

    if (i === 0) {
      console.log(`[PortFinder] 端口 ${startPort} 已被占用，正在寻找可用端口...`)
    }
  }

  throw new Error(`[PortFinder] 在 ${startPort}-${startPort + maxAttempts - 1} 范围内未找到可用端口`)
}

/**
 * 尝试在指定端口启动服务器，如果端口被占用则自动查找下一个可用端口
 * 解决 isPortAvailable 检测与实际 listen 之间的 TOCTOU 竞态问题
 * @param {Object} server 一个 net.Server 或兼容对象（如 Express app、http.Server）
 * @param {number} preferredPort 首选端口
 * @param {string} host 主机地址，默认 127.0.0.1
 * @param {number} maxAttempts 最大尝试次数，默认 100
 * @returns {Promise<number>} 实际绑定的端口号
 */
function listenWithRetry(server, preferredPort, host = '127.0.0.1', maxAttempts = 100) {
  return new Promise((resolve, reject) => {
    let currentPort = preferredPort
    let attempts = 0

    function tryListen() {
      if (attempts >= maxAttempts || currentPort > 65535) {
        reject(new Error(`[PortFinder] 在 ${preferredPort}-${currentPort - 1} 范围内未能成功绑定端口`))
        return
      }

      // 移除之前可能绑定的 error 监听器
      server.removeAllListeners('error')

      server.once('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          if (attempts === 0) {
            console.log(`[PortFinder] 端口 ${preferredPort} 已被占用，正在寻找可用端口...`)
          }
          attempts++
          currentPort++
          tryListen()
        } else {
          reject(err)
        }
      })

      server.listen(currentPort, host, () => {
        if (currentPort !== preferredPort) {
          console.log(`[PortFinder] ${preferredPort} 已占用 → 实际使用 ${currentPort}`)
        }
        resolve(currentPort)
      })
    }

    tryListen()
  })
}

/**
 * 批量分配多个不冲突的可用端口
 * 确保分配的端口之间也不会互相冲突
 * @param {Object} portConfig 端口配置 { name: preferredPort, ... }
 * @returns {Promise<Object>} 实际分配的端口 { name: actualPort, ... }
 */
async function allocatePorts(portConfig) {
  const allocated = {}
  const usedPorts = new Set()

  for (const [name, preferredPort] of Object.entries(portConfig)) {
    let port = preferredPort
    let attempts = 0
    const maxAttempts = 100

    // 如果首选端口已被其他服务占用或已分配给前面的服务
    while (attempts < maxAttempts) {
      if (port > 65535) {
        throw new Error(`[PortFinder] 无法为 ${name} 分配可用端口（超出端口范围）`)
      }

      if (!usedPorts.has(port) && await isPortAvailable(port)) {
        break
      }

      port++
      attempts++
    }

    if (attempts >= maxAttempts) {
      throw new Error(`[PortFinder] 无法为 ${name} 分配可用端口（已尝试 ${maxAttempts} 次）`)
    }

    if (port !== preferredPort) {
      console.log(`[PortFinder] ${name}: ${preferredPort} 已占用 → 使用 ${port}`)
    } else {
      console.log(`[PortFinder] ${name}: ${port} ✓`)
    }

    allocated[name] = port
    usedPorts.add(port)
  }

  return allocated
}

/**
 * 强制释放指定端口上的进程（仅限开发环境使用）
 * @param {number} port 要释放的端口号
 * @returns {Promise<boolean>} 是否成功释放
 */
function killPortProcess(port) {
  return new Promise((resolve) => {
    const { exec } = require('child_process')

    const cmd = process.platform === 'win32'
      ? `for /f "tokens=5" %a in ('netstat -aon ^| findstr :${port} ^| findstr LISTENING') do taskkill /PID %a /F`
      : `lsof -ti:${port} | xargs kill -9 2>/dev/null`

    exec(cmd, (err) => {
      if (err) {
        console.log(`[PortFinder] 未能释放端口 ${port} 上的进程（可能无进程占用）`)
        resolve(false)
      } else {
        console.log(`[PortFinder] 已释放端口 ${port} 上的进程`)
        resolve(true)
      }
    })
  })
}

module.exports = {
  DEFAULT_PORTS,
  isPortAvailable,
  findAvailablePort,
  listenWithRetry,
  allocatePorts,
  killPortProcess
}
