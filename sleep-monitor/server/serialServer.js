/**
 * 睡眠监护仪串口服务器
 * 
 * 负责：
 *   1. 串口设备扫描与连接
 *   2. 协议数据收发
 *   3. WebSocket 实时推送
 *   4. REST API 提供设备管理接口
 */

const express = require('express');
const cors = require('cors');
const http = require('http');
const { WebSocketServer } = require('ws');
const { SerialPort } = require('serialport');
const path = require('path');
const fs = require('fs');

const protocol = require('./protocol');
const { ProtocolParser, CMD, TYPE_DEVICE_ACK, TYPE_DEVICE_REPORT, TYPE_DEVICE_NOACK } = protocol;

// ═══════════════════════════════════════════════════════════
//  Configuration
// ═══════════════════════════════════════════════════════════

const API_PORT = parseInt(process.env.API_PORT) || 3001;
const WS_PORT = parseInt(process.env.WS_PORT) || 3002;
const BAUD_RATE = 115200;
const POLL_INTERVAL = 2000; // 轮询间隔 ms
const DATA_HISTORY_MAX = 3600; // 最大保存 1 小时数据（每秒 1 条）

// ═══════════════════════════════════════════════════════════
//  State
// ═══════════════════════════════════════════════════════════

let serialPort = null;
let parser = null;
let isConnected = false;
let currentPortPath = '';
let pollTimer = null;
let deviceInfo = {
  sn: '',
  softwareVersion: '',
  hardwareVersion: '',
  channelCount: 0,
};
let switches = {
  vitalsReport: false,
  adReport: false,
  sleepReport: false,
  transparentReport: false,
};
let thresholds = {
  onThreshold: 0,
  offThreshold: 0,
};

// 实时数据
let realtimeData = {
  heartRate: 0,
  respiratoryRate: 0,
  bedState: 0,
  bedStateText: '离床',
  sleep: 0,
  sleepText: '离床',
  fatigue: 0,
  fatigueText: '离床',
  breathHold: 0,
  breathHoldText: '正常呼吸',
  stressValue: 0,
  stressText: '未知',
  timestamp: Date.now(),
};

// 历史数据
let historyData = [];
let adSamples = [];

// ═══════════════════════════════════════════════════════════
//  WebSocket
// ═══════════════════════════════════════════════════════════

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocketServer({ port: WS_PORT });

let wsClients = new Set();

wss.on('connection', (ws) => {
  wsClients.add(ws);
  console.log(`[WS] Client connected, total: ${wsClients.size}`);

  // 发送当前状态
  ws.send(JSON.stringify({
    type: 'status',
    data: {
      connected: isConnected,
      port: currentPortPath,
      deviceInfo,
      switches,
      thresholds,
      realtimeData,
    }
  }));

  ws.on('close', () => {
    wsClients.delete(ws);
    console.log(`[WS] Client disconnected, total: ${wsClients.size}`);
  });

  ws.on('error', (err) => {
    console.error('[WS] Error:', err.message);
    wsClients.delete(ws);
  });
});

function broadcast(type, data) {
  const msg = JSON.stringify({ type, data, timestamp: Date.now() });
  wsClients.forEach(ws => {
    if (ws.readyState === 1) {
      ws.send(msg);
    }
  });
}

// ═══════════════════════════════════════════════════════════
//  Serial Port Management
// ═══════════════════════════════════════════════════════════

async function listPorts() {
  const ports = await SerialPort.list();
  return ports.filter(p => 
    p.manufacturer?.includes('CH340') || 
    p.manufacturer?.includes('wch') ||
    p.vendorId === '1A86' ||
    p.path?.includes('ttyUSB') ||
    p.path?.includes('ttyACM') ||
    p.path?.includes('COM')
  );
}

async function connectSerial(portPath) {
  if (isConnected && serialPort?.isOpen) {
    await disconnectSerial();
  }

  return new Promise((resolve, reject) => {
    serialPort = new SerialPort({
      path: portPath,
      baudRate: BAUD_RATE,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      autoOpen: false,
    });

    parser = new ProtocolParser();

    parser.onPacket((packet) => {
      handlePacket(packet);
    });

    serialPort.on('data', (chunk) => {
      parser.feed(chunk);
    });

    serialPort.on('error', (err) => {
      console.error('[Serial] Error:', err.message);
      broadcast('error', { message: err.message });
    });

    serialPort.on('close', () => {
      console.log('[Serial] Port closed');
      isConnected = false;
      currentPortPath = '';
      stopPolling();
      broadcast('status', { connected: false, port: '' });
    });

    serialPort.open((err) => {
      if (err) {
        console.error('[Serial] Open failed:', err.message);
        reject(err);
        return;
      }

      isConnected = true;
      currentPortPath = portPath;
      console.log(`[Serial] Connected to ${portPath} @ ${BAUD_RATE}`);

      // 连接后自动同步时间并查询设备信息
      setTimeout(() => initDevice(), 500);

      broadcast('status', { connected: true, port: portPath });
      resolve({ success: true, port: portPath });
    });
  });
}

async function disconnectSerial() {
  stopPolling();
  return new Promise((resolve) => {
    if (serialPort && serialPort.isOpen) {
      serialPort.close((err) => {
        if (err) console.error('[Serial] Close error:', err.message);
        isConnected = false;
        currentPortPath = '';
        serialPort = null;
        parser = null;
        resolve();
      });
    } else {
      isConnected = false;
      currentPortPath = '';
      serialPort = null;
      parser = null;
      resolve();
    }
  });
}

function sendCommand(buffer) {
  if (!serialPort || !serialPort.isOpen) {
    console.warn('[Serial] Port not open, cannot send');
    return false;
  }
  serialPort.write(buffer, (err) => {
    if (err) {
      console.error('[Serial] Write error:', err.message);
    }
  });
  return true;
}

// ═══════════════════════════════════════════════════════════
//  Device Initialization
// ═══════════════════════════════════════════════════════════

function initDevice() {
  console.log('[Device] Initializing...');
  // 同步时间
  sendCommand(protocol.buildSetTime());
  // 查询设备信息
  setTimeout(() => sendCommand(protocol.buildQueryChannel()), 200);
  setTimeout(() => sendCommand(protocol.buildQuerySN()), 400);
  setTimeout(() => sendCommand(protocol.buildQueryFirmware()), 600);
  setTimeout(() => sendCommand(protocol.buildGetThreshold()), 800);
  setTimeout(() => sendCommand(protocol.buildQuerySwitches(0x01)), 1000);
}

// ═══════════════════════════════════════════════════════════
//  Packet Handler
// ═══════════════════════════════════════════════════════════

function handlePacket(packet) {
  const { typeHigh, command, args, seq } = packet;

  // 设备主动请求时间
  if (typeHigh === TYPE_DEVICE_REPORT && command === CMD.GET_TIME) {
    const response = protocol.buildTimeResponse(seq);
    sendCommand(response);
    console.log('[Device] Time request received, responded with current time');
    return;
  }

  // 设备应答
  if (typeHigh === TYPE_DEVICE_ACK) {
    handleDeviceAck(command, args);
    return;
  }

  // 设备主动上报（不需要应答）
  if (typeHigh === TYPE_DEVICE_NOACK) {
    handleDeviceReport(command, args);
    return;
  }
}

function handleDeviceAck(command, args) {
  switch (command) {
    case CMD.QUERY_CHANNEL: {
      const result = protocol.parseChannelResponse(args);
      if (result && result.err === 0) {
        deviceInfo.channelCount = result.channelCount;
        broadcast('deviceInfo', deviceInfo);
        console.log(`[Device] Channel count: ${result.channelCount}`);
      }
      break;
    }
    case CMD.QUERY_SN: {
      const result = protocol.parseSNResponse(args);
      if (result && result.err === 0) {
        deviceInfo.sn = result.sn;
        broadcast('deviceInfo', deviceInfo);
        console.log(`[Device] SN: ${result.sn}`);
      }
      break;
    }
    case CMD.QUERY_FIRMWARE: {
      const result = protocol.parseFirmwareResponse(args);
      if (result && result.err === 0) {
        deviceInfo.softwareVersion = result.softwareVersion;
        deviceInfo.hardwareVersion = result.hardwareVersion;
        broadcast('deviceInfo', deviceInfo);
        console.log(`[Device] FW: ${result.softwareVersion}, HW: ${result.hardwareVersion}`);
      }
      break;
    }
    case CMD.QUERY_VITALS: {
      const result = protocol.parseVitalsResponse(args);
      if (result && result.err === 0) {
        realtimeData.heartRate = result.heartRate;
        realtimeData.respiratoryRate = result.respiratoryRate;
        realtimeData.bedState = result.bedState;
        realtimeData.bedStateText = result.bedStateText;
        realtimeData.timestamp = Date.now();
        broadcast('vitals', realtimeData);
      }
      break;
    }
    case CMD.QUERY_SLEEP: {
      const result = protocol.parseSleepResponse(args);
      if (result && result.err === 0) {
        realtimeData.sleep = result.sleep;
        realtimeData.sleepText = result.sleepText;
        realtimeData.timestamp = Date.now();
        broadcast('sleep', realtimeData);
      }
      break;
    }
    case CMD.QUERY_FATIGUE: {
      const result = protocol.parseFatigueResponse(args);
      if (result && result.err === 0) {
        realtimeData.fatigue = result.fatigue;
        realtimeData.fatigueText = result.fatigueText;
        realtimeData.timestamp = Date.now();
        broadcast('fatigue', realtimeData);
      }
      break;
    }
    case CMD.QUERY_BREATH: {
      const result = protocol.parseBreathResponse(args);
      if (result && result.err === 0) {
        realtimeData.breathHold = result.breathHold;
        realtimeData.breathHoldText = result.breathHoldText;
        realtimeData.timestamp = Date.now();
        broadcast('breath', realtimeData);
      }
      break;
    }
    case CMD.QUERY_STRESS: {
      const result = protocol.parseStressResponse(args);
      if (result && result.err === 0) {
        realtimeData.stressValue = result.stressValue;
        realtimeData.stressText = result.stressText;
        realtimeData.timestamp = Date.now();
        broadcast('stress', realtimeData);
      }
      break;
    }
    case CMD.QUERY_AD: {
      const result = protocol.parseADData(args);
      if (result) {
        adSamples.push(...result.samples);
        if (adSamples.length > 5000) adSamples = adSamples.slice(-5000);
        broadcast('adData', { samples: result.samples, timestamp: result.timestamp });
      }
      break;
    }
    case CMD.GET_THRESHOLD: {
      const result = protocol.parseThresholdResponse(args);
      if (result && result.err === 0) {
        thresholds = { onThreshold: result.onThreshold, offThreshold: result.offThreshold };
        broadcast('thresholds', thresholds);
        console.log(`[Device] Thresholds: on=${result.onThreshold}, off=${result.offThreshold}`);
      }
      break;
    }
    case CMD.QUERY_SWITCHES: {
      const result = protocol.parseSwitchesResponse(args);
      if (result && result.err === 0) {
        switches = {
          vitalsReport: result.vitalsReport,
          adReport: result.adReport,
          sleepReport: result.sleepReport,
          transparentReport: result.transparentReport,
        };
        broadcast('switches', switches);
        console.log(`[Device] Switches:`, switches);
      }
      break;
    }
    case CMD.SET_VITALS_REPORT:
    case CMD.SET_AD_REPORT:
    case CMD.SET_SLEEP_REPORT:
    case CMD.SET_TIME:
    case CMD.SET_THRESHOLD: {
      const err = args.length > 0 ? args.readUInt8(0) : -1;
      if (err === 0) {
        console.log(`[Device] Command 0x${command.toString(16)} executed successfully`);
        // 刷新开关状态
        setTimeout(() => sendCommand(protocol.buildQuerySwitches(0x01)), 200);
      } else {
        console.warn(`[Device] Command 0x${command.toString(16)} failed, err=${err}`);
      }
      break;
    }
  }
}

function handleDeviceReport(command, args) {
  switch (command) {
    case CMD.VITALS_REPORT: {
      const result = protocol.parseVitalsReport(args);
      if (result) {
        realtimeData.heartRate = result.heartRate;
        realtimeData.respiratoryRate = result.respiratoryRate;
        realtimeData.bedState = result.bedState;
        realtimeData.bedStateText = result.bedStateText;
        realtimeData.timestamp = Date.now();
        addHistory();
        broadcast('vitals', realtimeData);
      }
      break;
    }
    case CMD.AD_REPORT: {
      const result = protocol.parseADData(args);
      if (result) {
        adSamples.push(...result.samples);
        if (adSamples.length > 5000) adSamples = adSamples.slice(-5000);
        broadcast('adData', { samples: result.samples, timestamp: result.timestamp });
      }
      break;
    }
    case CMD.SLEEP_GROUP_REPORT: {
      const result = protocol.parseSleepGroupReport(args);
      if (result) {
        realtimeData.sleep = result.sleep;
        realtimeData.sleepText = result.sleepText;
        realtimeData.fatigue = result.fatigue;
        realtimeData.fatigueText = result.fatigueText;
        realtimeData.breathHold = result.breathHold;
        realtimeData.breathHoldText = result.breathHoldText;
        realtimeData.stressValue = result.stressValue;
        realtimeData.stressText = result.stressText;
        realtimeData.bedState = result.bedState;
        realtimeData.bedStateText = result.bedStateText;
        realtimeData.timestamp = Date.now();
        addHistory();
        broadcast('sleepGroup', realtimeData);
      }
      break;
    }
  }
}

function addHistory() {
  historyData.push({ ...realtimeData });
  if (historyData.length > DATA_HISTORY_MAX) {
    historyData = historyData.slice(-DATA_HISTORY_MAX);
  }
}

// ═══════════════════════════════════════════════════════════
//  Polling Mode
// ═══════════════════════════════════════════════════════════

function startPolling(interval = POLL_INTERVAL) {
  stopPolling();
  pollTimer = setInterval(() => {
    if (!isConnected) return;
    sendCommand(protocol.buildQueryVitals(0x01));
    setTimeout(() => sendCommand(protocol.buildQuerySleep(0x01)), 200);
    setTimeout(() => sendCommand(protocol.buildQueryFatigue(0x01)), 400);
    setTimeout(() => sendCommand(protocol.buildQueryBreath(0x01)), 600);
    setTimeout(() => sendCommand(protocol.buildQueryStress(0x01)), 800);
  }, interval);
  console.log(`[Polling] Started, interval: ${interval}ms`);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
    console.log('[Polling] Stopped');
  }
}

// ═══════════════════════════════════════════════════════════
//  REST API
// ═══════════════════════════════════════════════════════════

// 列出可用串口
app.get('/api/ports', async (req, res) => {
  try {
    const ports = await listPorts();
    res.json({ success: true, ports });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// 连接串口
app.post('/api/connect', async (req, res) => {
  const { port } = req.body;
  if (!port) {
    return res.json({ success: false, error: '请指定串口路径' });
  }
  try {
    const result = await connectSerial(port);
    res.json(result);
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// 断开串口
app.post('/api/disconnect', async (req, res) => {
  await disconnectSerial();
  res.json({ success: true });
});

// 获取连接状态
app.get('/api/status', (req, res) => {
  res.json({
    connected: isConnected,
    port: currentPortPath,
    deviceInfo,
    switches,
    thresholds,
    realtimeData,
  });
});

// 获取设备信息
app.get('/api/device', (req, res) => {
  res.json({ success: true, deviceInfo });
});

// 同步时间
app.post('/api/syncTime', (req, res) => {
  const success = sendCommand(protocol.buildSetTime());
  res.json({ success });
});

// 设置压力阈值
app.post('/api/threshold', (req, res) => {
  const { onThreshold, offThreshold } = req.body;
  const success = sendCommand(protocol.buildSetThreshold(onThreshold, offThreshold));
  res.json({ success });
});

// 读取压力阈值
app.get('/api/threshold', (req, res) => {
  sendCommand(protocol.buildGetThreshold());
  setTimeout(() => res.json({ success: true, thresholds }), 500);
});

// 设置自动上报开关
app.post('/api/switches', (req, res) => {
  const { vitals, ad, sleep } = req.body;
  if (vitals !== undefined) sendCommand(protocol.buildSetVitalsReport(0x01, vitals));
  if (ad !== undefined) setTimeout(() => sendCommand(protocol.buildSetADReport(0x01, ad)), 200);
  if (sleep !== undefined) setTimeout(() => sendCommand(protocol.buildSetSleepReport(0x01, sleep)), 400);
  res.json({ success: true });
});

// 查询开关状态
app.get('/api/switches', (req, res) => {
  sendCommand(protocol.buildQuerySwitches(0x01));
  setTimeout(() => res.json({ success: true, switches }), 500);
});

// 开始轮询
app.post('/api/polling/start', (req, res) => {
  const { interval } = req.body;
  startPolling(interval || POLL_INTERVAL);
  res.json({ success: true });
});

// 停止轮询
app.post('/api/polling/stop', (req, res) => {
  stopPolling();
  res.json({ success: true });
});

// 获取历史数据
app.get('/api/history', (req, res) => {
  const { limit = 100 } = req.query;
  const data = historyData.slice(-parseInt(limit));
  res.json({ success: true, data, total: historyData.length });
});

// 获取 AD 采样数据
app.get('/api/adSamples', (req, res) => {
  const { limit = 1000 } = req.query;
  const data = adSamples.slice(-parseInt(limit));
  res.json({ success: true, data, total: adSamples.length });
});

// 手动查询各项指标
app.post('/api/query/:type', (req, res) => {
  const { type } = req.params;
  const channel = parseInt(req.body.channel) || 0x01;
  let success = false;
  switch (type) {
    case 'vitals': success = sendCommand(protocol.buildQueryVitals(channel)); break;
    case 'sleep': success = sendCommand(protocol.buildQuerySleep(channel)); break;
    case 'fatigue': success = sendCommand(protocol.buildQueryFatigue(channel)); break;
    case 'breath': success = sendCommand(protocol.buildQueryBreath(channel)); break;
    case 'stress': success = sendCommand(protocol.buildQueryStress(channel)); break;
    case 'ad': success = sendCommand(protocol.buildQueryAD(channel)); break;
    default: return res.json({ success: false, error: '未知查询类型' });
  }
  res.json({ success });
});

// 导出数据为 CSV
app.get('/api/export', (req, res) => {
  const csvHeader = '时间,心率,呼吸率,在离床状态,睡眠分期,疲劳度,憋气状态,情绪压力\n';
  const csvRows = historyData.map(d => {
    const time = new Date(d.timestamp).toLocaleString('zh-CN');
    return `${time},${d.heartRate},${d.respiratoryRate},${d.bedStateText},${d.sleepText},${d.fatigue},${d.breathHoldText},${d.stressValue}`;
  }).join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=sleep_data_${Date.now()}.csv`);
  res.send('\uFEFF' + csvHeader + csvRows);
});

// 清除历史数据
app.post('/api/clearHistory', (req, res) => {
  historyData = [];
  adSamples = [];
  res.json({ success: true });
});

// ═══════════════════════════════════════════════════════════
//  Start Server
// ═══════════════════════════════════════════════════════════

server.listen(API_PORT, () => {
  console.log(`[Server] API server running on port ${API_PORT}`);
  console.log(`[Server] WebSocket server running on port ${WS_PORT}`);

  // 通知主进程已就绪
  if (process.send) {
    process.send({ type: 'ready', apiPort: API_PORT, wsPort: WS_PORT });
  }
});
