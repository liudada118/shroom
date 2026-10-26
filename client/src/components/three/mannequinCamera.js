import * as THREE from 'three'
import { applyZoomBounds, getZoomDistance, getZoomValueFromCamera } from '../../util/threeZoom.js'

/** Posterior region framing; overview opens at 90% with the model slightly below the viewport center. */
export const MANNEQUIN_REGION_VIEWS = {
  upper: { label: '上身', position: [0, 5.5, -6], target: [0, 5.5, 0] },
  lower: { label: '下身', position: [0, 2, -6], target: [0, 2.5, 0] },
  overview: { label: '整体', position: [0, 4.35, -12 / 0.9], target: [0, 4.35, 0], zoom: 90 },
}

/** Animate reference camera flights while keeping the app's zoom percentage and cleanup in sync. */
export function createMannequinCamera({ camera, controls, onRegionChange, onZoomChange, now = () => performance.now() }) {
  let region = 'overview'
  let flight = null
  let overviewAutoRotate = false
  let interacting = false
  let disposed = false
  let lastTick = null
  let lastZoom = null
  const initialView = MANNEQUIN_REGION_VIEWS.overview
  camera.position.fromArray(initialView.position)
  controls.target.fromArray(initialView.target)
  let baseDistance = camera.position.distanceTo(controls.target) * (initialView.zoom ?? 100) / 100
  controls.autoRotateSpeed = 1.4
  applyZoomBounds(controls, baseDistance)

  /** All views start still; overview only rotates after the user explicitly enables it. */
  function syncRotation() {
    controls.autoRotate = !disposed && !flight && !interacting && region === 'overview' && overviewAutoRotate
  }

  /** Ignore transient flight distances so the zoom control remains meaningful for each region. */
  function syncZoom(force = false) {
    if (disposed || flight) return
    const value = getZoomValueFromCamera(camera, controls, baseDistance)
    if (force || value !== lastZoom) {
      lastZoom = value
      onZoomChange?.(value)
    }
  }

  /** Remove OrbitControls inertia before applying a programmed camera position. */
  function flushDamping() {
    controls.autoRotate = false
    const damping = controls.enableDamping
    controls.enableDamping = false
    controls.update(0)
    controls.enableDamping = damping
  }

  /** A drag or wheel action takes control immediately, cancelling any unfinished flight. */
  function startInteraction() {
    if (disposed) return
    interacting = true
    flight = null
    syncRotation()
    syncZoom()
  }

  /** Restore the selected overview rotation preference when interaction ends. */
  function endInteraction() {
    interacting = false
    syncRotation()
    syncZoom()
  }

  /** Event payloads must not be treated as a forced zoom notification. */
  function controlsChanged() {
    syncZoom()
  }

  /** Fly to the selected region's camera and orbit target, restoring its default zoom. */
  function goTo(key, { duration = 1200 } = {}) {
    const view = MANNEQUIN_REGION_VIEWS[key]
    if (disposed || !view) return
    flushDamping()
    region = key
    interacting = false
    const endPosition = new THREE.Vector3().fromArray(view.position)
    const endTarget = new THREE.Vector3().fromArray(view.target)
    baseDistance = endPosition.distanceTo(endTarget) * (view.zoom ?? 100) / 100
    applyZoomBounds(controls, baseDistance)
    flight = {
      start: now(), duration,
      startPosition: camera.position.clone(), endPosition,
      startTarget: controls.target.clone(), endTarget,
    }
    onRegionChange?.(key)
    syncRotation()
    if (duration <= 0) update(flight.start)
  }

  /** Zoom around the current region's target rather than returning to the full-body center. */
  function setZoom(value, { duration = 0 } = {}) {
    if (disposed) return
    flight = null
    flushDamping()
    const target = controls.target.clone()
    const direction = camera.position.clone().sub(target)
    if (direction.lengthSq() < 1e-8) direction.set(0, 0, -1)
    const endPosition = direction.normalize().multiplyScalar(getZoomDistance(baseDistance, value)).add(target)
    flight = {
      start: now(), duration,
      startPosition: camera.position.clone(), endPosition,
      startTarget: target, endTarget: target.clone(),
    }
    syncRotation()
    if (duration <= 0) update(flight.start)
  }

  /** Advance one animation frame; no extra RAF survives unmount or a newer camera command. */
  function update(time) {
    if (disposed) return
    const delta = lastTick === null ? 1 / 60 : Math.max(0, Math.min(0.1, (time - lastTick) / 1000))
    lastTick = time
    if (flight) {
      const progress = flight.duration <= 0 ? 1 : Math.max(0, Math.min(1, (time - flight.start) / flight.duration))
      const eased = progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2
      camera.position.lerpVectors(flight.startPosition, flight.endPosition, eased)
      controls.target.lerpVectors(flight.startTarget, flight.endTarget, eased)
      camera.lookAt(controls.target)
      if (progress < 1) return
      flight = null
      syncZoom(true)
    }
    syncRotation()
    controls.update(delta)
    syncZoom()
  }

  /** Keep manual pause in effect when returning from a local view. */
  function setAutoRotate(enabled) {
    overviewAutoRotate = Boolean(enabled)
    syncRotation()
  }

  /** Remove interaction listeners and abandon all pending camera animation state. */
  function dispose() {
    disposed = true
    flight = null
    controls.autoRotate = false
    controls.removeEventListener('start', startInteraction)
    controls.removeEventListener('end', endInteraction)
    controls.removeEventListener('change', controlsChanged)
  }

  controls.addEventListener('start', startInteraction)
  controls.addEventListener('end', endInteraction)
  controls.addEventListener('change', controlsChanged)
  syncRotation()
  syncZoom()
  return { goTo, setZoom, setAutoRotate, update, dispose }
}
