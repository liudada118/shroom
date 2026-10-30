const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const test = require('node:test')
const fixture = require('./fixtures/dummyPressureMasterV2.10.34.json')
const regionFixture = require('./fixtures/dummyPressureRegionsV2.10.34.json')
const pressure = require('../server/kpa/dummyPressure.v2.10.34.js')

// The offline fixture was evaluated from the supplied backup TypeScript, never
// from the production module. No test requires the original Downloads folder.
const round = value => Math.round((value + Number.EPSILON) * 100) / 100
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) <= 1e-11 * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`)

test('master provenance and all calibration parameters match the independent backup fixture', () => {
  assert.equal(pressure.MASTER_SOURCE_VERSION, fixture.sourceVersion)
  assert.equal(pressure.CALIBRATION_VERSION, fixture.sourceVersion)
  assert.equal(pressure.MASTER_SOURCE_SHA256, fixture.sourceSha256)
  assert.equal(pressure.RULE_VERSION, fixture.ruleVersion)
  assert.equal(pressure.VERSION, '2.10.34')
  assert.equal(pressure.RULE_SCOPE, 'contact-region')
  assert.equal(pressure.CONTACT_SPLIT_SOURCE_VERSION, regionFixture.sourceVersion)
  for (const curve of Object.values(fixture.curves)) {
    const { slopes, ...actual } = pressure[curve.configName]
    assert.deepEqual(actual, curve.config)
  }
})

test('raw and rounded master values match the backup at anchors, interval interiors and extrapolation boundaries', () => {
  for (const [name, curve] of Object.entries(fixture.curves)) {
    for (const [adc, expectedRaw, expectedRounded] of curve.samples) {
      assert.equal(pressure[`${name}AdcToKpaRaw`](adc), expectedRaw, `${name} raw ADC=${adc}`)
      assert.equal(pressure[`${name}AdcToKpa`](adc), expectedRounded, `${name} rounded ADC=${adc}`)
    }
    for (const adc of [NaN, Infinity, -Infinity]) assert.equal(pressure[`${name}AdcToKpaRaw`](adc), 0)
  }
})

test('generic master model branches, two-node PCHIP and empty PCHIP match backup evaluation', () => {
  for (const model of fixture.genericModels) {
    for (const [adc, expected] of model.samples) assert.equal(pressure.adcToDummyKpa(adc, model.config), expected)
  }
})

test('all four sensors reject one/two-cell contacts and retain regional Top50 beyond 100 cells', () => {
  for (const type of ['dummy-body-27x12', 'dummy-sleeve-2x18', 'dummy-left-leg-32x6', 'dummy-right-leg-32x6']) {
    const master = type.includes('body') ? pressure.bodyAdcToKpaRaw : type.includes('sleeve') ? pressure.sleeveAdcToKpaRaw : pressure.legAdcToKpaRaw
    for (const count of [1, 2, 3, 99, 100, 150]) {
      const result = pressure.calculateDummyValuesPressure(new Array(count).fill(120), type)
      assert.equal(result.mode, count < 3 ? 'none' : 'region_top50', `${type} N=${count}`)
      if (count < 3) assert.equal(result.avgKpa, null)
      else assert.equal(result.avgKpa, round(master(120)))
    }
  }
  const threshold = pressure.calculateDummyValuesPressure([0, 30, 30.00001], 'dummy-sleeve-2x18')
  assert.equal(threshold.nonZeroCount, 0)
})

function evaluateRegionCase(sample) {
  const matrix = Array.from({ length: sample.rows }, () => new Array(sample.cols).fill(0))
  const validMask = Array.from({ length: sample.rows }, () => new Array(sample.cols).fill(true))
  for (const [row, col, adc] of sample.cells) matrix[row][col] = adc
  for (const [row, col] of sample.maskedCells) validMask[row][col] = false
  return sample.inputMode === 'physical'
    ? pressure.calculateDummyRawPressureFrame(matrix, sample.sensorType, validMask)
    : pressure.calculateDummyInterpolatedPressureFrame(matrix, sample.sensorType, validMask)
}

function assertRegionCase(sample) {
  const actual = evaluateRegionCase(sample)
  const label = `${sample.sensorType} ${sample.name}`
  for (const [key, expected] of Object.entries(sample.expected)) {
    if (['regions', 'outputRows', 'outputCols', 'pressureMatrixSha256'].includes(key)) continue
    if (typeof expected === 'number') close(actual[key], expected)
    else assert.equal(actual[key], expected, `${label} ${key}`)
  }
  assert.equal(actual.regions.length, sample.expected.regions.length, label)
  sample.expected.regions.forEach((region, index) => {
    for (const [key, expected] of Object.entries(region)) close(actual.regions[index][key], expected)
  })
  assert.equal(actual.pressureMatrixKpa.length, sample.expected.outputRows, label)
  assert.equal(actual.pressureMatrixKpa[0].length, sample.expected.outputCols, label)
  const values = actual.pressureMatrixKpa.flat().map(value => Number(value.toFixed(regionFixture.pressureMatrixHashDigits)))
  assert.equal(crypto.createHash('sha256').update(JSON.stringify(values)).digest('hex'), sample.expected.pressureMatrixSha256, label)
  return actual
}

test('raw single/double contacts and pre-interpolation masks match the frozen backup oracle for all sensors', () => {
  for (const sample of regionFixture.cases.filter(sample => sample.inputMode === 'physical')) assertRegionCase(sample)
  for (const sensorType of pressure.DUMMY_SENSOR_TYPES) {
    const single = evaluateRegionCase(regionFixture.cases.find(sample => sample.sensorType === sensorType && sample.name === 'raw single contact'))
    const double = evaluateRegionCase(regionFixture.cases.find(sample => sample.sensorType === sensorType && sample.name === 'raw two equal contacts'))
    close(double.targetAvgKpaRaw, single.targetAvgKpaRaw)
    assert.equal(double.nonZeroCount, single.nonZeroCount * 2)
  }
})

test('prepared sparse, dense and disconnected contacts match the backup regional outputs without x2', () => {
  for (const sample of regionFixture.cases.filter(sample => sample.inputMode === 'prepared' && !sample.name.includes('touching'))) assertRegionCase(sample)
})

test('touching peaks and their rotation reproduce the independent backup split and pressure allocation', () => {
  const samples = regionFixture.cases.filter(sample => sample.name.includes('touching'))
  assert.equal(samples.length, 2)
  const outputs = samples.map(assertRegionCase)
  assert.equal(outputs[0].regions.length, 2)
  close(outputs[0].targetAvgKpaRaw, outputs[1].targetAvgKpaRaw)
  assert.deepEqual(outputs[0].regions.map(region => region.nonZeroCount).sort((a, b) => a - b), [63, 70])
})

test('V2.10.34 preserves the V2.10.28 public functions, result fields, matrix shapes and flat point ordering', () => {
  const legacy = require('../server/kpa/dummyPressure.v2.10.28.js')
  for (const [name, value] of Object.entries(legacy)) {
    if (typeof value === 'function') assert.equal(typeof pressure[name], 'function', name)
  }
  const sensorType = 'dummy-sleeve-2x18'
  const raw = Array.from({ length: 2 }, () => new Array(18).fill(120))
  const oldRaw = legacy.calculateDummyRawPressureFrame(raw, sensorType)
  const prepared = oldRaw.interpolatedAdcMatrix
  const calls = [
    ['calculateDummyRawPressureFrame', [raw, sensorType]],
    ['calculateDummyInterpolatedPressureFrame', [prepared, sensorType]],
    ['calculateDummyPressureFrame', [raw, sensorType]],
    ['calculateDummyMatrixPressure', [raw, sensorType]],
    ['calculateDummyValuesPressure', [[120, 120, 0, 160, 160, 160, 0, 80, 80], sensorType]],
    ['calibratePressureFrame', [{ adcMatrix: raw, sensorType }]],
  ]
  for (const [name, args] of calls) {
    const expectedFormat = legacy[name](...args)
    const actual = pressure[name](...args)
    for (const key of Object.keys(expectedFormat)) assert.ok(Object.hasOwn(actual, key), `${name}.${key}`)
    if (expectedFormat.pressureMatrixKpa) {
      assert.equal(actual.pressureMatrixKpa.length, expectedFormat.pressureMatrixKpa.length, name)
      assert.deepEqual(actual.pressureMatrixKpa.map(row => row.length), expectedFormat.pressureMatrixKpa.map(row => row.length), name)
    }
  }
  const map = pressure.calculateDummyMatrixPressureMap(raw, sensorType)
  assert.equal(map.length, 4)
  assert.ok(map.every(row => row.length === 36))
  const flat = pressure.calculateDummyValuesPressure([120, 120, 0, 160, 160, 160, 0, 80, 80], sensorType).pressureValuesKpa
  assert.equal(flat.length, 7)
  assert.deepEqual(flat.slice(0, 2), [0, 0])
  assert.ok(flat.slice(2, 5).every(value => value > 0))
  assert.deepEqual(flat.slice(5), [0, 0])
})

function isolatedProcessor(t) {
  // Isolate pressure configuration so even a clean checkout never creates a
  // config file in the user's db directory. This case opens no database.
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'shroom-master-alignment-'))
  const previous = process.env.PRESSURE_CONFIG_PATH
  process.env.PRESSURE_CONFIG_PATH = path.join(directory, 'pressure_config.json')
  fs.writeFileSync(process.env.PRESSURE_CONFIG_PATH, JSON.stringify({ dummyPressureFormulaFile: 'dummyPressure.v2.10.34.js' }))
  t.after(() => {
    if (previous === undefined) delete process.env.PRESSURE_CONFIG_PATH
    else process.env.PRESSURE_CONFIG_PATH = previous
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()))
    assert.ok(path.basename(directory).startsWith('shroom-master-alignment-'))
    fs.rmSync(directory, { recursive: true, force: true })
  })
  return require('../util/pressureFrameProcessor')
}

test('processed physical masks match backup pressures with the existing one-decimal output format', t => {
  const { processFrame } = isolatedProcessor(t)
  const sample = regionFixture.cases.find(sample => sample.sensorType === 'dummy-sleeve-2x18' && sample.name === 'raw masked contact')
  const matrix = Array.from({ length: sample.rows }, () => new Array(sample.cols).fill(0))
  const physicalMask = Array.from({ length: sample.rows }, () => new Array(sample.cols).fill(true))
  for (const [row, col, adc] of sample.cells) matrix[row][col] = adc
  for (const [row, col] of sample.maskedCells) physicalMask[row][col] = false
  const key = 'endi-leftHand'
  const item = { arr: matrix.flat(), physicalMask }
  const expected = assertRegionCase(sample)
  const actual = processFrame({ [key]: item })[key]
  const roundDisplay = value => Math.round((value + Number.EPSILON) * 10) / 10
  assert.deepEqual(actual.pressureArr, expected.pressureMatrixKpa.flat().map(roundDisplay))
  assert.deepEqual(actual.forceArr, expected.pressureMatrixKpa.flat().map(value => roundDisplay(value * 0.15625)))
  assert.notDeepEqual(actual.pressureArr, processFrame({ [key]: { arr: item.arr } })[key].pressureArr)
})

test('recorded frames with old master, rule or region metadata are recalibrated while imported pressure stays intact', t => {
  const { processFrame, ensureProcessedFrame } = isolatedProcessor(t)
  const key = 'endi-leftHand'
  const raw = { [key]: { arr: Array.from({ length: 36 }, (_, index) => 65 + index * 3) } }
  const current = processFrame(raw)[key]
  for (const scenario of ['missing master provenance', 'wrong dispatch rules', 'missing dispatch rules', 'missing scope', 'wrong scope', 'missing split version', 'wrong split version']) {
    const old = structuredClone(current)
    if (scenario === 'missing master provenance') {
      delete old.processing.masterSourceSha256
      delete old.processing.masterSourceVersion
    } else if (scenario === 'wrong dispatch rules') old.processing.ruleVersion = 'V2.10.28'
    else if (scenario === 'missing dispatch rules') delete old.processing.ruleVersion
    else if (scenario === 'wrong scope') old.processing.ruleScope = 'whole-frame'
    else if (scenario === 'missing scope') delete old.processing.ruleScope
    else if (scenario === 'wrong split version') old.processing.contactSplitSourceVersion = 'V2.10.28'
    else delete old.processing.contactSplitSourceVersion
    old.pressureArr.fill(9.99)
    const upgraded = ensureProcessedFrame({ [key]: old })[key]
    assert.deepEqual(upgraded.pressureArr, current.pressureArr, scenario)
    assert.deepEqual(upgraded.areaValuesCm2, current.areaValuesCm2, scenario)
    assert.equal(upgraded.areaCm2, current.areaCm2)
    assert.equal(upgraded.processing.masterSourceSha256, fixture.sourceSha256)
    assert.equal(upgraded.processing.masterSourceVersion, fixture.sourceVersion)
    assert.equal(upgraded.processing.ruleVersion, fixture.ruleVersion)
    assert.equal(upgraded.processing.ruleScope, 'contact-region')
    assert.equal(upgraded.processing.contactSplitSourceVersion, regionFixture.sourceVersion)
    assert.notDeepEqual(upgraded.pressureArr, old.pressureArr)
    const imported = { ...old, processing: { ...old.processing, importedMetric: true } }
    assert.deepEqual(ensureProcessedFrame({ [key]: imported })[key], imported)
  }
})
