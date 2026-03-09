import React, { memo, useContext, useEffect, useRef, useState } from 'react'
import Col from '../col/Col'
import './index.scss'
import Drawer from '../Drawer/Drawer'
import { Button, Checkbox, Input, message, Modal, Popover, Slider, Tabs } from 'antd'
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

    const handleUpload = () => {
        setUploadFileShow(false)
        const res = [...localArr]
        res.push(fileName)
        setLocalArr(res)
        localStorage.setItem('csvArr', JSON.stringify(res))
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
                axios.post(`${localAddress}/setDownloadPath`, { path: folder }).then((res) => {
                    if (res.data?.code === 0) {
                        setDownloadPath(folder)
                        setIsEditingPath(false)
                        message.success('下载路径已更新')
                    }
                })
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
                message.success('下载路径已更新')
            } else {
                message.error(res.data?.message || '设置失败')
            }
        })
    }

    const handleOpenFolder = () => {
        if (!downloadPath) return
        // 优先使用 Electron API
        if (window.electronAPI?.openPath) {
            window.electronAPI.openPath(downloadPath)
        } else {
            axios.post(`${localAddress}/openFolder`, { folderPath: downloadPath })
        }
    }

    const handleOpenFile = (filePath) => {
        if (!filePath) return
        if (window.electronAPI?.openPath) {
            window.electronAPI.openPath(filePath)
        } else {
            axios.post(`${localAddress}/openFile`, { filePath })
        }
    }

    const download = () => {
        console.log(operateStatus, selectArr)
        axios({
            method: 'post',
            url: `${localAddress}/downlaod`,
            data: {
                fileArr: selectArr,
            }
        }).then((res) => {
            console.log(res)
            if (res.data.message == 'error') {
                message.info(res.data.data)
            } else {
                // 提取文件路径
                const results = res.data.data
                let lastFilePath = ''
                let lastFileName = ''
                if (Array.isArray(results)) {
                    for (const item of results) {
                        if (item && typeof item === 'object') {
                            const keys = Object.keys(item)
                            for (const key of keys) {
                                if (key === 'filePath' && item[key]) {
                                    lastFilePath = item[key]
                                    lastFileName = item[key].split('/').pop().split('\\').pop()
                                }
                            }
                        }
                    }
                }
                // 显示下载成功弹窗
                setDownloadToast({
                    fileName: lastFileName || '文件',
                    filePath: lastFilePath
                })
            }
        }).catch((err) => {
            message.error('下载失败')
        })
    }

    const deleteData = () => {

        if (!selectArr.length) {
            message.info('请先选择数据')
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
                message.success('删除成功')
                setSelectArr([])
            }).catch((err) => {
                message.error('删除失败')

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

    const fileChange = (e) => {
        const file = e.target.files[0];
        const filePath = window.electronAPI?.getPath?.(file); // 可选链防报错
        console.log('文件路径:', filePath);
        setFileName(filePath)
    }


    const [dataLength, setDataLength] = useState(10)
    const [currentName, setCurrentName] = useState()

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
                    备注: <Input.TextArea value={changedRemark} maxLength={400} autoSize={{ minRows: 3, maxRows: 6 }} onChange={(e) => { setChangedRemark(e.target.value) }} />
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
                    修改信息
                </div>
            </div> : ''}

            <Modal
                title="上传文件"
                closable={{ 'aria-label': 'Custom Close Button' }}
                open={uploadFileShow}
                onOk={handleUpload}
                onCancel={handleUploadCancel}
            >
                <input type="file" onChange={(e) => { fileChange(e) }} id="file" />
            </Modal>

            <Drawer zindex={2} title={t('history')} show={historyDrawer} setShow={sethistoryDrawer} close={close} >
                <Input
                    style={{ backgroundColor: '#202327', border: 0, color: "#E6EBF0", marginBottom: '1.5rem' }}
                    placeholder="搜索..."
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


                            {operateStatus == '' ? <>
                                <Popover className='navItempop' overlayClassName="navItempop" color='#32373E' placement="bottom" content={'删除'}>
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

                                <Popover className='navItempop' overlayClassName="navItempop" color='#32373E' placement="bottom" content={'下载'}>
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
                                    }}>{t('取消')}</div>
                                </>
                            }
                        </div>
                    </div>

                    <div className="playbackItemContent">
                        <div className="playbackItems">
                            {
                                Onindex == 0 && displayHistoryArr ? displayHistoryArr.map((dbInfo, index) => {

                                    return (
                                        <div className="playbackItem cursor"

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
                                                            message.info('已经选择两组数据')
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
                                                    axios({
                                                        method: 'post',
                                                        url: `${localAddress}/getDbHistory`,
                                                        data: {
                                                            time: dbInfo.date,
                                                        }
                                                    }).then((res) => {
                                                        console.log(res)
                                                        setCurrentName(dbInfo.name)
                                                        if (res.status == 200) {
                                                            const { length, areaArr, pressArr } = res.data.data
                                                            useEquipStore.getState().setDataStatus('replay')
                                                            setDataLength(length)
                                                            if (areaArr || pressArr) {
                                                                useEquipStore.getState().setHistoryChart({
                                                                    areaArr: areaArr || {},
                                                                    pressArr: pressArr || {}
                                                                })
                                                            }
                                                            useEquipStore.getState().setStatus(new Array(4096).fill(0))
                                                            useEquipStore.getState().setDisplayStatus(new Array(4096).fill(0))
                                                        }
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
                                                        <i className='iconfont fs14' style={{ zIndex: 2, color: '#5CDBD3' }}>&#xe60e;</i> 框选
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
                                    return (
                                        <div className="playbackItem cursor" onClick={() => {
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
                                                    <i className='iconfont fs14' style={{ zIndex: 2, color: '#5CDBD3' }}>&#xe60e;</i> 框选
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
                                                    <i className='iconfont fs14' style={{ zIndex: 2, color: '#5CDBD3' }}>&#xe60e;</i> 框选
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
                        padding: '0.75rem 1rem',
                        borderTop: '1px solid #3E444C',
                        marginTop: 'auto',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                            <span style={{ color: '#8794A1', fontSize: '0.75rem' }}>存储路径</span>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <span className="cursor" style={{ color: '#0072EF', fontSize: '0.75rem' }} onClick={handleSelectFolder}>修改</span>
                                <span className="cursor" style={{ color: '#0072EF', fontSize: '0.75rem' }} onClick={handleOpenFolder}>打开</span>
                            </div>
                        </div>
                        {isEditingPath ? (
                            <div style={{ display: 'flex', gap: '0.4rem' }}>
                                <Input
                                    size="small"
                                    value={editPathValue}
                                    onChange={(e) => setEditPathValue(e.target.value)}
                                    style={{ flex: 1, backgroundColor: '#202327', border: '1px solid #4E565F', color: '#E6EBF0', fontSize: '0.7rem' }}
                                    onPressEnter={handleSavePath}
                                />
                                <span className="cursor" style={{ color: '#0072EF', fontSize: '0.75rem', lineHeight: '24px' }} onClick={handleSavePath}>保存</span>
                                <span className="cursor" style={{ color: '#8794A1', fontSize: '0.75rem', lineHeight: '24px' }} onClick={() => setIsEditingPath(false)}>取消</span>
                            </div>
                        ) : (
                            <div
                                className="cursor"
                                onClick={handleOpenFolder}
                                title={downloadPath}
                                style={{
                                    color: '#B4C0CA',
                                    fontSize: '0.7rem',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    padding: '0.25rem 0.4rem',
                                    backgroundColor: '#202327',
                                    borderRadius: '4px',
                                    border: '1px solid #3E444C',
                                }}
                            >
                                {downloadPath || '未设置'}
                            </div>
                        )}
                    </div>
            </Drawer>

            {/* ─── 下载成功弹窗 ─── */}
            {downloadToast && (
                <div
                    className="cursor"
                    onClick={() => {
                        handleOpenFile(downloadToast.filePath)
                        setDownloadToast(null)
                    }}
                    style={{
                        position: 'fixed',
                        top: '4.5rem',
                        right: '1.5rem',
                        zIndex: 9999,
                        backgroundColor: '#1B5E20',
                        color: '#E6EBF0',
                        padding: '0.75rem 1.25rem',
                        borderRadius: '8px',
                        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.6rem',
                        maxWidth: '22rem',
                        animation: 'slideInRight 0.3s ease-out',
                    }}
                >
                    <i className='iconfont' style={{ color: '#4CAF50', fontSize: '1.2rem' }}>&#xe60e;</i>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 'bold', marginBottom: '0.15rem' }}>下载成功</div>
                        <div style={{ fontSize: '0.7rem', color: '#A5D6A7', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            点击打开: {downloadToast.fileName}
                        </div>
                    </div>
                    <span
                        onClick={(e) => { e.stopPropagation(); setDownloadToast(null) }}
                        style={{ color: '#81C784', fontSize: '1rem', marginLeft: '0.5rem' }}
                    >×</span>
                </div>
            )}

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
