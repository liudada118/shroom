// preload.js
const { contextBridge, ipcRenderer } = require('electron')

/**
 * 通过 contextBridge 安全地向渲染进程暴露 API
 * 渲染进程可通过 window.electronAPI 访问
 */
contextBridge.exposeInMainWorld('electronAPI', {
  // 平台信息
  platform: process.platform,

  // 文件路径获取
  getPath: (file) => file.path,

  // 选择文件夹对话框
  selectFolder: () => ipcRenderer.invoke('select-folder'),

  // 打开文件
  openPath: (filePath) => ipcRenderer.invoke('open-path', filePath),

  // 在文件管理器中显示文件
  showItemInFolder: (filePath) => ipcRenderer.invoke('show-item-in-folder', filePath),

  // 框选预设持久化 (跨端口/会话稳定保存到 userData 目录)
  readBrushPresets: () => ipcRenderer.invoke('brush-presets-read'),
  writeBrushPresets: (data) => ipcRenderer.invoke('brush-presets-write', data),
})
