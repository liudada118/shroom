import React, { useState, useEffect } from 'react'
import { Button, Input, message, Tag } from 'antd'
import { SaveOutlined, ArrowLeftOutlined } from '@ant-design/icons'
import axios from 'axios'
import { localAddress } from '../../../util/constant'
import './MacConfig.scss'

const STORAGE_KEY = 'shroom_mac_config'

/**
 * 解析输入字符串为设备配置数组
 * 格式: mac地址:类型,mac地址:类型
 * 例如: AA:BB:CC:DD:EE:FF:endi-back,11:22:33:44:55:66:endi-sit
 * 
 * 解析规则：以最后一个冒号为分隔点，前面是 MAC 地址，后面是设备类型
 */
function parseConfigString(str) {
  if (!str || !str.trim()) return []
  const items = str.split(',').map(s => s.trim()).filter(Boolean)
  const result = []
  for (const item of items) {
    const lastColon = item.lastIndexOf(':')
    if (lastColon <= 0) continue
    const mac = item.substring(0, lastColon).trim()
    const type = item.substring(lastColon + 1).trim()
    if (mac && type) {
      result.push({ mac: mac.toUpperCase(), type })
    }
  }
  return result
}

/**
 * 将设备配置数组转为字符串
 */
function configToString(config) {
  if (!config || !Array.isArray(config) || config.length === 0) return ''
  return config.map(d => `${d.mac}:${d.type}`).join(',')
}

/**
 * 从 localStorage 读取 MAC 配置
 */
export function getMacConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const config = JSON.parse(raw)
      if (Array.isArray(config) && config.length > 0) {
        return config
      }
    }
  } catch (e) {
    // ignore
  }
  return null
}

/**
 * 保存 MAC 配置到 localStorage
 */
export function saveMacConfig(config) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
}

/**
 * 检查是否有有效的 MAC 配置
 */
export function hasMacConfig() {
  const config = getMacConfig()
  return config !== null && config.length > 0
}

/**
 * 同步 MAC 配置到后端 serial_cache.json
 * 带重试机制，最多重试 2 次
 */
async function syncToBackend(devices, retries = 2) {
  let lastErr = null
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // 先清空后端缓存
      await axios.post(`${localAddress}/cache/clear`, {}, { timeout: 3000 })

      // 逐个写入
      for (const device of devices) {
        // 根据类型推断 deviceClass
        let deviceClass
        if (device.type.startsWith('endi-') || device.type.startsWith('car-')) {
          deviceClass = 'foot'
        } else if (device.type.startsWith('carY-')) {
          deviceClass = 'carY'
        } else {
          deviceClass = device.type // hand, bed 等
        }

        await axios.post(`${localAddress}/cache/devices`, {
          mac: device.mac.trim().toUpperCase(),
          type: device.type,
          deviceClass: deviceClass,
        }, { timeout: 3000 })
      }

      // 验证写入：读回来检查
      const verifyRes = await axios.get(`${localAddress}/cache/devices`, { timeout: 3000 })
      const cachedDevices = verifyRes.data?.data || {}
      const cachedCount = Object.keys(cachedDevices).length

      if (cachedCount >= devices.length) {
        console.log(`[MacConfig] 后端缓存同步成功，已写入 ${cachedCount} 个设备`)
        return { success: true, count: cachedCount }
      } else {
        console.warn(`[MacConfig] 后端缓存验证不一致：期望 ${devices.length}，实际 ${cachedCount}`)
        lastErr = new Error(`写入验证失败：期望 ${devices.length} 个，实际 ${cachedCount} 个`)
      }
    } catch (err) {
      lastErr = err
      console.warn(`[MacConfig] 后端同步第 ${attempt + 1} 次失败:`, err.message)
      if (attempt < retries) {
        // 等待 500ms 后重试
        await new Promise(r => setTimeout(r, 500))
      }
    }
  }
  return { success: false, error: lastErr }
}

export default function MacConfig({ onBack }) {
  const [inputValue, setInputValue] = useState('')
  const [parsed, setParsed] = useState([])
  const [saving, setSaving] = useState(false)
  const [syncStatus, setSyncStatus] = useState(null) // null | 'success' | 'local-only'

  // 初始化：从 localStorage 加载已有配置
  useEffect(() => {
    const config = getMacConfig()
    if (config && config.length > 0) {
      const str = configToString(config)
      setInputValue(str)
      setParsed(config)
    }
  }, [])

  // 输入变化时实时解析
  const handleInputChange = (e) => {
    const val = e.target.value
    setInputValue(val)
    setParsed(parseConfigString(val))
    setSyncStatus(null)
  }

  // 保存配置
  const handleSave = async () => {
    const devices = parseConfigString(inputValue)
    if (devices.length === 0) {
      message.warning('请输入有效的 MAC 地址配置')
      return
    }

    setSaving(true)
    setSyncStatus(null)
    try {
      // 1. 保存到 localStorage
      saveMacConfig(devices)

      // 2. 同步到后端 serial_cache.json（带重试和验证）
      const result = await syncToBackend(devices)

      if (result.success) {
        message.success(`配置已保存，${result.count} 个设备已同步到本地缓存`)
        setSyncStatus('success')
      } else {
        message.warning('配置已保存到浏览器，但同步到后端缓存失败（后端服务可能未启动），连接设备后将自动重试')
        setSyncStatus('local-only')
        console.error('[MacConfig] 后端同步失败:', result.error?.message)
      }

      if (onBack) {
        setTimeout(() => onBack(), 600)
      }
    } catch (err) {
      message.error('保存失败: ' + err.message)
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
            {onBack && (
              <Button
                type="text"
                icon={<ArrowLeftOutlined style={{ color: '#aaa' }} />}
                onClick={onBack}
                className="back-btn"
              />
            )}
            <h2>设备密钥配置</h2>
          </div>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={handleSave}
            loading={saving}
            className="save-btn"
          >
            保存
          </Button>
        </div>

        {/* 格式提示 */}
        <div className="mac-hint">
          格式：<code>MAC地址:类型,MAC地址:类型</code>
          <br />
          示例：<code>AA:BB:CC:DD:EE:FF:endi-back,11:22:33:44:55:66:endi-sit</code>
          <br />
          <span className="mac-types">
            可用类型：endi-back, endi-sit, carY-back, carY-sit, hand, bed, car-back, car-sit
          </span>
        </div>

        {/* 单输入框 */}
        <Input.TextArea
          className="mac-input"
          value={inputValue}
          onChange={handleInputChange}
          placeholder="请输入设备配置，格式：MAC地址:类型,MAC地址:类型"
          autoSize={{ minRows: 3, maxRows: 8 }}
          spellCheck={false}
        />

        {/* 实时解析预览 */}
        {parsed.length > 0 && (
          <div className="mac-preview">
            <span className="preview-label">已识别 {parsed.length} 个设备：</span>
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

        {/* 同步状态提示 */}
        {syncStatus === 'success' && (
          <div className="mac-sync-status success">已成功同步到本地缓存文件</div>
        )}
        {syncStatus === 'local-only' && (
          <div className="mac-sync-status warning">仅保存到浏览器，后端服务未响应，启动应用后将自动同步</div>
        )}
      </div>
    </div>
  )
}
