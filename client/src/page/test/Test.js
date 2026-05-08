import axios from 'axios'
import React, { createContext, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation, withTranslation } from 'react-i18next'
import Canvas from '../../components/three/CanvasMemo'
import Bed from '../../components/three/ThreeAndModel'
import { useWindowSize } from '../../hooks/useWindowsize'
import ColAndHistory from '../../components/ColAndHistory/ColAndHistory'
import Num3D from '../../components/num/Num3D'
import NumThree from '../../components/three/NumThreeColorV2'
import { brushInstance } from '../../components/selectBox/newSelecttBox'
import { getDisplayType, getSelectArr, getsetDisplayStatus, getSettingValue, getStatus, getSysType, useEquipStore } from '../../store/equipStore'
import { pointConfig, systemConfig, systemPointConfig, localAddress, wsAddress } from '../../util/constant'
import { shallow } from 'zustand/shallow'
import Endi from '../../components/three/ThreeAndCarPoint'
import Endi1 from '../../components/three/ThreeAndCarPointV2'
import { lengthObj } from '../../assets/util/constant'
import ChartsAside from '../../components/chartsAside/ChartsAside'
import { Scheduler } from '../../scheduler/scheduler'
import { newRuler } from '../../components/ruler/newRuler'
import { colSelectMatrix, isMoreMatrix } from '../../util/util'
import { matrixGenBox, removeHistoryBox } from '../../assets/util/selectMatrix'
import NumThresContrast from '../../components/contrast/NumThresContrast'
import { useWebSocket } from '../../hooks/useWebSocket'
import { useMatrixData } from '../../hooks/useMatrixData'
import NumThres from '../../components/three/NumThres'
import AppLayout from '../../components/layout/AppLayout'
import SitBackView from '../../components/layout/SitBackView'

export const pageContext = createContext(null)

function Test() {
    const { t, i18n } = useTranslation()

    useWindowSize()

    // ─── 使用抽取的 Hook ─────────────────────────────────
    const {
        sitDataRef,
        disPlayDataRef,
        chartRef,
        dataDirection,
        processSensorFrame,
        changeDataDirection,
        changeWsLocalData,
    } = useMatrixData()

    const [playBack, setPlayBack] = useState(false)
    const persistentDataRef = useRef({})

    // ─── WebSocket 连接 ──────────────────────────────────
    useWebSocket({
        onSitData: (sitData) => {
            processSensorFrame(sitData, persistentDataRef.current)
        },
        onSitDataPlay: (sitDataPlay) => {
            processSensorFrame(sitDataPlay, persistentDataRef.current)
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
    })

    // ─── 框选订阅 ────────────────────────────────────────
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
                url: `${localAddress}/getDbHistorySelect`,
                data: { selectJson }
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
        brushInstance.subscribe(cb)
    }, [])

    // ─── 调度器启动 ──────────────────────────────────────
    useEffect(() => {
        Scheduler.start()
    }, [])

    // ─── 状态 ────────────────────────────────────────────
    const [equipStatus] = useState({ back: 'offline', sit: 'offline' })
    const setValueData = localStorage.getItem('setValueData')
        ? JSON.parse(localStorage.getItem('setValueData'))
        : { gauss: 1, filter: 1, height: 1, coherent: 1 }
    const [settingValue, setSettingValue] = useState(setValueData)
    const [selectArr, setSelectArr] = useState([])
    const [wsLocalData] = useState(new Array(4096).fill(0))

    const display = useEquipStore(s => s.display, shallow)
    const setDisplay = useEquipStore(s => s.setDisplay)
    const threeRef = useRef()
    const systemType = useEquipStore(s => s.systemType, shallow)
    const displayType = useEquipStore(s => s.displayType, shallow)
    const setDisplayType = useEquipStore(s => s.setDisplayType)

    useLayoutEffect(() => {
        const { setSystemType, setSystemTypeArr } = useEquipStore.getState()
        axios.get(`${localAddress}/getSystem`, {}).then((res) => {
            const result = res.data.data
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
                    const selectArr = typeArr.map((a) => ({
                        label: t(a),
                        value: a
                    }))
                    setSystemTypeArr(selectArr)
                } catch (e) { }
            }
        })
    }, [])

    const handleChangeViewProp = useCallback((value) => {
        setShowProp(value)
    }, [])

    // ─── 3D 组件映射（3D整体视图）────────────────────────
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
        endi: <Endi1 sitData={disPlayDataRef} changeViewProp={handleChangeViewProp} ref={threeRef}
            backConfig={{ sitnum1: 64, sitnum2: 50, sitInterp: 2, sitInterp1: 2, sitOrder: 3 }}
            sitConfig={{ sitnum1: 46, sitnum2: 46, sitInterp: 2, sitInterp1: 2, sitOrder: 3 }}
        />
    }

    const num3DComponentObj = {
        bigHand: <Num3D sitData={disPlayDataRef} />,
        bed: <Num3D sitData={disPlayDataRef} />,
        hand: <Num3D sitData={disPlayDataRef} />,
        foot: <Num3D sitData={disPlayDataRef} />,
        car: <Num3D sitData={disPlayDataRef} />,
    }

    const [showProp, setShowProp] = useState(100)
    const [onRuler, setOnRuler] = useState(false)
    const [onSelect, setOnSelect] = useState(false)
    const [onMagnifier, setOnMagnifier] = useState(false)

    // ─── 视图内容渲染 ─────────────────────────────────────
    // AppLayout 通过 store 的 displayType 来决定显示哪个视图
    // 'all' / '' → 3D整体; 'sit' / 'sit2D' → 坐垫; 'back' / 'back2D' → 靠背
    const renderMainContent = () => {
        const dt = displayType
        if (dt === 'sit' || dt === 'sit2D') {
            return <SitBackView viewType="sit" sitData={disPlayDataRef} />
        }
        if (dt === 'back' || dt === 'back2D') {
            return <SitBackView viewType="back" sitData={disPlayDataRef} />
        }
        // 3D整体（all 或其他）
        if (display === 'contrast') {
            return <NumThresContrast sitData={disPlayDataRef} displayType={dt} />
        }
        if (display === 'num') {
            return <NumThres sitData={disPlayDataRef} displayType={dt} />
        }
        if (display === 'point3D') {
            return threeComponentObj[systemType]
        }
        return num3DComponentObj[systemType]
    }

    return (
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
        }}>
            {/* 保留 ColAndHistory（含历史数据 Drawer）和 ChartsAside */}
            <ColAndHistory playBack={playBack} />
            <ChartsAside sitData={disPlayDataRef} chartData={chartRef} />

            {/* 新版主布局 */}
            <AppLayout
                chartRef={chartRef}
                threeRef={threeRef}
                disPlayDataRef={disPlayDataRef}
                playBack={playBack}
                changeWsLocalData={changeWsLocalData}
            >
                {renderMainContent()}
            </AppLayout>
        </pageContext.Provider>
    )
}

export default withTranslation('translation')(Test)
