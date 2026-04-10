import React from 'react';
import { jet } from '../../util/util';

function toHex2(num) {
    return num.toString(16).padStart(2, '0');
}

export class BrushManager {
    constructor() {
        this.listeners = new Set();
        this.isBrushing = false;
        this.start = { x: 0, y: 0 };
        this.pointTopLeft = [];
        this.pointBottomRight = [];
        this.rangeArr = []
        this.selectIndex = 20
    }

    subscribe(cb) {
        this.listeners.add(cb);
    }

    unsubscribe(cb) {
        this.listeners.delete(cb);
    }

    notify(range) {
        console.log(this.listeners, range)
        this.listeners.forEach(cb => cb(range));
    }

    startBrush() {
        this.isBrushing = true;
        window.addEventListener('mousedown', this.onMouseDown);
        window.addEventListener('keydown', this.onKeyDown);
    }

    onKeyDown = (e) => {
        console.log(e.key, (this.range))
        const obj = this.rangeArr[0]
        if (!obj || !this.element) return

        switch (e.key) {
            case 'ArrowUp':
                obj.y1 -= 1
                obj.y2 -= 1
                this.notify(this.rangeArr);
                this.element.style.top = obj.y1 + 'px';
                break;
            case 'ArrowDown':
                obj.y1 += 1
                obj.y2 += 1
                this.element.style.top = obj.y1 + 'px';
                this.notify(this.rangeArr);
                break;
            case 'ArrowLeft':
                obj.x1 -= 1
                obj.x2 -= 1
                this.notify(this.rangeArr);
                this.element.style.left = obj.x1 + 'px';
                break;
            case 'ArrowRight':
                obj.x1 += 1
                obj.x2 += 1
                this.notify(this.rangeArr);
                this.element.style.left = obj.x1 + 'px';
                break;
            default:
                return
        }
    }

    stopBrush() {
        this.isBrushing = false;
        console.log('stop')
        window.removeEventListener('mousedown', this.onMouseDown);
        window.removeEventListener('mousemove', this.onMouseMove);
        window.removeEventListener('mouseup', this.onMouseUp);
        window.removeEventListener('keydown', this.onKeyDown);

        this.removeChild()
    }

    removeChild() {
        const selectBoxList = document.querySelectorAll('.selectBox')

        for (let i = 0; i < selectBoxList.length; i++) {
            if (selectBoxList[i].parentNode) {
                document.body.removeChild(selectBoxList[i])
            }
        }

        this.rangeArr = []
    }

    onMouseDown = (e) => {
        console.log('dowm')
        this.isBrushing = true;
        this.start = { x: e.clientX, y: e.clientY };
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
        if (this.isBrushing && this.start) {
            if (Math.abs(this.start.x - e.clientX) > 5 && Math.abs(this.start.y - e.clientY) > 5) {
                console.log('range')
                const bgc = jet(0, 200, this.selectIndex)
                this.element.classList.add(`selectBox${this.selectIndex}`);
                const r = bgc[0]
                const g = bgc[1]
                const b = bgc[2]

                this.element.style.backgroundColor = `#${toHex2(r)}${toHex2(g)}${toHex2(b)}`
                this.element.style.opacity = 0.6
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
                    bgc: `#${toHex2(r)}${toHex2(g)}${toHex2(b)}`,
                    index: this.selectIndex
                }
            }
        }
    };

    onMouseUp = () => {
        console.log(this.pointBottomRight.x - this.pointTopLeft.x, this.pointBottomRight.y - this.pointTopLeft.y)
        if (this.pointBottomRight.x - this.pointTopLeft.x > 5 && this.pointBottomRight.y - this.pointTopLeft.y > 5) {
            this.selectIndex += 10
            console.log(this.range)
            this.rangeArr.push(this.range)
            this.isBrushing = false
            this.pointTopLeft = { x: 0, y: 0 }
            this.pointBottomRight = { x: 0, y: 0 }

            if (this.rangeArr.length > 1) {
                const element = document.querySelector(`.selectBox${20}`)
                if (element && element.parentNode) {
                    document.body.removeChild(element)
                }
                this.rangeArr.splice(0, 1)
            }
            this.selectIndex = 20
            this.notify(this.rangeArr);
        } else if (this.element && this.element.parentNode) {
            document.body.removeChild(this.element);
        }
        this.start = undefined
    };

    deleteSelect = (index) => {
        const rangeItem = this.rangeArr[index]
        if (!rangeItem) return
        const element = document.querySelector(`.selectBox${rangeItem.index}`)
        this.rangeArr.splice(index, 1)
        if (element && element.parentNode) {
            document.body.removeChild(element)
        }
        this.notify(this.rangeArr);
    }
}

export const brushInstance = new BrushManager();
