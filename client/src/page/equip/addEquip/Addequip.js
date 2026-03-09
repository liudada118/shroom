import { Button, Checkbox, DatePicker, Input, message, Tag, Card, Tooltip, Badge, Divider, Space, Select } from 'antd'
import axios from 'axios'
import React, { useEffect, useState, useRef, useCallback } from 'react'
import { decode as msgpackDecode } from '@msgpack/msgpack'
import customParseFormat from 'dayjs/plugin/customParseFormat'
import dayjs from 'dayjs'
import { serverAddress, localAddress, wsAddress } from '../../../util/constant'
import './index.scss'

dayjs.extend(customParseFormat)
const dateFormat = 'YYYY-MM-DD'
const CheckboxGroup = Checkbox.Group
const plainOptions = ['hand', 'bed', 'car-back', 'car-sit', 'endi-back', 'endi-sit']

// ─── Device class colors & labels ────────────────────────
const DEVICE_COLORS = {
  hand: { color: '#722ed1', bg: '#f9f0ff', border: '#d3adf7', label: '手套' },
  sit: { color: '#1890ff', bg: '#e6f7ff', border: '#91d5ff', label: '坐垫' },
  foot: { color: '#52c41a', bg: '#f6ffed', border: '#b7eb8f', label: '脚垫' },
  unknown: { color: '#8c8c8c', bg: '#fafafa', border: '#d9d9d9', label: '未知' },
}

// ─── Log type colors ─────────────────────────────────────
const LOG_COLORS = {
  info: '#8c8c8c',
  error: '#ff4d4f',
  data: '#1890ff',
  success: '#52c41a',
  warning: '#faad14',
}

// ─── Status config ───────────────────────────────────────
const STATUS_CONFIG = {
  idle: { color: '#d9d9d9', text: '未连接', pulse: false },
  detecting: { color: '#faad14', text: '探测中', pulse: true },
  reading: { color: '#1890ff', text: '读取中', pulse: true },
  done: { color: '#52c41a', text: '完成', pulse: false },
  error: { color: '#ff4d4f', text: '错误', pulse: false },
}

export default function Addequip() {
  // ─── State ─────────────────────────────────────────────
  const [status, setStatus] = useState('idle')
  const [logs, setLogs] = useState([])
  const [macResults, setMacResults] = useState([])
  const [detectResults, setDetectResults] = useState([])
  const [isReading, setIsReading] = useState(false)

  // Device binding state (per MAC result)
  const [checkedList, setCheckedList] = useState({})
  const [remark, setRemark] = useState({})
  const [dateObj, setDateObj] = useState({})
  const [macStorage, setMacStorage] = useState({})

  const logContainerRef = useRef(null)
  const wsRef = useRef(null)

  // ─── Add log helper ────────────────────────────────────
  const addLog = useCallback((msg, type = 'info') => {
    setLogs(prev => {
      const next = [...prev, { message: msg, type, timestamp: Date.now() }]
      return next.length > 200 ? next.slice(-200) : next
    })
  }, [])

  // ─── Auto-scroll logs ─────────────────────────────────
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [logs])

  // ─── WebSocket connection ──────────────────────────────
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
      wsRef.current = ws

      ws.onopen = () => {
        reconnectAttempts = 0
      }

      ws.onmessage = async (e) => {
        try {
          let data
          if (e.data instanceof Blob) {
            // MessagePack binary mode: decode Blob -> ArrayBuffer -> Object
            const arrayBuffer = await e.data.arrayBuffer()
            data = msgpackDecode(new Uint8Array(arrayBuffer))
          } else {
            // JSON text mode
            data = JSON.parse(e.data)
          }

          // MAC reader log
          if (data.macReaderLog) {
            const { message: msg, type } = data.macReaderLog
            addLog(msg, type)
          }

          // MAC reader status update
          if (data.macReaderStatus) {
            const { stage } = data.macReaderStatus
            setStatus(stage)
          }

          // Baud rate detection result
          if (data.macReaderDetect) {
            setDetectResults(prev => [...prev, data.macReaderDetect])
          }

          // MAC read result
          if (data.macReaderResult) {
            const result = data.macReaderResult
            setMacResults(prev => [...prev, result])
            // Auto-fetch device info from server
            fetchDeviceInfo(result)
          }

          // Reading complete
          if (data.macReaderDone) {
            setStatus('done')
            setIsReading(false)
          }
        } catch (err) {
          // ignore parse errors
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
  }, [addLog])

  // ─── Fetch device info from remote server ──────────────
  const fetchDeviceInfo = (result) => {
    const { uniqueId, path } = result
    if (!uniqueId) return

    axios.get(`${serverAddress}/device-manage/device/getDetail/${uniqueId}`)
      .then((res) => {
        if (!res.data.data) {
          setMacStorage(prev => ({ ...prev, [path]: false }))
          return
        }

        const { remarkInfo, typeInfo, expireTime } = res.data.data
        setMacStorage(prev => ({ ...prev, [path]: true }))
        setDateObj(prev => ({ ...prev, [path]: expireTime }))
        setRemark(prev => ({ ...prev, [path]: remarkInfo }))
        try {
          setCheckedList(prev => ({ ...prev, [path]: JSON.parse(typeInfo) }))
        } catch (e) {
          // ignore parse error
        }
      })
      .catch(() => {
        setMacStorage(prev => ({ ...prev, [path]: false }))
      })
  }

  // ─── Reset state helper ────────────────────────────────
  const resetState = () => {
    setIsReading(true)
    setStatus('detecting')
    setLogs([])
    setMacResults([])
    setDetectResults([])
    setMacStorage({})
    setCheckedList({})
    setRemark({})
    setDateObj({})
  }

  // ─── Read MAC from already-connected devices ───────────
  const readMacFromConnected = () => {
    resetState()
    addLog('通过已有连接读取 MAC 地址...', 'info')

    axios.get(`${localAddress}/sendMacConnected`)
      .then((res) => {
        if (res.data.code !== 0) {
          addLog(`错误: ${res.data.msg}`, 'error')
          setStatus('error')
          message.warning(res.data.msg)
        }
      })
      .catch((err) => {
        addLog(`请求失败: ${err.message}`, 'error')
        setStatus('error')
      })
      .finally(() => {
        setIsReading(false)
      })
  }

  // ─── Start MAC reading (standalone, re-open ports) ─────
  const startReadMac = () => {
    resetState()
    addLog('独立模式：自动探测波特率 & 读取 MAC...', 'info')

    axios.get(`${localAddress}/readMacOnly`)
      .then((res) => {
        if (res.data.code !== 0) {
          addLog(`错误: ${res.data.msg}`, 'error')
          setStatus('error')
        }
      })
      .catch((err) => {
        addLog(`请求失败: ${err.message}`, 'error')
        setStatus('error')
      })
      .finally(() => {
        setIsReading(false)
      })
  }

  // ─── One-click connect (legacy) ────────────────────────
  const oneClickConnect = () => {
    addLog('Starting one-click connect...', 'info')
    axios.get(`${localAddress}/connPort`)
      .then((res) => {
        addLog('One-click connect complete', 'success')
      })
      .catch((err) => {
        addLog(`Connect failed: ${err.message}`, 'error')
      })
  }

  // ─── Device binding ────────────────────────────────────
  const onDateChange = (date, dateString, key) => {
    setDateObj(prev => ({ ...prev, [key]: new Date(dateString).getTime() }))
  }

  const onRemarkChange = (e, key) => {
    setRemark(prev => ({ ...prev, [key]: e.target.value }))
  }

  const onTypeChange = (list, key) => {
    setCheckedList(prev => ({ ...prev, [key]: list }))
  }

  const bindEquip = (key, macResult) => {
    const data = {
      uniqueId: macResult.uniqueId,
      version: macResult.version,
      remarkInfo: remark[key] || '',
      typeInfo: JSON.stringify(checkedList[key] || []),
      expireTime: dateObj[key] || 0,
      updatedTime: Date.now(),
    }

    axios.post(`${serverAddress}/device-manage/device/add`, data)
      .then((res) => {
        if (res.data.code === 0) {
          message.success('绑定成功')
          setMacStorage(prev => ({ ...prev, [key]: true }))
        } else {
          message.error('绑定失败')
        }
      })
      .catch(() => message.error('绑定失败'))
  }

  const changeEquip = (key, macResult) => {
    const data = {
      uniqueId: macResult.uniqueId,
      version: macResult.version,
      remarkInfo: remark[key] || '',
      typeInfo: JSON.stringify(checkedList[key] || []),
      expireTime: dateObj[key] || 0,
      updatedTime: Date.now(),
    }

    axios.post(`${serverAddress}/device-manage/device/edit`, data)
      .then((res) => {
        if (res.data.code === 0) {
          message.success('修改成功')
        } else {
          message.error('修改失败')
        }
      })
      .catch(() => message.error('修改失败'))
  }

  // ─── Copy to clipboard ─────────────────────────────────
  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      message.success('已复制到剪贴板')
    }).catch(() => {
      message.error('复制失败')
    })
  }

  // ─── Render ────────────────────────────────────────────
  const statusConfig = STATUS_CONFIG[status] || STATUS_CONFIG.idle

  return (
    <div className="mac-reader-page">
      {/* Header */}
      <div className="mac-reader-header">
        <h2>MAC 地址读取</h2>
        <div className="header-right">
          {detectResults.length > 0 && (
            <span className="device-badges">
              {detectResults.map((d, i) => {
                const dc = DEVICE_COLORS[d.deviceClass] || DEVICE_COLORS.unknown
                return (
                  <Tag key={i} color={dc.color}>
                    {dc.label} ({d.baudRate})
                  </Tag>
                )
              })}
            </span>
          )}
          <span className="status-indicator" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              className={statusConfig.pulse ? 'status-dot pulse' : 'status-dot'}
              style={{ backgroundColor: statusConfig.color }}
            />
            <span style={{ color: statusConfig.color, fontSize: 13 }}>{statusConfig.text}</span>
          </span>
        </div>
      </div>

      <div className="mac-reader-body">
        {/* Left Panel — Controls */}
        <div className="mac-reader-left">
          <Card size="small" title="串口连接" className="control-card">
            <div className="control-section">
              <div className="baud-list">
                <div className="baud-label">探测波特率列表：</div>
                <div className="baud-tags">
                  <Tag>921600 - 手套</Tag>
                  <Tag>1000000 - 坐垫</Tag>
                  <Tag>3000000 - 脚垫</Tag>
                </div>
              </div>
              <Button
                type="primary"
                block
                loading={isReading}
                onClick={readMacFromConnected}
                style={{ marginTop: 12 }}
              >
                {isReading ? '读取中...' : '读取已连接设备 MAC'}
              </Button>
              <Button
                block
                loading={isReading}
                onClick={startReadMac}
                style={{ marginTop: 8 }}
              >
                独立探测 & 读取 MAC（未连接时用）
              </Button>
            </div>
          </Card>

          <Card size="small" title="使用说明" className="control-card" style={{ marginTop: 12 }}>
            <div className="help-text">
              <p><strong>方式一（推荐）：</strong></p>
              <p>1. 先在主页面点击“一键连接”</p>
              <p>2. 连接成功后进入此页面</p>
              <p>3. 点击“读取已连接设备 MAC”</p>
              <p style={{ marginTop: 8 }}><strong>方式二（未连接时）：</strong></p>
              <p>1. 将设备通过 USB 连接到电脑</p>
              <p>2. 点击“独立探测 & 读取 MAC”</p>
              <p>3. 等待自动探测波特率和读取 MAC</p>
            </div>
          </Card>
        </div>

        {/* Right Panel — Results & Logs */}
        <div className="mac-reader-right">
          {/* Detection Result Banner */}
          {detectResults.length > 0 && (
            <div className="detect-banner">
              {detectResults.map((d, i) => {
                const dc = DEVICE_COLORS[d.deviceClass] || DEVICE_COLORS.unknown
                return (
                  <div key={i} className="detect-item" style={{ borderColor: dc.border, backgroundColor: dc.bg }}>
                    <span className="detect-icon" style={{ color: dc.color }}>●</span>
                    <span className="detect-text">
                      <strong>{d.path}</strong> — {dc.label} (波特率: {d.baudRate})
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          {/* MAC Result Cards */}
          {macResults.length > 0 && (
            <div className="mac-results-section">
              <h3>读取结果</h3>
              <div className="mac-cards">
                {macResults.map((result, i) => {
                  const dc = DEVICE_COLORS[result.deviceClass] || DEVICE_COLORS.unknown
                  const key = result.path

                  return (
                    <Card
                      key={i}
                      size="small"
                      className="mac-card"
                      style={{ borderLeft: `3px solid ${dc.color}` }}
                    >
                      <div className="mac-card-header">
                        <Tag color={dc.color}>{dc.label}</Tag>
                        <span className="mac-port">{result.path}</span>
                        <span className="mac-baud">@ {result.baudRate}</span>
                      </div>

                      <div className="mac-card-body">
                        <div className="mac-field">
                          <span className="mac-label">Unique ID:</span>
                          <Tooltip title="点击复制">
                            <span
                              className="mac-value copyable"
                              onClick={() => copyToClipboard(result.uniqueId)}
                            >
                              {result.uniqueId}
                            </span>
                          </Tooltip>
                        </div>
                        {result.version && (
                          <div className="mac-field">
                            <span className="mac-label">Version:</span>
                            <span className="mac-value">{result.version}</span>
                          </div>
                        )}
                      </div>

                      <Divider style={{ margin: '8px 0' }} />

                      {/* Device Binding Form */}
                      <div className="mac-bind-form">
                        <div className="bind-row">
                          <span className="bind-label">设备备注:</span>
                          <Input
                            size="small"
                            placeholder="备注"
                            value={remark[key] || ''}
                            onChange={(e) => onRemarkChange(e, key)}
                          />
                        </div>
                        <div className="bind-row">
                          <span className="bind-label">截止日期:</span>
                          <DatePicker
                            size="small"
                            value={dateObj[key] ? dayjs(dateObj[key]) : null}
                            onChange={(date, dateString) => onDateChange(date, dateString, key)}
                          />
                        </div>
                        <div className="bind-row">
                          <span className="bind-label">设备型号:</span>
                          <CheckboxGroup
                            options={plainOptions}
                            value={checkedList[key] || []}
                            onChange={(list) => onTypeChange(list, key)}
                          />
                        </div>
                        <div className="bind-actions">
                          {macStorage[key] ? (
                            <Button size="small" type="primary" onClick={() => changeEquip(key, result)}>
                              修改设备
                            </Button>
                          ) : (
                            <Button size="small" type="primary" onClick={() => bindEquip(key, result)}>
                              绑定设备
                            </Button>
                          )}
                        </div>
                      </div>
                    </Card>
                  )
                })}
              </div>
            </div>
          )}

          {/* Communication Logs */}
          <div className="log-section">
            <div className="log-header">
              <h3>通信日志</h3>
              <Button size="small" onClick={() => setLogs([])}>清空</Button>
            </div>
            <div className="log-container" ref={logContainerRef}>
              {logs.length === 0 ? (
                <div className="log-empty">等待操作...</div>
              ) : (
                logs.map((log, i) => (
                  <div key={i} className="log-line" style={{ color: LOG_COLORS[log.type] || LOG_COLORS.info }}>
                    <span className="log-time">
                      [{new Date(log.timestamp).toLocaleTimeString()}]
                    </span>
                    <span className="log-msg">{log.message}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
