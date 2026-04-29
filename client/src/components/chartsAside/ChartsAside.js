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
import DraggablePanel from '../draggablePanel/DraggablePanel';

function ChartsAside(props) {

    // 进入框选工具时把两个面板自动折叠
    const pageInfo = useContext(pageContext)
    const onSelect = pageInfo?.onSelect ?? false

    // 设备颜色（无框选时使用）
    const pressColorArr = { back: '#8AC287', sit: '#5D65FF' }
    const areaColorArr = { back: '#8AC287', sit: '#5D65FF' }

    const myChart1 = useRef()
    const myChart2 = useRef()
    const chart = useRef()
    const trackRef = useRef()

    const [data, setData] = useState({})
    const historyChart = useEquipStore(s => s.historyChart, shallow)
    const historyChartRef = useRef(historyChart)

    useEffect(() => {
        historyChartRef.current = historyChart
        if (historyChart) {
            renderCharts1()
            renderCharts2()
        }
    }, [historyChart])

    /**
     * 构建 ECharts series 数组
     * 当有多框选时，每个框一条线（颜色与框对应）
     * 无框选时，按设备（back/sit）分色
     */
    const buildSeries = (dataMap, type, useBoxStats) => {
        const series = []
        const keyArr = Object.keys(dataMap)
        const colorMap = type === 'press' ? pressColorArr : areaColorArr
        const dataField = type === 'press' ? 'pressArr' : 'areaArr'

        for (let i = 0; i < keyArr.length; i++) {
            const key = keyArr[i]
            const chartData = props.chartData.current
            const deviceData = chartData[key]
            if (!deviceData) continue

            // 检查是否有多框选统计
            const boxStats = deviceData.boxStats
            if (useBoxStats && boxStats && boxStats.length > 0) {
                // 多框选模式：每个框一条线
                for (let b = 0; b < boxStats.length; b++) {
                    const box = boxStats[b]
                    series.push({
                        symbol: 'none',
                        data: box[dataField] || [],
                        type: 'line',
                        smooth: true,
                        color: box.bgc || SELECT_COLORS[box.colorIndex] || SELECT_COLORS[b],
                        lineStyle: { width: 2 },
                        name: `框${b + 1}${keyArr.length > 1 ? `-${key}` : ''}`,
                    })
                }
            } else {
                // 无框选模式：按设备分色
                const colorKey = key.includes('back') ? 'back' : key.includes('sit') ? 'sit' : key
                const color = colorMap[colorKey] || Object.values(colorMap)[i]
                series.push({
                    symbol: 'none',
                    data: dataMap[key],
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

    const initCharts1 = (props) => {
        let option = {
            animation: false,
            grid: { x: 10, x2: 10, y: 10, y2: 10 },
            xAxis: {
                type: 'category',
                show: false,
                splitLine: { show: false },
                data: props.xData,
                axisLabel: { show: false },
            },
            yAxis: {
                type: 'value',
                show: false,
                splitLine: { show: false },
                max: props.yMax,
                axisLabel: { show: false },
            },
            series: props.series
        };
        option && props.myChart.setOption(option, { notMerge: true });
    };

    const handleCharts = (pressObj, value) => {
        if (!myChart1.current) return
        const series = buildSeries(pressObj, 'press', true)
        initCharts1({
            series,
            xData: Array.from({ length: 20 }, (_, i) => i + 1),
            myChart: myChart1.current,
            yMax: value,
        });
    }

    const handleChartsArea = (areaObj, value) => {
        if (!myChart2.current) return
        const series = buildSeries(areaObj, 'area', true)
        initCharts1({
            series,
            xData: Array.from({ length: 20 }, (_, i) => i + 1),
            myChart: myChart2.current,
            yMax: value,
        });
    }

    function renderCharts1() {
        const historyData = historyChartRef.current
        const pressArrRaw = historyData && historyData.pressArr
        const pressArr = Array.isArray(pressArrRaw) ? { back: pressArrRaw } : pressArrRaw
        const useHistory = pressArr && Object.keys(pressArr).length

        const chartData = useHistory ? pressArr : props.chartData.current
        const keyArr = Object.keys(chartData)
        let areaObj = {}
        let allArr = []
        if (keyArr.length) {
            for (let i = 0; i < keyArr.length; i++) {
                const key = keyArr[i]
                if (useHistory) {
                    areaObj[key] = chartData[key]
                    allArr = allArr.concat(chartData[key])
                } else {
                    areaObj[key] = chartData[key].pressArr
                    allArr = allArr.concat(chartData[key].pressArr)
                }
            }
            const max = Math.max(...allArr)
            handleCharts(areaObj, max + 5000)
        }
    }

    function renderCharts2() {
        const historyData = historyChartRef.current
        const areaArrRaw = historyData && historyData.areaArr
        const areaArr = Array.isArray(areaArrRaw) ? { back: areaArrRaw } : areaArrRaw
        const useHistory = areaArr && Object.keys(areaArr).length

        const chartData = useHistory ? areaArr : props.chartData.current
        const keyArr = Object.keys(chartData)
        let areaObj = {}
        let allArr = []
        if (keyArr.length) {
            for (let i = 0; i < keyArr.length; i++) {
                const key = keyArr[i]
                if (useHistory) {
                    areaObj[key] = chartData[key]
                    allArr = allArr.concat(chartData[key])
                } else {
                    areaObj[key] = chartData[key].areaArr
                    allArr = allArr.concat(chartData[key].areaArr)
                }
            }
            const max = Math.max(...allArr)
            handleChartsArea(areaObj, 3200)
        }
    }

    const renderCenter = () => {
        const chartData = props.chartData.current
        const keys = Object.keys(chartData)
        if (!keys.length) return
        const centerArr = []
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i]
            centerArr.push(Object.values(chartData[key].center))
        }
        trackRef.current?.circleMove(...centerArr);
    }

    const renderNormal = () => {
        const chartData = props.chartData.current
        const keys = Object.keys(chartData)
        if (!keys.length) return
        const xData = Array.from({ length: 256 }, (_, i) => i);

        let series = [], Xmax = 0
        for (let i = 0; i < keys.length; i++) {
            let color = Object.values(pressColorArr)[i]
            const key = keys[i]
            const xDataRes = xData.map((x, idx) => [x, chartData[key].normalDis.yData[idx]])
            series.push({
                symbol: 'none',
                data: xDataRes,
                type: 'line',
                showSymbol: false,
                color: color,
            })
            Xmax = Math.max(Xmax, ...xDataRes.map((a) => a[1]))
        }

        chart.current.setOption({
            grid: { x: 35, x2: 10, y: 30, y2: 20 },
            title: { left: 'center' },
            tooltip: {
                trigger: 'axis',
                formatter: p => {
                    const { value } = p[0];
                    return `灰度值: ${value[0]}<br>(概率密度): ${value[1].toFixed(6)}`;
                }
            },
            xAxis: {
                type: 'value', min: 0, max: 255,
                name: '灰度值 (0–255)', splitNumber: 5,
                axisTick: { lineStyle: { width: 0.5 } },
                splitLine: { lineStyle: { width: 0.5, color: '#32373E' } }
            },
            yAxis: {
                type: 'value', name: '概率密度', splitNumber: 3,
                axisLabel: { formatter: (value) => value * 100 + '%' },
                axisTick: { lineStyle: { width: 0.5, color: '#32373E' } },
                splitLine: { lineStyle: { width: 0.5, color: '#32373E' } },
                scale: false,
            },
            series: series
        }, { notMerge: true });
    }

    useEffect(() => {
        myChart1.current = echarts.init(document.getElementById(`myChart1`))
        myChart2.current = echarts.init(document.getElementById(`myChart2`))
        chart.current = echarts.init(document.getElementById('chart'));

        Scheduler.onRender(renderCharts1)
        Scheduler.onRender(renderCharts2)
        Scheduler.onRender(renderCenter)
        Scheduler.onRender(renderNormal)

        let data = {}

        Scheduler.onUI(() => setData(() => {
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
                        dataObj[key].pressAver = Number(chartData[key].data.pressAver || 0).toFixed(2)
                        dataObj[key].pressMax = chartData[key].data.pressMax
                        dataObj[key].pressMin = chartData[key].data.pressMin
                        dataObj[key].pressTotal = chartData[key].data.pressTotal
                        dataObj[key].total = (preciseAreaTotal * dataObj[key].pressAver / 10).toFixed(2)

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
                                    pointTotal: box.data.areaTotal || 0,
                                    areaTotal: Math.round(bPreciseArea),
                                    pressAver: Number(box.data.pressAver || 0).toFixed(2),
                                    pressMax: box.data.pressMax || 0,
                                    pressMin: box.data.pressMin || 0,
                                    pressTotal: box.data.pressTotal || 0,
                                    total: (bPreciseArea * Number(box.data.pressAver || 0) / 10).toFixed(2),
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

    }, [])

    const { t, i18n } = useTranslation()

    const system = getSysType()
    const pressDataArr = system === 'carY' ? ['pressAver', 'pressMax', 'pressTotal'] : ['pressAver', 'pressMax', 'pressMin', 'total']
    const areaDataArr = ['pointTotal', 'areaTotal']
    const centerDataArr = ['pressureCenter']

    /**
     * 判断当前是否有多框选数据
     */
    const hasBoxStats = () => {
        const keys = Object.keys(data).filter(a => a !== 't')
        return keys.some(key => data[key]?.boxStats?.length > 0)
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
                    {`框选${box.colorIndex + 1}`}
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
        if (hasBoxStats()) {
            // 多框选模式
            const allBoxRows = []
            Object.keys(data).filter(a => a !== 't').forEach(key => {
                if (data[key]?.boxStats) {
                    data[key].boxStats.forEach((box, idx) => {
                        const color = box.bgc || SELECT_COLORS[box.colorIndex]
                        const value = box[item] != null ? box[item] : '-'
                        allBoxRows.push(
                            <div className='chartTypeItem' key={`${key}-box-${box.colorIndex}-${item}`}>
                                <div className='cirlce' style={{ backgroundColor: color }}></div>
                                <div style={{ width: '4rem', display: 'flex', justifyContent: 'flex-end' }}>
                                    <span style={{ fontVariantNumeric: 'tabular-nums', minWidth: '2.8rem', textAlign: 'right', display: 'inline-block' }}>{value}</span>
                                    <span style={{ width: '1.6rem', textAlign: 'left', flexShrink: 0 }}>
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
                    <div className='cirlce' style={{ backgroundColor: colorArr[a] }}></div>
                    <div style={{ width: '4rem', display: 'flex', justifyContent: 'flex-end' }}>
                        <span style={{ fontVariantNumeric: 'tabular-nums', minWidth: '2.8rem', textAlign: 'right', display: 'inline-block' }}>{data[a][item]}</span>
                        <span style={{ width: '1.6rem', textAlign: 'left', flexShrink: 0 }}>
                            {system === 'carY' ? '' : (item === 'total' ? 'N' : item === 'pointTotal' ? '个' : item === 'areaTotal' ? 'cm²' : 'Kpa')}
                        </span>
                    </div>
                </div>
            }
            return null
        })
    }

    return (
        <>
            <DraggablePanel title={t('pressureCurve') + ' / ' + t('areaCurve')} defaultPosition={{ x: 20, y: 80 }} collapsed={onSelect}>
                <div className='chartAndDataContent'>
                    <div className="chartTitle">
                        <div className="chartName">{t('pressureCurve')}</div>
                        <div className="chartType">{renderLegend(pressColorArr)}</div>
                    </div>
                    <canvas id="myChart1" style={{ height: `7.5rem`, width: '18.35rem', opacity: '0.8' }}></canvas>
                    {pressDataArr.map((item) => (
                        <div className='chartData' key={item}>
                            {t(item)}
                            <div className='chartTypeContent'>{renderDataRow(item, pressColorArr)}</div>
                        </div>
                    ))}
                </div>

                <div className='chartAndDataContent'>
                    <div className="chartTitle">
                        <div className="chartName">{t('areaCurve')}</div>
                        <div className="chartType">{renderLegend(areaColorArr)}</div>
                    </div>
                    <canvas id="myChart2" style={{ height: `7.5rem`, width: '18.35rem', opacity: '0.8' }}></canvas>
                    {areaDataArr.map((item) => (
                        <div className='chartData' key={item}>
                            {t(item)}
                            <div className='chartTypeContent'>{renderDataRow(item, areaColorArr)}</div>
                        </div>
                    ))}
                </div>
            </DraggablePanel>

            <DraggablePanel title={t('pressureCenterCurve') + ' / ' + t('pressureNormalDist')} defaultPosition={{ x: window.innerWidth - 380, y: 80 }} collapsed={onSelect} className='pressure-center-panel'>
                <div className='chartAndDataContent'>
                    <div className="chartTitle">
                        <div className="chartName">{t('pressureCenterCurve')}</div>
                        <div className="chartType">
                            {Object.keys(data).map((a) => {
                                if (a !== 't') {
                                    return <div className='chartTypeItem' key={a}><div className='cirlce' style={{ backgroundColor: areaColorArr[a] }}></div> {t(a)}</div>
                                }
                                return null
                            })}
                        </div>
                    </div>
                    <FootTrack ref={trackRef} />
                    <div style={{ marginBottom: '6px', color: '#E6EBF0', fontSize: '0.875rem' }}>{t('pressureCenter')}{`(X,Y)`}</div>
                    {centerDataArr.map((item) => (
                        <div className='chartData' key={item}>
                            <div className='chartTypeContent' style={{ height: '1.2rem' }}>
                                {Object.keys(data).map((a) => {
                                    if (a !== 't') {
                                        return <div className='chartTypeItem' key={a}>
                                            <div className='cirlce' style={{ backgroundColor: areaColorArr[a] }}></div>
                                            <div style={{ display: 'flex', fontVariantNumeric: 'tabular-nums' }}>
                                                {`(${data[a][item][0]} , ${data[a][item][1]})`}
                                            </div>
                                        </div>
                                    }
                                    return null
                                })}
                            </div>
                        </div>
                    ))}
                </div>

                <div className='chartAndDataContent'>
                    <div className="chartTitle">
                        <div className="chartName">{t('pressureNormalDist')}</div>
                        <div className="chartType">
                            {Object.keys(data).map((a) => {
                                if (a !== 't') {
                                    return <div className='chartTypeItem' key={a}><div className='cirlce' style={{ backgroundColor: areaColorArr[a] }}></div> {t(a)}</div>
                                }
                                return null
                            })}
                        </div>
                    </div>
                    <div style={{ margin: '1.5rem 0 1.2rem' }}>
                        <canvas id="chart" style={{ height: `9.5rem`, width: '18.35rem' }}></canvas>
                    </div>
                </div>
            </DraggablePanel>
        </>
    )
}

export default withTranslation('translation')(ChartsAside)
