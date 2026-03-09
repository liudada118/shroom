import React, { useCallback, useEffect, useRef, useState } from 'react'
import './index.scss'

// 全局 z-index 管理器
let globalMaxZIndex = 2000

/**
 * 可拖拽、可缩放、置顶的面板组件
 * - 不可关闭
 * - 鼠标拖拽移动
 * - 可放大/缩小
 * - 始终在最上层（点击时置顶）
 */
export default function DraggablePanel({ children, defaultPosition, title, className = '' }) {
    const panelRef = useRef(null)
    const [position, setPosition] = useState(defaultPosition || { x: 0, y: 0 })
    const [scale, setScale] = useState(1)
    const [zIndex, setZIndex] = useState(globalMaxZIndex)
    const [isDragging, setIsDragging] = useState(false)
    const dragOffset = useRef({ x: 0, y: 0 })

    // 点击面板时置顶
    const bringToFront = useCallback(() => {
        globalMaxZIndex += 1
        setZIndex(globalMaxZIndex)
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

    // 缩放（10%~1000%），根据当前缩放比例动态调整步长
    const getStep = (s) => {
        if (s <= 0.5) return 0.05
        if (s <= 1.0) return 0.1
        if (s <= 2.0) return 0.25
        if (s <= 5.0) return 0.5
        return 1.0
    }

    const zoomIn = useCallback((e) => {
        e.stopPropagation()
        setScale(s => {
            const step = getStep(s)
            return Math.min(parseFloat((s + step).toFixed(2)), 10.0)
        })
    }, [])

    const zoomOut = useCallback((e) => {
        e.stopPropagation()
        setScale(s => {
            const step = getStep(s)
            return Math.max(parseFloat((s - step).toFixed(2)), 0.1)
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
                    <span className='panel-ctrl-btn' onClick={zoomOut} title='缩小'>-</span>
                    <span className='panel-ctrl-btn' onClick={resetZoom} title='重置'
                        style={{ fontSize: '0.65rem' }}>{Math.round(scale * 100)}%</span>
                    <span className='panel-ctrl-btn' onClick={zoomIn} title='放大'>+</span>
                </div>
            </div>
            <div className='draggable-panel-body'>
                {children}
            </div>
        </div>
    )
}
