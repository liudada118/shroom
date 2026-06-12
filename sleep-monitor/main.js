/**
 * 睡眠监护仪 - Electron 主进程
 */
const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');
const { fork } = require('child_process');
const http = require('http');
const fs = require('fs');

const isPackaged = app.isPackaged;
const isDev = !isPackaged;

// ─── Port 配置 ────────────────────────────────────────
const PORTS = {
  api: 3001,
  ws: 3002,
  frontend: 5173,
};

let apiChild = null;
let mainWindow = null;

// ═══════════════════════════════════════════════════════════
//  启动后端 API 子进程
// ═══════════════════════════════════════════════════════════

function startApiChild() {
  return new Promise((resolve, reject) => {
    const serverPath = isDev
      ? path.join(__dirname, 'server', 'serialServer.js')
      : path.join(__dirname, 'server', 'serialServer.js');

    apiChild = fork(serverPath, {
      env: {
        ...process.env,
        isPackaged: String(isPackaged),
        appPath: app.getAppPath(),
        API_PORT: String(PORTS.api),
        WS_PORT: String(PORTS.ws),
      }
    });

    const readyTimer = setTimeout(() => {
      resolve({ apiPort: PORTS.api, wsPort: PORTS.ws });
    }, 10000);

    apiChild.on('message', (msg) => {
      if (msg.type === 'ready') {
        clearTimeout(readyTimer);
        console.log(`[Main] API service started, API: ${msg.apiPort}, WS: ${msg.wsPort}`);
        PORTS.api = msg.apiPort || PORTS.api;
        PORTS.ws = msg.wsPort || PORTS.ws;
        resolve({ apiPort: PORTS.api, wsPort: PORTS.ws });
      }
    });

    apiChild.on('exit', (code) => {
      console.log(`[Main] API child exited: code=${code}`);
      apiChild = null;
    });

    apiChild.on('error', (err) => {
      clearTimeout(readyTimer);
      console.error('[Main] API child error:', err);
      reject(err);
    });
  });
}

// ═══════════════════════════════════════════════════════════
//  静态文件服务器
// ═══════════════════════════════════════════════════════════

function startStaticServer() {
  return new Promise((resolve, reject) => {
    const MIME_TYPES = {
      '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
      '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
      '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
    };

    const buildDir = isPackaged
      ? path.join(__dirname, '..', 'build')
      : path.join(__dirname, 'client', 'dist');

    if (!fs.existsSync(path.join(buildDir, 'index.html'))) {
      // 开发模式下使用 Vite dev server
      if (isDev) {
        resolve(PORTS.frontend);
        return;
      }
      reject(new Error(`Build not found: ${buildDir}/index.html`));
      return;
    }

    const portScript = `<script>window.__PORTS__=${JSON.stringify(PORTS)};</script>`;

    const staticServer = http.createServer((req, res) => {
      let filePath = req.url === '/' ? '/index.html' : req.url.split('?')[0];
      const fullPath = path.join(buildDir, filePath);

      fs.readFile(fullPath, (err, data) => {
        if (err) {
          fs.readFile(path.join(buildDir, 'index.html'), (err2, indexData) => {
            if (err2) { res.writeHead(404); res.end('Not Found'); return; }
            const html = indexData.toString().replace('<head>', `<head>${portScript}`);
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(html);
          });
        } else {
          const ext = path.extname(fullPath).toLowerCase();
          const contentType = MIME_TYPES[ext] || 'application/octet-stream';
          if (ext === '.html') {
            const html = data.toString().replace('<head>', `<head>${portScript}`);
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(html);
          } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(data);
          }
        }
      });
    });

    staticServer.listen(PORTS.frontend, '127.0.0.1', () => {
      console.log(`[Main] Static server on port ${PORTS.frontend}`);
      resolve(PORTS.frontend);
    });
  });
}

// ═══════════════════════════════════════════════════════════
//  创建主窗口
// ═══════════════════════════════════════════════════════════

function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
    },
    icon: path.join(__dirname, 'assets', 'icon.png'),
    show: false,
    backgroundColor: '#0f172a',
    title: '睡眠监护仪',
  });

  mainWindow.maximize();

  const url = isDev
    ? `http://127.0.0.1:${port}`
    : `http://127.0.0.1:${port}`;

  console.log(`[Main] Loading: ${url}`);
  mainWindow.loadURL(url);

  mainWindow.webContents.once('did-finish-load', () => {
    mainWindow.show();
  });

  setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) mainWindow.show();
  }, 5000);

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

// ═══════════════════════════════════════════════════════════
//  应用生命周期
// ═══════════════════════════════════════════════════════════

app.whenReady().then(async () => {
  try {
    console.log('[Main] Starting sleep monitor...');

    await startApiChild();
    const frontendPort = await startStaticServer();

    createWindow(frontendPort);
    Menu.setApplicationMenu(null);

    console.log('[Main] Startup complete');
  } catch (err) {
    console.error('[Main] Startup failed:', err);
    if (apiChild) apiChild.kill();
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (apiChild) apiChild.kill();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (apiChild) apiChild.kill();
});

process.on('uncaughtException', (err) => {
  console.error('[Main] Uncaught:', err);
  if (apiChild) apiChild.kill();
});
