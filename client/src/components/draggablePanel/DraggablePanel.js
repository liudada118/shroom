import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import './index.scss'

const PANEL_Z_INDEX_BASE = 120
const PANEL_Z_INDEX_TOP = 180
let globalMaxZIndex = PANEL_Z_INDEX_BASE

function nextPanelZIndex() {
    if (globalMaxZIndex >= PANEL_Z_INDEX_TOP) {
        globalMaxZIndex = PANEL_Z_INDEX_BASE
    }
    globalMaxZIndex += 1
    return globalMaxZIndex
}

/**
 * 可拖拽、可缩放、置顶的面板组件
 * - 不可关闭
 * - 鼠标拖拽移动
 * - 可放大/缩小
 * - 在浮窗层内置顶，但保持低于历史/调节抽屉
 */
export default function DraggablePanel({ children, defaultPosition, title, className = '' }) {
    const { t } = useTranslation()
    const panelRef = useRef(null)
    const [position, setPosition] = useState(defaultPosition || { x: 0, y: 0 })
    const [scale, setScale] = useState(1)
    const [zIndex, setZIndex] = useState(nextPanelZIndex)
    const [isDragging, setIsDragging] = useState(false)
    const dragOffset = useRef({ x: 0, y: 0 })

    // 点击面板时置顶
    const bringToFront = useCallback(() => {
        setZIndex(nextPanelZIndex())
    }, [])

    // 拖拽开始
    const onMouseDown = useCallback((e) => {
        // 只在标题栏区域拖拽
        if (!e.target.closest('.draggable-panel-header')) return
        e.preventDefault()
        bringToFront()
        setIsDragging(true)
        const rect = panelRef.current.getBoundingClientRect()
        dragOffset.current = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        }
    }, [bringToFront])

    useEffect(() => {
        if (!isDragging) return

        const onMouseMove = (e) => {
            setPosition({
                x: e.clientX - dragOffset.current.x,
                y: e.clientY - dragOffset.current.y
            })
        }

        const onMouseUp = () => {
            setIsDragging(false)
        }

        window.addEventListener('mousemove', onMouseMove)
        window.addEventListener('mouseup', onMouseUp)
        return () => {
            window.removeEventListener('mousemove', onMouseMove)
            window.removeEventListener('mouseup', onMouseUp)
        }
    }, [isDragging])

    // 缩放（10%~1000%），固定 10% 步长，只保留 10 的倍数
    const ZOOM_MIN = 10
    const ZOOM_MAX = 1000
    const ZOOM_STEP = 10

    const percentToScale = (percent) => parseFloat((percent / 100).toFixed(1))

    const zoomIn = useCallback((e) => {
        e.stopPropagation()
        setScale(s => {
            const currentPercent = Math.round(s * 100)
            const nextPercent = Math.min(Math.floor(currentPercent / ZOOM_STEP) * ZOOM_STEP + ZOOM_STEP, ZOOM_MAX)
            return percentToScale(nextPercent)
        })
    }, [])

    const zoomOut = useCallback((e) => {
        e.stopPropagation()
        setScale(s => {
            const currentPercent = Math.round(s * 100)
            const nextPercent = Math.max(Math.ceil(currentPercent / ZOOM_STEP) * ZOOM_STEP - ZOOM_STEP, ZOOM_MIN)
            return percentToScale(nextPercent)
        })
    }, [])

    const resetZoom = useCallback((e) => {
        e.stopPropagation()
        setScale(1)
    }, [])

    return (
        <div
            ref={panelRef}
            className={`draggable-panel ${className}`}
            style={{
                position: 'fixed',
                left: position.x + 'px',
                top: position.y + 'px',
                zIndex: zIndex,
                transform: `scale(${scale})`,
                transformOrigin: 'top left',
                cursor: isDragging ? 'grabbing' : 'default',
            }}
            onMouseDown={(e) => {
                bringToFront()
            }}
        >
            <div className='draggable-panel-header' onMouseDown={onMouseDown}
                style={{ cursor: isDragging ? 'grabbing' : 'grab' }}>
                <span className='draggable-panel-title'>{title}</span>
                <div className='draggable-panel-controls'>
                    <span className='panel-ctrl-btn' onClick={zoomOut} title={t('zoomOut')}>-</span>
                    <span className='panel-ctrl-btn' onClick={resetZoom} title={t('resetZoom')}
                        style={{ fontSize: '0.65rem' }}>{Math.round(scale * 100)}%</span>
                    <span className='panel-ctrl-btn' onClick={zoomIn} title={t('zoomIn')}>+</span>
                </div>
            </div>
            <div className='draggable-panel-body'>
                {children}
            </div>
        </div>
    )
}
