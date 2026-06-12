import { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, Download } from 'lucide-react';
import { apiPost } from '../lib/api';
import type { useWebSocket } from '../hooks/useWebSocket';

interface WaveformPageProps {
  ws: ReturnType<typeof useWebSocket>;
}

export default function WaveformPage({ ws }: WaveformPageProps) {
  const { adData, deviceConnected, setAdData } = ws;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const [isRunning, setIsRunning] = useState(false);
  const [scale, setScale] = useState(1);
  const [autoScroll, setAutoScroll] = useState(true);

  // 开始/停止 AD 采样
  const toggleADReport = async () => {
    if (isRunning) {
      await apiPost('/api/switches', { ad: false });
      setIsRunning(false);
    } else {
      await apiPost('/api/switches', { ad: true });
      setIsRunning(true);
    }
  };

  // 清除波形
  const clearWaveform = () => {
    setAdData([]);
  };

  // 绘制波形
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      const { width, height } = canvas;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      ctx.scale(dpr, dpr);

      const w = canvas.clientWidth;
      const h = canvas.clientHeight;

      // 背景
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, w, h);

      // 网格
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 0.5;
      const gridSpacingY = h / 8;
      const gridSpacingX = w / 20;
      for (let i = 1; i < 8; i++) {
        ctx.beginPath();
        ctx.moveTo(0, i * gridSpacingY);
        ctx.lineTo(w, i * gridSpacingY);
        ctx.stroke();
      }
      for (let i = 1; i < 20; i++) {
        ctx.beginPath();
        ctx.moveTo(i * gridSpacingX, 0);
        ctx.lineTo(i * gridSpacingX, h);
        ctx.stroke();
      }

      // 中线
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();

      // 波形数据
      if (adData.length < 2) {
        // 无数据提示
        ctx.fillStyle = '#64748b';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('等待 AD 采样数据...', w / 2, h / 2);
        animFrameRef.current = requestAnimationFrame(draw);
        return;
      }

      // 计算显示范围
      const pointsToShow = Math.floor(w / scale);
      const startIdx = autoScroll
        ? Math.max(0, adData.length - pointsToShow)
        : 0;
      const visibleData = adData.slice(startIdx, startIdx + pointsToShow);

      // 找到数据范围
      let minVal = Infinity, maxVal = -Infinity;
      for (const v of visibleData) {
        if (v < minVal) minVal = v;
        if (v > maxVal) maxVal = v;
      }
      if (minVal === maxVal) { minVal -= 100; maxVal += 100; }
      const range = maxVal - minVal;
      const padding = range * 0.1;

      // 绘制波形
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < visibleData.length; i++) {
        const x = (i / visibleData.length) * w;
        const y = h - ((visibleData[i] - minVal + padding) / (range + 2 * padding)) * h;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Y 轴标签
      ctx.fillStyle = '#64748b';
      ctx.font = '10px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`${maxVal.toFixed(0)}`, 4, 14);
      ctx.fillText(`${minVal.toFixed(0)}`, 4, h - 4);

      // 数据统计
      ctx.textAlign = 'right';
      ctx.fillText(`采样点: ${adData.length}`, w - 8, 14);
      ctx.fillText(`显示: ${visibleData.length}`, w - 8, 28);

      animFrameRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [adData, scale, autoScroll]);

  return (
    <div className="space-y-4 animate-slide-in h-full flex flex-col">
      {/* 标题和控制 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">AD 采样波形</h2>
          <p className="text-dark-400 text-sm mt-1">
            实时显示传感器原始 AD 采样数据波形（125Hz，每秒125个采样点）
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleADReport}
            disabled={!deviceConnected}
            className={isRunning ? 'btn-danger' : 'btn-success'}
          >
            {isRunning ? <><Pause className="w-4 h-4 mr-1 inline" />停止采集</> : <><Play className="w-4 h-4 mr-1 inline" />开始采集</>}
          </button>
          <button onClick={clearWaveform} className="btn-ghost">
            <RotateCcw className="w-4 h-4 mr-1 inline" />清除
          </button>
        </div>
      </div>

      {/* 控制面板 */}
      <div className="card flex items-center gap-6">
        <div className="flex items-center gap-2">
          <span className="text-sm text-dark-400">缩放:</span>
          <input
            type="range"
            min="0.5"
            max="5"
            step="0.1"
            value={scale}
            onChange={(e) => setScale(parseFloat(e.target.value))}
            className="w-32"
          />
          <span className="text-sm text-dark-300">{scale.toFixed(1)}x</span>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
            className="w-4 h-4 rounded bg-dark-700 border-dark-600 text-primary-600 focus:ring-primary-500"
          />
          <span className="text-sm text-dark-300">自动滚动</span>
        </label>
        <div className="flex-1" />
        <div className="text-sm text-dark-400">
          总采样点: <span className="text-white font-mono">{adData.length}</span>
        </div>
      </div>

      {/* 波形画布 */}
      <div className="card flex-1 !p-2">
        <canvas
          ref={canvasRef}
          className="w-full h-full rounded-lg"
          style={{ minHeight: '400px' }}
        />
      </div>
    </div>
  );
}
