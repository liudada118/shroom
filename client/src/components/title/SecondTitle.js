import React, { useContext, useEffect, useRef, useState } from 'react'
import axios from 'axios'
import IconAndText from '../iconAndText/IconAndText'
import IconAndTextAndSelect from '../iconAndTextAndSelect/IconAndTextAndSelect'
import Drawer from '../Drawer/Drawer'
import { Col, ConfigProvider, Input, InputNumber, message, Modal, Popover, Row, Slider } from 'antd'
import { pageContext } from '../../page/test/Test'
import { SelectionHelper } from '../selectBox/SelectBox'
import { withTranslation } from 'react-i18next'
import { getDisplayType, getSettingValue, getSettingValueOptimal, getSysType, useEquipStore } from '../../store/equipStore'
import { shallow } from 'zustand/shallow'
import { isMoreMatrix } from '../../assets/util/util'
import { localAddress, pointConfig } from '../../util/constant'
import SelectSet from './SelectSet'
import { buildFallbackParams } from '../../util/request'
import { normalizeVisualSettingMax, saveVisualSettingValue } from '../../util/visualSettingStorage'
import { removeHistoryBox } from '../../assets/util/selectMatrix'

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

    const setSettingValue = useEquipStore.getState().setSettingValue
    const setSettingValueMax = useEquipStore.getState().setSettingValueMax

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

    const onMaxChange = (newValue, a) => {
        if (newValue === null || newValue === undefined) return
        const numericValue = Number(newValue)
        if (!Number.isFinite(numericValue)) return
        const currentSystem = systemType || getSysType()
        const nextMaxValue = Math.max(a.min, numericValue)
        const nextMax = { ...settingValueMax, [a.type]: nextMaxValue }
        const key = getSettingKey(a)
        const currentValue = Number(settingValue[key] ?? settingValue[a.type])
        const nextSettingValue = {
            ...settingValue,
            [key]: Number.isFinite(currentValue) ? Math.min(currentValue, nextMaxValue) : a.min,
        }
        nextSettingValue[a.type] = nextSettingValue[key]

        setSettingValueMax(nextMax)
        setSettingValue(nextSettingValue)
        saveVisualSettingValue(currentSystem, nextSettingValue)

        const payload = {
            config: {
                maxObj: { [currentSystem]: nextMax },
            },
        }
        axios({
            method: 'post',
            url: `${localAddress}/setSystemConfig`,
            params: buildFallbackParams(payload),
            data: payload,
        }).catch(() => {
            message.warning('最大值保存失败')
        })
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
            max: settingValueMax.color,
            min: 1,
            step: 1,
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

    const forceCloseSelection = () => {
        pageInfo?.brushInstance.stopBrush();
        removeHistoryBox()
        useEquipStore.getState().setSelectArr([])
        setOnSelect(false)
    }

    const requestCloseSelection = () => {
        const ranges = pageInfo?.brushInstance?.rangeArr || []
        if (!ranges.length || selectionCloseConfirmingRef.current) {
            forceCloseSelection()
            return
        }
        const onlyAppliedTemplateRanges = ranges.every((range) => range?.templateId)
        if (onlyAppliedTemplateRanges) {
            forceCloseSelection()
            return
        }

        selectionCloseConfirmingRef.current = true
        let templateName = `${t('selectionTemplate')}${new Date().toLocaleString()}`
        Modal.confirm({
            title: '退出框选',
            content: (
                <div>
                    <div style={{ marginBottom: 8 }}>是否需要将当前框选保存为模板？</div>
                    <Input
                        defaultValue={templateName}
                        placeholder={t('templateName')}
                        onChange={(event) => {
                            templateName = event.target.value
                        }}
                    />
                </div>
            ),
            okText: t('saveTemplate'),
            cancelText: '不保存',
            onOk: () => {
                window.dispatchEvent(new CustomEvent('save-selection-template', {
                    detail: { name: templateName }
                }))
                forceCloseSelection()
                selectionCloseConfirmingRef.current = false
            },
            onCancel: () => {
                forceCloseSelection()
                selectionCloseConfirmingRef.current = false
            },
            afterClose: () => {
                selectionCloseConfirmingRef.current = false
            }
        })
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
        window.addEventListener('clear-selection-mode', handleClearSelectionMode)
        return () => window.removeEventListener('clear-selection-mode', handleClearSelectionMode)
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
    }, [systemType, currentDisplayType])
    // const brush = useContext(BrushContext);

    const [onZero, setOnZero] = useState(false)

    const wsDataZero = () => {
        const zeroState = pageInfo.changeWsLocalData()
        if (zeroState?.error === 'no_data') {
            message.warning(t('noValidPressureMatrix'))
            return
        }
        setOnZero(Boolean(zeroState?.enabled))
        const payload = { zeroState }
        axios({
            method: 'post',
            url: `${localAddress}/setZeroBaseline`,
            params: buildFallbackParams(payload),
            data: payload,
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
                                <div className="setItem">
                                    <Popover color='#32373E' className='set-popover' placement="bottomLeft" content={a.content} >
                                        <div>{a.title}</div>
                                    </Popover>

                                    <Slider
                                        min={getSliderMin(a)}
                                        max={getSliderMax(a)}
                                        step={getSliderStep(a)}
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
                                            style={{ margin: '0 16px' }}
                                            className='setItemInput'
                                            value={getRowValue(a)}
                                            onChange={(value) => {
                                                onChange(value, a)
                                            }}

                                        />
                                        <span style={{ color: '#7f8a96', fontSize: '0.75rem', marginLeft: 4 }}>Max</span>
                                        <InputNumber
                                            min={a.min}
                                            step={a.step}
                                            style={{ margin: '0 0 0 6px' }}
                                            className='setItemInput'
                                            value={typeof settingValueMax[a.type] === 'number' ? settingValueMax[a.type] : a.max}
                                            onChange={(value) => {
                                                onMaxChange(value, a)
                                            }}

                                        />
                                    </ConfigProvider>

                                </div>
                            )
                        })
                    }

                    <div style={{ display: 'flex', justifyContent: 'end' }}>
                        <div onClick={() => {
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
                    <IconAndText text={t('zeroPre')} onClickStatus={onZero} show={show} onClick={wsDataZero} icon={<div className='iconContentBox'><i style={{ color: onZero ? '#fff' : '#D1D9E1' }} className='iconfont fs18'>&#xe604;</i></div>} />
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
                    <IconAndText onClick={() => { setSetshow(!setshow) }} text={t('adjust')} show={show} icon={<div className='iconContentBox'><i className='iconfont fs16'>&#xe60d;</i></div>} />
                    <IconAndText disable text={t('upload')} show={show} icon={<div className='iconContentBox'><i className='iconfont fs18'>&#xe609;</i></div>} />
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
