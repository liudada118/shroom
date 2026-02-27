import React, { useState } from 'react'
import './index.scss'
import axios from 'axios'
import { message } from 'antd'
import { getDisplayType, getSelectArr, getSysType, useEquipStore } from '../../store/equipStore'
import { shallow } from 'zustand/shallow'
import { systemPointConfig, localAddress } from '../../util/constant'
import { colSelectMatrix } from '../../util/util'

export default function Col(props) {
    const { colName, remark, HZ, setStartTime, col, setCol } = props
    // const count = useEquipStore((s) => s.count);
    // const selectArr = useEquipStore(s => s.select, shallow);
    const colButtonClick = () => {
        // const select = getSelectArr()
        const select = useEquipStore.getState().selectArr;
        const system = getSysType()
        const displayType = getDisplayType()
        const selectObj = {}
        if (select.length) {
            if (displayType.includes('back')) {
                const matrix = colSelectMatrix('canvasThree', select[0], systemPointConfig[`${system}-back`])
                const { xStart, xEnd, yStart, yEnd } = matrix
                matrix.width = systemPointConfig[`${system}-back`].width
                matrix.height = systemPointConfig[`${system}-back`].height
                selectObj[`${system}-back`] = matrix
            } else {
                const matrix = colSelectMatrix('canvasThree', select[0], systemPointConfig[`${system}-sit`])
                const { xStart, xEnd, yStart, yEnd } = matrix
                matrix.width = systemPointConfig[`${system}-sit`].width
                matrix.height = systemPointConfig[`${system}-sit`].height
                selectObj[`${system}-sit`] = matrix
            }
        }




        console.log(select)
        if (!col) {
            const startStamp = Date.now()
            const fileName = startStamp
            const hz = HZ ? HZ : 30
            axios({
                method: 'post',
                url: `${localAddress}/startCol`,
                data: {
                    fileName: fileName,
                    HZ: hz,
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
                    const hasSelect = Object.keys(selectObj).length > 0
                    if (alias || remarkText || hasSelect) {
                        const data = {
                            date: String(startStamp),
                        }
                        if (alias) data.alias = alias
                        if (remarkText) data.remark = remarkText
                        if (hasSelect) data.select = selectObj

                        axios({
                            method: 'post',
                            url: `${localAddress}/upsertRemark`,
                            data
                        }).then((remarkRes) => {
                            if (remarkRes.data?.message == 'error') {
                                message.error(remarkRes.data.data)
                            }
                        }).catch(() => {
                            message.error('upsertRemark failed')
                        })
                    }
                }

            }).catch((err) => {
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
            <div className={`${col ? "colIngIcon" : 'colInitIcon'} colIcon`}></div>
        </div>
    )
}
