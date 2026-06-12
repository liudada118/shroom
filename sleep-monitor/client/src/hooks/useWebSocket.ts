import { useEffect, useRef, useState, useCallback } from 'react';
import { WS_URL } from '../lib/api';

export interface RealtimeData {
  heartRate: number;
  respiratoryRate: number;
  bedState: number;
  bedStateText: string;
  sleep: number;
  sleepText: string;
  fatigue: number;
  fatigueText: string;
  breathHold: number;
  breathHoldText: string;
  stressValue: number;
  stressText: string;
  timestamp: number;
}

export interface DeviceInfo {
  sn: string;
  softwareVersion: string;
  hardwareVersion: string;
  channelCount: number;
}

export interface Switches {
  vitalsReport: boolean;
  adReport: boolean;
  sleepReport: boolean;
  transparentReport: boolean;
}

export interface Thresholds {
  onThreshold: number;
  offThreshold: number;
}

export interface ADDataEvent {
  samples: number[];
  timestamp: number;
}

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<number | null>(null);

  const [connected, setConnected] = useState(false);
  const [deviceConnected, setDeviceConnected] = useState(false);
  const [devicePort, setDevicePort] = useState('');
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo>({
    sn: '', softwareVersion: '', hardwareVersion: '', channelCount: 0,
  });
  const [switches, setSwitches] = useState<Switches>({
    vitalsReport: false, adReport: false, sleepReport: false, transparentReport: false,
  });
  const [thresholds, setThresholds] = useState<Thresholds>({ onThreshold: 0, offThreshold: 0 });
  const [realtimeData, setRealtimeData] = useState<RealtimeData>({
    heartRate: 0, respiratoryRate: 0,
    bedState: 0, bedStateText: '离床',
    sleep: 0, sleepText: '离床',
    fatigue: 0, fatigueText: '离床',
    breathHold: 0, breathHoldText: '正常呼吸',
    stressValue: 0, stressText: '未知',
    timestamp: Date.now(),
  });
  const [adData, setAdData] = useState<number[]>([]);
  const [historyData, setHistoryData] = useState<RealtimeData[]>([]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      console.log('[WS] Connected');
    };

    ws.onclose = () => {
      setConnected(false);
      console.log('[WS] Disconnected, reconnecting in 3s...');
      reconnectTimer.current = window.setTimeout(connect, 3000);
    };

    ws.onerror = (err) => {
      console.error('[WS] Error:', err);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleMessage(msg);
      } catch (e) {
        console.error('[WS] Parse error:', e);
      }
    };
  }, []);

  const handleMessage = useCallback((msg: any) => {
    switch (msg.type) {
      case 'status':
        setDeviceConnected(msg.data.connected);
        setDevicePort(msg.data.port || '');
        if (msg.data.deviceInfo) setDeviceInfo(msg.data.deviceInfo);
        if (msg.data.switches) setSwitches(msg.data.switches);
        if (msg.data.thresholds) setThresholds(msg.data.thresholds);
        if (msg.data.realtimeData) setRealtimeData(msg.data.realtimeData);
        break;
      case 'vitals':
      case 'sleep':
      case 'fatigue':
      case 'breath':
      case 'stress':
      case 'sleepGroup':
        setRealtimeData(prev => ({ ...prev, ...msg.data }));
        setHistoryData(prev => {
          const next = [...prev, { ...msg.data, timestamp: msg.timestamp || Date.now() }];
          return next.slice(-360); // 保留最近 6 分钟
        });
        break;
      case 'deviceInfo':
        setDeviceInfo(msg.data);
        break;
      case 'switches':
        setSwitches(msg.data);
        break;
      case 'thresholds':
        setThresholds(msg.data);
        break;
      case 'adData':
        setAdData(prev => {
          const next = [...prev, ...msg.data.samples];
          return next.slice(-2500); // 保留最近 10 秒
        });
        break;
      case 'error':
        console.error('[Device] Error:', msg.data.message);
        break;
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [connect]);

  return {
    connected,
    deviceConnected,
    devicePort,
    deviceInfo,
    switches,
    thresholds,
    realtimeData,
    adData,
    historyData,
    setAdData,
  };
}
