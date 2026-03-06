/**
 * 全局常量配置
 *
 * 包含：串口协议参数、波特率探测配置、Device类型映射、远程服务地址等
 */

// ═══════════════════════════════════════════════════════════
//  波特率与Device映射
// ═══════════════════════════════════════════════════════════

/**
 * 波特率探测候选列表（按优先级排序）
 * 系统会依次尝试每个波特率，直到收到有效数据
 */
const BAUD_CANDIDATES = [921600, 1000000, 3000000]

/**
 * 波特率 → Device大类映射
 * 探测到波特率后，通过此表确定Device属于哪个大类
 */
const BAUD_DEVICE_MAP = {
  921600: 'hand',     // 手套
  1000000: 'sit',     // 起坐垫
  3000000: 'foot',    // 脚垫
}

/**
 * 各Device大类的默认波特率
 */
const baudRateObj = {
  hand: 921600,
  sit: 1000000,
  foot: 3000000,
}

// ═══════════════════════════════════════════════════════════
//  串口协议常量
// ═══════════════════════════════════════════════════════════

/** 数据帧分隔符 */
const splitArr = [0xaa, 0x55, 0x03, 0x99]

/** AT 指令：查询Device MAC 地址 (AT+NAME=ESP32\r\n) */
const AT_MAC_COMMAND = Buffer.from('41542B4E414D453D45535033320d0a', 'hex')

/** 波特率探测超时时间 (ms)，需要足够长以等待Device稳定发送数据 */
const BAUD_DETECT_TIMEOUT = 2000

/** MAC 指令发送间隔 (ms)，脚垫可能不会立即响应 */
const MAC_SEND_INTERVAL = 300

/** MAC 指令最大等待时间 (ms) */
const MAC_WAIT_TIMEOUT = 5000

// ═══════════════════════════════════════════════════════════
//  帧内类型映射
// ═══════════════════════════════════════════════════════════

/**
 * 手套帧类型位映射（130/146 字节帧的第 2 字节）
 */
const handTypeMap = {
  1: 'HL',    // 左手
  2: 'HR',    // 右手
}

/**
 * 分包顺序映射（130 字节帧的第 1 字节）
 */
const order = {
  1: 'last',
  2: 'next',
}

/**
 * 通用帧类型映射（兼容旧协议）
 */
const type = {
  1: 'HL',
  2: 'HR',
  3: 'BODY',
  4: 'ALLBODY',
  5: 'FL',
  6: 'FR',
}

/**
 * 1025/4097 帧首字节类型码映射
 */
const typeConfig = {
  1: 'car-back',
  2: 'car-sit',
  3: 'bed',
  4: 'endi-back',
  5: 'endi-sit',
}

// ═══════════════════════════════════════════════════════════
//  Device授权模式
// ═══════════════════════════════════════════════════════════

/**
 * 授权模式：
 *   'online'  — 联网模式，通过远程服务器查询 MAC 地址对应的Device类型和授权
 *   'local'   — 本地模式，通过 serial_cache.json 本地缓存查询，无需联网
 */
let AUTH_MODE = process.env.AUTH_MODE || 'local'

/** 远程授权服务地址 */
const backendAddress = 'https://sensor.bodyta.com'

/** 远程时间服务地址 */
const timeServerAddress = 'http://sensor.bodyta.com:8080'

// ═══════════════════════════════════════════════════════════
//  兼容旧字段
// ═══════════════════════════════════════════════════════════

const blue = ['robot']
const blueArr = ['robot']

// ═══════════════════════════════════════════════════════════
//  导出
// ═══════════════════════════════════════════════════════════

const constantObj = {
  // 串口协议
  splitArr,
  AT_MAC_COMMAND,
  order,
  type,
  typeConfig,
  handTypeMap,

  // 波特率探测
  BAUD_CANDIDATES,
  BAUD_DETECT_TIMEOUT,
  BAUD_DEVICE_MAP,
  baudRateObj,

  // MAC 指令
  MAC_SEND_INTERVAL,
  MAC_WAIT_TIMEOUT,

  // 授权
  AUTH_MODE,
  backendAddress,
  timeServerAddress,

  // 兼容
  blue,
  blueArr,
}

module.exports = constantObj
