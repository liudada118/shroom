# COP 报告模块计算详解

聚焦三个模块：**框选区域总览**、**框选区域详细分析**、**下身 COP 分析**。
全部计算在前端 `client/src/page/report/CopReport.js`，后端只负责取数。
配套：[COP 报告计算说明.md](COP%20报告计算说明.md)（数据来源与整体算法）。

---

## 一、这三个模块在报告里的位置

报告章节是动态编号的，编号取决于有没有框选：

| 章节 | 标题 | 有框选时 | 无框选时 |
| --- | --- | --- | --- |
| 1–4 | 主传感面概览、热力图、COP 轨迹、趋势 | 1–4 | 1–4 |
| 5 | **框选区域总览** | 5 | 跳过 |
| 6 | **框选区域详细分析** | 6 | 跳过 |
| 7.N | 其余传感面分析（**下身 COP 分析**在此） | 7.1、7.2… | 6.1、6.2… |
| 末章 | 附录（计算说明） | 8 | 7 |

### 谁是「主传感面」，谁进 7.N

`getReportMatrixKeys` 决定顺序，靠一个权重函数排序：

```
key 含 'back' → 权重 1
key 含 'sit'  → 权重 2
其余          → 权重 3
权重相同时按字符串排序
```

排序后**第一个**是主传感面，独占 1–6 章。**其余每个**传感面各生成一段 `SurfaceAnalysisReport`。

`foot`（下身）不含 `back` 也不含 `sit`，权重恒为 3，**永远排在最后**，所以「下身」只会出现在 7.N，不可能成为主传感面。同理，同时接靠背和坐垫时靠背是主传感面、坐垫进 7.1。

「下身 COP 分析」这个标题是拼出来的：

```
标题 = 传感面标签 + 当前模式名 + '分布与COP分析'
     = '下身' + '压力' + '分布与COP分析'
```

压强模式下同一段会显示为「下身压强分布与COP分析」。传感面标签由 `getMatrixDisplayLabel(key,'zh')` 查表，`foot` 与 `endi-foot` 都映射为「下身」。

---

## 二、框选数据从哪来

框选不走数据库，走 **sessionStorage 一次性传递**：

```
实时页面点「生成报告」
  ↓ 把当前框选写进 sessionStorage
  键名 = 'copReportSelection:' + selectionId
  ↓ 跳转报告页，URL 带 selectionId
报告页读取
  ↓ sessionStorage.getItem(键名)
  ↓ 解析成 selectJson，随请求发给后端
  ↓ sessionStorage.removeItem(键名)   ← 读完立即删除
后端 /copReportData
  ↓ 原样透传，不校验不裁剪
  ↓ 放进返回结果的 select 字段
前端 normalizeSelections 归一
```

读完即删意味着**刷新报告页框选就没了**——URL 里的 `selectionId` 还在，但 sessionStorage 已清空，框选相关章节会退化成空态。

### 坐标归一（`normalizeRect`）

历史上框选数据有多种来源（实时框选、模板、回放注入），字段名不统一，所以做了大量兼容：

```
起点 X： xStart / startX / x / left / colStart / columnStart
起点 Y： yStart / startY / y / top  / rowStart
终点 X： xEnd   / endX   / right / colEnd / columnEnd
终点 Y： yEnd   / endY   / bottom / rowEnd
宽    ： width  / w / length / cols
高    ： height / h / rows
外层还兼容 matrixRect / rect / range / 直接就是本体
```

归一步骤：

```
1. 缺终点时补算    xEnd = xStart + width
2. 四个坐标任一非有限 → 丢弃该框（返回 null）
3. 起终点自动排序    xStart = floor(min(xStart, xEnd))
4. 终点向上取整      xEnd = ceil(max(xStart+1, xEnd))
                     ← max(xStart+1, …) 保证至少 1 格宽
5. 全部 clamp 到 [0, 矩阵宽/高]
6. 退化检查          xEnd ≤ xStart 或 yEnd ≤ yStart → 丢弃
7. 输出              { xStart, yStart, xEnd, yEnd, width, height }
                     width = xEnd − xStart（半开区间）
```

起点 `floor`、终点 `ceil` 是让框边界吸附到整格。注意 `rect` 内部是**半开区间** `[xStart, xEnd)`，但界面显示时会减 1 变成闭区间。

### 缺省填充

| 字段 | 缺失时 |
| --- | --- |
| id | `{传感面}-{下标}` |
| name | `框选区域{序号}` |
| shapeType | `矩形`（当前只有矩形，字段是为未来预留） |
| color | 按下标取四色循环：红 `#ff4d4f`、橙 `#fa8c16`、绿 `#52c41a`、蓝 `#1677ff` |
| sensorPart | 当前传感面 key |

### 归属匹配

一份 `selectJson` 可能含多个传感面的框，`normalizeSelections` 按 key 挑出属于当前传感面的：

```
完整匹配      key === 'endi-sit'
短名匹配      key === 'sit'
后缀匹配      key.endsWith('-sit')
都没匹配上且 selectJson 本身是数组 → 全部采用
```

---

## 三、框选区域总览（第 5 章）

一张表，一行一个框选区域。无框选时显示「该历史文档未包含框选区域。」

### 九列的算法

| 列 | 算法 | 备注 |
| --- | --- | --- |
| 序号 | 数组下标 + 1 | |
| 区域名称 | 归一后的 name | |
| 形状类型 | 归一后的 shapeType | 当前恒为「矩形」 |
| 面积 (cm²) | `框宽 × 框高 × 1` | ⚠ 每点面积写死为 1，见问题 1 |
| 压力总和 (N) | 逐帧算区域 forceSum，再对帧取平均 | 始终用 forceArr，不受模式影响 |
| 占传感面比例 (%) | `区域平均forceSum / 整体平均forceSum × 100` | 保留 1 位小数 |
| 最大值 | `max(各帧的区域最大值)` | 全程峰值 |
| 平均值 | `各帧区域平均值的算术平均` | 每帧的分母是该帧有效点数 |
| 风险等级 | 见下 | |

### 「平均值」是两层平均，容易误解

```
第一层（帧内）  该帧平均 = 该帧区域内有效点之和 / 该帧有效点数
第二层（帧间）  报告显示 = Σ(各帧平均) / 帧数
```

**不是**把所有帧的所有点堆在一起求平均。区别在于：接触面积随时间变化时，两种算法结果不同。现在的算法里每一帧的权重相同，不管那帧有几个有效点。

### 风险等级

```
占比 ≥ 30%                        → 高
或 区域最大压强 ≥ 70              → 高
占比 ≥ 12%                        → 中
其余                              → 低
```

两个条件用的量不一样：占比看**压力总和**，70 这个阈值判的是 `pressureMax`（**压强**，kPa）。见问题 2。

---

## 四、框选区域详细分析（第 6 章）

每个框选区域一段，段内 3 图 + 1 表 + 1 信息块。标题是「序号色块 + 区域名称」。

### 4.1 区域叠加图

底图是**平均值热力图**（`buildAverageMap`）：

```
sum = 长度为 width×height 的零数组
count = 0
for 每一帧:
    arr = 该帧的 pressureArr 或 forceArr（按模式）
    if arr.length !== sum.length: 跳过该帧      ← 尺寸不符直接丢
    count++
    逐点累加进 sum
输出 = count ? sum.map(v => v / count) : sum
```

上面叠加当前框的边框并高亮，其余框不画。颜色走 `jetWhite3NoWhite` 调色板查表（首红末色、去掉纯白档）。

### 4.2 区域压力总和趋势

```
数据 = 每帧的区域 forceSum（始终 N，不随模式变）
横轴 = 帧序 / 采样率 → 秒
降采样 = 超过 160 点时按桶取首点，末点强制保留
```

降采样是「取首点」不是「取平均」，所以尖峰可能被跳过——趋势形状对，但极值不一定准。

### 4.3 区域局部 COP 轨迹

用**框内的点**算重心，但坐标原点仍是**整块矩阵中心**：

```
遍历 rect 范围内的点
  metricValue > 0 才计入
    weightSum += metricValue
    xWeighted += x × metricValue      ← x 是全矩阵坐标，不是框内坐标
    yWeighted += y × metricValue

copXIndex = xWeighted / weightSum
copX = (copXIndex − (矩阵宽−1)/2) × 10      ← 减的是矩阵中位，不是框中位
copY = ((矩阵高−1)/2 − copYIndex) × 10
```

所以「局部 COP」的数值是**该框的重心落在整块矩阵中的绝对位置**，不是框内的相对位置。见问题 3。

图表两轴对称，范围取 `±max(|所有坐标|)`，四等分刻度。

### 4.4 指标表（8 行）

| 指标 | 算法 |
| --- | --- |
| 最大值 | `max(各帧区域最大值)` |
| 平均值 | 各帧区域平均值的算术平均 |
| 压力总和 (N) | 区域平均 forceSum，括号内附占比 % |
| ADC 总和 | 各帧区域 ADC 求和的平均，**始终取 arr，不受模式影响** |
| 有效面积 (cm²) | `有效点数 × getPressurePointAreaCm2(传感面)`，逐帧算完再平均 |
| 有效点数 (个) | 该帧内 `metricValue > 0` 的点数，逐帧算完再平均 |
| 局部 COP (mm) | **只统计有有效点的帧**，对这些帧的重心取平均 |
| 风险等级 | 同总览表 |

局部 COP 那行的过滤值得注意：`series.filter(item => item.effectivePoints > 0)`。完全没受力的帧被排除，不会把「矩阵中心」这个默认值算进平均。但轨迹长度也是在过滤后的序列上算的，所以**中间空档会被直接连线**，人离开又坐回时轨迹长度会偏大。

### 4.5 区域信息块

```
形状类型：矩形
坐标范围：X {xStart}-{xEnd − 1}，Y {yStart}-{yEnd − 1}     ← 减 1 转闭区间显示
矩阵面积：{width} x {height}                                 单位是格，不是 cm²
所属表面：{中文标签}
```

---

## 五、下身 COP 分析（第 7.N 章）

结构上是主传感面 1–6 章的**压缩重复**——同一套 `buildSingleAnalysis` 计算，换个传感面 key。

### 5.1 传感面摘要

```
传感面      中文标签
传感器类型  同上（两个字段目前查同一张表，值相同）
矩阵尺寸    width x height，来自 inferSize
框选数量    该传感面归一后的框数
```

### 5.2 四张图

| 图 | 数据 |
| --- | --- |
| 平均值热力图 | `buildAverageMap`，叠加全部框 |
| COP 轨迹图 | 全矩阵逐帧重心连线 |
| 框选叠加图 | 与热力图同底，也叠加全部框（两图数据一致，差别只在标题） |
| 压力总和趋势 | 每帧全矩阵 forceSum |

### 5.3 下身矩阵是怎么来的（先看这个）

下身与其他传感面不同，它在后端经过**左右脚合并**，这决定了后面所有字段的分母。

```
硬件侧：左脚、右脚各是一块 12 × 64 = 768 点的独立矩阵
       对应 key：endi-leftFoot、endi-rightFoot

合并（combineEndiFootRows）：按行交错拼接
  for row = 0 .. 63:
      取左脚第 row 行的 12 个点
      取右脚第 row 行的 12 个点
      依次推入结果
  → 每行 24 个点（左 12 + 右 12），共 64 行

结果：endi-foot，24 × 64 = 1536 点
      合并后删除 endi-leftFoot 与 endi-rightFoot
```

三种输入情形：

| 情形 | 处理 |
| --- | --- |
| 已有合并矩阵（1536 点） | 直接用，强制标注 width=24、height=64 |
| 只有单脚（768 点） | 缺的那只脚**补零矩阵**后再拼 |
| 两脚都没有 | 不生成下身，报告里不出现该段 |

**关键影响**：只接了一只脚时，另一半是补的零，会计入总点数但不计入有效点。所以「矩阵尺寸」永远显示 24×64，但有效点数只可能来自真实那一半。

### 5.4 分布指标表（7 列，逐字段）

统一约定：设第 f 帧的取值数组为 `V_f`（压力模式取 `forceArr`，压强模式取 `pressureArr`，非正值归 0），ADC 数组为 `A_f`（始终取 `arr`）。总帧数 `N`。

---

**① 最大值** — 列名随模式变为「最大压力 (N)」或「最大压强 (kPa)」

```
每帧：pMax_f = max(V_f 中所有点)          注意是所有点，不只有效点
汇总：显示值 = max(pMax_1 … pMax_N)
```

全程峰值，不是平均。整段采集中任意一帧任意一点的最高值。

---

**② 平均值** — 「平均压力 (N)」或「平均压强 (kPa)」

```
每帧：effectivePoints_f = V_f 中 > 0 的点数
      pSum_f = Σ(V_f 所有点)
      pAvg_f = effectivePoints_f ? pSum_f / effectivePoints_f : 0
                                   ↑ 分母是有效点数，不是 1536

汇总：显示值 = Σ(pAvg_1 … pAvg_N) / N
```

两层平均。分子 `pSum_f` 是**全部点**求和（零点加了也不影响），分母是**有效点数**——所以本质是有效点的平均值。

第二层对帧取平均时每帧权重相同，与该帧有几个有效点无关。

---

**③ 压力总和 (N)** — 列名固定，不随模式变

```
每帧：forceSum_f = Σ(forceArr_f 所有点)     始终取 forceArr
汇总：显示值 = Σ(forceSum_1 … forceSum_N) / N
```

压强模式下这一列仍然是 N。代码里用独立的第二个循环单独累加 `forceValues`，与 `pSum` 分开算。

物理含义：整段采集中，下身平均承受的总力。

---

**④ ADC 总和** — 保留 0 位小数

```
每帧：adcSum_f = Σ(A_f 所有点)
汇总：显示值 = Σ(adcSum_1 … adcSum_N) / N
```

原始 ADC 求和，**不受压强/压力模式影响**。这是处理后的 `arr`（已过阈值和高斯），不是 `rawAdcArr`。

---

**⑤ ADC 最大值** — 保留 0 位小数

```
每帧：adcMax_f = max(A_f 所有点)
汇总：显示值 = max(adcMax_1 … adcMax_N)
```

全程峰值。可用来判断是否触顶（endi 类上限 255）。

---

**⑥ 有效面积 (cm²)**

```
每帧：effectiveArea_f = effectivePoints_f × 1.5625
                                            ↑ endi-foot 的单点面积
汇总：显示值 = Σ(effectiveArea_1 … effectiveArea_N) / N
```

`1.5625 cm²` 来自 `getPressurePointAreaCm2('endi-foot')`，对应 12.5mm × 12.5mm 的点距。

下身的这个值是**正确**的（面积表里对 `endi-foot` 有专门分支）。同一张表里 carY 就不对，见问题 10。

---

**⑦ 有效点数 (个)** — 保留 0 位小数

```
每帧：effectivePoints_f = V_f 中 > 0 的点数
汇总：显示值 = Σ(effectivePoints_1 … effectivePoints_N) / N
```

判定条件是 `> 0`，**不是**附录里标注的 5。理论最大值 1536（24×64）。

因为是帧间平均，结果通常是小数，但显示时取整到 0 位，所以「157」实际可能是 156.7。

---

### 5.5 COP 指标表（7 列，逐字段）

先明确单帧重心的算法（`calcFrameMetrics`），后面所有字段都基于它：

```
遍历矩阵全部 1536 个点，只有 V_f[i] > 0 的点参与：
    weightSum += V_f[i]
    xWeighted += x × V_f[i]              x ∈ [0, 23]
    yWeighted += y × V_f[i]              y ∈ [0, 63]

索引重心：
    copXIndex = weightSum ? xWeighted / weightSum : 24 / 2 = 12
    copYIndex = weightSum ? yWeighted / weightSum : 64 / 2 = 32

转毫米（原点移到矩阵中心）：
    copX = (copXIndex − (24−1)/2) × 10 = (copXIndex − 11.5) × 10
    copY = ((64−1)/2 − copYIndex) × 10 = (31.5 − copYIndex) × 10
                                          ↑ Y 取反，向上为正
```

⚠ 这里的 `× 10` 是写死的 `POINT_SPACING_MM`，但下身实际点距是 **12.5mm**（由 1.5625 cm² 反推）。所以下身所有毫米量都被低估了 **20%**。见问题 4。

轨迹点列的构造：

```
metrics    = 逐帧 calcFrameMetrics 的结果
copSeries  = metrics.filter(copX 与 copY 都是有限值)
             ← 只过滤 NaN，不过滤「无有效点」的帧
```

**空帧的坑**：某帧完全没受力时，`weightSum = 0`，copX/copY 取矩阵中心，也就是 `(0, 0)`。这个 `(0,0)` 是有限值，所以**会进入 copSeries**，把平均值往原点拉，也会在轨迹里造成一次「跳到原点再跳回」的往返。

---

**① COP 坐标 (mm)** — 显示为 `(x, y)`

```
avgCopX = Σ(copSeries 中所有 copX) / copSeries.length
avgCopY = Σ(copSeries 中所有 copY) / copSeries.length
显示值 = (avgCopX, avgCopY)
```

整段的平均重心位置。正 X 偏右、正 Y 偏前（向上）。

---

**② 左右偏移 Dx (mm)**

```
显示值 = avgCopX          与 ① 的 X 分量完全同值
```

---

**③ 前后偏移 Dy (mm)**

```
显示值 = avgCopY          与 ① 的 Y 分量完全同值
```

②③ 是 ① 的拆分显示，没有额外计算。表里等于同一个数出现两次。

---

**④ 轨迹长度 (mm)**

```
pathLength = Σ hypot(copX[i] − copX[i−1], copY[i] − copY[i−1])
             i 从 1 到 copSeries.length − 1
             hypot 即欧氏距离 √(Δx² + Δy²)
```

相邻帧重心的位移累加。注意：

- 采集越久这个值必然越大，**不能跨时长比较**
- 空帧造成的「跳原点」会被计入，虚增长度
- 高采样率下抖动被累加得更多，同一动作在 60Hz 下的轨迹长度大于 30Hz

---

**⑤ 平均速度 (mm/s)**

```
durationSeconds = payload.durationMs > 0
                ? payload.durationMs / 1000
                : max(1, 帧数 / (payload.sampleRate || 60))
                  ↑ 后端没给时长时的退化路径，下限 1 秒

avgSpeed = durationSeconds ? pathLength / durationSeconds : 0
```

分母用的是**采集总时长**，分子是过滤后 copSeries 的轨迹长度。若中间有大量空帧被过滤，分子小分母大，速度会偏低。

---

**⑥ 摆动范围 (mm)** — 显示为 `{swayX} / {swayY}`

```
swayX = max(copSeries 的 copX) − min(copSeries 的 copX)
swayY = max(copSeries 的 copY) − min(copSeries 的 copY)
显示值 = "swayX / swayY"
```

极差，不是标准差。只受两个极端帧影响，单帧异常就会把它拉大。空帧的 `(0,0)` 同样会参与极值。

---

**⑦ 稳定性评分** — 保留 1 位小数

```
stability = clamp(
    100
    − hypot(avgCopX, avgCopY) × 0.35
    − pathLength              × 0.08
    − avgSpeed                × 1.2
    − (swayX + swayY)         × 0.2
  , 0, 100)
```

四项惩罚的输入分别是 mm、mm、mm/s、mm，量纲不统一直接相加。四个系数是经验值，无标定依据。

各项的实际影响量级（以典型下身数据估算）：

| 项 | 典型值 | 扣分 | 占比 |
| --- | --- | --- | --- |
| 偏心距 | 20 mm | 7.0 | 15% |
| 轨迹长度 | 300 mm | 24.0 | 51% |
| 平均速度 | 5 mm/s | 6.0 | 13% |
| 摆幅和 | 70 mm | 14.0 | 30% |
| **合计** | | **51** | 得分 49 |

轨迹长度一项占了一半扣分，而它与采集时长正相关——**采集 60 秒的记录几乎不可能得高分**。这是这个评分最大的问题。

### 5.6 段内框选列表

该传感面自己的框，每框 3 图 + 1 表。表只有 **6 行**，比主传感面的 8 行少两行：

| 行 | 主传感面（6 章） | 其余传感面（7.N） |
| --- | --- | --- |
| 最大值 | ✓ | ✓ |
| 平均值 | ✓ | ✓ |
| 压力总和 | ✓ | ✓ |
| ADC 总和 | ✓ | ✗ |
| 有效面积 | ✓ | ✓ |
| 有效点数 | ✓ | ✓ |
| 局部 COP | ✓ | ✓ |
| 风险等级 | ✓ | ✗ |

数据都算了（`selection.summary` 里有 `adcSum` 和 `risk`），只是没渲染。见问题 7。

---

## 六、贯穿三个模块的公共规则

### 取值口径

```
压力模式  → forceArr
压强模式  → pressureArr
非正值、非有限值 → 归 0

例外：以下始终固定，不随模式变
  压力总和列     始终 forceArr（N）
  ADC 相关列     始终 arr
  风险的 70 阈值 始终比 pressureMax（kPa）
```

### 单帧重心

```
遍历范围内的点，metricValue > 0 才计入：
  weightSum += metricValue
  xWeighted += x × metricValue
  yWeighted += y × metricValue

copXIndex = weightSum ? xWeighted / weightSum : 矩阵宽 / 2
copYIndex = weightSum ? yWeighted / weightSum : 矩阵高 / 2

copX = (copXIndex − (宽−1)/2) × POINT_SPACING_MM
copY = ((高−1)/2 − copYIndex) × POINT_SPACING_MM     ← Y 取反，向上为正

POINT_SPACING_MM = 10，对所有传感面写死
```

无有效点时取矩阵中心（0, 0），所以**空帧的 COP 是原点**，会把平均值往中心拉。整段汇总时只过滤 `Number.isFinite`，不过滤「是否有有效点」——而框选段的局部 COP 有过滤 `effectivePoints > 0`。两处口径不一致。

### 汇总规则总表

| 类型 | 算法 | 涉及指标 |
| --- | --- | --- |
| 全程极值 | `max(各帧值)` | 最大值、ADC 最大值 |
| 帧间平均 | `Σ(各帧值) / 帧数` | 平均值、各类总和、有效面积、有效点数 |
| 整段一次算 | 基于整段轨迹点列 | 轨迹长度、摆幅、平均速度、稳定性 |

### 趋势图通用处理

```
横轴 = 帧序 / sampleRate，单位秒
降采样 = 点数 > 160 时，bucketSize = ceil(点数/160)，每桶取首点，末点强制保留
```

---

## 七、已知问题

按影响程度排序。

### 1. 总览面积与详细分析的面积口径不一致 ⚠

- **现状**：总览表的「面积 (cm²)」用 `框宽 × 框高 × POINT_AREA_CM2`，而 `POINT_AREA_CM2 = 1` 是文件内写死的常量；详细分析的「有效面积」用 `getPressurePointAreaCm2(传感面)` 按传感面取真实值
- **后果**：同一份报告两个面积列不可比。以 carY 坐垫（真实 2.25 cm²/点）为例，总览面积只有真实值的 **44%**
- **修法**：总览也改用 `getPressurePointAreaCm2`

### 2. 风险等级混用压力与压强

- **现状**：占比分支比的是 `forceSum`（N），70 这个阈值比的是 `pressureMax`（kPa）
- **后果**：切换压强/压力模式时，同一区域可能给出不同风险等级；70 无标定依据
- **修法**：明确风险到底按哪个量判定，阈值按模式分别设定

### 3. 「局部 COP」原点未随框移动

- **现状**：框内重心用框内点算，但转毫米时减的是**整块矩阵**中位
- **后果**：数值实际是「该框重心在整块矩阵中的绝对位置」，不是框内相对位置。名字叫「局部」容易误解
- **修法**：要么改成框内相对坐标（减框中位），要么改名叫「区域重心绝对坐标」

### 4. 点间距对所有传感面写死为 10mm

- **现状**：`POINT_SPACING_MM = 10`，但实际点距各传感面不同（endi 靠背 13×10、carY 靠背 10×19、carY 坐垫 15×15）
- **后果**：所有毫米量按错比例算——COP 坐标、Dx/Dy、轨迹长度、摆动范围、平均速度。carY 靠背纵向差 **1.9 倍**
- **风险**：历史报告已用旧数值做过对比，改动会导致新旧不可比，需要版本标记

### 5. 附录标注的「有效阈值 5」未生效

- **现状**：`EFFECTIVE_THRESHOLD = 5` 只出现在指标卡和附录文字，计算里判定的是 `metricValue > 0`
- **后果**：有效点数、有效面积偏大；COP 权重纳入了极小值点。报告声称按 5 筛，实际没筛
- **修法**：把阈值接进 `calcFrameMetrics`，或删掉界面文字

### 6. 稳定性评分不可跨记录比较

- **现状**：四个惩罚系数是经验值，量纲混加；轨迹长度项权重最重
- **后果**：采集越久分数越低，跨时长、跨设备、跨版本都不可比
- **修法**：轨迹类指标改用归一化形式（如单位时间轨迹长度），系数补标定依据

### 7. 下身段的框选表少两行

- **现状**：主传感面框选表 8 行，其余传感面只渲染 6 行，缺 ADC 总和与风险等级。数据都算好了在 `selection.summary` 里
- **后果**：多传感面记录里两段信息量不对等
- **修法**：补齐两行，或明确说明为何只在主传感面显示

### 8. 空帧 COP 的处理两处不一致

- **现状**：整段汇总只过滤 `Number.isFinite`，空帧的 (0,0) 会算进平均；框选段的局部 COP 过滤了 `effectivePoints > 0`
- **后果**：全矩阵 COP 被空帧往中心拉，框选 COP 不会。同时框选段中间有空档时会跨空档连线，轨迹长度偏大
- **修法**：统一为过滤空帧，并在轨迹长度计算时对空档断开

### 9. carY 传感面单点面积取错 ⚠

- **现状**：`getPressurePointAreaCm2` 里 carY 两条分支写成 `value.includes('carY-back')`，但 `value` 在函数开头已经 `.toLowerCase()`，含大写 Y 的字符串永不命中。实测：

  | key | 实际返回 | 应为 |
  | --- | --- | --- |
  | `carY-back` | 1.3（落到 `includes('back')`） | 1.9 |
  | `carY-sit` | 1（落到 `includes('sit')`） | 2.25 |
  | `endi-foot` | 1.5625 ✓ | 1.5625 |

- **后果**：carY 的有效面积偏小——靠背算成真实值的 68%，坐垫只有 44%
- **注**：下身 `endi-foot` 用的是全等匹配，不受影响，值正确
- **修法**：改为小写全等匹配或把 key 统一小写化后再比

### 10. 框选归一逻辑无测试覆盖

- **现状**：`normalizeRect` 兼容十余种字段名、多层外壳、半开/闭区间转换，`test/` 下无对应用例
- **风险**：改动框选数据结构时无法察觉回归

---

## 八、修改建议的优先级

| 优先级 | 项 | 理由 | 兼容风险 |
| --- | --- | --- | --- |
| P0 | 问题 1 总览面积 | 纯 bug，同报告内自相矛盾 | 无 |
| P0 | 问题 5 有效阈值 | 界面与实际不符，属误导 | 改文字则无风险；接阈值会改变数值 |
| P1 | 问题 7 补两行 | 一行代码，信息对等 | 无 |
| P1 | 问题 3 局部 COP 命名 | 改名零风险，改算法需确认 | 改名无；改算法有 |
| P2 | 问题 4 点间距 | 影响最广但牵涉历史可比性 | **高**，需版本标记 |
| P2 | 问题 2 风险等级 | 需先定义业务口径 | 中 |
| P3 | 问题 6 稳定性评分 | 需标定实验支撑 | 中 |
| P3 | 问题 8、10 | 一致性与测试补强 | 低 |

动手前需要你确认两件事：**问题 3** 的局部 COP 到底该是相对还是绝对坐标；**问题 4** 的历史报告是否需要保持可比（若需要，就得加算法版本字段而不是直接改）。
