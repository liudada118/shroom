import React from 'react';
import { message } from 'antd';

// ─── 4 个框选的固定颜色 ──────────────────────────────────────
export const SELECT_COLORS = [
    '#FF6B6B',  // 框1 - 红
    '#4ECDC4',  // 框2 - 青
    '#FFD93D',  // 框3 - 黄
    '#6C5CE7',  // 框4 - 紫
];

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
     * 检查坐标是否在 canvasThree 有效范围内
     */
    _isInCanvasRange(x, y) {
        const canvas = document.querySelector('.canvasThree');
        if (!canvas) return true; // 找不到 canvas 则不限制
        const rect = canvas.getBoundingClientRect();
        return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    }

    /**
     * 检查框选区域是否与 canvasThree 有交集
     */
    _hasCanvasOverlap(x1, y1, x2, y2) {
        const canvas = document.querySelector('.canvasThree');
        if (!canvas) return true;
        const rect = canvas.getBoundingClientRect();
        // 检查两个矩形是否有交集
        return !(x2 < rect.left || x1 > rect.right || y2 < rect.top || y1 > rect.bottom);
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

        switch (e.key) {
            case 'ArrowUp':
                obj.y1 -= 1; obj.y2 -= 1;
                el.style.top = obj.y1 + 'px';
                this.notify(this.rangeArr);
                break;
            case 'ArrowDown':
                obj.y1 += 1; obj.y2 += 1;
                el.style.top = obj.y1 + 'px';
                this.notify(this.rangeArr);
                break;
            case 'ArrowLeft':
                obj.x1 -= 1; obj.x2 -= 1;
                el.style.left = obj.x1 + 'px';
                this.notify(this.rangeArr);
                break;
            case 'ArrowRight':
                obj.x1 += 1; obj.x2 += 1;
                el.style.left = obj.x1 + 'px';
                this.notify(this.rangeArr);
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

            rangeObj.x1 = newX1;
            rangeObj.y1 = newY1;
            rangeObj.x2 = newX2;
            rangeObj.y2 = newY2;

            el.style.left = newX1 + 'px';
            el.style.top = newY1 + 'px';
            el.style.width = (newX2 - newX1) + 'px';
            el.style.height = (newY2 - newY1) + 'px';
        };

        const onUp = (ev) => {
            ev.stopPropagation();
            this._resizing = false;
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp, true);
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

            rangeObj.x1 = origX1 + dx;
            rangeObj.y1 = origY1 + dy;
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

        // 检查起点是否在 canvasThree 范围内
        if (!this._isInCanvasRange(e.clientX, e.clientY)) {
            message.warning('请在有效范围内框选');
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

                this.element.classList.add(`selectBox-color-${colorIndex}`);
                this.element.style.border = `2px solid ${bgc}`;
                this.element.style.backgroundColor = bgc;
                this.element.style.opacity = 0.3;
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
            // 检查框选区域是否与 canvasThree 有交集
            if (!this._hasCanvasOverlap(this.range.x1, this.range.y1, this.range.x2, this.range.y2)) {
                message.warning('请在有效范围内框选');
                if (this.element && this.element.parentNode) {
                    this.element.parentNode.removeChild(this.element);
                }
                this.start = undefined;
                this.pointTopLeft = { x: 0, y: 0 };
                this.pointBottomRight = { x: 0, y: 0 };
                return;
            }

            this.range._element = this.element;
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
