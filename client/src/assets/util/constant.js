const length32Arr = ['hand', 'bed', 'sit', 'back']
const length64Arr = []

const lengthObj = {}
length32Arr.forEach((file) => {
    lengthObj[file] = 32
})

length64Arr.forEach((file) => {
    lengthObj[file] = 64
})

// const point

const baseMax = {
    gauss: 4,
    color: 255,
    filter: 200,
    height: 200,
    coherent: 10
}

export const optimalObj = {
  bed: { gauss: 3, color: 50, filter: 10, height: 150, coherent: 1 },
  car: { gauss: 3, color: 50, filter: 10, height: 150, coherent: 1 },
  endi: { gauss: 3, color: 50, filter: 10, height: 150, coherent: 1 },
  carY: { gauss: 3, color: 50, filter: 10, height: 150, coherent: 1 },
  bigHand: { gauss: 3, color: 50, filter: 10, height: 150, coherent: 1 },
  hand: { gauss: 3, color: 50, filter: 10, height: 150, coherent: 1 }
};

export const maxObj = {
  bed: { gauss: 4, color: 255, filter: 200, height: 200, coherent: 10 },
  car: { gauss: 4, color: 255, filter: 200, height: 200, coherent: 10 },
  endi: { gauss: 4, color: 255, filter: 200, height: 200, coherent: 10 },
  carY: { gauss: 4, color: 255, filter: 200, height: 200, coherent: 10 },
  bigHand: { gauss: 4, color: 255, filter: 200, height: 200, coherent: 10 },
  hand: { gauss: 4, color: 255, filter: 200, height: 200, coherent: 10 }
};

export { lengthObj }
