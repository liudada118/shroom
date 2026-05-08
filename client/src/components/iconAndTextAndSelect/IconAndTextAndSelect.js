import React, { useContext, useState } from 'react'
import IconAndText from '../iconAndText/IconAndText'
import './index.scss'
import { pageContext } from '../../page/test/Test'
import axios from 'axios'
import { localAddress } from '../../util/constant'
import { buildFallbackParams } from '../../util/request'

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
                            // setValue(a.label)
                            // setShow(false)
                            let nextDirection
                            if (a.value == 'up') {
                                nextDirection = changeDataDirection('up')
                            } else {
                                nextDirection = changeDataDirection('left')
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
