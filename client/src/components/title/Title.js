import React, { memo, useContext } from 'react'
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
import { loadVisualSettingValue } from '../../util/visualSettingStorage'
import { useEquipStore } from '../../store/equipStore'
import { shallow } from 'zustand/shallow'
import { Tooltip, message } from 'antd'
import { SettingOutlined, ReloadOutlined, DisconnectOutlined } from '@ant-design/icons'


const Title = memo((props) => {
  const { t, i18n } = props;
  const languageKey = String(i18n.language || localStorage.getItem('language') || 'zh').toLowerCase().startsWith('en') ? 'en' : 'zh'
  const languageOptions = [
    { label: '中文', value: 'zh' },
    { label: 'EN', value: 'en' },
  ]
  const languageLabel = languageOptions.find(item => item.value === languageKey)?.label || '中文'

  const connectState = useEquipStore(s => s.connectState, shallow);
  const CONNECT_TIMEOUT_MS = 15000

  const getConnectErrorMessage = (err, fallback = t('connectFailedCheckDevice')) => {
    if (err?.code === 'ECONNABORTED') return t('connectTimeoutCheckDevice')
    return err?.response?.data?.message || err?.data?.message || err?.message || fallback
  }

  const setConnectFailed = (error) => {
    const errorMessage = typeof error === 'string' ? error : getConnectErrorMessage(error)
    useEquipStore.getState().setConnectState('failed')
    useEquipStore.getState().setConnectionError(error)
    message.error(errorMessage)
  }

  const applyConnectResult = (res, fallback) => {
    const payload = res?.data
    const result = payload?.data
    if (payload?.code === 0 && result?.success !== false) {
      useEquipStore.getState().setConnectState('connected')
      useEquipStore.getState().setConnectionError(null)
      if (result?.macInfo) {
        useEquipStore.getState().setMacInfo(result.macInfo)
      }
      return true
    }

    setConnectFailed(result?.message || payload?.message || fallback)
    return false
  }

  // ─── 一键连接 ──────────────────────────────────────────
  // connPort 已合并 MAC 查询，不再需要单独调用 /sendMac
  const connent = () => {
    if (connectState === 'connecting' || connectState === 'rescanning' || connectState === 'connected') {
      message.info(t('duplicateConnectionOperation'))
      return
    }

    useEquipStore.getState().setConnectState('connecting')

    axios.get(`${localAddress}/connPort`, { timeout: CONNECT_TIMEOUT_MS }).then((res) => {
      console.log('[Connect] connPort result:', res.data)
      applyConnectResult(res, t('connectFailedCheckDevice'))
    }).catch((err) => {
      console.error('[Connect] connPort failed:', err)
      setConnectFailed(err)
    })
  }

  // ─── 重新连接 ──────────────────────────────────────────
  // 清理死端口 + 僵尸设备 → 重新连接
  const rescan = () => {
    if (connectState === 'connecting' || connectState === 'rescanning') {
      message.info(t('deviceConnectingWait'))
      return
    }

    useEquipStore.getState().setConnectState('rescanning')

    axios.get(`${localAddress}/rescanPort`, { timeout: CONNECT_TIMEOUT_MS }).then((res) => {
      console.log('[Rescan] result:', res.data)
      applyConnectResult(res, t('reconnectFailedCheckDevice'))
    }).catch((err) => {
      console.error('[Rescan] failed:', err)
      setConnectFailed(err)
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
      message.error(getConnectErrorMessage(err, t('disconnectFailed')))
    })

    // 立即清空前端状态
    useEquipStore.getState().setConnectState('idle')
    useEquipStore.getState().setConnectionError(null)
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
      useEquipStore.getState().setSettingValue(loadVisualSettingValue(e, optimalObj, maxObj))
      useEquipStore.getState().setSettingValueMax(maxObj)
      useEquipStore.getState().setSettingValueOptimal(optimalObj)
    }).catch((err) => {
    })
  }

  const equipStatus = useEquipStore(s => s.equipStatus, shallow);

  // 根据 connectState 决定主按钮样式和文本
  const getButtonClass = () => {
    switch (connectState) {
      case 'connecting':
      case 'rescanning':
        return 'connectingPort'
      case 'connected':
        return 'connectedPort'
      case 'failed':
      case 'deviceError':
        return 'connectPort'
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
      case 'failed':
      case 'deviceError':
        return '重新连接'
      default:
        return t('connect')
    }
  }

  // 跳转到 MAC 地址配置页面
  const goToMacConfig = () => {
    window.location.hash = '#/macConfig'
  }

  const clearSelectionMode = () => {
    window.dispatchEvent(new CustomEvent('clear-selection-mode'))
  }

  const changeLanguage = (value) => {
    localStorage.setItem('language', value)
    clearSelectionMode()
    i18n.changeLanguage(value)
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
          {(connectState === 'connected' || connectState === 'failed' || connectState === 'deviceError') && (
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
          <Select defaultValue={languageLabel} options={languageOptions}

            icon={<i className='iconfont' style={{ marginRight: '0.625rem', fontSize: '0.875rem', color: '#E6EBF0' }}>&#xe642;</i>}
            popupClassName="languageSelectDropdown"
            dropdownStyle={{ zIndex: 2147483647 }}
            styles={{ popup: { root: { zIndex: 2147483647 } } }}
            getPopupContainer={() => document.body}
            onChange={changeLanguage}

          />
        </div>
      </div>

      <SecondTitle />
    </div>
  )
})

export default withTranslation('translation')(Title)
