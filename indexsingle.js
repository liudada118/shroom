const { app, BrowserWindow } = require('electron')
const path = require('path')
const { fork, spawn } = require('child_process')
const { getHardwareFingerprint } = require('./util/getWinConfig')
const { getKeyfromWinuuid } = require('./util/getServer')
const { initDb, getCsvData } = require('./util/db')
const { allocatePorts, DEFAULT_PORTS } = require('./util/portFinder')

// ─── 端口配置 ────────────────────────────────────────────
let PORTS = { ...DEFAULT_PORTS }

const createWindow = () => {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false
    }

  })

  win.loadURL('http://sensor.bodyta.com/4096')
}


const isPackaged = app.isPackaged

function startApiChild() {
  return new Promise((resolve, reject) => {
    const child = fork(path.join(__dirname, './server/serialServer.js'), {
      env: {
        ...process.env,
        isPackaged: String(isPackaged),
        appPath: app.getAppPath(),
        RESOURCES_PATH: process.resourcesPath,
        SERIAL_CACHE_PATH: isPackaged
          ? path.join(app.getPath('userData'), 'serial_cache.json')
          : path.join(__dirname, 'serial_cache.json'),
        DEFAULT_DOWNLOAD_PATH: app.getPath('downloads'),
        API_PORT: String(PORTS.api),
        WS_PORT: String(PORTS.ws)
      }
    })

    const readyTimer = setTimeout(() => {
      console.log('[Main] API 子进程启动超时，继续运行...')
      resolve()
    }, 15000)

    child.on('message', (msg) => {
      if (msg.type === 'ready') {
        clearTimeout(readyTimer)
        console.log(`[Main] API 服务已启动，API端口: ${msg.apiPort}, WS端口: ${msg.wsPort}`)
        if (msg.apiPort) PORTS.api = msg.apiPort
        if (msg.wsPort) PORTS.ws = msg.wsPort
        resolve()
      } else if (msg?.type === 'error') {
        clearTimeout(readyTimer)
        console.error('[Main] API 子进程错误:', msg.message)
        resolve()
      }
    })

    child.on('error', (err) => {
      clearTimeout(readyTimer)
      console.error('[Main] API 子进程 spawn 错误:', err)
      resolve()
    })
  })
}


function pyBin() {
  const isDev = !app.isPackaged
  if (process.platform === 'win32') {
    return isDev
      ? path.join(__dirname, 'python', 'venv', 'Scripts', 'python.exe')
      : path.join(process.resourcesPath, 'python', 'venv', 'Scripts', 'python.exe')
  } else {
    return isDev
      ? path.join(__dirname, 'python', 'venv', 'bin', 'python')
      : path.join(process.resourcesPath, 'python', 'venv', 'bin', 'python')
  }
}
function apiPy() {
  const isDev = !app.isPackaged
  return isDev
    ? path.join(__dirname, 'python', 'app', 'api.py')
    : path.join(process.resourcesPath, 'python', 'app', 'api.py')
}

/** 主进程里直接像调用函数一样用 */
function callPy(fn, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(pyBin(), [apiPy()], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONUNBUFFERED: '1' }
    })
    let out = '', err = ''
    child.stdout.on('data', d => (out += d.toString()))
    child.stderr.on('data', d => (err += d.toString()))
    child.on('error', e => reject(new Error('spawn error: ' + e.message)))
    child.on('close', code => {
      if (code !== 0) return reject(new Error(`Python exit ${code}\n${err}`))
      try {
        const last = (out.trim().split(/\r?\n/).pop() || '{}')
        // console.log(last, 'last')
        const res = JSON.parse(last)
        if (res.ok) resolve(res.data)
        else reject(new Error(res.error + '\n' + (res.trace || '')))
      } catch (e) {
        reject(new Error('Parse fail: ' + e.message + '\nraw: ' + out))
      }
    })
    child.stdin.write(JSON.stringify({ fn, args }) + '\n')
    child.stdin.end()
  })
}


// 调用你的函数（示例）
async function demo(matrix) {
  // 构造一条 1024 长度的测试数据

  // console.log(matrix)
  // const data = new Array(10).fill(new Array(1024).fill(50)); // 可以放多条
  const res = await callPy('cal_cop_fromData', { data : matrix });
  console.log('结果:', res ,new Date().getTime()); // { left: [...], right: [...] }
}

app.whenReady().then(async () => {
  const uuid = await getHardwareFingerprint()
  const dateKey = await getKeyfromWinuuid(uuid)
  console.log(uuid, dateKey)

  // 先分配端口，再启动子进程
  console.log('[Main] 正在检测端口可用性...')
  const allocated = await allocatePorts({
    api: DEFAULT_PORTS.api,
    ws: DEFAULT_PORTS.ws
  })
  PORTS = { ...PORTS, ...allocated }
  console.log('[Main] 端口分配完成:', JSON.stringify(PORTS))

  // 启动后端子进程（传入分配好的端口）
  await startApiChild()

  createWindow()
  const data1 = await getCsvData('D:/jqtoolsWin - 副本/python/app/静态数据集1.csv')
  
  const matrix = data1.map((a) => JSON.parse(a.data))
  // try {
  //   const r1 = await callPy('cal_cop_fromData', {data : new Array(10).fill(new Array(1024).fill(0))})
  //   // const r2 = await callPy('add_and_scale', { a: 1, b: 2, scale: 10 })
  //   console.log('[PY] add =>', r1)
  //   console.log('[PY] add_and_scale =>', r2)
  // } catch (e) {
  //   console.error('[PY ERROR]', e)
  // }
  try {
    const a = await demo(matrix)
    await demo(matrix)
    await demo(matrix)
    await demo(matrix)
    await demo(matrix)
    await demo(matrix)
    await demo(matrix)
    await demo(matrix)
  } catch (e) {
    console.log(e)
  }
})


