import React, { useRef, useState } from 'react'
import { Button, Input, Modal } from 'antd'
import Col from '../col/Col'
import { withTranslation } from 'react-i18next'

const COL_NAME_MAX_LENGTH = 50
const COL_REMARK_MAX_LENGTH = 200
const limitText = (value, maxLength) => String(value || '').slice(0, maxLength)

function ColControl(props) {
    const { t, i18n, getColHistory, onCollectEnd } = props
    const isEnglish = String(i18n.language || localStorage.getItem('language') || '').toLowerCase().startsWith('en')
    const text = (zh, en) => (isEnglish ? en : zh)

    const [colName, setColName] = useState('')
    const [HZ] = useState('')
    const [remark, setRemark] = useState('')
    const [startTime, setStartTime] = useState(0)
    const [col, setCol] = useState(false)

    const pendingStartRef = useRef(null)
    const [collectModalOpen, setCollectModalOpen] = useState(false)
    const [collectModalName, setCollectModalName] = useState('')
    const [collectRemark, setCollectRemark] = useState('')

    const openCollectModal = (startCollect) => {
        pendingStartRef.current = startCollect
        setCollectModalName('')
        setCollectRemark('')
        setCollectModalOpen(true)
    }

    const closeCollectModal = () => {
        setCollectModalOpen(false)
        pendingStartRef.current = null
    }

    const confirmCollect = () => {
        const name = limitText(collectModalName, COL_NAME_MAX_LENGTH).trim()
        const remarkText = limitText(collectRemark, COL_REMARK_MAX_LENGTH).trim()

        const startCollect = pendingStartRef.current
        setColName(name)
        setRemark(remarkText)
        closeCollectModal()
        startCollect?.({
            colName: name,
            remark: remarkText,
            HZ,
        })
    }

    const displayName = colName || t('untitled')

    return (
        <div className="collectTopControl">
            <div className="colInfo fs14">
                <div className="colNameDisplay" title={displayName}>
                    {t('filename')}: {displayName}
                </div>
            </div>
            <Col
                className={`collectTopButton collectStartButton ${col ? 'collecting' : ''}`}
                startTime={startTime}
                setStartTime={setStartTime}
                colName={colName}
                remark={remark}
                HZ={HZ}
                col={col}
                setCol={setCol}
                onBeforeStart={openCollectModal}
                onCollectEnd={onCollectEnd}
            >
                <span className="collectTopButtonText">
                    {/* 采集中只显示「结束采集」：原来这里放计时，某个部位没连上时会被
                        「XX已断开」顶掉，反而看不出再点一下就是结束 */}
                    {!col ? text('开始采集', 'Start') : text('结束采集', 'Stop')}
                </span>
            </Col>
            <div className="collectTopButton historyTopButton" onClick={() => {
                    getColHistory()
                }}>
                <i className="iconfont">&#xe624;</i>
                <span>{t('history')}</span>
            </div>
            <Modal
                className="collectInfoModal"
                centered
                destroyOnClose
                footer={[
                    <Button key="cancel" className="collectInfoCancelButton" onClick={closeCollectModal}>
                        {text('取消', 'Cancel')}
                    </Button>,
                    <Button key="start" type="primary" className="collectInfoStartButton" onClick={confirmCollect}>
                        {text('开始采集', 'Start')}
                    </Button>,
                ]}
                onCancel={closeCollectModal}
                open={collectModalOpen}
                title={text('采集信息', 'Collection Info')}
                width={560}
            >
                <div className="collectInfoForm">
                    <div className="collectInfoItem">
                        <label>
                            {text('数据名称', 'Data Name')}
                        </label>
                        <Input
                            value={collectModalName}
                            maxLength={COL_NAME_MAX_LENGTH}
                            showCount
                            placeholder={text('请输入数据名称（选填）', 'Enter data name (optional)')}
                            onChange={(e) => { setCollectModalName(limitText(e.target.value, COL_NAME_MAX_LENGTH)) }}
                        />
                    </div>
                    <div className="collectInfoItem collectInfoRemarkItem">
                        <label>{text('备注', 'Remark')}</label>
                        <Input.TextArea
                            value={collectRemark}
                            maxLength={COL_REMARK_MAX_LENGTH}
                            showCount
                            placeholder={text('请输入备注（选填）', 'Enter remark (optional)')}
                            onChange={(e) => { setCollectRemark(limitText(e.target.value, COL_REMARK_MAX_LENGTH)) }}
                        />
                    </div>
                </div>
            </Modal>
        </div>
    )
}

export default withTranslation('translation')(ColControl)
