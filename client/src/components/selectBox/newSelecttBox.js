import React from 'react';

// ─── 统一框选颜色 ───────────────────────────────────────
const BOX_BORDER_COLOR = '#ff4444'       // 未选中边框
const BOX_BG_COLOR = 'rgba(255,68,68,0.15)' // 未选中背景
const BOX_SELECTED_BORDER = '#ffcc00'    // 选中边框（高亮黄色）
const BOX_SELECTED_BG = 'rgba(255,204,0,0.25)' // 选中背景

export class BrushManager {
    constructor() {
        this.listeners = new Set();
        this.isBrushing = false;
        this.start = { x: 0, y: 0 };
        this.pointTopLeft = [];
        this.pointBottomRight = [];
        this.rangeArr = []
        this.selectIndex = 20
        this.selectedBoxIndex = -1  // 当前选中的框索引，-1 表示无选中
    }

    subscribe(cb) {
        this.listeners.add(cb);
    }

    unsubscribe(cb) {
        this.listeners.delete(cb);
    }

    notify(range) {
        this.listeners.forEach(cb => cb(range, this.selectedBoxIndex));
    }

    startBrush() {
        this.isBrushing = true;
        window.addEventListener('mousedown', this.onMouseDown);
        window.addEventListener('keydown', this.onKeyDown);
    }

    onKeyDown = (e) => {
        // 方向键移动选中的框（如果有选中的话），否则移动最后一个
        if (!this.rangeArr.length) return
        const targetIdx = this.selectedBoxIndex >= 0 ? this.selectedBoxIndex : this.rangeArr.length - 1
        let obj = this.rangeArr[targetIdx]
        if (!obj) return
        const el = document.querySelector(`.selectBox${obj.index}`)
        switch (e.key) {
            case 'ArrowUp':
                obj.y1 -= 1; obj.y2 -= 1;
                if (el) el.style.top = obj.y1 + 'px';
                this.notify(this.rangeArr);
                break;
            case 'ArrowDown':
                obj.y1 += 1; obj.y2 += 1;
                if (el) el.style.top = obj.y1 + 'px';
                this.notify(this.rangeArr);
                break;
            case 'ArrowLeft':
                obj.x1 -= 1; obj.x2 -= 1;
                if (el) el.style.left = obj.x1 + 'px';
                this.notify(this.rangeArr);
                break;
            case 'ArrowRight':
                obj.x1 += 1; obj.x2 += 1;
                if (el) el.style.left = obj.x1 + 'px';
                this.notify(this.rangeArr);
                break;
            default:
                return
        }
    }

    stopBrush() {
        this.isBrushing = false;
        window.removeEventListener('mousedown', this.onMouseDown);
        window.removeEventListener('mousemove', this.onMouseMove);
        window.removeEventListener('mouseup', this.onMouseUp);
        window.removeEventListener('keydown', this.onKeyDown);
        this.removeChild()
    }

    removeChild() {
        const selectBoxList = document.querySelectorAll('[class*="selectBox"]')
        selectBoxList.forEach(el => {
            if (el.parentElement) el.parentElement.removeChild(el)
        })
        this.rangeArr = []
        this.selectedBoxIndex = -1
    }

    // ─── 点击选中/取消选中 ──────────────────────────────
    _findClickedBox(e) {
        for (let i = this.rangeArr.length - 1; i >= 0; i--) {
            const box = this.rangeArr[i]
            if (e.clientX >= box.x1 && e.clientX <= box.x2 &&
                e.clientY >= box.y1 && e.clientY <= box.y2) {
                return i
            }
        }
        return -1
    }

    _updateBoxStyles() {
        for (let i = 0; i < this.rangeArr.length; i++) {
            const box = this.rangeArr[i]
            const el = document.querySelector(`.selectBox${box.index}`)
            if (!el) continue
            if (i === this.selectedBoxIndex) {
                el.style.border = `3px solid ${BOX_SELECTED_BORDER}`
                el.style.backgroundColor = BOX_SELECTED_BG
                el.style.boxShadow = `0 0 12px ${BOX_SELECTED_BORDER}`
            } else {
                el.style.border = `3px solid ${BOX_BORDER_COLOR}`
                el.style.backgroundColor = BOX_BG_COLOR
                el.style.boxShadow = 'none'
            }
        }
    }

    toggleSelectBox(index) {
        if (this.selectedBoxIndex === index) {
            this.selectedBoxIndex = -1  // 取消选中
        } else {
            this.selectedBoxIndex = index
        }
        this._updateBoxStyles()
        this.notify(this.rangeArr)
    }

    onMouseDown = (e) => {
        // 先检查是否点击了已有的框
        const clickedIdx = this._findClickedBox(e)
        if (clickedIdx >= 0) {
            // 标记为点击已有框，不创建新框
            this._clickedExisting = true
            this.toggleSelectBox(clickedIdx)
            return
        }

        this._clickedExisting = false
        this.isBrushing = true;
        this.start = { x: e.clientX, y: e.clientY };
        window.addEventListener('mousemove', this.onMouseMove);
        window.addEventListener('mouseup', this.onMouseUp);
        this.element = document.createElement('div');
        this.element.classList.add('selectBox');
        this.element.style.pointerEvents = 'none';
        this.element.style.border = `3px solid ${BOX_BORDER_COLOR}`;
        this.element.style.backgroundColor = BOX_BG_COLOR;
        document.body.appendChild(this.element);

        this.element.style.left = e.clientX + 'px';
        this.element.style.top = e.clientY + 'px';
        this.element.style.width = '0px';
        this.element.style.height = '0px';
    };

    onMouseMove = (e) => {
        if (this._clickedExisting) return
        if (this.isBrushing && this.start) {
            if (Math.abs(this.start.x - e.clientX) > 5 && Math.abs(this.start.y - e.clientY) > 5) {
                this.element.classList.add(`selectBox${this.selectIndex}`);
                this.element.style.opacity = 1
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
                    bgc: BOX_BORDER_COLOR,
                    index: this.selectIndex
                }
            }
        }
    };

    onMouseUp = () => {
        if (this._clickedExisting) return
        if (this.pointBottomRight.x - this.pointTopLeft.x > 5 && this.pointBottomRight.y - this.pointTopLeft.y > 5) {
            this.rangeArr.push(this.range)
            this.isBrushing = false
            this.pointTopLeft = { x: 0, y: 0 }
            this.pointBottomRight = { x: 0, y: 0 }
            this.selectIndex += 10
            this.notify(this.rangeArr);
        } else {
            if (this.element && this.element.parentElement) {
                document.body.removeChild(this.element);
            }
        }
        this.start = undefined
    };

    deleteSelect = (index) => {
        if (index < 0 || index >= this.rangeArr.length) return
        const elementIndex = this.rangeArr[index].index
        const element = document.querySelector(`.selectBox${elementIndex}`)
        this.rangeArr.splice(index, 1)
        if (element && element.parentElement) element.parentElement.removeChild(element)
        // 更新选中索引
        if (this.selectedBoxIndex === index) {
            this.selectedBoxIndex = -1
        } else if (this.selectedBoxIndex > index) {
            this.selectedBoxIndex--
        }
        this._updateBoxStyles()
        this.notify(this.rangeArr);
    }
}

export const brushInstance = new BrushManager();
