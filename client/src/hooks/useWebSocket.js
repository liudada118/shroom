import { useEffect, useRef } from 'react'
import { wsAddress } from '../util/constant'
import { decode as msgpackDecode } from '@msgpack/msgpack'

// ─── WS 数据打印开关（通过浏览器控制台切换）────────────────
if (typeof window !== 'undefined' && window.__WS_DEBUG__ === undefined) {
  window.__WS_DEBUG__ = false
  window.__WS_DEBUG_FILTER__ = null
  window.__WS_MSG_COUNT__ = 0
  window.__WS_LAST_DATA__ = null

  window.wsDebugOn = () => { window.__WS_DEBUG__ = true; console.log('[WS Debug] 已开启 WebSocket 数据打印') }
  window.wsDebugOff = () => { window.__WS_DEBUG__ = false; console.log('[WS Debug] 已关闭 WebSocket 数据打印') }
  window.wsDebugFilter = (key) => { window.__WS_DEBUG_FILTER__ = key || null; console.log(`[WS Debug] 过滤器: ${key || '全部'}`) }
  window.wsDebugLast = () => { console.log('[WS Debug] 最近一条消息:', window.__WS_LAST_DATA__); return window.__WS_LAST_DATA__ }
  window.wsDebugCount = () => { console.log(`[WS Debug] 已接收 ${window.__WS_MSG_COUNT__} 条消息`); return window.__WS_MSG_COUNT__ }

  console.log(
    '%c[WS Debug] WebSocket 调试工具已加载',
    'color: #4CAF50; font-weight: bold',
    '\n  wsDebugOn()    - 开启数据打印',
    '\n  wsDebugOff()   - 关闭数据打印',
    '\n  wsDebugFilter("sitData") - 只打印指定类型',
    '\n  wsDebugLast()  - 查看最近一条消息',
    '\n  wsDebugCount() - 查看消息总数',
  )
}

/**
 * 解析 WebSocket 消息，自动适配 JSON 和 MessagePack 格式
 */
function parseMessage(data) {
  if (data instanceof ArrayBuffer) {
    if (msgpackDecode) {
      return msgpackDecode(new Uint8Array(data))
    }
    const text = new TextDecoder().decode(data)
    return JSON.parse(text)
  }
  if (data instanceof Blob) {
    console.warn('[WS] 收到 Blob 类型消息，请检查 binaryType 设置')
    return {}
  }
  return JSON.parse(data)
}

/** WebSocket 断线后固定 3 秒重连 */
const WS_RECONNECT_DELAY = 3000

/**
 * WebSocket 连接 Hook
 * 
 * 封装 WebSocket 连接管理、固定 3 秒自动重连、消息分发
 * 自动适配 JSON 和 MessagePack 两种传输格式
 * 
 * @param {Object} handlers - 消息处理回调
 * @param {Function} handlers.onSitData - 实时数据回调 (sitData)
 * @param {Function} handlers.onSitDataPlay - 回放数据回调 (sitDataPlay)
 * @param {Function} handlers.onPlayEnd - 回放结束回调 (playEnd)
 * @param {Function} handlers.onContrastData - 对比数据回调 (contrastData)
 * @param {Function} handlers.onMacInfo - 设备信息回调 (macInfo)
 * @param {Function} handlers.onIndex - 帧索引回调
 * @param {Function} handlers.onTimestamp - 时间戳回调
 * @param {Function} handlers.onConnectProgress - 连接进度回调 (connectProgress)
 * @param {Function} handlers.onConnectResult - 连接结果回调 (connectResult)
 * @param {Function} handlers.onDeviceUpdate - 设备更新回调 (deviceUpdate)
 * @param {Function} handlers.onRescanProgress - 重扫进度回调 (rescanProgress)
 * @param {Function} handlers.onWsOpen - WebSocket 连接成功回调
 * @param {Function} handlers.onWsClose - WebSocket 断开回调
 */
export function useWebSocket(handlers = {}) {
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  useEffect(() => {
    let ws
    let reconnectTimer
    let shouldReconnect = true

    function scheduleReconnect() {
      if (!shouldReconnect) return
      if (reconnectTimer) clearTimeout(reconnectTimer)
      reconnectTimer = setTimeout(connect, WS_RECONNECT_DELAY)
    }

    function connect() {
      ws = new WebSocket(wsAddress)
      ws.binaryType = 'arraybuffer'

      ws.onopen = () => {
        console.info('[WS] 连接成功')
        const h = handlersRef.current
        if (h.onWsOpen) h.onWsOpen()
      }

      ws.onmessage = (e) => {
        try {
          const jsonObj = parseMessage(e.data)

          // ─── WS 数据打印 ──────────────────────────────
          if (typeof window !== 'undefined') {
            window.__WS_MSG_COUNT__ = (window.__WS_MSG_COUNT__ || 0) + 1
            window.__WS_LAST_DATA__ = jsonObj

            if (window.__WS_DEBUG__) {
              const filter = window.__WS_DEBUG_FILTER__
              if (!filter || Object.keys(jsonObj).some(k => k.includes(filter))) {
                const keys = Object.keys(jsonObj)
                const timestamp = new Date().toLocaleTimeString()
                console.groupCollapsed(
                  `%c[WS #${window.__WS_MSG_COUNT__}] ${timestamp} | keys: ${keys.join(', ')}`,
                  'color: #2196F3; font-weight: bold'
                )
                console.log('完整数据:', jsonObj)
                keys.forEach(key => {
                  const val = jsonObj[key]
                  if (val && typeof val === 'object' && val.arr) {
                    console.log(`  ${key}.status:`, val.status, '| arr长度:', val.arr.length, '| 前5项:', val.arr.slice(0, 5))
                  } else {
                    console.log(`  ${key}:`, val)
                  }
                })
                console.groupEnd()
              }
            }
          }

          const h = handlersRef.current

          // 实时数据
          if (jsonObj.sitData && h.onSitData) {
            h.onSitData(jsonObj.sitData)
          }

          // 回放数据
          if (jsonObj.sitDataPlay && h.onSitDataPlay) {
            h.onSitDataPlay(jsonObj.sitDataPlay)
          }

          // 回放结束信号
          if (jsonObj.playEnd != null && h.onPlayEnd) {
            h.onPlayEnd(jsonObj.playEnd)
          }

          // 对比数据
          if (jsonObj.contrastData && h.onContrastData) {
            h.onContrastData(jsonObj.contrastData)
          }

          // 设备 MAC 信息
          if (jsonObj.macInfo && h.onMacInfo) {
            h.onMacInfo(jsonObj.macInfo)
          }

          // 帧索引
          if (jsonObj.index !== undefined && jsonObj.index !== null && h.onIndex) {
            h.onIndex(jsonObj.index)
          }

          // 时间戳
          if (jsonObj.timestamp !== undefined && jsonObj.timestamp !== null && h.onTimestamp) {
            h.onTimestamp(jsonObj.timestamp)
          }

          // ─── 连接进度事件 ──────────────────────────────
          if (jsonObj.connectProgress && h.onConnectProgress) {
            h.onConnectProgress(jsonObj.connectProgress)
          }

          // 连接结果
          if (jsonObj.connectResult && h.onConnectResult) {
            h.onConnectResult(jsonObj.connectResult)
          }

          // 设备更新（MAC 解析后设备类型变更）
          if (jsonObj.deviceUpdate && h.onDeviceUpdate) {
            h.onDeviceUpdate(jsonObj.deviceUpdate)
          }

          // 重扫进度
          if (jsonObj.rescanProgress && h.onRescanProgress) {
            h.onRescanProgress(jsonObj.rescanProgress)
          }
        } catch (err) {
          console.error('[WS] 消息解析失败:', err)
        }
      }

      ws.onerror = () => {
        if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
          ws.close()
        }
      }

      ws.onclose = () => {
        console.info('[WS] 连接断开，3 秒后重连...')
        const h = handlersRef.current
        if (h.onWsClose) h.onWsClose()
        scheduleReconnect()
      }
    }

    connect()

    return () => {
      shouldReconnect = false
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        ws.close()
      }
    }
  }, [])
}
