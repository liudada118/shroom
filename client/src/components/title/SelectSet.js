import { Input, message, Popover } from 'antd'
import React, { useContext, useEffect, useState } from 'react'
import { getSysType, useEquipStore } from '../../store/equipStore'
import { shallow } from 'zustand/shallow'
import { colSelectMatrix } from '../../util/util'
import { systemPointConfig } from '../../util/constant'
import { pageContext } from '../../page/test/Test'
import { isMoreMatrix } from '../../assets/util/util'
import { calMatrixToSelect } from '../../assets/util/selectMatrix'

const selectInputObj = [
    {
        name: 'X',
        placeholder: '输入初始横向起点',
        valueStr: 'xStart'
    }, {
        name: 'Y',
        placeholder: '输入初始纵向起点',
        valueStr: 'yStart'
    }, {
        name: '长',
        placeholder: '输入框选横向点数',
        valueStr: 'width'
    }, {
        name: '宽',
        placeholder: '输入框选纵向点数',
        valueStr: 'height'
    },
]

// 单个框选面板组件（显示在框附近）
function SelectBoxPanel({ boxData, boxIndex, matrixInfo, sysType, pageInfo, type }) {
    const [rect, setRect] = useState({})
    const [minimized, setMinimized] = useState(false)

    useEffect(() => {
        if (!boxData) return
        try {
            const matrix = colSelectMatrix('canvasThree', boxData, systemPointConfig[type])
            if (matrix) {
                setRect({
                    xStart: matrix.xStart,
                    xEnd: matrix.xEnd,
                    yStart: matrix.yStart,
                    yEnd: matrix.yEnd,
                    width: matrix.xEnd - matrix.xStart,
                    height: matrix.yEnd - matrix.yStart
                })
            }
        } catch (e) { }
    }, [boxData, type])

    const deleteBox = () => {
        pageInfo.brushInstance.deleteSelect(boxIndex)
    }

    // 计算面板位置：在框的右上角附近
    const panelStyle = {
        position: 'fixed',
        left: Math.min(boxData.x2 + 8, window.innerWidth - 200) + 'px',
        top: Math.max(boxData.y1, 80) + 'px',
        background: '#1A1C20',
        boxShadow: '0px 4px 10px 0px rgba(0, 0, 0, 0.4)',
        borderRadius: '0.75rem',
        padding: minimized ? '0.5rem 0.75rem' : '0.875rem 1.125rem',
        color: '#E6EBF0',
        zIndex: 1100,
        minWidth: minimized ? '80px' : '140px',
        border: '1px solid #ffcc00',
        fontSize: '0.875rem',
    }

    if (minimized) {
        return (
            <div style={panelStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>框{boxIndex + 1}</span>
                    <div>
                        <i className='iconfont cursor' style={{ marginRight: '8px', fontSize: '0.75rem' }}
                            onClick={() => setMinimized(false)}>&#xe623;</i>
                        <i className='iconfont cursor' style={{ color: '#606A76', fontSize: '0.75rem' }}
                            onClick={deleteBox}>&#xe625;</i>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div style={panelStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontWeight: 'bold' }}>框选区域 {boxIndex + 1}</span>
                <div>
                    <span className='cursor' style={{ marginRight: '10px', fontSize: '0.75rem', color: '#0072EF' }}
                        onClick={() => setMinimized(true)}>缩小</span>
                    <i className='iconfont cursor' style={{ color: '#606A76', fontSize: '0.75rem' }}
                        onClick={deleteBox}>&#xe625;</i>
                </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.4rem' }}>
                <span style={{ width: '2rem', textAlign: 'right', marginRight: '0.5rem' }}>X:</span>
                <span>{rect.xStart}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.4rem' }}>
                <span style={{ width: '2rem', textAlign: 'right', marginRight: '0.5rem' }}>Y:</span>
                <span>{rect.yStart}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.4rem' }}>
                <span style={{ width: '2rem', textAlign: 'right', marginRight: '0.5rem' }}>长:</span>
                <span>{rect.width}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.4rem' }}>
                <span style={{ width: '2rem', textAlign: 'right', marginRight: '0.5rem' }}>宽:</span>
                <span>{rect.height}</span>
            </div>
        </div>
    )
}

export default function SelectSet(props) {
    const { onSelect } = props

    const pageInfo = useContext(pageContext);
    const { displayType } = pageInfo

    const [rangeArr, setRangeArr] = useState([])
    const [selectedBoxIndex, setSelectedBoxIndex] = useState(-1)
    const [matrixInfo, setMatrixInfo] = useState({})
    const [sysType, setSysType] = useState('')
    const [typeRef, setTypeRef] = useState('')

    // 手动输入框的状态
    const [inputRect, setInputRect] = useState({})

    useEffect(() => {
        const systemType = getSysType()
        let type
        if (isMoreMatrix(systemType)) {
            type = systemType + '-' + (displayType.includes('back') ? 'back' : displayType.includes('sit') ? 'sit' : '')
        } else {
            type = systemType
        }
        setSysType(type)
        setTypeRef(type)

        const config = systemPointConfig[type]
        if (config) {
            setMatrixInfo({ width: config.width, height: config.height })
        }

        const cb = (range, selIdx) => {
            setRangeArr([...range])
            setSelectedBoxIndex(selIdx !== undefined ? selIdx : -1)
        }

        pageInfo.brushInstance.subscribe(cb);

        return () => {
            pageInfo.brushInstance.unsubscribe(cb);
        };
    }, [pageInfo.brushInstance, displayType])

    const selectInfo = <div style={{ width: '10rem', color: '#fff' }}>
        <div>X: 输入初始横向起点</div>
        <div>Y: 输入初始纵向起点</div>
        <div>长: 输入框选横向点数</div>
        <div>宽: 输入框选纵向点数</div>
        <div>注意: x加长不能超过横向传感点数({matrixInfo.width || 32}个),y加宽不能超过纵向传感点数({matrixInfo.height || 32}个)</div>
    </div>

    return <>
        {onSelect ? <div className='selectInputContent'>
            <div className="selectInputTitle">
                <div className="selectInputTitleInfo">框选区域</div>
                <Popover color='#32373E' className='set-popover' placement="bottomLeft" content={selectInfo}>
                    <i className='iconfont cursor'>&#xe674;</i>
                </Popover>
            </div>
            {
                selectInputObj.map((a => {
                    return <div className='selectInputItem' key={a.valueStr}>
                        <div className="selectInputItemName">{a.name}:</div>
                        <Input value={inputRect[a.valueStr]} onChange={(e) => {
                            const obj = { ...inputRect }
                            obj[a.valueStr] = Number(e.target.value)
                            setInputRect(obj)
                        }} className='selectInput' style={{ width: '5rem', backgroundColor: '#202327', border: 0, color: "#E6EBF0" }} placeholder={a.placeholder} />
                    </div>
                }))
            }
            <div className="selectInputButtonContent">
                <div className="selectInputButton connectButton cursor"
                    onClick={() => {
                        if (inputRect.xStart < 0 || inputRect.yStart < 0) {
                            message.error('初始坐标需要大于0')
                            return
                        }
                        if (inputRect.xStart + inputRect.width > systemPointConfig[sysType].width) {
                            message.error('初始横坐标加长不能超过横向传感点数')
                            return
                        }
                        if (inputRect.yStart + inputRect.height > systemPointConfig[sysType].height) {
                            message.error('初始纵坐标加宽不能超过纵向传感点数')
                            return
                        }
                        const selectInfoResult = calMatrixToSelect('canvasThree', {
                            xStart: inputRect.xStart,
                            yStart: inputRect.yStart,
                            sWidth: inputRect.width,
                            sHeight: inputRect.height
                        }, systemPointConfig[sysType])
                        const { selectWidth, selectHeight, selectX, selectY } = selectInfoResult

                        const obj = {
                            bgc: "#ff4444",
                            index: pageInfo.brushInstance.selectIndex,
                            x1: selectX,
                            x2: selectX + selectWidth,
                            y1: selectY,
                            y2: selectY + selectHeight
                        }

                        // 创建 DOM 元素
                        const el = document.createElement('div')
                        el.classList.add('selectBox')
                        el.classList.add(`selectBox${obj.index}`)
                        el.style.pointerEvents = 'none'
                        el.style.border = '3px solid #ff4444'
                        el.style.backgroundColor = 'rgba(255,68,68,0.15)'
                        el.style.position = 'fixed'
                        el.style.zIndex = '100'
                        el.style.left = selectX + 'px'
                        el.style.top = selectY + 'px'
                        el.style.width = selectWidth + 'px'
                        el.style.height = selectHeight + 'px'
                        document.body.appendChild(el)

                        pageInfo.brushInstance.rangeArr.push(obj)
                        pageInfo.brushInstance.selectIndex += 10
                        pageInfo.brushInstance.notify(pageInfo.brushInstance.rangeArr)
                    }}
                >确认</div>
            </div>
        </div> : ''}

        {/* 选中的框附近显示面板 */}
        {onSelect && rangeArr.map((box, idx) => {
            if (selectedBoxIndex !== idx) return null
            return <SelectBoxPanel
                key={box.index}
                boxData={box}
                boxIndex={idx}
                matrixInfo={matrixInfo}
                sysType={sysType}
                pageInfo={pageInfo}
                type={typeRef}
            />
        })}
    </>
}
