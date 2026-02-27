const neatValue = (min, max, value) => {
    let res
    if (value < min) {
        res = min
    } else if (value > max) {
        res = max
    } else {
        res = value
    }
    return res
}

/**
 * 通过canvas的位置信息和框选的矩阵信息还有传感器的点阵信息计算出 真实框选区域
 * */
export function calMatrixArea(canvasArea, selectArea, matrixConfig) {
    const { canvasX1, canvasX2, canvasY1, canvasY2 } = canvasArea
    const { selectX1, selectX2, selectY1, selectY2 } = selectArea

    const { width, height } = matrixConfig
    const max = Math.max(width, height)


    const canvasWidth = canvasX2 - canvasX1
    const canvasHeight = canvasY2 - canvasY1
    const widthUtil = canvasWidth / max
    const heightUtil = canvasHeight / max



    const offset = Math.abs(height - width) / 2
    if (width < height) {

        const xStart = neatValue(0, width, Math.floor((selectX1 - canvasX1) / widthUtil) - offset)
        const xEnd = neatValue(0, width, Math.ceil((selectX2 - canvasX1) / widthUtil) - offset)
        const yStart = neatValue(0, height, Math.floor((selectY1 - canvasY1) / widthUtil))
        const yEnd = neatValue(0, height, Math.ceil((selectY2 - canvasY1) / heightUtil))
        return {
            xStart, xEnd, yStart, yEnd
        }
    } else {
        const xStart = neatValue(0, width, Math.floor((selectX1 - canvasX1) / widthUtil))
        const xEnd = neatValue(0, width, Math.ceil((selectX2 - canvasX1) / widthUtil))
        const yStart = neatValue(0, height, Math.floor((selectY1 - canvasY1) / widthUtil) - offset)
        const yEnd = neatValue(0, height, Math.ceil((selectY2 - canvasY1) / heightUtil) - offset)
        return {
            xStart, xEnd, yStart, yEnd
        }
    }



    // return {
    //     xStart, xEnd, yStart, yEnd
    // }
}

/**
 * 通过 canvas的位置信息还有真实框选区域还有 传感器点阵信息计算出 框选框的位置信息
 */
export function calMatrixToSelect(className, selectConfig, matrixConfig) {

    const canvas = document.querySelector(`.${className}`)
    const canvasInfo = canvas.getBoundingClientRect()

    const canvasObj = {
        canvasX1: canvasInfo.left, canvasX2: canvasInfo.right,
        canvasY1: canvasInfo.top, canvasY2: canvasInfo.bottom
    }

    const { canvasX1, canvasX2, canvasY1, canvasY2 } = canvasObj
    const { xStart, yStart, sWidth, sHeight } = selectConfig

    const { width, height } = matrixConfig
    const max = Math.max(width, height)


    const canvasWidth = canvasX2 - canvasX1
    const canvasHeight = canvasY2 - canvasY1
    const widthUtil = canvasWidth / max
    const heightUtil = canvasHeight / max


    if (width < height) {
        const selectX = canvasX1 + (xStart + (height - width) / 2) * widthUtil + 1
        const selectY = canvasY1 + yStart * heightUtil + 1
        const selectWidth = sWidth * widthUtil - 2
        const selectHeight = sHeight * heightUtil - 2
        console.log(selectX)
        return {
            selectX, selectY, selectWidth, selectHeight
        }
    } else {
        const selectX = canvasX1 + xStart * widthUtil + 1
        const selectY = canvasY1 + (yStart + (height - width) / 2) * heightUtil + 1
        const selectWidth = sWidth * widthUtil - 2
        const selectHeight = sHeight * heightUtil - 2
        return {
            selectX, selectY, selectWidth, selectHeight
        }
    }




}


export function matrixGenBox(matrixObj, canvasArea, max) {
    const { xStart, xEnd, yStart, yEnd } = matrixObj
    const { canvasX1, canvasX2, canvasY1, canvasY2 } = canvasArea

    const width = xEnd - xStart
    const height = yEnd - yStart

    const canvasWidth = canvasX2 - canvasX1
    const canvasHeight = canvasY2 - canvasY1
    const widthUtil = canvasWidth / max
    const heightUtil = canvasHeight / max

    const boxX = canvasX1 + xStart * widthUtil + 1
    const boxY = canvasY1 + yStart * heightUtil+ 1
    const boxWidth = width * widthUtil -2 
    const boxHeight = height * widthUtil-2 

    console.log(document.querySelector('.selectHistoryBox'))
    if (!document.querySelector('.selectHistoryBox')) {
        const box = document.createElement('div');
        box.classList.add('selectHistoryBox');
        // this.elementArr.push(this.element)
        box.style.pointerEvents = 'none';
        document.body.appendChild(box);
        box.style.opacity = 0.6
        box.style.left = boxX + 'px';
        box.style.top = boxY + 'px';
        box.style.width = `${boxWidth}px`;
        box.style.height = `${boxHeight}px`;
    }
}

export function removeHistoryBox() {
    const historyBox = document.querySelector('.selectHistoryBox')
    if (historyBox) {
        console.log(1)
        document.body.removeChild(historyBox)
    }
}
