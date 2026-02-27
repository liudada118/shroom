import { Button, Input } from 'antd'
import axios from 'axios'
import React, { createContext, memo, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation, withTranslation } from 'react-i18next'
import Canvas from '../../components/three/canvas copy'
import Bed from '../../components/three/ThreeAndModel'
import Car from '../../components/three/ThreeAndCar'
import Title from '../../components/title/Title'
import { useWindowSize } from '../../hooks/useWindowsize'
import ViewSetting from '../../components/viewSetting/ViewSetting'
import ColAndHistory from '../../components/ColAndHistory/ColAndHistory'
// import Num from '../../components/num/Num'
import Num3D from '../../components/num/Num3D'
import NumThree from '../../components/three/NumThreeColor copy 2'
import { SelectionHelper } from '../../components/selectBox/SelectBox'
import Aside from '../../components/aside/Aside'
import { brushInstance } from '../../components/selectBox/newSelecttBox'
import { getDisplayType, getSelectArr, getsetDisplayStatus, getSettingValue, getStatus, getSysType, useEquipStore } from '../../store/equipStore'
import { pointConfig, systemConfig, systemPointConfig } from '../../util/constant'
import CanvasShow from '../../components/canvasShow/CanvasShow'
import { shallow } from 'zustand/shallow'
import Endi from '../../components/three/ThreeAndCarPoint'
import Endi1 from '../../components/three/ThreeAndCarPoint copy'
import { lengthObj, } from '../../assets/util/constant'
import ChartsAside from '../../components/chartsAside/ChartsAside'
import { Scheduler } from '../../scheduler/scheduler'
import { newRuler } from '../../components/ruler/newRuler'
import NumThres from '../../components/three/NumThres'
import { backYToX, calcCentroidRatio, colSelectMatrix, endiBackPressFn, endiSitPressFn, graCenter, kurtosis, mean, normalPDF, sitYToX, skewness, variance } from '../../util/util'
import { matrixGenBox, removeHistoryBox } from '../../assets/util/selectMatrix'
import NumThresContrast from '../../components/contrast/NumThresContrast'
import { gaussianBlur1D, pressFN } from './util'
import { isMoreMatrix } from '../../assets/util/util'

export const pageContext = createContext(null)
// const selectHelper = new SelectionHelper(document.body, 'selectBox');
function Test() {

    const { t, i18n } = useTranslation()

    const [value, setValue] = useState('')

    const connPort = () => {
        axios.get('http://localhost:19245/connPort', {}).then((res) => {
            console.log(res)
        })
    }

    const handInput = (e) => {
        const value = e.target.value
        setValue(value)
    }

    const postKey = () => {
        // axios.post('http://localhost:19245/bindKey', {
        //     key : value
        // }).then((res) => {
        //     console.log(res)
        // })
        axios({
            method: 'post',
            url: 'http://localhost:19245/bindKey',
            data: {
                key: value
            }
        })
    }

    useWindowSize()

    const sitDataRef = useRef({})
    const disPlayDataRef = useRef({})
    const chartRef = useRef({})
    // const dataRef = useRef({})

    useEffect(() => {
        let ws;
        let reconnectTimer;
        let reconnectAttempts = 0;
        let shouldReconnect = true;
        let data = {}

        function scheduleReconnect() {
            if (!shouldReconnect) return;
            const delay = Math.min(1000 * (2 ** reconnectAttempts), 10000);
            reconnectAttempts += 1;
            if (reconnectTimer) clearTimeout(reconnectTimer);
            reconnectTimer = setTimeout(() => {
                connect();
            }, delay);
        }

        function connect() {
            ws = new WebSocket(" ws://127.0.0.1:19999");
            ws.onopen = () => {
                // connection opened
                reconnectAttempts = 0;
                console.info("connect success");
            };
            ws.onmessage = (e) => {
            const select = getSelectArr()

            const displayType = getDisplayType()

            const jsonObj = JSON.parse(e.data)

            // 实时数据

            if (jsonObj.sitData) {
                // console.log(jsonObj.sitData.com3.data)
                // const date = new Date().getTime()
                const sitData = jsonObj.sitData
                if (Object.keys(sitData).length) {

                    const keyArr = Object.keys(sitData)
                    let arr = {}
                    let selectedArr = {}
                    // if (select.length) {

                    //     const a = systemPointConfig
                    //     console.log(matrix, displayType)
                    // }

                    // 赋矩阵初始值
                    for (let i = 0; i < keyArr.length; i++) {

                        const key = keyArr[i].includes('-') ? keyArr[i].split('-')[1] : keyArr[i]
                        if (!sitData[keyArr[i]].arr) continue
                        arr[key] = sitData[keyArr[i]].arr

                        if (keyArr[i].includes('endi')) {
                            if (key == 'sit') {

                                arr[key] = [...arr[key]].map((a) => {
                                    if (a > 255) {
                                        return 255
                                    } else {
                                        return a
                                    }
                                })
                            } else if (key == 'back') {

                                arr[key] = [...arr[key]].map((a) => {
                                    if (a > 255) {
                                        return 255
                                    } else {
                                        return a
                                    }
                                })
                            }
                        }

                        const unZeroArr = arr[key].filter((a) => a > 0)

                        // const area = unZeroArr.length

                        // const pressArr = [...unZeroArr].map((a) => {
                        //     if (keyArr[i].includes('endi')) {


                        //         if (key == 'sit') {
                        //             return endiSitPressFn(a) / (pointConfig.endi.sit.pointWidthDistance * 0.001 * pointConfig.endi.sit.pointHeightDistance * 0.001) / 1000
                        //         } else if (key == 'back') {
                        //             return endiBackPressFn(a) / (pointConfig.endi.back.pointWidthDistance * 0.001 * pointConfig.endi.back.pointHeightDistance * 0.001) / 1000
                        //         }
                        //     } else {
                        //         return a
                        //     }
                        // })

                        const matrixArr = arr[key]
                        // if (key.includes('sit')) {

                        //     // 分压使用
                        //     const settingValue = getSettingValue()
                        //     const { press } = settingValue
                        //     arr[key] = pressFN(sitData[keyArr[i]].arr, 45, 45,press ? press : 1 ,)
                        //     // let sitArr = [] , smoothArr = []
                        //     // for (let i = 0; i < 45; i++) {
                        //     //     let arr = []
                        //     //     // smoothArr[i] = []
                        //     //     for (let j = 0; j < 45; j++) {
                        //     //         const res = matrixArr
                        //     //         arr.push(res[j * 45 + i])
                        //     //         // console.log(res)
                        //     //     }

                        //     //     const smooth = gaussianBlur1D(arr, 1.2, 8);
                        //     //     smoothArr[i]=(smooth)
                        //     //     // console.log(smooth)
                        //     //     // sitArr = sitArr.concat(smooth)
                        //     // }
                        //     // const newArr = []
                        //     //   for (let i = 0; i < 45; i++) {
                        //     //     // let arr = []
                        //     //     for (let j = 0; j < 45; j++) {
                        //     //         newArr.push(smoothArr[j][i])
                        //     //     }
                        //     // }

                        //     // // sitArr =   sitArr.map((a) => parseInt(a))
                        //     // sitArr =   newArr.map((a) => parseInt(a))
                        //     // arr[key] = sitArr
                        // }

                        const { width, height, pressFn } = systemPointConfig[keyArr[i]]

                        // 实时框选
                        if (select.length && displayType.includes(key)) {

                            const matrix = colSelectMatrix('canvasThree', select[0], systemPointConfig[keyArr[i]])
                            const { xStart, xEnd, yStart, yEnd } = matrix



                            // console.log(matrix,keyArr[i])
                            const newArr = []
                            for (let i = yStart; i < yEnd; i++) {
                                for (let j = xStart; j < xEnd; j++) {
                                    newArr.push(arr[key][i * width + j])
                                }
                            }

                            // const pressArr = [...newArr].map((a) => {
                            //     // const {press} = 
                            //     // return a
                            //     // return pressFn(a)
                            //     if (keyArr[i].includes('endi')) {


                            //         if (key == 'sit') {
                            //             // return endiSitPressFn(a) / (pointConfig.endi.sit.pointWidthDistance * 0.001 * pointConfig.endi.sit.pointHeightDistance * 0.001) / 1000
                            //             return sitYToX(a)
                            //         } else if (key == 'back') {
                            //             // return endiBackPressFn(a) / (pointConfig.endi.back.pointWidthDistance * 0.001 * pointConfig.endi.back.pointHeightDistance * 0.001) / 1000
                            //             return backYToX(a)
                            //         }
                            //     } else {
                            //         return a
                            //     }
                            // })
                            const pressArr = [...newArr]

                            selectedArr[key] = pressArr



                            // const offsetX = (max - )
                        } else {

                            // const pressArr = [...arr[key]].map((a) => {
                            //     // const {press} = 
                            //     // return a
                            //     // return pressFn(a)
                            //     if (keyArr[i].includes('endi')) {


                            //         if (key == 'sit') {
                            //             // return endiSitPressFn(a) / (pointConfig.endi.sit.pointWidthDistance * 0.001 * pointConfig.endi.sit.pointHeightDistance * 0.001) / 1000
                            //             return sitYToX(a)
                            //         } else if (key == 'back') {
                            //             // return endiBackPressFn(a) / (pointConfig.endi.back.pointWidthDistance * 0.001 * pointConfig.endi.back.pointHeightDistance * 0.001) / 1000
                            //             return backYToX(a)
                            //         }
                            //     } else {
                            //         return a
                            //     }
                            // })

                            const pressArr = [...arr[key]]

                            selectedArr[key] = pressArr



                        }

                        // 回放框选
                        if (sitData[keyArr[i]].select) {
                            const matrixObj = sitData[keyArr[i]].select

                            const { xStart, xEnd, yStart, yEnd } = matrixObj


                            console.log(displayType, (key))

                            if (displayType.includes(key) && displayType.includes('2D')) {

                                const canvas = document.querySelector(`.${'canvasThree'}`)
                                const canvasInfo = canvas.getBoundingClientRect()

                                const canvasObj = {
                                    canvasX1: canvasInfo.left, canvasX2: canvasInfo.right,
                                    canvasY1: canvasInfo.top, canvasY2: canvasInfo.bottom
                                }

                                const { width, height } = systemPointConfig[keyArr[i]]
                                const max = Math.max(width, height)

                                matrixGenBox(matrixObj, canvasObj, max)
                            } else {
                                removeHistoryBox()
                            }

                            const newArr = []
                            for (let i = yStart; i < yEnd; i++) {
                                for (let j = xStart; j < xEnd; j++) {
                                    newArr.push(arr[key][i * width + j])
                                }
                            }

                            // const pressArr = [...newArr].map((a) => {
                            //     // const {press} = 

                            //     // if (keyArr[i].includes('endi')) {


                            //     //     if (key == 'sit') {
                            //     //         // return endiSitPressFn(a) / (pointConfig.endi.sit.pointWidthDistance * 0.001 * pointConfig.endi.sit.pointHeightDistance * 0.001) / 1000
                            //     //         return sitYToX(a)
                            //     //     } else if (key == 'back') {
                            //     //         // return endiBackPressFn(a) / (pointConfig.endi.back.pointWidthDistance * 0.001 * pointConfig.endi.back.pointHeightDistance * 0.001) / 1000
                            //     //         return backYToX(a)
                            //     //     }
                            //     // } else {
                            //     //     return a
                            //     // }

                            //     // return a
                            //     return pressFn(a)
                            // })

                            const pressArr = [...newArr]



                            selectedArr[key] = pressArr

                        }



                        if (!data[key]) data[key] = {}
                        if (!data[key].areaArr) data[key].areaArr = []
                        if (!data[key].pressArr) data[key].pressArr = []
                        if (!data[key].data) data[key].data = {}

                        // const arrSmooth = graCenter([...arr[key]], width, height)
                        const arrSmooth = calcCentroidRatio([...arr[key]], width, height)

                        const μ = mean(arr[key]);
                        const Var = variance(arr[key], μ);
                        const σ = Math.sqrt(Var);
                        const Skew = skewness(arr[key], μ, σ);
                        const Kurt = kurtosis(arr[key], μ, σ);
                        const xData = Array.from({ length: 256 }, (_, i) => i);
                        const yData = xData.map(x => normalPDF(x, μ, σ));
                        const area = selectedArr[key].filter((a) => a > 0).length
                        const press = selectedArr[key].reduce((a, b) => a + b, 0)

                        data[key].center = arrSmooth
                        data[key].normalDis = {
                            μ: μ.toFixed(3),
                            Var: Var.toFixed(3),
                            Skew: Skew.toFixed(3),
                            Kurt: Kurt.toFixed(3),
                            yData
                        }


                        if (data[key].areaArr.length < 20) {
                            data[key].areaArr.push(area)
                        } else {
                            data[key].areaArr.shift()
                            data[key].areaArr.push(area)
                        }

                        if (data[key].pressArr.length < 20) {
                            data[key].pressArr.push(press)
                        } else {
                            data[key].pressArr.shift()
                            data[key].pressArr.push(press)
                        }
                        // console.log(key)
                        data[key].data.pressTotal = (press).toFixed(1)//press.toFixed(1)
                        data[key].data.areaTotal = area

                        const min = selectedArr[key].filter((a) => a > 0).length ? Math.min(...selectedArr[key].filter((a) => a > 0)).toFixed(1) : 0


                        data[key].data.pressMax = Math.max(...selectedArr[key])
                        data[key].data.total = press
                        data[key].data.pressMin = min ? min : 0
                        data[key].data.pressAver = (press / (area ? area : 1))

                        if (keyArr[i] == 'endi-back') {
                            // data[key].data.pressMax = Math.max(...selectedArr[key])

                            data[key].data.pressMax = backYToX(Math.max(...selectedArr[key])).toFixed(2)
                            data[key].data.pressMin = backYToX(min ? min : 0).toFixed(2)
                            data[key].data.pressAver = backYToX((press / (area ? area : 1))).toFixed(2)

                        } else if (keyArr[i] == 'endi-sit') {
                            data[key].data.pressMax = sitYToX(Math.max(...selectedArr[key])).toFixed(2)
                            data[key].data.pressMin = sitYToX(min ? min : 0).toFixed(2)
                            data[key].data.pressAver = sitYToX((press / (area ? area : 1))).toFixed(2)
                        }

                    }

                    chartRef.current = data
                    sitDataRef.current = arr
                    disPlayDataRef.current = sitDataRef.current



                    // 赋值时间戳跟状态
                    let stamp = sitData[keyArr[0]].stamp
                    let cop = sitData[keyArr[0]].cop




                    // 赋值设备在线状态
                    const newObj = {}
                    for (let i = 0; i < keyArr.length; i++) {
                        const key = keyArr[i]
                        newObj[key] = sitData[keyArr[i]].status
                    }
                    useEquipStore.getState().setEquipStatus(newObj)



                    const sysType = getSysType()
                    if (!arr || !keyArr.some((a) => a.includes(sysType))) {
                        return
                    }

                    // useEquipStore.getState().setDisplayStatus(arr);
                    useEquipStore.getState().setEquipStamp(stamp)
                    if (cop) useEquipStore.getState().setEquipCop(cop)
                    // console.log(wsLocalData)

                    const wsLocalData = wsLocalDataRef.current.data
                    const flag = wsLocalDataRef.current.flag


                    let resArr = {}
                    // console.log(arr)
                    for (let i = 0; i < keyArr.length; i++) {
                        const key = keyArr[i].includes('-') ? keyArr[i].split('-')[1] : keyArr[i]
                        if (!arr[key]) continue
                        resArr[key] = [...arr[key]].map((a, index) => {

                            if (!flag || !arr[key]) return a

                            if (a - wsLocalData[key][index] < 0) {
                                return 0
                            } else {
                                return a - wsLocalData[key][index]
                            }
                        })


                        disPlayDataRef.current = resArr
                    }

                    const settingValue = getSettingValue()
                    const { filter } = settingValue
                    if (filter) {
                        for (let i = 0; i < keyArr.length; i++) {
                            const key = keyArr[i].includes('-') ? keyArr[i].split('-')[1] : keyArr[i]

                            if (!arr[key]) continue

                            resArr[key] = resArr[key].map((a) => {
                                if (a < filter) {
                                    return 0
                                } else {
                                    return a
                                }
                            })
                            disPlayDataRef.current = resArr
                        }
                    }



                    // let length = 64
                    // if (systemType != 'bigHand') {
                    //     length = 32
                    // }





                    // if()

                    // 左右翻转数据
                    if (!dataDirection.current.left) {
                        const res = {}

                        for (let i = 0; i < keyArr.length; i++) {
                            const key = keyArr[i].includes('-') ? keyArr[i].split('-')[1] : keyArr[i]

                            res[key] = []
                            // const length = lengthObj[key]

                            const { width, height } = systemPointConfig[keyArr[i]]
                            console.log(width, height)
                            const indexArr = []
                            for (let i = width; i > 0; i--) {
                                indexArr.push(i - 1)
                            }
                            for (let i = 0; i < height; i++) {
                                for (let j = 0; j < indexArr.length; j++) {
                                    const k = indexArr[j]
                                    res[key].push(resArr[key][i * width + k])
                                }
                            }
                        }


                        resArr = res
                    }

                    // const settingValue = getSettingValue()


                    // 上下翻转数据
                    if (!dataDirection.current.up) {
                        const res = {}


                        for (let i = 0; i < keyArr.length; i++) {
                            const key = keyArr[i].includes('-') ? keyArr[i].split('-')[1] : keyArr[i]
                            res[key] = []

                            //  res[key] = []
                            // const length = lengthObj[key]

                            const { width, height } = systemPointConfig[keyArr[i]]

                            // const length = lengthObj[key]
                            const indexArr = []
                            for (let i = height; i > 0; i--) {
                                indexArr.push(i - 1)
                            }
                            for (let i = 0; i < height; i++) {
                                for (let j = 0; j < width; j++) {
                                    const k = indexArr[i]
                                    res[key].push(resArr[key][k * width + j])
                                }
                            }
                        }
                        console.log(res)
                        // for (let i = 0; i < indexArr.length; i++) {
                        //     for (let j = 0; j < length; j++) {
                        //         const k = indexArr[i]
                        //         res.push(resArr[k * length + j])
                        //     }
                        // }
                        resArr = res
                    }
                    disPlayDataRef.current = resArr



                    useEquipStore.getState().setDisplayStatus(resArr);
                } else {
                    useEquipStore.getState().setStatus(new Array(4096).fill(0))
                    useEquipStore.getState().setDisplayStatus(new Array(4096).fill(0))
                }

                const hasIndex = jsonObj.index !== undefined && jsonObj.index !== null
                const hasTimestamp = jsonObj.timestamp !== undefined && jsonObj.timestamp !== null
                const isReplayStatus = useEquipStore.getState().dataStatus === 'replay'

                if (hasIndex) {
                    useEquipStore.getState().setDataStatus('replay')
                    setPlayBack(true)
                    const history = useEquipStore.getState().history
                    const obj = { ...history, index: jsonObj.index, }
                    useEquipStore.getState().setHistoryStatus(obj);
                }

                if (hasTimestamp) {
                    useEquipStore.getState().setDataStatus('replay')
                    const history = useEquipStore.getState().history
                    const obj = { ...history, timestamp: jsonObj.timestamp, }
                    useEquipStore.getState().setHistoryStatus(obj);
                }
                if (jsonObj.sitData && !hasIndex && !hasTimestamp && !isReplayStatus) {
                    useEquipStore.getState().setDataStatus('realtime')
                }
                // console.log(new Date().getTime() - date)
            }

            if (jsonObj.playEnd != null) { }

            if (jsonObj.sitDataPlay) {
                // console.log(jsonObj.sitData.com3.data)
                // const date = new Date().getTime()
                const sitData = jsonObj.sitDataPlay
                if (Object.keys(sitData).length) {

                    const keyArr = Object.keys(sitData)
                    let arr = {}
                    let selectedArr = {}
                    // if (select.length) {

                    //     const a = systemPointConfig
                    //     console.log(matrix, displayType)
                    // }

                    // 赋矩阵初始值
                    for (let i = 0; i < keyArr.length; i++) {

                        const key = keyArr[i].includes('-') ? keyArr[i].split('-')[1] : keyArr[i]
                        if (!sitData[keyArr[i]].arr) continue
                        arr[key] = sitData[keyArr[i]].arr

                        if (keyArr[i].includes('endi')) {
                            if (key == 'sit') {

                                arr[key] = [...arr[key]].map((a) => {
                                    if (a > 255) {
                                        return 255
                                    } else {
                                        return a
                                    }
                                })
                            } else if (key == 'back') {

                                arr[key] = [...arr[key]].map((a) => {
                                    if (a > 255) {
                                        return 255
                                    } else {
                                        return a
                                    }
                                })
                            }
                        }

                        const unZeroArr = arr[key].filter((a) => a > 0)

                        // const area = unZeroArr.length

                        // const pressArr = [...unZeroArr].map((a) => {
                        //     if (keyArr[i].includes('endi')) {


                        //         if (key == 'sit') {
                        //             return endiSitPressFn(a) / (pointConfig.endi.sit.pointWidthDistance * 0.001 * pointConfig.endi.sit.pointHeightDistance * 0.001) / 1000
                        //         } else if (key == 'back') {
                        //             return endiBackPressFn(a) / (pointConfig.endi.back.pointWidthDistance * 0.001 * pointConfig.endi.back.pointHeightDistance * 0.001) / 1000
                        //         }
                        //     } else {
                        //         return a
                        //     }
                        // })

                        const matrixArr = arr[key]
                        // if (key.includes('sit')) {

                        //     // 分压使用
                        //     const settingValue = getSettingValue()
                        //     const { press } = settingValue
                        //     arr[key] = pressFN(sitData[keyArr[i]].arr, 45, 45,press ? press : 1 ,)
                        //     // let sitArr = [] , smoothArr = []
                        //     // for (let i = 0; i < 45; i++) {
                        //     //     let arr = []
                        //     //     // smoothArr[i] = []
                        //     //     for (let j = 0; j < 45; j++) {
                        //     //         const res = matrixArr
                        //     //         arr.push(res[j * 45 + i])
                        //     //         // console.log(res)
                        //     //     }

                        //     //     const smooth = gaussianBlur1D(arr, 1.2, 8);
                        //     //     smoothArr[i]=(smooth)
                        //     //     // console.log(smooth)
                        //     //     // sitArr = sitArr.concat(smooth)
                        //     // }
                        //     // const newArr = []
                        //     //   for (let i = 0; i < 45; i++) {
                        //     //     // let arr = []
                        //     //     for (let j = 0; j < 45; j++) {
                        //     //         newArr.push(smoothArr[j][i])
                        //     //     }
                        //     // }

                        //     // // sitArr =   sitArr.map((a) => parseInt(a))
                        //     // sitArr =   newArr.map((a) => parseInt(a))
                        //     // arr[key] = sitArr
                        // }

                        const { width, height, pressFn } = systemPointConfig[keyArr[i]]

                        // 实时框选
                        if (select.length && displayType.includes(key)) {

                            const matrix = colSelectMatrix('canvasThree', select[0], systemPointConfig[keyArr[i]])
                            const { xStart, xEnd, yStart, yEnd } = matrix



                            // console.log(matrix,keyArr[i])
                            const newArr = []
                            for (let i = yStart; i < yEnd; i++) {
                                for (let j = xStart; j < xEnd; j++) {
                                    newArr.push(arr[key][i * width + j])
                                }
                            }

                            // const pressArr = [...newArr].map((a) => {
                            //     // const {press} = 
                            //     // return a
                            //     // return pressFn(a)
                            //     if (keyArr[i].includes('endi')) {


                            //         if (key == 'sit') {
                            //             // return endiSitPressFn(a) / (pointConfig.endi.sit.pointWidthDistance * 0.001 * pointConfig.endi.sit.pointHeightDistance * 0.001) / 1000
                            //             return sitYToX(a)
                            //         } else if (key == 'back') {
                            //             // return endiBackPressFn(a) / (pointConfig.endi.back.pointWidthDistance * 0.001 * pointConfig.endi.back.pointHeightDistance * 0.001) / 1000
                            //             return backYToX(a)
                            //         }
                            //     } else {
                            //         return a
                            //     }
                            // })
                            const pressArr = [...newArr]

                            selectedArr[key] = pressArr



                            // const offsetX = (max - )
                        } else {

                            // const pressArr = [...arr[key]].map((a) => {
                            //     // const {press} = 
                            //     // return a
                            //     // return pressFn(a)
                            //     if (keyArr[i].includes('endi')) {


                            //         if (key == 'sit') {
                            //             // return endiSitPressFn(a) / (pointConfig.endi.sit.pointWidthDistance * 0.001 * pointConfig.endi.sit.pointHeightDistance * 0.001) / 1000
                            //             return sitYToX(a)
                            //         } else if (key == 'back') {
                            //             // return endiBackPressFn(a) / (pointConfig.endi.back.pointWidthDistance * 0.001 * pointConfig.endi.back.pointHeightDistance * 0.001) / 1000
                            //             return backYToX(a)
                            //         }
                            //     } else {
                            //         return a
                            //     }
                            // })

                            const pressArr = [...arr[key]]

                            selectedArr[key] = pressArr



                        }

                        // 回放框选
                        if (sitData[keyArr[i]].select) {
                            const matrixObj = sitData[keyArr[i]].select

                            const { xStart, xEnd, yStart, yEnd } = matrixObj


                            console.log(displayType, (key))

                            if (displayType.includes(key) && displayType.includes('2D')) {

                                const canvas = document.querySelector(`.${'canvasThree'}`)
                                const canvasInfo = canvas.getBoundingClientRect()

                                const canvasObj = {
                                    canvasX1: canvasInfo.left, canvasX2: canvasInfo.right,
                                    canvasY1: canvasInfo.top, canvasY2: canvasInfo.bottom
                                }

                                const { width, height } = systemPointConfig[keyArr[i]]
                                const max = Math.max(width, height)

                                matrixGenBox(matrixObj, canvasObj, max)
                            } else {
                                removeHistoryBox()
                            }

                            const newArr = []
                            for (let i = yStart; i < yEnd; i++) {
                                for (let j = xStart; j < xEnd; j++) {
                                    newArr.push(arr[key][i * width + j])
                                }
                            }

                            // const pressArr = [...newArr].map((a) => {
                            //     // const {press} = 

                            //     // if (keyArr[i].includes('endi')) {


                            //     //     if (key == 'sit') {
                            //     //         // return endiSitPressFn(a) / (pointConfig.endi.sit.pointWidthDistance * 0.001 * pointConfig.endi.sit.pointHeightDistance * 0.001) / 1000
                            //     //         return sitYToX(a)
                            //     //     } else if (key == 'back') {
                            //     //         // return endiBackPressFn(a) / (pointConfig.endi.back.pointWidthDistance * 0.001 * pointConfig.endi.back.pointHeightDistance * 0.001) / 1000
                            //     //         return backYToX(a)
                            //     //     }
                            //     // } else {
                            //     //     return a
                            //     // }

                            //     // return a
                            //     return pressFn(a)
                            // })

                            const pressArr = [...newArr]



                            selectedArr[key] = pressArr

                        }



                        if (!data[key]) data[key] = {}
                        if (!data[key].areaArr) data[key].areaArr = []
                        if (!data[key].pressArr) data[key].pressArr = []
                        if (!data[key].data) data[key].data = {}

                        // const arrSmooth = graCenter([...arr[key]], width, height)
                        const arrSmooth = calcCentroidRatio([...arr[key]], width, height)

                        const μ = mean(arr[key]);
                        const Var = variance(arr[key], μ);
                        const σ = Math.sqrt(Var);
                        const Skew = skewness(arr[key], μ, σ);
                        const Kurt = kurtosis(arr[key], μ, σ);
                        const xData = Array.from({ length: 256 }, (_, i) => i);
                        const yData = xData.map(x => normalPDF(x, μ, σ));
                        const area = selectedArr[key].filter((a) => a > 0).length
                        const press = selectedArr[key].reduce((a, b) => a + b, 0)

                        data[key].center = arrSmooth
                        data[key].normalDis = {
                            μ: μ.toFixed(3),
                            Var: Var.toFixed(3),
                            Skew: Skew.toFixed(3),
                            Kurt: Kurt.toFixed(3),
                            yData
                        }


                        if (data[key].areaArr.length < 20) {
                            data[key].areaArr.push(area)
                        } else {
                            data[key].areaArr.shift()
                            data[key].areaArr.push(area)
                        }

                        if (data[key].pressArr.length < 20) {
                            data[key].pressArr.push(press)
                        } else {
                            data[key].pressArr.shift()
                            data[key].pressArr.push(press)
                        }
                        // console.log(key)
                        data[key].data.pressTotal = (press).toFixed(1)//press.toFixed(1)
                        data[key].data.areaTotal = area

                        const min = selectedArr[key].filter((a) => a > 0).length ? Math.min(...selectedArr[key].filter((a) => a > 0)).toFixed(1) : 0


                        data[key].data.pressMax = Math.max(...selectedArr[key])
                        data[key].data.total = press
                        data[key].data.pressMin = min ? min : 0
                        data[key].data.pressAver = (press / (area ? area : 1))

                        if (keyArr[i] == 'endi-back') {
                            // data[key].data.pressMax = Math.max(...selectedArr[key])

                            data[key].data.pressMax = backYToX(Math.max(...selectedArr[key])).toFixed(2)
                            data[key].data.pressMin = backYToX(min ? min : 0).toFixed(2)
                            data[key].data.pressAver = backYToX((press / (area ? area : 1))).toFixed(2)

                        } else if (keyArr[i] == 'endi-sit') {
                            data[key].data.pressMax = sitYToX(Math.max(...selectedArr[key])).toFixed(2)
                            data[key].data.pressMin = sitYToX(min ? min : 0).toFixed(2)
                            data[key].data.pressAver = sitYToX((press / (area ? area : 1))).toFixed(2)
                        }

                    }

                    chartRef.current = data
                    sitDataRef.current = arr
                    disPlayDataRef.current = sitDataRef.current



                    // 赋值时间戳跟状态
                    let stamp = sitData[keyArr[0]].stamp
                    let cop = sitData[keyArr[0]].cop




                    // 赋值设备在线状态
                    const newObj = {}
                    for (let i = 0; i < keyArr.length; i++) {
                        const key = keyArr[i]
                        newObj[key] = sitData[keyArr[i]].status
                    }
                    useEquipStore.getState().setEquipStatus(newObj)



                    const sysType = getSysType()
                    if (!arr || !keyArr.some((a) => a.includes(sysType))) {
                        return
                    }

                    // useEquipStore.getState().setDisplayStatus(arr);
                    useEquipStore.getState().setEquipStamp(stamp)
                    if (cop) useEquipStore.getState().setEquipCop(cop)
                    // console.log(wsLocalData)

                    const wsLocalData = wsLocalDataRef.current.data
                    const flag = wsLocalDataRef.current.flag


                    let resArr = {}
                    // console.log(arr)
                    for (let i = 0; i < keyArr.length; i++) {
                        const key = keyArr[i].includes('-') ? keyArr[i].split('-')[1] : keyArr[i]
                        if (!arr[key]) continue
                        resArr[key] = [...arr[key]].map((a, index) => {

                            if (!flag || !arr[key]) return a

                            if (a - wsLocalData[key][index] < 0) {
                                return 0
                            } else {
                                return a - wsLocalData[key][index]
                            }
                        })


                        disPlayDataRef.current = resArr
                    }

                    const settingValue = getSettingValue()
                    const { filter } = settingValue
                    if (filter) {
                        for (let i = 0; i < keyArr.length; i++) {
                            const key = keyArr[i].includes('-') ? keyArr[i].split('-')[1] : keyArr[i]

                            if (!arr[key]) continue

                            resArr[key] = resArr[key].map((a) => {
                                if (a < filter) {
                                    return 0
                                } else {
                                    return a
                                }
                            })
                            disPlayDataRef.current = resArr
                        }
                    }



                    // let length = 64
                    // if (systemType != 'bigHand') {
                    //     length = 32
                    // }





                    // if()

                    // 左右翻转数据
                    if (!dataDirection.current.left) {
                        const res = {}

                        for (let i = 0; i < keyArr.length; i++) {
                            const key = keyArr[i].includes('-') ? keyArr[i].split('-')[1] : keyArr[i]

                            res[key] = []
                            // const length = lengthObj[key]

                            const { width, height } = systemPointConfig[keyArr[i]]
                            console.log(width, height)
                            const indexArr = []
                            for (let i = width; i > 0; i--) {
                                indexArr.push(i - 1)
                            }
                            for (let i = 0; i < height; i++) {
                                for (let j = 0; j < indexArr.length; j++) {
                                    const k = indexArr[j]
                                    res[key].push(resArr[key][i * width + k])
                                }
                            }
                        }


                        resArr = res
                    }

                    // const settingValue = getSettingValue()


                    // 上下翻转数据
                    if (!dataDirection.current.up) {
                        const res = {}


                        for (let i = 0; i < keyArr.length; i++) {
                            const key = keyArr[i].includes('-') ? keyArr[i].split('-')[1] : keyArr[i]
                            res[key] = []

                            //  res[key] = []
                            // const length = lengthObj[key]

                            const { width, height } = systemPointConfig[keyArr[i]]

                            // const length = lengthObj[key]
                            const indexArr = []
                            for (let i = height; i > 0; i--) {
                                indexArr.push(i - 1)
                            }
                            for (let i = 0; i < height; i++) {
                                for (let j = 0; j < width; j++) {
                                    const k = indexArr[i]
                                    res[key].push(resArr[key][k * width + j])
                                }
                            }
                        }
                        console.log(res)
                        // for (let i = 0; i < indexArr.length; i++) {
                        //     for (let j = 0; j < length; j++) {
                        //         const k = indexArr[i]
                        //         res.push(resArr[k * length + j])
                        //     }
                        // }
                        resArr = res
                    }
                    disPlayDataRef.current = resArr



                    useEquipStore.getState().setDisplayStatus(resArr);
                } else {
                    useEquipStore.getState().setStatus(new Array(4096).fill(0))
                    useEquipStore.getState().setDisplayStatus(new Array(4096).fill(0))
                }

                const hasIndex = jsonObj.index !== undefined && jsonObj.index !== null
                const hasTimestamp = jsonObj.timestamp !== undefined && jsonObj.timestamp !== null
                const isReplayStatus = useEquipStore.getState().dataStatus === 'replay'

                if (hasIndex) {
                    useEquipStore.getState().setDataStatus('replay')
                    setPlayBack(true)
                    const history = useEquipStore.getState().history
                    const obj = { ...history, index: jsonObj.index, }
                    useEquipStore.getState().setHistoryStatus(obj);
                }

                if (hasTimestamp) {
                    useEquipStore.getState().setDataStatus('replay')
                    const history = useEquipStore.getState().history
                    const obj = { ...history, timestamp: jsonObj.timestamp, }
                    useEquipStore.getState().setHistoryStatus(obj);
                }
                if (jsonObj.sitData && !hasIndex && !hasTimestamp && !isReplayStatus) {
                    useEquipStore.getState().setDataStatus('realtime')
                }
                // console.log(new Date().getTime() - date)
            }

            // 对比数据
            // if (jsonObj.contrastData) {
            //     console.log(jsonObj.contrastData, 'contrastData')
            //     const left = jsonObj.contrastData.left
            //     const right = jsonObj.contrastData.right

            //     for (let i = 0; i < keyArr.length; i++) {

            //         const key = keyArr[i].includes('-') ? keyArr[i].split('-')[1] : keyArr[i]
            //         if (!sitData[keyArr[i]].arr) continue
            //         arr[key] = sitData[keyArr[i]].arr
            //         const { width, height, pressFn } = systemPointConfig[keyArr[i]]

            //         // 实时框选
            //         if (select.length && displayType.includes(key)) {

            //             const matrix = colSelectMatrix('canvasThree', select[0], systemPointConfig[keyArr[i]])
            //             const { xStart, xEnd, yStart, yEnd } = matrix



            //             // console.log(matrix,keyArr[i])
            //             const newArr = []
            //             for (let i = yStart; i < yEnd; i++) {
            //                 for (let j = xStart; j < xEnd; j++) {
            //                     newArr.push(arr[key][i * width + j])
            //                 }
            //             }

            //             const pressArr = [...newArr].map((a) => {
            //                 // const {press} = 
            //                 return a
            //                 return pressFn(a)
            //             })

            //             selectedArr[key] = pressArr



            //             // const offsetX = (max - )
            //         } else {

            //             const pressArr = [...arr[key]].map((a) => {
            //                 // const {press} = 
            //                 return a
            //                 return pressFn(a)
            //             })

            //             selectedArr[key] = pressArr



            //         }

            //         // 回放框选
            //         if (sitData[keyArr[i]].select) {
            //             const matrixObj = sitData[keyArr[i]].select

            //             const { xStart, xEnd, yStart, yEnd } = matrixObj


            //             console.log(displayType, (key))

            //             if (displayType.includes(key) && displayType.includes('2D')) {

            //                 const canvas = document.querySelector(`.${'canvasThree'}`)
            //                 const canvasInfo = canvas.getBoundingClientRect()

            //                 const canvasObj = {
            //                     canvasX1: canvasInfo.left, canvasX2: canvasInfo.right,
            //                     canvasY1: canvasInfo.top, canvasY2: canvasInfo.bottom
            //                 }

            //                 const { width, height } = systemPointConfig[keyArr[i]]
            //                 const max = Math.max(width, height)

            //                 matrixGenBox(matrixObj, canvasObj, max)
            //             } else {
            //                 removeHistoryBox()
            //             }

            //             const newArr = []
            //             for (let i = yStart; i < yEnd; i++) {
            //                 for (let j = xStart; j < xEnd; j++) {
            //                     newArr.push(arr[key][i * width + j])
            //                 }
            //             }

            //             const pressArr = [...newArr].map((a) => {
            //                 // const {press} = 
            //                 return a
            //                 return pressFn(a)
            //             })



            //             selectedArr[key] = pressArr

            //         }

            //         if (!data[key]) data[key] = {}
            //         if (!data[key].areaArr) data[key].areaArr = []
            //         if (!data[key].pressArr) data[key].pressArr = []
            //         if (!data[key].data) data[key].data = {}

            //         const arrSmooth = graCenter([...arr[key]], width, height)
            //         const μ = mean(arr[key]);
            //         const Var = variance(arr[key], μ);
            //         const σ = Math.sqrt(Var);
            //         const Skew = skewness(arr[key], μ, σ);
            //         const Kurt = kurtosis(arr[key], μ, σ);
            //         const xData = Array.from({ length: 256 }, (_, i) => i);
            //         const yData = xData.map(x => normalPDF(x, μ, σ));
            //         const area = selectedArr[key].filter((a) => a > 0).length
            //         const press = selectedArr[key].reduce((a, b) => a + b, 0)

            //         data[key].center = arrSmooth
            //         data[key].normalDis = {
            //             μ: μ.toFixed(3),
            //             Var: Var.toFixed(3),
            //             Skew: Skew.toFixed(3),
            //             Kurt: Kurt.toFixed(3),
            //             yData
            //         }


            //         if (data[key].areaArr.length < 20) {
            //             data[key].areaArr.push(area)
            //         } else {
            //             data[key].areaArr.shift()
            //             data[key].areaArr.push(area)
            //         }

            //         if (data[key].pressArr.length < 20) {
            //             data[key].pressArr.push(press)
            //         } else {
            //             data[key].pressArr.shift()
            //             data[key].pressArr.push(press)
            //         }

            //         data[key].data.pressTotal = (press).toFixed(1)//press.toFixed(1)
            //         data[key].data.areaTotal = area.toFixed(1)
            //         data[key].data.pressMax = Math.max(...selectedArr[key]).toFixed(1)
            //         data[key].data.pressAver = (press / area).toFixed(2)


            //     }
            // }

            };
            ws.onerror = () => {
                // an error occurred
                if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
                    ws.close();
                }
            };
            ws.onclose = () => {
                // connection closed
                scheduleReconnect();
            };
        }

        connect();

        return () => {
            shouldReconnect = false;
            if (reconnectTimer) clearTimeout(reconnectTimer);
            if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
                ws.close();
            }
        };
    }, [])

    useEffect(() => {
        const cb = (arr) => {
            useEquipStore.getState().setSelectArr(arr)
            const status = useEquipStore.getState().dataStatus
            const range = Array.isArray(arr) ? arr[0] : null
            if (status !== 'replay' || !range) return

            const systemType = getSysType()
            const displayType = getDisplayType()
            let typeKey = systemType
            if (isMoreMatrix(systemType)) {
                typeKey = `${systemType}-${displayType.includes('back') ? 'back' : displayType.includes('sit') ? 'sit' : 'back'}`
            }

            const matrix = colSelectMatrix('canvasThree', range, systemPointConfig[typeKey])
            if (!matrix) return
            const selectJson = {}
            selectJson[typeKey] = {
                xStart: matrix.xStart,
                xEnd: matrix.xEnd,
                yStart: matrix.yStart,
                yEnd: matrix.yEnd,
                width: systemPointConfig[typeKey].width,
                height: systemPointConfig[typeKey].height
            }

            axios({
                method: 'post',
                url: 'http://localhost:19245/getDbHistorySelect',
                data: {
                    selectJson
                }
            }).then((res) => {
                const data = res.data?.data || {}
                const { areaArr, pressArr } = data
                if (areaArr || pressArr) {
                    useEquipStore.getState().setHistoryChart({
                        areaArr: areaArr || {},
                        pressArr: pressArr || {}
                    })
                }
            })
        }
        brushInstance.subscribe(cb);
    }, [])

    useEffect(() => {
        Scheduler.start()
    }, [])

    const [sitData, setSitData] = useState([])

    const [playBack, setPlayBack] = useState(false)

    const [equipStatus, setStatus] = useState({ back: 'offline', sit: 'offline', data: new Array(4096).fill(0) })
    const setValueData = localStorage.getItem('setValueData') ? JSON.parse(localStorage.getItem('setValueData')) : { gauss: 1, color: 200, filter: 1, height: 1, coherent: 1 }
    const [settingValue, setSettingValue] = useState(setValueData)
    const [selectArr, setSelectArr] = useState([])
    const [wsLocalData, setWsLocalData] = useState(new Array(4096).fill(0))
    const wsLocalDataRef = useRef({ data: new Array(4096).fill(0), flag: false })
    const dataDirection = useRef({
        left: true,
        up: true
    })

    const changeDataDirection = (dir) => {
        const { left, up } = dataDirection.current
        if (dir == 'left') {
            dataDirection.current.left = !left
        } else {
            dataDirection.current.up = !up
        }
    }

    const changeWsLocalData = () => {
        const data = getsetDisplayStatus()
        console.log(sitDataRef.current, 'sitDataRef.current')
        wsLocalDataRef.current.data = sitDataRef.current
        wsLocalDataRef.current.flag = !wsLocalDataRef.current.flag
    }

    const [display, setDisplay] = useState('point3D')
    // const display = useEquipStore(s => s.display, shallow); 

    const threeRef = useRef()
    const setting = useRef()
    // const [systemType, setSystemType] = useState('bed')
    // const [systemTypeArr, setSystemTypeArr] = useState([])

    // const systemType = useEquipStore.getState().systemType

    const systemType = useEquipStore(s => s.systemType, shallow);
    // const systemType = 'car'
    useLayoutEffect(() => {
        const { setSystemType, setSystemTypeArr } = useEquipStore.getState()
        axios.get('http://localhost:19245/getSystem', {}).then((res) => {


            console.log(res)
            const result = (res.data.data)
            const type = result.value
            const typeArr = result.typeArr
            const optimalObj = result.optimalObj
            const maxObj = result.maxObj
            setSystemType(type)

            useEquipStore.getState().setSettingValue(optimalObj[type])
            useEquipStore.getState().setSettingValueMax(maxObj[type])
            useEquipStore.getState().setSettingValueOptimal(optimalObj[type])

            if (typeArr) {
                try {
                    const selectArr = typeArr.map((a) => {
                        return {
                            label: t(a),
                            value: a
                        }
                    })
                    setSystemTypeArr(selectArr)
                } catch (e) {

                }

            }
            // setSystemTypeArr()
        })
    }, [])


    function changeViewProp(value) {
        console.log(value, setting)
        // setting.current?.changeViewProp(value)
        setShowProp(value)
    }

    const handleChangeViewProp = useCallback((value) => {
        console.log(value, setting)
        // setting.current?.changeViewProp(value)
        setShowProp(value)
    }, [])


    const threeComponentObj = {
        bigHand: <Canvas ref={threeRef} sitnum1={64} sitnum2={64} />,
        bed: <Bed sitData={disPlayDataRef} changeViewProp={handleChangeViewProp} type={'bed'} ref={threeRef} sitnum1={32} sitnum2={32} />,
        hand: <Canvas changeViewProp={handleChangeViewProp} ref={threeRef} sitnum1={32} sitnum2={32} positionInfo={[-40, 0, -60]} />,
        foot: <Canvas ref={threeRef} sitnum1={32} sitnum2={32} positionInfo={[-40, 0, -60]} />,
        // endi: <Car changeViewProp={handleChangeViewProp} type={'bed'} ref={threeRef} sitnum1={32} sitnum2={32} />,
        car: <Endi
            sitData={disPlayDataRef}
            changeViewProp={handleChangeViewProp}
            ref={threeRef}
            backConfig={{ sitnum1: 32, sitnum2: 32, sitInterp: 4, sitInterp1: 2, sitOrder: 3 }}
            sitConfig={{ sitnum1: 32, sitnum2: 32, sitInterp: 2, sitInterp1: 2, sitOrder: 3 }}
        />,
        endi: <Endi1 sitData={disPlayDataRef} changeViewProp={handleChangeViewProp} ref={threeRef}
            backConfig={{ sitnum1: 64, sitnum2: 50, sitInterp: 2, sitInterp1: 2, sitOrder: 3 }}
            sitConfig={{ sitnum1: 46, sitnum2: 46, sitInterp: 2, sitInterp1: 2, sitOrder: 3 }}
        />
    }

    const numComponentObj = {
        bigHand: <NumThree size={64} sitData={disPlayDataRef} />,
        bed: <NumThree size={32} sitData={disPlayDataRef} />,
        hand: <NumThree size={32} sitData={disPlayDataRef} />,
        foot: <NumThree size={32} sitData={disPlayDataRef} />,
        car: <NumThree size={32} sitData={disPlayDataRef} />,
        endi: <NumThree size={64} sitData={disPlayDataRef} />,
    }

    const num3DComponentObj = {
        bigHand: <Num3D sitData={disPlayDataRef} />,
        bed: <Num3D sitData={disPlayDataRef} />,
        hand: <Num3D sitData={disPlayDataRef} />,
        foot: <Num3D sitData={disPlayDataRef} />,
        car: <Num3D sitData={disPlayDataRef} />,
    }

    const [showProp, setShowProp] = useState(100)

    const [displayType, setDisplayType] = useState('back2D')

    const [onRuler, setOnRuler] = useState(false)
    const [onSelect, setOnSelect] = useState(false)
    const [onMagnifier, setOnMagnifier] = useState(false)


    return (

        <div className=''>
            <pageContext.Provider value={{
                equipStatus,
                settingValue,
                setSettingValue,
                selectArr,
                setSelectArr,
                brushInstance,
                changeWsLocalData,
                wsLocalData,
                changeDataDirection,
                setDisplay,
                display,
                newRuler,
                systemType,
                setDisplayType,
                displayType,
                onRuler, setOnRuler, onSelect, setOnSelect,
                onMagnifier, setOnMagnifier
            }} >
                <Title />
                <ViewSetting showProp={showProp} setShowProp={setShowProp} three={threeRef} />
                <ColAndHistory playBack={playBack} />
                {/* <Canvas /> */}
                {/* <Num /> */}
                {/* <Aside /> */}
                <ChartsAside sitData={disPlayDataRef} chartData={chartRef} />
                {/* <CanvasShow /> */}


                {display == 'contrast' ?
                    <NumThresContrast sitData={disPlayDataRef} displayType={displayType} />
                    : display == 'num' ?

                        // numComponentObj[systemType]
                        <NumThres sitData={disPlayDataRef} displayType={displayType} />
                        : display == 'point3D' ? threeComponentObj[systemType] : num3DComponentObj[systemType]}
            </pageContext.Provider>
        </div>
    )
}



export default withTranslation('translation')(Test)
