import { create } from 'zustand'
import { maxObj } from '../assets/util/constant'
import { loadVisualSettingValue, normalizeVisualSettingMax } from '../util/visualSettingStorage'
import { PRESSURE_METRIC_MODE } from '../util/pressureMetrics'

// ─── 持久化设置值 ────────────────────────────────────────
const DEFAULT_SETTINGS = { gauss: 2, color: 5, filter: 0, height: 80, coherent: 1, autoColor: 1 }
const PRESSURE_METRIC_MODE_STORAGE_KEY = 'pressureMetricMode'

function loadPressureMetricMode() {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(PRESSURE_METRIC_MODE_STORAGE_KEY, PRESSURE_METRIC_MODE)
  }
  return PRESSURE_METRIC_MODE
}

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
  metricStatus: { adc: {}, pressure: {}, force: {} },
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
  pressureMetricMode: loadPressureMetricMode(),

  // 框选工具
  selectArr: [],

  // 历史数据
  history: {},
  historyChart: {
    pressArr: {},
    areaArr: {},
    adcArr: {},
    adcAreaArr: {},
    pressureArr: {},
    forceArr: {},
    pressureAreaArr: {},
    forceAreaArr: {},
  },
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
  setMetricStatus: (s) => set({ metricStatus: s }),
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
  setPressureMetricMode: () => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(PRESSURE_METRIC_MODE_STORAGE_KEY, PRESSURE_METRIC_MODE)
    }
    set({ pressureMetricMode: PRESSURE_METRIC_MODE })
  },

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
export const getSettingValue = () => ({
  ...useEquipStore.getState().settingValue,
  filter: 0,
  gauss: 0,
  coherent: 1,
})
export const getFrameProcessingSettingValue = () => useEquipStore.getState().settingValue
export const getDisplayType = () => useEquipStore.getState().displayType
export const getSettingValueOptimal = () => useEquipStore.getState().settingValueOptimal
export const getSelectArr = () => useEquipStore.getState().selectArr
