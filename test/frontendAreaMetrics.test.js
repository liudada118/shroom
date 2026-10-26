const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')
const { pathToFileURL } = require('node:url')

async function loadMetrics() {
  const helpers = await import(pathToFileURL(path.join(__dirname, '../client/src/util/areaMetrics.js')).href)
  const pressure = await import(pathToFileURL(path.join(__dirname, '../client/src/util/pressureMetrics.js')).href)
  const scope = { ...helpers, ...pressure, calcPartShapeMetrics: () => ({}) }
  const loadPrefix = (filename, start, end, names) => {
    const source = fs.readFileSync(path.join(__dirname, filename), 'utf8')
    return vm.runInNewContext(`(() => {
      ${source.slice(source.indexOf(start), source.indexOf(end))}
      return { ${names.join(', ')} }
    })()`, scope)
  }
  return {
    ...helpers,
    report: loadPrefix('../client/src/page/report/CopReport.js', 'const COP_REPORT_SELECTION_PREFIX', 'const buildAverageMap', ['calcFrameMetrics', 'averageArea', 'formatNumber']),
    contrast: loadPrefix('../client/src/components/contrast/NumThresContrast.js', 'const METRIC_KEYS', 'function MiniLineChart', ['buildMetricSeriesFromFrames', 'getRegionAreaValues', 'calcMetrics', 'buildSingleSeries', 'buildSeriesByFrameIndex']),
  }
}

function frame(areaValuesCm2 = [1.5625, 0, 1.5625, 0]) {
  return {
    width: 4,
    height: 1,
    arr: [90, 40, 80, 20],
    rawAdcArr: [90, 40, 80, 20],
    pressureArr: [3, 1, 2, 0],
    forceArr: [0.5, 0, 0, 0],
    areaValuesCm2,
  }
}

test('area helpers distinguish missing ADC area, measured zero and malformed alignment', async () => {
  const metrics = await loadMetrics()
  assert.equal(metrics.sumAreaValuesCm2(metrics.getAreaValuesCm2(frame())), 3.125)
  assert.equal(metrics.getAreaCellCount(frame().areaValuesCm2), 2)
  assert.equal(metrics.sumAreaValuesCm2(null), null)
  assert.equal(metrics.getAreaCellCount(null), null)
  assert.equal(metrics.getAreaValuesCm2(frame([1.5625])), null)
  assert.equal(metrics.getAreaValuesCm2(frame([1.5625, null, 0, 0])), null)
  assert.equal(metrics.sumAreaValuesCm2([0, 0]), 0)
})

test('report and comparison use identical ADC area in all display modes and crop the retained full-frame cells', async () => {
  const { report, contrast } = await loadMetrics()
  const item = frame()
  const key = 'endi-jacket'
  const rect = { xStart: 1, xEnd: 3, yStart: 0, yEnd: 1 }
  const before = structuredClone(item)
  assert.equal(report.calcFrameMetrics(item, null, key, 'pressure').pAvg, 2)
  assert.equal(report.calcFrameMetrics(item, rect, key, 'pressure').pAvg, 1.5)
  for (const mode of ['adc', 'pressure', 'force']) {
    assert.equal(report.calcFrameMetrics(item, null, key, mode).effectiveArea, 3.125)
    assert.equal(report.calcFrameMetrics(item, rect, key, mode).effectiveArea, 1.5625)
    assert.equal(report.calcFrameMetrics(item, null, key, mode).forceSum, 0.625)
    assert.equal(report.calcFrameMetrics(item, rect, key, mode).forceSum, 0.234375)
    assert.equal(contrast.buildMetricSeriesFromFrames([{ [key]: item }], key, 'area', null, mode)[0], 3.125)
    assert.equal(contrast.buildMetricSeriesFromFrames([{ [key]: item }], key, 'area', rect, mode)[0], 1.5625)
    assert.equal(contrast.buildMetricSeriesFromFrames([{ [key]: item }], key, 'press', null, mode)[0], 0.625)
    assert.equal(contrast.buildMetricSeriesFromFrames([{ [key]: item }], key, 'press', rect, mode)[0], 0.234375)
  }
  assert.notEqual(0.625, (3 + 2) * 1.5625 * 0.1,
    'area selection must not replace the pre-existing pressure mean with a retained-cell weighted mean')
  assert.deepEqual(item, before)
})

test('pressure-only historical frames stay unavailable in summaries and charts', async () => {
  const { report, contrast } = await loadMetrics()
  const key = 'endi-foot'
  const unknown = frame(null)
  assert.equal(report.calcFrameMetrics(unknown, null, key).effectiveArea, null)
  assert.equal(report.calcFrameMetrics(unknown, null, key).forceSum, null)
  assert.equal(report.averageArea([{ effectiveArea: 3.125 }, { effectiveArea: null }]), null)
  assert.equal(report.formatNumber(null), '-')
  assert.equal(contrast.buildMetricSeriesFromFrames([{ [key]: unknown }], key, 'area')[0], null)
  assert.equal(contrast.buildMetricSeriesFromFrames([{ [key]: unknown }], key, 'press')[0], null)
  const measuredZero = frame([0, 0, 0, 0])
  assert.equal(report.calcFrameMetrics(measuredZero, null, key).forceSum, 0)
  assert.equal(contrast.buildMetricSeriesFromFrames([{ [key]: measuredZero }], key, 'press')[0], 0)
  assert.equal(contrast.buildSingleSeries([null])[0].value, null)
  assert.equal(contrast.buildSeriesByFrameIndex([null], [3.125])[0].diff, null)
})

test('other sensor products retain their existing active-point area calculation', async () => {
  const { report, contrast } = await loadMetrics()
  const item = frame()
  delete item.areaValuesCm2
  const key = 'endi-back'
  assert.ok(Math.abs(report.calcFrameMetrics(item, null, key, 'pressure').effectiveArea - 3.9) < 1e-12)
  assert.ok(Math.abs(contrast.buildMetricSeriesFromFrames([{ [key]: item }], key, 'area', null, 'pressure')[0] - 3.9) < 1e-12)
  assert.equal(report.calcFrameMetrics(item, null, key, 'pressure').forceSum, 0.5)
  assert.equal(contrast.buildMetricSeriesFromFrames([{ [key]: item }], key, 'press', null, 'pressure')[0], 0.5)
})
