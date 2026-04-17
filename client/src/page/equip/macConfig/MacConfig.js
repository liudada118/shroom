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
 */
function parseConfigString(str) {
  if (!str || !str.trim()) return []
  const items = str.split(',').map(s => s.trim()).filter(Boolean)
  const result = []
  for (const item of items) {
    // 从最后一个冒号分割（因为 MAC 地址本身含冒号）
    const lastColon = item.lastIndexOf(':')
    if (lastColon <= 0) continue
    const mac = item.substring(0, lastColon).trim()
    const type = item.substring(lastColon + 1).trim()
    if (mac && type) {
      result.push({ mac, type })
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

export default function MacConfig({ onBack }) {
  const [inputValue, setInputValue] = useState('')
  const [parsed, setParsed] = useState([])
  const [saving, setSaving] = useState(false)

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
  }

  // 保存配置
  const handleSave = async () => {
    const devices = parseConfigString(inputValue)
    if (devices.length === 0) {
      message.warning('请输入有效的 MAC 地址配置')
      return
    }

    setSaving(true)
    try {
      // 1. 保存到 localStorage
      saveMacConfig(devices)

      // 2. 同步到后端 serial_cache.json
      try {
        await axios.post(`${localAddress}/cache/clear`)
        for (const device of devices) {
          const deviceClass = device.type.includes('-')
            ? device.type.split('-')[0] === 'endi' ? 'foot' : device.type.split('-')[0]
            : device.type
          await axios.post(`${localAddress}/cache/devices`, {
            mac: device.mac.trim().toUpperCase(),
            type: device.type,
            deviceClass: deviceClass,
          })
        }
      } catch (err) {
        console.warn('同步到后端缓存失败（不影响本地配置）:', err.message)
      }

      message.success('配置已保存')

      if (onBack) {
        setTimeout(() => onBack(), 400)
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
      </div>
    </div>
  )
}
