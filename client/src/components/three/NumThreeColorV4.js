import React, { useContext, useEffect, useRef } from 'react'
import * as THREE from "three";
import { pageContext } from '../../page/test/Test';
import './canvas.scss'
import { cleanupThree } from '../../util/disposeThree'
import { getDisplayType, getSettingValue, getStatus, getSysType, useEquipStore } from '../../store/equipStore';
import { isMoreMatrix } from '../../assets/util/util';
import { NUMBER_TEXT_COLOR_ALPHA, beginDynamicColorFrame, gaussBlur_return, jetWhite3NoWhite, setDynamicGammaColorEnabled, syncDynamicColorRange } from '../../assets/util/line';
import { isEndiBackVisibleCell, isEndiBackVisibleIndex } from '../../util/endiBackVisibleMask';
import { getPressureMetricPointValues } from '../../util/pressureMetrics';

function jet(min, max, x) {
  let red, g, blue;
  let dv;
  red = 1.0;
  g = 1.0;
  blue = 1.0;
  if (x < min) {
    x = min;
  }
  if (x > max) {
    x = max;
  }
  dv = max - min;
  if (x < min + 0.25 * dv) {
    // red = 0;
    // g = 0;
    // blue = 0;

    red = 0;
    g = (4 * (x - min)) / dv;
  } else if (x < min + 0.5 * dv) {
    red = 0;
    blue = 1 + (4 * (min + 0.25 * dv - x)) / dv;
  } else if (x < min + 0.75 * dv) {
    red = (4 * (x - min - 0.5 * dv)) / dv;
    blue = 0;
  } else {
    g = 1 + (4 * (min + 0.75 * dv - x)) / dv;
    blue = 0;
  }
  var rgb = new Array();
  rgb[0] = parseInt(255 * red + '');
  rgb[1] = parseInt(255 * g + '');
  rgb[2] = parseInt(255 * blue + '');
  return rgb;
}

function normalizeDisplayValue(value, mode = useEquipStore.getState().pressureMetricMode) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  const atlasValue = numeric * 10;
  return Math.max(0, Math.min(DIGIT_DISPLAY_MAX, Math.round(atlasValue)));
}

function displayIndexToMetricValue(index, mode = useEquipStore.getState().pressureMetricMode) {
  const numeric = Number(index);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return numeric / 10;
}

function getMetricVisibleThreshold(mode = useEquipStore.getState().pressureMetricMode) {
  return 0.05;
}

function getTextureColorMax(color) {
  const value = Number(color);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function normalizeZoomScale(value) {
  const numeric = Number(value);
  const percent = Number.isFinite(numeric) ? numeric : 100;
  return Math.max(50, Math.min(200, percent)) / 100;
}

function clampZoomPercent(value) {
  const numeric = Number(value);
  const percent = Number.isFinite(numeric) ? numeric : 100;
  return Math.max(50, Math.min(200, Math.round(percent)));
}

function getMagnifierCells(zoom) {
  if (zoom >= 1.6) return 3;
  if (zoom <= 0.85) return 7;
  return 5;
}

const DIGIT_ATLAS_GRID = 64;
const DIGIT_ATLAS_CELL = 32;
const DIGIT_ATLAS_SIZE = DIGIT_ATLAS_GRID * DIGIT_ATLAS_CELL;
const DIGIT_ATLAS_COUNT = DIGIT_ATLAS_GRID * DIGIT_ATLAS_GRID;
const DIGIT_DISPLAY_MAX = DIGIT_ATLAS_COUNT - 1;
const DIGIT_TILE_INSET = 2;
const NUM_2D_GAUSS_KERNEL_FACTOR = 0.5;
const NUM_2D_TEMPORAL_ALPHA = 0.22;
const NUM_2D_DISPLAY_DEADBAND = 1.1;

function prepareDisplayData(data, width, height, settings) {
  const count = width * height;
  let next = Array.from({ length: count }, (_, index) => Number(data?.[index]) || 0);
  const filter = Number(settings?.filter);
  if (Number.isFinite(filter) && filter > 0) {
    next = next.map(value => (value < filter ? 0 : value));
  }
  const gauss = Number(settings?.gauss);
  const effectiveGauss = Number.isFinite(gauss) ? gauss * NUM_2D_GAUSS_KERNEL_FACTOR : NUM_2D_GAUSS_KERNEL_FACTOR;
  if (effectiveGauss > 0.01) {
    next = gaussBlur_return(next, width, height, effectiveGauss);
  }
  if (Number.isFinite(filter) && filter > 0) {
    next = next.map(value => (value < filter ? 0 : value));
  }
  return next;
}

function stabilizeDisplayData(data, stableRef, key, mode = useEquipStore.getState().pressureMetricMode) {
  const count = data.length;
  const source = Array.from({ length: count }, (_, index) => {
    const value = Number(data[index]);
    return Number.isFinite(value) ? Math.max(0, value) : 0;
  });
  const visibleThreshold = getMetricVisibleThreshold(mode);

  if (source.every(value => value < visibleThreshold)) {
    const zero = new Array(count).fill(0);
    stableRef.current = { key, values: zero, display: zero };
    return zero;
  }

  const previous = stableRef.current;
  const shouldReset = !previous || previous.key !== key || previous.values?.length !== count;
  if (shouldReset) {
    const display = source.map(value => normalizeDisplayValue(value, mode));
    stableRef.current = { key, values: source, display };
    return display.map(value => displayIndexToMetricValue(value, mode));
  }

  const values = new Array(count);
  const display = new Array(count);
  for (let i = 0; i < count; i++) {
    const prevValue = previous.values[i] ?? source[i];
    const prevDisplay = previous.display[i] ?? normalizeDisplayValue(prevValue, mode);
    const smoothed = source[i] < visibleThreshold
      ? 0
      : prevValue + (source[i] - prevValue) * NUM_2D_TEMPORAL_ALPHA;
    let nextDisplay = normalizeDisplayValue(smoothed, mode);
    const sourceDisplay = normalizeDisplayValue(source[i], mode);
    if (nextDisplay !== prevDisplay && source[i] >= visibleThreshold && Math.abs(sourceDisplay - prevDisplay) < NUM_2D_DISPLAY_DEADBAND) {
      nextDisplay = prevDisplay;
    }
    values[i] = smoothed;
    display[i] = nextDisplay;
  }
  stableRef.current = { key, values, display };
  return display.map(value => displayIndexToMetricValue(value, mode));
}

function drawCellValue(ctx, value, cx, cy, cellSize) {
  const text = String(value);
  const fontSize = value >= 100 ? cellSize * 0.42 : cellSize * 0.5;
  ctx.font = `700 ${fontSize}px "Arial Narrow", Arial, sans-serif`;
  ctx.globalAlpha = 1;
  ctx.fillStyle = "white";
  const maxTextWidth = cellSize * 0.92;
  const textWidth = ctx.measureText(text).width || maxTextWidth;
  const horizontalScale = Math.min(1, maxTextWidth / textWidth);
  ctx.save();
  ctx.translate(cx + cellSize / 2, cy + cellSize / 2);
  ctx.scale(horizontalScale, 1);
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

export default function NumThree(props) {
  console.log(props)
  let animationRequestId
  const pageInfo = useContext(pageContext);
  const { onSelect, onRuler, onMagnifier } = pageInfo || {};
  console.log('NumThree')
  const cameraRef = useRef(null);
  const resetCameraRef = useRef(null);
  const pendingResetRef = useRef(false);
  const interactionLockedRef = useRef(false);
  const dragRef = useRef({ isDragging: false, lastX: 0, lastY: 0 });
  const magnifierEnabledRef = useRef(false);
  const magnifierCanvasRef = useRef(null);
  const magnifierCtxRef = useRef(null);
  const dataRef = useRef([]);
  const gridRef = useRef({ width: 0, height: 0 });
  const invertYRef = useRef(false);
  const textureMaxRef = useRef(22);
  const textureModeRef = useRef(useEquipStore.getState().pressureMetricMode);
  const magnifierPosRef = useRef({ col: -1, row: -1 });
  const drawMagnifierRef = useRef(null);
  const magnifierZoomRef = useRef(1);
  const zoomRef = useRef(normalizeZoomScale(props.zoom));
  const stableDataRef = useRef(null);
  // const pageRef = useRef(pageInfo)

  // useEffect(() => {
  //   pageRef.current = pageInfo
  // }, [pageInfo])

  // function generateDigitSpriteSheetNew() {
  //     const canvas = document.createElement('canvas');
  //     // document.body.appendChild(canvas)
  //     canvas.width = canvas.height = 512;
  //     const ctx = canvas.getContext('2d');
  //     ctx.fillStyle = 'black';
  //     ctx.fillRect(0, 0, 512, 512);
  //     ctx.fillStyle = 'white';
  //     ctx.font = 'bold 20px monospace';
  //     ctx.textAlign = 'center';
  //     ctx.textBaseline = 'middle';
  //     for (let i = 0; i < 256; i++) {
  //         const x = i % 16;
  //         const y = Math.floor(i / 16);
  //         ctx.fillText(i.toString(), x * 32 + 16, y * 32 + 16);
  //     }

  //     return new THREE.CanvasTexture(canvas);
  // }


  function createDigitSpriteSheetWithJet(value = 22, mode = useEquipStore.getState().pressureMetricMode) {
    syncDynamicColorRange(value);
    const canvas = document.createElement("canvas");
    // document.body.appendChild(canvas)
    canvas.width = canvas.height = DIGIT_ATLAS_SIZE;
    const ctx = canvas.getContext("2d");

    const gridSize = DIGIT_ATLAS_GRID;
    const cellSize = DIGIT_ATLAS_CELL;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (let i = 0; i < DIGIT_ATLAS_COUNT; i++) {
      const x = i % gridSize;
      const y = Math.floor(i / gridSize);
      const cx = x * cellSize;
      const cy = y * cellSize;

      // ✅ 计算背景颜色（与坐垫统一使用 jet 颜色映射）
      const metricValue = i / 10;
      const [r, g, b] = jetWhite3NoWhite(0, value, Math.min(metricValue, value));
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${NUMBER_TEXT_COLOR_ALPHA})`;
      ctx.fillRect(cx, cy, cellSize, cellSize);

      ctx.strokeStyle = "rgba(0, 0, 0, 0.78)";
      ctx.lineWidth = 3;
      ctx.strokeRect(cx + 1.5, cy + 1.5, cellSize - 3, cellSize - 3);

      drawCellValue(ctx, metricValue.toFixed(1), cx, cy, cellSize);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.flipY = false;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    return tex;
  }

  // let data  = useEquipStore(s => s.status); 
  // console.log(data)

  useEffect(() => {
    // 初始化 Three.js

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    let height
    if (window.innerHeight < 750) {
      height = window.innerHeight * 0.5
    } else {
      height = window.innerHeight * 0.65
    }

    renderer.setSize(height, height);

    // console.log(props.classIndex ? `.canvasNum${props.classIndex}` : '.canvasNum')

    // const canvasNum = document.querySelector(props.classIndex ? `.canvasNum${props.classIndex}` : '.canvasNum')
    const canvasNum = canvasRef.current
    if (canvasNum) {
      canvasNum.style.display = 'flex'
      canvasNum.style.gap = '1rem'
      canvasNum.style.alignItems = 'center'
      canvasNum.style.justifyContent = 'center'
    }
    let canvasInner = canvasNum.querySelector('.canvasNumInner');
    if (!canvasInner) {
      canvasInner = document.createElement('div');
      canvasInner.className = 'canvasNumInner';
      canvasInner.style.position = 'relative';
      canvasInner.style.width = `${height}px`;
      canvasInner.style.height = `${height}px`;
      canvasNum.appendChild(canvasInner);
    }
    if (canvasInner.childNodes.length == 0) {
      console.log(canvasInner.childNodes.length)
      renderer.domElement.classList.add('canvasThree')
      canvasInner.appendChild(renderer.domElement);

      const canvasRuler = document.createElement('canvas');
      canvasRuler.style.width = `${height}px`
      canvasRuler.style.height = `${height}px`
      canvasRuler.width = `${height}`
      canvasRuler.height = `${height}`
      canvasRuler.style.position = 'absolute'
      canvasRuler.style.top = '0'
      canvasRuler.className = 'canvasThree canvasRuler'
      canvasInner.appendChild(canvasRuler);
    }

    let magnifierCanvas = canvasInner.querySelector('.canvasMagnifier');
    if (!magnifierCanvas) {
      magnifierCanvas = document.createElement('canvas');
      magnifierCanvas.width = 200;
      magnifierCanvas.height = 200;
      magnifierCanvas.style.position = 'absolute';
      magnifierCanvas.style.left = 'calc(100% + 16px)';
      magnifierCanvas.style.bottom = '0';
      magnifierCanvas.style.border = '1px solid #3a3a3a';
      magnifierCanvas.style.background = '#111';
      magnifierCanvas.style.display = 'none';
      magnifierCanvas.className = 'canvasMagnifier';
      canvasInner.appendChild(magnifierCanvas);
    }
    magnifierCanvasRef.current = magnifierCanvas;
    magnifierCtxRef.current = magnifierCanvas.getContext('2d');


    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10000);
    camera.position.z = 1000;
    camera.zoom = zoomRef.current;
    camera.updateProjectionMatrix();
    invertYRef.current = false;
    cameraRef.current = camera;
    const initialCamera = {
      position: camera.position.clone(),
      zoom: camera.zoom
    };
    resetCameraRef.current = () => {
      camera.position.copy(initialCamera.position);
      camera.zoom = zoomRef.current;
      camera.updateProjectionMatrix();
    };

    let currentTextureMax = getTextureColorMax(getSettingValue()?.color)
    let currentTextureMode = useEquipStore.getState().pressureMetricMode
    const texture = createDigitSpriteSheetWithJet(currentTextureMax, currentTextureMode);
    textureMaxRef.current = currentTextureMax;
    textureModeRef.current = currentTextureMode;
    // texture.flipY = false;


    const material = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: texture },
        tileSize: { value: 1.0 / DIGIT_ATLAS_GRID },
        tileInset: { value: DIGIT_TILE_INSET / DIGIT_ATLAS_SIZE }
      },
      vertexShader: `
        attribute vec3 instanceColor;
        varying vec3 vColor;
        attribute vec2 uvOffset;
        uniform float tileSize;
        uniform float tileInset;
        varying vec2 vUv;
        void main() {
          vUv = uvOffset + vec2(tileInset) + uv * (tileSize - tileInset * 2.0);
          vColor = instanceColor;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D map;
        varying vec2 vUv;
        varying vec3 vColor;

        void main() {
          vec4 texColor = texture2D(map, vUv);
          if (texColor.a < 0.1) discard;
          gl_FragColor = vec4(texColor.rgb, texColor.a);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: true,
      depthTest: true,

    });

    material.toneMapped = false;
    // size为1就是64矩阵
    const { width: numWitdh, height: numHeight } = props
    let gridSize1 = numWitdh, gridSize2 = numHeight//64 / size;
    const gridSize = Math.max(numWitdh, numHeight)

    console.log(gridSize, 'gridSizegridSize')
    // 总大小  64 * 0.032

    let count = gridSize2 * gridSize1;
    const geometry = new THREE.PlaneGeometry(2.048 / gridSize, 2.048 / gridSize);

    // const geometry = new THREE.PlaneGeometry(0.1, 0.1);
    let uvOffsets = new Float32Array(count * 2);
    const colorArray = new Float32Array(count * 3);
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    const dummy = new THREE.Object3D();
    // mesh.rotation.x = Math.PI
    // for (let i = 0; i < count; i++) {
    //   const x = i % gridSize;
    //   const y = Math.floor(i / gridSize);
    //   // dummy.position.set((x - 31.5) / 32, (y - 31.5) / 32, 0); // 居中

    //   dummy.position.set((x) / (gridSize / 2), (y) / (gridSize / 2), 0); // 居中
    //   // dummy.rotation.set(0, Math.PI, 0,)
    //   dummy.updateMatrix();
    //   mesh.setMatrixAt(i, dummy.matrix);

    //   const d = 20//Math.floor(Math.random() * 256);
    //   uvOffsets[i * 2] = (d % 16) / 16;
    //   uvOffsets[i * 2 + 1] = Math.floor(d / 16) / 16;
    // }
    let oldTime = new Date().getTime()


    mesh.rotation.x = Math.PI


    function animate() {

      // let data = pageRef.current.equipStatus.data
      // let data = getStatus()
      // console.log(data)
      let data = new Array(4096).fill(0)

      const systemType = getSysType()
      const displayType = getDisplayType()
      let matrixKey = systemType

      // if (props.sitData.current && Object.keys(props.sitData.current).length > 1) {
      //   const key = Object.keys(props.sitData.current)[0]
      //   console.log(props.sitData.current)
      //   const
      //     data = props.sitData.current[key]
      // }
      // const data = props.sitData.current

      if (isMoreMatrix(systemType)) {
        if (displayType != 'all') {
          let realType = ''
          if (displayType == 'back2D') {
            realType = "back"
          } else if (displayType == 'sit2D') {
            realType = "sit"
            // if(systemType == 'endi'){
            //   gridSize = 45
            //   count = gridSize * gridSize;
            //   uvOffsets = new Float32Array(count * 2);
            // }
          }
          matrixKey = `${systemType}-${realType}`
          data = props.sitData.current[realType]
          if (!data) data = new Array(4096).fill(0)
        }
      } else {
        data = props.sitData.current[systemType]
        if (!data) data = new Array(4096).fill(0)
      }

      // const yArr = []
      // for (let i = 0; i < 64; i++) {
      //   yArr.push(63 - i)
      // }

      // const newArr = []
      // for (let i = 0; i < 64; i++) {
      //   for (let j = 0; j < 50; j++) {
      //     const width = yArr[i]
      //     newArr.push(data[width * 50 + 49 - j])
      //   }
      // }
      // data = newArr


      const settingValue = getSettingValue()
      const {
        gauss, color, filter, height, coherent, autoColor,
      } = settingValue //pageRef.current.settingValue
      setDynamicGammaColorEnabled(Boolean(autoColor));
      data = prepareDisplayData(data, gridSize1, gridSize2, settingValue);
      if (systemType === 'endi' && displayType === 'back2D') {
        data = data.map((value, index) => isEndiBackVisibleIndex(index, gridSize1, gridSize2) ? value : 0);
      }
      const metricMode = useEquipStore.getState().pressureMetricMode
      data = getPressureMetricPointValues(data, matrixKey, metricMode);
      data = stabilizeDisplayData(data, stableDataRef, `${systemType}-${displayType}-${gridSize1}x${gridSize2}-g${gauss}-f${filter}-m${metricMode}`, metricMode);
      dataRef.current = data;
      gridRef.current = { width: gridSize1, height: gridSize2 };

      const nextMax = Math.max(1, Math.round(beginDynamicColorFrame(data, color) || getTextureColorMax(color)));
      if (Math.abs(currentTextureMax - nextMax) >= 1 || currentTextureMode !== metricMode) {
        console.log('colorChange')
        const oldTexture = material.uniforms.map.value
        const texture = createDigitSpriteSheetWithJet(nextMax, metricMode)
        material.uniforms.map.value = texture
        if (oldTexture && oldTexture !== texture) oldTexture.dispose()
        textureMaxRef.current = nextMax
        textureModeRef.current = metricMode
        currentTextureMax = nextMax
        currentTextureMode = metricMode
      }
      // const { wsLocalData } = pageRef.current
      // if (wsLocalData) {
      //   data = data.map((a, index) => {
      //     if (a - wsLocalData[index] < 0) {
      //       return 0
      //     } else {
      //       return a - wsLocalData[index]
      //     }
      //   })
      // }

      // if (filter) {
      //   data = data.map((a) => {
      //     if (a < filter) {
      //       return 0
      //     } else {
      //       return a
      //     }
      //   })
      // }



      // console.log(new Date().getTime() - oldTime,)
      // controls.update();
      animationRequestId = requestAnimationFrame(animate);
      //  = rangeValue/Math.PI/2


      for (let i = 0; i < count; i++) {
        const x = i % gridSize1;
        const y = Math.floor(i / gridSize1);
        const isPaddingCell = systemType === 'endi'
          && displayType === 'back2D'
          && !isEndiBackVisibleIndex(i, gridSize1, gridSize2);
        dummy.position.set((((gridSize2 - gridSize1) / 2) + x - (gridSize2 / 2 - 0.5)) / (gridSize2 / 2), (y - (gridSize2 / 2 - 0.5)) / (gridSize2 / 2), 0); // 居中
        dummy.scale.setScalar(isPaddingCell ? 0 : 1);

        // dummy.position.set((x ) / 32, (y ) / 32, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);

        const d = normalizeDisplayValue(data[i], metricMode)//Math.floor(Math.random() * 256);
        uvOffsets[i * 2] = (d % DIGIT_ATLAS_GRID) / DIGIT_ATLAS_GRID;
        uvOffsets[i * 2 + 1] = Math.floor(d / DIGIT_ATLAS_GRID) / DIGIT_ATLAS_GRID;

        // 与坐垫统一的颜色映射
        colorArray[i * 3 + 0] = 1;
        colorArray[i * 3 + 1] = 1;
        colorArray[i * 3 + 2] = 1;

      }
      mesh.instanceMatrix.needsUpdate = true;
      geometry.attributes.instanceColor.needsUpdate = true;
      geometry.attributes.uvOffset.needsUpdate = true;
      renderer.render(scene, camera);
      oldTime = new Date().getTime()

      // 放大镜实时更新：即使鼠标不动，数据变化时也重绘放大镜
      if (magnifierEnabledRef.current && drawMagnifierRef.current && magnifierPosRef.current.col >= 0) {
        drawMagnifierRef.current(magnifierPosRef.current.col, magnifierPosRef.current.row);
      }

    }

    geometry.setAttribute("instanceColor", new THREE.InstancedBufferAttribute(colorArray, 3));
    geometry.setAttribute('uvOffset', new THREE.InstancedBufferAttribute(uvOffsets, 2));
    animate()
    scene.add(mesh);
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    renderer.render(scene, camera);

    if (pendingResetRef.current && resetCameraRef.current) {
      resetCameraRef.current();
      pendingResetRef.current = false;
    }

    const wheelTarget = canvasNum;
    const getPointerWorld = (event) => {
      const rect = renderer.domElement.getBoundingClientRect();
      const ndcX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      return new THREE.Vector3(ndcX, ndcY, 0).unproject(camera);
    };
    const applyCanvasZoom = (nextPercent, event) => {
      const safePercent = clampZoomPercent(nextPercent);
      const before = event ? getPointerWorld(event) : null;
      useEquipStore.getState().setNum2DZoom(safePercent);
      zoomRef.current = normalizeZoomScale(safePercent);
      camera.zoom = zoomRef.current;
      camera.updateProjectionMatrix();
      if (before) {
        const after = getPointerWorld(event);
        camera.position.x += before.x - after.x;
        camera.position.y += before.y - after.y;
        camera.updateProjectionMatrix();
      }
    };
    const isPointerInsideCanvas = (event) => {
      const rect = renderer.domElement.getBoundingClientRect();
      return event.clientX >= rect.left && event.clientX <= rect.right
        && event.clientY >= rect.top && event.clientY <= rect.bottom;
    };
    const isPointerInsideMagnifier = (event) => {
      const rect = magnifierCanvasRef.current?.getBoundingClientRect?.();
      return magnifierEnabledRef.current && rect
        && event.clientX >= rect.left && event.clientX <= rect.right
        && event.clientY >= rect.top && event.clientY <= rect.bottom;
    };
    const syncDragCursor = () => {
      if (!wheelTarget) return;
      if (interactionLockedRef.current) {
        wheelTarget.style.cursor = 'default';
        return;
      }
      wheelTarget.style.cursor = dragRef.current.isDragging ? 'grabbing' : 'grab';
    };
    const handleMouseDown = (event) => {
      if (event.button !== 0 || interactionLockedRef.current) return;
      if (!isPointerInsideCanvas(event) || isPointerInsideMagnifier(event)) return;
      event.preventDefault();
      dragRef.current = {
        isDragging: true,
        lastX: event.clientX,
        lastY: event.clientY
      };
      syncDragCursor();
    };
    const handleCanvasDragMove = (event) => {
      if (!dragRef.current.isDragging) return;
      event.preventDefault();
      const before = getPointerWorld({
        clientX: dragRef.current.lastX,
        clientY: dragRef.current.lastY
      });
      const after = getPointerWorld(event);
      camera.position.x += before.x - after.x;
      camera.position.y += before.y - after.y;
      camera.updateProjectionMatrix();
      dragRef.current.lastX = event.clientX;
      dragRef.current.lastY = event.clientY;
    };
    const handleCanvasDragEnd = () => {
      if (!dragRef.current.isDragging) return;
      dragRef.current.isDragging = false;
      syncDragCursor();
    };
    syncDragCursor();
    const applyMatrixColor = (value, colorMax) => {
      // 使用与3D统一的颜色映射
      return jetWhite3NoWhite(0, colorMax, value);
    };

    const drawMagnifier = (col, row) => {
      const ctx = magnifierCtxRef.current;
      const canvas = magnifierCanvasRef.current;
      if (!ctx || !canvas) return;
      const width = gridRef.current.width;
      const height = gridRef.current.height;
      if (!width || !height) return;
      const dataArr = dataRef.current || [];
      const cells = getMagnifierCells(magnifierZoomRef.current);
      const center = Math.floor(cells / 2);
      const cellSize = canvas.width / cells;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const colorMax = textureMaxRef.current || 22;
      ctx.font = `${Math.max(10, Math.floor(cellSize / 3))}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let y = 0; y < cells; y++) {
        for (let x = 0; x < cells; x++) {
          const gx = col + x - center;
          const gy = row + y - center;
          const isPaddingCell = getSysType() === 'endi'
            && getDisplayType() === 'back2D'
            && gx >= 0 && gx < width
            && gy >= 0 && gy < height
            && !isEndiBackVisibleCell(gy, gx, width, height);
          if (isPaddingCell) {
            continue;
          }
          let value = 0;
          if (gx >= 0 && gx < width && gy >= 0 && gy < height) {
            value = dataArr[gy * width + gx] ?? 0;
          }
          const rawValue = Number(value) || 0;
          value = normalizeDisplayValue(rawValue, textureModeRef.current);
          const [r, g, b] = applyMatrixColor(rawValue, colorMax);
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${NUMBER_TEXT_COLOR_ALPHA})`;
          ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
          ctx.strokeStyle = 'rgba(0,0,0,0.4)';
          ctx.strokeRect(x * cellSize, y * cellSize, cellSize, cellSize);
          ctx.globalAlpha = 1;
          ctx.fillStyle = '#fff';
          ctx.fillText(rawValue.toFixed(1), x * cellSize + cellSize / 2, y * cellSize + cellSize / 2);
        }
      }
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.strokeRect(center * cellSize + 1, center * cellSize + 1, cellSize - 2, cellSize - 2);
      ctx.lineWidth = 1;
    };
    drawMagnifierRef.current = drawMagnifier;

    const handleMouseMove = (event) => {
      if (!magnifierEnabledRef.current) return;
      const rect = renderer.domElement.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;
      const width = gridRef.current.width;
      const height = gridRef.current.height;
      if (!width || !height) return;
      const maxSide = Math.max(width, height);
      const padX = (maxSide - width) / (2 * maxSide);
      const padY = (maxSide - height) / (2 * maxSide);
      let nx = x / rect.width;
      let ny = y / rect.height;
      nx = Math.min(1 - padX, Math.max(padX, nx));
      ny = Math.min(1 - padY, Math.max(padY, ny));
      let col = Math.floor(((nx - padX) / (1 - 2 * padX)) * width);
      let row = Math.floor(((ny - padY) / (1 - 2 * padY)) * height);
      col = Math.max(0, Math.min(width - 1, col));
      row = Math.max(0, Math.min(height - 1, row));
      if (invertYRef.current) {
        row = height - 1 - row;
      }
      magnifierPosRef.current = { col, row };
      drawMagnifier(col, row);
    };

    const handleMouseLeave = () => {
      magnifierPosRef.current = { col: -1, row: -1 };
      const ctx = magnifierCtxRef.current;
      const canvas = magnifierCanvasRef.current;
      if (ctx && canvas && magnifierEnabledRef.current) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };

    const handleWheel = (event) => {
      const rect = renderer.domElement.getBoundingClientRect();
      const overCanvas = event.clientX >= rect.left && event.clientX <= rect.right
        && event.clientY >= rect.top && event.clientY <= rect.bottom;
      const overMagnifier = isPointerInsideMagnifier(event);
      if (!overCanvas && !overMagnifier) return;
      event.preventDefault();
      if (interactionLockedRef.current) return;
      if (!overMagnifier) {
        const currentPercent = useEquipStore.getState().num2DZoom || props.zoom || 100;
        applyCanvasZoom(currentPercent + (event.deltaY < 0 ? 10 : -10), event);
        return;
      }
      const nextZoom = Math.max(0.75, Math.min(3, magnifierZoomRef.current + (event.deltaY < 0 ? 0.25 : -0.25)));
      if (nextZoom === magnifierZoomRef.current) return;
      magnifierZoomRef.current = nextZoom;
      const magnifierCanvas = magnifierCanvasRef.current;
      if (magnifierCanvas) {
        const size = Math.round(200 * Math.min(1.5, Math.max(1, nextZoom)));
        magnifierCanvas.style.width = `${size}px`;
        magnifierCanvas.style.height = `${size}px`;
      }
      if (magnifierPosRef.current.col >= 0) {
        drawMagnifier(magnifierPosRef.current.col, magnifierPosRef.current.row);
      }
    };

    wheelTarget.addEventListener('mousedown', handleMouseDown);
    wheelTarget.addEventListener('mousemove', handleMouseMove);
    wheelTarget.addEventListener('mouseleave', handleMouseLeave);
    wheelTarget.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('mousemove', handleCanvasDragMove);
    window.addEventListener('mouseup', handleCanvasDragEnd);

    return () => {
      cleanupThree({ scene, renderer, animationId: animationRequestId })
      wheelTarget.removeEventListener('mousedown', handleMouseDown);
      wheelTarget.removeEventListener('mousemove', handleMouseMove);
      wheelTarget.removeEventListener('mouseleave', handleMouseLeave);
      wheelTarget.removeEventListener('wheel', handleWheel);
      window.removeEventListener('mousemove', handleCanvasDragMove);
      window.removeEventListener('mouseup', handleCanvasDragEnd);
    };

  }, [])

  useEffect(() => {
    zoomRef.current = normalizeZoomScale(props.zoom);
    const camera = cameraRef.current;
    if (camera) {
      camera.zoom = zoomRef.current;
      camera.updateProjectionMatrix();
    }
  }, [props.zoom])

  useEffect(() => {
    const locked = Boolean(onSelect || onRuler);
    interactionLockedRef.current = locked;
    const canvasNum = canvasRef.current;
    if (canvasNum) {
      canvasNum.style.cursor = locked ? 'default' : 'grab';
    }
    if (locked) {
      dragRef.current.isDragging = false;
      useEquipStore.getState().setNum2DZoom(100);
      zoomRef.current = 1;
      if (resetCameraRef.current) {
        resetCameraRef.current();
      } else {
        pendingResetRef.current = true;
      }
    }
  }, [onSelect, onRuler])

  useEffect(() => {
    magnifierEnabledRef.current = Boolean(onMagnifier);
    const magnifierCanvas = magnifierCanvasRef.current;
    if (magnifierCanvas) {
      magnifierCanvas.style.display = onMagnifier ? 'block' : 'none';
      if (!onMagnifier) {
        const ctx = magnifierCtxRef.current;
        if (ctx) ctx.clearRect(0, 0, magnifierCanvas.width, magnifierCanvas.height);
      }
    }
  }, [onMagnifier])

  useEffect(() => {
    const reset2DView = () => {
      useEquipStore.getState().setNum2DZoom(100);
      zoomRef.current = 1;
      if (resetCameraRef.current) {
        resetCameraRef.current();
      } else {
        pendingResetRef.current = true;
      }
    };
    window.addEventListener('reset-num-2d-view', reset2DView);
    return () => window.removeEventListener('reset-num-2d-view', reset2DView);
  }, [])

  // useEffect(() => {

  // }, [])


  const canvasRef = useRef()

  return (
    <div ref={canvasRef} className='canvasNum' //className={props.classIndex ? `.canvasNum${props.classIndex}` : '.canvasNum'} 
    >

    </div>
  )
}
