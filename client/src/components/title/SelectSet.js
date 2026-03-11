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
        placeholder: '输入...',
        valueStr: 'xStart'
    }, {
        name: 'Y',
        placeholder: '输入...',
        valueStr: 'yStart'
    }, {
        name: '长',
        placeholder: '输入...',
        valueStr: 'width'
    }, {
        name: '宽',
        placeholder: '输入...',
        valueStr: 'height'
    },
]

/**
 * 单个框选面板组件 —— 统一为带输入框样式
 * 既可以显示鼠标框选的结果（自动填入），也可以手动修改
 */
function SelectBoxPanel({ boxData, boxIndex, matrixInfo, sysType, pageInfo, type, onClose }) {
    const [rect, setRect] = useState({ xStart: '', yStart: '', width: '', height: '' })

    // 当框数据变化时，自动计算并填入坐标
    useEffect(() => {
        if (!boxData) return
        try {
            const config = systemPointConfig[type]
            const matrix = colSelectMatrix('canvasThree', boxData, config)
            if (matrix) {
                const w = matrix.xEnd - matrix.xStart
                const h = matrix.yEnd - matrix.yStart
                // 校验框选区域是否超出传感点数范围
                if (config) {
                    if (matrix.xStart + w > config.width) {
                        message.warning(`初始横坐标X(${matrix.xStart}) + 框选区域长度(${w}) = ${matrix.xStart + w}，超过横向传感点数(${config.width})，请调整框选范围`)
                    }
                    if (matrix.yStart + h > config.height) {
                        message.warning(`初始纵坐标Y(${matrix.yStart}) + 框选区域宽度(${h}) = ${matrix.yStart + h}，超过纵向传感点数(${config.height})，请调整框选范围`)
                    }
                }
                setRect({
                    xStart: matrix.xStart,
                    yStart: matrix.yStart,
                    width: w,
                    height: h
                })
            }
        } catch (e) { }
    }, [boxData, type])

    const deleteBox = () => {
        pageInfo.brushInstance.deleteSelect(boxIndex)
    }

    // 手动修改输入框后，点击确认更新框的位置
    const handleConfirm = () => {
        const config = systemPointConfig[sysType]
        if (!config) return

        const xStart = Number(rect.xStart)
        const yStart = Number(rect.yStart)
        const width = Number(rect.width)
        const height = Number(rect.height)

        if (isNaN(xStart) || isNaN(yStart) || isNaN(width) || isNaN(height)) {
            message.error('请输入有效数字')
            return
        }
        if (xStart < 0 || yStart < 0) {
            message.error('初始坐标需要大于0')
            return
        }
        if (xStart + width > config.width) {
            message.error('初始横坐标加长不能超过横向传感点数')
            return
        }
        if (yStart + height > config.height) {
            message.error('初始纵坐标加宽不能超过纵向传感点数')
            return
        }

        // 根据输入值重新计算框的像素位置
        const selectInfoResult = calMatrixToSelect('canvasThree', {
            xStart, yStart, sWidth: width, sHeight: height
        }, config)
        const { selectWidth, selectHeight, selectX, selectY } = selectInfoResult

        // 更新框的位置数据
        const box = pageInfo.brushInstance.rangeArr[boxIndex]
        if (box) {
            box.x1 = selectX
            box.y1 = selectY
            box.x2 = selectX + selectWidth
            box.y2 = selectY + selectHeight

            // 更新 DOM 元素位置
            const el = document.querySelector(`.selectBox${box.index}`)
            if (el) {
                el.style.left = selectX + 'px'
                el.style.top = selectY + 'px'
                el.style.width = selectWidth + 'px'
                el.style.height = selectHeight + 'px'
            }
            pageInfo.brushInstance.notify(pageInfo.brushInstance.rangeArr)
        }
    }

    const selectInfo = <div style={{ width: '10rem', color: '#fff' }}>
        <div>X: 输入初始横向起点</div>
        <div>Y: 输入初始纵向起点</div>
        <div>长: 输入框选横向点数</div>
        <div>宽: 输入框选纵向点数</div>
        <div>注意: x加长不能超过横向传感点数({matrixInfo.width || 32}个),y加宽不能超过纵向传感点数({matrixInfo.height || 32}个)</div>
    </div>

    return (
        <div className='selectInputContent' style={{ position: 'fixed', top: 'auto', right: 'auto', left: Math.min((boxData?.x2 || 0) + 8, window.innerWidth - 220) + 'px', top: Math.max((boxData?.y1 || 0), 80) + 'px', zIndex: 10000 }}>
            <div className="selectInputTitle">
                <div className="selectInputTitleInfo">框选区域 {boxIndex + 1}</div>
                <Popover color='#32373E' className='set-popover' placement="bottomLeft" content={selectInfo}>
                    <i className='iconfont cursor'>&#xe674;</i>
                </Popover>
                <i className='iconfont cursor' style={{ marginLeft: 'auto', color: '#606A76', fontSize: '0.75rem' }}
                    onClick={deleteBox}>&#xe625;</i>
            </div>
            {
                selectInputObj.map((a => {
                    return <div className='selectInputItem' key={a.valueStr}>
                        <div className="selectInputItemName">{a.name}:</div>
                        <Input value={rect[a.valueStr]} onChange={(e) => {
                            const obj = { ...rect }
                            obj[a.valueStr] = e.target.value === '' ? '' : Number(e.target.value)
                            setRect(obj)
                        }} className='selectInput' style={{ width: '5rem', backgroundColor: '#202327', border: 0, color: "#E6EBF0" }} placeholder={a.placeholder} />
                    </div>
                }))
            }
            <div className="selectInputButtonContent">
                <div className="selectInputButton connectButton cursor" onClick={handleConfirm}>确认</div>
            </div>
        </div>
    )
}

export default function SelectSet(props) {
    const { onSelect } = props

    const pageInfo = useContext(pageContext);
    const { displayType } = pageInfo

    const [rangeArr, setRangeArr] = useState([])
    const [selectedBoxIndices, setSelectedBoxIndices] = useState(new Set())
    const [matrixInfo, setMatrixInfo] = useState({})
    const [sysType, setSysType] = useState('')
    const [typeRef, setTypeRef] = useState('')

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

        // 设置有效区域边界（基于 canvas 元素的位置）
        const updateValidBounds = () => {
            const canvas = document.querySelector('.canvasNumInner') || document.querySelector('.canvasThree')
            if (canvas && pageInfo.brushInstance) {
                const rect = canvas.getBoundingClientRect()
                pageInfo.brushInstance.setValidBounds({
                    left: rect.left,
                    top: rect.top,
                    right: rect.right,
                    bottom: rect.bottom
                })
            }
        }

        // 初始设置 + 窗口变化时更新
        updateValidBounds()
        const resizeHandler = () => updateValidBounds()
        window.addEventListener('resize', resizeHandler)

        // 定时更新（canvas 可能延迟渲染）
        const intervalId = setInterval(updateValidBounds, 1000)

        const cb = (range, selIndices) => {
            setRangeArr([...range])
            if (selIndices instanceof Set) {
                setSelectedBoxIndices(new Set(selIndices))
            } else {
                setSelectedBoxIndices(new Set())
            }
        }

        pageInfo.brushInstance.subscribe(cb);

        return () => {
            pageInfo.brushInstance.unsubscribe(cb);
            pageInfo.brushInstance.clearValidBounds()
            window.removeEventListener('resize', resizeHandler)
            clearInterval(intervalId)
        };
    }, [pageInfo.brushInstance, displayType])

    return <>
        {/* 右上角固定的框选区域输入面板已隐藏 */}

        {/* 所有选中的框都显示编辑面板（支持多选） */}
        {onSelect && rangeArr.map((box, idx) => {
            if (!selectedBoxIndices.has(idx)) return null
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
