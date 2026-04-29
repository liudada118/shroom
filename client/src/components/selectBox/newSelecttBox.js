import React from 'react';
import { message } from 'antd';
import { getDisplayType, getSysType } from '../../store/equipStore';
import { systemPointConfig } from '../../util/constant';
import { isMoreMatrix } from '../../assets/util/util';
import { colSelectMatrix } from '../../util/util';
import { calMatrixToSelect } from '../../assets/util/selectMatrix';

// ─── 8 个框选的固定颜色 ──────────────────────────────────────
export const SELECT_COLORS = [
    '#FF6B6B',  // 框1 - 红
    '#4ECDC4',  // 框2 - 青
    '#FFD93D',  // 框3 - 黄
    '#6C5CE7',  // 框4 - 紫
    '#5B8DEF',  // 框5 - 蓝
    '#FF8A65',  // 框6 - 橙
    '#A0D468',  // 框7 - 绿
    '#EC87C0',  // 框8 - 粉
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

const MAX_BOXES = 8;

/**
 * 给框 element 附加（或更新）左上角的"框 N"标号
 */
export function attachBoxLabel(element, colorIndex, bgc) {
    if (!element) return;
    let label = element.querySelector('.selectBoxLabel');
    const baseColor = bgc || SELECT_COLORS[colorIndex];
    const displayColor = getSelectBoxDisplayColor(baseColor);
    if (!label) {
        label = document.createElement('div');
        label.className = 'selectBoxLabel';
        Object.assign(label.style, {
            position: 'absolute',
            top: '-1px',
            left: '-1px',
            minWidth: '14px',
            textAlign: 'center',
            padding: '1px 4px',
            fontSize: '10px',
            fontWeight: '700',
            lineHeight: '1.2',
            color: '#1A1C20',
            background: displayColor,
            borderTopLeftRadius: '3px',
            borderBottomRightRadius: '4px',
            pointerEvents: 'none',
            userSelect: 'none',
            fontFamily: 'ui-monospace, monospace',
            zIndex: '2',
            boxShadow: '0 1px 2px rgba(0,0,0,0.4)',
        });
        element.appendChild(label);
    }
    label.style.background = displayColor;
    label.textContent = String(colorIndex + 1);
}

const PRESETS_STORAGE_KEY = 'brushPresets_v1'

// 优先使用 electronAPI 写入 userData 目录(跨端口/会话稳定)
// 否则降级到 localStorage(可能因端口变化丢失)
function hasElectronApi() {
    return typeof window !== 'undefined' && window.electronAPI
        && typeof window.electronAPI.readBrushPresets === 'function'
        && typeof window.electronAPI.writeBrushPresets === 'function'
}

// 同步入口: 启动时返回 localStorage 数据 (兼容老用户), 异步刷新会再覆盖
function loadPresetsFromStorage() {
    try {
        const raw = localStorage.getItem(PRESETS_STORAGE_KEY)
        return raw ? JSON.parse(raw) : {}
    } catch {
        return {}
    }
}

function savePresetsToStorage(presets) {
    // 双写: 文件 + localStorage (后者作 fallback, 防止 electron API 不可用)
    if (hasElectronApi()) {
        window.electronAPI.writeBrushPresets(presets).catch(err => {
            console.warn('[Brush] writeBrushPresets failed:', err)
        })
    }
    try {
        localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets))
    } catch (e) {
        console.warn('[Brush] localStorage save failed:', e.message)
    }
}

export class BrushManager {
    constructor() {
        this.listeners = new Set();
        this.presetListeners = new Set();
        this.isBrushing = false;
        this.start = { x: 0, y: 0 };
        this.pointTopLeft = [];
        this.pointBottomRight = [];
        this.boxesMap = {}       // { 'back2D': [...], 'sit2D': [...] } — 按 displayType 分组
        this.currentKey = null   // 当前激活的分组 key (null 时 rangeArr 返回空数组)
        this.dirtyMap = {}       // { 'back2D': true, ... } — 用户编辑过但未保存为预设的标记
        this.presetsMap = loadPresetsFromStorage()  // 同步初始值 (localStorage)
        // 异步从 Electron 文件加载, 覆盖 localStorage 旧数据
        if (hasElectronApi()) {
            window.electronAPI.readBrushPresets()
                .then(filePresets => {
                    if (filePresets && typeof filePresets === 'object' && Object.keys(filePresets).length) {
                        this.presetsMap = filePresets
                        this._notifyPresets()
                    } else if (Object.keys(this.presetsMap || {}).length) {
                        // 文件还没数据但 localStorage 有 → 迁移到文件
                        savePresetsToStorage(this.presetsMap)
                    }
                })
                .catch(err => console.warn('[Brush] readBrushPresets failed:', err))
        }
        this._resizing = false   // 是否正在拖拽调整大小
        this._dragging = false   // 是否正在拖动框
        this._isDrawing = false  // 是否正在绘制新框
        this.selectedIndex = -1  // 当前键盘删除目标 (-1 = 无选中)
    }

    // ─── Dirty 追踪 (是否有未保存的更改) ───────────────────
    markDirty = (key) => {
        const k = key || this.currentKey
        if (k) this.dirtyMap[k] = true
    }
    clearDirty = (key) => {
        const k = key || this.currentKey
        if (k) this.dirtyMap[k] = false
    }
    isDirty = (key) => {
        const k = key || this.currentKey
        return !!(k && this.dirtyMap[k])
    }

    // ─── 预设保存/加载 ────────────────────────────────────────
    listPresets = () => {
        if (!this.currentKey) return []
        // 返回新数组避免 React 浅比较失效 (push 后引用相同, setState 不触发渲染)
        return [...(this.presetsMap[this.currentKey] || [])]
    }

    /**
     * 清空指定组的所有框 (DOM element + 数据)
     */
    clearKey = (key) => {
        if (!key) return
        const arr = this.boxesMap[key] || []
        arr.forEach(item => {
            if (item._element && item._element.parentNode) {
                item._element.parentNode.removeChild(item._element)
            }
        })
        this.boxesMap[key] = []
        this.clearDirty(key)
        if (key === this.currentKey) {
            this.selectedIndex = -1
            this.notify(this.rangeArr)
        }
    }

    /**
     * 内部: 当前 displayType key (back2D/sit2D) → 矩阵 fullKey (endi-back/endi-sit)
     */
    _resolveFullKey = () => {
        if (!this.currentKey) return null
        const sys = getSysType()
        if (isMoreMatrix(sys)) {
            const part = this.currentKey.includes('back') ? 'back' : this.currentKey.includes('sit') ? 'sit' : ''
            return part ? `${sys}-${part}` : sys
        }
        return sys
    }

    /**
     * 保存指定组所有框为一个预设 (默认是当前组)
     * 关键: 直接用 box 上的 matrix 快照 (notify 时已写入), 这样即使切换 displayType 后也能正确保存旧组
     */
    savePreset = (name, targetKey) => {
        const key = targetKey || this.currentKey
        if (!key) return null
        const arr = this.boxesMap[key] || []
        if (!arr.length) {
            message.warning('没有可保存的框')
            return null
        }
        const trimmed = (name || '').trim() || `预设 ${((this.presetsMap[key] || []).length + 1)}`
        // 直接用 box.matrix 快照, 不再动态算 (动态算会受切换 canvas 影响错位)
        const boxes = arr.map(item => {
            if (!item.matrix) return null
            const w = item.matrix.xEnd - item.matrix.xStart
            const h = item.matrix.yEnd - item.matrix.yStart
            if (w <= 0 || h <= 0) return null
            return {
                xStart: item.matrix.xStart, yStart: item.matrix.yStart,
                xEnd: item.matrix.xEnd, yEnd: item.matrix.yEnd,
                colorIndex: item.colorIndex, bgc: item.bgc,
            }
        }).filter(Boolean)
        if (!boxes.length) {
            message.warning('框的矩阵坐标缺失, 无法保存')
            return null
        }
        const preset = {
            id: 'p-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
            name: trimmed,
            fullKey: arr[0]?.fullKey,
            boxes,
            createdAt: Date.now(),
        }
        if (!this.presetsMap[key]) this.presetsMap[key] = []
        this.presetsMap[key].push(preset)
        savePresetsToStorage(this.presetsMap)
        this.clearDirty(key)
        this._notifyPresets()
        return preset
    }

    /**
     * 加载预设 (覆盖当前组的所有框)
     * 关键: 从矩阵坐标 + 当前 canvas 反推像素位置, 不会因切换设备而错位
     */
    loadPreset = (presetId) => {
        if (!this.currentKey) return false
        const fullKey = this._resolveFullKey()
        const matrixConfig = fullKey ? systemPointConfig[fullKey] : null
        if (!matrixConfig) {
            message.error('无法获取矩阵配置, 加载失败')
            return false
        }
        const presets = this.presetsMap[this.currentKey] || []
        const preset = presets.find(p => p.id === presetId)
        if (!preset) return false

        // 1. 清空当前组所有 element + 数据
        const oldArr = this.boxesMap[this.currentKey] || []
        oldArr.forEach(item => {
            if (item._element && item._element.parentNode) {
                item._element.parentNode.removeChild(item._element)
            }
        })
        this.boxesMap[this.currentKey] = []

        // 2. 从矩阵坐标反推像素位置, 重建 element
        let createdCount = 0
        preset.boxes.forEach((boxData, idx) => {
            // 兼容老格式 (像素坐标 x1/y1/x2/y2): 直接用
            // 新格式: 矩阵坐标 xStart/yStart/xEnd/yEnd → calMatrixToSelect 转像素
            let pixelX, pixelY, pixelW, pixelH
            if (boxData.xStart != null && boxData.xEnd != null) {
                const sel = calMatrixToSelect('canvasThree', {
                    xStart: boxData.xStart,
                    yStart: boxData.yStart,
                    sWidth: boxData.xEnd - boxData.xStart,
                    sHeight: boxData.yEnd - boxData.yStart,
                }, matrixConfig)
                if (!sel) return
                pixelX = sel.selectX; pixelY = sel.selectY
                pixelW = sel.selectWidth; pixelH = sel.selectHeight
            } else if (boxData.x1 != null) {
                // 老数据 (像素), 退化处理
                pixelX = boxData.x1; pixelY = boxData.y1
                pixelW = boxData.x2 - boxData.x1; pixelH = boxData.y2 - boxData.y1
            } else {
                return
            }

            const element = document.createElement('div')
            element.classList.add('selectBox')
            const displayColor = getSelectBoxDisplayColor(boxData.bgc)
            Object.assign(element.style, {
                position: 'fixed',
                left: pixelX + 'px',
                top: pixelY + 'px',
                width: pixelW + 'px',
                height: pixelH + 'px',
                border: `2px solid ${displayColor}`,
                backgroundColor: getSelectBoxFillColor(boxData.bgc),
                boxShadow: `0 0 0 1px ${displayColor}`,
                opacity: 1,
                zIndex: '999',
                display: 'block',
            })
            document.body.appendChild(element)

            const rangeObj = {
                x1: pixelX, y1: pixelY,
                x2: pixelX + pixelW, y2: pixelY + pixelH,
                colorIndex: boxData.colorIndex,
                bgc: boxData.bgc,
                _element: element,
            }
            this.boxesMap[this.currentKey].push(rangeObj)
            attachBoxLabel(element, rangeObj.colorIndex, rangeObj.bgc)
            this._makeInteractive(element, rangeObj, createdCount)
            createdCount++
        })

        this.selectedIndex = -1
        this.notify(this.rangeArr)
        this.clearDirty()        // 加载完 = 跟预设一致, 不算未保存
        return true
    }

    deletePreset = (presetId) => {
        if (!this.currentKey) return
        const presets = this.presetsMap[this.currentKey] || []
        const idx = presets.findIndex(p => p.id === presetId)
        if (idx < 0) return
        presets.splice(idx, 1)
        savePresetsToStorage(this.presetsMap)
        this._notifyPresets()
    }

    renamePreset = (presetId, newName) => {
        if (!this.currentKey || !(newName || '').trim()) return
        const presets = this.presetsMap[this.currentKey] || []
        const preset = presets.find(p => p.id === presetId)
        if (!preset) return
        preset.name = newName.trim()
        savePresetsToStorage(this.presetsMap)
        this._notifyPresets()
    }

    subscribePresets = (cb) => {
        this.presetListeners.add(cb)
    }

    unsubscribePresets = (cb) => {
        this.presetListeners.delete(cb)
    }

    _notifyPresets = () => {
        this.presetListeners.forEach(cb => cb(this.listPresets()))
    }

    /**
     * rangeArr 是当前激活组的框列表 (兼容原有 push/splice/forEach 等所有用法)
     */
    get rangeArr() {
        if (!this.currentKey) return [];
        if (!this.boxesMap[this.currentKey]) this.boxesMap[this.currentKey] = [];
        return this.boxesMap[this.currentKey];
    }

    set rangeArr(val) {
        if (!this.currentKey) return;
        this.boxesMap[this.currentKey] = val;
    }

    /**
     * 切换激活组 (e.g. 'back2D' / 'sit2D'); 传 null/undefined 时隐藏所有框
     * 不同 key 的框集互相独立, 切回原 key 时之前的框会恢复
     */
    setActiveKey = (key) => {
        const newKey = key || null;
        if (newKey === this.currentKey) return;
        // 隐藏旧组所有框
        if (this.currentKey && this.boxesMap[this.currentKey]) {
            this.boxesMap[this.currentKey].forEach(item => {
                if (item._element) item._element.style.display = 'none';
            });
        }
        this.currentKey = newKey;
        // 显示新组的框 (不依赖 isBrushing, 进入对应 displayType 即可见)
        if (this.currentKey && this.boxesMap[this.currentKey]) {
            this.boxesMap[this.currentKey].forEach(item => {
                if (item._element) item._element.style.display = 'block';
            });
        }
        this.selectedIndex = -1;
        this.notify(this.rangeArr);
        this._notifyPresets();
    }

    /**
     * 强制恢复当前组所有框: element 不在 DOM 上则补回 body, 重置位置/样式/可见性
     * 用于"恢复显示"按钮 — 处理因切换路由 / 视图等导致框消失的兜底
     */
    redrawCurrent = () => {
        if (!this.currentKey) return;
        const arr = this.boxesMap[this.currentKey] || [];
        arr.forEach(item => {
            if (!item._element) return;
            // 1. 如果 element 不在 DOM 上 (可能被某种场景误移除), 重新挂回
            if (!item._element.parentNode) {
                document.body.appendChild(item._element);
            }
            // 2. 重置位置 + 样式 + 可见性
            const displayColor = getSelectBoxDisplayColor(item.bgc);
            Object.assign(item._element.style, {
                position: 'fixed',
                left: item.x1 + 'px',
                top: item.y1 + 'px',
                width: (item.x2 - item.x1) + 'px',
                height: (item.y2 - item.y1) + 'px',
                border: `2px solid ${displayColor}`,
                backgroundColor: getSelectBoxFillColor(item.bgc),
                boxShadow: `0 0 0 1px ${displayColor}`,
                opacity: 1,
                zIndex: '999',
                display: 'block',
            });
            attachBoxLabel(item._element, item.colorIndex, item.bgc);
        });
        this.selectedIndex = -1;
        this.notify(this.rangeArr);
    }

    /**
     * 设置选中的框，并刷新所有框的视觉提示。
     * 再次点击同一个框会取消选中。
     */
    _setSelected = (index) => {
        if (index === this.selectedIndex) index = -1;
        this.selectedIndex = index;
        this.rangeArr.forEach((item, i) => {
            if (!item._element) return;
            const displayColor = getSelectBoxDisplayColor(item.bgc);
            if (i === this.selectedIndex) {
                item._element.style.boxShadow = `0 0 0 3px ${displayColor}, 0 0 14px ${displayColor}66`;
            } else {
                item._element.style.boxShadow = `0 0 0 1px ${displayColor}`;
            }
        });
    }

    subscribe(cb) {
        this.listeners.add(cb);
    }

    unsubscribe(cb) {
        this.listeners.delete(cb);
    }

    notify(range) {
        // 给每个 box 实时快照 matrix 坐标 (用当前 canvas), 这样 savePreset 时不用动态算
        const fullKey = this._resolveFullKey()
        const matrixConfig = fullKey ? systemPointConfig[fullKey] : null
        if (matrixConfig && Array.isArray(range)) {
            range.forEach(box => {
                if (!box) return
                const m = colSelectMatrix('canvasThree', box, matrixConfig)
                if (m && m.xEnd > m.xStart && m.yEnd > m.yStart) {
                    box.matrix = m
                    box.fullKey = fullKey
                }
            })
        }
        this.listeners.forEach(cb => cb(range));
    }

    /**
     * 获取下一个可用的位置索引 (= 数组末尾)
     * 删除中间元素并重排后, 末尾位置就是新框该插入的 colorIndex
     */
    _nextColorIndex() {
        return this.rangeArr.length;
    }

    /**
     * 在 SELECT_COLORS 中找一个还没被任何现有框使用的颜色
     */
    _nextAvailableBgc() {
        const used = new Set(this.rangeArr.map(r => r.bgc));
        for (let i = 0; i < MAX_BOXES; i++) {
            if (!used.has(SELECT_COLORS[i])) return SELECT_COLORS[i];
        }
        return SELECT_COLORS[0];
    }

    /**
     * 获取当前用于框选的真实矩阵渲染区域。
     * 对于非正方形矩阵（例如 endi-back 50x64），只允许在真实矩阵区域内框选。
     */
    _getEffectiveCanvasRect() {
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
        if (!matrixConfig) return rect;

        const { width, height } = matrixConfig;
        const maxSide = Math.max(width, height);
        const unitWidth = rect.width / maxSide;
        const unitHeight = rect.height / maxSide;
        const offsetX = width < height ? ((height - width) / 2) * unitWidth : 0;
        const offsetY = height < width ? ((width - height) / 2) * unitHeight : 0;

        return {
            left: rect.left + offsetX,
            right: rect.left + offsetX + width * unitWidth,
            top: rect.top + offsetY,
            bottom: rect.top + offsetY + height * unitHeight,
        };
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
        this.showAll();
    }

    onKeyDown = (e) => {
        // 在 input/textarea/可编辑元素内按键时不响应（避免误删框）
        const tag = (e.target?.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || e.target?.isContentEditable) return;

        // Backspace/Delete: 严格只删选中的框, 没选中则不响应
        if (e.key === 'Delete' || e.key === 'Backspace') {
            if (this.selectedIndex >= 0 && this.selectedIndex < this.rangeArr.length) {
                this.deleteSelect(this.selectedIndex);
            }
            return;
        }

        // 方向键移动最后一个框
        const obj = this.rangeArr[this.rangeArr.length - 1];
        if (!obj) return;
        const el = obj._element;
        if (!el) return;

        switch (e.key) {
            case 'ArrowUp':
                obj.y1 -= 1; obj.y2 -= 1;
                el.style.top = obj.y1 + 'px';
                this.markDirty();
                this.notify(this.rangeArr);
                break;
            case 'ArrowDown':
                obj.y1 += 1; obj.y2 += 1;
                el.style.top = obj.y1 + 'px';
                this.markDirty();
                this.notify(this.rangeArr);
                break;
            case 'ArrowLeft':
                obj.x1 -= 1; obj.x2 -= 1;
                el.style.left = obj.x1 + 'px';
                this.markDirty();
                this.notify(this.rangeArr);
                break;
            case 'ArrowRight':
                obj.x1 += 1; obj.x2 += 1;
                el.style.left = obj.x1 + 'px';
                this.markDirty();
                this.notify(this.rangeArr);
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
        // 关闭框选工具时仅隐藏当前组, 数据保留, 再次开启可恢复
        this.hideAll();
    }

    /**
     * 删除所有 .selectBox DOM 元素 + 清空所有分组数据 (慎用)
     */
    removeChild() {
        const selectBoxList = document.querySelectorAll('.selectBox');
        for (let i = 0; i < selectBoxList.length; i++) {
            if (selectBoxList[i].parentNode) {
                selectBoxList[i].parentNode.removeChild(selectBoxList[i]);
            }
        }
        this.boxesMap = {};
    }

    // ─── 为框添加交互控件（拖拽手柄 + 删除按钮） ───
    _makeInteractive(el, rangeObj, boxIndex) {
        el.style.pointerEvents = 'auto';
        el.style.cursor = 'move';
        el.style.overflow = 'visible';

        const color = rangeObj.bgc;

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
            // 点击该框时设为选中（拖动也会先经过 mousedown）
            const idx = this.rangeArr.indexOf(rangeObj);
            if (idx >= 0) this._setSelected(idx);
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
            this.markDirty();
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
            this.markDirty();
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

        // 必须按住 Ctrl 才能拉框，避免误触
        if (!e.ctrlKey) return;

        // 检查是否已达到最大框数
        if (this.rangeArr.length >= MAX_BOXES) {
            message.warning(`最多只能创建 ${MAX_BOXES} 个框选区域`);
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
        this._currentBgc = this._nextAvailableBgc();
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
                const bgc = this._currentBgc || SELECT_COLORS[colorIndex];
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
            this.rangeArr.push(this.range);
            this.isBrushing = false;
            this.pointTopLeft = { x: 0, y: 0 };
            this.pointBottomRight = { x: 0, y: 0 };

            // 给框 element 添加左上角标号 (用框自己的 bgc, 不一定 = SELECT_COLORS[colorIndex])
            attachBoxLabel(this.element, this.range.colorIndex, this.range.bgc);

            // 绘制完成后，为框添加交互控件
            this._makeInteractive(this.element, this.rangeArr[this.rangeArr.length - 1], this.rangeArr.length - 1);

            this.markDirty();
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

        // 重排 colorIndex 让槽位连续填补 (例: 删 2 号后 [0,1,3,4] → [0,1,2,3])
        // 但保留各框原本的 bgc 颜色 — 4 紫顶到 3 位还是紫
        for (let i = 0; i < this.rangeArr.length; i++) {
            const item = this.rangeArr[i];
            if (item.colorIndex === i) continue;
            item.colorIndex = i;
            // 标号数字跟着新 colorIndex 变, 但颜色用框自己的 bgc 而不是 SELECT_COLORS[i]
            if (item._element) {
                attachBoxLabel(item._element, i, item.bgc);
            }
        }

        // 调整 selectedIndex 跟随数组紧凑变化
        if (this.selectedIndex === index) {
            this.selectedIndex = -1;
        } else if (this.selectedIndex > index) {
            this.selectedIndex -= 1;
        }
        // 刷新选中视觉
        this.rangeArr.forEach((item, i) => {
            if (!item._element) return;
            const displayColor = getSelectBoxDisplayColor(item.bgc);
            if (i === this.selectedIndex) {
                item._element.style.boxShadow = `0 0 0 3px ${displayColor}, 0 0 14px ${displayColor}66`;
            } else {
                item._element.style.boxShadow = `0 0 0 1px ${displayColor}`;
            }
        });

        this.markDirty();
        this.notify(this.rangeArr);
    }

    /**
     * 隐藏画布上所有框 element (不清空 rangeArr, 切回时可 showAll 还原)
     */
    hideAll = () => {
        this.rangeArr.forEach(item => {
            if (item._element) item._element.style.display = 'none';
        });
    }

    /**
     * 显示之前 hideAll 隐藏的框
     */
    showAll = () => {
        this.rangeArr.forEach(item => {
            if (item._element) item._element.style.display = 'block';
        });
    }

    /**
     * 暂停框选: 卸下事件监听并隐藏所有分组的框, 但保留所有数据
     * 用于路由切换等场景, 切回 + setActiveKey + startBrush 即可恢复
     */
    pauseBrush = () => {
        this.isBrushing = false;
        window.removeEventListener('mousedown', this.onMouseDown);
        window.removeEventListener('mousemove', this.onMouseMove);
        window.removeEventListener('mouseup', this.onMouseUp);
        window.removeEventListener('keydown', this.onKeyDown);
        // 隐藏所有 key 分组下的框
        Object.values(this.boxesMap).forEach(arr => {
            if (Array.isArray(arr)) {
                arr.forEach(item => {
                    if (item._element) item._element.style.display = 'none';
                });
            }
        });
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
        this.selectedIndex = -1;
        this.clearDirty();
        this.notify(this.rangeArr);
    }
}

export const brushInstance = new BrushManager();
