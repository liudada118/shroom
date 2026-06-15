'use strict'

const assert = require('assert')
const { ShroomSeatApiClient, ShroomSdkError } = require('..')

function createJsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name) => name.toLowerCase() === 'content-type' ? 'application/json' : '',
    },
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  }
}

async function run() {
  const calls = []
  const api = new ShroomSeatApiClient({
    baseUrl: 'http://127.0.0.1:19245/',
    wsUrl: 'ws://127.0.0.1:19999',
    fetch: async (url, init) => {
      calls.push({ url, init })
      return createJsonResponse({ code: 0, data: { ok: true }, msg: 'success' })
    },
  })

  const systemResult = await api.system.select('endi')
  assert.deepStrictEqual(systemResult, { code: 0, data: { ok: true }, msg: 'success' })
  assert.strictEqual(calls[0].url, 'http://127.0.0.1:19245/selectSystem')
  assert.strictEqual(calls[0].init.method, 'POST')
  assert.strictEqual(calls[0].init.headers['Content-Type'], 'application/json')
  assert.strictEqual(calls[0].init.body, JSON.stringify({ file: 'endi' }))

  await api.get('/getRemark', { query: { date: 'abc', select: { x: 1 } } })
  const queryUrl = new URL(calls[1].url)
  assert.strictEqual(queryUrl.pathname, '/getRemark')
  assert.strictEqual(queryUrl.searchParams.get('date'), 'abc')
  assert.strictEqual(queryUrl.searchParams.get('select'), JSON.stringify({ x: 1 }))

  await api.collection.setZeroBaseline({ enabled: true, data: { sit: [1, 2] } })
  assert.strictEqual(calls[2].url, 'http://127.0.0.1:19245/setZeroBaseline')
  assert.strictEqual(calls[2].init.body, JSON.stringify({ zeroState: { enabled: true, data: { sit: [1, 2] } } }))

  const unwrapApi = new ShroomSeatApiClient({
    baseUrl: 'http://localhost:19245',
    fetch: async () => createJsonResponse({ code: 0, data: [1, 2, 3], msg: 'success' }),
    unwrap: true,
  })
  assert.deepStrictEqual(await unwrapApi.history.list(), [1, 2, 3])

  const failingApi = new ShroomSeatApiClient({
    baseUrl: 'http://localhost:19245',
    fetch: async () => createJsonResponse({ code: 1, data: { reason: 'bad' }, msg: 'failed' }),
    throwOnBusinessError: true,
  })

  await assert.rejects(
    () => failingApi.collection.start({ fileName: 'demo' }),
    (error) => error instanceof ShroomSdkError && error.code === 1 && error.message === 'failed'
  )
}

run().then(() => {
  console.log('api-client.test.js passed')
}).catch((error) => {
  console.error(error)
  process.exit(1)
})
