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

// 32x32 矩阵系统统一配置
const point32Systems = ['car-sit', 'car-back', 'hand', 'bed']
point32Systems.forEach((name) => {
  systemPointConfig[name] = {
    width: 50,
    height: 64
  }
})

// ─── 系统名称映射 ────────────────────────────────────────
export const systemConfig = {
  car: '汽车座椅',
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
