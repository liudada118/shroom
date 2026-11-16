const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const { pathToFileURL } = require('node:url')

async function fixture({ subdivisions = 1, transform = false } = {}) {
  const load = file => import(pathToFileURL(path.resolve(__dirname, file)).href)
  const [THREE, surface] = await Promise.all([
    load('../client/node_modules/three/build/three.module.js'),
    load('../client/src/components/three/mannequinMatrixSurface.js'),
  ])
  const model = new THREE.Group()
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 2, 2), new THREE.MeshBasicMaterial())
  mesh.position.set(0.5, 0.5, 0)
  model.add(mesh)
  if (transform) { model.position.set(3, 4, -2); model.scale.setScalar(2) }
  model.updateMatrixWorld(true)
  const sensors = []
  for (let row = 0; row <= subdivisions; row++) for (let col = 0; col <= subdivisions; col++) {
    const point = new THREE.Vector3(row / subdivisions, col / subdivisions, 0).applyMatrix4(model.matrixWorld)
    sensors.push({ canvasId: 'back', row: row + 1, col: col + 1, x: point.x, y: point.y, z: point.z })
  }
  const field = surface.createMannequinMatrixSurface(sensors, model)
  return { THREE, ...surface, model, mesh, sensors, field }
}

function release(f) {
  f.field.dispose()
  f.mesh.geometry.dispose()
  f.mesh.material.dispose()
}

test('matrix patches project in world space without altering model geometry or world transforms', async () => {
  const f = await fixture({ transform: true })
  const overlay = f.field.overlays[0]
  assert.equal(overlay.parent, f.mesh)
  assert.notEqual(overlay.geometry, f.mesh.geometry)
  assert.equal(f.mesh.geometry.getAttribute('aMatrixUv'), undefined)
  const position = overlay.geometry.getAttribute('position')
  const uv = overlay.geometry.getAttribute('aMatrixUv')
  const distance = overlay.geometry.getAttribute('aMatrixDistance')
  for (let index = 0; index < position.count; index++) {
    assert.ok(Math.abs(uv.getX(index) - (position.getX(index) + 0.5)) < 1e-6)
    assert.ok(Math.abs(uv.getY(index) - (position.getY(index) + 0.5)) < 1e-6)
    assert.ok(distance.getX(index) < 1e-6)
  }
  assert.deepEqual(overlay.position.toArray(), [0, 0, 0])
  release(f)
})

test('explicit matrix directions and runtime aligned coordinates determine surface UVs', async () => {
  const f = await fixture()
  f.field.dispose()
  const sensors = f.sensors.map(sensor => ({
    ...sensor, x: 900, y: 900, z: 900,
    position: { x: sensor.x, y: sensor.y, z: sensor.z },
    matrixU: 1 - (sensor.row - 1), matrixV: sensor.col - 1,
  }))
  f.field = f.createMannequinMatrixSurface(sensors, f.model)
  const geometry = f.field.overlays[0].geometry
  const position = geometry.getAttribute('position')
  const uv = geometry.getAttribute('aMatrixUv')
  for (let index = 0; index < position.count; index++) {
    assert.ok(Math.abs(uv.getX(index) - (0.5 - position.getX(index))) < 1e-6)
    assert.ok(Math.abs(uv.getY(index) - (position.getY(index) + 0.5)) < 1e-6)
  }
  release(f)
})

test('full processed matrices retain interpolated cells and weak pressure coverage and clear stale regions', async () => {
  const f = await fixture()
  const values = [1e-12, 0.5, 0, 1, 0.25, 0.75]
  const before = [...values]
  assert.equal(f.field.update([{ canvasId: 'back', width: 3, height: 2, values, rangeMax: 64.4 }]), true)
  assert.deepEqual(values, before)
  const texture = f.field.textures[0]
  assert.deepEqual([texture.image.width, texture.image.height], [3, 2])
  assert.deepEqual([...texture.image.data.filter((_, index) => index % 4 === 0)], [0, 128, 0, 255, 64, 191])
  assert.deepEqual([...texture.image.data.filter((_, index) => index % 4 === 1)], [255, 255, 0, 255, 255, 255])
  assert.equal(f.field.stats.activeCells, 5)
  assert.equal(f.field.stats.regionRanges.back, 64.4)
  assert.equal(f.field.update([{ canvasId: 'back', width: 3, height: 2, values }]), false)
  assert.equal(f.field.textures[0], texture)
  f.field.update([])
  assert.equal(f.field.stats.activeCells, 0)
  assert.ok(texture.image.data.every(value => value === 0))
  release(f)
})

test('constant pressure is invariant to calibration density and palette edits do not upload the matrix', async () => {
  const sparse = await fixture()
  const dense = await fixture({ subdivisions: 4 })
  const regions = [{ canvasId: 'back', width: 24, height: 128, values: new Float32Array(24 * 128).fill(0.25) }]
  sparse.field.update(regions)
  dense.field.update(regions)
  assert.deepEqual(sparse.field.textures[0].image.data, dense.field.textures[0].image.data)
  assert.deepEqual(
    sparse.field.overlays[0].geometry.getAttribute('aMatrixUv').array,
    dense.field.overlays[0].geometry.getAttribute('aMatrixUv').array,
  )
  const texture = sparse.field.textures[0]
  const version = texture.version
  const renderVersion = sparse.field.renderTextures[0].version
  assert.equal(sparse.field.update(regions, { colorBandRatios: [10, 20, 30, 20, 20] }), true)
  assert.equal(texture.version, version)
  assert.equal(sparse.field.renderTextures[0].version, renderVersion, 'color-only edits do not rebuild the continuous field')
  assert.deepEqual(sparse.field.materials[0].uniforms.uColorStops.value.toArray(), [0.1, 0.3, 0.6, 0.8])
  const shader = sparse.field.materials[0].fragmentShader
  assert.equal((shader.match(/texture2D\(/g) || []).length, 2, 'the smooth field and static leg registration each require one bounded sample')
  assert.doesNotMatch(shader, /for\s*\(|uSensorData|heat\s*\+=/)
  assert.match(shader, /heat = sampleValue\.r/)
  assert.doesNotMatch(shader, /sampleValue\.r \/ sampleValue\.g/, 'conditional division must not turn a smooth hotspot into a red plateau')
  const valuesBefore = texture.image.data.slice()
  const material = sparse.field.materials[0]
  const smoothVersionBefore = sparse.field.renderTextures[0].version
  const toleranceBefore = material.uniforms.uSurfaceTolerance.value
  const edgeBefore = material.uniforms.uEdgeWidth.value
  assert.equal(sparse.field.update(regions, { gauss: 3, height: 250 }), true)
  assert.ok(sparse.field.renderTextures[0].version > smoothVersionBefore)
  assert.ok(material.uniforms.uSurfaceTolerance.value > toleranceBefore)
  assert.ok(material.uniforms.uEdgeWidth.value > edgeBefore)
  assert.deepEqual(texture.image.data, valuesBefore, 'smoothing never changes the complete source matrix')
  release(sparse)
  release(dense)
})

test('distance bounds keep matrix colors off uncalibrated surfaces and dispose owns only cloned resources', async () => {
  const f = await fixture()
  f.field.dispose()
  const front = new f.THREE.Mesh(new f.THREE.PlaneGeometry(1, 1), new f.THREE.MeshBasicMaterial())
  front.position.set(0.5, 0.5, 2)
  f.model.add(front)
  f.field = f.createMannequinMatrixSurface(f.sensors, f.model)
  const frontOverlay = f.field.overlays.find(overlay => overlay.parent === front)
  assert.ok([...frontOverlay.geometry.getAttribute('aMatrixDistance').array].every(value => value > 0.4))
  const resources = [...f.field.textures, ...f.field.renderTextures, ...f.field.profileTextures, ...f.field.materials, ...f.field.overlays.map(overlay => overlay.geometry)]
  const disposalCounts = resources.map(() => 0)
  resources.forEach((resource, index) => resource.addEventListener('dispose', () => disposalCounts[index]++))
  let sourceDisposed = 0
  f.mesh.geometry.addEventListener('dispose', () => sourceDisposed++)
  f.field.dispose()
  f.field.dispose()
  assert.ok(disposalCounts.every(value => value === 1))
  assert.equal(sourceDisposed, 0)
  assert.ok(f.field.overlays.every(overlay => overlay.parent === null))
  assert.equal(f.field.update([{ canvasId: 'back', width: 1, height: 1, values: [1] }]), false)
  f.mesh.geometry.dispose()
  f.mesh.material.dispose()
  front.geometry.dispose()
  front.material.dispose()
})

test('white shell remains opaque and independent of heat alpha', async () => {
  const f = await fixture()
  const white = f.createMannequinWhiteMaterial()
  assert.equal(white.transparent, false)
  assert.equal(white.depthWrite, true)
  assert.deepEqual(white.uniforms.uModelColor.value.toArray(), [1, 1, 1])
  white.dispose()
  release(f)
})

test('continuous pressure keeps sub-byte changes and cached frames avoid reconstruction', async () => {
  const f = await fixture()
  const input = value => [{ canvasId: 'back', width: 3, height: 3, values: new Array(9).fill(value) }]
  f.field.update(input(0.00001))
  const rawBytes = f.field.textures[0].image.data.slice()
  const texture = f.field.renderTextures[0]
  const peak = () => Math.max(...texture.image.data.filter((_, i) => i % 4 === 0))
  const before = peak()
  const version = texture.version
  assert.equal(f.field.update(input(0.00002)), true)
  assert.deepEqual(f.field.textures[0].image.data, rawBytes, 'both pressures are below byte quantization')
  assert.ok(peak() > before * 1.99 && peak() < before * 2.01)
  assert.ok(texture.version > version)
  const unchangedVersion = texture.version
  assert.equal(f.field.update(input(0.00002)), false)
  assert.equal(texture.version, unchangedVersion)
  release(f)
})

test('leg overlays attach only to the source body and never clone the restored upper heat passes', async () => {
  const f = await fixture()
  f.field.dispose()
  const upperPass = new f.THREE.Mesh(f.mesh.geometry, new f.THREE.MeshBasicMaterial())
  upperPass.userData.mannequinHeatOverlay = true
  f.mesh.add(upperPass)
  f.field = f.createMannequinMatrixSurface(f.sensors, f.model)
  assert.equal(f.field.overlays.length, 1)
  assert.equal(f.field.overlays[0].parent, f.mesh)
  assert.equal(upperPass.children.length, 0)
  release(f)
  upperPass.material.dispose()
})

test('the actual model maps omitted thigh columns and interpolated hotspots into reachable matrix UVs', async () => {
  const load = file => import(pathToFileURL(path.resolve(__dirname, file)).href)
  const [THREE, { GLTFLoader }, layout, placement, display, surfaceModule, projection] = await Promise.all([
    load('../client/node_modules/three/build/three.module.js'),
    load('../client/node_modules/three/examples/jsm/loaders/GLTFLoader.js'),
    load('../client/src/util/mannequinSensorLayout.js'),
    load('../client/src/components/three/mannequinSensorPositions.js'),
    load('../client/src/util/mannequinDisplayMatrix.js'),
    load('../client/src/components/three/mannequinMatrixSurface.js'),
    load('../client/src/util/mannequinLegProjection.js'),
  ])
  const archive = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../client/public/model/mannequin_sensor_layout_637.json'), 'utf8'))
  const bytes = fs.readFileSync(path.resolve(__dirname, '../client/public/model/human3-low.glb'))
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')
  const source = gltf.scene
  source.updateMatrixWorld(true)
  const bounds = new THREE.Box3().setFromObject(source)
  const size = bounds.getSize(new THREE.Vector3())
  const center = bounds.getCenter(new THREE.Vector3())
  const scale = 8 / Math.max(size.x, size.y, size.z)
  const model = new THREE.Group()
  model.add(source)
  model.scale.setScalar(scale)
  model.position.set(-center.x * scale, -center.y * scale + size.y * scale / 2, -center.z * scale)
  model.updateMatrixWorld(true)
  const sensors = display.alignMannequinMatrixCoordinates(placement.alignMannequinHeadToDisplay(layout.buildMannequinSensorLayout(archive), model))
  const foot = new Array(24 * 64).fill(0)
  foot[18 * 24 + 10] = 64.4 // Real reproduction: previously omitted extra thigh column.
  foot[19 * 24 + 9] = 73.7 // Interpolated row and column, not a physical-grid anchor.
  foot[26 * 24 + 22] = 46.4 // Opposite source, preserving the established leg correspondence.
  const rawRegions = display.getMannequinDisplayRegions({ foot }, { filter: 0 }).filter(region => region.canvasId.endsWith('-leg'))
  const normalized = display.normalizeMannequinDisplayRegions(rawRegions, { color: 100, autoColor: 0 })
  const surface = surfaceModule.createMannequinMatrixSurface(projection.extendMannequinLegCalibration(sensors, model), model)
  try {
    surface.update(normalized)
    for (const material of surface.materials) {
      assert.equal(material.uniforms.uLegCoordinates.value, 1, 'leg edges use world coordinates instead of the low-poly vertex-distance mask')
      assert.deepEqual([material.uniforms.uLegProfile.value.image.width, material.uniforms.uLegProfile.value.image.height], [4, 128])
    }
    assert.deepEqual(surface.stats.dimensions, {
      'left-leg': [24, 128], 'right-leg': [24, 128],
    })
    const hotspots = [
      { canvasId: 'right-leg', pressure: 64.4 },
      { canvasId: 'right-leg', pressure: 73.7 },
      { canvasId: 'left-leg', pressure: 46.4 },
    ]
    const triangle = new THREE.Triangle()
    const barycentric = new THREE.Vector3()
    const point = new THREE.Vector3()
    const uvPoint = (uv, index, output) => output.set(uv.getX(index), uv.getY(index), 0)
    for (const hotspot of hotspots) {
      const region = rawRegions.find(candidate => candidate.canvasId === hotspot.canvasId)
      const cells = region.values.flatMap((value, index) => value === hotspot.pressure ? [index] : [])
      assert.ok(cells.length > 0, `${hotspot.canvasId} retains ${hotspot.pressure} kPa after 2D layout processing`)
      const overlays = surface.overlays.filter(overlay => overlay.userData.mannequinMatrixRegion === hotspot.canvasId)
      const texture = surface.textures[surface.overlays.indexOf(overlays[0])]
      for (const index of cells) {
        assert.equal(texture.image.data[index * 4], Math.round(hotspot.pressure / 100 * 255))
        assert.equal(texture.image.data[index * 4 + 1], 255)
      }
      // A data upload alone is insufficient: an actual body triangle must reach its texture cells.
      const target = cells[Math.floor(cells.length / 2)]
      point.set((target % region.width) / (region.width - 1), Math.floor(target / region.width) / (region.height - 1), 0)
      let reachable = false
      for (const overlay of overlays) {
        const geometry = overlay.geometry
        const uv = geometry.getAttribute('aMatrixUv')
        const distance = geometry.getAttribute('aMatrixDistance')
        const indices = geometry.getIndex()
        const count = indices ? indices.count : uv.count
        for (let index = 0; index < count; index += 3) {
          const a = indices ? indices.getX(index) : index
          const b = indices ? indices.getX(index + 1) : index + 1
          const c = indices ? indices.getX(index + 2) : index + 2
          uvPoint(uv, a, triangle.a)
          uvPoint(uv, b, triangle.b)
          uvPoint(uv, c, triangle.c)
          if (triangle.getArea() < 1e-10) continue
          triangle.getBarycoord(point, barycentric)
          if (Math.min(barycentric.x, barycentric.y, barycentric.z) < -1e-6) continue
          const interpolatedDistance = distance.getX(a) * barycentric.x + distance.getX(b) * barycentric.y + distance.getX(c) * barycentric.z
          if (interpolatedDistance < 0.10) { reachable = true; break }
        }
        if (reachable) break
      }
      assert.ok(reachable, `${hotspot.canvasId} hotspot ${hotspot.pressure} kPa reaches the calibrated model surface`)
    }
    for (const [canvasId, maximum] of [['right-leg', 73.7], ['left-leg', 46.4]]) {
      const overlay = surface.overlays.find(candidate => candidate.userData.mannequinMatrixRegion === canvasId)
      const red = surface.textures[surface.overlays.indexOf(overlay)].image.data.filter((_, index) => index % 4 === 0)
      assert.equal(Math.max(...red), Math.round(maximum / 100 * 255))
      const continuous = overlay.material.uniforms.uMatrix.value.image
      assert.ok(continuous.width > 24 && continuous.height > 128)
      const smoothed = continuous.data.filter((_, index) => index % 4 === 0)
      assert.ok(Math.max(...smoothed) > 0)
      assert.ok(Math.max(...smoothed) <= maximum / 100 + 1e-6, 'reconstruction never increases the calibrated intensity')
    }
  } finally {
    surface.dispose()
    model.traverse(object => {
      object.geometry?.dispose()
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) material?.dispose()
    })
  }
})
