import React, { forwardRef, useContext, useEffect, useImperativeHandle, useMemo, useState } from 'react'
import './index.scss'
import { Dropdown, Input, Popover, message } from 'antd'
import { pageContext } from '../../page/test/Test';
import { withTranslation } from 'react-i18next';
import { getSysType, useEquipStore } from '../../store/equipStore';
import { shallow } from 'zustand/shallow';
import { isMoreMatrix } from '../../assets/util/util';
import { getMatrixPartFromDisplayType, getMatrixPartLabelKey, getSystemMatrixParts, pointConfig } from '../../util/constant';
import { APP_VERSION } from '../../util/version';

const normalizeAngleIndex = (value) => {
    const index = Number(value)
    return Number.isFinite(index) && index >= 0 && index <= 2 ? Math.trunc(index) : 0
}

let xvalue = normalizeAngleIndex(localStorage.getItem('bedz'))


// export default function ViewSetting(props) {

// }

const DropRight = () => {
    const list = ['靠背', '座椅']
    return
}

const ViewSetting = (props) => {
    const { t, i18n } = props;
    const pageInfo = useContext(pageContext);
    console.log('ViewSetting')
    const { setDisplay, display, setDisplayType, setOnRuler, onSelect } = pageInfo
    // const display = useEquipStore(s => s.display, shallow);
    // const setDisplay = useEquipStore.getState().setDisplay

    const setPointRotationIndex = (index) => {
        xvalue = normalizeAngleIndex(index)
        localStorage.setItem('bedz', String(xvalue))
        props.three?.current?.changePointRotation(xvalue)
    }

    useEffect(() => {
        setPointRotationIndex(xvalue)
    }, [])

    const threeViewChange = () => {
        console.log(111)
        setPointRotationIndex(xvalue + 1)

    }

    const { showProp, setShowProp } = props
    const num2DZoom = useEquipStore(s => s.num2DZoom, shallow)
    const setNum2DZoom = useEquipStore.getState().setNum2DZoom



    // 等比例缩放：每次按固定比例（约10%）缩放，范围 10%~300%
    const ZOOM_MIN = 10
    const ZOOM_MAX = 300
    const NUM_2D_ZOOM_MIN = 50
    const NUM_2D_ZOOM_MAX = 200
    const ZOOM_STEP = 10

    const subShow = () => {
        if (display == 'point3D') {
            let newVal = showProp - ZOOM_STEP
            newVal = Math.max(ZOOM_MIN, newVal)
            if (newVal !== showProp) {
                setShowProp(newVal)
                props.three?.current?.changeCamera(newVal, { previousValue: showProp })
            }
        } else if (display == 'num') {
            if (onSelect) return
            const newVal = Math.max(NUM_2D_ZOOM_MIN, num2DZoom - ZOOM_STEP)
            if (newVal !== num2DZoom) {
                setNum2DZoom(newVal)
            }
        }
    }

    const addShow = () => {
        if (display == 'point3D') {
            let newVal = showProp + ZOOM_STEP
            newVal = Math.min(ZOOM_MAX, newVal)
            if (newVal !== showProp) {
                setShowProp(newVal)
                props.three?.current?.changeCamera(newVal, { previousValue: showProp })
            }
        } else if (display == 'num') {
            if (onSelect) return
            const newVal = Math.min(NUM_2D_ZOOM_MAX, num2DZoom + ZOOM_STEP)
            if (newVal !== num2DZoom) {
                setNum2DZoom(newVal)
            }
        }
    }



    const changeView = () => {

    }

    const systemType = useEquipStore(s => s.systemType, shallow);
    const displayType = useEquipStore(s => s.displayType, shallow);
    const matrixParts = useMemo(() => getSystemMatrixParts(systemType), [systemType])
    const modelParts = useMemo(() => matrixParts.filter((part) => part.supportsModel3D), [matrixParts])
    const [carType, setCarType] = useState('all')
    const carArr = useMemo(() => ['all', ...modelParts.map((part) => part.key)], [modelParts])
    const car2DArr = useMemo(() => matrixParts.map((part) => part.display2D || `${part.key}2D`), [matrixParts])
    const car3DArr = useMemo(() => modelParts.map((part) => part.display3D || `${part.key}3D`), [modelParts])
    const getTypePart = (type) => getMatrixPartFromDisplayType(type)
    const getTypeLabel = (type) => {
        if (type === 'all') return t('all')
        return t(getMatrixPartLabelKey(getTypePart(type)))
    }

    const hasDisplayData = (type) => {
        const displayStatus = useEquipStore.getState().displayStatus
        // 1) 优先按实时数据判断
        if (displayStatus && typeof displayStatus === 'object' && !Array.isArray(displayStatus)) {
            const statusEntries = Object.entries(displayStatus)
            const hasByPart = (part) => statusEntries.some(([key, arr]) => {
                if (!Array.isArray(arr) || arr.length <= 0) return false
                return key === part || key.endsWith(`-${part}`)
            })
            const partsWithData = matrixParts.filter((part) => hasByPart(part.key))
            if (partsWithData.length) {
                const part = getTypePart(type)
                if (part && part !== 'all') return hasByPart(part)
                return true
            }
        }
        // 2) 兜底：实时数据被重置或还没到 → 按设备配置允许
        const systemType = useEquipStore.getState().systemType
        const config = systemType ? pointConfig[systemType] : null
        if (!config) return true
        const part = getTypePart(type)
        if (part && part !== 'all') return !!config[part]
        return Object.keys(config).length > 0
    }

    const guard3D = () => {
        const s = useEquipStore.getState()
        if (s.dataStatus === 'replay' && s.playbackHasSelection) {
            message.warning(t('replaySelectionNo3D'))
            return false
        }
        return true
    }

    const warnMissingDisplayData = (type) => {
        const label = getTypeLabel(type)
        message.warning(t('missingDisplayData', { label }))
    }

    const getDefault2DDisplayType = () => {
        const target = car2DArr.find((type) => hasDisplayData(type))
        if (target) return target
        message.warning(t('missingSeatOrBackData'))
        return null
    }

    const normalizePoint3DType = (type) => {
        if (type && type !== 'current') return type
        const part = getTypePart(displayType)
        if (modelParts.some((item) => item.key === part)) return part
        return 'all'
    }

    const selectPoint3DView = (type = 'current') => {
        if (!guard3D()) return
        const nextType = normalizePoint3DType(type)
        if (nextType !== 'all' && !hasDisplayData(nextType)) {
            warnMissingDisplayData(nextType)
            return
        }
        setShowProp(100)
        setCarType(nextType)
        useEquipStore.getState().setDisplayType(nextType)
        setDisplayType(nextType)
        if (display != 'point3D') {
            setDisplay('point3D')
        }
        requestAnimationFrame(() => {
            props.three.current?.actionSit(nextType)
        })
        setPointRotationIndex(0)
        changeAllFun()
    }

    const selectNum2DView = (type) => {
        if (!hasDisplayData(type)) {
            warnMissingDisplayData(type)
            return
        }
        setNum2DZoom(100)
        setCarType(type)
        if (display != 'num') {
            setDisplay('num')
        }
        useEquipStore.getState().setDisplayType(type)
        setDisplayType(type)
        changeAllFun()
    }

    const changeCarViewContent = <div style={{ color: '#E6EBF0' }}>
        {
            carArr.map((type, index) => {
                return <div key={type} className='cursor' onClick={() => {
                    selectPoint3DView(type)
                }} style={{ padding: '5px 15px', borderRadius: 3, backgroundColor: carType == type ? '#0072EF' : 'unset' }}>{getTypeLabel(type)}</div>

            })
        }
    </div>

    const changeCar2DViewContent = <div style={{ color: '#E6EBF0' }}>
        {
            car2DArr.map((type, index) => {
                return <div key={type} className='cursor' onClick={() => {
                    selectNum2DView(type)
                }} style={{ padding: '5px 15px', borderRadius: 3, backgroundColor: carType == type ? '#0072EF' : 'unset' }}>{getTypeLabel(type)}</div>

            })
        }
    </div>

    const changeCar3DNumViewContent = <div style={{ color: '#E6EBF0' }}>
        {
            car3DArr.map((type, index) => {
                return <div key={type} className='cursor' onClick={() => {
                    if (!guard3D()) return
                    setCarType(type)
                    if (display != 'num3D') {
                        setDisplay('num3D')
                    }
                    props.three.current?.actionSit(type)
                    useEquipStore.getState().setDisplayType(type);
                     changeAllFun()
                }} style={{ padding: '5px 15px', borderRadius: 3, backgroundColor: carType == type ? '#0072EF' : 'unset' }}>{getTypeLabel(type)}</div>

            })
        }
    </div>
    const changeMoreViewContent = <div className="viewModeMenu">
        <div className="viewModeGroup">
            <div className="viewModeGroupTitle">{t('point3D')}</div>
            <div className="viewModeOptionRow">
                {carArr.map((type) => (
                    <button
                        key={type}
                        type="button"
                        className={`viewModeOption ${display === 'point3D' && displayType === type ? 'active' : ''}`}
                        onClick={() => selectPoint3DView(type)}
                    >
                        {getTypeLabel(type)}
                    </button>
                ))}
            </div>
        </div>
        <div className="viewModeGroup">
            <div className="viewModeGroupTitle">{t('num2D')}</div>
            <div className="viewModeOptionRow">
                {car2DArr.map((type) => (
                    <button
                        key={type}
                        type="button"
                        className={`viewModeOption ${display === 'num' && displayType === type ? 'active' : ''}`}
                        onClick={() => selectNum2DView(type)}
                    >
                        {getTypeLabel(type)}
                    </button>
                ))}
            </div>
        </div>
    </div>



    const changeViewContent = <div style={{ color: '#E6EBF0' }}>

        <div className='cursor' onClick={() => {
            selectPoint3DView('current')

        }} style={{ padding: '5px 15px', borderRadius: 3, backgroundColor: display == 'point3D' ? '#0072EF' : 'unset' }}>{t('point3D')}</div>


        {/* <div className='cursor' onClick={() => {
            setShowProp(100)
            setDisplay('num3D')
            changeAllFun()
        }} style={{ padding: '5px 15px', borderRadius: 3, backgroundColor: display == 'num3D' ? '#0072EF' : 'unset' }}>{t('num3D')}</div> */}


        <div className='cursor' onClick={() => {
            setNum2DZoom(100)
            setDisplay('num')
            changeAllFun()
        }} style={{ padding: '5px 15px', borderRadius: 3, backgroundColor: display == 'num' ? '#0072EF' : 'unset' }}>{t('num2D')}</div>

    </div>







    // const sysType = getSysType()

    const canSwitchPointAngle = display === 'point3D' && modelParts.some((part) => part.key === displayType)

    const resetView = () => {
        setShowProp(100)
        setNum2DZoom(100)
        props.three.current?.reset3D?.()
        window.dispatchEvent(new CustomEvent('reset-num-2d-view'))
    }

    const currentZoomLabel = display === 'num' ? num2DZoom : showProp

    const items = [
        {
            key: '1',
            label: '3D模型',

        },
        {
            key: '2',
            label: '3D数字',

        },
        {
            key: '3',
            label: '2D数字',
        },
    ];

    const carItems = [
        {
            key: '1',
            label: '3D模型',
            children: [
                {
                    key: '1-1',
                    label: '整体',
                },
                {
                    key: '1-2',
                    label: '靠背',
                }, {
                    key: '1-3',
                    label: '座椅',
                },
            ],
        },
        {
            key: '2',
            label: '3D数字',
            children: [
                {
                    key: '2-1',
                    label: '靠背',
                }, {
                    key: '2-2',
                    label: '座椅',
                },
            ],
        },
        {
            key: '3',
            label: '2D数字',
            children: [
                {
                    key: '3-1',
                    label: '靠背',
                }, {
                    key: '3-2',
                    label: '座椅',
                },
            ],
        },]

    const changeAllFun = () => {
        setOnRuler(false)
    }

    return (
        <>
            <div className='viewSetContent'>
                <div className="secondContent viewContent1">
                    <Popover color='#32373E' className='set-popover' placement="top" content={<div style={{ color: '#E6EBF0' }} >{t('resetViewTip')}</div>} >
                        <div className='viewAdjust' style={{ display: 'flex', flexDirection: 'column' }}>
                            <i onClick={resetView} className='iconfont cursor fs20' >&#xe644;</i>
                            {t('resetView')}
                        </div>
                    </Popover>
                </div>

                <div className="firstContent viewContent">
                    <div className="threeViewSizeAdjust">



                        {/* {display == 'point3D' ? isMoreMatrix(systemType) && !['sit', 'back'].includes(displayType) ?
                            <div  >
                                <i style={{ color: '#606A76' }} className='iconfont cursor fs14'>&#xe632;</i>
                               
                            </div>
                            :
                            <div  >
                                <i className='iconfont cursor fs14' onClick={subShow}>&#xe632;</i>
                               
                            </div> :
                            <div  >
                                <i style={{ color: '#606A76' }} className='iconfont cursor fs14'>&#xe632;</i>
                               
                            </div>
                        } */}

                        <i className='iconfont reduce cursor' onClick={subShow}>&#xe632;</i>
                        {/* <Input value={`${showProp}%`} /> */}
                        <div style={{ padding: '0 0.75rem' }}>{currentZoomLabel} %</div>


                        {/* {display == 'point3D' ? isMoreMatrix(systemType) && !['sit', 'back'].includes(displayType) ?
                            <div  style={{ marginRight: '1.375rem' }} >
                                <i style={{ color: '#606A76' }} className='iconfont cursor fs14'>&#xe631;</i>
                               
                            </div>
                            :
                            <div  style={{ marginRight: '1.375rem' }} >
                                <i className='iconfont cursor fs14' onClick={addShow}>&#xe631;</i>
                               
                            </div> :
                            <div  style={{ marginRight: '1.375rem' }} >
                                <i style={{ color: '#606A76' }} className='iconfont cursor fs14'>&#xe631;</i>
                               
                            </div>
                        } */}

                        <i className='iconfont add cursor' style={{ marginRight: '1.375rem' }} onClick={addShow}>&#xe631;</i>
                    </div>
                    {canSwitchPointAngle ? <Popover color='#32373E' className='set-popover' placement="top" content={<div style={{ color: '#E6EBF0' }} >{t('viewSwitch3D')}</div>} >
                            <div className='viewAdjust cursor' onClick={threeViewChange} style={{ display: 'flex', flexDirection: 'column' }}>
                                <i className='iconfont  fs20'>&#xe606;</i>
                                <span>{t('angleAdj')}</span>
                            </div>
                    </Popover> : null}

                    {isMoreMatrix(systemType) ? <Popover trigger='click' color='#32373E' className='set-popover' placement="top" content={changeMoreViewContent} >
                        <div className='viewAdjust cursor' style={{ display: 'flex', flexDirection: 'column' }}>
                            <i className='iconfont  fs20' >&#xe645;</i>
                            <span>{t('viewAdj')}</span>
                        </div>
                    </Popover> : <Popover trigger='click' color='#32373E' className='set-popover' placement="top" content={changeViewContent} >
                        <div className='viewAdjust cursor' style={{ display: 'flex', flexDirection: 'column' }}>
                            <i className='iconfont  fs20' >&#xe645;</i>
                            <span>{t('viewAdj')}</span>
                        </div>
                    </Popover>}


                    {/* {isMoreMatrix(systemType) ? <Dropdown 
                    // overlayStyle={{backgroundColor : '#32373e' , color : '#fff'}}
                     menu={{ items: carItems }}>
                        <i className='iconfont cursor fs14' >&#xe607;</i>
                    </Dropdown>

                        : <Dropdown menu={{ items }}>
                            <i className='iconfont cursor fs14' >&#xe607;</i>
                        </Dropdown>} */}

                    {/* {isMoreMatrix(systemType) ? <Popover color='#32373E' className='set-popover' placement="top" content={changeCarViewContent} >
                        <i className='iconfont cursor fs14' >&#xe643;</i>
                    </Popover> : ''} */}
                </div>

                <div style={{ 
                    marginLeft: '1rem', 
                    padding: '0.4rem 0.75rem', 
                    background: '#202327', 
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    color: '#6C7784',
                    display: 'flex',
                    alignItems: 'center',
                    userSelect: 'none'
                }}>
                    {APP_VERSION}
                </div>

            </div>
        </>
    )
}

// export default 

export default withTranslation('translation')(ViewSetting)
