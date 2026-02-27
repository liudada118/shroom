const { app, BrowserWindow, Menu } = require('electron')
const path = require('path')
const { fork, spawn } = require('child_process')
const { getHardwareFingerprint } = require('./util/getWinConfig')
const { getKeyfromWinuuid } = require('./util/getServer')
const { allocatePorts } = require('./util/portFinder')
const http = require('http')
const fs = require('fs')

const isPackaged = app.isPackaged
const isDev = !isPackaged

// ─── 首选端口配置 ────────────────────────────────────────
const PREFERRED_PORTS = {
  api: 19245,          // 后端 API 端口
  ws: 19999,           // WebSocket 端口
  frontend: 3000,      // React dev server 端口（开发模式）
  frontendProd: 2999   // 静态文件服务端口（生产模式）
}

// ─── 实际分配的端口（启动时动态确定）────────────────────────
let PORTS = { ...PREFERRED_PORTS }

// ─── 子进程引用 ──────────────────────────────────────────
let apiChild = null
let reactChild = null
let staticServer = null

/**
 * 启动后端 API 子进程 (serialServer.js)
 * 通过环境变量将动态端口传递给子进程
 */
function startApiChild() {
  return new Promise((resolve, reject) => {
    apiChild = fork(path.join(__dirname, './server/serialServer.js'), {
      env: {
        ...process.env,
        isPackaged: String(isPackaged),
        appPath: app.getAppPath(),
        API_PORT: String(PORTS.api),
        WS_PORT: String(PORTS.ws)
      }
    })

    const readyTimer = setTimeout(() => {
      reject(new Error('API 子进程启动超时 (15s)'))
    }, 15000)

    apiChild.on('message', (msg) => {
      if (msg.type === 'ready') {
        clearTimeout(readyTimer)
        console.log(`[Main] API 服务已启动，API端口: ${msg.apiPort}, WS端口: ${msg.wsPort}`)
        // 更新实际端口（子进程可能因为冲突使用了不同端口）
        if (msg.apiPort) PORTS.api = msg.apiPort
        if (msg.wsPort) PORTS.ws = msg.wsPort
        resolve({ apiPort: msg.apiPort, wsPort: msg.wsPort })
      } else if (msg?.type === 'error') {
        clearTimeout(readyTimer)
        reject(new Error(`API 子进程错误: ${msg.code || ''} ${msg.message || ''}`))
      }
    })

    apiChild.on('exit', (code, signal) => {
      console.log(`[Main] API 子进程退出: code=${code} signal=${signal}`)
      apiChild = null
    })

    apiChild.on('error', (err) => {
      clearTimeout(readyTimer)
      console.error('[Main] API 子进程 spawn 错误:', err)
      reject(err)
    })
  })
}

/**
 * 开发模式：启动 React dev server (CRA)
 * 通过环境变量传入端口和后端地址
 */
function startReactDevServer() {
  return new Promise((resolve, reject) => {
    const clientDir = path.join(__dirname, 'client')
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'

    reactChild = spawn(npmCmd, ['start'], {
      cwd: clientDir,
      env: {
        ...process.env,
        PORT: String(PORTS.frontend),
        BROWSER: 'none',
        // 通过 CRA 环境变量将动态端口传给前端
        REACT_APP_API_PORT: String(PORTS.api),
        REACT_APP_WS_PORT: String(PORTS.ws)
      },
      stdio: ['pipe', 'pipe', 'pipe']
    })

    let started = false
    const startTimer = setTimeout(() => {
      if (!started) {
        started = true
        console.log('[Main] React dev server 启动超时，尝试连接...')
        resolve(PORTS.frontend)
      }
    }, 30000)

    const checkOutput = (output) => {
      if (!started && (output.includes('Compiled') || output.includes('compiled') || output.includes('webpack compiled'))) {
        started = true
        clearTimeout(startTimer)
        console.log(`[Main] React dev server 已启动，端口: ${PORTS.frontend}`)
        resolve(PORTS.frontend)
      }
    }

    reactChild.stdout.on('data', (data) => {
      const output = data.toString()
      process.stdout.write(`[React] ${output}`)
      checkOutput(output)
    })

    reactChild.stderr.on('data', (data) => {
      const output = data.toString()
      process.stderr.write(`[React] ${output}`)
      checkOutput(output)
    })

    reactChild.on('error', (err) => {
      clearTimeout(startTimer)
      console.error('[Main] React dev server 启动失败:', err)
      if (!started) {
        started = true
        reject(err)
      }
    })

    reactChild.on('exit', (code) => {
      clearTimeout(startTimer)
      console.log(`[Main] React dev server 退出: code=${code}`)
      reactChild = null
    })
  })
}

/**
 * 生产模式：启动静态文件服务器
 * 注入端口配置到 HTML 页面中
 */
function startStaticServer() {
  return new Promise((resolve, reject) => {
    const MIME_TYPES = {
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'text/javascript',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
      '.ttf': 'font/ttf',
      '.map': 'application/json'
    }

    const buildDir = isPackaged
      ? path.join(__dirname, '..', 'build')
      : path.join(__dirname, 'build')

    // 生成注入到 HTML <head> 中的端口配置脚本
    const portInjectionScript = `<script>window.__PORTS__=${JSON.stringify({
      api: PORTS.api,
      ws: PORTS.ws
    })};</script>`

    staticServer = http.createServer((req, res) => {
      let filePath = req.url === '/' ? '/index.html' : req.url
      filePath = filePath.split('?')[0]
      const fullPath = path.join(buildDir, filePath)

      fs.readFile(fullPath, (err, data) => {
        if (err) {
          // SPA fallback
          fs.readFile(path.join(buildDir, 'index.html'), (err2, indexData) => {
            if (err2) {
              res.writeHead(404, { 'Content-Type': 'text/plain' })
              res.end('Not Found')
            } else {
              // 注入端口配置
              const html = indexData.toString().replace('<head>', `<head>${portInjectionScript}`)
              res.writeHead(200, { 'Content-Type': 'text/html' })
              res.end(html)
            }
          })
        } else {
          const ext = path.extname(fullPath).toLowerCase()
          const contentType = MIME_TYPES[ext] || 'application/octet-stream'

          // 对 HTML 文件注入端口配置
          if (ext === '.html') {
            const html = data.toString().replace('<head>', `<head>${portInjectionScript}`)
            res.writeHead(200, { 'Content-Type': contentType })
            res.end(html)
          } else {
            res.writeHead(200, { 'Content-Type': contentType })
            res.end(data)
          }
        }
      })
    })

    staticServer.listen(PORTS.frontendProd, '127.0.0.1', () => {
      console.log(`[Main] 静态文件服务已启动，端口: ${PORTS.frontendProd}`)
      resolve(PORTS.frontendProd)
    })

    staticServer.on('error', (err) => {
      console.error('[Main] 静态文件服务启动失败:', err)
      reject(err)
    })
  })
}

/**
 * 创建主窗口
 */
function createWindow(port) {
  const win = new BrowserWindow({
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false
    },
    icon: path.join(__dirname, 'logo.ico')
  })

  win.maximize()

  const url = `http://127.0.0.1:${port}`
  console.log(`[Main] 加载页面: ${url}`)
  win.loadURL(url)

  if (isDev) {
    win.webContents.openDevTools({ mode: 'detach' })
  }

  return win
}

/**
 * 优雅关闭所有子进程
 */
function cleanupProcesses() {
  if (apiChild) {
    console.log('[Main] 关闭 API 子进程...')
    apiChild.kill()
    apiChild = null
  }
  if (reactChild) {
    console.log('[Main] 关闭 React dev server...')
    reactChild.kill()
    reactChild = null
  }
  if (staticServer) {
    console.log('[Main] 关闭静态文件服务...')
    staticServer.close()
    staticServer = null
  }
}

// ═══════════════════════════════════════════════════════════
//  应用生命周期
// ═══════════════════════════════════════════════════════════

app.whenReady().then(async () => {
  try {
    // 1. 获取硬件指纹（授权校验）
    const uuid = await getHardwareFingerprint()
    const dateKey = await getKeyfromWinuuid(uuid)
    console.log(`[Main] 硬件UUID: ${uuid}, 授权: ${dateKey}`)

    // 2. 端口分配：检测冲突并自动分配可用端口
    console.log('[Main] 正在检测端口可用性...')
    const portsToAllocate = isDev
      ? { api: PREFERRED_PORTS.api, ws: PREFERRED_PORTS.ws, frontend: PREFERRED_PORTS.frontend }
      : { api: PREFERRED_PORTS.api, ws: PREFERRED_PORTS.ws, frontendProd: PREFERRED_PORTS.frontendProd }

    PORTS = { ...PREFERRED_PORTS, ...(await allocatePorts(portsToAllocate)) }
    console.log('[Main] 端口分配完成:', JSON.stringify(PORTS))

    // 3. 启动后端 API 服务（传入分配好的端口）
    console.log('[Main] 正在启动后端 API 服务...')
    await startApiChild()

    // 4. 启动前端
    let frontendPort
    if (isDev) {
      console.log('[Main] 开发模式：正在启动 React dev server...')
      frontendPort = await startReactDevServer()
    } else {
      console.log('[Main] 生产模式：正在启动静态文件服务...')
      frontendPort = await startStaticServer()
    }

    // 5. 创建窗口
    createWindow(frontendPort)

    // 6. 隐藏菜单栏
    Menu.setApplicationMenu(null)

  } catch (err) {
    console.error('[Main] 启动失败:', err)
    cleanupProcesses()
    app.quit()
  }
})

app.on('window-all-closed', () => {
  cleanupProcesses()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    const port = isDev ? PORTS.frontend : PORTS.frontendProd
    createWindow(port)
  }
})

app.on('before-quit', () => {
  cleanupProcesses()
})

process.on('uncaughtException', (err) => {
  console.error('[Main] 未捕获异常:', err)
  cleanupProcesses()
})
