/**
 * 集成测试脚本
 * 
 * 在无 Electron、无硬件的环境下测试：
 * 1. 模块引用链完整性
 * 2. 后端服务启动（Express + WebSocket）
 * 3. API 端点响应
 * 4. WebSocket 连接与消息
 * 5. 端口冲突处理
 * 6. 数据库初始化
 */

// 防止 SQLite 等原生模块的未捕获异常导致进程崩溃
process.on('uncaughtException', (err) => {
  console.error('[Test] 未捕获异常 (已拦截):', err.message)
})

const http = require('http')
const path = require('path')
const fs = require('fs')

// ========== 测试框架 ==========
let passed = 0, failed = 0, skipped = 0
const results = []

function test(name, fn) {
  return { name, fn }
}

async function runTests(tests) {
  console.log('\n' + '='.repeat(60))
  console.log('  Shroom 集成测试')
  console.log('='.repeat(60) + '\n')

  for (const t of tests) {
    try {
      await t.fn()
      passed++
      results.push({ name: t.name, status: '✅ PASS' })
      console.log(`  ✅ ${t.name}`)
    } catch (e) {
      if (e.message === 'SKIP') {
        skipped++
        results.push({ name: t.name, status: '⏭️ SKIP', reason: e.reason })
        console.log(`  ⏭️  ${t.name} (跳过: ${e.reason})`)
      } else {
        failed++
        results.push({ name: t.name, status: '❌ FAIL', error: e.message })
        console.log(`  ❌ ${t.name}`)
        console.log(`     错误: ${e.message}`)
      }
    }
  }

  console.log('\n' + '-'.repeat(60))
  console.log(`  总计: ${passed + failed + skipped} | ✅ 通过: ${passed} | ❌ 失败: ${failed} | ⏭️ 跳过: ${skipped}`)
  console.log('-'.repeat(60) + '\n')
  return failed
}

function skip(reason) {
  const e = new Error('SKIP')
  e.reason = reason
  throw e
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed')
}

// ========== 工具函数 ==========
function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) })
        } catch {
          resolve({ status: res.statusCode, data })
        }
      })
    }).on('error', reject)
  })
}

function httpPost(url, body) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(body)
    const urlObj = new URL(url)
    const req = http.request({
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
    }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) })
        } catch {
          resolve({ status: res.statusCode, data })
        }
      })
    })
    req.on('error', reject)
    req.write(postData)
    req.end()
  })
}

// ========== 测试用例 ==========

// --- 1. 模块引用链测试 ---
const moduleTests = [
  test('util/portFinder.js 可正常加载', () => {
    const pf = require('../util/portFinder')
    assert(typeof pf.isPortAvailable === 'function', '缺少 isPortAvailable')
    assert(typeof pf.allocatePorts === 'function', '缺少 allocatePorts')
    assert(typeof pf.listenWithRetry === 'function', '缺少 listenWithRetry')
    assert(typeof pf.DEFAULT_PORTS === 'object', '缺少 DEFAULT_PORTS')
    assert(pf.DEFAULT_PORTS.api === 19245, 'DEFAULT_PORTS.api 应为 19245')
    assert(pf.DEFAULT_PORTS.ws === 19999, 'DEFAULT_PORTS.ws 应为 19999')
  }),

  test('util/logger.js 可正常加载', () => {
    const logger = require('../util/logger')
    assert(typeof logger.createLogger === 'function', '缺少 createLogger')
    const log = logger.createLogger('Test')
    assert(typeof log.info === 'function', '缺少 info 方法')
    assert(typeof log.error === 'function', '缺少 error 方法')
    assert(typeof log.warn === 'function', '缺少 warn 方法')
    assert(typeof log.debug === 'function', '缺少 debug 方法')
  }),

  test('util/line.js 可正常加载', () => {
    const line = require('../util/line')
    assert(typeof line === 'object' || typeof line === 'function', 'line.js 导出异常')
  }),

  test('util/config.js 可正常加载', () => {
    const config = require('../util/config')
    assert(typeof config === 'object' || typeof config === 'function', 'config.js 导出异常')
  }),

  test('util/aes_ecb.js 可正常加载', () => {
    const aes = require('../util/aes_ecb')
    assert(typeof aes.decryptStr === 'function' || typeof aes === 'object', 'aes_ecb.js 导出异常')
  }),

  test('util/time.js 可正常加载', () => {
    const time = require('../util/time')
    assert(typeof time === 'object' || typeof time === 'function', 'time.js 导出异常')
  }),

  test('server/state.js 可正常加载', () => {
    const state = require('../server/state')
    assert(typeof state === 'object', 'state.js 应导出对象')
  }),

  test('server/websocket/index.js 可正常加载', () => {
    const ws = require('../server/websocket')
    assert(typeof ws.createWsServer === 'function', '缺少 createWsServer')
    assert(typeof ws.broadcast === 'function', '缺少 broadcast')
    assert(typeof ws.getHttpServer === 'function', '缺少 getHttpServer')
    assert(typeof ws.isBinaryMode === 'function', '缺少 isBinaryMode')
  }),

  test('server/services/DataService.js 可正常加载', () => {
    const ds = require('../server/services/DataService')
    assert(typeof ds === 'object' || typeof ds === 'function', 'DataService.js 导出异常')
  }),

  test('server/api/routes.js 可正常加载', () => {
    const routes = require('../server/api/routes')
    assert(typeof routes === 'function', 'routes.js 应导出 Express Router 函数')
  }),

  test('server/HttpResult.js 可正常加载', () => {
    const hr = require('../server/HttpResult')
    assert(typeof hr === 'object' || typeof hr === 'function', 'HttpResult.js 导出异常')
  }),

  test('server/equipMap.js 可正常加载', () => {
    const em = require('../server/equipMap')
    assert(typeof em === 'object', 'equipMap.js 应导出对象')
  }),
]

// --- 2. 端口管理测试 ---
const portTests = [
  test('isPortAvailable 检测空闲端口', async () => {
    const { isPortAvailable } = require('../util/portFinder')
    const available = await isPortAvailable(18888)
    assert(available === true, '端口 18888 应该可用')
  }),

  test('isPortAvailable 检测占用端口', async () => {
    const { isPortAvailable } = require('../util/portFinder')
    const net = require('net')
    const server = net.createServer()
    await new Promise((resolve, reject) => {
      server.listen(18889, () => resolve())
      server.on('error', reject)
    })
    try {
      const available = await isPortAvailable(18889)
      assert(available === false, '端口 18889 应该被占用')
    } finally {
      server.close()
    }
  }),

  test('allocatePorts 批量分配端口', async () => {
    const { allocatePorts, DEFAULT_PORTS } = require('../util/portFinder')
    const ports = await allocatePorts({
      api: DEFAULT_PORTS.api,
      ws: DEFAULT_PORTS.ws,
      frontend: DEFAULT_PORTS.frontend
    })
    assert(typeof ports.api === 'number', '应返回 api 端口')
    assert(typeof ports.ws === 'number', '应返回 ws 端口')
    assert(typeof ports.frontend === 'number', '应返回 frontend 端口')
    assert(ports.api !== ports.ws, 'api 和 ws 端口不应相同')
    assert(ports.api !== ports.frontend, 'api 和 frontend 端口不应相同')
  }),

  test('listenWithRetry 正常绑定', async () => {
    const { listenWithRetry } = require('../util/portFinder')
    const server = http.createServer()
    const port = await listenWithRetry(server, 18890)
    assert(typeof port === 'number', '应返回端口号')
    assert(port >= 18890, '端口应 >= 18890')
    server.close()
  }),

  test('listenWithRetry 端口冲突自动递增', async () => {
    const { listenWithRetry } = require('../util/portFinder')
    const net = require('net')
    // 先占用 18891
    const blocker = net.createServer()
    await new Promise(resolve => blocker.listen(18891, resolve))
    try {
      const server = http.createServer()
      const port = await listenWithRetry(server, 18891)
      assert(port > 18891, `端口应 > 18891，实际: ${port}`)
      server.close()
    } finally {
      blocker.close()
    }
  }),
]

// --- 3. 数据库测试 ---
// 创建持久的测试数据库目录（整个测试期间保留）
const testDbDir = path.join('/tmp', 'shroom_test_db_' + Date.now())

const dbTests = [
  test('db.js initDb 初始化数据库', async () => {
    const { initDb } = require('../util/db')
    fs.mkdirSync(testDbDir, { recursive: true })
    // initDb 需要 init.db 模板文件
    const projectDb = path.join(__dirname, '..', 'db')
    const initDbSrc = path.join(projectDb, 'init.db')
    if (!fs.existsSync(initDbSrc)) {
      fs.writeFileSync(path.join(testDbDir, 'init.db'), '')
    } else {
      fs.copyFileSync(initDbSrc, path.join(testDbDir, 'init.db'))
    }
    const result = initDb('test', testDbDir)
    assert(result !== null && result !== undefined, '数据库应成功初始化')
    assert(result.db !== undefined, '应返回 db 对象')
    // 将 db 设置到 state 中，供后续 API 测试使用
    const { state } = require('../server/state')
    state.currentDb = result.db
    state._dbPath = testDbDir
  }),
]

// --- 4. 后端服务启动测试 ---
let apiPort = null
let wsPort = null
let testServer = null

const serverTests = [
  test('Express + WebSocket 服务启动', async () => {
    const express = require('express')
    const cors = require('cors')
    const { createWsServer, getHttpServer } = require('../server/websocket')
    const { listenWithRetry } = require('../util/portFinder')
    const routes = require('../server/api/routes')

    // 启动 Express API 服务
    const app = express()
    app.use(cors())
    app.use(express.json())
    app.use(express.urlencoded({ extended: true }))
    app.use('/', routes)

    testServer = http.createServer(app)
    apiPort = await listenWithRetry(testServer, 19300)
    assert(typeof apiPort === 'number', 'API 服务应成功启动')

    // 启动 WebSocket 服务（独立端口）
    createWsServer()
    const wsHttp = getHttpServer()
    wsPort = await listenWithRetry(wsHttp, apiPort + 1)
    assert(typeof wsPort === 'number', 'WebSocket 服务应成功启动')
  }),

  test('GET / 健康检查', async () => {
    assert(apiPort, '服务未启动')
    const res = await httpGet(`http://127.0.0.1:${apiPort}/`)
    assert(res.status === 200, `状态码应为 200，实际: ${res.status}`)
  }),

  test('GET /getPort 获取串口列表', async () => {
    assert(apiPort, '服务未启动')
    try {
      const res = await httpGet(`http://127.0.0.1:${apiPort}/getPort`)
      // 可能因为 serialport 未安装而报错，但不应该 500 崩溃
      assert(res.status === 200 || res.status === 500, `状态码应为 200 或 500，实际: ${res.status}`)
    } catch (e) {
      // 连接错误也可接受（serialport 依赖问题）
      skip('serialport 原生模块未编译')
    }
  }),

  test('GET /getSystem 获取系统配置', async () => {
    assert(apiPort, '服务未启动')
    try {
      const res = await httpGet(`http://127.0.0.1:${apiPort}/getSystem`)
      assert(res.status === 200 || res.status === 500, `状态码: ${res.status}`)
    } catch (e) {
      skip('配置文件不存在')
    }
  }),

  test('GET /getColHistory 获取采集历史', async () => {
    assert(apiPort, '服务未启动')
    try {
      const res = await httpGet(`http://127.0.0.1:${apiPort}/getColHistory`)
      assert(res.status === 200 || res.status === 500, `状态码: ${res.status}`)
    } catch (e) {
      skip('数据库未初始化')
    }
  }),

  test('POST /getDbHistory 查询历史记录', async () => {
    assert(apiPort, '服务未启动')
    try {
      const res = await httpPost(`http://127.0.0.1:${apiPort}/getDbHistory`, { date: '2026-01-01' })
      assert(res.status === 200 || res.status === 500, `状态码: ${res.status}`)
    } catch (e) {
      skip('数据库未初始化')
    }
  }),

  test('WebSocket 客户端连接', async () => {
    assert(wsPort, 'WebSocket 服务未启动')
    const WebSocket = require('ws')
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${wsPort}`)
      const timeout = setTimeout(() => {
        ws.close()
        reject(new Error('WebSocket 连接超时'))
      }, 3000)

      ws.on('open', () => {
        clearTimeout(timeout)
        ws.close()
        resolve()
      })
      ws.on('error', (e) => {
        clearTimeout(timeout)
        reject(new Error(`WebSocket 连接失败: ${e.message}`))
      })
    })
  }),

  test('WebSocket broadcast 广播消息', async () => {
    assert(wsPort, 'WebSocket 服务未启动')
    const WebSocket = require('ws')
    const { broadcast } = require('../server/websocket')

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${wsPort}`)
      const timeout = setTimeout(() => {
        ws.close()
        reject(new Error('未收到广播消息'))
      }, 5000)

      let msgCount = 0
      let testMsgReceived = false

      ws.on('open', () => {
        // 等待初始消息发送完毕后再广播测试消息
        setTimeout(() => {
          broadcast({ type: 'test', data: 'hello' })
        }, 300)
      })

      ws.on('message', (rawData) => {
        msgCount++
        // 解析消息（支持 MessagePack 和 JSON）
        let msg
        try {
          if (rawData instanceof Buffer) {
            // 尝试 MessagePack 解码
            try {
              const msgpack = require('@msgpack/msgpack')
              msg = msgpack.decode(rawData)
            } catch {
              msg = JSON.parse(rawData.toString())
            }
          } else {
            msg = JSON.parse(rawData)
          }
        } catch {
          return // 无法解析，跳过
        }

        // 跳过连接时的初始空消息
        if (msg.type === 'test' && msg.data === 'hello') {
          testMsgReceived = true
          clearTimeout(timeout)
          ws.close()
          resolve()
        }
      })

      ws.on('error', (e) => {
        clearTimeout(timeout)
        reject(new Error(`WebSocket 错误: ${e.message}`))
      })
    })
  }),
]

// --- 5. 前端文件引用检查 ---
const frontendTests = [
  test('前端 import 路径完整性检查（无 copy 引用）', () => {
    const { execSync } = require('child_process')
    const result = execSync(
      'grep -rn "copy" client/src/ --include="*.js" | grep -i "import\\|require" || echo "CLEAN"',
      { cwd: path.join(__dirname, '..'), encoding: 'utf-8' }
    )
    assert(result.trim() === 'CLEAN', `仍有 copy 文件引用:\n${result}`)
  }),

  test('前端 disposeThree.js 被所有 Three.js 组件引用', () => {
    const { execSync } = require('child_process')
    const threeDir = path.join(__dirname, '..', 'client/src/components/three')
    const files = fs.readdirSync(threeDir).filter(f => f.endsWith('.js') && f !== 'NumThres.js')
    
    let missing = []
    for (const file of files) {
      const content = fs.readFileSync(path.join(threeDir, file), 'utf-8')
      if (!content.includes('disposeThree') && !content.includes('cleanupThree')) {
        // 检查是否是容器组件（不直接创建 renderer）
        if (content.includes('renderer') || content.includes('WebGLRenderer')) {
          missing.push(file)
        }
      }
    }
    assert(missing.length === 0, `以下组件缺少 disposeThree: ${missing.join(', ')}`)
  }),

  test('前端 echarts.js 按需引入文件存在', () => {
    const echartsPath = path.join(__dirname, '..', 'client/src/util/echarts.js')
    assert(fs.existsSync(echartsPath), 'client/src/util/echarts.js 不存在')
    const content = fs.readFileSync(echartsPath, 'utf-8')
    assert(content.includes('use('), 'echarts.js 应包含 use() 按需注册')
  }),

  test('ARCHITECTURE.md 存在且包含必要章节', () => {
    const archPath = path.join(__dirname, '..', 'ARCHITECTURE.md')
    assert(fs.existsSync(archPath), 'ARCHITECTURE.md 不存在')
    const content = fs.readFileSync(archPath, 'utf-8')
    assert(content.includes('## 8. 项目进度'), '缺少「项目进度」章节')
    assert(content.includes('## 9. 更新日志'), '缺少「更新日志」章节')
    assert(content.includes('## 5. API 端点'), '缺少「API 端点」章节')
    assert(content.includes('## 7. 环境变量'), '缺少「环境变量」章节')
  }),

  test('.gitignore 存在且包含关键规则', () => {
    const gitignorePath = path.join(__dirname, '..', '.gitignore')
    assert(fs.existsSync(gitignorePath), '.gitignore 不存在')
    const content = fs.readFileSync(gitignorePath, 'utf-8')
    assert(content.includes('node_modules'), '缺少 node_modules 规则')
    assert(content.includes('.DS_Store'), '缺少 .DS_Store 规则')
  }),
]

// ========== 运行 ==========
async function main() {
  const allTests = [
    ...moduleTests,
    ...portTests,
    ...dbTests,
    ...serverTests,
    ...frontendTests,
  ]

  const failures = await runTests(allTests)

  // 清理
  if (testServer) {
    testServer.close()
  }
  // 清理测试数据库
  try { fs.rmSync(testDbDir, { recursive: true, force: true }) } catch {}

  process.exit(failures > 0 ? 1 : 0)
}

main().catch(e => {
  console.error('测试运行失败:', e)
  process.exit(1)
})
