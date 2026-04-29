import React, { useContext, useEffect, useState } from 'react'
import { Input, message, Popover } from 'antd'
import { getSysType } from '../../store/equipStore'
import { colSelectMatrix } from '../../util/util'
import { systemPointConfig } from '../../util/constant'
import { pageContext } from '../../page/test/Test'
import { isMoreMatrix } from '../../assets/util/util'
import { calMatrixToSelect } from '../../assets/util/selectMatrix'
import { SELECT_COLORS, getSelectBoxDisplayColor, getSelectBoxFillColor, attachBoxLabel } from '../selectBox/newSelecttBox'
import DraggablePanel from '../draggablePanel/DraggablePanel'

const MAX_BOXES = 8

const selectInputObj = [
    { name: 'X', placeholder: '横向起点', valueStr: 'xStart' },
    { name: 'Y', placeholder: '纵向起点', valueStr: 'yStart' },
    { name: '长', placeholder: '横向点数', valueStr: 'width' },
    { name: '宽', placeholder: '纵向点数', valueStr: 'height' },
]

const PANEL_W = 360            // 跟 BrushModePanel 宽度对齐
const RIGHT_MARGIN = 20
const VERTICAL_GAP = 10        // 三个面板间距统一

export default function SelectSet() {
    const pageInfo = useContext(pageContext)
    const { displayType } = pageInfo

    const [boxes, setBoxes] = useState([])
    const [matrixInfo, setMatrixInfo] = useState({})
    const [sysType, setSysType] = useState('')
    const [inputRect, setInputRect] = useState({ xStart: '', yStart: '', width: '', height: '' })
    const [position, setPosition] = useState({
        x: Math.max(20, window.innerWidth - PANEL_W - RIGHT_MARGIN),
        y: 140,
    })

    // 跟随 ChartsAside 右侧 (压力中心点) bottom, 保持等距
    useEffect(() => {
        const updatePos = () => {
            const targetX = Math.max(20, window.innerWidth - PANEL_W - RIGHT_MARGIN)
            const charts = document.querySelector('.pressure-center-panel')
            let targetY = 140
            if (charts) {
                const rect = charts.getBoundingClientRect()
                if (rect.bottom > 0) {
                    targetY = Math.round(rect.bottom + VERTICAL_GAP)
                }
            }
            setPosition(prev => (prev.x === targetX && prev.y === targetY) ? prev : { x: targetX, y: targetY })
        }
        updatePos()
        let observer
        if (window.ResizeObserver) {
            observer = new ResizeObserver(updatePos)
            observer.observe(document.body)
            setTimeout(() => {
                const c = document.querySelector('.pressure-center-panel')
                if (c) observer.observe(c)
            }, 100)
        }
        const id = setInterval(updatePos, 200)
        window.addEventListener('resize', updatePos)
        return () => {
            observer?.disconnect()
            clearInterval(id)
            window.removeEventListener('resize', updatePos)
        }
    }, [])

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
            const newBoxes = rangeArr.map((range, idx) => {
                const matrix = colSelectMatrix('canvasThree', range, systemPointConfig[type])
                if (!matrix) return null
                const w = matrix.xEnd - matrix.xStart
                const h = matrix.yEnd - matrix.yStart
                // 过滤异常 0×0 / 负尺寸框 (来自跨视图遗留 element 计算错位)
                if (w <= 0 || h <= 0) return null
                return {
                    colorIndex: range.colorIndex != null ? range.colorIndex : idx,
                    bgc: range.bgc || SELECT_COLORS[idx] || SELECT_COLORS[0],
                    xStart: matrix.xStart,
                    yStart: matrix.yStart,
                    width: w,
                    height: h,
                }
            }).filter(Boolean)
            setBoxes(newBoxes)
        }
        cb(pageInfo.brushInstance.rangeArr || [])
        pageInfo.brushInstance.subscribe(cb)
        return () => pageInfo.brushInstance.unsubscribe(cb)
    }, [pageInfo.brushInstance, displayType])

    const handleDeleteBox = (idx) => {
        pageInfo.brushInstance.deleteSelect(idx)
    }

    const handleDeleteAll = () => {
        pageInfo.brushInstance.deleteAll()
    }

    const handleRedraw = () => {
        pageInfo.brushInstance.redrawCurrent()
    }

    const handleAddByInput = () => {
        const { xStart, yStart, width, height } = inputRect
        const x = Number(xStart), y = Number(yStart), w = Number(width), h = Number(height)

        if (isNaN(x) || isNaN(y) || isNaN(w) || isNaN(h)) {
            message.error('请输入有效数字')
            return
        }
        if (x < 0 || y < 0) {
            message.error('初始坐标需要大于 0')
            return
        }

        const maxW = matrixInfo.width || 32
        const maxH = matrixInfo.height || 32
        if (x + w > maxW) {
            message.warning(`X(${x}) + 长(${w}) 超过横向传感点数 (${maxW})`)
            return
        }
        if (y + h > maxH) {
            message.warning(`Y(${y}) + 宽(${h}) 超过纵向传感点数 (${maxH})`)
            return
        }

        if (pageInfo.brushInstance.rangeArr.length >= MAX_BOXES) {
            message.warning(`最多只能创建 ${MAX_BOXES} 个框选区域`)
            return
        }

        const selectInfo = calMatrixToSelect('canvasThree', { xStart: x, yStart: y, sWidth: w, sHeight: h }, systemPointConfig[sysType])
        if (!selectInfo) {
            message.error('无法计算框选位置')
            return
        }
        const { selectWidth, selectHeight, selectX, selectY } = selectInfo
        const colorIndex = pageInfo.brushInstance._nextColorIndex()
        const bgc = pageInfo.brushInstance._nextAvailableBgc()
        const displayColor = getSelectBoxDisplayColor(bgc)

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
        attachBoxLabel(element, colorIndex, bgc)
        pageInfo.brushInstance._makeInteractive(element, rangeObj, pageInfo.brushInstance.rangeArr.length - 1)
        pageInfo.brushInstance.notify(pageInfo.brushInstance.rangeArr)

        setInputRect({ xStart: '', yStart: '', width: '', height: '' })
    }

    const selectInfoTip = (
        <div style={{ width: '12rem', color: '#fff', fontSize: '0.75rem' }}>
            <div>X: 横向起点（从 0 开始）</div>
            <div>Y: 纵向起点（从 0 开始）</div>
            <div>长: 框选横向点数</div>
            <div>宽: 框选纵向点数</div>
            <div style={{ marginTop: 4, color: '#FFD93D' }}>
                最多 {MAX_BOXES} 个框选，X+长 ≤ {matrixInfo.width || '?'}，Y+宽 ≤ {matrixInfo.height || '?'}
            </div>
        </div>
    )

    return (
        <DraggablePanel
            title={`框选区域 (${boxes.length}/${MAX_BOXES})`}
            defaultPosition={position}
            disableDrag={true}
            className='select-set-panel'
        >
            <div style={{ width: '21rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                {/* 帮助提示 + 操作按钮 */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.15rem' }}>
                    <Popover color='#32373E' placement='bottomLeft' content={selectInfoTip}>
                        <i className='iconfont cursor' style={{ fontSize: '0.9rem', color: '#8C939D' }}>&#xe674;</i>
                    </Popover>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        {boxes.length > 0 && (
                            <span
                                onClick={handleRedraw}
                                title='把当前组所有框重新显示到画布上'
                                style={{ fontSize: '0.7rem', color: '#5479ff', cursor: 'pointer' }}
                            >
                                恢复显示
                            </span>
                        )}
                        {boxes.length > 0 && (
                            <span
                                onClick={handleDeleteAll}
                                style={{ fontSize: '0.7rem', color: '#ff4444', cursor: 'pointer' }}
                            >
                                清除全部
                            </span>
                        )}
                    </div>
                </div>

                {/* 8 个固定槽位, 按 colorIndex 定位 (删一个其他不挪位置) */}
                {Array.from({ length: MAX_BOXES }).map((_, slotIdx) => {
                    const box = boxes.find(b => b.colorIndex === slotIdx)
                    const arrIdx = box ? boxes.indexOf(box) : -1
                    const exists = !!box
                    const color = exists ? box.bgc : SELECT_COLORS[slotIdx]

                    return (
                        <div
                            key={slotIdx}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.4rem',
                                padding: '0.3rem 0.45rem',
                                borderRadius: '4px',
                                background: exists ? getSelectBoxFillColor(color, 0.08) : 'rgba(40, 43, 48, 0.4)',
                                border: `1px solid ${exists ? color + '55' : '#2a2d33'}`,
                                opacity: exists ? 1 : 0.45,
                                fontSize: '0.78rem',
                                transition: 'opacity 0.18s, background 0.18s',
                            }}
                        >
                            <div style={{
                                width: '12px', height: '12px', borderRadius: '3px',
                                backgroundColor: exists ? color : '#3b4048', flexShrink: 0,
                            }} />
                            <span style={{
                                color: exists ? '#E6EBF0' : '#5c6470',
                                minWidth: '1rem',
                                fontWeight: exists ? 700 : 400,
                                fontVariantNumeric: 'tabular-nums',
                            }}>
                                {slotIdx + 1}
                            </span>
                            {exists ? (
                                <>
                                    <span style={{ color: '#8C939D', fontVariantNumeric: 'tabular-nums', fontSize: '0.72rem' }}>
                                        ({box.xStart},{box.yStart}) {box.width}×{box.height}
                                    </span>
                                    <i
                                        className='iconfont cursor'
                                        onClick={() => arrIdx >= 0 && handleDeleteBox(arrIdx)}
                                        style={{ marginLeft: 'auto', fontSize: '0.78rem', color: '#ff4444' }}
                                    >&#xe625;</i>
                                </>
                            ) : (
                                <span style={{ marginLeft: 'auto', color: '#5c6470', fontSize: '0.7rem' }}>
                                    未创建
                                </span>
                            )}
                        </div>
                    )
                })}

                {/* 手动输入添加框选 */}
                {boxes.length < MAX_BOXES && (
                    <div style={{ marginTop: '0.5rem', borderTop: '1px solid #2a2e33', paddingTop: '0.4rem' }}>
                        <div style={{ fontSize: '0.7rem', color: '#6C7784', marginBottom: '0.3rem' }}>手动添加框选</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.25rem 0.4rem' }}>
                            {selectInputObj.map((a) => (
                                <div key={a.valueStr} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                    <span style={{ fontSize: '0.72rem', color: '#8C939D', minWidth: '0.9rem' }}>{a.name}</span>
                                    <Input
                                        value={inputRect[a.valueStr]}
                                        onChange={(e) => setInputRect(prev => ({ ...prev, [a.valueStr]: e.target.value }))}
                                        style={{
                                            backgroundColor: '#202327',
                                            border: '1px solid #32373E',
                                            color: '#E6EBF0',
                                            fontSize: '0.72rem',
                                            padding: '0.1rem 0.3rem',
                                            height: '1.5rem',
                                        }}
                                        placeholder={a.placeholder}
                                    />
                                </div>
                            ))}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.4rem' }}>
                            <div
                                onClick={handleAddByInput}
                                className='cursor'
                                style={{
                                    fontSize: '0.72rem',
                                    padding: '0.25rem 0.7rem',
                                    background: '#2952d6',
                                    color: '#fff',
                                    borderRadius: '4px',
                                    fontWeight: 500,
                                    userSelect: 'none',
                                }}
                            >
                                添加
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </DraggablePanel>
    )
}
