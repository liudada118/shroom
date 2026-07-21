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
    color: 60,
    filter: 200,
    height: 200,
    coherent: 10,
    autoColor: 1
}

export const optimalObj = {
  bed: { gauss: 2, color: 5, filter: 30, height: 80, coherent: 1, autoColor: 1 },
  car: { gauss: 2, color: 5, filter: 30, height: 80, coherent: 1, autoColor: 1 },
  endi: { gauss: 2, color: 5, filter: 30, height: 80, coherent: 1, autoColor: 1 },
  carY: { gauss: 2, color: 5, filter: 30, height: 80, coherent: 1, autoColor: 1 },
  bigHand: { gauss: 2, color: 5, filter: 30, height: 80, coherent: 1, autoColor: 1 },
  hand: { gauss: 2, color: 5, filter: 30, height: 80, coherent: 1, autoColor: 1 }
};

export const maxObj = {
  bed: { gauss: 4, color: 60, filter: 200, height: 200, coherent: 10, autoColor: 1 },
  car: { gauss: 4, color: 60, filter: 200, height: 200, coherent: 10, autoColor: 1 },
  endi: { gauss: 4, color: 60, filter: 200, height: 200, coherent: 10, autoColor: 1 },
  carY: { gauss: 4, color: 60, filter: 200, height: 200, coherent: 10, autoColor: 1 },
  bigHand: { gauss: 4, color: 60, filter: 200, height: 200, coherent: 10, autoColor: 1 },
  hand: { gauss: 4, color: 60, filter: 200, height: 200, coherent: 10, autoColor: 1 }
};

export { lengthObj }
