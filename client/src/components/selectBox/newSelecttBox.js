import React from 'react';
import { message } from 'antd';
import { getDisplayType, getSysType } from '../../store/equipStore';
import { systemPointConfig } from '../../util/constant';
import { isMoreMatrix } from '../../assets/util/util';
import { calMatrixToSelect } from '../../assets/util/selectMatrix';

// ─── 4 个框选的固定颜色 ──────────────────────────────────────
export const SELECT_COLORS = [
    '#FF6B6B',  // 框1 - 红
    '#4ECDC4',  // 框2 - 青
    '#FFD93D',  // 框3 - 黄
    '#6C5CE7',  // 框4 - 紫
];

const SELECT_BOX_BRIGHTNESS_RATIO = 0.18;
export const SELECT_BOX_FILL_ALPHA = 0.24;

function parseSelectBoxColor(color) {
    const normalizedColor = color.replace('#', '');
    if (normalizedColor.length !== 6) return null;

    return {
        r: parseInt(normalizedColor.slice(0, 2), 16),
        g: parseInt(normalizedColor.slice(2, 4), 16),
        b: parseInt(normalizedColor.slice(4, 6), 16),
    };
}

export function getSelectBoxDisplayColor(color, brightenRatio = SELECT_BOX_BRIGHTNESS_RATIO) {
    const rgb = parseSelectBoxColor(color);
    if (!rgb) return color;

    const brightenChannel = (value) => Math.round(value + (255 - value) * brightenRatio);
    return `rgb(${brightenChannel(rgb.r)}, ${brightenChannel(rgb.g)}, ${brightenChannel(rgb.b)})`;
}

export function getSelectBoxFillColor(color, alpha = SELECT_BOX_FILL_ALPHA) {
    const rgb = parseSelectBoxColor(color);
    if (!rgb) return color;
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

const MAX_BOXES = 4;

export class BrushManager {
    constructor() {
        this.listeners = new Set();
        this.isBrushing = false;
        this.start = { x: 0, y: 0 };
        this.pointTopLeft = [];
        this.pointBottomRight = [];
        this.rangeArr = []       // 最多 4 个框选 [{x1,y1,x2,y2,bgc,colorIndex,_element}]
        this._resizing = false   // 是否正在拖拽调整大小
        this._dragging = false   // 是否正在拖动框
        this._isDrawing = false  // 是否正在绘制新框
    }

    subscribe(cb) {
        this.listeners.add(cb);
    }

    unsubscribe(cb) {
        this.listeners.delete(cb);
    }

    notify(range) {
        this.listeners.forEach(cb => cb(range));
    }

    /**
     * 获取下一个可用的颜色索引（0-3）
     */
    _nextColorIndex() {
        const used = new Set(this.rangeArr.map(r => r.colorIndex));
        for (let i = 0; i < MAX_BOXES; i++) {
            if (!used.has(i)) return i;
        }
        return 0; // fallback
    }

    /**
     * 获取当前用于框选的真实矩阵渲染区域。
     * 对于非正方形矩阵（例如 endi-back 50x64），只允许在真实矩阵区域内框选。
     */
    _getEffectiveCanvasRect() {
        return this._getMatrixContext()?.effectiveRect || null;
    }

    _getMatrixContext() {
        const canvas =
            document.querySelector('.canvasThree:not(.canvasRuler)') ||
            document.querySelector('.canvasThree');
        if (!canvas) return null;

        const rect = canvas.getBoundingClientRect();
        const systemType = getSysType();
        const displayType = getDisplayType();

        let configKey = systemType;
        if (isMoreMatrix(systemType)) {
            const matrixType = displayType.includes('back')
                ? 'back'
                : displayType.includes('sit')
                    ? 'sit'
                    : '';
            if (matrixType) configKey = `${systemType}-${matrixType}`;
        }

        const matrixConfig = systemPointConfig[configKey];
        if (!matrixConfig) {
            return {
                canvasRect: rect,
                effectiveRect: rect,
                matrixKey: configKey,
                matrixConfig: null,
                systemType,
                displayType,
            };
        }

        const { width, height } = matrixConfig;
        const maxSide = Math.max(width, height);
        const unitWidth = rect.width / maxSide;
        const unitHeight = rect.height / maxSide;
        const offsetX = width < height ? ((height - width) / 2) * unitWidth : 0;
        const offsetY = height < width ? ((width - height) / 2) * unitHeight : 0;

        return {
            canvasRect: rect,
            effectiveRect: {
                left: rect.left + offsetX,
                right: rect.left + offsetX + width * unitWidth,
                top: rect.top + offsetY,
                bottom: rect.top + offsetY + height * unitHeight,
            },
            matrixKey: configKey,
            matrixConfig,
            systemType,
            displayType,
        };
    }

    _clampValue(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    _clampPixelRect(x1, y1, x2, y2) {
        const rect = this._getEffectiveCanvasRect();
        if (!rect) return { x1, y1, x2, y2 };
        return {
            x1: this._clampValue(x1, rect.left, rect.right),
            y1: this._clampValue(y1, rect.top, rect.bottom),
            x2: this._clampValue(x2, rect.left, rect.right),
            y2: this._clampValue(y2, rect.top, rect.bottom),
        };
    }

    _rangeToMatrixRect(range, context = this._getMatrixContext()) {
        if (!range || !context?.matrixConfig || !context?.effectiveRect) return null;
        const { effectiveRect, matrixConfig } = context;
        const { width, height } = matrixConfig;
        const left = Math.min(range.x1, range.x2);
        const right = Math.max(range.x1, range.x2);
        const top = Math.min(range.y1, range.y2);
        const bottom = Math.max(range.y1, range.y2);

        if (left < effectiveRect.left || right > effectiveRect.right || top < effectiveRect.top || bottom > effectiveRect.bottom) {
            return null;
        }

        const unitWidth = (effectiveRect.right - effectiveRect.left) / width;
        const unitHeight = (effectiveRect.bottom - effectiveRect.top) / height;
        const xStart = this._clampValue(Math.floor((left - effectiveRect.left) / unitWidth), 0, width);
        const xEnd = this._clampValue(Math.ceil((right - effectiveRect.left) / unitWidth), 0, width);
        const yStart = this._clampValue(Math.floor((top - effectiveRect.top) / unitHeight), 0, height);
        const yEnd = this._clampValue(Math.ceil((bottom - effectiveRect.top) / unitHeight), 0, height);

        if (xEnd <= xStart || yEnd <= yStart) return null;
        return { xStart, xEnd, yStart, yEnd, width, height };
    }

    _syncRangeMetadata(range) {
        const context = this._getMatrixContext();
        const matrixRect = this._rangeToMatrixRect(range, context);
        if (!matrixRect || !context) return false;
        range.matrixRect = matrixRect;
        range.matrixKey = context.matrixKey;
        range.displayType = context.displayType;
        range.systemType = context.systemType;
        range.updatedAt = Date.now();
        if (!range.createdAt) range.createdAt = range.updatedAt;
        return true;
    }

    /**
     * 检查坐标是否在真实矩阵区域内
     */
    _isInCanvasRange(x, y) {
        const rect = this._getEffectiveCanvasRect();
        if (!rect) return true;
        return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    }

    /**
     * 检查框选区域是否完整落在真实矩阵区域内
     */
    _isSelectionInCanvasRange(x1, y1, x2, y2) {
        const rect = this._getEffectiveCanvasRect();
        if (!rect) return true;
        return x1 >= rect.left && x2 <= rect.right && y1 >= rect.top && y2 <= rect.bottom;
    }

    startBrush() {
        this.isBrushing = true;
        window.addEventListener('mousedown', this.onMouseDown);
        window.addEventListener('keydown', this.onKeyDown);
    }

    onKeyDown = (e) => {
        // 方向键移动最后一个框
        const obj = this.rangeArr[this.rangeArr.length - 1];
        if (!obj) return;
        const el = obj._element;
        if (!el) return;
        const moveBy = (dx, dy) => {
            const w = obj.x2 - obj.x1;
            const h = obj.y2 - obj.y1;
            const rect = this._getEffectiveCanvasRect();
            let nextX = obj.x1 + dx;
            let nextY = obj.y1 + dy;
            if (rect) {
                nextX = this._clampValue(nextX, rect.left, rect.right - w);
                nextY = this._clampValue(nextY, rect.top, rect.bottom - h);
            }
            obj.x1 = nextX;
            obj.y1 = nextY;
            obj.x2 = nextX + w;
            obj.y2 = nextY + h;
            el.style.left = obj.x1 + 'px';
            el.style.top = obj.y1 + 'px';
            this._syncRangeMetadata(obj);
            this.notify(this.rangeArr);
        };

        switch (e.key) {
            case 'ArrowUp':
                moveBy(0, -1);
                break;
            case 'ArrowDown':
                moveBy(0, 1);
                break;
            case 'ArrowLeft':
                moveBy(-1, 0);
                break;
            case 'ArrowRight':
                moveBy(1, 0);
                break;
            case 'Delete':
            case 'Backspace':
                // 删除最后一个框
                if (this.rangeArr.length > 0) {
                    this.deleteSelect(this.rangeArr.length - 1);
                }
                break;
            default:
                return;
        }
    }

    stopBrush() {
        this.isBrushing = false;
        window.removeEventListener('mousedown', this.onMouseDown);
        window.removeEventListener('mousemove', this.onMouseMove);
        window.removeEventListener('mouseup', this.onMouseUp);
        window.removeEventListener('keydown', this.onKeyDown);
        this.removeChild();
    }

    removeChild() {
        const selectBoxList = document.querySelectorAll('.selectBox');
        for (let i = 0; i < selectBoxList.length; i++) {
            if (selectBoxList[i].parentNode) {
                selectBoxList[i].parentNode.removeChild(selectBoxList[i]);
            }
        }
        this.rangeArr = [];
    }

    // ─── 为框添加交互控件（拖拽手柄 + 删除按钮 + 编号标签） ───
    _makeInteractive(el, rangeObj, boxIndex) {
        el.style.pointerEvents = 'auto';
        el.style.cursor = 'move';
        el.style.overflow = 'visible';

        const color = rangeObj.bgc;

        // 编号标签（左上角）
        const label = document.createElement('div');
        label.textContent = `${boxIndex + 1}`;
        label.classList.add('selectBox-control');
        Object.assign(label.style, {
            position: 'absolute', top: '-12px', left: '-12px',
            width: '22px', height: '22px', lineHeight: '20px', textAlign: 'center',
            background: color, color: '#fff', borderRadius: '50%',
            fontSize: '12px', fontWeight: 'bold', cursor: 'default',
            zIndex: '999', border: '2px solid #fff',
            pointerEvents: 'none', userSelect: 'none',
        });
        el.appendChild(label);

        // 删除按钮（右上角）
        const closeBtn = document.createElement('div');
        closeBtn.textContent = '×';
        closeBtn.classList.add('selectBox-control');
        Object.assign(closeBtn.style, {
            position: 'absolute', top: '-12px', right: '-12px',
            width: '22px', height: '22px', lineHeight: '20px', textAlign: 'center',
            background: '#ff4444', color: '#fff', borderRadius: '50%',
            fontSize: '14px', fontWeight: 'bold', cursor: 'pointer',
            zIndex: '999', border: '2px solid #fff',
            pointerEvents: 'auto', userSelect: 'none',
        });
        closeBtn.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            e.preventDefault();
        });
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            // 找到当前框在 rangeArr 中的索引
            const idx = this.rangeArr.indexOf(rangeObj);
            if (idx >= 0) this.deleteSelect(idx);
        });
        el.appendChild(closeBtn);

        // 8 个拖拽手柄
        const handles = [
            { cursor: 'nw-resize', pos: { top: '-5px', left: '-5px' }, dir: 'nw' },
            { cursor: 'ne-resize', pos: { top: '-5px', right: '-5px' }, dir: 'ne' },
            { cursor: 'sw-resize', pos: { bottom: '-5px', left: '-5px' }, dir: 'sw' },
            { cursor: 'se-resize', pos: { bottom: '-5px', right: '-5px' }, dir: 'se' },
            { cursor: 'n-resize', pos: { top: '-5px', left: '50%', marginLeft: '-5px' }, dir: 'n' },
            { cursor: 's-resize', pos: { bottom: '-5px', left: '50%', marginLeft: '-5px' }, dir: 's' },
            { cursor: 'w-resize', pos: { top: '50%', left: '-5px', marginTop: '-5px' }, dir: 'w' },
            { cursor: 'e-resize', pos: { top: '50%', right: '-5px', marginTop: '-5px' }, dir: 'e' },
        ];

        handles.forEach(({ cursor, pos, dir }) => {
            const h = document.createElement('div');
            h.classList.add('selectBox-control');
            Object.assign(h.style, {
                position: 'absolute', width: '10px', height: '10px',
                background: '#fff', border: `2px solid ${color}`, borderRadius: '2px',
                cursor, zIndex: '999', pointerEvents: 'auto',
                ...pos,
            });
            h.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                e.preventDefault();
                this._startResize(e, el, rangeObj, dir);
            });
            el.appendChild(h);
        });

        // 拖动整个框
        el.addEventListener('mousedown', (e) => {
            if (e.target !== el) return;
            e.stopPropagation();
            e.preventDefault();
            this._startDrag(e, el, rangeObj);
        });
    }

    addMatrixRange(matrixRect, options = {}) {
        const context = this._getMatrixContext();
        if (!context?.matrixConfig) {
            message.warning('请在 2D 数字视图下使用框选');
            return false;
        }
        if (this.rangeArr.length >= MAX_BOXES) {
            message.warning(`最多只能创建 ${MAX_BOXES} 个框选区域`);
            return false;
        }

        const xStart = Number(matrixRect?.xStart);
        const yStart = Number(matrixRect?.yStart);
        const xEnd = Number(matrixRect?.xEnd);
        const yEnd = Number(matrixRect?.yEnd);
        const values = [xStart, yStart, xEnd, yEnd];
        if (!values.every(Number.isFinite)) {
            message.warning('框选坐标必须为数字');
            return false;
        }
        if (!values.every(Number.isInteger)) {
            message.warning('框选坐标必须为整数');
            return false;
        }

        const width = context.matrixConfig.width;
        const height = context.matrixConfig.height;
        const selectWidth = xEnd - xStart;
        const selectHeight = yEnd - yStart;
        if (xStart < 0 || yStart < 0 || selectWidth <= 0 || selectHeight <= 0) {
            message.warning('框选区域无效');
            return false;
        }
        if (xEnd > width || yEnd > height) {
            message.warning('框选区域超出有效范围');
            return false;
        }

        const selectInfo = calMatrixToSelect('canvasThree', {
            xStart,
            yStart,
            sWidth: selectWidth,
            sHeight: selectHeight,
        }, context.matrixConfig);
        if (!selectInfo) {
            message.warning('无法计算框选位置');
            return false;
        }

        const optionColorIndex = options.colorIndex != null ? Number(options.colorIndex) : this._nextColorIndex();
        const colorIndex = Number.isFinite(optionColorIndex) ? optionColorIndex : this._nextColorIndex();
        const bgc = options.bgc || options.color || SELECT_COLORS[colorIndex] || SELECT_COLORS[0];
        const displayColor = getSelectBoxDisplayColor(bgc);
        const { selectX, selectY, selectWidth: pixelWidth, selectHeight: pixelHeight } = selectInfo;

        const element = document.createElement('div');
        element.classList.add('selectBox');
        Object.assign(element.style, {
            position: 'fixed',
            left: selectX + 'px',
            top: selectY + 'px',
            width: pixelWidth + 'px',
            height: pixelHeight + 'px',
            border: `2px solid ${displayColor}`,
            backgroundColor: getSelectBoxFillColor(bgc),
            boxShadow: `0 0 0 1px ${displayColor}`,
            opacity: 1,
            zIndex: 999,
            display: 'block',
        });
        document.body.appendChild(element);

        const now = Date.now();
        const rangeObj = {
            bgc,
            colorIndex,
            x1: selectX,
            x2: selectX + pixelWidth,
            y1: selectY,
            y2: selectY + pixelHeight,
            matrixKey: context.matrixKey,
            matrixRect: {
                xStart,
                xEnd,
                yStart,
                yEnd,
                width,
                height,
            },
            systemType: context.systemType,
            displayType: context.displayType,
            name: options.name || `框选${this.rangeArr.length + 1}`,
            templateId: options.templateId,
            createdAt: options.createdAt || now,
            updatedAt: now,
            _element: element,
        };

        this.rangeArr.push(rangeObj);
        this._makeInteractive(element, rangeObj, this.rangeArr.length - 1);
        this.notify(this.rangeArr);
        return true;
    }

    updateSelectName(index, name) {
        const rangeItem = this.rangeArr[index];
        if (!rangeItem) return;
        rangeItem.name = name || `框选${index + 1}`;
        rangeItem.updatedAt = Date.now();
        this.notify(this.rangeArr);
    }

    // ─── 拖拽调整大小 ──────────────────────────────────────
    _startResize(e, el, rangeObj, dir) {
        this._resizing = true;
        const startX = e.clientX;
        const startY = e.clientY;
        const origX1 = rangeObj.x1;
        const origY1 = rangeObj.y1;
        const origX2 = rangeObj.x2;
        const origY2 = rangeObj.y2;

        const onMove = (ev) => {
            if (!this._resizing) return;
            ev.preventDefault();
            const dx = ev.clientX - startX;
            const dy = ev.clientY - startY;

            let newX1 = origX1, newY1 = origY1, newX2 = origX2, newY2 = origY2;

            if (dir.includes('n')) newY1 = origY1 + dy;
            if (dir.includes('s')) newY2 = origY2 + dy;
            if (dir.includes('w')) newX1 = origX1 + dx;
            if (dir.includes('e')) newX2 = origX2 + dx;

            if (newX2 - newX1 < 10) { newX1 = origX1; newX2 = origX2; }
            if (newY2 - newY1 < 10) { newY1 = origY1; newY2 = origY2; }

            const clamped = this._clampPixelRect(newX1, newY1, newX2, newY2);
            rangeObj.x1 = clamped.x1;
            rangeObj.y1 = clamped.y1;
            rangeObj.x2 = clamped.x2;
            rangeObj.y2 = clamped.y2;

            el.style.left = rangeObj.x1 + 'px';
            el.style.top = rangeObj.y1 + 'px';
            el.style.width = (rangeObj.x2 - rangeObj.x1) + 'px';
            el.style.height = (rangeObj.y2 - rangeObj.y1) + 'px';
        };

        const onUp = (ev) => {
            ev.stopPropagation();
            this._resizing = false;
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp, true);
            if (!this._syncRangeMetadata(rangeObj)) {
                message.warning('框选区域超出有效范围');
                rangeObj.x1 = origX1;
                rangeObj.y1 = origY1;
                rangeObj.x2 = origX2;
                rangeObj.y2 = origY2;
                el.style.left = origX1 + 'px';
                el.style.top = origY1 + 'px';
                el.style.width = (origX2 - origX1) + 'px';
                el.style.height = (origY2 - origY1) + 'px';
                this._syncRangeMetadata(rangeObj);
            }
            this.notify(this.rangeArr);
        };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp, true);
    }

    // ─── 拖动整个框 ────────────────────────────────────────
    _startDrag(e, el, rangeObj) {
        this._dragging = true;
        const startX = e.clientX;
        const startY = e.clientY;
        const origX1 = rangeObj.x1;
        const origY1 = rangeObj.y1;
        const w = rangeObj.x2 - rangeObj.x1;
        const h = rangeObj.y2 - rangeObj.y1;

        const onMove = (ev) => {
            if (!this._dragging) return;
            ev.preventDefault();
            const dx = ev.clientX - startX;
            const dy = ev.clientY - startY;

            let nextX1 = origX1 + dx;
            let nextY1 = origY1 + dy;
            const rect = this._getEffectiveCanvasRect();
            if (rect) {
                nextX1 = this._clampValue(nextX1, rect.left, rect.right - w);
                nextY1 = this._clampValue(nextY1, rect.top, rect.bottom - h);
            }
            rangeObj.x1 = nextX1;
            rangeObj.y1 = nextY1;
            rangeObj.x2 = rangeObj.x1 + w;
            rangeObj.y2 = rangeObj.y1 + h;

            el.style.left = rangeObj.x1 + 'px';
            el.style.top = rangeObj.y1 + 'px';
        };

        const onUp = (ev) => {
            ev.stopPropagation();
            this._dragging = false;
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp, true);
            this._syncRangeMetadata(rangeObj);
            this.notify(this.rangeArr);
        };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp, true);
    }

    onMouseDown = (e) => {
        // 如果点击的是已有的框选区域或其子控件，不创建新框
        if (e.target.closest && e.target.closest('.selectBox')) return;
        // 如果正在拖拽或调整大小，不创建新框
        if (this._resizing || this._dragging) return;

        // 检查是否已达到最大框数
        if (this.rangeArr.length >= MAX_BOXES) {
            message.warning(`最多只能创建 ${MAX_BOXES} 个框选区域`);
            return;
        }

        const matrixContext = this._getMatrixContext();
        if (!matrixContext?.matrixConfig) {
            message.warning('请在 2D 数字视图下使用框选');
            return;
        }

        // 检查起点是否在 canvasThree 范围内
        if (!this._isInCanvasRange(e.clientX, e.clientY)) {
            message.warning('请在有效区域框选');
            return;
        }

        this._isDrawing = true;
        this.isBrushing = true;
        this.start = { x: e.clientX, y: e.clientY };
        this._currentColorIndex = this._nextColorIndex();
        window.addEventListener('mousemove', this.onMouseMove);
        window.addEventListener('mouseup', this.onMouseUp);

        this.element = document.createElement('div');
        this.element.classList.add('selectBox');
        this.element.style.pointerEvents = 'none';
        document.body.appendChild(this.element);

        this.element.style.left = e.clientX + 'px';
        this.element.style.top = e.clientY + 'px';
        this.element.style.width = '0px';
        this.element.style.height = '0px';
    };

    onMouseMove = (e) => {
        if (this._isDrawing && this.start) {
            if (Math.abs(this.start.x - e.clientX) > 5 && Math.abs(this.start.y - e.clientY) > 5) {
                const colorIndex = this._currentColorIndex;
                const bgc = SELECT_COLORS[colorIndex];
                const displayColor = getSelectBoxDisplayColor(bgc);

                this.element.classList.add(`selectBox-color-${colorIndex}`);
                this.element.style.border = `2px solid ${displayColor}`;
                this.element.style.backgroundColor = getSelectBoxFillColor(bgc);
                this.element.style.boxShadow = `0 0 0 1px ${displayColor}`;
                this.element.style.opacity = 1;
                this.element.style.display = 'block';

                this.pointBottomRight.x = Math.max(this.start.x, e.clientX);
                this.pointBottomRight.y = Math.max(this.start.y, e.clientY);
                this.pointTopLeft.x = Math.min(this.start.x, e.clientX);
                this.pointTopLeft.y = Math.min(this.start.y, e.clientY);

                this.element.style.left = this.pointTopLeft.x + 'px';
                this.element.style.top = this.pointTopLeft.y + 'px';
                this.element.style.width = (this.pointBottomRight.x - this.pointTopLeft.x) + 'px';
                this.element.style.height = (this.pointBottomRight.y - this.pointTopLeft.y) + 'px';

                this.range = {
                    x1: this.pointTopLeft.x,
                    y1: this.pointTopLeft.y,
                    x2: this.pointBottomRight.x,
                    y2: this.pointBottomRight.y,
                    bgc: bgc,
                    colorIndex: colorIndex,
                };
            }
        }
    };

    onMouseUp = () => {
        if (!this._isDrawing) return;
        this._isDrawing = false;

        window.removeEventListener('mousemove', this.onMouseMove);
        window.removeEventListener('mouseup', this.onMouseUp);

        const w = this.pointBottomRight.x - this.pointTopLeft.x;
        const h = this.pointBottomRight.y - this.pointTopLeft.y;

        if (w > 5 && h > 5) {
            // 检查框选区域是否完整落在真实矩阵区域内
            if (!this._isSelectionInCanvasRange(this.range.x1, this.range.y1, this.range.x2, this.range.y2)) {
                message.warning('请在有效区域框选');
                if (this.element && this.element.parentNode) {
                    this.element.parentNode.removeChild(this.element);
                }
                this.start = undefined;
                this.pointTopLeft = { x: 0, y: 0 };
                this.pointBottomRight = { x: 0, y: 0 };
                return;
            }

            this.range._element = this.element;
            this.range.name = this.range.name || `框选${this.rangeArr.length + 1}`;
            if (!this._syncRangeMetadata(this.range)) {
                message.warning('框选区域超出有效范围');
                if (this.element && this.element.parentNode) {
                    this.element.parentNode.removeChild(this.element);
                }
                this.start = undefined;
                this.pointTopLeft = { x: 0, y: 0 };
                this.pointBottomRight = { x: 0, y: 0 };
                return;
            }
            this.rangeArr.push(this.range);
            this.isBrushing = false;
            this.pointTopLeft = { x: 0, y: 0 };
            this.pointBottomRight = { x: 0, y: 0 };

            // 绘制完成后，为框添加交互控件
            this._makeInteractive(this.element, this.rangeArr[this.rangeArr.length - 1], this.rangeArr.length - 1);

            this.notify(this.rangeArr);
        } else {
            if (this.element && this.element.parentNode) {
                this.element.parentNode.removeChild(this.element);
            }
        }
        this.start = undefined;
    };

    deleteSelect = (index) => {
        const rangeItem = this.rangeArr[index];
        if (!rangeItem) return;
        const element = rangeItem._element;
        this.rangeArr.splice(index, 1);
        if (element && element.parentNode) {
            element.parentNode.removeChild(element);
        }
        this.notify(this.rangeArr);
    }

    /**
     * 删除所有框选
     */
    deleteAll = () => {
        for (let i = this.rangeArr.length - 1; i >= 0; i--) {
            const element = this.rangeArr[i]._element;
            if (element && element.parentNode) {
                element.parentNode.removeChild(element);
            }
        }
        this.rangeArr = [];
        this.notify(this.rangeArr);
    }
}

export const brushInstance = new BrushManager();
