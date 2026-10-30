const assert = require('node:assert/strict')
const test = require('node:test')
const router = require('../server/api/routes')
const { state } = require('../server/state')
const { DUMMY_POINT_AREA_CM2, processFrame } = require('../util/pressureFrameProcessor')

const areaFields = ['areaArr', 'adcAreaArr', 'pressureAreaArr', 'forceAreaArr']
const handler = router.stack.find((layer) => layer.route?.path === '/getDbHistorySelect').route.stack[0].handle

async function selectedHistory(t, frames, selectJson) {
  const previousRows = state.historyDbArr
  const previousSelection = state.historySelectCache
  state.historyDbArr = frames.map((frame, index) => ({ data: JSON.stringify(frame), timestamp: index * 100 }))
  try {
    const response = await new Promise((resolve, reject) => handler(
      { body: { selectJson }, query: {} },
      { json: resolve },
      reject,
    ))
    assert.equal(response.code, 0)
    return response.data
  } finally {
    state.historyDbArr = previousRows
    state.historySelectCache = previousSelection
  }
}

test('history selection handler uses fitted cells for single-cell and whole-region area', async (t) => {
  const frame = processFrame({ 'endi-leftHand': { arr: new Array(36).fill(80) } })
  const item = frame['endi-leftHand']
  item.forceArr.fill(999)
  const oneCell = await selectedHistory(t, [frame], {
    'endi-leftHand': { xStart: 0, xEnd: 1, yStart: 0, yEnd: 1, width: 36 },
  })
  assert.equal(item.areaValuesCm2[0], DUMMY_POINT_AREA_CM2)
  for (const field of areaFields) assert.deepEqual(oneCell[field]['endi-leftHand'], [1])
  // The backup refits selected ADC; an isolated one-cell crop is not a valid
  // pressure contact. Area still uses the retained full-frame area cells.
  assert.deepEqual(oneCell.pressureArr['endi-leftHand'], [0])
  assert.deepEqual(oneCell.forceArr['endi-leftHand'], [0])

  const whole = await selectedHistory(t, [frame], {
    'endi-leftHand': { xStart: 0, xEnd: 36, yStart: 0, yEnd: 4, width: 36 },
  })
  for (const field of areaFields) {
    assert.deepEqual(whole[field]['endi-leftHand'], [item.areaCm2 / DUMMY_POINT_AREA_CM2])
  }
  const average = item.pressureSummary.avgKpa
  assert.deepEqual(whole.forceArr['endi-leftHand'], [average * item.areaCm2 * 0.1])
})

test('history selection handler keeps unknown imported areas null through downsampling', async (t) => {
  const known = processFrame({ 'endi-leftHand': { arr: new Array(36).fill(80) } })
  const imported = { 'endi-leftHand': {
    arr: new Array(144).fill(0),
    pressureArr: new Array(144).fill(10),
    forceArr: new Array(144).fill(1.6),
    processing: { importedMetric: true },
  } }
  const result = await selectedHistory(t, [known, imported, ...new Array(499).fill(known)], {
    'endi-leftHand': { xStart: 0, xEnd: 1, yStart: 0, yEnd: 1, width: 36 },
  })
  for (const field of areaFields) {
    assert.equal(result[field]['endi-leftHand'].length, 251)
    assert.equal(result[field]['endi-leftHand'][0], null)
    assert.equal(result[field]['endi-leftHand'][1], 1)
    assert.equal(result[field]['endi-leftHand'].at(-1), 1)
  }
  assert.equal(result.forceArr['endi-leftHand'][0], null)
  assert.equal(result.pressArr['endi-leftHand'][0], null)
})

test('history selection handler preserves non-dummy point-count areas', async (t) => {
  const frame = { 'endi-sit': { arr: [1, 2, 0, 0], pressureArr: [4, 0, 0, 0], forceArr: [0, 0, 0, 0] } }
  const result = await selectedHistory(t, [frame], {
    'endi-sit': { xStart: 0, xEnd: 2, yStart: 0, yEnd: 2, width: 2 },
  })
  assert.deepEqual(result.adcAreaArr['endi-sit'], [2])
  assert.deepEqual(result.pressureAreaArr['endi-sit'], [1])
  assert.deepEqual(result.forceAreaArr['endi-sit'], [0])
})

test('history selection downsampling averages per-frame mean-pressure area products', async t => {
  const frame = (pressureArr, areaValuesCm2) => ({ 'endi-leftHand': {
    arr: [0, 0], pressureArr, forceArr: [999, 999], areaValuesCm2,
    processing: { importedMetric: true },
  } })
  const first = frame([1, 9], [1.5625, 1.5625])
  const second = frame([9, 9], [1.5625, 0])
  const result = await selectedHistory(t, [first, second, ...new Array(499).fill(first)], {
    'endi-leftHand': { xStart: 0, xEnd: 2, yStart: 0, yEnd: 1, width: 2 },
  })
  assert.equal(result.forceArr['endi-leftHand'].length, 251)
  assert.equal(result.forceArr['endi-leftHand'][0], 1.484375)
  assert.equal(result.forceArr['endi-leftHand'][1], 1.5625)
  assert.notEqual(result.forceArr['endi-leftHand'][0], 7 * 2.34375 * 0.1)
})
