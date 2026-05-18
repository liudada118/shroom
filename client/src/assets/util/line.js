export function lineInterp(smallMat, width, height, interp1, interp2) {

  const bigMat = new Array((width * interp1) * (height * interp2)).fill(0)
  // return bigMat
  for (let i = 0; i < height; i++) {
    for (let j = 0; j < width - 1; j++) {
      const realValue = smallMat[i * width + j] 
      const rowValue = smallMat[i * width + j + 1]  ? smallMat[i * width + j + 1]  : 0
      const colValue = smallMat[(i + 1) * width + j]  ? smallMat[(i + 1) * width + j]  : 0
      bigMat[(width * interp1) * i * interp2 + (j * interp1)
      ] = smallMat[i * width + j] 
      // for (let k = 0; k < interp1; k++) {
      //   // for (let z = 0; z < interp2; z++) {
      //   //   bigMat[(width * interp1) * (i * interp2 + k) + ((j * interp1) + z)
      //   //   ] = smallMat[i * width + j] * 10
      //   // }
      // }

      // for (let k = 0; k < interp2; k++) {
      //   bigMat[(width * interp1) * (i * interp2 + k) + ((j * interp1))] = realValue + (colValue - realValue) * (k) / interp2
      // }
      for (let k = 0; k < interp1; k++) {
        bigMat[(width * interp1) * (i * interp2) + ((j * interp1 + k))] = realValue + (rowValue - realValue) * (k) / interp1
      }
    }
  }

  const newWidth = width * interp1

  for (let i = 0; i < height; i++) {
    for (let j = 0; j < newWidth; j++) {
      const realValue = bigMat[i * interp2 * newWidth + j]
      // const rowValue = bigMat[i * width + j + 1] * 10 ? bigMat[i * width + j + 1] * 10 : 0
      // const colValue = bigMat[(i + 1) * width + j] * 10 ? bigMat[(i + 1) * width + j] * 10 : 0
      const colValue = bigMat[((i + 1) * interp2) * newWidth + j] ? bigMat[(((i + 1) * interp2) ) * newWidth + j] : 0
      for (let k = 0; k < interp2; k++) {
        bigMat[newWidth * (i * interp2 + k) + ((j))] = realValue + (colValue - realValue) * (k) / interp2
      }
    }
  }
  for (let i = 0; i < width * interp1; i++) {
    for (let j = 0; j < width * interp1; j++) {

    }
  }
  return bigMat
}

export function addSide(arr, width, height, wnum, hnum, sideNum = 0) {

  let narr = new Array(height);
  let res = [];
  for (let i = 0; i < height; i++) {
    narr[i] = [];

    for (let j = 0; j < width; j++) {
      if (j == 0) {
        narr[i].push(
          ...new Array(wnum).fill(sideNum >= 0 ? sideNum : 1),
          arr[i * width + j]
        );
      } else if (j == width - 1) {
        narr[i].push(
          arr[i * width + j],
          ...new Array(wnum).fill(sideNum >= 0 ? sideNum : 1)
        );
      } else {
        narr[i].push(arr[i * width + j]);
      }
    }
  }
  for (let i = 0; i < height; i++) {
    res.push(...narr[i]);
  }

  return [
    ...new Array(hnum * (width + 2 * wnum)).fill(sideNum >= 0 ? sideNum : 1),
    ...res,
    ...new Array(hnum * (width + 2 * wnum)).fill(sideNum >= 0 ? sideNum : 1),
  ];
}

/**
 * 高斯return
 * @param {*} scl 
 * @param {*} tcl 
 * @param {*} w 
 * @param {*} h 
 * @param {*} r 
 */
export function gaussBlur_return(scl, w, h, r) {
  const res = new Array(scl.length).fill(1)
  var rs = Math.ceil(r * 2.57); // significant radius
  for (var i = 0; i < h; i++) {
    for (var j = 0; j < w; j++) {
      var val = 0,
        wsum = 0;
      for (var iy = i - rs; iy < i + rs + 1; iy++)
        for (var ix = j - rs; ix < j + rs + 1; ix++) {
          var x = Math.min(w - 1, Math.max(0, ix));
          var y = Math.min(h - 1, Math.max(0, iy));
          var dsq = (ix - j) * (ix - j) + (iy - i) * (iy - i);
          var wght = Math.exp(-dsq / (2 * r * r)) / (Math.PI * 2 * r * r);
          val += scl[y * w + x] * wght;
          wsum += wght;
        }
      res[i * w + j] = Math.round(val / wsum);
    }
  }
  return res
}


export function jetWhite3(min, max, x) {
  return jetFromPalette(rainbowTextColorsxy, min, max, x)
}

function jetFromPalette(palette, min, max, x) {
  const value = Number(x);
  if (!Number.isFinite(value) || value <= 0) {
    return palette[palette.length - 1]
  }

  const minValue = Number.isFinite(Number(min)) ? Number(min) : 0;
  const maxValue = Number.isFinite(Number(max)) && Number(max) > minValue ? Number(max) : minValue + 1;
  const ratio = Math.max(0, Math.min(1, (value - minValue) / (maxValue - minValue)));
  const index = Math.round((1 - ratio) * (palette.length - 1));
  return palette[index];
}

export function jetWhite3NoWhite(min, max, x) {
  return jetFromPalette(rainbowTextColorsxyNoWhite, min, max, x)
}

export const rainbowTextColorsxy = [
  [255, 0, 0],
  [255, 69, 0],
  [255, 136, 0],
  [255, 170, 0],
  [255, 204, 0],
  [255, 255, 0],
  [204, 255, 0],
  [153, 255, 0],
  [102, 255, 0],
  [51, 255, 0],
  [0, 255, 0],
  [0, 255, 51],
  [0, 255, 102],
  [0, 255, 153],
  [0, 255, 204],
  [0, 255, 255],
  [0, 204, 255],
  [0, 153, 255],
  ...new Array(5).fill([0, 102, 255]),
  [255, 255, 255],
  [255, 255, 255],
  [255, 255, 255],
];

export const rainbowTextColorsxyNoWhite = rainbowTextColorsxy.slice(0, -3);
export const NUMBER_TEXT_COLOR_ALPHA = 0.72;
export const pressurePointColors = rainbowTextColorsxy;
