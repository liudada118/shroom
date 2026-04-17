import * as THREE from "three";

export const ZOOM_MIN = 10;
export const ZOOM_MAX = 300;

const EPSILON = 1e-6;
const DEFAULT_TARGET = new THREE.Vector3(0, 0, 0);

function clampZoomValue(zoomValue) {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoomValue));
}

function getTarget(controls) {
  return controls?.target || DEFAULT_TARGET;
}

function syncControlsMotionState(controls) {
  if (!controls) return;

  // Clear TrackballControls damping leftovers before programmatic zoom.
  controls._zoomStart?.copy?.(controls._zoomEnd);
  controls._panStart?.copy?.(controls._panEnd);
  controls._movePrev?.copy?.(controls._moveCurr);

  if (
    typeof controls._touchZoomDistanceStart === "number" &&
    typeof controls._touchZoomDistanceEnd === "number"
  ) {
    controls._touchZoomDistanceStart = controls._touchZoomDistanceEnd;
  }

  if (typeof controls._lastAngle === "number") {
    controls._lastAngle = 0;
  }
}

export function getZoomDistance(baseDistance, zoomValue) {
  return (baseDistance * 100) / clampZoomValue(zoomValue);
}

export function applyZoomBounds(controls, baseDistance) {
  if (!controls || !baseDistance) return;
  controls.minDistance = getZoomDistance(baseDistance, ZOOM_MAX);
  controls.maxDistance = getZoomDistance(baseDistance, ZOOM_MIN);
}

export function getZoomValueFromCamera(camera, controls, baseDistance) {
  if (!camera || !baseDistance) return 100;
  const distance = camera.position.distanceTo(getTarget(controls));
  if (!Number.isFinite(distance) || distance < EPSILON) return 100;
  return clampZoomValue(Math.round((baseDistance * 100) / distance));
}

export function bindZoomValueSync({
  camera,
  controls,
  baseDistance,
  onChange,
}) {
  if (
    !camera ||
    !controls ||
    !baseDistance ||
    typeof onChange !== "function"
  ) {
    return () => {};
  }

  let lastZoomValue = null;

  function syncZoomValue() {
    const nextZoomValue = getZoomValueFromCamera(camera, controls, baseDistance);
    if (nextZoomValue === lastZoomValue) return;
    lastZoomValue = nextZoomValue;
    onChange(nextZoomValue);
  }

  controls.addEventListener?.("change", syncZoomValue);
  syncZoomValue();

  return () => {
    controls.removeEventListener?.("change", syncZoomValue);
  };
}

export function animateCameraZoom({
  camera,
  controls,
  baseDistance,
  zoomValue,
  duration = 0,
}) {
  if (!camera || !baseDistance) return;

  syncControlsMotionState(controls);

  const target = getTarget(controls).clone();
  const startPosition = camera.position.clone();
  const direction = startPosition.clone().sub(target);
  const currentDistance = direction.length();

  if (!Number.isFinite(currentDistance) || currentDistance < EPSILON) return;

  const endPosition = direction
    .normalize()
    .multiplyScalar(getZoomDistance(baseDistance, zoomValue))
    .add(target);

  if (duration <= 0) {
    camera.position.copy(endPosition);
    controls?.update?.();
    return;
  }

  const startTime = performance.now();

  function animate(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);

    camera.position.lerpVectors(startPosition, endPosition, eased);
    controls?.update?.();

    if (progress < 1) {
      requestAnimationFrame(animate);
    }
  }

  requestAnimationFrame(animate);
}
