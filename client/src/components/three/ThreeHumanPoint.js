import React, { memo, useEffect, useImperativeHandle, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { TrackballControls } from 'three/examples/jsm/controls/TrackballControls'
import { beginDynamicColorFrame, setDynamicGammaColorEnabled } from '../../assets/util/line'
import { WebGLCanvas } from '../webgl/WebGL.HeatMap copy 2'
import { getSettingValue } from '../../store/equipStore'
import { cleanupThree } from '../../util/disposeThree'
import { animateCameraZoom, applyZoomBounds, bindZoomValueSync, getZoomValueFromCamera } from '../../util/threeZoom'

const MODEL_PATH = './model/human_matrix_atlas_rectangular_less_spike_long_legs_vfixed_arm_hflip_swap_lr.glb'
const UV_CANVAS_SIZE = 512
const HEATMAP_FRAME_MS = 100
const HUMAN_COLOR_SCOPE = 'endi-human-atlas'
const DEFAULT_COLOR_MAX = 120
const HUMAN_HEATMAP_MATERIAL_NAMES = ['Posterior_Matrix_Atlas']
const TEXTURE_BASE_COLOR = '#ffffff'
const DEFAULT_HEAT_RADIUS_SCALE = 0.64
const HUMAN_POSITION_LIMIT = 80
const HUMAN_POSITION_STEP = 0.1
const HUMAN_POSITION_AXES = ['x', 'y', 'z']
const DEFAULT_HUMAN_POSITION = { x: 0, y: -54.7, z: -39 }

function formatDisplacementValue(value) {
  const numericValue = Number(value)
  return Number.isFinite(numericValue) ? numericValue.toFixed(2) : '0.00'
}

const HUMAN_ATLAS_GRID_SIZE = 40
const HUMAN_ATLAS_UV_LAYOUT = {
  back_head: { x: 26, y: 0, w: 9, h: 5 },
  back_torso: { x: 12, y: 0, w: 12, h: 22 },
  left_back_arm: { x: 12, y: 24, w: 18, h: 2 },
  right_back_arm: { x: 12, y: 28, w: 18, h: 2 },
  left_back_leg: { x: 0, y: 0, w: 4, h: 32 },
  right_back_leg: { x: 6, y: 0, w: 4, h: 32 },
  posterior_other: { x: 26, y: 7, w: 4, h: 4 },
  front_compressed_uv: { x: 36, y: 36, w: 4, h: 4 },
}

function toCanvasAtlasRegion(region) {
    return {
        left: region.x,
        top: region.y,
        width: region.w,
        height: region.h,
    }
}

const HUMAN_ATLAS_UV_REGIONS = Object.fromEntries(
  Object.entries(HUMAN_ATLAS_UV_LAYOUT).map(([key, region]) => [key, toCanvasAtlasRegion(region)])
)

function getSmoothUvRegion(regionName, regionMap = HUMAN_ATLAS_UV_REGIONS) {
  const region = regionMap[regionName] || HUMAN_ATLAS_UV_REGIONS[regionName]
  if (!region) return { x: 0, y: 0, w: 0, h: 0 }
  return {
    x: region.left / HUMAN_ATLAS_GRID_SIZE * UV_CANVAS_SIZE,
    y: region.top / HUMAN_ATLAS_GRID_SIZE * UV_CANVAS_SIZE,
    w: region.width / HUMAN_ATLAS_GRID_SIZE * UV_CANVAS_SIZE,
    h: region.height / HUMAN_ATLAS_GRID_SIZE * UV_CANVAS_SIZE,
  }
}

const HUMAN_TEXTURE_PARTS = [
  { key: 'head', dataKey: 'jacket', sourceWidth: 24, sourceX: 3, sourceY: 0, width: 18, height: 10, regionName: 'back_head' },
  { key: 'backTorso', dataKey: 'jacket', sourceWidth: 24, sourceX: 0, sourceY: 10, width: 24, height: 44, regionName: 'back_torso' },
  { key: 'leftHand', width: 36, height: 4, regionName: 'left_back_arm' },
  { key: 'rightHand', width: 36, height: 4, regionName: 'right_back_arm' },
  {
    key: 'leftFoot',
    width: 8,
    height: 64,
    regionName: 'left_back_leg',
    sources: [
      { dataKey: 'leftFoot', sourceWidth: 12, sourceX: 0, sourceY: 0 },
      { dataKey: 'foot', sourceWidth: 24, sourceX: 0, sourceY: 0 },
    ],
  },
  {
    key: 'rightFoot',
    width: 8,
    height: 64,
    regionName: 'right_back_leg',
    sources: [
      { dataKey: 'rightFoot', sourceWidth: 12, sourceX: 4, sourceY: 0 },
      { dataKey: 'foot', sourceWidth: 24, sourceX: 16, sourceY: 0 },
    ],
  },
]

function normalizeMatrixData(source, size) {
  const raw = source?.arr ?? source?.data ?? source?.default ?? source
  const arr = Array.isArray(raw) || ArrayBuffer.isView(raw) ? raw : []
  return Array.from({ length: size }, (_, index) => {
    const value = Number(arr[index])
    return Number.isFinite(value) ? value : 0
  })
}

function getPartFrameSource(frame, part, sourceConfig = part) {
  if (!frame || !part?.key) return []
  const key = sourceConfig.dataKey || part.dataKey || part.key
  return frame[key]
    ?? frame[`endi-${key}`]
    ?? frame[part.key]
    ?? frame[`endi-${part.key}`]
    ?? frame[part.labelKey]
    ?? frame[part.fullKey]
    ?? []
}

function hasMatrixSource(source) {
  const raw = source?.arr ?? source?.data ?? source?.default ?? source
  return (Array.isArray(raw) || ArrayBuffer.isView(raw)) && raw.length > 0
}

function extractPartMatrixData(source, part, sourceConfig = part) {
  const sourceWidth = Number(sourceConfig.sourceWidth) || Number(part.sourceWidth) || part.width
  const sourceX = Number(sourceConfig.sourceX ?? part.sourceX) || 0
  const sourceY = Number(sourceConfig.sourceY ?? part.sourceY) || 0
  const sourceHeight = sourceY + part.height
  const sourceMatrix = normalizeMatrixData(source, sourceWidth * sourceHeight)

  if (sourceWidth === part.width && sourceX === 0 && sourceY === 0) {
    return sourceMatrix.slice(0, part.width * part.height)
  }

  const data = []
  for (let row = 0; row < part.height; row++) {
    for (let col = 0; col < part.width; col++) {
      data.push(sourceMatrix[(sourceY + row) * sourceWidth + sourceX + col] || 0)
    }
  }
  return data
}

function getPartMatrixData(frame, part) {
  const sources = Array.isArray(part.sources) && part.sources.length ? part.sources : [part]
  for (const sourceConfig of sources) {
    const source = getPartFrameSource(frame, part, sourceConfig)
    if (hasMatrixSource(source)) {
      return extractPartMatrixData(source, part, sourceConfig)
    }
  }
  return new Array(part.width * part.height).fill(0)
}

function getFrameValues(frame) {
  return HUMAN_TEXTURE_PARTS.flatMap((part) => getPartMatrixData(frame, part))
}

function getFrameMax(values) {
  return values.reduce((max, value) => {
    const numericValue = Number(value)
    return Number.isFinite(numericValue) ? Math.max(max, numericValue) : max
  }, 0)
}

function paintTextureBase(ctx) {
  ctx.clearRect(0, 0, UV_CANVAS_SIZE, UV_CANVAS_SIZE)
  ctx.fillStyle = TEXTURE_BASE_COLOR
  ctx.fillRect(0, 0, UV_CANVAS_SIZE, UV_CANVAS_SIZE)
}

function createCanvasTexture(canvas) {
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.flipY = false
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.needsUpdate = true
  return texture
}

function createWhiteBaseTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = UV_CANVAS_SIZE
  canvas.height = UV_CANVAS_SIZE
  const ctx = canvas.getContext('2d')
  if (ctx) {
    paintTextureBase(ctx)
  }
  return createCanvasTexture(canvas)
}

function getAtlasPointRadius(part, width, matrixHeight, heightValue, regionMap) {
  const region = getSmoothUvRegion(part.regionName, regionMap)
  const cellW = region.w / width
  const cellH = region.h / matrixHeight
  const settingHeight = Number(heightValue)
  const heightRatio = Number.isFinite(settingHeight) && settingHeight > 0 ? Math.max(0.5, Math.min(3, settingHeight / 80)) : 1
  return Math.max(cellW, cellH) * DEFAULT_HEAT_RADIUS_SCALE * heightRatio
}

function buildHumanAtlasHeatmapData(frame, filterValue, heightValue, regionMap) {
  const data = []
  HUMAN_TEXTURE_PARTS.forEach((part) => {
    const matrix = getPartMatrixData(frame, part)
    const { width, height } = part
    const region = getSmoothUvRegion(part.regionName, regionMap)
    if (!region.w || !region.h) return
    const cellW = region.w / width
    const cellH = region.h / height
    const radius = getAtlasPointRadius(part, width, height, heightValue, regionMap)

    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const value = matrix[row * width + col]
        data.push([
          region.x + col * cellW + cellW / 2,
          region.y + row * cellH + cellH / 2,
          value >= filterValue ? value : 0,
          radius + 1,
        ])
      }
    }
  })
  return data
}

function drawHumanHeatmap(canvas, frame, webglHeatmap, regionMap) {
  if (!canvas || !webglHeatmap) return
  const ctx = canvas.getContext?.('2d')
  if (!ctx) return
  const settingValue = getSettingValue?.() || {}
  const fallbackMax = Number(settingValue.color) > 0 ? Number(settingValue.color) : DEFAULT_COLOR_MAX
  const filterValue = Math.max(0, Number(settingValue.filter) || 0)
  const values = getFrameValues(frame)
  const frameMax = getFrameMax(values)
  setDynamicGammaColorEnabled(Boolean(settingValue.autoColor), HUMAN_COLOR_SCOPE)
  const dynamicMax = beginDynamicColorFrame(values, fallbackMax, HUMAN_COLOR_SCOPE)
  const colorMax = Boolean(settingValue.autoColor)
    ? Math.max(dynamicMax || 0, frameMax, fallbackMax)
    : fallbackMax

  const sourceCanvas = webglHeatmap.render(
    {
      width: UV_CANVAS_SIZE,
      height: UV_CANVAS_SIZE,
      radius: getAtlasPointRadius(
        HUMAN_TEXTURE_PARTS[0],
        HUMAN_TEXTURE_PARTS[0].width,
        HUMAN_TEXTURE_PARTS[0].height,
        settingValue.height,
        regionMap
      ),
      max: colorMax,
      min: 0,
      filter: filterValue,
      blurFactor: 0.46,
      class: 'endi-human-atlas',
    },
    buildHumanAtlasHeatmapData(frame, filterValue, settingValue.height, regionMap),
    'endi-human-atlas-webgl'
  )?.[0]

  paintTextureBase(ctx)
  if (sourceCanvas) {
    ctx.drawImage(sourceCanvas, 0, 0, UV_CANVAS_SIZE, UV_CANVAS_SIZE)
  }
}

function applyTextureToModel(model, heatmapTexture, baseTexture) {
  const applyTextureToMaterial = (material, texture) => {
    if (!material) return
    material.map = texture
    material.color?.set?.(0xffffff)
    material.metalness = 0
    material.roughness = 1
    material.envMapIntensity = 0
    material.side = THREE.DoubleSide
    material.needsUpdate = true
  }

  const allMaterials = []
  const targetMaterials = []
  model.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
    materials.forEach((material) => {
      if (material && !allMaterials.includes(material)) {
        allMaterials.push(material)
      }
      if (HUMAN_HEATMAP_MATERIAL_NAMES.includes(material?.name)) {
        targetMaterials.push(material)
      }
    })
  })

  if (targetMaterials.length) {
    allMaterials.forEach((material) => {
      applyTextureToMaterial(
        material,
        targetMaterials.includes(material) ? heatmapTexture : baseTexture
      )
    })
    return
  }

  allMaterials.forEach((material) => applyTextureToMaterial(material, heatmapTexture))
}

function fitModelToScene(model) {
  const box = new THREE.Box3().setFromObject(model)
  const size = new THREE.Vector3()
  const center = new THREE.Vector3()
  box.getSize(size)
  box.getCenter(center)
  model.position.sub(center)
  const maxAxis = Math.max(size.x, size.y, size.z) || 1
  const scale = 82 / maxAxis
  model.scale.setScalar(scale)
  model.rotation.y = Math.PI
  model.position.set(DEFAULT_HUMAN_POSITION.x, DEFAULT_HUMAN_POSITION.y, DEFAULT_HUMAN_POSITION.z)
  model.traverse((obj) => {
    if (!obj.isMesh) return
    obj.castShadow = false
    obj.receiveShadow = false
    if (obj.material) {
      obj.material.side = THREE.DoubleSide
      obj.material.needsUpdate = true
    }
  })
}

const ThreeHumanPoint = memo(React.forwardRef((props, ref) => {
  const { changeViewProp, sitData } = props
  const [humanDisplacement, setHumanDisplacement] = useState(DEFAULT_HUMAN_POSITION)
  const [isDisplacementPanelCollapsed, setIsDisplacementPanelCollapsed] = useState(true)
  const mountRef = useRef(null)
  const cameraRef = useRef(null)
  const controlsRef = useRef(null)
  const frameRef = useRef(null)
  const cleanupZoomRef = useRef(null)
  const baseDistanceRef = useRef(120)
  const textureCanvasRef = useRef(null)
  const textureRef = useRef(null)
  const whiteTextureRef = useRef(null)
  const lastHeatmapAtRef = useRef(0)
  const webglHeatmapRef = useRef(null)
  const modelRef = useRef(null)
  const uvRegionsRef = useRef(HUMAN_ATLAS_UV_REGIONS)

  const updateHumanDisplacement = (axis, value) => {
    const numericValue = Number(value)
    if (!Number.isFinite(numericValue)) return
    setHumanDisplacement((prev) => {
      const next = { ...prev, [axis]: numericValue }
      if (modelRef.current) {
        modelRef.current.position.set(next.x, next.y, next.z)
      }
      return next
    })
  }

  useImperativeHandle(ref, () => ({
    changeCamera(value, options = {}) {
      const camera = cameraRef.current
      const controls = controlsRef.current
      animateCameraZoom({
        camera,
        controls,
        baseDistance: baseDistanceRef.current,
        zoomValue: value,
        duration: options.duration ?? 0,
      })
      controls?.update?.()
    },
    reset3D() {
      const camera = cameraRef.current
      const controls = controlsRef.current
      if (!camera || !controls) return
      camera.position.set(0, 8, 120)
      controls.target.set(0, 0, 0)
      controls.reset()
      controls.update()
      changeViewProp?.(getZoomValueFromCamera(camera, controls, baseDistanceRef.current))
    },
    actionSit() {
      const camera = cameraRef.current
      const controls = controlsRef.current
      if (!camera || !controls) return
      controls.target.set(0, 0, 0)
      controls.update()
    },
    changePointRotation() {},
  }), [changeViewProp])

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return undefined

    const width = window.innerWidth
    const height = window.innerHeight
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x000000)
    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 2000)
    camera.position.set(0, 8, 120)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setSize(width, height)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    mount.appendChild(renderer.domElement)

    const controls = new TrackballControls(camera, renderer.domElement)
    controls.rotateSpeed = 2.2
    controls.zoomSpeed = 1.1
    controls.panSpeed = 0.6
    controls.staticMoving = false
    controls.dynamicDampingFactor = 0.12
    controls.target.set(0, 0, 0)
    controls.update()

    baseDistanceRef.current = camera.position.distanceTo(controls.target)
    applyZoomBounds(controls, baseDistanceRef.current)
    cleanupZoomRef.current = bindZoomValueSync({
      camera,
      controls,
      baseDistance: baseDistanceRef.current,
      onChange: changeViewProp,
    })

    scene.add(new THREE.AmbientLight(0xffffff, 1.4))
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.8)
    keyLight.position.set(30, 80, 120)
    scene.add(keyLight)
    const fillLight = new THREE.DirectionalLight(0x8fbfff, 0.8)
    fillLight.position.set(-80, 20, 60)
    scene.add(fillLight)

    const loader = new GLTFLoader()
    webglHeatmapRef.current = new WebGLCanvas()
    let disposed = false

    loader.load(MODEL_PATH, (gltf) => {
      if (disposed) return
      const model = gltf.scene
      fitModelToScene(model)
      modelRef.current = model
      setHumanDisplacement({
        x: model.position.x,
        y: model.position.y,
        z: model.position.z,
      })
      const textureCanvas = document.createElement('canvas')
      textureCanvas.width = UV_CANVAS_SIZE
      textureCanvas.height = UV_CANVAS_SIZE
      drawHumanHeatmap(textureCanvas, sitData?.current, webglHeatmapRef.current, uvRegionsRef.current)

      const texture = createCanvasTexture(textureCanvas)
      const whiteTexture = createWhiteBaseTexture()
      textureCanvasRef.current = textureCanvas
      textureRef.current = texture
      whiteTextureRef.current = whiteTexture
      applyTextureToModel(model, texture, whiteTexture)
      scene.add(model)
    })

    cameraRef.current = camera
    controlsRef.current = controls

    const animate = () => {
      controls.update()
      const now = performance.now()
      if (textureCanvasRef.current && textureRef.current && now - lastHeatmapAtRef.current >= HEATMAP_FRAME_MS) {
        drawHumanHeatmap(textureCanvasRef.current, sitData?.current, webglHeatmapRef.current, uvRegionsRef.current)
        textureRef.current.needsUpdate = true
        lastHeatmapAtRef.current = now
      }
      renderer.render(scene, camera)
      frameRef.current = requestAnimationFrame(animate)
    }
    animate()

    const handleResize = () => {
      const nextWidth = window.innerWidth
      const nextHeight = window.innerHeight
      camera.aspect = nextWidth / nextHeight
      camera.updateProjectionMatrix()
      renderer.setSize(nextWidth, nextHeight)
      controls.handleResize?.()
      controls.update()
    }
    window.addEventListener('resize', handleResize)

    return () => {
      disposed = true
      window.removeEventListener('resize', handleResize)
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
      cleanupZoomRef.current?.()
      textureRef.current?.dispose?.()
      whiteTextureRef.current?.dispose?.()
      textureRef.current = null
      whiteTextureRef.current = null
      textureCanvasRef.current = null
      webglHeatmapRef.current = null
      modelRef.current = null
      cleanupThree({ scene, renderer, controls })
      if (renderer.domElement?.parentNode === mount) {
        mount.removeChild(renderer.domElement)
      }
    }
  }, [changeViewProp])

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
      <div
        style={{
          position: 'fixed',
          right: 16,
          bottom: 16,
          zIndex: 20,
          width: 236,
          padding: '10px 12px',
          borderRadius: 6,
          border: '1px solid rgba(80, 145, 255, 0.36)',
          background: 'rgba(8, 15, 26, 0.78)',
          color: '#e8f1ff',
          fontSize: 12,
          lineHeight: 1.6,
          pointerEvents: 'auto',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.28)',
          backdropFilter: 'blur(8px)',
        }}
      >
        <button
          type="button"
          onClick={() => setIsDisplacementPanelCollapsed((value) => !value)}
          style={{
            width: '100%',
            padding: 0,
            border: 0,
            outline: 'none',
            background: 'transparent',
            color: '#e8f1ff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            font: 'inherit',
            fontWeight: 600,
          }}
        >
          <span>假人位移</span>
          <span style={{ color: '#8fbfff', fontSize: 11 }}>{isDisplacementPanelCollapsed ? '展开' : '收起'}</span>
        </button>
        {!isDisplacementPanelCollapsed && (
          <div style={{ marginTop: 8 }}>
            {HUMAN_POSITION_AXES.map((axis) => (
              <div key={axis} style={{ marginTop: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span>{axis.toUpperCase()}</span>
                  <span>{formatDisplacementValue(humanDisplacement[axis])}</span>
                </div>
                <input
                  type="range"
                  min={-HUMAN_POSITION_LIMIT}
                  max={HUMAN_POSITION_LIMIT}
                  step={HUMAN_POSITION_STEP}
                  value={humanDisplacement[axis]}
                  onChange={(event) => updateHumanDisplacement(axis, event.target.value)}
                  style={{ width: '100%' }}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}))

export default ThreeHumanPoint
