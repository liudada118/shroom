import React, { useContext, useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import IconAndText from '../iconAndText/IconAndText'
import IconAndTextAndSelect from '../iconAndTextAndSelect/IconAndTextAndSelect'
import Drawer from '../Drawer/Drawer'
import { Button, Col, ConfigProvider, Input, InputNumber, message, Modal, Popover, Row, Slider, Switch } from 'antd'
import { pageContext } from '../../page/test/Test'
import { SelectionHelper } from '../selectBox/SelectBox'
import { withTranslation } from 'react-i18next'
import { getDisplayType, getSettingValueOptimal, getSysType, useEquipStore } from '../../store/equipStore'
import { shallow } from 'zustand/shallow'
import { isMoreMatrix } from '../../assets/util/util'
import { localAddress, pointConfig } from '../../util/constant'
import SelectSet from './SelectSet'
import {
    normalizeVisualSettingMax,
    saveVisualSettingValue,
    VISUAL_COLOR_SETTING_MAX,
    VISUAL_COLOR_SETTING_MIN,
    VISUAL_COLOR_SETTING_STEP,
} from '../../util/visualSettingStorage'
import { removeHistoryBox } from '../../assets/util/selectMatrix'
import { getPressureMetricDisplay } from '../../util/pressureMetrics'

// const selectHelper = new SelectionHelper(document.body, 'selectBox');

function SecondTitle(props) {
    const { t, i18n } = props;

    const pageInfo = useContext(pageContext);
    const { display, onRuler, setOnRuler, onSelect, setOnSelect, onMagnifier, setOnMagnifier } = pageInfo
    const [show, setShow] = useState(true)
    const [setshow, setSetshow] = useState(false)
    const selectionCloseConfirmingRef = useRef(false)
    // const { settingValue, setSettingValue, selectHelper } = pageInfo
    // const settingValue = getSettingValue()
    const settingValue = useEquipStore(s => s.settingValue, shallow);
    const rawSettingValueMax = useEquipStore(s => s.settingValueMax, shallow);
    const settingValueMax = normalizeVisualSettingMax(rawSettingValueMax);
    const systemType = useEquipStore(s => s.systemType, shallow);
    const currentDisplayType = useEquipStore(s => s.displayType, shallow);
    const pressureMetricMode = useEquipStore(s => s.pressureMetricMode);
    const metricStatus = useEquipStore(s => s.metricStatus, shallow);
    const collecting = useEquipStore(s => s.collecting);
    const activeDisplayType = pageInfo.displayType || currentDisplayType;

    const setSettingValue = useEquipStore.getState().setSettingValue
    const isCollectionLockedSetting = (type) => ['filter', 'gauss', 'coherent'].includes(type)
    const showCollectionLockMessage = () => message.warning(t('collectingProcessingLocked'))

    const getSettingKey = (a) => {
        return a.type
    }

    const getRowValue = (a) => {
        const key = getSettingKey(a)
        const value = Number(settingValue[key])
        if (Number.isFinite(value)) return value
        return Number(settingValue[a.type]) || 0
    }

    const onChange = (newValue, a) => {
        console.log(newValue, settingValue)
        if (collecting && isCollectionLockedSetting(a.type)) {
            showCollectionLockMessage()
            return
        }
        if (newValue === null || newValue === undefined) return
        const numericValue = Number(newValue)
        if (!Number.isFinite(numericValue)) return
        const key = getSettingKey(a)
        let obj = { ...settingValue }
        obj[key] = Math.max(a.min, Math.min(a.max, numericValue))
        obj[a.type] = obj[key]

        saveVisualSettingValue(systemType || getSysType(), obj)
        setSettingValue(obj);
    };

    const onToggleAutoColor = (checked) => {
        const obj = { ...settingValue, autoColor: checked ? 1 : 0 }
        saveVisualSettingValue(systemType || getSysType(), obj)
        setSettingValue(obj)
    }

    const getSliderValue = (a) => {
        const value = Number(getRowValue(a))
        if (!Number.isFinite(value)) return 0
        return a.sliderScale ? value * a.sliderScale : value
    }

    const getSliderMin = (a) => a.sliderScale ? a.min * a.sliderScale : a.min
    const getSliderMax = (a) => a.sliderScale ? a.max * a.sliderScale : a.max
    const getSliderStep = (a) => a.sliderScale ? a.step * a.sliderScale : a.step
    const getSettingValueFromSlider = (value, a) => a.sliderScale ? Number(value) / a.sliderScale : value

    const currentDataMax = useMemo(() => {
        const getMax = (arr) => Array.isArray(arr)
            ? arr.reduce((max, value) => Math.max(max, Number(value) || 0), 0)
            : null
        const target = activeDisplayType?.includes('back') ? 'back' : activeDisplayType?.includes('sit') ? 'sit' : ''
        const activeMetricStatus = metricStatus?.[pressureMetricMode]
        if (!activeMetricStatus || typeof activeMetricStatus !== 'object') return null
        const values = Object.entries(activeMetricStatus)
        if (!values.length) return null
        const matched = target
            ? values.filter(([key]) => key === target || key.endsWith(`-${target}`))
            : values
        const maxList = (matched.length ? matched : values)
            .map(([, arr]) => getMax(arr))
            .filter((value) => value !== null)
        return maxList.length ? Math.max(...maxList) : null
    }, [metricStatus, activeDisplayType, pressureMetricMode])
    const currentDataMaxDisplay = getPressureMetricDisplay(pressureMetricMode, t, i18n.language)



    // const settingValue = useEquipStore(s => s.settingValue, shallow);


    const setType = [
        {
            title: t('blur'),
            type: 'gauss',
            max: settingValueMax.gauss,
            min: 0.1,
            step: 0.1,
            content: <div style={{ color: '#E6EBF0', fontSize: '0.85rem' }}>{t('algoUniform')}</div>
        },
        {
            title: t('colorAdj'),
            type: 'color',
            max: VISUAL_COLOR_SETTING_MAX,
            min: VISUAL_COLOR_SETTING_MIN,
            step: VISUAL_COLOR_SETTING_STEP,
            content: <div style={{ color: '#E6EBF0', fontSize: '0.85rem' }}>{t('algoRedBlue')}</div>
        },
        {
            title: t('denoise'),
            type: 'filter',
            max: settingValueMax.filter,
            min: 1,
            step: 1,
            content: <div style={{ color: '#E6EBF0', fontSize: '0.85rem' }}>{t('filterNoise')}</div>
        },
        {
            title: t('heightAdj'),
            type: 'height',
            max: settingValueMax.height,
            min: 0.1,
            step: 5,
            content: <div style={{ color: '#E6EBF0', fontSize: '0.85rem' }}>{t('pointHeight')}</div>
        },
    ]


    // const [onSelect, setOnSelect] = useState(false)
    // const [onRuler, setOnRuler] = useState(false)


    const selectClick = () => {

        // if (!onSelect) {
        //     selectHelper.isShiftPressed = true
        // }else{
        //     selectHelper.isShiftPressed = false
        // }
        if (display == 'num' || display == 'contrast') {
            if (!onSelect) {
                setOnMagnifier(false)
                useEquipStore.getState().setNum2DZoom(100)
                window.dispatchEvent(new CustomEvent('reset-num-2d-view'))
                setOnSelect(true)
                pageInfo?.brushInstance.startBrush();
            } else {
                closeSelectDrawer()
            }
        } else {
            message.info(t('use2DMode'))
        }

    }

    const closeSelectDrawer = () => {
        requestCloseSelection()
    }

    const cloneSelectionRange = (range) => {
        if (!range) return null
        const matrixRect = range.matrixRect ? { ...range.matrixRect } : null
        return {
            id: range.id,
            name: range.name,
            bgc: range.bgc,
            colorIndex: range.colorIndex,
            matrixKey: range.matrixKey,
            templateId: range.templateId,
            templateDirty: range.templateDirty,
            x1: range.x1,
            y1: range.y1,
            x2: range.x2,
            y2: range.y2,
            x: range.x,
            y: range.y,
            width: range.width,
            height: range.height,
            matrixRect,
        }
    }

    const saveSelectionTemplateFromExit = ({ name, ranges, mode = 'saveAs', templateId = '' }) => new Promise((resolve, reject) => {
        let completed = false
        const finish = (saved) => {
            completed = true
            if (saved) {
                resolve(true)
            } else {
                reject(new Error('save selection template failed'))
            }
        }
        window.dispatchEvent(new CustomEvent('save-selection-template', {
            detail: { name, ranges, mode, templateId, onComplete: finish }
        }))
        window.setTimeout(() => {
            if (!completed) reject(new Error('save selection template timeout'))
        }, 300000)
    })

    const forceCloseSelection = () => {
        pageInfo?.brushInstance.stopBrush();
        removeHistoryBox()
        useEquipStore.getState().setSelectArr([])
        setOnSelect(false)
    }

    const requestCloseSelection = () => {
        const ranges = pageInfo?.brushInstance?.rangeArr || []
        if (selectionCloseConfirmingRef.current) {
            return
        }
        if (!ranges.length) {
            forceCloseSelection()
            return
        }
        const templateDirty = Boolean(pageInfo?.brushInstance?.selectionTemplateDirty)
            || ranges.some((range) => range?.templateDirty)
        const onlyCleanAppliedTemplateRanges = ranges.every((range) => range?.templateId) && !templateDirty
        if (onlyCleanAppliedTemplateRanges) {
            forceCloseSelection()
            return
        }

        const selectionSnapshot = ranges.map(cloneSelectionRange).filter(Boolean)
        const appliedTemplateIds = [...new Set(selectionSnapshot.map(range => range.templateId).filter(Boolean))]
        const appliedTemplateId = appliedTemplateIds.length === 1
            && selectionSnapshot.every(range => range.templateId === appliedTemplateIds[0])
            ? appliedTemplateIds[0]
            : ''
        const canOverwriteAppliedTemplate = Boolean(appliedTemplateId && templateDirty)
        selectionCloseConfirmingRef.current = true
        let templateName = `${t('selectionTemplate')}${new Date().toLocaleString()}`
        let saving = false
        let closeModal
        let modal

        const closeWithoutSaving = () => {
            if (saving) return
            forceCloseSelection()
            closeModal?.()
        }
        const saveAndClose = (mode) => {
            if (saving) return
            saving = true
            modal?.update({ footer: renderFooter(true) })
            saveSelectionTemplateFromExit({
                name: templateName,
                ranges: selectionSnapshot,
                mode,
                templateId: mode === 'overwrite' ? appliedTemplateId : '',
            }).then(() => {
                forceCloseSelection()
                closeModal?.()
            }).catch(() => {
                saving = false
                modal?.update({ footer: renderFooter(false) })
            })
        }
        const renderFooter = (loading) => [
            <Button key="discard" disabled={loading} onClick={closeWithoutSaving}>
                {t('dontSave')}
            </Button>,
            <Button key="save-as" disabled={loading} onClick={() => saveAndClose('saveAs')}>
                {t('saveAsNewTemplate')}
            </Button>,
            ...(canOverwriteAppliedTemplate ? [
                <Button key="overwrite" type="primary" loading={loading} onClick={() => saveAndClose('overwrite')}>
                    {t('overwriteOriginalTemplate')}
                </Button>
            ] : []),
        ]

        modal = Modal.confirm({
            title: t('exitSelectionTitle'),
            content: (
                <div>
                    <div style={{ marginBottom: 8 }}>
                        {canOverwriteAppliedTemplate ? t('modifiedAppliedTemplatePrompt') : t('saveSelectionPrompt')}
                    </div>
                    <Input
                        defaultValue={templateName}
                        placeholder={t('templateName')}
                        onChange={(event) => {
                            templateName = event.target.value
                        }}
                    />
                </div>
            ),
            footer: renderFooter(false),
            closable: false,
            keyboard: false,
            afterClose: () => {
                selectionCloseConfirmingRef.current = false
            }
        })
        closeModal = modal.destroy
    }

    const system = useEquipStore(s => s.systemType, shallow);
    const rulerClick = () => {
        // const system =  getSysType()
        const displayType = getDisplayType()
        // const system = 

        if (display == 'num') {

            if (isMoreMatrix(system)) {
                const key = displayType.includes('sit') ? 'sit' : 'back'
                const pointLength = pointConfig[system][key].pointLength
                const widthDistance = pointConfig[system][key].pointWidthDistance
                const heightDistance = pointConfig[system][key].pointHeightDistance
                console.log(pointConfig[system][key])
                pageInfo?.newRuler.startRuler({ num: pointLength, widthDistance, heightDistance });
            }

            setOnRuler(!onRuler)

            if (onRuler) {
                pageInfo?.newRuler.stopRuler()
            }
        } else {
            message.info(t('use2DMode'))
        }
        // pageInfo?.newRuler.startRuler();
    }

    useEffect(() => {


    }, [])

    useEffect(() => {
        const handleClearSelectionMode = () => {
            requestCloseSelection()
        }
        const handleForceClearSelectionMode = () => {
            forceCloseSelection()
        }
        window.addEventListener('clear-selection-mode', handleClearSelectionMode)
        window.addEventListener('force-clear-selection-mode', handleForceClearSelectionMode)
        return () => {
            window.removeEventListener('clear-selection-mode', handleClearSelectionMode)
            window.removeEventListener('force-clear-selection-mode', handleForceClearSelectionMode)
        }
    }, [pageInfo?.brushInstance, setOnSelect])

    useEffect(() => {
        if (!onSelect) return
        if (display !== 'num' && display !== 'contrast') {
            requestCloseSelection()
        }
    }, [display, onSelect])

    // 放大镜只在 2D 数字模式有效, 切到其他模式时重置选中状态
    useEffect(() => {
        if (onMagnifier && display !== 'num') {
            setOnMagnifier(false)
        }
    }, [display, onMagnifier])

    useEffect(() => {
        if (!onSelect) return
        pageInfo?.brushInstance.deleteAll()
        useEquipStore.getState().setSelectArr([])
    }, [systemType])

    const selectionDisplayTypeRef = useRef(currentDisplayType)
    const getSelection2DPart = (value = '') => {
        const type = String(value || '')
        if (type.includes('back2D')) return 'back'
        if (type.includes('sit2D')) return 'sit'
        return ''
    }

    useEffect(() => {
        const prevDisplayType = selectionDisplayTypeRef.current
        selectionDisplayTypeRef.current = currentDisplayType
        if (!onSelect) return

        const prevPart = getSelection2DPart(prevDisplayType)
        const nextPart = getSelection2DPart(currentDisplayType)
        if (prevPart && nextPart && prevPart !== nextPart) {
            pageInfo?.brushInstance.deleteAll()
            useEquipStore.getState().setSelectArr([])
            return
        }

        pageInfo?.brushInstance.refreshCurrentMatrix?.()
    }, [currentDisplayType, onSelect])
    // const brush = useContext(BrushContext);

    const [onZero, setOnZero] = useState(false)

    const wsDataZero = (action = 'enable') => {
        const zeroState = pageInfo.changeWsLocalData(action)
        if (zeroState?.error === 'no_data') {
            message.warning(t('noValidPressureMatrix'))
            return
        }
        setOnZero(Boolean(zeroState?.enabled))
        const payload = { zeroState }
        axios({
            method: 'post',
            url: `${localAddress}/setZeroBaseline`,
            data: payload,
        }).then((res) => {
            if (res.data?.code !== 0) {
                message.warning(t('zeroSyncFailed'))
            }
        }).catch(() => {
            message.warning(t('zeroSyncFailed'))
        })
    }

    const selectInputObj = [
        {
            name: 'X',
            placeholder: '输入初始横向起点'
        }, {
            name: 'Y',
            placeholder: '输入初始纵向起点'
        }, {
            name: '长',
            placeholder: '输入框选横向点数'
        }, {
            name: '宽',
            placeholder: '输入框选纵向点数'
        },
    ]

    const selectInfo = <div style={{width : '10rem', color : '#fff'}}>
        <div>X: 输入初始横向起点</div>
        <div>Y: 输入初始纵向起点</div>
        <div>长: 输入框选横向点数</div>
        <div>宽: 输入框选纵向点数</div>
        <div>注意: x加长不能超过横向传感点数(60个),y加宽不能超过纵向传感点数(50个)</div>
           
    </div>

     const selectArr = useEquipStore(s => s.selectArr, shallow);

    return (

        <>
            <Drawer zindex={3} show={setshow} title={t('adjust')} setShow={setSetshow}>
                <div className="setContent">
                    {/* <div className="setItem">
                        <Row align='middle'>
                            <Col span={4} >高斯模糊</Col>
                            <Col span={12}>
                                <Slider
                                    min={1}
                                    max={20}
                                    onChange={(value) => {
                                        onChange(value, 'gauss')
                                    }}
                                    value={typeof settingValue.gauss === 'number' ? settingValue.gauss : 0}
                                />
                            </Col>
                            <Col span={4}>
                                <InputNumber
                                    min={1}
                                    max={20}
                                    style={{ margin: '0 16px' }}
                                    value={typeof settingValue.gauss === 'number' ? settingValue.gauss : 0}
                                    onChange={(value) => {
                                        onChange(value, 'gauss')
                                    }}
                                />
                            </Col>
                        </Row>
                    </div> */}
                    {
                        setType.map((a, index) => {
                            return (
                                <div key={a.type} className={`setItem ${a.type === 'color' ? 'setItemColor' : ''}`}>
                                    <Popover color='#32373E' className='set-popover' placement="bottomLeft" content={a.content} >
                                        <div className="setItemLabel">
                                            <span>{a.title}</span>
                                            {a.type === 'color' ? (
                                                <em>{t('currentDataMax')}: {currentDataMax === null ? '--' : `${Number(currentDataMax).toFixed(2)} ${currentDataMaxDisplay.unit}`}</em>
                                            ) : null}
                                        </div>
                                    </Popover>

                                    <Slider
                                        min={getSliderMin(a)}
                                        max={getSliderMax(a)}
                                        step={getSliderStep(a)}
                                        disabled={collecting && isCollectionLockedSetting(a.type)}
                                        onChange={(value) => {
                                            onChange(getSettingValueFromSlider(value, a), a)
                                        }}
                                        className='setItemSlide'
                                        value={getSliderValue(a)}
                                    />

                                    <ConfigProvider
                                        theme={{
                                            components: {
                                                InputNumber: {
                                                    token: {
                                                        // Seed Token，影响范围大
                                                        hoverBg: '#000'
                                                    },
                                                }
                                            }

                                        }}>

                                        <InputNumber
                                            min={a.min}
                                            max={a.max}
                                            step={a.step}
                                            precision={a.type === 'color' ? 2 : undefined}
                                            style={{ margin: '0 16px' }}
                                            className='setItemInput'
                                            disabled={collecting && isCollectionLockedSetting(a.type)}
                                            value={getRowValue(a)}
                                            onChange={(value) => {
                                                onChange(value, a)
                                            }}

                                        />
                                    </ConfigProvider>

                                    {a.type === 'color' ? (
                                        <div className="autoColorSwitchRow">
                                            <Switch
                                                size="small"
                                                checked={Boolean(settingValue.autoColor)}
                                                onChange={onToggleAutoColor}
                                            />
                                            <span>{t('autoColorAdj')}</span>
                                        </div>
                                    ) : null}

                                </div>
                            )
                        })
                    }

                    <div style={{ display: 'flex', justifyContent: 'end' }}>
                        <div onClick={() => {
                            if (collecting) {
                                showCollectionLockMessage()
                                return
                            }
                            const optimalObj = getSettingValueOptimal()
                            useEquipStore.getState().setSettingValue(optimalObj)
                            saveVisualSettingValue(systemType || getSysType(), optimalObj)
                        }} className='connectPort cursor'>{t('restore')}</div>
                    </div>
                </div>
            </Drawer>
            <div className="secondTitle">
                <div className="secondTitleContent"
                // style={{ height: show ? `calc(27px + 2.5rem)` : 'calc(27px + 0.6rem)' }}
                // onMouseOver={() => {
                //     setShow(true)
                // }}
                // onMouseOut={() => {
                //     setShow(false)
                // }}
                >
                    {/* <IconAndText text='画布翻转' /> */}
                    <IconAndTextAndSelect text={t('flip')} show={show} options={[{
                        label: `${t('seatPad')}${t('flipV')}`, value: 'up', target: 'sit'
                    }, {
                        label: `${t('seatPad')}${t('flipH')}`, value: 'left', target: 'sit'
                    }, {
                        label: `${t('seatPad')}${t('rotate90')}`, value: 'rotate', target: 'sit'
                    }, {
                        label: `${t('backPad')}${t('flipH')}`, value: 'left', target: 'back'
                    },
                    ]}
                        icon={<div className='iconContentBox'><i className='iconfont fs18'>&#xe60c;</i></div>}
                    />
                    <IconAndTextAndSelect
                        text={t('zeroPre')}
                        onClickStatus={onZero}
                        show={show}
                        options={[
                            { label: t('zeroPre'), value: 'enable' },
                            { label: t('cancelZero'), value: 'disable' },
                        ]}
                        onSelectOption={(item) => wsDataZero(item.value)}
                        lockCollecting={false}
                        icon={<div className='iconContentBox'><i style={{ color: onZero ? '#fff' : '#D1D9E1' }} className='iconfont fs18'>&#xe604;</i></div>}
                    />
                    <IconAndText onClickStatus={onSelect} text={t('select')} onClick={() => {
                        if (onRuler) {
                            message.info(t('noSimultaneousUse'))
                        } else {
                            selectClick()
                        }
                    }} show={show} icon={<div className='iconContentBox'> <i style={{ color: onSelect ? '#fff' : '#D1D9E1' }} className='iconfont fs18'>&#xe60e;</i> </div>} />
                    <IconAndText onClickStatus={onRuler} onClick={() => {
                        if (onSelect) {
                            message.info(t('noSimultaneousUse'))
                        } else {
                            rulerClick()
                        }
                    }} text={t('ruler')} show={show} icon={<div className='iconContentBox'> <i style={{ color: onRuler ? '#fff' : '#D1D9E1' }} className='iconfont fs16'>&#xe610;</i></div>} />
                    <IconAndText onClickStatus={onMagnifier} onClick={() => {
                        if (onSelect) {
                            message.info(t('noSimultaneousUse'))
                            return
                        }
                        if (display == 'num') {
                            setOnMagnifier(!onMagnifier)
                        } else {
                            message.info(t('use2DMode'))
                        }
                    }} text={t('magnifier')} show={show} icon={<div className='iconContentBox'> <i style={{ color: onMagnifier ? '#fff' : '#D1D9E1' }} className='iconfont fs16'>&#xe61f;</i></div>} />
                    <IconAndText onClickStatus={setshow} onClick={() => { setSetshow(!setshow) }} text={t('adjust')} show={show} icon={<div className='iconContentBox'><i style={{ color: setshow ? '#fff' : '#D1D9E1' }} className='iconfont fs16'>&#xe60d;</i></div>} />
                </div>
                {/* {onSelect ? <div className='selectInputContent'>
                    <div className="selectInputTitle"> <div className="selectInputTitleInfo">框选区域</div>  
                        <Popover color='#32373E' className='set-popover' placement="bottomLeft" content={selectInfo} >
                        <i className='iconfont cursor'>&#xe674;</i> </Popover>
                        </div>
                    {
                        selectInputObj.map((a => {
                            return <div className='selectInputItem'>
                                <div className="selectInputItemName">{a.name}:</div> <Input className='selectInput' style={{ backgroundColor: '#202327', border: 0, color: "#E6EBF0", }} placeholder={a.placeholder} />
                            </div>
                        }))
                    }
                    <div className="selectInputButtonContent">
                        <div className="selectInputButton connectButton cursor">确认</div></div>
                </div> : ''} */}
            </div>
            <SelectSet onSelect={onSelect} selectArr={selectArr} variant="floating" />

        </>
    )
}

export default withTranslation('translation')(SecondTitle)
