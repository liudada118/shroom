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
    color: 500,
    filter: 20,
    height: 200,
    coherent: 10
}

export const optimalObj = {
  bed: { gauss: 2.6, color: 355, filter: 6, height: 10, coherent: 1 },
  car: { gauss: 2, color: 495, filter: 0, height: 10, coherent: 1 },
  endi: { gauss: 2, color: 495, filter: 0, height: 10, coherent: 1 },
  carY: { gauss: 2, color: 495, filter: 0, height: 10, coherent: 1 },
  bigHand: { gauss: 2, color: 495, filter: 0, height: 10, coherent: 1 },
  hand: { gauss: 2, color: 495, filter: 0, height: 10, coherent: 1 }
};

export const maxObj = {
  bed: { gauss: 4, color: 500, filter: 20, height: 200, coherent: 10 },
  car: { gauss: 4, color: 500, filter: 20, height: 200, coherent: 10 },
  endi: { gauss: 4, color: 500, filter: 20, height: 200, coherent: 10 },
  carY: { gauss: 4, color: 500, filter: 20, height: 200, coherent: 10 },
  bigHand: { gauss: 4, color: 500, filter: 20, height: 200, coherent: 10 },
  hand: { gauss: 4, color: 500, filter: 20, height: 200, coherent: 10 }
};

export { lengthObj }
