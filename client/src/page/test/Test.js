import { Button, Input } from 'antd'
import axios from 'axios'
import React, { createContext, memo, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation, withTranslation } from 'react-i18next'
import Canvas from '../../components/three/CanvasMemo'
import Bed from '../../components/three/ThreeAndModel'
import Car from '../../components/three/ThreeAndCar'
import Title from '../../components/title/Title'
import { useWindowSize } from '../../hooks/useWindowsize'
import ViewSetting from '../../components/viewSetting/ViewSetting'
import ColAndHistory from '../../components/ColAndHistory/ColAndHistory'
import Num3D from '../../components/num/Num3D'
import NumThree from '../../components/three/NumThreeColorV2'
import { SelectionHelper } from '../../components/selectBox/SelectBox'
import Aside from '../../components/aside/Aside'
import { brushInstance } from '../../components/selectBox/newSelecttBox'
import { getDisplayType, getSelectArr, getsetDisplayStatus, getSettingValue, getStatus, getSysType, useEquipStore } from '../../store/equipStore'
import { pointConfig, systemConfig, systemPointConfig, localAddress, wsAddress } from '../../util/constant'
import CanvasShow from '../../components/canvasShow/CanvasShow'
import { shallow } from 'zustand/shallow'
import Endi from '../../components/three/ThreeAndCarPoint'
import Endi1 from '../../components/three/ThreeAndCarPointV2'
import { lengthObj } from '../../assets/util/constant'
import ChartsAside from '../../components/chartsAside/ChartsAside'
import { Scheduler } from '../../scheduler/scheduler'
import { newRuler } from '../../components/ruler/newRuler'
import { backYToX, calcCentroidRatio, colSelectMatrix, endiBackPressFn, endiSitPressFn, graCenter, kurtosis, mean, normalPDF, sitYToX, skewness, variance } from '../../util/util'
import { removeHistoryBox } from '../../assets/util/selectMatrix'
import NumThresContrast from '../../components/contrast/NumThresContrast'
import { gaussianBlur1D, pressFN } from './util'
import { isMoreMatrix } from '../../assets/util/util'
import { useWebSocket } from '../../hooks/useWebSocket'
import { useMatrixData } from '../../hooks/useMatrixData'
import NumThres from '../../components/three/NumThres'
import { buildFallbackParams } from '../../util/request'
import { formatSelectionName } from '../../util/selectionName'
import { loadVisualSettingValue, normalizeVisualSettingMax } from '../../util/visualSettingStorage'

export const pageContext = createContext(null)

function getHistoryChartKeyCandidates(key) {
    const candidates = [key]
    if (typeof key === 'string' && key.includes('-')) {
        candidates.push(key.split('-').pop())
    }
    if (typeof key === 'string' && !key.includes('-')) {
        const systemType = getSysType()
        if (systemType) candidates.push(`${systemType}-${key}`)
    }
    return [...new Set(candidates.filter(Boolean))]
}

function filterSelectedHistoryChartKeys(obj = {}, selectedKeys = new Set()) {
    const candidateSet = new Set()
    selectedKeys.forEach((key) => {
        getHistoryChartKeyCandidates(key).forEach(candidate => candidateSet.add(candidate))
    })
    return Object.fromEntries(
        Object.entries(obj).filter(([key]) => candidateSet.has(key))
    )
}

function Test() {
    const { t, i18n } = useTranslation()
    const [value, setValue] = useState('')

    const connPort = () => {
        axios.get(`${localAddress}/connPort`, {}).then((res) => {
            console.log(res)
        })
    }

    const handInput = (e) => {
        setValue(e.target.value)
    }

    const postKey = () => {
        const payload = { key: value }
        axios({
            method: 'post',
            url: `${localAddress}/bindKey`,
            params: buildFallbackParams(payload),
            data: payload
        })
    }

    useWindowSize()

    // ─── 使用抽取的 Hook ─────────────────────────────────
    const {
        sitDataRef,
        disPlayDataRef,
        chartRef,
        dataDirection,
        setDataDirection,
        processSensorFrame,
        reprocessLastSensorFrame,
        changeDataDirection,
        changeWsLocalData,
    } = useMatrixData()

    const [playBack, setPlayBack] = useState(false)
    const wsLocalDataRef = useRef({ data: new Array(4096).fill(0), flag: false })

    // 持久化的数据对象（跨帧累积）
    const persistentDataRef = useRef({})

    // ─── WebSocket 连接 ──────────────────────────────────
    useWebSocket({
        onSitData: (sitData) => {
            processSensorFrame(sitData, persistentDataRef.current, { source: 'realtime' })
        },
        onSitDataPlay: (sitDataPlay) => {
            processSensorFrame(sitDataPlay, persistentDataRef.current, { source: 'playback' })
        },
        onIndex: (index) => {
            useEquipStore.getState().setDataStatus('replay')
            setPlayBack(true)
            const history = useEquipStore.getState().history
            useEquipStore.getState().setHistoryStatus({ ...history, index })
        },
        onTimestamp: (timestamp) => {
            useEquipStore.getState().setDataStatus('replay')
            const history = useEquipStore.getState().history
            useEquipStore.getState().setHistoryStatus({ ...history, timestamp })
        },
        onMacInfo: (macInfo) => {
            useEquipStore.getState().setMacInfo(macInfo)
        },
        onConnectResult: (result) => {
            if (result?.success) {
                useEquipStore.getState().setConnectState('connected')
                useEquipStore.getState().setConnectionError(null)
                if (result.macInfo) useEquipStore.getState().setMacInfo(result.macInfo)
            } else if (result?.code || result?.message) {
                useEquipStore.getState().setConnectState('failed')
                useEquipStore.getState().setConnectionError(result)
            }
        },
        onDataQuality: (quality) => {
            const key = quality?.type || quality?.port || 'unknown'
            const prev = useEquipStore.getState().dataQuality || {}
            useEquipStore.getState().setDataQuality({ ...prev, [key]: quality })
            if (quality?.status === 'device_error') {
                useEquipStore.getState().setConnectState('deviceError')
                useEquipStore.getState().setConnectionError(quality)
            }
        },
    })

    // ─── 框选订阅（支持多框选） ─────────────────────────────
    useEffect(() => {
        const cb = (arr) => {
            const safeArr = Array.isArray(arr)
                ? arr.map(({ _element, ...range }) => range)
                : []
            useEquipStore.getState().setSelectArr(safeArr)
            const status = useEquipStore.getState().dataStatus
            if (status !== 'replay') return
            if (safeArr.length === 0) {
                useEquipStore.getState().setPlaybackHasSelection(false)
                useEquipStore.getState().setHistoryChart({ pressArr: {}, areaArr: {} })
                removeHistoryBox()
                window.setTimeout(() => {
                    if (brushInstance.rangeArr?.length) return
                    axios({
                        method: 'post',
                        url: `${localAddress}/getDbHistorySelect`,
                        params: { selectJson: JSON.stringify({}) },
                        data: { selectJson: {} },
                    }).catch(() => { })
                }, 50)
                reprocessLastSensorFrame(persistentDataRef.current, { source: 'playback' })
                return
            }
            useEquipStore.getState().setPlaybackHasSelection(true)
            reprocessLastSensorFrame(persistentDataRef.current, { source: 'playback' })

            const systemType = getSysType()
            const displayType = getDisplayType()
            const range = safeArr[0]
            let typeKey = range.matrixKey || systemType
            if (isMoreMatrix(systemType)) {
                typeKey = range.matrixKey || `${systemType}-${displayType.includes('back') ? 'back' : displayType.includes('sit') ? 'sit' : 'back'}`
            }

            // 使用第一个框作为回放查询的选区（后端目前只支持单选区）
            if (!range) return
            if (!systemPointConfig[typeKey]) return
            const matrix = colSelectMatrix('canvasThree', range, systemPointConfig[typeKey])
            if (!matrix) return
            const selectJson = {}
            selectJson[typeKey] = {
                xStart: matrix.xStart,
                xEnd: matrix.xEnd,
                yStart: matrix.yStart,
                yEnd: matrix.yEnd,
                width: systemPointConfig[typeKey].width,
                height: systemPointConfig[typeKey].height,
                name: formatSelectionName(range.name, 1, t)
            }

            axios({
                method: 'post',
                url: `${localAddress}/getDbHistorySelect`,
                params: { selectJson: JSON.stringify(selectJson) },
                data: { selectJson }
            }).then((res) => {
                const data = res.data?.data || {}
                const { areaArr, pressArr } = data
                if (areaArr || pressArr) {
                    const selectedKeys = new Set(Object.keys(selectJson))
                    useEquipStore.getState().setHistoryChart({
                        areaArr: filterSelectedHistoryChartKeys(areaArr || {}, selectedKeys),
                        pressArr: filterSelectedHistoryChartKeys(pressArr || {}, selectedKeys),
                        selection: {
                            active: true,
                            ranges: safeArr,
                        },
                    })
                }
            }).catch(() => { })
        }
        brushInstance.subscribe(cb)
        return () => brushInstance.unsubscribe(cb)
    }, [])

    // ─── 调度器启动 ──────────────────────────────────────
    useEffect(() => {
        Scheduler.start()
    }, [])

    // ─── 状态 ────────────────────────────────────────────
    const [sitData, setSitData] = useState([])
    const [equipStatus, setStatus] = useState({ back: 'offline', sit: 'offline', data: new Array(4096).fill(0) })
    const setValueData = localStorage.getItem('setValueData') ? JSON.parse(localStorage.getItem('setValueData')) : { gauss: 1, color: 200, filter: 1, height: 1, coherent: 1 }
    const [settingValue, setSettingValue] = useState(setValueData)
    const [selectArr, setSelectArr] = useState([])
    const [wsLocalData, setWsLocalData] = useState(new Array(4096).fill(0))

    const [display, setDisplayState] = useState('point3D')
    const setDisplay = useCallback((nextDisplay) => {
        setDisplayState((prevDisplay) => {
            const resolvedDisplay = typeof nextDisplay === 'function' ? nextDisplay(prevDisplay) : nextDisplay
            useEquipStore.getState().setDisplay(resolvedDisplay)
            return resolvedDisplay
        })
    }, [])
    const threeRef = useRef()
    const setting = useRef()

    const systemType = useEquipStore(s => s.systemType, shallow)

    useLayoutEffect(() => {
        const { setSystemType, setSystemTypeArr } = useEquipStore.getState()
        axios.get(`${localAddress}/getSystem`, {}).then((res) => {
            const result = res.data.data
            const type = result.value
            const typeArr = result.typeArr
            const optimalObj = result.optimalObj
            const maxObj = result.maxObj
            const currentMaxObj = normalizeVisualSettingMax(maxObj[type])
            setSystemType(type)

            useEquipStore.getState().setSettingValue(loadVisualSettingValue(type, optimalObj[type], currentMaxObj))
            useEquipStore.getState().setSettingValueMax(currentMaxObj)
            useEquipStore.getState().setSettingValueOptimal(optimalObj[type])

            if (typeArr) {
                try {
                    const selectArr = typeArr.map((a) => ({
                        label: t(a),
                        value: a
                    }))
                    setSystemTypeArr(selectArr)
                } catch (e) { }
            }
        })
        axios.get(`${localAddress}/getDataDirection`, {}).then((res) => {
            const direction = res.data?.data?.dataDirection
            if (direction) setDataDirection(direction)
        }).catch(() => { })
    }, [])

    const handleChangeViewProp = useCallback((value) => {
        setShowProp(value)
    }, [])

    // ─── 3D 组件映射 ─────────────────────────────────────
    const threeComponentObj = {
        bigHand: <Canvas ref={threeRef} sitnum1={64} sitnum2={64} />,
        bed: <Bed sitData={disPlayDataRef} changeViewProp={handleChangeViewProp} type={'bed'} ref={threeRef} sitnum1={32} sitnum2={32} />,
        hand: <Canvas changeViewProp={handleChangeViewProp} ref={threeRef} sitnum1={32} sitnum2={32} positionInfo={[-40, 0, -60]} />,
        foot: <Canvas ref={threeRef} sitnum1={32} sitnum2={32} positionInfo={[-40, 0, -60]} />,
        car: <Endi
            sitData={disPlayDataRef}
            changeViewProp={handleChangeViewProp}
            ref={threeRef}
            backConfig={{ sitnum1: 32, sitnum2: 32, sitInterp: 4, sitInterp1: 2, sitOrder: 3 }}
            sitConfig={{ sitnum1: 32, sitnum2: 32, sitInterp: 2, sitInterp1: 2, sitOrder: 3 }}
        />,
        endi: <Endi1 key="endi" sitData={disPlayDataRef} changeViewProp={handleChangeViewProp} ref={threeRef}
            backConfig={{ sitnum1: 64, sitnum2: 50, sitInterp: 2, sitInterp1: 2, sitOrder: 3 }}
            sitConfig={{ sitnum1: 46, sitnum2: 46, sitInterp: 2, sitInterp1: 2, sitOrder: 3 }}
        />,
        carY: <Endi1 key="carY" sitData={disPlayDataRef} changeViewProp={handleChangeViewProp} ref={threeRef}
            backConfig={{ sitnum1: 32, sitnum2: 32, sitInterp: 2, sitInterp1: 2, sitOrder: 3 }}
            sitConfig={{ sitnum1: 32, sitnum2: 32, sitInterp: 2, sitInterp1: 2, sitOrder: 3 }}
            backPointConfig={{ position: [2.5000, -11.0000, -1.0000], rotation: [-1.8326, 0.0000, 0.0000], scale: [0.0015, 0.0030, 0.0026], pointSize: 1.00 }}
            sitPointConfig={{ position: [0.0000, -30.0000, -5.0000], rotation: [-0.5236, 0.0000, 0.0000], scale: [0.0018, 0.0018, 0.0018], pointSize: 1.00 }}
        />
    }

    const numComponentObj = {
        bigHand: <NumThree size={64} sitData={disPlayDataRef} />,
        bed: <NumThree size={32} sitData={disPlayDataRef} />,
        hand: <NumThree size={32} sitData={disPlayDataRef} />,
        foot: <NumThree size={32} sitData={disPlayDataRef} />,
        car: <NumThree size={32} sitData={disPlayDataRef} />,
        endi: <NumThree size={64} sitData={disPlayDataRef} />,
        carY: <NumThree size={32} sitData={disPlayDataRef} />,
    }

    const num3DComponentObj = {
        bigHand: <Num3D sitData={disPlayDataRef} />,
        bed: <Num3D sitData={disPlayDataRef} />,
        hand: <Num3D sitData={disPlayDataRef} />,
        foot: <Num3D sitData={disPlayDataRef} />,
        car: <Num3D sitData={disPlayDataRef} />,
        carY: <Num3D sitData={disPlayDataRef} />,
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
                dataDirection,
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
                <Title hideSecondTitle={display === 'contrast'} />
                {display !== 'contrast' ? <ViewSetting showProp={showProp} setShowProp={setShowProp} three={threeRef} /> : null}
                {display !== 'contrast' ? <ColAndHistory playBack={playBack} /> : null}
                {display !== 'contrast' ? <ChartsAside sitData={disPlayDataRef} chartData={chartRef} /> : null}

                {display === 'contrast' ?
                    <NumThresContrast sitData={disPlayDataRef} displayType={displayType} />
                    : display === 'num' ?
                        <NumThres sitData={disPlayDataRef} displayType={displayType} />
                        : display === 'point3D' ? threeComponentObj[systemType] : num3DComponentObj[systemType]}
            </pageContext.Provider>
        </div>
    )
}

export default withTranslation('translation')(Test)
