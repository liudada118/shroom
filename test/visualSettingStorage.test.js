const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')

const MAP_KEY = 'visualSettingValueBySystemV1'
const LEGACY_KEY = 'setValueData'
const VERSION_KEY = 'visualDefaultVersion'
const ADC_VERSION_KEY = 'mannequinAdcDefaultVersion'
const ADC_VERSION = '2026-10-23-adc-600'

/** Load the actual storage helpers against isolated browser-like storage. */
function createFixture(initial = {}) {
  const entries = new Map(Object.entries(initial))
  const localStorage = {
    getItem: key => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, String(value)),
  }
  const source = fs.readFileSync(path.resolve(__dirname, '../client/src/util/visualSettingStorage.js'), 'utf8')
  const storage = vm.runInNewContext(`${source.replace(/^export\s+/gm, '')}\n;({ loadVisualSettingValue, saveVisualSettingValue, getRestoredVisualSettingValue, normalizeVisualSettingMax })`, { localStorage })
  return { entries, ...storage }
}

test('missing visual preferences receive the manual 4.6 range without enabling auto color', () => {
  const fixture = createFixture()
  const settings = fixture.loadVisualSettingValue('endi')
  assert.equal(settings.color, 4.6)
  assert.equal(settings.autoColor, 0)
  assert.equal(Object.hasOwn(settings, 'heatmapUsePressure'), false)
  assert.equal(settings.adcColor, 600)
  assert.equal(settings.adcFilter, 0)
  assert.ok(fixture.entries.get(VERSION_KEY))
  assert.equal(fixture.entries.get(ADC_VERSION_KEY), ADC_VERSION)
})

test('legacy-default migration preserves explicitly disabled and enabled automatic color', () => {
  for (const autoColor of [0, 1]) {
    const saved = { gauss: 4, color: 9, filter: 0, height: 80, coherent: 2, autoColor }
    const fixture = createFixture({
      [MAP_KEY]: JSON.stringify({ endi: saved }),
      [LEGACY_KEY]: JSON.stringify(saved),
      [VERSION_KEY]: 'older-default-version',
    })
    const settings = fixture.loadVisualSettingValue('endi', { color: 4.6, autoColor: 0 })
    assert.equal(settings.autoColor, autoColor)
    assert.equal(settings.color, 9)
    assert.equal(Object.hasOwn(settings, 'heatmapUsePressure'), false)
    assert.equal(settings.adcColor, 600)
    assert.equal(settings.adcFilter, 0)
    assert.equal(JSON.parse(fixture.entries.get(MAP_KEY)).endi.autoColor, autoColor)
    assert.equal(JSON.parse(fixture.entries.get(LEGACY_KEY)).autoColor, autoColor)
    assert.equal(fixture.loadVisualSettingValue('endi').autoColor, autoColor)
  }
})

test('explicit saved color and automatic preference override defaults through both storage formats', () => {
  const fixture = createFixture()
  fixture.saveVisualSettingValue('endi', { gauss: 2, color: 7.3, filter: 0, height: 80, autoColor: 1 })
  const perSystem = fixture.loadVisualSettingValue('endi', { color: 4.6, autoColor: 0 })
  assert.equal(perSystem.color, 7.3)
  assert.equal(perSystem.autoColor, 1)
  assert.equal(JSON.parse(fixture.entries.get(MAP_KEY)).default.color, 7.3)

  fixture.entries.delete(MAP_KEY)
  const legacy = fixture.loadVisualSettingValue('endi', { color: 4.6, autoColor: 0 })
  assert.equal(legacy.color, 7.3)
  assert.equal(legacy.autoColor, 1)
  assert.equal(JSON.parse(fixture.entries.get(MAP_KEY)).endi.autoColor, 1)
})

test('restoring mannequin controls displays 2 N/cm² and persists its full preset without changing other systems', () => {
  const fixture = createFixture()
  const fallback = Object.freeze({ gauss: 2, color: 4.6, filter: 5, height: 80, coherent: 3, autoColor: 1 })
  const fallbackBefore = { ...fallback }
  const restored = fixture.getRestoredVisualSettingValue('endi', fallback)
  const expected = {
    gauss: 1.6, color: 20, filter: 0, height: 245.1, coherent: 3, autoColor: 0,
    adcColor: 600, adcFilter: 0,
  }
  assert.deepEqual({ ...restored }, expected)

  const metricsSource = fs.readFileSync(path.resolve(__dirname, '../client/src/util/pressureMetrics.js'), 'utf8')
  const { getPressureMetricDisplay, PRESSURE_METRIC_MODE, PRESSURE_UNIT_N_CM2 } = vm.runInNewContext(
    `${metricsSource.replace(/^export\s+/gm, '')}\n;({ getPressureMetricDisplay, PRESSURE_METRIC_MODE, PRESSURE_UNIT_N_CM2 })`,
  )
  const display = getPressureMetricDisplay(PRESSURE_METRIC_MODE, undefined, 'zh', PRESSURE_UNIT_N_CM2)
  assert.equal(display.unit, 'N/cm²')
  assert.equal(restored.color * display.valueScale, 2)
  assert.equal(display.formatValue(restored.color), '2.00')

  fixture.saveVisualSettingValue('endi', restored)
  assert.deepEqual(JSON.parse(fixture.entries.get(MAP_KEY)).endi, expected)
  assert.deepEqual(JSON.parse(fixture.entries.get(LEGACY_KEY)), expected)
  const reopened = createFixture(Object.fromEntries(fixture.entries))
  assert.ok(reopened.normalizeVisualSettingMax({ height: 200 }).height >= 400)
  const reloaded = reopened.loadVisualSettingValue('endi', fallback, { height: 200 })
  assert.deepEqual({ ...reloaded }, expected, 'backend height max 200 cannot truncate the restored 245.1 setting')
  assert.equal(reloaded.autoColor, 0)
  assert.deepEqual(fallback, fallbackBefore)

  for (const [system, gauss, height] of [['car', 3, 120], ['bed', 1, 60]]) {
    const otherFallback = Object.freeze({ ...fallback, gauss, height })
    const otherRestored = fixture.getRestoredVisualSettingValue(system, otherFallback)
    assert.deepEqual({ ...otherRestored }, { ...otherFallback, color: 4.6, autoColor: 0 })
    assert.equal(otherFallback.autoColor, 1)
    assert.equal(otherFallback.height, height)
  }
})

test('ADC controls persist independently while legacy pressure selection is discarded and restore uses 600', () => {
  for (const heatmapUsePressure of [0, 1]) {
    const fixture = createFixture()
    const saved = {
      gauss: 1.6, color: 17.5, filter: 0.8, height: 245.1, autoColor: 1,
      heatmapUsePressure, adcColor: 1000, adcFilter: 1000,
    }
    const original = { ...saved }
    const { heatmapUsePressure: ignored, ...expected } = saved
    fixture.saveVisualSettingValue('endi', saved)
    const reopened = createFixture(Object.fromEntries(fixture.entries))
    const perSystem = reopened.loadVisualSettingValue('endi')
    assert.deepEqual({ ...perSystem }, expected)
    assert.equal(Object.hasOwn(JSON.parse(reopened.entries.get(MAP_KEY)).endi, 'heatmapUsePressure'), false)
    reopened.entries.delete(MAP_KEY)
    const legacy = reopened.loadVisualSettingValue('endi')
    assert.deepEqual({ ...legacy }, expected)
    assert.equal(JSON.parse(reopened.entries.get(LEGACY_KEY)).adcColor, 1000)
    assert.equal(Object.hasOwn(JSON.parse(reopened.entries.get(LEGACY_KEY)), 'heatmapUsePressure'), false)

    reopened.saveVisualSettingValue('endi', { ...legacy, adcColor: 300, adcFilter: 600 })
    const adcChanged = reopened.loadVisualSettingValue('endi')
    assert.equal(adcChanged.adcColor, 300)
    assert.equal(adcChanged.adcFilter, 600)
    assert.equal(adcChanged.color, 17.5, 'ADC color changes preserve the pressure range')
    assert.equal(adcChanged.filter, 0.8, 'ADC filtering preserves the pressure threshold')
    reopened.saveVisualSettingValue('endi', { ...adcChanged, color: 12, filter: 0.25 })
    const pressureChanged = reopened.loadVisualSettingValue('endi')
    assert.equal(pressureChanged.adcColor, 300)
    assert.equal(pressureChanged.adcFilter, 600)
    assert.equal(Object.hasOwn(pressureChanged, 'heatmapUsePressure'), false)

    reopened.saveVisualSettingValue('endi', { ...pressureChanged, adcColor: 1200, adcFilter: 2000 })
    const clamped = reopened.loadVisualSettingValue('endi')
    assert.equal(clamped.adcColor, 1000)
    assert.equal(clamped.adcFilter, 1000)
    assert.equal(clamped.color, 12)
    assert.equal(clamped.filter, 0.25)

    const beforeRestore = { ...pressureChanged }
    const restored = reopened.getRestoredVisualSettingValue('endi', pressureChanged)
    assert.equal(Object.hasOwn(restored, 'heatmapUsePressure'), false)
    assert.equal(restored.adcColor, 600)
    assert.equal(restored.adcFilter, 0)
    assert.equal(restored.color, 20)
    assert.equal(restored.filter, 0)
    assert.equal(restored.autoColor, 0)
    reopened.saveVisualSettingValue('endi', restored)
    assert.equal(reopened.loadVisualSettingValue('endi').adcColor, 600)
    assert.deepEqual({ ...pressureChanged }, beforeRestore)
    assert.deepEqual(saved, original)
  }
})

test('the ADC 600 upgrade runs once for both previous defaults and preserves later custom choices', () => {
  const previous = {
    gauss: 1.6, color: 17.5, filter: 0.8, height: 245.1, coherent: 2, autoColor: 1,
    heatmapUsePressure: 1, adcColor: 255, adcFilter: 23,
  }
  const fixtures = []
  const { heatmapUsePressure: ignored, ...expected } = { ...previous, adcColor: 600 }
  for (const adcColor of [255, 367]) {
    const oldSettings = { ...previous, adcColor }
    const fixture = createFixture({
      [MAP_KEY]: JSON.stringify({ endi: oldSettings, default: oldSettings, car: oldSettings }),
      [LEGACY_KEY]: JSON.stringify(oldSettings),
      [VERSION_KEY]: '2026-08-03-pressure-filter-zero-default',
      ...(adcColor === 367 ? { [ADC_VERSION_KEY]: '2026-10-23-adc-367' } : {}),
    })
    assert.deepEqual({ ...fixture.loadVisualSettingValue('endi') }, expected,
      'the separate ADC migration leaves pressure and filter preferences intact')
    assert.equal(fixture.entries.get(ADC_VERSION_KEY), ADC_VERSION)
    const storedMap = JSON.parse(fixture.entries.get(MAP_KEY))
    assert.equal(storedMap.endi.adcColor, 600)
    assert.equal(storedMap.default.adcColor, 600)
    assert.equal(storedMap.car.adcColor, adcColor, 'the mannequin upgrade cannot change another system')
    assert.equal(JSON.parse(fixture.entries.get(LEGACY_KEY)).adcColor, 600)
    fixtures.push(fixture)
  }

  const custom = createFixture({
    [MAP_KEY]: JSON.stringify({ endi: { ...previous, adcColor: 800 } }),
    [LEGACY_KEY]: JSON.stringify({ ...previous, adcColor: 800 }),
    [VERSION_KEY]: '2026-08-03-pressure-filter-zero-default',
  })
  assert.equal(custom.loadVisualSettingValue('endi').adcColor, 800)
  assert.equal(JSON.parse(custom.entries.get(LEGACY_KEY)).adcColor, 800)
  assert.equal(custom.entries.get(ADC_VERSION_KEY), ADC_VERSION)

  for (const adcColor of [255, 367]) {
    const fixture = fixtures[0]
    fixture.saveVisualSettingValue('endi', { ...expected, adcColor })
    const reopened = createFixture(Object.fromEntries(fixture.entries))
    assert.equal(reopened.loadVisualSettingValue('endi').adcColor, adcColor,
      'choosing a previous default after migration remains a custom preference')
    reopened.entries.delete(MAP_KEY)
    assert.equal(reopened.loadVisualSettingValue('endi').adcColor, adcColor,
      'the legacy storage path also retains the later custom choice')
    const freshSave = createFixture()
    freshSave.saveVisualSettingValue('endi', { ...expected, adcColor })
    assert.equal(freshSave.entries.get(ADC_VERSION_KEY), ADC_VERSION)
    assert.equal(createFixture(Object.fromEntries(freshSave.entries)).loadVisualSettingValue('endi').adcColor, adcColor,
      'saving a previous default before the first load also records that the upgrade has already been handled')
  }
})
