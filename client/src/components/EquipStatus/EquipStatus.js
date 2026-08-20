import React from 'react'
import './index.scss'
import { withTranslation } from 'react-i18next';
import { useEquipStore } from '../../store/equipStore';
import { shallow } from 'zustand/shallow';
import { getMatrixDisplayLabel, getSystemMatrixParts } from '../../util/constant';

// 假人只有这五块传感器。下身在后端是一条 endi-foot，到前端会拆成左右腿两条
const expandStatusParts = (system) => getSystemMatrixParts(system)
    .flatMap((part) => (part.key === 'foot' ? ['leftFoot', 'rightFoot'] : [part.key]))

const EquipStatus = React.memo(function EquipStatus(props) {

    const { t, i18n } = props;
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
            ? getMatrixDisplayLabel(key, i18n?.language)
            : key === 'hand'
                ? t('handEquip')
                : key === 'bed'
                    ? t('bedEquip')
                    : key,
        status,
    }))

    // 假人：只列设备自身配置里的五个部位（上身 / 左臂 / 右臂 / 左腿 / 右腿）。
    // 不再拿 equipStatus 的 key 反推，免得混进坐垫、靠背这种假人根本没有的部位
    const dummyItems = fileName === 'endi'
        ? expandStatusParts(fileName).map((part) => ({
            key: `${fileName}-${part}`,
            label: getMatrixDisplayLabel(`${fileName}-${part}`, i18n?.language),
            status: equipStatus?.[`${fileName}-${part}`],
        }))
        : []

    const items = fileName === 'endi'
        ? (Object.keys(equipStatus || {}).length ? dummyItems : [])
        : (['car', 'carY'].includes(fileName) && chairItems.length > 0 ? chairItems : fallbackItems)

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
