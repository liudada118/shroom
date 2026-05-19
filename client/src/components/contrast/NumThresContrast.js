import React, { useContext, useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { Button, Select, Slider, message } from 'antd'
import dayjs from 'dayjs'
import { shallow } from 'zustand/shallow'
import { pageContext } from '../../page/test/Test'
import { useEquipStore } from '../../store/equipStore'
import { localAddress } from '../../util/constant'
import ContrastHeatmap from './ContrastHeatmap'
import SelectSet from '../title/SelectSet'
import { useTranslation } from 'react-i18next'
import { formatSelectionName } from '../../util/selectionName'
import './contrast.scss'

const METRIC_KEYS = ['aver', 'max', 'min', 'press', 'area', 'points', 'center']

const FULL_SELECTION_ID = '__full__'
const CONTRAST_COPY = {
    zh: {
        metrics: {
            aver: '平均压强',
            max: '最大压强',
            min: '最小压强',
            press: '压力总和',
            area: '受压面积',
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
            area: 'Contact Area',
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

function getFrameByProgress(frames = [], progress = 0) {
    if (!frames.length) return {}
    const index = frames.length > 1 ? Math.round((frames.length - 1) * progress / 100) : 0
    return frames[Math.max(0, Math.min(frames.length - 1, index))] || {}
}

function getFrameByIndex(frames = [], index = 0) {
    if (!frames.length) return {}
    const safeIndex = Math.max(0, Math.min(frames.length - 1, Math.round(Number(index) || 0)))
    return frames[safeIndex] || {}
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

function fillTemplate(template, replacements = {}, fallback = '') {
    return Object.entries(replacements).reduce((text, [key, value]) => {
        return text.replace(new RegExp(`{{${key}}}`, 'g'), value)
    }, String(template || fallback))
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

function getMetricValue(metrics, key) {
    const value = metrics?.[key]
    return typeof value === 'string' ? value : (Number.isFinite(value) ? value : '')
}

function getSelectionId(item, index) {
    return String(item?.id || item?.regionId || item?.name || `selection-${index}`)
}

function getSelectionRect(item) {
    return item?.matrixRect || item?.rect || null
}

function getSelectionName(item, index, copy = CONTRAST_COPY.zh) {
    return formatSelectionName(item?.name || item?.regionName, index + 1, (_, options) => `${copy.region} ${options.index}`)
}

function getSelectionColor(item, index) {
    const palette = ['#ff6b5d', '#ffd27a', '#7ed2ff', '#9cff8f']
    return item?.bgc || item?.color || palette[index % palette.length]
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

function buildSeriesByProgress(leftValues = [], rightValues = []) {
    const count = Math.max(leftValues.length, rightValues.length)
    if (!count) return []
    return Array.from({ length: count }, (_, index) => {
        const progress = count > 1 ? (index / (count - 1)) * 100 : 0
        const left = Number(leftValues[getAlignedIndex(leftValues.length, progress)] || 0)
        const right = Number(rightValues[getAlignedIndex(rightValues.length, progress)] || 0)
        return { progress, left, right, diff: right - left }
    })
}

function buildSingleSeries(values = []) {
    return (Array.isArray(values) ? values : []).map((value, index) => ({
        index,
        value: Number(value) || 0,
    }))
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
    const selectArr = useEquipStore(s => s.selectArr, shallow)
    const displayType = useEquipStore(s => s.displayType, shallow)
    const settingValue = useEquipStore(s => s.settingValue, shallow)
    const [progress, setProgress] = useState(0)
    const [playing, setPlaying] = useState(false)
    const [playbackExpanded, setPlaybackExpanded] = useState(false)
    const [activeKey, setActiveKey] = useState('')
    const [activeSelectionId, setActiveSelectionId] = useState('')

    const keys = contrast?.keys || []
    const isTimePointMode = contrast?.mode === 'single_record_frame'
    const [timeIndexA, setTimeIndexA] = useState(0)
    const [timeIndexB, setTimeIndexB] = useState(1)
    const leftFrameCount = contrast?.left?.frames?.length || 0
    const rightFrameCount = contrast?.right?.frames?.length || 0

    useEffect(() => {
        if (!keys.length) return
        const matchedKey = keys.find((key) => displayType.includes('back') ? key.includes('back') : key.includes('sit'))
        setActiveKey((current) => current && keys.includes(current) ? current : (matchedKey || keys[0]))
    }, [keys.join('|'), displayType])

    useEffect(() => {
        setPlaying(false)
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
    }, [contrast?.mode, contrast?.record?.id, leftFrameCount])

    useEffect(() => {
        if (!playing) return
        const timer = setInterval(() => {
            setProgress((current) => {
                if (current >= 100) {
                    setPlaying(false)
                    return 100
                }
                return Math.min(100, current + 1)
            })
        }, 120)
        return () => clearInterval(timer)
    }, [playing])

    const leftFrame = useMemo(() => (
        isTimePointMode
            ? getFrameByIndex(contrast?.left?.frames, timeIndexA)
            : getFrameByProgress(contrast?.left?.frames, progress)
    ), [contrast, progress, isTimePointMode, timeIndexA])
    const rightFrame = useMemo(() => (
        isTimePointMode
            ? getFrameByIndex(contrast?.right?.frames, timeIndexB)
            : getFrameByProgress(contrast?.right?.frames, progress)
    ), [contrast, progress, isTimePointMode, timeIndexB])
    const leftData = leftFrame?.[activeKey] || {}
    const rightData = rightFrame?.[activeKey] || {}
    const width = leftData.width || rightData.width || 32
    const height = leftData.height || rightData.height || 32
    const leftArr = leftData.arr || []
    const rightArr = rightData.arr || []
    const diffArr = useMemo(() => buildDiffArr(leftArr, rightArr), [leftArr, rightArr])

    const selectionItems = useMemo(() => {
        if (!Array.isArray(selectArr)) return []
        return selectArr
            .filter((item) => !item.matrixKey || item.matrixKey === activeKey)
            .map((item, index) => ({
                id: getSelectionId(item, index),
                order: index + 1,
                name: getSelectionName(item, index, copy),
                color: getSelectionColor(item, index),
                rect: getSelectionRect(item),
                source: item,
            }))
            .filter((item) => item.rect)
    }, [selectArr, activeKey, copy])

    useEffect(() => {
        if (!selectionItems?.length) {
            setActiveSelectionId(FULL_SELECTION_ID)
            return
        }
        setActiveSelectionId((current) => {
            if (current === FULL_SELECTION_ID) return current
            return selectionItems.some((item) => item.id === current) ? current : selectionItems[0].id
        })
    }, [selectionItems])

    const activeSelection = useMemo(() => {
        if (activeSelectionId === FULL_SELECTION_ID) return null
        return selectionItems.find((item) => item.id === activeSelectionId) || null
    }, [selectionItems, activeSelectionId])

    const activeSelect = activeSelection?.rect || null

    const metricRows = useMemo(() => {
        const sourceA = getRegionArr(leftArr, width, activeSelect)
        const sourceB = getRegionArr(rightArr, width, activeSelect)
        const metricWidth = activeSelect ? Math.max(1, activeSelect.xEnd - activeSelect.xStart) : width
        const metricA = calcMetrics(sourceA, metricWidth, activeSelect)
        const metricB = calcMetrics(sourceB, metricWidth, activeSelect)
        return metrics.map((item) => {
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
    }, [leftArr, rightArr, width, activeSelect, metrics])

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
        : (contrast?.left?.frames?.length > 1 ? Math.round((contrast.left.frames.length - 1) * progress / 100) : 0)
    const rightIndex = isTimePointMode
        ? Math.max(0, Math.min(rightFrameCount - 1, timeIndexB))
        : (contrast?.right?.frames?.length > 1 ? Math.round((contrast.right.frames.length - 1) * progress / 100) : 0)

    const pressSeries = useMemo(() => (
        isTimePointMode
            ? buildSingleSeries(contrast?.record?.pressArr?.[activeKey] || contrast?.left?.pressArr?.[activeKey])
            : buildSeriesByProgress(
                contrast?.left?.pressArr?.[activeKey],
                contrast?.right?.pressArr?.[activeKey],
            )
    ), [contrast, activeKey, isTimePointMode])

    const areaSeries = useMemo(() => (
        isTimePointMode
            ? buildSingleSeries(contrast?.record?.areaArr?.[activeKey] || contrast?.left?.areaArr?.[activeKey])
            : buildSeriesByProgress(
                contrast?.left?.areaArr?.[activeKey],
                contrast?.right?.areaArr?.[activeKey],
            )
    ), [contrast, activeKey, isTimePointMode])

    const selectionStats = useMemo(() => {
        return selectionItems.map((item) => {
            const sourceA = getRegionArr(leftArr, width, item.rect)
            const sourceB = getRegionArr(rightArr, width, item.rect)
            const metricWidth = Math.max(1, item.rect.xEnd - item.rect.xStart)
            const metricA = calcMetrics(sourceA, metricWidth, item.rect)
            const metricB = calcMetrics(sourceB, metricWidth, item.rect)
            return {
                ...item,
                metricA,
                metricB,
                pressDiff: metricB.press - metricA.press,
                areaDiff: metricB.area - metricA.area,
            }
        })
    }, [selectionItems, leftArr, rightArr, width])

    const exportPreviewRows = useMemo(() => ([
        { label: copy.exportScope, value: activeSelection ? activeSelection.name : copy.fullMatrix },
        { label: copy.exportObject, value: activeKey || '-' },
        { label: copy.exportFrames, value: isTimePointMode ? 2 : Math.max(contrast?.left?.frames?.length || 0, contrast?.right?.frames?.length || 0) },
        { label: copy.exportFields, value: copy.exportFieldValue },
    ]), [activeSelection, activeKey, contrast, copy, isTimePointMode])

    const exitContrast = () => {
        setPlaying(false)
        pageInfo?.brushInstance?.stopBrush?.()
        pageInfo?.brushInstance?.deleteAll?.()
        useEquipStore.getState().setSelectArr([])
        pageInfo?.setDisplay?.('num')
        // 通知后端解除 historyFlag，恢复实时数据流（否则即使串口连着也收不到实时数据）
        axios.post(`${localAddress}/cancalDbPlay`).catch(() => {})
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

    const exportContrastResult = () => {
        const leftFrames = contrast?.left?.frames || []
        const rightFrames = contrast?.right?.frames || []
        const count = Math.max(leftFrames.length, rightFrames.length)
        if (!count || !activeKey) {
            message.warning(copy.noExportData)
            return
        }

        if (isTimePointMode) {
            const leftFrameItem = getFrameByIndex(leftFrames, leftIndex)?.[activeKey] || {}
            const rightFrameItem = getFrameByIndex(rightFrames, rightIndex)?.[activeKey] || {}
            const rowWidth = leftFrameItem.width || rightFrameItem.width || width
            const leftSource = getRegionArr(leftFrameItem.arr || [], rowWidth, activeSelect)
            const rightSource = getRegionArr(rightFrameItem.arr || [], rowWidth, activeSelect)
            const metricWidth = activeSelect ? Math.max(1, activeSelect.xEnd - activeSelect.xStart) : rowWidth
            const metricA = calcMetrics(leftSource, metricWidth, activeSelect)
            const metricB = calcMetrics(rightSource, metricWidth, activeSelect)
            const maxAbsDiff = buildDiffArr(leftSource, rightSource).reduce((max, value) => Math.max(max, Math.abs(Number(value) || 0)), 0)
            const rows = [{
                frame_index: 0,
                progress: '',
                object: activeKey,
                scope: activeSelect ? 'selection' : 'full',
                selection: activeSelect ? `${activeSelect.xStart}-${activeSelect.xEnd},${activeSelect.yStart}-${activeSelect.yEnd}` : '',
                left_index: leftIndex,
                right_index: rightIndex,
                a_pressure_sum: getMetricValue(metricA, 'press'),
                b_pressure_sum: getMetricValue(metricB, 'press'),
                diff_pressure_sum: getMetricValue(metricB, 'press') - getMetricValue(metricA, 'press'),
                a_contact_area: getMetricValue(metricA, 'area'),
                b_contact_area: getMetricValue(metricB, 'area'),
                diff_contact_area: getMetricValue(metricB, 'area') - getMetricValue(metricA, 'area'),
                a_avg_pressure: getMetricValue(metricA, 'aver'),
                b_avg_pressure: getMetricValue(metricB, 'aver'),
                diff_avg_pressure: getMetricValue(metricB, 'aver') - getMetricValue(metricA, 'aver'),
                a_max_pressure: getMetricValue(metricA, 'max'),
                b_max_pressure: getMetricValue(metricB, 'max'),
                diff_max_pressure: getMetricValue(metricB, 'max') - getMetricValue(metricA, 'max'),
                a_center: getMetricValue(metricA, 'center'),
                b_center: getMetricValue(metricB, 'center'),
                max_abs_point_diff: maxAbsDiff,
            }]
            const headers = Object.keys(rows[0])
            const csv = [
                headers.join(','),
                ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(',')),
            ].join('\n')
            const filename = `contrast_time_${activeKey}_${dayjs().format('YYYYMMDD_HHmmss')}.csv`
            downloadText(filename, csv)
            message.success(copy.exportSuccess)
            return
        }

        const rows = Array.from({ length: count }, (_, index) => {
            const rowProgress = count > 1 ? (index / (count - 1)) * 100 : 0
            const leftFrameItem = getFrameByProgress(leftFrames, rowProgress)?.[activeKey] || {}
            const rightFrameItem = getFrameByProgress(rightFrames, rowProgress)?.[activeKey] || {}
            const rowWidth = leftFrameItem.width || rightFrameItem.width || width
            const leftSource = getRegionArr(leftFrameItem.arr || [], rowWidth, activeSelect)
            const rightSource = getRegionArr(rightFrameItem.arr || [], rowWidth, activeSelect)
            const metricWidth = activeSelect ? Math.max(1, activeSelect.xEnd - activeSelect.xStart) : rowWidth
            const metricA = calcMetrics(leftSource, metricWidth, activeSelect)
            const metricB = calcMetrics(rightSource, metricWidth, activeSelect)
            const maxAbsDiff = buildDiffArr(leftSource, rightSource).reduce((max, value) => Math.max(max, Math.abs(Number(value) || 0)), 0)

            return {
                frame_index: index,
                progress: rowProgress.toFixed(2),
                object: activeKey,
                scope: activeSelect ? 'selection' : 'full',
                selection: activeSelect ? `${activeSelect.xStart}-${activeSelect.xEnd},${activeSelect.yStart}-${activeSelect.yEnd}` : '',
                left_index: getAlignedIndex(leftFrames.length, rowProgress),
                right_index: getAlignedIndex(rightFrames.length, rowProgress),
                a_pressure_sum: getMetricValue(metricA, 'press'),
                b_pressure_sum: getMetricValue(metricB, 'press'),
                diff_pressure_sum: getMetricValue(metricB, 'press') - getMetricValue(metricA, 'press'),
                a_contact_area: getMetricValue(metricA, 'area'),
                b_contact_area: getMetricValue(metricB, 'area'),
                diff_contact_area: getMetricValue(metricB, 'area') - getMetricValue(metricA, 'area'),
                a_avg_pressure: getMetricValue(metricA, 'aver'),
                b_avg_pressure: getMetricValue(metricB, 'aver'),
                diff_avg_pressure: getMetricValue(metricB, 'aver') - getMetricValue(metricA, 'aver'),
                a_max_pressure: getMetricValue(metricA, 'max'),
                b_max_pressure: getMetricValue(metricB, 'max'),
                diff_max_pressure: getMetricValue(metricB, 'max') - getMetricValue(metricA, 'max'),
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
        const filename = `contrast_${activeKey}_${dayjs().format('YYYYMMDD_HHmmss')}.csv`
        downloadText(filename, csv)
        message.success(copy.exportSuccess)
    }

    const modeLabel = isTimePointMode ? (copy.modeTimePoint || '同记录时间点对比') : (copy.modeRecordPair || '逐帧对比')
    const statusCards = [
        { label: '当前对比', value: '进行中', accent: true },
        { label: '对比模式', value: modeLabel },
        { label: '采样率', value: `A ${getSampleRateText(leftData, copy)} / B ${getSampleRateText(rightData, copy)}` },
        { label: '对齐方式', value: isTimePointMode ? '同记录时间点' : '方向/进度对齐' },
        { label: '重采样', value: leftFrameCount !== rightFrameCount ? '已启用' : '未启用' },
        { label: '差值阈值', value: `± ${formatValue(conclusion.maxAbsDiff)}` },
    ]
    const insightText = `B 相比 A：${conclusion.pressText}，${conclusion.areaText}`

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
                    if (!playing && progress >= 100) setProgress(0)
                    setPlaying(!playing)
                }}>{playing ? copy.pause : copy.play}</Button>
                <span className="frameText">
                    A {leftIndex + 1}/{contrast.left?.length || 0} / B {rightIndex + 1}/{contrast.right?.length || 0}
                </span>
                <Slider value={progress} onChange={setProgress} min={0} max={100} style={{ flex: 1 }} />
                <div className="contrastProgress">{progress}%</div>
                <span className="volumeIcon">◕</span>
                <Select
                    size="small"
                    value="1.0x"
                    options={[{ label: '1.0x', value: '1.0x' }]}
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
                    {statusCards.map((item) => (
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
                    options={keys.map((key) => ({ label: key, value: key }))}
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
                        options={keys.map((key) => ({ label: key, value: key }))}
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
                <span>{copy.currentFrame}: A {leftIndex + 1}/{contrast.left?.length || 0}, B {rightIndex + 1}/{contrast.right?.length || 0}</span>
                <span>{copy.filterValue}: {settingValue?.filter ?? 0}</span>
                <span>{copy.object}: {activeKey}</span>
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
                            subtitle={`${copy.frame} ${leftIndex + 1}/${contrast.left?.length || 0}`}
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
                            subtitle={`${copy.frame} ${rightIndex + 1}/${contrast.right?.length || 0}`}
                            arr={rightArr}
                            width={width}
                            height={height}
                            matrixKey={activeKey}
                            colorMax={settingValue?.color}
                        />
                    </div>
                </div>

                <aside className="contrastSidePanel">
                    <div className="sidePanelHeader">
                        <div>
                            <div className="sidePanelTitle">{copy.regionManage}</div>
                            <div className="sidePanelSub">{copy.regionSub}</div>
                        </div>
                        <Button size="small" onClick={() => setActiveSelectionId(FULL_SELECTION_ID)}>{copy.full}</Button>
                    </div>

                    <div className={`selectionCard ${activeSelectionId === FULL_SELECTION_ID ? 'active' : ''}`} onClick={() => setActiveSelectionId(FULL_SELECTION_ID)}>
                        <div className="selectionCardTop">
                            <span className="selectionColor" style={{ background: '#e1e4e8' }} />
                            <strong>{copy.fullMatrix}</strong>
                        </div>
                        <div className="selectionMeta">{width} x {height}, {copy.fullMatrixMeta}</div>
                    </div>

                    {selectionStats.length ? selectionStats.map((item) => (
                        <div
                            key={item.id}
                            className={`selectionCard ${activeSelectionId === item.id ? 'active' : ''}`}
                            onClick={() => setActiveSelectionId(item.id)}
                        >
                            <div className="selectionCardTop">
                                <span className="selectionColor selectionNumber" style={{ background: item.color }}>{item.order}</span>
                                <strong>{item.name}</strong>
                            </div>
                            <div className="selectionMeta">
                                X {item.rect.xStart}-{item.rect.xEnd} / Y {item.rect.yStart}-{item.rect.yEnd}
                            </div>
                            <div className="selectionMetrics">
                                <span>{copy.pressureDiff} {formatValue(item.pressDiff)}</span>
                                <span>{copy.areaDiff} {formatValue(item.areaDiff)}</span>
                            </div>
                        </div>
                    )) : (
                        <div className="selectionEmpty">{copy.noSelection}</div>
                    )}

                    <div className="contrastSelectPanel">
                        <SelectSet onSelect variant="embedded" />
                    </div>

                    <div className="exportPreview">
                        <div className="sidePanelTitle">{copy.exportPreview}</div>
                        {exportPreviewRows.map((row) => (
                            <div className="exportPreviewRow" key={row.label}>
                                <span>{row.label}</span>
                                <strong>{row.value}</strong>
                            </div>
                        ))}
                    </div>
                </aside>
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
                                    A {leftIndex + 1}/{contrast.left?.length || leftFrameCount || 0} / B {rightIndex + 1}/{contrast.right?.length || rightFrameCount || 0}
                                </div>
                            </div>
                            <button type="button" onClick={() => setPlaybackExpanded(false)}>×</button>
                        </div>
                        <div className="playbackExpandHeatmaps">
                            <ContrastHeatmap
                                title={copy.baselineA}
                                subtitle={`${copy.frame} ${leftIndex + 1}/${contrast.left?.length || 0}`}
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
                                subtitle={`${copy.frame} ${rightIndex + 1}/${contrast.right?.length || 0}`}
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

            <div className="contrastLineCharts">
                <MiniLineChart title={copy.pressureChart} rows={pressSeries} mode={isTimePointMode ? 'single' : 'pair'} markers={{ a: leftIndex, b: rightIndex }} unit="kPa" />
                <MiniLineChart title={copy.areaChart} rows={areaSeries} mode={isTimePointMode ? 'single' : 'pair'} markers={{ a: leftIndex, b: rightIndex }} unit="cm²" />
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
