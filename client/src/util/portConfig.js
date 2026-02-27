/**
 * 动态端口配置模块
 *
 * 端口获取优先级：
 *   1. window.__PORTS__  —— 生产模式下由 Electron 静态文件服务器注入到 HTML <head> 中
 *   2. REACT_APP_API_PORT / REACT_APP_WS_PORT  —— 开发模式下由 Electron 主进程通过环境变量传入
 *   3. 默认值 19245 / 19999（与 util/portFinder.js 中的 DEFAULT_PORTS 保持一致）
 *
 * 注意：当端口冲突时，Electron 主进程会自动分配新端口并通过上述机制传递给前端，
 *       前端无需手动处理端口冲突。
 */

// 默认端口（与后端 DEFAULT_PORTS 保持一致）
const FALLBACK_API_PORT = 19245
const FALLBACK_WS_PORT = 19999

function getApiPort() {
  // 生产模式：从注入的全局变量读取
  if (window.__PORTS__?.api) {
    return window.__PORTS__.api
  }
  // 开发模式：从 CRA 环境变量读取
  if (process.env.REACT_APP_API_PORT) {
    return parseInt(process.env.REACT_APP_API_PORT, 10)
  }
  // 默认值
  return FALLBACK_API_PORT
}

function getWsPort() {
  if (window.__PORTS__?.ws) {
    return window.__PORTS__.ws
  }
  if (process.env.REACT_APP_WS_PORT) {
    return parseInt(process.env.REACT_APP_WS_PORT, 10)
  }
  return FALLBACK_WS_PORT
}

export const API_PORT = getApiPort()
export const WS_PORT = getWsPort()

export const localAddress = `http://localhost:${API_PORT}`
export const wsAddress = `ws://127.0.0.1:${WS_PORT}`

// 调试输出
if (process.env.NODE_ENV === 'development') {
  console.log(`[PortConfig] API: ${localAddress}, WS: ${wsAddress}`)
}
