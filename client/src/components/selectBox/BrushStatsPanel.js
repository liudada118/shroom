import React, { useContext, useEffect, useMemo, useState } from 'react'
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

/**
 * 取出框内子矩阵（按行优先）— 与 useMatrixData.js 内部 extractSelectData 行为一致
 */
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

/**
 * 计算 8 个指标（ADC 1:1，未做单位换算）
 */
function computeAllMetrics(boxData, matrix) {
    const empty = {
        pressAver: '0', pressTotal: '0', pressMax: '0',
        maxCoord: { x: '-', y: '-' },
        centroid: { x: '-', y: '-' },
        areaTotal: 0,
        colRange: ['-', '-'],
        rowRange: ['-', '-'],
    }
    if (!boxData || !boxData.length) return empty

    let sum = 0
    let max = -Infinity
    let active = 0
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

export default function BrushStatsPanel({ onBack }) {
    const pageInfo = useContext(pageContext)
    const brushInstance = pageInfo?.brushInstance
    const displayType = pageInfo?.displayType || ''

    const [boxes, setBoxes] = useState([])     // {colorIndex, bgc, matrix}
    const [activeIdx, setActiveIdx] = useState(0)

    const displayStatus = useEquipStore(s => s.displayStatus, shallow)

    // 解析当前矩阵 fullKey 与配置
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

    // 订阅框选变化
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
        // 初始化一次
        cb(brushInstance.rangeArr || [])
        brushInstance.subscribe(cb)
        return () => brushInstance.unsubscribe(cb)
    }, [brushInstance, matrixConfig])

    // 当框被删除时确保 activeIdx 仍然有效
    useEffect(() => {
        if (boxes.length === 0) {
            setActiveIdx(0)
        } else if (activeIdx >= boxes.length) {
            setActiveIdx(boxes.length - 1)
        }
    }, [boxes.length, activeIdx])

    // 计算当前激活框的 8 项指标
    const metrics = useMemo(() => {
        const box = boxes[activeIdx]
        if (!box || !box.matrix || !matrixConfig) {
            return computeAllMetrics(null, null)
        }
        const arr = displayStatus?.[shortKey]
        if (!arr || !arr.length) {
            return computeAllMetrics(null, null)
        }
        const sub = extractSubMatrix(arr, box.matrix, matrixConfig.width)
        return computeAllMetrics(sub, box.matrix)
    }, [boxes, activeIdx, displayStatus, shortKey, matrixConfig])

    // 当前框的颜色
    const activeBox = boxes[activeIdx]
    const activeColor = activeBox?.bgc || SELECT_COLORS[0]

    const defaultPosition = { x: window.innerWidth - 380, y: 80 }

    return (
        <DraggablePanel title='自由框选 - 区域采集' defaultPosition={defaultPosition}>
            <div style={{ width: '20rem' }}>
                {/* 顶部：8 颗圆点 + 返回按钮 */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '0.6rem',
                    paddingBottom: '0.5rem',
                    borderBottom: '1px solid #2a2e33',
                }}>
                    <div style={{ display: 'flex', gap: '0.35rem' }}>
                        {Array.from({ length: MAX_BOXES }).map((_, i) => {
                            const exist = i < boxes.length
                            const color = exist ? boxes[i].bgc : SELECT_COLORS[i]
                            const isActive = exist && i === activeIdx
                            return (
                                <div
                                    key={i}
                                    onClick={() => exist && setActiveIdx(i)}
                                    title={exist ? `切换到框 ${i + 1}` : '该框未创建'}
                                    style={{
                                        width: '1.1rem',
                                        height: '1.1rem',
                                        borderRadius: '50%',
                                        background: exist ? color : '#2a2e33',
                                        opacity: exist ? 1 : 0.5,
                                        border: isActive ? `2px solid ${getSelectBoxDisplayColor(color)}` : '2px solid transparent',
                                        boxShadow: isActive ? `0 0 0 2px ${color}55` : 'none',
                                        cursor: exist ? 'pointer' : 'not-allowed',
                                        transition: 'transform 0.12s, box-shadow 0.12s',
                                        transform: isActive ? 'scale(1.1)' : 'scale(1)',
                                    }}
                                />
                            )
                        })}
                    </div>
                    <span
                        onClick={onBack}
                        style={{
                            fontSize: '0.75rem',
                            color: '#8C939D',
                            cursor: 'pointer',
                            padding: '0.2rem 0.5rem',
                            borderRadius: '4px',
                            background: '#2a2e33',
                        }}
                    >
                        ‹ 返回
                    </span>
                </div>

                {/* 当前选中提示 */}
                {!activeBox && (
                    <div style={{
                        padding: '1.2rem',
                        textAlign: 'center',
                        color: '#6C7784',
                        fontSize: '0.8rem',
                        border: '1px dashed #32373E',
                        borderRadius: '0.5rem',
                    }}>
                        在画布上画一个框开始采集
                    </div>
                )}

                {/* 8 个指标卡 (4 行 × 2 列) */}
                {activeBox && (
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '0.45rem',
                    }}>
                        <MetricCard color={activeColor} label='平均压力' value={metrics.pressAver} unit='ADC' />
                        <MetricCard color={activeColor} label='压力总和' value={metrics.pressTotal} unit='ADC' />
                        <MetricCard color={activeColor} label='最大压强' value={metrics.pressMax} unit='ADC' />
                        <MetricCard color={activeColor} label='最大压力坐标' value={`(${metrics.maxCoord.x}, ${metrics.maxCoord.y})`} />
                        <MetricCard color={activeColor} label='最大压强中心' value={`(${metrics.centroid.x}, ${metrics.centroid.y})`} />
                        <MetricCard color={activeColor} label='激活点数' value={metrics.areaTotal} unit='个' />
                        <MetricCard color={activeColor} label='框选区列范围' value={`[${metrics.colRange[0]}, ${metrics.colRange[1]}]`} />
                        <MetricCard color={activeColor} label='框选区行范围' value={`[${metrics.rowRange[0]}, ${metrics.rowRange[1]}]`} />
                    </div>
                )}
            </div>
        </DraggablePanel>
    )
}

function MetricCard({ color, label, value, unit }) {
    return (
        <div style={{
            padding: '0.5rem 0.6rem',
            background: getSelectBoxFillColor(color, 0.1),
            borderLeft: `3px solid ${color}`,
            borderRadius: '0.35rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.2rem',
            minHeight: '3.4rem',
        }}>
            <div style={{ color: '#8C939D', fontSize: '0.7rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {label}
            </div>
            <div style={{
                color: '#E6EBF0',
                fontSize: '0.95rem',
                fontVariantNumeric: 'tabular-nums',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'baseline',
                gap: '0.25rem',
            }}>
                <span>{value}</span>
                {unit && <span style={{ fontSize: '0.65rem', color: '#6C7784', fontWeight: 400 }}>{unit}</span>}
            </div>
        </div>
    )
}
