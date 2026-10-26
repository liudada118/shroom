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

test('fixed 3D ADC rendering ignores legacy pressure selection at real physical and combined-leg cells', async () => {
  const f = await createFixture()
  const point = (canvasId, row = 1) => f.sensors.find(sensor => sensor.canvasId === canvasId && sensor.row === row && sensor.col === 1)
  const selected = [point('head'), point('back'), point('left-leg'), point('left-leg', 2), point('right-leg'), point('right-leg', 2)]
  assert.deepEqual(selected.slice(0, 2).map(sensor => sensor.sourceIndex), [3, 60])
  assert.deepEqual(selected.slice(2).map(sensor => sensor.combinedDisplayIndex), [0, 2, 16, 18])
  const adcJacket = new Array(27 * 12).fill(0)
  const pressureJacket = new Array(27 * 12).fill(0)
  adcJacket[3] = 100
  adcJacket[60] = 200
  pressureJacket[3] = 2
  pressureJacket[60] = 5
  const adcFoot = new Array(24 * 64).fill(0)
  const pressureFoot = new Array(24 * 64).fill(0)
  for (const [index, adc, pressure] of [[0, 10, 4], [2, 40, 8], [16, 100, 1], [18, 200, 2]]) {
    adcFoot[index] = adc
    pressureFoot[index] = pressure
  }
  const maps = {
    adc: { jacket: adcJacket, foot: adcFoot },
    pressure: { jacket: pressureJacket, foot: pressureFoot },
    force: { jacket: new Array(27 * 12).fill(999) },
  }
  const original = structuredClone(maps)
  const settings = Object.freeze({ color: 20, filter: 80, adcFilter: 0, autoColor: 0 })
  const texture = f.field.texture
  const readings = [100, 200, 10, 40, 100, 200]
  for (const heatmapUsePressure of [undefined, 0, 1, '1']) {
    const options = { ...settings, heatmapUsePressure }
    assert.equal(f.getMannequinHeatmapMode(options), 'adc')
    const frame = f.getMannequinHeatmapFrame(maps, options)
    assert.equal(frame, maps.adc)
    const values = f.readMannequinSensorValues(f.sensors, frame)
    const valuesBefore = values.slice()
    assert.deepEqual(selected.map(sensor => values[sensor.index]), readings)
    f.field.update(values, f.getMannequinHeatmapRenderSettings(options))
    assert.deepEqual(heatAt(f.field, selected), readings.map(value => Math.fround(value / 600)))
    assert.equal(f.field.stats.activeCount, 6)
    assert.equal(f.field.texture, texture)
    assert.deepEqual(values, valuesBefore)
  }
  assert.deepEqual(maps, original, 'fixed ADC rendering leaves pressure, ADC and force matrices unchanged')
  f.field.dispose()
})

test('missing ADC clears stale heat and never falls back to pressure despite a saved pressure flag', async () => {
  const f = await createFixture()
  const jacket = new Array(27 * 12).fill(0)
  jacket[3] = 100
  const adc = { jacket }
  const pressure = { jacket: jacket.map(value => value / 20) }
  const settings = { color: 20, filter: 0, adcColor: 600, adcFilter: 0, autoColor: 0, heatmapUsePressure: 1 }
  assert.equal(f.getMannequinHeatmapMode(), 'adc')
  assert.equal(f.getMannequinHeatmapMode({ heatmapUsePressure: '1' }), 'adc')
  assert.equal(f.getMannequinHeatmapMode({ heatmapUsePressure: 2 }), 'adc')
  for (const available of [{ pressure }, { adc: null, pressure }, { force: pressure }, undefined]) {
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
  assert.deepEqual(f.getMannequinHeatmapFrame(undefined), {})
  assert.deepEqual(f.getMannequinHeatmapFrame({ adc: null, pressure }, {}), {})
  f.field.dispose()
})

test('ADC settings retain the 600 neutral reference and ignore legacy pressure controls without mutating inputs', async () => {
  const sensors = ['head', 'head', 'back', 'back'].map((canvasId, index) => ({ index, canvasId, x: index * 0.1, y: 2, z: 0 }))
  const f = await createFixture({ sensors })
  const settings = Object.freeze({ color: 20, filter: 1.25, adcColor: 128, adcFilter: 10, autoColor: 1, height: 245.1, gauss: 1.6 })
  const before = { ...settings }
  const adcSettings = f.getMannequinHeatmapRenderSettings(settings)
  assert.equal(adcSettings.color, 128)
  assert.equal(adcSettings.filter, 10)
  assert.equal(adcSettings.autoColorReference, 600)
  const legacySettings = f.getMannequinHeatmapRenderSettings({ ...settings, heatmapUsePressure: 1 })
  assert.equal(legacySettings.color, 128)
  assert.equal(legacySettings.filter, 10)
  assert.equal(legacySettings.autoColorReference, 600)
  for (const effective of [adcSettings, legacySettings]) {
    assert.equal(effective.autoColor, 1)
    assert.equal(effective.height, 245.1)
    assert.equal(effective.gauss, 1.6)
  }
  for (const [adcColor, adcFilter, color, filter] of [
    [undefined, undefined, 600, 0], [0, NaN, 600, 0], [-1, -10, 600, 0],
    [Infinity, Infinity, 600, 0], [300, 600, 300, 600], [600, 300, 600, 300],
    [1000, 1000, 1000, 1000], [1024, 1200, 1000, 1000], [0.001, 0, 0.01, 0],
  ]) {
    const effective = f.getMannequinHeatmapRenderSettings({ ...settings, adcColor, adcFilter })
    assert.equal(effective.color, color)
    assert.equal(effective.filter, filter)
  }
  const adcValues = new Float32Array([64, 128, 127.5, 255])
  const adcBefore = adcValues.slice()
  const xyz = [...f.field.texture.image.data].filter((_, index) => index % 4 !== 3)
  const neutral = { ...settings, adcColor: 600, adcFilter: 0 }
  for (const [options, values, heat] of [
    [neutral, adcValues, [0.5, 1, 0.5, 1]],
    [{ ...neutral, heatmapUsePressure: 1, color: 4.6, filter: 200 }, adcValues, [0.5, 1, 0.5, 1]],
    [{ ...neutral, heatmapUsePressure: 1, adcColor: 900 }, adcValues,
      [Math.fround(1 / 3), Math.fround(2 / 3), Math.fround(1 / 3), Math.fround(2 / 3)]],
    [neutral, adcValues, [0.5, 1, 0.5, 1]],
  ]) {
    f.field.update(values, f.getMannequinHeatmapRenderSettings(options))
    assert.deepEqual(heatAt(f.field, sensors), heat)
  }
  for (const [adcColor, range] of [[300, 300], [600, 600], [1000, 1000], [1200, 1000]]) {
    const effective = f.getMannequinHeatmapRenderSettings({ ...neutral, autoColor: 0, adcColor })
    assert.equal(effective.autoColorReference, 600, 'the wider adjustment range retains the ADC neutral reference')
    f.field.update(adcValues, effective)
    assert.equal(f.field.stats.rangeMax, range)
    assert.deepEqual(heatAt(f.field, sensors), [...adcValues].map(value => Math.fround(value / range)))
  }
  assert.deepEqual([...f.field.texture.image.data].filter((_, index) => index % 4 !== 3), xyz)
  assert.deepEqual(adcValues, adcBefore)
  assert.deepEqual(settings, before)
  f.field.dispose()
})
