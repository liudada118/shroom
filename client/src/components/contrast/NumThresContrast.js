import React, { useContext, useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { Button, Select, Slider, message } from 'antd'
import dayjs from 'dayjs'
import { shallow } from 'zustand/shallow'
import { pageContext } from '../../page/test/Test'
import { useEquipStore } from '../../store/equipStore'
import { localAddress, pointConfig } from '../../util/constant'
import ContrastHeatmap from './ContrastHeatmap'
import { useTranslation } from 'react-i18next'
import './contrast.scss'

const METRIC_KEYS = ['aver', 'max', 'min', 'press', 'area', 'points', 'center']
const CONTRAST_PLAYBACK_SPEEDS = [0.5, 1, 2, 4]
const BASE_PLAYBACK_INTERVAL_MS = 120

const CONTRAST_COPY = {
    zh: {
        metrics: {
            aver: '平均压强',
            max: '最大压强',
            min: '最小压强',
            press: '压力总和',
            area: '受压面积(cm²)',
            points: '有效点数',
            center: '压力重心',
        },
        region: '区域',
        notRecorded: '未记录',
        flippedBoth: '上下+左右',
        flippedHorizontal: '左右翻转',
        flippedVertical: '上下翻转',
        originalDirection: '原始方向',
        zeroNotApplied: '未置零',
        zeroEnabled: '已开启',
        zeroApplied: '已置零',
        pressureHigher: '高',
        pressureLower: '低',
        pressureConclusion: 'B 总压力{{direction}} {{value}}',
        pressureNA: 'B 总压力差异 N/A',
        areaIncrease: '增加',
        areaDecrease: '减少',
        areaConclusion: '受压面积{{direction}} {{value}}',
        areaNA: '受压面积差异 N/A',
        exportScope: '导出范围',
        exportObject: '导出对象',
        exportFrames: '导出帧数',
        exportFields: '导出字段',
        fullMatrix: '全量矩阵',
        exportFieldValue: 'A / B / B-A 指标',
        noExportData: '暂无可导出的对比数据',
        exportSuccess: '对比结果已导出',
        empty: '暂无可对比数据，请先在历史数据中选择 A/B 后开始对比。',
        title: '数据对比',
        exportResult: '导出结果',
        exit: '退出对比',
        currentScope: '当前范围',
        selectionRegion: '框选区域',
        currentFrame: '当前帧',
        filterValue: '过滤值',
        object: '对象',
        seatSensor: '坐垫传感器',
        backSensor: '靠背传感器',
        sampleRate: '采样率',
        zero: '置零',
        direction: '方向',
        diffRange: '差值范围',
        currentConclusion: '当前帧结论',
        redBlueTip: '红色表示 B 大于 A，蓝色表示 B 小于 A',
        baselineA: 'A 基准数据',
        compareB: 'B 对比数据',
        diffMap: 'B-A 差值图',
        frame: '帧',
        diffSubtitle: '红色升高，蓝色降低',
        regionManage: '区域管理',
        regionSub: '选择分析范围，不改变原始数据',
        full: '全量',
        fullMatrixMeta: '全部点位参与指标计算',
        pressureDiff: '压力差',
        areaDiff: '面积差',
        noSelection: '当前没有框选区域，可在下方创建或套用模板。',
        exportPreview: '导出预览',
        pause: '暂停',
        play: '播放',
        bLess: 'B 小于 A',
        nearlyNoChange: '接近无变化',
        bGreater: 'B 大于 A',
        currentMetricScope: '当前指标范围',
        pressureChart: '压力变化曲线',
        areaChart: '面积变化曲线',
        metric: '指标',
        rate: '变化率',
        timeA: 'A 时间',
        timeB: 'B 时间',
    },
    en: {
        metrics: {
            aver: 'Avg Pressure',
            max: 'Max Pressure',
            min: 'Min Pressure',
            press: 'Pressure Sum',
            area: 'Contact Area(cm²)',
            points: 'Valid Points',
            center: 'Pressure Center',
        },
        region: 'Region',
        notRecorded: 'Not recorded',
        flippedBoth: 'Vertical + Horizontal',
        flippedHorizontal: 'Horizontal Flip',
        flippedVertical: 'Vertical Flip',
        originalDirection: 'Original',
        zeroNotApplied: 'Not zeroed',
        zeroEnabled: 'Enabled',
        zeroApplied: 'Zeroed',
        pressureHigher: 'higher by',
        pressureLower: 'lower by',
        pressureConclusion: 'B total pressure is {{direction}} {{value}}',
        pressureNA: 'B total pressure difference N/A',
        areaIncrease: 'increased by',
        areaDecrease: 'decreased by',
        areaConclusion: 'Contact area {{direction}} {{value}}',
        areaNA: 'Contact area difference N/A',
        exportScope: 'Export Scope',
        exportObject: 'Export Object',
        exportFrames: 'Export Frames',
        exportFields: 'Export Fields',
        fullMatrix: 'Full Matrix',
        exportFieldValue: 'A / B / B-A Metrics',
        noExportData: 'No comparison data to export',
        exportSuccess: 'Comparison result exported',
        empty: 'No comparison data. Select A/B in history first.',
        title: 'Data Comparison',
        exportResult: 'Export Result',
        exit: 'Exit Compare',
        currentScope: 'Scope',
        selectionRegion: 'Selection Area',
        currentFrame: 'Frame',
        filterValue: 'Filter',
        object: 'Object',
        seatSensor: 'Seat Sensor',
        backSensor: 'Back Sensor',
        sampleRate: 'Sample Rate',
        zero: 'Zero',
        direction: 'Direction',
        diffRange: 'Diff Range',
        currentConclusion: 'Current Frame',
        redBlueTip: 'Red means B is greater than A; blue means B is less than A',
        baselineA: 'A Baseline',
        compareB: 'B Comparison',
        diffMap: 'B-A Difference',
        frame: 'Frame',
        diffSubtitle: 'Red increased, blue decreased',
        regionManage: 'Region Management',
        regionSub: 'Choose an analysis scope without changing raw data',
        full: 'Full',
        fullMatrixMeta: 'All points are included in metric calculation',
        pressureDiff: 'Pressure Diff',
        areaDiff: 'Area Diff',
        noSelection: 'No selection areas. Create one or apply a template below.',
        exportPreview: 'Export Preview',
        pause: 'Pause',
        play: 'Play',
        bLess: 'B < A',
        nearlyNoChange: 'Nearly no change',
        bGreater: 'B > A',
        currentMetricScope: 'Metric Scope',
        pressureChart: 'Pressure Curve',
        areaChart: 'Area Curve',
        metric: 'Metric',
        rate: 'Rate',
        timeA: 'A Time',
        timeB: 'B Time',
    },
}

function getFrameByIndex(frames = [], index = 0) {
    if (!frames.length) return {}
    const safeIndex = Math.max(0, Math.min(frames.length - 1, Math.round(Number(index) || 0)))
    return frames[safeIndex] || {}
}

function getFrameTimestamp(frame, fallbackIndex = 0) {
    const raw = frame?._timestamp ?? frame?.timestamp ?? frame?.rawFrame?.timestamp ?? frame?.raw_frame?.timestamp
    const numeric = Number(raw)
    return Number.isFinite(numeric) ? numeric : fallbackIndex
}

function getFrameTimeRange(frames = []) {
    if (!frames.length) return { start: 0, end: 0, duration: 0 }
    const start = getFrameTimestamp(frames[0], 0)
    const end = getFrameTimestamp(frames[frames.length - 1], frames.length - 1)
    const duration = Math.max(0, end - start)
    return { start, end, duration }
}

function getTimelineIndex(frames = [], progress = 0) {
    if (!frames.length) return 0
    if (frames.length === 1) return 0
    const safeProgress = Math.max(0, Math.min(100, Number(progress) || 0))
    const range = getFrameTimeRange(frames)
    if (!range.duration) return getAlignedIndex(frames.length, safeProgress)
    const target = range.start + range.duration * safeProgress / 100
    let bestIndex = 0
    let bestDistance = Infinity
    frames.forEach((frame, index) => {
        const distance = Math.abs(getFrameTimestamp(frame, index) - target)
        if (distance < bestDistance) {
            bestDistance = distance
            bestIndex = index
        }
    })
    return bestIndex
}

function getProgressByTimelineIndex(frames = [], index = 0) {
    if (!frames.length || frames.length === 1) return 0
    const safeIndex = Math.max(0, Math.min(frames.length - 1, Math.round(Number(index) || 0)))
    const range = getFrameTimeRange(frames)
    if (!range.duration) return (safeIndex / (frames.length - 1)) * 100
    return Math.max(0, Math.min(100, ((getFrameTimestamp(frames[safeIndex], safeIndex) - range.start) / range.duration) * 100))
}

function getFrameByProgress(frames = [], progress = 0) {
    if (!frames.length) return {}
    return frames[getTimelineIndex(frames, progress)] || {}
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

function getPointAreaCm2(matrixKey = '') {
    let [system, surface] = String(matrixKey || '').split('-')
    if (!surface && (system === 'back' || system === 'sit')) {
        surface = system
        system = useEquipStore.getState().systemType || 'endi'
    }
    const config = pointConfig?.[system]?.[surface]
    const widthDistance = Number(config?.pointWidthDistance) || 10
    const heightDistance = Number(config?.pointHeightDistance) || 10
    return (widthDistance * heightDistance) / 100
}

function getDisplayNumber(value) {
    if (!Number.isFinite(value)) return NaN
    const digits = Math.abs(value) >= 100 ? 0 : 1
    return Number(value.toFixed(digits))
}

function calcDisplayDiff(a, b) {
    const displayA = getDisplayNumber(a)
    const displayB = getDisplayNumber(b)
    return Number.isFinite(displayA) && Number.isFinite(displayB) ? displayB - displayA : 'N/A'
}

function calcMetrics(arr = [], width = 1, matrixRect = null, pointAreaCm2 = 1) {
    const positive = arr.filter((value) => Number(value) > 0)
    const press = positive.reduce((sum, value) => sum + Number(value), 0)
    const points = positive.length
    const area = points * pointAreaCm2
    const max = positive.length ? Math.max(...positive) : 0
    const min = positive.length ? Math.min(...positive) : 0
    const aver = points ? press / points : 0
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
        points,
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

function fillTemplate(template, replacements = {}, fallback = '') {
    return Object.entries(replacements).reduce((text, [key, value]) => {
        return text.replace(new RegExp(`{{${key}}}`, 'g'), value)
    }, String(template || fallback))
}

function getContrastObjectLabel(key, copy = CONTRAST_COPY.zh) {
    const text = String(key || '')
    const normalized = text.toLowerCase()
    if (normalized === 'endi-sit' || normalized === 'sit' || normalized.endsWith('-sit')) {
        return copy.seatSensor || '坐垫传感器'
    }
    if (normalized === 'endi-back' || normalized === 'back' || normalized.endsWith('-back')) {
        return copy.backSensor || '靠背传感器'
    }
    return text
}

function getPublicContrastKey(key = '') {
    const text = String(key || '')
    const normalized = text.toLowerCase()
    if (normalized === 'endi-back') return 'back'
    if (normalized === 'endi-sit') return 'sit'
    return text.replace(/endi/ig, 'car')
}

function formatRate(a, b) {
    if (!Number.isFinite(a) || !Number.isFinite(b) || a === 0) return 'N/A'
    return `${(((b - a) / a) * 100).toFixed(1)}%`
}

function getSignedClass(value) {
    const numeric = Number(value)
    if (!Number.isFinite(numeric) || numeric === 0) return 'neutral'
    return numeric > 0 ? 'positive' : 'negative'
}

function getRateInfo(rate) {
    const numeric = Number.parseFloat(String(rate).replace('%', ''))
    if (!Number.isFinite(numeric) || numeric === 0) {
        return { className: 'neutral', arrow: '—', text: rate || 'N/A' }
    }
    return {
        className: numeric > 0 ? 'positive' : 'negative',
        arrow: numeric > 0 ? '↑' : '↓',
        text: rate,
    }
}

function csvCell(value) {
    if (value === undefined || value === null) return ''
    const text = String(value)
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function downloadText(filename, content, mimeType = 'text/csv;charset=utf-8') {
    const blob = new Blob([`\uFEFF${content}`], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
}

function getAlignedIndex(length, progress) {
    if (!length) return 0
    return length > 1 ? Math.round((length - 1) * progress / 100) : 0
}

function getClampedFrameIndex(length, index) {
    if (!length) return 0
    const value = Math.round(Number(index) || 0)
    return Math.max(0, Math.min(length - 1, value))
}

function getMetricValue(metrics, key) {
    const value = metrics?.[key]
    return typeof value === 'string' ? value : (Number.isFinite(value) ? value : '')
}

function formatDirection(direction, copy = CONTRAST_COPY.zh) {
    if (!direction) return copy.notRecorded
    const rotateDegree = Number(direction.rotateDegree ?? direction.rotate_degree) || 0
    if (rotateDegree) return `${rotateDegree}°`
    const left = direction.left !== false
    const up = direction.up !== false
    if (!left && !up) return copy.flippedBoth
    if (!left) return copy.flippedHorizontal
    if (!up) return copy.flippedVertical
    return copy.originalDirection
}

function formatZeroState(zeroState, copy = CONTRAST_COPY.zh) {
    if (!zeroState?.enabled && !zeroState?.zero_enabled) return copy.zeroNotApplied
    return zeroState?.has_baseline === false ? copy.zeroEnabled : copy.zeroApplied
}

function getSampleRateText(data = {}, copy = CONTRAST_COPY.zh) {
    const sampleRate = data.sampleRateHz || data.rawFrame?.sample_rate_hz || data.rawFrame?.hardware_sample_rate_hz
    return sampleRate ? `${formatValue(Number(sampleRate))}Hz` : copy.notRecorded
}

function buildSeriesByFrameIndex(leftValues = [], rightValues = []) {
    const count = Math.max(leftValues.length, rightValues.length)
    if (!count) return []
    return Array.from({ length: count }, (_, index) => {
        const left = Number(leftValues[getClampedFrameIndex(leftValues.length, index)] || 0)
        const right = Number(rightValues[getClampedFrameIndex(rightValues.length, index)] || 0)
        return { frameIndex: index, left, right, diff: right - left }
    })
}

function buildSingleSeries(values = []) {
    return (Array.isArray(values) ? values : []).map((value, index) => ({
        index,
        value: Number(value) || 0,
    }))
}

function buildMetricSeriesFromFrames(frames = [], matrixKey, metricKey, matrixRect = null) {
    if (!Array.isArray(frames) || !matrixKey) return []
    const pointAreaCm2 = getPointAreaCm2(matrixKey)
    return frames.map((frame) => {
        const data = frame?.[matrixKey] || {}
        const width = data.width || 1
        const source = getRegionArr(data.arr || [], width, matrixRect)
        const metricWidth = matrixRect ? Math.max(1, matrixRect.xEnd - matrixRect.xStart) : width
        return Number(calcMetrics(source, metricWidth, matrixRect, pointAreaCm2)[metricKey]) || 0
    })
}

function MiniLineChart({ title, rows = [], mode = 'pair', markers = {}, unit = '' }) {
    const width = 520
    const height = 150
    const padding = { left: 42, right: 18, top: 18, bottom: 28 }
    const isSingle = mode === 'single'
    const values = isSingle
        ? rows.map((row) => row.value).filter(Number.isFinite)
        : rows.flatMap((row) => [row.left, row.right, row.diff]).filter(Number.isFinite)
    const minValue = Math.min(0, ...values)
    const maxValue = Math.max(1, ...values)
    const span = maxValue - minValue || 1
    const plotWidth = width - padding.left - padding.right
    const plotHeight = height - padding.top - padding.bottom
    const pointX = (index) => padding.left + (rows.length > 1 ? index / (rows.length - 1) : 0) * plotWidth
    const pointY = (value) => padding.top + plotHeight - ((Number(value) - minValue) / span) * plotHeight
    const yTicks = Array.from({ length: 4 }, (_, index) => minValue + (span * index / 3)).reverse()
    const xTicks = rows.length > 1
        ? [0, Math.floor((rows.length - 1) / 2), rows.length - 1]
        : [0]
    const makePath = (key) => rows.map((row, index) => {
        const x = pointX(index)
        const y = pointY(row[key])
        return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    }).join(' ')
    const singlePath = rows.map((row, index) => {
        const x = pointX(index)
        const y = pointY(row.value)
        return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    }).join(' ')
    const markerItems = isSingle ? [
        { key: 'A', index: markers.a, className: 'chartMarkerA' },
        { key: 'B', index: markers.b, className: 'chartMarkerB' },
    ].filter((item) => Number.isInteger(item.index) && item.index >= 0 && item.index < rows.length) : []

    return (
        <div className="contrastLinePanel">
            <div className="contrastLineHeader">
                <div>
                    <div className="contrastLineTitle">
                        {title}
                        <span className="lineTitleHelp">?</span>
                    </div>
                    <div className="contrastLineTitleLegend">
                        {isSingle ? (
                            <>
                                <span className="chartDotTrend" />历史趋势
                                <span className="chartDotA" />A 时间点
                                <span className="chartDotB" />B 时间点
                            </>
                        ) : (
                            <>
                                <span className="chartDotA" />A 基础数据
                                <span className="chartDotB" />B 对比数据
                                <span className="chartDotDiff" />B-A 差值
                            </>
                        )}
                    </div>
                </div>
                <span>单位：{unit || '-'}</span>
            </div>
            <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title}>
                {yTicks.map((tick) => {
                    const y = pointY(tick)
                    return (
                        <g key={`y-${tick}`}>
                            <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} className="chartGridLine" />
                            <text x={padding.left - 8} y={y + 3} textAnchor="end" className="chartAxisText">{formatValue(tick)}</text>
                        </g>
                    )
                })}
                {xTicks.map((index) => {
                    const x = pointX(index)
                    return (
                        <g key={`x-${index}`}>
                            <line x1={x} x2={x} y1={padding.top} y2={height - padding.bottom} className="chartGridLine vertical" />
                            <text x={x} y={height - 8} textAnchor="middle" className="chartAxisText">{index + 1}</text>
                        </g>
                    )
                })}
                <line x1={padding.left} x2={width - padding.right} y1={height - padding.bottom} y2={height - padding.bottom} className="chartAxis" />
                <line x1={padding.left} x2={padding.left} y1={padding.top} y2={height - padding.bottom} className="chartAxis" />
                {isSingle ? (
                    <>
                        <path d={singlePath} className="chartLine chartLineTrend" />
                        {markerItems.map((item) => {
                            const row = rows[item.index]
                            const x = pointX(item.index)
                            const y = pointY(row?.value)
                            return (
                                <g key={item.key}>
                                    <line x1={x} x2={x} y1={padding.top} y2={height - padding.bottom} className={`chartMarkerLine ${item.className}`} />
                                    <circle cx={x} cy={y} r="4.2" className={`chartMarkerDot ${item.className}`} />
                                    <text x={x + 5} y={Math.max(padding.top + 8, y - 6)} className="chartMarkerText">{item.key}</text>
                                </g>
                            )
                        })}
                    </>
                ) : (
                    <>
                        <path d={makePath('left')} className="chartLine chartLineA" />
                        <path d={makePath('right')} className="chartLine chartLineB" />
                        <path d={makePath('diff')} className="chartLine chartLineDiff" />
                    </>
                )}
            </svg>
        </div>
    )
}

export default function NumThresContrast() {
    const { i18n } = useTranslation()
    const isEnglish = String(i18n.language || localStorage.getItem('language') || '').toLowerCase().startsWith('en')
    const copy = CONTRAST_COPY[isEnglish ? 'en' : 'zh']
    const metrics = useMemo(() => METRIC_KEYS.map((key) => ({ key, label: copy.metrics[key] })), [copy])
    const pageInfo = useContext(pageContext)
    const contrast = useEquipStore(s => s.contrast, shallow)
    const displayType = useEquipStore(s => s.displayType, shallow)
    const settingValue = useEquipStore(s => s.settingValue, shallow)
    const [playing, setPlaying] = useState(false)
    const [playbackSpeed, setPlaybackSpeed] = useState(1)
    const [playbackExpanded, setPlaybackExpanded] = useState(false)
    const [activeKey, setActiveKey] = useState('')

    const keys = contrast?.keys || []
    const isTimePointMode = contrast?.mode === 'single_record_frame'
    const [timeIndexA, setTimeIndexA] = useState(0)
    const [timeIndexB, setTimeIndexB] = useState(1)
    const [playbackIndexA, setPlaybackIndexA] = useState(0)
    const [playbackIndexB, setPlaybackIndexB] = useState(0)
    const leftFrameCount = contrast?.left?.frames?.length || 0
    const rightFrameCount = contrast?.right?.frames?.length || 0

    useEffect(() => {
        if (!keys.length) return
        const matchedKey = keys.find((key) => displayType.includes('back') ? key.includes('back') : key.includes('sit'))
        setActiveKey((current) => current && keys.includes(current) ? current : (matchedKey || keys[0]))
    }, [keys.join('|'), displayType])

    useEffect(() => {
        setPlaying(false)
        setPlaybackIndexA(0)
        setPlaybackIndexB(0)
        if (!isTimePointMode) {
            setTimeIndexA(0)
            setTimeIndexB(1)
            return
        }
        const maxIndex = Math.max(0, leftFrameCount - 1)
        const nextA = Math.max(0, Math.min(maxIndex, Number(contrast?.time?.frameA) || 0))
        let nextB = Math.max(0, Math.min(maxIndex, Number(contrast?.time?.frameB) || maxIndex))
        if (nextA === nextB && maxIndex > 0) {
            nextB = nextA === 0 ? 1 : 0
        }
        setTimeIndexA(nextA)
        setTimeIndexB(nextB)
    }, [contrast?.mode, contrast?.record?.id, contrast?.left?.id, contrast?.right?.id, leftFrameCount, rightFrameCount])

    useEffect(() => {
        if (!playing || isTimePointMode) return
        const timer = setInterval(() => {
            setPlaybackIndexA((current) => getClampedFrameIndex(leftFrameCount, current + 1))
            setPlaybackIndexB((current) => getClampedFrameIndex(rightFrameCount, current + 1))
        }, Math.max(16, Math.round(BASE_PLAYBACK_INTERVAL_MS / playbackSpeed)))
        return () => clearInterval(timer)
    }, [playing, isTimePointMode, leftFrameCount, rightFrameCount, playbackSpeed])

    useEffect(() => {
        if (!playing || isTimePointMode) return
        const leftDone = !leftFrameCount || playbackIndexA >= leftFrameCount - 1
        const rightDone = !rightFrameCount || playbackIndexB >= rightFrameCount - 1
        if (leftDone && rightDone) setPlaying(false)
    }, [playing, isTimePointMode, playbackIndexA, playbackIndexB, leftFrameCount, rightFrameCount])

    const leftFrame = useMemo(() => (
        isTimePointMode
            ? getFrameByIndex(contrast?.left?.frames, timeIndexA)
            : getFrameByIndex(contrast?.left?.frames, playbackIndexA)
    ), [contrast, isTimePointMode, timeIndexA, playbackIndexA])
    const rightFrame = useMemo(() => (
        isTimePointMode
            ? getFrameByIndex(contrast?.right?.frames, timeIndexB)
            : getFrameByIndex(contrast?.right?.frames, playbackIndexB)
    ), [contrast, isTimePointMode, timeIndexB, playbackIndexB])
    const leftData = leftFrame?.[activeKey] || {}
    const rightData = rightFrame?.[activeKey] || {}
    const width = leftData.width || rightData.width || 32
    const height = leftData.height || rightData.height || 32
    const leftArr = leftData.arr || []
    const rightArr = rightData.arr || []
    const diffArr = useMemo(() => buildDiffArr(leftArr, rightArr), [leftArr, rightArr])

    const activeSelect = null

    const metricRows = useMemo(() => {
        const sourceA = getRegionArr(leftArr, width, activeSelect)
        const sourceB = getRegionArr(rightArr, width, activeSelect)
        const metricWidth = activeSelect ? Math.max(1, activeSelect.xEnd - activeSelect.xStart) : width
        const pointAreaCm2 = getPointAreaCm2(activeKey)
        const metricA = calcMetrics(sourceA, metricWidth, activeSelect, pointAreaCm2)
        const metricB = calcMetrics(sourceB, metricWidth, activeSelect, pointAreaCm2)
        return metrics.map((item) => {
            const a = metricA[item.key]
            const b = metricB[item.key]
            const diff = typeof a === 'number' && typeof b === 'number' ? calcDisplayDiff(a, b) : 'N/A'
            return {
                ...item,
                a,
                b,
                diff,
                rate: typeof a === 'number' && typeof b === 'number' ? formatRate(a, b) : 'N/A',
            }
        })
    }, [leftArr, rightArr, width, activeSelect, activeKey, metrics])

    const conclusion = useMemo(() => {
        const pressRow = metricRows.find((row) => row.key === 'press')
        const areaRow = metricRows.find((row) => row.key === 'area')
        const maxAbsDiff = diffArr.reduce((max, value) => Math.max(max, Math.abs(Number(value) || 0)), 0)
        const pressDiff = Number(pressRow?.diff)
        const areaDiff = Number(areaRow?.diff)
        const pressText = Number.isFinite(pressDiff)
            ? fillTemplate(
                copy.pressConclusion || copy.pressureConclusion,
                {
                    direction: pressDiff >= 0 ? (copy.pressHigher || copy.pressureHigher || 'higher by') : (copy.pressLower || copy.pressureLower || 'lower by'),
                    value: formatValue(Math.abs(pressDiff)),
                },
                'B total pressure is {{direction}} {{value}}'
            )
            : (copy.pressNA || copy.pressureNA || 'B total pressure difference N/A')
        const areaText = Number.isFinite(areaDiff)
            ? fillTemplate(
                copy.areaConclusion,
                {
                    direction: areaDiff >= 0 ? (copy.areaIncrease || 'increased by') : (copy.areaDecrease || 'decreased by'),
                    value: formatValue(Math.abs(areaDiff)),
                },
                'Contact area {{direction}} {{value}}'
            )
            : (copy.areaNA || 'Contact area difference N/A')
        return {
            pressText,
            areaText,
            maxAbsDiff,
        }
    }, [metricRows, diffArr, copy])

    const leftIndex = isTimePointMode
        ? Math.max(0, Math.min(leftFrameCount - 1, timeIndexA))
        : getClampedFrameIndex(leftFrameCount, playbackIndexA)
    const rightIndex = isTimePointMode
        ? Math.max(0, Math.min(rightFrameCount - 1, timeIndexB))
        : getClampedFrameIndex(rightFrameCount, playbackIndexB)

    const leftPressureValues = useMemo(() => buildMetricSeriesFromFrames(contrast?.left?.frames, activeKey, 'press', activeSelect), [contrast, activeKey, activeSelect])
    const rightPressureValues = useMemo(() => buildMetricSeriesFromFrames(contrast?.right?.frames, activeKey, 'press', activeSelect), [contrast, activeKey, activeSelect])
    const leftAreaValues = useMemo(() => buildMetricSeriesFromFrames(contrast?.left?.frames, activeKey, 'area', activeSelect), [contrast, activeKey, activeSelect])
    const rightAreaValues = useMemo(() => buildMetricSeriesFromFrames(contrast?.right?.frames, activeKey, 'area', activeSelect), [contrast, activeKey, activeSelect])

    const pressSeries = useMemo(() => (
        isTimePointMode
            ? buildSingleSeries(leftPressureValues.length ? leftPressureValues : (contrast?.record?.pressArr?.[activeKey] || contrast?.left?.pressArr?.[activeKey]))
            : buildSeriesByFrameIndex(leftPressureValues, rightPressureValues)
    ), [contrast, activeKey, isTimePointMode, leftPressureValues, rightPressureValues])

    const areaSeries = useMemo(() => (
        isTimePointMode
            ? buildSingleSeries(leftAreaValues.length ? leftAreaValues : (contrast?.record?.areaArr?.[activeKey] || contrast?.left?.areaArr?.[activeKey]))
            : buildSeriesByFrameIndex(leftAreaValues, rightAreaValues)
    ), [contrast, activeKey, isTimePointMode, leftAreaValues, rightAreaValues])

    const exitContrast = async () => {
        setPlaying(false)
        pageInfo?.brushInstance?.stopBrush?.()
        pageInfo?.brushInstance?.deleteAll?.()
        useEquipStore.getState().setSelectArr([])
        useEquipStore.getState().setPlaybackHasSelection(false)
        useEquipStore.getState().setPlaybackRecordDate('')
        useEquipStore.getState().setHistoryChart({ pressArr: {}, areaArr: {} })
        useEquipStore.getState().setHistoryStatus({ index: 0, timestamp: '' })
        pageInfo?.setDisplay?.('num')
        try {
            await axios.post(`${localAddress}/cancalDbPlay`)
        } catch (err) {
            console.warn('[Contrast] cancel history state failed:', err)
        }
        useEquipStore.getState().setDataStatus('realtime')
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

    const changeTimeIndexA = (nextValue) => {
        const nextIndex = Math.round(Number(nextValue) || 0)
        if (nextIndex === timeIndexB && leftFrameCount > 1) {
            message.warning(copy.sameFrameWarning || 'A/B cannot use the same frame')
            return
        }
        setTimeIndexA(nextIndex)
    }

    const changeTimeIndexB = (nextValue) => {
        const nextIndex = Math.round(Number(nextValue) || 0)
        if (nextIndex === timeIndexA && rightFrameCount > 1) {
            message.warning(copy.sameFrameWarning || 'A/B cannot use the same frame')
            return
        }
        setTimeIndexB(nextIndex)
    }

    const changePlaybackIndexA = (nextValue) => {
        setPlaying(false)
        setPlaybackIndexA(getClampedFrameIndex(leftFrameCount, nextValue))
    }

    const changePlaybackIndexB = (nextValue) => {
        setPlaying(false)
        setPlaybackIndexB(getClampedFrameIndex(rightFrameCount, nextValue))
    }

    const exportContrastResult = () => {
        const leftFrames = contrast?.left?.frames || []
        const rightFrames = contrast?.right?.frames || []
        const count = Math.max(leftFrames.length, rightFrames.length)
        if (!count || !activeKey) {
            message.warning(copy.noExportData)
            return
        }
        const pointAreaCm2 = getPointAreaCm2(activeKey)

        if (isTimePointMode) {
            const leftFrameItem = getFrameByIndex(leftFrames, leftIndex)?.[activeKey] || {}
            const rightFrameItem = getFrameByIndex(rightFrames, rightIndex)?.[activeKey] || {}
            const rowWidth = leftFrameItem.width || rightFrameItem.width || width
            const leftSource = getRegionArr(leftFrameItem.arr || [], rowWidth, activeSelect)
            const rightSource = getRegionArr(rightFrameItem.arr || [], rowWidth, activeSelect)
            const metricWidth = activeSelect ? Math.max(1, activeSelect.xEnd - activeSelect.xStart) : rowWidth
            const metricA = calcMetrics(leftSource, metricWidth, activeSelect, pointAreaCm2)
            const metricB = calcMetrics(rightSource, metricWidth, activeSelect, pointAreaCm2)
            const maxAbsDiff = buildDiffArr(leftSource, rightSource).reduce((max, value) => Math.max(max, Math.abs(Number(value) || 0)), 0)
            const rows = [{
                frame_index: 0,
                progress: '',
                object: getPublicContrastKey(activeKey),
                scope: activeSelect ? 'selection' : 'full',
                selection: activeSelect ? `${activeSelect.xStart}-${activeSelect.xEnd},${activeSelect.yStart}-${activeSelect.yEnd}` : '',
                left_index: leftIndex,
                right_index: rightIndex,
                a_pressure_sum: getMetricValue(metricA, 'press'),
                b_pressure_sum: getMetricValue(metricB, 'press'),
                diff_pressure_sum: calcDisplayDiff(metricA.press, metricB.press),
                a_contact_area: getMetricValue(metricA, 'area'),
                b_contact_area: getMetricValue(metricB, 'area'),
                diff_contact_area: calcDisplayDiff(metricA.area, metricB.area),
                a_avg_pressure: getMetricValue(metricA, 'aver'),
                b_avg_pressure: getMetricValue(metricB, 'aver'),
                diff_avg_pressure: calcDisplayDiff(metricA.aver, metricB.aver),
                a_max_pressure: getMetricValue(metricA, 'max'),
                b_max_pressure: getMetricValue(metricB, 'max'),
                diff_max_pressure: calcDisplayDiff(metricA.max, metricB.max),
                a_center: getMetricValue(metricA, 'center'),
                b_center: getMetricValue(metricB, 'center'),
                max_abs_point_diff: maxAbsDiff,
            }]
            const headers = Object.keys(rows[0])
            const csv = [
                headers.join(','),
                ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(',')),
            ].join('\n')
            const filename = `contrast_time_${getPublicContrastKey(activeKey)}_${dayjs().format('YYYYMMDD_HHmmss')}.csv`
            downloadText(filename, csv)
            message.success(copy.exportSuccess)
            return
        }

        const rows = Array.from({ length: count }, (_, index) => {
            const rowProgress = count > 1 ? (index / (count - 1)) * 100 : 0
            const leftFrameIndex = getClampedFrameIndex(leftFrames.length, index)
            const rightFrameIndex = getClampedFrameIndex(rightFrames.length, index)
            const leftFrameItem = getFrameByIndex(leftFrames, leftFrameIndex)?.[activeKey] || {}
            const rightFrameItem = getFrameByIndex(rightFrames, rightFrameIndex)?.[activeKey] || {}
            const rowWidth = leftFrameItem.width || rightFrameItem.width || width
            const leftSource = getRegionArr(leftFrameItem.arr || [], rowWidth, activeSelect)
            const rightSource = getRegionArr(rightFrameItem.arr || [], rowWidth, activeSelect)
            const metricWidth = activeSelect ? Math.max(1, activeSelect.xEnd - activeSelect.xStart) : rowWidth
            const metricA = calcMetrics(leftSource, metricWidth, activeSelect, pointAreaCm2)
            const metricB = calcMetrics(rightSource, metricWidth, activeSelect, pointAreaCm2)
            const maxAbsDiff = buildDiffArr(leftSource, rightSource).reduce((max, value) => Math.max(max, Math.abs(Number(value) || 0)), 0)

            return {
                frame_index: index,
                progress: rowProgress.toFixed(2),
                object: getPublicContrastKey(activeKey),
                scope: activeSelect ? 'selection' : 'full',
                selection: activeSelect ? `${activeSelect.xStart}-${activeSelect.xEnd},${activeSelect.yStart}-${activeSelect.yEnd}` : '',
                left_index: leftFrameIndex,
                right_index: rightFrameIndex,
                a_pressure_sum: getMetricValue(metricA, 'press'),
                b_pressure_sum: getMetricValue(metricB, 'press'),
                diff_pressure_sum: calcDisplayDiff(metricA.press, metricB.press),
                a_contact_area: getMetricValue(metricA, 'area'),
                b_contact_area: getMetricValue(metricB, 'area'),
                diff_contact_area: calcDisplayDiff(metricA.area, metricB.area),
                a_avg_pressure: getMetricValue(metricA, 'aver'),
                b_avg_pressure: getMetricValue(metricB, 'aver'),
                diff_avg_pressure: calcDisplayDiff(metricA.aver, metricB.aver),
                a_max_pressure: getMetricValue(metricA, 'max'),
                b_max_pressure: getMetricValue(metricB, 'max'),
                diff_max_pressure: calcDisplayDiff(metricA.max, metricB.max),
                a_center: getMetricValue(metricA, 'center'),
                b_center: getMetricValue(metricB, 'center'),
                max_abs_point_diff: maxAbsDiff,
            }
        })

        const headers = Object.keys(rows[0])
        const csv = [
            headers.join(','),
            ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(',')),
        ].join('\n')
        const filename = `contrast_${getPublicContrastKey(activeKey)}_${dayjs().format('YYYYMMDD_HHmmss')}.csv`
        downloadText(filename, csv)
        message.success(copy.exportSuccess)
    }

    const modeLabel = isTimePointMode ? (copy.modeTimePoint || '同记录时间点对比') : (copy.modeRecordPair || '逐帧对比')
    const playbackFrameCount = Math.max(leftFrameCount, rightFrameCount)
    const playbackDisplayIndex = Math.max(leftIndex, rightIndex)
    const isPlaybackAtEnd = !isTimePointMode
        && (!leftFrameCount || leftIndex >= leftFrameCount - 1)
        && (!rightFrameCount || rightIndex >= rightFrameCount - 1)
    const statusCards = [
        { label: '当前对比', value: '进行中', accent: true },
        { label: '对比模式', value: modeLabel },
        { label: '采样率', value: `A ${getSampleRateText(leftData, copy)} / B ${getSampleRateText(rightData, copy)}` },
        { label: '对齐方式', value: isTimePointMode ? '同记录时间点' : '方向/进度对齐' },
        { label: '重采样', value: leftFrameCount !== rightFrameCount ? '已启用' : '未启用' },
        { label: '差值阈值', value: `± ${formatValue(conclusion.maxAbsDiff)}` },
    ]
    const insightText = `B 相比 A：${conclusion.pressText}，${conclusion.areaText}`

    const playbackStatusCards = statusCards.map((item, index) => {
        if (index === 3) {
            return { ...item, value: isTimePointMode ? item.value : '帧号同步' }
        }
        if (index === 4) {
            return { ...item, value: leftFrameCount !== rightFrameCount ? '短数据保持末帧' : '无需补帧' }
        }
        return item
    })

    const renderPlaybackControls = () => (
        isTimePointMode ? (
            <>
                <div className="timePointControl">
                    <span>{copy.timePointA || '鏃堕棿鐐?A'}</span>
                    <Slider value={leftIndex} onChange={changeTimeIndexA} min={0} max={Math.max(0, leftFrameCount - 1)} step={1} style={{ flex: 1 }} />
                    <strong>{leftIndex + 1}/{leftFrameCount || 0}</strong>
                </div>
                <div className="timePointControl">
                    <span>{copy.timePointB || '鏃堕棿鐐?B'}</span>
                    <Slider value={rightIndex} onChange={changeTimeIndexB} min={0} max={Math.max(0, rightFrameCount - 1)} step={1} style={{ flex: 1 }} />
                    <strong>{rightIndex + 1}/{rightFrameCount || 0}</strong>
                </div>
            </>
        ) : (
            <>
                <Button size="small" onClick={() => {
                    if (!playing && isPlaybackAtEnd) {
                        setPlaybackIndexA(0)
                        setPlaybackIndexB(0)
                    }
                    setPlaying(!playing)
                }}>{playing ? copy.pause : copy.play}</Button>
                <div className="contrastDualProgress">
                    <div className="timePointControl">
                        <span>A</span>
                        <Slider value={leftIndex} onChange={changePlaybackIndexA} min={0} max={Math.max(0, leftFrameCount - 1)} step={1} style={{ flex: 1 }} />
                        <strong>{leftIndex + 1}/{leftFrameCount || 0}</strong>
                    </div>
                    <div className="timePointControl">
                        <span>B</span>
                        <Slider value={rightIndex} onChange={changePlaybackIndexB} min={0} max={Math.max(0, rightFrameCount - 1)} step={1} style={{ flex: 1 }} />
                        <strong>{rightIndex + 1}/{rightFrameCount || 0}</strong>
                    </div>
                </div>
                <div className="contrastProgress">{copy.frame} {playbackFrameCount ? playbackDisplayIndex + 1 : 0}/{playbackFrameCount || 0}</div>
                <span className="volumeIcon">◕</span>
                <Select
                    size="small"
                    value={playbackSpeed}
                    options={CONTRAST_PLAYBACK_SPEEDS.map((speed) => ({
                        label: `${speed.toFixed(1)}x`,
                        value: speed,
                    }))}
                    onChange={setPlaybackSpeed}
                    style={{ width: 78 }}
                />
            </>
        )
    )

    if (!keys.length || !activeKey) {
        return (
            <div className="contrastPage">
                <div className="contrastEmpty">{copy.empty}</div>
            </div>
        )
    }

    return (
        <div className="contrastPage">
            <div className="contrastNav">
                <div className="contrastBrand"><span>JQ</span> Tools</div>
                <div className="contrastNavDivider" />
                <div className="contrastNavItem">汽车座椅</div>
                <div className="contrastNavDivider" />
                <div className="contrastNavItem active">数据对比</div>
                <div className="contrastNavDivider" />
                <div className="contrastNavItem">分析报告</div>
                <div className="contrastNavRight">
                    <span>深色主题</span>
                    <span>中文</span>
                    <span className="contrastAvatar" />
                </div>
            </div>

            <div className="contrastHeaderGrid">
                <div className="contrastStatusCards">
                    {playbackStatusCards.map((item) => (
                        <div className="contrastStatusCard" key={item.label}>
                            <span>{item.label}</span>
                            <strong className={item.accent ? 'running' : ''}>{item.accent ? <i /> : null}{item.value}</strong>
                        </div>
                    ))}
                </div>
                <div className="contrastInsight">
                    <div className="insightIcon">!</div>
                    <div className="insightBody">
                        <div className="insightTitle">数据洞察</div>
                        <div className="insightText">{insightText}</div>
                    </div>
                    <Button type="primary" size="small" onClick={exportContrastResult}>导出结果</Button>
                    <Button size="small" onClick={exitContrast}>退出对比</Button>
                </div>
            </div>

            <div className="contrastObjectBar">
                <span>对比对象</span>
                <Select
                    size="small"
                    value={activeKey}
                    options={keys.map((key) => ({ label: getContrastObjectLabel(key, copy), value: key }))}
                    onChange={changeActiveKey}
                    style={{ width: 150 }}
                />
                <span>A: {contrast.left?.name || contrast.left?.date}</span>
                <span>B: {contrast.right?.name || contrast.right?.date}</span>
                <span>{copy.currentMetricScope}: {activeSelect ? copy.selectionRegion || 'Selection Area' : copy.fullMatrix}</span>
                <span>{copy.filterValue}: {settingValue?.filter ?? 0}</span>
            </div>

            <div className="contrastTopbar">
                <div>
                    <div className="contrastTitle">{copy.title}</div>
                    <div className="contrastMeta">
                        {isTimePointMode ? (copy.modeTimePoint || '同记录时间点对比') : (copy.modeRecordPair || '跨记录对比')} ｜
                        A: {contrast.left?.name || contrast.left?.date} ｜ B: {contrast.right?.name || contrast.right?.date}
                    </div>
                </div>
                <div className="contrastActions">
                    <Select
                        size="small"
                        value={activeKey}
                        options={keys.map((key) => ({ label: getContrastObjectLabel(key, copy), value: key }))}
                        onChange={changeActiveKey}
                        style={{ width: 130 }}
                    />
                    <Button size="small" onClick={exportContrastResult}>{copy.exportResult}</Button>
                    <Button size="small" onClick={exitContrast}>{copy.exit}</Button>
                </div>
            </div>

            {contrast?.warnings?.length ? (
                <div className="contrastWarning">{contrast.warnings.join('；')}</div>
            ) : null}

            <div className="contrastStatusBar">
                <span>{copy.currentScope}: {activeSelect ? copy.selectionRegion || 'Selection Area' : copy.fullMatrix}</span>
                <span>{copy.currentFrame}: A {leftIndex + 1}/{leftFrameCount || 0}, B {rightIndex + 1}/{rightFrameCount || 0}</span>
                <span>{copy.filterValue}: {settingValue?.filter ?? 0}</span>
                <span>{copy.object}: {getContrastObjectLabel(activeKey, copy)}</span>
                <span>{copy.sampleRate}: A {getSampleRateText(leftData, copy)} / B {getSampleRateText(rightData, copy)}</span>
                <span>{copy.zero}: A {formatZeroState(leftData.zeroState, copy)} / B {formatZeroState(rightData.zeroState, copy)}</span>
                <span>{copy.direction}: A {formatDirection(leftData.dataDirection, copy)} / B {formatDirection(rightData.dataDirection, copy)}</span>
                <span>{copy.diffRange}: ±{formatValue(conclusion.maxAbsDiff)}</span>
            </div>

            <div className="contrastSummary">
                <strong>{copy.currentConclusion}</strong>
                <span>{conclusion.pressText}</span>
                <span>{conclusion.areaText}</span>
                <span>{copy.redBlueTip}</span>
            </div>

            <div className="contrastWorkspace">
                <div className="contrastMain">
                    <div className="contrastGrid">
                        <ContrastHeatmap
                            title={copy.baselineA}
                            subtitle={`${copy.frame} ${leftIndex + 1}/${leftFrameCount || 0}`}
                            arr={leftArr}
                            width={width}
                            height={height}
                            matrixKey={activeKey}
                            colorMax={settingValue?.color}
                            className="contrastCanvasA"
                        />
                        <ContrastHeatmap
                            title={copy.diffMap}
                            subtitle={copy.diffSubtitle}
                            arr={diffArr}
                            width={width}
                            height={height}
                            matrixKey={activeKey}
                            colorMax={settingValue?.color}
                            mode="diff"
                        />
                        <ContrastHeatmap
                            title={copy.compareB}
                            subtitle={`${copy.frame} ${rightIndex + 1}/${rightFrameCount || 0}`}
                            arr={rightArr}
                            width={width}
                            height={height}
                            matrixKey={activeKey}
                            colorMax={settingValue?.color}
                        />
                    </div>
                </div>
            </div>

            <div className={`contrastPlayback ${isTimePointMode ? 'timePointPlayback' : ''}`}>
                <button className="playbackExpandIcon" type="button" onClick={() => setPlaybackExpanded(true)} aria-label="放大播放控制">⛶</button>
                {renderPlaybackControls()}
            </div>

            {playbackExpanded ? (
                <div className="contrastExpandOverlay playbackExpandOverlay" onClick={() => setPlaybackExpanded(false)}>
                    <div className="contrastPlaybackExpandDialog" onClick={(event) => event.stopPropagation()}>
                        <div className="contrastExpandHeader">
                            <div>
                                <div className="contrastPanelTitle">数据对比回放</div>
                                <div className="contrastPanelSubtitle">
                                    A {leftIndex + 1}/{leftFrameCount || 0} / B {rightIndex + 1}/{rightFrameCount || 0}
                                </div>
                            </div>
                            <button type="button" onClick={() => setPlaybackExpanded(false)}>×</button>
                        </div>
                        <div className="playbackExpandHeatmaps">
                            <ContrastHeatmap
                                title={copy.baselineA}
                                subtitle={`${copy.frame} ${leftIndex + 1}/${leftFrameCount || 0}`}
                                arr={leftArr}
                                width={width}
                                height={height}
                                matrixKey={activeKey}
                                colorMax={settingValue?.color}
                                className="contrastCanvasA"
                                disableExpand
                            />
                            <ContrastHeatmap
                                title={copy.diffMap}
                                subtitle={copy.diffSubtitle}
                                arr={diffArr}
                                width={width}
                                height={height}
                                matrixKey={activeKey}
                                colorMax={settingValue?.color}
                                mode="diff"
                                disableExpand
                            />
                            <ContrastHeatmap
                                title={copy.compareB}
                                subtitle={`${copy.frame} ${rightIndex + 1}/${rightFrameCount || 0}`}
                                arr={rightArr}
                                width={width}
                                height={height}
                                matrixKey={activeKey}
                                colorMax={settingValue?.color}
                                disableExpand
                            />
                        </div>
                        <div className={`contrastPlayback contrastPlaybackExpanded ${isTimePointMode ? 'timePointPlayback' : ''}`}>
                            {renderPlaybackControls()}
                        </div>
                    </div>
                </div>
            ) : null}

            <div className="contrastLegend">
                <span className="legendBlue" />{copy.bLess}
                <span className="legendWhite" />{copy.nearlyNoChange}
                <span className="legendRed" />{copy.bGreater}
                <span className="legendScope">{copy.currentMetricScope}: {activeSelect ? copy.selectionRegion || 'Selection Area' : copy.fullMatrix}</span>
            </div>

            <div className="contrastMetricTable">
                <div className="metricTableTitle">
                    数据汇总对比
                    <span>按当前帧与当前区域统计 A 基础数据、B 对比数据、差值和变化率</span>
                </div>
                <div className="metricHeader">
                    <span>{copy.metric}</span>
                    <span>A</span>
                    <span>B</span>
                    <span>B-A</span>
                    <span>{copy.rate}</span>
                </div>
                {metricRows.map((row) => {
                    const rateInfo = getRateInfo(row.rate)
                    return (
                        <div className="metricRow" key={row.key}>
                            <span>{row.label}</span>
                            <span>{formatValue(row.a)}</span>
                            <span>{formatValue(row.b)}</span>
                            <span className={`metricDiffValue ${getSignedClass(row.diff)}`}>{formatValue(row.diff)}</span>
                            <span className={`metricRateValue ${rateInfo.className}`}>{rateInfo.text} <em>{rateInfo.arrow}</em></span>
                        </div>
                    )
                })}
            </div>

            <div className="contrastFooterMeta">
                {copy.timeA}: {(leftFrame?._timestamp || contrast.frame?.leftTimestamp) ? dayjs(leftFrame?._timestamp || contrast.frame.leftTimestamp).format('YYYY-MM-DD HH:mm:ss') : '-'}
                <span />
                {copy.timeB}: {(rightFrame?._timestamp || contrast.frame?.rightTimestamp) ? dayjs(rightFrame?._timestamp || contrast.frame.rightTimestamp).format('YYYY-MM-DD HH:mm:ss') : '-'}
            </div>
        </div>
    )
}
