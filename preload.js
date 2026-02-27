// preload.js
const { contextBridge } = require('electron')

/**
 * 通过 contextBridge 安全地向渲染进程暴露 API
 * 渲染进程可通过 window.electronAPI 访问
 */
contextBridge.exposeInMainWorld('electronAPI', {
  // 平台信息
  platform: process.platform,

  // 文件路径获取
  getPath: (file) => file.path,
})
