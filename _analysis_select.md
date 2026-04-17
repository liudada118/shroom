# 框选系统分析

## 当前架构

### 数据流
1. **BrushManager** (newSelecttBox.js) — 鼠标绘制框选框，管理 DOM 元素
   - `rangeArr` 存储所有框选范围 `[{x1,y1,x2,y2,bgc,index,_element}]`
   - 当前限制：只允许 1 个框（`rangeArr.length > 1` 时删除旧框）
   - `selectIndex` 用 jet 色表生成颜色，但固定 `selectIndex=20`

2. **Test.js** — 订阅 brushInstance，写入 zustand `selectArr`
   - 回放模式下只取 `arr[0]` 计算 selectJson

3. **equipStore** — `selectArr: []` 存储框选数组
   - `getSelectArr()` 供非 React 上下文使用

4. **useMatrixData.js** — `computeSelectArr()` 只使用 `select[0]`
   - 只计算一组统计数据

5. **ChartsAside.js** — 趋势图表按设备（back/sit）分色
   - pressColorArr: { back: '#8AC287', sit: '#5D65FF' }
   - 不支持按框选分色

### 需要改的文件

| 文件 | 改动 |
|------|------|
| `newSelecttBox.js` | 支持最多4个框，不同颜色，超出范围提示 |
| `useMatrixData.js` | 遍历所有框选，每个框计算独立统计 |
| `ChartsAside.js` | 多条数据线，颜色与框对应 |
| `Test.js` | 订阅多框，回放支持多框 |
| `equipStore.js` | 可能需要增加 selectChartData 存储多框图表数据 |

### 4个框的颜色方案
- 框1: #FF6B6B (红)
- 框2: #4ECDC4 (青)
- 框3: #FFD93D (黄)
- 框4: #6C5CE7 (紫)

### 范围校验
- 框选时检查是否在 canvasThree 范围内
- 超出提示 "请在有效范围内框选"
