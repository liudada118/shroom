/**
 * 串口Device本地缓存模块
 *
 * 管理 serial_cache.json 文件，存储 MAC 地址 → Device类型的映射关系。
 * 用于In local mode的Device类型识别，无需联网。
 *
 * 缓存文件格式：
 * {
 *   "devices": {
 *     "AA:BB:CC:DD:EE:FF": {
 *       "type": "foot1",
 *       "deviceClass": "foot",
 *       "lastSeen": "2026-03-06T12:00:00.000Z",
 *       "alias": "左前脚垫"
 *     }
 *   },
 *   "updatedAt": "2026-03-06T12:00:00.000Z"
 * }
 */
const fs = require('fs')
const path = require('path')

// 缓存文件路径（与 db 目录同级）
let cachePath = process.env.SERIAL_CACHE_PATH || path.join(__dirname, '..', 'serial_cache.json')

/**
 * 设置缓存文件路径（打包后路径不同）
 */
function setCachePath(newPath) {
  if (!newPath) return
  cachePath = newPath
}

function ensureCacheDir() {
  fs.mkdirSync(path.dirname(cachePath), { recursive: true })
}

/**
 * 读取缓存文件
 * @returns {Object} 缓存对象
 */
function readCache() {
  try {
    if (fs.existsSync(cachePath)) {
      const raw = fs.readFileSync(cachePath, 'utf-8')
      return JSON.parse(raw)
    }
  } catch (err) {
    console.error('[SerialCache] Cache read failed:', err.message)
  }
  return { devices: {}, updatedAt: null }
}

/**
 * 写入缓存文件
 * @param {Object} cache 缓存对象
 */
function writeCache(cache) {
  try {
    cache.updatedAt = new Date().toISOString()
    ensureCacheDir()
    fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2), 'utf-8')
  } catch (err) {
    console.error('[SerialCache] Cache write failed:', err.message)
  }
}

/**
 * 从缓存中查询 MAC 地址对应的Device类型
 * @param {string} mac MAC 地址
 * @returns {Object|null} { type, deviceClass, alias } 或 null
 */
function getTypeFromCache(mac) {
  if (!mac) return null
  const cache = readCache()
  const normalizedMac = mac.toUpperCase().trim()
  const device = cache.devices[normalizedMac]
  if (device) {
    // 更新 lastSeen
    device.lastSeen = new Date().toISOString()
    writeCache(cache)
    return device
  }
  return null
}

/**
 * 将 MAC 地址和Device类型写入缓存
 * @param {string} mac MAC 地址
 * @param {string} deviceType Device类型（如 foot1, foot2）
 * @param {string} deviceClass Device大类（如 foot, hand）
 * @param {string} [alias] Device别名
 */
function setTypeToCache(mac, deviceType, deviceClass, alias) {
  if (!mac || !deviceType) return
  const cache = readCache()
  const normalizedMac = mac.toUpperCase().trim()
  cache.devices[normalizedMac] = {
    type: deviceType,
    deviceClass: deviceClass || '',
    lastSeen: new Date().toISOString(),
    alias: alias || '',
  }
  writeCache(cache)
  console.log(`[SerialCache] Cached: ${normalizedMac} → ${deviceType}`)
}

/**
 * 删除缓存中的某个 MAC 地址
 * @param {string} mac MAC 地址
 */
function removeFromCache(mac) {
  if (!mac) return
  const cache = readCache()
  const normalizedMac = mac.toUpperCase().trim()
  delete cache.devices[normalizedMac]
  writeCache(cache)
}

/**
 * 获取所有缓存的Device列表
 * @returns {Object} { mac: { type, deviceClass, lastSeen, alias } }
 */
function getAllCached() {
  const cache = readCache()
  return cache.devices || {}
}

/**
 * 清空缓存
 */
function clearCache() {
  writeCache({ devices: {} })
}

module.exports = {
  setCachePath,
  getTypeFromCache,
  setTypeToCache,
  removeFromCache,
  getAllCached,
  clearCache,
  readCache,
  writeCache,
}
