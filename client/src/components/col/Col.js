import React, { useContext } from 'react'
import './index.scss'
import axios from 'axios'
import { message } from 'antd'
import { useEquipStore } from '../../store/equipStore'
import { localAddress } from '../../util/constant'
import { buildFallbackParams } from '../../util/request'
import { pageContext } from '../../page/test/Test'
import { useTranslation } from 'react-i18next'

export default function Col(props) {
    const { t } = useTranslation()
    const { colName, remark, HZ, setStartTime, col, setCol, className = '', children, onBeforeStart } = props
    const pageInfo = useContext(pageContext)

    const getCurrentDataDirection = () => {
        const current = pageInfo?.dataDirection?.current
        return current && typeof current === 'object'
            ? current
            : { left: true, up: true, rotateDegree: 0 }
    }

    const startCollect = (collectInfo = {}) => {
            const startStamp = Date.now()
            const fileName = startStamp
            const currentColName = collectInfo.colName ?? colName
            const currentRemark = collectInfo.remark ?? remark
            const currentHZ = collectInfo.HZ ?? HZ
            const hz = currentHZ ? currentHZ : 30
            const startPayload = {
                fileName: fileName,
                HZ: hz,
                dataDirection: getCurrentDataDirection(),
            }

            axios({
                method: 'post',
                url: `${localAddress}/startCol`,
                params: buildFallbackParams(startPayload),
                data: startPayload
            }).then((res) => {

                if (res.data.message == 'error') {
                    useEquipStore.getState().setCollecting(false)
                    const errorTextMap = {
                        'Please select correct sensor type': t('selectCorrectSensorType'),
                    }
                    message.error(errorTextMap[res.data.data] || res.data.data)
                } else {
                    message.success(t('collectStart'))
                    setCol(!col)
                    setStartTime(startStamp)
                    useEquipStore.getState().setCollecting(true)

                    // 始终调用 upsertRemark 保存框选数据（即使没有 alias 和 remark）
                    const alias = currentColName ? currentColName.trim() : ''
                    const remarkText = currentRemark ? currentRemark.trim().slice(0, 400) : ''

                    const remarkData = {
                        date: String(startStamp),
                    }
                    if (alias) remarkData.alias = alias
                    if (remarkText) remarkData.remark = remarkText

                    // 只要有任何需要保存的信息就调用
                    if (alias || remarkText) {
                        axios({
                            method: 'post',
                            url: `${localAddress}/upsertRemark`,
                            params: {
                                date: remarkData.date,
                                alias: remarkData.alias,
                                remark: remarkData.remark,
                            },
                            data: remarkData
                        }).then((remarkRes) => {
                            if (remarkRes.data?.message == 'error') {
                                message.error(remarkRes.data.data)
                            }
                        }).catch((err) => {
                            console.error('[Col] upsertRemark failed:', err)
                            message.error('upsertRemark failed')
                        })
                    }
                }

            }).catch((err) => {
                console.error('[Col] startCol failed:', err)
                useEquipStore.getState().setCollecting(false)
                message.error(t('collectFailed'))
            })
    }

    const colButtonClick = () => {
        if (!col) {
            if (onBeforeStart) {
                onBeforeStart(startCollect)
                return
            }
            startCollect()
        } else {
            axios({
                method: 'get',
                url: `${localAddress}/endCol`,
            }).then((res) => {
                if (res.data.message == 'error') {
                    message.error(res.data.data)
                } else {
                    message.success(t('collectSuccess'))
                    setCol(!col)
                    useEquipStore.getState().setCollecting(false)
                }
            })
            setStartTime(0)
            setCol(!col)
            useEquipStore.getState().setCollecting(false)
        }
    }

    return (
        <div className={`colContent ${className}`} onClick={colButtonClick}>
            <div className={`${col ? "colIngIcon" : 'colInitIcon'} colIcon`}></div>
            {children}
        </div>
    )
}
