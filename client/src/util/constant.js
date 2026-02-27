export const garyColors = [
  [0, 0, 0],
  [17, 17, 17],
  [34, 34, 34],
  [51, 51, 51],
  [68, 68, 68],
  [85, 85, 85],
  // [102, 102, 102],
  // [119, 119, 119],
  // [136, 136, 136],
  // [153, 153, 153],
  // [170, 170, 170],
  // [187, 187, 187],
  // [204, 204, 204],
  // [221, 221, 221],
  // [238, 238, 238],
  // [255, 255, 255],
]

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

export const systemPointConfig = {
  'endi-sit': {
    width: 46,
    height: 46,
    pressFn: (value) => {
      // return value
      let res
      if (value < 45) {
        res = 0.1272433 * value
      } else {
        // res = (-8.8147 * value * value + 831.0279 * value - 18565.0094) / 90
        res = - Math.log(1 - value / 255) * 50
      }
      return Math.round(res*10) / 10
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
      return Math.round(res * 10)/10
    }
  },
}

const point32 = ['car-sit', 'car-back', 'hand', 'bed']
point32.forEach((a) => {
  systemPointConfig[a] = {
    width: 50,
    height: 64
  }
})

export const systemConfig = {
  car: '汽车座椅',
  bed: '床垫',
  chair: '人体工学椅',
  hand: '压力点阵图',
  bigHand: '4096',
  foot: '脚部检测'
}

export const serverAddress = 'https://sensor.bodyta.com'

export const localAddress = 'http://localhost:19245'