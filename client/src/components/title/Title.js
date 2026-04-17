import React, { memo, useContext, useState } from 'react'
import './index.scss'
import EquipStatus from '../EquipStatus/EquipStatus'
import Select from '../select/Select'
import IconAndText from '../iconAndText/IconAndText'
import SecondTitle from './SecondTitle'
import logo from '../../assets/image/logo.png'
import axios from 'axios'
import { withTranslation } from "react-i18next";
import { pageContext } from '../../page/test/Test'
import { systemConfig, localAddress } from '../../util/constant'
import { buildFallbackParams } from '../../util/request'
import { useEquipStore } from '../../store/equipStore'
import { shallow } from 'zustand/shallow'
import { Tooltip } from 'antd'
import { SettingOutlined, ReloadOutlined, DisconnectOutlined } from '@ant-design/icons'


const Title = memo((props) => {
  const { t, i18n } = props;

  const connectState = useEquipStore(s => s.connectState, shallow);

  // ─── 一键连接 ──────────────────────────────────────────
  // connPort 已合并 MAC 查询，不再需要单独调用 /sendMac
  const connent = () => {
    if (connectState !== 'idle') return

    useEquipStore.getState().setConnectState('connecting')

    axios.get(`${localAddress}/connPort`, {}).then((res) => {
      console.log('[Connect] connPort result:', res.data)
      useEquipStore.getState().setConnectState('connected')
    }).catch((err) => {
      console.error('[Connect] connPort failed:', err)
      useEquipStore.getState().setConnectState('idle')
    })
  }

  // ─── 重新连接 ──────────────────────────────────────────
  // 清理死端口 + 僵尸设备 → 重新连接
  const rescan = () => {
    if (connectState === 'connecting' || connectState === 'rescanning') return

    useEquipStore.getState().setConnectState('rescanning')

    axios.get(`${localAddress}/rescanPort`, {}).then((res) => {
      console.log('[Rescan] result:', res.data)
      useEquipStore.getState().setConnectState('connected')
    }).catch((err) => {
      console.error('[Rescan] failed:', err)
      useEquipStore.getState().setConnectState('idle')
    })
  }

  // ─── 断开连接 ──────────────────────────────────────────
  // 调用后端 stopPort 关闭所有串口，并清空前端状态
  const disconnect = () => {
    if (connectState === 'idle') return

    axios.get(`${localAddress}/stopPort`, {}).then((res) => {
      console.log('[Disconnect] stopPort result:', res.data)
    }).catch((err) => {
      console.error('[Disconnect] stopPort failed:', err)
    })

    // 立即清空前端状态
    useEquipStore.getState().setConnectState('idle')
    useEquipStore.getState().setEquipStatus({})
  }

  const pageInfo = useContext(pageContext);

  const systemType = useEquipStore(s => s.systemType, shallow);
  const systemTypeArr = useEquipStore(s => s.systemTypeArr, shallow);

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
    }).catch((err) => {
    })
  }

  const [language, setLanguage] = useState('中文')

  const equipStatus = useEquipStore(s => s.equipStatus, shallow);

  // 根据 connectState 决定主按钮样式和文本
  const getButtonClass = () => {
    switch (connectState) {
      case 'connecting':
      case 'rescanning':
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
      case 'rescanning':
        return '重新连接中...'
      case 'connected':
        return t('connected')
      default:
        return t('connect')
    }
  }

  // 跳转到 MAC 地址配置页面
  const goToMacConfig = () => {
    window.location.hash = '#/macConfig'
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
          {/* 一键连接按钮 */}
          <div className={`${getButtonClass()} cursor connectButton`} style={{ marginRight: '0.5rem' }} onClick={() => { connent() }}>
            {getButtonText()}
          </div>

          {/* 重新连接按钮（仅在已连接状态显示） */}
          {connectState === 'connected' && (
            <Tooltip title="重新连接（清理死端口/僵尸设备后重连）">
              <div className="rescanBtn cursor" onClick={rescan}>
                <ReloadOutlined style={{ fontSize: '0.85rem' }} />
              </div>
            </Tooltip>
          )}

          {/* 断开连接按钮（仅在已连接/重扫状态显示） */}
          {(connectState === 'connected' || connectState === 'rescanning') && (
            <Tooltip title="断开所有串口连接">
              <div className="disconnectBtn cursor" onClick={disconnect}>
                <DisconnectOutlined style={{ fontSize: '0.85rem' }} />
              </div>
            </Tooltip>
          )}

          <EquipStatus fileName={systemType} />
        </div>

        <div className="titleRight">
          <Tooltip title="设备 MAC 地址配置">
            <div className="settingBtn cursor" onClick={goToMacConfig}>
              <SettingOutlined style={{ fontSize: '1.1rem', color: '#E6EBF0' }} />
            </div>
          </Tooltip>
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
