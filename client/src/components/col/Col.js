import React, { useContext, useRef } from 'react'
import './index.scss'
import axios from 'axios'
import { message } from 'antd'
import { getDisplayType, getSysType, useEquipStore } from '../../store/equipStore'
import { localAddress, systemPointConfig } from '../../util/constant'
import { buildFallbackParams } from '../../util/request'
import { pageContext } from '../../page/test/Test'
import { useTranslation } from 'react-i18next'
import { isMoreMatrix } from '../../assets/util/util'
import { colSelectMatrix } from '../../util/util'

export default function Col(props) {
    const { t } = useTranslation()
    const { colName, remark, HZ, setStartTime, col, setCol, className = '', children, onBeforeStart, onCollectEnd } = props
    const pageInfo = useContext(pageContext)
    const currentCollectDateRef = useRef('')

    const getCurrentDataDirection = () => {
        const current = pageInfo?.dataDirection?.current
        return current && typeof current === 'object'
            ? current
            : { left: true, up: true, rotateDegree: 0 }
    }

    const getSelectionTypeKey = (range) => {
        const systemType = getSysType()
        const displayType = getDisplayType()
        if (range?.matrixKey && systemPointConfig[range.matrixKey]) return range.matrixKey
        if (isMoreMatrix(systemType)) {
            const part = String(displayType || '').includes('sit') ? 'sit' : 'back'
            return `${systemType}-${part}`
        }
        return systemType
    }

    const buildCurrentSelectJson = () => {
        const ranges = Array.isArray(pageInfo?.brushInstance?.rangeArr)
            ? pageInfo.brushInstance.rangeArr
            : []
        const selectJson = {}

        ranges.forEach((range, index) => {
            if (!range) return
            const { _element, ...safeRange } = range
            const typeKey = getSelectionTypeKey(safeRange)
            const config = systemPointConfig[typeKey]
            if (!config) return

            const matrix = safeRange.matrixRect || colSelectMatrix('canvasThree', safeRange, config)
            if (!matrix) return

            if (!selectJson[typeKey]) selectJson[typeKey] = { regions: [] }
            selectJson[typeKey].regions.push({
                xStart: matrix.xStart,
                xEnd: matrix.xEnd,
                yStart: matrix.yStart,
                yEnd: matrix.yEnd,
                width: matrix.width || config.width,
                height: matrix.height || config.height,
                name: safeRange.name || `框选${index + 1}`,
                colorIndex: safeRange.colorIndex != null ? safeRange.colorIndex : index,
                templateId: safeRange.templateId,
            })
        })

        return Object.keys(selectJson).length ? selectJson : null
    }

    const persistCollectionRemark = (date, options = {}) => {
        if (!date) return Promise.resolve()
        const { alias = '', remarkText = '', forceSelect = false } = options
        const select = buildCurrentSelectJson()
        const remarkData = { date: String(date) }
        if (alias) remarkData.alias = alias
        if (remarkText) remarkData.remark = remarkText
        if (select || forceSelect) remarkData.select = select || {}
        if (!alias && !remarkText && !select && !forceSelect) return Promise.resolve()

        return axios({
            method: 'post',
            url: `${localAddress}/upsertRemark`,
            params: buildFallbackParams(remarkData),
            data: remarkData,
        }).then((remarkRes) => {
            if (remarkRes.data?.message == 'error') {
                message.error(remarkRes.data.data)
            }
        }).catch((err) => {
            console.error('[Col] upsertRemark failed:', err)
        })
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
                processingConfig: (() => {
                    const { filter, gauss, coherent } = useEquipStore.getState().settingValue || {}
                    return { filter, gauss, coherent }
                })(),
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
                    currentCollectDateRef.current = String(startStamp)
                    useEquipStore.getState().setCollecting(true)

                    // 始终调用 upsertRemark 保存框选数据（即使没有 alias 和 remark）
                    const alias = currentColName ? currentColName.trim() : ''
                    const remarkText = currentRemark ? currentRemark.trim().slice(0, 400) : ''
                    persistCollectionRemark(startStamp, { alias, remarkText })

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
            const collectDate = currentCollectDateRef.current
            const persistStopSelection = collectDate
                ? persistCollectionRemark(collectDate, { forceSelect: true }).finally(() => {
                    currentCollectDateRef.current = ''
                })
                : Promise.resolve()
            persistStopSelection.then(() => axios({
                method: 'get',
                url: `${localAddress}/endCol`,
            })).then((res) => {
                if (res.data.message == 'error') {
                    message.error(res.data.data)
                } else {
                    message.success(t('collectSuccess'))
                    setCol(!col)
                    useEquipStore.getState().setCollecting(false)
                    onCollectEnd?.({ date: collectDate })
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
