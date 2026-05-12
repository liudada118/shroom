import React from 'react'
import { msToHMS } from '../../assets/util/date';
import { useEquipStore } from '../../store/equipStore';
import { shallow } from 'zustand/shallow';

function labelOf(key) {
    if (typeof key !== 'string') return String(key)
    if (key.includes('back')) return '靠垫'
    if (key.includes('sit')) return '坐垫'
    return key
}

export default function ColTime(props) {

    const { startTime } = props
    const equipStamp = useEquipStore(s => s.equipStamp, shallow);
    const equipStatus = useEquipStore(s => s.equipStatus, shallow);

    if (startTime == 0) return <>00:00:00</>

    const keys = Object.keys(equipStatus || {})
    const offlineKeys = keys.filter(k => {
        const s = equipStatus[k]
        return s === 'offline' || s === undefined || s === null
    })

    if (keys.length > 0 && offlineKeys.length === keys.length) {
        return <>全部设备断开</>
    }
    if (offlineKeys.length > 0) {
        return <>{offlineKeys.map(labelOf).join('、')}已断开</>
    }

    const elapsed = equipStamp - startTime
    if (!Number.isFinite(elapsed)) return <>设备断开</>
    return <>{msToHMS(elapsed)}</>
}
