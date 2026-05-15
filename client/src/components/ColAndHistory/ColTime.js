import React from 'react'
import { msToHMS } from '../../assets/util/date';
import { useEquipStore } from '../../store/equipStore';
import { shallow } from 'zustand/shallow';
import { useTranslation } from 'react-i18next';

function labelOf(key) {
    if (typeof key !== 'string') return String(key)
    if (key.includes('back')) return 'backPad'
    if (key.includes('sit')) return 'seatPad'
    return key
}

export default function ColTime(props) {
    const { t } = useTranslation()

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
        return <>{t('allDevicesDisconnected')}</>
    }
    if (offlineKeys.length > 0) {
        return <>{offlineKeys.map(key => t(labelOf(key))).join('、')}{t('deviceDisconnectedSuffix')}</>
    }

    const elapsed = equipStamp - startTime
    if (!Number.isFinite(elapsed)) return <>{t('deviceDisconnected')}</>
    return <>{msToHMS(elapsed)}</>
}
