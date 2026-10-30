const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')
const { pathToFileURL } = require('node:url')
const { createDummyPressureStatistics } = require('../util/dummyPressureStatistics')
const referenceStatistics = createDummyPressureStatistics(require('../server/kpa/dummyPressure.v2.10.34'))
const referenceFixture = require('./fixtures/dummyPressureStatisticsV2.10.34.json')

async function loadMetrics() {
  const helpers = await import(pathToFileURL(path.join(__dirname, '../client/src/util/areaMetrics.js')).href)
  const pressure = await import(pathToFileURL(path.join(__dirname, '../client/src/util/pressureMetrics.js')).href)
  const scope = {
    ...helpers, ...pressure, ...referenceStatistics,
    calcPartShapeMetrics: () => ({}), calcCentroidRatio: () => ({ x: 0.5, y: 0.5 }),
  }
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

function referenceFrame(name) {
  const sample = referenceFixture.cases.find(item => item.name === name)
  const rawAdcArr = new Array(24 * 54).fill(0)
  const pressureValuesKpa = new Array(24 * 54).fill(0)
  sample.matrix.forEach((row, y) => row.forEach((value, x) => {
    rawAdcArr[(y + 20) * 24 + x + 5] = value
    pressureValuesKpa[(y + 20) * 24 + x + 5] = sample.expected.pressureMatrixKpa[y][x]
  }))
  const areaValuesCm2 = rawAdcArr.map(value => value > 30 ? 1.5625 : 0)
  return {
    width: 24, height: 54, arr: [...rawAdcArr], rawAdcArr, pressureValuesKpa,
    pressureSummary: sample.expected,
    pressureArr: pressureValuesKpa.map(value => Math.round(value * 10) / 10),
    forceArr: new Array(24 * 54).fill(999), areaValuesCm2,
    areaCm2: areaValuesCm2.reduce((sum, value) => sum + value, 0),
    processing: { dummyAdcThreshold: 0, dummyResultScale: 1 },
  }
}

test('report and comparison match independent reference screenshot statistics and recalibrate selected ADC', async () => {
  const { report, contrast } = await loadMetrics()
  const item = referenceFrame('screenshot prepared main contact')
  const key = 'endi-jacket'
  const rect = { xStart: 9, xEnd: 14, yStart: 22, yEnd: 28 }
  for (const [scope, expected] of [[null, { avg: 10.86, max: 30.06, points: 77 }], [rect, { avg: 9.17, max: 17.24, points: 30 }]]) {
    const metrics = report.calcFrameMetrics(item, scope, key, 'pressure')
    assert.equal(metrics.pAvg, expected.avg)
    assert.equal(metrics.pMax, expected.max)
    assert.equal(metrics.effectivePoints, expected.points)
    for (const [metric, value] of [['aver', expected.avg], ['max', expected.max], ['points', expected.points]]) {
      assert.equal(contrast.buildMetricSeriesFromFrames([{ [key]: item }], key, metric, scope, 'pressure')[0], value)
    }
    for (const mode of ['adc', 'pressure', 'force']) {
      const force = expected.avg * metrics.effectiveArea * 0.1
      assert.equal(report.calcFrameMetrics(item, scope, key, mode).forceSum, force)
      assert.equal(contrast.buildMetricSeriesFromFrames([{ [key]: item }], key, 'press', scope, mode)[0], force)
    }
  }
})

test('report and comparison count precise positive pressures that round to zero in the legacy matrix', async () => {
  const { report, contrast } = await loadMetrics()
  const item = referenceFrame('tiny positive pressures survive metric rounding')
  const key = 'endi-jacket'
  assert.equal(item.pressureArr.filter(value => value > 0).length, 1)
  const result = report.calcFrameMetrics(item, null, key, 'pressure')
  assert.equal(result.effectivePoints, 3)
  assert.equal(result.pAvg, 3.54)
  assert.equal(result.pMax, 10.53)
  assert.equal(contrast.buildMetricSeriesFromFrames([{ [key]: item }], key, 'points')[0], 3)
  assert.equal(contrast.buildMetricSeriesFromFrames([{ [key]: item }], key, 'aver')[0], 3.54)
})

test('reference summary formatting retains 0.01 kPa across units while grid labels and legacy summaries keep their precision', async () => {
  const pressure = await import(pathToFileURL(path.join(__dirname, '../client/src/util/pressureMetrics.js')).href)
  const sample = referenceFixture.cases.find(item => item.name === 'tiny positive pressures survive metric rounding')
  const precise = sample.expected.pressureMatrixKpa.flat()
  const rounded = precise.map(value => Math.round(value * 10) / 10)
  const reference = { ...sample.expected, pressureValuesKpa: precise }
  const summary = pressure.getCanonicalMetricSummary(rounded, [], 'pressure', sample.matrix.flat(), reference)
  assert.equal(summary.activeCount, 3)
  assert.equal(summary.average, 3.54)
  assert.equal(summary.max, 10.53)
  assert.equal(summary.total, sample.expected.pressureSumKpa)
  assert.deepEqual(summary.metricValues, precise)
  const legacy = pressure.getCanonicalMetricSummary(rounded, [], 'pressure')
  assert.equal(legacy.activeCount, 1)
  assert.equal(legacy.average, 10.5)

  for (const [unit, gridText, summaryText] of [['kPa', '9.1', '9.07'], ['N/cm²', '0.91', '0.907']]) {
    assert.equal(pressure.formatPressureValue(9.07, unit), gridText)
    assert.equal(pressure.formatPressureSummaryValue(9.07, unit), summaryText)
    assert.equal(pressure.getPressureMetricDisplay('pressure', null, 'zh', unit).formatValue(9.07), gridText)
    assert.equal(pressure.getPressureMetricDisplay('pressure', null, 'zh', unit, 2).formatValue(9.07), summaryText)
  }
  assert.equal(pressure.formatPressureSummaryValue(null, 'kPa'), '-')
  for (const mode of ['adc', 'force']) {
    assert.equal(pressure.getPressureMetricDisplay(mode, null, 'zh', 'N/cm²', 2).formatValue(9.07), '9.1')
  }
})
