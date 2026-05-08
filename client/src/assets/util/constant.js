const length32Arr = ['hand', 'bed', 'sit', 'back']
const length64Arr = []

const lengthObj = {}
length32Arr.forEach((file) => {
    lengthObj[file] = 32
})

length64Arr.forEach((file) => {
    lengthObj[file] = 64
})

// 颜色调节已改用 adcUpper/adcLower（ADC 0~255），此处 color 字段保留兼容性但不再使用
const baseMax = {
    gauss: 4,
    filter: 20,
    height: 8,
    coherent: 10
}

export const optimalObj = {
  bed: { gauss: 2.6, filter: 6, height: 15, coherent: 1 },
  car: { gauss: 2, filter: 0, height: 15, coherent: 1 }
};

export const maxObj = {
  bed: { gauss: 4, filter: 20, height: 50, coherent: 10 },
  car: { gauss: 4, filter: 20, height: 50, coherent: 10 }
};

export { lengthObj }
