import { useState, useEffect } from 'react';
import { Plug, Unplug, RefreshCw, Clock, Sliders, ToggleLeft, ToggleRight, Info, Cpu } from 'lucide-react';
import { apiGet, apiPost } from '../lib/api';
import type { useWebSocket } from '../hooks/useWebSocket';

interface SettingsPageProps {
  ws: ReturnType<typeof useWebSocket>;
}

interface PortInfo {
  path: string;
  manufacturer?: string;
  vendorId?: string;
  productId?: string;
}

export default function SettingsPage({ ws }: SettingsPageProps) {
  const { deviceConnected, devicePort, deviceInfo, switches, thresholds } = ws;
  const [ports, setPorts] = useState<PortInfo[]>([]);
  const [selectedPort, setSelectedPort] = useState('');
  const [loading, setLoading] = useState(false);
  const [onThreshold, setOnThreshold] = useState(thresholds.onThreshold);
  const [offThreshold, setOffThreshold] = useState(thresholds.offThreshold);
  const [pollInterval, setPollInterval] = useState(2000);
  const [isPolling, setIsPolling] = useState(false);

  useEffect(() => {
    setOnThreshold(thresholds.onThreshold);
    setOffThreshold(thresholds.offThreshold);
  }, [thresholds]);

  // 扫描串口
  const scanPorts = async () => {
    setLoading(true);
    try {
      const res = await apiGet('/api/ports');
      if (res.success) {
        setPorts(res.ports);
        if (res.ports.length > 0 && !selectedPort) {
          setSelectedPort(res.ports[0].path);
        }
      }
    } catch (e) {
      console.error('Scan failed:', e);
    }
    setLoading(false);
  };

  useEffect(() => { scanPorts(); }, []);

  // 连接
  const handleConnect = async () => {
    if (!selectedPort) return;
    setLoading(true);
    try {
      await apiPost('/api/connect', { port: selectedPort });
    } catch (e) {
      console.error('Connect failed:', e);
    }
    setLoading(false);
  };

  // 断开
  const handleDisconnect = async () => {
    setLoading(true);
    try {
      await apiPost('/api/disconnect');
    } catch (e) {
      console.error('Disconnect failed:', e);
    }
    setLoading(false);
  };

  // 同步时间
  const handleSyncTime = async () => {
    await apiPost('/api/syncTime');
  };

  // 设置阈值
  const handleSetThreshold = async () => {
    await apiPost('/api/threshold', { onThreshold, offThreshold });
  };

  // 设置开关
  const handleToggleSwitch = async (type: string, value: boolean) => {
    await apiPost('/api/switches', { [type]: value });
  };

  // 轮询控制
  const handleTogglePolling = async () => {
    if (isPolling) {
      await apiPost('/api/polling/stop');
      setIsPolling(false);
    } else {
      await apiPost('/api/polling/start', { interval: pollInterval });
      setIsPolling(true);
    }
  };

  return (
    <div className="space-y-6 animate-slide-in max-w-4xl">
      <div>
        <h2 className="text-2xl font-bold text-white">设备设置</h2>
        <p className="text-dark-400 text-sm mt-1">管理串口连接、设备配置和数据上报</p>
      </div>

      {/* 串口连接 */}
      <div className="card">
        <h3 className="card-header flex items-center gap-2">
          <Plug className="w-4 h-4" />串口连接
        </h3>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <select
              value={selectedPort}
              onChange={(e) => setSelectedPort(e.target.value)}
              className="input flex-1"
              disabled={deviceConnected}
            >
              <option value="">选择串口...</option>
              {ports.map(p => (
                <option key={p.path} value={p.path}>
                  {p.path} {p.manufacturer ? `(${p.manufacturer})` : ''}
                </option>
              ))}
            </select>
            <button onClick={scanPorts} disabled={loading} className="btn-ghost">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <div className="flex items-center gap-3">
            {!deviceConnected ? (
              <button onClick={handleConnect} disabled={!selectedPort || loading} className="btn-success">
                <Plug className="w-4 h-4 mr-1 inline" />连接设备
              </button>
            ) : (
              <button onClick={handleDisconnect} disabled={loading} className="btn-danger">
                <Unplug className="w-4 h-4 mr-1 inline" />断开连接
              </button>
            )}
            <span className={`text-sm ${deviceConnected ? 'text-emerald-400' : 'text-dark-400'}`}>
              {deviceConnected ? `已连接: ${devicePort}` : '未连接'}
            </span>
          </div>
        </div>
      </div>

      {/* 设备信息 */}
      <div className="card">
        <h3 className="card-header flex items-center gap-2">
          <Cpu className="w-4 h-4" />设备信息
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="text-xs text-dark-400">设备 SN</span>
            <p className="text-white font-mono">{deviceInfo.sn || '--'}</p>
          </div>
          <div>
            <span className="text-xs text-dark-400">通道数</span>
            <p className="text-white font-mono">{deviceInfo.channelCount || '--'}</p>
          </div>
          <div>
            <span className="text-xs text-dark-400">固件版本</span>
            <p className="text-white font-mono">{deviceInfo.softwareVersion || '--'}</p>
          </div>
          <div>
            <span className="text-xs text-dark-400">硬件版本</span>
            <p className="text-white font-mono">{deviceInfo.hardwareVersion || '--'}</p>
          </div>
        </div>
      </div>

      {/* 时间同步 */}
      <div className="card">
        <h3 className="card-header flex items-center gap-2">
          <Clock className="w-4 h-4" />时间同步
        </h3>
        <div className="flex items-center gap-4">
          <button onClick={handleSyncTime} disabled={!deviceConnected} className="btn-primary">
            <Clock className="w-4 h-4 mr-1 inline" />同步系统时间
          </button>
          <span className="text-sm text-dark-400">
            将当前电脑时间同步到设备
          </span>
        </div>
      </div>

      {/* 压力阈值 */}
      <div className="card">
        <h3 className="card-header flex items-center gap-2">
          <Sliders className="w-4 h-4" />传感器压力阈值
        </h3>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-dark-400 block mb-1">在床阈值</label>
              <input
                type="number"
                value={onThreshold}
                onChange={(e) => setOnThreshold(parseInt(e.target.value) || 0)}
                className="input"
                min={0}
                max={65535}
              />
            </div>
            <div>
              <label className="text-xs text-dark-400 block mb-1">离床阈值</label>
              <input
                type="number"
                value={offThreshold}
                onChange={(e) => setOffThreshold(parseInt(e.target.value) || 0)}
                className="input"
                min={0}
                max={65535}
              />
            </div>
          </div>
          <button onClick={handleSetThreshold} disabled={!deviceConnected} className="btn-primary">
            保存阈值
          </button>
        </div>
      </div>

      {/* 自动上报开关 */}
      <div className="card">
        <h3 className="card-header flex items-center gap-2">
          <ToggleLeft className="w-4 h-4" />自动上报开关
        </h3>
        <div className="space-y-3">
          {[
            { key: 'vitals', label: '心率/呼吸率/在离床/体动', value: switches.vitalsReport },
            { key: 'ad', label: 'AD 采样数据', value: switches.adReport },
            { key: 'sleep', label: '睡眠/疲劳/憋气/情绪压力', value: switches.sleepReport },
          ].map(item => (
            <div key={item.key} className="flex items-center justify-between py-2 border-b border-dark-700/50 last:border-0">
              <span className="text-sm text-dark-200">{item.label}</span>
              <button
                onClick={() => handleToggleSwitch(item.key, !item.value)}
                disabled={!deviceConnected}
                className={`switch ${item.value ? 'switch-on' : 'switch-off'}`}
              >
                <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                  item.value ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* 轮询模式 */}
      <div className="card">
        <h3 className="card-header flex items-center gap-2">
          <RefreshCw className="w-4 h-4" />轮询模式
        </h3>
        <div className="space-y-4">
          <p className="text-xs text-dark-400">
            当设备未开启自动上报时，可使用轮询模式主动查询数据
          </p>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm text-dark-300">间隔:</label>
              <input
                type="number"
                value={pollInterval}
                onChange={(e) => setPollInterval(parseInt(e.target.value) || 2000)}
                className="input w-24"
                min={500}
                max={10000}
                step={500}
              />
              <span className="text-xs text-dark-400">ms</span>
            </div>
            <button
              onClick={handleTogglePolling}
              disabled={!deviceConnected}
              className={isPolling ? 'btn-danger' : 'btn-success'}
            >
              {isPolling ? '停止轮询' : '开始轮询'}
            </button>
          </div>
        </div>
      </div>

      {/* 协议信息 */}
      <div className="card">
        <h3 className="card-header flex items-center gap-2">
          <Info className="w-4 h-4" />通信协议
        </h3>
        <div className="text-sm text-dark-300 space-y-1">
          <p>协议版本: V1.3 | 波特率: 115200 | 数据位: 8 | 停止位: 1 | 校验: None</p>
          <p>帧头: 0xAA55 | 帧尾: 0xFEEF | CRC32: poly=0x04C11DB7</p>
        </div>
      </div>
    </div>
  );
}
