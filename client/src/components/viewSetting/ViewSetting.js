import React, { forwardRef, useContext, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import './index.scss'
import { Dropdown, Input, Popover, message } from 'antd'
import { pageContext } from '../../page/test/Test';
import { withTranslation } from 'react-i18next';
import { getSysType, useEquipStore } from '../../store/equipStore';
import { shallow } from 'zustand/shallow';
import { isMoreMatrix } from '../../assets/util/util';
import { getMatrixPartFromDisplayType, getMatrixPartLabelKey, getSystemMatrixParts, pointConfig } from '../../util/constant';
import { APP_VERSION } from '../../util/version';
import { HolderOutlined } from '@ant-design/icons';

// 工具条停在视口左下角时离边的留白，拖动时也用这个值做边界
const TOOLBAR_VIEWPORT_MARGIN = 12
// 工具条整体缩放的下限：面板缩得太狠时也别把按钮字缩到看不清
const TOOLBAR_MIN_SCALE = 0.8

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
    const toolbarRef = useRef(null)
    const rowRef = useRef(null)
    const toolbarMovedRef = useRef(false)
    const [toolbarPos, setToolbarPos] = useState(null)
    const [toolbarDragging, setToolbarDragging] = useState(false)
    // 工具条要对齐的宽度：{ width（未缩放的布局宽，px）, scale }
    const [toolbarFit, setToolbarFit] = useState(null)
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

    // 工具条固定停在视口左下角，不再去量「实时数据统计」面板的位置和宽度：
    // 之前按面板右边缘定位又整条缩放，笔记本和外接显示器上看着位置、大小都不一样。
    // 现在只认视口左下角这一个锚点，所有屏幕一致；面板那边会按工具条高度让出底部空间（见 DraggablePanel 的 bottomReserve）
    useEffect(() => {
        const bar = toolbarRef.current
        if (!bar) return undefined

        // 尺寸一变就吱一声，面板那边收到后自己去量工具条的上边缘（见 ChartsAside 的 toolbarReserve）
        const notify = () => window.dispatchEvent(new CustomEvent('view-toolbar-resize'))

        notify()
        // 首帧 rem/字体还没落定，量出来会偏小，下一帧再补一次
        const raf = window.requestAnimationFrame(notify)
        const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(notify) : null
        observer?.observe(bar)
        window.addEventListener('resize', notify)
        return () => {
            window.cancelAnimationFrame(raf)
            observer?.disconnect()
            window.removeEventListener('resize', notify)
        }
    }, [])

    // 开屏时把工具条对齐到「实时数据统计」面板当时在屏幕上的实际宽度。
    // 只在启动和窗口尺寸变化时量一次：面板之后自己放大缩小（缩放按钮、自动适配）都不再牵动工具条。
    // 面板量的是 getBoundingClientRect，带上了它的整体缩放，所以看上去就是一样长
    useEffect(() => {
        const sync = () => {
            const bar = toolbarRef.current
            const row = rowRef.current
            const panel = document.querySelector('.charts-panel')
            if (!bar || !row || !panel) return
            const target = panel.getBoundingClientRect().width
            if (!target) return
            // 量工具条不受约束时的自然宽度：先把上一次算出来的宽度和缩放摘掉，量完原样放回去
            // （不能置空，宽度没变时 React 不会重渲染，置空就等于把已生效的宽度丢了）
            const keepWidth = bar.style.width
            const keepTransform = bar.style.transform
            bar.style.width = 'auto'
            bar.style.transform = 'none'
            const natural = row.scrollWidth
            bar.style.width = keepWidth
            bar.style.transform = keepTransform
            if (!natural) return
            // 面板比工具条还窄时整条等比缩一点（有下限，别缩到看不清）
            const scale = target >= natural ? 1 : Math.max(TOOLBAR_MIN_SCALE, target / natural)
            const width = Math.round(Math.max(natural, target / scale))
            setToolbarFit((prev) => (prev && prev.width === width && prev.scale === scale ? prev : { width, scale }))
        }

        // 图表、字体、面板的自动缩放都要几帧才落定，多补几次
        const raf = window.requestAnimationFrame(sync)
        const timers = [200, 600, 1200].map((delay) => window.setTimeout(sync, delay))
        window.addEventListener('resize', sync)
        return () => {
            window.cancelAnimationFrame(raf)
            timers.forEach(window.clearTimeout)
            window.removeEventListener('resize', sync)
        }
    }, [])

    // 按住左侧手柄拖动工具条，位置限制在视口内
    const onToolbarDragStart = (e) => {
        const bar = toolbarRef.current
        if (!bar || e.button !== 0) return
        e.preventDefault()
        toolbarMovedRef.current = true
        const barRect = bar.getBoundingClientRect()
        const offsetX = e.clientX - barRect.left
        const offsetY = e.clientY - barRect.top
        setToolbarDragging(true)

        const onMouseMove = (event) => {
            const maxLeft = window.innerWidth - barRect.width - TOOLBAR_VIEWPORT_MARGIN
            const maxTop = window.innerHeight - barRect.height - TOOLBAR_VIEWPORT_MARGIN
            const left = Math.round(Math.min(Math.max(TOOLBAR_VIEWPORT_MARGIN, event.clientX - offsetX), Math.max(TOOLBAR_VIEWPORT_MARGIN, maxLeft)))
            const top = Math.round(Math.min(Math.max(TOOLBAR_VIEWPORT_MARGIN, event.clientY - offsetY), Math.max(TOOLBAR_VIEWPORT_MARGIN, maxTop)))
            setToolbarPos((prev) => ({ ...prev, left, top }))
        }

        const onMouseUp = () => {
            setToolbarDragging(false)
            window.removeEventListener('mousemove', onMouseMove)
            window.removeEventListener('mouseup', onMouseUp)
            // 位置变了但尺寸没变，ResizeObserver 不会响，这里手动通知面板重算底部预留
            window.dispatchEvent(new CustomEvent('view-toolbar-resize'))
        }

        window.addEventListener('mousemove', onMouseMove)
        window.addEventListener('mouseup', onMouseUp)
    }

    return (
        <>
            <div
                className='viewSetContent'
                ref={toolbarRef}
                style={{
                    ...(toolbarFit
                        ? {
                            width: `${toolbarFit.width}px`,
                            transform: toolbarFit.scale === 1 ? undefined : `scale(${toolbarFit.scale})`,
                            transformOrigin: 'bottom left',
                        }
                        : null),
                    ...(toolbarPos
                        // 只有用户自己拖过之后才走内联定位，否则一律用样式里的左下角
                        ? {
                            left: `${toolbarPos.left}px`,
                            top: `${toolbarPos.top}px`,
                            right: 'auto',
                            bottom: 'auto',
                        }
                        : null),
                }}
            >
                <div className='viewSetRow' ref={rowRef}>
                <div
                    className='viewSetDragHandle'
                    title={t('dragToolbar')}
                    style={{ cursor: toolbarDragging ? 'grabbing' : 'grab' }}
                    onMouseDown={onToolbarDragStart}
                >
                    <HolderOutlined />
                </div>
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

                        <i className='iconfont add cursor' style={{ marginRight: '0.75rem' }} onClick={addShow}>&#xe631;</i>
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

                {/* 版本号紧跟「视图切换」，与前面两块同高 */}
                <div className='viewSetVersion'>
                    {APP_VERSION}
                </div>
                </div>

            </div>
        </>
    )
}

// export default 

export default withTranslation('translation')(ViewSetting)
