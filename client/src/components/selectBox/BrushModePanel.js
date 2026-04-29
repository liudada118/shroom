import React, { useContext, useEffect, useState } from 'react'
import { Input, message, Modal } from 'antd'
import DraggablePanel from '../draggablePanel/DraggablePanel'
import { pageContext } from '../../page/test/Test'

const PANEL_W = 360   // 跟 SelectSet 宽度一致 (上下叠加)
const RIGHT_MARGIN = 20
const GAP_FROM_SELECTSET = 10

export default function BrushModePanel() {
    const pageInfo = useContext(pageContext)
    const brushInstance = pageInfo?.brushInstance
    const displayType = pageInfo?.displayType

    const [activeMode, setActiveMode] = useState('free')
    const [presets, setPresets] = useState([])
    const [editingId, setEditingId] = useState(null)
    const [editingName, setEditingName] = useState('')
    const [position, setPosition] = useState({
        x: Math.max(20, window.innerWidth - PANEL_W - RIGHT_MARGIN),
        y: 200,
    })

    // 订阅预设变化
    useEffect(() => {
        if (!brushInstance) return
        const cb = (list) => setPresets(list || [])
        cb(brushInstance.listPresets())
        brushInstance.subscribePresets(cb)
        return () => brushInstance.unsubscribePresets(cb)
    }, [brushInstance, displayType])

    // 跟随 SelectSet 实际高度: SelectSet 折叠/展开都自动调整 BrushModePanel 的 y
    useEffect(() => {
        const updatePos = () => {
            const targetX = Math.max(20, window.innerWidth - PANEL_W - RIGHT_MARGIN)
            const selectSet = document.querySelector('.select-set-panel')
            let targetY = 140 + 50 + GAP_FROM_SELECTSET    // 兜底: SelectSet 折叠高度
            if (selectSet) {
                const rect = selectSet.getBoundingClientRect()
                if (rect.bottom > 0) {
                    targetY = Math.round(rect.bottom + GAP_FROM_SELECTSET)
                }
            }
            setPosition(prev => (prev.x === targetX && prev.y === targetY) ? prev : { x: targetX, y: targetY })
        }
        updatePos()
        let observer
        if (window.ResizeObserver) {
            observer = new ResizeObserver(updatePos)
            const target = document.querySelector('.select-set-panel') || document.body
            observer.observe(target)
            // SelectSet 后挂载: 100ms 后再补一次 observe
            setTimeout(() => {
                const ss = document.querySelector('.select-set-panel')
                if (ss && ss !== target) observer.observe(ss)
            }, 100)
        }
        const id = setInterval(updatePos, 200)
        window.addEventListener('resize', updatePos)
        return () => {
            observer?.disconnect()
            clearInterval(id)
            window.removeEventListener('resize', updatePos)
        }
    }, [])

    // 保存当前框为新预设 (弹输入框)
    const handleSaveCurrent = () => {
        if (!brushInstance || !brushInstance.currentKey) {
            message.warning('请先切换到 2D 数字界面')
            return
        }
        if (!brushInstance.rangeArr.length) {
            message.warning('当前没有任何框可保存')
            return
        }
        let inputName = `${displayTypeLabel(displayType)} 预设 ${(presets.length || 0) + 1}`
        Modal.confirm({
            title: '保存当前框选为预设',
            content: (
                <Input
                    defaultValue={inputName}
                    autoFocus
                    onChange={(e) => { inputName = e.target.value }}
                    placeholder='预设名称'
                />
            ),
            okText: '保存',
            cancelText: '取消',
            onOk: () => {
                const preset = brushInstance.savePreset(inputName)
                if (preset) message.success(`已保存预设「${preset.name}」`)
            },
        })
    }

    // 加载预设
    const handleLoad = (preset) => {
        Modal.confirm({
            title: '加载预设',
            content: `当前框选会被「${preset.name}」覆盖,确定?`,
            okText: '加载',
            cancelText: '取消',
            onOk: () => {
                if (brushInstance.loadPreset(preset.id)) {
                    message.success(`已加载「${preset.name}」`)
                }
            },
        })
    }

    const handleDelete = (preset, e) => {
        e?.stopPropagation()
        Modal.confirm({
            title: '删除预设',
            content: `确定删除「${preset.name}」?`,
            okText: '删除',
            cancelText: '取消',
            okButtonProps: { danger: true },
            onOk: () => {
                brushInstance.deletePreset(preset.id)
                message.success('已删除')
            },
        })
    }

    const handleStartRename = (preset, e) => {
        e?.stopPropagation()
        setEditingId(preset.id)
        setEditingName(preset.name)
    }

    const handleConfirmRename = () => {
        if (editingId && editingName.trim()) {
            brushInstance.renamePreset(editingId, editingName)
        }
        setEditingId(null)
        setEditingName('')
    }

    return (
        <DraggablePanel
            title='框选模式 / 预设'
            defaultPosition={position}
            disableDrag={true}
            bodyMaxHeight={'calc(100vh - 280px)'}
        >
            <div style={{ width: `${PANEL_W - 24}px`, display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {/* 模式切换 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <div style={{ fontSize: '0.82rem', color: '#8C939D', marginBottom: '0.1rem', fontWeight: 500 }}>框选模式</div>
                    {[
                        { key: 'free', label: '自由框选', enabled: true },
                        { key: 'placeholder1', label: '待定', enabled: false },
                        { key: 'placeholder2', label: '待定', enabled: false },
                        { key: 'placeholder3', label: '待定', enabled: false },
                    ].map(m => {
                        const isActive = m.enabled && m.key === activeMode
                        return (
                            <div
                                key={m.key}
                                onClick={() => m.enabled && setActiveMode(m.key)}
                                style={{
                                    padding: '0.55rem 0.8rem',
                                    borderRadius: '0.4rem',
                                    background: isActive ? '#2952d6' : (m.enabled ? '#23262C' : '#1d1f23'),
                                    border: `1px solid ${isActive ? '#5479ff' : (m.enabled ? '#3b4048' : '#2a2d33')}`,
                                    color: m.enabled ? '#E6EBF0' : '#5c6470',
                                    fontSize: '0.95rem',
                                    cursor: m.enabled ? 'pointer' : 'not-allowed',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    transition: 'background 0.15s',
                                    userSelect: 'none',
                                }}
                            >
                                <span style={{ fontWeight: 600 }}>{m.label}</span>
                                <span style={{ fontSize: '0.78rem', color: isActive ? '#cdd9ff' : (m.enabled ? '#8C939D' : '#4a5058') }}>
                                    {isActive ? '已激活' : (m.enabled ? '›' : '占位')}
                                </span>
                            </div>
                        )
                    })}
                </div>

                {/* 分隔 */}
                <div style={{ height: '1px', background: '#2a2e33', margin: '0.1rem 0' }} />

                {/* 预设管理 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.92rem', color: '#E6EBF0', fontWeight: 600 }}>
                            {displayTypeLabel(displayType)} 预设 ({presets.length})
                        </span>
                        <span
                            onClick={handleSaveCurrent}
                            title='Ctrl+S 也能快速保存'
                            style={{
                                fontSize: '0.95rem',
                                color: '#fff',
                                background: '#2952d6',
                                cursor: 'pointer',
                                padding: '0.45rem 0.95rem',
                                border: '1px solid #5479ff',
                                borderRadius: '6px',
                                fontWeight: 600,
                                userSelect: 'none',
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = '#3461e5'}
                            onMouseLeave={(e) => e.currentTarget.style.background = '#2952d6'}
                        >
                            + 保存当前
                        </span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#6C7784' }}>
                        切换设备时不会自动保存, 需手动点击或按 Ctrl+S
                    </div>

                    {presets.length === 0 ? (
                        <div style={{
                            padding: '0.8rem',
                            textAlign: 'center',
                            fontSize: '0.82rem',
                            color: '#6C7784',
                            border: '1px dashed #32373E',
                            borderRadius: '4px',
                        }}>
                            还没有预设
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', maxHeight: '18rem', overflowY: 'auto', paddingRight: '4px' }}>
                            {presets.map(p => (
                                <div
                                    key={p.id}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.4rem',
                                        padding: '0.5rem 0.65rem',
                                        borderRadius: '4px',
                                        background: '#23262C',
                                        border: '1px solid #32373E',
                                        fontSize: '0.88rem',
                                    }}
                                >
                                    {editingId === p.id ? (
                                        <Input
                                            value={editingName}
                                            autoFocus
                                            size='small'
                                            onChange={(e) => setEditingName(e.target.value)}
                                            onPressEnter={handleConfirmRename}
                                            onBlur={handleConfirmRename}
                                            style={{ flex: 1, fontSize: '0.85rem' }}
                                        />
                                    ) : (
                                        <span
                                            onClick={() => handleLoad(p)}
                                            title='点击加载'
                                            style={{
                                                flex: 1,
                                                color: '#E6EBF0',
                                                cursor: 'pointer',
                                                whiteSpace: 'nowrap',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                            }}
                                        >
                                            {p.name}
                                            <span style={{ marginLeft: '0.5rem', fontSize: '0.74rem', color: '#6C7784' }}>
                                                ({p.boxes.length} 框)
                                            </span>
                                        </span>
                                    )}
                                    {editingId !== p.id && (
                                        <>
                                            <span
                                                onClick={(e) => handleStartRename(p, e)}
                                                title='重命名'
                                                className='cursor'
                                                style={{
                                                    fontSize: '0.74rem',
                                                    color: '#8C939D',
                                                    padding: '0.15rem 0.45rem',
                                                    border: '1px solid #3b4048',
                                                    borderRadius: '3px',
                                                    userSelect: 'none',
                                                }}
                                            >重命名</span>
                                            <span
                                                onClick={(e) => handleDelete(p, e)}
                                                title='删除'
                                                className='cursor'
                                                style={{
                                                    fontSize: '0.74rem',
                                                    color: '#ff4444',
                                                    padding: '0.15rem 0.45rem',
                                                    border: '1px solid #ff444466',
                                                    borderRadius: '3px',
                                                    userSelect: 'none',
                                                }}
                                            >删除</span>
                                        </>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </DraggablePanel>
    )
}

function displayTypeLabel(displayType) {
    if (displayType === 'back2D') return '靠垫'
    if (displayType === 'sit2D') return '坐垫'
    return '当前设备'
}
