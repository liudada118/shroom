const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const { pathToFileURL } = require('node:url')

// Preserve the reference vertex/shell and the current configurable display palette.
const REFERENCE_SHADER_SHA256 = {
  vertex: '269f686e68c74e9856b27fc07bee80715b1cef1f7166e2fc4b023030e7cc065d',
  shell: 'd9e8c93eea431d164b3d762e733fb88d11123640d2779ddfb4a56bdcc86f48ce',
  heatColor: '980cb56cc46f80ae6f9b958968bf10d14caa50c5e359fe978ab93d9a5ae1b91c',
}

async function createFixture({ segments = 1, sensors: suppliedSensors } = {}) {
  const THREE = await import(pathToFileURL(path.resolve(__dirname, '../client/node_modules/three/build/three.module.js')).href)
  const { createMannequinHeatField } = await import(pathToFileURL(path.resolve(__dirname, '../client/src/components/three/mannequinHeatField.js')).href)
  const model = new THREE.Group()
  const geometries = []
  for (const x of [-0.4, 0.4]) {
    const geometry = new THREE.PlaneGeometry(0.3, 4, segments, segments * 4)
    const mesh = new THREE.Mesh(geometry)
    mesh.position.set(x, 2, 0)
    mesh.rotation.y = Math.PI
    model.add(mesh)
    geometries.push(geometry)
  }
  const sensors = suppliedSensors || [
    { index: 0, canvasId: 'left-leg', x: -0.4, y: 2, z: 0 },
    { index: 1, canvasId: 'right-leg', x: 0.4, y: 2, z: 0 },
  ]
  return { THREE, model, sensors, geometries, field: createMannequinHeatField(sensors, model) }
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function heatColorSource(shader) {
  const match = shader.match(/  vec3 heatColor\(float t\) \{[\s\S]*?\n  \}/)
  assert.ok(match, 'the pressure renderer exposes its heat color function')
  return match[0]
}

function assertHeatColors(shader) {
  const source = heatColorSource(shader)
  assert.match(source, /vec3 blue = vec3\(0\.30, 0\.58, 0\.88\)/,
    'low pressure retains a clear blue with a softer contrast against white')
  assert.match(source, /if \(t < uColorStops\.x\) return mix\(blue, cyan, t \/ uColorStops\.x\)/,
    'the lowest color interval must interpolate using its configured width')
  assert.equal(sha256(source), REFERENCE_SHADER_SHA256.heatColor,
    'the configured stops retain continuous interpolation and the defined color values')
}

function regionalSensors(regions) {
  const sources = {
    head: 'jacket', back: 'jacket', 'left-arm': 'leftHand', 'right-arm': 'rightHand',
    'left-leg': 'leftFoot', 'right-leg': 'rightFoot',
  }
  return regions.map((canvasId, index) => ({
    index, canvasId, sourceKey: sources[canvasId], x: index * 0.01, y: 2, z: 0,
    ...(canvasId.endsWith('-leg') ? { combinedDisplayIndex: index } : {}),
  }))
}

function heatValues(field) {
  return Array.from({ length: field.texture.image.width }, (_, index) => field.texture.image.data[index * 4 + 3])
}

test('opaque white model uses configurable colors and a soft spatial boundary', async () => {
  const { THREE, field } = await createFixture()
  const { createReferenceHumanShaders, REFERENCE_CRYSTAL_DEFAULTS } = await import(pathToFileURL(path.resolve(__dirname, '../client/src/components/three/mannequinReferenceShaders.js')).href)
  const reference = createReferenceHumanShaders(2)
  assert.equal(sha256(reference.vertexShader), REFERENCE_SHADER_SHA256.vertex)
  assert.equal(sha256(reference.crystalShellFragmentShader), REFERENCE_SHADER_SHA256.shell)
  assertHeatColors(reference.pressureHeatOverlayFragmentShader)
  assert.match(reference.pressureHeatOverlayFragmentShader, /sensor\.w <= 0\.0/)
  assert.match(reference.pressureHeatOverlayFragmentShader, /supportWeightSquaredSum \+= weight \* weight/)
  assert.match(reference.pressureHeatOverlayFragmentShader, /supportWeightSquaredSum \/ max\(supportWeightSum, 1e-8\)/)
  assert.doesNotMatch(reference.pressureHeatOverlayFragmentShader, /nearestDistance/,
    'the visible boundary must combine neighboring kernels instead of taking a hard nearest-point union')
  assert.match(reference.pressureHeatOverlayFragmentShader, /fwidth\(supportDistance\)/)
  assert.match(reference.pressureHeatOverlayFragmentShader, /smoothstep\(1\.1 - edgeAA, 2\.55 \+ edgeAA, supportDistance\)/)
  assert.deepEqual(REFERENCE_CRYSTAL_DEFAULTS, {
    background: '#afacac', modelColor: '#718096', transparency: 0.8,
    intensity: 0.8, colorScheme: 0, backHeatAlpha: 0.35, frontHeatAlpha: 0.65,
  })
  const [back, front] = field.heatMaterials
  for (const material of [field.material, back, front]) {
    assert.equal(sha256(material.vertexShader), REFERENCE_SHADER_SHA256.vertex)
  }
  assert.equal(field.material.fragmentShader, reference.opaqueWhiteShellFragmentShader)
  assert.match(field.material.fragmentShader, /gl_FragColor = vec4\(uModelColor \* shade, 1\.0\)/)
  for (const material of [back, front]) {
    assert.equal(material.fragmentShader, reference.pressureHeatOverlayFragmentShader)
    assertHeatColors(material.fragmentShader)
    assert.equal(material.uniforms.uIntensity.value, 0.8)
    assert.equal(material.uniforms.uColorScheme.value, 0)
    assert.deepEqual(material.uniforms.uColorStops.value.toArray(), [0.2, 0.4, 0.6, 0.8])
  }
  assert.equal(field.material.side, THREE.FrontSide)
  assert.equal(field.material.transparent, false)
  assert.equal(field.material.opacity, 1)
  assert.equal(field.material.depthWrite, true)
  assert.deepEqual(field.material.uniforms.uModelColor.value.toArray(), [1, 1, 1],
    'the app uses an opaque white model beneath the pressure color overlay')
  assert.equal(back.side, THREE.BackSide)
  assert.equal(front.side, THREE.FrontSide)
  assert.equal(back.uniforms.uHeatAlpha.value, 0.35)
  assert.equal(front.uniforms.uHeatAlpha.value, 1, 'full heat retains its palette over an opaque white surface')
  for (const material of [back, front]) {
    assert.equal(material.depthWrite, false)
    assert.equal(material.depthTest, true, 'the opaque body must hide heat on occluded surfaces')
  }
  field.dispose()
})

test('color band edits update both heat passes immediately without changing pressure textures', async () => {
  const { field } = await createFixture()
  const source = Object.freeze([2, 4])
  const [back, front] = field.heatMaterials
  assert.equal(back.uniforms.uColorStops, front.uniforms.uColorStops)
  for (const autoColor of [0, 1]) {
    const settings = { autoColor, color: 8 }
    field.update(source, settings)
    const previousTexture = [...field.texture.image.data]
    const previousVersion = field.texture.version
    const previousRange = field.stats.rangeMax
    assert.equal(field.update(source, { ...settings, colorBandRatios: [40, 15, 15, 15, 15] }), true)
    for (const pass of [back, front]) {
      assert.deepEqual(pass.uniforms.uColorStops.value.toArray(), [0.4, 0.55, 0.7, 0.85])
    }
    assert.equal(field.texture.version, previousVersion, 'palette edits do not upload measurement data')
    assert.deepEqual([...field.texture.image.data], previousTexture)
    assert.equal(field.stats.rangeMax, previousRange)
    assert.equal(field.stats.activeCount, 2)
    assert.equal(field.update(source, { ...settings, colorBandRatios: [40, 15, 15, 15, 15] }), false)
    assert.equal(field.update(source, settings), true)
    assert.deepEqual(front.uniforms.uColorStops.value.toArray(), [0.2, 0.4, 0.6, 0.8])
    assert.equal(field.texture.version, previousVersion)
    assert.deepEqual([...field.texture.image.data], previousTexture)
  }
  assert.deepEqual(source, [2, 4])
  field.dispose()
})

test('measurement texture contains one row of archived world XYZ and copied heat values', async () => {
  const { field, sensors, geometries } = await createFixture()
  assert.equal(field.texture.image.width, 2)
  assert.equal(field.texture.image.height, 1)
  assert.equal(field.texture.image.data.length, 8)
  assert.deepEqual([...field.texture.image.data], [...new Float32Array([-0.4, 2, 0, 0, 0.4, 2, 0, 0])])
  field.update([2, 4], { autoColor: 0, color: 8 })
  assert.deepEqual([...field.texture.image.data], [...new Float32Array([-0.4, 2, 0, 0.25, 0.4, 2, 0, 0.5])])
  assert.deepEqual(sensors.map(sensor => [sensor.x, sensor.y, sensor.z]), [[-0.4, 2, 0], [0.4, 2, 0]])
  geometries.forEach(geometry => assert.deepEqual(Object.keys(geometry.attributes).sort(), ['normal', 'position', 'uv']))
  field.dispose()
})

test('very low pressure activates and clears despite sub-epsilon intensity changes without changing readings', async () => {
  const { field } = await createFixture()
  const source = new Float64Array([0.000001, 4])
  const original = source.slice()
  const settings = Object.freeze({ autoColor: 0, color: 20.2, filter: 0 })
  const xyz = [...field.texture.image.data].filter((_, index) => index % 4 !== 3)
  const expectedHighHeat = Math.fround(4 / 20.2)
  assert.equal(field.update(source, settings), true)
  assert.deepEqual(heatValues(field), [Math.fround(source[0] / 20.2), expectedHighHeat])
  assert.ok(heatValues(field)[0] > 0 && heatValues(field)[0] < 0.000001,
    'a valid low reading must reach the shader even below the normal texture update tolerance')
  assert.equal(field.stats.activeCount, 2)
  assert.equal(field.stats.rangeMax, 20.2)
  assert.equal(field.stats.maxValue, 4)

  const textureVersion = field.texture.version
  assert.equal(field.update([0, 4], settings), true, 'zero pressure immediately removes the low-pressure footprint')
  assert.deepEqual(heatValues(field), [0, expectedHighHeat])
  assert.ok(field.texture.version > textureVersion, 'clearing the low reading uploads a new texture')
  assert.equal(field.stats.activeCount, 1)
  assert.equal(field.update(source, settings), true, 'returning low pressure reactivates the footprint')
  assert.equal(heatValues(field)[0], Math.fround(source[0] / 20.2))
  assert.equal(field.update(source, { ...settings, filter: source[0] }), true,
    'the visual noise threshold can still remove a low reading at the threshold')
  assert.deepEqual(heatValues(field), [0, expectedHighHeat])
  assert.equal(field.stats.activeCount, 1)
  assert.equal(field.stats.maxValue, 4)
  assert.equal(field.stats.rangeMax, 20.2)
  assert.deepEqual([...field.texture.image.data].filter((_, index) => index % 4 !== 3), xyz)
  assert.deepEqual(source, original, 'display visibility cannot modify measured pressure')
  field.dispose()
})

test('mesh density and statistical region labels cannot alter the world Gaussian field in manual color mode', async () => {
  const coarse = await createFixture()
  const refined = await createFixture({ segments: 12, sensors: [
    { index: 0, canvasId: 'back', x: -0.4, y: 2, z: 0 },
    { index: 1, canvasId: 'head', x: 0.4, y: 2, z: 0 },
  ] })
  assert.notEqual(coarse.geometries[0].attributes.position.count, refined.geometries[0].attributes.position.count)
  for (const fixture of [coarse, refined]) fixture.field.update([2, 4], { autoColor: 0, color: 8 })
  assert.deepEqual(coarse.field.texture.image.data, refined.field.texture.image.data)
  assert.equal(coarse.field.heatMaterials[0].fragmentShader, refined.field.heatMaterials[0].fragmentShader)
  coarse.field.dispose()
  refined.field.dispose()
})

test('display controls update both heat passes together without mutating pressure readings', async () => {
  const { field } = await createFixture()
  const source = new Float32Array([2, 4])
  const [back, front] = field.heatMaterials
  assert.equal(back.uniforms.uSensorData.value, field.texture)
  assert.equal(front.uniforms.uSensorData.value, field.texture)
  assert.equal(back.uniforms.uRadius, front.uniforms.uRadius)
  assert.equal(back.uniforms.uSensorCount.value, 2)
  assert.equal(front.uniforms.uSensorCount.value, 2)
  field.update(source, { autoColor: 0, color: 8, filter: 0 })
  assert.equal(field.texture.image.data[3], 0.25)
  assert.equal(field.texture.image.data[7], 0.5)
  assert.equal(field.stats.rangeMax, 8)
  assert.equal(field.update(source, { autoColor: 0, color: 8, filter: 0 }), false)
  field.update(source, { autoColor: 1, color: 8, filter: 2, height: 200, gauss: 4 })
  assert.equal(field.texture.image.data[3], 0)
  assert.equal(field.texture.image.data[7], Math.fround(4.6 / 8))
  assert.equal(field.stats.activeCount, 1)
  assert.ok(Math.abs(field.stats.rangeMax - 4 * 8 / 4.6) < 1e-12)
  assert.equal(back.uniforms.uRadius.value, 0.2)
  assert.equal(front.uniforms.uRadius.value, 0.2)
  assert.deepEqual([...source], [2, 4])
  field.dispose()
})

test('missing and invalid pressure samples clear stale heat while preserving archived coordinates', async () => {
  const { field } = await createFixture()
  field.update([4, 4])
  field.update([2], { autoColor: 0, color: 4 })
  assert.equal(field.texture.image.data[3], 0.5)
  assert.equal(field.texture.image.data[7], 0)
  assert.equal(field.stats.activeCount, 1)
  for (const readings of [[NaN, -2], [Infinity, undefined], [], undefined]) {
    field.update(readings)
    assert.equal(field.stats.activeCount, 0)
    assert.equal(field.texture.image.data[3], 0)
    assert.equal(field.texture.image.data[7], 0)
  }
  assert.deepEqual([field.texture.image.data[0], field.texture.image.data[1], field.texture.image.data[2]], [...new Float32Array([-0.4, 2, 0])])
  assert.deepEqual([field.texture.image.data[4], field.texture.image.data[5], field.texture.image.data[6]], [...new Float32Array([0.4, 2, 0])])
  field.dispose()
})

test('automatic colors give all six body regions their own peak while retaining within-region gradients', async () => {
  const maxima = { head: 2, back: 8, 'left-arm': 4, 'right-arm': 16, 'left-leg': 32, 'right-leg': 64 }
  const regions = Object.keys(maxima).flatMap(region => [region, region])
  const { field } = await createFixture({ sensors: regionalSensors(regions) })
  const source = Object.values(maxima).flatMap(maximum => [maximum / 2, maximum])
  const original = [...source]
  const [back, front] = field.heatMaterials
  const texture = field.texture
  const shaders = field.heatMaterials.map(material => material.fragmentShader)
  field.update(source, { autoColor: 1 })
  assert.deepEqual(heatValues(field), Object.keys(maxima).flatMap(() => [0.5, 1]))
  assert.deepEqual(field.stats.rangeMaxByRegion, maxima)
  assert.equal(field.stats.rangeMax, 64)
  assert.equal(field.stats.maxValue, 64)
  assert.equal(field.stats.activeCount, 12)
  assert.equal(back.uniforms.uSensorData.value, texture)
  assert.equal(front.uniforms.uSensorData.value, texture)
  assert.equal(back.uniforms.uRadius, front.uniforms.uRadius)
  assert.deepEqual(field.heatMaterials.map(material => material.fragmentShader), shaders)
  assert.deepEqual(source, original)
  field.dispose()
})

test('a high-pressure region cannot change head, back or combined-leg colors in other regions', async () => {
  const regions = ['head', 'head', 'back', 'back', 'left-leg', 'left-leg', 'right-leg', 'right-leg']
  const { field, sensors } = await createFixture({ sensors: regionalSensors(regions) })
  assert.equal(sensors[0].sourceKey, sensors[2].sourceKey, 'head and back share the jacket source')
  assert.ok(sensors.slice(4).every(sensor => sensor.combinedDisplayIndex !== undefined))
  field.update([1, 2, 10, 20, 100, 200, 0.5, 1], { autoColor: 1 })
  const previous = heatValues(field)
  assert.deepEqual(previous, [0.5, 1, 0.5, 1, 0.5, 1, 0.5, 1])
  field.update([1, 2, 1000, 2000, 100, 400, 0.5, 1], { autoColor: 1 })
  const current = heatValues(field)
  assert.deepEqual(current.slice(0, 2), previous.slice(0, 2), 'back pressure does not rescale head colors')
  assert.deepEqual(current.slice(2, 4), previous.slice(2, 4), 'the same back ratio keeps its color')
  assert.deepEqual(current.slice(4, 6), [0.25, 1], 'a changed leg peak only rescales that leg')
  assert.deepEqual(current.slice(6, 8), previous.slice(6, 8), 'the other combined leg retains its own colors')
  assert.deepEqual(field.stats.rangeMaxByRegion, { head: 2, back: 2000, 'left-leg': 400, 'right-leg': 1 })
  assert.equal(field.stats.rangeMax, 2000)
  field.dispose()
})

test('regional automatic ranges clear each frame and manual colors remain shared without changing readings', async () => {
  const regions = ['head', 'back', 'left-arm', 'right-arm', 'left-leg', 'right-leg']
  const { field } = await createFixture({ sensors: regionalSensors(regions) })
  const source = [4, 2, NaN, -1, 0]
  const original = [...source]
  field.update([40, 20, 10, 5, 2, 1], { autoColor: 1 })
  field.update(source, { autoColor: 1, filter: 2 })
  assert.deepEqual(heatValues(field), [1, 0, 0, 0, 0, 0])
  assert.deepEqual(field.stats.rangeMaxByRegion, {
    head: 4, back: 4.6, 'left-arm': 4.6, 'right-arm': 4.6, 'left-leg': 4.6, 'right-leg': 4.6,
  })
  assert.equal(field.stats.activeCount, 1)
  assert.equal(field.stats.rangeMax, 4)
  field.update([], { autoColor: 1 })
  assert.deepEqual(heatValues(field), [0, 0, 0, 0, 0, 0])
  assert.deepEqual(field.stats.rangeMaxByRegion, Object.fromEntries(regions.map(region => [region, 4.6])))
  assert.equal(field.stats.activeCount, 0)
  assert.equal(field.stats.maxValue, 0)
  assert.equal(field.stats.rangeMax, 4.6)
  field.update(source, { autoColor: 1 })
  assert.deepEqual(heatValues(field), [1, 1, 0, 0, 0, 0])
  field.update(source, { autoColor: 0, color: 8 })
  assert.deepEqual(heatValues(field), [0.5, 0.25, 0, 0, 0, 0])
  assert.deepEqual(field.stats.rangeMaxByRegion, Object.fromEntries(regions.map(region => [region, 8])))
  assert.equal(field.stats.rangeMax, 8)
  assert.equal(field.update(source, { color: 8 }), false, 'automatic colors remain disabled by default')
  assert.deepEqual(heatValues(field), [0.5, 0.25, 0, 0, 0, 0])
  assert.deepEqual(source, original)
  field.dispose()
})

test('color adjustment warms or cools independently normalized regions while automatic colors stay enabled', async () => {
  const { field } = await createFixture({ sensors: regionalSensors(['head', 'head', 'back', 'back']) })
  const source = new Float32Array([1, 4, 2.5, 10])
  const original = source.slice()
  const texture = field.texture
  const xyz = [...texture.image.data].filter((_, index) => index % 4 !== 3)
  const settings = { autoColor: 1, color: 4.6 }
  for (const [color, heat, ranges, summary] of [
    [2.3, [0.5, 1, 0.5, 1], { head: 2, back: 5 }, 5],
    [4.6, [0.25, 1, 0.25, 1], { head: 4, back: 10 }, 10],
    [9.2, [0.125, 0.5, 0.125, 0.5], { head: 8, back: 20 }, 20],
  ]) {
    settings.color = color
    field.update(source, settings)
    assert.deepEqual(heatValues(field), heat)
    assert.deepEqual(field.stats.rangeMaxByRegion, ranges)
    assert.equal(field.stats.rangeMax, summary)
    assert.equal(field.stats.maxValue, 10, 'color adjustment cannot change measured pressure')
    assert.equal(settings.autoColor, 1, 'moving the color control preserves automatic mode')
    assert.equal(field.texture, texture)
    for (const pass of field.heatMaterials) assert.equal(pass.uniforms.uSensorData.value, texture)
    assert.deepEqual([...texture.image.data].filter((_, index) => index % 4 !== 3), xyz)
    assert.deepEqual(source, original)
  }
  field.dispose()
})

test('actual combined-foot frames retain independent left and right automatic colors through color adjustment', async () => {
  const archive = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../client/public/model/mannequin_sensor_layout_637.json'), 'utf8'))
  const { buildMannequinSensorLayout, readMannequinSensorValues } = await import(pathToFileURL(path.resolve(__dirname, '../client/src/util/mannequinSensorLayout.js')).href)
  const sensors = buildMannequinSensorLayout(archive)
  const { field } = await createFixture({ sensors })
  const point = (canvasId, row) => sensors.find(sensor => sensor.canvasId === canvasId && sensor.row === row && sensor.col === 1)
  // Keep the input channels fixed; horizontal reversal moves them to model columns 4 and 3.
  const selected = [point('left-leg', 4), point('left-leg', 3), point('right-leg', 4), point('right-leg', 3)]
  assert.deepEqual(selected.map(sensor => sensor.combinedDisplayIndex), [16, 18, 0, 2])
  const combined = new Array(24 * 64).fill(0)
  combined[0] = 4
  combined[2] = 8
  combined[16] = 1
  combined[18] = 2
  const frame = { foot: combined }
  const values = readMannequinSensorValues(sensors, frame)
  const initialValues = values.slice()
  assert.deepEqual(selected.map(sensor => values[sensor.index]), [1, 2, 4, 8])
  const selectedHeat = () => selected.map(sensor => field.texture.image.data[sensor.index * 4 + 3])
  field.update(values, { autoColor: 1 })
  assert.deepEqual(selectedHeat(), [0.5, 1, 0.5, 1])
  assert.equal(field.stats.rangeMaxByRegion['left-leg'], 2)
  assert.equal(field.stats.rangeMaxByRegion['right-leg'], 8)
  combined[2] = 16
  const frameBefore = structuredClone(frame)
  const nextValues = readMannequinSensorValues(sensors, frame)
  const nextValuesBefore = nextValues.slice()
  field.update(nextValues, { autoColor: 1 })
  assert.deepEqual(selectedHeat(), [0.5, 1, 0.25, 1], 'changing the source-left peak only affects the right model leg')
  field.update(nextValues, { autoColor: 1, color: 9.2 })
  assert.deepEqual(selectedHeat(), [0.25, 0.5, 0.125, 0.5])
  assert.equal(field.stats.rangeMaxByRegion['left-leg'], 4)
  assert.equal(field.stats.rangeMaxByRegion['right-leg'], 32)
  assert.equal(field.stats.rangeMax, 32)
  assert.equal(field.stats.maxValue, 16)
  assert.equal(field.stats.activeCount, 4)
  assert.equal(heatValues(field).filter(heat => heat > 0).length, 4)
  assert.deepEqual(values, initialValues)
  assert.deepEqual(nextValues, nextValuesBefore)
  assert.deepEqual(frame, frameBefore)
  field.dispose()
})

test('disposing releases the shared measurement texture and three passes once while retaining model geometry', async () => {
  const { field, geometries } = await createFixture()
  const resources = [field.material, ...field.heatMaterials, field.texture]
  assert.equal(new Set(resources).size, 4)
  const counts = new Map(resources.map(resource => [resource, 0]))
  resources.forEach(resource => resource.addEventListener('dispose', () => counts.set(resource, counts.get(resource) + 1)))
  let geometryDisposals = 0
  geometries.forEach(geometry => geometry.addEventListener('dispose', () => { geometryDisposals++ }))
  field.dispose()
  field.dispose()
  counts.forEach(count => assert.equal(count, 1))
  assert.equal(geometryDisposals, 0, 'shared GLB geometry remains owned by the model')
  assert.equal(field.update([1, 2]), false)
})
