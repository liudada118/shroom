import React from 'react';
import { message } from 'antd';
import i18n from 'i18next';
import { getDisplayType, getSysType } from '../../store/equipStore';
import { getMatrixPartFromDisplayType, systemPointConfig } from '../../util/constant';
import { isMoreMatrix } from '../../assets/util/util';
import { calMatrixToSelect, matrixRectToSelectRect, snapPixelRangeToMatrixRect } from '../../assets/util/selectMatrix';
import { getDefaultSelectionName } from '../../util/selectionName';
import { isEndiBackVisibleCell } from '../../util/endiBackVisibleMask';

// ─── 6 个框选的固定颜色 ──────────────────────────────────────
// 回放侧的 HISTORY_SELECT_COLORS（assets/util/selectMatrix.js）要与此保持一致
export const SELECT_COLORS = [
    '#FF6B6B',  // 框1 - 红
    '#4ECDC4',  // 框2 - 青
    '#FFD93D',  // 框3 - 黄
    '#6C5CE7',  // 框4 - 紫
    '#FF9F43',  // 框5 - 橙
    '#C2185B',  // 框6 - 深玫红（避开 jet 色阶的蓝→青→绿→黄→红，压在蓝色低压区也能看清）
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

// 框选区域上限，导出侧 util/db.js 的 MAX_EXPORT_SELECTIONS 要保持一致
export const MAX_BOXES = 6;
const tr = (key, options) => i18n.t(key, options);
const defaultSelectName = (index) => getDefaultSelectionName(index, tr);

export class BrushManager {
    constructor() {
        this.listeners = new Set();
        this.isBrushing = false;
        this.start = { x: 0, y: 0 };
        this.pointTopLeft = [];
        this.pointBottomRight = [];
        this.rangeArr = []       // 最多 MAX_BOXES 个框选 [{x1,y1,x2,y2,bgc,colorIndex,_element}]
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
     * 获取下一个可用的颜色索引（0 ~ MAX_BOXES-1）
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
            const matrixType = getMatrixPartFromDisplayType(displayType);
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
        const matrixRect = { xStart, xEnd, yStart, yEnd, width, height };
        return this._isValidMatrixSelection(matrixRect, context) ? matrixRect : null;
    }

    _isValidMatrixSelection(matrixRect, context = this._getMatrixContext()) {
        if (!matrixRect) return false;
        if (context?.matrixKey !== 'endi-back') return true;

        const { xStart, xEnd, yStart, yEnd, width, height } = matrixRect;
        for (let y = yStart; y < yEnd; y += 1) {
            for (let x = xStart; x < xEnd; x += 1) {
                if (!isEndiBackVisibleCell(y, x, width, height)) {
                    return false;
                }
            }
        }
        return true;
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

    _applyRangeToElement(range, el = range?._element) {
        if (!range || !el) return;
        el.style.left = range.x1 + 'px';
        el.style.top = range.y1 + 'px';
        el.style.width = (range.x2 - range.x1) + 'px';
        el.style.height = (range.y2 - range.y1) + 'px';
    }

    _snapRangeToMatrixGrid(range, context = this._getMatrixContext()) {
        if (!range || !context?.matrixConfig) return false;
        const snapped = snapPixelRangeToMatrixRect(context.canvasRect, range, context.matrixConfig, context.effectiveRect);
        if (!snapped || !this._isValidMatrixSelection(snapped.matrixRect, context)) return false;

        range.x1 = snapped.x1;
        range.y1 = snapped.y1;
        range.x2 = snapped.x2;
        range.y2 = snapped.y2;
        range.matrixRect = snapped.matrixRect;
        range.matrixKey = context.matrixKey;
        range.displayType = context.displayType;
        range.systemType = context.systemType;
        range.updatedAt = Date.now();
        if (!range.createdAt) range.createdAt = range.updatedAt;
        this._applyRangeToElement(range);
        return true;
    }

    _snapMovedRangeToMatrixGrid(range, originalMatrixRect = range?.matrixRect, context = this._getMatrixContext()) {
        if (!range || !originalMatrixRect || !context?.matrixConfig || !context?.effectiveRect) {
            return this._snapRangeToMatrixGrid(range, context);
        }

        const { matrixConfig, effectiveRect, canvasRect } = context;
        const { width, height } = matrixConfig;
        const selectWidth = Number(originalMatrixRect.xEnd) - Number(originalMatrixRect.xStart);
        const selectHeight = Number(originalMatrixRect.yEnd) - Number(originalMatrixRect.yStart);
        if (!Number.isFinite(selectWidth) || !Number.isFinite(selectHeight) || selectWidth <= 0 || selectHeight <= 0) {
            return this._snapRangeToMatrixGrid(range, context);
        }

        const unitWidth = (effectiveRect.right - effectiveRect.left) / width;
        const unitHeight = (effectiveRect.bottom - effectiveRect.top) / height;
        const left = Math.min(range.x1, range.x2);
        const top = Math.min(range.y1, range.y2);
        const maxXStart = Math.max(0, width - selectWidth);
        const maxYStart = Math.max(0, height - selectHeight);
        const xStart = this._clampValue(Math.round((left - effectiveRect.left) / unitWidth), 0, maxXStart);
        const yStart = this._clampValue(Math.round((top - effectiveRect.top) / unitHeight), 0, maxYStart);
        const matrixRect = {
            xStart,
            yStart,
            xEnd: xStart + selectWidth,
            yEnd: yStart + selectHeight,
            width,
            height,
        };
        if (!this._isValidMatrixSelection(matrixRect, context)) return false;

        const selectRect = matrixRectToSelectRect(canvasRect, {
            xStart,
            yStart,
            sWidth: selectWidth,
            sHeight: selectHeight,
        }, matrixConfig);

        range.x1 = selectRect.selectX;
        range.y1 = selectRect.selectY;
        range.x2 = selectRect.selectX + selectRect.selectWidth;
        range.y2 = selectRect.selectY + selectRect.selectHeight;
        range.matrixRect = matrixRect;
        range.matrixKey = context.matrixKey;
        range.displayType = context.displayType;
        range.systemType = context.systemType;
        range.updatedAt = Date.now();
        if (!range.createdAt) range.createdAt = range.updatedAt;
        this._applyRangeToElement(range);
        return true;
    }

    _getRangeMatrixRect(range) {
        return this._rangeToMatrixRect(range) || range?.matrixRect || null;
    }

    _formatRangeLabel(range) {
        const matrix = this._getRangeMatrixRect(range);
        if (!matrix) return '拖拽中';
        const width = matrix.xEnd - matrix.xStart;
        const height = matrix.yEnd - matrix.yStart;
        return `X ${matrix.xStart}-${matrix.xEnd} / Y ${matrix.yStart}-${matrix.yEnd} · ${width} x ${height}`;
    }

    _ensureMeasureBadge(el) {
        let badge = el.querySelector('.selectBox-measure');
        if (badge) return badge;
        badge = document.createElement('div');
        badge.classList.add('selectBox-measure');
        Object.assign(badge.style, {
            position: 'absolute',
            left: '0',
            bottom: '-28px',
            maxWidth: '18rem',
            padding: '3px 8px',
            borderRadius: '999px',
            background: 'rgba(3, 5, 7, 0.88)',
            color: '#fff',
            fontSize: '11px',
            fontWeight: '700',
            lineHeight: '16px',
            whiteSpace: 'nowrap',
            boxShadow: '0 6px 18px rgba(0, 0, 0, 0.35)',
            pointerEvents: 'none',
            userSelect: 'none',
            zIndex: '1001',
        });
        el.appendChild(badge);
        return badge;
    }

    _updateMeasureBadge(el, range) {
        if (!el || !range) return;
        const badge = this._ensureMeasureBadge(el);
        badge.textContent = this._formatRangeLabel(range);
    }

    _refreshBoxLabels() {
        this.rangeArr.forEach((range, index) => {
            const label = range?._element?.querySelector('.selectBox-index');
            if (label) label.textContent = `${index + 1}`;
        });
    }

    _removeRangeElement(range) {
        const element = range?._element;
        if (element && element.parentNode) {
            element.parentNode.removeChild(element);
        }
        if (range) delete range._element;
    }

    _createRangeElement(range, selectInfo) {
        if (!range || !selectInfo) return null;
        const bgc = range.bgc || SELECT_COLORS[range.colorIndex] || SELECT_COLORS[0];
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
            boxSizing: 'border-box',
            border: `2px solid ${displayColor}`,
            backgroundColor: getSelectBoxFillColor(bgc),
            boxShadow: `0 0 0 1px ${displayColor}`,
            opacity: 1,
            zIndex: 999,
            display: 'block',
        });
        document.body.appendChild(element);
        range.x1 = selectX;
        range.x2 = selectX + pixelWidth;
        range.y1 = selectY;
        range.y2 = selectY + pixelHeight;
        range._element = element;
        this._makeInteractive(element, range, this.rangeArr.indexOf(range));
        return element;
    }

    _attachRangeElementForContext(range, context = this._getMatrixContext()) {
        if (!range || !context?.matrixConfig || !range.matrixRect) return false;
        if (range.matrixKey && range.matrixKey !== context.matrixKey) return false;
        const matrixRect = range.matrixRect;
        const selectWidth = Number(matrixRect.xEnd) - Number(matrixRect.xStart);
        const selectHeight = Number(matrixRect.yEnd) - Number(matrixRect.yStart);
        if (selectWidth <= 0 || selectHeight <= 0) return false;
        const selectInfo = calMatrixToSelect('canvasThree', {
            xStart: Number(matrixRect.xStart),
            yStart: Number(matrixRect.yStart),
            sWidth: selectWidth,
            sHeight: selectHeight,
        }, context.matrixConfig);
        if (!selectInfo) return false;
        const element = range._element || this._createRangeElement(range, selectInfo);
        if (!element) return false;
        const { selectX, selectY, selectWidth: pixelWidth, selectHeight: pixelHeight } = selectInfo;
        range.x1 = selectX;
        range.x2 = selectX + pixelWidth;
        range.y1 = selectY;
        range.y2 = selectY + pixelHeight;
        this._applyRangeToElement(range, element);
        this._updateMeasureBadge(element, range);
        return true;
    }

    refreshCurrentMatrix(notify = true) {
        const context = this._getMatrixContext();
        this.rangeArr.forEach((range) => {
            const shouldAttach = context?.matrixConfig && (!range.matrixKey || range.matrixKey === context.matrixKey);
            if (shouldAttach) {
                this._attachRangeElementForContext(range, context);
            } else {
                this._removeRangeElement(range);
            }
        });
        this._refreshBoxLabels();
        if (notify) this.notify(this.rangeArr);
    }

    /**
     * 检查坐标是否在真实矩阵区域内
     */
    _isInCanvasRange(x, y) {
        const rect = this._getEffectiveCanvasRect();
        if (!rect) return true;
        return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    }

    _isInCanvasRect(x, y, context = this._getMatrixContext()) {
        const rect = context?.canvasRect;
        if (!rect) return false;
        return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    }

    _shouldIgnorePointerTarget(target) {
        return Boolean(target?.closest?.([
            '.selectBox',
            '.drawerContent',
            '.titleContent',
            '.secondTitle',
            '.ant-popover',
            '.ant-modal',
            '.ant-message',
            '.ant-select-dropdown',
            '.ant-picker-dropdown',
            '.colAndHContent',
            '.ant-slider',
        ].join(',')));
    }

    _shouldIgnoreKeyboardTarget(target) {
        if (!target) return false;
        const tagName = String(target.tagName || '').toLowerCase();
        if (['input', 'textarea', 'select', 'option'].includes(tagName)) return true;
        if (target.isContentEditable) return true;
        return Boolean(target.closest?.([
            '[contenteditable="true"]',
            '.ant-input',
            '.ant-input-number',
            '.ant-select',
            '.ant-picker',
            '.ant-modal',
            '.ant-popover',
        ].join(',')));
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
        if (this._shouldIgnoreKeyboardTarget(e.target || document.activeElement)) return;
        // 方向键移动最后一个框
        const obj = [...this.rangeArr].reverse().find(range => range?._element);
        if (!obj) return;
        const el = obj._element;
        if (!el) return;
        const moveBy = (dx, dy) => {
            const w = obj.x2 - obj.x1;
            const h = obj.y2 - obj.y1;
            const rect = this._getEffectiveCanvasRect();
            const prev = { x1: obj.x1, y1: obj.y1, x2: obj.x2, y2: obj.y2 };
            const prevMatrixRect = obj.matrixRect ? { ...obj.matrixRect } : null;
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
            if (!this._rangeToMatrixRect(obj) || !this._snapMovedRangeToMatrixGrid(obj, prevMatrixRect)) {
                obj.x1 = prev.x1;
                obj.y1 = prev.y1;
                obj.x2 = prev.x2;
                obj.y2 = prev.y2;
                el.style.left = obj.x1 + 'px';
                el.style.top = obj.y1 + 'px';
                this._syncRangeMetadata(obj);
                message.warning(tr('selectionOutOfValidRange'));
            }
            this._updateMeasureBadge(el, obj);
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
                if (obj) {
                    const idx = this.rangeArr.indexOf(obj);
                    if (idx >= 0) this.deleteSelect(idx);
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
        this.notify(this.rangeArr);
    }

    // ─── 为框添加交互控件（拖拽手柄 + 删除按钮 + 编号标签） ───
    _makeInteractive(el, rangeObj, boxIndex) {
        el.style.pointerEvents = 'auto';
        el.style.cursor = 'move';
        el.style.overflow = 'visible';

        const color = rangeObj.bgc;

        // 编号标签（左上角）
        this._updateMeasureBadge(el, rangeObj);

        // 删除按钮（右上角）
        const closeBtn = document.createElement('div');
        closeBtn.innerHTML = '<i class="iconfont">&#xe625;</i>';
        closeBtn.classList.add('selectBox-control');
        Object.assign(closeBtn.style, {
            position: 'absolute', top: '-24px', right: '-24px',
            width: '20px', height: '20px', lineHeight: '20px', textAlign: 'center',
            background: 'rgba(20, 20, 20, 0.92)', color: '#ff6b6b', borderRadius: '4px',
            fontSize: '12px', fontWeight: '900', cursor: 'pointer',
            zIndex: '1002', border: '1px solid rgba(255,107,107,0.75)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
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
                el.classList.add('selectBox-active');
                this._startResize(e, el, rangeObj, dir);
            });
            el.appendChild(h);
        });

        // 拖动整个框
        el.addEventListener('mousedown', (e) => {
            if (e.target !== el) return;
            e.stopPropagation();
            e.preventDefault();
            el.classList.add('selectBox-active');
            this._startDrag(e, el, rangeObj);
        });
    }

    addMatrixRange(matrixRect, options = {}) {
        const context = this._getMatrixContext();
        if (!context?.matrixConfig) {
            message.warning(tr('useIn2DMode'));
            return false;
        }
        if (this.rangeArr.length >= MAX_BOXES) {
            message.warning(tr('maxSelectBoxes', { count: MAX_BOXES }));
            return false;
        }

        const xStart = Number(matrixRect?.xStart);
        const yStart = Number(matrixRect?.yStart);
        const xEnd = Number(matrixRect?.xEnd);
        const yEnd = Number(matrixRect?.yEnd);
        const values = [xStart, yStart, xEnd, yEnd];
        if (!values.every(Number.isFinite)) {
            message.warning(tr('selectionCoordinatesMustBeNumbers'));
            return false;
        }
        if (!values.every(Number.isInteger)) {
            message.warning(tr('selectionCoordinatesMustBeIntegers'));
            return false;
        }

        const width = context.matrixConfig.width;
        const height = context.matrixConfig.height;
        const selectWidth = xEnd - xStart;
        const selectHeight = yEnd - yStart;
        if (xStart < 0 || yStart < 0 || selectWidth <= 0 || selectHeight <= 0) {
            message.warning(tr('selectionCoordinatesInvalid'));
            return false;
        }
        if (xEnd > width || yEnd > height) {
            message.warning(tr('selectionOutOfValidRange'));
            return false;
        }
        const matrixRectForValidation = { xStart, xEnd, yStart, yEnd, width, height };
        if (!this._isValidMatrixSelection(matrixRectForValidation, context)) {
            message.warning(tr('selectionOutOfValidRange'));
            return false;
        }

        const selectInfo = calMatrixToSelect('canvasThree', {
            xStart,
            yStart,
            sWidth: selectWidth,
            sHeight: selectHeight,
        }, context.matrixConfig);
        if (!selectInfo) {
            message.warning(tr('selectionPositionCalcFailed'));
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
            boxSizing: 'border-box',
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
            name: options.name || defaultSelectName(this.rangeArr.length + 1),
            templateId: options.templateId,
            createdAt: options.createdAt || now,
            updatedAt: now,
            _element: element,
        };

        this.rangeArr.push(rangeObj);
        this._makeInteractive(element, rangeObj, this.rangeArr.length - 1);
        this._refreshBoxLabels();
        this.notify(this.rangeArr);
        return true;
    }

    updateSelectName(index, name) {
        const rangeItem = this.rangeArr[index];
        if (!rangeItem) return;
        rangeItem.name = name || defaultSelectName(index + 1);
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
            this._updateMeasureBadge(el, rangeObj);
        };

        const onUp = (ev) => {
            ev.stopPropagation();
            this._resizing = false;
            el.classList.remove('selectBox-active');
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp, true);
            if (!this._syncRangeMetadata(rangeObj)) {
                message.warning(tr('selectionOutOfValidRange'));
                rangeObj.x1 = origX1;
                rangeObj.y1 = origY1;
                rangeObj.x2 = origX2;
                rangeObj.y2 = origY2;
                el.style.left = origX1 + 'px';
                el.style.top = origY1 + 'px';
                el.style.width = (origX2 - origX1) + 'px';
                el.style.height = (origY2 - origY1) + 'px';
                this._syncRangeMetadata(rangeObj);
            } else {
                this._snapRangeToMatrixGrid(rangeObj);
            }
            this._updateMeasureBadge(el, rangeObj);
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
        const origMatrixRect = rangeObj.matrixRect ? { ...rangeObj.matrixRect } : null;

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
            this._updateMeasureBadge(el, rangeObj);
        };

        const onUp = (ev) => {
            ev.stopPropagation();
            this._dragging = false;
            el.classList.remove('selectBox-active');
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp, true);
            if (!this._rangeToMatrixRect(rangeObj) || !this._snapMovedRangeToMatrixGrid(rangeObj, origMatrixRect)) {
                message.warning(tr('selectionOutOfValidRange'));
                rangeObj.x1 = origX1;
                rangeObj.y1 = origY1;
                rangeObj.x2 = origX1 + w;
                rangeObj.y2 = origY1 + h;
                el.style.left = origX1 + 'px';
                el.style.top = origY1 + 'px';
                this._syncRangeMetadata(rangeObj);
            }
            this._updateMeasureBadge(el, rangeObj);
            this.notify(this.rangeArr);
        };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp, true);
    }

    onMouseDown = (e) => {
        // 如果点击的是已有的框选区域或其子控件，不创建新框
        if (this._shouldIgnorePointerTarget(e.target)) return;
        // 如果正在拖拽或调整大小，不创建新框
        if (this._resizing || this._dragging) return;

        const matrixContext = this._getMatrixContext();
        if (!matrixContext?.matrixConfig) {
            message.warning(tr('useIn2DMode'));
            return;
        }

        // 只有点击 2D canvas 时才进入框选逻辑，点击抽屉/工具栏/空白区域不提示。
        if (!this._isInCanvasRect(e.clientX, e.clientY, matrixContext)) {
            return;
        }

        // 检查是否已达到最大框数
        if (this.rangeArr.length >= MAX_BOXES) {
            message.warning(tr('maxSelectBoxes', { count: MAX_BOXES }));
            return;
        }

        // 检查起点是否在真实矩阵有效区域内。
        if (!this._isInCanvasRange(e.clientX, e.clientY)) {
            message.warning(tr('selectInValidArea'));
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
        this.element.classList.add('selectBox-drawing');
        this.element.style.pointerEvents = 'none';
        this.element.style.boxSizing = 'border-box';
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
                this._updateMeasureBadge(this.element, this.range);
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
                message.warning(tr('selectInValidArea'));
                if (this.element && this.element.parentNode) {
                    this.element.parentNode.removeChild(this.element);
                }
                this.start = undefined;
                this.pointTopLeft = { x: 0, y: 0 };
                this.pointBottomRight = { x: 0, y: 0 };
                return;
            }

            this.range._element = this.element;
            this.range.name = this.range.name || defaultSelectName(this.rangeArr.length + 1);
            if (!this._syncRangeMetadata(this.range)) {
                message.warning(tr('selectionOutOfValidRange'));
                if (this.element && this.element.parentNode) {
                    this.element.parentNode.removeChild(this.element);
                }
                this.start = undefined;
                this.pointTopLeft = { x: 0, y: 0 };
                this.pointBottomRight = { x: 0, y: 0 };
                return;
            }
            this._snapRangeToMatrixGrid(this.range);
            this.rangeArr.push(this.range);
            this.element.classList.remove('selectBox-drawing');
            this.isBrushing = false;
            this.pointTopLeft = { x: 0, y: 0 };
            this.pointBottomRight = { x: 0, y: 0 };

            // 绘制完成后，为框添加交互控件
            this._makeInteractive(this.element, this.rangeArr[this.rangeArr.length - 1], this.rangeArr.length - 1);
            this._refreshBoxLabels();

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
        this._refreshBoxLabels();
        this.notify(this.rangeArr);
    }

    /**
     * 删除所有框选
     */
    deleteByMatrixKey = (matrixKey = this._getMatrixContext()?.matrixKey) => {
        if (!matrixKey) return;
        for (let i = this.rangeArr.length - 1; i >= 0; i--) {
            const range = this.rangeArr[i];
            if (range.matrixKey && range.matrixKey !== matrixKey) continue;
            this._removeRangeElement(range);
            this.rangeArr.splice(i, 1);
        }
        this._refreshBoxLabels();
        this.notify(this.rangeArr);
    }

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
