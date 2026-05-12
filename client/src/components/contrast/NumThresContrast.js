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

const FULL_SELECTION_ID = '__full__'

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

function getSelectionName(item, index) {
    return item?.name || item?.regionName || `区域 ${index + 1}`
}

function getSelectionColor(item, index) {
    const palette = ['#ff6b5d', '#ffd27a', '#7ed2ff', '#9cff8f']
    return item?.bgc || item?.color || palette[index % palette.length]
}

function formatDirection(direction) {
    if (!direction) return '未记录'
    const rotateDegree = Number(direction.rotateDegree ?? direction.rotate_degree) || 0
    if (rotateDegree) return `${rotateDegree}°`
    const left = direction.left !== false
    const up = direction.up !== false
    if (!left && !up) return '上下+左右'
    if (!left) return '左右翻转'
    if (!up) return '上下翻转'
    return '原始方向'
}

function formatZeroState(zeroState) {
    if (!zeroState?.enabled && !zeroState?.zero_enabled) return '未置零'
    return zeroState?.has_baseline === false ? '已开启' : '已置零'
}

function getSampleRateText(data = {}) {
    const sampleRate = data.sampleRateHz || data.rawFrame?.sample_rate_hz || data.rawFrame?.hardware_sample_rate_hz
    return sampleRate ? `${formatValue(Number(sampleRate))}Hz` : '未记录'
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

function MiniLineChart({ title, rows = [] }) {
    const width = 260
    const height = 86
    const padding = 12
    const values = rows.flatMap((row) => [row.left, row.right, row.diff]).filter(Number.isFinite)
    const minValue = Math.min(0, ...values)
    const maxValue = Math.max(1, ...values)
    const span = maxValue - minValue || 1
    const makePath = (key) => rows.map((row, index) => {
        const x = padding + (rows.length > 1 ? index / (rows.length - 1) : 0) * (width - padding * 2)
        const y = height - padding - ((Number(row[key]) - minValue) / span) * (height - padding * 2)
        return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    }).join(' ')

    return (
        <div className="contrastLinePanel">
            <div className="contrastLineTitle">{title}</div>
            <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title}>
                <line x1={padding} x2={width - padding} y1={height - padding} y2={height - padding} className="chartAxis" />
                <path d={makePath('left')} className="chartLine chartLineA" />
                <path d={makePath('right')} className="chartLine chartLineB" />
                <path d={makePath('diff')} className="chartLine chartLineDiff" />
            </svg>
            <div className="contrastLineLegend">
                <span className="chartDotA" />A
                <span className="chartDotB" />B
                <span className="chartDotDiff" />B-A
            </div>
        </div>
    )
}

export default function NumThresContrast() {
    const pageInfo = useContext(pageContext)
    const contrast = useEquipStore(s => s.contrast, shallow)
    const selectArr = useEquipStore(s => s.selectArr, shallow)
    const displayType = useEquipStore(s => s.displayType, shallow)
    const settingValue = useEquipStore(s => s.settingValue, shallow)
    const [progress, setProgress] = useState(0)
    const [playing, setPlaying] = useState(false)
    const [activeKey, setActiveKey] = useState('')
    const [activeSelectionId, setActiveSelectionId] = useState('')

    const keys = contrast?.keys || []

    useEffect(() => {
        if (!keys.length) return
        const matchedKey = keys.find((key) => displayType.includes('back') ? key.includes('back') : key.includes('sit'))
        setActiveKey((current) => current && keys.includes(current) ? current : (matchedKey || keys[0]))
    }, [keys.join('|'), displayType])

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

    const leftFrame = useMemo(() => getFrameByProgress(contrast?.left?.frames, progress), [contrast, progress])
    const rightFrame = useMemo(() => getFrameByProgress(contrast?.right?.frames, progress), [contrast, progress])
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
                name: getSelectionName(item, index),
                color: getSelectionColor(item, index),
                rect: getSelectionRect(item),
                source: item,
            }))
            .filter((item) => item.rect)
    }, [selectArr, activeKey])

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

    const conclusion = useMemo(() => {
        const pressRow = metricRows.find((row) => row.key === 'press')
        const areaRow = metricRows.find((row) => row.key === 'area')
        const maxAbsDiff = diffArr.reduce((max, value) => Math.max(max, Math.abs(Number(value) || 0)), 0)
        const pressDiff = Number(pressRow?.diff)
        const areaDiff = Number(areaRow?.diff)
        const pressText = Number.isFinite(pressDiff)
            ? `B 总压力${pressDiff >= 0 ? '高' : '低'} ${formatValue(Math.abs(pressDiff))}`
            : 'B 总压力差异 N/A'
        const areaText = Number.isFinite(areaDiff)
            ? `受压面积${areaDiff >= 0 ? '增加' : '减少'} ${formatValue(Math.abs(areaDiff))}`
            : '受压面积差异 N/A'
        return {
            pressText,
            areaText,
            maxAbsDiff,
        }
    }, [metricRows, diffArr])

    const leftIndex = contrast?.left?.frames?.length > 1 ? Math.round((contrast.left.frames.length - 1) * progress / 100) : 0
    const rightIndex = contrast?.right?.frames?.length > 1 ? Math.round((contrast.right.frames.length - 1) * progress / 100) : 0

    const pressSeries = useMemo(() => buildSeriesByProgress(
        contrast?.left?.pressArr?.[activeKey],
        contrast?.right?.pressArr?.[activeKey],
    ), [contrast, activeKey])

    const areaSeries = useMemo(() => buildSeriesByProgress(
        contrast?.left?.areaArr?.[activeKey],
        contrast?.right?.areaArr?.[activeKey],
    ), [contrast, activeKey])

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
        { label: '导出范围', value: activeSelection ? activeSelection.name : '全量矩阵' },
        { label: '导出对象', value: activeKey || '-' },
        { label: '导出帧数', value: Math.max(contrast?.left?.frames?.length || 0, contrast?.right?.frames?.length || 0) },
        { label: '导出字段', value: 'A / B / B-A 指标' },
    ]), [activeSelection, activeKey, contrast])

    const exitContrast = () => {
        setPlaying(false)
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

    const exportContrastResult = () => {
        const leftFrames = contrast?.left?.frames || []
        const rightFrames = contrast?.right?.frames || []
        const count = Math.max(leftFrames.length, rightFrames.length)
        if (!count || !activeKey) {
            message.warning('暂无可导出的对比数据')
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
        message.success('对比结果已导出')
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
                    <Button size="small" onClick={exportContrastResult}>导出结果</Button>
                    <Button size="small" onClick={exitContrast}>退出对比</Button>
                </div>
            </div>

            {contrast?.warnings?.length ? (
                <div className="contrastWarning">{contrast.warnings.join('；')}</div>
            ) : null}

            <div className="contrastStatusBar">
                <span>当前范围：{activeSelect ? '框选区域' : '全量矩阵'}</span>
                <span>当前帧：A {leftIndex + 1}/{contrast.left?.length || 0}，B {rightIndex + 1}/{contrast.right?.length || 0}</span>
                <span>过滤值：{settingValue?.filter ?? 0}</span>
                <span>对象：{activeKey}</span>
                <span>采样率：A {getSampleRateText(leftData)} / B {getSampleRateText(rightData)}</span>
                <span>置零：A {formatZeroState(leftData.zeroState)} / B {formatZeroState(rightData.zeroState)}</span>
                <span>方向：A {formatDirection(leftData.dataDirection)} / B {formatDirection(rightData.dataDirection)}</span>
                <span>差值范围：±{formatValue(conclusion.maxAbsDiff)}</span>
            </div>

            <div className="contrastSummary">
                <strong>当前帧结论</strong>
                <span>{conclusion.pressText}</span>
                <span>{conclusion.areaText}</span>
                <span>红色表示 B 大于 A，蓝色表示 B 小于 A</span>
            </div>

            <div className="contrastWorkspace">
                <div className="contrastMain">
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
                            title="B-A 差值图"
                            subtitle="红色升高，蓝色降低"
                            arr={diffArr}
                            width={width}
                            height={height}
                            mode="diff"
                        />
                        <ContrastHeatmap
                            title="B 对比数据"
                            subtitle={`第 ${rightIndex + 1}/${contrast.right?.length || 0} 帧`}
                            arr={rightArr}
                            width={width}
                            height={height}
                        />
                    </div>
                </div>

                <aside className="contrastSidePanel">
                    <div className="sidePanelHeader">
                        <div>
                            <div className="sidePanelTitle">区域管理</div>
                            <div className="sidePanelSub">选择分析范围，不改变原始数据</div>
                        </div>
                        <Button size="small" onClick={() => setActiveSelectionId(FULL_SELECTION_ID)}>全量</Button>
                    </div>

                    <div className={`selectionCard ${activeSelectionId === FULL_SELECTION_ID ? 'active' : ''}`} onClick={() => setActiveSelectionId(FULL_SELECTION_ID)}>
                        <div className="selectionCardTop">
                            <span className="selectionColor" style={{ background: '#e1e4e8' }} />
                            <strong>全量矩阵</strong>
                        </div>
                        <div className="selectionMeta">{width} x {height}，全部点位参与指标计算</div>
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
                                <span>压力差 {formatValue(item.pressDiff)}</span>
                                <span>面积差 {formatValue(item.areaDiff)}</span>
                            </div>
                        </div>
                    )) : (
                        <div className="selectionEmpty">当前没有框选区域，可在下方创建或套用模板。</div>
                    )}

                    <div className="contrastSelectPanel">
                        <SelectSet onSelect variant="embedded" />
                    </div>

                    <div className="exportPreview">
                        <div className="sidePanelTitle">导出预览</div>
                        {exportPreviewRows.map((row) => (
                            <div className="exportPreviewRow" key={row.label}>
                                <span>{row.label}</span>
                                <strong>{row.value}</strong>
                            </div>
                        ))}
                    </div>
                </aside>
            </div>

            <div className="contrastPlayback">
                <Button size="small" onClick={() => {
                    if (!playing && progress >= 100) setProgress(0)
                    setPlaying(!playing)
                }}>{playing ? '暂停' : '播放'}</Button>
                <Slider value={progress} onChange={setProgress} min={0} max={100} style={{ flex: 1 }} />
                <div className="contrastProgress">{progress}%</div>
            </div>

            <div className="contrastLegend">
                <span className="legendBlue" />B 小于 A
                <span className="legendWhite" />接近无变化
                <span className="legendRed" />B 大于 A
                <span className="legendScope">当前指标范围：{activeSelect ? '框选区域' : '全量矩阵'}</span>
            </div>

            <div className="contrastLineCharts">
                <MiniLineChart title="压力变化曲线" rows={pressSeries} />
                <MiniLineChart title="面积变化曲线" rows={areaSeries} />
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
