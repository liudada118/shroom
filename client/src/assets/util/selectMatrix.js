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


export function matrixGenBox(matrixObj, canvasArea, max, matrixConfig) {
    const { xStart, xEnd, yStart, yEnd } = matrixObj
    const { canvasX1, canvasX2, canvasY1, canvasY2 } = canvasArea

    const selectWidth = xEnd - xStart
    const selectHeight = yEnd - yStart

    const canvasWidth = canvasX2 - canvasX1
    const canvasHeight = canvasY2 - canvasY1
    const widthUtil = canvasWidth / max
    const heightUtil = canvasHeight / max

    // 处理非正方形矩阵的偏移
    let offsetX = 0
    let offsetY = 0
    if (matrixConfig) {
        const mw = matrixConfig.width || max
        const mh = matrixConfig.height || max
        if (mw < mh) {
            offsetX = (mh - mw) / 2 * widthUtil
        } else if (mh < mw) {
            offsetY = (mw - mh) / 2 * heightUtil
        }
    }

    const boxX = canvasX1 + xStart * widthUtil + offsetX + 1
    const boxY = canvasY1 + yStart * heightUtil + offsetY + 1
    const boxWidth = selectWidth * widthUtil - 2
    const boxHeight = selectHeight * heightUtil - 2

    let box = document.querySelector('.selectHistoryBox')
    if (!box) {
        box = document.createElement('div');
        box.classList.add('selectHistoryBox');
        box.style.pointerEvents = 'auto';
        document.body.appendChild(box);

        // 右上角叉号关闭按钮
        const closeBtn = document.createElement('div');
        closeBtn.textContent = '\u00D7';
        Object.assign(closeBtn.style, {
            position: 'absolute', top: '-12px', right: '-12px',
            width: '22px', height: '22px', lineHeight: '20px', textAlign: 'center',
            background: '#ff4444', color: '#fff', borderRadius: '50%',
            fontSize: '14px', fontWeight: 'bold', cursor: 'pointer',
            zIndex: '999', border: '2px solid #fff',
            pointerEvents: 'auto', userSelect: 'none',
        });
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            window.__historySelectCleared = true;
            removeHistoryBox();
            window.dispatchEvent(new CustomEvent('history-select-clear'));
        });
        box.appendChild(closeBtn);
    }
    box.style.opacity = 0.6
    box.style.left = boxX + 'px';
    box.style.top = boxY + 'px';
    box.style.width = `${boxWidth}px`;
    box.style.height = `${boxHeight}px`;
}

export function transformMatrixByDirection(matrixObj, matrixConfig, direction = {}) {
    if (!matrixObj || !matrixConfig) return matrixObj

    const width = matrixObj.width || matrixConfig.width
    const height = matrixObj.height || matrixConfig.height
    let { xStart, xEnd, yStart, yEnd } = matrixObj

    if ([xStart, xEnd, yStart, yEnd, width, height].some((v) => typeof v !== 'number')) {
        return matrixObj
    }

    if (direction.left === false) {
        const oldXStart = xStart
        xStart = width - xEnd
        xEnd = width - oldXStart
    }

    if (direction.up === false) {
        const oldYStart = yStart
        yStart = height - yEnd
        yEnd = height - oldYStart
    }

    return {
        ...matrixObj,
        xStart,
        xEnd,
        yStart,
        yEnd,
        width,
        height,
    }
}

export function removeHistoryBox() {
    const historyBox = document.querySelector('.selectHistoryBox')
    if (historyBox) {
        console.log(1)
        document.body.removeChild(historyBox)
    }
}
