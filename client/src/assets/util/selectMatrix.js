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

    return matrixRectToSelectRect({
        left: canvasInfo.left,
        right: canvasInfo.right,
        top: canvasInfo.top,
        bottom: canvasInfo.bottom,
    }, selectConfig, matrixConfig)
}

export function matrixRectToSelectRect(canvasRect, selectConfig, matrixConfig) {
    const { left, right, top, bottom } = canvasRect
    const { xStart, yStart, sWidth, sHeight } = selectConfig

    const { width, height } = matrixConfig
    const max = Math.max(width, height)

    const canvasWidth = right - left
    const canvasHeight = bottom - top
    const widthUtil = canvasWidth / max
    const heightUtil = canvasHeight / max

    if (width < height) {
        const selectX = left + (xStart + (height - width) / 2) * widthUtil
        const selectY = top + yStart * heightUtil
        const selectWidth = sWidth * widthUtil
        const selectHeight = sHeight * heightUtil
        return {
            selectX, selectY, selectWidth, selectHeight
        }
    } else {
        const selectX = left + xStart * widthUtil
        const selectY = top + (yStart + (width - height) / 2) * heightUtil
        const selectWidth = sWidth * widthUtil
        const selectHeight = sHeight * heightUtil
        return {
            selectX, selectY, selectWidth, selectHeight
        }
    }
}

function normalizeRect(rect) {
    return {
        left: rect.left ?? rect.canvasX1,
        right: rect.right ?? rect.canvasX2,
        top: rect.top ?? rect.canvasY1,
        bottom: rect.bottom ?? rect.canvasY2,
    }
}

export function snapPixelRangeToMatrixRect(canvasRect, pixelRange, matrixConfig, effectiveRect = canvasRect) {
    const canvas = normalizeRect(canvasRect)
    const effective = normalizeRect(effectiveRect)
    const { width, height } = matrixConfig
    const left = Math.min(pixelRange.x1, pixelRange.x2)
    const right = Math.max(pixelRange.x1, pixelRange.x2)
    const top = Math.min(pixelRange.y1, pixelRange.y2)
    const bottom = Math.max(pixelRange.y1, pixelRange.y2)

    const unitWidth = (effective.right - effective.left) / width
    const unitHeight = (effective.bottom - effective.top) / height
    const xStart = neatValue(0, width, Math.floor((left - effective.left) / unitWidth))
    const xEnd = neatValue(0, width, Math.ceil((right - effective.left) / unitWidth))
    const yStart = neatValue(0, height, Math.floor((top - effective.top) / unitHeight))
    const yEnd = neatValue(0, height, Math.ceil((bottom - effective.top) / unitHeight))

    if (xEnd <= xStart || yEnd <= yStart) return null

    const selectRect = matrixRectToSelectRect(canvas, {
        xStart,
        yStart,
        sWidth: xEnd - xStart,
        sHeight: yEnd - yStart,
    }, matrixConfig)

    return {
        x1: selectRect.selectX,
        y1: selectRect.selectY,
        x2: selectRect.selectX + selectRect.selectWidth,
        y2: selectRect.selectY + selectRect.selectHeight,
        matrixRect: { xStart, yStart, xEnd, yEnd, width, height },
    }
}


// 与 components/selectBox/newSelecttBox.js 的 SELECT_COLORS 保持一致（6 个框选）
const HISTORY_SELECT_COLORS = [
    '#FF6B6B',
    '#4ECDC4',
    '#FFD93D',
    '#6C5CE7',
    '#FF9F43',
    '#C2185B',
]
const HISTORY_BOX_BRIGHTNESS_RATIO = 0.18
const HISTORY_BOX_FILL_ALPHA = 0.24

function parseHistoryBoxColor(color) {
    if (typeof color !== 'string') return null
    const c = color.replace('#', '')
    if (c.length !== 6) return null
    return {
        r: parseInt(c.slice(0, 2), 16),
        g: parseInt(c.slice(2, 4), 16),
        b: parseInt(c.slice(4, 6), 16),
    }
}

function historyDisplayColor(color) {
    const rgb = parseHistoryBoxColor(color)
    if (!rgb) return color
    const brighten = (v) => Math.round(v + (255 - v) * HISTORY_BOX_BRIGHTNESS_RATIO)
    return `rgb(${brighten(rgb.r)}, ${brighten(rgb.g)}, ${brighten(rgb.b)})`
}

function historyFillColor(color) {
    const rgb = parseHistoryBoxColor(color)
    if (!rgb) return color
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${HISTORY_BOX_FILL_ALPHA})`
}

function buildSingleHistoryBox(region, index, canvasArea, max, matrixConfig) {
    const { xStart, xEnd, yStart, yEnd } = region
    const { canvasX1, canvasX2, canvasY1, canvasY2 } = canvasArea

    const selectWidth = xEnd - xStart
    const selectHeight = yEnd - yStart
    const canvasWidth = canvasX2 - canvasX1
    const canvasHeight = canvasY2 - canvasY1
    const widthUtil = canvasWidth / max
    const heightUtil = canvasHeight / max

    let offsetX = 0
    let offsetY = 0
    if (matrixConfig) {
        const mw = matrixConfig.width || max
        const mh = matrixConfig.height || max
        if (mw < mh) offsetX = (mh - mw) / 2 * widthUtil
        else if (mh < mw) offsetY = (mw - mh) / 2 * heightUtil
    }

    const boxX = canvasX1 + xStart * widthUtil + offsetX
    const boxY = canvasY1 + yStart * heightUtil + offsetY
    const boxWidth = selectWidth * widthUtil
    const boxHeight = selectHeight * heightUtil

    const colorIndex = Number.isFinite(Number(region.colorIndex)) ? Number(region.colorIndex) : index
    const baseColor = region.bgc || region.color || HISTORY_SELECT_COLORS[colorIndex % HISTORY_SELECT_COLORS.length]
    const borderColor = historyDisplayColor(baseColor)
    const fillColor = historyFillColor(baseColor)

    const box = document.createElement('div')
    box.classList.add('selectHistoryBox')
    box.dataset.historyBoxIndex = String(index)
    Object.assign(box.style, {
        position: 'fixed',
        left: boxX + 'px',
        top: boxY + 'px',
        width: boxWidth + 'px',
        height: boxHeight + 'px',
        boxSizing: 'border-box',
        border: `2px solid ${borderColor}`,
        backgroundColor: fillColor,
        boxShadow: `0 0 0 1px ${borderColor}`,
        opacity: 1,
        zIndex: 998,
        pointerEvents: 'auto',
    })

    const handlePositions = [
        { top: '-5px', left: '-5px' },
        { top: '-5px', right: '-5px' },
        { bottom: '-5px', left: '-5px' },
        { bottom: '-5px', right: '-5px' },
        { top: '-5px', left: '50%', marginLeft: '-5px' },
        { bottom: '-5px', left: '50%', marginLeft: '-5px' },
        { top: '50%', left: '-5px', marginTop: '-5px' },
        { top: '50%', right: '-5px', marginTop: '-5px' },
    ]
    handlePositions.forEach((pos) => {
        const h = document.createElement('div')
        h.classList.add('selectHistoryBox-handle')
        Object.assign(h.style, {
            position: 'absolute', width: '10px', height: '10px',
            background: '#fff', border: `2px solid ${borderColor}`, borderRadius: '2px',
            zIndex: '999', pointerEvents: 'none',
            ...pos,
        })
        box.appendChild(h)
    })

    const badge = document.createElement('div')
    badge.classList.add('selectHistoryBox-measure')
    Object.assign(badge.style, {
        position: 'absolute', left: '0', bottom: '-28px',
        maxWidth: '18rem', padding: '3px 8px',
        borderRadius: '999px', background: 'rgba(3, 5, 7, 0.88)',
        color: '#fff', fontSize: '11px', fontWeight: '700',
        lineHeight: '16px', whiteSpace: 'nowrap',
        boxShadow: '0 6px 18px rgba(0, 0, 0, 0.35)',
        pointerEvents: 'none', userSelect: 'none', zIndex: '1001',
    })
    badge.textContent = `X ${xStart}-${xEnd} / Y ${yStart}-${yEnd} · ${selectWidth} x ${selectHeight}`
    box.appendChild(badge)

    document.body.appendChild(box)
    return box
}

export function matrixGenBox(matrixObjOrRegions, canvasArea, max, matrixConfig) {
    const regions = Array.isArray(matrixObjOrRegions) ? matrixObjOrRegions : [matrixObjOrRegions]
    removeHistoryBox()
    regions.forEach((region, index) => {
        if (!region) return
        buildSingleHistoryBox(region, index, canvasArea, max, matrixConfig)
    })
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
    const historyBoxes = document.querySelectorAll('.selectHistoryBox')
    historyBoxes.forEach((node) => {
        if (node.parentNode) node.parentNode.removeChild(node)
    })
}
