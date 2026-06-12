import { useState } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import WaveformPage from './pages/WaveformPage';
import SettingsPage from './pages/SettingsPage';
import HistoryPage from './pages/HistoryPage';

export type PageType = 'dashboard' | 'waveform' | 'history' | 'settings';

function App() {
  const [currentPage, setCurrentPage] = useState<PageType>('dashboard');
  const ws = useWebSocket();

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard ws={ws} />;
      case 'waveform':
        return <WaveformPage ws={ws} />;
      case 'history':
        return <HistoryPage ws={ws} />;
      case 'settings':
        return <SettingsPage ws={ws} />;
      default:
        return <Dashboard ws={ws} />;
    }
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        currentPage={currentPage}
        onPageChange={setCurrentPage}
        connected={ws.connected}
        deviceConnected={ws.deviceConnected}
        devicePort={ws.devicePort}
      />
      <main className="flex-1 overflow-y-auto p-6">
        {renderPage()}
      </main>
    </div>
  );
}

export default App;
