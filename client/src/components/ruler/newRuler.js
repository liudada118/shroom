import { message } from "antd"
import i18n from 'i18next'

function determineParity(index) {
    return index % 2 == 0
}

function drawRoundRectWithText(ctx, x, y, width, height, radius, fillColor, text, textColor = '#fff', fontSize = 16, fontFamily = 'sans-serif') {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.arcTo(x + width, y, x + width, y + radius, radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.arcTo(x + width, y + height, x + width - radius, y + height, radius);
    ctx.lineTo(x + radius, y + height);
    ctx.arcTo(x, y + height, x, y + height - radius, radius);
    ctx.lineTo(x, y + radius);
    ctx.arcTo(x, y, x + radius, y, radius);
    ctx.closePath();

    ctx.fillStyle = fillColor;
    ctx.fill();

    ctx.fillStyle = textColor;
    ctx.font = `${fontSize}px ${fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const centerX = x + width / 2;
    const centerY = y + height / 2;

    ctx.fillText(text, centerX, centerY);
}

/**
 * 判断点击位置是否在某条量尺附近（线段距离检测）
 */
function pointToSegmentDistance(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const projX = x1 + t * dx;
    const projY = y1 + t * dy;
    return Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
}

/**
 * 判断点击位置是否在距离标签区域内
 */
function isPointInLabel(px, py, labelX, labelY, labelWidth, labelHeight) {
    return px >= labelX && px <= labelX + labelWidth && py >= labelY && py <= labelY + labelHeight;
}

// ─── 选中颜色配置 ───
const SELECTED_COLOR = '#FFD600'          // 选中线条/端点颜色（黄色）
const SELECTED_LABEL_BG = '#FFD600'       // 选中标签背景（黄色）
const SELECTED_LABEL_TEXT = '#000'         // 选中标签文字（黑色）
const SELECTED_BORDER_COLOR = 'rgba(255, 214, 0, 0.5)' // 选中高亮边框
const DELETE_BTN_COLOR = '#E53935'         // 删除按钮背景（红色）

class ruler {
    constructor() {
        this.listeners = []
        this.rulersFlag = false
        this.clickIndex = 0
        this.width = 32
        this.height = 32
        this.canvasGridSize = 32
        this.distanceX = 6
        this.distanceY = 6
        // 存储所有量尺线段 [{startGrid, endGrid, distance}]
        this.rulerLines = []
        // 选中的量尺索引集合
        this.selectedIndices = new Set()
        // 临时起点（正在绘制中的起点）
        this.tempStart = null

        // 统一使用 mousedown 事件，通过 e.button 区分左右键
        this.onMouseDown = (e) => {
            if (e.button === 0) {
                // ═══ 左键：负责绘制起点/终点 + 点击删除按钮 ═══

                // 1. 先检查是否左键点击了某个选中量尺的删除按钮（最高优先级）
                const deleteIndex = this._hitTestDeleteBtn(e)
                if (deleteIndex >= 0) {
                    // 删除该量尺
                    this.rulerLines.splice(deleteIndex, 1)
                    // 更新selectedIndices：删除该索引，大于该索引的减1
                    const newSelected = new Set()
                    for (const idx of this.selectedIndices) {
                        if (idx === deleteIndex) continue
                        if (idx > deleteIndex) {
                            newSelected.add(idx - 1)
                        } else {
                            newSelected.add(idx)
                        }
                    }
                    this.selectedIndices = newSelected
                    this._redraw()
                    return
                }

                if (!this._isInEffectiveArea(e)) {
                    message.warning(i18n.t('measureInValidArea'))
                    return
                }

                // 2. 绘制逻辑：左键只负责绘制，不做选中检测
                if (this.tempStart) {
                    // 正在绘制中（已有起点，等待终点），直接完成绘制
                    this.clickIndex++
                    this.listeners.push({ pageX: e.pageX, pageY: e.pageY })

                    const startPoint = this.listeners[this.listeners.length - 2]
                    const endPoint = { pageX: e.pageX, pageY: e.pageY }
                    const startGrid = this._toGrid(startPoint)
                    const endGrid = this._toGrid(endPoint)
                    const x = Math.abs(endGrid.x - startGrid.x) * this.distanceX
                    const y = Math.abs(endGrid.y - startGrid.y) * this.distanceY
                    const distance = (Math.sqrt(x * x + y * y)).toFixed(0)

                    this.rulerLines.push({
                        startGrid,
                        endGrid,
                        distance: `${distance}mm`
                    })
                    this.tempStart = null
                    this._redraw()
                    return
                }

                // 3. 没有正在绘制，开始新量尺的起点
                this.clickIndex++
                this.listeners.push({ pageX: e.pageX, pageY: e.pageY })
                this.tempStart = this._toGrid({ pageX: e.pageX, pageY: e.pageY })
                this._redraw()

            } else if (e.button === 2) {
                // ═══ 右键：负责选中/取消选中量尺（显示删除框） ═══
                e.preventDefault()

                // 如果正在绘制中，右键取消当前绘制
                if (this.tempStart) {
                    this.tempStart = null
                    this.listeners.pop()
                    this.clickIndex--
                    this._redraw()
                    return
                }

                // 检查是否右键点击了已有量尺（线条或标签）
                const hitIndex = this._hitTest(e)
                if (hitIndex >= 0) {
                    // 切换选中状态（支持多选）
                    if (this.selectedIndices.has(hitIndex)) {
                        this.selectedIndices.delete(hitIndex)
                    } else {
                        this.selectedIndices.add(hitIndex)
                    }
                    this._redraw()
                }
            }
        }

        // 阻止右键默认菜单
        this.onContextMenu = (e) => {
            e.preventDefault()
        }
    }

    _toGrid(pointInfo) {
        const rect = this.canvas.getBoundingClientRect()
        const startX = rect.left + window.scrollX
        const startY = rect.top + window.scrollY
        const { propW, propH, offsetGridX, offsetGridY } = this._getGridMetrics()
        return {
            x: Math.floor((pointInfo.pageX - startX) / propW - offsetGridX),
            y: Math.floor((pointInfo.pageY - startY) / propH - offsetGridY)
        }
    }

    _getGridMetrics() {
        const gridSize = this.canvasGridSize || Math.max(this.width, this.height)
        const propW = this.canvas.width / gridSize
        const propH = this.canvas.height / gridSize
        return {
            gridSize,
            propW,
            propH,
            offsetGridX: (gridSize - this.width) / 2,
            offsetGridY: (gridSize - this.height) / 2,
        }
    }

    _gridToCanvasCenter(grid) {
        const { propW, propH, offsetGridX, offsetGridY } = this._getGridMetrics()
        return {
            x: (grid.x + offsetGridX + 0.5) * propW,
            y: (grid.y + offsetGridY + 0.5) * propH,
        }
    }

    _isGridInEffectiveArea(grid) {
        return grid.x >= 0 && grid.x < this.width && grid.y >= 0 && grid.y < this.height
    }

    _isInEffectiveArea(e) {
        if (!this.canvas) return false
        return this._isGridInEffectiveArea(this._toGrid({ pageX: e.pageX, pageY: e.pageY }))
    }

    /**
     * 检查是否点击了某个选中量尺的删除按钮
     * 返回该量尺的索引，-1表示未命中
     */
    _hitTestDeleteBtn(e) {
        if (this.rulerLines.length === 0 || this.selectedIndices.size === 0) return -1

        const grid = this._toGrid({ pageX: e.pageX, pageY: e.pageY })
        const { propW } = this._getGridMetrics()
        const point = this._gridToCanvasCenter(grid)
        const px = point.x
        const py = point.y

        for (const i of this.selectedIndices) {
            if (i >= this.rulerLines.length) continue
            const line = this.rulerLines[i]
            // 删除按钮位置（与_drawRulerLine中一致）
            const startPoint = this._gridToCanvasCenter(line.startGrid)
            const endPoint = this._gridToCanvasCenter(line.endGrid)
            const midX = (startPoint.x + endPoint.x) / 2
            const midY = (startPoint.y + endPoint.y) / 2 - propW * 1.2
            const btnSize = propW * 1.2 // 加大点击区域

            const dist = Math.sqrt((px - midX) ** 2 + (py - midY) ** 2)
            if (dist <= btnSize) {
                return i
            }
        }

        return -1
    }

    /**
     * 点击命中测试：检查是否点击了某条量尺的线条或距离标签
     * 返回命中的量尺索引，-1表示未命中
     */
    _hitTest(e) {
        if (this.rulerLines.length === 0) return -1

        const grid = this._toGrid({ pageX: e.pageX, pageY: e.pageY })
        const { propW, propH } = this._getGridMetrics()
        const point = this._gridToCanvasCenter(grid)
        const px = point.x
        const py = point.y
        // 线条点击容差：3个格子宽度
        const lineThreshold = propW * 3

        let clickedIndex = -1
        let minDist = Infinity

        for (let i = 0; i < this.rulerLines.length; i++) {
            const line = this.rulerLines[i]
            const startPoint = this._gridToCanvasCenter(line.startGrid)
            const endPoint = this._gridToCanvasCenter(line.endGrid)
            const x1 = startPoint.x
            const y1 = startPoint.y
            const x2 = endPoint.x
            const y2 = endPoint.y

            // 检查是否点击了线条
            const dist = pointToSegmentDistance(px, py, x1, y1, x2, y2)
            if (dist < lineThreshold && dist < minDist) {
                minDist = dist
                clickedIndex = i
            }

            // 检查是否点击了距离标签区域
            const labelWidth = line.distance.length * propH * 0.7
            const labelHeight = propH + 4
            const labelX = endPoint.x + propW / 2
            const labelY = endPoint.y - propH + 2
            if (isPointInLabel(px, py, labelX, labelY, labelWidth, labelHeight)) {
                clickedIndex = i
                break // 标签命中优先
            }

            // 检查是否点击了起点圆点附近
            const startDist = Math.sqrt((px - x1) ** 2 + (py - y1) ** 2)
            if (startDist < propW * 1.5) {
                clickedIndex = i
                break
            }

            // 检查是否点击了终点圆点附近
            const endDist = Math.sqrt((px - x2) ** 2 + (py - y2) ** 2)
            if (endDist < propW * 1.5) {
                clickedIndex = i
                break
            }
        }

        return clickedIndex
    }

    /**
     * 重绘所有量尺
     */
    _redraw() {
        if (!this.canvas) return
        const ctx = this.canvas.getContext('2d')
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)

        const { propW, propH } = this._getGridMetrics()

        // 绘制所有已完成的量尺
        for (let i = 0; i < this.rulerLines.length; i++) {
            const line = this.rulerLines[i]
            const isSelected = this.selectedIndices.has(i)
            this._drawRulerLine(ctx, line, propW, propH, isSelected, i)
        }

        // 绘制正在绘制的临时起点
        if (this.tempStart) {
            const startPoint = this._gridToCanvasCenter(this.tempStart)
            ctx.beginPath();
            ctx.arc(startPoint.x, startPoint.y, propW / 3, 0, Math.PI * 2);
            ctx.fillStyle = '#fff';
            ctx.fill();
            ctx.font = `bold ${propH * 1.2}px sans-serif`;
            ctx.fillStyle = '#fff';
            ctx.fillText(`S`, startPoint.x - propW * 1.3, startPoint.y);
        }
    }

    /**
     * 绘制单条量尺线段
     */
    _drawRulerLine(ctx, line, propW, propH, isSelected, index) {
        const { startGrid, endGrid, distance } = line
        const lineColor = isSelected ? SELECTED_COLOR : '#fff'
        const pointColor = isSelected ? SELECTED_COLOR : '#fff'
        // 线宽：普通3px，选中4.5px
        const normalLineWidth = 3
        const selectedLineWidth = 4.5
        const startPoint = this._gridToCanvasCenter(startGrid)
        const endPoint = this._gridToCanvasCenter(endGrid)

        // 绘制起点圆点
        ctx.beginPath();
        ctx.arc(startPoint.x, startPoint.y, propW / 3, 0, Math.PI * 2);
        ctx.fillStyle = pointColor;
        ctx.fill();

        // 绘制起点S标记
        ctx.font = `bold ${propH * 1.2}px sans-serif`;
        ctx.fillStyle = pointColor;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(`S`, startPoint.x - propW * 1.3, startPoint.y);

        // 绘制终点圆点
        ctx.beginPath();
        ctx.arc(endPoint.x, endPoint.y, propW / 3, 0, Math.PI * 2);
        ctx.fillStyle = pointColor;
        ctx.fill();

        // 绘制连线
        ctx.beginPath();
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = isSelected ? selectedLineWidth : normalLineWidth;
        ctx.moveTo(startPoint.x, startPoint.y);
        ctx.lineTo(endPoint.x, endPoint.y);
        ctx.stroke();
        ctx.lineWidth = 1;

        // 绘制距离标签
        const labelWidth = distance.length * propH * 0.7
        const labelBg = isSelected ? SELECTED_LABEL_BG : '#fff'
        const labelColor = isSelected ? SELECTED_LABEL_TEXT : '#000'
        drawRoundRectWithText(ctx, endPoint.x + propW / 2, endPoint.y - propH + 2, labelWidth, propH + 4, (propH + 4) / 2, labelBg, distance, labelColor, propH)

        // 如果选中，绘制删除按钮和高亮边框
        if (isSelected) {
            const midX = (startPoint.x + endPoint.x) / 2
            const midY = (startPoint.y + endPoint.y) / 2 - propH * 1.2
            const btnSize = propW * 0.8

            // 删除按钮背景（红色圆形）
            ctx.beginPath();
            ctx.arc(midX, midY, btnSize, 0, Math.PI * 2);
            ctx.fillStyle = DELETE_BTN_COLOR;
            ctx.fill();

            // 删除按钮X图标
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            const offset = btnSize * 0.5;
            ctx.beginPath();
            ctx.moveTo(midX - offset, midY - offset);
            ctx.lineTo(midX + offset, midY + offset);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(midX + offset, midY - offset);
            ctx.lineTo(midX - offset, midY + offset);
            ctx.stroke();
            ctx.lineWidth = 1;

            // 选中高亮边框（黄色虚线）
            const minX = Math.min(startGrid.x, endGrid.x)
            const maxX = Math.max(startGrid.x, endGrid.x)
            const minY = Math.min(startGrid.y, endGrid.y)
            const maxY = Math.max(startGrid.y, endGrid.y)
            const pad = 1
            const { offsetGridX, offsetGridY } = this._getGridMetrics()
            ctx.strokeStyle = SELECTED_BORDER_COLOR;
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 4]);
            ctx.strokeRect(
                (minX + offsetGridX - pad) * propW,
                (minY + offsetGridY - pad) * propH,
                (maxX - minX + 2 * pad + 1) * propW,
                (maxY - minY + 2 * pad + 1) * propH
            );
            ctx.setLineDash([]);
            ctx.lineWidth = 1;
        }
    }

    /**
     * 删除所有选中的量尺
     */
    deleteSelected() {
        if (this.selectedIndices.size === 0) return
        const indicesToRemove = Array.from(this.selectedIndices).sort((a, b) => b - a)
        for (const idx of indicesToRemove) {
            this.rulerLines.splice(idx, 1)
        }
        this.selectedIndices.clear()
        this._redraw()
    }

    /**
     * 获取选中数量
     */
    getSelectedCount() {
        return this.selectedIndices.size
    }

    startRuler({ num, width, height, widthDistance, heightDistance }) {
        this.width = width || num
        this.height = height || num
        this.canvasGridSize = num || Math.max(this.width, this.height)
        this.distanceX = widthDistance
        this.distanceY = heightDistance
        this.rulersFlag = true
        if (document.querySelector('.canvasRuler')) {
            this.canvas = document.querySelector('.canvasRuler')
            this.canvas.addEventListener('mousedown', this.onMouseDown)
            this.canvas.addEventListener('contextmenu', this.onContextMenu)
        } else {
            message.info(i18n.t('useIn2DMode'))
        }
    }

    stopRuler() {
        this.clickIndex = 0
        if (this.canvas) {
            this.canvas.removeEventListener('mousedown', this.onMouseDown)
            this.canvas.removeEventListener('contextmenu', this.onContextMenu)
            const ctx = this.canvas.getContext('2d');
            ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
        }
        this.rulerLines = []
        this.selectedIndices.clear()
        this.tempStart = null
    }

    // 保留旧接口兼容性
    drawBlock(ctx, type, pointInfo, startPointInfo) {}
    drawLine(ctx, pointInfo, startPointInfo) {}
}

export const newRuler = new ruler()
