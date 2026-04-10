const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require('electron')
const path = require('path')
const { fork, spawn } = require('child_process')
const { getHardwareFingerprint } = require('./util/getWinConfig')
const { getKeyfromWinuuid } = require('./util/getServer')
const { allocatePorts, DEFAULT_PORTS, listenWithRetry } = require('./util/portFinder')
const http = require('http')
const fs = require('fs')

const isPackaged = app.isPackaged
const isDev = !isPackaged

// ─── 开发模式前端策略 ────────────────────────────────────
// 开发模式默认启动 Vite dev server（热更新），设置 USE_STATIC=1 可切换为 build 静态文件
const useReactDevServer = isDev && process.env.USE_STATIC !== '1'

// ─── 首选Port配置 ────────────────────────────────────────
const PREFERRED_PORTS = { ...DEFAULT_PORTS }
let PORTS = { ...PREFERRED_PORTS }

// ─── 子进程引用 ──────────────────────────────────────────
let apiChild = null
let reactChild = null
let staticServer = null
let mainWindow = null

// ═══════════════════════════════════════════════════════════
//  启动后端 API 子进程
// ═══════════════════════════════════════════════════════════

function startApiChild() {
  return new Promise((resolve, reject) => {
    apiChild = fork(path.join(__dirname, './server/serialServer.js'), {
      env: {
        ...process.env,
        isPackaged: String(isPackaged),
        appPath: app.getAppPath(),
        RESOURCES_PATH: process.resourcesPath,
        DEFAULT_DOWNLOAD_PATH: app.getPath('downloads'),
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
        console.log(`[Main] API service started, API port: ${msg.apiPort}, WSPort: ${msg.wsPort}`)
        if (msg.apiPort) PORTS.api = msg.apiPort
        if (msg.wsPort) PORTS.ws = msg.wsPort
        resolve({ apiPort: msg.apiPort, wsPort: msg.wsPort })
      } else if (msg?.type === 'error') {
        clearTimeout(readyTimer)
        reject(new Error(`API 子进程错误: ${msg.code || ''} ${msg.message || ''}`))
      }
    })

    apiChild.on('exit', (code, signal) => {
      console.log(`[Main] API child process exited: code=${code} signal=${signal}`)
      apiChild = null
    })

    apiChild.on('error', (err) => {
      clearTimeout(readyTimer)
      console.error('[Main] API child process spawn error:', err)
      reject(err)
    })
  })
}

// ═══════════════════════════════════════════════════════════
//  启动 Vite dev server（开发模式热更新）
// ═══════════════════════════════════════════════════════════

function killPortProcess(port) {
  return new Promise((resolve) => {
    const { exec } = require('child_process')
    if (process.platform === 'win32') {
      // Windows: find PID using port and kill it
      exec(`netstat -ano | findstr :${port} | findstr LISTENING`, (err, stdout) => {
        if (err || !stdout.trim()) { resolve(); return }
        const lines = stdout.trim().split('\n')
        const pids = new Set()
        lines.forEach(line => {
          const parts = line.trim().split(/\s+/)
          const pid = parts[parts.length - 1]
          if (pid && pid !== '0') pids.add(pid)
        })
        if (pids.size === 0) { resolve(); return }
        const killCmd = [...pids].map(pid => `taskkill /F /PID ${pid}`).join(' & ')
        console.log(`[Main] Killing processes on port ${port}: PIDs ${[...pids].join(', ')}`)
        exec(killCmd, () => {
          setTimeout(resolve, 500) // wait for port release
        })
      })
    } else {
      exec(`lsof -ti:${port}`, (err, stdout) => {
        if (err || !stdout.trim()) { resolve(); return }
        const pids = stdout.trim().split('\n').join(' ')
        console.log(`[Main] Killing processes on port ${port}: PIDs ${pids}`)
        exec(`kill -9 ${pids}`, () => {
          setTimeout(resolve, 500)
        })
      })
    }
  })
}

function startReactDevServer() {
  return new Promise(async (resolve, reject) => {
    const clientDir = path.join(__dirname, 'client')
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'

    // Kill any process already using the frontend port
    await killPortProcess(PORTS.frontend)

    reactChild = spawn(npmCmd, ['run', 'dev', '--', '--port', String(PORTS.frontend), '--host', '127.0.0.1', '--strictPort'], {
      cwd: clientDir,
      env: {
        ...process.env,
        BROWSER: 'none',
        VITE_API_PORT: String(PORTS.api),
        VITE_WS_PORT: String(PORTS.ws)
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true
    })

    let started = false
    const startTimer = setTimeout(() => {
      if (!started) {
        started = true
        console.log('[Main] Vite dev server start timeout, trying to connect...')
        resolve(PORTS.frontend)
      }
    }, 15000)

    const checkOutput = (output) => {
      if (!started && (output.includes('VITE') || output.includes('ready in') || output.includes('Local:'))) {
        started = true
        clearTimeout(startTimer)
        console.log(`[Main] Vite dev server started, port: ${PORTS.frontend}`)
        resolve(PORTS.frontend)
      }
    }

    reactChild.stdout.on('data', (data) => {
      const output = data.toString()
      process.stdout.write(`[Vite] ${output}`)
      checkOutput(output)
    })

    reactChild.stderr.on('data', (data) => {
      const output = data.toString()
      process.stderr.write(`[Vite] ${output}`)
      checkOutput(output)
    })

    reactChild.on('error', (err) => {
      clearTimeout(startTimer)
      console.error('[Main] Vite dev server start failed:', err)
      if (!started) { started = true; reject(err) }
    })

    reactChild.on('exit', (code) => {
      clearTimeout(startTimer)
      console.log(`[Main] Vite dev server exited: code=${code}`)
      reactChild = null
      if (!started) {
        started = true
        reject(new Error(`Vite dev server exited unexpectedly: code=${code}`))
      }
    })
  })
}

// ═══════════════════════════════════════════════════════════
//  启动静态文件服务器（默认模式，秒启动）
// ═══════════════════════════════════════════════════════════

function startStaticServer() {
  return new Promise(async (resolve, reject) => {
    const MIME_TYPES = {
      '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
      '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
      '.ttf': 'font/ttf', '.map': 'application/json'
    }
    const noCacheHeaders = {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0'
    }

    // 开发模式和生产模式的 build 目录不同
    const buildDir = isPackaged
      ? path.join(__dirname, 'build')
      : path.join(__dirname, 'client', 'build')

    // 检查 build 目录是否存在
    if (!fs.existsSync(path.join(buildDir, 'index.html'))) {
      reject(new Error(`构建产物不存在: ${buildDir}/index.html\n请先运行 cd client && npm run build`))
      return
    }

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
              res.writeHead(404, { 'Content-Type': 'text/plain', ...noCacheHeaders })
              res.end('Not Found')
            } else {
              const html = indexData.toString().replace('<head>', `<head>${portInjectionScript}`)
              res.writeHead(200, { 'Content-Type': 'text/html', ...noCacheHeaders })
              res.end(html)
            }
          })
        } else {
          const ext = path.extname(fullPath).toLowerCase()
          const contentType = MIME_TYPES[ext] || 'application/octet-stream'
          if (ext === '.html') {
            const html = data.toString().replace('<head>', `<head>${portInjectionScript}`)
            res.writeHead(200, { 'Content-Type': contentType, ...noCacheHeaders })
            res.end(html)
          } else {
            res.writeHead(200, { 'Content-Type': contentType, ...noCacheHeaders })
            res.end(data)
          }
        }
      })
    })

    try {
      const port = useReactDevServer ? PORTS.frontendProd : PORTS.frontendProd
      const actualPort = await listenWithRetry(staticServer, port, '127.0.0.1')
      PORTS.frontendProd = actualPort
      console.log(`[Main] Static file server started, port: ${actualPort}`)
      resolve(actualPort)
    } catch (err) {
      console.error('[Main] Static file server start failed:', err)
      reject(err)
    }
  })
}

// ═══════════════════════════════════════════════════════════
//  创建主窗口
// ═══════════════════════════════════════════════════════════

async function createWindow(port) {
  mainWindow = new BrowserWindow({
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false
    },
    icon: path.join(__dirname, 'logo.ico'),
    show: false,           // 先不显示，等加载完成后再显示避免白屏
    backgroundColor: '#1a1a2e'  // 设置背景色，减少白屏感
  })

  mainWindow.maximize()

  if (isPackaged) {
    try {
      await mainWindow.webContents.session.clearCache()
    } catch (err) {
      console.warn('[Main] Failed to clear browser cache:', err.message)
    }
  }

  const cacheBuster = isPackaged ? `?t=${Date.now()}` : ''
  const url = `http://127.0.0.1:${port}/${cacheBuster}`
  console.log(`[Main] Loading page: ${url}`)
  mainWindow.loadURL(url)

  // 页面加载完成后再显示窗口
  mainWindow.webContents.once('did-finish-load', () => {
    mainWindow.show()
  })

  // 备用：如果 3 秒内没有触发 did-finish-load，也显示窗口
  setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) {
      mainWindow.show()
    }
  }, 3000)

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  }

  return mainWindow
}

// ═══════════════════════════════════════════════════════════
//  优雅关闭
// ═══════════════════════════════════════════════════════════

function cleanupProcesses() {
  if (apiChild) {
    console.log('[Main] Closing API child process...')
    apiChild.kill()
    apiChild = null
  }
  if (reactChild) {
    console.log('[Main] Closing Vite dev server...')
    reactChild.kill()
    reactChild = null
  }
  if (staticServer) {
    console.log('[Main] Closing static file server...')
    staticServer.close()
    staticServer = null
  }
}

// ═══════════════════════════════════════════════════════════
//  应用生命周期 — 优化启动速度
// ═══════════════════════════════════════════════════════════

app.whenReady().then(async () => {
  const startTime = Date.now()

  // ─── IPC 处理 ─────────────────────────────────────────────
  ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory'],
      title: '选择下载路径'
    })
    if (result.canceled) return null
    return result.filePaths[0]
  })

  ipcMain.handle('open-path', async (event, filePath) => {
    return shell.openPath(filePath)
  })

  ipcMain.handle('show-item-in-folder', async (event, filePath) => {
    shell.showItemInFolder(filePath)
    return true
  })

  try {
    // 1. 并行执行：硬件指纹 + Port分配（互不依赖）
    console.log('[Main] Initializing...')
    const portsToAllocate = useReactDevServer
      ? { api: PREFERRED_PORTS.api, ws: PREFERRED_PORTS.ws, frontend: PREFERRED_PORTS.frontend }
      : { api: PREFERRED_PORTS.api, ws: PREFERRED_PORTS.ws, frontendProd: PREFERRED_PORTS.frontendProd }

    const [uuid, allocatedPorts] = await Promise.all([
      getHardwareFingerprint(),
      allocatePorts(portsToAllocate)
    ])

    PORTS = { ...PREFERRED_PORTS, ...allocatedPorts }

    // 授权校验（当前是空实现，不阻塞）
    const dateKey = await getKeyfromWinuuid(uuid)
    console.log(`[Main] Hardware UUID: ${uuid}, Auth: ${dateKey}`)
    console.log(`[Main] Port allocation done: ${JSON.stringify(PORTS)} (${Date.now() - startTime}ms)`)

    // 2. 并行启动：后端 API + 前端服务
    console.log('[Main] Starting services...')
    let frontendPort

    if (useReactDevServer) {
      // 热更新模式：并行启动后端和前端
      const [_, devPort] = await Promise.all([
        startApiChild(),
        startReactDevServer()
      ])
      frontendPort = devPort
    } else {
      // 默认模式：并行启动后端和静态文件服务（秒启动）
      const [_, staticPort] = await Promise.all([
        startApiChild(),
        startStaticServer()
      ])
      frontendPort = staticPort
    }

    console.log(`[Main] All services ready (${Date.now() - startTime}ms)`)

    // 3. 创建窗口
    await createWindow(frontendPort)

    // 4. 隐藏菜单栏
    Menu.setApplicationMenu(null)

    console.log(`[Main] Startup complete, total time: ${Date.now() - startTime}ms`)

  } catch (err) {
    console.error('[Main] Startup failed:', err)
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
    const port = useReactDevServer ? PORTS.frontend : PORTS.frontendProd
    await createWindow(port)
  }
})

app.on('before-quit', () => {
  cleanupProcesses()
})

process.on('uncaughtException', (err) => {
  console.error('[Main] Uncaught exception:', err)
  cleanupProcesses()
})
