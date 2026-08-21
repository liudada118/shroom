import React, { useContext, useEffect, useRef, useState } from 'react'

import echarts from '../../util/echarts';
import { Scheduler } from '../../scheduler/scheduler';
import './index.scss'
import { useTranslation, withTranslation } from 'react-i18next';
import { getMatrixDisplayLabel, getMatrixPartFromDisplayType, getSystemMatrixParts, pointConfig } from '../../util/constant';
import { getDisplayType, getSelectArr, getSysType, useEquipStore } from '../../store/equipStore';
import { BrushManager, SELECT_COLORS } from '../selectBox/newSelecttBox';
import { calMatrixArea } from '../../assets/util/selectMatrix';
import { pageContext } from '../../page/test/Test';
import { shallow } from 'zustand/shallow';
import FootTrack from '../chart/Chart';
import { graCenter } from '../../util/util';
import DraggablePanel from '../draggablePanel/DraggablePanel';
import { formatSelectionName } from '../../util/selectionName';
import { getPressureMetricDisplay } from '../../util/pressureMetrics';
import {
    formatGradientValue,
    formatSymmetryPercent,
    getNextGradientUnit,
    supportsPressureGradient,
    supportsSymmetryCoefficient,
} from '../../util/gradientMetrics';

// 对称系数 / 压力梯度中部位的固定排序
const SHAPE_PART_ORDER = ['jacket', 'leftHand', 'rightHand', 'foot']

// 左右两块面板离顶部的距离保持一致
const PANEL_TOP = 80

// historyChart 里按部位分的那几张表，其余字段（比如 selection）不是部位表，别扫
const HISTORY_PART_FIELDS = [
    'pressArr', 'areaArr',
    'adcArr', 'adcAreaArr',
    'pressureArr', 'pressureAreaArr',
    'forceArr', 'forceAreaArr',
]

/** 数据 key → 部位短名：实时是 jacket，历史/回放是 endi-jacket，统一取后半段 */
const getPartKey = (key = '') => {
    const value = String(key || '')
    if (value.includes('-')) return value.split('-').pop()
    return getMatrixPartFromDisplayType(value)
}

/** 这条回放记录当初连了哪几个部位；没有历史数据（比如实时、对比）时返回 null，表示不过滤 */
const collectHistoryParts = (historyChart) => {
    const set = new Set()
    HISTORY_PART_FIELDS.forEach((field) => {
        const map = historyChart?.[field]
        if (!map) return
        // 老数据这几张表是一维数组，按靠背算（和 renderCharts1 里的兜底一致）
        if (Array.isArray(map)) {
            if (map.length) set.add('back')
            return
        }
        if (typeof map !== 'object') return
        Object.keys(map).forEach((key) => {
            const part = getPartKey(key)
            if (part) set.add(part)
        })
    })
    return set.size ? set : null
}

function ChartsAside(props) {

    // 设备颜色（无框选时使用）
    const pressColorArr = {
        back: '#8AC287',
        sit: '#5D65FF',
        jacket: '#22C55E',
        leftHand: '#38BDF8',
        rightHand: '#A78BFA',
        leftFoot: '#F59E0B',
        rightFoot: '#F87171',
        foot: '#F59E0B',
    }
    const areaColorArr = pressColorArr

    const myChart1 = useRef()
    const myChart2 = useRef()
    const chart = useRef()
    const myChart1Dom = useRef()
    const myChart2Dom = useRef()
    const normalChartDom = useRef()
    const trackRef = useRef()

    const [data, setData] = useState({})
    // 左下角那条工具条要占的高度，面板自动缩放时把这块空间让出来，别压到「重置视图」
    const [toolbarReserve, setToolbarReserve] = useState(0)
    const historyChart = useEquipStore(s => s.historyChart, shallow)
    const dataStatus = useEquipStore(s => s.dataStatus)
    const pressureMetricMode = useEquipStore(s => s.pressureMetricMode)
    const gradientUnit = useEquipStore(s => s.gradientUnit)
    const setGradientUnit = useEquipStore(s => s.setGradientUnit)
    const pressureUnit = useEquipStore(s => s.pressureUnit)
    const systemType = useEquipStore(s => s.systemType)
    const historyChartRef = useRef(historyChart)
    const pressureMetricModeRef = useRef(pressureMetricMode)
    // 图表在 Scheduler 回调里重绘，取不到最新的 state，统一走 ref
    const pressureUnitRef = useRef(pressureUnit)
    const getMetricDisplay = () => getPressureMetricDisplay(
        pressureMetricModeRef.current,
        props.t,
        props.i18n?.language,
        pressureUnitRef.current,
    )
    const getMetricTrendField = () => getMetricDisplay().trendField
    const getMetricAreaTrendField = () => `${getMetricDisplay().valuePrefix}AreaArr`

    /**
     * 当前还连着的部位。回放/对比历史数据时返回 null，表示不按设备状态过滤。
     * 在 Scheduler 回调里也会调到，所以直接读 store 而不是组件里的 state
     */
    const getOnlinePartSet = () => {
        const store = useEquipStore.getState()
        if (store.dataStatus !== 'realtime') return null
        const set = new Set()
        Object.entries(store.equipStatus || {}).forEach(([key, status]) => {
            if (!status || status === 'offline') return
            const part = key.includes('-') ? key.split('-').pop() : key
            set.add(part)
            // 左右腿在面板里合成一条「下身」，任意一侧还连着就算在
            if (part === 'leftFoot' || part === 'rightFoot') set.add('foot')
        })
        return set
    }

    /** 回放/对比时这条记录里有的部位；实时时返回 null。同样在 Scheduler 回调里调，直接读 store */
    const getRecordedPartSet = () => {
        const store = useEquipStore.getState()
        if (store.dataStatus === 'realtime') return null
        return collectHistoryParts(store.historyChart)
    }

    /**
     * 只保留设备自身配置里、且当前还连着的部位（假人就是上身/左臂/右臂/下身）。
     * 插错板子多出来的部位（比如靠背）在这里丢掉；拔掉/断开的部位也一并丢掉，
     * 图例、数值、曲线都当它不存在，不再留一行 0。
     * 回放历史/导入数据时不看现在插着什么，只看这条记录当初连了哪几个部位。
     * 返回时按设备自身的部位配置排序 —— 面板里所有「色点 + 数值」行的顺序都以此为准
     */
    const pickDeviceParts = (dataMap) => {
        if (!dataMap) return {}
        const allow = getSystemMatrixParts(getSysType()).map((part) => part.key)
        if (!allow.length) return dataMap
        const online = getOnlinePartSet()
        const recorded = getRecordedPartSet()
        const keys = Object.keys(dataMap)
        const res = {}
        allow.forEach((part) => {
            if (online && !online.has(part)) return
            if (recorded && !recorded.has(part)) return
            keys.forEach((key) => {
                if (getPartKey(key) === part) res[key] = dataMap[key]
            })
        })
        return res
    }

    useEffect(() => {
        historyChartRef.current = historyChart
        if (historyChart) {
            const emptyHistory = !Object.keys(historyChart.pressArr || {}).length && !Object.keys(historyChart.areaArr || {}).length
            if (emptyHistory && !Object.keys(props.chartData.current || {}).length) {
                clearChartViews()
            } else {
                renderCharts1()
                renderCharts2()
            }
        }
    }, [historyChart])

    useEffect(() => {
        pressureMetricModeRef.current = pressureMetricMode
        pressureUnitRef.current = pressureUnit
        renderCharts1()
        renderCharts2()
        renderNormal()
        setData((current) => ({ ...current, t: Date.now() }))
    }, [pressureMetricMode, pressureUnit])

    // 底部要让出多少 = 工具条上边缘往上再留 12px 间距。
    // 直接量 DOM（rem 会随窗口宽度变，写死不准；工具条被拖走之后这么算也照样对）
    useEffect(() => {
        const sync = () => {
            const bar = document.querySelector('.viewSetContent')
            if (!bar) { setToolbarReserve(0); return }
            const top = bar.getBoundingClientRect().top
            const reserve = Math.max(0, Math.round(window.innerHeight - top + 12))
            // 工具条要是被拖到很上面，别把面板挤没了，最多让出小半屏
            setToolbarReserve(Math.min(reserve, Math.round(window.innerHeight * 0.45)))
        }
        sync()
        const raf = window.requestAnimationFrame(sync)
        window.addEventListener('view-toolbar-resize', sync)
        window.addEventListener('resize', sync)
        return () => {
            window.cancelAnimationFrame(raf)
            window.removeEventListener('view-toolbar-resize', sync)
            window.removeEventListener('resize', sync)
        }
    }, [])

    const clearChartViews = () => {
        myChart1.current?.clear()
        myChart2.current?.clear()
        chart.current?.clear()
        trackRef.current?.canvasInit?.()
        setData({ t: Date.now() })
    }

    /**
     * 构建 ECharts series 数组
     * 当有多框选时，每个框一条线（颜色与框对应）
     * 无框选时，按设备（back/sit）分色
     */
    const buildSeries = (dataMap, type, useBoxStats, isHistory = false) => {
        const series = []
        const keyArr = Object.keys(dataMap)
        const colorMap = type === 'press' ? pressColorArr : areaColorArr
        const dataField = type === 'press' ? getMetricTrendField() : getMetricAreaTrendField()
        const onlyBoxStats = !isHistory && useBoxStats && getBoxStats().length > 0
        // 压强曲线按当前显示单位换算（非压强指标 valueScale 恒为 1）
        const valueScale = type === 'press' ? getMetricDisplay().valueScale : 1
        const scaleLine = (line) => {
            if (valueScale === 1 || !Array.isArray(line)) return line || []
            return line.map((item) => {
                const numeric = Number(item)
                return Number.isFinite(numeric) ? numeric * valueScale : item
            })
        }

        for (let i = 0; i < keyArr.length; i++) {
            const key = keyArr[i]
            const chartData = props.chartData.current
            const deviceData = chartData[key]
            const historyLine = isHistory && Array.isArray(dataMap[key]) ? dataMap[key] : null
            if (!deviceData && !historyLine) continue

            // 检查是否有多框选统计
            const boxStats = deviceData?.boxStats
            if (!historyLine && useBoxStats && boxStats && boxStats.length > 0) {
                // 多框选模式：每个框一条线
                for (let b = 0; b < boxStats.length; b++) {
                    const box = boxStats[b]
                    const deviceLabel = getMatrixDisplayLabel(key, props.i18n?.language)
                    const seriesName = `${formatSelectionName(box.name, b + 1, props.t)}${keyArr.length > 1 ? `-${deviceLabel}` : ''}`
                    series.push({
                        symbol: 'none',
                        data: scaleLine(box[dataField]),
                        type: 'line',
                        smooth: true,
                        color: box.bgc || SELECT_COLORS[box.colorIndex] || SELECT_COLORS[b],
                        lineStyle: { width: 2 },
                        name: seriesName,
                    })
                }
            } else {
                // 无框选模式：按设备分色
                if (onlyBoxStats) continue
                const color = getDeviceChartColor(key, colorMap, i)
                series.push({
                    symbol: 'none',
                    data: scaleLine(historyLine || dataMap[key]),
                    type: 'line',
                    smooth: true,
                    color: color,
                    lineStyle: { width: 2 },
                    name: getMatrixDisplayLabel(key, props.i18n?.language),
                })
            }
        }
        return series
    }

    // 颜色只认部位：回放曲线的 key 是 endi-jacket 这种，也要取到和左边色点一样的颜色
    const getDeviceChartColor = (key, colorMap, index = 0) => {
        const colorKey = getPartKey(key)
        return colorMap[colorKey] || Object.values(colorMap)[index]
    }

    const getDeviceChartLabel = (key) => getMatrixDisplayLabel(key, props.i18n?.language)

    const initCharts1 = (props) => {
        const xLength = props.xData?.length || 20
        const xLabelInterval = Math.max(0, Math.ceil(xLength / 5) - 1)
        const xAxisTitle = props.xName || '时间(帧)'
        const yAxisTitle = props.yName || '数值'
        let option = {
            animation: false,
            // 四块内容合到一块面板里，画布压矮了，上下留白也跟着收一点。
            // 左右也收窄：left 只需容纳 y 轴刻度文字（最宽 4 位数 ≈ 20px + margin 4），
            // right 原来留 36px 是给「时间(帧)」那行字，实际它是右对齐的 graphic，跟着一起改小
            grid: { left: 32, right: 12, top: 18, bottom: 30, containLabel: false },
            graphic: [
                {
                    type: 'text',
                    left: 32,
                    top: 4,
                    silent: true,
                    style: {
                        text: yAxisTitle,
                        fill: '#AEB8C4',
                        fontSize: 10,
                        fontWeight: 500,
                        textAlign: 'left',
                    },
                },
                {
                    type: 'text',
                    right: 12,
                    bottom: 0,
                    silent: true,
                    style: {
                        text: xAxisTitle,
                        fill: '#AEB8C4',
                        fontSize: 10,
                        fontWeight: 500,
                        textAlign: 'right',
                    },
                },
            ],
            xAxis: {
                type: 'category',
                show: true,
                name: '',
                nameLocation: 'end',
                nameGap: 8,
                nameTextStyle: { color: '#AEB8C4', fontSize: 10, align: 'right', verticalAlign: 'top' },
                axisLine: { show: true, lineStyle: { width: 0.5, color: '#46515F' } },
                axisTick: { show: true, lineStyle: { width: 0.5, color: '#46515F' } },
                splitLine: { show: false },
                data: props.xData,
                axisLabel: {
                    show: true,
                    interval: xLabelInterval,
                    color: '#AEB8C4',
                    fontSize: 9,
                    margin: 6,
                },
            },
            yAxis: {
                type: 'value',
                show: true,
                name: '',
                nameLocation: 'end',
                nameGap: 8,
                nameRotate: 0,
                nameTextStyle: { color: '#AEB8C4', fontSize: 10, align: 'left', verticalAlign: 'bottom' },
                axisLine: { show: true, lineStyle: { width: 0.5, color: '#46515F' } },
                axisTick: { show: true, lineStyle: { width: 0.5, color: '#46515F' } },
                splitLine: { show: true, lineStyle: { width: 0.5, color: '#32373E' } },
                max: props.yMax,
                axisLabel: {
                    show: true,
                    color: '#AEB8C4',
                    fontSize: 9,
                    margin: 4,
                    formatter: (value) => {
                        const num = Number(value)
                        if (!Number.isFinite(num)) return value
                        if (Math.abs(num) >= 10000) return `${Math.round(num / 1000)}k`
                        if (Math.abs(num) >= 1000) return Math.round(num)
                        if (Number.isInteger(num)) return num
                        return num.toFixed(1)
                    },
                },
            },
            series: props.series
        };
        option && props.myChart.setOption(option, { notMerge: true });
    };

    const getChartYMax = (maxValue) => {
        const value = Number(maxValue)
        if (!Number.isFinite(value) || value <= 0) return 1
        const padded = value * 1.18
        const step = Math.pow(10, Math.max(0, Math.floor(Math.log10(padded)) - 1))
        return Math.ceil(padded / step) * step
    }

    const handleCharts = (pressObj, value, isHistory = false) => {
        if (!myChart1.current) return
        const metricDisplay = getMetricDisplay()
        const series = buildSeries(pressObj, 'press', true, isHistory)
        const xLength = Math.max(20, ...series.map(item => Array.isArray(item.data) ? item.data.length : 0))
        initCharts1({
            series,
            xData: Array.from({ length: xLength }, (_, i) => i + 1),
            myChart: myChart1.current,
            yMax: getChartYMax(Number(value) * metricDisplay.valueScale),
            xName: props.t('timeFrame'),
            yName: `${metricDisplay.axisLabel} (${metricDisplay.unit})`,
        });
    }

    const handleChartsArea = (areaObj, value, isHistory = false) => {
        if (!myChart2.current) return
        const series = buildSeries(areaObj, 'area', true, isHistory)
        const xLength = Math.max(20, ...series.map(item => Array.isArray(item.data) ? item.data.length : 0))
        initCharts1({
            series,
            xData: Array.from({ length: xLength }, (_, i) => i + 1),
            myChart: myChart2.current,
            yMax: getChartYMax(value),
            xName: props.t('timeFrame'),
            yName: props.t('pointsAxis'),
        });
    }

    const getBoxStats = (chartData = pickDeviceParts(props.chartData.current)) => {
        const boxes = []
        Object.keys(chartData || {}).forEach((key) => {
            const list = chartData[key]?.boxStats
            if (Array.isArray(list) && list.length) {
                list.forEach((box, idx) => boxes.push({ ...box, key, boxIndex: idx }))
            }
        })
        return boxes
    }

    const getBoxChartValues = (chartData, field) => getBoxStats(chartData)
        .flatMap((box) => Array.isArray(box[field]) ? box[field] : [])

    const getCenterValues = (center) => {
        if (Array.isArray(center)) return center
        if (center && typeof center === 'object') return Object.values(center)
        return null
    }

    function renderCharts1() {
        const historyData = historyChartRef.current
        const pressArrRaw = historyData && (
            historyData[`${getMetricDisplay().valuePrefix}Arr`] || historyData.pressArr
        )
        const pressArr = Array.isArray(pressArrRaw) ? { back: pressArrRaw } : pressArrRaw
        const hasCurrentBoxStats = getBoxStats().length > 0
        const useHistory = pressArr && Object.keys(pressArr).length && !hasCurrentBoxStats

        const chartData = useHistory ? pressArr : pickDeviceParts(props.chartData.current)
        const keyArr = Object.keys(chartData)
        const onlyBoxStats = !useHistory && getBoxStats(chartData).length > 0
        let areaObj = {}
        let allArr = []
        if (!keyArr.length) {
            myChart1.current?.clear()
            return
        }
        if (keyArr.length) {
            for (let i = 0; i < keyArr.length; i++) {
                const key = keyArr[i]
                if (useHistory) {
                    areaObj[key] = chartData[key]
                    allArr = allArr.concat(chartData[key])
                } else {
                    const trendField = getMetricTrendField()
                    areaObj[key] = chartData[key][trendField]
                    const boxValues = getBoxChartValues({ [key]: chartData[key] }, trendField)
                    if (boxValues.length) {
                        allArr = allArr.concat(boxValues)
                    } else if (!onlyBoxStats) {
                        allArr = allArr.concat(chartData[key][trendField] || [])
                    }
                }
            }
            const max = allArr.length ? Math.max(...allArr) : 0
            handleCharts(areaObj, max, !!useHistory)
        }
    }

    function renderCharts2() {
        const historyData = historyChartRef.current
        const areaArrRaw = historyData && (
            historyData[getMetricAreaTrendField()] || historyData.areaArr
        )
        const areaArr = Array.isArray(areaArrRaw) ? { back: areaArrRaw } : areaArrRaw
        const hasCurrentBoxStats = getBoxStats().length > 0
        const useHistory = areaArr && Object.keys(areaArr).length && !hasCurrentBoxStats

        const chartData = useHistory ? areaArr : pickDeviceParts(props.chartData.current)
        const keyArr = Object.keys(chartData)
        const onlyBoxStats = !useHistory && getBoxStats(chartData).length > 0
        let areaObj = {}
        let allArr = []
        if (!keyArr.length) {
            myChart2.current?.clear()
            return
        }
        if (keyArr.length) {
            for (let i = 0; i < keyArr.length; i++) {
                const key = keyArr[i]
                if (useHistory) {
                    areaObj[key] = chartData[key]
                    allArr = allArr.concat(chartData[key])
                } else {
                    const areaField = getMetricAreaTrendField()
                    areaObj[key] = chartData[key][areaField]
                    const boxValues = getBoxChartValues({ [key]: chartData[key] }, areaField)
                    if (boxValues.length) {
                        allArr = allArr.concat(boxValues)
                    } else if (!onlyBoxStats) {
                        allArr = allArr.concat(chartData[key][areaField] || [])
                    }
                }
            }
            const max = allArr.length ? Math.max(...allArr) : 0
            handleChartsArea(areaObj, max, !!useHistory)
        }
    }

    const renderCenter = () => {
        const chartData = pickDeviceParts(props.chartData.current)
        const keys = Object.keys(chartData)
        if (!keys.length) {
            trackRef.current?.canvasInit?.()
            return
        }
        const boxCenters = getBoxStats(chartData)
            .map((box) => ({
                center: getCenterValues(box.center),
                color: box.bgc || SELECT_COLORS[box.colorIndex] || SELECT_COLORS[box.boxIndex],
            }))
            .filter((box) => box.center)
            .filter(Boolean)
        if (boxCenters.length) {
            trackRef.current?.circleMove(boxCenters)
            return
        }
        const centerArr = []
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i]
            const center = getCenterValues(chartData[key].center)
            if (center) {
                centerArr.push({
                    center,
                    color: getDeviceChartColor(key, pressColorArr, i),
                })
            }
        }
        trackRef.current?.circleMove(centerArr);
    }

    const renderNormal = () => {
        if (!chart.current) return
        const chartData = pickDeviceParts(props.chartData.current)
        const keys = Object.keys(chartData)
        if (!keys.length) {
            chart.current.clear()
            return
        }
        let series = [], Xmax = 0, valueMax = 1
        // x 轴是压强值，按当前显示单位换算（非压强指标 valueScale 恒为 1）
        const metricDisplay = getMetricDisplay()
        const valueScale = metricDisplay.valueScale
        const boxStats = getBoxStats(chartData).filter((box) => Array.isArray(box.normalDis?.yData))
        const seriesSource = boxStats.length
            ? boxStats
            : keys.map((key, idx) => ({
                key,
                normalDis: chartData[key].normalDis,
                bgc: getDeviceChartColor(key, pressColorArr, idx),
            }))

        for (let i = 0; i < seriesSource.length; i++) {
            const item = seriesSource[i]
            const color = item.bgc || SELECT_COLORS[item.colorIndex] || Object.values(pressColorArr)[i]
            const xValues = Array.isArray(item.normalDis?.xData)
                ? item.normalDis.xData
                : Array.from({ length: item.normalDis?.yData?.length || 0 }, (_, index) => index)
            const xDataRes = xValues.map((x, idx) => [(Number(x) || 0) * valueScale, item.normalDis?.yData?.[idx] || 0])
            series.push({
                symbol: 'none',
                data: xDataRes,
                type: 'line',
                smooth: true,
                showSymbol: false,
                color: color,
                lineStyle: { width: 2 },
            })
            Xmax = Math.max(Xmax, ...xDataRes.map((a) => a[1]))
            valueMax = Math.max(valueMax, ...xDataRes.map((a) => Number(a[0]) || 0))
        }

        const pressureValueLabel = metricDisplay.labels.data
        const probabilityDensityLabel = props.t('probabilityDensity') || '概率密度'
        chart.current.setOption({
            // 和上面两条曲线一样把左右留白收窄，绘图区宽一点
            grid: { left: 32, right: 12, top: 30, bottom: 34, containLabel: false },
            title: { left: 'center' },
            graphic: [
                {
                    type: 'text',
                    left: 32,
                    top: 6,
                    silent: true,
                    style: {
                        text: `${probabilityDensityLabel}(%)`,
                        fill: '#AEB8C4',
                        fontSize: 10,
                        fontWeight: 500,
                        align: 'left',
                    },
                },
                {
                    type: 'text',
                    right: 12,
                    bottom: 0,
                    silent: true,
                    style: {
                        text: `${pressureValueLabel} (${metricDisplay.unit})`,
                        fill: '#AEB8C4',
                        fontSize: 10,
                        fontWeight: 500,
                        align: 'right',
                    },
                },
            ],
            tooltip: {
                trigger: 'axis',
                formatter: p => {
                    const { value } = p[0];
                    return `${pressureValueLabel} (${metricDisplay.unit})：${Number(value[0]).toFixed(metricDisplay.valueDigits)}<br/>${probabilityDensityLabel}(%)：${(value[1] * 100).toFixed(2)}`;
                }
            },
            xAxis: {
                type: 'value', min: 0, max: valueMax,
                name: '', splitNumber: 5,
                axisLine: { show: true, lineStyle: { width: 0.5, color: '#46515F' } },
                axisLabel: { color: '#AEB8C4', fontSize: 9, margin: 6 },
                axisTick: { show: true, lineStyle: { width: 0.5, color: '#46515F' } },
                splitLine: { show: false }
            },
            yAxis: {
                type: 'value', name: '', splitNumber: 3,
                axisLine: { show: true, lineStyle: { width: 0.5, color: '#46515F' } },
                axisLabel: { color: '#AEB8C4', fontSize: 9, margin: 4, formatter: (value) => `${(Number(value) * 100).toFixed(2)}%` },
                axisTick: { show: true, lineStyle: { width: 0.5, color: '#46515F' } },
                splitLine: { lineStyle: { width: 0.5, color: '#32373E' } },
                scale: false,
            },
            series: series
        }, { notMerge: true });
    }

    useEffect(() => {
        myChart1.current = echarts.init(myChart1Dom.current)
        myChart2.current = myChart2Dom.current ? echarts.init(myChart2Dom.current) : null
        chart.current = echarts.init(normalChartDom.current);
        const chartPanel = document.querySelector('.charts-panel')
        const resizeCharts = () => {
            myChart1.current?.resize()
            myChart2.current?.resize()
            chart.current?.resize()
        }
        const resizeObserver = chartPanel && typeof ResizeObserver !== 'undefined'
            ? new ResizeObserver(resizeCharts)
            : null
        if (resizeObserver && chartPanel) resizeObserver.observe(chartPanel)

        const offRenderCharts1 = Scheduler.onRender(renderCharts1)
        const offRenderCharts2 = Scheduler.onRender(renderCharts2)
        const offRenderCenter = Scheduler.onRender(renderCenter)
        const offRenderNormal = Scheduler.onRender(renderNormal)
        resizeCharts()
        requestAnimationFrame(resizeCharts)

        let data = {}

        const offUI = Scheduler.onUI(() => setData(() => {
            const system = getSysType()
            const chartData = pickDeviceParts(props.chartData.current)

            const select = getSelectArr()
            const displayType = getDisplayType()
            const disPlayDataRef = props.sitData.current

            const keyArr = Object.keys(chartData)
            let dataObj = {}
            if (keyArr.length) {
                for (let i = 0; i < keyArr.length; i++) {
                    const key = keyArr[i]
                    if (!dataObj[key]) dataObj[key] = {}

                    try {
                        const sysConfig = pointConfig[system]
                        if (!sysConfig || !sysConfig[key]) continue
                        const widthDistance = sysConfig[key].pointWidthDistance || 1
                        const heightDistance = sysConfig[key].pointHeightDistance || 1
                        dataObj[key].pointTotal = chartData[key].data.areaTotal
                        const preciseAreaTotal = chartData[key].data.areaTotal * widthDistance * heightDistance / 100
                        dataObj[key].areaTotal = Math.round(preciseAreaTotal)
                        dataObj[key].pressAver = Number(chartData[key].data.pressAver || 0).toFixed(1)
                        dataObj[key].pressMax = Number(chartData[key].data.pressMax || 0).toFixed(1)
                        dataObj[key].pressTotal = chartData[key].data.pressTotal
                        dataObj[key].total = Number(chartData[key].data.pressTotal ?? preciseAreaTotal * dataObj[key].pressAver).toFixed(1)

                        dataObj[key].μ = chartData[key].normalDis.μ
                        dataObj[key].Var = chartData[key].normalDis.Var
                        dataObj[key].Skew = chartData[key].normalDis.Skew
                        dataObj[key].Kurt = chartData[key].normalDis.Kurt

                        dataObj[key].pressureCenter = Object.values(chartData[key].center)

                        // 对称系数 / 压力梯度（梯度原始值单位 pa/cm，渲染时再按当前单位换算）
                        dataObj[key].symmetry = chartData[key].shape?.symmetry ?? null
                        dataObj[key].avgGradient = chartData[key].shape?.avgGradient ?? null
                        dataObj[key].maxGradient = chartData[key].shape?.maxGradient ?? null

                        // 多框选统计数据
                        if (chartData[key].boxStats && chartData[key].boxStats.length > 0) {
                            dataObj[key].boxStats = chartData[key].boxStats.map((box, idx) => {
                                const bWidthDistance = widthDistance
                                const bHeightDistance = heightDistance
                                const bPreciseArea = (box.data.areaTotal || 0) * bWidthDistance * bHeightDistance / 100
                                return {
                                    colorIndex: box.colorIndex,
                                    bgc: box.bgc,
                                    name: formatSelectionName(box.name, idx + 1, props.t),
                                    pointTotal: box.data.areaTotal || 0,
                                    areaTotal: Math.round(bPreciseArea),
                                    pressAver: Number(box.data.pressAver || 0).toFixed(1),
                                    pressMax: Number(box.data.pressMax || 0).toFixed(1),
                                    pressTotal: box.data.pressTotal || 0,
                                    total: Number(box.data.pressTotal ?? bPreciseArea * Number(box.data.pressAver || 0)).toFixed(1),
                                    // 每个框自己的对称系数 / 压力梯度（梯度原始值单位 pa/cm）
                                    symmetry: box.shape?.symmetry ?? null,
                                    avgGradient: box.shape?.avgGradient ?? null,
                                    maxGradient: box.shape?.maxGradient ?? null,
                                    pressureCenter: getCenterValues(box.center) || ['-', '-'],
                                    normalDis: box.normalDis,
                                    μ: box.normalDis?.['\u03bc'],
                                    Var: box.normalDis?.Var,
                                    Skew: box.normalDis?.Skew,
                                    Kurt: box.normalDis?.Kurt,
                                }
                            })
                        } else {
                            dataObj[key].boxStats = []
                        }
                    } catch (e) { continue }
                }
            }
            return { ...dataObj, t: Date.now() }
        }))

        return () => {
            offRenderCharts1()
            offRenderCharts2()
            offRenderCenter()
            offRenderNormal()
            offUI()
            resizeObserver?.disconnect()
            myChart1.current?.dispose()
            myChart2.current?.dispose()
            chart.current?.dispose()
            myChart1.current = null
            myChart2.current = null
            chart.current = null
        }

    }, [])

    const { t, i18n } = useTranslation()
    const metricDisplay = getPressureMetricDisplay(pressureMetricMode, t, i18n.language, pressureUnit)

    const system = getSysType()
    const pressDataArr = ['pressAver', 'pressMax', 'total']
    const areaDataArr = ['pointTotal', 'areaTotal']
    const centerDataArr = ['pressureCenter']
    const pressureMetricKeys = new Set(['pressAver', 'pressMax', 'total'])
    const getMetricLabel = (item) => {
        if (item === 'pressAver') return metricDisplay.labels.average
        if (item === 'pressMax') return metricDisplay.labels.max
        if (item === 'total') return i18n.language?.startsWith('en') ? 'Total Force' : '压力总和'
        return t(item)
    }

    const getMetricUnit = (item) => {
        if (item === 'total') return 'N'
        if (item === 'pressAver' || item === 'pressMax') return metricDisplay.unit
        if (item === 'pointTotal') return i18n.language?.startsWith('en') ? 'points' : '个'
        if (item === 'areaTotal') return 'cm²'
        return ''
    }

    const formatMetricValue = (item, value) => {
        if (value === undefined || value === null || value === '') return '-'
        if (!pressureMetricKeys.has(item)) return value
        const numeric = Number(value)
        if (!Number.isFinite(numeric)) return value
        // 压力总和固定是 N，只有平均/最大压强跟随压强显示单位
        if (item === 'total') return numeric.toFixed(1)
        return metricDisplay.formatValue(numeric)
    }

    /**
     * 判断当前是否有多框选数据
     */
    const hasBoxStats = () => {
        const keys = Object.keys(data).filter(a => a !== 't')
        return keys.some(key => data[key]?.boxStats?.length > 0)
    }

    const hasSelectionStats = hasBoxStats()

    const dataKeys = Object.keys(data).filter((a) => a !== 't')
    // 回放时这条记录里有哪几个部位：刚点开还没点播放，一帧数据都还没来，
    // 也要按记录里的部位把色点列出来（数值先是 -）
    const recordedParts = dataStatus === 'realtime' ? null : collectHistoryParts(historyChart)
    /** 部位短名 → data 里的实际 key，没有这块传感器时返回 undefined */
    const findDataKey = (part) => dataKeys.find((a) => getPartKey(a) === part)
        || (recordedParts?.has(part) ? part : undefined)
    // 图例只标注当前真正接上的传感器：插了哪块显示哪块，没插的不占位。
    // 顺序按设备自身的部位配置走，配置以外的部位（比如插错板子的靠背）不会进 data
    const legendKeys = getSystemMatrixParts(systemType)
        .map((part) => findDataKey(part.key))
        .filter(Boolean)

    /**
     * 渲染图表图例 — 多框选时显示框颜色，否则显示设备颜色
     */
    const renderLegend = (colorArr) => {
        if (hasBoxStats()) {
            // 多框选模式：显示每个框的颜色
            const allBoxes = []
            Object.keys(data).filter(a => a !== 't').forEach(key => {
                if (data[key]?.boxStats) {
                    data[key].boxStats.forEach((box, idx) => {
                        if (!allBoxes.find(b => b.colorIndex === box.colorIndex)) {
                            allBoxes.push(box)
                        }
                    })
                }
            })
            return allBoxes.map((box, idx) => (
                <div className='chartTypeItem' key={`box-${box.colorIndex}`}>
                    <div className='cirlce' style={{ backgroundColor: box.bgc || SELECT_COLORS[box.colorIndex] }}></div>
                    {formatSelectionName(box.name, box.colorIndex + 1, t)}
                </div>
            ))
        }
        // 设备模式
        return legendKeys.map((a) => (
            <div className='chartTypeItem' key={a}>
                <div className='cirlce' style={{ backgroundColor: getDeviceChartColor(a, colorArr) }}></div> {getDeviceChartLabel(a)}
            </div>
        ))
    }

    /**
     * 一个部位都没接上时给这行放个空占位：行高和有数值时一样，
     * 面板整体高度就不随「连没连设备」变，自动适配算出来的缩放（也就是面板在屏幕上的宽度）才不会跳
     */
    const withRowPlaceholder = (items, key) => (items && items.length ? items : [
        <div className='chartTypeItem' key={`placeholder-${key}`} aria-hidden='true'>
            <span className='chartMetricValue'>&nbsp;</span>
        </div>
    ])

    /**
     * 渲染数据行 — 多框选时每个框一行数据（颜色对应），否则按设备
     */
    const renderDataRow = (item, colorArr) => {
        if (hasBoxStats()) {
            // 多框选模式
            const allBoxRows = []
            Object.keys(data).filter(a => a !== 't').forEach(key => {
                if (data[key]?.boxStats) {
                    data[key].boxStats.forEach((box, idx) => {
                        const color = box.bgc || SELECT_COLORS[box.colorIndex]
                        const value = formatMetricValue(item, box[item])
                        allBoxRows.push(
                            <div className='chartTypeItem' key={`${key}-box-${box.colorIndex}-${item}`}>
                                <div className='cirlce' style={{ backgroundColor: color }}></div>
                                <div className='chartMetricValueGroup'>
                                    <span className='chartMetricValue'>{value}</span>
                                    <span className='chartMetricUnit'>
                                        {system === 'carY' ? '' : getMetricUnit(item)}
                                    </span>
                                </div>
                            </div>
                        )
                    })
                }
            })
            return withRowPlaceholder(allBoxRows, item)
        }

        // 设备模式：顺序、有哪几个色点，一律跟着右上角图例走
        return withRowPlaceholder(legendKeys.map((a) => (
            <div className='chartTypeItem' key={`${a}-${item}`}>
                <div className='cirlce' style={{ backgroundColor: getDeviceChartColor(a, colorArr) }}></div>
                <div className='chartMetricValueGroup'>
                    <span className='chartMetricValue'>{formatMetricValue(item, data[a]?.[item])}</span>
                    <span className='chartMetricUnit'>
                        {system === 'carY' ? '' : getMetricUnit(item)}
                    </span>
                </div>
            </div>
        )), item)
    }

    const renderCenterRows = () => {
        if (hasBoxStats()) {
            const rows = []
            Object.keys(data).filter(a => a !== 't').forEach(key => {
                data[key]?.boxStats?.forEach((box, idx) => {
                    const color = box.bgc || SELECT_COLORS[box.colorIndex] || SELECT_COLORS[idx]
                    const center = Array.isArray(box.pressureCenter) ? box.pressureCenter : ['-', '-']
                    rows.push(
                        <div className='chartTypeItem' key={`${key}-box-${box.colorIndex}-center-${idx}`}>
                            <div className='cirlce' style={{ backgroundColor: color }}></div>
                            <div className="chartCenterValue">
                                {`(${center[0]} , ${center[1]})`}
                            </div>
                        </div>
                    )
                })
            })
            return withRowPlaceholder(rows, 'center')
        }

        // 同上：顺序和色点跟右上角图例一致
        return withRowPlaceholder(legendKeys.map((a) => {
            const center = Array.isArray(data[a]?.pressureCenter) ? data[a].pressureCenter : ['-', '-']
            return <div className='chartTypeItem' key={a}>
                <div className='cirlce' style={{ backgroundColor: getDeviceChartColor(a, areaColorArr) }}></div>
                <div className="chartCenterValue">
                    {`(${center[0]} , ${center[1]})`}
                </div>
            </div>
        }), 'center')
    }

    // ─── 对称系数 / 压力梯度 ───────────────────────────────
    // 和上面压强总和曲线 / 面积曲线两块一致：不跟着 2D 里选中的部位变，
    // 接了哪几块传感器就把有值的都列出来（对称系数仍然只有上身/下身有）
    const shapeKeys = SHAPE_PART_ORDER
        .map(findDataKey)
        .filter(Boolean)
    const symmetryKeys = shapeKeys.filter((a) => supportsSymmetryCoefficient(a))
    // 只有假人这类带上身/四肢的系统才有这两项。按设备自身的部位配置判断：
    // 没连传感器时这两块一样要出来（和压强块、面积块一致），只是里面一个色点都没有
    const deviceParts = getSystemMatrixParts(systemType)
    const shapeVisible = deviceParts.some((part) => supportsPressureGradient(part.key))
    const symmetryVisible = deviceParts.some((part) => supportsSymmetryCoefficient(part.key))
    /**
     * 形态指标一行的取值来源，与上面压强 / 面积几行保持一致：
     * 无框选时按部位（色点 = 部位色），框选时按框（色点 = 框色，框了几个就几个值）
     */
    const getShapeEntries = (keys) => {
        if (hasSelectionStats) {
            const entries = []
            keys.forEach((key) => {
                (data[key]?.boxStats || []).forEach((box, idx) => {
                    entries.push({
                        id: `${key}-box-${box.colorIndex ?? idx}`,
                        color: box.bgc || SELECT_COLORS[box.colorIndex] || SELECT_COLORS[idx],
                        source: box,
                    })
                })
            })
            return entries
        }
        return keys.map((key) => ({
            id: key,
            color: getDeviceChartColor(key, pressColorArr),
            source: data[key],
        }))
    }

    /** 一行指标：每个部位（或每个框）一个「色点 + 数值 + 单位」，色点颜色与图例一致 */
    const renderShapeRow = (keys, format, unit) => withRowPlaceholder(getShapeEntries(keys).map((entry) => (
        <div className='chartTypeItem' key={`shape-${entry.id}-${unit || 'percent'}`}>
            <div className='cirlce' style={{ backgroundColor: entry.color }}></div>
            <div className='chartMetricValueGroup'>
                <span className='chartMetricValue'>{format(entry.source)}</span>
                {unit ? <span className='chartMetricUnit'>{unit}</span> : null}
            </div>
        </div>
    )), `shape-${unit || 'percent'}`)

    /**
     * 对称系数：单独一小块，标题下面一行数值。
     * 部位色点对应哪个位置只看最上面「压强总和曲线」那一行图例，这里不再重复标注
     */
    const renderSymmetrySection = () => {
        if (!symmetryVisible) return null
        return (
            <div className='chartAndDataContent'>
                <div className="chartTitle">
                    <div className="chartName">{t('symmetryCoefficient')}</div>
                </div>
                <div className='chartData'>
                    <span className="chartDataLabel">{t('symmetryCoefficient')}</span>
                    <div className={`chartTypeContent ${hasSelectionStats ? 'chartTypeContent--selection' : ''}`}>
                        {renderShapeRow(symmetryKeys, (source) => formatSymmetryPercent(source?.symmetry), '')}
                    </div>
                </div>
            </div>
        )
    }

    /** 压力梯度：单独一小块，单位切换只在这块的标题里 */
    const renderGradientSection = () => {
        if (!shapeVisible) return null
        return (
            <div className='chartAndDataContent'>
                <div className="chartTitle">
                    <div className="chartName">{t('pressureGradient')}</div>
                    <div className='shapeUnitBar'>
                        <span className='shapeUnitLabel'>{t('unit')}：</span>
                        <span className='shapeUnitValue'>{gradientUnit}</span>
                        <button
                            type='button'
                            className='shapeUnitButton'
                            title={t('switchUnit')}
                            onClick={() => setGradientUnit(getNextGradientUnit(gradientUnit))}
                        >
                            ⇌
                        </button>
                    </div>
                </div>
                <div className='chartData'>
                    <span className="chartDataLabel">{t('avgGradient')}</span>
                    <div className={`chartTypeContent chartTypeContent--gradient ${hasSelectionStats ? 'chartTypeContent--selection' : ''}`}>
                        {renderShapeRow(shapeKeys, (source) => formatGradientValue(source?.avgGradient, gradientUnit), gradientUnit)}
                    </div>
                </div>
                <div className='chartData'>
                    <span className="chartDataLabel">{t('maxGradient')}</span>
                    <div className={`chartTypeContent chartTypeContent--gradient ${hasSelectionStats ? 'chartTypeContent--selection' : ''}`}>
                        {renderShapeRow(shapeKeys, (source) => formatGradientValue(source?.maxGradient, gradientUnit), gradientUnit)}
                    </div>
                </div>
            </div>
        )
    }

    return (
        <>
            <DraggablePanel
                title={t('realtimeStats')}
                defaultPosition={{ x: 20, y: PANEL_TOP }}
                className={`charts-panel${hasSelectionStats ? ' charts-panel--expanded' : ''}`}
                fitToViewport
                bottomReserve={toolbarReserve}
            >
                {/* 图例（哪个颜色对应哪个部位）整块面板只在这里出现一次，下面几块共用 */}
                <div className='chartAndDataContent'>
                    <div className="chartTitle">
                        <div className="chartName">{metricDisplay.curveLabel}</div>
                        <div className="chartType">{renderLegend(pressColorArr)}</div>
                    </div>
                    <div ref={myChart1Dom} id="myChart1" className="chartCanvas" style={{ opacity: '0.8' }}></div>
                    {pressDataArr.map((item) => (
                        <div className='chartData' key={item}>
                            <span className="chartDataLabel">{getMetricLabel(item)}</span>
                            <div className={`chartTypeContent ${hasSelectionStats ? 'chartTypeContent--selection' : ''}`}>{renderDataRow(item, pressColorArr)}</div>
                        </div>
                    ))}
                </div>

                <div className='chartAndDataContent'>
                    <div className="chartTitle">
                        <div className="chartName">{t('areaCurve')}</div>
                    </div>
                    <div ref={myChart2Dom} id="myChart2" className="chartCanvas" style={{ opacity: '0.8' }}></div>
                    {areaDataArr.map((item) => (
                        <div className='chartData' key={item}>
                            <span className="chartDataLabel">{t(item)}</span>
                            <div className={`chartTypeContent ${hasSelectionStats ? 'chartTypeContent--selection' : ''}`}>{renderDataRow(item, areaColorArr)}</div>
                        </div>
                    ))}
                </div>

                {renderSymmetrySection()}
                {renderGradientSection()}
            </DraggablePanel>

            <DraggablePanel
                title={t('pressureCenterCurve') + ' / ' + t('pressureNormalDist')}
                defaultPosition={{ right: 20, y: PANEL_TOP }}
                className='center-panel'
            >
                <div className='chartAndDataContent'>
                    <div className="chartTitle">
                        <div className="chartName">{t('pressureCenterCurve')}</div>
                        <div className="chartType">{renderLegend(areaColorArr)}</div>
                    </div>
                    <FootTrack ref={trackRef} />
                    <div style={{ marginBottom: '6px', color: '#E6EBF0', fontSize: '0.875rem' }}>{t('pressureCenter')}{`(X,Y)`}</div>
                    {centerDataArr.map((item) => (
                        <div className='chartData' key={item}>
                            <div className={`chartTypeContent chartTypeContent--center ${hasSelectionStats ? 'chartTypeContent--selection' : ''}`}>
                                {renderCenterRows()}
                            </div>
                        </div>
                    ))}
                </div>

                <div className='chartAndDataContent'>
                    <div className="chartTitle">
                        <div className="chartName">{t('pressureNormalDist')}</div>
                        <div className="chartType">{renderLegend(areaColorArr)}</div>
                    </div>
                    <div className="normalChartWrap">
                        <div ref={normalChartDom} id="chart" className="normalChartCanvas"></div>
                    </div>
                </div>
            </DraggablePanel>
        </>
    )
}

export default withTranslation('translation')(ChartsAside)
