/**
 * 计算单个框选区域的扩展指标
 *
 * @param {number[]} boxData - 框内一维子矩阵数据，由 extractSelectData 产出，按行优先 (y*w + x)
 * @param {{xStart:number, xEnd:number, yStart:number, yEnd:number}} matrix - 框在原矩阵中的行列范围 (右开)
 * @returns {{
 *   maxCoord: { x: number|string, y: number|string },   // 框内最大值的绝对 (col,row)
 *   centroid: { x: string, y: string },                 // 加权重心 (Σv·x/Σv, Σv·y/Σv)，仅 v>0 参与
 *   colRange: [number, number],                         // 框列范围 [xStart, xEnd-1]
 *   rowRange: [number, number],                         // 框行范围 [yStart, yEnd-1]
 * }}
 */
export function computeBoxMetrics(boxData, matrix) {
    const empty = {
        maxCoord: { x: '-', y: '-' },
        centroid: { x: '-', y: '-' },
        colRange: ['-', '-'],
        rowRange: ['-', '-'],
    }
    if (!boxData || !boxData.length || !matrix) return empty

    const { xStart, xEnd, yStart, yEnd } = matrix
    const w = xEnd - xStart
    if (w <= 0) return empty

    let maxIdx = 0
    let maxVal = -Infinity
    let sumV = 0
    let sumVX = 0
    let sumVY = 0

    for (let i = 0; i < boxData.length; i++) {
        const v = boxData[i]
        if (v > maxVal) {
            maxVal = v
            maxIdx = i
        }
        if (v > 0) {
            const x = xStart + (i % w)
            const y = yStart + Math.floor(i / w)
            sumV += v
            sumVX += v * x
            sumVY += v * y
        }
    }

    const maxCoord = maxVal > 0
        ? { x: xStart + (maxIdx % w), y: yStart + Math.floor(maxIdx / w) }
        : { x: '-', y: '-' }

    const centroid = sumV > 0
        ? { x: (sumVX / sumV).toFixed(1), y: (sumVY / sumV).toFixed(1) }
        : { x: '-', y: '-' }

    return {
        maxCoord,
        centroid,
        colRange: [xStart, xEnd - 1],
        rowRange: [yStart, yEnd - 1],
    }
}
