import React, { useEffect, useMemo, useState } from 'react'
import { Button, Empty, message, Spin } from 'antd'
import { ArrowLeftOutlined, DownloadOutlined, FilePdfOutlined } from '@ant-design/icons'
import axios from 'axios'
import { useLocation, useNavigate } from 'react-router-dom'
import { localAddress } from '../../util/constant'
import { buildFallbackParams } from '../../util/request'
import { computePressureMetrics } from '../../util/pressureMetrics'
import './CopReport.scss'

const EFFECTIVE_THRESHOLD = 5
const POINT_AREA_CM2 = 1
const POINT_SPACING_MM = 10

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const formatNumber = (value, digits = 2) => Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : '-'
const safeArray = (value) => Array.isArray(value) ? value : []
const downsample = (items, limit = 160) => {
  if (!Array.isArray(items) || items.length <= limit) return items || []
  const bucketSize = Math.ceil(items.length / limit)
  const result = []
  for (let i = 0; i < items.length; i += bucketSize) {
    result.push(items[i])
  }
  const last = items[items.length - 1]
  if (result[result.length - 1] !== last) result.push(last)
  return result
}

const parseMaybeJson = (value) => {
  if (!value) return {}
  if (typeof value === 'object') return value
  if (typeof value !== 'string') return {}
  try {
    return JSON.parse(value)
  } catch {
    return {}
  }
}

const inferSize = (matrix) => {
  const arr = safeArray(matrix?.arr)
  const width = Number(matrix?.width) || Number(matrix?.col)
  const height = Number(matrix?.height) || Number(matrix?.row)
  if (width && height) return { width, height }
  const side = Math.sqrt(arr.length)
  if (Number.isInteger(side) && side > 0) return { width: side, height: side }
  return { width: arr.length || 1, height: 1 }
}

const getMatrixKeys = (frames = []) => {
  const first = frames.find((frame) => Object.keys(frame?.data || {}).length)
  return Object.keys(first?.data || {}).filter((key) => Array.isArray(first.data[key]?.arr))
}

const keyCandidates = (key) => {
  const candidates = [key]
  if (typeof key === 'string' && key.includes('-')) candidates.push(key.split('-').pop())
  return [...new Set(candidates.filter(Boolean))]
}

const getReportMatrixKeys = (payload) => {
  const keys = Array.isArray(payload?.keys) && payload.keys.length ? payload.keys : getMatrixKeys(payload?.frames)
  const validKeys = keys.filter((key) => {
    const frame = safeArray(payload?.frames).find((item) => Array.isArray(item?.data?.[key]?.arr))
    return Boolean(frame)
  })
  const orderWeight = (key) => {
    if (String(key).includes('back')) return 1
    if (String(key).includes('sit')) return 2
    return 3
  }
  return [...new Set(validKeys)].sort((left, right) => orderWeight(left) - orderWeight(right) || String(left).localeCompare(String(right)))
}

const getMatrixLabel = (key) => {
  if (String(key).includes('back')) return '靠背'
  if (String(key).includes('sit')) return '坐垫'
  return key || '传感面'
}

const getDeviceName = (key) => {
  if (String(key).includes('back')) return '靠背传感器'
  if (String(key).includes('sit')) return '坐垫传感器'
  return String(key || '').replace(/endi-?/ig, '') || '传感器'
}

const getSensorTypeName = (key) => {
  if (String(key).includes('back')) return '靠背'
  if (String(key).includes('sit')) return '坐垫'
  return String(key || '').replace(/endi-?/ig, '') || '传感器'
}

const formatReportDateTime = (value) => {
  if (value === undefined || value === null || value === '') return '-'
  const numeric = Number(value)
  const date = Number.isFinite(numeric)
    ? new Date(numeric < 1e12 ? numeric * 1000 : numeric)
    : new Date(value)
  if (Number.isNaN(date.getTime())) return String(value).replace(/endi/ig, 'car')
  return date.toLocaleString('zh-CN', { hour12: false })
}

const getCollectionTime = (payload) => {
  const firstFrameTime = safeArray(payload?.frames).find((frame) => frame?.timestamp)?.timestamp
  return formatReportDateTime(payload?.collectedAt || firstFrameTime || payload?.date)
}

const normalizeRect = (source, matrixSize) => {
  const rect = source?.matrixRect || source?.rect || source?.range || source
  if (!rect || typeof rect !== 'object') return null

  let xStart = Number(rect.xStart ?? rect.startX ?? rect.x ?? rect.left ?? rect.colStart ?? rect.columnStart)
  let yStart = Number(rect.yStart ?? rect.startY ?? rect.y ?? rect.top ?? rect.rowStart)
  let xEnd = Number(rect.xEnd ?? rect.endX ?? rect.right ?? rect.colEnd ?? rect.columnEnd)
  let yEnd = Number(rect.yEnd ?? rect.endY ?? rect.bottom ?? rect.rowEnd)
  const width = Number(rect.width ?? rect.w ?? rect.length ?? rect.cols)
  const height = Number(rect.height ?? rect.h ?? rect.rows)

  if (!Number.isFinite(xEnd) && Number.isFinite(xStart) && Number.isFinite(width)) xEnd = xStart + width
  if (!Number.isFinite(yEnd) && Number.isFinite(yStart) && Number.isFinite(height)) yEnd = yStart + height
  if (![xStart, yStart, xEnd, yEnd].every(Number.isFinite)) return null

  xStart = clamp(Math.floor(Math.min(xStart, xEnd)), 0, matrixSize.width)
  yStart = clamp(Math.floor(Math.min(yStart, yEnd)), 0, matrixSize.height)
  xEnd = clamp(Math.ceil(Math.max(xStart + 1, xEnd)), 0, matrixSize.width)
  yEnd = clamp(Math.ceil(Math.max(yStart + 1, yEnd)), 0, matrixSize.height)
  if (xEnd <= xStart || yEnd <= yStart) return null
  return { xStart, yStart, xEnd, yEnd, width: xEnd - xStart, height: yEnd - yStart }
}

const unwrapSelectionList = (value) => {
  if (Array.isArray(value)) return value
  if (!value || typeof value !== 'object') return []
  for (const key of ['regions', 'areas', 'selections', 'boxes', 'selectArr', 'rangeArr', 'items']) {
    if (Array.isArray(value[key])) return value[key]
  }
  return [value]
}

const normalizeSelections = (selectValue, matrixKey, matrixSize) => {
  const select = parseMaybeJson(selectValue)
  const matched = []
  const candidates = keyCandidates(matrixKey)
  Object.entries(select || {}).forEach(([key, value]) => {
    if (key === matrixKey || candidates.includes(key) || candidates.some((candidate) => key.endsWith(`-${candidate}`))) {
      matched.push(...unwrapSelectionList(value))
    }
  })

  if (!matched.length && Array.isArray(select)) matched.push(...select)

  return matched.map((item, index) => {
    const rect = normalizeRect(item, matrixSize)
    if (!rect) return null
    return {
      id: item.selectionId || item.id || `${matrixKey}-${index}`,
      name: item.selectionName || item.name || item.regionName || item.templateName || `框选区域${index + 1}`,
      shapeType: item.shapeType || item.type || '矩形',
      sensorPart: item.sensorPart || item.matrixKey || matrixKey,
      createdAt: item.createdAt || item.created_at || '',
      color: item.color || item.bgc || ['#ff4d4f', '#fa8c16', '#52c41a', '#1677ff'][index % 4],
      rect,
    }
  }).filter(Boolean)
}

const calcFrameMetrics = (matrix, rect = null, matrixKey = '') => {
  const arr = safeArray(matrix?.arr)
  const { width, height } = inferSize(matrix)
  const scope = rect || { xStart: 0, yStart: 0, xEnd: width, yEnd: height }
  let pMax = 0
  let pSum = 0
  let adcSum = 0
  let adcMax = 0
  let effectivePoints = 0
  let weightSum = 0
  let xWeighted = 0
  let yWeighted = 0

  for (let y = scope.yStart; y < scope.yEnd; y++) {
    for (let x = scope.xStart; x < scope.xEnd; x++) {
      const value = Number(arr[y * width + x]) || 0
      pMax = Math.max(pMax, value)
      adcMax = Math.max(adcMax, value)
      adcSum += value
      if (value > 0) pSum += value
      if (value >= EFFECTIVE_THRESHOLD) {
        effectivePoints++
        weightSum += value
        xWeighted += x * value
        yWeighted += y * value
      }
    }
  }

  const scopeValues = []
  for (let y = scope.yStart; y < scope.yEnd; y++) {
    for (let x = scope.xStart; x < scope.xEnd; x++) {
      scopeValues.push(Number(arr[y * width + x]) || 0)
    }
  }
  const pressureMetrics = computePressureMetrics(scopeValues, matrixKey)
  pMax = pressureMetrics.pressMax
  const pAvg = pressureMetrics.pressAver
  pSum = pressureMetrics.total
  const copXIndex = weightSum ? xWeighted / weightSum : width / 2
  const copYIndex = weightSum ? yWeighted / weightSum : height / 2
  return {
    pMax,
    pAvg,
    pSum,
    adcSum,
    adcMax,
    effectivePoints: pressureMetrics.activeCount,
    effectiveArea: pressureMetrics.effectiveArea || pressureMetrics.activeCount * POINT_AREA_CM2,
    copX: (copXIndex - (width - 1) / 2) * POINT_SPACING_MM,
    copY: ((height - 1) / 2 - copYIndex) * POINT_SPACING_MM,
  }
}

const buildAverageMap = (frames, matrixKey) => {
  const firstMatrix = frames[0]?.data?.[matrixKey]
  const { width, height } = inferSize(firstMatrix)
  const sum = Array(width * height).fill(0)
  let count = 0
  frames.forEach((frame) => {
    const arr = safeArray(frame?.data?.[matrixKey]?.arr)
    if (arr.length !== sum.length) return
    count++
    arr.forEach((value, index) => { sum[index] += Number(value) || 0 })
  })
  return { arr: count ? sum.map((value) => value / count) : sum, width, height }
}

const buildSingleAnalysis = (payload, matrixKey) => {
  const frames = safeArray(payload?.frames)
  if (!frames.length || !matrixKey) return null
  const averageMatrix = buildAverageMap(frames, matrixKey)
  const size = inferSize(averageMatrix)
  const selections = normalizeSelections(payload?.select, matrixKey, size)
  const metrics = frames.map((frame) => calcFrameMetrics(frame.data?.[matrixKey], null, matrixKey))
  const durationSeconds = Number(payload?.durationMs) > 0 ? Number(payload.durationMs) / 1000 : Math.max(1, frames.length / (Number(payload?.sampleRate) || 60))
  const copSeries = metrics.filter((item) => Number.isFinite(item.copX) && Number.isFinite(item.copY))
  const pathLength = copSeries.reduce((sum, item, index) => {
    if (!index) return 0
    const prev = copSeries[index - 1]
    return sum + Math.hypot(item.copX - prev.copX, item.copY - prev.copY)
  }, 0)
  const swayX = copSeries.length ? Math.max(...copSeries.map((item) => item.copX)) - Math.min(...copSeries.map((item) => item.copX)) : 0
  const swayY = copSeries.length ? Math.max(...copSeries.map((item) => item.copY)) - Math.min(...copSeries.map((item) => item.copY)) : 0
  const avgCopX = copSeries.length ? copSeries.reduce((sum, item) => sum + item.copX, 0) / copSeries.length : 0
  const avgCopY = copSeries.length ? copSeries.reduce((sum, item) => sum + item.copY, 0) / copSeries.length : 0
  const avgSpeed = durationSeconds ? pathLength / durationSeconds : 0
  const stability = clamp(100 - Math.hypot(avgCopX, avgCopY) * 0.35 - pathLength * 0.08 - avgSpeed * 1.2 - (swayX + swayY) * 0.2, 0, 100)
  const totalSummary = {
    pMax: Math.max(...metrics.map((item) => item.pMax), 0),
    pAvg: metrics.length ? metrics.reduce((sum, item) => sum + item.pAvg, 0) / metrics.length : 0,
    pSum: metrics.length ? metrics.reduce((sum, item) => sum + item.pSum, 0) / metrics.length : 0,
    adcSum: metrics.length ? metrics.reduce((sum, item) => sum + item.adcSum, 0) / metrics.length : 0,
    adcMax: Math.max(...metrics.map((item) => item.adcMax), 0),
    effectiveArea: metrics.length ? metrics.reduce((sum, item) => sum + item.effectiveArea, 0) / metrics.length : 0,
    effectivePoints: metrics.length ? metrics.reduce((sum, item) => sum + item.effectivePoints, 0) / metrics.length : 0,
    copX: avgCopX,
    copY: avgCopY,
    pathLength,
    avgSpeed,
    swayX,
    swayY,
    stability,
  }

  const selectionAnalyses = selections.map((selection) => {
    const series = frames.map((frame) => calcFrameMetrics(frame.data?.[matrixKey], selection.rect, matrixKey))
    const regionCop = series.filter((item) => item.effectivePoints > 0)
    const regionPath = regionCop.reduce((sum, item, index) => {
      if (!index) return 0
      const prev = regionCop[index - 1]
      return sum + Math.hypot(item.copX - prev.copX, item.copY - prev.copY)
    }, 0)
    const pSum = series.length ? series.reduce((sum, item) => sum + item.pSum, 0) / series.length : 0
    const ratio = totalSummary.pSum ? pSum / totalSummary.pSum * 100 : 0
    const risk = ratio >= 30 || Math.max(...series.map((item) => item.pMax), 0) >= 70 ? '高' : ratio >= 12 ? '中' : '低'
    return {
      ...selection,
      series,
      summary: {
        pMax: Math.max(...series.map((item) => item.pMax), 0),
        pAvg: series.length ? series.reduce((sum, item) => sum + item.pAvg, 0) / series.length : 0,
        pSum,
        pressureRatio: ratio,
        adcSum: series.length ? series.reduce((sum, item) => sum + item.adcSum, 0) / series.length : 0,
        adcMax: Math.max(...series.map((item) => item.adcMax), 0),
        effectiveArea: series.length ? series.reduce((sum, item) => sum + item.effectiveArea, 0) / series.length : 0,
        effectivePoints: series.length ? series.reduce((sum, item) => sum + item.effectivePoints, 0) / series.length : 0,
        copX: regionCop.length ? regionCop.reduce((sum, item) => sum + item.copX, 0) / regionCop.length : 0,
        copY: regionCop.length ? regionCop.reduce((sum, item) => sum + item.copY, 0) / regionCop.length : 0,
        pathLength: regionPath,
        risk,
      },
    }
  })

  return {
    matrixKey,
    frames,
    averageMatrix,
    size,
    metrics,
    totalSummary,
    selections: selectionAnalyses,
    sampleRate: Number(payload?.sampleRate) || (frames.length / durationSeconds),
    durationSeconds,
  }
}

const buildAnalysis = (payload) => {
  const keys = getReportMatrixKeys(payload)
  const orderedKeys = keys
  const analyses = orderedKeys
    .map((key) => buildSingleAnalysis(payload, key))
    .filter(Boolean)
  if (!analyses.length) return null
  return {
    ...analyses[0],
    analyses,
  }
}

const heatColor = (value, max) => {
  if (!max || value <= 0) return '#0051b8'
  const ratio = clamp(value / max, 0, 1)
  if (ratio < 0.25) return '#0074d9'
  if (ratio < 0.5) return '#00a98f'
  if (ratio < 0.7) return '#d7df21'
  if (ratio < 0.85) return '#ff8a00'
  return '#e11919'
}

function Heatmap({ matrix, selections = [], activeSelection = null, title }) {
  const arr = safeArray(matrix?.arr)
  const { width, height } = inferSize(matrix)
  const max = Math.max(...arr, 1)
  return (
    <div className="report-chart">
      <div className="chart-title">{title}</div>
      <svg viewBox={`0 0 ${width} ${height}`} className="heatmap-svg" preserveAspectRatio="xMidYMid meet">
        {arr.map((value, index) => (
          <rect key={index} x={index % width} y={Math.floor(index / width)} width="1" height="1" fill={heatColor(value, max)} />
        ))}
        {selections.map((selection) => {
          const isActive = !activeSelection || activeSelection.id === selection.id
          const rect = selection.rect
          return (
            <g key={selection.id} opacity={isActive ? 1 : 0.35}>
              <rect x={rect.xStart} y={rect.yStart} width={rect.width} height={rect.height} fill="none" stroke={selection.color} strokeWidth="1.2" />
              <text x={rect.xStart + 1} y={Math.max(4, rect.yStart - 1)} fill="#fff" fontSize="3">{selection.name}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function LineChart({ series = [], title, color = '#1677ff', yLabel = '' }) {
  const sampled = downsample(series.filter(Number.isFinite), 180)
  const max = Math.max(...sampled, 1)
  const min = Math.min(...sampled, 0)
  const range = max - min || 1
  const points = sampled.map((value, index) => {
    const x = sampled.length > 1 ? index * 100 / (sampled.length - 1) : 0
    const y = 60 - ((value - min) / range) * 52
    return `${x},${y}`
  }).join(' ')
  return (
    <div className="report-chart">
      <div className="chart-title">{title}</div>
      <svg viewBox="0 0 100 68" className="line-svg" preserveAspectRatio="none">
        <line x1="0" y1="60" x2="100" y2="60" stroke="#ccd8ea" strokeWidth="0.6" />
        <line x1="0" y1="8" x2="0" y2="60" stroke="#ccd8ea" strokeWidth="0.6" />
        <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" />
        <text x="2" y="7" fontSize="4" fill="#64748b">{yLabel}</text>
      </svg>
    </div>
  )
}

function CopChart({ series = [], title }) {
  const points = downsample(series.filter((item) => Number.isFinite(item.copX) && Number.isFinite(item.copY)), 180)
  const maxAbs = Math.max(40, ...points.flatMap((item) => [Math.abs(item.copX), Math.abs(item.copY)]))
  const toX = (x) => 50 + x / maxAbs * 45
  const toY = (y) => 50 - y / maxAbs * 45
  const path = points.map((item) => `${toX(item.copX)},${toY(item.copY)}`).join(' ')
  const start = points[0]
  const end = points[points.length - 1]
  return (
    <div className="report-chart">
      <div className="chart-title">{title}</div>
      <svg viewBox="0 0 100 100" className="cop-svg">
        <line x1="50" y1="5" x2="50" y2="95" stroke="#d6e1f0" strokeWidth="0.6" />
        <line x1="5" y1="50" x2="95" y2="50" stroke="#d6e1f0" strokeWidth="0.6" />
        <circle cx="50" cy="50" r="2.2" fill="#fa8c16" />
        <polyline points={path} fill="none" stroke="#1d4ed8" strokeWidth="1.6" />
        {start && <circle cx={toX(start.copX)} cy={toY(start.copY)} r="2.4" fill="#16a34a" />}
        {end && <circle cx={toX(end.copX)} cy={toY(end.copY)} r="2.4" fill="#dc2626" />}
      </svg>
    </div>
  )
}

function MetricCard({ label, value, unit }) {
  return (
    <div className="metric-card">
      <FilePdfOutlined />
      <div>
        <div className="metric-label">{label}</div>
        <div className="metric-value">{value}<span>{unit}</span></div>
      </div>
    </div>
  )
}

function CopReport() {
  const navigate = useNavigate()
  const location = useLocation()
  const [loading, setLoading] = useState(true)
  const [payload, setPayload] = useState(null)
  const [exporting, setExporting] = useState(false)
  const query = new URLSearchParams(location.search)
  const date = query.get('date') || query.get('time') || ''
  const source = query.get('source') || ''
  const fileName = query.get('fileName') || ''

  useEffect(() => {
    if (!date && !fileName) {
      setLoading(false)
      return
    }
    const requestPayload = { date, source, fileName }
    setLoading(true)
    axios({
      method: 'post',
      url: `${localAddress}/copReportData`,
      params: buildFallbackParams(requestPayload),
      data: requestPayload,
    }).then((res) => {
      if (res.data?.code !== 0) {
        message.error(res.data?.message || '报告数据读取失败')
        setPayload(null)
        return
      }
      setPayload(res.data.data)
    }).catch((err) => {
      message.error(err.message || '报告数据读取失败')
      setPayload(null)
    }).finally(() => setLoading(false))
  }, [date, source, fileName])

  const analysis = useMemo(() => buildAnalysis(payload), [payload])
  const generatedTime = payload?.generatedAt ? new Date(payload.generatedAt).toLocaleString() : new Date().toLocaleString()

  const exportPdf = async () => {
    setExporting(true)
    try {
      const fileName = `COP_Report_${payload?.name || payload?.date || Date.now()}.pdf`
      if (window.electronAPI?.exportCurrentPagePdf) {
        const result = await window.electronAPI.exportCurrentPagePdf({ fileName })
        if (!result?.canceled) message.success(`PDF 已导出：${result.filePath}`)
      } else {
        window.print()
      }
    } catch (err) {
      message.error(err.message || 'PDF 导出失败')
    } finally {
      setExporting(false)
    }
  }

  if (loading) {
    return <div className="cop-report-loading"><Spin tip="正在生成报告数据..." /></div>
  }
  if (!analysis) {
    return (
      <div className="cop-report-page">
        <div className="report-toolbar">
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/')}>返回</Button>
        </div>
        <Empty description="未找到可生成报告的历史数据" />
      </div>
    )
  }

  const { totalSummary, averageMatrix, metrics, selections, size } = analysis
  const allAnalyses = analysis.analyses || [analysis]
  const collectionTime = getCollectionTime(payload)

  return (
    <div className="cop-report-page">
      <div className="report-toolbar">
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/')}>返回</Button>
        <Button type="primary" icon={<DownloadOutlined />} loading={exporting} onClick={exportPdf}>导出 PDF</Button>
      </div>

      <main className="cop-report-sheet">
        <h1>压力中心（COP）分析报告</h1>
        <section className="report-meta">
          <div><span>历史文档名称：</span>{payload.name || payload.date}</div>
          <div><span>历史文档ID：</span>{payload.id}</div>
          <div><span>矩阵尺寸：</span>{size.width} x {size.height}</div>
          <div><span>设备名称：</span>{getDeviceName(analysis.matrixKey)}</div>
          <div><span>报告包含：</span>{allAnalyses.map((item) => getMatrixLabel(item.matrixKey)).join(' / ')}</div>
          <div><span>采集时间：</span>{collectionTime}</div>
          <div><span>传感器表面：</span>{analysis.matrixKey.includes('back') ? '靠背表面' : analysis.matrixKey.includes('sit') ? '坐垫表面' : '传感器表面'}</div>
          <div><span>传感器类型：</span>{getSensorTypeName(analysis.matrixKey)}</div>
          <div><span>生成时间：</span>{generatedTime}</div>
          <div><span>报告版本：</span>v1.0</div>
        </section>

        <ReportSection index="1" title="数据概览">
          <div className="metric-grid">
            <MetricCard label="采样帧数" value={payload.frameCount || analysis.frames.length} unit="帧" />
            <MetricCard label="采样时长" value={formatNumber(analysis.durationSeconds, 2)} unit="秒" />
            <MetricCard label="采样率" value={formatNumber(analysis.sampleRate, 1)} unit="帧/秒" />
            <MetricCard label="矩阵尺寸" value={`${size.width} x ${size.height}`} unit="" />
            <MetricCard label="有效阈值" value={EFFECTIVE_THRESHOLD} unit="kPa" />
            <MetricCard label="压力单位" value="kPa" unit="" />
            <MetricCard label="坐标单位" value="mm" unit="" />
          </div>
        </ReportSection>

        <ReportSection index="2" title="整体压力分布与COP轨迹">
          <div className="chart-grid four">
            <Heatmap matrix={averageMatrix} selections={selections} title="整体平均压力热力图 (kPa)" />
            <CopChart series={metrics} title="整体COP轨迹图 (mm)" />
            <Heatmap matrix={averageMatrix} selections={selections} title="框选区域叠加图" />
            <LineChart series={metrics.map((item) => item.pSum)} title="压力总和趋势图 (kPa/N)" color="#1d4ed8" yLabel="压力" />
          </div>
        </ReportSection>

        <ReportSection index="3" title="整体统计指标">
          <DataTable
            columns={['最大压强 (kPa)', '平均压强 (kPa)', '压力总和 (kPa/N)', 'ADC总和 (ADC)', 'ADC最大值 (ADC)', '有效面积 (cm²)', '有效点数 (个)']}
            rows={[[
              formatNumber(totalSummary.pMax),
              formatNumber(totalSummary.pAvg),
              formatNumber(totalSummary.pSum),
              formatNumber(totalSummary.adcSum, 0),
              formatNumber(totalSummary.adcMax, 0),
              formatNumber(totalSummary.effectiveArea),
              formatNumber(totalSummary.effectivePoints, 0),
            ]]}
          />
        </ReportSection>

        <ReportSection index="4" title="整体COP分析">
          <DataTable
            columns={['COP坐标 (mm)', '左右偏移 Dx (mm)', '前后偏移 Dy (mm)', '轨迹长度 (mm)', '平均速度 (mm/s)', '摆动范围 (mm)', '稳定性评分']}
            rows={[[
              `(${formatNumber(totalSummary.copX)}, ${formatNumber(totalSummary.copY)})`,
              `${formatNumber(totalSummary.copX)} ${totalSummary.copX >= 0 ? '(右)' : '(左)'}`,
              `${formatNumber(totalSummary.copY)} ${totalSummary.copY >= 0 ? '(前)' : '(后)'}`,
              formatNumber(totalSummary.pathLength),
              formatNumber(totalSummary.avgSpeed),
              `${formatNumber(totalSummary.swayX)} / ${formatNumber(totalSummary.swayY)}`,
              formatNumber(totalSummary.stability, 1),
            ]]}
          />
          <div className="chart-grid two">
            <CopChart series={metrics} title="COP轨迹详图" />
            <LineChart series={metrics.map((item) => item.copX)} title="COP偏移趋势图 Dx" color="#1677ff" yLabel="Dx" />
          </div>
        </ReportSection>

        <ReportSection index="5" title="框选区域总览">
          {selections.length ? (
            <DataTable
              columns={['序号', '区域名称', '形状类型', '面积 (cm²)', '压力总和 (kPa/N)', '占整体比例 (%)', '最大压强 (kPa)', '平均压强 (kPa)', '风险等级']}
              rows={selections.map((selection, index) => [
                index + 1,
                selection.name,
                selection.shapeType,
                formatNumber(selection.rect.width * selection.rect.height * POINT_AREA_CM2),
                formatNumber(selection.summary.pSum),
                formatNumber(selection.summary.pressureRatio, 1),
                formatNumber(selection.summary.pMax),
                formatNumber(selection.summary.pAvg),
                selection.summary.risk,
              ])}
            />
          ) : (
            <div className="empty-note">该历史文档未包含框选区域。</div>
          )}
        </ReportSection>

        {selections.length ? (
          <ReportSection index="6" title="框选区域详细分析">
            {selections.map((selection, index) => (
              <div className="selection-detail" key={selection.id}>
                <h3><span style={{ background: selection.color }}>{index + 1}</span>{selection.name}</h3>
                <div className="selection-detail-grid">
                  <Heatmap matrix={averageMatrix} selections={[selection]} activeSelection={selection} title="区域叠加图" />
                  <LineChart series={selection.series.map((item) => item.pSum)} title="区域压力总和趋势 (kPa/N)" color={selection.color} yLabel="压力" />
                  <CopChart series={selection.series} title="区域局部COP轨迹 (mm)" />
                  <DataTable
                    columns={['指标', '数值']}
                    rows={[
                      ['最大压强 (kPa)', formatNumber(selection.summary.pMax)],
                      ['平均压强 (kPa)', formatNumber(selection.summary.pAvg)],
                      ['压力总和 (kPa/N)', `${formatNumber(selection.summary.pSum)} (${formatNumber(selection.summary.pressureRatio, 1)}%)`],
                      ['ADC总和 (ADC)', formatNumber(selection.summary.adcSum, 0)],
                      ['有效面积 (cm²)', formatNumber(selection.summary.effectiveArea)],
                      ['有效点数 (个)', formatNumber(selection.summary.effectivePoints, 0)],
                      ['局部COP (mm)', `(${formatNumber(selection.summary.copX)}, ${formatNumber(selection.summary.copY)})`],
                      ['风险等级', selection.summary.risk],
                    ]}
                  />
                  <div className="region-info">
                    <b>区域信息</b>
                    <p>形状类型：{selection.shapeType}</p>
                    <p>坐标范围：X {selection.rect.xStart}-{selection.rect.xEnd - 1}，Y {selection.rect.yStart}-{selection.rect.yEnd - 1}</p>
                    <p>矩阵面积：{selection.rect.width} x {selection.rect.height}</p>
                    <p>所属表面：{getMatrixLabel(selection.sensorPart)}</p>
                  </div>
                </div>
              </div>
            ))}
          </ReportSection>
        ) : null}

        {allAnalyses.slice(1).map((surfaceAnalysis, index) => (
          <SurfaceAnalysisReport
            key={surfaceAnalysis.matrixKey}
            analysis={surfaceAnalysis}
            indexLabel={`${selections.length ? 7 : 6}.${index + 1}`}
          />
        ))}

        <ReportSection index={selections.length ? '8' : '7'} title="附录（计算说明）">
          <div className="appendix-grid">
            <div>
              <b>计算公式</b>
              <p>COP坐标：Xcop = Σ(Pi * xi) / ΣPi，Ycop = Σ(Pi * yi) / ΣPi。</p>
              <p>轨迹长度：相邻COP点距离累加。</p>
              <p>平均速度：轨迹长度 / 有效采样时长。</p>
            </div>
            <div>
              <b>阈值配置</b>
              <p>有效阈值：{EFFECTIVE_THRESHOLD} kPa。</p>
              <p>风险等级：结合压力占比和最大压强估算。</p>
            </div>
            <div>
              <b>数据说明</b>
              <p>本报告基于历史数据统计帧结果自动生成。</p>
              <p>数据仅用于压力分布与受力趋势分析，不构成医学诊断。</p>
            </div>
          </div>
        </ReportSection>

        <footer>报告生成时间：{generatedTime}　|　本报告由压力分析系统自动生成</footer>
      </main>
    </div>
  )
}

function SurfaceAnalysisReport({ analysis, indexLabel }) {
  const { totalSummary, averageMatrix, metrics, selections, size, matrixKey } = analysis
  const label = getMatrixLabel(matrixKey)
  return (
    <ReportSection index={indexLabel} title={`${label}压力中心分析`}>
      <div className="surface-summary">
        <div><span>传感面：</span>{label}</div>
        <div><span>传感器类型：</span>{getSensorTypeName(matrixKey)}</div>
        <div><span>矩阵尺寸：</span>{size.width} x {size.height}</div>
        <div><span>框选数量：</span>{selections.length}</div>
      </div>
      <div className="chart-grid four">
        <Heatmap matrix={averageMatrix} selections={selections} title={`${label}平均压力热力图 (kPa)`} />
        <CopChart series={metrics} title={`${label} COP轨迹图 (mm)`} />
        <Heatmap matrix={averageMatrix} selections={selections} title={`${label}框选叠加图`} />
        <LineChart series={metrics.map((item) => item.pSum)} title={`${label}压力总和趋势 (kPa/N)`} color="#1d4ed8" yLabel="压力" />
      </div>
      <DataTable
        columns={['最大压强 (kPa)', '平均压强 (kPa)', '压力总和 (kPa/N)', 'ADC总和 (ADC)', 'ADC最大值 (ADC)', '有效面积 (cm²)', '有效点数 (个)']}
        rows={[[
          formatNumber(totalSummary.pMax),
          formatNumber(totalSummary.pAvg),
          formatNumber(totalSummary.pSum),
          formatNumber(totalSummary.adcSum, 0),
          formatNumber(totalSummary.adcMax, 0),
          formatNumber(totalSummary.effectiveArea),
          formatNumber(totalSummary.effectivePoints, 0),
        ]]}
      />
      <DataTable
        columns={['COP坐标 (mm)', '左右偏移 Dx (mm)', '前后偏移 Dy (mm)', '轨迹长度 (mm)', '平均速度 (mm/s)', '摆动范围 (mm)', '稳定性评分']}
        rows={[[
          `(${formatNumber(totalSummary.copX)}, ${formatNumber(totalSummary.copY)})`,
          formatNumber(totalSummary.copX),
          formatNumber(totalSummary.copY),
          formatNumber(totalSummary.pathLength),
          formatNumber(totalSummary.avgSpeed),
          `${formatNumber(totalSummary.swayX)} / ${formatNumber(totalSummary.swayY)}`,
          formatNumber(totalSummary.stability, 1),
        ]]}
      />
      {selections.length ? (
        <div className="surface-selection-list">
          {selections.map((selection, index) => (
            <div className="selection-detail compact" key={selection.id}>
              <h3><span style={{ background: selection.color }}>{index + 1}</span>{selection.name}</h3>
              <div className="selection-detail-grid">
                <Heatmap matrix={averageMatrix} selections={[selection]} activeSelection={selection} title="区域叠加图" />
                <LineChart series={selection.series.map((item) => item.pSum)} title="区域压力总和趋势 (kPa/N)" color={selection.color} yLabel="压力" />
                <CopChart series={selection.series} title="区域局部COP轨迹 (mm)" />
                <DataTable
                  columns={['指标', '数值']}
                  rows={[
                    ['最大压强 (kPa)', formatNumber(selection.summary.pMax)],
                    ['平均压强 (kPa)', formatNumber(selection.summary.pAvg)],
                    ['压力总和 (kPa/N)', `${formatNumber(selection.summary.pSum)} (${formatNumber(selection.summary.pressureRatio, 1)}%)`],
                    ['有效面积 (cm²)', formatNumber(selection.summary.effectiveArea)],
                    ['有效点数 (个)', formatNumber(selection.summary.effectivePoints, 0)],
                    ['局部COP (mm)', `(${formatNumber(selection.summary.copX)}, ${formatNumber(selection.summary.copY)})`],
                  ]}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-note">{label}未包含框选区域。</div>
      )}
    </ReportSection>
  )
}

function ReportSection({ index, title, children }) {
  return (
    <section className="report-section">
      <h2><span>{index}.</span>{title}</h2>
      {children}
    </section>
  )
}

function DataTable({ columns, rows }) {
  return (
    <table className="report-table">
      <thead>
        <tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((row, rowIndex) => (
          <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={`${rowIndex}-${cellIndex}`}>{cell}</td>)}</tr>
        ))}
      </tbody>
    </table>
  )
}

export default CopReport
