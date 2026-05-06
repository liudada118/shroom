import React, { useState } from 'react'
import { Input } from 'antd'
import Col from '../col/Col'
import ColTime from './ColTime'
import { withTranslation } from 'react-i18next'

const COL_NAME_MAX_LENGTH = 20
const COL_REMARK_MAX_LENGTH = 100
const limitText = (value, maxLength) => String(value || '').slice(0, maxLength)

function ColControl(props) {
    const { t, getColHistory } = props
    const [colName, setColName] = useState('')
    const [HZ, setHZ] = useState('')
    const [remark, setRemark] = useState('')

    const [modalName, setModalName] = useState('')
    const [modalHZ, setModalHZ] = useState('')
    const [modalRemark, setModalRemark] = useState('')

    const [changeColInfo, setChangeColInfo] = useState(false)
    const [startTime, setStartTime] = useState(0)
    const [col, setCol] = useState(false)

    const displayName = colName || t('untitled')

    return (
        <div style={{ display: 'flex', zIndex: 20, alignItems: 'center', flexDirection: 'column', position: 'relative', padding: '0.625rem 0', minWidth: '17.5rem', background: 'rgba(23,25,28 , 0.5)', borderRadius: 10 }}>
            <div className="colInfo fs14">
                <div className="colNameDisplay" title={displayName}>
                    {t('filename')}: {displayName}
                </div>

                <div className="changeColInfo">
                    {
                        changeColInfo ? <> <div className="changeColInfoModal">
                            <div className="changeColInfoModalTitle">
                                <div className="titleInfo fs18">{t('collectSettings')}</div>
                                <i className="iconfont cursor" onClick={() => { setChangeColInfo(false) }}>&#xe625;</i>
                            </div>
                            <div>
                                <div className="colChangeItem fs14" style={{ marginBottom: '18px' }}>
                                    <div style={{ width: '5rem' }}>{t('filename')}</div>
                                    <Input
                                        value={modalName}
                                        maxLength={COL_NAME_MAX_LENGTH}
                                        showCount
                                        onChange={(e) => { setModalName(limitText(e.target.value, COL_NAME_MAX_LENGTH)) }}
                                    />
                                </div>
                                <div className="colChangeItem fs14" style={{ marginBottom: '18px' }}>
                                    <div style={{ width: '5rem' }}>{t('remark')}</div>
                                    <Input.TextArea
                                        value={modalRemark}
                                        maxLength={COL_REMARK_MAX_LENGTH}
                                        showCount
                                        autoSize={{ minRows: 3, maxRows: 4 }}
                                        onChange={(e) => { setModalRemark(limitText(e.target.value, COL_REMARK_MAX_LENGTH)) }}
                                    />
                                </div>
                            </div>
                            <div className="changeColInfoModalButton">
                                <div className="modalCancalButton cursor fs14" onClick={() => { setChangeColInfo(false) }}>{t('cancel')}</div>
                                <div className="modalConfirmButton cursor fs14" onClick={() => {
                                    setChangeColInfo(false)
                                    setHZ(modalHZ)
                                    setColName(limitText(modalName, COL_NAME_MAX_LENGTH).trim())
                                    setRemark(limitText(modalRemark, COL_REMARK_MAX_LENGTH).trim())
                                }}>{t('ok')}</div>
                            </div>

                        </div>  <div className="changeColInfoModalTriang"></div> </> : ''
                    }
                    <i
                        onClick={() => {
                            setChangeColInfo(!changeColInfo)
                            setModalHZ(HZ)
                            setModalName(limitText(colName, COL_NAME_MAX_LENGTH))
                            setModalRemark(limitText(remark, COL_REMARK_MAX_LENGTH))
                        }}
                        className="iconfont cursor"
                        style={{ color: '#0072EF' }}
                    >
                        &#xe623;
                    </i>
                </div>
            </div>
            <div className="colButton">
                <Col startTime={startTime} setStartTime={setStartTime} colName={colName} remark={remark} HZ={HZ} col={col} setCol={setCol} />
            </div>
            <div className="colTimeAndHistory">
                <div className="colTime fs16">
                    {!col ? t('dataCollect') : startTime === 0 ? '00:00:00' : <ColTime startTime={startTime} />}
                </div>
                <div className="historyButton cursor fs14" style={{ right: '0.75rem', color: '#0072EF' }} onClick={() => {
                    getColHistory()
                }}>
                    <i className="iconfont" style={{ color: '#0072EF' }}>&#xe624;</i>{t('history')}
                </div>
            </div>
        </div>
    )
}

export default withTranslation('translation')(ColControl)
