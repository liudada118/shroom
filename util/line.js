function hand(arr) {
    let wsPointData = [...arr];
    // 1-15行调换
    for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 32; j++) {
            [wsPointData[i * 32 + j], wsPointData[(14 - i) * 32 + j]] = [
                wsPointData[(14 - i) * 32 + j],
                wsPointData[i * 32 + j],
            ];
        }
    }

    let b = wsPointData.splice(0, 15 * 32);

    wsPointData = wsPointData.concat(b);

    for (let i = 0; i < 32; i++) {
        for (let j = 0; j < 16; j++) {
            [wsPointData[i * 32 + j], wsPointData[i * 32 + 31 - j]] = [wsPointData[i * 32 + 31 - j], wsPointData[i * 32 + j],]
        }
    }
    // wsPointData = press6(wsPointData, 32, 32, 'col')
    return wsPointData
}

function jqbed(arr) {
    let wsPointData = [...arr];
    // 1-15行调换
    for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 32; j++) {
            [wsPointData[i * 32 + j], wsPointData[(14 - i) * 32 + j]] = [
                wsPointData[(14 - i) * 32 + j],
                wsPointData[i * 32 + j],
            ];
        }
    }

    let b = wsPointData.splice(0, 15 * 32);

    wsPointData = wsPointData.concat(b);
    // wsPointData = press6(wsPointData, 32, 32, 'col')
    return wsPointData
}

function arrToRealLine(arr, arrX, arrY, matrixLength) {
    const realX = [], realY = []
    arrX.forEach((a) => {
        if (Array.isArray(a)) {
            // for(let i = )
            if (a[0] > a[1]) {
                for (let i = a[0]; i >= a[1]; i--) {
                    realX.push(i)
                }
            } else {
                for (let i = a[0]; i <= a[1]; i++) {
                    realX.push(i)
                }
            }
        } else {
            realX.push(a)
        }
    })

    arrY.forEach((a) => {
        if (Array.isArray(a)) {
            // for(let i = )
            if (a[0] > a[1]) {
                for (let i = a[0]; i >= a[1]; i--) {
                    realY.push(i)
                }
            } else {
                for (let i = a[0]; i <= a[1]; i++) {
                    realY.push(i)
                }
            }
        } else {
            realY.push(a)
        }
    })

    let newArr = []
    for (let i = 0; i < realY.length; i++) {
        for (let j = 0; j < realX.length; j++) {
            const realXCoo = realY[i]
            const realYCoo = realX[j]
            newArr.push(arr[realXCoo * matrixLength + realYCoo])
        }
    }

    return newArr
}


// endi 1.0
// function endiSit(arr) {
//     let arrX = [[22, 0], [23, 44]]
//     let arrY = [[1, 32], 0, [63, 63 - 11]]

//     function rotate90(arr, height, width) {
//         //逆时针旋转 90 度
//         //列 = 行
//         //行 = n - 1 - 列(j);  n表示总行数
//         let matrix = [];
//         for (let i = 0; i < height; i++) {
//             matrix[i] = [];
//             for (let j = 0; j < width; j++) {
//                 matrix[i].push(arr[i * height + j]);
//             }
//         }

//         var temp = [];
//         var len = matrix.length;
//         for (var i = 0; i < len; i++) {
//             for (var j = 0; j < len; j++) {
//                 var k = len - 1 - j;
//                 if (!temp[k]) {
//                     temp[k] = [];
//                 }
//                 temp[k][i] = matrix[i][j];
//             }
//         }
//         let res = [];
//         for (let i = 0; i < temp.length; i++) {
//             res = res.concat(temp[i]);
//         }
//         return res;
//     }
//     let newArr = arrToRealLine(arr, arrX, arrY)
//     newArr = rotate90(newArr, 45, 45)
//     return newArr

// }

// endi 2.0

function endiSit(arr) {
    let arrX = [[63, 19]]
    let arrY = [[20, 32], 0, [63, 56], [33, 55]]

    let newArr = arrToRealLine(arr, arrX, arrY)
    // newArr = rotate90(newArr, 45, 45)
    return newArr

}



function endiBack(arr) {
    let arrX = [[14, 63]]
    let arrY = [[0, 63]]
    // 线序旋转180度
    return arrToRealLine(arr, arrX, arrY).reverse()
}
// endiSit()

function lineInterp(smallMat, width, height, interp1, interp2) {

    let bigMat = new Array((width * interp1) * (height * interp2)).fill(0)
    const interpValue = 1
    // return bigMat
    for (let i = 0; i < height; i++) {
        for (let j = 0; j < width; j++) {
            const realValue = smallMat[i * width + j] * interpValue
            const rowValue = j == width - 1 ? 0 : smallMat[i * width + j + 1] * interpValue ? smallMat[i * width + j + 1] * interpValue : 0
            const colValue = smallMat[(i + 1) * width + j] * interpValue ? smallMat[(i + 1) * width + j] * interpValue : 0
            bigMat[(width * interp1) * i * interp2 + (j * interp1)
            ] = smallMat[i * width + j] * interpValue
            // for (let k = 0; k < interp1; k++) {
            //   // for (let z = 0; z < interp2; z++) {
            //   //   bigMat[(width * interp1) * (i * interp2 + k) + ((j * interp1) + z)
            //   //   ] = smallMat[i * width + j] * interpValue
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

    // return bigMat

    const newWidth = width * interp1

    for (let i = 0; i < height; i++) {
        for (let j = 0; j < newWidth; j++) {
            const realValue = bigMat[i * interp2 * newWidth + j]
            // const rowValue = bigMat[i * width + j + 1] * interpValue ? bigMat[i * width + j + 1] * interpValue : 0
            // const colValue = bigMat[(i + 1) * width + j] * interpValue ? bigMat[(i + 1) * width + j] * interpValue : 0
            const colValue = bigMat[((i + 1) * interp2) * newWidth + j] ? bigMat[(((i + 1) * interp2)) * newWidth + j] : 0
            for (let k = 0; k < interp2; k++) {
                bigMat[newWidth * (i * interp2 + k) + ((j))] = realValue + (colValue - realValue) * (k) / interp2
            }
        }
    }


    bigMat = bigMat.map((a) => parseInt(a))
    return bigMat
}

function press(arr, width, height, value, prop, type = "row") {
    let wsPointData = [...arr];

    if (type == "row") {
        let colArr = [];
        for (let i = 0; i < height; i++) {
            let total = 0;
            for (let j = 0; j < width; j++) {
                total += wsPointData[i * width + j];
            }
            colArr.push(total);
        }
        // //////okok
        for (let i = 0; i < height; i++) {
            for (let j = 0; j < width; j++) {
                wsPointData[i * width + j] = parseInt(
                    (wsPointData[i * width + j] /
                        (value - colArr[i] <= 0 ? 1 : value - colArr[i])) *
                    1000 * prop
                );
            }
        }
    } else {
        let colArr = [];
        for (let i = 0; i < height; i++) {
            let total = 0;
            for (let j = 0; j < width; j++) {
                total += wsPointData[j * height + i];
            }
            colArr.push(total);
        }
        // //////okok

        // console.log(first)

        for (let i = 0; i < height; i++) {
            for (let j = 0; j < width; j++) {
                wsPointData[j * height + i] = parseInt(
                    (wsPointData[j * height + i] /
                        (value - colArr[i] <= 0 ? 1 : value - colArr[i])) *
                    1000 * prop
                );
            }
        }
    }

    //////

    // wsPointData = wsPointData.map((a,index) => {return calculateY(a)})
    return wsPointData;
}

function endiSit1024(arr) {
    let arrX = [[22, 0]]
    // let arrY = [[11, 22], [10, 0]]
    let arrY = [[0, 10], [22, 11]]

    // const pressArr = press([...arr], 32, 32, 700, 0.2, 'col')

    const pressArr = [...arr]//pressNew1220({ arr: arr, width: 32, height: 32, type: 'col', value: 683 })


    let newArr = arrToRealLine(pressArr, arrX, arrY, 32)
    // console.log(JSON.stringify(newArr))
    newArr = lineInterp(newArr, 23, 23, 2, 2)



    const yArr = []
    for (let i = 0; i < 46; i++) {
        yArr.push(45 - i)
    }

    const res = []
    for (let i = 0; i < 46; i++) {
        for (let j = 0; j < 46; j++) {
            const width = yArr[i]
            res.push(newArr[width * 46 + 45 - j])
        }
    }
 

    // newArr = rotate90(newArr, 45, 45)

    // console.log(newArr.length)
    return res
}

function endiBack1024(arr) {
    const sourceWidth = 32
    const lowWidth = 25
    const lowHeight = 32
    const scale = 2
    const lowMatrix = new Array(lowWidth * lowHeight).fill(0)
    const readSource = (row, col) => {
        const value = arr[row * sourceWidth + col]
        const numericValue = Number(value)
        return Number.isFinite(numericValue) ? numericValue : 0
    }

    const writeMappedRow = (lowRow, sourceRow, sourceStartCol, count, lowStartCol) => {
        for (let i = 0; i < count; i++) {
            const index = lowRow * lowWidth + lowStartCol + i
            lowMatrix[index] = readSource(sourceRow, sourceStartCol - i)
        }
    }

    for (let sourceRow = 15; sourceRow <= 23; sourceRow++) {
        writeMappedRow(sourceRow - 15, sourceRow, 16, 11, 7)
    }

    for (let sourceRow = 24; sourceRow <= 31; sourceRow++) {
        writeMappedRow(9 + sourceRow - 24, sourceRow, 24, 25, 0)
    }

    for (let sourceRow = 14; sourceRow >= 0; sourceRow--) {
        writeMappedRow(17 + (14 - sourceRow), sourceRow, 24, 25, 0)
    }

    const interpolated = lineInterp(lowMatrix, lowWidth, lowHeight, scale, scale)
    const displayWidth = lowWidth * scale
    const displayHeight = lowHeight * scale
    return interpolated.map((value, index) => {
        const row = Math.floor(index / displayWidth)
        const col = index % displayWidth
        const isTopPadding = row < 18 && (col < 14 || col > 34)
        return isTopPadding ? 0 : value
    })
}

function readMappedValue(arr, index) {
    const rawIndex = Number(index)
    if (!Number.isFinite(rawIndex) || rawIndex <= 0) return 0
    const value = Number(arr[rawIndex - 1])
    return Number.isFinite(value) ? value : 0
}

function mapIndexMatrix(arr, indexMatrix, options = {}) {
    const source = Array.isArray(arr) ? arr : []
    const shouldReverseJqbed = options.reverseJqbed !== false
    const result = []
    indexMatrix.forEach((row) => {
        row.forEach((index) => {
            result.push(readMappedValue(source, shouldReverseJqbed ? reverseJqbedIndexValue(index) : index))
        })
    })
    return result
}

function jqbedReverseIndex(index) {
    const rowSize = 32
    const totalRows = 32
    const movedRowCount = totalRows - 15
    const numericIndex = Number(index)

    if (!Number.isInteger(numericIndex) || numericIndex < 0 || numericIndex >= rowSize * totalRows) {
        return -1
    }

    const row = Math.floor(numericIndex / rowSize)
    const col = numericIndex % rowSize
    const sourceRow = row < movedRowCount ? row + 15 : totalRows - 1 - row

    return sourceRow * rowSize + col
}

function reverseJqbedIndexValue(value) {
    const numericValue = Number(value)
    if (!Number.isInteger(numericValue) || numericValue <= 0) return value
    const sourceIndex = jqbedReverseIndex(numericValue - 1)
    return sourceIndex >= 0 ? sourceIndex + 1 : value
}

const ENDI_LEFT_FOOT_INDEX_MATRIX = [
    [998, 997, 996, 995, null, null],
    [966, 965, 964, 963, null, null],
    [934, 933, 932, 931, null, null],
    [902, 901, 900, 899, null, null],
    [870, 869, 868, 867, null, null],
    [838, 837, 836, 835, null, null],
    [806, 805, 804, 803, null, null],
    [774, 773, 772, 771, null, null],
    [742, 741, 740, 739, 738, 737],
    [710, 709, 708, 707, 706, 705],
    [678, 677, 676, 675, 674, 673],
    [646, 645, 644, 643, 642, 641],
    [614, 613, 612, 611, 610, 609],
    [582, 581, 580, 579, 578, 577],
    [550, 549, 548, 547, 546, 545],
    [6, 5, 4, 3, null, null],
    [38, 37, 36, 35, null, null],
    [70, 69, 68, 67, null, null],
    [102, 101, 100, 99, null, null],
    [134, 133, 132, 131, null, null],
    [166, 165, 164, 163, null, null],
    [198, 197, 196, 195, null, null],
    [230, 229, 228, 227, null, null],
    [262, 261, 260, 259, null, null],
    [294, 293, 292, 291, null, null],
    [326, 325, 324, 323, null, null],
    [358, 357, 356, 355, null, null],
    [390, 389, 388, 387, null, null],
    [422, 421, 420, 419, null, null],
    [454, 453, 452, 451, null, null],
    [486, 485, 484, 483, null, null],
    [518, 517, 516, 515, null, null],
]

const ENDI_RIGHT_FOOT_INDEX_MATRIX = [
    [516, 515, 514, 513, null, null],
    [484, 483, 482, 481, null, null],
    [452, 451, 450, 449, null, null],
    [420, 419, 418, 417, null, null],
    [388, 387, 386, 385, null, null],
    [356, 355, 354, 353, null, null],
    [324, 323, 322, 321, null, null],
    [292, 291, 290, 289, null, null],
    [262, 261, 260, 259, 258, 257],
    [230, 229, 228, 227, 226, 225],
    [198, 197, 196, 195, 194, 193],
    [166, 165, 164, 163, 162, 161],
    [134, 133, 132, 131, 130, 129],
    [102, 101, 100, 99, 98, 97],
    [70, 69, 68, 67, 66, 65],
    [36, 35, 34, 33, null, null],
    [4, 3, 2, 1, null, null],
    [548, 547, 546, 545, null, null],
    [580, 579, 578, 577, null, null],
    [612, 611, 610, 609, null, null],
    [644, 643, 642, 641, null, null],
    [676, 675, 674, 673, null, null],
    [708, 707, 706, 705, null, null],
    [740, 739, 738, 737, null, null],
    [772, 771, 770, 769, null, null],
    [804, 803, 802, 801, null, null],
    [836, 835, 834, 833, null, null],
    [868, 867, 866, 865, null, null],
    [900, 899, 898, 897, null, null],
    [932, 931, 930, 929, null, null],
    [964, 963, 962, 961, null, null],
    [996, 995, 994, 993, null, null],
]

const ENDI_SLEEVE_INDEX_MATRIX = [
    [737, 769, 801, 833, 865, 897, 929, 961, 993, 705, 673, 641, 609, 577, 545, 1, 33, 65],
    [738, 770, 802, 834, 866, 898, 930, 962, 994, 706, 674, 642, 610, 578, 546, 2, 34, 66],
]

const ENDI_JACKET_HEAD_INDEX_MATRIX = [
    [993, 994, 995, 996, 997, 998, 999, 1000, 1001, null, null, null],
    [961, 962, 963, 964, 965, 966, 967, 968, 969, null, null, null],
    [865, 866, 867, 868, 869, 870, 871, 872, 873, null, null, null],
    [897, 898, 899, 900, 901, 902, 903, 904, 905, null, null, null],
    [929, 930, 931, 932, 933, 934, 935, 936, 937, null, null, null],
]

const ENDI_JACKET_BACK_INDEX_MATRIX = [
    [842, 843, 844, 845, 846, 847, 848, 849, 850, 851, 852, 853],
    [810, 811, 812, 813, 814, 815, 816, 817, 818, 819, 820, 821],
    [778, 779, 780, 781, 782, 783, 784, 785, 786, 787, 788, 789],
    [746, 747, 748, 749, 750, 751, 752, 753, 754, 755, 756, 757],
    [714, 715, 716, 717, 718, 719, 720, 721, 722, 723, 724, 725],
    [682, 683, 684, 685, 686, 687, 688, 689, 690, 691, 692, 693],
    [650, 651, 652, 653, 654, 655, 656, 657, 658, 659, 660, 661],
    [618, 619, 620, 621, 622, 623, 624, 625, 626, 627, 628, 629],
    [362, 363, 364, 365, 366, 367, 368, 369, 370, 371, 372, 373],
    [330, 331, 332, 333, 334, 335, 336, 337, 338, 339, 340, 341],
    [298, 299, 300, 301, 302, 303, 304, 305, 306, 307, 308, 309],
    [266, 267, 268, 269, 270, 271, 272, 273, 274, 275, 276, 277],
    [234, 235, 236, 237, 238, 239, 240, 241, 242, 243, 244, 245],
    [202, 203, 204, 205, 206, 207, 208, 209, 210, 211, 212, 213],
    [170, 171, 172, 173, 174, 175, 176, 177, 178, 179, 180, 181],
    [138, 139, 140, 141, 142, 143, 144, 145, 146, 147, 148, 149],
    [106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117],
    [74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85],
    [42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53],
    [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21],
    [554, 555, 556, 557, 558, 559, 560, 561, 562, 563, 564, 565],
    [586, 587, 588, 589, 590, 591, 592, 593, 594, 595, 596, 597],
]

const ENDI_JACKET_INDEX_MATRIX = [
    ...ENDI_JACKET_HEAD_INDEX_MATRIX,
    ...ENDI_JACKET_BACK_INDEX_MATRIX,
]

function endiLeftFootWear1024(arr) {
    return mapIndexMatrix(arr, ENDI_LEFT_FOOT_INDEX_MATRIX)
}

function endiRightFootWear1024(arr) {
    return mapIndexMatrix(arr, ENDI_RIGHT_FOOT_INDEX_MATRIX)
}

function endiSleeveWear1024(arr) {
    return mapIndexMatrix(arr, ENDI_SLEEVE_INDEX_MATRIX)
}

function endiJacketWear1024(arr) {
    return mapIndexMatrix(arr, ENDI_JACKET_INDEX_MATRIX)
}

function endiWear1024(arr, type) {
    if (type === 'endi-jacket') return endiJacketWear1024(arr)
    if (type === 'endi-leftFoot') return endiLeftFootWear1024(arr)
    if (type === 'endi-rightFoot') return endiRightFootWear1024(arr)
    if (type === 'endi-leftHand' || type === 'endi-rightHand') return endiSleeveWear1024(arr)
    return mapIndexMatrix(arr, [])
}

function pressNew1220({ arr, width, height, type = "row", value }) {
    let wsPointData = [...arr];

    if (type == "row") {
        let colArr = [];
        for (let i = 0; i < height; i++) {
            let total = 0;
            for (let j = 0; j < width; j++) {
                total += wsPointData[i * width + j];
            }
            colArr.push(total);
        }
        // //////okok
        for (let i = 0; i < height; i++) {
            for (let j = 0; j < width; j++) {

                let den = wsPointData[i * width + j] + value - colArr[i]
                if (den <= 0) {
                    den = 1
                }

                wsPointData[i * width + j] = parseInt(
                    wsPointData[i * width + j] * value / den
                );
            }
        }
    } else {
        let colArr = [];
        for (let i = 0; i < height; i++) {
            let total = 0;
            for (let j = 0; j < width; j++) {
                total += wsPointData[j * height + i];
            }
            colArr.push(total);
        }
        // //////okok
        for (let i = 0; i < height; i++) {
            for (let j = 0; j < width; j++) {
                let den = wsPointData[j * height + i] + value - colArr[i]
                if (den <= 0) {
                    den = 1
                }

                wsPointData[j * height + i] = parseInt(
                    (wsPointData[j * height + i] * value / den) / 2
                );
            }
        }
    }

    //////

    // wsPointData = wsPointData.map((a,index) => {return calculateY(a)})
    return wsPointData;
}

function backYToX(y) {
     if (!Number.isFinite(y)) return 0;

    // 饱和平台
    if (y >= 108) return 25;

    // 下限保护，看你需不需要，可以改阈值
    if (y <= 6) return 0;

    return Math.exp((y - 25.6628) / 25.26) - 0.362;
}

function sitYToX(y) {
   if (!Number.isFinite(y)) return 0;

    // 饱和平台
    if (y >= 90) return 25;

    // 下限保护（可以按你实际业务调）
    if (y <= 0) return 0;

    return Math.exp((y - 38.2932) / 15.76) - 0.088;
}

function carYLine(arr) {
    let wsPointData = [...arr];
    // 1-15行调换
    for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 32; j++) {
            [wsPointData[i * 32 + j], wsPointData[(14 - i) * 32 + j]] = [
                wsPointData[(14 - i) * 32 + j],
                wsPointData[i * 32 + j],
            ];
        }
    }

    let b = wsPointData.splice(0, 15 * 32);

    wsPointData = wsPointData.concat(b);
    return wsPointData
}

// carY 坐垫线序：基础线序 + 上下调换 + 左右调换
function carYSitLine(arr) {
    let wsPointData = carYLine(arr);
    const W = 32, H = 32;
    // 上下调换（行翻转）+ 左右调换（列翻转）
    const result = new Array(W * H);
    for (let row = 0; row < H; row++) {
        for (let col = 0; col < W; col++) {
            result[row * W + col] = wsPointData[(H - 1 - row) * W + (W - 1 - col)];
        }
    }
    return result;
}

// carY 靠背线序：基础线序 + 上下调换
function carYBackLine(arr) {
    let wsPointData = carYLine(arr);
    const W = 32, H = 32;
    // 上下调换（行翻转）
    const result = new Array(W * H);
    for (let row = 0; row < H; row++) {
        for (let col = 0; col < W; col++) {
            result[row * W + col] = wsPointData[(H - 1 - row) * W + col];
        }
    }
    return result;
}

module.exports = {
    hand,
    jqbed,
    endiSit,
    endiBack,
    endiSit1024,
    endiBack1024,
    endiWear1024,
    endiJacketWear1024,
    endiSleeveWear1024,
    endiLeftFootWear1024,
    endiRightFootWear1024,
    jqbedReverseIndex,
    reverseJqbedIndexValue,
    backYToX,
    sitYToX,
    carYLine,
    carYSitLine,
    carYBackLine
}
