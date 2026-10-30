const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')
const { pathToFileURL } = require('node:url')
const { DUMMY_MATRIX_CONFIG, processFrame } = require('../util/pressureFrameProcessor')
const { createDummyPressureStatistics } = require('../util/dummyPressureStatistics')
const referenceStatistics = createDummyPressureStatistics(require('../server/kpa/dummyPressure.v2.10.34'))

async function realtimeHarness() {
  const helper = await import(pathToFileURL(path.resolve(__dirname, '../client/src/util/areaMetrics.js')).href)
  const pressure = await import(pathToFileURL(path.resolve(__dirname, '../client/src/util/pressureMetrics.js')).href)
  const render = await import(pathToFileURL(path.resolve(__dirname, '../client/src/util/mannequinHeatmapSource.js')).href)
  const store = {
    pressureMetricMode: 'pressure', connectState: 'idle',
    setMetricStatus() {}, setEquipStatus() {}, setEquipStamp() {}, setDisplayStatus() {},
  }
  let selection = []
  const dimensions = Object.fromEntries(Object.entries(DUMMY_MATRIX_CONFIG).map(([key, item]) => [key, {
    width: item.displayWidth, height: item.displayHeight,
  }]))
  dimensions['endi-foot'] = { width: 24, height: 64 }
  const scope = {
    ...helper, ...pressure, ...referenceStatistics,
    useRef: value => ({ current: value }),
    getSysType: () => 'endi',
    getVisualRenderMetricMode: () => render.getMannequinHeatmapMode({ visualDataMode: store.visualDataMode }),
    getSelectArr: () => selection,
    getDisplayType: () => 'endi-leftHand2D',
    useEquipStore: { getState: () => store },
    systemPointConfig: dimensions,
    colSelectMatrix: (_canvas, box) => box.rect,
    calcCentroidRatio: () => ({ x: 0.5, y: 0.5 }),
    calcPartShapeMetrics: () => ({}), calcRegionShapeMetrics: () => ({}),
    mean: () => 0, variance: () => 0, skewness: () => 0, kurtosis: () => 0, normalPDF: () => 0,
    formatSelectionName: name => name || 'region', getDefaultSelectionName: () => 'region',
    removeHistoryBox() {}, matrixGenBox() {},
    document: { querySelector: () => null }, window: {},
  }
  const source = fs.readFileSync(path.resolve(__dirname, '../client/src/hooks/useMatrixData.js'), 'utf8')
    .replace(/^import[\s\S]*?\sfrom ['"][^'"]+['"];?\r?\n/gm, '')
    .replace('export function useMatrixData', 'function useMatrixData')
  const hook = vm.runInNewContext(`${source}\nuseMatrixData()`, scope)
  return { hook, store, select: boxes => { selection = boxes } }
}

test('realtime panel and selection trends use canonical area independent of display mode', async () => {
  const { hook, store, select } = await realtimeHarness()
  const key = 'endi-leftHand'
  const frame = processFrame({ [key]: { arr: new Array(36).fill(80) } })
  frame[key].status = 'online'
  frame[key].forceArr.fill(999)
  const pressureAverage = frame[key].pressureSummary.avgKpa
  const total = pressureAverage * frame[key].areaCm2 * 0.1
  for (const mode of ['adc', 'pressure', 'force']) {
    store.pressureMetricMode = mode
    const data = {}
    select([])
    hook.processSensorFrame(frame, data)
    assert.equal(data.leftHand.data.areaCm2, frame[key].areaCm2)
    assert.equal(data.leftHand.data.total, total)
    assert.equal(data.leftHand.data.pressureAver, pressureAverage.toFixed(2))
    assert.equal(data.leftHand.pressArr[0], Number(total.toFixed(1)))
    assert.equal(data.leftHand.forceArr[0], Number(total.toFixed(1)))
    for (const field of ['areaArr', 'adcAreaArr', 'pressureAreaArr', 'forceAreaArr']) {
      assert.equal(data.leftHand[field][0] * 1.5625, frame[key].areaCm2)
    }
    select([{ matrixKey: key, rect: { xStart: 0, xEnd: 1, yStart: 0, yEnd: 1 } }])
    const selected = {}
    hook.processSensorFrame(frame, selected)
    assert.equal(selected.leftHand.data.areaCm2, frame[key].areaValuesCm2[0])
    assert.equal(selected.leftHand.boxStats[0].data.areaCm2, frame[key].areaValuesCm2[0])
    assert.equal(selected.leftHand.boxStats[0].areaArr[0], 1)
    const selectedForce = 0 // The reference rejects a one-cell cropped contact.
    assert.equal(selected.leftHand.data.total, selectedForce)
    assert.equal(selected.leftHand.boxStats[0].data.total, selectedForce)
  }
})

test('realtime area panel distinguishes missing raw ADC from a measured empty frame', async () => {
  const { hook } = await realtimeHarness()
  const key = 'endi-leftHand'
  const empty = processFrame({ [key]: { arr: new Array(36).fill(0) } })
  empty[key].status = 'online'
  const known = {}
  hook.processSensorFrame(empty, known)
  assert.equal(known.leftHand.data.areaCm2, 0)
  assert.equal(known.leftHand.data.total, 0)
  assert.equal(known.leftHand.forceArr[0], 0)
  const unknown = {}
  hook.processSensorFrame({ [key]: {
    arr: new Array(144).fill(0), pressureArr: new Array(144).fill(1), forceArr: new Array(144).fill(0.2),
    processing: { importedMetric: true }, status: 'online',
  } }, unknown)
  assert.equal(unknown.leftHand.data.areaCm2, null)
  assert.equal(unknown.leftHand.areaArr[0], null)
  assert.equal(unknown.leftHand.data.total, null)
  assert.equal(unknown.leftHand.forceArr[0], null)
})

test('stale ADC preferences keep the pressure display and leave calibrated statistics unchanged', async () => {
  const { hook, store } = await realtimeHarness()
  const key = 'endi-leftHand'
  const frame = processFrame({ [key]: { arr: new Array(36).fill(80), status: 'online' } })
  const original = structuredClone(frame)
  store.pressureMetricMode = 'pressure'
  let firstStats
  for (const visualDataMode of ['adc', 'pressure', 'adc']) {
    store.visualDataMode = visualDataMode
    const data = {}
    hook.processSensorFrame(frame, data)
    const stats = JSON.parse(JSON.stringify(data))
    if (!firstStats) firstStats = stats
    assert.deepEqual(stats, firstStats)
    const expected = hook.renderedMetricDataRef.current.pressure
    assert.equal(hook.disPlayDataRef.current, expected)
    assert.equal(store.pressureMetricMode, 'pressure')
  }
  assert.deepEqual(frame, original)
})

test('whole and selected realtime forces use each scope mean pressure and area rather than retained-cell weighting', async () => {
  const { hook, select } = await realtimeHarness()
  const key = 'endi-leftHand'
  const item = {
    arr: new Array(144).fill(0), rawAdcArr: new Array(144).fill(0),
    pressureArr: new Array(144).fill(0), forceArr: new Array(144).fill(999),
    areaValuesCm2: new Array(144).fill(0), areaCm2: 10, status: 'online',
    processing: { importedMetric: true },
  }
  item.arr[0] = item.rawAdcArr[0] = 10
  item.arr[1] = item.rawAdcArr[1] = 20
  item.pressureArr[0] = 1
  item.pressureArr[1] = 9
  item.areaValuesCm2[1] = 10
  const before = structuredClone(item)
  const whole = {}
  hook.processSensorFrame({ [key]: item }, whole)
  assert.equal(whole.leftHand.data.pressureAver, '5.0')
  assert.equal(whole.leftHand.data.areaCm2, 10)
  assert.equal(whole.leftHand.data.total, 5)
  select([
    { matrixKey: key, rect: { xStart: 0, xEnd: 1, yStart: 0, yEnd: 1 } },
    { matrixKey: key, rect: { xStart: 1, xEnd: 2, yStart: 0, yEnd: 1 } },
  ])
  const selected = {}
  hook.processSensorFrame({ [key]: item }, selected)
  assert.equal(selected.leftHand.boxStats[0].data.total, 0)
  assert.equal(selected.leftHand.boxStats[1].data.total, 9)
  assert.deepEqual(item, before)
})
