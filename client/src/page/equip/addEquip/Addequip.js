import { Button, Checkbox, DatePicker, Input, message, Tag, Card, Tooltip, Badge, Divider, Space, Select } from 'antd'
import axios from 'axios'
import React, { useEffect, useState, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { decode as msgpackDecode } from '@msgpack/msgpack'
import customParseFormat from 'dayjs/plugin/customParseFormat'
import dayjs from 'dayjs'
import { serverAddress, localAddress, wsAddress } from '../../../util/constant'
import './index.scss'

dayjs.extend(customParseFormat)
const dateFormat = 'YYYY-MM-DD'
const CheckboxGroup = Checkbox.Group
const plainOptions = ['hand', 'bed', 'car-back', 'car-sit', 'endi-back', 'endi-sit', 'carY-back', 'carY-sit']

// ─── Device class colors & labels ────────────────────────
const DEVICE_COLORS = {
  hand: { color: '#722ed1', bg: '#f9f0ff', border: '#d3adf7', labelKey: 'deviceHand' },
  sit: { color: '#1890ff', bg: '#e6f7ff', border: '#91d5ff', labelKey: 'deviceSeat' },
  foot: { color: '#52c41a', bg: '#f6ffed', border: '#b7eb8f', labelKey: 'deviceFoot' },
  unknown: { color: '#8c8c8c', bg: '#fafafa', border: '#d9d9d9', labelKey: 'deviceUnknown' },
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
  idle: { color: '#d9d9d9', textKey: 'statusDisconnected', pulse: false },
  detecting: { color: '#faad14', textKey: 'statusDetecting', pulse: true },
  reading: { color: '#1890ff', textKey: 'statusReading', pulse: true },
  done: { color: '#52c41a', textKey: 'statusDone', pulse: false },
  error: { color: '#ff4d4f', textKey: 'statusError', pulse: false },
}

export default function Addequip() {
  const { t } = useTranslation()
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
  const getDeviceLabel = useCallback((deviceClass) => {
    const dc = DEVICE_COLORS[deviceClass] || DEVICE_COLORS.unknown
    return t(dc.labelKey)
  }, [t])

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
    addLog(t('readingConnectedMac'), 'info')

    axios.get(`${localAddress}/sendMacConnected`)
      .then((res) => {
        if (res.data.code !== 0) {
          addLog(`${t('error')}: ${res.data.msg}`, 'error')
          setStatus('error')
          message.warning(res.data.msg)
        }
      })
      .catch((err) => {
        addLog(`${t('requestFailed')}: ${err.message}`, 'error')
        setStatus('error')
      })
      .finally(() => {
        setIsReading(false)
      })
  }

  // ─── Start MAC reading (standalone, re-open ports) ─────
  const startReadMac = () => {
    resetState()
    addLog(t('standaloneDetectingMac'), 'info')

    axios.get(`${localAddress}/readMacOnly`)
      .then((res) => {
        if (res.data.code !== 0) {
          addLog(`${t('error')}: ${res.data.msg}`, 'error')
          setStatus('error')
        }
      })
      .catch((err) => {
        addLog(`${t('requestFailed')}: ${err.message}`, 'error')
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
          message.success(t('bindSuccess'))
          setMacStorage(prev => ({ ...prev, [key]: true }))
        } else {
          message.error(t('bindFailed'))
        }
      })
      .catch(() => message.error(t('bindFailed')))
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
          message.success(t('modifySuccess'))
        } else {
          message.error(t('modifyFailed'))
        }
      })
      .catch(() => message.error(t('modifyFailed')))
  }

  // ─── Copy to clipboard ─────────────────────────────────
  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      message.success(t('copiedToClipboard'))
    }).catch(() => {
      message.error(t('copyFailed'))
    })
  }

  // ─── Render ────────────────────────────────────────────
  const statusConfig = STATUS_CONFIG[status] || STATUS_CONFIG.idle

  return (
    <div className="mac-reader-page">
      {/* Header */}
      <div className="mac-reader-header">
        <h2>{t('macReaderTitle')}</h2>
        <div className="header-right">
          {detectResults.length > 0 && (
            <span className="device-badges">
              {detectResults.map((d, i) => {
                const dc = DEVICE_COLORS[d.deviceClass] || DEVICE_COLORS.unknown
                return (
                  <Tag key={i} color={dc.color}>
                    {getDeviceLabel(d.deviceClass)} ({d.baudRate})
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
            <span style={{ color: statusConfig.color, fontSize: 13 }}>{t(statusConfig.textKey)}</span>
          </span>
        </div>
      </div>

      <div className="mac-reader-body">
        {/* Left Panel — Controls */}
        <div className="mac-reader-left">
          <Card size="small" title={t('serialConnection')} className="control-card">
            <div className="control-section">
              <div className="baud-list">
                <div className="baud-label">{t('baudRateDetectList')}</div>
                <div className="baud-tags">
                  <Tag>921600 - {t('deviceHand')}</Tag>
                  <Tag>1000000 - {t('deviceSeat')}</Tag>
                  <Tag>3000000 - {t('deviceFoot')}</Tag>
                </div>
              </div>
              <Button
                type="primary"
                block
                loading={isReading}
                onClick={readMacFromConnected}
                style={{ marginTop: 12 }}
              >
                {isReading ? t('reading') : t('readConnectedMac')}
              </Button>
              <Button
                block
                loading={isReading}
                onClick={startReadMac}
                style={{ marginTop: 8 }}
              >
                {t('standaloneReadMac')}
              </Button>
            </div>
          </Card>

          <Card size="small" title={t('instructions')} className="control-card" style={{ marginTop: 12 }}>
            <div className="help-text">
              <p><strong>{t('methodRecommended')}</strong></p>
              <p>{t('macHelpStep1')}</p>
              <p>{t('macHelpStep2')}</p>
              <p>{t('macHelpStep3')}</p>
              <p style={{ marginTop: 8 }}><strong>{t('methodStandalone')}</strong></p>
              <p>{t('macHelpStandalone1')}</p>
              <p>{t('macHelpStandalone2')}</p>
              <p>{t('macHelpStandalone3')}</p>
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
                      <strong>{d.path}</strong> — {getDeviceLabel(d.deviceClass)} ({t('baudRate')}: {d.baudRate})
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          {/* MAC Result Cards */}
          {macResults.length > 0 && (
            <div className="mac-results-section">
              <h3>{t('readResults')}</h3>
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
                        <Tag color={dc.color}>{getDeviceLabel(result.deviceClass)}</Tag>
                        <span className="mac-port">{result.path}</span>
                        <span className="mac-baud">@ {result.baudRate}</span>
                      </div>

                      <div className="mac-card-body">
                        <div className="mac-field">
                          <span className="mac-label">Unique ID:</span>
                          <Tooltip title={t('clickToCopy')}>
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
                          <span className="bind-label">{t('deviceRemark')}:</span>
                          <Input
                            size="small"
                            placeholder={t('remark')}
                            value={remark[key] || ''}
                            onChange={(e) => onRemarkChange(e, key)}
                          />
                        </div>
                        <div className="bind-row">
                          <span className="bind-label">{t('expireDate')}:</span>
                          <DatePicker
                            size="small"
                            value={dateObj[key] ? dayjs(dateObj[key]) : null}
                            onChange={(date, dateString) => onDateChange(date, dateString, key)}
                          />
                        </div>
                        <div className="bind-row">
                          <span className="bind-label">{t('deviceModel')}:</span>
                          <CheckboxGroup
                            options={plainOptions}
                            value={checkedList[key] || []}
                            onChange={(list) => onTypeChange(list, key)}
                          />
                        </div>
                        <div className="bind-actions">
                          {macStorage[key] ? (
                            <Button size="small" type="primary" onClick={() => changeEquip(key, result)}>
                              {t('modifyDevice')}
                            </Button>
                          ) : (
                            <Button size="small" type="primary" onClick={() => bindEquip(key, result)}>
                              {t('bindDevice')}
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
              <h3>{t('communicationLogs')}</h3>
              <Button size="small" onClick={() => setLogs([])}>{t('clear')}</Button>
            </div>
            <div className="log-container" ref={logContainerRef}>
              {logs.length === 0 ? (
                <div className="log-empty">{t('waitingOperation')}</div>
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
