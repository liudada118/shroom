import { Button, Input, message, Modal } from 'antd'
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
import BrushModePanel from '../../components/selectBox/BrushModePanel'
import BrushDashboardPanel from '../../components/selectBox/BrushDashboardPanel'
import SelectSet from '../../components/title/SelectSet'
import { Scheduler } from '../../scheduler/scheduler'
import { newRuler } from '../../components/ruler/newRuler'
import { backYToX, calcCentroidRatio, colSelectMatrix, endiBackPressFn, endiSitPressFn, graCenter, kurtosis, mean, normalPDF, sitYToX, skewness, variance } from '../../util/util'
import { matrixGenBox, removeHistoryBox } from '../../assets/util/selectMatrix'
import NumThresContrast from '../../components/contrast/NumThresContrast'
import { gaussianBlur1D, pressFN } from './util'
import { isMoreMatrix } from '../../assets/util/util'
import { useWebSocket } from '../../hooks/useWebSocket'
import { useMatrixData } from '../../hooks/useMatrixData'
import NumThres from '../../components/three/NumThres'
import { buildFallbackParams } from '../../util/request'

export const pageContext = createContext(null)

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
        processSensorFrame,
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

    // ─── 框选订阅（支持多框选） ─────────────────────────────
    useEffect(() => {
        const cb = (arr) => {
            useEquipStore.getState().setSelectArr(arr)
            const status = useEquipStore.getState().dataStatus
            if (status !== 'replay' || !Array.isArray(arr) || arr.length === 0) return

            const systemType = getSysType()
            const displayType = getDisplayType()
            let typeKey = systemType
            if (isMoreMatrix(systemType)) {
                typeKey = `${systemType}-${displayType.includes('back') ? 'back' : displayType.includes('sit') ? 'sit' : 'back'}`
            }

            // 使用第一个框作为回放查询的选区（后端目前只支持单选区）
            const range = arr[0]
            if (!range) return
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
                params: { selectJson: JSON.stringify(selectJson) },
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
    const [sitData, setSitData] = useState([])
    const [equipStatus, setStatus] = useState({ back: 'offline', sit: 'offline', data: new Array(4096).fill(0) })
    const setValueData = localStorage.getItem('setValueData') ? JSON.parse(localStorage.getItem('setValueData')) : { gauss: 1, color: 200, filter: 1, height: 1, coherent: 1 }
    const [settingValue, setSettingValue] = useState(setValueData)
    const [selectArr, setSelectArr] = useState([])
    const [wsLocalData, setWsLocalData] = useState(new Array(4096).fill(0))

    const [display, setDisplay] = useState('point3D')
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
            backPointConfig={{ position: [0.0000, -14.0000, -1.5000], rotation: [-1.8326, 0.0000, 0.0000], scale: [0.0021, 0.0030, 0.0037], pointSize: 1.10 }}
            sitPointConfig={{ position: [0.0000, -30.5000, -6.0000], rotation: [-0.5236, 0.0000, 0.0000], scale: [0.0022, 0.0025, 0.0022], pointSize: 0.75 }}
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

    // 路由切换 / Test 卸载时, 隐藏所有框 + 卸事件监听 (数据保留, 切回再 startBrush 可恢复)
    useEffect(() => {
        return () => {
            if (brushInstance) brushInstance.pauseBrush()
        }
    }, [])

    // 切换 displayType / display / onSelect 时同步给 BrushManager
    useEffect(() => {
        if (!brushInstance) return
        if (display === 'num' && (displayType === 'back2D' || displayType === 'sit2D')) {
            brushInstance.setActiveKey(displayType)
        } else {
            brushInstance.setActiveKey(null)
        }
    }, [display, displayType])

    // 切换前拦截器: 在切走当前 displayType 之前调用, 检查 dirty + 弹保存提示
    // 用法: pageInfo.confirmBrushSwitch(() => { 实际执行切换的代码 })
    // 如果当前组没有未保存的更改, 直接执行 onProceed (无提示)
    const confirmBrushSwitch = useCallback((onProceed) => {
        if (!brushInstance) { onProceed(); return }
        const oldKey = brushInstance.currentKey
        if (!oldKey || !brushInstance.isDirty(oldKey)) { onProceed(); return }
        const arr = brushInstance.boxesMap[oldKey] || []
        if (!arr.length) { onProceed(); return }
        const label = oldKey === 'back2D' ? '靠垫' : '坐垫'
        Modal.confirm({
            title: '保存采集框?',
            content: `${label} 上有 ${arr.length} 个采集框未保存,是否保存为预设?`,
            okText: '保存',
            cancelText: '不保存',
            onOk: () => {
                let inputName = `${label} 预设 ${new Date().toLocaleTimeString().slice(0, 8)}`
                Modal.confirm({
                    title: '保存预设',
                    content: (
                        <Input
                            defaultValue={inputName}
                            autoFocus
                            onChange={(e) => { inputName = e.target.value }}
                            placeholder='预设名称'
                        />
                    ),
                    okText: '保存',
                    cancelText: '取消',
                    onOk: () => {
                        const preset = brushInstance.savePreset(inputName, oldKey)
                        if (preset) message.success(`已保存「${preset.name}」`)
                        brushInstance.clearKey(oldKey)
                        onProceed()
                    },
                    onCancel: () => { brushInstance.clearKey(oldKey); onProceed() },
                })
            },
            onCancel: () => { brushInstance.clearKey(oldKey); onProceed() },
        })
    }, [brushInstance])

    // Ctrl+S 快速保存当前框为预设 (仅在框选工具激活 + 2D 数字界面时生效)
    useEffect(() => {
        if (!brushInstance) return
        const handler = (e) => {
            if (!(e.ctrlKey || e.metaKey)) return
            if ((e.key || '').toLowerCase() !== 's') return
            const tag = (e.target?.tagName || '').toLowerCase()
            if (tag === 'input' || tag === 'textarea' || e.target?.isContentEditable) return
            if (!onSelect || display !== 'num') return
            if (!brushInstance.currentKey) return
            if (!brushInstance.rangeArr.length) return
            e.preventDefault()
            const label = displayType === 'back2D' ? '靠垫' : displayType === 'sit2D' ? '坐垫' : '当前设备'
            const preset = brushInstance.savePreset(`${label} 预设 ${new Date().toLocaleTimeString().slice(0, 8)}`)
            if (preset) message.success(`已保存预设「${preset.name}」`)
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [onSelect, display, displayType])

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
                onMagnifier, setOnMagnifier,
                confirmBrushSwitch,
            }} >
                <Title />
                <ViewSetting showProp={showProp} setShowProp={setShowProp} three={threeRef} />
                <ColAndHistory playBack={playBack} />
                <ChartsAside sitData={disPlayDataRef} chartData={chartRef} />

                {onSelect && <SelectSet />}
                {onSelect && <BrushDashboardPanel />}
                {onSelect && <BrushModePanel />}

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
