import React, { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { shallow } from 'zustand/shallow'
import DraggablePanel from '../draggablePanel/DraggablePanel'
import { useEquipStore, getSysType } from '../../store/equipStore'
import { systemPointConfig } from '../../util/constant'
import { colSelectMatrix } from '../../util/util'
import { isMoreMatrix } from '../../assets/util/util'
import { pageContext } from '../../page/test/Test'
import { SELECT_COLORS, getSelectBoxDisplayColor, getSelectBoxFillColor } from './newSelecttBox'
import { computeBoxMetrics } from './computeBoxMetrics'

const MAX_BOXES = 8

function extractSubMatrix(arr, matrix, width) {
    if (!arr || !matrix) return null
    const { xStart, xEnd, yStart, yEnd } = matrix
    const out = []
    for (let y = yStart; y < yEnd; y++) {
        for (let x = xStart; x < xEnd; x++) {
            out.push(arr[y * width + x] ?? 0)
        }
    }
    return out
}

function computeAllMetrics(boxData, matrix) {
    const empty = {
        pressAver: '-', pressTotal: '-', pressMax: '-',
        maxCoord: { x: '-', y: '-' },
        centroid: { x: '-', y: '-' },
        areaTotal: '-',
        colRange: ['-', '-'],
        rowRange: ['-', '-'],
    }
    if (!boxData || !boxData.length) return empty

    let sum = 0, max = -Infinity, active = 0
    for (let i = 0; i < boxData.length; i++) {
        const v = boxData[i]
        sum += v
        if (v > max) max = v
        if (v > 0) active++
    }
    const ext = computeBoxMetrics(boxData, matrix)
    return {
        pressAver: active > 0 ? (sum / active).toFixed(1) : '0',
        pressTotal: sum.toFixed(0),
        pressMax: max > -Infinity ? String(max) : '0',
        maxCoord: ext.maxCoord,
        centroid: ext.centroid,
        areaTotal: active,
        colRange: ext.colRange,
        rowRange: ext.rowRange,
    }
}

export default function BrushDashboardPanel() {
    const pageInfo = useContext(pageContext)
    const brushInstance = pageInfo?.brushInstance
    const displayType = pageInfo?.displayType || ''

    const [boxes, setBoxes] = useState([])
    const displayStatus = useEquipStore(s => s.displayStatus, shallow)

    const fullKey = useMemo(() => {
        const sys = getSysType()
        if (isMoreMatrix(sys)) {
            const part = displayType.includes('back') ? 'back' : displayType.includes('sit') ? 'sit' : ''
            return part ? `${sys}-${part}` : sys
        }
        return sys
    }, [displayType])

    const matrixConfig = systemPointConfig[fullKey]
    const shortKey = fullKey?.includes('-') ? fullKey.split('-')[1] : fullKey

    useEffect(() => {
        if (!brushInstance) return
        const cb = (rangeArr) => {
            if (!matrixConfig) {
                setBoxes(rangeArr.map((r, i) => ({
                    colorIndex: r.colorIndex ?? i,
                    bgc: r.bgc || SELECT_COLORS[i % MAX_BOXES],
                    matrix: null,
                })))
                return
            }
            const newBoxes = rangeArr.map((r, i) => {
                const matrix = colSelectMatrix('canvasThree', r, matrixConfig)
                return {
                    colorIndex: r.colorIndex ?? i,
                    bgc: r.bgc || SELECT_COLORS[i % MAX_BOXES],
                    matrix,
                }
            })
            setBoxes(newBoxes)
        }
        cb(brushInstance.rangeArr || [])
        brushInstance.subscribe(cb)
        return () => brushInstance.unsubscribe(cb)
    }, [brushInstance, matrixConfig])

    // 仪表盘固定 x=20, 跟左侧 ChartsAside (压力总和曲线) 对齐
    const position = { x: 20, y: 140 }

    // 8 个固定槽位，按 colorIndex 定位 — 删除某个不会让别的框"挪位置"
    const slots = useMemo(() => {
        const arr = displayStatus?.[shortKey]
        return Array.from({ length: MAX_BOXES }).map((_, slotIdx) => {
            const box = boxes.find(b => b.colorIndex === slotIdx)
            if (!box) return { exists: false, color: SELECT_COLORS[slotIdx] }
            if (!box.matrix || !matrixConfig || !arr) {
                return { exists: true, color: box.bgc, metrics: computeAllMetrics(null, null) }
            }
            const sub = extractSubMatrix(arr, box.matrix, matrixConfig.width)
            return { exists: true, color: box.bgc, metrics: computeAllMetrics(sub, box.matrix) }
        })
    }, [boxes, displayStatus, shortKey, matrixConfig])

    const leftSlots = slots.slice(0, 4)
    const rightSlots = slots.slice(4, 8)

    // y=140: 给折叠的 ChartsAside 面板标题栏让出 60px 空间
    // bodyMax: 顶部 140 + 仪表盘自己标题栏 + 底部留白
    const bodyMax = 'calc(100vh - 190px)'

    return (
        <DraggablePanel
            title='采集区域仪表盘'
            defaultPosition={position}
            disableDrag={true}
            bodyMaxHeight={bodyMax}
            className='dashboard-panel'
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <CtrlTip />
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <div style={{ width: '16rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        {leftSlots.map((slot, i) => (
                            <DashCard key={i} index={i} slot={slot} />
                        ))}
                    </div>
                    <div style={{ width: '16rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        {rightSlots.map((slot, i) => (
                            <DashCard key={i + 4} index={i + 4} slot={slot} />
                        ))}
                    </div>
                </div>
            </div>
        </DraggablePanel>
    )
}

function CtrlTip() {
    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.45rem',
            padding: '0.5rem 0.7rem',
            background: 'rgba(91, 141, 239, 0.08)',
            border: '1px solid rgba(91, 141, 239, 0.3)',
            borderRadius: '0.4rem',
            fontSize: '0.82rem',
            color: '#A8C0F5',
        }}>
            <span style={{
                padding: '2px 8px',
                borderRadius: '4px',
                background: '#2a3245',
                border: '1px solid #4d5a78',
                color: '#cdd9ff',
                fontFamily: 'ui-monospace, monospace',
                fontSize: '0.78rem',
            }}>Ctrl</span>
            <span>按住 Ctrl 键拖动鼠标即可创建框选区域</span>
        </div>
    )
}

function DashCard({ index, slot }) {
    const { exists, color, metrics } = slot
    const baseColor = exists ? color : '#3b4048'
    const fill = exists ? getSelectBoxFillColor(color, 0.1) : 'rgba(40, 43, 48, 0.4)'
    const titleColor = exists ? getSelectBoxDisplayColor(color) : '#5c6470'
    const m = metrics

    return (
        <div style={{
            background: fill,
            border: `1px solid ${exists ? color + '55' : '#2a2d33'}`,
            borderLeft: `3px solid ${baseColor}`,
            borderRadius: '0.4rem',
            padding: '0.4rem 0.55rem',
            opacity: exists ? 1 : 0.45,
            display: 'flex',
            flexDirection: 'column',
            gap: '0.3rem',
            transition: 'opacity 0.18s, background 0.18s',
        }}>
            {/* 顶部框号 */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                paddingBottom: '0.25rem',
                borderBottom: `1px dashed ${exists ? color + '33' : '#2a2d33'}`,
            }}>
                <span style={{
                    width: '0.7rem', height: '0.7rem', borderRadius: '50%',
                    background: baseColor, flexShrink: 0,
                }} />
                <span style={{
                    color: titleColor,
                    fontSize: '0.88rem',
                    fontWeight: 700,
                    fontVariantNumeric: 'tabular-nums',
                }}>
                    {index + 1}
                </span>
                {!exists && (
                    <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: '#5c6470' }}>
                        未创建
                    </span>
                )}
            </div>

            {/* 8 个指标，4 行 × 2 列 */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '0.25rem 0.5rem',
            }}>
                {exists ? (
                    <>
                        <Cell label='平均压力' value={m.pressAver} unit='ADC' />
                        <Cell label='压力总和' value={m.pressTotal} unit='ADC' />
                        <Cell label='最大压强' value={m.pressMax} unit='ADC' />
                        <Cell label='有效点数' value={m.areaTotal} unit='个' />
                        <Cell label='最大压力坐标' value={`(${m.maxCoord.x}, ${m.maxCoord.y})`} />
                        <Cell label='平均压强' value={m.pressAver} unit='Kpa' />
                        <Cell label='框选区列范围' value={`[${m.colRange[0]}, ${m.colRange[1]}]`} />
                        <Cell label='框选区行范围' value={`[${m.rowRange[0]}, ${m.rowRange[1]}]`} />
                    </>
                ) : (
                    <>
                        <Cell label='平均压力' value='-' />
                        <Cell label='压力总和' value='-' />
                        <Cell label='最大压强' value='-' />
                        <Cell label='有效点数' value='-' />
                        <Cell label='最大压力坐标' value='-' />
                        <Cell label='平均压强' value='-' />
                        <Cell label='框选区列范围' value='-' />
                        <Cell label='框选区行范围' value='-' />
                    </>
                )}
            </div>
        </div>
    )
}

function Cell({ label, value, unit }) {
    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.08rem',
            minWidth: 0,
        }}>
            <span style={{
                color: '#8C939D',
                fontSize: '0.72rem',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
            }}>
                {label}
            </span>
            <span style={{
                color: '#E6EBF0',
                fontSize: '0.88rem',
                fontVariantNumeric: 'tabular-nums',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
            }}>
                {value}
                {unit && <span style={{ fontSize: '0.65rem', color: '#6C7784', fontWeight: 400, marginLeft: 3 }}>{unit}</span>}
            </span>
        </div>
    )
}
