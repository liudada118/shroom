import { Input, message, Popover } from 'antd'
import React, { useContext, useEffect, useState } from 'react'
import { getSysType, useEquipStore } from '../../store/equipStore'
import { shallow } from 'zustand/shallow'
import { colSelectMatrix } from '../../util/util'
import { systemPointConfig } from '../../util/constant'
import { pageContext } from '../../page/test/Test'
import { isMoreMatrix } from '../../assets/util/util'
import { calMatrixToSelect } from '../../assets/util/selectMatrix'
import { getSelectBoxDisplayColor, getSelectBoxFillColor, SELECT_COLORS } from '../selectBox/newSelecttBox'

const selectInputObj = [
    { name: 'X', placeholder: '横向起点', valueStr: 'xStart' },
    { name: 'Y', placeholder: '纵向起点', valueStr: 'yStart' },
    { name: '长', placeholder: '横向点数', valueStr: 'width' },
    { name: '宽', placeholder: '纵向点数', valueStr: 'height' },
]

export default function SelectSet(props) {
    const { onSelect } = props
    const pageInfo = useContext(pageContext);
    const { displayType } = pageInfo

    const [boxes, setBoxes] = useState([])
    const [matrixInfo, setMatrixInfo] = useState({})
    const [sysType, setSysType] = useState('')
    const [inputRect, setInputRect] = useState({ xStart: '', yStart: '', width: '', height: '' })

    useEffect(() => {
        const systemType = getSysType()
        let type
        if (isMoreMatrix(systemType)) {
            type = systemType + '-' + (displayType.includes('back') ? 'back' : displayType.includes('sit') ? 'sit' : '')
        } else {
            type = systemType
        }
        setSysType(type)

        if (systemPointConfig[type]) {
            const { width, height } = systemPointConfig[type]
            setMatrixInfo({ width, height })
        }

        const cb = (rangeArr) => {
            // 将每个框选转换为矩阵坐标
            const newBoxes = rangeArr.map((range, idx) => {
                const matrix = colSelectMatrix('canvasThree', range, systemPointConfig[type])
                if (!matrix) return null
                return {
                    colorIndex: range.colorIndex != null ? range.colorIndex : idx,
                    bgc: range.bgc || SELECT_COLORS[idx] || '#FF6B6B',
                    xStart: matrix.xStart,
                    yStart: matrix.yStart,
                    width: matrix.xEnd - matrix.xStart,
                    height: matrix.yEnd - matrix.yStart,
                }
            }).filter(Boolean)
            setBoxes(newBoxes)
        }

        pageInfo.brushInstance.subscribe(cb)
        return () => {
            pageInfo.brushInstance.unsubscribe(cb)
        }
    }, [pageInfo.brushInstance])

    const handleDeleteBox = (idx) => {
        pageInfo.brushInstance.deleteSelect(idx)
    }

    const handleDeleteAll = () => {
        pageInfo.brushInstance.deleteAll()
    }

    const handleAddByInput = () => {
        const { xStart, yStart, width, height } = inputRect
        const x = Number(xStart), y = Number(yStart), w = Number(width), h = Number(height)

        if (isNaN(x) || isNaN(y) || isNaN(w) || isNaN(h)) {
            message.error('请输入有效数字')
            return
        }
        if (x < 0 || y < 0) {
            message.error('初始坐标需要大于0')
            return
        }

        const maxW = matrixInfo.width || 32
        const maxH = matrixInfo.height || 32
        if (x + w > maxW) {
            message.warning(`X(${x}) + 长(${w}) 超过横向传感点数(${maxW})`)
            return
        }
        if (y + h > maxH) {
            message.warning(`Y(${y}) + 宽(${h}) 超过纵向传感点数(${maxH})`)
            return
        }

        if (pageInfo.brushInstance.rangeArr.length >= 4) {
            message.warning('最多只能创建 4 个框选区域')
            return
        }

        const selectInfo = calMatrixToSelect('canvasThree', { xStart: x, yStart: y, sWidth: w, sHeight: h }, systemPointConfig[sysType])
        if (!selectInfo) {
            message.error('无法计算框选位置')
            return
        }
        const { selectWidth, selectHeight, selectX, selectY } = selectInfo
        const colorIndex = pageInfo.brushInstance._nextColorIndex()
        const bgc = SELECT_COLORS[colorIndex]
        const displayColor = getSelectBoxDisplayColor(bgc)

        // 创建 DOM 元素
        const element = document.createElement('div')
        element.classList.add('selectBox')
        element.style.position = 'fixed'
        element.style.left = selectX + 'px'
        element.style.top = selectY + 'px'
        element.style.width = selectWidth + 'px'
        element.style.height = selectHeight + 'px'
        element.style.border = `2px solid ${displayColor}`
        element.style.backgroundColor = getSelectBoxFillColor(bgc)
        element.style.boxShadow = `0 0 0 1px ${displayColor}`
        element.style.opacity = 1
        element.style.zIndex = 999
        element.style.display = 'block'
        document.body.appendChild(element)

        const rangeObj = {
            bgc,
            colorIndex,
            x1: selectX,
            x2: selectX + selectWidth,
            y1: selectY,
            y2: selectY + selectHeight,
            _element: element,
        }

        pageInfo.brushInstance.rangeArr.push(rangeObj)
        pageInfo.brushInstance._makeInteractive(element, rangeObj, pageInfo.brushInstance.rangeArr.length - 1)
        pageInfo.brushInstance.notify(pageInfo.brushInstance.rangeArr)

        setInputRect({ xStart: '', yStart: '', width: '', height: '' })
    }

    const selectInfoTip = <div style={{ width: '12rem', color: '#fff', fontSize: '0.75rem' }}>
        <div>X: 横向起点（从0开始）</div>
        <div>Y: 纵向起点（从0开始）</div>
        <div>长: 框选横向点数</div>
        <div>宽: 框选纵向点数</div>
        <div style={{ marginTop: 4, color: '#FFD93D' }}>
            最多4个框选，X+长 ≤ {matrixInfo.width || '?'}，Y+宽 ≤ {matrixInfo.height || '?'}
        </div>
    </div>

    if (!onSelect) return null

    return (
        <div className='selectInputContent' style={{ maxHeight: '16rem', overflowY: 'auto' }}>
            {/* 标题 */}
            <div className="selectInputTitle" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div className="selectInputTitleInfo">框选区域</div>
                    <span style={{ fontSize: '0.7rem', color: '#6C7784' }}>({boxes.length}/4)</span>
                    <Popover color='#32373E' placement="bottomLeft" content={selectInfoTip}>
                        <i className='iconfont cursor' style={{ fontSize: '0.85rem' }}>&#xe674;</i>
                    </Popover>
                </div>
                {boxes.length > 0 && (
                    <span
                        onClick={handleDeleteAll}
                        style={{ fontSize: '0.7rem', color: '#ff4444', cursor: 'pointer' }}
                    >
                        清除全部
                    </span>
                )}
            </div>

            {/* 已有框选列表 */}
            {boxes.map((box, idx) => (
                <div key={`box-${box.colorIndex}-${idx}`} style={{
                    display: 'flex', alignItems: 'center', gap: '0.4rem',
                    padding: '0.25rem 0', borderBottom: '1px solid #2a2e33',
                    fontSize: '0.75rem',
                }}>
                    <div style={{
                        width: '12px', height: '12px', borderRadius: '3px',
                        backgroundColor: box.bgc, flexShrink: 0,
                    }} />
                    <span style={{ color: '#E6EBF0', minWidth: '2.2rem' }}>框{box.colorIndex + 1}</span>
                    <span style={{ color: '#8C939D', fontVariantNumeric: 'tabular-nums' }}>
                        ({box.xStart},{box.yStart}) {box.width}×{box.height}
                    </span>
                    <i
                        className='iconfont cursor'
                        onClick={() => handleDeleteBox(idx)}
                        style={{ marginLeft: 'auto', fontSize: '0.75rem', color: '#ff4444' }}
                    >&#xe625;</i>
                </div>
            ))}

            {/* 手动输入添加框选 */}
            {boxes.length < 4 && (
                <div style={{ marginTop: '0.4rem', borderTop: '1px solid #2a2e33', paddingTop: '0.4rem' }}>
                    <div style={{ fontSize: '0.7rem', color: '#6C7784', marginBottom: '0.25rem' }}>手动添加框选</div>
                    <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                        {selectInputObj.map((a) => (
                            <div key={a.valueStr} style={{ display: 'flex', alignItems: 'center', gap: '0.15rem' }}>
                                <span style={{ fontSize: '0.7rem', color: '#8C939D', minWidth: '0.8rem' }}>{a.name}</span>
                                <Input
                                    value={inputRect[a.valueStr]}
                                    onChange={(e) => setInputRect(prev => ({ ...prev, [a.valueStr]: e.target.value }))}
                                    className='selectInput'
                                    style={{
                                        width: '3rem', backgroundColor: '#202327',
                                        border: '1px solid #32373E', color: '#E6EBF0',
                                        fontSize: '0.7rem', padding: '0.1rem 0.3rem',
                                    }}
                                    placeholder={a.placeholder}
                                />
                            </div>
                        ))}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.3rem' }}>
                        <div
                            className="selectInputButton connectButton cursor"
                            onClick={handleAddByInput}
                            style={{ fontSize: '0.7rem', padding: '0.15rem 0.6rem' }}
                        >
                            添加
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
