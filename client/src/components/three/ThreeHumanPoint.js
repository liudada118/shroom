import React, { memo, useEffect, useImperativeHandle, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { getFrameProcessingSettingValue } from '../../store/equipStore'
import { cleanupThree, disposeObject } from '../../util/disposeThree'
import { buildMannequinSensorLayout, readMannequinSensorValues } from '../../util/mannequinSensorLayout'
import { getMannequinHeatmapFrame, getMannequinHeatmapMode, getMannequinHeatmapRenderSettings } from '../../util/mannequinHeatmapSource'
import { createMannequinMatrixSurface } from './mannequinMatrixSurface'
import { createMannequinHeatField } from './mannequinHeatField'
import { extendMannequinLegCalibration } from '../../util/mannequinLegProjection'
import { alignMannequinMatrixCoordinates, getMannequinDisplayRegions, normalizeMannequinDisplayRegions } from '../../util/mannequinDisplayMatrix'
import { createMannequinCamera } from './mannequinCamera'
import { alignMannequinHeadToDisplay } from './mannequinSensorPositions'
import './ThreeHumanPoint.scss'

const MODEL_PATH = './model/human3-low.glb'
const LAYOUT_PATH = './model/mannequin_sensor_layout_637.json'
const SCENE_BACKGROUND = '#000000'
const FRAME_INTERVAL = 1000 / 30

/** 固定加载参考项目的低模，加载失败时由界面提示重试。 */
async function loadHumanModel() {
  return new GLTFLoader().loadAsync(MODEL_PATH)
}

/** 使用与参考项目一致的高度 8 世界坐标，保持点表与模型原点一致。 */
function normalizeHumanModel(source) {
  source.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(source)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const scale = 8 / Math.max(size.x, size.y, size.z)
  if (!Number.isFinite(scale) || scale <= 0) throw new Error('人体模型尺寸无效')
  const group = new THREE.Group()
  group.add(source)
  group.scale.setScalar(scale)
  group.position.set(-center.x * scale, -center.y * scale + size.y * scale / 2, -center.z * scale)
  group.updateMatrixWorld(true)
  return group
}

/** 替换 GLB 材质时释放旧材质和贴图，网格本身继续用于体表热力。 */
function releaseModelMaterials(model) {
  const materials = new Set()
  const textures = new Set()
  model.traverse(object => {
    if (!object.isMesh) return
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!material || materials.has(material)) continue
      materials.add(material)
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value)
    }
  })
  textures.forEach(texture => texture.dispose())
  materials.forEach(material => material.dispose())
}

const ThreeHumanPoint = memo(React.forwardRef(({ metricData, changeViewProp }, ref) => {
  const mountRef = useRef(null)
  const runtimeRef = useRef(null)
  const dataRef = useRef(metricData)
  const zoomCallbackRef = useRef(changeViewProp)
  const [status, setStatus] = useState({ state: 'loading', message: '', count: 0 })
  const [loadAttempt, setLoadAttempt] = useState(0)
  dataRef.current = metricData
  zoomCallbackRef.current = changeViewProp

  /** 只移动相机，模型和传感点始终共用点表的世界坐标。 */
  function selectView(key) {
    runtimeRef.current?.navigation.goTo(key)
  }

  useImperativeHandle(ref, () => ({
    changeCamera(value, options = {}) {
      runtimeRef.current?.navigation.setZoom(value, options)
    },
    reset3D() { selectView('overview') },
    actionSit(type) { selectView(type === 'jacket' ? 'upper' : type === 'foot' ? 'lower' : 'overview') },
    changePointRotation(index) { selectView(['overview', 'upper', 'lower'][Number(index) % 3] || 'overview') },
  }))

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return undefined
    let disposed = false
    let animationId = 0
    let surface = null
    let upperField = null
    let upperSensors = []
    const upperOverlays = []
    let model = null
    let sensors = []
    let renderer
    let controls
    let navigation = null
    let resizeObserver
    const abort = new AbortController()
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(SCENE_BACKGROUND)
    const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 100)
    setStatus({ state: 'loading', message: '', count: 0 })

    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
      renderer.outputColorSpace = THREE.SRGBColorSpace
      renderer.toneMapping = THREE.NoToneMapping
      renderer.toneMappingExposure = 1
      renderer.domElement.setAttribute('aria-label', '假人全身体表热力三维视图')
      renderer.domElement.setAttribute('data-model-state', 'loading')
      mount.appendChild(renderer.domElement)
      controls = new OrbitControls(camera, renderer.domElement)
      controls.enableDamping = true
      controls.dampingFactor = 0.06
      controls.enablePan = false
      navigation = createMannequinCamera({ camera, controls, onZoomChange: value => zoomCallbackRef.current?.(value) })
      runtimeRef.current = { camera, controls, navigation }
    } catch (error) {
      setStatus({ state: 'error', message: `无法启动 3D 显示：${error.message}`, count: 0 })
      navigation?.dispose()
      runtimeRef.current = null
      cleanupThree({ scene, renderer, controls })
      return undefined
    }

    /** 画布跟随实际容器尺寸，兼容窗口缩放和软件视图切换。 */
    const resize = () => {
      const width = Math.max(1, mount.clientWidth)
      const height = Math.max(1, mount.clientHeight)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height, false)
    }
    resize()
    window.addEventListener('resize', resize)
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(resize)
      resizeObserver.observe(mount)
    }

    const load = async () => {
      let source = null
      try {
        const response = await fetch(LAYOUT_PATH, { signal: abort.signal })
        if (!response.ok) throw new Error(`点位文件加载失败（${response.status}）`)
        sensors = buildMannequinSensorLayout(await response.json())
        if (disposed) return
        const gltf = await loadHumanModel()
        source = gltf.scene
        if (disposed) { disposeObject(source); return }
        model = normalizeHumanModel(source)
        scene.add(model)
        sensors = alignMannequinMatrixCoordinates(alignMannequinHeadToDisplay(sensors, model))
        releaseModelMaterials(model)
        upperSensors = sensors.filter(sensor => !sensor.canvasId.endsWith('-leg')).map((sensor, index) => ({ ...sensor, index }))
        upperField = createMannequinHeatField(upperSensors, model)
        const modelMeshes = []
        model.traverse(object => {
          if (object.isMesh) modelMeshes.push(object)
        })
        modelMeshes.forEach(object => {
          object.material = upperField.material
          object.renderOrder = 9
          object.castShadow = false
          object.receiveShadow = false
          upperField.heatMaterials.forEach((material, index) => {
            const overlay = new THREE.Mesh(object.geometry, material)
            overlay.name = `mannequin-upper-heat-${index}`
            overlay.userData.mannequinHeatOverlay = true
            overlay.renderOrder = index === 0 ? 8 : 10
            object.add(overlay)
            upperOverlays.push(overlay)
          })
        })
        surface = createMannequinMatrixSurface(extendMannequinLegCalibration(sensors, model), model)
        renderer.domElement.setAttribute('data-model-state', 'ready')
        renderer.domElement.setAttribute('data-model-source', MODEL_PATH)
        renderer.domElement.setAttribute('data-sensor-count', String(sensors.length))
        renderer.domElement.setAttribute('data-heatmap-format', 'upper-point-field-lower-continuous-2d')
        setStatus({ state: 'ready', message: '', count: sensors.length })
      } catch (error) {
        if (disposed || error.name === 'AbortError') return
        if (source && !model) disposeObject(source)
        renderer.domElement.setAttribute('data-model-state', 'error')
        setStatus({ state: 'error', message: error.message || '人体模型加载失败', count: 0 })
      }
    }
    load()

    let lastFrameAt = -Infinity
    const animate = now => {
      if (disposed) return
      animationId = requestAnimationFrame(animate)
      if (document.hidden || now - lastFrameAt < FRAME_INTERVAL) return
      navigation.update(now)
      if (surface) {
        const settings = getFrameProcessingSettingValue?.() || {}
        const mode = getMannequinHeatmapMode(settings)
        const frame = getMannequinHeatmapFrame(dataRef.current?.current, settings)
        const renderSettings = getMannequinHeatmapRenderSettings(settings)
        upperField.update(readMannequinSensorValues(upperSensors, frame), renderSettings)
        const regions = getMannequinDisplayRegions(frame, renderSettings).filter(region => region.canvasId.endsWith('-leg'))
        surface.update(normalizeMannequinDisplayRegions(regions, renderSettings), renderSettings)
        if (renderer.domElement.getAttribute('data-heatmap-source') !== mode) renderer.domElement.setAttribute('data-heatmap-source', mode)
      }
      renderer.render(scene, camera)
      lastFrameAt = now
    }
    animationId = requestAnimationFrame(animate)

    return () => {
      disposed = true
      abort.abort()
      cancelAnimationFrame(animationId)
      window.removeEventListener('resize', resize)
      resizeObserver?.disconnect()
      navigation?.dispose()
      runtimeRef.current = null
      surface?.dispose()
      upperOverlays.forEach(overlay => {
        overlay.removeFromParent()
        overlay.geometry = null
        overlay.material = null
      })
      if (upperField) scene.traverse(object => { if (object.material === upperField.material) object.material = null })
      upperField?.dispose()
      cleanupThree({ scene, renderer, controls })
    }
  }, [loadAttempt])

  return (
    <div className="human-scene" data-human-state={status.state}>
      <div className="human-scene__canvas" ref={mountRef} />
      {status.state !== 'ready' && (
        <div className="human-scene__status" role={status.state === 'error' ? 'alert' : 'status'}>
          <span>{status.state === 'loading' ? '正在加载全身模型与点位…' : status.message}</span>
          {status.state === 'error' && <button type="button" onClick={() => setLoadAttempt(value => value + 1)}>重新加载</button>}
        </div>
      )}
    </div>
  )
}))

export default ThreeHumanPoint
