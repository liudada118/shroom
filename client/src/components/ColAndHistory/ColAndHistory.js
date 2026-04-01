import React, { memo, useContext, useEffect, useRef, useState } from 'react'
import Col from '../col/Col'
import './index.scss'
import Drawer from '../Drawer/Drawer'
import { Button, Checkbox, Input, message, Modal, Popover, Progress, Slider, Tabs } from 'antd'
import selected from '../../assets/image/select.png'
import history from '../../assets/image/history.png'
import axios from 'axios'
import DataPlay from './DataPlay'
import ColControl from './ColControlV2'
import { withTranslation } from 'react-i18next'
import { useDebounce } from '../../hooks/useDebounce'
import { useEquipStore } from '../../store/equipStore'
import { removeHistoryBox } from '../../assets/util/selectMatrix'
import { localAddress } from '../../util/constant'
import dayjs from 'dayjs'
import { pageContext } from '../../page/test/Test'

const arr = new Array(9).fill(0)

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

const ColAndHistory = memo((props) => {

    const pageInfo = useContext(pageContext);
    console.log('ViewSetting')
    const { setDisplay, display, setDisplayType, setOnRuler } = pageInfo

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

    const [colHistoryArr, setColHistoryArr] = useState()
    const [displayHistoryArr, setDisplayHistoryArr] = useState()
    const arr = localStorage.getItem('csvArr') ? JSON.parse(localStorage.getItem('csvArr')) : []
    const [localArr, setLocalArr] = useState(arr)

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

    const [colName, setColName] = useState('')
    const [HZ, setHZ] = useState('')

    const [changeColInfo, setChangeColInfo] = useState(false)



    const [uploadFileShow, setUploadFileShow] = useState(false)

    const [uploadLoading, setUploadLoading] = useState(false)

    const handleUpload = () => {
        if (!uploadFileRef.current) {
            message.info(t('selectDataFirst'))
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
                const newArr = [...localArr]
                newArr.push(filePath || fileName)
                setLocalArr(newArr)
                localStorage.setItem('csvArr', JSON.stringify(newArr))
                message.success(t('uploadSuccess') || 'Upload success')
                setUploadFileShow(false)
            } else {
                message.error(res.data?.message || t('downloadFailed'))
            }
        }).catch((err) => {
            message.error(err.message || t('downloadFailed'))
        }).finally(() => {
            setUploadLoading(false)
        })
    }

    const handleUploadCancel = () => {
        setUploadFileShow(false)
    }

    const getColHistory = () => {
        sethistoryDrawer(!historyDrawer)
        axios({
            method: 'get',
            url: `${localAddress}/getColHistory`,
        }).then((res) => {
            console.log(res.data.data)
            const arr = res.data.data.map((a) => {
                const obj = {}
                const date = a && a.date != null ? String(a.date) : ''
                const alias = a && a.alias != null ? String(a.alias) : ''
                obj.date = date
                obj.alias = alias
                obj.remark = a && a.remark != null ? a.remark : ''
                obj.name = alias || date
                obj.time = a ? a.timestamp : ''
                let parsedSelect = {}
                if (a && a.select) {
                    try {
                        parsedSelect = typeof a.select === 'string' ? JSON.parse(a.select) : a.select
                    } catch (e) {
                        parsedSelect = {}
                    }
                }
                obj.select = parsedSelect
                obj.selected = parsedSelect && Object.keys(parsedSelect).length > 0
                return obj
            })
            setColHistoryArr(arr)
            setDisplayHistoryArr(arr)
            console.log('历史执行')
            useEquipStore.getState().setStatus(new Array(4096).fill(0))
            useEquipStore.getState().setDisplayStatus(new Array(4096).fill(0))
        })
    }

    // 获取下载路径
    useEffect(() => {
        axios.get(`${localAddress}/getDownloadPath`).then((res) => {
            if (res.data?.code === 0) {
                setDownloadPath(res.data.data.path)
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

    const handleSelectFolder = async () => {
        // 优先使用 Electron 文件夹选择对话框
        if (window.electronAPI?.selectFolder) {
            const folder = await window.electronAPI.selectFolder()
            if (folder) {
                try {
                    const res = await axios.post(`${localAddress}/setDownloadPath`, { path: folder })
                    if (res.data?.code === 0) {
                        // 使用后端返回的实际路径更新输入框
                        const actualPath = res.data?.data?.path || folder
                        setDownloadPath(actualPath)
                        setIsEditingPath(false)
                        message.success(t('pathUpdated') || '路径已更新')
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

    const handleSavePath = () => {
        if (!editPathValue.trim()) return
        axios.post(`${localAddress}/setDownloadPath`, { path: editPathValue.trim() }).then((res) => {
            if (res.data?.code === 0) {
                setDownloadPath(editPathValue.trim())
                setIsEditingPath(false)
                message.success(t('pathUpdated'))
            } else {
                message.error(res.data?.message || t('downloadFailed'))
            }
        })
    }

    const handleOpenFolder = (folderPathOverride) => {
        const targetPath = folderPathOverride || downloadPath
        if (!targetPath) {
            message.warning(t('noPath') || '路径为空')
            return
        }
        // 优先使用 Electron API
        if (window.electronAPI?.openPath) {
            window.electronAPI.openPath(targetPath)
        } else {
            axios.post(`${localAddress}/openFolder`, { folderPath: targetPath }).then((res) => {
                if (res.data?.code !== 0) {
                    message.error(res.data?.message || '打开文件夹失败')
                }
            }).catch((err) => {
                console.error('Open folder error:', err)
                message.error('打开文件夹失败')
            })
        }
    }

    const handleOpenFile = (filePath) => {
        if (!filePath) return
        if (window.electronAPI?.openPath) {
            window.electronAPI.openPath(filePath)
        } else {
            axios.post(`${localAddress}/openFile`, { filePath }).then((res) => {
                if (res.data?.code !== 0) {
                    // 如果打开文件失败，尝试打开所在文件夹
                    const folderPath = filePath.replace(/[\\/][^\\/]+$/, '')
                    if (folderPath && folderPath !== filePath) {
                        handleOpenFolder(folderPath)
                    } else {
                        message.error(res.data?.message || '打开文件失败')
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
        setShowDownloadPathModal(true)
    }

    // 确认下载：关闭路径对话框，显示进度弹窗，执行下载
    const confirmDownload = () => {
        const selectedFiles = Array.isArray(selectArr)
            ? selectArr.map((item) => item == null ? '' : String(item).trim()).filter(Boolean)
            : []

        if (!selectedFiles.length) {
            setShowDownloadPathModal(false)
            message.info(t('selectDataFirst'))
            return
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

        axios({
            method: 'post',
            url: `${localAddress}/downlaod`,
            params: {
                fileArr: JSON.stringify(selectedFiles),
            },

            data: {
                fileArr: selectedFiles,
            }
        }).then((res) => {
            clearInterval(progressTimer)
            console.log(res)
            const result = res.data || {}
            if (result.code !== 0) {
                setDownloadProgress({ percent: 100, status: 'error', files: [] })
                message.error(getApiErrorMessage(result, t('downloadFailed')))
                setTimeout(() => setDownloadProgress(null), 2000)
            } else {
                // 提取所有文件路径
                const results = Array.isArray(result.data) ? result.data : []
                const downloadedFiles = []
                if (Array.isArray(results)) {
                    for (const item of results) {
                        if (item && typeof item === 'object') {
                            const keys = Object.keys(item)
                            for (const key of keys) {
                                if (key === 'filePath' && item[key]) {
                                    downloadedFiles.push({
                                        filePath: item[key],
                                        fileName: item[key].split('/').pop().split('\\').pop()
                                    })
                                }
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
            axios({
                method: 'post',
                url: `${localAddress}/delete`,
                data: {
                    fileArr: selectArr,
                }
            }).then((res) => {
                // console.log(res)
                let resArr = [...colHistoryArr]
                resArr = resArr.filter((a) => !selectArr.includes(a.date))
                setColHistoryArr(resArr)
                setDisplayHistoryArr(resArr)
                message.success(t('deleteSuccess'))
                setSelectArr([])
            }).catch((err) => {
                message.error(t('deleteFailed'))

            })
        } else {
            let res = [...localArr]
            res = res.filter((a) => !selectArr.includes(a))
            setLocalArr(res)
            localStorage.setItem('csvArr', JSON.stringify(res))
            // res
        }

    }


    const [fileName, setFileName] = useState('')
    const uploadFileRef = useRef(null)

    const fileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            uploadFileRef.current = file
            setFileName(file.name)
        }
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
        useEquipStore.getState().setHistoryChart({ pressArr: {}, areaArr: {} })
        useEquipStore.getState().setDataStatus('realtime')
        setCurrentName('')
        setCurrentPlaybackKey('')
        setOperateStatus('')
        //  const history = useEquipStore.getState().history
        useEquipStore.getState().setHistoryStatus({
            index: 0,
            timestamp: '',
        })
    }

    const [clientXY, setClientXY] = useState({ x: 0, y: 0 })
    const [rightClickFlag, setRightClickFlag] = useState(false)
    const [rightClickItem, setRightClickItem] = useState(null)

    const [searchInfo, setSearchInfo] = useState('')
    const debouncedValue = useDebounce(searchInfo, 300)

    useEffect(() => {
        // const user = 
        console.log(debouncedValue)
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

    const selectDataArrType = ['delete', 'download', 'contrast']


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
            >
                <input type="file" accept=".csv" onChange={(e) => { fileChange(e) }} id="file" />
                {fileName && <div style={{ marginTop: '8px', color: '#8794A1', fontSize: '0.8rem' }}>{fileName}</div>}
            </Modal>

            {/* ─── 下载路径选择对话框 ─── */}
            <Modal
                title={t('downloadPathSelect') || '下载路径选择'}
                open={showDownloadPathModal}
                onOk={confirmDownload}
                onCancel={() => setShowDownloadPathModal(false)}
                okText={t('startDownload') || '开始下载'}
                cancelText={t('cancel')}
                width={480}
            >
                <div style={{ marginBottom: '12px', color: '#666', fontSize: '0.85rem' }}>
                    {t('downloadPathHint') || '请确认或修改下载保存路径：'}
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <Input
                        value={downloadPath}
                        onChange={(e) => setDownloadPath(e.target.value)}
                        onBlur={(e) => {
                            const val = e.target.value.trim()
                            if (val) {
                                axios.post(`${localAddress}/setDownloadPath`, { path: val }).catch(() => {})
                            }
                        }}
                        style={{ flex: 1 }}
                        placeholder={t('inputPath') || '输入存储路径...'}
                    />
                    <Button onClick={handleSelectFolder}>{t('browse') || '浏览'}</Button>
                    <Button onClick={() => handleOpenFolder()}>{t('open')}</Button>
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
                        setSelectArr([])
                        setOperateStatus('')
                    }}>{t('openFolder') || '打开文件夹'}</Button>,
                    <Button key="close" onClick={() => {
                        setDownloadProgress(null)
                        setSelectArr([])
                        setOperateStatus('')
                    }}>{t('close') || '关闭'}</Button>
                ] : downloadProgress?.status === 'error' ? [
                    <Button key="close" onClick={() => setDownloadProgress(null)}>{t('close') || '关闭'}</Button>
                ] : []}
                closable={downloadProgress?.status !== 'downloading'}
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
                            <div
                                className="cursor"
                                style={{ marginTop: '8px', color: '#1890ff', fontSize: '0.8rem', textDecoration: 'underline' }}
                                onClick={() => handleOpenFolder()}
                            >
                                {t('openDownloadFolder') || '打开下载文件夹'}: {downloadPath}
                            </div>
                        </div>
                    )}
                </div>
            </Modal>

            <Drawer zindex={2} title={t('history')} show={historyDrawer} setShow={sethistoryDrawer} close={close} >
                <Input
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
                                    <div onClick={() => {
                                        setIndex(index)
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
                                </Popover></> :
                                <>
                                    {
                                        operateStatus == 'delete' ? <div className='modalConfirmButton cursor' onClick={deleteData}>{t('delete')}</div> :
                                            operateStatus == 'download' ? <div className='modalConfirmButton cursor' onClick={download}>{t('download')}</div> : ''
                                    }

                                    <div className='modalConfirmButton cursor' onClick={() => {
                                        setSelectArr([])
                                        setOperateStatus('')
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
                                </Popover></> :
                                <>
                                    {
                                        operateStatus == 'delete' ? <div className='modalConfirmButton cursor' onClick={deleteData}>{t('delete')}</div> : ''
                                    }
                                    <div className='modalConfirmButton cursor' onClick={() => {
                                        setSelectArr([])
                                        setOperateStatus('')
                                    }}>{t('cancel')}</div>
                                </>
                            ) : null}
                        </div>
                    </div>

                    <div className="playbackItemContent">
                        <div className="playbackItems">
                            {
                                Onindex == 0 && displayHistoryArr ? displayHistoryArr.map((dbInfo, index) => {
                                    const historyItemKey = getHistoryItemKey(dbInfo)

                                    return (
                                        <div key={historyItemKey || `history-${index}`} className={`playbackItem cursor ${currentPlaybackKey === historyItemKey ? 'playbackItemActive' : ''}`}

                                            onClick={() => {
                                                if (operateStatus == 'contrast') {
                                                    const obj = { ...contrastArr }

                                                    if (!Object.keys(obj.left).length || obj.left.date == dbInfo.date) {

                                                        let arr = [...selectArr]
                                                        if (arr.includes(dbInfo.date)) {
                                                            arr = arr.filter((b) => b != dbInfo.date)
                                                            obj.left = {}
                                                        } else {
                                                            arr.push(dbInfo.date)
                                                            obj.left = dbInfo
                                                        }
                                                        console.log(arr)
                                                        setSelectArr(arr)

                                                    } else {
                                                        if (!Object.keys(obj.right).length || obj.right.date == dbInfo.date) {

                                                            let arr = [...selectArr]
                                                            if (arr.includes(dbInfo.date)) {
                                                                arr = arr.filter((b) => b != dbInfo.date)
                                                                obj.right = {}
                                                            } else {
                                                                arr.push(dbInfo.date)
                                                                obj.right = dbInfo
                                                            }
                                                            setSelectArr(arr)
                                                        } else {
                                                            message.info(t('twoGroupsSelected'))
                                                        }
                                                    }
                                                    console.log(obj)
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
                                                        console.log(res)
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



                                                {dbInfo.selected ?
                                                    <div className='fs14' style={{ left: 5, bottom: 5, position: 'absolute', color: '#5CDBD3', }}>
                                                        <i className='iconfont fs14' style={{ zIndex: 2, color: '#5CDBD3' }}>&#xe60e;</i> {t('selected')}
                                                    </div>
                                                    : ''}

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
                                }) : Onindex == 1 && localArr ? localArr.map((a, index) => {
                                    const localItemKey = getLocalItemKey(a)
                                    return (
                                        <div key={localItemKey || `local-${index}`} className={`playbackItem cursor ${currentPlaybackKey === localItemKey ? 'playbackItemActive' : ''}`} onClick={() => {
                                            if (selectDataArrType.includes(operateStatus)) {
                                                let arr = [...selectArr]
                                                if (arr.includes(a)) {
                                                    arr = arr.filter((b) => b != a)
                                                } else {
                                                    arr.push(a)
                                                }
                                                setSelectArr(arr)
                                            } else {
                                                axios({
                                                    method: 'post',
                                                    url: `${localAddress}/getCsvData`,
                                                    data: {
                                                        fileName: a,
                                                    }
                                                }).then((res) => {
                                                    setCurrentName(a)
                                                    setCurrentPlaybackKey(localItemKey)
                                                    console.log(res)
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
                                console.log('click setUploadFileShow')
                                setUploadFileShow(true)
                            }}>csv导入</div> </> :
                            <> <div className='playbackButton cursor' onClick={() => {

                                axios({
                                    method: 'post',
                                    url: `${localAddress}/getContrastData`,
                                    data: {
                                        left: contrastArr.left.date,
                                        right: contrastArr.right.date,
                                    }
                                }).then((res) => {
                                    console.log(res)
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
                                <span className="cursor" style={{ color: '#0072EF', fontSize: '0.75rem' }} onClick={handleOpenFolder}>{t('open')}</span>
                            </div>
                        </div>
                        <Input
                            size="small"
                            value={downloadPath}
                            onChange={(e) => setDownloadPath(e.target.value)}
                            onBlur={(e) => {
                                const val = e.target.value.trim()
                                if (val) {
                                    axios.post(`${localAddress}/setDownloadPath`, { path: val }).then((res) => {
                                        if (res.data?.code === 0) {
                                            setDownloadPath(val)
                                        }
                                    }).catch(() => {})
                                }
                            }}
                            onPressEnter={(e) => {
                                const val = e.target.value.trim()
                                if (val) {
                                    axios.post(`${localAddress}/setDownloadPath`, { path: val }).then((res) => {
                                        if (res.data?.code === 0) {
                                            setDownloadPath(val)
                                            message.success(t('pathUpdated') || '路径已更新')
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

            <div className='colAndHContent'>
                <div className='colAndHistory'>
                    {
                        !historyDrawer ?
                            <ColControl getColHistory={getColHistory} />
                            : display != 'contrast' ? <DataPlay dataLength={dataLength} name={currentName} /> : ''
                    }
                </div>
            </div>
        </>
    )
})

export default withTranslation('translation')(ColAndHistory)
