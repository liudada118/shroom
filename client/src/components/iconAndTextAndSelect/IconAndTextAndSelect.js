import React, { useContext, useState } from 'react'
import IconAndText from '../iconAndText/IconAndText'
import './index.scss'
import { pageContext } from '../../page/test/Test'
import axios from 'axios'
import { message } from 'antd'
import { useTranslation } from 'react-i18next'
import { localAddress } from '../../util/constant'
import { buildFallbackParams } from '../../util/request'
import { useEquipStore } from '../../store/equipStore'

export default function IconAndTextAndSelect(props) {
    const { show, text, options, icon } = props
    const { t } = useTranslation()
    const [selectShow, setSelectShow] = useState(false)

    const pageInfo = useContext(pageContext);
    const { changeDataDirection } = pageInfo

    const syncDataDirection = (direction) => {
        if (!direction) return
        const payload = { dataDirection: direction }
        axios({
            method: 'post',
            url: `${localAddress}/setDataDirection`,
            params: buildFallbackParams(payload),
            data: payload,
        }).catch(() => {})
    }

    return (
        <div className='iconAndSelect'
            onMouseEnter={() => {
                setSelectShow(true)
            }}
            onMouseLeave={() => {
                setSelectShow(false)
            }}
        >
            <IconAndText show={show} text={text} icon={icon} />
            <div className={`dropDown ${selectShow ? 'dropDownVisible' : ''}`}>
                {options.map((a, index) => {
                    return (
                        <div key={`${a.target || 'all'}-${a.value}-${index}`} className='dropItem fs14 cursor' onClick={() => {
                            if (useEquipStore.getState().collecting) {
                                message.warning(t('collectingDirectionLocked'))
                                return
                            }
                            // setValue(a.label)
                            // setShow(false)
                            const directionType = a.direction || a.value
                            const nextDirection = changeDataDirection(directionType, a.target)
                            syncDataDirection(nextDirection)

                        }}>
                            {a.label}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
