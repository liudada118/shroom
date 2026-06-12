import { Activity, BarChart3, Settings, History, Wifi, WifiOff, Moon } from 'lucide-react';
import type { PageType } from '../App';

interface SidebarProps {
  currentPage: PageType;
  onPageChange: (page: PageType) => void;
  connected: boolean;
  deviceConnected: boolean;
  devicePort: string;
}

const navItems: { id: PageType; label: string; icon: any }[] = [
  { id: 'dashboard', label: '实时监测', icon: Activity },
  { id: 'waveform', label: 'AD波形', icon: BarChart3 },
  { id: 'history', label: '历史数据', icon: History },
  { id: 'settings', label: '设备设置', icon: Settings },
];

export default function Sidebar({ currentPage, onPageChange, connected, deviceConnected, devicePort }: SidebarProps) {
  return (
    <aside className="w-64 bg-dark-950 border-r border-dark-700 flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-dark-700">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center">
            <Moon className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">睡眠监护仪</h1>
            <p className="text-xs text-dark-400">Sleep Monitor V1.0</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map(item => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onPageChange(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                isActive
                  ? 'bg-primary-600/20 text-primary-400 border border-primary-600/30'
                  : 'text-dark-300 hover:bg-dark-800 hover:text-white'
              }`}
            >
              <Icon className="w-5 h-5" />
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Connection Status */}
      <div className="p-4 border-t border-dark-700">
        <div className="card !p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-dark-400">服务连接</span>
            {connected ? (
              <span className="badge-success">
                <Wifi className="w-3 h-3 mr-1" />在线
              </span>
            ) : (
              <span className="badge-danger">
                <WifiOff className="w-3 h-3 mr-1" />离线
              </span>
            )}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-dark-400">设备状态</span>
            {deviceConnected ? (
              <span className="badge-success">已连接</span>
            ) : (
              <span className="badge-warning">未连接</span>
            )}
          </div>
          {devicePort && (
            <div className="text-xs text-dark-500 truncate">
              端口: {devicePort}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
