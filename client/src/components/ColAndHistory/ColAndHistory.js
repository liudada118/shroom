import React, { memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import Col from '../col/Col'
import './index.scss'
import Drawer from '../Drawer/Drawer'
import { Button, Checkbox, Input, message, Modal, Popover, Progress, Radio, Slider, Tabs } from 'antd'
import selected from '../../assets/image/select.png'
import history from '../../assets/image/history.png'
import axios from 'axios'
import DataPlay from './DataPlay'
import ColControl from './ColControlV2'
import { withTranslation } from 'react-i18next'
import { useDebounce } from '../../hooks/useDebounce'
import { getDisplayType, getSysType, useEquipStore } from '../../store/equipStore'
import { shallow } from 'zustand/shallow'
import { removeHistoryBox } from '../../assets/util/selectMatrix'
import { getMatrixPartFromDisplayType, localAddress, systemPointConfig } from '../../util/constant'
import { buildFallbackParams } from '../../util/request'
import dayjs from 'dayjs'
import { pageContext } from '../../page/test/Test'
import { FileTextOutlined } from '@ant-design/icons'
import { isMoreMatrix } from '../../assets/util/util'
import { colSelectMatrix } from '../../util/util'
import { formatSelectionName } from '../../util/selectionName'

const CSV_STORAGE_KEY = 'csvArr'
const COP_REPORT_SELECTION_PREFIX = 'copReportSelection:'
const DRAWER_RENDER_CHUNK = 24
const HISTORY_PREFETCH_DELAY = 800
const HISTORY_CACHE_MAX_AGE = 30000
const CSV_IMPORT_INVALID_MESSAGE = '数据有误'

const getMatrixPartFromDataKey = (key = '') => {
    const value = String(key || '')
    if (!value) return ''
    if (value.includes('-')) return value.split('-').pop()
    return getMatrixPartFromDisplayType(value)
}

const normalizeCsvItem = (item) => {
    if (item === undefined || item === null) {
        return ''
    }
    return String(item).trim()
}

const normalizeCsvList = (list) => {
    const seen = new Set()
    const result = []
    const source = Array.isArray(list) ? list : []

    source.forEach((item) => {
        const normalized = normalizeCsvItem(item)
        const key = normalized.toLowerCase()
        if (!normalized || seen.has(key)) {
            return
        }
        seen.add(key)
        result.push(normalized)
    })

    return result
}

const readStoredCsvList = () => {
    try {
        return normalizeCsvList(JSON.parse(localStorage.getItem(CSV_STORAGE_KEY) || '[]'))
    } catch (err) {
        return []
    }
}

const persistCsvList = (list) => {
    localStorage.setItem(CSV_STORAGE_KEY, JSON.stringify(normalizeCsvList(list)))
}

const normalizeHistoryList = (list) => {
    const seen = new Set()
    const source = Array.isArray(list) ? list : []
    return source.filter((item) => {
        const date = item?.date != null ? String(item.date).trim() : ''
        const time = item?.time != null ? String(item.time).trim() : ''
        const name = item?.name != null ? String(item.name).trim() : ''
        const key = date || time || name
        if (!key || seen.has(key)) {
            return false
        }
        seen.add(key)
        return true
    })
}

const getApiErrorMessage = (result, fallback) => {
    const data = result?.data
    if (typeof data === 'string' && data.trim()) {
        return data.trim()
    }
    if (data && typeof data === 'object') {
        if (typeof data.message === 'string' && data.message.trim()) {
            return data.message.trim()
        }
        if (typeof data.error === 'string' && data.error.trim()) {
            return data.error.trim()
        }
    }
    const apiMessage = result?.message
    if (typeof apiMessage === 'string' && apiMessage.trim() && apiMessage.trim().toLowerCase() !== 'error') {
        return apiMessage.trim()
    }
    return fallback
}

const normalizeFolderSelection = (value) => {
    if (!value) {
        return ''
    }
    if (typeof value === 'string') {
        return value
    }
    if (Array.isArray(value)) {
        return normalizeFolderSelection(value[0])
    }
    if (typeof value === 'object') {
        return normalizeFolderSelection(
            value.path ||
            value.filePath ||
            value.folderPath ||
            value.selectedPath ||
            value.filePaths
        )
    }
    return ''
}

const getImportedDataName = (item) => {
    return normalizeCsvItem(item).split(/[\\/]/).pop().toLowerCase()
}

const scheduleIdleTask = (callback, timeout = 800) => {
    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
        const id = window.requestIdleCallback(callback, { timeout })
        return () => window.cancelIdleCallback?.(id)
    }
    const id = setTimeout(callback, 0)
    return () => clearTimeout(id)
}

const ColAndHistory = memo((props) => {

    const pageInfo = useContext(pageContext);
    const { setDisplay, display, setDisplayType, setOnRuler } = pageInfo
    const dataStatus = useEquipStore(s => s.dataStatus, shallow)

    const [messageApi, contextHolder] = message.useMessage();
    const { t, i18n } = props;
    const [showHistory, setShowHistory] = useState(false)
    const [historyDrawer, sethistoryDrawer] = useState(false)

    // ─── 下载路径和弹窗状态 ───
    const [downloadPath, setDownloadPath] = useState('')
    const [isEditingPath, setIsEditingPath] = useState(false)
    const [editPathValue, setEditPathValue] = useState('')
    const [downloadToast, setDownloadToast] = useState(null) // { fileName, filePath }
    const [showDownloadPathModal, setShowDownloadPathModal] = useState(false) // 下载前路径选择对话框
    const [downloadProgress, setDownloadProgress] = useState(null) // { percent, status: 'downloading'|'done'|'error', files: [] }
    const [exportFormat, setExportFormat] = useState('csv')
    const [exportFieldOptions, setExportFieldOptions] = useState([])
    const [exportFields, setExportFields] = useState([])
    const [exportFieldLoading, setExportFieldLoading] = useState(false)

    const [colHistoryArr, setColHistoryArr] = useState()
    const [displayHistoryArr, setDisplayHistoryArr] = useState()
    const [localArr, setLocalArr] = useState(readStoredCsvList)
    const [historyRenderCount, setHistoryRenderCount] = useState(DRAWER_RENDER_CHUNK)
    const [localRenderCount, setLocalRenderCount] = useState(DRAWER_RENDER_CHUNK)
    const [historyLoading, setHistoryLoading] = useState(false)
    const historyFetchRef = useRef({ loading: false, lastFetchAt: 0 })

    const onChange = () => {

    }

    const title = [t('local')
        , t('import')
    ]
    const [Onindex, setIndex] = useState(0)

    const [operateStatus, setOperateStatus] = useState('')
    const [selectArr, setSelectArr] = useState([])

    const contrastInitArr = { left: {}, right: {} }

    const [contrastArr, setContrast] = useState(contrastInitArr)
    const [contrastMode, setContrastMode] = useState('record_pair')

    const normalizeContrastSource = (source) => (source === 'csv' || source === 'import' ? 'csv' : 'history')
    const getContrastRequestSource = (record) => (normalizeContrastSource(record?.source) === 'csv' ? 'csv' : '')
    const getContrastSelectKey = (record) => `${normalizeContrastSource(record?.source)}:${record?.date ?? ''}`
    const isSameContrastRecord = (left, right) => {
        if (!left?.date || !right?.date) return false
        return String(left.date) === String(right.date)
            && normalizeContrastSource(left.source) === normalizeContrastSource(right.source)
    }
    const buildHistoryContrastRecord = (record = {}) => ({
        ...record,
        date: record.date,
        name: record.name || record.date,
        source: 'history',
    })
    const buildImportedContrastRecord = (name) => ({
        date: name,
        name,
        source: 'csv',
    })

    const resetOperateState = () => {
        setSelectArr([])
        setOperateStatus('')
        setContrast(contrastInitArr)
        setContrastMode('record_pair')
    }

    const handleTabChange = (nextIndex) => {
        if (nextIndex === Onindex) {
            return
        }
        if (operateStatus !== 'contrast') {
            resetOperateState()
        }
        setIndex(nextIndex)
    }

    useEffect(() => {
        persistCsvList(localArr)
    }, [localArr])

    const [colName, setColName] = useState('')
    const [HZ, setHZ] = useState('')

    const [changeColInfo, setChangeColInfo] = useState(false)



    const [uploadFileShow, setUploadFileShow] = useState(false)

    const [uploadLoading, setUploadLoading] = useState(false)

    const clearUploadFile = () => {
        uploadFileRef.current = null
        setFileName('')
        if (fileInputRef.current) {
            fileInputRef.current.value = ''
        }
    }

    const syncDownloadPathState = (nextPath) => {
        const normalizedPath = nextPath == null ? '' : String(nextPath)
        setDownloadPath(normalizedPath)
        setEditPathValue(normalizedPath)
        return normalizedPath
    }

    const persistDownloadPath = async (rawPath, options = {}) => {
        const { showSuccess = false } = options
        const nextPath = rawPath == null ? '' : String(rawPath).trim()
        if (!nextPath) {
            return ''
        }

        const payload = { path: nextPath }
        const res = await axios.post(`${localAddress}/setDownloadPath`, payload, {
            params: buildFallbackParams(payload)
        })
        if (res.data?.code !== 0) {
            throw new Error(getApiErrorMessage(res.data, t('downloadFailed')))
        }

        const actualPath = res.data?.data?.path || nextPath
        syncDownloadPathState(actualPath)
        setIsEditingPath(false)

        if (showSuccess) {
            message.success(t('pathUpdated'))
        }

        return actualPath
    }

    const handleUpload = () => {
        if (!uploadFileRef.current) {
            message.info(t('selectDataFirst'))
            return
        }
        const selectedName = getImportedDataName(uploadFileRef.current.name)
        const duplicated = normalizeCsvList(localArr).some((item) => getImportedDataName(item) === selectedName)
        if (duplicated) {
            message.warning(i18n.language?.startsWith('zh') ? '该数据已导入，请勿重复导入' : 'This data has already been imported')
            return
        }
        setUploadLoading(true)
        const formData = new FormData()
        formData.append('file', uploadFileRef.current)
        axios.post(`${localAddress}/uploadCsv`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        }).then((res) => {
            if (res.data?.code === 0) {
                const { fileName, filePath } = res.data.data
                const uploadedItem = filePath || fileName
                setLocalArr((prev) => normalizeCsvList([...(Array.isArray(prev) ? prev : []), uploadedItem]))
                resetOperateState()
                message.success(t('uploadSuccess') || 'Upload success')
                setUploadFileShow(false)
                clearUploadFile()
            } else {
                message.error(res.data?.message || t('csvImportInvalid') || CSV_IMPORT_INVALID_MESSAGE)
            }
        }).catch((err) => {
            message.error(err?.response?.data?.message || err.message || t('csvImportInvalid') || CSV_IMPORT_INVALID_MESSAGE)
        }).finally(() => {
            setUploadLoading(false)
        })
    }

    const handleUploadCancel = () => {
        setUploadFileShow(false)
        clearUploadFile()
    }

    const loadColHistory = useCallback((options = {}) => {
        const { force = false } = options
        const now = Date.now()
        const fetchState = historyFetchRef.current
        if (fetchState.loading) return
        if (!force && Array.isArray(colHistoryArr) && now - fetchState.lastFetchAt < HISTORY_CACHE_MAX_AGE) return

        fetchState.loading = true
        setHistoryLoading(true)
        axios({
            method: 'get',
            url: `${localAddress}/getColHistory`,
        }).then((res) => {
            const arr = normalizeHistoryList((res.data.data || []).map((a) => {
                const obj = {}
                const date = a && a.date != null ? String(a.date) : ''
                const alias = a && a.alias != null ? String(a.alias) : ''
                obj.date = date
                obj.alias = alias
                obj.remark = a && a.remark != null ? a.remark : ''
                obj.name = alias || date
                obj.time = a ? a.timestamp : ''
                obj.select = {}
                obj.selected = false
                return obj
            }))
            setColHistoryArr(arr)
            setDisplayHistoryArr(arr)
            fetchState.lastFetchAt = Date.now()
        }).catch(() => {
            message.error(i18n.language?.startsWith('zh') ? '历史数据加载失败' : 'Load history failed')
        }).finally(() => {
            fetchState.loading = false
            setHistoryLoading(false)
        })
    }, [colHistoryArr, i18n.language])

    const getColHistory = () => {
        resetOperateState()
        sethistoryDrawer((prev) => {
            const next = !prev
            if (next) {
                setHistoryRenderCount(DRAWER_RENDER_CHUNK)
                requestAnimationFrame(() => loadColHistory({ force: !Array.isArray(colHistoryArr) }))
            }
            return next
        })
    }

    const handleCollectEnd = useCallback(() => {
        historyFetchRef.current.lastFetchAt = 0
        if (historyDrawer && Onindex === 0) {
            setHistoryRenderCount(DRAWER_RENDER_CHUNK)
            loadColHistory({ force: true })
            return
        }
        setColHistoryArr(undefined)
        setDisplayHistoryArr(undefined)
    }, [Onindex, historyDrawer, loadColHistory])

    useEffect(() => {
        const timer = setTimeout(() => {
            const cancelIdle = scheduleIdleTask(() => loadColHistory(), 1200)
            historyFetchRef.current.cancelIdlePrefetch = cancelIdle
        }, HISTORY_PREFETCH_DELAY)
        return () => {
            clearTimeout(timer)
            historyFetchRef.current.cancelIdlePrefetch?.()
        }
    }, [loadColHistory])

    // 外部请求关闭历史抽屉
    useEffect(() => {
        const onClose = () => sethistoryDrawer(false)
        window.addEventListener('close-history-drawer', onClose)
        return () => window.removeEventListener('close-history-drawer', onClose)
    }, [])

    // 获取下载路径
    useEffect(() => {
        axios.get(`${localAddress}/getDownloadPath`).then((res) => {
            if (res.data?.code === 0) {
                syncDownloadPathState(res.data.data.path)
            }
        }).catch(() => {})
    }, [])

    // 下载弹窗自动消失
    useEffect(() => {
        if (downloadToast) {
            const timer = setTimeout(() => {
                setDownloadToast(null)
            }, 3000)
            return () => clearTimeout(timer)
        }
    }, [downloadToast])

    useEffect(() => {
        if (showDownloadPathModal) {
            setEditPathValue(downloadPath || '')
        }
    }, [showDownloadPathModal])

    const handleSelectFolderLegacy = async () => {
        // 优先使用 Electron 文件夹选择对话框
        if (window.electronAPI?.selectFolder) {
            const folder = normalizeFolderSelection(await window.electronAPI.selectFolder())
            if (folder) {
                try {
                    const payload = { path: folder }
                    const res = await axios.post(`${localAddress}/setDownloadPath`, payload, {
                        params: buildFallbackParams(payload)
                    })
                    if (res.data?.code === 0) {
                        // 使用后端返回的实际路径更新输入框
                        const actualPath = res.data?.data?.path || folder
                        setDownloadPath(actualPath)
                        setIsEditingPath(false)
                        message.success(t('pathUpdated'))
                    }
                } catch (e) {
                    // 即使后端请求失败，也更新前端显示
                    setDownloadPath(folder)
                }
            }
        } else {
            // 非 Electron 环境，显示编辑框
            setIsEditingPath(true)
            setEditPathValue(downloadPath)
        }
    }

    const handleSavePathLegacy = () => {
        if (!editPathValue.trim()) return
        const payload = { path: editPathValue.trim() }
        axios.post(`${localAddress}/setDownloadPath`, payload, {
            params: buildFallbackParams(payload)
        }).then((res) => {
            if (res.data?.code === 0) {
                setDownloadPath(editPathValue.trim())
                setIsEditingPath(false)
                message.success(t('pathUpdated'))
            } else {
                message.error(res.data?.message || t('downloadFailed'))
            }
        })
    }

    const handleSelectFolder = async () => {
        if (window.electronAPI?.selectFolder) {
            const folder = normalizeFolderSelection(await window.electronAPI.selectFolder())
            if (folder) {
                try {
                    await persistDownloadPath(folder, { showSuccess: true })
                } catch (err) {
                    syncDownloadPathState(folder)
                    message.error(err.message || t('downloadFailed'))
                }
            }
            return
        }

        setIsEditingPath(true)
        setEditPathValue(downloadPath || '')
    }

    const handleSavePath = async () => {
        if (!editPathValue.trim()) return
        try {
            await persistDownloadPath(editPathValue, { showSuccess: true })
        } catch (err) {
            message.error(err.message || t('downloadFailed'))
        }
    }

    const handleOpenFolder = async (folderPathOverride) => {
        const targetPath = typeof folderPathOverride === 'string' && folderPathOverride.trim()
            ? folderPathOverride.trim()
            : downloadPath
        if (!targetPath) {
            message.warning(t('noPath'))
            return
        }
        // 优先使用 Electron API
        if (window.electronAPI?.openPath) {
            try {
                const openResult = await window.electronAPI.openPath(targetPath)
                if (typeof openResult === 'string' && openResult.trim()) {
                    message.error(openResult.trim())
                }
            } catch (err) {
                console.error('Open folder error:', err)
                message.error(err?.message || t('openFolderFailed'))
            }
        } else {
            const payload = { folderPath: targetPath }
            axios.post(`${localAddress}/openFolder`, payload, {
                params: buildFallbackParams(payload)
            }).then((res) => {
                if (res.data?.code !== 0) {
                    message.error(res.data?.message || t('openFolderFailed'))
                }
            }).catch((err) => {
                console.error('Open folder error:', err)
                message.error(t('openFolderFailed'))
            })
        }
    }

    const handleOpenFile = (filePath) => {
        if (!filePath) return
        if (window.electronAPI?.openPath) {
            window.electronAPI.openPath(filePath)
        } else {
            const payload = { filePath }
            axios.post(`${localAddress}/openFile`, payload, {
                params: buildFallbackParams(payload)
            }).then((res) => {
                if (res.data?.code !== 0) {
                    // 如果打开文件失败，尝试打开所在文件夹
                    const folderPath = filePath.replace(/[\\/][^\\/]+$/, '')
                    if (folderPath && folderPath !== filePath) {
                        handleOpenFolder(folderPath)
                    } else {
                        message.error(res.data?.message || t('openFileFailed'))
                    }
                }
            }).catch((err) => {
                console.error('Open file error:', err)
                // 降级：尝试打开所在文件夹
                const folderPath = filePath.replace(/[\\/][^\\/]+$/, '')
                if (folderPath && folderPath !== filePath) {
                    handleOpenFolder(folderPath)
                }
            })
        }
    }

    // 点击下载按钮：先弹出路径选择对话框
    const download = () => {
        if (!selectArr.length) {
            message.info(t('selectDataFirst'))
            return
        }
        setEditPathValue(downloadPath || '')
        setExportFieldLoading(true)
        setExportFieldOptions([])
        setExportFields([])
        setShowDownloadPathModal(true)

        const selectedFiles = Array.isArray(selectArr)
            ? selectArr.map((item) => item == null ? '' : String(item).trim()).filter(Boolean)
            : []
        const payload = { fileArr: selectedFiles }
        axios({
            method: 'post',
            url: `${localAddress}/downloadFields`,
            params: buildFallbackParams(payload),
            data: payload,
        }).then((res) => {
            const data = res.data?.data || {}
            const fields = Array.isArray(data.fields) ? data.fields : []
            const defaults = Array.isArray(data.defaultFields) ? data.defaultFields : fields.map((item) => item.value)
            setExportFieldOptions(fields)
            setExportFields(defaults)
        }).catch((err) => {
            console.error('[Download] load export fields failed:', err)
            message.warning(t('exportFieldsLoadFailed') || '导出字段读取失败，已使用默认字段')
        }).finally(() => {
            setExportFieldLoading(false)
        })
    }

    // 确认下载：关闭路径对话框，显示进度弹窗，执行下载
    const openCopReport = () => {
        if (selectArr.length !== 1) {
            message.info(t('selectOneReportData') || '请选择一条历史数据生成报告')
            return
        }
        const reportDate = String(selectArr[0] || '').trim()
        if (!reportDate) {
            message.info(t('selectDataFirst'))
            return
        }
        const reportParams = new URLSearchParams({ date: reportDate })
        if (Onindex === 1) {
            reportParams.set('source', 'csv')
            reportParams.set('fileName', reportDate)
        }
        const currentSelectJson = buildCurrentReportSelectJson()
        if (currentSelectJson) {
            const selectionId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
            sessionStorage.setItem(`${COP_REPORT_SELECTION_PREFIX}${selectionId}`, JSON.stringify(currentSelectJson))
            reportParams.set('selectionId', selectionId)
        }
        window.dispatchEvent(new CustomEvent('force-clear-selection-mode'))
        removeHistoryBox()
        useEquipStore.getState().setSelectArr([])
        window.location.hash = `#/copReport?${reportParams.toString()}`
        resetOperateState()
        sethistoryDrawer(false)
    }

    const buildCurrentReportSelectJson = () => {
        const ranges = Array.isArray(pageInfo?.brushInstance?.rangeArr)
            ? pageInfo.brushInstance.rangeArr
            : []
        if (!ranges.length) return null

        const systemType = getSysType()
        const displayType = getDisplayType()
        const selectJson = {}
        ranges.forEach((range, index) => {
            if (!range) return
            let typeKey = range.matrixKey || systemType
            if (isMoreMatrix(systemType)) {
                const part = String(displayType || '').includes('sit') ? 'sit' : 'back'
                typeKey = range.matrixKey || `${systemType}-${part}`
            }
            const config = systemPointConfig[typeKey]
            if (!config) return
            const matrix = range.matrixRect || colSelectMatrix('canvasThree', range, config)
            if (!matrix) return

            if (!selectJson[typeKey]) selectJson[typeKey] = { regions: [] }
            selectJson[typeKey].regions.push({
                xStart: matrix.xStart,
                xEnd: matrix.xEnd,
                yStart: matrix.yStart,
                yEnd: matrix.yEnd,
                width: matrix.width || config.width,
                height: matrix.height || config.height,
                name: formatSelectionName(range.name, index + 1, t),
                color: range.bgc,
                colorIndex: range.colorIndex != null ? range.colorIndex : index,
                templateId: range.templateId,
            })
        })

        return Object.keys(selectJson).length ? selectJson : null
    }

    const confirmDownload = async () => {
        const selectedFiles = Array.isArray(selectArr)
            ? selectArr.map((item) => item == null ? '' : String(item).trim()).filter(Boolean)
            : []

        if (!selectedFiles.length) {
            setShowDownloadPathModal(false)
            message.info(t('selectDataFirst'))
            return
        }
        if (exportFieldOptions.length && !exportFields.length) {
            message.warning(t('selectExportFields') || '请至少选择一个导出字段')
            return
        }

        const pendingPath = String(editPathValue || downloadPath || '').trim()
        if (pendingPath) {
            try {
                await persistDownloadPath(pendingPath)
            } catch (err) {
                message.error(err.message || t('downloadFailed'))
                return
            }
        }

        setShowDownloadPathModal(false)
        setDownloadProgress({ percent: 0, status: 'downloading', files: [] })

        // 模拟进度动画
        let fakePercent = 0
        const progressTimer = setInterval(() => {
            fakePercent += Math.random() * 15 + 5
            if (fakePercent > 90) fakePercent = 90
            setDownloadProgress(prev => prev ? { ...prev, percent: Math.round(fakePercent) } : prev)
        }, 300)

        const payload = {
            fileArr: selectedFiles,
            exportOptions: {
                format: exportFormat,
                fields: exportFields,
            },
        }

        axios({
            method: 'post',
            url: `${localAddress}/download`,
            params: buildFallbackParams(payload),
            data: payload,
        }).then((res) => {
            clearInterval(progressTimer)
            console.log(res)
            const result = res.data || {}
            if (result.code !== 0) {
                setDownloadProgress({ percent: 100, status: 'error', files: [] })
                message.error(getApiErrorMessage(result, t('downloadFailed')))
                setTimeout(() => setDownloadProgress(null), 2000)
            } else {
                // 提取所有文件路径（支持单文件 filePath 和多文件 filePaths）
                const results = Array.isArray(result.data) ? result.data : []
                const downloadedFiles = []
                if (Array.isArray(results)) {
                    for (const item of results) {
                        if (item && typeof item === 'object') {
                            // 优先处理 filePaths 数组（多矩阵系统分文件导出）
                            if (Array.isArray(item.filePaths)) {
                                for (const fp of item.filePaths) {
                                    if (fp) {
                                        downloadedFiles.push({
                                            filePath: fp,
                                            fileName: fp.split('/').pop().split('\\').pop()
                                        })
                                    }
                                }
                            } else if (item.filePath) {
                                // 兼容单文件 filePath
                                downloadedFiles.push({
                                    filePath: item.filePath,
                                    fileName: item.filePath.split('/').pop().split('\\').pop()
                                })
                            }
                        }
                    }
                }
                if (!downloadedFiles.length) {
                    setDownloadProgress({ percent: 100, status: 'error', files: [] })
                    message.error(getApiErrorMessage(result, t('downloadFailed')))
                    setTimeout(() => setDownloadProgress(null), 2000)
                    return
                }
                setDownloadProgress({ percent: 100, status: 'done', files: downloadedFiles })
            }
        }).catch((err) => {
            clearInterval(progressTimer)
            setDownloadProgress({ percent: 100, status: 'error', files: [] })
            message.error(getApiErrorMessage(err?.response?.data, err.message || t('downloadFailed')))
            setTimeout(() => setDownloadProgress(null), 2000)
        })
    }

    const deleteData = () => {

        if (!selectArr.length) {
            message.info(t('selectDataFirst'))
            return
        }
        if (Onindex == 0) {
            const payload = {
                fileArr: selectArr,
            }

            axios({
                method: 'post',
                url: `${localAddress}/delete`,
                params: buildFallbackParams(payload),
                data: payload,
            }).then((res) => {
                // console.log(res)
                let resArr = [...colHistoryArr]
                resArr = resArr.filter((a) => !selectArr.includes(a.date))
                setColHistoryArr(resArr)
                setDisplayHistoryArr(resArr)
                message.success(t('deleteSuccess'))
                resetOperateState()
            }).catch((err) => {
                message.error(t('deleteFailed'))

            })
        } else {
            setLocalArr((prev) => normalizeCsvList(prev).filter((a) => !selectArr.includes(a)))
            message.success(t('deleteSuccess'))
            resetOperateState()
        }

    }


    const [fileName, setFileName] = useState('')
    const uploadFileRef = useRef(null)
    const fileInputRef = useRef(null)

    const fileChange = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            uploadFileRef.current = file
            setFileName(file.name)
        }
    }

    const handleChooseUploadFile = () => {
        fileInputRef.current?.click()
    }


    const [dataLength, setDataLength] = useState(10)
    const [currentName, setCurrentName] = useState()
    const [currentPlaybackKey, setCurrentPlaybackKey] = useState('')

    const getHistoryItemKey = (item) => {
        if (!item || typeof item !== 'object') return ''
        if (item.date != null && String(item.date).trim()) return String(item.date).trim()
        if (item.time != null && String(item.time).trim()) return String(item.time).trim()
        if (item.name != null && String(item.name).trim()) return String(item.name).trim()
        return ''
    }

    const getLocalItemKey = (item) => {
        if (item == null) return ''
        return String(item)
    }

    const close = () => {
        axios({
            method: 'post',
            url: `${localAddress}/cancalDbPlay`,
        }).then((res) => {

        })

        removeHistoryBox()
        pageInfo.clearVisualizationData?.()
        useEquipStore.getState().setHistoryChart({ pressArr: {}, areaArr: {} })
        useEquipStore.getState().setDataStatus('realtime')
        useEquipStore.getState().setPlaybackHasSelection(false)
        useEquipStore.getState().setPlaybackRecordDate('')
        setCurrentName('')
        setCurrentPlaybackKey('')
        setOperateStatus('')
        //  const history = useEquipStore.getState().history
        useEquipStore.getState().setHistoryStatus({
            index: 0,
            timestamp: '',
        })
    }

    useEffect(() => {
        const handleReportReturnRealtime = () => {
            removeHistoryBox()
            pageInfo.clearVisualizationData?.()
            sethistoryDrawer(false)
            setCurrentName('')
            setCurrentPlaybackKey('')
            setOperateStatus('')
            resetOperateState()
            const store = useEquipStore.getState()
            store.setDataStatus('realtime')
            store.setPlaybackHasSelection(false)
            store.setPlaybackRecordDate('')
            store.setHistoryChart({ pressArr: {}, areaArr: {} })
            store.setHistoryStatus({ index: 0, timestamp: '' })
        }
        window.addEventListener('report-return-realtime', handleReportReturnRealtime)
        return () => window.removeEventListener('report-return-realtime', handleReportReturnRealtime)
    }, [pageInfo])

    const startContrast = () => {
        const leftDate = contrastArr.left?.date
        const rightDate = contrastArr.right?.date
        const leftSource = getContrastRequestSource(contrastArr.left)
        const rightSource = getContrastRequestSource(contrastArr.right)
        if (!leftDate) {
            message.error(contrastMode === 'single_record_frame' ? 'Please select one history record first' : t('selectBaseDataFirst'))
            return
        }

        if (contrastMode !== 'single_record_frame') {
            if (!rightDate) {
                message.error(t('selectCompareDataFirst'))
                return
            }
            if (isSameContrastRecord(contrastArr.left, contrastArr.right)) {
                message.error(t('compareSameRecordInvalid'))
                return
            }
        }

        const payload = contrastMode === 'single_record_frame'
            ? {
                mode: 'single_record_frame',
                record: leftDate,
                source: leftSource,
            }
            : {
                mode: 'record_pair',
                left: leftDate,
                right: rightDate,
                leftSource,
                rightSource,
            }

        axios({
            method: 'post',
            url: `${localAddress}/getContrastData`,
            params: buildFallbackParams(payload),
            data: payload,
        }).then((res) => {
            const result = res.data || {}
            if (result.code !== 0) {
                message.error(result.message || t('compareDataNotReady'))
                return
            }
            const data = result.data || {}
            useEquipStore.getState().setContrast(data)
            useEquipStore.getState().setDataStatus('contrast')
            const firstKey = data.keys?.[0] || ''
            const firstPart = getMatrixPartFromDataKey(firstKey)
            if (firstPart) {
                const nextDisplayType = `${firstPart}2D`
                useEquipStore.getState().setDisplayType(nextDisplayType)
                setDisplayType?.(nextDisplayType)
            }
            setOnRuler?.(false)
            setDisplay('contrast')
            sethistoryDrawer(false)
            setOperateStatus('')
        }).catch(() => {
            message.error(t('compareStartFailed'))
        })
    }

    const [clientXY, setClientXY] = useState({ x: 0, y: 0 })
    const [rightClickFlag, setRightClickFlag] = useState(false)
    const [rightClickItem, setRightClickItem] = useState(null)

    const [searchInfo, setSearchInfo] = useState('')
    const debouncedValue = useDebounce(searchInfo, 300)
    const displayHistoryLength = Array.isArray(displayHistoryArr) ? displayHistoryArr.length : 0
    const localLength = Array.isArray(localArr) ? localArr.length : 0
    const visibleHistoryArr = useMemo(
        () => Array.isArray(displayHistoryArr) ? displayHistoryArr.slice(0, historyRenderCount) : [],
        [displayHistoryArr, historyRenderCount]
    )
    const visibleLocalArr = useMemo(
        () => Array.isArray(localArr) ? localArr.slice(0, localRenderCount) : [],
        [localArr, localRenderCount]
    )
    const handlePlaybackScroll = useCallback((event) => {
        const target = event.currentTarget
        if (!target || target.scrollHeight - target.scrollTop - target.clientHeight > 180) return
        if (Onindex === 0) {
            setHistoryRenderCount((count) => Math.min(count + DRAWER_RENDER_CHUNK, displayHistoryLength || DRAWER_RENDER_CHUNK))
        } else {
            setLocalRenderCount((count) => Math.min(count + DRAWER_RENDER_CHUNK, localLength || DRAWER_RENDER_CHUNK))
        }
    }, [Onindex, displayHistoryLength, localLength])

    useEffect(() => {
        setHistoryRenderCount(DRAWER_RENDER_CHUNK)
    }, [historyDrawer, debouncedValue, displayHistoryLength])

    useEffect(() => {
        setLocalRenderCount(DRAWER_RENDER_CHUNK)
    }, [historyDrawer, Onindex, localLength])

    useEffect(() => {
        // const user = 
        if (Onindex == 0 && colHistoryArr) {
            if (debouncedValue != '') {
                let resArr = [...colHistoryArr].filter((a) => a.name.includes(debouncedValue))
                setDisplayHistoryArr(resArr)
            } else {
                setDisplayHistoryArr(colHistoryArr)
            }

        } else {

        }
    }, [debouncedValue])

    const [selectedDbDate, setSelectedDbDate] = useState('')
    const [changedAlias, setChangedAlias] = useState('')
    const [changedRemark, setChangedRemark] = useState('')

    const handleOk = () => {
        setChangeColInfo(false);
        if (!selectedDbDate) {
            setChangedAlias('')
            setChangedRemark('')
            return
        }
        axios({
            method: 'post',
            url: `${localAddress}/upsertRemark`,
            params: {
                date: selectedDbDate,
                alias: changedAlias,
                remark: changedRemark
            },
            data: {
                date: selectedDbDate,
                alias: changedAlias,
                remark: changedRemark
            }
        }).then((res) => {
            if (res.data?.message == 'error') {
                message.error(res.data.data)
            }
        })
        const nextName = changedAlias ? changedAlias : selectedDbDate
        const updateList = (list) => Array.isArray(list) ? list.map((item) => {
            if (item.date === selectedDbDate) {
                return { ...item, alias: changedAlias, name: nextName, remark: changedRemark }
            }
            return item
        }) : list
        const resArr = updateList(colHistoryArr) || []
        const displayArr = debouncedValue ? resArr.filter((item) => item.name.includes(debouncedValue)) : resArr
        setColHistoryArr(resArr)
        setDisplayHistoryArr(displayArr)
        setSelectedDbDate('')
        setChangedAlias('')
        setChangedRemark('')
    }

    const handleCancel = () => {
        setChangeColInfo(false);
        setSelectedDbDate('')
        setChangedAlias('')
        setChangedRemark('')
    }

    const playbackRef = useRef()

    // useEffect(() => {
    //     console.log(playbackRef, 'reffff')
    //     if (playbackRef.current) {
    //         const width = playbackRef.current?.getBoundingClientRect().width
    //         if (width) {
    //             console.log(width, 'wwwww')
    //             playbackRef.current.style.height = `${width}px`
    //         }
    //     }

    // }, [playbackRef.current])

    const selectDataArrType = ['delete', 'download', 'contrast', 'report']


    const shouldShowPlaybackBar = (dataStatus === 'replay' || Boolean(currentPlaybackKey)) && display !== 'contrast'

    return (
        <>
            {/* <Modal
                title="采集参数设置"
                closable={{ 'aria-label': 'Custom Close Button' }}
                open={changeColInfo}
                onOk={handleOk}
                onCancel={handleCancel}
            >
                <div className='colChangeItem'>
                    数据名称 <Input value={colName} onChange={(e) => { setColName(e.target.value) }} />
                </div>

                <div className='colChangeItem'>
                    采集频率 <Input value={HZ} onChange={(e) => { setHZ(e.target.value) }} /> 帧/秒
                </div>
            </Modal> */}

            <Modal
                title={t('renameStorage')}
                closable={{ 'aria-label': 'Custom Close Button' }}
                open={changeColInfo}
                onOk={handleOk}
                onCancel={handleCancel}
                cancelText={t('cancel')}
                okText={t('ok')}
            >
                <div className='colChangeItem'>
                    {t('storageName')}: <Input value={changedAlias} onChange={(e) => { setChangedAlias(e.target.value) }} />
                </div>
                <div className='colChangeItem' style={{ marginTop: '12px' }}>
                    {t('remark')}: <Input.TextArea value={changedRemark} maxLength={400} autoSize={{ minRows: 3, maxRows: 6 }} onChange={(e) => { setChangedRemark(e.target.value) }} />
                </div>

            </Modal>

            {rightClickFlag ? <div className='rightClickModal' onClick={() => {
                setRightClickFlag(false)
            }}>
                <div className="rightClickMenu" style={{ left: clientXY.x, top: clientXY.y }} onClick={(e) => {
                    e.stopPropagation()
                    setChangeColInfo(true)
                    if (rightClickItem) {
                        setSelectedDbDate(rightClickItem.date)
                        setChangedAlias(rightClickItem.alias || '')
                        setChangedRemark(rightClickItem.remark || '')
                    }
                    setRightClickFlag(false)
                }}>
                    {t('modifyInfo')}
                </div>
            </div> : ''}

            <Modal
                title={t('uploadFile')}
                closable={{ 'aria-label': 'Custom Close Button' }}
                open={uploadFileShow}
                onOk={handleUpload}
                onCancel={handleUploadCancel}
                confirmLoading={uploadLoading}
                okText={t('ok')}
                cancelText={t('cancel')}
            >
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={(e) => { fileChange(e) }}
                    id="file"
                    style={{ display: 'none' }}
                />
                <Button onClick={handleChooseUploadFile}>{t('choosingDataFile')}</Button>
                <div style={{ marginTop: '8px', color: '#8794A1', fontSize: '0.8rem' }}>
                    {fileName || t('noFileSelected')}
                </div>
            </Modal>

            {/* ─── 下载路径选择对话框 ─── */}
            <Modal
                title={t('downloadPathSelect') || '下载路径选择'}
                open={showDownloadPathModal}
                onOk={confirmDownload}
                onCancel={() => setShowDownloadPathModal(false)}
                okText={t('startDownload') || '开始下载'}
                cancelText={t('cancel')}
                width={720}
            >
                <div style={{ marginBottom: '12px', color: '#666', fontSize: '0.85rem' }}>
                    {t('downloadPathHint') || '请确认或修改下载保存路径：'}
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <Input
                        value={editPathValue}
                        onChange={(e) => setEditPathValue(e.target.value)}
                        onBlur={async (e) => {
                            const val = e.target.value.trim()
                            if (val) {
                                try {
                                    await persistDownloadPath(val)
                                } catch (err) {
                                    message.error(err.message || t('downloadFailed'))
                                }
                            }
                        }}
                        style={{ flex: 1 }}
                        placeholder={t('inputPath')}
                    />
                    <Button onClick={handleSelectFolder}>{t('browse')}</Button>
                    <Button onClick={() => handleOpenFolder(editPathValue || downloadPath)}>{t('open')}</Button>
                </div>
                <div style={{ marginTop: '16px' }}>
                    <div style={{ marginBottom: '8px', fontWeight: 600 }}>{t('exportFormat') || '导出格式'}</div>
                    <Radio.Group
                        value={exportFormat}
                        onChange={(e) => setExportFormat(e.target.value)}
                        options={[
                            { label: 'CSV', value: 'csv' },
                            { label: 'XLSX', value: 'xlsx' },
                        ]}
                    />
                </div>
                <div style={{ marginTop: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <div style={{ fontWeight: 600 }}>
                            {t('exportFields') || '导出字段'}
                            <span style={{ marginLeft: 8, color: '#999', fontWeight: 400 }}>
                                {exportFields.length}/{exportFieldOptions.length || 0}
                            </span>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <Button size="small" onClick={() => setExportFields(exportFieldOptions.map((item) => item.value))} disabled={exportFieldLoading || !exportFieldOptions.length}>
                                {t('selectAll') || '全选'}
                            </Button>
                            <Button size="small" onClick={() => setExportFields([])} disabled={exportFieldLoading || !exportFieldOptions.length}>
                                {t('clear') || '清空'}
                            </Button>
                        </div>
                    </div>
                    <div style={{ minHeight: 120, maxHeight: 220, overflow: 'auto', padding: '8px 10px', border: '1px solid #d9d9d9', borderRadius: 6 }}>
                        {exportFieldLoading ? (
                            <div style={{ color: '#999' }}>{t('loading') || '加载中...'}</div>
                        ) : exportFieldOptions.length ? (
                            <Checkbox.Group
                                value={exportFields}
                                onChange={setExportFields}
                                style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px 12px' }}
                            >
                                {exportFieldOptions.map((field) => (
                                    <Checkbox key={field.value} value={field.value} style={{ minWidth: 0 }}>
                                        <span title={field.label} style={{ display: 'inline-block', maxWidth: 170, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                                            {field.label}
                                        </span>
                                    </Checkbox>
                                ))}
                            </Checkbox.Group>
                        ) : (
                            <div style={{ color: '#999' }}>{t('noData') || '暂无数据'}</div>
                        )}
                    </div>
                </div>
                <div style={{ marginTop: '12px', color: '#999', fontSize: '0.8rem' }}>
                    {t('selectedCount') || '已选择'}: {selectArr.length} {t('items') || '项'}
                </div>
            </Modal>

            {/* ─── 下载进度弹窗 ─── */}
            <Modal
                title={downloadProgress?.status === 'done' ? (t('downloadSuccess') || '下载完成') : downloadProgress?.status === 'error' ? (t('downloadFailed') || '下载失败') : (t('downloading') || '正在下载...')}
                open={!!downloadProgress}
                footer={downloadProgress?.status === 'done' ? [
                    <Button key="openFolder" type="primary" onClick={() => {
                        handleOpenFolder()
                        setDownloadProgress(null)
                        resetOperateState()
                    }}>{t('openFolder')}</Button>,
                    <Button key="close" onClick={() => {
                        setDownloadProgress(null)
                        resetOperateState()
                    }}>{t('close')}</Button>
                ] : downloadProgress?.status === 'error' ? [
                    <Button key="close" onClick={() => setDownloadProgress(null)}>{t('close')}</Button>
                ] : []}
                closable={downloadProgress?.status !== 'downloading'}
                onCancel={() => {
                    setDownloadProgress(null)
                    resetOperateState()
                }}
                maskClosable={false}
                width={480}
            >
                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                    <Progress
                        percent={downloadProgress?.percent || 0}
                        status={downloadProgress?.status === 'error' ? 'exception' : downloadProgress?.status === 'done' ? 'success' : 'active'}
                        strokeColor={downloadProgress?.status === 'done' ? '#52c41a' : '#1890ff'}
                    />
                    {downloadProgress?.status === 'downloading' && (
                        <div style={{ marginTop: '12px', color: '#666', fontSize: '0.85rem' }}>
                            {t('downloadingHint') || '正在导出数据，请稍候...'}
                        </div>
                    )}
                    {downloadProgress?.status === 'done' && downloadProgress.files.length > 0 && (
                        <div style={{ marginTop: '16px', textAlign: 'left' }}>
                            <div style={{ fontSize: '0.85rem', color: '#333', marginBottom: '8px', fontWeight: 'bold' }}>
                                {t('downloadedFiles') || '已下载文件：'}
                            </div>
                            {downloadProgress.files.map((f, idx) => (
                                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', padding: '6px 8px', backgroundColor: '#f6ffed', borderRadius: '4px', border: '1px solid #b7eb8f' }}>
                                    <span style={{ flex: 1, fontSize: '0.8rem', color: '#333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {f.fileName}
                                    </span>
                                    <span
                                        className="cursor"
                                        style={{ color: '#1890ff', fontSize: '0.8rem', whiteSpace: 'nowrap', textDecoration: 'underline' }}
                                        onClick={() => handleOpenFile(f.filePath)}
                                    >
                                        {t('clickToOpen') || '点击打开'}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </Modal>

            <Drawer zindex={2} title={t('history')} show={historyDrawer} setShow={sethistoryDrawer} close={close} >
                <Input
                    className="historySearchInput"
                    style={{ backgroundColor: '#202327', border: 0, color: "#E6EBF0", marginBottom: '0.75rem' }}
                    placeholder={t('searchPlaceholder')}
                    onChange={(e) => { setSearchInfo(e.target.value) }}
                    prefix={<i className='iconfont' style={{ color: '#E6EBF0' }}>&#xe61f;</i>}
                // suffix={
                //     <Tooltip title="Extra information">
                //         <InfoCircleOutlined style={{ color: 'rgba(0,0,0,.45)' }} />
                //     </Tooltip>
                // }
                />
                <div className="playbackContent">
                    <div className="navTitle">
                        <div className='navTitleChange'>
                            {title.map((a, index) => {
                                return (
                                    <div key={`${a}-${index}`} onClick={() => {
                                        handleTabChange(index)
                                    }} className={`${Onindex == index ? 'onNavItem' : 'offNavItem'} navTitleItem cursor`}>{a}</div>
                                )
                            })}
                        </div>
                        <div className="navOperate">
                            {/* {
                                operateStatus == 'search' ?
                                    <Input onChange={(e) => { setSearchInfo(e.target.value) }} style={{ width: '6rem' }} /> :
                                    operateStatus == 'delete' ? <div className='modalConfirmButton cursor' onClick={deleteData}>{t('delete')}</div> :
                                        operateStatus == 'download' ? <div className='modalConfirmButton cursor' onClick={download}>{t('download')}</div> : ''
                            } */}


                            {Onindex == 0 ? (
                                operateStatus == '' ? <>
                                <Popover className='navItempop' overlayClassName="navItempop" color='#32373E' placement="bottom" content={t('delete')}>
                                    <div className='navIconContent'>
                                        <i className='iconfont cursor' onClick={() => {
                                            if (operateStatus != 'delete') {
                                                setOperateStatus('delete')
                                            } else {
                                                setOperateStatus('')
                                            }

                                        }}>&#xe60f;</i>
                                    </div>
                                </Popover>

                                <Popover className='navItempop' overlayClassName="navItempop" color='#32373E' placement="bottom" content={t('download')}>
                                    <div className='navIconContent'>
                                        <i className='iconfont cursor' onClick={() => {
                                            if (operateStatus != 'download') {
                                                setOperateStatus('download')
                                            } else {
                                                setOperateStatus('')
                                            }

                                        }}>&#xe60a;</i>
                                    </div>
                                </Popover>
                                <Popover className='navItempop' overlayClassName="navItempop" color='#32373E' placement="bottom" content={t('generateReport') || '生成报告'}>
                                    <div className='navIconContent'>
                                        <FileTextOutlined className='cursor' onClick={() => {
                                            if (operateStatus != 'report') {
                                                setOperateStatus('report')
                                            } else {
                                                setOperateStatus('')
                                            }
                                        }} />
                                    </div>
                                </Popover>
                                <Popover className='navItempop' overlayClassName="navItempop" color='#32373E' placement="bottom" content={t('compare') || '对比'}>
                                    <div className='navIconContent'>
                                        <i className='iconfont cursor' onClick={() => {
                                            setOperateStatus('contrast')
                                            setSelectArr([])
                                            setContrast(contrastInitArr)
                                        }}>&#xe60e;</i>
                                    </div>
                                </Popover></> :
                                <>
                                    {
                                        operateStatus == 'contrast' ? <div className="contrastModeSwitch">
                                            <button
                                                type="button"
                                                className={contrastMode === 'record_pair' ? 'active' : ''}
                                                onClick={() => {
                                                    setContrastMode('record_pair')
                                                    setSelectArr([])
                                                    setContrast(contrastInitArr)
                                                }}
                                            >{t('contrastRecordPair')}</button>
                                            <button
                                                type="button"
                                                className={contrastMode === 'single_record_frame' ? 'active' : ''}
                                                onClick={() => {
                                                    setContrastMode('single_record_frame')
                                                    setSelectArr([])
                                                    setContrast(contrastInitArr)
                                                }}
                                            >{t('contrastSingleRecordTime')}</button>
                                        </div> : ''
                                    }
                                    {
                                        operateStatus == 'delete' ? <div className='modalConfirmButton cursor' onClick={deleteData}>{t('delete')}</div> :
                                            operateStatus == 'download' ? <div className='modalConfirmButton cursor' onClick={download}>{t('download')}</div> :
                                                operateStatus == 'report' ? <div className='modalConfirmButton cursor' onClick={openCopReport}>{t('startReport') || '生成报告'}</div> :
                                                    operateStatus == 'contrast' ? <div className='modalConfirmButton cursor' onClick={startContrast}>{t('startCompare')}</div> : ''
                                    }

                                    <div className='modalConfirmButton cursor' onClick={() => {
                                        resetOperateState()
                                    }}>{t('cancel')}</div>
                                </>
                            ) : Onindex == 1 ? (
                                operateStatus == '' ? <>
                                <Popover className='navItempop' overlayClassName="navItempop" color='#32373E' placement="bottom" content={t('uploadFile') || 'CSV导入'}>
                                    <div className='navIconContent'>
                                        <i className='iconfont cursor' onClick={() => {
                                            setUploadFileShow(true)
                                        }}>&#xe631;</i>
                                    </div>
                                </Popover>
                                <Popover className='navItempop' overlayClassName="navItempop" color='#32373E' placement="bottom" content={t('delete')}>
                                    <div className='navIconContent'>
                                        <i className='iconfont cursor' onClick={() => {
                                            if (operateStatus != 'delete') {
                                                setOperateStatus('delete')
                                            } else {
                                                setOperateStatus('')
                                            }
                                        }}>&#xe60f;</i>
                                    </div>
                                </Popover>
                                <Popover className='navItempop' overlayClassName="navItempop" color='#32373E' placement="bottom" content={t('generateReport') || '鐢熸垚鎶ュ憡'}>
                                    <div className='navIconContent'>
                                        <FileTextOutlined className='cursor' onClick={() => {
                                            if (operateStatus != 'report') {
                                                setOperateStatus('report')
                                            } else {
                                                setOperateStatus('')
                                            }
                                        }} />
                                    </div>
                                </Popover>
                                <Popover className='navItempop' overlayClassName="navItempop" color='#32373E' placement="bottom" content={t('compare') || '瀵规瘮'}>
                                    <div className='navIconContent'>
                                        <i className='iconfont cursor' onClick={() => {
                                            setOperateStatus('contrast')
                                            setSelectArr([])
                                            setContrast(contrastInitArr)
                                        }}>&#xe60e;</i>
                                    </div>
                                </Popover></> :
                                <>
                                    {
                                        operateStatus == 'contrast' ? <div className="contrastModeSwitch">
                                            <button
                                                type="button"
                                                className={contrastMode === 'record_pair' ? 'active' : ''}
                                                onClick={() => {
                                                    setContrastMode('record_pair')
                                                    setSelectArr([])
                                                    setContrast(contrastInitArr)
                                                }}
                                            >{t('contrastRecordPair')}</button>
                                            <button
                                                type="button"
                                                className={contrastMode === 'single_record_frame' ? 'active' : ''}
                                                onClick={() => {
                                                    setContrastMode('single_record_frame')
                                                    setSelectArr([])
                                                    setContrast(contrastInitArr)
                                                }}
                                            >{t('contrastSingleRecordTime')}</button>
                                        </div> : ''
                                    }
                                    {
                                        operateStatus == 'delete' ? <div className='modalConfirmButton cursor' onClick={deleteData}>{t('delete')}</div> :
                                            operateStatus == 'report' ? <div className='modalConfirmButton cursor' onClick={openCopReport}>{t('startReport') || '鐢熸垚鎶ュ憡'}</div> :
                                                operateStatus == 'contrast' ? <div className='modalConfirmButton cursor' onClick={startContrast}>{t('startCompare')}</div> : ''
                                    }
                                    <div className='modalConfirmButton cursor' onClick={() => {
                                        resetOperateState()
                                    }}>{t('cancel')}</div>
                                </>
                            ) : null}
                        </div>
                    </div>

                    <div className="playbackItemContent" onScroll={handlePlaybackScroll}>
                        <div className="playbackItems">
                            {
                                Onindex == 0 && historyLoading && !visibleHistoryArr.length ? (
                                    <div className="historyLoadingText">{i18n.language?.startsWith('zh') ? '加载中...' : 'Loading...'}</div>
                                ) : Onindex == 0 && visibleHistoryArr.length ? visibleHistoryArr.map((dbInfo, index) => {
                                    const historyItemKey = getHistoryItemKey(dbInfo)
                                    const historyContrastRecord = buildHistoryContrastRecord(dbInfo)
                                    const contrastRole = contrastMode === 'single_record_frame'
                                        ? (isSameContrastRecord(contrastArr.left, historyContrastRecord) ? 'T' : '')
                                        : (isSameContrastRecord(contrastArr.left, historyContrastRecord) ? 'A' : isSameContrastRecord(contrastArr.right, historyContrastRecord) ? 'B' : '')

                                    return (
                                        <div key={historyItemKey || `history-${index}`} className={`playbackItem cursor ${currentPlaybackKey === historyItemKey ? 'playbackItemActive' : ''}`}

                                            onClick={() => {
                                                if (operateStatus == 'contrast') {
                                                    const obj = { ...contrastArr }
                                                    const clickedRecord = buildHistoryContrastRecord(dbInfo)
                                                    const clickedKey = getContrastSelectKey(clickedRecord)

                                                    if (contrastMode === 'single_record_frame') {
                                                        if (isSameContrastRecord(obj.left, clickedRecord)) {
                                                            obj.left = {}
                                                            obj.right = {}
                                                            setSelectArr([])
                                                        } else {
                                                            obj.left = clickedRecord
                                                            obj.right = {}
                                                            setSelectArr([clickedKey])
                                                        }
                                                    } else {
                                                        let arr = [...selectArr]
                                                        if (isSameContrastRecord(obj.left, clickedRecord)) {
                                                            obj.left = {}
                                                            arr = arr.filter((b) => b !== clickedKey)
                                                        } else if (isSameContrastRecord(obj.right, clickedRecord)) {
                                                            obj.right = {}
                                                            arr = arr.filter((b) => b !== clickedKey)
                                                        } else if (!obj.left?.date) {
                                                            obj.left = clickedRecord
                                                            arr = [...arr.filter((b) => b !== clickedKey), clickedKey]
                                                        } else if (!obj.right?.date) {
                                                            obj.right = clickedRecord
                                                            arr = [...arr.filter((b) => b !== clickedKey), clickedKey]
                                                        } else {
                                                            message.info(t('twoGroupsSelected'))
                                                        }
                                                        setSelectArr(arr)
                                                    }
                                                    setContrast(obj)


                                                } else if (selectDataArrType.includes(operateStatus)) {
                                                    let arr = [...selectArr]
                                                    if (arr.includes(dbInfo.date)) {
                                                        arr = arr.filter((b) => b != dbInfo.date)
                                                    } else {
                                                        arr.push(dbInfo.date)
                                                    }
                                                    setSelectArr(arr)
                                                } else {
                                                    const playbackTime = dbInfo && dbInfo.date != null ? String(dbInfo.date).trim() : ''
                                                    const playbackTimestamp = dbInfo && dbInfo.time != null ? String(dbInfo.time).trim() : ''

                                                    if (!playbackTime && !playbackTimestamp) {
                                                        message.error('No playback identifier found for the selected item')
                                                        return
                                                    }

                                                    const playbackRequest = {
                                                        time: playbackTime || undefined,
                                                        date: playbackTime || undefined,
                                                        timestamp: playbackTimestamp || undefined,
                                                    }

                                                    axios({
                                                        method: 'post',
                                                        url: `${localAddress}/getDbHistory`,
                                                        params: playbackRequest,
                                                        data: playbackRequest
                                                    }).then((res) => {
                                                        const result = res.data || {}
                                                        const payload = result.data || {}
                                                        const length = Number(payload.length) || 0

                                                        if (result.code !== 0) {
                                                            message.error(result.message || 'Load playback failed')
                                                            return
                                                        }

                                                        if (length <= 0) {
                                                            message.error(result.message || 'No playback data found for the selected time')
                                                            return
                                                        }

                                                        setCurrentName(dbInfo.name)
                                                        setCurrentPlaybackKey(historyItemKey)
                                                        useEquipStore.getState().setDataStatus('replay')
                                                        useEquipStore.getState().setPlaybackHasSelection(false)
                                                        useEquipStore.getState().setPlaybackRecordDate(dbInfo.date)

                                                        setDataLength(length)
                                                        useEquipStore.getState().setHistoryStatus({
                                                            index: Number(payload.initialIndex) || 0,
                                                            timestamp: payload.initialTimestamp || ''
                                                        })
                                                        if (payload.areaArr || payload.pressArr) {
                                                            useEquipStore.getState().setHistoryChart({
                                                                areaArr: payload.areaArr || {},
                                                                pressArr: payload.pressArr || {}
                                                            })
                                                        }
                                                        useEquipStore.getState().setStatus(new Array(4096).fill(0))
                                                        useEquipStore.getState().setDisplayStatus(new Array(4096).fill(0))

                                                        // 如果历史数据有保存的框选信息，自动设置框选缓存供回放时展示
                                                    }).catch((err) => {
                                                        message.error(err.message || 'Load playback failed')
                                                    })
                                                }

                                            }}
                                            onContextMenu={(e) => {
                                                e.preventDefault()
                                                setClientXY({ x: e.clientX, y: e.clientY })
                                                setRightClickItem(dbInfo)
                                                setRightClickFlag(true)
                                            }}

                                        >
                                            <div className='playbackItemCard' ref={playbackRef} style={{ position: 'relative', background: `center / cover no-repeat url(${history})` }}>

                                                <div style={{ position: 'absolute', backgroundColor: 'rgba(41,45,50 , 0.8)', width: '100%', height: '100%', top: 0, left: 0 }}>

                                                </div>
                                                <i className='iconfont fs18' style={{ color: '#fff', zIndex: 2 }}>&#xe634;</i>
                                                {selectDataArrType.includes(operateStatus) ? <div className="cardSelect">
                                                    <img style={{ transform: selectArr.includes(dbInfo.date) ? 'scale(1.1)' : 'scale(0)' }} src={selected} alt="" />
                                                </div> : ''}
                                                {operateStatus === 'contrast' && contrastRole ? <div className="contrastRoleBadge">{contrastRole}</div> : ''}

                                                {/* <img style={{width : '100%'}} src={history} alt="" /> */}
                                            </div>
                                            <div className='playbackItemNameInfo'>
                                                {dbInfo.name}
                                            </div>
                                            <div className='playbackItemTimeInfo'>
                                                {dayjs(dbInfo.time).format('YYYY/MM/DD HH:mm')}
                                            </div>
                                        </div>
                                    )
                                }) : Onindex == 1 && visibleLocalArr.length ? visibleLocalArr.map((a, index) => {
                                    const localItemKey = getLocalItemKey(a)
                                    const localContrastRecord = buildImportedContrastRecord(a)
                                    const localContrastRole = contrastMode === 'single_record_frame'
                                        ? (isSameContrastRecord(contrastArr.left, localContrastRecord) ? 'T' : '')
                                        : (isSameContrastRecord(contrastArr.left, localContrastRecord) ? 'A' : isSameContrastRecord(contrastArr.right, localContrastRecord) ? 'B' : '')
                                    return (
                                        <div key={localItemKey || `local-${index}`} className={`playbackItem cursor ${currentPlaybackKey === localItemKey ? 'playbackItemActive' : ''}`} onClick={() => {
                                            if (operateStatus == 'contrast') {
                                                const localRecord = buildImportedContrastRecord(a)
                                                const localKey = getContrastSelectKey(localRecord)
                                                const obj = { ...contrastArr }

                                                if (contrastMode === 'single_record_frame') {
                                                    if (isSameContrastRecord(obj.left, localRecord)) {
                                                        obj.left = {}
                                                        obj.right = {}
                                                        setSelectArr([])
                                                    } else {
                                                        obj.left = localRecord
                                                        obj.right = {}
                                                        setSelectArr([localKey])
                                                    }
                                                } else {
                                                    let arr = [...selectArr]
                                                    if (isSameContrastRecord(obj.left, localRecord)) {
                                                        obj.left = {}
                                                        arr = arr.filter((b) => b !== localKey)
                                                    } else if (isSameContrastRecord(obj.right, localRecord)) {
                                                        obj.right = {}
                                                        arr = arr.filter((b) => b !== localKey)
                                                    } else if (!obj.left?.date) {
                                                        obj.left = localRecord
                                                        arr = [...arr.filter((b) => b !== localKey), localKey]
                                                    } else if (!obj.right?.date) {
                                                        obj.right = localRecord
                                                        arr = [...arr.filter((b) => b !== localKey), localKey]
                                                    } else {
                                                        message.info(t('twoGroupsSelected'))
                                                    }
                                                    setSelectArr(arr)
                                                }
                                                setContrast(obj)
                                            } else if (selectDataArrType.includes(operateStatus)) {
                                                let arr = [...selectArr]
                                                if (arr.includes(a)) {
                                                    arr = arr.filter((b) => b != a)
                                                } else {
                                                    arr.push(a)
                                                }
                                                setSelectArr(arr)
                                            } else {
                                                const payload = {
                                                    fileName: a,
                                                }

                                                axios({
                                                    method: 'post',
                                                    url: `${localAddress}/getCsvData`,
                                                    params: buildFallbackParams(payload),
                                                    data: payload,
                                                }).then((res) => {
                                                    const result = res.data || {}
                                                    const payload = result.data || {}
                                                    const length = Number(payload.length) || 0

                                                    if (result.code !== 0) {
                                                        message.error(result.message || 'Load playback failed')
                                                        return
                                                    }

                                                    if (length <= 0) {
                                                        message.error(result.message || 'No playback data found in CSV')
                                                        return
                                                    }

                                                    setCurrentName(a)
                                                    setCurrentPlaybackKey(localItemKey)
                                                    setDataLength(length)
                                                    useEquipStore.getState().setDataStatus('replay')
                                                    useEquipStore.getState().setPlaybackHasSelection(false)
                                                    useEquipStore.getState().setPlaybackRecordDate('')
                                                    useEquipStore.getState().setHistoryStatus({
                                                        index: Number(payload.initialIndex) || 0,
                                                        timestamp: payload.initialTimestamp || ''
                                                    })
                                                    useEquipStore.getState().setHistoryChart({
                                                        areaArr: payload.areaArr || {},
                                                        pressArr: payload.pressArr || {}
                                                    })
                                                    useEquipStore.getState().setStatus(new Array(4096).fill(0))
                                                    useEquipStore.getState().setDisplayStatus(new Array(4096).fill(0))
                                                }).catch((err) => {
                                                    message.error(err?.response?.data?.message || err.message || 'Load playback failed')
                                                })
                                            }

                                        }}>
                                            <div className='playbackItemCard' ref={playbackRef} style={{ position: 'relative', background: `center / cover no-repeat url(${history})` }}>

                                                <div style={{ position: 'absolute', backgroundColor: 'rgba(41,45,50 , 0.8)', width: '100%', height: '100%', top: 0, left: 0 }}>

                                                </div>
                                                <i className='iconfont fs18' style={{ color: '#fff', zIndex: 2 }}>&#xe634;</i>
                                                {/* <img style={{width : '100%'}} src={history} alt="" /> */}
                                                {selectDataArrType.includes(operateStatus) ? <div className="cardSelect">
                                                    {/* <div style={{background : `no-repeat center/100% url(${selected})` , width : '100%' , height : '100%'}} src={selected} alt="" /> */}
                                                    <img style={{ transform: selectArr.includes(a) ? 'scale(1.1)' : 'scale(0)' }} src={selected} alt="" />
                                                </div> : ''}
                                                {operateStatus === 'contrast' && localContrastRole ? <div className="contrastRoleBadge">{localContrastRole}</div> : ''}
                                            </div>
                                            <div className='playbackItemInfo'>
                                                {a}
                                            </div>
                                        </div>
                                    )
                                }) : ''
                            }
                        </div>

                        {/* <div className="contrastContent">
                            <div className="contrastItem">
                                {!Object.keys(contrastArr.left).length ? <><div className="contrastItemCard">
                                    <i className='iconfont add cursor' style={{}} >&#xe631;</i>
                                    选择数据文件
                                </div>
                                    <div style={{ width: '100%', height: '16px', marginTop: 4 }}></div></>
                                    :
                                    <>
                                        <div className='playbackItemCard' ref={playbackRef} style={{ position: 'relative', background: `center / cover no-repeat url(${history})` }}>

                                            <div style={{ position: 'absolute', backgroundColor: 'rgba(41,45,50 , 0.8)', width: '100%', height: '100%', top: 0, left: 0 }}>

                                            </div>

                                            {selectDataArrType.includes(operateStatus) ? <div className="cardSelect">
                                                <img style={{ transform: selectArr.includes(dbInfo.name) ? 'scale(1.1)' : 'scale(0)' }} src={selected} alt="" />
                                            </div> : ''}

                                            {contrastArr.left.selected ?
                                                <div className='fs14' style={{ left: 5, bottom: 5, position: 'absolute', color: '#5CDBD3', }}>
                                                    <i className='iconfont fs14' style={{ zIndex: 2, color: '#5CDBD3' }}>&#xe60e;</i> {t('selected')}
                                                </div>
                                                : ''}

                                            <img style={{ width: '100%' }} src={history} alt="" />
                                        </div>
                                        <div className='playbackItemNameInfo'>
                                            {contrastArr.left.name}
                                        </div>
                                    </>
                                }
                            </div>
                            <div className="contrastItem">
                                {!Object.keys(contrastArr.right).length ? <> <div className="contrastItemCard">
                                    <i className='iconfont add cursor' style={{}} >&#xe631;</i>
                                    选择数据文件
                                </div>
                                    <div style={{ width: '100%', height: '16px', marginTop: 4 }}></div>
                                </> :
                                    <>
                                        <div className='playbackItemCard' ref={playbackRef} style={{ position: 'relative', background: `center / cover no-repeat url(${history})` }}>

                                            <div style={{ position: 'absolute', backgroundColor: 'rgba(41,45,50 , 0.8)', width: '100%', height: '100%', top: 0, left: 0 }}>

                                            </div>

                                             {selectDataArrType.includes(operateStatus) ? <div className="cardSelect">
                                                <img style={{ transform: selectArr.includes(dbInfo.name) ? 'scale(1.1)' : 'scale(0)' }} src={selected} alt="" />
                                            </div> : ''}

                                            {contrastArr.right.selected ?
                                                <div className='fs14' style={{ left: 5, bottom: 5, position: 'absolute', color: '#5CDBD3', }}>
                                                    <i className='iconfont fs14' style={{ zIndex: 2, color: '#5CDBD3' }}>&#xe60e;</i> {t('selected')}
                                                </div>
                                                : ''}

                                            <img style={{width : '100%'}} src={history} alt="" /> 
                                        </div>
                                        <div className='playbackItemNameInfo' style={{ height: '16px' }}>
                                            {contrastArr.right.name}
                                        </div>
                                    </>
                                }
                            </div>
                        </div> */}
                    </div>

                    {/* <div className="playbackFunction">
                        {operateStatus != 'contrast' ? <> <div className='playbackButton cursor' onClick={() => {
                            setOperateStatus('contrast')
                        }}>对比</div>
                            <div className='playbackButton cursor' onClick={() => {
                                setUploadFileShow(true)
                            }}>csv导入</div> </> :
                            <> <div className='playbackButton cursor' onClick={() => {

                                const payload = {
                                    left: contrastArr.left.date,
                                    right: contrastArr.right.date,
                                }

                                axios({
                                    method: 'post',
                                    url: `${localAddress}/getContrastData`,
                                    params: buildFallbackParams(payload),
                                    data: payload,
                                }).then((res) => {
                                    // setDisplayStatus()
                                      setDisplay('contrast')
                                      useEquipStore.getState().setContrast(res.data.data)
                                      useEquipStore.getState().setDisplayType('back2D')
                                    // setDisplay
                                })

                            }}>对比</div>
                                <div className='playbackButton cursor' onClick={() => {
                                    setSelectArr([])
                                    setOperateStatus('')
                                    setContrast(contrastInitArr)
                                }}>取消</div> </>
                        }
                    </div> */}
                </div>

                    {/* ─── 下载路径区域 ─── */}
                    <div className="downloadPathSection" style={{
                        padding: '0.5rem 0.6rem',
                        borderTop: '1px solid #3E444C',
                        marginTop: 'auto',
                        flexShrink: 0,
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                            <span style={{ color: '#8794A1', fontSize: '0.75rem' }}>{t('storagePath')}</span>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <span className="cursor" style={{ color: '#0072EF', fontSize: '0.75rem' }} onClick={handleSelectFolder}>{t('modify')}</span>
                                <span className="cursor" style={{ color: '#0072EF', fontSize: '0.75rem' }} onClick={() => handleOpenFolder()}>{t('open')}</span>
                            </div>
                        </div>
                        <Input
                            size="small"
                            value={downloadPath}
                            onChange={(e) => setDownloadPath(e.target.value)}
                            onBlur={(e) => {
                                const val = e.target.value.trim()
                                if (val) {
                                    persistDownloadPath(val).catch(() => {})
                                }
                            }}
                            onPressEnter={(e) => {
                                const val = e.target.value.trim()
                                if (val) {
                                    persistDownloadPath(val, { showSuccess: true }).catch(() => {})
                                    return
                                    axios.post(`${localAddress}/setDownloadPath`, { path: val }).then((res) => {
                                        if (res.data?.code === 0) {
                                            setDownloadPath(val)
                                            message.success(t('pathUpdated'))
                                        }
                                    }).catch(() => {})
                                }
                            }}
                            style={{ backgroundColor: '#202327', border: '1px solid #4E565F', color: '#E6EBF0', fontSize: '0.7rem' }}
                            placeholder={t('inputPath') || '输入存储路径...'}
                        />
                    </div>
            </Drawer>

            {/* 旧的下载成功弹窗已替换为上方的下载进度 Modal */}

            <div className={`colAndHContent ${shouldShowPlaybackBar ? 'playbackDock' : 'collectDock'}`}>
                <div className='colAndHistory'>
                    {shouldShowPlaybackBar
                        ? <DataPlay dataLength={dataLength} name={currentName} onHistoryClick={close} />
                        : <ColControl getColHistory={getColHistory} onCollectEnd={handleCollectEnd} />}
                </div>
            </div>
        </>
    )
})

export default withTranslation('translation')(ColAndHistory)
