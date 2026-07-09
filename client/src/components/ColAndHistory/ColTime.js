import React from 'react'
import { msToHMS } from '../../assets/util/date';
import { useEquipStore } from '../../store/equipStore';
import { shallow } from 'zustand/shallow';
import { useTranslation } from 'react-i18next';
import { getMatrixDisplayLabel } from '../../util/constant';

function labelOf(key, language) {
    if (typeof key !== 'string') return String(key)
    if (key.includes('back')) return 'backPad'
    if (key.includes('sit')) return 'seatPad'
    return getMatrixDisplayLabel(key, language)
}

export default function ColTime(props) {
    const { t, i18n } = useTranslation()

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
        const offlineLabels = offlineKeys.map(key => {
            const label = labelOf(key, i18n.language)
            return label.endsWith('Pad') ? t(label) : label
        })
        return <>{offlineLabels.join('、')}{t('deviceDisconnectedSuffix')}</>
    }

    const elapsed = equipStamp - startTime
    if (!Number.isFinite(elapsed)) return <>{t('deviceDisconnected')}</>
    return <>{msToHMS(elapsed)}</>
}
