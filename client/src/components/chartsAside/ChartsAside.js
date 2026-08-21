import React, { useContext, useEffect, useRef, useState } from 'react'

import echarts from '../../util/echarts';
import { Scheduler } from '../../scheduler/scheduler';
import './index.scss'
import { useTranslation, withTranslation } from 'react-i18next';
import { pointConfig } from '../../util/constant';
import { getDisplayType, getSelectArr, getSysType, useEquipStore } from '../../store/equipStore';
import { BrushManager, SELECT_COLORS } from '../selectBox/newSelecttBox';
import { calMatrixArea } from '../../assets/util/selectMatrix';
import { pageContext } from '../../page/test/Test';
import { shallow } from 'zustand/shallow';
import FootTrack from '../chart/Chart';
import { graCenter } from '../../util/util';
import { ChartPanel, DraggablePanel, MetricValue } from '../../ui';
import { formatSelectionName } from '../../util/selectionName';
import { Button, Tooltip } from 'antd';
import { SwapOutlined } from '@ant-design/icons';
import { getPressureMetricDisplay } from '../../util/pressureMetrics';

function ChartsAside(props) {

    // 设备颜色（无框选时使用）
    const pressColorArr = { back: '#8AC287', sit: '#5D65FF' }
    const areaColorArr = { back: '#8AC287', sit: '#5D65FF' }

    const myChart1 = useRef()
    const myChart2 = useRef()
    const chart = useRef()
    const myChart1Dom = useRef()
    const myChart2Dom = useRef()
    const normalChartDom = useRef()
    const trackRef = useRef()

    const [data, setData] = useState({})
    const historyChart = useEquipStore(s => s.historyChart, shallow)
    const pressureMetricMode = useEquipStore(s => s.pressureMetricMode)
    const historyChartRef = useRef(historyChart)
    const pressureMetricModeRef = useRef(pressureMetricMode)

    const getMetricTrendField = () => getPressureMetricDisplay(pressureMetricModeRef.current).trendField
    const getMetricAreaTrendField = () => `${getPressureMetricDisplay(pressureMetricModeRef.current).valuePrefix}AreaArr`
    const getHistoryMetricMap = (historyData) => {
        const field = `${getPressureMetricDisplay(pressureMetricModeRef.current).valuePrefix}Arr`
        return historyData?.[field] || historyData?.pressArr || {}
    }
    const getHistoryAreaMap = (historyData) => {
        const field = getMetricAreaTrendField()
        return historyData?.[field] || historyData?.areaArr || {}
    }
    const getNormalDistributionForMode = (normalDis) => (
        normalDis?.byMode?.[pressureMetricModeRef.current] || normalDis
    )
    const roundMetricValue = (value, digits = 1) => {
        const numeric = Number(value)
        return Number.isFinite(numeric) ? Number(numeric.toFixed(digits)) : 0
    }
    const formatMetricValue = (value, digits = 1) => roundMetricValue(value, digits).toFixed(digits)
    const roundMetricSeries = (values = []) => Array.isArray(values)
        ? values.map((value) => roundMetricValue(value))
        : []

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
        renderCharts1()
        renderCharts2()
        renderNormal()
        setData((current) => ({ ...current, t: Date.now() }))
    }, [pressureMetricMode])

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
        const onlyBoxStats = !isHistory && useBoxStats && getBoxStats(props.chartData.current).length > 0

        for (let i = 0; i < keyArr.length; i++) {
            const key = keyArr[i]
            const chartData = props.chartData.current
            const deviceData = chartData[key]
            const rawHistoryLine = isHistory && Array.isArray(dataMap[key]) ? dataMap[key] : null
            const historyLine = rawHistoryLine
            if (!deviceData && !historyLine) continue

            // 检查是否有多框选统计
            const boxStats = deviceData?.boxStats
            if (!historyLine && useBoxStats && boxStats && boxStats.length > 0) {
                // 多框选模式：每个框一条线
                for (let b = 0; b < boxStats.length; b++) {
                    const box = boxStats[b]
                    const seriesName = `${formatSelectionName(box.name, b + 1, props.t)}${keyArr.length > 1 ? `-${key}` : ''}`
                    series.push({
                        symbol: 'none',
                        data: type === 'press' ? roundMetricSeries(box[dataField] || box.pressArr || []) : (box[dataField] || box.pressArr || []),
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
                    data: type === 'press' ? roundMetricSeries(historyLine || dataMap[key]) : (historyLine || dataMap[key]),
                    type: 'line',
                    smooth: true,
                    color: color,
                    lineStyle: { width: 2 },
                    name: key,
                })
            }
        }
        return series
    }

    const getDeviceChartColor = (key, colorMap, index = 0) => {
        const colorKey = key.includes('back') ? 'back' : key.includes('sit') ? 'sit' : key
        return colorMap[colorKey] || Object.values(colorMap)[index]
    }

    /** grid.top(30) + grid.bottom(34)，即 Y 轴刻度不可用的垂直空间 */
    const CHART_VERTICAL_PADDING = 64

    /** 单个 Y 轴刻度所需的最小垂直间距（px），小于它标签就会挤在一起 */
    const AXIS_LABEL_MIN_GAP = 26

    /**
     * 按图表实际像素高度反推 Y 轴等分数
     * 小分辨率下面板被压扁，固定等分会让刻度全糊在一起，这里按可用高度动态降档
     */
    const getAxisSplitNumber = (chartInstance, maxSplit = 5) => {
        const height = Number(chartInstance?.getHeight?.())
        if (!Number.isFinite(height) || height <= 0) return maxSplit
        const plotHeight = height - CHART_VERTICAL_PADDING
        if (plotHeight <= 0) return 1
        return Math.max(1, Math.min(maxSplit, Math.floor(plotHeight / AXIS_LABEL_MIN_GAP)))
    }

    /**
     * 概率密度刻度格式化
     * 固定两位小数会把 "90.00%" 这类标签撑得很宽，按精度需要裁掉多余的 0
     */
    const formatPercentTick = (value) => {
        const percent = Math.round(Number(value) * 10000) / 100
        if (!Number.isFinite(percent)) return value
        if (Number.isInteger(percent)) return `${percent}%`
        return `${percent.toFixed(Math.abs(percent) >= 1 ? 1 : 2)}%`
    }

    const initCharts1 = (props) => {
        const xLength = props.xData?.length || 20
        const xLabelInterval = Math.max(0, Math.ceil(xLength / 5) - 1)
        const xAxisTitle = props.xName || '时间(帧)'
        const yAxisTitle = props.yName || '数值'
        let option = {
            animation: false,
            grid: { left: 42, right: 36, top: 30, bottom: 34, containLabel: false },
            graphic: [
                {
                    type: 'text',
                    left: 42,
                    top: 6,
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
                    right: 36,
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
                splitNumber: getAxisSplitNumber(props.myChart),
                axisLabel: {
                    show: true,
                    color: '#AEB8C4',
                    fontSize: 9,
                    margin: 4,
                    hideOverlap: true,
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
        const series = buildSeries(pressObj, 'press', true, isHistory)
        const xLength = Math.max(20, ...series.map(item => Array.isArray(item.data) ? item.data.length : 0))
        initCharts1({
            series,
            xData: Array.from({ length: xLength }, (_, i) => i + 1),
            myChart: myChart1.current,
            yMax: getChartYMax(value),
            xName: props.t('timeFrame'),
            yName: getPressureMetricDisplay(pressureMetricModeRef.current, props.t).axisLabel,
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

    const getBoxStats = (chartData = props.chartData.current) => {
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
        const pressArrRaw = getHistoryMetricMap(historyData)
        const pressArr = Array.isArray(pressArrRaw) ? { back: pressArrRaw } : pressArrRaw
        const hasCurrentBoxStats = getBoxStats(props.chartData.current).length > 0
        const useHistory = pressArr && Object.keys(pressArr).length && !hasCurrentBoxStats

        const chartData = useHistory ? pressArr : props.chartData.current
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
                    const metricField = getMetricTrendField()
                    areaObj[key] = chartData[key][metricField] || chartData[key].pressArr
                    const boxValues = getBoxChartValues({ [key]: chartData[key] }, metricField)
                    if (boxValues.length) {
                        allArr = allArr.concat(boxValues)
                    } else if (!onlyBoxStats) {
                        allArr = allArr.concat(chartData[key][metricField] || chartData[key].pressArr)
                    }
                }
            }
            const max = allArr.length ? Math.max(...allArr) : 0
            handleCharts(areaObj, max, !!useHistory)
        }
    }

    function renderCharts2() {
        const historyData = historyChartRef.current
        const areaArrRaw = getHistoryAreaMap(historyData)
        const areaArr = Array.isArray(areaArrRaw) ? { back: areaArrRaw } : areaArrRaw
        const hasCurrentBoxStats = getBoxStats(props.chartData.current).length > 0
        const useHistory = areaArr && Object.keys(areaArr).length && !hasCurrentBoxStats

        const chartData = useHistory ? areaArr : props.chartData.current
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
                    areaObj[key] = chartData[key][areaField] || chartData[key].areaArr
                    const boxValues = getBoxChartValues({ [key]: chartData[key] }, areaField)
                    if (boxValues.length) {
                        allArr = allArr.concat(boxValues)
                    } else if (!onlyBoxStats) {
                        allArr = allArr.concat(chartData[key][areaField] || chartData[key].areaArr)
                    }
                }
            }
            const max = allArr.length ? Math.max(...allArr) : 0
            handleChartsArea(areaObj, max, !!useHistory)
        }
    }

    const renderCenter = () => {
        const chartData = props.chartData.current
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
        const chartData = props.chartData.current
        const keys = Object.keys(chartData)
        if (!keys.length) {
            chart.current.clear()
            return
        }
        const legacyXData = Array.from({ length: 256 }, (_, index) => index)
        let series = []
        let axisMax = 0
        const boxStats = getBoxStats(chartData)
            .map((box) => ({ ...box, normalDis: getNormalDistributionForMode(box.normalDis) }))
            .filter((box) => Array.isArray(box.normalDis?.yData))
        const seriesSource = boxStats.length
            ? boxStats
            : keys.map((key, idx) => ({
                key,
                normalDis: getNormalDistributionForMode(chartData[key].normalDis),
                bgc: getDeviceChartColor(key, pressColorArr, idx),
            }))

        for (let i = 0; i < seriesSource.length; i++) {
            const item = seriesSource[i]
            const color = item.bgc || SELECT_COLORS[item.colorIndex] || Object.values(pressColorArr)[i]
            const distributionXData = Array.isArray(item.normalDis?.xData)
                ? item.normalDis.xData
                : legacyXData
            const distributionYData = Array.isArray(item.normalDis?.yData)
                ? item.normalDis.yData
                : []
            const xDataRes = distributionXData.map((x, idx) => [x, distributionYData[idx] || 0])
            series.push({
                symbol: 'none',
                data: xDataRes,
                type: 'line',
                smooth: true,
                showSymbol: false,
                color: color,
                lineStyle: { width: 2 },
            })
            axisMax = Math.max(axisMax, Number(item.normalDis?.max) || 0, ...distributionXData)
        }

        const metricDisplay = getPressureMetricDisplay(
            pressureMetricModeRef.current,
            props.t,
            props.i18n?.language,
        )
        const metricValueLabel = metricDisplay.name || props.t('pressureValue') || 'Pressure'
        const metricAxisLabel = `${metricValueLabel}(${metricDisplay.unit})`
        const probabilityDensityLabel = props.t('probabilityDensity') || '概率密度'
        chart.current.setOption({
            animation: false,
            grid: { left: 42, right: 36, top: 30, bottom: 34, containLabel: false },
            title: { left: 'center' },
            graphic: [
                {
                    type: 'text',
                    left: 42,
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
                    right: 36,
                    bottom: 0,
                    silent: true,
                    style: {
                        text: metricAxisLabel,
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
                    return `${metricAxisLabel}：${Number(value[0]).toFixed(1)}<br/>${probabilityDensityLabel}(%)：${(value[1] * 100).toFixed(2)}`;
                }
            },
            xAxis: {
                type: 'value', min: 0, max: axisMax > 0 ? axisMax : 1,
                name: '', splitNumber: 5,
                axisLine: { show: true, lineStyle: { width: 0.5, color: '#46515F' } },
                axisLabel: {
                    color: '#AEB8C4',
                    fontSize: 9,
                    margin: 6,
                    formatter: (value) => Number(value).toFixed(axisMax <= 20 ? 1 : 0),
                },
                axisTick: { show: true, lineStyle: { width: 0.5, color: '#46515F' } },
                splitLine: { show: false }
            },
            yAxis: {
                type: 'value', name: '', splitNumber: getAxisSplitNumber(chart.current, 3),
                axisLine: { show: true, lineStyle: { width: 0.5, color: '#46515F' } },
                axisLabel: {
                    color: '#AEB8C4',
                    fontSize: 9,
                    margin: 4,
                    hideOverlap: true,
                    formatter: (value) => formatPercentTick(value),
                },
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
            // Y 轴等分数依赖图表像素高度，resize 后必须重新出图才能生效
            renderCharts1()
            renderCharts2()
            renderNormal()
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
            const chartData = props.chartData.current
            const currentMetricPrefix = getPressureMetricDisplay(pressureMetricModeRef.current).valuePrefix
            const currentPointField = `${currentMetricPrefix}PointTotal`

            const select = getSelectArr()
            const displayType = getDisplayType()
            const disPlayDataRef = props.sitData.current

            const keyArr = Object.keys(chartData)
            let dataObj = {}
            if (keyArr.length) {
                const chartData = props.chartData.current
                for (let i = 0; i < keyArr.length; i++) {
                    const key = keyArr[i]
                    if (!dataObj[key]) dataObj[key] = {}

                    try {
                        const sysConfig = pointConfig[system]
                        if (!sysConfig || !sysConfig[key]) continue
                        const widthDistance = sysConfig[key].pointWidthDistance || 1
                        const heightDistance = sysConfig[key].pointHeightDistance || 1
                        dataObj[key].pointTotal = chartData[key].data[currentPointField] ?? chartData[key].data.areaTotal
                        const preciseAreaTotal = dataObj[key].pointTotal * widthDistance * heightDistance / 100
                        dataObj[key].areaTotal = Math.round(preciseAreaTotal)
                        dataObj[key].pressAver = formatMetricValue(chartData[key].data.pressAver)
                        dataObj[key].pressMax = chartData[key].data.pressMax
                        dataObj[key].pressTotal = chartData[key].data.pressTotal
                        dataObj[key].total = formatMetricValue(chartData[key].data.pressTotal ?? preciseAreaTotal * dataObj[key].pressAver)
                        dataObj[key].pressureAver = formatMetricValue(chartData[key].data.pressAver)
                        dataObj[key].pressureMax = formatMetricValue(chartData[key].data.pressMax)
                        dataObj[key].pressureTotal = formatMetricValue(chartData[key].data.pressureTotal)
                        dataObj[key].forceAver = formatMetricValue(chartData[key].data.forceAver)
                        dataObj[key].forceMax = formatMetricValue(chartData[key].data.forceMax)
                        dataObj[key].forceTotal = formatMetricValue(chartData[key].data.pressTotal)

                        const activeNormalDis = getNormalDistributionForMode(chartData[key].normalDis)
                        dataObj[key].μ = activeNormalDis?.μ
                        dataObj[key].Var = activeNormalDis?.Var
                        dataObj[key].Skew = activeNormalDis?.Skew
                        dataObj[key].Kurt = activeNormalDis?.Kurt

                        dataObj[key].pressureCenter = Object.values(chartData[key].center)

                        // 多框选统计数据
                        if (chartData[key].boxStats && chartData[key].boxStats.length > 0) {
                            dataObj[key].boxStats = chartData[key].boxStats.map((box, idx) => {
                                const bWidthDistance = widthDistance
                                const bHeightDistance = heightDistance
                                const boxPointTotal = box.data[currentPointField] ?? box.data.areaTotal ?? 0
                                const bPreciseArea = boxPointTotal * bWidthDistance * bHeightDistance / 100
                                const activeBoxNormalDis = getNormalDistributionForMode(box.normalDis)
                                return {
                                    colorIndex: box.colorIndex,
                                    bgc: box.bgc,
                                    name: formatSelectionName(box.name, idx + 1, props.t),
                                    pointTotal: boxPointTotal,
                                    areaTotal: Math.round(bPreciseArea),
                                    pressAver: formatMetricValue(box.data.pressAver),
                                    pressMax: box.data.pressMax || 0,
                                    pressTotal: box.data.pressTotal || 0,
                                    total: formatMetricValue(box.data.pressTotal ?? bPreciseArea * Number(box.data.pressAver || 0)),
                                    pressureAver: formatMetricValue(box.data.pressAver),
                                    pressureMax: formatMetricValue(box.data.pressMax),
                                    pressureTotal: formatMetricValue(box.data.pressureTotal),
                                    forceAver: formatMetricValue(box.data.forceAver),
                                    forceMax: formatMetricValue(box.data.forceMax),
                                    forceTotal: formatMetricValue(box.data.pressTotal),
                                    pressureCenter: getCenterValues(box.center) || ['-', '-'],
                                    normalDis: activeBoxNormalDis,
                                    μ: activeBoxNormalDis?.['\u03bc'],
                                    Var: activeBoxNormalDis?.Var,
                                    Skew: activeBoxNormalDis?.Skew,
                                    Kurt: activeBoxNormalDis?.Kurt,
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

    const system = getSysType()
    const pressDataArr = ['aver', 'max', 'total']
    const areaDataArr = ['pointTotal', 'areaTotal']
    const centerDataArr = ['pressureCenter']

    /**
     * 判断当前是否有多框选数据
     */
    const hasBoxStats = () => {
        const keys = Object.keys(data).filter(a => a !== 't')
        return keys.some(key => data[key]?.boxStats?.length > 0)
    }

    const hasSelectionStats = hasBoxStats()
    const metricDisplay = getPressureMetricDisplay(pressureMetricMode, t, i18n.language)
    const metricPrefix = metricDisplay.valuePrefix
    const normalDistTitle = String(i18n.language || '').toLowerCase().startsWith('en')
        ? `${metricDisplay.name} Normal Distribution`
        : `${metricDisplay.name}正态分布图`

    const getMetricValue = (source, item) => {
        if (item === 'total') return source?.forceTotal
        return source?.[`${metricPrefix}${item.charAt(0).toUpperCase()}${item.slice(1)}`]
    }
    const getMetricLabel = (item) => {
        if (item === 'aver') return metricDisplay.labels.average
        if (item === 'max') return metricDisplay.labels.max
        const fixedTotalLabel = t('forceTotal')
        return fixedTotalLabel && fixedTotalLabel !== 'forceTotal'
            ? fixedTotalLabel
            : (String(i18n.language || '').toLowerCase().startsWith('en') ? 'Total Force' : '压力总和')
    }

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
        return Object.keys(data).map((a) => {
            if (a !== 't') {
                return <div className='chartTypeItem' key={a}>
                    <div className='cirlce' style={{ backgroundColor: colorArr[a] }}></div> {t(a)}
                </div>
            }
            return null
        })
    }

    /**
     * 渲染数据行 — 多框选时每个框一行数据（颜色对应），否则按设备
     */
    const renderDataRow = (item, colorArr) => {
        const isPressureMetric = pressDataArr.includes(item)
        const getDisplayValue = (source) => isPressureMetric ? getMetricValue(source, item) : source?.[item]
        const getDisplayUnit = () => item === 'total' ? 'N' : isPressureMetric ? metricDisplay.unit : item === 'pointTotal' ? '个' : item === 'areaTotal' ? 'cm²' : ''
        if (hasBoxStats()) {
            // 多框选模式
            const allBoxRows = []
            Object.keys(data).filter(a => a !== 't').forEach(key => {
                if (data[key]?.boxStats) {
                    data[key].boxStats.forEach((box, idx) => {
                        const color = box.bgc || SELECT_COLORS[box.colorIndex]
                        const value = getDisplayValue(box) ?? '-'
                        allBoxRows.push(
                            <MetricValue
                                className="chartTypeItem"
                                key={`${key}-box-${box.colorIndex}-${item}`}
                                indicatorColor={color}
                                value={value}
                                unit={getDisplayUnit()}
                            />
                        )
                    })
                }
            })
            return allBoxRows
        }

        // 设备模式
        return Object.keys(data).map((a) => {
            if (a !== 't') {
                return <MetricValue
                    className="chartTypeItem"
                    key={`${a}-${item}`}
                    indicatorColor={colorArr[a]}
                    value={getDisplayValue(data[a]) ?? '-'}
                    unit={getDisplayUnit()}
                />
            }
            return null
        })
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
                            <div style={{ display: 'flex', fontVariantNumeric: 'tabular-nums' }}>
                                {`(${center[0]} , ${center[1]})`}
                            </div>
                        </div>
                    )
                })
            })
            return rows
        }

        return Object.keys(data).map((a) => {
            if (a !== 't') {
                return <div className='chartTypeItem' key={a}>
                    <div className='cirlce' style={{ backgroundColor: areaColorArr[a] }}></div>
                    <div style={{ display: 'flex', fontVariantNumeric: 'tabular-nums' }}>
                        {`(${data[a].pressureCenter[0]} , ${data[a].pressureCenter[1]})`}
                    </div>
                </div>
            }
            return null
        })
    }

    return (
        <>
            <DraggablePanel
                title={metricDisplay.curveLabel + ' / ' + t('areaCurve')}
                defaultPosition={{ x: 20, y: 80 }}
                className={`charts-panel${hasSelectionStats ? ' charts-panel--expanded' : ''}`}
            >
                <ChartPanel
                    className="chartAndDataContent"
                    title={metricDisplay.curveLabel}
                    actions={(
                        <Tooltip title={t('switchPressureMetric')}>
                            <Button
                                className="pressureMetricSwap"
                                type="text"
                                size="small"
                                icon={<SwapOutlined />}
                                aria-label={t('switchPressureMetric')}
                                onClick={() => useEquipStore.getState().setPressureMetricMode(metricDisplay.nextMode)}
                            />
                        </Tooltip>
                    )}
                    legend={renderLegend(pressColorArr)}
                >
                    <div ref={myChart1Dom} id="myChart1" className="chartCanvas" style={{ opacity: '0.8' }}></div>
                    {pressDataArr.map((item) => (
                        <div className='chartData' key={item}>
                            <span className="chartDataLabel">{getMetricLabel(item)}</span>
                            <div className={`chartTypeContent ${hasSelectionStats ? 'chartTypeContent--selection' : ''}`}>{renderDataRow(item, pressColorArr)}</div>
                        </div>
                    ))}
                </ChartPanel>

                <ChartPanel
                    className="chartAndDataContent"
                    title={t('areaCurve')}
                    legend={renderLegend(pressColorArr)}
                >
                    <div ref={myChart2Dom} id="myChart2" className="chartCanvas" style={{ opacity: '0.8' }}></div>
                    {areaDataArr.map((item) => (
                        <div className='chartData' key={item}>
                            <span className="chartDataLabel">{t(item)}</span>
                            <div className={`chartTypeContent ${hasSelectionStats ? 'chartTypeContent--selection' : ''}`}>{renderDataRow(item, areaColorArr)}</div>
                        </div>
                    ))}
                </ChartPanel>
            </DraggablePanel>

            <DraggablePanel title={t('pressureCenterCurve') + ' / ' + normalDistTitle} defaultPosition={{ right: 20, y: 80 }}>
                <ChartPanel
                    className="chartAndDataContent"
                    title={t('pressureCenterCurve')}
                    legend={renderLegend(areaColorArr)}
                >
                    <FootTrack ref={trackRef} />
                    <div style={{ marginBottom: '6px', color: '#E6EBF0', fontSize: '0.875rem' }}>{t('pressureCenter')}{`(X,Y)`}</div>
                    {centerDataArr.map((item) => (
                        <div className='chartData' key={item}>
                            <div className={`chartTypeContent ${hasSelectionStats ? 'chartTypeContent--selection' : ''}`} style={{ height: '1.2rem' }}>
                                {renderCenterRows()}
                            </div>
                        </div>
                    ))}
                </ChartPanel>

                <ChartPanel
                    className="chartAndDataContent"
                    title={normalDistTitle}
                    legend={renderLegend(areaColorArr)}
                >
                    <div className="normalChartWrap">
                        <div ref={normalChartDom} id="chart" className="normalChartCanvas"></div>
                    </div>
                </ChartPanel>
            </DraggablePanel>
        </>
    )
}

export default withTranslation('translation')(ChartsAside)
