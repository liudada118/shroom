'use strict'

const fs = require('fs')
const path = require('path')

function normalizeMac(mac) {
  return String(mac || '').trim().toUpperCase()
}

function createDeviceCache(options = {}) {
  const cachePath = options.cachePath || path.join(process.cwd(), 'serial_cache.json')

  const ensureDir = () => {
    fs.mkdirSync(path.dirname(cachePath), { recursive: true })
  }

  const readCache = () => {
    try {
      if (fs.existsSync(cachePath)) {
        return JSON.parse(fs.readFileSync(cachePath, 'utf8'))
      }
    } catch (err) {
      if (options.onError) options.onError(err, { stage: 'read_cache', cachePath })
    }
    return { devices: {}, updatedAt: null }
  }

  const writeCache = (cache) => {
    const nextCache = {
      devices: cache.devices || {},
      updatedAt: new Date().toISOString(),
    }
    ensureDir()
    fs.writeFileSync(cachePath, JSON.stringify(nextCache, null, 2), 'utf8')
    return nextCache
  }

  const get = (mac) => {
    const normalizedMac = normalizeMac(mac)
    if (!normalizedMac) return null
    const cache = readCache()
    const device = cache.devices?.[normalizedMac] || null
    if (device) {
      device.lastSeen = new Date().toISOString()
      writeCache(cache)
    }
    return device
  }

  const set = (mac, type, deviceClass = '', alias = '') => {
    const normalizedMac = normalizeMac(mac)
    if (!normalizedMac || !type) return null
    const cache = readCache()
    cache.devices = cache.devices || {}
    cache.devices[normalizedMac] = {
      type,
      deviceClass,
      alias,
      lastSeen: new Date().toISOString(),
    }
    writeCache(cache)
    return cache.devices[normalizedMac]
  }

  const remove = (mac) => {
    const normalizedMac = normalizeMac(mac)
    const cache = readCache()
    if (cache.devices) delete cache.devices[normalizedMac]
    writeCache(cache)
  }

  const clear = () => writeCache({ devices: {} })

  return {
    cachePath,
    normalizeMac,
    readCache,
    writeCache,
    get,
    set,
    remove,
    clear,
    getAll: () => readCache().devices || {},
  }
}

module.exports = {
  normalizeMac,
  createDeviceCache,
}
