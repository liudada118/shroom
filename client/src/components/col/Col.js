import React from 'react'
import './index.scss'
import axios from 'axios'
import { message } from 'antd'
import { getDisplayType, getSysType, useEquipStore } from '../../store/equipStore'
import { systemPointConfig, localAddress } from '../../util/constant'
import { colSelectMatrix } from '../../util/util'
import { isMoreMatrix } from '../../assets/util/util'

export default function Col(props) {
    const { colName, remark, HZ, setStartTime, col, setCol } = props

    const colButtonClick = () => {
        const select = useEquipStore.getState().selectArr
        const system = getSysType()
        const displayType = getDisplayType()
        const selectObj = {}

        if (select.length && select[0]) {
            const range = { x1: select[0].x1, y1: select[0].y1, x2: select[0].x2, y2: select[0].y2 }

            if (isMoreMatrix(system)) {
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
                    fileName,
                    HZ: hz,
                    select: hasSelect ? selectObj : undefined,
                }
            }).then((res) => {
                if (res.data.message == 'error') {
                    message.error(res.data.data)
                } else {
                    message.success('开始采集')
                    setCol(!col)
                    setStartTime(startStamp)

                    const alias = colName ? colName.trim() : ''
                    const remarkText = remark ? remark.trim().slice(0, 400) : ''
                    const remarkData = {
                        date: String(startStamp),
                    }
                    if (alias) remarkData.alias = alias
                    if (remarkText) remarkData.remark = remarkText
                    if (hasSelect) remarkData.select = selectObj

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
                message.error('采集失败')
            })
        } else {
            axios({
                method: 'get',
                url: `${localAddress}/endCol`,
            }).then((res) => {
                if (res.data.message == 'error') {
                    message.error(res.data.data)
                } else {
                    message.success('采集成功')
                    setCol(!col)
                }
            })
            setStartTime(0)
            setCol(!col)
        }
    }

    return (
        <div className='colContent' onClick={colButtonClick}>
            <div className={`${col ? 'colIngIcon' : 'colInitIcon'} colIcon`}></div>
        </div>
    )
}
