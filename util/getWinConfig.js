const si = require('systeminformation')
const os = require('os')

/**
 * 获取设备硬件 UUID
 * @returns {Promise<string|null>} 设备 UUID 或 null
 */
async function getHardwareFingerprint() {
  try {
    const system = await si.system()
    return system.uuid || ''
  } catch (err) {
    console.error('[Util] 采集硬件信息失败:', err)
    return null
  }
}

module.exports = {
  getHardwareFingerprint
}
