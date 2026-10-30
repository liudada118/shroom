const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const fixture = require('./fixtures/dummyPressureStatisticsV2.10.34.json')
const formula = require('../server/kpa/dummyPressure.v2.10.34')
const { createDummyPressureStatistics, getPressureValues } = require('../util/dummyPressureStatistics')

// Expected results were computed from the supplied backup TypeScript, not from
// this project's formula. The original Downloads folder is unnecessary at test time.
function matrix(value) {
  if (Array.isArray(value)) return value.map(row => [...row])
  const result = Array.from({ length: value.rows }, () => new Array(value.cols).fill(0))
  for (const [row, col, adc] of value.cells) result[row][col] = adc
  return result
}

function sample(name) {
  return fixture.cases.find(item => item.name === name)
}

function close(actual, expected, label = '') {
  assert.ok(Math.abs(actual - expected) <= 1e-11 * Math.max(1, Math.abs(expected)), `${label}: ${actual} != ${expected}`)
}

function assertPressure(actual, expected) {
  for (const field of ['avgKpa', 'maxKpa', 'nonZeroCount', 'mode', 'allocationMode']) assert.equal(actual[field], expected[field], field)
  close(actual.pressureSumKpa, expected.pressureSumKpa, 'pressureSumKpa')
  close(actual.targetAvgKpaRaw, expected.targetAvgKpaRaw, 'targetAvgKpaRaw')
}

function compareValues(actual, expected) {
  assert.equal(actual.length, expected.length)
  actual.forEach((value, index) => close(value, expected[index], `point ${index}`))
}

function isolatedProcessor(t, config = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'shroom-reference-statistics-'))
  const previous = process.env.PRESSURE_CONFIG_PATH
  const configPath = path.join(directory, 'pressure_config.json')
  process.env.PRESSURE_CONFIG_PATH = configPath
  fs.writeFileSync(configPath, JSON.stringify({ dummyPressureFormulaFile: 'dummyPressure.v2.10.34.js', ...config }))
  t.after(() => {
    if (previous === undefined) delete process.env.PRESSURE_CONFIG_PATH
    else process.env.PRESSURE_CONFIG_PATH = previous
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()))
    assert.ok(path.basename(directory).startsWith('shroom-reference-statistics-'))
    fs.rmSync(directory, { recursive: true, force: true })
  })
  return { ...require('../util/pressureFrameProcessor'), configPath }
}

test('reference prepared entry reproduces screenshot, arbitrary crops, masks, rounding and scaling', () => {
  for (const item of fixture.cases) {
    const input = matrix(item.matrix)
    const actual = formula.calculateDummyPreparedPressureFrame(input, item.sensorType || fixture.sensorType, item.mask || null, item.options)
    assertPressure(actual, item.expected)
    assert.deepEqual(actual.preparedAdcMatrix, matrix(item.expectedPrepared), item.name)
    assert.equal(actual.rows, input.length)
    assert.equal(actual.cols, input[0].length)
    assert.equal(actual.interpolationApplied, false)
    assert.equal(actual.interpolationFactor, 1)
    compareValues(actual.pressureMatrixKpa.flat(), matrix(item.expected.pressureMatrixKpa).flat())
  }
})

test('physical and prepared screenshot statistics are distinct reference calculations', () => {
  const physical = sample('screenshot raw main contact physical').expected
  const prepared = sample('screenshot prepared main contact').expected
  assert.equal(physical.avgKpa, 9.07)
  assert.equal(physical.maxKpa, 17.48)
  assert.equal(physical.nonZeroCount, 16)
  assert.equal(prepared.avgKpa, 10.86)
  assert.equal(prepared.maxKpa, 30.06)
  assert.equal(prepared.nonZeroCount, 77)
  // These are two representations, not two pressure units: kPa / 10 = N/cm².
  assert.equal(physical.avgKpa / 10, 0.907)
  close(prepared.avgKpa / 10, 1.086)
})

function embeddedItem(item) {
  const source = matrix(item.matrix)
  const raw = Array.from({ length: 54 }, () => new Array(24).fill(0))
  source.forEach((row, y) => row.forEach((value, x) => { raw[20 + y][5 + x] = value }))
  const result = formula.calculateDummyPreparedPressureFrame(raw, fixture.sensorType)
  const precise = result.pressureMatrixKpa.flat()
  return {
    arr: raw.flat(), rawAdcArr: raw.flat(), pressureSummary: result,
    pressureValuesKpa: precise,
    pressureArr: precise.map(value => Math.round((value + Number.EPSILON) * 10) / 10),
    processing: { dummyAdcThreshold: 0, dummyResultScale: 1 },
  }
}

test('selected pressure is recalculated from cropped ADC rather than sampled from a whole-frame pressure map', () => {
  const item = embeddedItem(sample('screenshot prepared main contact'))
  let loads = 0
  const statistics = createDummyPressureStatistics(() => { loads++; return formula })
  const full = statistics.getDummyPressureResult('endi-jacket', item)
  assertPressure(full, sample('screenshot prepared main contact').expected)
  assert.equal(loads, 0)
  const selection = { xStart: 9, xEnd: 14, yStart: 22, yEnd: 28 }
  const selected = statistics.getDummyPressureResult('jacket', item, selection)
  const expected = sample('selected right side of screenshot contact').expected
  assertPressure(selected, expected)
  compareValues(selected.pressureValuesKpa, matrix(expected.pressureMatrixKpa).flat())
  assert.equal(loads, 1)
  const sampled = []
  for (let row = selection.yStart; row < selection.yEnd; row++) sampled.push(...item.pressureValuesKpa.slice(row * 24 + selection.xStart, row * 24 + selection.xEnd))
  assert.notEqual(Math.round(sampled.reduce((sum, value) => sum + value, 0) / sampled.length * 100) / 100, expected.avgKpa)
})

test('tiny positive point pressures retain the reference count despite the legacy one-decimal array', () => {
  const item = embeddedItem(sample('tiny positive pressures survive metric rounding'))
  const result = createDummyPressureStatistics(formula).getDummyPressureResult('endi-jacket', item)
  assert.equal(result.nonZeroCount, 3)
  assert.equal(item.pressureArr.filter(value => value > 0).length, 1)
  assert.equal(result.pressureValuesKpa.filter(value => value > 0).length, 3)
  assert.equal(result.avgKpa, 3.54)
  assert.strictEqual(getPressureValues(item), item.pressureValuesKpa)
  const imported = { ...item, processing: { importedMetric: true } }
  assert.strictEqual(getPressureValues(imported), item.pressureArr)
  assert.equal(createDummyPressureStatistics(formula).getDummyPressureResult('endi-jacket', imported), null)
  assert.equal(createDummyPressureStatistics(formula).getDummyPressureResult('endi-jacket', { pressureArr: [1, 2] }), null)
  assert.strictEqual(getPressureValues({ ...item, pressureValuesKpa: [1] }), item.pressureArr)
})

test('processor preserves precise pressure and separate physical/prepared summaries with legacy arrays intact', t => {
  const { processFrame } = isolatedProcessor(t)
  const raw = sample('screenshot raw main contact physical')
  const expected = sample('raw main contact independently interpolated with zero surroundings').expected
  const item = processFrame({ 'endi-jacket': { arr: matrix(raw.matrix).flat() } })['endi-jacket']
  assertPressure(item.pressureSummary, expected)
  assertPressure(item.physicalPressureSummary, raw.expected)
  compareValues(item.pressureValuesKpa, matrix(expected.pressureMatrixKpa).flat())
  assert.deepEqual(item.pressureArr, item.pressureValuesKpa.map(value => Math.round((value + Number.EPSILON) * 10) / 10))
  assert.deepEqual(item.forceArr, item.pressureValuesKpa.map(value => Math.round((value * 0.15625 + Number.EPSILON) * 10) / 10))
  assert.equal(item.physicalAdcStats.sum, 2225)
  assert.equal(item.physicalAdcStats.max, 183)
  assert.equal(item.physicalAdcStats.nonZeroCount, 16)
  assert.equal(item.processing.pressurePrecision, 'float64')
  assert.equal(item.processing.summaryDigits, 2)
  const smoothed = processFrame({ 'endi-jacket': { arr: matrix(raw.matrix).flat() } }, { filter: 4095, gauss: 4, coherent: 10 })['endi-jacket']
  assert.deepEqual(smoothed.pressureSummary, item.pressureSummary)
  assert.deepEqual(smoothed.physicalPressureSummary, item.physicalPressureSummary)
  assert.deepEqual(smoothed.pressureValuesKpa, item.pressureValuesKpa)
})

test('cached one-decimal frames and outdated calibration options are upgraded from retained ADC', t => {
  const { processFrame, ensureProcessedFrame, PROCESSING_VERSION, configPath } = isolatedProcessor(t)
  const raw = sample('screenshot raw main contact physical')
  const key = 'endi-jacket'
  const current = processFrame({ [key]: { arr: matrix(raw.matrix).flat() } })[key]
  for (const scenario of ['old processing version', 'missing precise matrix', 'missing prepared summary', 'missing physical summary']) {
    const old = structuredClone(current)
    if (scenario === 'old processing version') old.processing.version = 'dummy-raw-algorithm-v2.10.34'
    else if (scenario === 'missing precise matrix') delete old.pressureValuesKpa
    else if (scenario === 'missing prepared summary') delete old.pressureSummary
    else delete old.physicalPressureSummary
    old.pressureArr.fill(999)
    const upgraded = ensureProcessedFrame({ [key]: old })[key]
    assert.equal(upgraded.processing.version, PROCESSING_VERSION)
    assert.deepEqual(upgraded.pressureValuesKpa, current.pressureValuesKpa, scenario)
    assert.deepEqual(upgraded.pressureSummary, current.pressureSummary, scenario)
    assert.deepEqual(upgraded.physicalPressureSummary, current.physicalPressureSummary, scenario)
  }
  fs.writeFileSync(configPath, JSON.stringify({ dummyPressureFormulaFile: 'dummyPressure.v2.10.34.js', dummyAdcThreshold: 80, dummyResultScale: 0.8 }))
  const recalibrated = ensureProcessedFrame({ [key]: current })[key]
  assert.equal(recalibrated.processing.dummyAdcThreshold, 80)
  assert.equal(recalibrated.processing.dummyResultScale, 0.8)
  assert.notDeepEqual(recalibrated.pressureSummary, current.pressureSummary)
  assertPressure(recalibrated.pressureSummary, sample('scaled prepared screenshot core').expected)
  assertPressure(recalibrated.physicalPressureSummary, sample('scaled physical screenshot core').expected)
  assert.deepEqual(recalibrated.rawAdcArr, current.rawAdcArr)
  assert.deepEqual(recalibrated.arr, matrix(sample('scaled prepared screenshot core').expectedPrepared).flat())
  assert.notDeepEqual(recalibrated.arr, recalibrated.rawAdcArr)
  assert.deepEqual(recalibrated.areaValuesCm2, current.areaValuesCm2)
  assert.equal(recalibrated.areaCm2, current.areaCm2)
})

test('combined legs preserve precise independent sources and refit each selected leg before combining', t => {
  const { processFrame } = isolatedProcessor(t)
  const cases = fixture.combinedLegs
  const sources = Object.fromEntries(cases.map(item => [`endi-${item.side}Foot`, matrix(item.raw).flat()]))
  const combined = processFrame({ 'endi-foot': {
    arr: new Array(24 * 64).fill(0), sourcePhysicalAdcMatrices: sources,
  } })['endi-foot']
  const rowCombined = (field) => {
    const left = matrix(cases[0][field]).flat()
    const right = matrix(cases[1][field]).flat()
    return Array.from({ length: 64 }, (_, row) => [
      ...left.slice(row * 12, row * 12 + 12), ...right.slice(row * 12, row * 12 + 12),
    ]).flat()
  }
  for (const item of cases) {
    const key = `endi-${item.side}Foot`
    assertPressure(combined.sourcePressureSummaries[key], item.expected)
    assertPressure(combined.sourcePhysicalPressureSummaries[key], item.physicalExpected)
    compareValues(combined.sourcePrecisePressureMatrices[key], matrix(item.expected.pressureMatrixKpa).flat())
  }
  assert.deepEqual(combined.rawAdcArr, rowCombined('prepared'))
  const pressureSum = cases.reduce((sum, item) => sum + item.expected.pressureSumKpa, 0)
  const count = cases.reduce((sum, item) => sum + item.expected.nonZeroCount, 0)
  close(combined.pressureSummary.pressureSumKpa, pressureSum)
  assert.equal(combined.pressureSummary.nonZeroCount, count)
  assert.equal(combined.pressureSummary.avgKpa, Number((pressureSum / count).toFixed(2)))
  const selection = { xStart: 10, xEnd: 14, yStart: 19, yEnd: 26 }
  const selected = createDummyPressureStatistics(formula).getDummyPressureResult('endi-foot', combined, selection)
  const selectedSum = cases.reduce((sum, item) => sum + item.selectionExpected.pressureSumKpa, 0)
  const selectedCount = cases.reduce((sum, item) => sum + item.selectionExpected.nonZeroCount, 0)
  assert.equal(selected.nonZeroCount, selectedCount)
  close(selected.pressureSumKpa, selectedSum)
  assert.equal(selected.avgKpa, Number((selectedSum / selectedCount).toFixed(2)))
  assert.equal(selected.maxKpa, Math.max(...cases.map(item => item.selectionExpected.maxKpa)))
  compareValues(selected.pressureValuesKpa, cases[0].selectionExpected.pressureMatrixKpa.flatMap((row, index) => [
    ...row, ...cases[1].selectionExpected.pressureMatrixKpa[index],
  ]))
})

test('a whole jacket selection is identical to the canonical summary despite centered head display coordinates', t => {
  const { processFrame } = isolatedProcessor(t)
  const sample = fixture.jacketDisplayGeometry
  const item = processFrame({ 'endi-jacket': { arr: matrix(sample.raw).flat() } })['endi-jacket']
  assertPressure(item.pressureSummary, sample.fullExpected)
  assert.equal(item.pressureSummary.avgKpa, 1.68)
  assert.equal(item.pressureSummary.nonZeroCount, 69)
  const statistics = createDummyPressureStatistics(() => {
    assert.fail('a complete selection must reuse the canonical sensor-coordinate calculation')
  })
  const full = statistics.getDummyPressureResult('endi-jacket', item)
  const selected = statistics.getDummyPressureResult('endi-jacket', item, { xStart: 0, xEnd: 24, yStart: 0, yEnd: 54 })
  assert.deepEqual(selected, full)
  assert.strictEqual(selected.pressureValuesKpa, item.pressureValuesKpa)
})

test('jacket selections across the neck preserve sensor adjacency and return pressures in displayed row-major order', t => {
  const { processFrame } = isolatedProcessor(t)
  const sample = fixture.jacketDisplayGeometry
  const item = processFrame({ 'endi-jacket': { arr: matrix(sample.raw).flat() } })['endi-jacket']
  const selected = createDummyPressureStatistics(formula).getDummyPressureResult('endi-jacket', item, sample.selection)
  assertPressure(selected, sample.selectionExpected)
  assert.equal(selected.avgKpa, 1.75)
  assert.equal(selected.nonZeroCount, 8)
  assert.equal(selected.rows, 8)
  assert.equal(selected.cols, 19)
  assert.deepEqual(selected.pressureMatrixKpa, matrix(sample.selectionDisplayPressure))
  compareValues(selected.pressureValuesKpa, matrix(sample.selectionDisplayPressure).flat())
})
