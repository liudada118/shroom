const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')
const { pathToFileURL } = require('node:url')

async function createFixture() {
  const THREE = await import(pathToFileURL(path.resolve(__dirname, '../client/node_modules/three/build/three.module.js')).href)
  const { createMannequinCamera, MANNEQUIN_REGION_VIEWS } = await import(pathToFileURL(path.resolve(__dirname, '../client/src/components/three/mannequinCamera.js')).href)
  class FakeControls extends THREE.EventDispatcher {
    constructor() {
      super()
      this.target = new THREE.Vector3()
      this.enableDamping = true
      this.autoRotate = false
      this.updates = []
    }
    update(delta) {
      this.updates.push(delta)
      this.dispatchEvent({ type: 'change' })
    }
    listenerCount(type) { return this._listeners?.[type]?.length || 0 }
  }
  let clock = 0
  const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 100)
  const controls = new FakeControls()
  const regions = []
  const zooms = []
  const rig = createMannequinCamera({
    camera, controls,
    now: () => clock,
    onRegionChange: value => regions.push(value),
    onZoomChange: value => zooms.push(value),
  })
  return {
    THREE, camera, controls, regions, zooms, rig, views: MANNEQUIN_REGION_VIEWS,
    tick(time) { clock = time; rig.update(time) },
  }
}

function vectorClose(actual, expected, message = '') {
  const values = typeof actual.toArray === 'function' ? actual.toArray() : actual
  assert.equal(values.length, expected.length)
  values.forEach((value, index) => assert.ok(Math.abs(value - expected[index]) < 1e-10,
    `${message} component ${index}: ${value} != ${expected[index]}`))
}

test('reference region poses move the camera and orbit center together over a 1200ms cubic flight', async () => {
  const f = await createFixture()
  assert.deepEqual(f.views, {
    upper: { label: '上身', position: [0, 5.5, -6], target: [0, 5.5, 0] },
    lower: { label: '下身', position: [0, 2, -6], target: [0, 2.5, 0] },
    overview: { label: '整体', position: [0, 4.35, -12 / 0.9], target: [0, 4.35, 0], zoom: 90 },
  })
  vectorClose(f.camera.position, [0, 4.35, -12 / 0.9])
  vectorClose(f.controls.target, [0, 4.35, 0])
  assert.deepEqual(f.zooms, [90])
  const oldCamera = new f.THREE.PerspectiveCamera(45, 1, 0.05, 100)
  oldCamera.position.set(0, 4, -12)
  oldCamera.lookAt(0, 4, 0)
  oldCamera.updateMatrixWorld(true)
  f.camera.lookAt(f.controls.target)
  f.camera.updateMatrixWorld(true)
  const projectBody = camera => [0, 8].map(y => new f.THREE.Vector3(0, y, 0).project(camera).y)
  const oldProjection = projectBody(oldCamera)
  const newProjection = projectBody(f.camera)
  assert.ok(Math.abs((newProjection[1] - newProjection[0]) / (oldProjection[1] - oldProjection[0]) - 0.9) < 1e-12,
    'the same body occupies 90 percent of its previous projected height')
  assert.ok((newProjection[0] + newProjection[1]) / 2 < (oldProjection[0] + oldProjection[1]) / 2,
    'the body center moves down in the viewport')
  assert.equal(f.controls.autoRotate, false)
  assert.equal(f.controls.autoRotateSpeed, 1.4)
  for (const time of [0, 500, 1500]) {
    f.tick(time)
    vectorClose(f.camera.position, [0, 4.35, -12 / 0.9], 'initial overview stays on the sensor-covered back')
    vectorClose(f.controls.target, [0, 4.35, 0])
    assert.equal(f.controls.autoRotate, false)
  }
  f.rig.goTo('upper')
  assert.deepEqual(f.regions, ['upper'])
  assert.equal(f.controls.autoRotate, false)
  f.tick(1800)
  vectorClose(f.camera.position, [0, 4.421875, -12.875], '300ms of flight uses 0.0625 easing')
  vectorClose(f.controls.target, [0, 4.421875, 0])
  f.tick(2100)
  vectorClose(f.camera.position, [0, 4.925, -29 / 3])
  vectorClose(f.controls.target, [0, 4.925, 0])
  f.tick(2700)
  vectorClose(f.camera.position, [0, 5.5, -6])
  vectorClose(f.controls.target, [0, 5.5, 0])
  assert.equal(f.zooms.at(-1), 100)
  assert.equal(f.controls.autoRotate, false)
  assert.equal(f.controls.enableDamping, true)
  f.rig.goTo('overview', { duration: 0 })
  for (const time of [3000, 4000]) {
    f.tick(time)
    vectorClose(f.camera.position, [0, 4.35, -12 / 0.9], 'reset returns to the back and stays still')
    vectorClose(f.controls.target, [0, 4.35, 0])
    assert.equal(f.zooms.at(-1), 90)
    assert.equal(f.controls.autoRotate, false)
  }
  f.rig.setZoom(100)
  vectorClose(f.controls.target, [0, 4.35, 0], 'zooming preserves the lowered body framing')
  vectorClose(f.camera.position, [0, 4.35, -12])
  assert.equal(f.controls.minDistance, 4)
  assert.equal(f.controls.maxDistance, 120)
  assert.equal(f.zooms.at(-1), 100)
  f.rig.goTo('lower', { duration: 0 })
  assert.equal(f.zooms.at(-1), 100, 'local views retain their original default zoom')
  f.rig.goTo('overview', { duration: 0 })
  vectorClose(f.camera.position, [0, 4.35, -12 / 0.9])
  vectorClose(f.controls.target, [0, 4.35, 0])
  assert.equal(f.zooms.at(-1), 90, 'returning to overview restores its default zoom')
  f.rig.dispose()
})

test('rapid region changes start a new flight continuously from the current camera and target', async () => {
  const f = await createFixture()
  f.rig.goTo('upper')
  f.tick(300)
  const position = f.camera.position.clone()
  const target = f.controls.target.clone()
  f.rig.goTo('lower')
  vectorClose(f.camera.position, position.toArray(), 'retargeting does not jump to an old endpoint')
  vectorClose(f.controls.target, target.toArray())
  f.tick(600)
  vectorClose(f.camera.position, position.clone().lerp(new f.THREE.Vector3(0, 2, -6), 0.0625).toArray())
  vectorClose(f.controls.target, target.clone().lerp(new f.THREE.Vector3(0, 2.5, 0), 0.0625).toArray())
  f.tick(1500)
  vectorClose(f.camera.position, [0, 2, -6])
  vectorClose(f.controls.target, [0, 2.5, 0])
  assert.deepEqual(f.regions, ['upper', 'lower'])
  f.rig.dispose()
})

test('manual interaction cancels an active flight and preserves the overview rotation preference', async () => {
  const f = await createFixture()
  f.rig.goTo('upper')
  f.tick(300)
  const position = f.camera.position.clone()
  const target = f.controls.target.clone()
  f.controls.dispatchEvent({ type: 'start' })
  f.tick(2000)
  vectorClose(f.camera.position, position.toArray())
  vectorClose(f.controls.target, target.toArray())
  assert.equal(f.controls.autoRotate, false)
  f.controls.dispatchEvent({ type: 'end' })
  assert.equal(f.controls.autoRotate, false, 'local views do not resume overview rotation')
  f.rig.goTo('overview', { duration: 0 })
  vectorClose(f.camera.position, [0, 4.35, -12 / 0.9])
  assert.equal(f.controls.autoRotate, false, 'overview stays still by default after a region change')
  f.controls.dispatchEvent({ type: 'start' })
  f.controls.dispatchEvent({ type: 'end' })
  assert.equal(f.controls.autoRotate, false, 'drag completion does not enable rotation by itself')
  f.rig.setAutoRotate(true)
  assert.equal(f.controls.autoRotate, true, 'rotation remains available when explicitly enabled')
  f.controls.dispatchEvent({ type: 'start' })
  assert.equal(f.controls.autoRotate, false)
  f.controls.dispatchEvent({ type: 'end' })
  assert.equal(f.controls.autoRotate, true)
  f.rig.goTo('lower', { duration: 0 })
  assert.equal(f.controls.autoRotate, false)
  f.rig.goTo('overview', { duration: 0 })
  assert.equal(f.controls.autoRotate, true, 'an explicit rotation preference resumes only in overview')
  f.rig.setAutoRotate(false)
  f.rig.goTo('lower', { duration: 0 })
  f.rig.goTo('overview', { duration: 0 })
  assert.equal(f.controls.autoRotate, false, 'returning to overview keeps a manual pause')
  f.rig.setAutoRotate(true)
  assert.equal(f.controls.autoRotate, true)
  f.rig.dispose()
})

test('local zoom keeps its orbit center and uses that region as the 100 percent baseline', async () => {
  const f = await createFixture()
  f.rig.goTo('lower', { duration: 0 })
  const base = Math.sqrt(36.25)
  const target = [0, 2.5, 0]
  assert.ok(Math.abs(f.controls.minDistance - base / 3) < 1e-12)
  assert.ok(Math.abs(f.controls.maxDistance - base * 10) < 1e-12)
  f.rig.setZoom(200)
  vectorClose(f.controls.target, target)
  vectorClose(f.camera.position, [0, 2.25, -3])
  assert.equal(f.zooms.at(-1), 200)
  f.rig.setZoom(100)
  vectorClose(f.camera.position, [0, 2, -6])
  f.rig.setZoom(500)
  assert.equal(f.zooms.at(-1), 300)
  assert.ok(Math.abs(f.camera.position.distanceTo(f.controls.target) - base / 3) < 1e-12)
  f.rig.setZoom(0)
  assert.equal(f.zooms.at(-1), 10)
  assert.ok(Math.abs(f.camera.position.distanceTo(f.controls.target) - base * 10) < 1e-12)
  f.rig.setZoom(100)
  f.rig.setZoom(200, { duration: 600 })
  f.tick(300)
  vectorClose(f.controls.target, target)
  vectorClose(f.camera.position, [0, 2.125, -4.5])
  f.tick(600)
  vectorClose(f.camera.position, [0, 2.25, -3])
  assert.equal(f.zooms.at(-1), 200)
  f.rig.dispose()
})

test('OrbitControls change event objects cannot force duplicate zoom callbacks', async () => {
  const f = await createFixture()
  assert.deepEqual(f.zooms, [90])
  for (let i = 0; i < 3; i++) f.controls.dispatchEvent({ type: 'change' })
  assert.deepEqual(f.zooms, [90])
  f.rig.goTo('lower', { duration: 0 })
  const notifications = f.zooms.length
  for (let i = 0; i < 3; i++) f.controls.dispatchEvent({ type: 'change' })
  assert.equal(f.zooms.length, notifications)
  const direction = f.camera.position.clone().sub(f.controls.target)
  f.camera.position.copy(f.controls.target).addScaledVector(direction, 0.5)
  f.controls.dispatchEvent({ type: 'change' })
  assert.equal(f.zooms.at(-1), 200)
  f.controls.dispatchEvent({ type: 'change' })
  assert.equal(f.zooms.length, notifications + 1)
  f.rig.dispose()
})

test('disposing removes controls listeners and abandons all pending camera work', async () => {
  const f = await createFixture()
  for (const event of ['start', 'end', 'change']) assert.equal(f.controls.listenerCount(event), 1)
  f.rig.goTo('upper')
  f.tick(300)
  const position = f.camera.position.clone()
  const target = f.controls.target.clone()
  const updates = f.controls.updates.length
  const notifications = f.zooms.length
  const changes = f.regions.length
  f.rig.dispose()
  f.rig.dispose()
  for (const event of ['start', 'end', 'change']) assert.equal(f.controls.listenerCount(event), 0)
  f.tick(5000)
  f.rig.goTo('lower')
  f.rig.setZoom(300)
  f.rig.setAutoRotate(true)
  for (const event of ['start', 'end', 'change']) f.controls.dispatchEvent({ type: event })
  vectorClose(f.camera.position, position.toArray())
  vectorClose(f.controls.target, target.toArray())
  assert.equal(f.controls.updates.length, updates)
  assert.equal(f.zooms.length, notifications)
  assert.equal(f.regions.length, changes)
  assert.equal(f.controls.autoRotate, false)
})
