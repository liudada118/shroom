const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const { pathToFileURL } = require('node:url')

async function createFixture({ sensors: suppliedSensors } = {}) {
  const load = file => import(pathToFileURL(path.resolve(__dirname, file)).href)
  const [THREE, source, layout, renderer] = await Promise.all([
    load('../client/node_modules/three/build/three.module.js'),
    load('../client/src/util/mannequinHeatmapSource.js'),
    load('../client/src/util/mannequinSensorLayout.js'),
    load('../client/src/components/three/mannequinHeatField.js'),
  ])
  const archive = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../client/public/model/mannequin_sensor_layout_637.json'), 'utf8'))
  const sensors = suppliedSensors || layout.buildMannequinSensorLayout(archive)
  return { ...source, ...layout, sensors, field: renderer.createMannequinHeatField(sensors, new THREE.Group()) }
}

function heatAt(field, sensors) {
  return sensors.map(sensor => field.texture.image.data[sensor.index * 4 + 3])
}

test('3D always uses precise pressure at physical and combined-leg cells despite old ADC preferences', async () => {
  const f = await createFixture()
  const point = (canvasId, row = 1) => f.sensors.find(sensor => sensor.canvasId === canvasId && sensor.row === row && sensor.col === 1)
  const selected = [point('head'), point('back'), point('left-leg'), point('left-leg', 2), point('right-leg'), point('right-leg', 2)]
  assert.deepEqual(selected.slice(0, 2).map(sensor => sensor.sourceIndex), [3, 60])
  assert.deepEqual(selected.slice(2).map(sensor => sensor.combinedDisplayIndex), [0, 2, 16, 18])
  const jacket = new Array(27 * 12).fill(0)
  jacket[3] = 9.07321
  jacket[60] = 17.48321
  const foot = new Array(24 * 64).fill(0)
  for (const [index, pressure] of [[0, 4], [2, 8], [16, 1], [18, 2]]) foot[index] = pressure
  const maps = {
    adc: { jacket: jacket.map(value => value * 10), foot: foot.map(value => value * 10) },
    pressure: { jacket, foot }, force: { jacket: new Array(27 * 12).fill(999) },
  }
  const original = structuredClone(maps)
  const texture = f.field.texture
  const readings = [9.07321, 17.48321, 4, 8, 1, 2].map(Math.fround)
  for (const visualDataMode of [undefined, 'adc', 'pressure', 'force', 'unknown']) {
    for (const heatmapUsePressure of [undefined, 0, 1, '1']) {
      const options = Object.freeze({ color: 20, filter: 0, adcColor: 600, adcFilter: 255, autoColor: 0, visualDataMode, heatmapUsePressure })
      assert.equal(f.getMannequinHeatmapMode(options), 'pressure')
      const frame = f.getMannequinHeatmapFrame(maps, options)
      assert.equal(frame, maps.pressure)
      const values = f.readMannequinSensorValues(f.sensors, frame)
      const before = values.slice()
      assert.deepEqual(selected.map(sensor => values[sensor.index]), readings)
      f.field.update(values, f.getMannequinHeatmapRenderSettings(options))
      assert.deepEqual(heatAt(f.field, selected), readings.map(value => Math.fround(value / 20)))
      assert.equal(f.field.stats.activeCount, 6)
      assert.equal(f.field.texture, texture)
      assert.deepEqual(values, before)
    }
  }
  assert.deepEqual(maps, original)
  f.field.dispose()
})

test('old ADC color and noise settings cannot override calibrated-pressure rendering', async () => {
  const f = await createFixture()
  const sensor = f.sensors.find(point => point.canvasId === 'head' && point.row === 1 && point.col === 1)
  const jacket = new Array(27 * 12).fill(0)
  jacket[sensor.sourceIndex] = 9.07321
  const settings = Object.freeze({ color: 20, filter: 1, adcColor: 1000, adcFilter: 1000, autoColor: 0, visualDataMode: 'adc' })
  const options = f.getMannequinHeatmapRenderSettings(settings)
  assert.equal(options.visualDataMode, 'pressure')
  assert.equal(options.color, 20)
  assert.equal(options.filter, 1)
  assert.equal(options.autoColorReference, 20)
  const values = f.readMannequinSensorValues(f.sensors, f.getMannequinHeatmapFrame({ pressure: { jacket } }, settings))
  f.field.update(values, options)
  assert.equal(f.field.stats.rangeMax, 20)
  assert.equal(heatAt(f.field, [sensor])[0], Math.fround(Math.fround(9.07321) / 20))
  assert.equal(settings.visualDataMode, 'adc', 'reading old settings does not mutate the caller')
  assert.equal(settings.adcFilter, 1000)
  f.field.dispose()
})

test('missing pressure clears stale heat and never falls back to raw ADC', async () => {
  const f = await createFixture()
  const jacket = new Array(27 * 12).fill(0)
  jacket[3] = 5
  const pressure = { jacket }
  const adc = { jacket: jacket.map(value => value * 20) }
  const settings = { color: 20, filter: 0, autoColor: 0, visualDataMode: 'adc' }
  assert.equal(f.getMannequinHeatmapMode(), 'pressure')
  for (const available of [{ adc }, { adc, pressure: null }, { force: pressure }, undefined]) {
    f.field.update(f.readMannequinSensorValues(f.sensors, f.getMannequinHeatmapFrame({ adc, pressure }, settings)),
      f.getMannequinHeatmapRenderSettings(settings))
    assert.equal(f.field.stats.activeCount, 1)
    const missing = f.getMannequinHeatmapFrame(available, settings)
    assert.deepEqual(missing, {})
    const values = f.readMannequinSensorValues(f.sensors, missing)
    assert.ok(values.every(value => value === 0))
    f.field.update(values, f.getMannequinHeatmapRenderSettings(settings))
    assert.equal(f.field.stats.activeCount, 0)
    assert.ok(f.sensors.every(sensor => f.field.texture.image.data[sensor.index * 4 + 3] === 0))
  }
  f.field.dispose()
})

test('pressure range keeps its 20 kPa neutral reference and each body part automatic adjustment', async () => {
  const sensors = ['head', 'head', 'back', 'back'].map((canvasId, index) => ({ index, canvasId, x: index * 0.1, y: 2, z: 0 }))
  const f = await createFixture({ sensors })
  const settings = Object.freeze({ color: 20, filter: 0, adcColor: 600, adcFilter: 255, autoColor: 1, height: 400, gauss: 1.6, visualDataMode: 'adc' })
  const before = { ...settings }
  for (const [color, filter, expectedColor, expectedFilter] of [
    [undefined, undefined, 20, 0], [0, NaN, 20, 0], [-1, -10, 20, 0],
    [Infinity, Infinity, 20, 0], [20, 1.25, 20, 1.25], [100, 200, 60, 60], [0.001, 0, 0.01, 0],
  ]) {
    const effective = f.getMannequinHeatmapRenderSettings({ ...settings, color, filter })
    assert.equal(effective.color, expectedColor)
    assert.equal(effective.filter, expectedFilter)
    assert.equal(effective.autoColorReference, 20)
  }
  const values = new Float32Array([2, 4, 1, 2])
  const valuesBefore = values.slice()
  const xyz = [...f.field.texture.image.data].filter((_, index) => index % 4 !== 3)
  for (const [color, heat] of [
    [20, [0.5, 1, 0.5, 1]],
    [40, [0.25, 0.5, 0.25, 0.5]],
    [20, [0.5, 1, 0.5, 1]],
  ]) {
    f.field.update(values, f.getMannequinHeatmapRenderSettings({ ...settings, color }))
    assert.deepEqual(heatAt(f.field, sensors), heat)
  }
  for (const [color, range] of [[10, 10], [20, 20], [60, 60], [100, 60]]) {
    f.field.update(values, f.getMannequinHeatmapRenderSettings({ ...settings, autoColor: 0, color }))
    assert.equal(f.field.stats.rangeMax, range)
    assert.deepEqual(heatAt(f.field, sensors), [...values].map(value => Math.fround(value / range)))
  }
  assert.deepEqual([...f.field.texture.image.data].filter((_, index) => index % 4 !== 3), xyz)
  assert.deepEqual(values, valuesBefore)
  assert.deepEqual(settings, before)
  f.field.dispose()
})
