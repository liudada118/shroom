/**
 * ECharts 按需引入
 * 
 * 只引入项目实际使用的组件，减少打包体积约 60%
 * 使用方式：import * as echarts from '../util/echarts' 替代 import * as echarts from 'echarts'
 */
import * as echarts from 'echarts/core'

// 图表类型
import { LineChart } from 'echarts/charts'

// 组件
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
} from 'echarts/components'

// 渲染器 — Canvas 渲染器（适合大量数据）
import { CanvasRenderer } from 'echarts/renderers'

// 注册
echarts.use([
  LineChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  CanvasRenderer,
])

export default echarts
export { echarts }
