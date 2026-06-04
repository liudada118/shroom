import { Input, message, Modal, Popover, Select } from 'antd'
import { CloseOutlined, DeleteOutlined, EditOutlined, InfoCircleOutlined } from '@ant-design/icons'
import axios from 'axios'
import React, { useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getSysType, useEquipStore } from '../../store/equipStore'
import { shallow } from 'zustand/shallow'
import { colSelectMatrix } from '../../util/util'
import { localAddress, systemPointConfig } from '../../util/constant'
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
const SELECTION_TEMPLATE_LEGACY_KEYS = [
    'selectionTemplates',
    'selectionTemplate',
    'selectionTemplateList',
    'selectTemplates',
    'selectTemplateList',
    'selectAreaTemplates',
    'selectSetTemplates',
    'boxSelectionTemplates',
    'selectionTemplatesV0',
]

function hashTemplateText(text = '') {
    let hash = 0
    const source = String(text)
    for (let i = 0; i < source.length; i += 1) {
        hash = ((hash << 5) - hash) + source.charCodeAt(i)
        hash |= 0
    }
    return Math.abs(hash).toString(36)
}

function getTemplateCandidates(value) {
    if (Array.isArray(value)) return value
    if (!value || typeof value !== 'object') return []
    const nested = value.templates || value.list || value.data || value.items
    if (Array.isArray(nested)) return nested
    if (value.regions || value.areas || value.selections || value.boxes || value.rangeArr || value.selectArr || value.matrixRect) {
        return [value]
    }
    return Object.values(value).filter(item => item && typeof item === 'object')
}

function readTemplateKey(key, sourcePriority = 0) {
    try {
        const raw = localStorage.getItem(key)
        if (!raw) return []
        return getTemplateCandidates(JSON.parse(raw)).map(item => ({
            ...item,
            __sourceKey: key,
            __sourcePriority: sourcePriority,
        }))
    } catch {
        return []
    }
}

function normalizeTemplateList(value) {
    return getTemplateCandidates(value).map((item, templateIndex) => {
        if (!item) return null
        const rawRegions = item.regions || item.areas || item.selections || item.boxes || item.rangeArr || item.selectArr
        const selfRegion = item.matrixRect || item.xStart != null || item.x1 != null || item.x != null
        const regionsRaw = Array.isArray(rawRegions) ? rawRegions : (rawRegions ? [rawRegions] : (selfRegion ? [item] : []))
        const regions = regionsRaw.map((region, index) => {
            if (!region) return null
            const source = region.matrixRect || region.rect || region
            const x = Number(source.x ?? source.xStart ?? source.x1 ?? source.left ?? source.columnStart ?? 0)
            const y = Number(source.y ?? source.yStart ?? source.y1 ?? source.top ?? source.rowStart ?? 0)
            const width = Number(source.width ?? source.w ?? (Number(source.xEnd ?? source.x2) - x))
            const height = Number(source.height ?? source.h ?? (Number(source.yEnd ?? source.y2) - y))
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
        }).filter(Boolean)
        const displayType = item.displayType || item.displayObject || item.target || ''
        const templateName = item.templateName || item.name || item.title || item.label || item.remark || `模板${templateIndex + 1}`
        const matrixWidth = Number(item.matrixWidth ?? item.matrix_width ?? item.matrixW ?? item.canvasWidth ?? item.totalWidth ?? regions[0]?.matrixWidth)
        const matrixHeight = Number(item.matrixHeight ?? item.matrix_height ?? item.matrixH ?? item.canvasHeight ?? item.totalHeight ?? regions[0]?.matrixHeight)
        const deviceType = item.deviceType || item.systemType || item.sysType || item.matrixKey
        const identityText = JSON.stringify({
            source: item.__sourceKey || '',
            templateName,
            deviceType,
            displayType,
            matrixWidth,
            matrixHeight,
            regions: regions.map(region => ({
                x: region.x,
                y: region.y,
                width: region.width,
                height: region.height,
                name: region.regionName,
            })),
        })
        const templateId = item.templateId || item.id || item.key || `selection-template-${hashTemplateText(identityText)}`
        if (!templateId || !templateName || !regions.length) return null
        return {
            ...item,
            templateId,
            templateName,
            regions,
            regionCount: item.regionCount || regions.length,
            ...(displayType ? { displayType } : {}),
            ...(deviceType ? { deviceType } : {}),
            ...(Number.isFinite(matrixWidth) && matrixWidth > 0 ? { matrixWidth } : {}),
            ...(Number.isFinite(matrixHeight) && matrixHeight > 0 ? { matrixHeight } : {}),
        }
    }).filter(Boolean)
}

function getTemplateSignature(template) {
    const regionSignature = Array.isArray(template.regions)
        ? template.regions.map(region => [
            Number(region.x),
            Number(region.y),
            Number(region.width),
            Number(region.height),
        ].join(',')).join(';')
        : ''
    return [
        template.templateName || '',
        template.deviceType || '',
        template.displayType || '',
        template.matrixWidth || '',
        template.matrixHeight || '',
        regionSignature,
    ].join('|')
}

function getTemplateTime(template) {
    const updatedAt = Number(template.updatedAt)
    if (Number.isFinite(updatedAt) && updatedAt > 0) return updatedAt
    const createdAt = Number(template.createdAt)
    if (Number.isFinite(createdAt) && createdAt > 0) return createdAt
    return 0
}

function shouldReplaceTemplate(existing, candidate) {
    const existingTime = getTemplateTime(existing)
    const candidateTime = getTemplateTime(candidate)
    if (existingTime || candidateTime) return candidateTime >= existingTime
    return Number(candidate.__sourcePriority || 0) >= Number(existing.__sourcePriority || 0)
}

function stripTemplateMeta(template) {
    const { __sourceKey, __sourcePriority, ...rest } = template
    return rest
}

function dedupeSelectionTemplates(templates) {
    const normalized = normalizeTemplateList(templates)
    const byId = new Map()
    const signatureToId = new Map()

    normalized.forEach((template) => {
        const signature = getTemplateSignature(template)
        const existingId = signatureToId.get(signature)
        const existing = existingId ? byId.get(existingId) : byId.get(template.templateId)
        if (!existing) {
            byId.set(template.templateId, template)
            signatureToId.set(signature, template.templateId)
            return
        }
        if (shouldReplaceTemplate(existing, template)) {
            byId.delete(existing.templateId)
            byId.set(template.templateId, template)
            signatureToId.set(signature, template.templateId)
        }
    })

    return Array.from(byId.values())
        .sort((a, b) => getTemplateTime(b) - getTemplateTime(a))
        .map(stripTemplateMeta)
}

function clearLegacyTemplateKeys() {
    SELECTION_TEMPLATE_LEGACY_KEYS.forEach((key) => localStorage.removeItem(key))
}

function readSelectionTemplates() {
    try {
        const allTemplates = [
            ...readTemplateKey(SELECTION_TEMPLATE_KEY, 3),
            ...readTemplateKey(SELECTION_TEMPLATE_BACKUP_KEY, 2),
            ...SELECTION_TEMPLATE_LEGACY_KEYS.flatMap((key) => readTemplateKey(key, 1)),
        ]
        const normalized = dedupeSelectionTemplates(allTemplates)
        if (normalized.length) {
            writeSelectionTemplates(normalized)
        }
        return normalized
    } catch (e) {
        return []
    }
}

function writeSelectionTemplates(templates) {
    const normalized = dedupeSelectionTemplates(templates)
    localStorage.setItem(SELECTION_TEMPLATE_KEY, JSON.stringify(normalized))
    localStorage.setItem(SELECTION_TEMPLATE_BACKUP_KEY, JSON.stringify(normalized))
    clearLegacyTemplateKeys()
    return normalized
}

async function saveSelectionTemplatesToDb(templates) {
    const normalized = dedupeSelectionTemplates(templates)
    const res = await axios.post(`${localAddress}/selectionTemplates/saveAll`, { templates: normalized })
    if (res.data?.code !== 0) {
        throw new Error(res.data?.message || 'Failed to save selection templates')
    }
    const dbTemplates = normalizeTemplateList(res.data?.data || normalized)
    writeSelectionTemplates(dbTemplates)
    return dbTemplates
}

async function loadSelectionTemplatesFromDb() {
    const localTemplates = readSelectionTemplates()
    try {
        const res = await axios.get(`${localAddress}/selectionTemplates`)
        if (res.data?.code !== 0) {
            throw new Error(res.data?.message || 'Failed to load selection templates')
        }
        const dbTemplates = normalizeTemplateList(res.data?.data || [])
        if (dbTemplates.length) {
            writeSelectionTemplates(dbTemplates)
            return dbTemplates
        }
        if (localTemplates.length) {
            return saveSelectionTemplatesToDb(localTemplates)
        }
        return []
    } catch (err) {
        return localTemplates
    }
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
    const [editingBoxNames, setEditingBoxNames] = useState({})
    const [floatingStyle, setFloatingStyle] = useState(null)
    const floatingStyleRef = useRef(null)
    const floatingMovedRef = useRef(false)
    const dragStateRef = useRef(null)

    useEffect(() => {
        floatingStyleRef.current = floatingStyle
    }, [floatingStyle])

    const setFloatingPanelStyle = (style) => {
        floatingStyleRef.current = style
        setFloatingStyle(style)
    }

    const clampFloatingPosition = (left, top, width = 285, height = 220) => {
        const safeWidth = Number(width) || 285
        const safeHeight = Number(height) || 220
        return {
            left: Math.max(8, Math.min(left, window.innerWidth - safeWidth - 8)),
            top: Math.max(72, Math.min(top, window.innerHeight - Math.min(safeHeight, window.innerHeight - 80) - 8)),
        }
    }

    const handleFloatingDragStart = (event) => {
        if (variant !== 'floating') return
        if (event.button !== 0) return
        const target = event.target
        if (target?.closest?.('button,input,.ant-select,.ant-popover-open,.selectInfoIcon')) return
        const panel = event.currentTarget.closest('.selectInputFloating')
        const rect = panel?.getBoundingClientRect()
        if (!rect) return
        event.preventDefault()
        floatingMovedRef.current = true
        dragStateRef.current = {
            startX: event.clientX,
            startY: event.clientY,
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
        }
        const handleMove = (moveEvent) => {
            const drag = dragStateRef.current
            if (!drag) return
            const next = clampFloatingPosition(
                drag.left + moveEvent.clientX - drag.startX,
                drag.top + moveEvent.clientY - drag.startY,
                drag.width,
                drag.height
            )
            setFloatingPanelStyle({
                ...(floatingStyleRef.current || {}),
                left: `${next.left}px`,
                top: `${next.top}px`,
            })
        }
        const handleUp = () => {
            dragStateRef.current = null
            window.removeEventListener('mousemove', handleMove)
            window.removeEventListener('mouseup', handleUp)
        }
        window.addEventListener('mousemove', handleMove)
        window.addEventListener('mouseup', handleUp)
    }

    const getCurrentMatrixType = () => {
        const currentSystem = getSysType()
        if (isMoreMatrix(currentSystem)) {
            return currentSystem + '-' + (displayType.includes('back') ? 'back' : displayType.includes('sit') ? 'sit' : '')
        }
        return currentSystem
    }

    const getCurrentMatrixConfig = () => systemPointConfig[sysType] || systemPointConfig[getCurrentMatrixType()]

    useEffect(() => {
        let cancelled = false
        if (!onSelect) {
            setBoxes([])
            setInputRect({ xStart: '', yStart: '', width: '', height: '' })
            return () => {
                cancelled = true
            }
        }
        if (onSelect) {
            loadSelectionTemplatesFromDb().then((nextTemplates) => {
                if (!cancelled) setTemplates(nextTemplates)
            })
        }
        return () => {
            cancelled = true
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
            const desiredWidth = 285
            const minWidth = 230
            const availableWidth = rightBoundary - canvasRect.right - gap
            let width = Math.max(minWidth, Math.min(desiredWidth, Math.max(availableWidth, minWidth)))
            let left = canvasRect.right + gap
            let top = Math.max(88, Math.min(canvasRect.top, window.innerHeight - 160))

            if (availableWidth >= minWidth) {
                left = Math.min(left, Math.max(16, rightBoundary - width))
            } else {
                width = Math.max(220, Math.min(desiredWidth, window.innerWidth - left - 16))
                const panelRight = left + width
                const blockingBottom = rightPanelRects
                    .filter((rect) => left < rect.right && panelRight > rect.left)
                    .reduce((bottom, rect) => Math.max(bottom, rect.bottom), 0)
                if (blockingBottom && blockingBottom + 180 < window.innerHeight) {
                    top = blockingBottom + gap
                }
            }

            const nextStyle = {
                left: `${left}px`,
                top: `${top}px`,
                width: `${width}px`,
            }

            if (floatingMovedRef.current && floatingStyleRef.current) {
                const currentLeft = parseFloat(floatingStyleRef.current.left)
                const currentTop = parseFloat(floatingStyleRef.current.top)
                const clamped = clampFloatingPosition(currentLeft, currentTop, width)
                setFloatingPanelStyle({
                    ...nextStyle,
                    left: `${clamped.left}px`,
                    top: `${clamped.top}px`,
                })
                return
            }

            setFloatingPanelStyle(nextStyle)
        }

        updateFloatingPosition()
        const raf = requestAnimationFrame(updateFloatingPosition)
        window.addEventListener('resize', updateFloatingPosition)
        return () => {
            cancelAnimationFrame(raf)
            window.removeEventListener('resize', updateFloatingPosition)
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
    }, [pageInfo.brushInstance, displayType, systemType, onSelect, t])

    const isTemplateMatched = (template) => {
        if (!template) return false
        const currentSystem = getSysType()
        const deviceMatched = !template.deviceType || template.deviceType === sysType || template.deviceType === currentSystem
        return deviceMatched
            && (!template.matrixWidth || Number(template.matrixWidth) === Number(matrixInfo.width))
            && (!template.matrixHeight || Number(template.matrixHeight) === Number(matrixInfo.height))
            && (!template.displayType || template.displayType === getDisplayObject(displayType))
    }

    const handleDeleteBox = (idx) => {
        const rangeIndex = boxes[idx]?.rangeIndex
        pageInfo.brushInstance.deleteSelect(rangeIndex ?? idx)
    }

    const handleRenameBox = (idx, name) => {
        const rangeIndex = boxes[idx]?.rangeIndex
        const key = rangeIndex ?? idx
        setEditingBoxNames(prev => ({ ...prev, [key]: name }))
        if (name.trim()) {
            pageInfo.brushInstance.updateSelectName(key, name.trim())
        }
    }

    const handleRenameBoxBlur = (idx) => {
        const rangeIndex = boxes[idx]?.rangeIndex
        const key = rangeIndex ?? idx
        const editingName = Object.prototype.hasOwnProperty.call(editingBoxNames, key)
            ? editingBoxNames[key]
            : boxes[idx]?.name
        const nextName = String(editingName || '').trim() || getDefaultSelectionName(idx + 1, t)
        pageInfo.brushInstance.updateSelectName(key, nextName)
        setEditingBoxNames(prev => {
            const next = { ...prev }
            delete next[key]
            return next
        })
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
        const currentType = sysType || getCurrentMatrixType()
        const matrixConfig = getCurrentMatrixConfig()
        if (!matrixConfig) return []
        return pageInfo.brushInstance.rangeArr
            .filter(range => !range.matrixKey || range.matrixKey === currentType)
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

    const markCurrentRangesAsTemplate = (templateId) => {
        const currentType = sysType || getCurrentMatrixType()
        const rangeArr = pageInfo.brushInstance.rangeArr || []
        rangeArr.forEach((range) => {
            if (range.matrixKey && range.matrixKey !== currentType) return
            range.templateId = templateId
            range.updatedAt = Date.now()
        })
        pageInfo.brushInstance.notify?.(rangeArr)
    }

    const saveTemplateByName = async (rawName, options = {}) => {
        const name = String(rawName || '').trim()
        const regions = getCurrentRegions()
        if (!regions.length) {
            message.warning(t('createSelectionFirst'))
            return false
        }
        if (!name) {
            message.warning(t('enterTemplateName'))
            return false
        }
        const now = Date.now()
        const existingTemplate = templates.find(item => item.templateName === name)
        if (existingTemplate && !options.overwriteConfirmed) {
            Modal.confirm({
                title: t('templateNameExists') || '模板名称已存在',
                content: t('overwriteTemplateConfirm', { name }) || `已存在同名模板「${name}」，是否覆盖原有模板？`,
                okText: t('overwrite') || '覆盖',
                cancelText: t('cancel') || '取消',
                onOk: () => saveTemplateByName(name, { overwriteConfirmed: true }),
            })
            return false
        }
        const currentType = sysType || getCurrentMatrixType()
        const matrixConfig = getCurrentMatrixConfig() || matrixInfo
        const nextTemplate = {
            templateId: existingTemplate?.templateId || `selection-template-${now}`,
            templateName: name,
            deviceType: currentType,
            displayType: getDisplayObject(displayType),
            matrixWidth: matrixConfig.width,
            matrixHeight: matrixConfig.height,
            coordinateMode: 'display',
            regions,
            regionCount: regions.length,
            version: 1,
            createdAt: existingTemplate?.createdAt || now,
            updatedAt: now,
        }
        try {
            const nextTemplates = await saveSelectionTemplatesToDb([nextTemplate, ...templates.filter(item => item.templateName !== name)])
            markCurrentRangesAsTemplate(nextTemplate.templateId)
            setTemplates(nextTemplates)
            setSelectedTemplateId(nextTemplate.templateId)
            setTemplateName('')
            message.success(t('templateSaved'))
            return true
        } catch (err) {
            message.error(err?.message || t('requestFailed'))
            return false
        }
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
            pageInfo.brushInstance.removeChild?.()
            const templateWidth = Number(template.matrixWidth) || matrixInfo.width
            const templateHeight = Number(template.matrixHeight) || matrixInfo.height
            template.regions.slice(0, 4).forEach((region) => {
                pageInfo.brushInstance.addMatrixRange({
                    xStart: Number(region.x),
                    yStart: Number(region.y),
                    xEnd: Number(region.x) + Number(region.width),
                    yEnd: Number(region.y) + Number(region.height),
                    width: templateWidth,
                    height: templateHeight,
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
                onCancel: () => {
                    setSelectedTemplateId('')
                    setTemplateName('')
                },
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
            onOk: async () => {
                const nextTemplates = await saveSelectionTemplatesToDb(templates.filter(item => item.templateId !== selectedTemplateId))
                setTemplates(nextTemplates)
                setSelectedTemplateId('')
                message.success(t('templateDeleted'))
            },
        })
    }

    const handleRenameTemplate = () => {
        const template = templates.find(item => item.templateId === selectedTemplateId)
        if (!template) {
            message.warning(t('selectTemplate'))
            return
        }
        const nextName = String(templateName || '').trim()
        if (!nextName) {
            message.warning(t('enterTemplateName'))
            return
        }
        const now = Date.now()
        saveSelectionTemplatesToDb(templates.map(item => (
            item.templateId === selectedTemplateId
                ? { ...item, templateName: nextName, updatedAt: now }
                : item
        ))).then((nextTemplates) => {
            setTemplates(nextTemplates)
            setSelectedTemplateId(selectedTemplateId)
            message.success(t('templateRenamed') || '模板已重命名')
        }).catch((err) => {
            message.error(err?.message || t('requestFailed'))
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
            <div
                className={`selectInputTitle ${variant === 'floating' ? 'selectInputTitleDraggable' : ''}`}
                onMouseDown={handleFloatingDragStart}
            >
                <div className="selectInputTitleLeft">
                    <div className="selectInputTitleInfo">{t('selectionRegion')}</div>
                    <span className="selectCount">({boxes.length}/4)</span>
                    <Popover color='#32373E' placement="bottomLeft" content={selectInfoTip}>
                        <InfoCircleOutlined className="selectInfoIcon cursor" />
                    </Popover>
                </div>
                {boxes.length > 0 && (
                    <button
                        type="button"
                        onClick={handleDeleteAll}
                        className="selectClearButton cursor"
                    >
                        {t('clearAll')}
                        <DeleteOutlined />
                    </button>
                )}
            </div>

            {boxes.map((box, idx) => (
                <div key={`box-${box.rangeIndex}-${idx}`} className="selectRegionCard">
                    <div className="selectRegionIndex" style={{ backgroundColor: box.bgc }}>{idx + 1}</div>
                    <Input
                        value={Object.prototype.hasOwnProperty.call(editingBoxNames, box.rangeIndex) ? editingBoxNames[box.rangeIndex] : box.name}
                        onChange={(e) => handleRenameBox(idx, e.target.value)}
                        onBlur={() => handleRenameBoxBlur(idx)}
                        className="selectRegionNameInput"
                    />
                    <span className="selectRegionMeta">({box.xStart},{box.yStart}) {box.width}x{box.height}</span>
                    <button
                        type="button"
                        className="selectRegionIconButton selectRegionDeleteButton cursor"
                        onClick={() => handleDeleteBox(idx)}
                        aria-label="delete selection"
                    >
                        <CloseOutlined />
                    </button>
                </div>
            ))}

            {boxes.length < 4 && (
                <div className="selectSection selectManualSection">
                    <div className="selectSectionTitle">{t('manualAddSelection')}</div>
                    <div className="selectManualGrid">
                        {selectInputObj.map((a) => (
                            <label key={a.valueStr} className="selectManualField">
                                <span>{isEnglish && a.enName ? a.enName : a.name}</span>
                                <Input
                                    value={inputRect[a.valueStr]}
                                    onChange={(e) => setInputRect(prev => ({ ...prev, [a.valueStr]: e.target.value }))}
                                    className='selectInput'
                                    placeholder={isEnglish ? 'Input...' : '输入...'}
                                />
                            </label>
                        ))}
                        <button type="button" className="selectInputButton selectAddButton cursor" onClick={handleAddByInput}>
                            {t('add')}
                        </button>
                    </div>
                </div>
            )}

            <div className="selectSection selectTemplateSection">
                <div className="selectSectionTitle">{t('selectionTemplate')}</div>
                <div className="selectTemplateSaveRow">
                    <Input
                        value={templateName}
                        onChange={(e) => setTemplateName(e.target.value)}
                        placeholder={t('templateName')}
                        className='templateNameInput'
                        suffix={<EditOutlined className="templateNameEditIcon" />}
                    />
                    <button type="button" className="selectInputButton selectSaveButton cursor" onClick={handleSaveTemplate}>
                        {t('saveTemplate')}
                    </button>
                </div>
                <Select
                    allowClear
                    size="large"
                    value={selectedTemplateId || undefined}
                    onChange={(value) => {
                        if (!value) {
                            setSelectedTemplateId('')
                            setTemplateName('')
                            return
                        }
                        setSelectedTemplateId(value)
                        const template = templates.find(item => item.templateId === value)
                        setTemplateName(template?.templateName || '')
                    }}
                    onClear={() => {
                        setSelectedTemplateId('')
                        setTemplateName('')
                    }}
                    placeholder={t('chooseTemplate')}
                    notFoundContent={t('noData')}
                    className="selectTemplateSelect"
                    popupClassName="selectTemplateDropdown"
                    options={templates.map(template => ({
                        label: `${template.templateName}${isTemplateMatched(template) ? '' : ` (${t('templateMismatch')})`}`,
                        value: template.templateId,
                    }))}
                />
                <div className="selectTemplateActionRow">
                    <button type="button" className="selectInputButton selectRenameTemplateButton cursor" onClick={handleRenameTemplate}>
                        <EditOutlined />
                        {t('renameTemplate') || '重命名模板'}
                    </button>
                    <button type="button" className="selectInputButton selectApplyButton cursor" onClick={handleApplyTemplate}>
                        {t('applyTemplate')}
                    </button>
                    <button type="button" className="selectInputButton selectDeleteTemplateButton cursor" onClick={handleDeleteTemplate}>
                        {t('deleteTemplate')}
                    </button>
                </div>
            </div>
        </div>
    )
}
