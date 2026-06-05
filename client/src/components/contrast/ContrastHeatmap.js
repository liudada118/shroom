import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { NUMBER_TEXT_COLOR_ALPHA, beginDynamicColorFrame, jetWhite3NoWhite, setDynamicGammaColorEnabled } from '../../assets/util/line'
import { useEquipStore } from '../../store/equipStore'
import { isEndiBackVisibleCell } from '../../util/endiBackVisibleMask'

function normalizeDisplayValue(value) {
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) return 0
    return Math.max(0, Math.min(255, Math.round(numeric)))
}

function getTextureColorMax(colorMax) {
    const value = Number(colorMax)
    return Number.isFinite(value) && value > 0 ? value : 1
}

function diffColor(value, maxAbs) {
    if (!value || maxAbs <= 0) return [225, 228, 232]
    const ratio = Math.min(1, Math.abs(value) / maxAbs)
    if (value > 0) {
        return [255, Math.round(235 - 150 * ratio), Math.round(235 - 180 * ratio)]
    }
    return [Math.round(235 - 180 * ratio), Math.round(235 - 120 * ratio), 255]
}

function shouldHideCell(matrixKey, row, col, width, height) {
    const isEndiBack = matrixKey === 'endi-back' || (matrixKey === 'back' && Number(width) === 50 && Number(height) === 64)
    return isEndiBack && !isEndiBackVisibleCell(row, col, width, height)
}

function getCellDisplay(rawValue, mode, maxAbs, colorMax) {
    const displayValue = mode === 'diff'
        ? Math.round(Number(rawValue) || 0)
        : normalizeDisplayValue(rawValue)
    const color = mode === 'diff'
        ? diffColor(Number(rawValue) || 0, maxAbs)
        : jetWhite3NoWhite(0, getTextureColorMax(colorMax), displayValue)
    const background = mode === 'diff'
        ? `rgb(${color[0]}, ${color[1]}, ${color[2]})`
        : `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${NUMBER_TEXT_COLOR_ALPHA})`
    return { displayValue, background }
}

function drawValue(ctx, value, x, y, cellSize) {
    if (cellSize < 6) return
    const text = String(value)
    const fontSize = Math.max(5, Math.min(cellSize * 0.52, text.length >= 3 ? cellSize * 0.42 : cellSize * 0.58))
    ctx.globalAlpha = 1
    ctx.fillStyle = '#fff'
    ctx.font = `700 ${fontSize}px monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, x + cellSize / 2, y + cellSize / 2)
}

export default function ContrastHeatmap(props) {
    const { title, subtitle, arr = [], width = 32, height = 32, mode = 'normal', className = '', matrixKey = '', colorMax = 1, disableExpand = false } = props
    const { i18n } = useTranslation()
    const isEnglish = String(i18n.language || localStorage.getItem('language') || '').toLowerCase().startsWith('en')
    const copy = isEnglish ? {
        diffTitle: 'B-A Difference',
        bGreater: 'B > A',
        nearlyNoChange: 'Nearly no change',
        bLess: 'B < A',
    } : {
        diffTitle: 'B-A 差值',
        bGreater: 'B 大于 A',
        nearlyNoChange: '接近无变化',
        bLess: 'B 小于 A',
    }
    const canvasRef = useRef(null)
    const wrapRef = useRef(null)
    const gridRef = useRef({ offsetX: 0, offsetY: 0, cell: 1, width: 1, height: 1 })
    const [magnifier, setMagnifier] = useState({ visible: false, col: 0, row: 0, left: 0, top: 0 })
    const [expanded, setExpanded] = useState(false)
    const maxAbs = Math.max(1, ...arr.map((value) => Math.abs(Number(value) || 0)))

    useEffect(() => {
        let cleanup = () => {}
        const canvas = canvasRef.current
        const wrap = wrapRef.current
        if (!canvas || !wrap) return cleanup
        const ctx = canvas.getContext('2d')
        const draw = () => {
            const autoColor = Boolean(useEquipStore.getState().settingValue?.autoColor)
            setDynamicGammaColorEnabled(autoColor)
            if (mode !== 'diff') {
                beginDynamicColorFrame(arr, colorMax)
            }
            const drawWidth = Math.max(1, Number(width) || 1)
            const drawHeight = Math.max(1, Number(height) || 1)
            const rect = wrap.getBoundingClientRect()
            const dpr = window.devicePixelRatio || 1
            const cssWidth = Math.max(1, rect.width)
            const cssHeight = Math.max(1, rect.height)
            canvas.width = Math.floor(cssWidth * dpr)
            canvas.height = Math.floor(cssHeight * dpr)
            canvas.style.width = `${cssWidth}px`
            canvas.style.height = `${cssHeight}px`

            ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
            ctx.clearRect(0, 0, cssWidth, cssHeight)

            const cell = Math.max(1, Math.min(cssWidth / drawWidth, cssHeight / drawHeight))
            const gridWidth = drawWidth * cell
            const gridHeight = drawHeight * cell
            const offsetX = (cssWidth - gridWidth) / 2
            const offsetY = (cssHeight - gridHeight) / 2
            const safeColorMax = getTextureColorMax(colorMax)
            gridRef.current = { offsetX, offsetY, cell, width: drawWidth, height: drawHeight }

            for (let row = 0; row < drawHeight; row++) {
                for (let col = 0; col < drawWidth; col++) {
                    if (shouldHideCell(matrixKey, row, col, drawWidth, drawHeight)) {
                        continue
                    }
                    const rawValue = Number(arr[row * drawWidth + col]) || 0
                    const { displayValue, background } = getCellDisplay(rawValue, mode, maxAbs, safeColorMax)
                    const x = offsetX + col * cell
                    const y = offsetY + row * cell
                    ctx.globalAlpha = 1
                    ctx.fillStyle = background
                    ctx.fillRect(x, y, cell, cell)
                    ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)'
                    ctx.lineWidth = Math.max(0.35, Math.min(1, cell * 0.08))
                    ctx.strokeRect(x, y, cell, cell)
                    drawValue(ctx, displayValue, x, y, cell)
                }
            }
        }

        draw()
        if (typeof ResizeObserver !== 'undefined') {
            const observer = new ResizeObserver(draw)
            observer.observe(wrap)
            cleanup = () => observer.disconnect()
        } else {
            window.addEventListener('resize', draw)
            cleanup = () => window.removeEventListener('resize', draw)
        }
        return cleanup
    }, [arr, width, height, mode, maxAbs, matrixKey, colorMax])

    const handleMouseMove = (event) => {
        const wrap = wrapRef.current
        if (!wrap) return
        const rect = wrap.getBoundingClientRect()
        const { offsetX, offsetY, cell, width: drawWidth, height: drawHeight } = gridRef.current
        const x = event.clientX - rect.left
        const y = event.clientY - rect.top
        const col = Math.floor((x - offsetX) / cell)
        const row = Math.floor((y - offsetY) / cell)
        if (col < 0 || row < 0 || col >= drawWidth || row >= drawHeight || shouldHideCell(matrixKey, row, col, drawWidth, drawHeight)) {
            setMagnifier((current) => current.visible ? { ...current, visible: false } : current)
            return
        }
        const size = 172
        const maxLeft = Math.max(8, rect.width - size - 8)
        const maxTop = Math.max(8, rect.height - size - 8)
        const left = Math.min(maxLeft, Math.max(8, x + 14))
        const top = Math.min(maxTop, Math.max(8, y + 14))
        setMagnifier({ visible: true, col, row, left, top })
    }

    const renderMagnifierCells = () => {
        const drawWidth = Math.max(1, Number(width) || 1)
        const drawHeight = Math.max(1, Number(height) || 1)
        const cells = []
        for (let y = 0; y < 5; y++) {
            for (let x = 0; x < 5; x++) {
                const col = magnifier.col + x - 2
                const row = magnifier.row + y - 2
                const inRange = col >= 0 && row >= 0 && col < drawWidth && row < drawHeight
                const hidden = inRange && shouldHideCell(matrixKey, row, col, drawWidth, drawHeight)
                const rawValue = inRange && !hidden ? (Number(arr[row * drawWidth + col]) || 0) : 0
                const { displayValue, background } = getCellDisplay(rawValue, mode, maxAbs, colorMax)
                cells.push(
                    <div
                        key={`${x}-${y}`}
                        className={`contrastMagnifierCell ${x === 2 && y === 2 ? 'active' : ''} ${!inRange || hidden ? 'empty' : ''}`}
                        style={{ background: inRange && !hidden ? background : 'rgba(3, 5, 7, 0.92)' }}
                    >
                        {inRange && !hidden ? displayValue : ''}
                    </div>
                )
            }
        }
        return cells
    }

    return (
        <>
        <div className="contrastPanel">
            <div className="contrastPanelHeader">
                <div className="contrastPanelTitle">{title}</div>
                <div className="contrastPanelTools">
                    <span className="contrastPanelSubtitle">{subtitle}</span>
                    {disableExpand ? null : (
                        <button className="panelExpandIcon" type="button" onClick={() => setExpanded(true)} aria-label="放大热力图">⛶</button>
                    )}
                </div>
            </div>
            <div
                className="contrastCanvasWrap"
                ref={wrapRef}
                onMouseMove={handleMouseMove}
                onMouseLeave={() => setMagnifier((current) => ({ ...current, visible: false }))}
            >
                <canvas ref={canvasRef} className={`canvasThree contrastCanvas ${className}`} />
                {magnifier.visible ? (
                    <div className="contrastMagnifier" style={{ left: magnifier.left, top: magnifier.top }}>
                        {renderMagnifierCells()}
                    </div>
                ) : null}
                {mode === 'diff' ? (
                    <div className="diffLegendOverlay">
                        <div className="diffLegendTitle">{copy.diffTitle}</div>
                        <div><span className="legendRed" />{copy.bGreater}</div>
                        <div><span className="legendWhite" />{copy.nearlyNoChange}</div>
                        <div><span className="legendBlue" />{copy.bLess}</div>
                    </div>
                ) : null}
            </div>
        </div>
        {expanded ? (
            <div className="contrastExpandOverlay" onClick={() => setExpanded(false)}>
                <div className="contrastExpandDialog" onClick={(event) => event.stopPropagation()}>
                    <div className="contrastExpandHeader">
                        <div>
                            <div className="contrastPanelTitle">{title}</div>
                            <div className="contrastPanelSubtitle">{subtitle}</div>
                        </div>
                        <button type="button" onClick={() => setExpanded(false)}>×</button>
                    </div>
                    <ContrastHeatmap
                        title={title}
                        subtitle={subtitle}
                        arr={arr}
                        width={width}
                        height={height}
                        mode={mode}
                        matrixKey={matrixKey}
                        colorMax={colorMax}
                        className={className}
                        disableExpand
                    />
                </div>
            </div>
        ) : null}
        </>
    )
}

