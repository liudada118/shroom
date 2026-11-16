const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')
const { pathToFileURL } = require('node:url')

const source = fs.readFileSync(path.resolve(__dirname, '../client/src/components/three/NumThreeColorV3.js'), 'utf8')
const loadBands = () => import(pathToFileURL(path.resolve(__dirname, '../client/src/util/mannequinColorBands.js')).href)
const loadGamma = () => import(pathToFileURL(path.resolve(__dirname, '../client/src/assets/util/colorMap_dynamic_gamma.js')).href)

// Exercise the production renderer functions without importing its app/store or opening a database.
function functionSource(name, indent = '') {
  const match = source.match(new RegExp(`^${indent}function ${name}\\([^]*?^${indent}}`, 'm'))
  assert.ok(match, `production function ${name} exists`)
  return match[0]
}

async function createContext(extra = {}) {
  const bands = await loadBands()
  const matrices = await import(pathToFileURL(path.resolve(__dirname, '../client/src/util/mannequinDisplayMatrix.js')).href)
  const { PRESSURE_GAMMA } = await loadGamma()
  const context = vm.createContext({
    ...bands,
    ...matrices,
    PRESSURE_GAMMA,
    NUMBER_TEXT_COLOR_ALPHA: 0.72,
    jetWhite3NoWhite: () => [11, 22, 33],
    ...extra,
  })
  vm.runInContext([
    functionSource('getNumericPaletteSettings'),
    functionSource('getNumericCellColor'),
    functionSource('getNumericCellStyle'),
  ].join('\n'), context)
  return context
}

const hostArray = value => Array.from(value)

test('numeric backgrounds use their mannequin proportions while other systems retain their original palette', async () => {
  const context = await createContext()
  const standard = context.getNumericPaletteSettings('endi', [20, 20, 20, 20, 20])
  const expandedBlue = context.getNumericPaletteSettings('endi', [40, 15, 15, 15, 15])
  assert.deepEqual(hostArray(context.getNumericCellColor(10, 100, standard)), [38, 170, 227])
  assert.deepEqual(hostArray(context.getNumericCellColor(10, 100, expandedBlue)), [57, 159, 226])
  assert.deepEqual(hostArray(context.getNumericCellColor(10, 100, context.getNumericPaletteSettings('sit', expandedBlue.ratios))), [11, 22, 33])
  assert.equal(standard.key, context.getNumericPaletteSettings('endi', [1, 1, 1, 1, 1]).key)
  assert.equal(standard.key, context.getNumericPaletteSettings('endi', undefined).key)
  assert.notEqual(standard.key, expandedBlue.key)
  assert.notEqual(standard.key, context.getNumericPaletteSettings('sit', standard.ratios).key)
})

test('actual digit atlas updates backgrounds without changing value text, atlas geometry, or legacy ADC labels', async () => {
  const canvases = []
  const context = await createContext({
    DIGIT_ATLAS_GRID: 32,
    DIGIT_ATLAS_CELL: 64,
    DIGIT_ATLAS_SIZE: 2048,
    NUMBER_TEXT_COLOR_ALPHA: 0.7,
    syncDynamicColorRange: () => {},
    document: {
      createElement: () => {
        const ctx = {
          backgrounds: [], labels: [], clearRect() {}, strokeRect() {},
          fillRect(x, y, width, height) { this.backgrounds.push({ x, y, width, height, color: this.fillStyle }) },
        }
        const canvas = { getContext: () => ctx, ctx }
        canvases.push(canvas)
        return canvas
      },
    },
    drawCellValue: (ctx, label, cx, cy, size, textColor) => ctx.labels.push({ label, cx, cy, size, textColor }),
    formatPressureValue: (value, unit) => `${value}:${unit}`,
    THREE: { CanvasTexture: class { constructor(canvas) { this.canvas = canvas } } },
  })
  vm.runInContext(functionSource('createDigitSpriteSheetWithJet', '  '), context)
  for (const ratios of [[20, 20, 20, 20, 20], [40, 15, 15, 15, 15]]) {
    context.createDigitSpriteSheetWithJet(100, false, 'kPa', context.getNumericPaletteSettings('endi', ratios))
  }
  const [before, after] = canvases
  assert.equal(before.width, 2048)
  assert.equal(before.height, 2048)
  assert.equal(before.ctx.backgrounds.length, 1024)
  assert.equal(after.ctx.backgrounds.length, 1024)
  assert.equal(before.ctx.backgrounds[0].color, '#202428')
  assert.equal(before.ctx.labels[0].textColor, '#7F8B99')
  assert.equal(before.ctx.backgrounds[100].color, 'rgba(38, 170, 227, 0.7)')
  assert.equal(after.ctx.backgrounds[100].color, 'rgba(57, 159, 226, 0.7)')
  assert.deepEqual(before.ctx.labels, after.ctx.labels)
  assert.deepEqual(before.ctx.labels[100], { label: '10:kPa', cx: 256, cy: 192, size: 64, textColor: '#fff' })
  context.createDigitSpriteSheetWithJet(255, true, 'kPa', context.getNumericPaletteSettings('sit'))
  const adc = canvases[2].ctx
  assert.equal(adc.backgrounds[100].color, 'rgba(11, 22, 33, 0.7)')
  assert.equal(adc.backgrounds[0].color, 'rgba(11, 22, 33, 0.7)')
  assert.equal(adc.labels[0].textColor, '#fff')
  assert.equal(adc.labels[100].label, '100')
  assert.equal(adc.labels[1023].label, '255')
})

test('a proportions-only change rebuilds the actual atlas cache once and disposes its replaced texture', async () => {
  let disposals = 0
  let creations = 0
  const previousTexture = { dispose() { disposals++ } }
  const replacement = { dispose() {} }
  const context = await createContext({
    currentTextureMode: 'pressure', currentMetricMode: 'pressure',
    currentTextureUnit: 'kPa', currentPressureUnit: 'kPa',
    currentTextureMax: 100, nextMax: 100, colorValueStep: 0.1,
    rawAdcMode: false, material: { uniforms: { map: { value: previousTexture } } },
    textureMaxRef: { current: 100 }, console: { log() {} },
    createDigitSpriteSheetWithJet(max, raw, unit, palette) {
      creations++
      assert.equal(max, 100)
      assert.equal(raw, false)
      assert.equal(unit, 'kPa')
      assert.deepEqual(hostArray(palette.ratios), [40, 15, 15, 15, 15])
      return replacement
    },
  })
  context.currentTexturePaletteKey = context.getNumericPaletteSettings('endi').key
  context.paletteSettings = context.getNumericPaletteSettings('endi', [40, 15, 15, 15, 15])
  const cacheBlock = source.match(/      if \(\r?\n        currentTextureMode[^]*?\r?\n      }/)
  assert.ok(cacheBlock, 'production cache update exists')
  vm.runInContext(cacheBlock[0], context)
  assert.equal(creations, 1)
  assert.equal(disposals, 1)
  assert.equal(context.material.uniforms.map.value, replacement)
  assert.equal(context.currentTexturePaletteKey, context.paletteSettings.key)
  vm.runInContext(cacheBlock[0], context)
  assert.equal(creations, 1)
  assert.equal(disposals, 1)
})

test('the actual magnifier mapper follows the latest ratios immediately without waiting for new data', async () => {
  const context = await createContext({ paletteSettingsRef: { current: null } })
  const mapper = source.match(/    const applyMatrixStyle = \(value, colorMax\) => {[^]*?\r?\n    };/)
  assert.ok(mapper, 'production magnifier mapper exists')
  vm.runInContext(`${mapper[0]}\nthis.applyMatrixStyle = applyMatrixStyle`, context)
  context.paletteSettingsRef.current = context.getNumericPaletteSettings('endi')
  assert.equal(context.applyMatrixStyle(10, 100).background, 'rgba(38, 170, 227, 0.72)')
  context.paletteSettingsRef.current = context.getNumericPaletteSettings('endi', [40, 15, 15, 15, 15])
  assert.equal(context.applyMatrixStyle(10, 100).background, 'rgba(57, 159, 226, 0.72)')
})

test('automatic numeric colors retain the existing pressure gamma while manual colors remain linear', async () => {
  const context = await createContext()
  const manual = context.getNumericPaletteSettings('endi', undefined, false)
  const automatic = context.getNumericPaletteSettings('endi', undefined, true)
  const corrected = Math.pow(0.25, context.PRESSURE_GAMMA) * 100
  assert.deepEqual(hostArray(context.getNumericCellColor(25, 100, manual)), [6, 193, 194])
  assert.deepEqual(hostArray(context.getNumericCellColor(25, 100, automatic)), hostArray(context.getColorBandRGB(corrected, 100)))
  assert.notDeepEqual(hostArray(context.getNumericCellColor(25, 100, automatic)), hostArray(context.getNumericCellColor(25, 100, manual)))
  assert.deepEqual(hostArray(context.getNumericCellColor(0, 100, automatic)), [77, 148, 224])
  assert.deepEqual(hostArray(context.getNumericCellColor(100, 100, automatic)), [242, 10, 0])
  assert.notEqual(manual.key, automatic.key)
})

test('enabling automatic color at a fixed range rebuilds the atlas and immediately updates its magnifier', async () => {
  const canvases = []
  let disposals = 0
  const context = await createContext({
    currentTextureMode: 'pressure', currentMetricMode: 'pressure',
    currentTextureUnit: 'kPa', currentPressureUnit: 'kPa',
    currentTextureMax: 100, nextMax: 100, colorValueStep: 0.1,
    rawAdcMode: false, textureMaxRef: { current: 100 },
    material: { uniforms: { map: { value: { dispose() { disposals++ } } } } },
    paletteSettingsRef: { current: null }, console: { log() {} },
    DIGIT_ATLAS_GRID: 32, DIGIT_ATLAS_CELL: 64, DIGIT_ATLAS_SIZE: 2048,
    NUMBER_TEXT_COLOR_ALPHA: 0.7, syncDynamicColorRange: () => {},
    document: {
      createElement() {
        const ctx = {
          colors: [], clearRect() {}, strokeRect() {},
          fillRect() { this.colors.push(this.fillStyle) },
        }
        const canvas = { ctx, getContext: () => ctx }
        canvases.push(canvas)
        return canvas
      },
    },
    drawCellValue() {}, formatPressureValue: value => value,
    THREE: { CanvasTexture: class { constructor(canvas) { this.canvas = canvas } dispose() { disposals++ } } },
  })
  const manual = context.getNumericPaletteSettings('endi', undefined, false)
  context.currentTexturePaletteKey = manual.key
  context.paletteSettings = context.getNumericPaletteSettings('endi', undefined, true)
  context.paletteSettingsRef.current = context.paletteSettings
  vm.runInContext(functionSource('createDigitSpriteSheetWithJet', '  '), context)
  const mapper = source.match(/    const applyMatrixStyle = \(value, colorMax\) => {[^]*?\r?\n    };/)
  vm.runInContext(`${mapper[0]}\nthis.applyMatrixStyle = applyMatrixStyle`, context)
  const cacheBlock = source.match(/      if \(\r?\n        currentTextureMode[^]*?\r?\n      }/)[0]
  vm.runInContext(cacheBlock, context)
  assert.equal(canvases[0].ctx.colors[250], context.applyMatrixStyle(25, 100).background)
  assert.notEqual(canvases[0].ctx.colors[250], 'rgba(6, 193, 194, 0.7)')
  assert.equal(disposals, 1)
  context.paletteSettings = manual
  context.paletteSettingsRef.current = manual
  vm.runInContext(cacheBlock, context)
  assert.equal(canvases[1].ctx.colors[250], 'rgba(6, 193, 194, 0.7)')
  assert.equal(context.applyMatrixStyle(25, 100).background, 'rgba(6, 193, 194, 0.7)')
  assert.equal(disposals, 2)
})

test('both production palette reads use independent 2D proportions and ignore 3D proportion edits', async () => {
  const context = await createContext({ systemType: 'endi', autoColor: 0, getSysType: () => 'endi' })
  const initialize = source.match(/    const initialPalette = getNumericPaletteSettings\([^\r\n]+;/)
  const perFrame = source.match(/      const paletteSettings = getNumericPaletteSettings\([^\r\n]+;/)
  assert.ok(initialize)
  assert.ok(perFrame)
  const readPalettes = settings => {
    context.initialSettings = context.settingValue = settings
    return vm.runInContext(`(() => { ${initialize[0]} ${perFrame[0]} return [initialPalette, paletteSettings]; })()`, context)
  }
  const settings = { colorBandRatios: [60, 10, 10, 10, 10], colorBandRatios2D: [40, 15, 15, 15, 15], autoColor: 0 }
  const first = readPalettes(settings)
  const changed3D = readPalettes({ ...settings, colorBandRatios: [10, 10, 10, 10, 60] })
  const changed2D = readPalettes({ ...settings, colorBandRatios2D: [20, 20, 20, 20, 20] })
  const missing2D = readPalettes({ colorBandRatios: [60, 10, 10, 10, 10], autoColor: 0 })
  for (let index = 0; index < 2; index++) {
    assert.deepEqual(hostArray(first[index].ratios), [40, 15, 15, 15, 15])
    assert.equal(first[index].key, changed3D[index].key)
    assert.notEqual(first[index].key, changed2D[index].key)
    assert.deepEqual(hostArray(missing2D[index].ratios), [20, 20, 20, 20, 20])
  }
})

test('actual magnifier draws opaque charcoal zeros with grey text after display filtering while positive and legacy cells retain their styles', async () => {
  const ctx = {
    backgrounds: [], labels: [],
    clearRect() { this.backgrounds = []; this.labels = [] },
    fillRect(x, y, width, height) { this.backgrounds.push({ x, y, width, height, color: this.fillStyle }) },
    fillText(label, x, y) { this.labels.push({ label, x, y, color: this.fillStyle }) },
    strokeRect() {},
  }
  const input = [0, 0.1, 1.2]
  const context = await createContext({
    magnifierCtxRef: { current: ctx }, magnifierCanvasRef: { current: { width: 90, height: 90 } },
    gridRef: { current: { width: 3, height: 1 } }, nullMaskRef: { current: null },
    textureMaxRef: { current: 100 }, rawAdcModeRef: { current: false }, pressureUnitRef: { current: 'kPa' },
    magnifierZoomRef: { current: 1 }, getMagnifierCells: () => 3,
    paletteSettingsRef: { current: null }, formatPressureValue: value => String(value),
    filter: 0.2,
  })
  vm.runInContext([
    functionSource('normalizeDisplayValue'), functionSource('prepareDisplayData'),
  ].join('\n'), context)
  context.data = context.prepareDisplayData(input, 3, 1, false)
  const filterBlock = source.match(/      const filterValue = Number\(filter\);[^]*?\r?\n      }/)
  assert.ok(filterBlock)
  vm.runInContext(filterBlock[0], context)
  assert.deepEqual(hostArray(context.data), [0, 0, 1.2])
  assert.deepEqual(input, [0, 0.1, 1.2])
  context.dataRef = { current: context.data }
  context.paletteSettingsRef.current = context.getNumericPaletteSettings('endi')
  const mapper = source.match(/    const applyMatrixStyle = \(value, colorMax\) => {[^]*?\r?\n    };/)
  const magnifier = source.match(/    const drawMagnifier = \(col, row\) => {[^]*?\r?\n    };/)
  assert.ok(mapper)
  assert.ok(magnifier)
  vm.runInContext(`${mapper[0]}\n${magnifier[0]}\nthis.drawMagnifier = drawMagnifier`, context)
  context.drawMagnifier(1, 0)
  for (const x of [0, 30]) {
    assert.equal(ctx.backgrounds.find(cell => cell.x === x && cell.y === 30).color, '#202428')
    assert.equal(ctx.labels.find(label => label.x === x + 15 && label.y === 45).color, '#7F8B99')
  }
  assert.equal(ctx.backgrounds.find(cell => cell.x === 60 && cell.y === 30).color,
    context.getNumericCellStyle(1.2, 100, context.paletteSettingsRef.current).background)
  assert.equal(ctx.labels.find(label => label.x === 75 && label.y === 45).color, '#fff')
  context.paletteSettingsRef.current = context.getNumericPaletteSettings('sit')
  context.drawMagnifier(1, 0)
  assert.equal(ctx.backgrounds.find(cell => cell.x === 0 && cell.y === 30).color, 'rgba(11, 22, 33, 0.72)')
  assert.equal(ctx.labels.find(label => label.x === 15 && label.y === 45).color, '#fff')
})
