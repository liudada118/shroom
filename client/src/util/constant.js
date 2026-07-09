// ─── 颜色配置 ────────────────────────────────────────────
export const garyColors = [
  [0, 0, 0],
  [17, 17, 17],
  [34, 34, 34],
  [51, 51, 51],
  [68, 68, 68],
  [85, 85, 85],
]

// ─── 传感器点阵配置 ──────────────────────────────────────
export const pointConfig = {
  endi: {
    back: {
      pointLength: 64,
      pointWidthDistance: 13,
      pointHeightDistance: 10,
    },
    sit: {
      pointLength: 46,
      pointWidthDistance: 10,
      pointHeightDistance: 10,
    },
    jacket: {
      pointLength: 27,
      pointWidthDistance: 10,
      pointHeightDistance: 10,
    },
    leftHand: {
      pointLength: 18,
      pointWidthDistance: 10,
      pointHeightDistance: 10,
    },
    rightHand: {
      pointLength: 18,
      pointWidthDistance: 10,
      pointHeightDistance: 10,
    },
    leftFoot: {
      pointLength: 32,
      pointWidthDistance: 10,
      pointHeightDistance: 10,
    },
    rightFoot: {
      pointLength: 32,
      pointWidthDistance: 10,
      pointHeightDistance: 10,
    },
    foot: {
      pointLength: 64,
      pointWidthDistance: 10,
      pointHeightDistance: 10,
    },
  },
  carY: {
    back: {
      pointLength: 32,
      pointWidthDistance: 10,
      pointHeightDistance: 19,
    },
    sit: {
      pointLength: 32,
      pointWidthDistance: 15,
      pointHeightDistance: 15,
    },
  }
}

// ─── 系统点阵配置（含压力转换函数）─────────────────────────
export const systemPointConfig = {
  'endi-sit': {
    width: 46,
    height: 46,
    pressFn: (value) => {
      let res
      if (value < 45) {
        res = 0.1272433 * value
      } else {
        res = -Math.log(1 - value / 255) * 50
      }
      return Math.round(res * 10) / 10
    }
  },
  'endi-back': {
    width: 50,
    height: 64,
    pressFn: (value) => {
      let res
      if (value < 26) {
        res = 0.09697 * value
      } else {
        res = (2.4697 * value * value - 129.1118 * value + 1846.2435) / 60
      }
      return Math.round(res * 10) / 10
    }
  },
}

Object.assign(systemPointConfig, {
  'endi-jacket': { width: 24, height: 54 },
  'endi-leftHand': { width: 36, height: 4 },
  'endi-rightHand': { width: 36, height: 4 },
  'endi-leftFoot': { width: 12, height: 64 },
  'endi-rightFoot': { width: 12, height: 64 },
  'endi-foot': { width: 24, height: 64 },
})

// 32x32 矩阵系统统一配置
const point32Systems = [
  'car-sit',
  'car-back',
  'hand',
  'bed',
  'carY-sit',
  'carY-back',
]
point32Systems.forEach((name) => {
  systemPointConfig[name] = {
    width: 32,
    height: 32
  }
})

export const systemMatrixParts = {
  endi: [
    { key: 'jacket', labelKey: 'jacketPad', display2D: 'jacket2D' },
    { key: 'leftHand', labelKey: 'leftHandPad', display2D: 'leftHand2D' },
    { key: 'rightHand', labelKey: 'rightHandPad', display2D: 'rightHand2D' },
    { key: 'foot', labelKey: 'footPad', display2D: 'foot2D' },
  ],
  carY: [
    { key: 'back', labelKey: 'backPad', display2D: 'back2D', display3D: 'back3D', supportsModel3D: true },
    { key: 'sit', labelKey: 'seatPad', display2D: 'sit2D', display3D: 'sit3D', supportsModel3D: true },
  ],
  car: [
    { key: 'back', labelKey: 'backPad', display2D: 'back2D', display3D: 'back3D', supportsModel3D: true },
    { key: 'sit', labelKey: 'seatPad', display2D: 'sit2D', display3D: 'sit3D', supportsModel3D: true },
  ],
}

export const getMatrixPartFromDisplayType = (displayType = '') => {
  const normalized = String(displayType || '')
  return normalized.replace(/(2D|3D)$/i, '')
}

const MATRIX_DISPLAY_LABELS = {
  zh: {
    endi: '假人全身',
    'endi-back': '靠背',
    'endi-sit': '坐垫',
    'endi-jacket': '上身',
    'endi-leftHand': '左臂',
    'endi-rightHand': '右臂',
    'endi-leftFoot': '左腿',
    'endi-rightFoot': '右腿',
    'endi-foot': '下身',
    back: '靠背',
    sit: '坐垫',
    jacket: '上身',
    leftHand: '左臂',
    rightHand: '右臂',
    leftFoot: '左腿',
    rightFoot: '右腿',
    foot: '下身',
  },
  en: {
    endi: 'Full Body',
    'endi-back': 'Back',
    'endi-sit': 'Seat',
    'endi-jacket': 'Upper body',
    'endi-leftHand': 'Left arm',
    'endi-rightHand': 'Right arm',
    'endi-leftFoot': 'Left leg',
    'endi-rightFoot': 'Right leg',
    'endi-foot': 'Lower body',
    back: 'Back',
    sit: 'Seat',
    jacket: 'Upper body',
    leftHand: 'Left arm',
    rightHand: 'Right arm',
    leftFoot: 'Left leg',
    rightFoot: 'Right leg',
    foot: 'Lower body',
  },
}

export const getMatrixDisplayLabel = (key = '', language = 'zh') => {
  const lang = String(language || '').toLowerCase().startsWith('en') ? 'en' : 'zh'
  const text = String(key || '')
  if (!text) return lang === 'en' ? 'Sensor' : '传感器'
  const labels = MATRIX_DISPLAY_LABELS[lang] || MATRIX_DISPLAY_LABELS.zh
  if (labels[text]) return labels[text]
  if (text.includes('-')) {
    const part = text.split('-').pop()
    if (labels[part]) return labels[part]
  }
  return text.replace(/endi-?/ig, '').replace(/car-?/ig, '') || (lang === 'en' ? 'Sensor' : '传感器')
}

export const getSystemMatrixParts = (system) => {
  const configured = systemMatrixParts[system]
  if (!configured) return []
  return configured.filter((part) => systemPointConfig[`${system}-${part.key}`])
}

export const getMatrixKeyForDisplay = (system, displayType) => {
  const part = getMatrixPartFromDisplayType(displayType)
  if (!system || !part) return ''
  const key = `${system}-${part}`
  return systemPointConfig[key] ? key : ''
}

export const getMatrixPartLabelKey = (part) => {
  const labelMap = {
    back: 'backPad',
    sit: 'seatPad',
    jacket: 'jacketPad',
    leftHand: 'leftHandPad',
    rightHand: 'rightHandPad',
    leftFoot: 'leftFootPad',
    rightFoot: 'rightFootPad',
    foot: 'footPad',
  }
  return labelMap[part] || part
}

// ─── 系统名称映射 ────────────────────────────────────────
export const systemConfig = {
  car: '汽车座椅',
  carY: '汽车座椅Y',
  bed: '床垫',
  chair: '人体工学椅',
  hand: '压力点阵图',
  bigHand: '4096',
  foot: '脚部检测'
}

// ─── 服务地址配置 ────────────────────────────────────────
export const serverAddress = import.meta.env.VITE_SERVER_ADDRESS || 'https://sensor.bodyta.com'

// 动态端口配置：从 portConfig 统一管理，支持端口冲突自动分配
export { localAddress, wsAddress } from './portConfig'
