import * as THREE from 'three'
import { createReferenceHumanShaders } from './mannequinReferenceShaders.js'
import { getColorBandStops } from '../../util/mannequinColorBands.js'
import { createSmoothMannequinMatrix } from '../../util/mannequinSmoothMatrix.js'
import { warpMannequinLegDisplayMatrix } from '../../util/mannequinLegProjection.js'
import { createMannequinLegSurfaceCoordinates } from '../../util/mannequinLegSurfaceCoordinates.js'

const DEFAULT_TOLERANCE = 0.10
const DEFAULT_EDGE_WIDTH = 0.08

const vertexShader = `
  attribute vec2 aMatrixUv;
  attribute float aMatrixDistance;
  varying vec2 vMatrixUv;
  varying float vMatrixDistance;
  varying vec3 vMatrixWorldPosition;
  varying vec3 vMatrixWorldNormal;
  void main() {
    vMatrixUv = aMatrixUv;
    vMatrixDistance = aMatrixDistance;
    vMatrixWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    vMatrixWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const fragmentShader = `
  uniform sampler2D uMatrix;
  uniform vec2 uMatrixUvOffset;
  uniform vec2 uMatrixUvScale;
  uniform vec4 uColorStops;
  uniform float uSurfaceTolerance;
  uniform float uEdgeWidth;
  uniform float uLegCoordinates;
  uniform vec2 uLegYRange;
  uniform vec2 uLegTopX;
  uniform vec2 uLegBottomX;
  uniform float uLegSide;
  uniform sampler2D uLegProfile;
  varying vec2 vMatrixUv;
  varying float vMatrixDistance;
  varying vec3 vMatrixWorldPosition;
  varying vec3 vMatrixWorldNormal;

  vec3 heatColor(float t) {
    t = clamp(t, 0.0, 1.0);
    vec3 blue = vec3(0.30, 0.58, 0.88);
    vec3 cyan = vec3(0.0, 0.75, 0.90);
    vec3 green = vec3(0.10, 0.78, 0.35);
    vec3 yellow = vec3(1.0, 0.90, 0.10);
    vec3 orange = vec3(1.0, 0.62, 0.0);
    vec3 red = vec3(0.95, 0.04, 0.0);
    if (t < uColorStops.x) return mix(blue, cyan, t / uColorStops.x);
    if (t < uColorStops.y) return mix(cyan, green, (t - uColorStops.x) / (uColorStops.y - uColorStops.x));
    if (t < uColorStops.z) return mix(green, yellow, (t - uColorStops.y) / (uColorStops.z - uColorStops.y));
    if (t < uColorStops.w) return mix(yellow, orange, (t - uColorStops.z) / (uColorStops.w - uColorStops.z));
    return mix(orange, red, (t - uColorStops.w) / (1.0 - uColorStops.w));
  }

  void main() {
    vec2 matrixUv = clamp(vMatrixUv, 0.0, 1.0);
    float surfaceAlpha;
    if (uLegCoordinates > 0.5) {
      // Register each fragment against the continuous leg curves, independent of mesh vertices.
      float v = (uLegYRange.x - vMatrixWorldPosition.y) / (uLegYRange.x - uLegYRange.y);
      vec2 xEdges = mix(uLegTopX, uLegBottomX, v);
      float u = (vMatrixWorldPosition.x - xEdges.x) / (xEdges.y - xEdges.x);
      matrixUv = vec2(u, v);
      vec2 profileUv = (clamp(matrixUv, 0.0, 1.0) * vec2(3.0, 127.0) + 0.5) / vec2(4.0, 128.0);
      float posteriorZ = texture2D(uLegProfile, profileUv).z;
      float depth = vMatrixWorldPosition.z - posteriorZ;
      float posteriorMask = 1.0 - smoothstep(0.15, 0.65, normalize(vMatrixWorldNormal).z);
      // Depth only rejects the opposite body surface; the contact edge belongs to the smooth field.
      float sideMask = smoothstep(-0.015, 0.015, vMatrixWorldPosition.x * uLegSide);
      surfaceAlpha = posteriorMask * sideMask * (1.0 - smoothstep(0.25 + uSurfaceTolerance, 0.50 + uEdgeWidth, depth));
    } else {
      surfaceAlpha = 1.0 - smoothstep(uSurfaceTolerance, uSurfaceTolerance + uEdgeWidth, vMatrixDistance);
    }
    if (surfaceAlpha <= 0.0) discard;
    // Unclamped leg UVs reach the existing zero padding, so contact fades outside the measured patch.
    vec2 uv = uMatrixUvOffset + matrixUv * uMatrixUvScale;
    vec4 sampleValue = texture2D(uMatrix, uv);
    float coverage = sampleValue.g;
    if (coverage <= 0.000001) discard;
    // Both channels have already been reconstructed as continuous, bounded fields.
    // Coverage controls visibility independently of pressure, preserving clear low-pressure blue.
    // A small uncovered-area weight keeps sparse contacts readable without a flat red halo.
    // The denominator is always >= coverage, so the field cannot exceed its source peak.
    float heat = sampleValue.r / max(coverage + 0.20 * (1.0 - coverage), 0.20);
    float alpha = surfaceAlpha * smoothstep(0.0, 0.12, coverage);
    gl_FragColor = vec4(heatColor(heat), alpha);
  }
`

/** The existing opaque white shell is independent of the pressure texture. */
export function createMannequinWhiteMaterial() {
  const reference = createReferenceHumanShaders(1)
  return new THREE.ShaderMaterial({
    vertexShader: reference.vertexShader,
    fragmentShader: reference.opaqueWhiteShellFragmentShader,
    uniforms: { uModelColor: { value: new THREE.Color().setHex(0xffffff, THREE.LinearSRGBColorSpace) } },
    side: THREE.FrontSide,
    transparent: false,
    depthWrite: true,
  })
}

function patchPoint(sensor, rowMin, rowMax, colMin, colMax) {
  const position = sensor.position || sensor
  const coordinates = [position.x, position.y, position.z].map(Number)
  if (!coordinates.every(Number.isFinite)) throw new Error('矩阵表面点位缺少有效三维坐标')
  const u = Number(sensor.matrixU)
  const v = Number(sensor.matrixV)
  return {
    point: new THREE.Vector3(...coordinates),
    uv: new THREE.Vector2(
      Number.isFinite(u) ? u : (sensor.row - rowMin) / (rowMax - rowMin),
      Number.isFinite(v) ? v : (sensor.col - colMin) / (colMax - colMin),
    ),
  }
}

function createPatch(sensors) {
  const rows = [...new Set(sensors.map(sensor => sensor.row))].sort((a, b) => a - b)
  const cols = [...new Set(sensors.map(sensor => sensor.col))].sort((a, b) => a - b)
  if (rows.length < 2 || cols.length < 2) throw new Error('矩阵表面需要至少 2×2 标定点位')
  const points = new Map(sensors.map(sensor => [
    `${sensor.row}:${sensor.col}`,
    patchPoint(sensor, rows[0], rows.at(-1), cols[0], cols.at(-1)),
  ]))
  const triangles = []
  const bounds = new THREE.Box3()
  points.forEach(({ point }) => bounds.expandByPoint(point))
  const addTriangle = (a, b, c) => triangles.push({
    triangle: new THREE.Triangle(a.point, b.point, c.point),
    uv: [a.uv, b.uv, c.uv],
  })
  for (let row = 0; row < rows.length - 1; row++) {
    for (let col = 0; col < cols.length - 1; col++) {
      const a = points.get(`${rows[row]}:${cols[col]}`)
      const b = points.get(`${rows[row + 1]}:${cols[col]}`)
      const c = points.get(`${rows[row]}:${cols[col + 1]}`)
      const d = points.get(`${rows[row + 1]}:${cols[col + 1]}`)
      if (!a || !b || !c || !d) throw new Error('矩阵表面标定网格存在缺失点位')
      addTriangle(a, b, c)
      addTriangle(b, d, c)
    }
  }
  const curveLength = curve => curve.slice(1).reduce((sum, point, index) => sum + point.point.distanceTo(curve[index].point), 0)
  const worldWidth = cols.reduce((sum, col) => sum + curveLength(rows.map(row => points.get(`${row}:${col}`))), 0) / cols.length
  const worldHeight = rows.reduce((sum, row) => sum + curveLength(cols.map(col => points.get(`${row}:${col}`))), 0) / rows.length
  return { bounds, triangles, worldWidth, worldHeight }
}

/** Bake world-space patch coordinates once; source geometry and materials remain untouched. */
function createProjectedGeometry(mesh, patch, distanceLimit) {
  const geometry = mesh.geometry.clone()
  const position = geometry.getAttribute('position')
  const uv = new Float32Array(position.count * 2)
  const distance = new Float32Array(position.count)
  const vertex = new THREE.Vector3()
  const closest = new THREE.Vector3()
  const barycentric = new THREE.Vector3()
  const limitSquared = distanceLimit * distanceLimit
  for (let index = 0; index < position.count; index++) {
    vertex.fromBufferAttribute(position, index).applyMatrix4(mesh.matrixWorld)
    distance[index] = distanceLimit + 1
    if (patch.bounds.distanceToPoint(vertex) > distanceLimit) continue
    let minimum = Infinity
    for (const { triangle, uv: corners } of patch.triangles) {
      triangle.closestPointToPoint(vertex, closest)
      const squared = closest.distanceToSquared(vertex)
      if (squared >= minimum) continue
      minimum = squared
      triangle.getBarycoord(closest, barycentric)
      uv[index * 2] = corners[0].x * barycentric.x + corners[1].x * barycentric.y + corners[2].x * barycentric.z
      uv[index * 2 + 1] = corners[0].y * barycentric.x + corners[1].y * barycentric.y + corners[2].y * barycentric.z
    }
    if (minimum <= limitSquared) distance[index] = Math.sqrt(minimum)
  }
  geometry.setAttribute('aMatrixUv', new THREE.BufferAttribute(uv, 2))
  geometry.setAttribute('aMatrixDistance', new THREE.BufferAttribute(distance, 1))
  return geometry
}

/** Render complete, already processed 2D matrices on the calibrated body patches. */
export function createMannequinMatrixSurface(sensors, normalizedModel, options = {}) {
  if (!Array.isArray(sensors) || !sensors.length || !normalizedModel?.isObject3D) {
    throw new Error('矩阵体表渲染需要有效模型与标定点位')
  }
  const tolerance = Number.isFinite(options.surfaceTolerance) && options.surfaceTolerance > 0
    ? options.surfaceTolerance : DEFAULT_TOLERANCE
  const edgeWidth = Number.isFinite(options.edgeWidth) && options.edgeWidth > 0
    ? options.edgeWidth : DEFAULT_EDGE_WIDTH
  const grouped = new Map()
  for (const sensor of sensors) {
    if (!grouped.has(sensor.canvasId)) grouped.set(sensor.canvasId, [])
    grouped.get(sensor.canvasId).push(sensor)
  }
  normalizedModel.updateMatrixWorld(true)
  const sourceMeshes = []
  normalizedModel.traverse(object => {
    if (object.isMesh && object.geometry?.getAttribute('position')
      && !object.userData.mannequinHeatOverlay && !object.userData.mannequinMatrixRegion) sourceMeshes.push(object)
  })
  const overlays = []
  const states = new Map()
  const colorStops = new THREE.Vector4(0.2, 0.4, 0.6, 0.8)
  const stats = { activeCells: 0, regionRanges: {}, dimensions: {}, overlayCount: 0 }
  let disposed = false
  try {
    for (const [canvasId, points] of grouped) {
      const patch = createPatch(points)
      const coordinates = createMannequinLegSurfaceCoordinates(points)
      const texture = new THREE.DataTexture(new Uint8Array(4), 1, 1, THREE.RGBAFormat, THREE.UnsignedByteType)
      texture.minFilter = THREE.LinearFilter
      texture.magFilter = THREE.LinearFilter
      texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping
      texture.generateMipmaps = false
      texture.flipY = false
      texture.needsUpdate = true
      const renderTexture = new THREE.DataTexture(new Float32Array(4), 1, 1, THREE.RGBAFormat, THREE.FloatType)
      renderTexture.minFilter = renderTexture.magFilter = THREE.LinearFilter
      renderTexture.wrapS = renderTexture.wrapT = THREE.ClampToEdgeWrapping
      renderTexture.generateMipmaps = false
      renderTexture.flipY = false
      renderTexture.needsUpdate = true
      const profileTexture = new THREE.DataTexture(coordinates?.data || new Float32Array(4),
        coordinates?.width || 1, coordinates?.height || 1, THREE.RGBAFormat, THREE.FloatType)
      profileTexture.minFilter = profileTexture.magFilter = THREE.LinearFilter
      profileTexture.wrapS = profileTexture.wrapT = THREE.ClampToEdgeWrapping
      profileTexture.generateMipmaps = false
      profileTexture.flipY = false
      profileTexture.needsUpdate = true
      const material = new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          uMatrix: { value: renderTexture },
          uMatrixUvOffset: { value: new THREE.Vector2() }, uMatrixUvScale: { value: new THREE.Vector2(1, 1) },
          uColorStops: { value: colorStops }, uSurfaceTolerance: { value: tolerance }, uEdgeWidth: { value: edgeWidth },
          uLegCoordinates: { value: coordinates ? 1 : 0 },
          uLegYRange: { value: new THREE.Vector2(coordinates?.topY || 0, coordinates?.bottomY ?? -1) },
          uLegTopX: { value: new THREE.Vector2().fromArray(coordinates?.topX || [0, 1]) },
          uLegBottomX: { value: new THREE.Vector2().fromArray(coordinates?.bottomX || [0, 1]) },
          uLegSide: { value: coordinates?.canvasId === 'right-leg' ? 1 : -1 },
          uLegProfile: { value: profileTexture },
        },
        transparent: true, side: THREE.FrontSide, depthWrite: false, depthTest: true,
        polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
        toneMapped: false,
      })
      states.set(canvasId, { texture, renderTexture, profileTexture, material, patch, sourceValues: new Float64Array(1), smoothingKey: '' })
      for (const mesh of sourceMeshes) {
        // Geometry is baked once with a generous bound, allowing later feather changes.
        const geometry = createProjectedGeometry(mesh, patch, Math.max(0.4, tolerance + edgeWidth))
        const overlay = new THREE.Mesh(geometry, material)
        overlay.name = `mannequin-matrix-${canvasId}`
        overlay.renderOrder = 10
        overlay.userData.mannequinMatrixRegion = canvasId
        mesh.add(overlay)
        overlays.push(overlay)
      }
    }
    stats.overlayCount = overlays.length
  } catch (error) {
    dispose()
    throw error
  }

  /** Values are normalized upstream; no spatial summation or automatic range mutation occurs here. */
  function update(regions = [], settings = {}) {
    if (disposed) return false
    const stops = getColorBandStops(settings.colorBandRatios)
    let changed = stops.some((value, index) => colorStops.getComponent(index) !== value)
    if (changed) colorStops.fromArray(stops)
    const supplied = new Map(regions.map(region => [region.canvasId, region]))
    const numericGauss = Number(settings.gauss)
    const numericHeight = Number(settings.height)
    const gauss = Number.isFinite(numericGauss) ? Math.max(0, Math.min(4, numericGauss)) : 1
    const height = Number.isFinite(numericHeight) ? Math.max(0, Math.min(400, numericHeight)) : 100
    const surfaceTolerance = tolerance * (0.7 + height * 0.003)
    const surfaceEdgeWidth = edgeWidth * (0.35 + gauss * 0.5)
    let activeCells = 0
    for (const [canvasId, state] of states) {
      for (const [uniform, value] of [['uSurfaceTolerance', surfaceTolerance], ['uEdgeWidth', surfaceEdgeWidth]]) {
        if (state.material.uniforms[uniform].value !== value) changed = true
        state.material.uniforms[uniform].value = value
      }
      const region = supplied.get(canvasId)
      const valid = Number.isInteger(region?.width) && region.width > 0 && region.width <= 512
        && Number.isInteger(region?.height) && region.height > 0 && region.height <= 512
        && region.values?.length === region.width * region.height
      const width = valid ? region.width : 1
      const height = valid ? region.height : 1
      let resized = state.texture.image.width !== width || state.texture.image.height !== height
      if (resized) {
        state.texture.image = { data: new Uint8Array(width * height * 4), width, height }
        state.sourceValues = new Float64Array(width * height)
      }
      const bytes = state.texture.image.data
      let pixelsChanged = resized
      let valuesChanged = resized
      for (let index = 0; index < width * height; index++) {
        const numeric = valid ? Number(region.values[index]) : 0
        const active = Number.isFinite(numeric) && numeric > 0
        const red = active ? Math.round(Math.min(1, numeric) * 255) : 0
        const green = active ? 255 : 0
        const value = active ? Math.min(1, numeric) : 0
        if (state.sourceValues[index] !== value) valuesChanged = true
        state.sourceValues[index] = value
        if (bytes[index * 4] !== red || bytes[index * 4 + 1] !== green) pixelsChanged = true
        bytes[index * 4] = red
        bytes[index * 4 + 1] = green
        bytes[index * 4 + 3] = green
        if (active) activeCells++
      }
      if (pixelsChanged) state.texture.needsUpdate = true
      const smoothingKey = `${width}:${height}:${gauss}:${numericHeight}`
      if (valuesChanged || state.smoothingKey !== smoothingKey) {
        const values = canvasId.endsWith('-leg') && width === 24 && height === 128
          ? warpMannequinLegDisplayMatrix(state.sourceValues, width, height, canvasId) : state.sourceValues
        const smooth = createSmoothMannequinMatrix(values, width, height, {
          worldWidth: state.patch.worldWidth, worldHeight: state.patch.worldHeight,
          gauss, heightSetting: Number.isFinite(numericHeight) ? numericHeight : 100,
        })
        state.renderTexture.image = { data: smooth.data, width: smooth.width, height: smooth.height }
        state.renderTexture.needsUpdate = true
        state.material.uniforms.uMatrixUvOffset.value.fromArray(smooth.uvOffset)
        state.material.uniforms.uMatrixUvScale.value.fromArray(smooth.uvScale)
        state.smoothingKey = smoothingKey
        changed = true
      }
      changed ||= pixelsChanged
      stats.dimensions[canvasId] = [width, height]
      stats.regionRanges[canvasId] = valid && Number.isFinite(region.rangeMax) ? region.rangeMax : 0
    }
    stats.activeCells = activeCells
    return changed
  }

  function dispose() {
    if (disposed) return
    disposed = true
    overlays.forEach(overlay => { overlay.removeFromParent(); overlay.geometry.dispose() })
    states.forEach(({ texture, renderTexture, profileTexture, material }) => { texture.dispose(); renderTexture.dispose(); profileTexture.dispose(); material.dispose() })
  }

  return {
    overlays,
    materials: [...states.values()].map(state => state.material),
    textures: [...states.values()].map(state => state.texture),
    renderTextures: [...states.values()].map(state => state.renderTexture),
    profileTextures: [...states.values()].map(state => state.profileTexture),
    stats, update, dispose,
  }
}
