/**
 * 轻量级日志模块
 * 
 * 统一日志格式，支持日志级别控制
 * 后续可替换为 winston/pino 等专业日志库
 */

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 }
const currentLevel = process.env.LOG_LEVEL || 'info'

function formatTime() {
  const d = new Date()
  return d.toISOString().replace('T', ' ').slice(0, 19)
}

function shouldLog(level) {
  return LOG_LEVELS[level] >= (LOG_LEVELS[currentLevel] || 0)
}

function createLogger(module) {
  const prefix = `[${formatTime()}] [${module}]`

  return {
    debug(...args) {
      if (shouldLog('debug')) console.log(`${prefix} [DEBUG]`, ...args)
    },
    info(...args) {
      if (shouldLog('info')) console.log(`${prefix} [INFO]`, ...args)
    },
    warn(...args) {
      if (shouldLog('warn')) console.warn(`${prefix} [WARN]`, ...args)
    },
    error(...args) {
      if (shouldLog('error')) console.error(`${prefix} [ERROR]`, ...args)
    },
  }
}

module.exports = { createLogger }
