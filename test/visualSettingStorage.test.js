const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')
const { pathToFileURL } = require('node:url')

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
  const bandsSource = fs.readFileSync(path.resolve(__dirname, '../client/src/util/mannequinColorBands.js'), 'utf8')
  const bands = vm.runInThisContext(`(() => { ${bandsSource.replace(/^export\s+/gm, '')}\n; return { DEFAULT_COLOR_BAND_RATIOS, normalizeColorBandRatios }; })()`)
  const storageSource = source.replace(/^import.*\r?\n/gm, '').replace(/^export\s+/gm, '')
  const storage = vm.runInNewContext(`${storageSource}\n;({ loadVisualSettingValue, saveVisualSettingValue, getRestoredVisualSettingValue, normalizeVisualSettingMax })`, { localStorage, ...bands })
  return { entries, ...storage }
}

test('missing mannequin preferences use the shared manual 4 N/cm² preset in both views', () => {
  const fixture = createFixture()
  const settings = fixture.loadVisualSettingValue('endi')
  assert.equal(settings.gauss, 1)
  assert.equal(settings.height, 100)
  assert.equal(settings.filter, 0)
  assert.equal(settings.color, 40)
  assert.equal(settings.colorRange2D, 40)
  assert.equal(settings.autoColor, 0)
  assert.equal(settings.autoColor3D, 0)
  assert.equal(Object.hasOwn(settings, 'heatmapUsePressure'), false)
  assert.equal(settings.adcColor, 600)
  assert.equal(settings.adcFilter, 0)
  assert.equal(settings.visualDataMode, 'pressure')
  assert.deepEqual(settings.colorBandRatios, [20, 20, 20, 20, 20])
  assert.deepEqual(settings.colorBandRatios2D, [6, 9, 20, 28, 37])
  assert.ok(fixture.entries.get(VERSION_KEY))
  assert.equal(fixture.entries.get(ADC_VERSION_KEY), ADC_VERSION)
  for (const partial of [{}, { color: 40 }]) {
    fixture.saveVisualSettingValue('endi', partial)
    const saved = JSON.parse(fixture.entries.get(MAP_KEY)).endi
    assert.equal(saved.colorRange2D, 40)
    assert.equal(saved.autoColor3D, 0)
    assert.deepEqual(saved.colorBandRatios, [20, 20, 20, 20, 20])
    assert.deepEqual(saved.colorBandRatios2D, [6, 9, 20, 28, 37])
  }
})

test('startup mannequin defaults override generic fallback values without changing other systems or explicit archives', () => {
  const fallback = { gauss: 2, color: 4.6, colorRange2D: 8, filter: 5, height: 80, autoColor: 1, autoColor3D: 1, coherent: 3,
    colorBandRatios: [40, 15, 15, 15, 15], colorBandRatios2D: [20, 20, 20, 20, 20] }
  const fixture = createFixture()
  const settings = fixture.loadVisualSettingValue('endi', fallback)
  assert.equal(settings.gauss, 1)
  assert.equal(settings.color, 40)
  assert.equal(settings.colorRange2D, 40)
  assert.equal(settings.filter, 0)
  assert.equal(settings.height, 100)
  assert.equal(settings.autoColor, 0)
  assert.equal(settings.autoColor3D, 0)
  assert.equal(settings.coherent, 3)
  assert.deepEqual(settings.colorBandRatios, [20, 20, 20, 20, 20])
  assert.deepEqual(settings.colorBandRatios2D, [6, 9, 20, 28, 37])
  const other = createFixture().loadVisualSettingValue('bed', fallback)
  for (const key of ['gauss', 'color', 'filter', 'height', 'autoColor']) assert.equal(other[key], fallback[key])

  const source = fs.readFileSync(path.resolve(__dirname, '../client/src/assets/util/constant.js'), 'utf8')
    .replace(/^import.*\r?\n/gm, '').replace(/^export\s*\{[^]*?\}\s*;?\s*$/gm, '').replace(/^export\s+/gm, '')
  const { optimalObj } = vm.runInNewContext(`${source}\n;({ optimalObj })`, {
    getRestoredVisualSettingValue: fixture.getRestoredVisualSettingValue,
    VISUAL_COLOR_SETTING_MAX: 100,
  })
  const { coherent, ...preset } = optimalObj.endi
  assert.deepEqual({ ...preset }, { ...fixture.getRestoredVisualSettingValue('endi') })
  assert.equal(coherent, 1)
  assert.equal(optimalObj.bed.color, 4.6)
  assert.equal(optimalObj.bed.gauss, 2)
})

test('legacy shared auto color keeps the manual 3D default and explicit per-view choices survive reopening', () => {
  for (const autoColor of [0, 1]) {
    const previous = { gauss: 1.3, color: 20.2, filter: 0, height: 100, autoColor, colorBandRatios: [30, 20, 20, 15, 15] }
    for (const archived of [{ [MAP_KEY]: JSON.stringify({ endi: previous }) }, { [LEGACY_KEY]: JSON.stringify(previous) }]) {
      const fixture = createFixture({ ...archived, [VERSION_KEY]: '2026-08-03-pressure-filter-zero-default', [ADC_VERSION_KEY]: ADC_VERSION })
      const loaded = fixture.loadVisualSettingValue('endi')
      assert.equal(loaded.autoColor3D, 0, 'a legacy 2D preference does not enable 3D automatic color')
      assert.equal(loaded.autoColor, autoColor)
      assert.deepEqual(loaded.colorBandRatios, previous.colorBandRatios)
      for (const autoColor3D of [0, 1]) {
        const saved = { ...loaded, autoColor3D }
        fixture.saveVisualSettingValue('endi', saved)
        for (const storageKey of [MAP_KEY, LEGACY_KEY]) {
          const reopened = createFixture({ [storageKey]: fixture.entries.get(storageKey), [VERSION_KEY]: '2026-08-03-pressure-filter-zero-default', [ADC_VERSION_KEY]: ADC_VERSION })
          const settings = reopened.loadVisualSettingValue('endi')
          assert.equal(settings.autoColor3D, autoColor3D)
          assert.equal(settings.autoColor, autoColor)
          assert.equal(settings.color, 20.2)
          assert.equal(settings.gauss, 1.3)
          assert.equal(settings.height, 100)
          assert.deepEqual(settings.colorBandRatios, previous.colorBandRatios)
          reopened.saveVisualSettingValue('endi', settings)
          assert.equal(reopened.loadVisualSettingValue('endi').autoColor3D, autoColor3D)
          assert.equal(reopened.getRestoredVisualSettingValue('endi', settings).autoColor3D, 0)
        }
      }
    }
  }
  const fixture = createFixture()
  for (const system of ['car', 'bed', 'default']) {
    assert.equal(Object.hasOwn(fixture.loadVisualSettingValue(system), 'autoColor3D'), false)
    fixture.saveVisualSettingValue(system, { color: 8, autoColor: 0 })
    assert.equal(Object.hasOwn(JSON.parse(fixture.entries.get(MAP_KEY))[system], 'autoColor3D'), false)
  }
})

test('mannequin color proportions persist through both stores and reset independently of other systems', () => {
  const fixture = createFixture()
  const custom = { gauss: 1.3, color: 20.2, filter: 0, height: 100, autoColor: 0, colorBandRatios: [40, 15, 15, 15, 15] }
  const before = structuredClone(custom)
  fixture.saveVisualSettingValue('endi', custom)
  for (const archived of [
    { [MAP_KEY]: fixture.entries.get(MAP_KEY) },
    { [LEGACY_KEY]: fixture.entries.get(LEGACY_KEY) },
  ]) {
    const reopened = createFixture({ ...archived, [VERSION_KEY]: '2026-08-03-pressure-filter-zero-default', [ADC_VERSION_KEY]: ADC_VERSION })
    const loaded = reopened.loadVisualSettingValue('endi')
    assert.deepEqual(loaded.colorBandRatios, custom.colorBandRatios)
    assert.equal(loaded.gauss, 1.3)
    assert.equal(loaded.color, 20.2)
    assert.equal(loaded.filter, 0)
    assert.equal(loaded.height, 100)
    assert.equal(loaded.autoColor, 0)
    const restored = reopened.getRestoredVisualSettingValue('endi', loaded)
    assert.deepEqual(restored.colorBandRatios, [20, 20, 20, 20, 20])
    assert.deepEqual(loaded.colorBandRatios, custom.colorBandRatios)
    reopened.saveVisualSettingValue('endi', restored)
    assert.deepEqual(reopened.loadVisualSettingValue('endi').colorBandRatios, [20, 20, 20, 20, 20])
  }
  for (const invalid of [[100, 0, 0, 0, 0], [100], 'invalid']) {
    fixture.saveVisualSettingValue('endi', { ...custom, colorBandRatios: invalid })
    assert.deepEqual(fixture.loadVisualSettingValue('endi').colorBandRatios, [20, 20, 20, 20, 20])
  }
  fixture.saveVisualSettingValue('car', { gauss: 3, color: 8, height: 120 })
  assert.equal(Object.hasOwn(JSON.parse(fixture.entries.get(MAP_KEY)).car, 'colorBandRatios'), false)
  assert.deepEqual(custom, before)
})

test('2D and 3D color proportions save, normalize and restore independently', () => {
  const defaults = [20, 20, 20, 20, 20]
  const defaults2D = [6, 9, 20, 28, 37]
  const threeD = [40, 15, 15, 15, 15]
  const twoD = [10, 15, 20, 25, 30]
  const previous = { gauss: 1.3, color: 20.2, filter: 0, height: 100, autoColor: 0, autoColor3D: 1, colorBandRatios: threeD }
  for (const archived of [{ [MAP_KEY]: JSON.stringify({ endi: previous }) }, { [LEGACY_KEY]: JSON.stringify(previous) }]) {
    const fixture = createFixture({ ...archived, [VERSION_KEY]: '2026-08-03-pressure-filter-zero-default', [ADC_VERSION_KEY]: ADC_VERSION })
    const initial = fixture.loadVisualSettingValue('endi')
    assert.deepEqual(initial.colorBandRatios, threeD, 'existing proportions stay assigned to 3D')
    assert.deepEqual(initial.colorBandRatios2D, defaults2D, 'missing 2D proportions use the independent 2D preset')
    assert.notEqual(initial.colorBandRatios2D, initial.colorBandRatios)
    const custom = { ...initial, colorBandRatios2D: twoD }
    const before = structuredClone(custom)
    fixture.saveVisualSettingValue('endi', custom)
    assert.deepEqual(custom, before, 'saving never mutates either view preference')

    for (const storageKey of [MAP_KEY, LEGACY_KEY]) {
      const reopened = createFixture({ [storageKey]: fixture.entries.get(storageKey), [VERSION_KEY]: '2026-08-03-pressure-filter-zero-default', [ADC_VERSION_KEY]: ADC_VERSION })
      const loaded = reopened.loadVisualSettingValue('endi')
      assert.deepEqual(loaded.colorBandRatios, threeD)
      assert.deepEqual(loaded.colorBandRatios2D, twoD)
      assert.equal(loaded.autoColor, 0)
      assert.equal(loaded.autoColor3D, 1)
      assert.equal(loaded.color, 20.2)

      reopened.saveVisualSettingValue('endi', { ...loaded, colorBandRatios: [10, 10, 10, 10, 60] })
      const changed3D = reopened.loadVisualSettingValue('endi')
      assert.deepEqual(changed3D.colorBandRatios, [10, 10, 10, 10, 60])
      assert.deepEqual(changed3D.colorBandRatios2D, twoD, 'editing 3D keeps the independent 2D proportions')
      reopened.saveVisualSettingValue('endi', { ...changed3D, colorBandRatios2D: [30, 25, 20, 15, 10] })
      const changed2D = reopened.loadVisualSettingValue('endi')
      assert.deepEqual(changed2D.colorBandRatios, changed3D.colorBandRatios, 'editing 2D keeps the independent 3D proportions')
      assert.deepEqual(changed2D.colorBandRatios2D, [30, 25, 20, 15, 10])

      const restored = reopened.getRestoredVisualSettingValue('endi', changed2D)
      assert.deepEqual(restored.colorBandRatios, defaults)
      assert.deepEqual(restored.colorBandRatios2D, defaults2D)
      assert.notEqual(restored.colorBandRatios, restored.colorBandRatios2D)
      reopened.saveVisualSettingValue('endi', restored)
      const reset = reopened.loadVisualSettingValue('endi')
      assert.deepEqual(reset.colorBandRatios, defaults)
      assert.deepEqual(reset.colorBandRatios2D, defaults2D)
      assert.equal(reset.autoColor, 0)
      assert.equal(reset.autoColor3D, 0)
      assert.deepEqual(changed2D.colorBandRatios2D, [30, 25, 20, 15, 10])
    }

    for (const invalid of [[100], [100, 0, 0, 0, 0], 'invalid']) {
      fixture.saveVisualSettingValue('endi', { ...custom, colorBandRatios2D: invalid })
      const normalized = fixture.loadVisualSettingValue('endi')
      assert.deepEqual(normalized.colorBandRatios, threeD)
      assert.deepEqual(normalized.colorBandRatios2D, defaults2D)
    }
    fixture.saveVisualSettingValue('endi', { ...custom, colorBandRatios2D: [1, 1, 1, 1, 1] })
    assert.deepEqual(fixture.loadVisualSettingValue('endi').colorBandRatios2D, defaults)
  }
  const fixture = createFixture()
  for (const system of ['car', 'bed', 'default']) {
    assert.equal(Object.hasOwn(fixture.loadVisualSettingValue(system), 'colorBandRatios2D'), false)
    fixture.saveVisualSettingValue(system, { color: 8, autoColor: 0 })
    assert.equal(Object.hasOwn(JSON.parse(fixture.entries.get(MAP_KEY))[system], 'colorBandRatios2D'), false)
  }
  for (const colorBandRatios2D of [[100], [100, 0, 0, 0, 0], [1, 1, 1, 1, 1], 'invalid']) {
    const stored = { ...previous, colorBandRatios2D }
    for (const archived of [{ [MAP_KEY]: JSON.stringify({ endi: stored }) }, { [LEGACY_KEY]: JSON.stringify(stored) }]) {
      const loaded = createFixture(archived).loadVisualSettingValue('endi')
      assert.deepEqual(Array.from(loaded.colorBandRatios2D), Array.isArray(colorBandRatios2D) && colorBandRatios2D.length === 5 && colorBandRatios2D.every(value => value > 0) ? defaults : defaults2D,
        'raw archives retain valid proportions and use the 2D preset when invalid')
      assert.deepEqual(loaded.colorBandRatios, threeD)
    }
  }
})

test('2D color range initializes from legacy color once and then remains independent of the 3D range', () => {
  for (const previous of [{ color: 7.3 }, { color3D: 8.7 }, { color2D: 6.3 }, { color: 120 }]) {
    for (const archived of [{ [MAP_KEY]: JSON.stringify({ endi: previous }) }, { [LEGACY_KEY]: JSON.stringify(previous) }]) {
      const fixture = createFixture({ ...archived, [VERSION_KEY]: '2026-08-03-pressure-filter-zero-default', [ADC_VERSION_KEY]: ADC_VERSION })
      const loaded = fixture.loadVisualSettingValue('endi', { color: 4.6, colorRange2D: 50 })
      assert.equal(loaded.colorRange2D, loaded.color, 'a missing stored range uses the normalized current color, including old aliases')
      const initial3DRange = loaded.color
      const custom = { ...loaded, colorRange2D: 9.9 }
      const original = structuredClone(custom)
      fixture.saveVisualSettingValue('endi', custom)
      assert.deepEqual(custom, original)
      for (const storageKey of [MAP_KEY, LEGACY_KEY]) {
        const reopened = createFixture({ [storageKey]: fixture.entries.get(storageKey), [VERSION_KEY]: '2026-08-03-pressure-filter-zero-default', [ADC_VERSION_KEY]: ADC_VERSION })
        const settings = reopened.loadVisualSettingValue('endi')
        assert.equal(settings.color, initial3DRange)
        assert.equal(settings.colorRange2D, 9.9)
        reopened.saveVisualSettingValue('endi', { ...settings, color: 16.7 })
        const changed3D = reopened.loadVisualSettingValue('endi')
        assert.equal(changed3D.color, 16.7)
        assert.equal(changed3D.colorRange2D, 9.9, '3D edits cannot replace an explicit 2D range')
        reopened.saveVisualSettingValue('endi', { ...changed3D, colorRange2D: 2.5 })
        const changed2D = reopened.loadVisualSettingValue('endi')
        assert.equal(changed2D.color, 16.7, '2D edits cannot change the 3D range')
        assert.equal(changed2D.colorRange2D, 2.5)
        const restored = reopened.getRestoredVisualSettingValue('endi', changed2D)
        reopened.saveVisualSettingValue('endi', restored)
        const reset = reopened.loadVisualSettingValue('endi')
        assert.equal(reset.color, 40)
        assert.equal(reset.colorRange2D, 40)
        assert.equal(reset.autoColor3D, 0)
        assert.equal(reset.autoColor, 0)
      }
    }
  }
  for (const [colorRange2D, expected] of [[-1, 0.01], [0, 0.01], [100, 100], [120, 100], ['7.3', 7.3], ['invalid', 7.3]]) {
    const stored = { color: 7.3, colorRange2D }
    for (const archived of [{ [MAP_KEY]: JSON.stringify({ endi: stored }) }, { [LEGACY_KEY]: JSON.stringify(stored) }]) {
      const fixture = createFixture(archived)
      const loaded = fixture.loadVisualSettingValue('endi')
      assert.equal(loaded.colorRange2D, expected)
      assert.equal(loaded.color, 7.3)
      fixture.saveVisualSettingValue('endi', stored)
      assert.equal(JSON.parse(fixture.entries.get(MAP_KEY)).endi.colorRange2D, expected)
      assert.equal(JSON.parse(fixture.entries.get(LEGACY_KEY)).colorRange2D, expected)
    }
  }
  const fixture = createFixture()
  for (const system of ['car', 'bed', 'default']) {
    assert.equal(Object.hasOwn(fixture.loadVisualSettingValue(system), 'colorRange2D'), false)
    fixture.saveVisualSettingValue(system, { color: 8, autoColor: 0 })
    assert.equal(Object.hasOwn(JSON.parse(fixture.entries.get(MAP_KEY))[system], 'colorRange2D'), false)
  }
})

test('pressure color limits allow 10 N/cm² and cap both saved view ranges at 100 kPa', () => {
  const fixture = createFixture()
  assert.equal(fixture.normalizeVisualSettingMax({ color: 60 }).color, 100)
  for (const [requested, expected] of [[80, 80], [100, 100], [120, 100]]) {
    fixture.saveVisualSettingValue('endi', { color: requested, colorRange2D: requested, filter: 0 })
    const saved = JSON.parse(fixture.entries.get(MAP_KEY)).endi
    assert.equal(saved.color, expected)
    assert.equal(saved.colorRange2D, expected)
    const reopened = fixture.loadVisualSettingValue('endi')
    assert.equal(reopened.color, expected)
    assert.equal(reopened.colorRange2D, expected)
  }
})

test('legacy ADC display preferences are normalized to pressure through save and load', () => {
  const fixture = createFixture({ [LEGACY_KEY]: JSON.stringify({ heatmapUsePressure: 1 }) })
  const initial = fixture.loadVisualSettingValue('endi')
  assert.equal(initial.visualDataMode, 'pressure')
  for (const visualDataMode of ['pressure', 'adc']) {
    fixture.saveVisualSettingValue('endi', { ...initial, visualDataMode, color: 20, adcColor: 600 })
    const reloaded = createFixture(Object.fromEntries(fixture.entries)).loadVisualSettingValue('endi')
    assert.equal(reloaded.visualDataMode, 'pressure')
    assert.equal(reloaded.color, 20)
    assert.equal(reloaded.adcColor, 600)
  }
  fixture.saveVisualSettingValue('endi', { ...initial, visualDataMode: 'unknown' })
  assert.equal(fixture.loadVisualSettingValue('endi').visualDataMode, 'pressure')
  for (const visualDataMode of ['adc', 'pressure', 'unknown']) {
    const saved = { visualDataMode, heatmapUsePressure: 0, color: 18.5, gauss: 2.1, height: 312, autoColor: 1 }
    for (const archived of [{ [MAP_KEY]: JSON.stringify({ endi: saved }) }, { [LEGACY_KEY]: JSON.stringify(saved) }]) {
      const old = createFixture({ ...archived, [VERSION_KEY]: '2026-08-03-pressure-filter-zero-default', [ADC_VERSION_KEY]: ADC_VERSION })
      const reloaded = old.loadVisualSettingValue('endi')
      assert.equal(reloaded.visualDataMode, 'pressure', 'a directly stored pre-upgrade ADC preference cannot select ADC')
      assert.equal(reloaded.color, 18.5)
      assert.equal(reloaded.height, 312)
      assert.equal(reloaded.autoColor, 1)
      assert.equal(Object.hasOwn(reloaded, 'heatmapUsePressure'), false)
    }
  }
})

test('the equipment store always renders pressure despite stale ADC preferences and preserves statistics', async () => {
  const storage = createFixture()
  const render = await import(pathToFileURL(path.resolve(__dirname, '../client/src/util/mannequinHeatmapSource.js')).href)
  let state
  const create = initialize => {
    state = initialize(update => Object.assign(state, typeof update === 'function' ? update(state) : update))
    return { getState: () => state }
  }
  const source = fs.readFileSync(path.resolve(__dirname, '../client/src/store/equipStore.js'), 'utf8')
    .replace(/^import.*\r?\n/gm, '').replace(/^export\s+/gm, '')
  const scope = {
    ...storage, ...render, create, maxObj: { bed: {} },
    VISUAL_AUTO_COLOR_SETTING_DEFAULT: 0, VISUAL_COLOR_SETTING_DEFAULT: 4.6,
    PRESSURE_METRIC_MODE: 'pressure', PRESSURE_UNIT_N_CM2: 'N/cm²',
    GRADIENT_UNIT_PA_CM: 'pa/cm', normalizeGradientUnit: value => value,
    localStorage: { getItem: key => storage.entries.get(key) ?? null, setItem: (key, value) => storage.entries.set(key, String(value)) },
  }
  const getters = vm.runInNewContext(`${source}\n;({ getVisualRenderMetricMode, getVisualRenderSettings })`, scope)
  state.setSystemType('endi')
  state.setSettingValue({ ...state.settingValue, color: 20, adcColor: 600 })
  const metrics = { adc: { jacket: [100] }, pressure: { jacket: [9.07321] } }
  state.setMetricStatus(metrics)
  state.setStatus({ jacket: { pressureAverage: 9.07, pressureMax: 17.48 } })
  const before = JSON.stringify({ status: state.status, metricStatus: state.metricStatus })
  for (const mode of ['adc', 'pressure', 'adc']) {
    state.setSettingValue({ ...state.settingValue, visualDataMode: mode })
    assert.equal(getters.getVisualRenderMetricMode(), 'pressure')
    assert.equal(getters.getVisualRenderSettings().color, 20)
    assert.equal(state.pressureMetricMode, 'pressure')
    assert.equal(JSON.stringify({ status: state.status, metricStatus: state.metricStatus }), before)
    assert.equal(state.metricStatus, metrics)
    assert.equal(Object.hasOwn(state, 'setVisualDataMode'), false, 'the retired display switch is no longer exposed')
  }
  for (const autoColor3D of [undefined, 0, 1]) {
    state.setSettingValue({ ...state.settingValue, autoColor: 0, autoColor3D })
    state.setDisplay('point3D')
    assert.equal(getters.getVisualRenderSettings().autoColor, autoColor3D ?? 0)
    assert.equal(getters.getVisualRenderSettings('num').autoColor, 0)
    state.setDisplay('num')
    assert.equal(getters.getVisualRenderSettings().autoColor, 0)
    assert.equal(getters.getVisualRenderSettings('point3D').autoColor, autoColor3D ?? 0)
    state.setSettingValue({ ...state.settingValue, autoColor: 1 })
    assert.equal(getters.getVisualRenderSettings('num').autoColor, 1)
  }
  state.setSystemType('car')
  assert.equal(getters.getVisualRenderSettings('point3D').autoColor, 1)
  assert.equal(JSON.stringify({ status: state.status, metricStatus: state.metricStatus }), before)
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

test('restoring mannequin controls displays 4 N/cm² and persists its full preset without changing other systems', () => {
  const fixture = createFixture()
  const fallback = Object.freeze({ gauss: 2, color: 4.6, filter: 5, height: 80, coherent: 3, autoColor: 1 })
  const fallbackBefore = { ...fallback }
  const restored = fixture.getRestoredVisualSettingValue('endi', fallback)
  const expected = {
    gauss: 1, color: 40, colorRange2D: 40, filter: 0, height: 100, coherent: 3, autoColor: 0, autoColor3D: 0,
    adcColor: 600, adcFilter: 0, visualDataMode: 'pressure',
    colorBandRatios: [20, 20, 20, 20, 20],
    colorBandRatios2D: [6, 9, 20, 28, 37],
  }
  assert.deepEqual({ ...restored }, expected)

  const metricsSource = fs.readFileSync(path.resolve(__dirname, '../client/src/util/pressureMetrics.js'), 'utf8')
  const { getPressureMetricDisplay, PRESSURE_METRIC_MODE, PRESSURE_UNIT_N_CM2 } = vm.runInNewContext(
    `${metricsSource.replace(/^export\s+/gm, '')}\n;({ getPressureMetricDisplay, PRESSURE_METRIC_MODE, PRESSURE_UNIT_N_CM2 })`,
  )
  const display = getPressureMetricDisplay(PRESSURE_METRIC_MODE, undefined, 'zh', PRESSURE_UNIT_N_CM2)
  assert.equal(display.unit, 'N/cm²')
  assert.equal(restored.color * display.valueScale, 4)
  assert.equal(display.formatValue(restored.color), '4.00')

  fixture.saveVisualSettingValue('endi', restored)
  assert.deepEqual(JSON.parse(fixture.entries.get(MAP_KEY)).endi, expected)
  assert.deepEqual(JSON.parse(fixture.entries.get(LEGACY_KEY)), expected)
  const reopened = createFixture(Object.fromEntries(fixture.entries))
  assert.ok(reopened.normalizeVisualSettingMax({ height: 200 }).height >= 400)
  const reloaded = reopened.loadVisualSettingValue('endi', fallback, { height: 200 })
  assert.deepEqual({ ...reloaded }, expected, 'the full restored preset survives saving and reloading')
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

test('retained ADC parameters cannot re-enable ADC and restore uses the fixed pressure preset', () => {
  for (const heatmapUsePressure of [0, 1]) {
    const fixture = createFixture()
    const saved = {
      gauss: 1.6, color: 17.5, filter: 0.8, height: 245.1, autoColor: 1,
      heatmapUsePressure, adcColor: 1000, adcFilter: 1000,
    }
    const original = { ...saved }
    const { heatmapUsePressure: ignored, ...expected } = saved
    expected.visualDataMode = 'pressure'
    expected.colorRange2D = saved.color
    expected.autoColor3D = 0
    expected.colorBandRatios = [20, 20, 20, 20, 20]
    expected.colorBandRatios2D = [6, 9, 20, 28, 37]
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
    assert.equal(restored.color, 40)
    assert.equal(restored.filter, 0)
    assert.equal(restored.autoColor, 0)
    assert.equal(restored.height, 100)
    assert.equal(restored.visualDataMode, 'pressure')
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
  expected.visualDataMode = 'pressure'
  expected.colorRange2D = previous.color
  expected.autoColor3D = 0
  expected.colorBandRatios = [20, 20, 20, 20, 20]
  expected.colorBandRatios2D = [6, 9, 20, 28, 37]
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
