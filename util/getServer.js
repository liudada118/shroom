const { default: axios } = require('axios')
const { backendAddress } = require('./config')

/**
 * 通过设备 UUID 从服务器查询授权密钥
 * @param {string} uuid 设备 UUID
 * @returns {Promise<any>} 授权信息
 */
async function getKeyfromWinuuid(uuid) {
  // TODO: 启用远程授权校验后取消注释
  // const response = await axios.get(`${backendAddress}/getKey?uuid=${uuid}`)
  // return response.data
  return 1
}

module.exports = {
  getKeyfromWinuuid
}
