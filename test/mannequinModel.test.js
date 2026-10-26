const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')
const { pathToFileURL } = require('node:url')

async function loadActiveModelFixture() {
  const layout = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../client/public/model/mannequin_sensor_layout_637.json'), 'utf8'))
  const originalBytes = fs.readFileSync(path.resolve(__dirname, '../client/public/model', layout.model))
  assert.equal(layout.modelFingerprint, `sha256:${crypto.createHash('sha256').update(originalBytes).digest('hex')}`)
  const component = fs.readFileSync(path.resolve(__dirname, '../client/src/components/three/ThreeHumanPoint.js'), 'utf8')
  const modelUrl = component.match(/const MODEL_PATH = '([^']+)'/)[1]
  const bytes = fs.readFileSync(path.resolve(__dirname, '../client/public', modelUrl))
  const THREE = await import(pathToFileURL(path.resolve(__dirname, '../client/node_modules/three/build/three.module.js')).href)
  const { GLTFLoader } = await import(pathToFileURL(path.resolve(__dirname, '../client/node_modules/three/examples/jsm/loaders/GLTFLoader.js')).href)
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')
  const normalizeSource = component.slice(component.indexOf('function normalizeHumanModel'), component.indexOf('/** 替换 GLB'))
  const normalize = vm.runInNewContext(`${normalizeSource}\nnormalizeHumanModel`, { THREE })
  const model = normalize(gltf.scene)
  return { layout, THREE, model }
}

function disposeModel(model) {
  model.traverse(object => {
    object.geometry?.dispose()
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) material?.dispose()
  })
}

test('the active reference model preserves all 637 points from the original model archive', async () => {
  const { layout, THREE, model } = await loadActiveModelFixture()
  const bounds = new THREE.Box3().setFromObject(model)
  assert.ok(Math.abs(bounds.min.y) < 1e-5)
  assert.ok(Math.abs(bounds.max.y - 8) < 1e-5)
  for (const sensor of layout.sensors) {
    assert.ok(bounds.containsPoint(new THREE.Vector3(sensor.x, sensor.y, sensor.z)), `sensor ${sensor.index} stays within normalized model`)
  }
  const ray = new THREE.Raycaster()
  let checked = 0
  for (const canvasId of Object.keys(layout.canvases)) {
    const points = layout.sensors.filter(sensor => sensor.canvasId === canvasId)
    for (const sensor of points) {
      const position = new THREE.Vector3(sensor.x, sensor.y, sensor.z)
      ray.set(new THREE.Vector3(sensor.x, sensor.y, -10), new THREE.Vector3(0, 0, 1))
      const hits = ray.intersectObject(model, true)
      assert.ok(hits.some(hit => hit.point.distanceTo(position) < 0.015), `${canvasId} sensor ${sensor.index} is on the posterior surface`)
      checked++
    }
  }
  assert.equal(checked, 637)
  disposeModel(model)
})

test('all 45 head channels follow the 2D matrix directions on the active model without changing their readings', async () => {
  const { layout, THREE, model } = await loadActiveModelFixture()
  const { buildMannequinSensorLayout, readMannequinSensorValues } = await import(pathToFileURL(path.resolve(__dirname, '../client/src/util/mannequinSensorLayout.js')).href)
  const { alignMannequinHeadToDisplay } = await import(pathToFileURL(path.resolve(__dirname, '../client/src/components/three/mannequinSensorPositions.js')).href)
  const { createMannequinHeatField } = await import(pathToFileURL(path.resolve(__dirname, '../client/src/components/three/mannequinHeatField.js')).href)
  const { MANNEQUIN_REGION_VIEWS } = await import(pathToFileURL(path.resolve(__dirname, '../client/src/components/three/mannequinCamera.js')).href)
  const archiveBefore = JSON.stringify(layout)
  const sensors = buildMannequinSensorLayout(layout)
  const sensorsBefore = structuredClone(sensors)
  const aligned = alignMannequinHeadToDisplay(sensors, model)
  const head = aligned.filter(sensor => sensor.canvasId === 'head')
  assert.equal(head.length, 45)
  assert.equal(new Set(head.map(sensor => sensor.sourceIndex)).size, 45)
  assert.equal(new Set(head.map(sensor => sensor.displayIndex)).size, 45)
  assert.deepEqual(sensors, sensorsBefore, 'runtime placement must not alter the input layout')
  assert.equal(JSON.stringify(layout), archiveBefore, 'the original point archive stays unchanged')
  for (let index = 0; index < aligned.length; index++) {
    const sensor = aligned[index]
    if (sensor.canvasId !== 'head') assert.equal(sensor, sensors[index], 'all other regions retain their original point objects')
    else {
      const { position, ...source } = sensor
      assert.deepEqual(source, sensors[index], `head ${sensor.index} retains every channel and display mapping`)
      assert.ok(position)
    }
  }

  const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 100)
  camera.position.fromArray(MANNEQUIN_REGION_VIEWS.overview.position)
  camera.lookAt(new THREE.Vector3().fromArray(MANNEQUIN_REGION_VIEWS.overview.target))
  camera.updateMatrixWorld(true)
  const screen = sensor => new THREE.Vector3(sensor.position.x, sensor.position.y, sensor.position.z).project(camera)
  const rowValues = [...new Set(head.map(sensor => sensor.physicalRow))].sort((a, b) => a - b)
  const colValues = [...new Set(head.map(sensor => sensor.physicalCol))].sort((a, b) => a - b)
  assert.equal(rowValues.length, 5, 'the physical head block has five vertical rows')
  assert.equal(colValues.length, 9, 'the physical head block has nine horizontal columns')
  const cell = (row, col) => head.find(sensor => sensor.physicalRow === row && sensor.physicalCol === col)
  const ray = new THREE.Raycaster()
  for (const sensor of head) {
    const position = new THREE.Vector3(sensor.position.x, sensor.position.y, sensor.position.z)
    ray.set(new THREE.Vector3(position.x, position.y, -10), new THREE.Vector3(0, 0, 1))
    const hits = ray.intersectObject(model, true)
    assert.ok(hits.length, `corrected head ${sensor.index} intersects the active model`)
    assert.ok(hits[0].point.distanceTo(position) < 1e-5, `corrected head ${sensor.index} lies on the nearest posterior surface`)
  }
  for (const row of rowValues) {
    const cells = colValues.map(col => cell(row, col))
    for (const sensor of cells) assert.ok(Math.abs(sensor.position.y - cells[0].position.y) < 1e-12, 'one 2D row shares one model height')
    for (let col = 1; col < cells.length; col++) {
      assert.ok(screen(cells[col]).x > screen(cells[col - 1]).x, `physical row ${row} runs left to right on screen`)
    }
  }
  for (const col of colValues) {
    for (let row = 1; row < rowValues.length; row++) {
      assert.ok(screen(cell(rowValues[row], col)).y < screen(cell(rowValues[row - 1], col)).y,
        `physical column ${col} runs top to bottom on screen (NDC Y decreases)`)
    }
  }
  const [topRow, bottomRow] = [rowValues[0], rowValues.at(-1)]
  const [leftCol, rightCol] = [colValues[0], colValues.at(-1)]
  for (const [archiveRow, archiveCol, physicalRow, physicalCol] of [
    [1, 1, topRow, leftCol], [9, 1, topRow, rightCol],
    [1, 5, bottomRow, leftCol], [9, 5, bottomRow, rightCol],
  ]) {
    assert.equal(cell(physicalRow, physicalCol), head.find(sensor => sensor.row === archiveRow && sensor.col === archiveCol),
      `archive (${archiveRow}, ${archiveCol}) reaches the matching 2D corner`)
  }

  for (const display of [false, true]) {
    const frame = {}
    for (const sensor of sensors) {
      frame[sensor.sourceKey] ||= new Float32Array(sensor.sourceRows * sensor.sourceCols * (display ? 4 : 1))
      frame[sensor.sourceKey][display ? sensor.displayIndex : sensor.sourceIndex] = sensor.index + 1
    }
    const before = readMannequinSensorValues(sensors, frame)
    const after = readMannequinSensorValues(aligned, frame)
    assert.deepEqual(after, before, `${display ? 'display' : 'physical'} matrices retain every channel value`)
    after.forEach((value, index) => assert.equal(value, index + 1))
  }

  const field = createMannequinHeatField(aligned, model)
  try {
    const edges = [
      colValues.map(col => cell(topRow, col)), colValues.map(col => cell(bottomRow, col)),
      rowValues.map(row => cell(row, leftCol)), rowValues.map(row => cell(row, rightCol)),
    ]
    let pulses = 0
    for (const edge of edges) {
      for (const sensor of edge) {
        const jacket = new Float32Array(sensor.sourceRows * sensor.sourceCols)
        jacket[sensor.sourceIndex] = 2
        field.update(readMannequinSensorValues(aligned, { jacket }), { autoColor: 0, color: 4, filter: 0 })
        const texels = field.texture.image.data
        assert.equal(field.stats.activeCount, 1, `edge channel ${sensor.index} activates exactly one measurement`)
        for (let index = 0; index < aligned.length; index++) assert.equal(texels[index * 4 + 3], index === sensor.index ? 0.5 : 0)
        assert.deepEqual([...texels.slice(sensor.index * 4, sensor.index * 4 + 3)],
          [...new Float32Array([sensor.position.x, sensor.position.y, sensor.position.z])],
          `edge channel ${sensor.index} sends its corrected model position to the heat shader`)
        pulses++
      }
    }
    assert.equal(pulses, 28)
    assert.equal(new Set(edges.flat().map(sensor => sensor.index)).size, 24)
  } finally {
    field.dispose()
    disposeModel(model)
  }
})
