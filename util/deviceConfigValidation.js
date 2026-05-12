const constantObj = require('./config')

const SUPPORTED_DEVICE_TYPES = Array.from(new Set([
  ...Object.values(constantObj.typeConfig || {}),
  'hand',
]))

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

function createValidationError(code, message, index = null) {
  return { code, message, index }
}

function validateDeviceList(devices) {
  if (!Array.isArray(devices) || devices.length === 0) {
    return {
      valid: false,
      devices: [],
      errors: [createValidationError('EMPTY_CONFIG', '请输入有效的 MAC 地址配置')],
    }
  }

  const seen = new Set()
  const normalizedDevices = []
  const errors = []

  devices.forEach((device, index) => {
    const mac = normalizeMac(device?.mac)
    const type = String(device?.type || '').trim()

    if (!mac || !type) {
      errors.push(createValidationError('INVALID_ITEM', `第 ${index + 1} 项缺少 MAC 或设备类型`, index))
      return
    }

    if (!isValidMac(mac)) {
      errors.push(createValidationError('INVALID_MAC', `第 ${index + 1} 项 MAC/Unique ID 格式错误：${mac}`, index))
      return
    }

    if (!SUPPORTED_DEVICE_TYPES.includes(type)) {
      errors.push(createValidationError('INVALID_TYPE', `第 ${index + 1} 项设备类型不支持：${type}`, index))
      return
    }

    if (seen.has(mac)) {
      errors.push(createValidationError('DUPLICATE_MAC', `MAC/Unique ID 重复配置：${mac}`, index))
      return
    }

    seen.add(mac)
    normalizedDevices.push({
      mac,
      type,
      deviceClass: device?.deviceClass || inferDeviceClass(type),
      alias: String(device?.alias || '').trim(),
    })
  })

  return {
    valid: errors.length === 0,
    devices: normalizedDevices,
    errors,
  }
}

function validateDeviceAgainstCache(device, cacheDevices = {}) {
  const result = validateDeviceList([device])
  if (!result.valid) return result

  const normalized = result.devices[0]
  const existing = cacheDevices[normalized.mac]
  if (existing?.type && existing.type !== normalized.type) {
    return {
      valid: false,
      devices: [],
      errors: [createValidationError(
        'MAC_TYPE_CONFLICT',
        `MAC/Unique ID ${normalized.mac} 已配置为 ${existing.type}，不能重复配置为 ${normalized.type}`,
        0
      )],
    }
  }

  return result
}

module.exports = {
  SUPPORTED_DEVICE_TYPES,
  normalizeMac,
  isValidMac,
  inferDeviceClass,
  validateDeviceList,
  validateDeviceAgainstCache,
}
