import test from 'node:test'
import assert from 'node:assert/strict'
import { createThreeDisplayProcessor, getThreeDisplaySettings } from '../client/src/util/threeDisplayProcessing.js'
import { getFullAlgorithmSummary } from '../client/src/util/fullAlgorithmMetrics.js'
import { getPressureMetricPointValues } from '../client/src/util/pressureMetrics.js'
import { buildPressureDisplayMetricMatrix } from '../client/src/util/pressureDisplayMatrix.js'

function store(overrides = {}) {
  return {
    systemType: 'endi', pressureMetricMode: 'force', threeDisplaySource: 'metric',
    threeAdcColor: 255, settingValue: { gauss: 4, filter: 200, coherent: 10, autoColor: 1, height: 80 },
    ...overrides,
  }
}

function frame(values) {
  return {
    adc: { sit: values }, dimensions: { sit: { width: 3, height: 2 } },
    pressure: { sit: values.map(() => 999) }, force: { sit: values.map(() => 888) },
  }
}

test('all display modes and processing settings preserve raw ADC without mutating the source', () => {
  for (const source of ['metric', 'adc']) {
    for (const metric of ['force', 'pressure', 'adc']) {
      for (const setting of [{ gauss: 0, filter: 0, coherent: 1 }, { gauss: 4, filter: 200, coherent: 10 }]) {
        const values = [0, 0.125, 1, 23, 30, 255]
        const input = frame(values)
        const result = createThreeDisplayProcessor()(input, store({ threeDisplaySource: source, pressureMetricMode: metric, settingValue: setting }))
        assert.equal(result.mode, 'adc')
        assert.deepEqual(result.adc.sit, values)
        assert.deepEqual(result.pressure.sit, values)
        assert.deepEqual(result.force.sit, values)
        assert.notEqual(result.adc.sit, values)
        assert.deepEqual(values, [0, 0.125, 1, 23, 30, 255])
      }
    }
  }
})

test('successive ADC frames have no Gaussian or temporal history', () => {
  const process = createThreeDisplayProcessor()
  const config = store()
  const first = [0, 0, 0, 0, 0, 255]
  const second = [1, 0.5, 30, 0, 0, 0]
  assert.deepEqual(process(frame(first), config).adc.sit, first)
  assert.deepEqual(process(frame(second), config).adc.sit, second)
  assert.deepEqual(process(frame(first), config).adc.sit, first)
})

test('missing ADC cannot fall back to pressure or force, and missing samples remain unavailable', () => {
  const process = createThreeDisplayProcessor()
  const noAdc = frame([0, 1, 2, 3, 4, 5])
  delete noAdc.adc
  assert.deepEqual(process(noAdc, store()).adc, {})
  const missing = [null, null, null, null, null, null]
  assert.deepEqual(process(frame(missing), store()).adc.sit, missing)
})

test('2D matrices preserve fractional ADC and ignore metric substitutes, masks and previous frames', () => {
  const values = [0, 0.125, 1, 30, 255]
  for (const mode of ['adc', 'pressure', 'force']) {
    assert.deepEqual(getPressureMetricPointValues(values, 'endi-sit', mode, {
      pressureArr: values.map(() => 999), forceArr: values.map(() => 888),
    }), values)
    const result = buildPressureDisplayMetricMatrix({
      adcValues: values, width: 5, height: 1, matrixKey: 'endi-sit', metricMode: mode,
      settings: { filter: 200, gauss: 4, coherent: 10 },
      previousState: { values: values.map(() => 100), display: values.map(() => 100) },
      isVisibleIndex: () => false,
    })
    assert.deepEqual(result.values, values)
  }
  assert.deepEqual(getPressureMetricPointValues(values, 'endi-sit', 'force', { rawDisplayAvailable: false }), values.map(() => null))
})

test('ADC settings and global physical pressure remain independent of visualization units', () => {
  const settings = getThreeDisplaySettings(store())
  assert.equal(settings.mode, 'adc')
  assert.equal(settings.colorLimit, 255)
  assert.equal(settings.filter, 0)
  assert.equal(settings.gauss, 0)
  assert.equal(settings.coherent, 1)
  assert.equal(settings.autoColor, 0)
  const summary = getFullAlgorithmSummary({ version: '2.11.0', status: 'complete', summary: {
    forceN: 250, areaCm2: 125, averagePressureKPa: 999, maxPressureKPa: 777,
  } })
  assert.equal(summary.forceN, 250)
  assert.equal(summary.areaCm2, 125)
  assert.equal(summary.averagePressureKPa, 20)
  assert.equal(summary.maxPressureKPa, null)
  assert.equal(getFullAlgorithmSummary({ version: '2.11.0', status: 'complete', summary: { forceN: 0, areaCm2: 0 } }).averagePressureKPa, null)
})
