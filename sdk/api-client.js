'use strict'

const DEFAULT_API_PORT = 19245
const DEFAULT_WS_PORT = 19999

class ShroomSdkError extends Error {
  constructor(message, details = {}) {
    super(message)
    this.name = 'ShroomSdkError'
    Object.assign(this, details)
  }
}

function trimTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '')
}

function getBrowserPorts() {
  if (typeof window === 'undefined') return {}
  return window.__PORTS__ || {}
}

function resolveBaseUrl(options = {}) {
  if (options.baseUrl) return trimTrailingSlash(options.baseUrl)
  const ports = getBrowserPorts()
  const apiPort = options.apiPort || ports.api || DEFAULT_API_PORT
  const host = options.host || 'localhost'
  const protocol = options.protocol || 'http'
  return `${protocol}://${host}:${apiPort}`
}

function resolveWsUrl(options = {}) {
  if (options.wsUrl) return options.wsUrl
  const ports = getBrowserPorts()
  const wsPort = options.wsPort || ports.ws || DEFAULT_WS_PORT
  const host = options.wsHost || options.host || '127.0.0.1'
  const protocol = options.wsProtocol || 'ws'
  return `${protocol}://${host}:${wsPort}`
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function appendQuery(url, query) {
  if (!query || !Object.keys(query).length) return url
  const nextUrl = new URL(url)
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    const normalized = typeof value === 'object' ? JSON.stringify(value) : String(value)
    nextUrl.searchParams.set(key, normalized)
  })
  return nextUrl.toString()
}

function createTimeoutSignal(timeoutMs, externalSignal) {
  if (!timeoutMs && !externalSignal) return { signal: undefined, cleanup: () => {} }
  const controller = new AbortController()
  let timer = null

  const abortFromExternal = () => controller.abort(externalSignal.reason)
  if (externalSignal) {
    if (externalSignal.aborted) {
      abortFromExternal()
    } else {
      externalSignal.addEventListener('abort', abortFromExternal, { once: true })
    }
  }

  if (timeoutMs) {
    timer = setTimeout(() => controller.abort(new Error(`Request timed out after ${timeoutMs}ms`)), timeoutMs)
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      if (timer) clearTimeout(timer)
      if (externalSignal) externalSignal.removeEventListener('abort', abortFromExternal)
    },
  }
}

function normalizeResult(result, options) {
  if (!options.unwrap && !options.throwOnBusinessError) return result
  if (result && typeof result === 'object' && 'code' in result && result.code !== 0) {
    throw new ShroomSdkError(result.msg || 'API business error', {
      code: result.code,
      data: result.data,
      result,
    })
  }
  return options.unwrap && result && typeof result === 'object' && 'data' in result ? result.data : result
}

function getFetch(customFetch) {
  const fetchImpl = customFetch || globalThis.fetch
  if (typeof fetchImpl !== 'function') {
    throw new ShroomSdkError('No fetch implementation available. Pass { fetch } when creating the SDK.')
  }
  return fetchImpl
}

function getWebSocket(customWebSocket) {
  let WebSocketImpl = customWebSocket || globalThis.WebSocket
  if (typeof WebSocketImpl !== 'function' && typeof require === 'function') {
    try {
      WebSocketImpl = require('ws')
    } catch {
      WebSocketImpl = null
    }
  }
  if (typeof WebSocketImpl !== 'function') {
    throw new ShroomSdkError('No WebSocket implementation available. Pass { WebSocket } when creating the SDK.')
  }
  return WebSocketImpl
}

function tryRequireMessagePack() {
  if (typeof require !== 'function') return null
  try {
    return require('@msgpack/msgpack')
  } catch {
    return null
  }
}

function decodeTextPayload(data) {
  if (typeof data === 'string') return JSON.parse(data)
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(data)) {
    return JSON.parse(data.toString('utf-8'))
  }
  if (data instanceof ArrayBuffer) {
    return JSON.parse(new TextDecoder().decode(data))
  }
  if (ArrayBuffer.isView(data)) {
    return JSON.parse(new TextDecoder().decode(data))
  }
  return data
}

class ShroomSeatApiClient {
  constructor(options = {}) {
    this.baseUrl = resolveBaseUrl(options)
    this.wsUrl = resolveWsUrl(options)
    this.fetch = getFetch(options.fetch)
    this.WebSocket = options.WebSocket
    this.timeoutMs = options.timeoutMs || 30000
    this.unwrap = Boolean(options.unwrap)
    this.throwOnBusinessError = Boolean(options.throwOnBusinessError)
    this.headers = { ...(options.headers || {}) }
    this.decodeMessagePack = options.decodeMessagePack || options.messagePack?.decode || tryRequireMessagePack()?.decode

    this.system = {
      get: () => this.get('/getSystem'),
      setConfig: (config) => this.post('/setSystemConfig', { config }),
      select: (file) => this.post('/selectSystem', { file }),
      changeType: (system) => this.post('/changeSystemType', { system }),
      getPressureConfig: () => this.get('/getPressureConfig'),
      setPressureConfig: (config) => this.post('/setPressureConfig', { config }),
      encryptConfig: (config) => this.post('/getSysconfig', { config }),
    }

    this.serial = {
      listPorts: () => this.get('/getPort'),
      connect: () => this.get('/connPort'),
      rescan: () => this.get('/rescanPort'),
      stop: () => this.get('/stopPort'),
      sendMac: () => this.get('/sendMac'),
      sendMacConnected: () => this.get('/sendMacConnected'),
      readMacOnly: () => this.get('/readMacOnly'),
    }

    this.collection = {
      getDataDirection: () => this.get('/getDataDirection'),
      setDataDirection: (dataDirection) => this.post('/setDataDirection', { dataDirection }),
      setZeroBaseline: (zeroState) => this.post(
        '/setZeroBaseline',
        isPlainObject(zeroState) && (zeroState.zeroState || zeroState.zero) ? zeroState : { zeroState }
      ),
      start: (payload = {}) => this.post('/startCol', payload),
      stop: () => this.get('/endCol'),
    }

    this.history = {
      list: () => this.get('/getColHistory'),
      load: (time) => this.post('/getDbHistory', isPlainObject(time) ? time : { time }),
      getSelectionStats: (selectJson) => this.post('/getDbHistorySelect', { selectJson }),
      getCopReport: (payload) => this.post('/copReportData', payload),
      removeRecords: (fileArr) => this.post('/delete', { fileArr }),
      renameDate: (payload) => this.post('/changeDbName', payload),
      renameData: (payload) => this.post('/changeDbDataName', payload),
      upsertRemark: (payload) => this.post('/upsertRemark', payload),
      getRemark: (date) => this.post('/getRemark', isPlainObject(date) ? date : { date }),
      listSelectionTemplates: () => this.get('/selectionTemplates'),
      saveSelectionTemplates: (templates) => this.post('/selectionTemplates/saveAll', { templates }),
    }

    this.playback = {
      play: () => this.post('/getDbHistoryPlay'),
      stop: () => this.post('/getDbHistoryStop'),
      cancel: () => this.post('/cancalDbPlay'),
      setSpeed: (speed) => this.post('/changeDbplaySpeed', { speed }),
      seek: (index) => this.post('/getDbHistoryIndex', { index }),
    }

    this.contrast = {
      load: (payload) => this.post('/getContrastData', payload),
      frame: (payload) => this.post('/getContrastIndex', payload),
      exportData: (payload) => this.post('/exportContrastData', payload),
    }

    this.export = {
      download: (payload) => this.post('/download', payload),
      getFields: (fileArr) => this.post('/downloadFields', isPlainObject(fileArr) ? fileArr : { fileArr }),
      getDownloadPath: () => this.get('/getDownloadPath'),
      setDownloadPath: (path) => this.post('/setDownloadPath', isPlainObject(path) ? path : { path }),
      openFile: (filePath) => this.post('/openFile', isPlainObject(filePath) ? filePath : { filePath }),
      openFolder: (folderPath) => this.post('/openFolder', isPlainObject(folderPath) ? folderPath : { folderPath }),
    }

    this.csv = {
      upload: (file, fileName) => this.uploadCsv(file, fileName),
      getData: (fileName) => this.post('/getCsvData', isPlainObject(fileName) ? fileName : { fileName }),
    }

    this.cache = {
      getDevices: () => this.get('/cache/devices'),
      getDeviceTypes: () => this.get('/cache/device-types'),
      saveDevice: (device) => this.post('/cache/devices', device),
      replaceDevices: (devices) => this.post('/cache/devices/bulk', { devices }),
      removeDevice: (mac) => this.request('DELETE', '/cache/devices', { body: isPlainObject(mac) ? mac : { mac } }),
      clear: () => this.post('/cache/clear'),
    }

    this.auth = {
      getMode: () => this.get('/auth/mode'),
      setMode: (mode) => this.post('/auth/mode', isPlainObject(mode) ? mode : { mode }),
    }
  }

  async request(method, path, options = {}) {
    const requestOptions = {
      unwrap: this.unwrap,
      throwOnBusinessError: this.throwOnBusinessError,
      ...options,
    }
    const url = appendQuery(`${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`, requestOptions.query)
    const headers = { ...this.headers, ...(requestOptions.headers || {}) }
    const init = { method, headers }

    if (requestOptions.body !== undefined) {
      if (typeof FormData !== 'undefined' && requestOptions.body instanceof FormData) {
        init.body = requestOptions.body
      } else {
        headers['Content-Type'] = headers['Content-Type'] || 'application/json'
        init.body = JSON.stringify(requestOptions.body)
      }
    }

    const { signal, cleanup } = createTimeoutSignal(requestOptions.timeoutMs ?? this.timeoutMs, requestOptions.signal)
    init.signal = signal

    try {
      const response = await this.fetch(url, init)
      const contentType = response.headers?.get?.('content-type') || ''
      const result = contentType.includes('application/json') ? await response.json() : await response.text()
      if (!response.ok) {
        throw new ShroomSdkError(`HTTP ${response.status}`, { status: response.status, response: result })
      }
      return normalizeResult(result, requestOptions)
    } finally {
      cleanup()
    }
  }

  get(path, options = {}) {
    return this.request('GET', path, options)
  }

  post(path, body, options = {}) {
    return this.request('POST', path, { ...options, body })
  }

  bindKey(key) {
    return this.post('/bindKey', { key })
  }

  async uploadCsv(file, fileName) {
    if (typeof FormData === 'undefined') {
      throw new ShroomSdkError('FormData is not available in this runtime.')
    }
    const form = new FormData()
    const { value, name } = await this.normalizeUploadFile(file, fileName)
    form.append('file', value, name)
    return this.request('POST', '/uploadCsv', { body: form })
  }

  async normalizeUploadFile(file, fileName) {
    if (typeof Blob !== 'undefined' && file instanceof Blob) {
      return { value: file, name: fileName || file.name || 'upload.csv' }
    }

    if (typeof file === 'string') {
      if (typeof require !== 'function' || typeof Blob === 'undefined') {
        throw new ShroomSdkError('Uploading by file path requires Node.js with Blob support.')
      }
      const fs = require('fs')
      const path = require('path')
      const bytes = await fs.promises.readFile(file)
      return { value: new Blob([bytes]), name: fileName || path.basename(file) }
    }

    if (file instanceof Uint8Array || (typeof Buffer !== 'undefined' && Buffer.isBuffer(file))) {
      if (typeof Blob === 'undefined') {
        throw new ShroomSdkError('Uploading bytes requires Blob support.')
      }
      return { value: new Blob([file]), name: fileName || 'upload.csv' }
    }

    return { value: file, name: fileName || 'upload.csv' }
  }

  connectWebSocket(handlers = {}) {
    const WebSocketImpl = getWebSocket(this.WebSocket)
    const ws = new WebSocketImpl(this.wsUrl)
    ws.onopen = (event) => handlers.open?.(event, ws)
    ws.onerror = (event) => handlers.error?.(event, ws)
    ws.onclose = (event) => handlers.close?.(event, ws)
    ws.onmessage = async (event) => {
      try {
        const data = await this.decodeWsPayload(event.data)
        handlers.message?.(data, event, ws)
      } catch (error) {
        handlers.error?.(error, ws)
      }
    }
    return ws
  }

  async decodeWsPayload(data) {
    if (typeof data === 'string') return decodeTextPayload(data)

    const bytes = await this.toUint8Array(data)
    if (this.decodeMessagePack) {
      return this.decodeMessagePack(bytes)
    }
    return decodeTextPayload(bytes)
  }

  async toUint8Array(data) {
    if (data instanceof Uint8Array) return data
    if (typeof Buffer !== 'undefined' && Buffer.isBuffer(data)) return new Uint8Array(data)
    if (data instanceof ArrayBuffer) return new Uint8Array(data)
    if (typeof Blob !== 'undefined' && data instanceof Blob) {
      return new Uint8Array(await data.arrayBuffer())
    }
    if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    throw new ShroomSdkError('Unsupported WebSocket payload type.', { payload: data })
  }
}

function createShroomSeatApiClient(options) {
  return new ShroomSeatApiClient(options)
}

module.exports = {
  DEFAULT_API_PORT,
  DEFAULT_WS_PORT,
  ShroomSeatApiClient,
  ShroomSeatSDK: ShroomSeatApiClient,
  ShroomSdkError,
  createShroomSeatApiClient,
  createShroomSeatSDK: createShroomSeatApiClient,
}
