import React, { useContext, useState } from 'react'
import './index.scss'
import axios from 'axios'
import { message } from 'antd'
import { getDisplayType, getSelectArr, getSysType, useEquipStore } from '../../store/equipStore'
import { shallow } from 'zustand/shallow'
import { systemPointConfig, localAddress } from '../../util/constant'
import { colSelectMatrix } from '../../util/util'
import { isMoreMatrix } from '../../assets/util/util'
import { buildFallbackParams } from '../../util/request'
import { pageContext } from '../../page/test/Test'

export default function Col(props) {
    const { colName, remark, HZ, setStartTime, col, setCol } = props
    const pageInfo = useContext(pageContext)

    const getCurrentDataDirection = () => {
        const current = pageInfo?.dataDirection?.current
        return current && typeof current === 'object'
            ? current
            : { left: true, up: true, rotateDegree: 0 }
    }

    const colButtonClick = () => {
        const select = useEquipStore.getState().selectArr;
        const system = getSysType()
        const displayType = getDisplayType()
        const selectObj = {}

        if (Array.isArray(select) && select.length) {
            for (let i = 0; i < select.length; i++) {
                const range = select[i]
                let typeKey = range.matrixKey || system
                if (isMoreMatrix(system)) {
                    typeKey = range.matrixKey || `${system}-${displayType.includes('back') ? 'back' : displayType.includes('sit') ? 'sit' : 'back'}`
                }
                if (!systemPointConfig[typeKey]) continue

                try {
                    const matrix = colSelectMatrix('canvasThree', range, systemPointConfig[typeKey])
                    if (!matrix) continue
                    const region = {
                        xStart: matrix.xStart,
                        xEnd: matrix.xEnd,
                        yStart: matrix.yStart,
                        yEnd: matrix.yEnd,
                        width: systemPointConfig[typeKey].width,
                        height: systemPointConfig[typeKey].height,
                        region_id: i + 1,
                        name: range.name || `框选${i + 1}`,
                        colorIndex: range.colorIndex,
                    }
                    if (!selectObj[typeKey]) {
                        selectObj[typeKey] = { ...region, regions: [] }
                    }
                    selectObj[typeKey].regions.push(region)
                } catch (e) {
                    console.warn(`[Col] Failed to compute ${typeKey} select matrix:`, e.message)
                }
            }
        }

        console.log('[Col] selectObj:', selectObj)

        if (!col) {
            const startStamp = Date.now()
            const fileName = startStamp
            const hz = HZ ? HZ : 30
            const hasSelect = Object.keys(selectObj).length > 0
            const startPayload = {
                fileName: fileName,
                HZ: hz,
                dataDirection: getCurrentDataDirection(),
            }
            if (hasSelect) {
                startPayload.select = selectObj
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
                        'Please select correct sensor type': '请先选择正确的传感器类型',
                    }
                    message.error(errorTextMap[res.data.data] || res.data.data)
                } else {
                    message.success('开始采集')
                    setCol(!col)
                    setStartTime(startStamp)
                    useEquipStore.getState().setCollecting(true)

                    // 始终调用 upsertRemark 保存框选数据（即使没有 alias 和 remark）
                    const alias = colName ? colName.trim() : ''
                    const remarkText = remark ? remark.trim().slice(0, 400) : ''

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
                useEquipStore.getState().setCollecting(false)
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
                    useEquipStore.getState().setCollecting(false)
                }
            })
            setStartTime(0)
            setCol(!col)
            useEquipStore.getState().setCollecting(false)
        }
    }

    return (
        <div className='colContent' onClick={colButtonClick}>
            <div className={`${col ? "colIngIcon" : 'colInitIcon'} colIcon`}></div>
        </div>
    )
}
