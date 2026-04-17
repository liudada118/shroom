import React, { useState, useEffect } from 'react'
import { Button, Input, Select, Card, message, Tag, Popconfirm, Empty, Tooltip } from 'antd'
import { PlusOutlined, DeleteOutlined, SaveOutlined, ArrowLeftOutlined, InfoCircleOutlined } from '@ant-design/icons'
import axios from 'axios'
import { localAddress } from '../../../util/constant'
import './MacConfig.scss'

const STORAGE_KEY = 'shroom_mac_config'

// 设备类型选项
const DEVICE_TYPE_OPTIONS = [
  { label: '汽车靠背', value: 'endi-back' },
  { label: '汽车坐垫', value: 'endi-sit' },
  { label: '汽车Y靠背', value: 'carY-back' },
  { label: '汽车Y坐垫', value: 'carY-sit' },
  { label: '手套', value: 'hand' },
  { label: '床垫', value: 'bed' },
  { label: '脚垫-靠背', value: 'car-back' },
  { label: '脚垫-坐垫', value: 'car-sit' },
]

// 设备类型颜色映射
const TYPE_COLORS = {
  'endi-back': '#1890ff',
  'endi-sit': '#52c41a',
  'carY-back': '#722ed1',
  'carY-sit': '#eb2f96',
  'hand': '#fa8c16',
  'bed': '#13c2c2',
  'car-back': '#2f54eb',
  'car-sit': '#a0d911',
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
  const [devices, setDevices] = useState([])
  const [saving, setSaving] = useState(false)

  // 初始化：从 localStorage 加载已有配置
  useEffect(() => {
    const config = getMacConfig()
    if (config && config.length > 0) {
      setDevices(config)
    } else {
      // 默认添加两行（靠背 + 坐垫）
      setDevices([
        { mac: '', type: 'endi-back', alias: '' },
        { mac: '', type: 'endi-sit', alias: '' },
      ])
    }
  }, [])

  // 添加设备
  const addDevice = () => {
    setDevices(prev => [...prev, { mac: '', type: 'endi-back', alias: '' }])
  }

  // 删除设备
  const removeDevice = (index) => {
    setDevices(prev => prev.filter((_, i) => i !== index))
  }

  // 更新设备字段
  const updateDevice = (index, field, value) => {
    setDevices(prev => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value }
      return next
    })
  }

  // 保存配置
  const handleSave = async () => {
    // 验证
    const validDevices = devices.filter(d => d.mac.trim())
    if (validDevices.length === 0) {
      message.warning('请至少输入一个 MAC 地址')
      return
    }

    // 检查 MAC 格式（宽松：允许冒号/横线/无分隔）
    for (let i = 0; i < validDevices.length; i++) {
      const mac = validDevices[i].mac.trim()
      if (mac.length < 4) {
        message.warning(`第 ${i + 1} 行 MAC 地址格式不正确`)
        return
      }
    }

    setSaving(true)
    try {
      // 1. 保存到 localStorage
      saveMacConfig(validDevices)

      // 2. 同步到后端 serial_cache.json（让后端 resolveDeviceTypeLocal 能用）
      try {
        // 先清空后端缓存
        await axios.post(`${localAddress}/cache/clear`)
        // 逐个写入
        for (const device of validDevices) {
          const deviceClass = device.type.includes('-')
            ? device.type.split('-')[0] === 'endi' ? 'foot' : device.type.split('-')[0]
            : device.type
          await axios.post(`${localAddress}/cache/devices`, {
            mac: device.mac.trim().toUpperCase(),
            type: device.type,
            deviceClass: deviceClass,
            alias: device.alias || '',
          })
        }
      } catch (err) {
        console.warn('同步到后端缓存失败（不影响本地配置）:', err.message)
      }

      message.success('MAC 地址配置已保存')

      // 如果有 onBack 回调，保存后自动返回主页
      if (onBack) {
        setTimeout(() => onBack(), 500)
      }
    } catch (err) {
      message.error('保存失败: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  // 获取设备类型的中文标签
  const getTypeLabel = (type) => {
    const opt = DEVICE_TYPE_OPTIONS.find(o => o.value === type)
    return opt ? opt.label : type
  }

  return (
    <div className="mac-config-page">
      <div className="mac-config-header">
        <div className="header-left">
          {onBack && (
            <Button
              type="text"
              icon={<ArrowLeftOutlined />}
              onClick={onBack}
              className="back-btn"
            >
              返回
            </Button>
          )}
          <h2>设备 MAC 地址配置</h2>
        </div>
        <div className="header-right">
          <Tooltip title="MAC 地址用于识别传感器设备类型，配置保存在本地">
            <InfoCircleOutlined style={{ color: '#8c8c8c', fontSize: 16, marginRight: 12 }} />
          </Tooltip>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={handleSave}
            loading={saving}
          >
            保存配置
          </Button>
        </div>
      </div>

      <div className="mac-config-tip">
        <InfoCircleOutlined style={{ marginRight: 8 }} />
        请输入传感器设备的 MAC 地址并选择对应的设备类型。配置将保存在本地，连接设备时自动识别。
      </div>

      <div className="mac-config-body">
        {devices.length === 0 ? (
          <Empty
            description="暂无设备配置"
            style={{ padding: '60px 0' }}
          >
            <Button type="primary" icon={<PlusOutlined />} onClick={addDevice}>
              添加设备
            </Button>
          </Empty>
        ) : (
          <>
            <div className="device-list">
              {devices.map((device, index) => (
                <Card
                  key={index}
                  size="small"
                  className="device-card"
                  style={{ borderLeft: `3px solid ${TYPE_COLORS[device.type] || '#d9d9d9'}` }}
                >
                  <div className="device-card-row">
                    <div className="device-index">
                      <Tag color={TYPE_COLORS[device.type] || '#d9d9d9'}>
                        {index + 1}
                      </Tag>
                    </div>

                    <div className="device-field">
                      <span className="field-label">MAC 地址</span>
                      <Input
                        placeholder="如: AA:BB:CC:DD:EE:FF"
                        value={device.mac}
                        onChange={(e) => updateDevice(index, 'mac', e.target.value)}
                        style={{ width: 220 }}
                        allowClear
                      />
                    </div>

                    <div className="device-field">
                      <span className="field-label">设备类型</span>
                      <Select
                        value={device.type}
                        onChange={(val) => updateDevice(index, 'type', val)}
                        options={DEVICE_TYPE_OPTIONS}
                        style={{ width: 150 }}
                      />
                    </div>

                    <div className="device-field">
                      <span className="field-label">备注</span>
                      <Input
                        placeholder="可选"
                        value={device.alias}
                        onChange={(e) => updateDevice(index, 'alias', e.target.value)}
                        style={{ width: 150 }}
                      />
                    </div>

                    <Popconfirm
                      title="确定删除该设备？"
                      onConfirm={() => removeDevice(index)}
                      okText="确定"
                      cancelText="取消"
                    >
                      <Button
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        className="delete-btn"
                      />
                    </Popconfirm>
                  </div>
                </Card>
              ))}
            </div>

            <Button
              type="dashed"
              icon={<PlusOutlined />}
              onClick={addDevice}
              className="add-device-btn"
              block
            >
              添加设备
            </Button>
          </>
        )}
      </div>

      {/* 已配置设备摘要 */}
      {devices.filter(d => d.mac.trim()).length > 0 && (
        <div className="mac-config-summary">
          <span className="summary-label">已配置 {devices.filter(d => d.mac.trim()).length} 个设备：</span>
          <div className="summary-tags">
            {devices.filter(d => d.mac.trim()).map((d, i) => (
              <Tag key={i} color={TYPE_COLORS[d.type] || '#d9d9d9'}>
                {getTypeLabel(d.type)} - {d.mac.trim().substring(0, 11)}...
              </Tag>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
