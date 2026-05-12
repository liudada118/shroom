import React, { useState, useEffect } from 'react'
import { Button, Input, message, Tag, Spin } from 'antd'
import { SaveOutlined, ArrowLeftOutlined } from '@ant-design/icons'
import axios from 'axios'
import { useTranslation } from 'react-i18next'
import { localAddress } from '../../../util/constant'
import './MacConfig.scss'

const MAC_CONFIG_COPY = {
  zh: {
    title: '设备密钥配置',
    back: '返回主页',
    save: '保存',
    format: '格式',
    formatValue: 'MAC地址:类型,MAC地址:类型',
    example: '示例',
    availableTypes: '可用类型',
    loading: '加载配置中...',
    placeholder: '请输入设备配置，格式：MAC地址:类型,MAC地址:类型',
    detected: (count) => `已识别 ${count} 个设备：`,
    syncSuccess: '已成功写入本地缓存文件 (serial_cache.json)',
    syncError: '写入失败，请确认后端服务已启动',
    invalidConfig: '请输入有效的 MAC 地址配置',
    invalidConfigDetail: '配置存在错误，请修正后再保存',
    saveSuccess: (count) => `配置已保存，${count} 个设备已写入本地缓存`,
    saveFailed: '保存失败',
    unknownError: '未知错误',
  },
  en: {
    title: 'Device Key Configuration',
    back: 'Back to Main',
    save: 'Save',
    format: 'Format',
    formatValue: 'MAC address:type,MAC address:type',
    example: 'Example',
    availableTypes: 'Available types',
    loading: 'Loading configuration...',
    placeholder: 'Enter device configuration. Format: MAC address:type,MAC address:type',
    detected: (count) => `${count} device${count === 1 ? '' : 's'} detected:`,
    syncSuccess: 'Saved to local cache file (serial_cache.json)',
    syncError: 'Write failed. Please confirm the backend service is running.',
    invalidConfig: 'Please enter a valid MAC address configuration',
    invalidConfigDetail: 'The configuration contains errors. Fix them before saving.',
    saveSuccess: (count) => `Configuration saved. ${count} device${count === 1 ? '' : 's'} written to local cache.`,
    saveFailed: 'Save failed',
    unknownError: 'Unknown error',
  },
}

const getLanguageKey = (language) => String(language || '').toLowerCase().startsWith('en') ? 'en' : 'zh'

const SUPPORTED_DEVICE_TYPES = ['car-back', 'car-sit', 'bed', 'endi-back', 'endi-sit', 'carY-back', 'carY-sit', 'hand']
const CONTINUOUS_MAC_RE = /^[0-9A-F]{12,32}$/
const COLON_MAC_RE = /^([0-9A-F]{2}:){5,15}[0-9A-F]{2}$/

function normalizeMac(mac) {
  return String(mac || '').trim().toUpperCase()
}

function isValidMac(mac) {
  const normalized = normalizeMac(mac)
  return CONTINUOUS_MAC_RE.test(normalized) || COLON_MAC_RE.test(normalized)
}

function inferDeviceClass(type) {
  if (type === 'hand') return 'hand'
  if (type === 'bed') return 'bed'
  if (type.startsWith('carY-')) return 'carY'
  if (type.startsWith('endi-') || type.startsWith('car-')) return 'foot'
  return type
}

function validateConfigString(str) {
  if (!str || !str.trim()) return { devices: [], errors: [] }

  const items = str.split(',').map(s => s.trim()).filter(Boolean)
  const devices = []
  const errors = []
  const seen = new Set()

  items.forEach((item, index) => {
    const lastColon = item.lastIndexOf(':')
    if (lastColon <= 0 || lastColon === item.length - 1) {
      errors.push(`第 ${index + 1} 项格式错误，应为 MAC地址:类型`)
      return
    }

    const mac = normalizeMac(item.substring(0, lastColon))
    const type = item.substring(lastColon + 1).trim()

    if (!isValidMac(mac)) {
      errors.push(`第 ${index + 1} 项 MAC/Unique ID 格式错误：${mac}`)
      return
    }

    if (!SUPPORTED_DEVICE_TYPES.includes(type)) {
      errors.push(`第 ${index + 1} 项设备类型不支持：${type}`)
      return
    }

    if (seen.has(mac)) {
      errors.push(`MAC/Unique ID 重复配置：${mac}`)
      return
    }

    seen.add(mac)
    devices.push({ mac, type, deviceClass: inferDeviceClass(type) })
  })

  return { devices, errors }
}

/**
 * 解析输入字符串为设备配置数组
 * 格式: mac地址:类型,mac地址:类型
 * 例如: AA:BB:CC:DD:EE:FF:endi-back,11:22:33:44:55:66:endi-sit
 * 
 * 解析规则：以最后一个冒号为分隔点，前面是 MAC 地址，后面是设备类型
 */
function parseConfigString(str) {
  return validateConfigString(str).devices
}

/**
 * 将设备配置数组转为字符串
 */
function configToString(config) {
  if (!config || !Array.isArray(config) || config.length === 0) return ''
  return config.map(d => `${d.mac}:${d.type}`).join(',')
}

/**
 * 从后端 serial_cache.json 读取 MAC 配置
 * @returns {Promise<Array|null>} 设备配置数组或 null
 */
export async function getMacConfig() {
  try {
    const res = await axios.get(`${localAddress}/cache/devices`, { timeout: 3000 })
    const devices = res.data?.data || {}
    const entries = Object.entries(devices)
    if (entries.length > 0) {
      return entries.map(([mac, info]) => ({
        mac,
        type: info.type || ''
      }))
    }
  } catch (e) {
    console.warn('[MacConfig] 读取后端缓存失败:', e.message)
  }
  return null
}

/**
 * 检查后端 serial_cache.json 是否有有效的 MAC 配置
 * @returns {Promise<boolean>}
 */
export async function hasMacConfig() {
  const config = await getMacConfig()
  return config !== null && config.length > 0
}

/**
 * 保存 MAC 配置到后端 serial_cache.json
 * 带重试机制，最多重试 2 次
 */
async function saveToBackend(devices, retries = 2) {
  let lastErr = null
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const saveRes = await axios.post(`${localAddress}/cache/devices/bulk`, { devices }, { timeout: 3000 })
      if (saveRes.data?.code !== 0) {
        const serverMessage = saveRes.data?.data?.errors?.[0]?.message || saveRes.data?.message || '设备配置有误'
        lastErr = new Error(serverMessage)
        break
      }

      // 验证写入：读回来检查
      const verifyRes = await axios.get(`${localAddress}/cache/devices`, { timeout: 3000 })
      const cachedDevices = verifyRes.data?.data || {}
      const cachedCount = Object.keys(cachedDevices).length

      if (cachedCount >= devices.length) {
        console.log(`[MacConfig] 后端缓存写入成功，已写入 ${cachedCount} 个设备`)
        return { success: true, count: cachedCount }
      } else {
        console.warn(`[MacConfig] 后端缓存验证不一致：期望 ${devices.length}，实际 ${cachedCount}`)
        lastErr = new Error(`写入验证失败：期望 ${devices.length} 个，实际 ${cachedCount} 个`)
      }
    } catch (err) {
      lastErr = err
      console.warn(`[MacConfig] 后端写入第 ${attempt + 1} 次失败:`, err.message)
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 500))
      }
    }
  }
  return { success: false, error: lastErr }
}

export default function MacConfig({ onBack, showBackButton = Boolean(onBack) }) {
  const { i18n } = useTranslation()
  const copy = MAC_CONFIG_COPY[getLanguageKey(i18n.language || localStorage.getItem('language'))]
  const [inputValue, setInputValue] = useState('')
  const [parsed, setParsed] = useState([])
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [syncStatus, setSyncStatus] = useState(null) // null | 'success' | 'error'
  const [validationErrors, setValidationErrors] = useState([])

  // 初始化：从后端 serial_cache.json 加载已有配置
  useEffect(() => {
    let cancelled = false
    async function loadConfig() {
      setLoading(true)
      try {
        const config = await getMacConfig()
        if (!cancelled && config && config.length > 0) {
          const str = configToString(config)
          const validation = validateConfigString(str)
          setInputValue(str)
          setParsed(validation.devices)
          setValidationErrors(validation.errors)
        }
      } catch (e) {
        console.warn('[MacConfig] 加载配置失败:', e.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadConfig()
    return () => { cancelled = true }
  }, [])

  // 输入变化时实时解析
  const handleInputChange = (e) => {
    const val = e.target.value
    const validation = validateConfigString(val)
    setInputValue(val)
    setParsed(validation.devices)
    setValidationErrors(validation.errors)
    setSyncStatus(null)
  }

  // 保存配置到后端 serial_cache.json
  const handleSave = async () => {
    const validation = validateConfigString(inputValue)
    setParsed(validation.devices)
    setValidationErrors(validation.errors)

    if (validation.errors.length > 0) {
      message.warning(validation.errors[0] || copy.invalidConfigDetail)
      return
    }

    if (validation.devices.length === 0) {
      message.warning(copy.invalidConfig)
      return
    }

    setSaving(true)
    setSyncStatus(null)
    try {
      const result = await saveToBackend(validation.devices)

      if (result.success) {
        message.success(copy.saveSuccess(result.count))
        setSyncStatus('success')
      } else {
        message.error(`${copy.saveFailed}: ${result.error?.message || copy.unknownError}`)
        setSyncStatus('error')
        return
      }

      if (onBack) {
        setTimeout(() => onBack(), 600)
      }
    } catch (err) {
      message.error(`${copy.saveFailed}: ${err.message}`)
      setSyncStatus('error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mac-config-dark">
      <div className="mac-config-inner">
        {/* 标题栏 */}
        <div className="mac-header">
          <div className="mac-header-left">
            {showBackButton && onBack && (
              <Button
                type="text"
                icon={<ArrowLeftOutlined style={{ color: '#aaa' }} />}
                onClick={onBack}
                className="back-btn"
              >
                {copy.back}
              </Button>
            )}
            <h2>{copy.title}</h2>
          </div>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={handleSave}
            loading={saving}
            className="save-btn"
          >
            {copy.save}
          </Button>
        </div>

        {/* 格式提示 */}
        <div className="mac-hint">
          {copy.format}: <code>{copy.formatValue}</code>
          <br />
          {copy.example}: <code>AA:BB:CC:DD:EE:FF:endi-back,11:22:33:44:55:66:endi-sit</code>
          <br />
          <span className="mac-types">
            {copy.availableTypes}: endi-back, endi-sit, carY-back, carY-sit, hand, bed, car-back, car-sit
          </span>
        </div>

        {/* 单输入框 */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <Spin tip={copy.loading} />
          </div>
        ) : (
          <Input.TextArea
            className="mac-input"
            value={inputValue}
            onChange={handleInputChange}
            placeholder={copy.placeholder}
            autoSize={{ minRows: 3, maxRows: 8 }}
            spellCheck={false}
          />
        )}

        {/* 实时解析预览 */}
        {parsed.length > 0 && (
          <div className="mac-preview">
            <span className="preview-label">{copy.detected(parsed.length)}</span>
            <div className="preview-tags">
              {parsed.map((d, i) => (
                <Tag key={i} className="preview-tag">
                  <span className="tag-type">{d.type}</span>
                  <span className="tag-mac">{d.mac}</span>
                </Tag>
              ))}
            </div>
          </div>
        )}

        {validationErrors.length > 0 && (
          <div className="mac-validation-errors">
            {validationErrors.map((error, index) => (
              <div key={index}>{error}</div>
            ))}
          </div>
        )}

        {/* 同步状态提示 */}
        {syncStatus === 'success' && (
          <div className="mac-sync-status success">{copy.syncSuccess}</div>
        )}
        {syncStatus === 'error' && (
          <div className="mac-sync-status error">{copy.syncError}</div>
        )}
      </div>
    </div>
  )
}
