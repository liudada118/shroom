import React, { useContext, useEffect, useMemo, useState } from 'react'
import { Button, Select, Slider } from 'antd'
import dayjs from 'dayjs'
import { shallow } from 'zustand/shallow'
import { pageContext } from '../../page/test/Test'
import { useEquipStore } from '../../store/equipStore'
import ContrastHeatmap from './ContrastHeatmap'
import SelectSet from '../title/SelectSet'
import './contrast.scss'

const METRICS = [
    { key: 'aver', label: '平均压强' },
    { key: 'max', label: '最大压强' },
    { key: 'min', label: '最小压强' },
    { key: 'press', label: '压力总和' },
    { key: 'area', label: '受压面积' },
    { key: 'points', label: '有效点数' },
    { key: 'center', label: '压力重心' },
]

function getFrameByProgress(frames = [], progress = 0) {
    if (!frames.length) return {}
    const index = frames.length > 1 ? Math.round((frames.length - 1) * progress / 100) : 0
    return frames[Math.max(0, Math.min(frames.length - 1, index))] || {}
}

function buildDiffArr(leftArr = [], rightArr = []) {
    const length = Math.min(leftArr.length, rightArr.length)
    return Array.from({ length }, (_, index) => (Number(rightArr[index]) || 0) - (Number(leftArr[index]) || 0))
}

function getRegionArr(arr = [], width, matrixRect) {
    if (!matrixRect || !width) return arr
    const { xStart, xEnd, yStart, yEnd } = matrixRect
    if ([xStart, xEnd, yStart, yEnd].some((value) => !Number.isFinite(value))) return arr
    const result = []
    for (let y = yStart; y < yEnd; y++) {
        for (let x = xStart; x < xEnd; x++) {
            const value = arr[y * width + x]
            if (value !== undefined) result.push(value)
        }
    }
    return result
}

function calcMetrics(arr = [], width = 1, matrixRect = null) {
    const positive = arr.filter((value) => Number(value) > 0)
    const press = positive.reduce((sum, value) => sum + Number(value), 0)
    const area = positive.length
    const max = positive.length ? Math.max(...positive) : 0
    const min = positive.length ? Math.min(...positive) : 0
    const aver = area ? press / area : 0
    let weightedX = 0
    let weightedY = 0
    let totalWeight = 0
    arr.forEach((value, index) => {
        const numeric = Number(value) || 0
        if (numeric <= 0) return
        const offsetX = matrixRect?.xStart || 0
        const offsetY = matrixRect?.yStart || 0
        weightedX += ((index % width) + offsetX) * numeric
        weightedY += (Math.floor(index / width) + offsetY) * numeric
        totalWeight += numeric
    })
    return {
        press,
        area,
        points: area,
        max,
        min,
        aver,
        center: totalWeight ? `${(weightedX / totalWeight).toFixed(1)}, ${(weightedY / totalWeight).toFixed(1)}` : 'N/A',
    }
}

function formatValue(value) {
    if (typeof value === 'string') return value
    if (!Number.isFinite(value)) return 'N/A'
    return Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(1)
}

function formatRate(a, b) {
    if (!Number.isFinite(a) || !Number.isFinite(b) || a === 0) return 'N/A'
    return `${(((b - a) / a) * 100).toFixed(1)}%`
}

export default function NumThresContrast() {
    const pageInfo = useContext(pageContext)
    const contrast = useEquipStore(s => s.contrast, shallow)
    const selectArr = useEquipStore(s => s.selectArr, shallow)
    const displayType = useEquipStore(s => s.displayType, shallow)
    const [progress, setProgress] = useState(0)
    const [playing, setPlaying] = useState(false)
    const [activeKey, setActiveKey] = useState('')

    const keys = contrast?.keys || []

    useEffect(() => {
        if (!keys.length) return
        const matchedKey = keys.find((key) => displayType.includes('back') ? key.includes('back') : key.includes('sit'))
        setActiveKey((current) => current && keys.includes(current) ? current : (matchedKey || keys[0]))
    }, [keys.join('|'), displayType])

    useEffect(() => {
        if (!playing) return
        const timer = setInterval(() => {
            setProgress((current) => current >= 100 ? 0 : Math.min(100, current + 1))
        }, 120)
        return () => clearInterval(timer)
    }, [playing])

    const leftFrame = useMemo(() => getFrameByProgress(contrast?.left?.frames, progress), [contrast, progress])
    const rightFrame = useMemo(() => getFrameByProgress(contrast?.right?.frames, progress), [contrast, progress])
    const leftData = leftFrame?.[activeKey] || {}
    const rightData = rightFrame?.[activeKey] || {}
    const width = leftData.width || rightData.width || 32
    const height = leftData.height || rightData.height || 32
    const leftArr = leftData.arr || []
    const rightArr = rightData.arr || []
    const diffArr = useMemo(() => buildDiffArr(leftArr, rightArr), [leftArr, rightArr])

    const activeSelect = useMemo(() => {
        if (!Array.isArray(selectArr)) return null
        return selectArr.find((item) => !item.matrixKey || item.matrixKey === activeKey)?.matrixRect || null
    }, [selectArr, activeKey])

    const metricRows = useMemo(() => {
        const sourceA = getRegionArr(leftArr, width, activeSelect)
        const sourceB = getRegionArr(rightArr, width, activeSelect)
        const metricWidth = activeSelect ? Math.max(1, activeSelect.xEnd - activeSelect.xStart) : width
        const metricA = calcMetrics(sourceA, metricWidth, activeSelect)
        const metricB = calcMetrics(sourceB, metricWidth, activeSelect)
        return METRICS.map((item) => {
            const a = metricA[item.key]
            const b = metricB[item.key]
            const diff = typeof a === 'number' && typeof b === 'number' ? b - a : 'N/A'
            return {
                ...item,
                a,
                b,
                diff,
                rate: typeof a === 'number' && typeof b === 'number' ? formatRate(a, b) : 'N/A',
            }
        })
    }, [leftArr, rightArr, width, activeSelect])

    const leftIndex = contrast?.left?.frames?.length > 1 ? Math.round((contrast.left.frames.length - 1) * progress / 100) : 0
    const rightIndex = contrast?.right?.frames?.length > 1 ? Math.round((contrast.right.frames.length - 1) * progress / 100) : 0

    const exitContrast = () => {
        setPlaying(false)
        pageInfo?.setDisplay?.('num')
        useEquipStore.getState().setDataStatus('history')
        useEquipStore.getState().setContrast({})
    }

    const changeActiveKey = (nextKey) => {
        setActiveKey(nextKey)
        if (nextKey.includes('back')) {
            useEquipStore.getState().setDisplayType('back2D')
            pageInfo?.setDisplayType?.('back2D')
        } else if (nextKey.includes('sit')) {
            useEquipStore.getState().setDisplayType('sit2D')
            pageInfo?.setDisplayType?.('sit2D')
        }
    }

    if (!keys.length || !activeKey) {
        return (
            <div className="contrastPage">
                <div className="contrastEmpty">暂无可对比数据，请先在历史数据中选择 A/B 后开始对比。</div>
            </div>
        )
    }

    return (
        <div className="contrastPage">
            <div className="contrastTopbar">
                <div>
                    <div className="contrastTitle">数据对比</div>
                    <div className="contrastMeta">
                        A: {contrast.left?.name || contrast.left?.date} ｜ B: {contrast.right?.name || contrast.right?.date}
                    </div>
                </div>
                <div className="contrastActions">
                    <Select
                        size="small"
                        value={activeKey}
                        options={keys.map((key) => ({ label: key, value: key }))}
                        onChange={changeActiveKey}
                        style={{ width: 130 }}
                    />
                    <Button size="small" onClick={exitContrast}>退出对比</Button>
                </div>
            </div>

            {contrast?.warnings?.length ? (
                <div className="contrastWarning">{contrast.warnings.join('；')}</div>
            ) : null}

            <div className="contrastSelectPanel">
                <SelectSet onSelect />
            </div>

            <div className="contrastGrid">
                <ContrastHeatmap
                    title="A 基准数据"
                    subtitle={`第 ${leftIndex + 1}/${contrast.left?.length || 0} 帧`}
                    arr={leftArr}
                    width={width}
                    height={height}
                    className="contrastCanvasA"
                />
                <ContrastHeatmap
                    title="B 对比数据"
                    subtitle={`第 ${rightIndex + 1}/${contrast.right?.length || 0} 帧`}
                    arr={rightArr}
                    width={width}
                    height={height}
                />
                <ContrastHeatmap
                    title="B-A 差值图"
                    subtitle="红色升高，蓝色降低"
                    arr={diffArr}
                    width={width}
                    height={height}
                    mode="diff"
                />
            </div>

            <div className="contrastPlayback">
                <Button size="small" onClick={() => setPlaying(!playing)}>{playing ? '暂停' : '播放'}</Button>
                <Slider value={progress} onChange={setProgress} min={0} max={100} style={{ flex: 1 }} />
                <div className="contrastProgress">{progress}%</div>
            </div>

            <div className="contrastLegend">
                <span className="legendBlue" />B 小于 A
                <span className="legendWhite" />接近无变化
                <span className="legendRed" />B 大于 A
                <span className="legendScope">当前指标范围：{activeSelect ? '框选区域' : '全量矩阵'}</span>
            </div>

            <div className="contrastMetricTable">
                <div className="metricHeader">
                    <span>指标</span>
                    <span>A</span>
                    <span>B</span>
                    <span>B-A</span>
                    <span>变化率</span>
                </div>
                {metricRows.map((row) => (
                    <div className="metricRow" key={row.key}>
                        <span>{row.label}</span>
                        <span>{formatValue(row.a)}</span>
                        <span>{formatValue(row.b)}</span>
                        <span>{formatValue(row.diff)}</span>
                        <span>{row.rate}</span>
                    </div>
                ))}
            </div>

            <div className="contrastFooterMeta">
                A 时间：{contrast.frame?.leftTimestamp ? dayjs(contrast.frame.leftTimestamp).format('YYYY-MM-DD HH:mm:ss') : '-'}
                <span />
                B 时间：{contrast.frame?.rightTimestamp ? dayjs(contrast.frame.rightTimestamp).format('YYYY-MM-DD HH:mm:ss') : '-'}
            </div>
        </div>
    )
}
