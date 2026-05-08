import React, { useCallback, useContext, useRef, useState } from 'react'
import './AppLayout.scss'
import { useEquipStore } from '../../store/equipStore'
import { shallow } from 'zustand/shallow'
import { pageContext } from '../../page/test/Test'
import axios from 'axios'
import { localAddress } from '../../util/constant'
import { withTranslation } from 'react-i18next'
import RightPanel from './RightPanel'
import { APP_VERSION } from '../../util/version'

// ── 导航项配置 ────────────────────────────────────────────
const NAV_ITEMS = [
  { key: 'measure',  icon: '&#xe60c;', label: '实时测量' },
  { key: 'history',  icon: '&#xe642;', label: '数据回放' },
  { key: 'calibrate',icon: '&#xe60e;', label: '校准' },
  { key: 'report',   icon: '&#xe609;', label: '报告' },
]

// ── 工具按钮配置 ──────────────────────────────────────────
function ToolBar({ onZero, onSelect, setOnSelect, onRuler, setOnRuler, onMagnifier, setOnMagnifier, onFlip }) {
  const tools = [
    { key: 'zero',      label: '预压力置零', icon: '&#xe604;', onClick: onZero,                        active: false },
    { key: 'select',    label: '框选',       icon: '&#xe60e;', onClick: () => setOnSelect(!onSelect),  active: onSelect },
    { key: 'ruler',     label: '量尺',       icon: '&#xe610;', onClick: () => setOnRuler(!onRuler),    active: onRuler },
    { key: 'magnifier', label: '放大镜',     icon: '&#xe61f;', onClick: () => setOnMagnifier(!onMagnifier), active: onMagnifier },
    { key: 'flip',      label: '画布翻转',   icon: '&#xe607;', onClick: onFlip,                        active: false },
  ]
  return (
    <div className="app-bottombar">
      {tools.map(t => (
        <button
          key={t.key}
          className={`tool-btn${t.active ? ' active' : ''}`}
          onClick={t.onClick}
          title={t.label}
        >
          <i className="iconfont tool-icon" dangerouslySetInnerHTML={{ __html: t.icon }} />
          <span>{t.label}</span>
        </button>
      ))}
    </div>
  )
}

// ── 主布局组件 ────────────────────────────────────────────
function AppLayout(props) {
  const { t, chartRef, threeRef, disPlayDataRef, playBack, changeWsLocalData, children } = props

  const [activeNav, setActiveNav] = useState('measure')
  const [activeView, setActiveView] = useState('3D整体') // '3D整体' | '坐垫' | '靠背'

  const systemType = useEquipStore(s => s.systemType, shallow)
  const systemTypeArr = useEquipStore(s => s.systemTypeArr, shallow)
  const equipStatus = useEquipStore(s => s.equipStatus, shallow)
  const setDisplay = useEquipStore(s => s.setDisplay)
  const setDisplayType = useEquipStore(s => s.setDisplayType)

  const pageInfo = useContext(pageContext)
  const { onSelect, setOnSelect, onRuler, setOnRuler, onMagnifier, setOnMagnifier } = pageInfo || {}

  // 连接状态
  const isOnline = equipStatus && Object.keys(equipStatus).length > 0 &&
    Object.values(equipStatus).some(v => v === 'online')

  // 一键连接
  const handleConnect = useCallback(() => {
    axios.get(`${localAddress}/connPort`).catch(() => {})
    axios.get(`${localAddress}/sendMac`).catch(() => {})
  }, [])

  // 采集控制（通过 ColAndHistory 内部状态，这里只触发 API）
  const [isCollecting, setIsCollecting] = useState(false)
  const colNameRef = useRef(String(Date.now()))

  const handleStart = useCallback(() => {
    if (isCollecting) return
    const fileName = Date.now()
    colNameRef.current = String(fileName)
    axios.post(`${localAddress}/startCol`, { fileName, HZ: 30 })
      .then(res => {
        if (res.data?.message !== 'error') setIsCollecting(true)
      })
      .catch(() => {})
  }, [isCollecting])

  const handleStop = useCallback(() => {
    if (!isCollecting) return
    axios.post(`${localAddress}/stopCol`, { fileName: colNameRef.current })
      .then(() => setIsCollecting(false))
      .catch(() => setIsCollecting(false))
  }, [isCollecting])

  // 导出报告（触发下载弹窗）
  const handleExport = useCallback(() => {
    // 通过触发 ColAndHistory 的下载逻辑
    // 这里暂时用 message 提示，实际下载逻辑在 ColAndHistory 中
    import('antd').then(({ message }) => {
      message.info('请在历史数据面板中选择数据后导出')
    })
  }, [])

  // 预压力置零
  const handleZero = useCallback(() => {
    if (changeWsLocalData) changeWsLocalData()
  }, [changeWsLocalData])

  // 画布翻转
  const handleFlip = useCallback(() => {
    // 触发 ViewSetting 中的翻转逻辑
    threeRef?.current?.changePointRotation?.(0)
  }, [threeRef])

  // 视图切换
  const handleViewChange = useCallback((view) => {
    setActiveView(view)
    if (view === '3D整体') {
      setDisplay('point3D')
      setDisplayType('all')
    } else if (view === '坐垫') {
      setDisplay('point3D')
      setDisplayType('sit')
    } else if (view === '靠背') {
      setDisplay('point3D')
      setDisplayType('back')
    }
  }, [setDisplay, setDisplayType])

  const views = ['3D整体', '坐垫', '靠背']

  // 设备类型显示名
  const deviceLabel = systemTypeArr?.find(a => a.value === systemType)?.label || systemType || '汽车座椅'

  return (
    <div className="app-layout">
      {/* ── 左侧导航 ─────────────────────────────── */}
      <aside className="app-sidebar">
        <div className="sidebar-logo">JQ</div>
        <nav className="sidebar-nav">
          {NAV_ITEMS.map(item => (
            <div
              key={item.key}
              className={`sidebar-nav-item${activeNav === item.key ? ' active' : ''}`}
              onClick={() => setActiveNav(item.key)}
              title={item.label}
            >
              <i className="iconfont nav-icon" dangerouslySetInnerHTML={{ __html: item.icon }} />
              <span className="nav-label">{item.label}</span>
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div
            className={`sidebar-nav-item${activeNav === 'settings' ? ' active' : ''}`}
            onClick={() => setActiveNav('settings')}
            title="系统设置"
          >
            <i className="iconfont nav-icon">&#xe60d;</i>
            <span className="nav-label">系统设置</span>
          </div>
        </div>
      </aside>

      {/* ── 右侧主区域 ───────────────────────────── */}
      <div className="app-main">
        {/* 顶部栏 */}
        <header className="app-topbar">
          <div className="topbar-brand">
            <span>JQ压力测量系统</span>
            <span className="brand-sep">/</span>
            <span className="brand-current">实时测量</span>
          </div>
          <div className="topbar-spacer" />
          <div className="topbar-device">
            <div className="device-select-btn">
              <span>{deviceLabel}</span>
              <span className="chevron">▾</span>
            </div>
            <div className="conn-status">
              <span className={`dot${isOnline ? ' online' : ''}`} />
              <span>{isOnline ? '已连接' : '未连接'}</span>
            </div>
          </div>
          <div className="topbar-actions">
            <button
              className="btn-start"
              onClick={isCollecting ? undefined : handleStart}
              disabled={isCollecting}
            >
              ▶ {isCollecting ? '采集中...' : '开始采集'}
            </button>
            <button
              className="btn-stop"
              onClick={handleStop}
            >
              ⏹ 停止采集
            </button>
            <button
              className="btn-export"
              onClick={handleExport}
            >
              📄 导出报告
            </button>
          </div>
        </header>

        {/* 视图切换 Tab */}
        <div className="app-viewtab">
          <div className="view-tab-group">
            {views.map(v => (
              <button
                key={v}
                className={`view-tab-btn${activeView === v ? ' active' : ''}`}
                onClick={() => handleViewChange(v)}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        {/* 内容区 */}
        <div className="app-content">
          {/* 主可视化区域 */}
          <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
            {children}
          </div>
          {/* 右侧面板 */}
          <RightPanel chartRef={chartRef} />
        </div>

        {/* 底部工具栏 */}
        <ToolBar
          onZero={handleZero}
          onSelect={onSelect}
          setOnSelect={setOnSelect}
          onRuler={onRuler}
          setOnRuler={setOnRuler}
          onMagnifier={onMagnifier}
          setOnMagnifier={setOnMagnifier}
          onFlip={handleFlip}
        />

        {/* 状态栏 */}
        <div className="app-statusbar">
          <div className={`status-item${isOnline ? ' conn-ok' : ''}`}>
            <span className={`dot${isOnline ? ' online' : ''}`}
              style={{ width: 7, height: 7, borderRadius: '50%', display: 'inline-block',
                background: isOnline ? '#10B981' : '#94A3B8', marginRight: 4 }} />
            {isOnline ? '连接正常' : '未连接'}
          </div>
          <span className="status-sep">|</span>
          <div className="status-item">设备: {systemType || '--'}</div>
          <span className="status-sep">|</span>
          <div className="status-item">版本: {APP_VERSION}</div>
        </div>
      </div>
    </div>
  )
}

export default withTranslation('translation')(AppLayout)
