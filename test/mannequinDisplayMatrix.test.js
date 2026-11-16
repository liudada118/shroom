const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const { pathToFileURL } = require('node:url')
const load = file => import(pathToFileURL(path.resolve(__dirname, file)).href)
const modulePromise = load('../client/src/util/mannequinDisplayMatrix.js')

test('3D reads wide thigh columns and interpolated peaks from the actual expanded 2D layout', async () => {
  const { getMannequinDisplayRegions } = await modulePromise
  const foot = new Array(1536).fill(0)
  // Explicit canonical cells, including both old omitted columns and an interpolation cell.
  foot[18 * 24 + 10] = 64.4
  foot[18 * 24 + 8] = 60.4
  foot[19 * 24 + 9] = 73.7
  foot[18 * 24 + 12] = 46.4
  const before = [...foot]
  const regions = getMannequinDisplayRegions({ foot })
  const left = regions.find(r => r.canvasId === 'right-leg')
  const right = regions.find(r => r.canvasId === 'left-leg')
  assert.deepEqual([left.width, left.height], [24, 128])
  assert.equal(left.values[36 * 24 + 2], 64.4)
  assert.equal(left.values[37 * 24 + 3], 64.4)
  assert.equal(left.values[36 * 24 + 6], 60.4)
  assert.equal(left.values[38 * 24 + 4], 73.7)
  assert.equal(right.values[36 * 24 + 22], 46.4)
  assert.equal(Math.max(...left.values), 73.7)
  assert.equal(Math.max(...right.values), 46.4)
  assert.deepEqual(foot, before)
})

test('row-specific leg placement preserves narrow, wide, transition and lower-leg direction', async () => {
  const { getMannequinDisplayRegions } = await modulePromise
  const foot = Array.from({ length: 1536 }, (_, i) => (Math.floor(i / 24) + i % 24 / 10))
  const { values: left } = getMannequinDisplayRegions({ foot }).find(r => r.canvasId === 'right-leg')
  // Upper: 8 canonical columns reversed, each repeated 3 times.
  assert.equal(left[0], 0.7)
  assert.equal(left[2], 0.7)
  assert.equal(left[3], 0.6)
  // Wide: all 12 canonical columns reversed, each repeated twice.
  assert.equal(left[32 * 24], 17.1)
  assert.equal(left[32 * 24 + 23], 16)
  // Transition row 25 has a 21-cell span; its inner blank is still blank.
  assert.equal(left[50 * 24 + 20], 25)
  assert.equal(left[50 * 24 + 21], 0)
  assert.equal(left[64 * 24 + 15], 32)
  assert.equal(left[64 * 24 + 16], 0)
})

test('combined, split, typed and nested pressure matrices share one full display layout', async () => {
  const { getMannequinDisplayRegions } = await modulePromise
  const foot = Array.from({ length: 1536 }, (_, i) => i % 100 / 10)
  const left = [], right = []
  for (let row = 0; row < 64; row++) {
    left.push(...foot.slice(row * 24, row * 24 + 12))
    right.push(...foot.slice(row * 24 + 12, row * 24 + 24))
  }
  const legs = frame => getMannequinDisplayRegions(frame).filter(r => r.canvasId.endsWith('-leg'))
  const expected = legs({ foot })
  assert.deepEqual(legs({ leftFoot: left, rightFoot: right }), expected)
  assert.deepEqual(legs({ 'endi-foot': { pressureValuesKpa: foot, pressureArr: foot.map(() => 999) } }), expected)
  assert.deepEqual(legs({ foot: { sourcePrecisePressureMatrices: { 'endi-leftFoot': left, 'endi-rightFoot': right } } }), expected)
  assert.deepEqual(legs({ foot: new Float64Array(foot) }), expected)
  const authoritative = legs({ foot, leftFoot: left.map(() => 999), rightFoot: right.map(() => 999) })
  assert.deepEqual(authoritative, expected, 'combined 2D data wins over stale side arrays')
})

test('all six matrices share numeric rounding/filtering and preserve canonical pressure data', async () => {
  const { getMannequinDisplayRegions, preparePressureDisplayValues } = await modulePromise
  const input = [0, -1, NaN, Infinity, 1.24, 1.26, 200, 0.049]
  assert.deepEqual(preparePressureDisplayValues(input, input.length, 1.2), [0, 0, 0, 0, 1.2, 1.3, 102.3, 0])
  const jacket = new Array(1296).fill(0), leftHand = new Array(144).fill(0)
  jacket[3] = 12.34
  jacket[10 * 24 + 23] = 45.67
  leftHand[143] = 7.89
  const frame = { jacket, leftHand }
  const original = structuredClone(frame)
  const regions = getMannequinDisplayRegions(frame)
  assert.deepEqual(regions.map(r => [r.canvasId, r.width, r.height]), [
    ['head', 18, 10], ['back', 24, 44], ['left-arm', 36, 4], ['right-arm', 36, 4],
    ['left-leg', 24, 128], ['right-leg', 24, 128],
  ])
  assert.equal(regions[0].values[0], 12.3)
  assert.equal(regions[1].values[23], 45.7)
  assert.equal(regions[2].values[143], 7.9)
  assert.ok(regions[3].values.every(value => value === 0))
  assert.deepEqual(frame, original)
})

test('3D matrix colors are normalized once; independent per-region auto does not alter source values', async () => {
  const { normalizeMannequinDisplayRegions } = await modulePromise
  const input = [{ canvasId: 'left-leg', values: [0, 5, 10], width: 3, height: 1 },
    { canvasId: 'right-leg', values: [0, 1, 2], width: 3, height: 1 }]
  const original = structuredClone(input)
  const manual = normalizeMannequinDisplayRegions(input, { color: 20, autoColor: 0 })
  assert.deepEqual(manual.map(r => r.values), [[0, 0.25, 0.5], [0, 0.05, 0.1]])
  const automatic = normalizeMannequinDisplayRegions(input, { color: 20, autoColor: 1 })
  assert.deepEqual(automatic.map(r => r.values), [[0, 0.5, 1], [0, 0.5, 1]])
  assert.deepEqual(input, original)
})

test('matrix coordinates retain corrected arm directions, leg identity and archived world coordinates', async () => {
  const { alignMannequinMatrixCoordinates } = await modulePromise
  const { buildMannequinSensorLayout } = await load('../client/src/util/mannequinSensorLayout.js')
  const archive = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../client/public/model/mannequin_sensor_layout_637.json'), 'utf8'))
  const original = buildMannequinSensorLayout(archive)
  const aligned = alignMannequinMatrixCoordinates(original)
  for (const id of ['head', 'back', 'left-arm', 'right-arm', 'left-leg', 'right-leg']) {
    const points = aligned.filter(p => p.canvasId === id)
    const first = points.find(p => p.row === 1 && p.col === 1)
    const last = points.find(p => p.row === Math.max(...points.map(p => p.row)) && p.col === Math.max(...points.map(p => p.col)))
    assert.deepEqual([first.matrixU, first.matrixV], id.endsWith('-arm') ? [1, 1] : [0, 0])
    assert.deepEqual([last.matrixU, last.matrixV], id.endsWith('-arm') ? [0, 0] : [1, 1])
  }
  for (let i = 0; i < original.length; i++) {
    assert.deepEqual([aligned[i].x, aligned[i].y, aligned[i].z, aligned[i].sourceKey], [original[i].x, original[i].y, original[i].z, original[i].sourceKey])
    assert.equal(original[i].matrixU, undefined)
  }
})
