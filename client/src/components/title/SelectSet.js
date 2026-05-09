import { Input, message, Modal, Popover, Select } from 'antd'
import React, { useContext, useEffect, useState } from 'react'
import { getSysType, useEquipStore } from '../../store/equipStore'
import { shallow } from 'zustand/shallow'
import { colSelectMatrix } from '../../util/util'
import { systemPointConfig } from '../../util/constant'
import { pageContext } from '../../page/test/Test'
import { isMoreMatrix } from '../../assets/util/util'
import { SELECT_COLORS } from '../selectBox/newSelecttBox'

const selectInputObj = [
    { name: 'X', placeholder: '横向起点', valueStr: 'xStart' },
    { name: 'Y', placeholder: '纵向起点', valueStr: 'yStart' },
    { name: '长', placeholder: '横向点数', valueStr: 'width' },
    { name: '宽', placeholder: '纵向点数', valueStr: 'height' },
]

const SELECTION_TEMPLATE_KEY = 'selectionTemplatesV1'

function normalizeTemplateList(value) {
    return Array.isArray(value) ? value.filter(item => item && item.templateId && item.templateName) : []
}

function readSelectionTemplates() {
    try {
        return normalizeTemplateList(JSON.parse(localStorage.getItem(SELECTION_TEMPLATE_KEY) || '[]'))
    } catch (e) {
        return []
    }
}

function writeSelectionTemplates(templates) {
    localStorage.setItem(SELECTION_TEMPLATE_KEY, JSON.stringify(normalizeTemplateList(templates)))
}

function getDisplayObject(displayType = '') {
    if (displayType.includes('back')) return 'back'
    if (displayType.includes('sit')) return 'sit'
    return displayType || 'single'
}

export default function SelectSet(props) {
    const { onSelect } = props
    const pageInfo = useContext(pageContext)
    const { displayType } = pageInfo
    const systemType = useEquipStore(s => s.systemType, shallow)

    const [boxes, setBoxes] = useState([])
    const [matrixInfo, setMatrixInfo] = useState({})
    const [sysType, setSysType] = useState('')
    const [inputRect, setInputRect] = useState({ xStart: '', yStart: '', width: '', height: '' })
    const [templateName, setTemplateName] = useState('')
    const [templates, setTemplates] = useState(() => readSelectionTemplates())
    const [selectedTemplateId, setSelectedTemplateId] = useState('')

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
        if (pageInfo.brushInstance.rangeArr.some(range => range.matrixKey && range.matrixKey !== type)) {
            pageInfo.brushInstance.deleteAll()
            useEquipStore.getState().setSelectArr([])
        }

        const cb = (rangeArr) => {
            const newBoxes = rangeArr.map((range, rangeIndex) => ({ range, rangeIndex }))
                .filter(({ range }) => !range.matrixKey || range.matrixKey === type)
                .map(({ range, rangeIndex }, idx) => {
                    const matrix = range.matrixRect || colSelectMatrix('canvasThree', range, systemPointConfig[type])
                    if (!matrix) return null
                    return {
                        rangeIndex,
                        name: range.name || `框选${idx + 1}`,
                        colorIndex: range.colorIndex != null ? range.colorIndex : idx,
                        bgc: range.bgc || SELECT_COLORS[idx] || '#FF6B6B',
                        xStart: matrix.xStart,
                        yStart: matrix.yStart,
                        width: matrix.xEnd - matrix.xStart,
                        height: matrix.yEnd - matrix.yStart,
                        matrixRect: matrix,
                    }
                }).filter(Boolean)
            setBoxes(newBoxes)
        }

        cb(pageInfo.brushInstance.rangeArr)
        pageInfo.brushInstance.subscribe(cb)
        return () => {
            pageInfo.brushInstance.unsubscribe(cb)
        }
    }, [pageInfo.brushInstance, displayType, systemType])

    const isTemplateMatched = (template) => {
        if (!template) return false
        return template.deviceType === sysType
            && Number(template.matrixWidth) === Number(matrixInfo.width)
            && Number(template.matrixHeight) === Number(matrixInfo.height)
            && (!template.displayType || template.displayType === getDisplayObject(displayType))
    }

    const handleDeleteBox = (idx) => {
        const rangeIndex = boxes[idx]?.rangeIndex
        pageInfo.brushInstance.deleteSelect(rangeIndex ?? idx)
    }

    const handleRenameBox = (idx, name) => {
        const rangeIndex = boxes[idx]?.rangeIndex
        pageInfo.brushInstance.updateSelectName(rangeIndex ?? idx, name.trim() || `框选${idx + 1}`)
    }

    const handleDeleteAll = () => {
        pageInfo.brushInstance.deleteAll()
    }

    const handleAddByInput = () => {
        if (!systemPointConfig[sysType]) {
            message.error('当前视图不支持框选')
            return
        }
        const { xStart, yStart, width, height } = inputRect
        if ([xStart, yStart, width, height].some(value => String(value).trim() === '')) {
            message.error('请填写完整坐标')
            return
        }
        const x = Number(xStart), y = Number(yStart), w = Number(width), h = Number(height)

        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h)) {
            message.error('坐标必须为数字')
            return
        }
        if (![x, y, w, h].every(Number.isInteger)) {
            message.error('坐标必须为整数')
            return
        }
        if (x < 0 || y < 0 || w < 0 || h < 0) {
            message.error('坐标不能小于 0')
            return
        }
        if (w <= 0 || h <= 0) {
            message.error('框选区域过小，请重新框选')
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

        const added = pageInfo.brushInstance.addMatrixRange({
            xStart: x,
            xEnd: x + w,
            yStart: y,
            yEnd: y + h,
            width: maxW,
            height: maxH,
        })
        if (added) {
            setInputRect({ xStart: '', yStart: '', width: '', height: '' })
        }
    }

    const getCurrentRegions = () => {
        const matrixConfig = systemPointConfig[sysType]
        if (!matrixConfig) return []
        return pageInfo.brushInstance.rangeArr
            .filter(range => !range.matrixKey || range.matrixKey === sysType)
            .map((range, index) => {
                const matrix = range.matrixRect || colSelectMatrix('canvasThree', range, matrixConfig)
                if (!matrix) return null
                return {
                    regionId: range.id || `region-${Date.now()}-${index}`,
                    regionName: range.name || `框选${index + 1}`,
                    index: index + 1,
                    color: range.bgc || SELECT_COLORS[index] || '#FF6B6B',
                    colorIndex: range.colorIndex != null ? range.colorIndex : index,
                    x: matrix.xStart,
                    y: matrix.yStart,
                    width: matrix.xEnd - matrix.xStart,
                    height: matrix.yEnd - matrix.yStart,
                    matrixWidth: matrix.width || matrixConfig.width,
                    matrixHeight: matrix.height || matrixConfig.height,
                }
            })
            .filter(Boolean)
    }

    const handleSaveTemplate = () => {
        const name = templateName.trim()
        if (!boxes.length) {
            message.warning('请先创建框选区域')
            return
        }
        if (!name) {
            message.warning('请输入模板名称')
            return
        }
        const regions = getCurrentRegions()
        if (!regions.length) {
            message.warning('当前没有可保存的框选区域')
            return
        }

        const now = Date.now()
        const nextTemplate = {
            templateId: `selection-template-${now}`,
            templateName: name,
            deviceType: sysType,
            displayType: getDisplayObject(displayType),
            matrixWidth: matrixInfo.width,
            matrixHeight: matrixInfo.height,
            coordinateMode: 'display',
            regions,
            regionCount: regions.length,
            version: 1,
            createdAt: now,
            updatedAt: now,
        }
        const nextTemplates = [nextTemplate, ...templates.filter(item => item.templateName !== name)]
        writeSelectionTemplates(nextTemplates)
        setTemplates(nextTemplates)
        setSelectedTemplateId(nextTemplate.templateId)
        setTemplateName('')
        message.success('模板保存成功')
    }

    const applyTemplate = (template) => {
        if (!isTemplateMatched(template)) {
            message.warning('模板不适用于当前视图')
            return
        }
        const runApply = () => {
            pageInfo.brushInstance.deleteAll()
            template.regions.slice(0, 4).forEach((region) => {
                pageInfo.brushInstance.addMatrixRange({
                    xStart: Number(region.x),
                    yStart: Number(region.y),
                    xEnd: Number(region.x) + Number(region.width),
                    yEnd: Number(region.y) + Number(region.height),
                    width: template.matrixWidth,
                    height: template.matrixHeight,
                }, {
                    name: region.regionName,
                    colorIndex: region.colorIndex,
                    color: region.color,
                    templateId: template.templateId,
                })
            })
            message.success('模板已应用')
        }
        if (boxes.length) {
            Modal.confirm({
                title: '应用模板会覆盖当前框选',
                content: '是否继续？',
                okText: '覆盖',
                cancelText: '取消',
                onOk: runApply,
            })
            return
        }
        runApply()
    }

    const handleApplyTemplate = () => {
        const template = templates.find(item => item.templateId === selectedTemplateId)
        if (!template) {
            message.warning('请选择模板')
            return
        }
        applyTemplate(template)
    }

    const handleDeleteTemplate = () => {
        const template = templates.find(item => item.templateId === selectedTemplateId)
        if (!template) {
            message.warning('请选择模板')
            return
        }
        Modal.confirm({
            title: '删除框选模板',
            content: `确认删除「${template.templateName}」？当前画布框选不会被清除。`,
            okText: '删除',
            cancelText: '取消',
            onOk: () => {
                const nextTemplates = templates.filter(item => item.templateId !== selectedTemplateId)
                writeSelectionTemplates(nextTemplates)
                setTemplates(nextTemplates)
                setSelectedTemplateId('')
                message.success('模板已删除')
            },
        })
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
        <div className='selectInputContent' style={{ maxHeight: '24rem', overflowY: 'auto' }}>
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

            {boxes.map((box, idx) => (
                <div key={`box-${box.rangeIndex}-${idx}`} style={{
                    display: 'flex', alignItems: 'center', gap: '0.4rem',
                    padding: '0.25rem 0', borderBottom: '1px solid #2a2e33',
                    fontSize: '0.75rem',
                }}>
                    <div style={{
                        width: '12px', height: '12px', borderRadius: '3px',
                        backgroundColor: box.bgc, flexShrink: 0,
                    }} />
                    <Input
                        value={box.name}
                        onChange={(e) => handleRenameBox(idx, e.target.value)}
                        style={{
                            width: '4.8rem', backgroundColor: '#202327',
                            border: '1px solid #32373E', color: '#E6EBF0',
                            fontSize: '0.7rem', padding: '0.1rem 0.3rem',
                        }}
                    />
                    <span style={{ color: '#8C939D', fontVariantNumeric: 'tabular-nums' }}>
                        ({box.xStart},{box.yStart}) {box.width}x{box.height}
                    </span>
                    <i
                        className='iconfont cursor'
                        onClick={() => handleDeleteBox(idx)}
                        style={{ marginLeft: 'auto', fontSize: '0.75rem', color: '#ff4444' }}
                    >&#xe625;</i>
                </div>
            ))}

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

            <div style={{ marginTop: '0.5rem', borderTop: '1px solid #2a2e33', paddingTop: '0.45rem' }}>
                <div style={{ fontSize: '0.7rem', color: '#6C7784', marginBottom: '0.25rem' }}>框选模板</div>
                <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '0.35rem' }}>
                    <Input
                        value={templateName}
                        onChange={(e) => setTemplateName(e.target.value)}
                        placeholder="模板名称"
                        style={{
                            flex: 1, backgroundColor: '#202327',
                            border: '1px solid #32373E', color: '#E6EBF0',
                            fontSize: '0.7rem', padding: '0.1rem 0.3rem',
                        }}
                    />
                    <div
                        className="selectInputButton connectButton cursor"
                        onClick={handleSaveTemplate}
                        style={{ fontSize: '0.7rem', padding: '0.15rem 0.6rem', whiteSpace: 'nowrap' }}
                    >
                        保存模板
                    </div>
                </div>
                <Select
                    size="small"
                    value={selectedTemplateId || undefined}
                    onChange={setSelectedTemplateId}
                    placeholder="选择模板"
                    style={{ width: '100%', marginBottom: '0.35rem' }}
                    options={templates.map(template => ({
                        label: `${template.templateName}${isTemplateMatched(template) ? '' : '（不匹配）'}`,
                        value: template.templateId,
                    }))}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.35rem' }}>
                    <div
                        className="selectInputButton connectButton cursor"
                        onClick={handleApplyTemplate}
                        style={{ fontSize: '0.7rem', padding: '0.15rem 0.6rem' }}
                    >
                        应用模板
                    </div>
                    <div
                        className="selectInputButton cursor"
                        onClick={handleDeleteTemplate}
                        style={{
                            fontSize: '0.7rem',
                            padding: '0.15rem 0.6rem',
                            border: '1px solid #ff4444',
                            color: '#ff6666',
                            borderRadius: '3px',
                        }}
                    >
                        删除模板
                    </div>
                </div>
            </div>
        </div>
    )
}
