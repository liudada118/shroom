import { create } from 'zustand'
import { maxObj } from '../assets/util/constant'

// ─── 持久化设置值 ────────────────────────────────────────
const DEFAULT_SETTINGS = { gauss: 1, color: 200, filter: 1, height: 15, coherent: 1 }

function loadSettingValue() {
  try {
    const stored = localStorage.getItem('setValueData')
    return stored ? JSON.parse(stored) : DEFAULT_SETTINGS
  } catch {
    return DEFAULT_SETTINGS
  }
}

// ─── ADC 颜色范围持久化（0~255，上限默认200，下限默认5）────
const ADC_DEFAULT_UPPER = 200
const ADC_DEFAULT_LOWER = 5

function loadAdcRange() {
  try {
    const upper = localStorage.getItem('adcUpper')
    const lower = localStorage.getItem('adcLower')
    return {
      adcUpper: upper !== null ? Number(upper) : ADC_DEFAULT_UPPER,
      adcLower: lower !== null ? Number(lower) : ADC_DEFAULT_LOWER,
    }
  } catch {
    return { adcUpper: ADC_DEFAULT_UPPER, adcLower: ADC_DEFAULT_LOWER }
  }
}

const initialSettings = loadSettingValue()
const initialAdcRange = loadAdcRange()
const initialMaxData = maxObj['bed']

// ─── Store 定义 ──────────────────────────────────────────
export const useEquipStore = create((set) => ({
  // 实时数据
  status: {},
  equipStamp: 0,
  displayStatus: {},
  cop: {},

  // 系统配置
  systemType: 'endi',
  systemTypeArr: [],
  displayType: 'all',
  display: 'point3D',

  // 设备状态
  equipStatus: {},
  connectState: 'idle',  // 'idle' | 'connecting' | 'connected' | 'rescanning'
  macInfo: {},              // 设备 MAC 信息 { portPath: { uniqueId, version } }

  // 可视化设置
  settingValue: initialSettings,
  settingValueMax: initialMaxData,
  settingValueOptimal: initialSettings,

  // ADC 颜色范围（0~255，持久化）
  adcUpper: initialAdcRange.adcUpper,
  adcLower: initialAdcRange.adcLower,

  // 框选工具
  selectArr: [],

  // 历史数据
  history: {},
  historyChart: { pressArr: {}, areaArr: {} },
  dataStatus: 'realtime',  // 'realtime' | 'history' | 'contrast'

  // 对比数据
  contrast: {},

  // ─── Actions ─────────────────────────────────────────
  setStatus: (s) => set({ status: s }),
  setEquipStamp: (s) => set({ equipStamp: s }),
  setDisplayStatus: (s) => set({ displayStatus: s }),
  setEquipCop: (s) => set({ cop: s }),

  setSystemType: (s) => set({ systemType: s }),
  setSystemTypeArr: (s) => set({ systemTypeArr: s }),
  setDisplayType: (s) => set({ displayType: s }),
  setDisplay: (s) => set({ display: s }),

  setEquipStatus: (s) => set({ equipStatus: s }),
  setConnectState: (s) => set({ connectState: s }),
  setMacInfo: (s) => set({ macInfo: s }),

  setSettingValue: (s) => set({ settingValue: s }),
  setSettingValueMax: (s) => set({ settingValueMax: s }),
  setSettingValueOptimal: (s) => set({ settingValueOptimal: s }),

  // ADC 范围 setter（自动持久化 + 边界限制）
  setAdcUpper: (v) => {
    const val = Math.min(255, Math.max(0, Number(v)))
    localStorage.setItem('adcUpper', val)
    set({ adcUpper: val })
  },
  setAdcLower: (v) => {
    const val = Math.min(255, Math.max(0, Number(v)))
    localStorage.setItem('adcLower', val)
    set({ adcLower: val })
  },

  setSelectArr: (s) => set({ selectArr: s }),

  setHistoryStatus: (history) => set({ history }),
  setHistoryChart: (s) => set({ historyChart: s }),
  setDataStatus: (s) => set({ dataStatus: s }),

  setContrast: (s) => set({ contrast: s }),
}))

// ─── Getters (用于非 React 上下文) ───────────────────────
export const getStatus = () => useEquipStore.getState().status
export const getsetDisplayStatus = () => useEquipStore.getState().displayStatus
export const getSysType = () => useEquipStore.getState().systemType
export const getSettingValue = () => useEquipStore.getState().settingValue
export const getDisplayType = () => useEquipStore.getState().displayType
export const getSettingValueOptimal = () => useEquipStore.getState().settingValueOptimal
export const getSelectArr = () => useEquipStore.getState().selectArr
export const getAdcUpper = () => useEquipStore.getState().adcUpper
export const getAdcLower = () => useEquipStore.getState().adcLower
