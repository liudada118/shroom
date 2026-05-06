import React, { useState } from 'react'
import './index.scss'
import axios from 'axios'
import { message } from 'antd'
import { getDisplayType, getSelectArr, getSysType, useEquipStore } from '../../store/equipStore'
import { shallow } from 'zustand/shallow'
import { systemPointConfig, localAddress } from '../../util/constant'
import { colSelectMatrix } from '../../util/util'
import { isMoreMatrix } from '../../assets/util/util'
import { useTranslation } from 'react-i18next'

const COL_NAME_MAX_LENGTH = 20
const COL_REMARK_MAX_LENGTH = 100

export default function Col(props) {
    const { t } = useTranslation()
    const { colName, remark, HZ, setStartTime, col, setCol } = props

    const colButtonClick = () => {
        const select = useEquipStore.getState().selectArr;
        const system = getSysType()
        const displayType = getDisplayType()
        const selectObj = {}

        if (select.length && select[0]) {
            // 去掉DOM引用，只保留坐标数据
            const range = { x1: select[0].x1, y1: select[0].y1, x2: select[0].x2, y2: select[0].y2 }

            if (isMoreMatrix(system)) {
                // 多矩阵系统（如 carY）：根据 displayType 决定保存哪个
                if (displayType === 'all' || displayType.includes('back')) {
                    try {
                        const matrix = colSelectMatrix('canvasThree', range, systemPointConfig[`${system}-back`])
                        if (matrix) {
                            matrix.width = systemPointConfig[`${system}-back`].width
                            matrix.height = systemPointConfig[`${system}-back`].height
                            selectObj[`${system}-back`] = matrix
                        }
                    } catch (e) {
                        console.warn('[Col] Failed to compute back select matrix:', e.message)
                    }
                }
                if (displayType === 'all' || displayType.includes('sit')) {
                    try {
                        const matrix = colSelectMatrix('canvasThree', range, systemPointConfig[`${system}-sit`])
                        if (matrix) {
                            matrix.width = systemPointConfig[`${system}-sit`].width
                            matrix.height = systemPointConfig[`${system}-sit`].height
                            selectObj[`${system}-sit`] = matrix
                        }
                    } catch (e) {
                        console.warn('[Col] Failed to compute sit select matrix:', e.message)
                    }
                }
            } else {
                // 单矩阵系统
                try {
                    const matrix = colSelectMatrix('canvasThree', range, systemPointConfig[system])
                    if (matrix) {
                        matrix.width = systemPointConfig[system].width
                        matrix.height = systemPointConfig[system].height
                        selectObj[system] = matrix
                    }
                } catch (e) {
                    console.warn('[Col] Failed to compute select matrix:', e.message)
                }
            }
        }

        console.log('[Col] selectObj:', selectObj)

        if (!col) {
            const startStamp = Date.now()
            const fileName = startStamp
            const hz = HZ ? HZ : 30
            const hasSelect = Object.keys(selectObj).length > 0

            axios({
                method: 'post',
                url: `${localAddress}/startCol`,
                params: {
                    fileName: String(fileName),
                    HZ: hz,
                    select: hasSelect ? JSON.stringify(selectObj) : undefined,
                },
                data: {
                    fileName: fileName,
                    HZ: hz,
                    select: hasSelect ? selectObj : undefined,
                }
            }).then((res) => {

                if (res.data.message == 'error') {
                    message.error(res.data.data)
                } else {
                    message.success(t('collectStart'))
                    setCol(!col)
                    setStartTime(startStamp)

                    // 始终调用 upsertRemark 保存框选数据（即使没有 alias 和 remark）
                    const alias = colName ? colName.trim().slice(0, COL_NAME_MAX_LENGTH) : ''
                    const remarkText = remark ? remark.trim().slice(0, COL_REMARK_MAX_LENGTH) : ''

                    const remarkData = {
                        date: String(startStamp),
                    }
                    if (alias) remarkData.alias = alias
                    if (remarkText) remarkData.remark = remarkText
                    if (hasSelect) remarkData.select = selectObj

                    // 只要有任何需要保存的信息就调用
                    if (alias || remarkText || hasSelect) {
                        axios({
                            method: 'post',
                            url: `${localAddress}/upsertRemark`,
                            params: {
                                date: remarkData.date,
                                alias: remarkData.alias,
                                remark: remarkData.remark,
                                select: remarkData.select ? JSON.stringify(remarkData.select) : undefined,
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
                message.error(t('collectFailed'))
            })

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
                }
            })
            setStartTime(0)
            setCol(!col)
        }
    }

    return (
        <div className='colContent' onClick={colButtonClick}>
            <div className={`${col ? "colIngIcon" : 'colInitIcon'} colIcon`}></div>
        </div>
    )
}
