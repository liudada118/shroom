'use strict'

const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const auth = require('../node/auth')
const { createDeviceCache } = require('../node/device-cache');

(async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shroom-sdk-auth-'))

  try {
    const cache = createDeviceCache({ cachePath: path.join(tempDir, 'serial_cache.json') })
    cache.set('AABB', 'car-sit', 'sit')

    const local = auth.resolveDeviceTypeLocal('aabb', { cache })
    assert.strictEqual(local.type, 'car-sit')
    assert.strictEqual(local.premission, true)

    const now = Date.now()
    const fakeFetch = async (url) => ({
      async json() {
        if (String(url).includes('/device/getDetail/')) {
          return { data: { expireTime: now + 10000, typeInfo: JSON.stringify(['car-back']) } }
        }
        return { time: now }
      },
    })

    const online = await auth.resolveDeviceTypeOnline('CCDD', {
      fetch: fakeFetch,
      backendAddress: 'http://test',
      timeServerAddress: 'http://time',
    })
    assert.strictEqual(online.type, 'car-back')
    assert.strictEqual(online.premission, true)
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }

  console.log('auth.test.js passed')
})().catch((err) => {
  console.error(err)
  process.exit(1)
})
