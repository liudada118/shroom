import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ReloadOutlined } from '@ant-design/icons'
import { resolvePanelPosition } from '../../util/panelPosition'
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
// 自动收缩的下限：再小就看不清数值了，剩下的交给用户自己拖/缩放。
// 框选六个框时内容很长，下限太高会放不下、被迫出滚动条，所以放到 0.45
const MIN_FIT_SCALE = 0.45
// 面板底部离视口留的余量
const FIT_VIEWPORT_MARGIN = 16

export default function DraggablePanel({ children, defaultPosition, title, className = '', innerRef, maxBodyHeight = null, fitToViewport = false, bottomReserve = 0 }) {
    const { t } = useTranslation()
    const localRef = useRef(null)
    const panelRef = innerRef || localRef
    const [position, setPosition] = useState(() => ({
        x: defaultPosition?.x || 0,
        y: defaultPosition?.y || 0,
    }))
    const [zoomPercent, setZoomPercent] = useState(100)
    // 内容比视口高时整体等比缩小，保证框选后每个框的数值都能看全
    const [fitScale, setFitScale] = useState(1)
    // 缩到下限仍放不下时给内容区的限高（px，未经缩放），null 表示不限
    const [fitBodyHeight, setFitBodyHeight] = useState(null)
    const [manualZoom, setManualZoom] = useState(false)
    const [zIndex, setZIndex] = useState(nextPanelZIndex)
    const [isDragging, setIsDragging] = useState(false)
    const dragOffset = useRef({ x: 0, y: 0 })
    const userMovedRef = useRef(false)
    const usesEdgeAnchor = defaultPosition?.right != null || defaultPosition?.bottom != null

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
        userMovedRef.current = true
        setIsDragging(true)
        const rect = panelRef.current.getBoundingClientRect()
        dragOffset.current = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        }
    }, [bringToFront])

    const syncAnchoredPosition = useCallback(() => {
        if (!usesEdgeAnchor || userMovedRef.current || !panelRef.current) return
        const rect = panelRef.current.getBoundingClientRect()
        setPosition(resolvePanelPosition(defaultPosition, {
            width: rect.width,
            height: rect.height,
        }, {
            width: window.innerWidth,
            height: window.innerHeight,
        }))
    }, [defaultPosition, usesEdgeAnchor])

    useLayoutEffect(() => {
        syncAnchoredPosition()
    }, [syncAnchoredPosition])

    useEffect(() => {
        if (!usesEdgeAnchor) return undefined
        window.addEventListener('resize', syncAnchoredPosition)
        return () => window.removeEventListener('resize', syncAnchoredPosition)
    }, [syncAnchoredPosition, usesEdgeAnchor])

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

    /**
     * 自动适配视口高度：面板本身的布局高度（offsetHeight，不受 transform 影响）
     * 超过「视口高度 − 面板顶部」时按比例缩小；用户手动调过缩放后就不再自动干预
     */
    useEffect(() => {
        if (!fitToViewport) {
            setFitScale(1)
            setFitBodyHeight(null)
            return undefined
        }
        if (manualZoom) return undefined
        const element = panelRef.current
        if (!element) return undefined

        const update = () => {
            const header = element.querySelector('.draggable-panel-header')
            const body = element.querySelector('.draggable-panel-body')
            const headerHeight = header?.offsetHeight || 0
            // 用 scrollHeight 量内容原始高度：下面给 body 限高之后再量也不会跟着变小，不会来回抖
            const contentHeight = body?.scrollHeight || 0
            const natural = headerHeight + contentHeight
            // bottomReserve 是底部要让出来的空间（左下角那条工具条），面板最多铺到这条线为止。
            // 整块按比例缩到正好放得下，内容全展开、不出滚动条，也压不到工具条
            const available = window.innerHeight - position.y - FIT_VIEWPORT_MARGIN - bottomReserve
            if (!natural || available <= 0) return
            const scale = Math.max(MIN_FIT_SCALE, Math.min(1, available / natural))
            setFitScale(scale)
            // 只有缩到下限还是放不下时才退而求其次给内容区限高滚动
            // 留 1px 容差，避免 scrollHeight 取整后在「刚好放得下」这条线上反复加/去滚动条
            setFitBodyHeight(natural * scale > available + 1
                ? Math.max(160, Math.round(available / scale - headerHeight))
                : null)
        }

        update()
        const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null
        observer?.observe(element)
        window.addEventListener('resize', update)
        return () => {
            observer?.disconnect()
            window.removeEventListener('resize', update)
        }
    }, [fitToViewport, manualZoom, position.y, bottomReserve])

    // 缩放（10%~1000%），固定 10% 步长，只保留 10 的倍数
    const ZOOM_MIN = 50
    const ZOOM_MAX = 150
    const ZOOM_STEP = 10

    const zoomIn = useCallback((e) => {
        e.stopPropagation()
        setManualZoom(true)
        setZoomPercent(percent => Math.min(percent + ZOOM_STEP, ZOOM_MAX))
    }, [])

    const zoomOut = useCallback((e) => {
        e.stopPropagation()
        setManualZoom(true)
        setZoomPercent(percent => Math.max(percent - ZOOM_STEP, ZOOM_MIN))
    }, [])

    // 重置：回到 100% 并把「自动适配」交还给面板
    const resetZoom = useCallback((e) => {
        e.stopPropagation()
        setManualZoom(false)
        setZoomPercent(100)
    }, [])

    const scale = (zoomPercent / 100) * fitScale
    const bodyMaxHeight = maxBodyHeight != null && fitBodyHeight != null
        ? Math.min(maxBodyHeight, fitBodyHeight)
        : (maxBodyHeight != null ? maxBodyHeight : fitBodyHeight)

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
                    {/* 只显示手动缩放的档位：自动适配算出来的比例不计入，
                        所以不管面板实际铺多大，基准始终是 100%，不会出现 97% 这种零散数 */}
                    <span className='panel-zoom-value'>{zoomPercent}%</span>
                    <span className='panel-ctrl-btn' onClick={resetZoom} title={t('resetZoom')}>
                        <ReloadOutlined />
                    </span>
                    <span className='panel-ctrl-btn' onClick={zoomIn} title={t('zoomIn')}>+</span>
                </div>
            </div>
            {/* maxBodyHeight 由外部在两块面板将要重叠时下发，分开后传 null 恢复原始长度；
                fitBodyHeight 是自动适配算出来的下限，两者取更小的那个 */}
            <div
                className='draggable-panel-body'
                style={bodyMaxHeight != null ? { maxHeight: `${bodyMaxHeight}px`, overflowY: 'auto' } : undefined}
            >
                {children}
            </div>
        </div>
    )
}
