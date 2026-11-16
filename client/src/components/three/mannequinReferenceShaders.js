/** 参考项目默认水晶外观；模型色在其 Three.js r127 中按原始 RGB 写入 shader。 */
export const REFERENCE_CRYSTAL_DEFAULTS = Object.freeze({
  background: '#afacac',
  modelColor: '#718096',
  transparency: 0.8,
  intensity: 0.8,
  colorScheme: 0,
  backHeatAlpha: 0.35,
  frontHeatAlpha: 0.65,
})

/** 保留参考项目世界 XYZ 高斯与色阶，受压覆盖独立控制热图可见度。 */
export function createReferenceHumanShaders(maxSensors) {
  const MAX_SHADER_SENSORS = maxSensors
  const vertexShader = `
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  varying vec3 vViewDirection;
  attribute float aHeat;
  varying float vHeat;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPosition.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vViewDirection = normalize(cameraPosition - worldPosition.xyz);
    vHeat = aHeat;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

  const crystalShellFragmentShader = `
  uniform float uTransparency;
  uniform vec3 uModelColor;
  varying vec3 vWorldNormal;
  varying vec3 vViewDirection;

  void main() {
    float fresnel = pow(1.0 - max(dot(normalize(vWorldNormal), normalize(vViewDirection)), 0.0), 3.0);
    vec3 color = uModelColor + vec3(0.65, 0.85, 1.0) * fresnel * 0.12;
    float shellAlpha = clamp(1.0 - uTransparency, 0.05, 0.95);
    gl_FragColor = vec4(color, shellAlpha);
  }
`;

  // Opaque white surface with soft view-relative shading, independent of heat colors.
  const opaqueWhiteShellFragmentShader = `
  uniform vec3 uModelColor;
  varying vec3 vWorldNormal;
  varying vec3 vViewDirection;

  void main() {
    float facing = max(dot(normalize(vWorldNormal), normalize(vViewDirection)), 0.0);
    float shade = 0.78 + 0.22 * facing;
    gl_FragColor = vec4(uModelColor * shade, 1.0);
  }
`;

  const pressureHeatOverlayFragmentShader = `
  uniform sampler2D uSensorData;
  uniform float uSensorCount;
  uniform float uRadius;
  uniform float uIntensity;
  uniform float uHeatAlpha;
  uniform int uColorScheme;
  uniform vec4 uColorStops;
  varying vec3 vWorldPos;

  vec3 heatColor(float t) {
    t = clamp(t, 0.0, 1.0);
    if (uColorScheme == 1) {
      return mix(mix(vec3(0.02, 0.02, 0.15), vec3(0.0, 0.55, 0.9), t), vec3(0.75, 0.98, 1.0), t * t);
    }
    if (uColorScheme == 2) {
      if (t < 0.5) return mix(vec3(0.15, 0.0, 0.2), vec3(0.85, 0.18, 0.0), t * 2.0);
      return mix(vec3(0.85, 0.18, 0.0), vec3(1.0, 0.92, 0.3), (t - 0.5) * 2.0);
    }
    if (uColorScheme == 3) {
      if (t < 0.33) return mix(vec3(0.0), vec3(0.5, 0.0, 0.1), t * 3.0);
      if (t < 0.66) return mix(vec3(0.5, 0.0, 0.1), vec3(0.95, 0.42, 0.0), (t - 0.33) * 3.0);
      return mix(vec3(0.95, 0.42, 0.0), vec3(1.0, 1.0, 0.4), (t - 0.66) * 3.0);
    }
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
    float heat = 0.0;
    float supportWeightSum = 0.0;
    float supportWeightSquaredSum = 0.0;
    for (int i = 0; i < ${MAX_SHADER_SENSORS}; i++) {
      if (float(i) >= uSensorCount) break;
      float u = (float(i) + 0.5) / uSensorCount;
      vec4 sensor = texture2D(uSensorData, vec2(u, 0.5));
      if (sensor.w <= 0.0) continue;
      float distanceToSensor = distance(vWorldPos, sensor.xyz);
      float weight = exp(-(distanceToSensor * distanceToSensor) / (2.0 * uRadius * uRadius));
      heat += weight * sensor.w * uIntensity;
      supportWeightSum += weight;
      supportWeightSquaredSum += weight * weight;
    }
    heat = clamp(heat, 0.0, 1.0);
    // A continuous, density-normalized support field avoids per-point scalloped outlines.
    // One point (or coincident duplicates) retains its original Gaussian footprint.
    float support = supportWeightSquaredSum / max(supportWeightSum, 1e-8);
    float supportDistance = sqrt(max(-2.0 * log(max(support, 1e-8)), 0.0));
    float edgeAA = min(fwidth(supportDistance), 0.12);
    float heatVisibility = 1.0 - smoothstep(1.1 - edgeAA, 2.55 + edgeAA, supportDistance);
    if (heatVisibility <= 0.0) discard;
    gl_FragColor = vec4(heatColor(heat), heatVisibility * uHeatAlpha);
  }
`;
  return { vertexShader, crystalShellFragmentShader, opaqueWhiteShellFragmentShader, pressureHeatOverlayFragmentShader }
}
