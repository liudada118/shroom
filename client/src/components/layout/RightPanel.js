import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useEquipStore } from '../../store/equipStore'
import { shallow } from 'zustand/shallow'
import { Scheduler } from '../../scheduler/scheduler'
import './RightPanel.scss'

/**
 * 右侧面板：ADC 颜色范围双端滑条 + 实时统计
 * - ADC 范围 0~255，上限默认 200，下限默认 5
 * - 两端均可独立拖拽，持久化到 localStorage
 * - 统计数据通过 chartRef 实时读取
 */
export default function RightPanel({ chartRef }) {
  const adcUpper = useEquipStore(s => s.adcUpper, shallow)
  const adcLower = useEquipStore(s => s.adcLower, shallow)
  const setAdcUpper = useEquipStore(s => s.setAdcUpper)
  const setAdcLower = useEquipStore(s => s.setAdcLower)
  const systemType = useEquipStore(s => s.systemType, shallow)

  // 实时统计（每帧更新）
  const [stats, setStats] = useState({
    pressAver: '--', pressMax: '--', pressTotal: '--',
    areaTotal: '--', pointTotal: '--'
  })

  // 滑条拖拽状态
  const sliderRef = useRef(null)
  const draggingRef = useRef(null) // 'upper' | 'lower' | null

  // 定时读取统计数据
  useEffect(() => {
    let rafId
    const update = () => {
      if (chartRef?.current) {
        const sysType = useEquipStore.getState().systemType
        // 尝试读取 sit 或 back 或 sysType 的数据
        const keys = Object.keys(chartRef.current)
        if (keys.length > 0) {
          // 优先读取当前显示类型
          const displayType = useEquipStore.getState().displayType
          let key = keys[0]
          if (displayType.includes('back') && keys.find(k => k === 'back')) key = 'back'
          else if (displayType.includes('sit') && keys.find(k => k === 'sit')) key = 'sit'
          const d = chartRef.current[key]?.data
          if (d) {
            setStats({
              pressAver: d.pressAver != null ? Number(d.pressAver).toFixed(1) : '--',
              pressMax: d.pressMax != null ? Number(d.pressMax).toFixed(1) : '--',
              pressTotal: d.pressTotal != null ? Number(d.pressTotal).toFixed(1) : '--',
              areaTotal: d.areaTotal != null ? d.areaTotal : '--',
              pointTotal: d.areaTotal != null ? d.areaTotal : '--',
            })
          }
        }
      }
      rafId = requestAnimationFrame(update)
    }
    rafId = requestAnimationFrame(update)
    return () => cancelAnimationFrame(rafId)
  }, [chartRef])

  // ── 滑条交互 ──────────────────────────────────────────────
  const SLIDER_H = 280 // 滑条高度 px
  const ADC_MIN = 0
  const ADC_MAX = 255

  // 将 ADC 值转换为滑条位置（百分比，0=底部，1=顶部）
  const adcToRatio = (v) => (v - ADC_MIN) / (ADC_MAX - ADC_MIN)
  // 将滑条位置转换为 ADC 值
  const ratioToAdc = (r) => Math.round(ADC_MIN + r * (ADC_MAX - ADC_MIN))

  const getSliderRatio = useCallback((clientY) => {
    if (!sliderRef.current) return 0
    const rect = sliderRef.current.getBoundingClientRect()
    // 顶部 = 255，底部 = 0
    const ratio = 1 - (clientY - rect.top) / rect.height
    return Math.max(0, Math.min(1, ratio))
  }, [])

  const onMouseDown = useCallback((e, which) => {
    e.preventDefault()
    draggingRef.current = which
  }, [])

  useEffect(() => {
    const onMove = (e) => {
      if (!draggingRef.current) return
      const clientY = e.touches ? e.touches[0].clientY : e.clientY
      const ratio = getSliderRatio(clientY)
      const val = ratioToAdc(ratio)
      if (draggingRef.current === 'upper') {
        const newUpper = Math.max(adcLower + 1, val)
        setAdcUpper(newUpper)
      } else {
        const newLower = Math.min(adcUpper - 1, val)
        setAdcLower(newLower)
      }
    }
    const onUp = () => { draggingRef.current = null }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onUp)
    }
  }, [adcUpper, adcLower, getSliderRatio, setAdcUpper, setAdcLower])

  // 输入框直接修改
  const handleUpperInput = (e) => {
    const v = parseInt(e.target.value)
    if (!isNaN(v)) setAdcUpper(Math.max(adcLower + 1, Math.min(255, v)))
  }
  const handleLowerInput = (e) => {
    const v = parseInt(e.target.value)
    if (!isNaN(v)) setAdcLower(Math.min(adcUpper - 1, Math.max(0, v)))
  }

  const upperRatio = adcToRatio(adcUpper)
  const lowerRatio = adcToRatio(adcLower)

  // 刻度
  const ticks = [255, 200, 150, 100, 50, 0]

  return (
    <div className="right-panel">
      {/* ── 颜色调节 ─────────────────────────────────── */}
      <div className="rp-card rp-color">
        <div className="rp-card-title">颜色调节</div>
        <div className="rp-card-subtitle">ADC 范围 0~255</div>

        <div className="rp-slider-wrap">
          {/* 左侧标签 */}
          <div className="rp-labels">
            <span
              className="rp-label upper"
              style={{ bottom: `${upperRatio * SLIDER_H - 10}px` }}
            >
              {adcUpper}
            </span>
            <span
              className="rp-label lower"
              style={{ bottom: `${lowerRatio * SLIDER_H - 10}px` }}
            >
              {adcLower}
            </span>
          </div>

          {/* 渐变滑条 */}
          <div
            className="rp-slider-track"
            ref={sliderRef}
            style={{ height: SLIDER_H }}
          >
            {/* 超出范围的灰色遮罩 */}
            <div
              className="rp-mask top"
              style={{ height: `${(1 - upperRatio) * 100}%` }}
            />
            <div
              className="rp-mask bottom"
              style={{ height: `${lowerRatio * 100}%` }}
            />

            {/* 上限拖拽手柄 */}
            <div
              className="rp-handle upper"
              style={{ bottom: `${upperRatio * SLIDER_H - 8}px` }}
              onMouseDown={(e) => onMouseDown(e, 'upper')}
              onTouchStart={(e) => onMouseDown(e, 'upper')}
            >
              <span className="rp-handle-arrow">▶</span>
            </div>

            {/* 下限拖拽手柄 */}
            <div
              className="rp-handle lower"
              style={{ bottom: `${lowerRatio * SLIDER_H - 8}px` }}
              onMouseDown={(e) => onMouseDown(e, 'lower')}
              onTouchStart={(e) => onMouseDown(e, 'lower')}
            >
              <span className="rp-handle-arrow">▶</span>
            </div>
          </div>

          {/* 右侧刻度 */}
          <div className="rp-ticks" style={{ height: SLIDER_H }}>
            {ticks.map(v => (
              <div
                key={v}
                className="rp-tick"
                style={{ bottom: `${adcToRatio(v) * SLIDER_H}px` }}
              >
                <span className="rp-tick-line" />
                <span className="rp-tick-label">{v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 数值输入 */}
        <div className="rp-inputs">
          <div className="rp-input-row">
            <span className="rp-input-label">上限</span>
            <input
              className="rp-input"
              type="number"
              min={adcLower + 1}
              max={255}
              value={adcUpper}
              onChange={handleUpperInput}
            />
          </div>
          <div className="rp-input-row">
            <span className="rp-input-label">下限</span>
            <input
              className="rp-input"
              type="number"
              min={0}
              max={adcUpper - 1}
              value={adcLower}
              onChange={handleLowerInput}
            />
          </div>
        </div>
      </div>

      {/* ── 实时统计 ─────────────────────────────────── */}
      <div className="rp-card rp-stats">
        <div className="rp-card-title">实时统计</div>
        <div className="rp-stat-list">
          <div className="rp-stat-row">
            <span className="rp-stat-label">平均压强</span>
            <span className="rp-stat-value">{stats.pressAver}</span>
            <span className="rp-stat-unit">kPa</span>
          </div>
          <div className="rp-stat-row">
            <span className="rp-stat-label">最大压强</span>
            <span className="rp-stat-value">{stats.pressMax}</span>
            <span className="rp-stat-unit">kPa</span>
          </div>
          <div className="rp-stat-row">
            <span className="rp-stat-label">压力总和</span>
            <span className="rp-stat-value">{stats.pressTotal}</span>
            <span className="rp-stat-unit">N</span>
          </div>
          <div className="rp-stat-row">
            <span className="rp-stat-label">面积</span>
            <span className="rp-stat-value">{stats.areaTotal}</span>
            <span className="rp-stat-unit">cm²</span>
          </div>
          <div className="rp-stat-row">
            <span className="rp-stat-label">点数</span>
            <span className="rp-stat-value">{stats.pointTotal}</span>
            <span className="rp-stat-unit"></span>
          </div>
        </div>
      </div>
    </div>
  )
}
