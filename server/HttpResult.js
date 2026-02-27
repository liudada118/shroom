/**
 * 统一的 HTTP 响应格式
 */
class HttpResult {
  /**
   * @param {number} code 状态码 (0=成功, 非0=失败)
   * @param {any} data 响应数据
   * @param {string} message 响应消息
   */
  constructor(code, data, message) {
    this.code = code
    this.data = data
    this.message = message
  }

  static success(data, message = 'success') {
    return new HttpResult(0, data, message)
  }

  static error(message = 'error', code = 1) {
    return new HttpResult(code, {}, message)
  }
}

module.exports = HttpResult
