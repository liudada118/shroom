import { calMatrixArea } from "../assets/util/selectMatrix";
import { garyColors } from "./constant";

/**
 * 
 * @param {Array} arr 添加边框前的数组
 * @param {number} width 数据矩阵的宽
 * @param {number} height 数据矩阵的高
 * @param {number} wnum 数据矩阵横向插值的长度
 * @param {number} hnum 数据矩阵纵向插值的长度
 * @param {number} sideNum 插值的数字
 * @returns 
 */
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
 * 
 * @param {Array} scl 高斯前的数组
 * @param {number} w 矩阵的宽
 * @param {number} h 矩阵的高
 * @param {number} r 高斯的卷积核
 * @returns 
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


/**
 * 
 * @param {Array} smallMat 插值前的数组
 * @param {number} Length 正方形矩阵的长
 * @param {number} num 插值的倍数
 * @returns 
 */
export function interpSquare(smallMat, Length, num) {
    const res = new Array(Length * num * Length * num).fill(1);

    for (let x = 1; x <= Length; x++) {
        for (let y = 1; y <= Length; y++) {
            res[
                Length * num * (num * (y - 1)) +
                (Length * num * num) / 2 +
                num * (x - 1) +
                num / 2
            ] = smallMat[Length * (y - 1) + x - 1] * 10;
        }
    }

    return res
}


/**
 * 给一个数字 输出一个颜色
 * @param {number} min 自定义颜色最小刻度
 * @param {number} max 自定义颜色最大刻度
 * @param {number} x 真实数值
 * @returns 颜色
 */
export function jet(min, max, x) {
    let red, g, blue;
    let dv;
    red = 1.0;
    g = 1.0;
    blue = 1.0;
    if (x < min) {
        x = min;
    }
    if (x > max) {
        x = max;
    }
    dv = max - min;
    if (x < min + 0.25 * dv) {
        // red = 0;
        // g = 0;
        // blue = 0;

        red = 0;
        g = (4 * (x - min)) / dv;
    } else if (x < min + 0.5 * dv) {
        red = 0;
        blue = 1 + (4 * (min + 0.25 * dv - x)) / dv;
    } else if (x < min + 0.75 * dv) {
        red = (4 * (x - min - 0.5 * dv)) / dv;
        blue = 0;
    } else {
        g = 1 + (4 * (min + 0.75 * dv - x)) / dv;
        blue = 0;
    }
    var rgb = new Array();
    rgb[0] = parseInt(255 * red + '');
    rgb[1] = parseInt(255 * g + '');
    rgb[2] = parseInt(255 * blue + '');
    return rgb;
}



/**
 * 给一个数字 输出一个颜色
 * @param {number} min 自定义颜色最小刻度
 * @param {number} max 自定义颜色最大刻度
 * @param {number} x 真实数值
 * @returns 颜色
 */
export function jetgGrey(min, max, x) {
    if (!x) {
        return garyColors[garyColors.length - 1]
    }
    const length = garyColors.length;
    const count = (max - min) / length;
    const num = Math.floor(x / count) >= length - 1 ? length - 1 : Math.floor(x / count) < 0 ? 0 : Math.floor(x / count);
    // console.log(length,count,x  , num,Math.floor(x / count))
    return garyColors[length - 1 - num];
}

export function colSelectMatrix(className, select, matrixConfig) {

    // console.log(className, select)
    if (!select) return
    if (!matrixConfig) return null
    const canvas = document.querySelector(`.${className}`)
    if (!canvas) return null
    const canvasInfo = canvas.getBoundingClientRect()

    const canvasObj = {
        canvasX1: canvasInfo.left, canvasX2: canvasInfo.right,
        canvasY1: canvasInfo.top, canvasY2: canvasInfo.bottom
    }

    const selectObj = {
        selectX1: select.x1, selectX2: select.x2,
        selectY1: select.y1, selectY2: select.y2
    }



    const matrix = calMatrixArea(canvasObj, selectObj, matrixConfig)

    return matrix

}

export function graCenter(arr, width, height) {
    let rowTotal = [];
    let cloumnTotal = [];
    for (let i = 0; i < height; i++) {
        let a = 0,
            b = 0;
        for (let j = 0; j < width; j++) {
            a += arr[i * width + j];
            // b += arr[i + height * j];
        }
        rowTotal.push(a);
        // cloumnTotal.push(b);
    }

    for (let i = 0; i < width; i++) {
        let b = 0
        for (let j = 0; j < height; j++) {
            // a += arr[i * height + j];
            b += arr[i + j * width];
        }
        cloumnTotal.push(b);
    }
    const xCenter = Number((rowTotal.reduce((acc, v, i) => acc + v * i, 0) / rowTotal.reduce((acc, v, i) => acc + v, 0) / width).toFixed(2))
    const yCenter = Number((1 - (cloumnTotal.reduce((acc, v, i) => acc + v * i, 0) / cloumnTotal.reduce((acc, v, i) => acc + v, 0) / height)).toFixed(2))

    return {
        xCenter: yCenter, yCenter: xCenter
    }
}

// 计算数组的质心（中心）坐标（比例）
export function calcCentroidRatio(arr, width, height, threshold = 0) {
    let sum = 0;
    let sumX = 0;
    let sumY = 0;

    for (let i = 0; i < arr.length; i++) {
        const w = arr[i];

        // 可选：过滤掉小噪声，比如 ADC < 20
        if (w <= threshold) continue;

        const x = i % width;             // 列
        const y = Math.floor(i / width); // 行

        sum += w;
        sumX += x * w;
        sumY += y * w;
    }

    if (sum === 0) {
        // 全是 0 的情况，随便约定一个返回，比如中心
        return { x: 0.5, y: 0.5 };
    }

    const cx = sumX / sum;
    const cy = sumY / sum;

    return {
        // 比例坐标：0~1
        x: (cx / (width - 1)).toFixed(2),
        y: (cy / (height - 1)).toFixed(2)
    };
}




// 计算平均值
export function mean(arr) {
    return arr.reduce((a, b) => a + b, 0) / arr.length;
}
export function variance(arr, m) {
    return arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length;
}
export function stdDev(arr, m) {
    return Math.sqrt(variance(arr, m));
}
export function skewness(arr, m, s) {
    const n = arr.length;
    return (n / ((n - 1) * (n - 2))) *
        arr.reduce((a, b) => a + ((b - m) / s) ** 3, 0);
}
export function kurtosis(arr, m, s) {
    const n = arr.length;
    const sum4 = arr.reduce((a, b) => a + ((b - m) / s) ** 4, 0);
    return (n * (n + 1) * sum4) / ((n - 1) * (n - 2) * (n - 3)) -
        (3 * (n - 1) ** 2) / ((n - 2) * (n - 3));
}
export function normalPDF(x, mean, std) {
    const exponent = -((x - mean) ** 2) / (2 * std ** 2);
    return (1 / (std * Math.sqrt(2 * Math.PI))) * Math.exp(exponent);
}

// -------------------- 计算分布 --------------------
// const μ = mean(data);
// const σ = stdDev(data);
// const xData = Array.from({ length: 256 }, (_, i) => i);  // 横轴 0–255
// const yData = xData.map(x => normalPDF(x, μ, σ));        // 概率密度

// console.log("mean:", μ, "std:", σ);
export function endiSitPressFn(y) {
    const ySplit = 49.77606662;
    const yMax = 98.64822263;
    const realY = y > 300 ? 300 : y
    let res
    // console.log(realY)
    if (realY <= ySplit) {
        // 线性段：y = 84.1215525878 * x  =>  x = y / 84.1215525878
        res = realY / 84.1215525878;
    }

    else if (realY <= yMax) {
        // 指数段：y = 101 - 64.3561 * e^(-0.3857x)
        // 反解：x = -(1 / 0.3857) * ln( (101 - y) / 64.3561 )
        res = -(1 / 0.3857) * Math.log((101 - realY) / 64.3561);
    } else {
        // yMax 对应的 x
        console.log(realY)
        const x0 =
            -(1 / 0.3857) * Math.log((101 - yMax) / 64.3561);

        // 在 yMax 处的斜率 dx/dy
        const slope = 1 / (0.3857 * (101 - yMax));

        // 线性外推到 300
        res = x0 + (realY - yMax) * slope;
    }
    return res / 1.6
}

export function endiBackPressFn(y) {
    const ySplit = 72.28252249;
    const yMax = 142.0380303;

    let res
    const realY = y > 300 ? 300 : y
    // 线性段：y = 119.26628 * x
    if (realY <= ySplit) {
        res = realY / 119.26628;
    }

    // 指数段：y = 145 - 92.1735 * e^(-0.3912 x)
    else if (realY <= yMax) {
        res = -(1 / 0.3912) * Math.log((145 - realY) / 92.1735);
    } else {
        // 分段点的 x
        const x0 =
            -(1 / 0.3912) * Math.log((145 - yMax) / 92.1735);

        // 指数段在 yMax 处的斜率 dx/dy
        const slope = 1 / (0.3912 * (145 - yMax)); // ≈ 0.864

        // 线性外推
        res = x0 + (realY - yMax) * slope;
    }

    return res / 1.6

    // 超出范围你可以钳制，也可以报错，这里先用钳制：
    // res= -(1 / 0.3912) * Math.log((145 - yMax) / 92.1735);
}

export function backYToX(y) {
    if (!Number.isFinite(y)) return 0;

    // 饱和平台
    if (y >= 108) return 25;

    // 下限保护，看你需不需要，可以改阈值
    if (y <= 6) return 0;

    return Math.exp((y - 25.6628) / 25.26) - 0.362;
}

export function sitYToX(y) {
    if (!Number.isFinite(y)) return 0;

    // 饱和平台
    if (y >= 90) return 25;

    // 下限保护（可以按你实际业务调）
    if (y <= 0) return 0;

    return Math.exp((y - 38.2932) / 15.76) - 0.088;
}