const net = require('net')

// ─── Default Port Config ────────────────────────────────────────
const DEFAULT_PORTS = {
  api: 19245,          // Backend API port
  ws: 19999,           // WebSocket port
  frontend: 3000,      // React dev server port (dev mode)
  frontendProd: 2999   // Static file server port (prod mode)
}

/**
 * Check if a port is available by attempting to bind it
 * @param {number} port Port number to check
 * @param {string} host Host address, default 127.0.0.1
 * @returns {Promise<boolean>} Whether the port is available
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
        console.log(`[PortFinder] Port ${port} detection error: ${err.code || err.message}`)
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
 * Find the first available port starting from the given port
 * @param {number} startPort Starting port number
 * @param {number} maxAttempts Max attempts, default 100
 * @param {string} host Host address, default 127.0.0.1
 * @returns {Promise<number>} Available port number
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
      console.log(`[PortFinder] Port ${startPort} in use, finding available port...`)
    }
  }

  throw new Error(`[PortFinder] No available port found in range ${startPort}-${startPort + maxAttempts - 1}`)
}

/**
 * Try to listen on the preferred port, auto-retry on next port if occupied
 * Solves TOCTOU race between isPortAvailable check and actual listen
 * @param {Object} server A net.Server or compatible object (Express app, http.Server)
 * @param {number} preferredPort Preferred port
 * @param {string} host Host address, default 127.0.0.1
 * @param {number} maxAttempts Max attempts, default 100
 * @returns {Promise<number>} Actual bound port number
 */
function listenWithRetry(server, preferredPort, host = '127.0.0.1', maxAttempts = 100) {
  return new Promise((resolve, reject) => {
    let currentPort = preferredPort
    let attempts = 0

    function tryListen() {
      if (attempts >= maxAttempts || currentPort > 65535) {
        reject(new Error(`[PortFinder] Failed to bind port in range ${preferredPort}-${currentPort - 1}`))
        return
      }

      server.removeAllListeners('error')

      server.once('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          if (attempts === 0) {
            console.log(`[PortFinder] Port ${preferredPort} in use, finding available port...`)
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
          console.log(`[PortFinder] ${preferredPort} in use -> using ${currentPort}`)
        }
        resolve(currentPort)
      })
    }

    tryListen()
  })
}

/**
 * Allocate multiple non-conflicting available ports
 * Ensures allocated ports don't conflict with each other
 * @param {Object} portConfig Port config { name: preferredPort, ... }
 * @returns {Promise<Object>} Actual allocated ports { name: actualPort, ... }
 */
async function allocatePorts(portConfig) {
  const allocated = {}
  const usedPorts = new Set()

  for (const [name, preferredPort] of Object.entries(portConfig)) {
    let port = preferredPort
    let attempts = 0
    const maxAttempts = 100

    while (attempts < maxAttempts) {
      if (port > 65535) {
        throw new Error(`[PortFinder] Cannot allocate port for ${name} (port out of range)`)
      }

      if (!usedPorts.has(port) && await isPortAvailable(port)) {
        break
      }

      port++
      attempts++
    }

    if (attempts >= maxAttempts) {
      throw new Error(`[PortFinder] Cannot allocate port for ${name} (tried ${maxAttempts} times)`)
    }

    if (port !== preferredPort) {
      console.log(`[PortFinder] ${name}: ${preferredPort} in use -> using ${port}`)
    } else {
      console.log(`[PortFinder] ${name}: ${port} ok`)
    }

    allocated[name] = port
    usedPorts.add(port)
  }

  return allocated
}

/**
 * Force kill process on specified port (dev only)
 * @param {number} port Port number to release
 * @returns {Promise<boolean>} Whether successfully released
 */
function killPortProcess(port) {
  return new Promise((resolve) => {
    const { exec } = require('child_process')

    const cmd = process.platform === 'win32'
      ? `for /f "tokens=5" %a in ('netstat -aon ^| findstr :${port} ^| findstr LISTENING') do taskkill /PID %a /F`
      : `lsof -ti:${port} | xargs kill -9 2>/dev/null`

    exec(cmd, (err) => {
      if (err) {
        console.log(`[PortFinder] Failed to release port ${port} (may not be occupied)`)
        resolve(false)
      } else {
        console.log(`[PortFinder] Released process on port ${port}`)
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
