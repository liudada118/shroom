import { Input, message, Modal, Popover, Select } from 'antd'
import React, { useContext, useEffect, useLayoutEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getSysType, useEquipStore } from '../../store/equipStore'
import { shallow } from 'zustand/shallow'
import { colSelectMatrix } from '../../util/util'
import { systemPointConfig } from '../../util/constant'
import { pageContext } from '../../page/test/Test'
import { isMoreMatrix } from '../../assets/util/util'
import { SELECT_COLORS } from '../selectBox/newSelecttBox'
import { formatSelectionName, getDefaultSelectionName } from '../../util/selectionName'

const selectInputObj = [
    { name: 'X', placeholderKey: 'horizontalStart', valueStr: 'xStart' },
    { name: 'Y', placeholderKey: 'verticalStart', valueStr: 'yStart' },
    { name: '长', enName: 'L', placeholderKey: 'horizontalPoints', valueStr: 'width' },
    { name: '宽', enName: 'W', placeholderKey: 'verticalPoints', valueStr: 'height' },
]

const SELECTION_TEMPLATE_KEY = 'selectionTemplatesV1'
const SELECTION_TEMPLATE_BACKUP_KEY = 'selectionTemplatesBackupV1'

function normalizeTemplateList(value) {
    if (!Array.isArray(value)) return []
    return value.map((item) => {
        if (!item) return null
        const templateId = item.templateId || item.id || item.key
        const templateName = item.templateName || item.name || item.title
        const regionsRaw = item.regions || item.areas || item.selections || []
        const regions = Array.isArray(regionsRaw) ? regionsRaw.map((region, index) => {
            if (!region) return null
            const source = region.matrixRect || region
            const x = Number(source.x ?? source.xStart ?? source.columnStart ?? 0)
            const y = Number(source.y ?? source.yStart ?? source.rowStart ?? 0)
            const width = Number(source.width ?? (Number(source.xEnd) - x))
            const height = Number(source.height ?? (Number(source.yEnd) - y))
            if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null
            return {
                ...region,
                x,
                y,
                width,
                height,
                regionId: region.regionId || region.id || `region-${index + 1}`,
                regionName: region.regionName || region.name || getDefaultSelectionName(index + 1),
                index: region.index || index + 1,
            }
        }).filter(Boolean) : []
        if (!templateId || !templateName || !regions.length) return null
        return {
            ...item,
            templateId,
            templateName,
            regions,
            regionCount: item.regionCount || regions.length,
        }
    }).filter(Boolean)
}

function readSelectionTemplates() {
    try {
        const primary = normalizeTemplateList(JSON.parse(localStorage.getItem(SELECTION_TEMPLATE_KEY) || '[]'))
        const backup = normalizeTemplateList(JSON.parse(localStorage.getItem(SELECTION_TEMPLATE_BACKUP_KEY) || '[]'))
        const map = new Map()
        ;[...backup, ...primary].forEach((template) => {
            map.set(template.templateId, template)
        })
        return Array.from(map.values())
    } catch (e) {
        return []
    }
}

function writeSelectionTemplates(templates) {
    const normalized = normalizeTemplateList(templates)
    localStorage.setItem(SELECTION_TEMPLATE_KEY, JSON.stringify(normalized))
    localStorage.setItem(SELECTION_TEMPLATE_BACKUP_KEY, JSON.stringify(normalized))
}

function getDisplayObject(displayType = '') {
    if (displayType.includes('back')) return 'back'
    if (displayType.includes('sit')) return 'sit'
    return displayType || 'single'
}

export default function SelectSet(props) {
    const { onSelect, variant = 'floating' } = props
    const { t, i18n } = useTranslation()
    const isEnglish = String(i18n.language || localStorage.getItem('language') || '').toLowerCase().startsWith('en')
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
    const [floatingStyle, setFloatingStyle] = useState(null)

    useEffect(() => {
        if (onSelect) {
            setTemplates(readSelectionTemplates())
        }
    }, [onSelect])

    useLayoutEffect(() => {
        if (!onSelect || variant !== 'floating') return

        const updateFloatingPosition = () => {
            const canvas = document.querySelector('.canvasThree:not(.canvasRuler)')
                || document.querySelector('.canvasThree')
            if (!canvas) return

            const canvasRect = canvas.getBoundingClientRect()
            const rightPanelRects = Array.from(document.querySelectorAll('.draggable-panel'))
                .map((panel) => panel.getBoundingClientRect())
                .filter((rect) => rect.left > canvasRect.right)
            const rightPanelLeft = rightPanelRects
                .reduce((left, rect) => Math.min(left, rect.left), window.innerWidth - 16)

            const gap = 14
            const rightBoundary = Math.min(window.innerWidth - 16, rightPanelLeft - gap)
            const desiredWidth = 245
            const minWidth = 190
            const availableWidth = rightBoundary - canvasRect.right - gap
            let width = Math.max(minWidth, Math.min(desiredWidth, Math.max(availableWidth, minWidth)))
            let left = canvasRect.right + gap
            let top = Math.max(88, Math.min(canvasRect.top, window.innerHeight - 160))

            if (availableWidth >= minWidth) {
                left = Math.min(left, Math.max(16, rightBoundary - width))
            } else {
                width = Math.max(180, Math.min(desiredWidth, window.innerWidth - left - 16))
                const panelRight = left + width
                const blockingBottom = rightPanelRects
                    .filter((rect) => left < rect.right && panelRight > rect.left)
                    .reduce((bottom, rect) => Math.max(bottom, rect.bottom), 0)
                if (blockingBottom && blockingBottom + 180 < window.innerHeight) {
                    top = blockingBottom + gap
                }
            }

            setFloatingStyle({
                left: `${left}px`,
                top: `${top}px`,
                width: `${width}px`,
                maxHeight: `${Math.max(220, window.innerHeight - top - 24)}px`,
            })
        }

        updateFloatingPosition()
        const raf = requestAnimationFrame(updateFloatingPosition)
        window.addEventListener('resize', updateFloatingPosition)
        window.addEventListener('mouseup', updateFloatingPosition)
        return () => {
            cancelAnimationFrame(raf)
            window.removeEventListener('resize', updateFloatingPosition)
            window.removeEventListener('mouseup', updateFloatingPosition)
        }
    }, [onSelect, variant, displayType, systemType])

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
                        name: formatSelectionName(range.name, idx + 1, t),
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
        pageInfo.brushInstance.updateSelectName(rangeIndex ?? idx, name.trim() || getDefaultSelectionName(idx + 1, t))
    }

    const handleDeleteAll = () => {
        pageInfo.brushInstance.deleteAll()
    }

    const handleAddByInput = () => {
        if (!systemPointConfig[sysType]) {
            message.error(t('selectionUnsupportedView'))
            return
        }
        const { xStart, yStart, width, height } = inputRect
        if ([xStart, yStart, width, height].some(value => String(value).trim() === '')) {
            message.error(t('completeSelectionCoordinates'))
            return
        }
        const x = Number(xStart), y = Number(yStart), w = Number(width), h = Number(height)

        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h)) {
            message.error(t('selectionCoordinatesMustBeNumbers'))
            return
        }
        if (![x, y, w, h].every(Number.isInteger)) {
            message.error(t('selectionCoordinatesMustBeIntegers'))
            return
        }
        if (x < 0 || y < 0 || w < 0 || h < 0) {
            message.error(t('selectionCoordinatesMinZero'))
            return
        }
        if (w <= 0 || h <= 0) {
            message.error(t('selectionTooSmall'))
            return
        }

        const maxW = matrixInfo.width || 32
        const maxH = matrixInfo.height || 32
        if (x + w > maxW) {
            message.warning(t('selectionXOutOfRange', { x, w, maxW }))
            return
        }
        if (y + h > maxH) {
            message.warning(t('selectionYOutOfRange', { y, h, maxH }))
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
                    regionName: formatSelectionName(range.name, index + 1, t),
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

    const saveTemplateByName = (rawName) => {
        const name = String(rawName || '').trim()
        if (!boxes.length) {
            message.warning(t('createSelectionFirst'))
            return false
        }
        if (!name) {
            message.warning(t('enterTemplateName'))
            return false
        }
        const regions = getCurrentRegions()
        if (!regions.length) {
            message.warning(t('noSelectionToSave'))
            return false
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
        message.success(t('templateSaved'))
        return true
    }

    const handleSaveTemplate = () => {
        saveTemplateByName(templateName)
    }

    useEffect(() => {
        const handleSaveFromExit = (event) => {
            saveTemplateByName(event?.detail?.name)
        }
        window.addEventListener('save-selection-template', handleSaveFromExit)
        return () => window.removeEventListener('save-selection-template', handleSaveFromExit)
    }, [boxes, templateName, templates, sysType, displayType, matrixInfo])

    const applyTemplate = (template) => {
        if (!isTemplateMatched(template)) {
            message.warning(t('templateNotForCurrentView'))
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
            message.success(t('templateApplied'))
        }
        if (boxes.length) {
            Modal.confirm({
                title: t('applyTemplateOverwriteTitle'),
                content: t('continueQuestion'),
                okText: t('overwrite'),
                cancelText: t('cancel'),
                onOk: runApply,
            })
            return
        }
        runApply()
    }

    const handleApplyTemplate = () => {
        const template = templates.find(item => item.templateId === selectedTemplateId)
        if (!template) {
            message.warning(t('selectTemplate'))
            return
        }
        applyTemplate(template)
    }

    const handleDeleteTemplate = () => {
        const template = templates.find(item => item.templateId === selectedTemplateId)
        if (!template) {
            message.warning(t('selectTemplate'))
            return
        }
        Modal.confirm({
            title: t('deleteSelectionTemplate'),
            content: t('deleteTemplateConfirm', { name: template.templateName }),
            okText: t('delete'),
            cancelText: t('cancel'),
            onOk: () => {
                const nextTemplates = templates.filter(item => item.templateId !== selectedTemplateId)
                writeSelectionTemplates(nextTemplates)
                setTemplates(nextTemplates)
                setSelectedTemplateId('')
                message.success(t('templateDeleted'))
            },
        })
    }

    const selectInfoTip = <div style={{ width: '12rem', color: '#fff', fontSize: '0.75rem' }}>
        <div>{t('selectionTipX')}</div>
        <div>{t('selectionTipY')}</div>
        <div>{t('selectionTipLength')}</div>
        <div>{t('selectionTipWidth')}</div>
        <div style={{ marginTop: 4, color: '#FFD93D' }}>
            {t('selectionTipLimit', { width: matrixInfo.width || '?', height: matrixInfo.height || '?' })}
        </div>
    </div>

    if (!onSelect) return null

    return (
        <div
            className={`selectInputContent ${variant === 'embedded' ? 'selectInputEmbedded' : variant === 'drawer' ? 'selectInputDrawer' : 'selectInputFloating'}`}
            style={variant === 'floating' && floatingStyle ? floatingStyle : undefined}
        >
            <div className="selectInputTitle" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div className="selectInputTitleInfo" style={{ color: '#E6EBF0' }}>{t('selectionRegion')}</div>
                    <span style={{ fontSize: '0.7rem', color: '#E6EBF0' }}>({boxes.length}/4)</span>
                    <Popover color='#32373E' placement="bottomLeft" content={selectInfoTip}>
                        <i className='iconfont cursor' style={{ fontSize: '0.85rem' }}>&#xe674;</i>
                    </Popover>
                </div>
                {boxes.length > 0 && (
                    <span
                        onClick={handleDeleteAll}
                        style={{ fontSize: '0.7rem', color: '#ff4444', cursor: 'pointer' }}
                    >
                        {t('clearAll')}
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
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#071016', fontSize: '0.48rem', fontWeight: 900,
                    }}>{idx + 1}</div>
                    <Input
                        value={box.name}
                        onChange={(e) => handleRenameBox(idx, e.target.value)}
                        style={{
                            width: '4.8rem', backgroundColor: '#202327',
                            border: '1px solid #32373E', color: '#E6EBF0',
                            fontSize: '0.7rem', padding: '0.1rem 0.3rem',
                        }}
                    />
                    <span style={{ color: '#E6EBF0', fontVariantNumeric: 'tabular-nums' }}>
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
                    <div style={{ fontSize: '0.7rem', color: '#E6EBF0', marginBottom: '0.25rem' }}>{t('manualAddSelection')}</div>
                    <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                        {selectInputObj.map((a) => (
                            <div key={a.valueStr} style={{ display: 'flex', alignItems: 'center', gap: '0.15rem' }}>
                                <span style={{ fontSize: '0.7rem', color: '#E6EBF0', minWidth: '0.8rem' }}>{isEnglish && a.enName ? a.enName : a.name}</span>
                                <Input
                                    value={inputRect[a.valueStr]}
                                    onChange={(e) => setInputRect(prev => ({ ...prev, [a.valueStr]: e.target.value }))}
                                    className='selectInput'
                                    style={{
                                        width: '3rem', backgroundColor: '#202327',
                                        border: '1px solid #32373E', color: '#E6EBF0',
                                        fontSize: '0.7rem', padding: '0.1rem 0.3rem',
                                    }}
                                    placeholder={t(a.placeholderKey)}
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
                            {t('add')}
                        </div>
                    </div>
                </div>
            )}

            <div style={{ marginTop: '0.5rem', borderTop: '1px solid #2a2e33', paddingTop: '0.45rem' }}>
                <div style={{ fontSize: '0.7rem', color: '#E6EBF0', marginBottom: '0.25rem' }}>{t('selectionTemplate')}</div>
                <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '0.35rem' }}>
                    <Input
                        value={templateName}
                        onChange={(e) => setTemplateName(e.target.value)}
                        placeholder={t('templateName')}
                        className='templateNameInput'
                        style={{
                            flex: 1, backgroundColor: '#202327',
                            border: '1px solid #32373E', color: '#E6EBF0',
                            fontSize: '0.875rem', padding: '0.35rem 0.55rem',
                        }}
                    />
                    <div
                        className="selectInputButton connectButton cursor"
                        onClick={handleSaveTemplate}
                        style={{ fontSize: '0.875rem', padding: '0.35rem 0.85rem', whiteSpace: 'nowrap' }}
                    >
                        {t('saveTemplate')}
                    </div>
                </div>
                <Select
                    size="small"
                    value={selectedTemplateId || undefined}
                    onChange={setSelectedTemplateId}
                    placeholder={t('chooseTemplate')}
                    notFoundContent={t('noData')}
                    style={{ width: '100%', marginBottom: '0.35rem' }}
                    options={templates.map(template => ({
                        label: `${template.templateName}${isTemplateMatched(template) ? '' : ` (${t('templateMismatch')})`}`,
                        value: template.templateId,
                    }))}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.35rem' }}>
                    <div
                        className="selectInputButton connectButton cursor"
                        onClick={handleApplyTemplate}
                        style={{ fontSize: '0.7rem', padding: '0.15rem 0.6rem' }}
                    >
                        {t('applyTemplate')}
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
                        {t('deleteTemplate')}
                    </div>
                </div>
            </div>
        </div>
    )
}
