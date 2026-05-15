import React, { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

function jetColor(value, max) {
    if (!value || max <= 0) return [8, 12, 16]
    const ratio = Math.max(0, Math.min(1, value / max))
    const r = Math.round(255 * Math.min(1, Math.max(0, ratio * 4 - 1.5)))
    const g = Math.round(255 * Math.min(1, Math.max(0, 1.5 - Math.abs(ratio * 4 - 2))))
    const b = Math.round(255 * Math.min(1, Math.max(0, 1.5 - ratio * 4)))
    return [r, g, b]
}

function diffColor(value, maxAbs) {
    if (!value || maxAbs <= 0) return [225, 228, 232]
    const ratio = Math.min(1, Math.abs(value) / maxAbs)
    if (value > 0) {
        return [255, Math.round(235 - 150 * ratio), Math.round(235 - 180 * ratio)]
    }
    return [Math.round(235 - 180 * ratio), Math.round(235 - 120 * ratio), 255]
}

export default function ContrastHeatmap(props) {
    const { title, subtitle, arr = [], width = 32, height = 32, mode = 'normal', className = '' } = props
    const { i18n } = useTranslation()
    const isEnglish = String(i18n.language || localStorage.getItem('language') || '').toLowerCase().startsWith('en')
    const copy = isEnglish ? {
        diffTitle: 'B-A Difference',
        bGreater: 'B > A',
        nearlyNoChange: 'Nearly no change',
        bLess: 'B < A',
        range: 'Range',
    } : {
        diffTitle: 'B-A 差值',
        bGreater: 'B 大于 A',
        nearlyNoChange: '接近无变化',
        bLess: 'B 小于 A',
        range: '范围',
    }
    const canvasRef = useRef(null)
    const maxAbs = Math.max(1, ...arr.map((value) => Math.abs(Number(value) || 0)))

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        const drawWidth = Math.max(1, Number(width) || 1)
        const drawHeight = Math.max(1, Number(height) || 1)
        const cell = Math.max(3, Math.floor(420 / Math.max(drawWidth, drawHeight)))
        canvas.width = drawWidth * cell
        canvas.height = drawHeight * cell

        ctx.clearRect(0, 0, canvas.width, canvas.height)
        for (let y = 0; y < drawHeight; y++) {
            for (let x = 0; x < drawWidth; x++) {
                const value = Number(arr[y * drawWidth + x]) || 0
                const color = mode === 'diff' ? diffColor(value, maxAbs) : jetColor(value, maxAbs)
                ctx.fillStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`
                ctx.fillRect(x * cell, y * cell, cell, cell)
            }
        }
    }, [arr, width, height, mode, maxAbs])

    return (
        <div className="contrastPanel">
            <div className="contrastPanelHeader">
                <div className="contrastPanelTitle">{title}</div>
                <div className="contrastPanelSubtitle">{subtitle}</div>
            </div>
            <div className="contrastCanvasWrap">
                <canvas ref={canvasRef} className={`canvasThree contrastCanvas ${className}`} />
                {mode === 'diff' ? (
                    <div className="diffLegendOverlay">
                        <div className="diffLegendTitle">{copy.diffTitle}</div>
                        <div><span className="legendRed" />{copy.bGreater}</div>
                        <div><span className="legendWhite" />{copy.nearlyNoChange}</div>
                        <div><span className="legendBlue" />{copy.bLess}</div>
                        <div className="diffLegendRange">{copy.range} ±{maxAbs.toFixed(maxAbs >= 100 ? 0 : 1)}</div>
                    </div>
                ) : null}
            </div>
        </div>
    )
}
