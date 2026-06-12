import { Heart, Wind, BedDouble, Brain, Battery, AlertTriangle, Zap, TrendingUp } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import type { useWebSocket } from '../hooks/useWebSocket';

interface DashboardProps {
  ws: ReturnType<typeof useWebSocket>;
}

export default function Dashboard({ ws }: DashboardProps) {
  const { realtimeData, historyData, deviceConnected } = ws;

  // 准备图表数据
  const chartData = historyData.slice(-60).map((d, i) => ({
    time: new Date(d.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    heartRate: d.heartRate,
    respiratoryRate: d.respiratoryRate,
    stress: d.stressValue,
    fatigue: d.fatigue,
  }));

  const getSleepColor = (sleep: number) => {
    switch (sleep) {
      case 0: return 'text-yellow-400';
      case 1: return 'text-blue-300';
      case 2: return 'text-indigo-400';
      case 3: return 'text-purple-400';
      case 4: return 'text-gray-500';
      default: return 'text-gray-400';
    }
  };

  const getBedStateColor = (state: number) => {
    switch (state) {
      case 0: return 'text-gray-500';
      case 1: return 'text-emerald-400';
      case 2: return 'text-amber-400';
      default: return 'text-gray-400';
    }
  };

  const getStressColor = (value: number) => {
    if (value < 50) return 'text-emerald-400';
    if (value <= 150) return 'text-blue-400';
    if (value <= 500) return 'text-amber-400';
    if (value <= 900) return 'text-orange-400';
    return 'text-red-400';
  };

  const getFatigueColor = (value: number) => {
    if (value === 0) return 'text-gray-500';
    if (value >= 36) return 'text-emerald-400';
    if (value >= 20) return 'text-amber-400';
    return 'text-red-400';
  };

  return (
    <div className="space-y-6 animate-slide-in">
      {/* 标题栏 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">实时监测</h2>
          <p className="text-dark-400 text-sm mt-1">
            {deviceConnected ? '设备已连接，正在接收数据...' : '等待设备连接...'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${deviceConnected ? 'bg-emerald-500 animate-pulse-soft' : 'bg-dark-600'}`} />
          <span className="text-sm text-dark-400">
            {deviceConnected ? '在线' : '离线'}
          </span>
        </div>
      </div>

      {/* 核心指标卡片 */}
      <div className="grid grid-cols-4 gap-4">
        {/* 心率 */}
        <div className="card">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 bg-red-500/20 rounded-lg flex items-center justify-center">
              <Heart className="w-4 h-4 text-red-400" />
            </div>
            <span className="card-header !mb-0">心率</span>
          </div>
          <div className="flex items-baseline">
            <span className="stat-value text-red-400">{realtimeData.heartRate || '--'}</span>
            <span className="stat-unit">BPM</span>
          </div>
        </div>

        {/* 呼吸率 */}
        <div className="card">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 bg-cyan-500/20 rounded-lg flex items-center justify-center">
              <Wind className="w-4 h-4 text-cyan-400" />
            </div>
            <span className="card-header !mb-0">呼吸率</span>
          </div>
          <div className="flex items-baseline">
            <span className="stat-value text-cyan-400">{realtimeData.respiratoryRate || '--'}</span>
            <span className="stat-unit">次/分</span>
          </div>
        </div>

        {/* 在离床状态 */}
        <div className="card">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 bg-emerald-500/20 rounded-lg flex items-center justify-center">
              <BedDouble className="w-4 h-4 text-emerald-400" />
            </div>
            <span className="card-header !mb-0">在离床</span>
          </div>
          <div className={`stat-value text-xl ${getBedStateColor(realtimeData.bedState)}`}>
            {realtimeData.bedStateText}
          </div>
        </div>

        {/* 睡眠分期 */}
        <div className="card">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 bg-indigo-500/20 rounded-lg flex items-center justify-center">
              <Brain className="w-4 h-4 text-indigo-400" />
            </div>
            <span className="card-header !mb-0">睡眠分期</span>
          </div>
          <div className={`stat-value text-xl ${getSleepColor(realtimeData.sleep)}`}>
            {realtimeData.sleepText}
          </div>
        </div>
      </div>

      {/* 第二行指标 */}
      <div className="grid grid-cols-3 gap-4">
        {/* 疲劳度 */}
        <div className="card">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 bg-amber-500/20 rounded-lg flex items-center justify-center">
              <Battery className="w-4 h-4 text-amber-400" />
            </div>
            <span className="card-header !mb-0">疲劳度</span>
          </div>
          <div className="flex items-baseline gap-3">
            <span className={`stat-value ${getFatigueColor(realtimeData.fatigue)}`}>
              {realtimeData.fatigue || '--'}
            </span>
            <span className={`text-sm font-medium ${getFatigueColor(realtimeData.fatigue)}`}>
              {realtimeData.fatigueText}
            </span>
          </div>
          <div className="mt-2 h-2 bg-dark-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                realtimeData.fatigue >= 36 ? 'bg-emerald-500' :
                realtimeData.fatigue >= 20 ? 'bg-amber-500' : 'bg-red-500'
              }`}
              style={{ width: `${Math.min(100, (realtimeData.fatigue / 60) * 100)}%` }}
            />
          </div>
        </div>

        {/* 憋气状态 */}
        <div className="card">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 bg-orange-500/20 rounded-lg flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-orange-400" />
            </div>
            <span className="card-header !mb-0">憋气检测</span>
          </div>
          <div className={`stat-value text-xl ${
            realtimeData.breathHold === 1 ? 'text-red-400' : 'text-emerald-400'
          }`}>
            {realtimeData.breathHoldText}
          </div>
          {realtimeData.breathHold === 1 && (
            <div className="mt-2 flex items-center gap-1 text-red-400 text-xs">
              <AlertTriangle className="w-3 h-3" />
              <span>检测到憋气，请注意！</span>
            </div>
          )}
        </div>

        {/* 情绪压力 */}
        <div className="card">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 bg-purple-500/20 rounded-lg flex items-center justify-center">
              <Zap className="w-4 h-4 text-purple-400" />
            </div>
            <span className="card-header !mb-0">情绪压力</span>
          </div>
          <div className="flex items-baseline gap-3">
            <span className={`stat-value ${getStressColor(realtimeData.stressValue)}`}>
              {realtimeData.stressValue || '--'}
            </span>
            <span className={`text-sm font-medium ${getStressColor(realtimeData.stressValue)}`}>
              {realtimeData.stressText}
            </span>
          </div>
          <div className="mt-2 h-2 bg-dark-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                realtimeData.stressValue < 50 ? 'bg-emerald-500' :
                realtimeData.stressValue <= 150 ? 'bg-blue-500' :
                realtimeData.stressValue <= 500 ? 'bg-amber-500' : 'bg-red-500'
              }`}
              style={{ width: `${Math.min(100, (realtimeData.stressValue / 1000) * 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* 趋势图表 */}
      <div className="grid grid-cols-2 gap-4">
        {/* 心率趋势 */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-dark-400" />
            <span className="card-header !mb-0">心率 & 呼吸率趋势</span>
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                  labelStyle={{ color: '#94a3b8' }}
                />
                <Line type="monotone" dataKey="heartRate" stroke="#f87171" strokeWidth={2} dot={false} name="心率" />
                <Line type="monotone" dataKey="respiratoryRate" stroke="#22d3ee" strokeWidth={2} dot={false} name="呼吸率" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 压力趋势 */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-dark-400" />
            <span className="card-header !mb-0">情绪压力趋势</span>
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                  labelStyle={{ color: '#94a3b8' }}
                />
                <Area type="monotone" dataKey="stress" stroke="#a78bfa" fill="#a78bfa20" strokeWidth={2} name="压力值" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
