'use strict'

const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { createDeviceCache, normalizeMac } = require('../node/device-cache')

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shroom-sdk-cache-'))
const cachePath = path.join(tempDir, 'serial_cache.json')

try {
  const cache = createDeviceCache({ cachePath })
  assert.strictEqual(normalizeMac(' aa '), 'AA')
  assert.strictEqual(cache.get('AABB'), null)

  cache.set('aabb', 'car-sit', 'sit', 'demo')
  const device = cache.get('AABB')
  assert.strictEqual(device.type, 'car-sit')
  assert.strictEqual(device.deviceClass, 'sit')
  assert.strictEqual(device.alias, 'demo')

  cache.remove('AABB')
  assert.strictEqual(cache.get('AABB'), null)

  cache.set('CCDD', 'car-back')
  cache.clear()
  assert.deepStrictEqual(cache.getAll(), {})
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true })
}

console.log('device-cache.test.js passed')
