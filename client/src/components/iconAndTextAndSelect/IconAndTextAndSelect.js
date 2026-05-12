import React, { useContext, useState } from 'react'
import IconAndText from '../iconAndText/IconAndText'
import './index.scss'
import { pageContext } from '../../page/test/Test'
import axios from 'axios'
import { message } from 'antd'
import { localAddress } from '../../util/constant'
import { buildFallbackParams } from '../../util/request'
import { useEquipStore } from '../../store/equipStore'

export default function IconAndTextAndSelect(props) {
    const { show, text, options, icon } = props
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
            onMouseOver={() => {
                setSelectShow(true)
            }}
            onMouseOut={() => {
                setSelectShow(false)
            }}
        >
            <IconAndText show={show} text={text} icon={icon} />
            <div className="dropDown" style={{ opacity: selectShow ? 1 : 0 }}>
                {options.map((a, index) => {
                    return (
                        <div className='dropItem fs14 cursor' onClick={() => {
                            if (useEquipStore.getState().collecting) {
                                message.warning('采集中禁止翻转/旋转，请停止采集后再修改方向')
                                return
                            }
                            // setValue(a.label)
                            // setShow(false)
                            let nextDirection
                            if (a.value == 'up') {
                                nextDirection = changeDataDirection('up')
                            } else if (a.value == 'left') {
                                nextDirection = changeDataDirection('left')
                            } else {
                                nextDirection = changeDataDirection('rotate')
                            }
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
