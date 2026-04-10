import React, { memo, useContext } from 'react'
import './index.scss'
import EquipStatus from '../EquipStatus/EquipStatus'
import Select from '../select/Select'
import SecondTitle from './SecondTitle'
import logo from '../../assets/image/logo.png'
import axios from 'axios'
import { withTranslation } from 'react-i18next'
import { pageContext } from '../../page/test/Test'
import { localAddress } from '../../util/constant'
import { buildFallbackParams } from '../../util/request'
import { useEquipStore } from '../../store/equipStore'
import { shallow } from 'zustand/shallow'

const Title = memo((props) => {
  const { t, i18n } = props
  const connectState = useEquipStore((s) => s.connectState, shallow)
  const systemType = useEquipStore((s) => s.systemType, shallow)
  const systemTypeArr = useEquipStore((s) => s.systemTypeArr, shallow)

  const connent = () => {
    if (connectState !== 'idle') return

    useEquipStore.getState().setConnectState('connecting')

    axios.get(`${localAddress}/connPort`, {}).then((res) => {
      console.log(res)
      useEquipStore.getState().setConnectState('connected')
    }).catch(() => {
      useEquipStore.getState().setConnectState('idle')
    })

    axios.get(`${localAddress}/sendMac`, {}).then((res) => {
      console.log(res)
    })
  }

  useContext(pageContext)

  const changeSystemType = (e) => {
    const payload = {
      system: e,
    }

    axios({
      method: 'post',
      url: `${localAddress}/changeSystemType`,
      params: buildFallbackParams(payload),
      data: payload,
    }).then((res) => {
      console.log(res)
      const optimalObj = res.data.data.optimalObj
      const maxObj = res.data.data.maxObj
      useEquipStore.getState().setSystemType(e)
      useEquipStore.getState().setStatus(new Array(4096).fill(0))
      useEquipStore.getState().setDisplayStatus(new Array(4096).fill(0))
      useEquipStore.getState().setDisplayType('all')
      useEquipStore.getState().setSettingValue(optimalObj)
      useEquipStore.getState().setSettingValueMax(maxObj)
      useEquipStore.getState().setSettingValueOptimal(optimalObj)
    }).catch(() => {})
  }

  useEquipStore((s) => s.equipStatus, shallow)

  const getButtonClass = () => {
    switch (connectState) {
      case 'connecting':
        return 'connectingPort'
      case 'connected':
        return 'connectedPort'
      default:
        return 'connectPort'
    }
  }

  const getButtonText = () => {
    switch (connectState) {
      case 'connecting':
        return t('connecting')
      case 'connected':
        return t('connected')
      default:
        return t('connect')
    }
  }

  return (
    <div className='titleContent'>
      <div className="firstTitle">
        <div className="titleLeft">
          <div className="logo fs24">
            <img src={logo} style={{ height: '1.2rem' }} alt="" />
          </div>
          <Select options={systemTypeArr}
            defaultValue={t(systemType)}
            onChange={changeSystemType}
          />
          <div className={`${getButtonClass()} cursor connectButton`} style={{ marginRight: '3.1rem' }} onClick={() => { connent() }}>
            {getButtonText()}
          </div>
          <EquipStatus fileName={systemType} />
        </div>

        <div className="titleRight">
          <Select defaultValue='中文' options={[
            {
              label: '中文',
              value: 'zh'
            },
            {
              label: 'EN',
              value: 'en'
            },
          ]}
            icon={<i className='iconfont' style={{ marginRight: '0.625rem', fontSize: '0.875rem', color: '#E6EBF0' }}>&#xe642;</i>}
            onChange={(value) => {
              i18n.changeLanguage(value)
            }}
          />
        </div>
      </div>

      <SecondTitle />
    </div>
  )
})

export default withTranslation('translation')(Title)
