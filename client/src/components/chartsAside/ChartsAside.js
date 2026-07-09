import React, { useContext, useEffect, useRef, useState } from 'react'

import echarts from '../../util/echarts';
import { Scheduler } from '../../scheduler/scheduler';
import './index.scss'
import { useTranslation, withTranslation } from 'react-i18next';
import { getMatrixDisplayLabel, getMatrixPartFromDisplayType, pointConfig } from '../../util/constant';
import { getDisplayType, getSelectArr, getSysType, useEquipStore } from '../../store/equipStore';
import { BrushManager, SELECT_COLORS } from '../selectBox/newSelecttBox';
import { calMatrixArea } from '../../assets/util/selectMatrix';
import { pageContext } from '../../page/test/Test';
import { shallow } from 'zustand/shallow';
import FootTrack from '../chart/Chart';
import { graCenter } from '../../util/util';
import DraggablePanel from '../draggablePanel/DraggablePanel';
import { formatSelectionName } from '../../util/selectionName';

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
    const historyChart = useEquipStore(s => s.historyChart, shallow)
    const historyChartRef = useRef(historyChart)

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
        const dataField = type === 'press' ? 'pressArr' : 'areaArr'
        const onlyBoxStats = !isHistory && useBoxStats && getBoxStats(props.chartData.current).length > 0

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
                        data: box[dataField] || [],
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
                    data: historyLine || dataMap[key],
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

    const getDeviceChartColor = (key, colorMap, index = 0) => {
        const colorKey = getMatrixPartFromDisplayType(key)
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
        const series = buildSeries(pressObj, 'press', true, isHistory)
        const xLength = Math.max(20, ...series.map(item => Array.isArray(item.data) ? item.data.length : 0))
        initCharts1({
            series,
            xData: Array.from({ length: xLength }, (_, i) => i + 1),
            myChart: myChart1.current,
            yMax: getChartYMax(value),
            xName: props.t('timeFrame'),
            yName: props.t('pressureTotalAxis'),
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
        const pressArrRaw = historyData && historyData.pressArr
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
                    areaObj[key] = chartData[key].pressArr
                    const boxValues = getBoxChartValues({ [key]: chartData[key] }, 'pressArr')
                    if (boxValues.length) {
                        allArr = allArr.concat(boxValues)
                    } else if (!onlyBoxStats) {
                        allArr = allArr.concat(chartData[key].pressArr)
                    }
                }
            }
            const max = allArr.length ? Math.max(...allArr) : 0
            handleCharts(areaObj, max, !!useHistory)
        }
    }

    function renderCharts2() {
        const historyData = historyChartRef.current
        const areaArrRaw = historyData && historyData.areaArr
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
                    areaObj[key] = chartData[key].areaArr
                    const boxValues = getBoxChartValues({ [key]: chartData[key] }, 'areaArr')
                    if (boxValues.length) {
                        allArr = allArr.concat(boxValues)
                    } else if (!onlyBoxStats) {
                        allArr = allArr.concat(chartData[key].areaArr)
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
        const xData = Array.from({ length: 256 }, (_, i) => i);

        let series = [], Xmax = 0
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
            const xDataRes = xData.map((x, idx) => [x, item.normalDis?.yData?.[idx] || 0])
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
        }

        const pressureValueLabel = props.t('pressureValue') || '压力值'
        const probabilityDensityLabel = props.t('probabilityDensity') || '概率密度'
        chart.current.setOption({
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
                        text: `${pressureValueLabel}(ADC)`,
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
                    return `${pressureValueLabel}(ADC)：${value[0]}<br/>${probabilityDensityLabel}(%)：${(value[1] * 100).toFixed(2)}`;
                }
            },
            xAxis: {
                type: 'value', min: 0, max: 255,
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
            const chartData = props.chartData.current

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

    const system = getSysType()
    const pressDataArr = ['pressAver', 'pressMax', 'total']
    const areaDataArr = ['pointTotal', 'areaTotal']
    const centerDataArr = ['pressureCenter']
    const pressureMetricKeys = new Set(['pressAver', 'pressMax', 'total'])

    const formatMetricValue = (item, value) => {
        if (value === undefined || value === null || value === '') return '-'
        if (!pressureMetricKeys.has(item)) return value
        const numeric = Number(value)
        return Number.isFinite(numeric) ? numeric.toFixed(1) : value
    }

    /**
     * 判断当前是否有多框选数据
     */
    const hasBoxStats = () => {
        const keys = Object.keys(data).filter(a => a !== 't')
        return keys.some(key => data[key]?.boxStats?.length > 0)
    }

    const hasSelectionStats = hasBoxStats()

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
                    <div className='cirlce' style={{ backgroundColor: getDeviceChartColor(a, colorArr) }}></div> {getDeviceChartLabel(a)}
                </div>
            }
            return null
        })
    }

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
                                        {system === 'carY' ? '' : (item === 'total' ? 'N' : item === 'pointTotal' ? '个' : item === 'areaTotal' ? 'cm²' : 'Kpa')}
                                    </span>
                                </div>
                            </div>
                        )
                    })
                }
            })
            return allBoxRows
        }

        // 设备模式
        return Object.keys(data).map((a) => {
            if (a !== 't') {
                return <div className='chartTypeItem' key={`${a}-${item}`}>
                    <div className='cirlce' style={{ backgroundColor: getDeviceChartColor(a, colorArr) }}></div>
                    <div className='chartMetricValueGroup'>
                        <span className='chartMetricValue'>{formatMetricValue(item, data[a][item])}</span>
                        <span className='chartMetricUnit'>
                            {system === 'carY' ? '' : (item === 'total' ? 'N' : item === 'pointTotal' ? '个' : item === 'areaTotal' ? 'cm²' : 'Kpa')}
                        </span>
                    </div>
                </div>
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
                            <div className="chartCenterValue">
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
                    <div className='cirlce' style={{ backgroundColor: getDeviceChartColor(a, areaColorArr) }}></div>
                    <div className="chartCenterValue">
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
                title={t('pressureCurve') + ' / ' + t('areaCurve')}
                defaultPosition={{ x: 20, y: 80 }}
                className={`charts-panel${hasSelectionStats ? ' charts-panel--expanded' : ''}`}
            >
                <div className='chartAndDataContent'>
                    <div className="chartTitle">
                        <div className="chartName">{t('pressureCurve')}</div>
                        <div className="chartType">{renderLegend(pressColorArr)}</div>
                    </div>
                    <div ref={myChart1Dom} id="myChart1" className="chartCanvas" style={{ opacity: '0.8' }}></div>
                    {pressDataArr.map((item) => (
                        <div className='chartData' key={item}>
                            <span className="chartDataLabel">{t(item)}</span>
                            <div className={`chartTypeContent ${hasSelectionStats ? 'chartTypeContent--selection' : ''}`}>{renderDataRow(item, pressColorArr)}</div>
                        </div>
                    ))}
                </div>

                <div className='chartAndDataContent'>
                    <div className="chartTitle">
                        <div className="chartName">{t('areaCurve')}</div>
                        <div className="chartType">{renderLegend(pressColorArr)}</div>
                    </div>
                    <div ref={myChart2Dom} id="myChart2" className="chartCanvas" style={{ opacity: '0.8' }}></div>
                    {areaDataArr.map((item) => (
                        <div className='chartData' key={item}>
                            <span className="chartDataLabel">{t(item)}</span>
                            <div className={`chartTypeContent ${hasSelectionStats ? 'chartTypeContent--selection' : ''}`}>{renderDataRow(item, areaColorArr)}</div>
                        </div>
                    ))}
                </div>
            </DraggablePanel>

            <DraggablePanel title={t('pressureCenterCurve') + ' / ' + t('pressureNormalDist')} defaultPosition={{ right: 20, y: 80 }}>
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
