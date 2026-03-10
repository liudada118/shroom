import { message } from "antd"

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

class ruler {
    constructor() {
        this.listeners = []
        this.rulersFlag = false
        this.clickIndex = 0
        this.width = 32
        this.height = 32
        this.distanceX = 6
        this.distanceY = 6
        // 存储所有量尺线段 [{startGrid, endGrid, distance}]
        this.rulerLines = []
        // 选中的量尺索引集合
        this.selectedIndices = new Set()
        // 临时起点（正在绘制中的起点）
        this.tempStart = null

        this.onClick = (e) => {
            // 先检查是否点击了已有量尺（线条或标签）
            const hitIndex = this._hitTest(e)
            if (hitIndex >= 0) {
                // 切换选中状态（支持多选）
                if (this.selectedIndices.has(hitIndex)) {
                    this.selectedIndices.delete(hitIndex)
                } else {
                    this.selectedIndices.add(hitIndex)
                }
                this._redraw()
                return
            }

            // 没有点击到已有量尺，进入绘制逻辑
            this.clickIndex++
            this.listeners.push({ pageX: e.pageX, pageY: e.pageY })

            if (determineParity(this.clickIndex)) {
                // 完成一条量尺
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
            } else {
                // 绘制起点
                this.tempStart = this._toGrid({ pageX: e.pageX, pageY: e.pageY })
                this._redraw()
            }
        }
    }

    _toGrid(pointInfo) {
        const startX = this.canvas.getBoundingClientRect().left
        const startY = this.canvas.getBoundingClientRect().top
        const propW = this.canvas.width / this.width
        const propH = this.canvas.height / this.height
        return {
            x: Math.floor((pointInfo.pageX - startX) / propW),
            y: Math.floor((pointInfo.pageY - startY) / propH)
        }
    }

    /**
     * 点击命中测试：检查是否点击了某条量尺的线条或距离标签
     * 返回命中的量尺索引，-1表示未命中
     */
    _hitTest(e) {
        if (this.rulerLines.length === 0) return -1

        const grid = this._toGrid({ pageX: e.pageX, pageY: e.pageY })
        const propW = this.canvas.width / this.width
        const propH = this.canvas.height / this.height
        const px = (grid.x + 0.5) * propW
        const py = (grid.y + 0.5) * propH
        // 线条点击容差：加大到3个格子宽度，更容易点击
        const lineThreshold = propW * 3

        let clickedIndex = -1
        let minDist = Infinity

        for (let i = 0; i < this.rulerLines.length; i++) {
            const line = this.rulerLines[i]
            const x1 = (line.startGrid.x + 0.5) * propW
            const y1 = (line.startGrid.y + 0.5) * propH
            const x2 = (line.endGrid.x + 0.5) * propW
            const y2 = (line.endGrid.y + 0.5) * propH

            // 检查是否点击了线条
            const dist = pointToSegmentDistance(px, py, x1, y1, x2, y2)
            if (dist < lineThreshold && dist < minDist) {
                minDist = dist
                clickedIndex = i
            }

            // 检查是否点击了距离标签区域
            const labelFontSize = propH
            const labelWidth = line.distance.length * propH * 0.7
            const labelHeight = propH + 4
            const labelX = (line.endGrid.x + 1) * propW
            const labelY = (line.endGrid.y - 0.5) * propH + 2
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

        const propW = this.canvas.width / this.width
        const propH = this.canvas.height / this.height

        // 绘制所有已完成的量尺
        for (let i = 0; i < this.rulerLines.length; i++) {
            const line = this.rulerLines[i]
            const isSelected = this.selectedIndices.has(i)
            this._drawRulerLine(ctx, line, propW, propH, isSelected, i)
        }

        // 绘制正在绘制的临时起点
        if (this.tempStart) {
            ctx.beginPath();
            ctx.arc((this.tempStart.x + 0.5) * propW, (this.tempStart.y + 0.5) * propH, propW / 3, 0, Math.PI * 2);
            ctx.fillStyle = '#fff';
            ctx.fill();
            ctx.font = `bold ${propH * 1.2}px sans-serif`;
            ctx.fillStyle = '#fff';
            ctx.fillText(`S`, (this.tempStart.x - 0.8) * propW, (this.tempStart.y + 0.5) * propH);
        }
    }

    /**
     * 绘制单条量尺线段
     */
    _drawRulerLine(ctx, line, propW, propH, isSelected, index) {
        const { startGrid, endGrid, distance } = line
        const lineColor = isSelected ? '#FF6B35' : '#fff'
        const pointColor = isSelected ? '#FF6B35' : '#fff'
        // 线宽：普通3px，选中4.5px（加宽，更容易看到和点击）
        const normalLineWidth = 3
        const selectedLineWidth = 4.5

        // 绘制起点圆点（加大）
        ctx.beginPath();
        ctx.arc((startGrid.x + 0.5) * propW, (startGrid.y + 0.5) * propH, propW / 3, 0, Math.PI * 2);
        ctx.fillStyle = pointColor;
        ctx.fill();

        // 绘制起点S标记（加大字体）
        ctx.font = `bold ${propH * 1.2}px sans-serif`;
        ctx.fillStyle = pointColor;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(`S`, (startGrid.x - 0.8) * propW, (startGrid.y + 0.5) * propH);

        // 绘制终点圆点（加大）
        ctx.beginPath();
        ctx.arc((endGrid.x + 0.5) * propW, (endGrid.y + 0.5) * propH, propW / 3, 0, Math.PI * 2);
        ctx.fillStyle = pointColor;
        ctx.fill();

        // 绘制连线（加宽）
        ctx.beginPath();
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = isSelected ? selectedLineWidth : normalLineWidth;
        ctx.moveTo((startGrid.x + 0.5) * propW, (startGrid.y + 0.5) * propH);
        ctx.lineTo((endGrid.x + 0.5) * propW, (endGrid.y + 0.5) * propH);
        ctx.stroke();
        ctx.lineWidth = 1;

        // 绘制距离标签
        const fontsize = propH
        const labelWidth = distance.length * propH * 0.7
        const labelBg = isSelected ? '#FF6B35' : '#fff'
        const labelColor = isSelected ? '#fff' : '#000'
        drawRoundRectWithText(ctx, (endGrid.x + 1) * propW, (endGrid.y - 0.5) * propH + 2, labelWidth, propH + 4, (propH + 4) / 2, labelBg, distance, labelColor, propH)

        // 如果选中，绘制删除按钮和高亮边框
        if (isSelected) {
            const midX = ((startGrid.x + endGrid.x) / 2 + 0.5) * propW
            const midY = ((startGrid.y + endGrid.y) / 2 + 0.5) * propH - propH * 1.2
            const btnSize = propW * 0.8

            // 删除按钮背景（红色圆形）
            ctx.beginPath();
            ctx.arc(midX, midY, btnSize, 0, Math.PI * 2);
            ctx.fillStyle = '#E53935';
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

            // 选中高亮边框
            const minX = Math.min(startGrid.x, endGrid.x)
            const maxX = Math.max(startGrid.x, endGrid.x)
            const minY = Math.min(startGrid.y, endGrid.y)
            const maxY = Math.max(startGrid.y, endGrid.y)
            const pad = 1
            ctx.strokeStyle = 'rgba(255, 107, 53, 0.5)';
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 4]);
            ctx.strokeRect(
                (minX - pad) * propW,
                (minY - pad) * propH,
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

    startRuler({ num, widthDistance, heightDistance }) {
        this.width = num
        this.height = num
        this.distanceX = widthDistance
        this.distanceY = heightDistance
        this.rulersFlag = true
        if (document.querySelector('.canvasRuler')) {
            this.canvas = document.querySelector('.canvasRuler')
            this.canvas.addEventListener('click', this.onClick)
        } else {
            message.info('请在2D模式下使用')
        }
    }

    stopRuler() {
        this.clickIndex = 0
        if (this.canvas) {
            this.canvas.removeEventListener('click', this.onClick)
            const ctx = this.canvas.getContext('2d');
            ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
        }
        this.rulerLines = []
        this.selectedIndices.clear()
        this.tempStart = null
    }

    // 保留旧接口兼容性（不再直接使用，由_redraw统一处理）
    drawBlock(ctx, type, pointInfo, startPointInfo) {
        // 已由 _redraw 替代
    }

    drawLine(ctx, pointInfo, startPointInfo) {
        // 已由 _redraw 替代
    }
}

export const newRuler = new ruler()
