import { useEffect, useRef } from 'react'
import { wsAddress } from '../util/constant'
import { decode as msgpackDecode } from '@msgpack/msgpack'

// ─── WS 数据打印开关（通过浏览器控制台切换）────────────────
// 使用方式：在浏览器控制台输入 window.__WS_DEBUG__ = true 开启打印
//          输入 window.__WS_DEBUG__ = false 关闭打印
//          输入 window.__WS_DEBUG_FILTER__ = 'sitData' 只打印指定类型
if (typeof window !== 'undefined' && window.__WS_DEBUG__ === undefined) {
  window.__WS_DEBUG__ = false
  window.__WS_DEBUG_FILTER__ = null   // null = 打印全部, 字符串 = 只打印匹配的 key
  window.__WS_MSG_COUNT__ = 0         // 消息计数器
  window.__WS_LAST_DATA__ = null      // 最近一条完整消息

  // 便捷方法：开启/关闭调试
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
  // 二进制数据 → MessagePack 解码
  if (data instanceof ArrayBuffer) {
    if (msgpackDecode) {
      return msgpackDecode(new Uint8Array(data))
    }
    // 无解码器时尝试当 JSON 文本处理
    const text = new TextDecoder().decode(data)
    return JSON.parse(text)
  }
  // Blob 不应出现（已设置 binaryType = arraybuffer），但做兜底
  if (data instanceof Blob) {
    // 同步场景无法处理 Blob，返回空
    console.warn('[WS] 收到 Blob 类型消息，请检查 binaryType 设置')
    return {}
  }
  // 字符串 → JSON
  return JSON.parse(data)
}

/**
 * WebSocket 连接 Hook
 * 
 * 封装 WebSocket 连接管理、自动重连、消息分发
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
 */
export function useWebSocket(handlers = {}) {
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  useEffect(() => {
    let ws
    let reconnectTimer
    let reconnectAttempts = 0
    let shouldReconnect = true

    function scheduleReconnect() {
      if (!shouldReconnect) return
      const delay = Math.min(1000 * (2 ** reconnectAttempts), 10000)
      reconnectAttempts += 1
      if (reconnectTimer) clearTimeout(reconnectTimer)
      reconnectTimer = setTimeout(connect, delay)
    }

    function connect() {
      ws = new WebSocket(wsAddress)
      // 设置为 arraybuffer 以支持二进制消息
      ws.binaryType = 'arraybuffer'

      ws.onopen = () => {
        reconnectAttempts = 0
        console.info('[WS] 连接成功')
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
