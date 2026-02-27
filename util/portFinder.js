const net = require('net')

/**
 * 检测指定端口是否可用
 * @param {number} port 要检测的端口号
 * @param {string} host 主机地址，默认 127.0.0.1
 * @returns {Promise<boolean>} 端口是否可用
 */
function isPortAvailable(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const server = net.createServer()

    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false)
      } else {
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
 * @param {number} maxAttempts 最大尝试次数，默认 50
 * @param {string} host 主机地址，默认 127.0.0.1
 * @returns {Promise<number>} 可用的端口号
 * @throws {Error} 如果在最大尝试次数内未找到可用端口
 */
async function findAvailablePort(startPort, maxAttempts = 50, host = '127.0.0.1') {
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

    // 如果首选端口已被其他服务占用或已分配给前面的服务
    while (usedPorts.has(port) || !(await isPortAvailable(port))) {
      port++
      if (port > 65535) {
        throw new Error(`[PortFinder] 无法为 ${name} 分配可用端口`)
      }
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

module.exports = {
  isPortAvailable,
  findAvailablePort,
  allocatePorts
}
