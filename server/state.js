/**
 * 全局状态管理
 * 将原 serialServer.js 中散落的全局变量集中管理
 */

const state = {
  // ─── 系统配置 ────────────────────────────────────────
  file: null,               // 当前系统类型 (hand/bed/endi 等)
  baudRate: 1000000,        // 当前波特率

  // ─── 串口相关 ────────────────────────────────────────
  parserArr: {},            // 串口解析器集合 { portPath: { port, parser } }
  dataMap: {},              // 串口数据缓存 { portPath: { type, arr, stamp, ... } }
  macInfo: {},              // 设备 MAC 信息
  linkIngPort: [],
  portHistory: [],            // 端口连接时间顺序 [{ path, connectedAt }]

  // ─── 帧率控制 ────────────────────────────────────────
  HZ: 30,                   // 发送频率
  MaxHZ: undefined,         // 串口最大频率
  playtimer: null,          // 数据发送定时器
  sendDataLength: 0,
  oldTimeObj: {},            // 上一帧时间戳

  // ─── 数据采集 ────────────────────────────────────────
  colFlag: false,           // 采集开关
  colName: '',              // 采集命名
  selectArr: [],            // 框选区域

  // ─── 历史回放 ────────────────────────────────────────
  historyFlag: false,       // 历史数据模式开关
  historyPlayFlag: false,   // 历史播放开关
  playIndex: 0,             // 数据播放索引
  colTimer: null,           // 回放定时器
  colMaxHZ: undefined,      // 采集最大频率
  colplayHZ: undefined,     // 回放频率
  historyDbArr: null,       // 历史回放数据
  historyListCache: [],     // 历史列表缓存
  historySelectCache: null, // 框选缓存
  leftDbArr: null,          // 对比数据-左
  rightDbArr: null,         // 对比数据-右

  // ─── 下载路径 ────────────────────────────────────────
  _defaultDownloadPath: null,
  downloadPath: null,         // 自定义下载路径 (null 则使用默认)

  // ─── 数据库 ──────────────────────────────────────────
  _dataPath: null,
  currentDb: null,
}

/**
 * 重置串口相关状态
 */
function resetSerialState() {
  state.parserArr = {}
  state.dataMap = {}
  state.macInfo = {}
  state.portHistory = []
  state.HZ = 30
  state.MaxHZ = undefined
  state.sendDataLength = 0
  state.oldTimeObj = {}
  if (state.playtimer) {
    clearInterval(state.playtimer)
    state.playtimer = null
  }
}

/**
 * 重置回放状态
 */
function resetPlaybackState() {
  state.historyPlayFlag = false
  state.playIndex = 0
  if (state.colTimer) {
    clearInterval(state.colTimer)
    state.colTimer = null
  }
}

module.exports = { state, resetSerialState, resetPlaybackState }
