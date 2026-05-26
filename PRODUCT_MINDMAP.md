# 产品功能逻辑折叠导图

> 飞书 Toggle 风格：按模块逐层展开，适合产品评审、研发拆解和 QA 对齐。最后更新于：2026-05-25

<details open>
<summary><strong>JQ Tools 压力感知软件</strong></summary>

<details open>
<summary><strong>整体主链路</strong></summary>

- 设备配置与连接
- 设备数据接收与处理
- 展示视图
- 功能工具模块
- 数据可视化与计算指标
- 采集、历史数据与回放
- 数据导出与导入
- 数据对比

</details>

<details>
<summary><strong>1. 设备配置与连接</strong></summary>

<details>
<summary><strong>目标</strong></summary>

- 识别合法设备
- 建立稳定串口连接
- 让后续模块可以接收实时数据

</details>

<details>
<summary><strong>用户动作</strong></summary>

- 首次录入 MAC 和设备类型
- 点击一键连接
- 设备异常时点击重新连接
- 需要中断时点击断开连接

</details>

<details>
<summary><strong>实现逻辑</strong></summary>

1. 启动时检查本地设备配置。
2. 用户点击一键连接后，前端进入连接中状态。
3. 后端创建连接锁，防止重复连接。
4. 扫描可用串口。
5. 筛选目标传感器设备。
6. 依次探测候选波特率。
7. 打开稳定串口连接。
8. 读取设备 MAC。
9. 根据 MAC 匹配设备类型。
10. 校验设备授权和类型匹配。
11. 绑定数据监听，开始接收实时帧。

</details>

<details>
<summary><strong>输出结果</strong></summary>

- 设备状态变为在线
- 前端显示连接成功
- 后端开始推送实时数据
- 展示、统计、采集等模块进入可用状态

</details>

<details>
<summary><strong>异常处理</strong></summary>

- 连接中禁止重复点击
- 连接超时后释放连接锁
- 失败时返回明确错误原因
- 重连前清理旧串口、parser、监听器、定时器和缓存
- MAC 读取失败、类型不匹配、授权失败时禁止采集

</details>

</details>

<details>
<summary><strong>2. 设备数据接收与处理</strong></summary>

<details>
<summary><strong>目标</strong></summary>

- 把串口原始帧转换成标准压力矩阵
- 为展示、统计、采集、回放和导出提供统一数据源

</details>

<details>
<summary><strong>输入</strong></summary>

- 串口原始帧
- 设备类型
- 当前波特率
- 矩阵尺寸规则
- 当前显示方向

</details>

<details>
<summary><strong>实现逻辑</strong></summary>

1. 接收串口数据帧。
2. 校验帧头、长度和完整性。
3. 丢弃坏帧、断帧和长度不匹配数据。
4. 解析一维压力点阵。
5. 根据设备类型转换为对应矩阵。
6. 计算采样率和帧时间。
7. 按当前方向状态生成业务矩阵。
8. 生成标准数据对象。
9. 分发给展示、统计、采集、回放等下游模块。

</details>

<details>
<summary><strong>输出结果</strong></summary>

- 原始帧，用于排查
- 原始点阵，用于追溯
- 标准压力矩阵，用于展示和统计
- 可保存帧数据，用于采集和历史

</details>

<details>
<summary><strong>关键原则</strong></summary>

- 全量矩阵必须保留
- 框选不能裁掉原始矩阵
- 可视化调节不能污染原始数据
- 下游模块失败不应破坏原始数据流

</details>

</details>

<details>
<summary><strong>3. 展示视图</strong></summary>

<details>
<summary><strong>目标</strong></summary>

- 实时展示压力分布
- 帮助用户快速判断设备和压力状态

</details>

<details>
<summary><strong>输入</strong></summary>

- 实时压力矩阵
- 设备在线状态
- 当前显示对象：坐垫、靠背、整体
- 当前视图配置

</details>

<details>
<summary><strong>实现逻辑</strong></summary>

1. 前端接收实时数据。
2. 根据当前显示对象选择矩阵。
3. 应用坐垫或靠背方向设置。
4. 渲染 2D 数字视图。
5. 渲染 3D 点图或模型视图。
6. 同步设备在线、离线和异常状态。
7. 用户切换视图时重新映射显示数据。

</details>

<details>
<summary><strong>输出结果</strong></summary>

- 用户能实时看到压力变化
- 用户能切换坐垫、靠背、整体视图
- 用户能看到设备当前状态

</details>

<details>
<summary><strong>关键原则</strong></summary>

- 展示变化不改变采集数据
- 视图切换不丢失原始矩阵
- 断连时要有明确状态提示
- 2D 和 3D 视图应使用一致的数据口径

</details>

</details>

<details>
<summary><strong>4. 功能工具模块</strong></summary>

<details>
<summary><strong>目标</strong></summary>

- 提供现场分析工具
- 修正显示方向
- 支持局部分析和测量

</details>

<details>
<summary><strong>置零</strong></summary>

1. 用户点击置零。
2. 系统记录当前压力基线。
3. 后续展示和统计扣除基线。
4. 采集和导出记录置零状态。

</details>

<details>
<summary><strong>翻转与旋转</strong></summary>

1. 用户调整坐垫或靠背方向。
2. 系统分别保存坐垫、靠背方向。
3. 后端或前端按当前方向转换矩阵。
4. 展示、统计、采集、回放、导出都使用一致方向。

</details>

<details>
<summary><strong>框选</strong></summary>

1. 用户进入 2D 数字视图。
2. 点击框选工具。
3. 拖拽或手动输入坐标。
4. 系统校验有效矩阵范围。
5. 保存矩阵坐标和区域信息。
6. 每个区域独立计算统计。
7. 最多支持 4 个区域。

</details>

<details>
<summary><strong>框选模板</strong></summary>

1. 用户把当前框选区域保存为模板。
2. 模板只保存区域配置，不保存压力数据。
3. 应用模板时校验设备类型、显示对象和矩阵尺寸。
4. 匹配后恢复区域并重新计算当前数据。

</details>

<details>
<summary><strong>量尺</strong></summary>

1. 用户在矩阵上画线。
2. 系统记录起点和终点。
3. 根据传感点距计算真实距离。
4. 拖动、缩放、翻转后仍保持真实距离口径。

</details>

<details>
<summary><strong>可视化调节</strong></summary>

- 调整颜色
- 调整高度
- 调整过滤阈值
- 调整润滑效果
- 调整响应速度
- 只影响显示，不改变原始矩阵

</details>

</details>

<details>
<summary><strong>5. 数据可视化与计算指标</strong></summary>

<details>
<summary><strong>目标</strong></summary>

- 把压力矩阵转换为用户能理解的指标、曲线和趋势

</details>

<details>
<summary><strong>输入</strong></summary>

- 全量压力矩阵
- 框选区域
- 置零状态
- 过滤阈值
- 当前显示方向

</details>

<details>
<summary><strong>实现逻辑</strong></summary>

1. 判断当前统计范围：全量或框选。
2. 按方向和置零状态取计算矩阵。
3. 排除 0 或无效压力点。
4. 计算平均压力。
5. 计算最大压力。
6. 计算非零最小压力。
7. 计算压力总和。
8. 计算受压面积。
9. 计算有效点数。
10. 计算压力重心。
11. 生成压力、面积、重心等趋势曲线。

</details>

<details>
<summary><strong>输出结果</strong></summary>

- 全量统计指标
- 框选区域统计指标
- 压力曲线
- 面积曲线
- 压力重心图
- 正态分布或其他辅助图表

</details>

<details>
<summary><strong>关键原则</strong></summary>

- 多框选默认独立统计
- 统计结果必须能被固定矩阵复核
- 可视化效果不改变统计口径
- 框选只改变分析范围，不改变原始数据

</details>

</details>

<details>
<summary><strong>6. 采集、历史数据与回放</strong></summary>

<details>
<summary><strong>目标</strong></summary>

- 保存实验过程
- 生成历史记录
- 支持后续回放和重新分析

</details>

<details>
<summary><strong>采集逻辑</strong></summary>

1. 用户点击开始采集。
2. 后端再次校验设备连接、MAC、授权、类型和矩阵尺寸。
3. 校验通过后创建采集任务。
4. 持续保存全量压力矩阵。
5. 同步保存设备、时间、方向、置零、采样率等元数据。
6. 用户点击停止采集。
7. 系统结束任务并生成历史记录。

</details>

<details>
<summary><strong>历史数据逻辑</strong></summary>

- 历史记录按采集任务分组展示
- 支持搜索、删除、下载
- 区分本地历史数据和导入数据
- 列表操作不影响原始采集口径

</details>

<details>
<summary><strong>回放逻辑</strong></summary>

1. 用户选择历史记录。
2. 系统读取历史帧。
3. 按播放进度逐帧推送。
4. 前端按历史帧重新渲染视图和图表。
5. 用户可以播放、暂停、拖动进度、调整倍速。

</details>

<details>
<summary><strong>框选回放</strong></summary>

1. 用户在回放中重新框选。
2. 系统基于历史全量矩阵重新计算区域指标。
3. 拖动进度条时同步更新框选统计。
4. 回放框选不修改原始历史记录。

</details>

<details>
<summary><strong>异常处理</strong></summary>

- 采集中断时保留已保存数据
- 设备断开时提示异常并允许恢复
- 损坏帧跳过或提示
- 退出回放时清理临时回放状态

</details>

</details>

<details>
<summary><strong>7. 数据导出与导入</strong></summary>

<details>
<summary><strong>目标</strong></summary>

- 让历史数据可交付、可复核、可再次导入使用

</details>

<details>
<summary><strong>导出逻辑</strong></summary>

1. 用户选择历史记录。
2. 用户选择保存路径。
3. 系统读取全量矩阵和元数据。
4. 生成 CSV 文件。
5. CSV 包含设备、时间、方向、采样率、统计字段。
6. 有框选时可附带区域元数据和区域统计。

</details>

<details>
<summary><strong>导入逻辑</strong></summary>

1. 用户选择 CSV 文件。
2. 系统校验 CSV 字段结构。
3. 校验矩阵数组长度。
4. 校验数值是否有效。
5. 校验通过后写入导入列表。
6. 导入数据可用于回放或后续分析。

</details>

<details>
<summary><strong>输出结果</strong></summary>

- CSV 可打开
- CSV 可导入
- CSV 可用于复核实验
- CSV 可作为外部分析数据源

</details>

<details>
<summary><strong>异常处理</strong></summary>

- 结构错误提示“数据有误”
- 导入失败删除临时文件
- legacy 数据缺字段时标记可比性受限
- 导出失败时保留当前历史记录

</details>

</details>

<details>
<summary><strong>8. 数据对比</strong></summary>

<details>
<summary><strong>目标</strong></summary>

- 比较两条历史记录之间的压力变化
- 帮助用户判断方案 A/B、调整前后或实验组差异

</details>

<details>
<summary><strong>用户动作</strong></summary>

1. 进入历史数据。
2. 选择基准记录 A。
3. 选择对比记录 B。
4. 点击开始对比。

</details>

<details>
<summary><strong>校验逻辑</strong></summary>

- A 和 B 不能是同一条记录
- 设备类型要一致
- 矩阵尺寸要兼容
- 坐垫和靠背对象要匹配
- 两条记录都必须包含全量矩阵
- 不可比数据阻止进入对比

</details>

<details>
<summary><strong>对比逻辑</strong></summary>

1. A 作为基准数据。
2. B 作为对比数据。
3. 按播放进度百分比同步 A/B 帧。
4. 计算 `B - A` 差值矩阵。
5. 计算 A、B、差值和变化率。
6. A 为 0 时变化率显示 `N/A`。

</details>

<details>
<summary><strong>展示结果</strong></summary>

- A 图
- B 图
- 差值图
- 指标表
- 对比曲线
- 当前帧时间和进度

</details>

<details>
<summary><strong>框选对比</strong></summary>

1. 用户创建或应用框选区域。
2. 同一区域同时作用于 A 和 B。
3. 系统计算局部 A/B 指标。
4. 系统计算局部差值和变化率。
5. 退出对比时不修改历史原始数据。

</details>

<details>
<summary><strong>异常处理</strong></summary>

- 未选 A 或 B 时禁止开始
- A/B 相同禁止对比
- 类型或尺寸不同禁止对比
- 帧数据损坏时提示或跳过
- 退出对比时清理临时状态

</details>

</details>

</details>
