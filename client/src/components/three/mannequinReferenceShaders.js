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

/** 来自 shroom1.0/HumanBodyOptimized.jsx 的世界 XYZ 高斯着色器，不添加区域、法线或深度截断。 */
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

  const exactCrystalHeatOverlayFragmentShader = `
  uniform sampler2D uSensorData;
  uniform float uSensorCount;
  uniform float uRadius;
  uniform float uIntensity;
  uniform float uHeatAlpha;
  uniform int uColorScheme;
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
    if (t < 0.2) return mix(vec3(0.04, 0.04, 0.28), vec3(0.0, 0.28, 0.85), t / 0.2);
    if (t < 0.4) return mix(vec3(0.0, 0.28, 0.85), vec3(0.0, 0.75, 0.55), (t - 0.2) / 0.2);
    if (t < 0.6) return mix(vec3(0.0, 0.75, 0.55), vec3(0.55, 0.85, 0.0), (t - 0.4) / 0.2);
    if (t < 0.8) return mix(vec3(0.55, 0.85, 0.0), vec3(1.0, 0.62, 0.0), (t - 0.6) / 0.2);
    return mix(vec3(1.0, 0.62, 0.0), vec3(0.95, 0.04, 0.0), (t - 0.8) / 0.2);
  }

  void main() {
    float heat = 0.0;
    for (int i = 0; i < ${MAX_SHADER_SENSORS}; i++) {
      if (float(i) >= uSensorCount) break;
      float u = (float(i) + 0.5) / uSensorCount;
      vec4 sensor = texture2D(uSensorData, vec2(u, 0.5));
      float distanceToSensor = distance(vWorldPos, sensor.xyz);
      heat += exp(-(distanceToSensor * distanceToSensor) / (2.0 * uRadius * uRadius)) * sensor.w * uIntensity;
    }
    heat = clamp(heat, 0.0, 1.0);
    float heatVisibility = smoothstep(0.02, 0.65, heat);
    if (heatVisibility < 0.01) discard;
    gl_FragColor = vec4(heatColor(heat), heatVisibility * uHeatAlpha);
  }
`;
  return { vertexShader, crystalShellFragmentShader, opaqueWhiteShellFragmentShader, exactCrystalHeatOverlayFragmentShader }
}
