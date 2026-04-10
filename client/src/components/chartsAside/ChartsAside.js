import React, { useContext, useEffect, useRef, useState } from 'react'
import Drawer from '../Drawer/Drawer'

import echarts from '../../util/echarts';
import { Scheduler } from '../../scheduler/scheduler';
import './index.scss'
import { useTranslation, withTranslation } from 'react-i18next';
import { pointConfig } from '../../util/constant';
import { getDisplayType, getSelectArr, getSysType, useEquipStore } from '../../store/equipStore';
import { BrushManager } from '../selectBox/newSelecttBox';
import { calMatrixArea } from '../../assets/util/selectMatrix';
import { pageContext } from '../../page/test/Test';
import { shallow } from 'zustand/shallow';
import FootTrack from '../chart/Chart';
import { graCenter } from '../../util/util';
import DraggablePanel from '../draggablePanel/DraggablePanel';

function ChartsAside(props) {

    const pressColorArr = { back: '#8AC287', sit: '#5D65FF' }
    const areaColorArr = { back: '#8AC287', sit: '#5D65FF' }

    const [show, setShow] = useState(true)

    const myChart1 = useRef()
    const myChart2 = useRef()
    const chart = useRef()
    const myChart3 = useRef()
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

    // console.log(props.sitData)


    // useEffect(() => {

    // } , [])

    const initCharts1 = (props) => {
        let series = []
        // if(Object.keys(props.yData).length == 1){
        //     series
        // }
        const keyArr = Object.keys(props.yData)
        let areaStyle, color
        for (let i = 0; i < keyArr.length; i++) {
            const key = keyArr[i]

            // 根据 key 名称匹配颜色，而非索引（修复回放只有单个 key 时颜色不一致）
            const colorKey = key.includes('back') ? 'back' : key.includes('sit') ? 'sit' : key
            if (props.type == 'press') {
                color = pressColorArr[colorKey] || Object.values(pressColorArr)[i]
                if (colorKey == 'sit') {

                    areaStyle = {
                        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: 'rgba(65, 156, 220, 1)' },
                            { offset: 0.4, color: ' rgba(35, 26, 144, 0.29)' },
                            { offset: 1, color: 'rgba(26, 28, 32, 0)' }
                        ])
                    }



                } else {
                    areaStyle = {
                        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: 'rgba(63, 211, 228, 1)' },
                            { offset: 0.65, color: 'rgba(39, 117, 143, 0.26)' },
                            { offset: 1, color: 'rgba(26, 28, 32, 0)' }
                        ])
                    }

                    // color = '#2DBCC1'
                }
            } else {
                color = areaColorArr[colorKey] || Object.values(areaColorArr)[i]

                if (colorKey == 'sit') {

                    areaStyle = {
                        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: 'rgba(208, 220, 235, 0.94)' },
                            { offset: 0.4, color: '  rgba(120, 141, 167, 0.28)' },
                            { offset: 1, color: 'rgba(26, 28, 32, 0)' }
                        ])
                    }



                } else {
                    areaStyle = {
                        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: 'rgba(216, 154, 234, 0.8)' },
                            { offset: 0.65, color: ' rgba(50, 47, 188, 0.29)' },
                            { offset: 1, color: 'rgba(26, 28, 32, 0)' }
                        ])
                    }

                    // color = '#2DBCC1'
                }
            }




            series.push({
                symbol: "none",
                data: props.yData[key],
                type: "line",
                smooth: true,
                color: color,
                // areaStyle: areaStyle
            })
        }

        let option = {
            animation: false,
            // tooltip: {
            //   trigger: "axis",
            //   show: "true",
            // },
            grid: {
                x: 10,
                x2: 10,
                y: 10,
                y2: 10,
            },
            xAxis: {
                type: "category",
                show: false,
                splitLine: {
                    show: false,

                },
                data: props.xData,
                axisLabel: {
                    show: false,

                },
            },

            yAxis: {
                type: "value",
                show: false,
                splitLine: {
                    show: false,
                },
                max: props.yMax,
                axisLabel: {
                    show: false,

                },
            },
            series: series
        };
        option && props.myChart.setOption(option);

    };

    const handleCharts = (arr, value) => {

        if (myChart1.current) {

            initCharts1({
                yData: arr,
                xData: [
                    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
                    20,
                ],
                index: 0 + 1,
                name: "中风",
                myChart: myChart1.current,
                yMax: value,
                type: 'press'
            });
        }
    }

    const handleChartsArea = (arr, value) => {
        if (myChart1.current) {
            initCharts1({
                yData: arr,
                xData: [
                    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
                    20,
                ],
                index: 0 + 1,
                name: "中风",
                myChart: myChart2.current,
                yMax: value,
                type: 'area'
            });
        }
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

        // if (Object.keys(props.chartData.current).length) {
        //     const max = Math.max(...props.chartData.current.bed.pressArr)
        //     handleCharts(props.chartData.current.bed.pressArr, max + 30)
        // }

        // console.log(props.chartData.current.bed.areaArr)
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

        // console.log(props.chartData.current.bed.areaArr)
    }

    function changeData() {
        setData(() => props.chartData.current.bed.data)
    }

    function colSelectMatrix(className, select) {

        // console.log(className, select)
        if (!select) return
        const canvas = document.querySelector(`.${className}`)
        const canvasInfo = canvas.getBoundingClientRect()

        const canvasObj = {
            canvasX1: canvasInfo.left, canvasX2: canvasInfo.right,
            canvasY1: canvasInfo.top, canvasY2: canvasInfo.bottom
        }

        const selectObj = {
            selectX1: select.x1, selectX2: select.x2,
            selectY1: select.y1, selectY2: select.y2
        }



        const matrix = calMatrixArea(canvasObj, selectObj)

        return matrix

    }

    const pageInfo = useContext(pageContext);
    const { display, onRuler, setOnRuler, onSelect, setOnSelect } = pageInfo


    const displayRef = useRef()
    useEffect(() => {
        displayRef.current = display
    }, [display])

    const select = useEquipStore(s => s.select, shallow);

    const renderCenter = () => {

        // const 
        const chartData = props.chartData.current

        const keys = Object.keys(chartData)
        if (!keys.length) return
        const centerArr = []

        for (let i = 0; i < keys.length; i++) {
            const key = keys[i]
            centerArr.push(Object.values(chartData[key].center))
        }

        // if (!props.sitData.current.back || !props.sitData.current.back.length) return
        // const arrSmooth = graCenter(props.sitData.current.back, 50, 64)
        // const arrSmooth1 = graCenter(props.sitData.current.sit, 45, 45)

        trackRef.current?.circleMove(
            // Object.values(arrSmooth),
            // Object.values(arrSmooth1)
            ...centerArr
        );
    }

    const renderNormal = () => {

        const chartData = props.chartData.current
        const keys = Object.keys(chartData)
        if (!keys.length) return
        const xData = Array.from({ length: 256 }, (_, i) => i);


        // if (keyArr.length) {

        //     const chartData = props.chartData.current
        //     for (let i = 0; i < keyArr.length; i++) {
        //         const key = keyArr[i]
        //         areaObj[key] = chartData[key].areaArr
        //         allArr = allArr.concat(chartData[key].areaArr)
        //     }

        //     const max = Math.max(...allArr)

        //     handleChartsArea(areaObj, 3200)
        // }

        // const yData = chartData['sit'].normalDis.yData
        let series = [], Xmax = 0
        for (let i = 0; i < keys.length; i++) {
            let color = Object.values(pressColorArr)[i]
            const key = keys[i]
            const xDataRes = xData.map((x, i) => [x, chartData[key].normalDis.yData[i]])
            series.push({
                symbol: "none",
                data: xDataRes,
                type: "line",
                // smooth: true,
                showSymbol: false,
                color: color,
                // areaStyle: areaStyle
            })
            // console.log(xDataRes)

            Xmax = Math.max(Xmax, ...xDataRes.map((a) => a[1]))

        }
        const ChartMax = Number((Xmax).toFixed(2))

        // chart.current.clear();
        chart.current.setOption({
            grid: {
                x: 35,
                x2: 10,
                y: 30,
                y2: 20,
            },
            title: {
                // text: `正态分布曲线`,
                left: 'center'
            },
            tooltip: {
                trigger: 'axis',
                formatter: p => {
                    const { value } = p[0];
                    return `灰度值: ${value[0]}<br>(概率密度): ${value[1].toFixed(6)}`;
                }
            },
            xAxis: {
                type: 'value',
                min: 0,
                max: 255,
                name: '灰度值 (0–255)',
                splitNumber: 5,
                axisTick: {
                    lineStyle: {
                        width: 0.5         // 刻度线细一点
                    }
                },
                splitLine: {
                    lineStyle: {
                        width: 0.5,        // 网格线细一点
                        color: '#32373E'
                    }
                }
            },
            yAxis: {
                type: 'value',
                name: '概率密度',
                splitNumber: 3,        // 纵轴分成四个刻度
                // axisLine: {
                //     lineStyle: {
                //         width: 0.5,        // 网格线细一点
                //         color: '#32373E'
                //     }
                // },
                // max  :0.1,
                axisLabel: {
                    formatter: (value) => {
                        return value * 100 + '%'
                    }
                },
                axisTick: {
                    lineStyle: {
                        width: 0.5,        // 网格线细一点
                        color: '#32373E'
                    }
                },
                splitLine: {
                    lineStyle: {
                        width: 0.5,        // 网格线细一点
                        color: '#32373E'
                    }
                },
                // max : ChartMax + 0.1
                // max: v => v.max * 1.05,
                scale: false,
            },
            series: series

            // [{
            //     name: '正态分布',
            //     type: 'line',
            //     smooth: true,
            //     symbol: 'none',
            //     lineStyle: { width: 2 },
            //     data: xData.map((x, i) => [x, yData[i]])
            // }]
        }, { notMerge: true });
    }

    useEffect(() => {


        myChart1.current = echarts.init(document.getElementById(`myChart1`))
        myChart2.current = echarts.init(document.getElementById(`myChart2`))
        chart.current = echarts.init(document.getElementById('chart'));
        // myChart3.current = echarts.init(document.getElementById(`myChart3`))

        Scheduler.onRender(renderCharts1)
        Scheduler.onRender(renderCharts2)
        Scheduler.onRender(renderCenter)
        Scheduler.onRender(renderNormal)
        // const chartData = props.chartData.current
        // const keyArr = Object.keys(chartData)
        // const dataStateObj = {}
        // if (keyArr.length) {
        //     for (let i = 0; i < keyArr.length; i++) {
        //         const key = keyArr[i]
        //         const dataKeyArr = Object.keys(chartData[key].data)
        //         for(let i = 0 ; i < dataKeyArr.length ; i++){
        //             const dataKey = dataKeyArr[i]
        //             if(!dataStateObj[dataKey]) dataStateObj[dataKey] = []
        //             dataStateObj[dataKey] .push(chartData[key].data[dataKey])
        //         }
        //     }
        // }


        let data = {}


        Scheduler.onUI(() => setData(() => {
            const system = getSysType()
            const chartData = props.chartData.current


            const select = getSelectArr()
            const displayType = getDisplayType()
            const disPlayDataRef = props.sitData.current

            // let arr = {}
            // const keyArr = Object.keys(disPlayDataRef)
            // for (let i = 0; i < keyArr.length; i++) {

            //     const key = keyArr[i].includes('-') ? keyArr[i].split('-')[1] : keyArr[i]
            //     const widthDistance = pointConfig[system][key].pointWidthDistance
            //     const heightDistance = pointConfig[system][key].pointHeightDistance
            //     if (!disPlayDataRef[keyArr[i]]) continue
            //     arr[key] = disPlayDataRef[keyArr[i]]

            //     if (!data[key]) data[key] = {}
            //     // if (!data[key].areaArr) data[key].areaArr = []
            //     // if (!data[key].pressArr) data[key].pressArr = []
            //     // if (!data[key].data) data[key].data = {}

            //     const area = arr[key].filter((a) => a > 0).length
            //     const press = arr[key].reduce((a, b) => a + b, 0)
            //     // if (data[key].areaArr.length < 20) {
            //     //     data[key].areaArr.push(area)
            //     // } else {
            //     //     data[key].areaArr.shift()
            //     //     data[key].areaArr.push(area)
            //     // }

            //     // if (data[key].pressArr.length < 20) {
            //     //     data[key].pressArr.push(press)
            //     // } else {
            //     //     data[key].pressArr.shift()
            //     //     data[key].pressArr.push(press)
            //     // }

            //     data[key].pressTotal = press
            //     data[key].areaTotal = area * widthDistance * heightDistance
            //     data[key].pressMax = Math.max(...arr[key])
            //     data[key].pressAver = (press / area).toFixed(2)
            //     data[key].pointTotal = area

            // }




            // console.log(data)
            //  console.log(getSelectArr() ,select )
            // if (displayRef.current == 'num') {
            //     const matrix = colSelectMatrix('canvasThree', select[0])
            //     console.log(matrix)
            // }

            // console.log(props.chartData.current)

            const keyArr = Object.keys(chartData)
            let dataObj = {}
            // let allArr = []
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
                    // dataObj[key].pressTotal = chartData[key].data.pressTotal
                    dataObj[key].pressAver = Number(chartData[key].data.pressAver || 0).toFixed(2)
                    dataObj[key].pressMax = chartData[key].data.pressMax
                    dataObj[key].pressMin = chartData[key].data.pressMin
                    dataObj[key].pressTotal = chartData[key].data.pressTotal

                    dataObj[key].total = (preciseAreaTotal * dataObj[key].pressAver / 10).toFixed(2) //chartData[key].data.total



                    dataObj[key].μ = chartData[key].normalDis.μ
                    dataObj[key].Var = chartData[key].normalDis.Var
                    dataObj[key].Skew = chartData[key].normalDis.Skew
                    dataObj[key].Kurt = chartData[key].normalDis.Kurt


                    // const chartData = props.chartData.current

                    // const keys = Object.keys(chartData)
                    // if (!keys.length) return
                    // const centerArr = []

                    // for (let i = 0; i < keys.length; i++) {
                    //     const key = keys[i]
                    //     centerArr.push(Object.values(chartData[key].center))
                    // }

                    dataObj[key].pressureCenter = Object.values(chartData[key].center)

                    // if (!props.sitData.current.back || !props.sitData.current.back.length) return
                    // const arrSmooth = graCenter(props.sitData.current[key], 50, 64)
                    // const arrSmooth1 = graCenter(props.sitData.current[key], 45, 45)

                    // trackRef.current?.circleMove({
                    //     arrSmooth: Object.values(arrSmooth),
                    //     arrSmooth1: Object.values(arrSmooth1)
                    // });


                    // allArr = allArr.concat(chartData[key].area)
                    } catch (e) { continue }
                }
                // console.log(areaObj)
                // const max = Math.max(...allArr)

                // handleChartsArea(areaObj, max + 30)
            }
            return { ...dataObj, t: Date.now() }
        })
        )


    }, [])

    const { t, i18n } = useTranslation()


    // 根据系统类型决定展示内容
    const system = getSysType()
    const pressDataArr = system === 'carY' ? ['pressAver', 'pressMax', 'pressTotal'] : ['pressAver', 'pressMax', 'pressMin', 'total']
    const areaDataArr = ['pointTotal', 'areaTotal',]

    const centerDataArr = ['pressureCenter']
    const normalDataArr = ['μ', 'Var', 'Skew', 'Kurt']

    return (
        // <Drawer direction='left' show={show} asideClose setShow={setShow} title={'数据'} >

        <>
            <DraggablePanel title={t('pressureCurve') + ' / ' + t('areaCurve')} defaultPosition={{ x: 20, y: 80 }}>
                <div className='chartAndDataContent'>
                    <div className="chartTitle">
                        <div className="chartName">
                            {t('pressureCurve')}
                        </div>
                        <div className="chartType">
                            {
                                Object.keys(data).map((a, index) => {
                                    if (a != 't') {
                                        return <div className='chartTypeItem'><div className='cirlce' style={{ backgroundColor: pressColorArr[a] }}></div> {t(a)}</div>
                                    }
                                })
                            }
                        </div>


                    </div>

                    <canvas id="myChart1" style={{ height: `7.5rem`, width: '18.35rem', opacity: '0.8' }}></canvas>


                    {
                        pressDataArr.map((item) => {
                            return (
                                <div className='chartData'>
                                    {t(item)}
                                    <div className='chartTypeContent'>{
                                        Object.keys(data).map((a, index) => {
                                            if (a != 't') {
                                                return <div className='chartTypeItem'>

                                                    <div className='cirlce' style={{ backgroundColor: pressColorArr[a] }}></div> <div style={{ width: '4rem', display: 'flex', justifyContent: 'flex-end' }}><span style={{ fontVariantNumeric: 'tabular-nums', minWidth: '2.8rem', textAlign: 'right', display: 'inline-block' }}>{data[a][item]}</span><span style={{ width: '1.6rem', textAlign: 'left', flexShrink: 0 }}>{system === 'carY' ? '' : (item == 'total' ? 'N' : 'Kpa')}</span></div> </div>
                                            }
                                        })
                                    }</div>
                                </div>
                            )
                        })
                    }


                </div>
                {/* <canvas id="myChart2" style={{ height: `${120}px`, width: '100%' }}></canvas>
        
            {
                Object.keys(data).map((a) => {
                    if (a != 't') {
                        return <div style={{ color: '#fff' }}>{a} : {

                            Object.keys(data[a]).map((b, index) => {
                                return <>{b} :  {data[a][b]}</>
                            })

                        }</div>
                    }

                })
            } */}

                <div className='chartAndDataContent'>
                    <div className="chartTitle">
                        <div className="chartName">
                            {t('areaCurve')}
                        </div>
                        <div className="chartType">
                            {
                                Object.keys(data).map((a, index) => {
                                    if (a != 't') {
                                        return <div className='chartTypeItem'><div className='cirlce' style={{ backgroundColor: areaColorArr[a] }}></div> {t(a)}</div>
                                    }
                                })
                            }
                        </div>


                    </div>

                    <canvas id="myChart2" style={{ height: `7.5rem`, width: '18.35rem', opacity: '0.8' }}></canvas>


                    {
                        areaDataArr.map((item) => {
                            return (
                                <div className='chartData'>
                                    {t(item)}
                                    <div className='chartTypeContent'>{
                                        Object.keys(data).map((a, index) => {
                                            if (a != 't') {
                                                return <div className='chartTypeItem'>

                                                    <div className='cirlce' style={{ backgroundColor: areaColorArr[a] }}></div> <div style={{ width: '4rem', display: 'flex', justifyContent: 'flex-end' }}><span style={{ fontVariantNumeric: 'tabular-nums', minWidth: '2.4rem', textAlign: 'right', display: 'inline-block' }}>{data[a][item]}</span><span style={{ width: '1.6rem', textAlign: 'left', flexShrink: 0 }}>{item == 'pointTotal' ? '个' : 'cm²'}</span></div> </div>
                                            }
                                        })
                                    }</div>
                                </div>
                            )
                        })
                    }


                </div>
            </DraggablePanel>
            <DraggablePanel title={t('pressureCenterCurve') + ' / ' + t('pressureNormalDist')} defaultPosition={{ x: window.innerWidth - 380, y: 80 }}>
                <div className='chartAndDataContent'>
                    <div className="chartTitle">
                        <div className="chartName">
                            {t('pressureCenterCurve')}
                        </div>
                        <div className="chartType">
                            {
                                Object.keys(data).map((a, index) => {
                                    if (a != 't') {
                                        return <div className='chartTypeItem'><div className='cirlce' style={{ backgroundColor: areaColorArr[a] }}></div> {t(a)}</div>
                                    }
                                })
                            }
                        </div>


                    </div>


                    <FootTrack ref={trackRef} />


                    <div style={{ marginBottom: '6px', color: '#E6EBF0', fontSize: '0.875rem' }}>{t('pressureCenter')}{`(X,Y)`}</div>
                    {
                        centerDataArr.map((item) => {
                            return (
                                <div className='chartData'>
                                    {/* {t(item)} */}
                                    <div className='chartTypeContent' style={{ height: '1.2rem' }}>{
                                        Object.keys(data).map((a, index) => {
                                            if (a != 't') {
                                                return <div className='chartTypeItem' >

                                                    <div className='cirlce' style={{ backgroundColor: areaColorArr[a] }}></div><div style={{ display: 'flex', fontVariantNumeric: 'tabular-nums' }}> {`(${data[a][item][0]} , ${data[a][item][1]})`} </div>
                                                    {/* {data[a][item]} */}
                                                </div>
                                            }
                                        })
                                    }</div>
                                </div>
                            )
                        })
                    }


                </div>

                <div className='chartAndDataContent'>
                    <div className="chartTitle">
                        <div className="chartName">
                            {t('pressureNormalDist')}
                        </div>
                        <div className="chartType">
                            {
                                Object.keys(data).map((a, index) => {
                                    if (a != 't') {
                                        return <div className='chartTypeItem'><div className='cirlce' style={{ backgroundColor: areaColorArr[a] }}></div> {t(a)}</div>
                                    }
                                })
                            }
                        </div>


                    </div>


                    {/* <FootTrack ref={trackRef} /> */}
                    <div style={{ margin: '1.5rem 0 1.2rem' }}>
                        <canvas id="chart" style={{ height: `9.5rem`, width: '18.35rem', }}></canvas>
                    </div>
                    {/* {
                        normalDataArr.map((item) => {
                            return (
                                <div className='chartData'>
                                    {t(item)}
                                    <div className='chartTypeContent'>{
                                        Object.keys(data).map((a, index) => {
                                            if (a != 't') {
                                                return <div className='chartTypeItem'>

                                                    <div className='cirlce' style={{ backgroundColor: areaColorArr[a] }}></div> <div style={{width : '3rem'}}>{data[a][item]}</div></div>
                                            }
                                        })
                                    }</div>
                                </div>
                            )
                        })
                    } */}


                </div>
            </DraggablePanel>
        </>
    )
}

// function ChartContent(props) {
//     const {data , pressDataArr , pressColorArr} = props
//     const { t, i18n } = useTranslation()
//     return (
//         <div className='chartAndDataContent'>
//             <div className="chartTitle">
//                 <div className="chartName">
//                     {t('pressureCurve')}
//                 </div>
//                 <div className="chartType">
//                     {
//                         Object.keys(data).map((a, index) => {
//                             if (a != 't') {
//                                 return <div className='chartTypeItem'><div className='cirlce' style={{ backgroundColor: pressColorArr[a] }}></div> {t(a)}</div>
//                             }
//                         })
//                     }
//                 </div>


//             </div>

//             <canvas id="myChart1" style={{ height: `7.5rem`, width: '18.35rem', opacity: '0.8' }}></canvas>


//             {
//                 pressDataArr.map((item) => {
//                     return (
//                         <div className='chartData'>
//                             {t(item)}
//                             <div className='chartTypeContent'>{
//                                 Object.keys(data).map((a, index) => {
//                                     if (a != 't') {
//                                         return <div className='chartTypeItem'>

//                                             <div className='cirlce' style={{ backgroundColor: pressColorArr[a] }}></div> {data[a][item]}</div>
//                                     }
//                                 })
//                             }</div>
//                         </div>
//                     )
//                 })
//             }


//         </div>
//     )
// }


export default withTranslation('translation')(ChartsAside)
