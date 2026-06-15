'use strict'

const { createDeviceCache } = require('./device-cache')

const DEFAULT_BACKEND_ADDRESS = 'https://sensor.bodyta.com'
const DEFAULT_TIME_SERVER_ADDRESS = 'http://sensor.bodyta.com:8080'

function getFetch(options = {}) {
  if (options.fetch) return options.fetch
  if (typeof fetch === 'function') return fetch
  try {
    return require('axios')
  } catch (err) {
    throw new Error('fetch or axios is required for online device auth')
  }
}

async function fetchJson(fetchLike, url, options = {}) {
  if (fetchLike.get) {
    const response = await fetchLike.get(url, { timeout: options.timeoutMs })
    return response.data
  }
  const controller = new AbortController()
  const timer = options.timeoutMs ? setTimeout(() => controller.abort(), options.timeoutMs) : null
  try {
    const response = await fetchLike(url, { signal: controller.signal })
    return response.json()
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function resolveDeviceTypeOnline(uniqueId, options = {}) {
  const fetchLike = getFetch(options)
  const backendAddress = options.backendAddress || DEFAULT_BACKEND_ADDRESS
  const timeServerAddress = options.timeServerAddress || DEFAULT_TIME_SERVER_ADDRESS
  const timeoutMs = options.timeoutMs || 5000

  try {
    const [detail, time] = await Promise.all([
      fetchJson(fetchLike, `${backendAddress}/device-manage/device/getDetail/${uniqueId}`, { timeoutMs }),
      fetchJson(fetchLike, `${timeServerAddress}/rcv/login/getSystemTime`, { timeoutMs }),
    ])
    const data = detail.data
    if (!data) return { type: null, premission: false }
    const expireTime = data.expireTime
    const nowTime = time.time
    const deviceType = JSON.parse(data.typeInfo)[0]
    return {
      type: deviceType || null,
      premission: Boolean(deviceType && nowTime < expireTime),
      raw: { detail, time },
    }
  } catch (err) {
    if (options.onError) options.onError(err, { stage: 'online_auth', uniqueId })
    return { type: null, premission: false, error: err }
  }
}

function resolveDeviceTypeLocal(uniqueId, options = {}) {
  const cache = options.cache || createDeviceCache(options)
  const cached = cache.get(uniqueId)
  return cached
    ? { type: cached.type, premission: true, deviceClass: cached.deviceClass, alias: cached.alias }
    : { type: null, premission: false }
}

async function resolveDeviceType(uniqueId, options = {}) {
  const localResult = resolveDeviceTypeLocal(uniqueId, options)
  if (localResult.type) return localResult
  if ((options.authMode || 'online') === 'online') {
    const onlineResult = await resolveDeviceTypeOnline(uniqueId, options)
    if (onlineResult.type && options.cache !== false) {
      const cache = options.cache || createDeviceCache(options)
      cache.set(uniqueId, onlineResult.type, onlineResult.deviceClass || 'foot', '')
    }
    return onlineResult
  }
  return { type: null, premission: false }
}

module.exports = {
  DEFAULT_BACKEND_ADDRESS,
  DEFAULT_TIME_SERVER_ADDRESS,
  resolveDeviceTypeOnline,
  resolveDeviceTypeLocal,
  resolveDeviceType,
}
