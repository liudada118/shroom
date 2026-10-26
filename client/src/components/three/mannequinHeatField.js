import * as THREE from 'three'
import { createReferenceHumanShaders, REFERENCE_CRYSTAL_DEFAULTS } from './mannequinReferenceShaders.js'

const DEFAULT_SETTINGS = { height: 80, gauss: 2, color: 4.6, filter: 0, autoColor: 0 }
const CRYSTAL_MODEL_COLOR = '#ffffff'

/** Read the display-aligned position, falling back to the archived world coordinates. */
function coordinatesOf(sensor) {
  const point = sensor.position || sensor
  const values = [point.x, point.y, point.z].map(Number)
  if (!values.every(Number.isFinite)) throw new Error('人体传感点缺少有效三维坐标')
  return values
}

/** Adapt the 637 pressure samples to the reference project's exact crystal renderer. */
export function createMannequinHeatField(sensors, normalizedModel) {
  if (!Array.isArray(sensors) || !sensors.length) throw new Error('人体热力场需要有效传感点位')
  if (!normalizedModel?.isObject3D) throw new Error('人体热力场需要已归一化的模型')
  const positions = sensors.map(coordinatesOf)
  const sensorCount = sensors.length
  // Head/back and left/right legs remain independent even when their readings share one matrix.
  const regionKeys = sensors.map(sensor => sensor.canvasId || sensor.sourceKey || 'default')
  const regions = [...new Set(regionKeys)]
  const regionIndices = regionKeys.map(key => regions.indexOf(key))
  const regionMaxima = new Float64Array(regions.length)
  const regionRanges = new Float64Array(regions.length)
  const sensorData = new Float32Array(sensorCount * 4)
  positions.forEach((point, index) => sensorData.set(point, index * 4))
  const texture = new THREE.DataTexture(sensorData, sensorCount, 1, THREE.RGBAFormat, THREE.FloatType)
  texture.minFilter = THREE.NearestFilter
  texture.magFilter = THREE.NearestFilter
  texture.generateMipmaps = false
  texture.needsUpdate = true
  const { vertexShader, crystalShellFragmentShader, exactCrystalHeatOverlayFragmentShader } = createReferenceHumanShaders(sensorCount)
  // Preserve the reference's raw RGB uniform convention with the requested white crystal shell.
  const modelColor = new THREE.Color().setHex(parseInt(CRYSTAL_MODEL_COLOR.slice(1), 16), THREE.LinearSRGBColorSpace)
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader: crystalShellFragmentShader,
    uniforms: {
      uTransparency: { value: REFERENCE_CRYSTAL_DEFAULTS.transparency },
      uModelColor: { value: modelColor },
    },
    side: THREE.FrontSide,
    transparent: true,
    depthWrite: false,
  })
  const heatUniforms = {
    uSensorData: { value: texture },
    uSensorCount: { value: sensorCount },
    uRadius: { value: 0.1 },
    uIntensity: { value: REFERENCE_CRYSTAL_DEFAULTS.intensity },
    uColorScheme: { value: REFERENCE_CRYSTAL_DEFAULTS.colorScheme },
  }
  const heatMaterials = [THREE.BackSide, THREE.FrontSide].map((side, index) => new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader: exactCrystalHeatOverlayFragmentShader,
    uniforms: { ...heatUniforms, uHeatAlpha: { value: index ? REFERENCE_CRYSTAL_DEFAULTS.frontHeatAlpha : REFERENCE_CRYSTAL_DEFAULTS.backHeatAlpha } },
    side,
    transparent: true,
    depthWrite: false,
    depthTest: false,
  }))
  let disposed = false
  let lastRadius = -1
  const stats = {
    activeCount: 0, maxValue: 0, rangeMax: DEFAULT_SETTINGS.color, radius: 0.1,
    rangeMaxByRegion: Object.fromEntries(regions.map(key => [key, DEFAULT_SETTINGS.color])),
  }

  /** Apply existing display controls to a pressure copy; all Gaussian terms remain continuous. */
  function update(values, settings = {}) {
    if (disposed) return false
    const options = { ...DEFAULT_SETTINGS, ...settings }
    const numericHeight = Number(options.height)
    const height = Number.isFinite(numericHeight) ? Math.max(0, Math.min(200, numericHeight)) : 80
    const numericGauss = Number(options.gauss)
    const gauss = Number.isFinite(numericGauss) ? Math.max(0, Math.min(4, numericGauss)) : 2
    const radius = Math.max(0.035, Math.min(0.2, (0.035 + height * 0.000825) * (0.8 + gauss * 0.1)))
    const filter = Math.max(0, Number(options.filter) || 0)
    let maximum = 0
    regionMaxima.fill(0)
    for (let index = 0; index < sensorCount; index++) {
      const value = Number(values?.[index])
      if (Number.isFinite(value) && value > 0 && value > filter) {
        maximum = Math.max(maximum, value)
        const regionIndex = regionIndices[index]
        regionMaxima[regionIndex] = Math.max(regionMaxima[regionIndex], value)
      }
    }
    const manualMax = Number(options.color)
    const manualRange = Number.isFinite(manualMax) && manualMax > 0 ? manualMax : DEFAULT_SETTINGS.color
    const autoColor = Number(options.autoColor) === 1
    // Keep the default automatic appearance neutral; the color control still adjusts warmth.
    const referenceValue = Number(options.autoColorReference)
    const autoColorReference = Number.isFinite(referenceValue) && referenceValue > 0 ? referenceValue : DEFAULT_SETTINGS.color
    const autoRangeScale = manualRange / autoColorReference
    // rangeMax summarizes the frame for diagnostics; actual heat uses each region's own range.
    const rangeMax = autoColor && maximum > 0 ? maximum * autoRangeScale : manualRange
    regions.forEach((key, index) => {
      const range = autoColor && regionMaxima[index] > 0 ? regionMaxima[index] * autoRangeScale : manualRange
      regionRanges[index] = range
      stats.rangeMaxByRegion[key] = range
    })
    let changed = radius !== lastRadius
    let activeCount = 0
    for (let index = 0; index < sensorCount; index++) {
      const value = Number(values?.[index])
      const active = Number.isFinite(value) && value > 0 && value > filter
      const heat = active ? Math.min(1, value / regionRanges[regionIndices[index]]) : 0
      if (active) activeCount++
      if (Math.abs(sensorData[index * 4 + 3] - heat) > 0.000001) {
        sensorData[index * 4 + 3] = heat
        changed = true
      }
    }
    heatUniforms.uRadius.value = radius
    if (changed) texture.needsUpdate = true
    lastRadius = radius
    Object.assign(stats, { activeCount, maxValue: maximum, rangeMax, radius })
    return changed
  }

  /** Release the shared measurement texture once and each crystal surface pass. */
  function dispose() {
    if (disposed) return
    disposed = true
    texture.dispose()
    heatMaterials.forEach(pass => pass.dispose())
    material.dispose()
  }

  update(new Float32Array(sensorCount))
  return { material, heatMaterials, texture, update, dispose, stats }
}
