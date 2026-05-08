import React, { useContext, useEffect, useState } from 'react'
import IconAndText from '../iconAndText/IconAndText'
import IconAndTextAndSelect from '../iconAndTextAndSelect/IconAndTextAndSelect'
import Drawer from '../Drawer/Drawer'
import { Col, ConfigProvider, Input, InputNumber, message, Popover, Row, Slider } from 'antd'
import { pageContext } from '../../page/test/Test'
import { SelectionHelper } from '../selectBox/SelectBox'
import { withTranslation } from 'react-i18next'
import { getDisplayType, getSettingValue, getSettingValueOptimal, getSysType, useEquipStore } from '../../store/equipStore'
import { shallow } from 'zustand/shallow'
import { isMoreMatrix } from '../../assets/util/util'
import { pointConfig } from '../../util/constant'
import SelectSet from './SelectSet'

// const selectHelper = new SelectionHelper(document.body, 'selectBox');

function SecondTitle(props) {
    const { t, i18n } = props;

    const pageInfo = useContext(pageContext);
    const { display, onRuler, setOnRuler, onSelect, setOnSelect, onMagnifier, setOnMagnifier } = pageInfo
    const [show, setShow] = useState(true)
    const [setshow, setSetshow] = useState(false)
    // const { settingValue, setSettingValue, selectHelper } = pageInfo
    // const settingValue = getSettingValue()
    const settingValue = useEquipStore(s => s.settingValue, shallow);
    const settingValueMax = useEquipStore(s => s.settingValueMax, shallow);
    const systemType = useEquipStore(s => s.systemType, shallow);

    const setSettingValue = useEquipStore.getState().setSettingValue


    const onChange = (newValue, a) => {
        console.log(newValue, settingValue)
        let obj = { ...settingValue }
        if (a.type == "press") {
            obj[a.type] = newValue
        } else {
            obj[a.type] = newValue / 100 * a.max
        }

        localStorage.setItem('setValueData', JSON.stringify(obj))
        setSettingValue(obj);
    };



    // const settingValue = useEquipStore(s => s.settingValue, shallow);


    const setType = [
        {
            title: t('blur'),
            type: 'gauss',
            max: settingValueMax.gauss,
            min: 1,
            step: 1,
            content: <div style={{ color: '#E6EBF0', fontSize: '0.85rem' }}>{t('algoUniform')}</div>
        },
        // 颜色调节已移至右侧 ADC 滑条面板，此处去掉
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
            min: 1,
            step: 1,
            content: <div style={{ color: '#E6EBF0', fontSize: '0.85rem' }}>{t('pointHeight')}</div>
        },
        {
            title: t('continuity'),
            type: 'coherent',
            max: settingValueMax.coherent,
            min: 10,
            step: 10,
            content: <div style={{ color: '#E6EBF0', fontSize: '0.85rem' }}>{t('sensitivity')}</div>
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
        if (display == 'num') {
            setOnSelect(!onSelect)
            if (!onSelect) {
                pageInfo?.brushInstance.startBrush();
            } else {
                pageInfo?.brushInstance.stopBrush();
                useEquipStore.getState().setSelectArr([])
            }
        } else {
            message.info(t('use2DMode'))
        }

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
    // const brush = useContext(BrushContext);

    const [onZero, setOnZero] = useState(false)

    const wsDataZero = () => {
        setOnZero(!onZero)
        pageInfo.changeWsLocalData()
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
                                        min={a.min}
                                        max={a.type == 'press' ? a.max : 100}
                                        step={a.step}
                                        onChange={(value) => {
                                            onChange(value, a)
                                        }}
                                        className='setItemSlide'
                                        value={typeof settingValue[a.type] === 'number' ? a.type == 'press' ? settingValue[a.type] : settingValue[a.type] * 100 / a.max : 0}
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
                                            max={100}
                                            style={{ margin: '0 16px' }}
                                            className='setItemInput'
                                            value={typeof settingValue[a.type] === 'number' ? Math.round(settingValue[a.type] * 100 / a.max) : 0}
                                            onChange={(value) => {
                                                onChange(value, a)
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
                        label: t('flipV'), value: 'up'
                    }, {
                        label: t('flipH'), value: 'left'
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
               {onSelect ? <SelectSet onSelect={onSelect}  selectArr={selectArr}/> : ''}
            </div>

        </>
    )
}

export default withTranslation('translation')(SecondTitle)
