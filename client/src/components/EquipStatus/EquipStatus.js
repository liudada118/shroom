import React from 'react'
import './index.scss'
import { withTranslation } from 'react-i18next';
import { useEquipStore } from '../../store/equipStore';
import { shallow } from 'zustand/shallow';

const EquipStatus = React.memo(function EquipStatus(props) {

    const { t } = props;
    const { fileName } = props

    const equipStatus = useEquipStore(s => s.equipStatus, shallow);
    const getStatusFor = (part) => {
        if (!equipStatus) return undefined
        const entry = Object.entries(equipStatus).find(([key]) => key === part || key.endsWith(`-${part}`) || key.includes(part))
        return entry?.[1]
    }

    const chairItems = [
        { key: 'sit', label: t('sit'), status: getStatusFor('sit') },
        { key: 'back', label: t('back'), status: getStatusFor('back') },
    ].filter(item => item.status !== undefined)

    const fallbackItems = Object.entries(equipStatus || {}).map(([key, status]) => ({
        key,
        label: key.includes('car') || key.includes('endi') || key.includes('carY')
            ? t(key.split('-')[1])
            : key === 'hand'
                ? t('handEquip')
                : key === 'bed'
                    ? t('bedEquip')
                    : key,
        status,
    }))

    const items = ['car', 'endi', 'carY'].includes(fileName) && chairItems.length > 0 ? chairItems : fallbackItems

    return (
        <div className='equipsStatusContent'>
            {
                items.map((item) => {
                    const online = item.status === 'online'
                    return (
                        <div className='equipStatusContent' key={item.key}>
                            <div className='equipName'>{item.label}</div>
                            <div className={online ? 'equipOnlineStatus' : 'equipOfflineStatus'}></div>
                        </div>
                    )
                })
            }
        </div>
    )
})

export default withTranslation('translation')(EquipStatus);
