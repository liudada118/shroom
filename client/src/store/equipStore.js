import { create } from 'zustand'
import { maxObj } from '../assets/util/constant'
import { loadVisualSettingValue, normalizeVisualSettingMax } from '../util/visualSettingStorage'

// ─── 持久化设置值 ────────────────────────────────────────
const DEFAULT_SETTINGS = { gauss: 1, color: 180, filter: 1, height: 10, coherent: 1 }

function loadSettingValue() {
  return loadVisualSettingValue('default', DEFAULT_SETTINGS, maxObj.bed)
}

const initialSettings = loadSettingValue()
const initialMaxData = normalizeVisualSettingMax(maxObj['bed'])

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
  connectState: 'idle',  // 'idle' | 'connecting' | 'connected' | 'rescanning' | 'failed' | 'deviceError'
  connectionError: null,
  macInfo: {},              // 设备 MAC 信息 { portPath: { uniqueId, version } }
  dataQuality: {},          // 数据质量状态 { type/port: dataQuality }

  // 可视化设置
  settingValue: initialSettings,
  settingValueMax: initialMaxData,
  settingValueOptimal: initialSettings,
  num2DZoom: 100,

  // 框选工具
  selectArr: [],

  // 历史数据
  history: {},
  historyChart: { pressArr: {}, areaArr: {} },
  dataStatus: 'realtime',  // 'realtime' | 'history' | 'replay' | 'contrast'
  playbackHasSelection: false,
  playbackRecordDate: '',
  collecting: false,

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
  setConnectionError: (s) => set({ connectionError: s }),
  setMacInfo: (s) => set({ macInfo: s }),
  setDataQuality: (s) => set({ dataQuality: s }),

  setSettingValue: (s) => set({ settingValue: s }),
  setSettingValueMax: (s) => set({ settingValueMax: s }),
  setSettingValueOptimal: (s) => set({ settingValueOptimal: s }),
  setNum2DZoom: (s) => set({ num2DZoom: s }),

  setSelectArr: (s) => set({ selectArr: s }),

  setHistoryStatus: (history) => set({ history }),
  setHistoryChart: (s) => set({ historyChart: s }),
  setDataStatus: (s) => set({ dataStatus: s }),
  setPlaybackHasSelection: (s) => set({ playbackHasSelection: Boolean(s) }),
  setPlaybackRecordDate: (s) => set({ playbackRecordDate: s || '' }),
  setCollecting: (s) => set({ collecting: Boolean(s) }),

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
