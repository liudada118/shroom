import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import './index.scss'

let topDrawerZIndex = 1000

function getNextDrawerZIndex(baseZIndex) {
    topDrawerZIndex = Math.max(topDrawerZIndex + 1, baseZIndex)
    return topDrawerZIndex
}

const Drawer = React.memo(function Drawer(props) {
    const { show, title, setShow, children, asideClose, zindex, close, direction = 'right' } = props
    const baseZIndex = zindex ? zindex * 100 : 100
    const [activeZIndex, setActiveZIndex] = useState(baseZIndex)

    const bringToFront = () => {
        if (show) {
            setActiveZIndex(getNextDrawerZIndex(baseZIndex))
        }
    }

    useEffect(() => {
        if (show) {
            setActiveZIndex(getNextDrawerZIndex(baseZIndex))
        }
    }, [show, baseZIndex])

    const drawerNode = (
        <div className='drawerContent' onMouseDown={bringToFront} style={{

            right: direction == 'left' ? 'unset' : show ? 0 : 'calc(-18% - 5px)',
            left: direction == 'right' ? 'unset' : show ? 0 : 'calc(-18% - 5px)',


            zIndex: activeZIndex
        }}>
            {asideClose ? <div className='asideClose' style={{
                right: direction == 'left' ? 'unset' : '100%',
                left: direction == 'right' ? 'unset' : '100%',
            }} onClick={() => { setShow(!show) }}>
                <i className='iconfont' style={{ fontSize: '0.875rem' }}>&#xe621;</i>
            </div> : ''}
            <div className="drawerTitle">
                <div className="titleInfo">{title}</div>
                <div className="closeDrawer cursor" onClick={() => {
                    if (close) {
                        close()
                    }
                    setShow(false)
                }}>
                    <i className='iconfont'>&#xe625;</i>
                </div>
            </div>

            <div className="drawerInside">
                {children}
            </div>
        </div>
    )

    if (typeof document === 'undefined') return drawerNode
    return createPortal(drawerNode, document.body)
})
export default Drawer
