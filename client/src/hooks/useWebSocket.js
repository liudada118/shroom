import { useEffect, useRef } from 'react'
import { wsAddress } from '../util/constant'
import { decode as msgpackDecode } from '@msgpack/msgpack'

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
          console.log('[WS] 收到数据:', JSON.stringify(jsonObj).slice(0, 500))
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
