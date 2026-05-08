import React, { useContext, useEffect, useRef } from 'react'
import * as THREE from "three";
import { pageContext } from '../../page/test/Test';
import './canvas.scss'
import { cleanupThree } from '../../util/disposeThree'
import { getAdcLower, getAdcUpper, getDisplayType, getSettingValue, getStatus, getSysType, useEquipStore } from '../../store/equipStore';
import { isMoreMatrix } from '../../assets/util/util';

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

let oldColor = 0

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
  const magnifierPosRef = useRef({ col: -1, row: -1 });
  const drawMagnifierRef = useRef(null);
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


  function createDigitSpriteSheetWithJet(value = 22) {
    const canvas = document.createElement("canvas");
    // document.body.appendChild(canvas)
    canvas.width = canvas.height = 512;
    const ctx = canvas.getContext("2d");

    const gridSize = 16;
    const cellSize = 32;

    ctx.font = "bold 20px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (let i = 0; i < 256; i++) {
      const x = i % gridSize;
      const y = Math.floor(i / gridSize);
      const cx = x * cellSize;
      const cy = y * cellSize;

      // ✅ 计算背景颜色
      const [r, g, b] = jet(0, value, i);
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      ctx.fillRect(cx, cy, cellSize, cellSize);

      // ✅ 黑色边框
      ctx.strokeStyle = "black";
      ctx.lineWidth = 1;
      ctx.strokeRect(cx, cy, cellSize, cellSize);

      // ✅ 白色数字
      ctx.fillStyle = "white";
      ctx.fillText(i.toString(), cx + cellSize / 2, cy + cellSize / 2);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.flipY = false;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.NearestFilter;
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

    const canvasNum = document.querySelector('.canvasNum')
    canvasNum.style.display = 'flex'
    canvasNum.style.gap = '1rem'
    canvasNum.style.alignItems = 'center'
    canvasNum.style.justifyContent = 'center'
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
      renderer.domElement.style.position = 'absolute'
      renderer.domElement.style.left = '0'
      renderer.domElement.style.top = '0'
      renderer.domElement.style.zIndex = '1'
      canvasInner.appendChild(renderer.domElement);

      const canvasRuler = document.createElement('canvas');
      canvasRuler.style.width = `${height}px`
      canvasRuler.style.height = `${height}px`
      canvasRuler.width = `${height}`
      canvasRuler.height = `${height}`
      canvasRuler.style.position = 'absolute'
      canvasRuler.style.left = '0'
      canvasRuler.style.top = '0'
      canvasRuler.style.zIndex = '2'
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
    camera.zoom = 1;
    camera.updateProjectionMatrix();
    cameraRef.current = camera;
    const initialCamera = {
      position: camera.position.clone(),
      zoom: camera.zoom
    };
    resetCameraRef.current = () => {
      camera.position.copy(initialCamera.position);
      camera.zoom = initialCamera.zoom;
      camera.updateProjectionMatrix();
    };

    const texture = createDigitSpriteSheetWithJet();
    textureMaxRef.current = 22;
    // texture.flipY = false;


    const material = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: texture },
        tileSize: { value: 1.0 / 16.0 }
      },
      vertexShader: `
        attribute vec3 instanceColor;
        varying vec3 vColor;
        attribute vec2 uvOffset;
        uniform float tileSize;
        varying vec2 vUv;
        void main() {
          vUv = uv * tileSize + uvOffset;
          vColor = instanceColor;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D map;
        varying vec2 vUv;
        varying vec3 vColor;

        vec3 linearToSRGB(vec3 color) {
  return pow(color*1.5, vec3(1.0 / 2.2));  // Gamma 矫正
}

        void main() {
          vec4 texColor = texture2D(map, vUv);
          if (texColor.a < 0.1) discard;

           vec3 rgb = texColor.rgb * vColor; // 染色
            rgb = linearToSRGB(rgb);   

            // 乘以格子颜色
          gl_FragColor = vec4(rgb, texColor.a);
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
    let gridSize = numWitdh, gridSize1 = numHeight//64 / size;


    console.log(gridSize, 'gridSizegridSize')
    // 总大小  64 * 0.032

    let count = gridSize * gridSize;
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
    invertYRef.current = false;


    function animate() {

      // let data = pageRef.current.equipStatus.data
      // let data = getStatus()
      // console.log(data)
       let data = new Array(4096).fill(0)
      const systemType = getSysType()
      // forceDisplayType prop 允许坐垫/靠背独立视图直接指定显示类型
      const displayType = props.forceDisplayType || getDisplayType()
      if (isMoreMatrix(systemType)) {
        if (displayType != 'all') {
          let realType = ''
          if (displayType == 'back2D' || displayType == 'back') {
            realType = "back"
          } else if (displayType == 'sit2D' || displayType == 'sit') {
            realType = "sit"
            // if(systemType == 'endi'){
            //   gridSize = 45
            //   count = gridSize * gridSize;
            //   uvOffsets = new Float32Array(count * 2);
            // }
          }
          data = props.sitData.current[realType]
          if (!data) data = new Array(4096).fill(0)
        }
      } else {
        data = props.sitData.current[systemType]
        if (!data) data = new Array(4096).fill(0)
      }

      dataRef.current = data;
      gridRef.current = { width: gridSize, height: gridSize };


      // const yArr = []
      // for (let i = 0; i < 46; i++) {
      //   yArr.push(45 - i)
      // }

      // const newArr = []
      // for(let i = 0 ; i < 46 ; i++){
      //   for(let j = 0 ; j < 46 ; j++){
      //     const width = yArr[i]
      //     newArr.push(data[width * 46 + 45-j])
      //   }
      // }
      // data = newArr


      const {
        gauss, filter, height, coherent,
      } = getSettingValue() //pageRef.current.settingValue
      const color = getAdcUpper()
      const colorMin = getAdcLower()
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

      if(oldColor !== color && oldColor !== undefined){
        // ADC 上限直接作为颜色映射最大值（0~255）
        const nextMax = Math.max(1, Math.round(color))
        const texture = createDigitSpriteSheetWithJet(nextMax)
        material.uniforms.map.value = texture
        textureMaxRef.current = nextMax
      }

      oldColor = color



      // console.log(new Date().getTime() - oldTime,)
      // controls.update();
      animationRequestId = requestAnimationFrame(animate);
      //  = rangeValue/Math.PI/2

      // console.log(count)
      for (let i = 0; i < count; i++) {
        const x = i % gridSize;
        const y = Math.floor(i / gridSize);
        dummy.position.set((x - (gridSize / 2 - 0.5)) / (gridSize / 2), (y - (gridSize / 2 - 0.5)) / (gridSize / 2), 0); // 居中

        // dummy.position.set((x ) / 32, (y ) / 32, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);

        const d = data[i]//Math.floor(Math.random() * 256);
        uvOffsets[i * 2] = (d % 16) / 16;
        uvOffsets[i * 2 + 1] = Math.floor(d / 16) / 16;

        // const d = Math.floor(Math.random() * 256);
        const r = d / 255;
        const g = 0.2;
        const b = 1.0 - r;

        colorArray[i * 3 + 0] = r;
        colorArray[i * 3 + 1] = g;
        colorArray[i * 3 + 2] = b;

        // const rgb = jet(0 , 30 , d)

        // colorArray[i * 3 + 0] = rgb[0];
        // colorArray[i * 3 + 1] = rgb[1];
        // colorArray[i * 3 + 2] = rgb[2];

        geometry.setAttribute("instanceColor", new THREE.InstancedBufferAttribute(colorArray, 3));
        geometry.attributes.instanceColor.needsUpdate = true;
        geometry.setAttribute('uvOffset', new THREE.InstancedBufferAttribute(uvOffsets, 2));
        // console.log(uvOffsets.length)
        geometry.attributes.uvOffset.needsUpdate = true;

      }
      renderer.render(scene, camera);
      oldTime = new Date().getTime()

      // 放大镜实时更新：即使鼠标不动，数据变化时也重绘放大镜
      if (magnifierEnabledRef.current && drawMagnifierRef.current && magnifierPosRef.current.col >= 0) {
        drawMagnifierRef.current(magnifierPosRef.current.col, magnifierPosRef.current.row);
      }

    }

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
    const applyMatrixColor = (value, colorMax) => {
      const [tr, tg, tb] = jet(0, colorMax, value).map((v) => v / 255);
      const vr = value / 255;
      let r = tr * vr;
      let g = tg * 0.2;
      let b = tb * (1 - vr);
      r = Math.pow(Math.min(1, r * 1.5), 1 / 2.2);
      g = Math.pow(Math.min(1, g * 1.5), 1 / 2.2);
      b = Math.pow(Math.min(1, b * 1.5), 1 / 2.2);
      return [
        Math.round(r * 255),
        Math.round(g * 255),
        Math.round(b * 255)
      ];
    };

    const drawMagnifier = (col, row) => {
      const ctx = magnifierCtxRef.current;
      const canvas = magnifierCanvasRef.current;
      if (!ctx || !canvas) return;
      const width = gridRef.current.width;
      const height = gridRef.current.height;
      if (!width || !height) return;
      const dataArr = dataRef.current || [];
      const cells = 5;
      const cellSize = canvas.width / cells;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const colorMax = textureMaxRef.current || 22;
      ctx.font = `${Math.max(10, Math.floor(cellSize / 3))}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let y = 0; y < cells; y++) {
        for (let x = 0; x < cells; x++) {
          const gx = col + x - 2;
          const gy = row + y - 2;
          let value = 0;
          if (gx >= 0 && gx < width && gy >= 0 && gy < height) {
            value = dataArr[gy * width + gx] ?? 0;
          }
          const [r, g, b] = applyMatrixColor(value, colorMax);
          ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
          ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
          ctx.strokeStyle = 'rgba(0,0,0,0.4)';
          ctx.strokeRect(x * cellSize, y * cellSize, cellSize, cellSize);
          ctx.fillStyle = '#fff';
          ctx.fillText(Math.round(value), x * cellSize + cellSize / 2, y * cellSize + cellSize / 2);
        }
      }
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.strokeRect(2 * cellSize + 1, 2 * cellSize + 1, cellSize - 2, cellSize - 2);
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

    wheelTarget.addEventListener('mousemove', handleMouseMove);
    wheelTarget.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      cleanupThree({ scene, renderer, animationId: animationRequestId })
      wheelTarget.removeEventListener('mousemove', handleMouseMove);
      wheelTarget.removeEventListener('mouseleave', handleMouseLeave);
    };

  }, [])

  useEffect(() => {
    const locked = Boolean(onSelect || onRuler);
    interactionLockedRef.current = locked;
    if (locked) {
      dragRef.current.isDragging = false;
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

  // useEffect(() => {

  // }, [])




  return (
    <div className='canvasNum' >

    </div>
  )
}
