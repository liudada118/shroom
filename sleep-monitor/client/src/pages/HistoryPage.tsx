import { useState } from 'react';
import { Download, Trash2, RefreshCw } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { apiGet, apiPost, API_BASE } from '../lib/api';
import type { useWebSocket } from '../hooks/useWebSocket';

interface HistoryPageProps {
  ws: ReturnType<typeof useWebSocket>;
}

export default function HistoryPage({ ws }: HistoryPageProps) {
  const { historyData } = ws;
  const [loading, setLoading] = useState(false);

  const chartData = historyData.map((d, i) => ({
    time: new Date(d.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    heartRate: d.heartRate,
    respiratoryRate: d.respiratoryRate,
    fatigue: d.fatigue,
    stress: d.stressValue,
    sleep: d.sleep,
  }));

  const handleExport = () => {
    window.open(`${API_BASE}/api/export`, '_blank');
  };

  const handleClear = async () => {
    if (confirm('确定要清除所有历史数据吗？')) {
      await apiPost('/api/clearHistory');
    }
  };

  // 睡眠分期统计
  const sleepStats = historyData.reduce((acc, d) => {
    const key = d.sleepText || '未知';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const totalRecords = historyData.length;

  return (
    <div className="space-y-6 animate-slide-in">
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">历史数据</h2>
          <p className="text-dark-400 text-sm mt-1">
            已记录 {totalRecords} 条数据
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExport} className="btn-primary">
            <Download className="w-4 h-4 mr-1 inline" />导出CSV
          </button>
          <button onClick={handleClear} className="btn-danger">
            <Trash2 className="w-4 h-4 mr-1 inline" />清除
          </button>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-5 gap-4">
        {Object.entries(sleepStats).map(([label, count]) => (
          <div key={label} className="card text-center">
            <div className="text-2xl font-bold text-white">{count}</div>
            <div className="text-xs text-dark-400 mt-1">{label}</div>
            <div className="text-xs text-dark-500">
              {totalRecords > 0 ? ((count / totalRecords) * 100).toFixed(1) : 0}%
            </div>
          </div>
        ))}
      </div>

      {/* 综合趋势图 */}
      <div className="card">
        <h3 className="card-header">心率 & 呼吸率历史趋势</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#64748b' }} />
              <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                labelStyle={{ color: '#94a3b8' }}
              />
              <Legend />
              <Line type="monotone" dataKey="heartRate" stroke="#f87171" strokeWidth={2} dot={false} name="心率(BPM)" />
              <Line type="monotone" dataKey="respiratoryRate" stroke="#22d3ee" strokeWidth={2} dot={false} name="呼吸率(次/分)" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 数据表格 */}
      <div className="card">
        <h3 className="card-header">最近数据记录</h3>
        <div className="overflow-x-auto max-h-80 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-dark-800">
              <tr className="text-dark-400 border-b border-dark-700">
                <th className="text-left py-2 px-3">时间</th>
                <th className="text-center py-2 px-3">心率</th>
                <th className="text-center py-2 px-3">呼吸率</th>
                <th className="text-center py-2 px-3">在离床</th>
                <th className="text-center py-2 px-3">睡眠分期</th>
                <th className="text-center py-2 px-3">疲劳度</th>
                <th className="text-center py-2 px-3">憋气</th>
                <th className="text-center py-2 px-3">压力值</th>
              </tr>
            </thead>
            <tbody>
              {historyData.slice(-50).reverse().map((d, i) => (
                <tr key={i} className="border-b border-dark-700/50 hover:bg-dark-700/30">
                  <td className="py-2 px-3 text-dark-300 font-mono text-xs">
                    {new Date(d.timestamp).toLocaleTimeString('zh-CN')}
                  </td>
                  <td className="text-center py-2 px-3 text-red-400 font-mono">{d.heartRate}</td>
                  <td className="text-center py-2 px-3 text-cyan-400 font-mono">{d.respiratoryRate}</td>
                  <td className="text-center py-2 px-3">{d.bedStateText}</td>
                  <td className="text-center py-2 px-3">{d.sleepText}</td>
                  <td className="text-center py-2 px-3 font-mono">{d.fatigue}</td>
                  <td className="text-center py-2 px-3">{d.breathHoldText}</td>
                  <td className="text-center py-2 px-3 font-mono">{d.stressValue}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {historyData.length === 0 && (
            <div className="text-center py-12 text-dark-500">
              暂无历史数据，连接设备后数据将自动记录
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
