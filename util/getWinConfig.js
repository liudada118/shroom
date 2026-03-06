const si = require('systeminformation')
const os = require('os')

/**
 * 获取Device硬件 UUID
 * @returns {Promise<string|null>} Device UUID 或 null
 */
async function getHardwareFingerprint() {
  try {
    const system = await si.system()
    return system.uuid || ''
  } catch (err) {
    console.error('[Util] Hardware info collection failed:', err)
    return null
  }
}

module.exports = {
  getHardwareFingerprint
}
