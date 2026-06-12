/**
 * 睡眠监护仪串口通信协议 V1.3
 * 
 * 协议格式：Head(2) + Length(2) + Ver(1) + Type(2) + Seq(2) + Channel(1) + DataField(n) + CRC32(4) + Tail(2)
 * 帧头: 0xAA55
 * 帧尾: 0xFEEF
 * CRC32: poly=0x04C11DB7, init=0xFFFFFFFF, xorOut=0xFFFFFFFF, refIn=true, refOut=true
 */

// ═══════════════════════════════════════════════════════════
//  Constants
// ═══════════════════════════════════════════════════════════

const HEAD = Buffer.from([0xAA, 0x55]);
const TAIL = Buffer.from([0xFE, 0xEF]);
const PROTOCOL_VERSION = 0x01;

// Type 高字节定义
const TYPE_HOST_CMD = 0x01;       // 上位机发送给下位机指令，需要应答
const TYPE_DEVICE_ACK = 0x02;     // 下位机回复给上位机的应答
const TYPE_DEVICE_REPORT = 0x03;  // 下位机主动上报给上位机的指令，需要应答
const TYPE_HOST_ACK = 0x04;       // 上位机回复给下位机的应答
const TYPE_HOST_NOACK = 0x05;     // 上位机主动发送给下位机的指令，不需要应答
const TYPE_DEVICE_NOACK = 0x06;   // 下位机主动上报给上位机指令，不需要应答

// Command 定义
const CMD = {
  // 通用协议
  QUERY_CHANNEL:      0x0100,
  QUERY_SN:           0x0101,
  QUERY_FIRMWARE:     0x0102,
  SET_TIME:           0x0103,
  GET_TIME:           0x0104,
  OTA_START:          0x0105,
  OTA_DATA:           0x0106,
  OTA_END:            0x0107,
  SET_THRESHOLD:      0x0108,
  GET_THRESHOLD:      0x0109,
  // 检测参数协议
  QUERY_VITALS:       0x0200,  // 心率/呼吸率/在离床/体动
  SET_VITALS_REPORT:  0x0201,  // 心率等自动上报开关
  VITALS_REPORT:      0x0202,  // 心率等组数据主动上报
  QUERY_AD:           0x0203,  // AD 采样数据查询
  SET_AD_REPORT:      0x0204,  // AD 采样数据上报设置
  AD_REPORT:          0x0205,  // AD 采样数据主动上报
  QUERY_SLEEP:        0x0206,  // 睡眠状态查询
  QUERY_FATIGUE:      0x0207,  // 疲劳度状态查询
  QUERY_BREATH:       0x0208,  // 憋气状态查询
  QUERY_STRESS:       0x0209,  // 情绪压力值查询
  SET_SLEEP_REPORT:   0x020A,  // 睡眠等组数据上报开关设置
  SLEEP_GROUP_REPORT: 0x020B,  // 睡眠等组数据主动上报
  QUERY_SWITCHES:     0x020D,  // 自动上报开关状态查询
};

// 状态值映射
const BED_STATE = {
  0x00: '离床',
  0x01: '在床无体动',
  0x02: '在床有体动',
};

const SLEEP_STATE = {
  0x00: '觉醒',
  0x01: '浅睡',
  0x02: '深睡',
  0x03: '快速眼动(REM)',
  0x04: '离床',
};

const BREATH_STATE = {
  0x00: '正常呼吸',
  0x01: '憋气',
  0x04: '离床',
};

// ═══════════════════════════════════════════════════════════
//  CRC32 计算 (poly=0x04C11DB7, refIn/refOut, init/xor=0xFFFFFFFF)
// ═══════════════════════════════════════════════════════════

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let j = 0; j < 8; j++) {
      if (crc & 1) {
        crc = (crc >>> 1) ^ 0xEDB88320; // 反转后的多项式
      } else {
        crc = crc >>> 1;
      }
    }
    table[i] = crc >>> 0;
  }
  return table;
})();

function crc32(data) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ data[i]) & 0xFF];
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ═══════════════════════════════════════════════════════════
//  协议打包
// ═══════════════════════════════════════════════════════════

let seqCounter = 0;

function getNextSeq() {
  seqCounter = (seqCounter + 1) & 0xFFFF;
  return seqCounter;
}

/**
 * 构建协议数据包
 * @param {number} typeHigh - Type 高字节
 * @param {number} typeLow - Type 低字节
 * @param {number} channel - 通道
 * @param {number} command - 命令码
 * @param {Buffer} args - 命令参数
 * @param {number} [seq] - 序列号（可选，默认自增）
 * @returns {Buffer} 完整数据包
 */
function buildPacket(typeHigh, typeLow, channel, command, args = Buffer.alloc(0), seq = null) {
  if (seq === null) seq = getNextSeq();

  // DataField = Command(2) + ARG(n)
  const dataField = Buffer.alloc(2 + args.length);
  dataField.writeUInt16BE(command, 0);
  if (args.length > 0) args.copy(dataField, 2);

  // 总长度 = Head(2) + Length(2) + Ver(1) + Type(2) + Seq(2) + Channel(1) + DataField(n) + CRC32(4) + Tail(2)
  const totalLength = 2 + 2 + 1 + 2 + 2 + 1 + dataField.length + 4 + 2;

  const packet = Buffer.alloc(totalLength);
  let offset = 0;

  // Head
  HEAD.copy(packet, offset); offset += 2;
  // Length
  packet.writeUInt16BE(totalLength, offset); offset += 2;
  // Ver
  packet.writeUInt8(PROTOCOL_VERSION, offset); offset += 1;
  // Type
  packet.writeUInt8(typeHigh, offset); offset += 1;
  packet.writeUInt8(typeLow, offset); offset += 1;
  // Seq
  packet.writeUInt16BE(seq, offset); offset += 2;
  // Channel
  packet.writeUInt8(channel, offset); offset += 1;
  // DataField
  dataField.copy(packet, offset); offset += dataField.length;

  // CRC32 (计算 Head 到 DataField 的所有内容)
  const crcData = packet.slice(0, offset);
  const crcValue = crc32(crcData);
  // 大端写入
  packet.writeUInt32BE(crcValue, offset); offset += 4;

  // Tail
  TAIL.copy(packet, offset);

  return packet;
}

/**
 * 构建上位机发送指令（需要应答）
 */
function buildHostCommand(channel, command, args = Buffer.alloc(0)) {
  return buildPacket(TYPE_HOST_CMD, 0x00, channel, command, args);
}

/**
 * 构建上位机应答指令
 */
function buildHostAck(channel, command, args = Buffer.alloc(0), seq = null) {
  return buildPacket(TYPE_HOST_ACK, 0x00, channel, command, args, seq);
}

// ═══════════════════════════════════════════════════════════
//  协议解包
// ═══════════════════════════════════════════════════════════

/**
 * 解析单个数据包
 * @param {Buffer} data - 完整数据包
 * @returns {object|null} 解析结果
 */
function parsePacket(data) {
  if (!data || data.length < 16) return null;

  // 检查帧头
  if (data[0] !== 0xAA || data[1] !== 0x55) return null;

  // 检查帧尾
  if (data[data.length - 2] !== 0xFE || data[data.length - 1] !== 0xEF) return null;

  const length = data.readUInt16BE(2);
  if (length !== data.length) return null;

  const ver = data.readUInt8(4);
  const typeHigh = data.readUInt8(5);
  const typeLow = data.readUInt8(6);
  const seq = data.readUInt16BE(7);
  const channel = data.readUInt8(9);

  // DataField 起始于 offset 10，结束于 CRC32 之前
  const dataFieldEnd = data.length - 6; // 减去 CRC32(4) + Tail(2)
  const dataField = data.slice(10, dataFieldEnd);

  // 验证 CRC32
  const crcData = data.slice(0, dataFieldEnd);
  const expectedCrc = crc32(crcData);
  const actualCrc = data.readUInt32BE(dataFieldEnd);

  if (expectedCrc !== actualCrc) {
    console.warn(`[Protocol] CRC32 mismatch: expected 0x${expectedCrc.toString(16)}, got 0x${actualCrc.toString(16)}`);
    return null;
  }

  // 解析 DataField 中的 Command 和 ARG
  let command = null;
  let args = Buffer.alloc(0);
  if (dataField.length >= 2) {
    command = dataField.readUInt16BE(0);
    args = dataField.slice(2);
  }

  return {
    ver,
    typeHigh,
    typeLow,
    seq,
    channel,
    command,
    args,
    raw: data,
  };
}

// ═══════════════════════════════════════════════════════════
//  数据流解析器（处理粘包/分包）
// ═══════════════════════════════════════════════════════════

class ProtocolParser {
  constructor() {
    this.buffer = Buffer.alloc(0);
    this.callbacks = [];
  }

  onPacket(callback) {
    this.callbacks.push(callback);
  }

  /**
   * 向解析器推入数据
   * @param {Buffer} chunk - 接收到的原始数据
   */
  feed(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    this._tryParse();
  }

  _tryParse() {
    while (this.buffer.length >= 16) {
      // 查找帧头
      const headIndex = this._findHead();
      if (headIndex < 0) {
        // 没有找到帧头，丢弃所有数据
        this.buffer = Buffer.alloc(0);
        return;
      }

      // 丢弃帧头之前的数据
      if (headIndex > 0) {
        this.buffer = this.buffer.slice(headIndex);
      }

      // 检查是否有足够数据读取长度
      if (this.buffer.length < 4) return;

      const packetLength = this.buffer.readUInt16BE(2);
      if (packetLength < 16 || packetLength > 2048) {
        // 长度异常，跳过这个帧头
        this.buffer = this.buffer.slice(2);
        continue;
      }

      // 检查是否收到完整包
      if (this.buffer.length < packetLength) return;

      // 提取完整包
      const packet = this.buffer.slice(0, packetLength);
      this.buffer = this.buffer.slice(packetLength);

      // 解析
      const parsed = parsePacket(packet);
      if (parsed) {
        this.callbacks.forEach(cb => cb(parsed));
      }
    }
  }

  _findHead() {
    for (let i = 0; i < this.buffer.length - 1; i++) {
      if (this.buffer[i] === 0xAA && this.buffer[i + 1] === 0x55) {
        return i;
      }
    }
    return -1;
  }

  reset() {
    this.buffer = Buffer.alloc(0);
  }
}

// ═══════════════════════════════════════════════════════════
//  业务指令构建辅助函数
// ═══════════════════════════════════════════════════════════

/**
 * 查询设备通道
 */
function buildQueryChannel() {
  return buildHostCommand(0x00, CMD.QUERY_CHANNEL, Buffer.from([0x00]));
}

/**
 * 查询设备 SN
 */
function buildQuerySN() {
  return buildHostCommand(0x00, CMD.QUERY_SN, Buffer.from([0x00]));
}

/**
 * 查询固件版本号
 */
function buildQueryFirmware() {
  return buildHostCommand(0x00, CMD.QUERY_FIRMWARE, Buffer.from([0x00]));
}

/**
 * 设置系统时间
 */
function buildSetTime(date = new Date()) {
  const year = date.getFullYear();
  const args = Buffer.alloc(8);
  args.writeUInt8(0x00, 0);              // Res
  args.writeUInt8((year >> 8) & 0xFF, 1); // year high
  args.writeUInt8(year & 0xFF, 2);        // year low
  args.writeUInt8(date.getMonth() + 1, 3); // month
  args.writeUInt8(date.getDate(), 4);      // day
  args.writeUInt8(date.getHours(), 5);     // hour
  args.writeUInt8(date.getMinutes(), 6);   // minute
  args.writeUInt8(date.getSeconds(), 7);   // second
  return buildHostCommand(0x00, CMD.SET_TIME, args);
}

/**
 * 回复设备时间请求
 */
function buildTimeResponse(seq, date = new Date()) {
  const year = date.getFullYear();
  const args = Buffer.alloc(8);
  args.writeUInt8(0x00, 0);
  args.writeUInt8((year >> 8) & 0xFF, 1);
  args.writeUInt8(year & 0xFF, 2);
  args.writeUInt8(date.getMonth() + 1, 3);
  args.writeUInt8(date.getDate(), 4);
  args.writeUInt8(date.getHours(), 5);
  args.writeUInt8(date.getMinutes(), 6);
  args.writeUInt8(date.getSeconds(), 7);
  return buildPacket(TYPE_HOST_ACK, 0x00, 0x00, CMD.GET_TIME, args, seq);
}

/**
 * 查询心率/呼吸率/在离床/体动
 */
function buildQueryVitals(channel = 0x01) {
  return buildHostCommand(channel, CMD.QUERY_VITALS, Buffer.from([0x00]));
}

/**
 * 设置心率等自动上报开关
 * @param {boolean} enable - true 开启，false 关闭
 */
function buildSetVitalsReport(channel = 0x01, enable = true) {
  return buildHostCommand(channel, CMD.SET_VITALS_REPORT, Buffer.from([enable ? 0x01 : 0x00]));
}

/**
 * 查询 AD 采样数据
 */
function buildQueryAD(channel = 0x01) {
  return buildHostCommand(channel, CMD.QUERY_AD, Buffer.from([0x00]));
}

/**
 * 设置 AD 采样自动上报
 */
function buildSetADReport(channel = 0x01, enable = true) {
  return buildHostCommand(channel, CMD.SET_AD_REPORT, Buffer.from([enable ? 0x01 : 0x00]));
}

/**
 * 查询睡眠状态
 */
function buildQuerySleep(channel = 0x01) {
  return buildHostCommand(channel, CMD.QUERY_SLEEP, Buffer.from([0x00]));
}

/**
 * 查询疲劳度
 */
function buildQueryFatigue(channel = 0x01) {
  return buildHostCommand(channel, CMD.QUERY_FATIGUE, Buffer.from([0x00]));
}

/**
 * 查询憋气状态
 */
function buildQueryBreath(channel = 0x01) {
  return buildHostCommand(channel, CMD.QUERY_BREATH, Buffer.from([0x00]));
}

/**
 * 查询情绪压力值
 */
function buildQueryStress(channel = 0x01) {
  return buildHostCommand(channel, CMD.QUERY_STRESS, Buffer.from([0x00]));
}

/**
 * 设置睡眠等组数据上报开关
 */
function buildSetSleepReport(channel = 0x01, enable = true) {
  return buildHostCommand(channel, CMD.SET_SLEEP_REPORT, Buffer.from([enable ? 0x01 : 0x00]));
}

/**
 * 查询自动上报开关状态
 */
function buildQuerySwitches(channel = 0x01) {
  return buildHostCommand(channel, CMD.QUERY_SWITCHES, Buffer.from([0x00]));
}

/**
 * 设置传感器压力阈值
 * @param {number} onThreshold - 在床阈值 (2 bytes)
 * @param {number} offThreshold - 离床阈值 (2 bytes)
 */
function buildSetThreshold(onThreshold, offThreshold) {
  const args = Buffer.alloc(5);
  args.writeUInt8(0x00, 0);
  args.writeUInt8((onThreshold >> 8) & 0xFF, 1);
  args.writeUInt8(onThreshold & 0xFF, 2);
  args.writeUInt8((offThreshold >> 8) & 0xFF, 3);
  args.writeUInt8(offThreshold & 0xFF, 4);
  return buildHostCommand(0x00, CMD.SET_THRESHOLD, args);
}

/**
 * 读取传感器压力阈值
 */
function buildGetThreshold() {
  return buildHostCommand(0x00, CMD.GET_THRESHOLD, Buffer.from([0x00]));
}

// ═══════════════════════════════════════════════════════════
//  应答数据解析辅助函数
// ═══════════════════════════════════════════════════════════

/**
 * 解析心率/呼吸率/在离床/体动 应答
 */
function parseVitalsResponse(args) {
  if (args.length < 4) return null;
  return {
    err: args.readUInt8(0),
    heartRate: args.readUInt8(1),
    respiratoryRate: args.readUInt8(2),
    bedState: args.readUInt8(3),
    bedStateText: BED_STATE[args.readUInt8(3)] || '未知',
  };
}

/**
 * 解析心率等组数据主动上报
 */
function parseVitalsReport(args) {
  if (args.length < 4) return null;
  return {
    res: args.readUInt8(0),
    heartRate: args.readUInt8(1),
    respiratoryRate: args.readUInt8(2),
    bedState: args.readUInt8(3),
    bedStateText: BED_STATE[args.readUInt8(3)] || '未知',
  };
}

/**
 * 解析睡眠状态应答
 */
function parseSleepResponse(args) {
  if (args.length < 2) return null;
  return {
    err: args.readUInt8(0),
    sleep: args.readUInt8(1),
    sleepText: SLEEP_STATE[args.readUInt8(1)] || '未知',
  };
}

/**
 * 解析疲劳度应答
 */
function parseFatigueResponse(args) {
  if (args.length < 2) return null;
  const value = args.readUInt8(1);
  let level = '离床';
  if (value === 0) level = '离床';
  else if (value >= 36) level = '清醒/正常';
  else if (value >= 20) level = '轻度疲劳';
  else if (value >= 10) level = '重度疲劳';
  return {
    err: args.readUInt8(0),
    fatigue: value,
    fatigueText: level,
  };
}

/**
 * 解析憋气状态应答
 */
function parseBreathResponse(args) {
  if (args.length < 2) return null;
  return {
    err: args.readUInt8(0),
    breathHold: args.readUInt8(1),
    breathHoldText: BREATH_STATE[args.readUInt8(1)] || '未知',
  };
}

/**
 * 解析情绪压力值应答
 */
function parseStressResponse(args) {
  if (args.length < 4) return null;
  const stressValue = (args.readUInt8(1) << 8) | args.readUInt8(2);
  let level = '未知';
  if (stressValue < 50) level = '深度放松';
  else if (stressValue <= 150) level = '正常';
  else if (stressValue <= 500) level = '中等压力';
  else if (stressValue <= 900) level = '高压力/交感兴奋';
  else level = '极高应激';
  return {
    err: args.readUInt8(0),
    stressValue,
    stressText: level,
    bedState: args.readUInt8(3),
    bedStateText: BED_STATE[args.readUInt8(3)] || '未知',
  };
}

/**
 * 解析 AD 采样数据
 */
function parseADData(args) {
  if (args.length < 7) return null;
  const res = args.readUInt8(0);
  const timestamp = args.readUInt32BE(1);
  // 跳过 2 字节预留
  const dataStart = 7;
  const samples = [];
  for (let i = dataStart; i < args.length - 1; i += 2) {
    samples.push(args.readUInt16BE(i));
  }
  return {
    res,
    timestamp,
    samples,
    sampleCount: samples.length,
  };
}

/**
 * 解析睡眠等组数据主动上报
 */
function parseSleepGroupReport(args) {
  if (args.length < 7) return null;
  const res = args.readUInt8(0);
  const sleep = args.readUInt8(1);
  const fatigue = args.readUInt8(2);
  const breathHold = args.readUInt8(3);
  const stressValue = (args.readUInt8(4) << 8) | args.readUInt8(5);
  const bedState = args.readUInt8(6);

  let fatigueText = '离床';
  if (fatigue === 0) fatigueText = '离床';
  else if (fatigue >= 36) fatigueText = '清醒/正常';
  else if (fatigue >= 20) fatigueText = '轻度疲劳';
  else if (fatigue >= 10) fatigueText = '重度疲劳';

  let stressText = '未知';
  if (stressValue < 50) stressText = '深度放松';
  else if (stressValue <= 150) stressText = '正常';
  else if (stressValue <= 500) stressText = '中等压力';
  else if (stressValue <= 900) stressText = '高压力/交感兴奋';
  else stressText = '极高应激';

  return {
    res,
    sleep,
    sleepText: SLEEP_STATE[sleep] || '未知',
    fatigue,
    fatigueText,
    breathHold,
    breathHoldText: BREATH_STATE[breathHold] || '未知',
    stressValue,
    stressText,
    bedState,
    bedStateText: BED_STATE[bedState] || '未知',
  };
}

/**
 * 解析自动上报开关状态
 */
function parseSwitchesResponse(args) {
  if (args.length < 5) return null;
  return {
    err: args.readUInt8(0),
    vitalsReport: args.readUInt8(1) === 0x01,
    adReport: args.readUInt8(2) === 0x01,
    sleepReport: args.readUInt8(3) === 0x01,
    transparentReport: args.readUInt8(4) === 0x01,
  };
}

/**
 * 解析设备 SN
 */
function parseSNResponse(args) {
  if (args.length < 9) return null;
  const err = args.readUInt8(0);
  const sn = args.slice(1, 9).toString('hex').toUpperCase();
  return { err, sn };
}

/**
 * 解析固件版本
 */
function parseFirmwareResponse(args) {
  if (args.length < 9) return null;
  const err = args.readUInt8(0);
  const swVer = `${args.readUInt8(1)}.${args.readUInt8(2)}.${args.readUInt8(3)}.${args.readUInt8(4)}`;
  const hwVer = `${args.readUInt8(5)}.${args.readUInt8(6)}.${args.readUInt8(7)}.${args.readUInt8(8)}`;
  return { err, softwareVersion: swVer, hardwareVersion: hwVer };
}

/**
 * 解析通道查询
 */
function parseChannelResponse(args) {
  if (args.length < 2) return null;
  return {
    err: args.readUInt8(0),
    channelCount: args.readUInt8(1),
  };
}

/**
 * 解析阈值读取
 */
function parseThresholdResponse(args) {
  if (args.length < 5) return null;
  return {
    err: args.readUInt8(0),
    onThreshold: (args.readUInt8(1) << 8) | args.readUInt8(2),
    offThreshold: (args.readUInt8(3) << 8) | args.readUInt8(4),
  };
}

// ═══════════════════════════════════════════════════════════
//  Exports
// ═══════════════════════════════════════════════════════════

module.exports = {
  // Constants
  HEAD, TAIL, PROTOCOL_VERSION,
  TYPE_HOST_CMD, TYPE_DEVICE_ACK, TYPE_DEVICE_REPORT, TYPE_HOST_ACK, TYPE_HOST_NOACK, TYPE_DEVICE_NOACK,
  CMD, BED_STATE, SLEEP_STATE, BREATH_STATE,

  // Core functions
  crc32, buildPacket, parsePacket, ProtocolParser,

  // Command builders
  buildHostCommand, buildHostAck,
  buildQueryChannel, buildQuerySN, buildQueryFirmware,
  buildSetTime, buildTimeResponse,
  buildQueryVitals, buildSetVitalsReport,
  buildQueryAD, buildSetADReport,
  buildQuerySleep, buildQueryFatigue, buildQueryBreath, buildQueryStress,
  buildSetSleepReport, buildQuerySwitches,
  buildSetThreshold, buildGetThreshold,

  // Response parsers
  parseVitalsResponse, parseVitalsReport,
  parseSleepResponse, parseFatigueResponse, parseBreathResponse, parseStressResponse,
  parseADData, parseSleepGroupReport, parseSwitchesResponse,
  parseSNResponse, parseFirmwareResponse, parseChannelResponse, parseThresholdResponse,
};
