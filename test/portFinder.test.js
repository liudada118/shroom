/**
 * portFinder.js 端口冲突处理测试
 *
 * 运行方式: node test/portFinder.test.js
 */
const net = require('net')
const { isPortAvailable, findAvailablePort, listenWithRetry, allocatePorts, DEFAULT_PORTS } = require('../util/portFinder')

let passed = 0
let failed = 0

function assert(condition, message) {
  if (condition) {
    passed++
    console.log(`  ✓ ${message}`)
  } else {
    failed++
    console.error(`  ✗ ${message}`)
  }
}

/**
 * 在指定端口创建一个占位服务器
 */
function occupyPort(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.listen(port, '127.0.0.1', () => {
      resolve(server)
    })
    server.on('error', reject)
  })
}

async function testIsPortAvailable() {
  console.log('\n--- isPortAvailable ---')

  // 测试空闲端口
  const available = await isPortAvailable(18888)
  assert(available === true, '空闲端口应返回 true')

  // 测试被占用端口
  const occupier = await occupyPort(18889)
  const occupied = await isPortAvailable(18889)
  assert(occupied === false, '被占用端口应返回 false')
  occupier.close()

  // 测试无效端口
  const invalid1 = await isPortAvailable(0)
  assert(invalid1 === false, '端口 0 应返回 false')

  const invalid2 = await isPortAvailable(99999)
  assert(invalid2 === false, '超范围端口应返回 false')
}

async function testFindAvailablePort() {
  console.log('\n--- findAvailablePort ---')

  // 测试从空闲端口开始
  const port1 = await findAvailablePort(18900)
  assert(port1 === 18900, `空闲端口应直接返回 (got ${port1})`)

  // 测试跳过被占用端口
  const occupier = await occupyPort(18910)
  const port2 = await findAvailablePort(18910)
  assert(port2 === 18911, `应跳过被占用端口 18910，返回 18911 (got ${port2})`)
  occupier.close()

  // 测试连续占用
  const occ1 = await occupyPort(18920)
  const occ2 = await occupyPort(18921)
  const occ3 = await occupyPort(18922)
  const port3 = await findAvailablePort(18920)
  assert(port3 === 18923, `应跳过 18920-18922，返回 18923 (got ${port3})`)
  occ1.close()
  occ2.close()
  occ3.close()
}

async function testListenWithRetry() {
  console.log('\n--- listenWithRetry ---')

  // 测试正常绑定
  const server1 = net.createServer()
  const port1 = await listenWithRetry(server1, 18930)
  assert(port1 === 18930, `正常绑定应返回首选端口 (got ${port1})`)

  // 测试端口冲突自动重试
  const server2 = net.createServer()
  const port2 = await listenWithRetry(server2, 18930)
  assert(port2 === 18931, `冲突时应自动使用下一个端口 (got ${port2})`)

  // 测试多次冲突
  const server3 = net.createServer()
  const port3 = await listenWithRetry(server3, 18930)
  assert(port3 === 18932, `多次冲突应继续递增 (got ${port3})`)

  server1.close()
  server2.close()
  server3.close()
}

async function testAllocatePorts() {
  console.log('\n--- allocatePorts ---')

  // 测试批量分配不冲突
  const ports = await allocatePorts({
    api: 18940,
    ws: 18941,
    frontend: 18942
  })
  assert(ports.api === 18940, `api 端口应为 18940 (got ${ports.api})`)
  assert(ports.ws === 18941, `ws 端口应为 18941 (got ${ports.ws})`)
  assert(ports.frontend === 18942, `frontend 端口应为 18942 (got ${ports.frontend})`)

  // 测试有占用时的分配
  const occ = await occupyPort(18950)
  const ports2 = await allocatePorts({
    api: 18950,
    ws: 18951
  })
  assert(ports2.api === 18951, `api 应跳过被占用的 18950 (got ${ports2.api})`)
  assert(ports2.ws === 18952, `ws 应避开已分配的 18951 (got ${ports2.ws})`)
  occ.close()
}

async function testDefaultPorts() {
  console.log('\n--- DEFAULT_PORTS ---')

  assert(DEFAULT_PORTS.api === 19245, `默认 API 端口应为 19245 (got ${DEFAULT_PORTS.api})`)
  assert(DEFAULT_PORTS.ws === 19999, `默认 WS 端口应为 19999 (got ${DEFAULT_PORTS.ws})`)
  assert(DEFAULT_PORTS.frontend === 3000, `默认前端端口应为 3000 (got ${DEFAULT_PORTS.frontend})`)
  assert(DEFAULT_PORTS.frontendProd === 2999, `默认生产前端端口应为 2999 (got ${DEFAULT_PORTS.frontendProd})`)
}

async function main() {
  console.log('=== portFinder.js 端口冲突处理测试 ===')

  try {
    await testDefaultPorts()
    await testIsPortAvailable()
    await testFindAvailablePort()
    await testListenWithRetry()
    await testAllocatePorts()
  } catch (err) {
    console.error('\n测试执行异常:', err)
    failed++
  }

  console.log(`\n=== 测试结果: ${passed} 通过, ${failed} 失败 ===`)
  process.exit(failed > 0 ? 1 : 0)
}

main()
