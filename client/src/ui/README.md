# UI 组件库

`client/src/ui` 是项目可复用展示组件的唯一入口。业务代码统一从 `../ui` 或 `../../ui` 引入，不再直接访问组件内部文件。

## 依赖边界

- UI 组件可以依赖 React、Ant Design、图标、国际化和纯展示工具。
- UI 组件不得请求业务接口、读取设备 Store，或持有采集、框选、报告等业务流程。
- 带业务状态的组合组件继续放在 `components/` 或 `page/`，通过 props 组合 UI 组件。
- 新增公共组件后，必须在 `index.js` 中导出。

## 当前组件

| 组件 | 用途 |
| --- | --- |
| `AsyncState` | 加载中、空结果等异步状态 |
| `ChartPanel` | 图表标题、操作、图例、说明、内容和底部布局 |
| `DraggablePanel` | 可拖动、可缩放浮动面板 |
| `Drawer` | 基于 Portal 的侧边抽屉 |
| `ExportDialog` | 导出路径、格式及可选字段选择 |
| `ExportProgressDialog` | 导出进度、结果文件及后续操作 |
| `MetricValue` | 数值、状态色点和单位的稳定排版 |
| `PlaybackPlayToggle` | 回放播放/暂停操作 |
| `PlaybackSpeedMenu` | 回放倍速选项 |
| `Select` | 支持 Portal 浮层的项目选择器 |
| `SettingControlRow` | 标签、滑块、数字输入、说明及可选开关 |
| `ToolbarAction` | 图标与文字组成的工具栏操作 |

仍然持有 HTTP 请求或设备状态的组件不会直接放入本目录。应先拆出纯展示层，再由业务层传入状态和事件处理函数。
