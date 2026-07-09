import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { TrackballControls } from "three/examples/jsm/controls/TrackballControls";
import React, { useEffect, useImperativeHandle, useRef } from "react";
import TWEEN from "@tweenjs/tween.js";
import { WebGLCanvas } from "../webgl/WebGL.HeatMap copy 2";
import { genWebglData } from "../../page/home/robotUtil";

const MATRIX_WIDTH = 32;
const MATRIX_HEIGHT = 32;
const UV_GRID_SIZE = 64;
const UV_CANVAS_SIZE = 400;
const WEBGL_TILE_SIZE = 128;
const WEBGL_SOURCE_WIDTH = 128;
const WEBGL_SOURCE_HEIGHT = 2048;
const HUMAN_BODY_WEBGL_PADDING = 2;
const HUMAN_BODY_WEBGL_INTERP = 3;
const DEFAULT_LIGHT_INTENSITY = 0.22;
const HUMAN_MODEL_ASSET = "./model/human3.glb";
const KEYBOARD_ROTATE_STEP = 5;
const DEFAULT_RENDER_OPTIONS = {
  min: 1,
  max: 100,
  size: 60,
  filter: 0,
  blurFactor: 0.72,
};
const createDefaultModelTransform = () => ({
  position: { x: 0, y: 26, z: -9.5 },
  rotation: { x: -140, y: 0, z: -180 },
});
let ndata1 = new Array(MATRIX_WIDTH * MATRIX_HEIGHT).fill(0);

const BACK_IDX = [
  [619, 620, 621, 622, 623, 609, 610, 611, 612, 613],
  [651, 652, 653, 654, 655, 641, 642, 643, 644, 645],
  [683, 684, 685, 686, 687, 673, 674, 675, 676, 677],
  [75, 76, 77, 78, 79, 65, 66, 67, 68, 69],
  [43, 44, 45, 46, 47, 33, 34, 35, 36, 37],
  [11, 12, 13, 14, 15, 1, 2, 3, 4, 5],
];

const CHEST_IDX = [
  [692, 691, 690, 689, 688, 682, 681, 680, 679, 678],
  [660, 659, 658, 657, 656, 650, 649, 648, 647, 646],
  [628, 627, 626, 625, 624, 618, 617, 616, 615, 614],
  [20, 19, 18, 17, 16, 10, 9, 8, 7, 6],
  [52, 51, 50, 49, 48, 42, 41, 40, 39, 38],
  [84, 83, 82, 81, 80, 74, 73, 72, 71, 70],
];

const RIGHT_ARM_IDX = [
  [736, 768, 800, 832, 864, 1024, 992],
  [735, 767, 799, 831, 863, 1023, 991],
  [734, 766, 798, 830, 862, 1022, 990],
  [733, 765, 797, 829, 861, 1021, 989],
  [732, 764, 796, 828, 860, 1020, 988],
  [731, 763, 795, 827, 859, 1019, 987],
];

const RIGHT_SHOULDER_IDX = [
  [960, 928, 896],
  [959, 927, 895],
  [958, 926, 894],
  [957, 925, 893],
  [956, 924, 892],
  [955, 923, 891],
];

const LEFT_ARM_IDX = [
  [1013, 981, 853, 821, 789, 757, 725],
  [1014, 982, 854, 822, 790, 758, 726],
  [1015, 983, 855, 823, 791, 759, 727],
  [1016, 984, 856, 824, 792, 760, 728],
  [1017, 985, 857, 825, 793, 761, 729],
  [1018, 986, 858, 826, 794, 762, 730],
];

const LEFT_SHOULDER_IDX = [
  [885, 917, 949],
  [886, 918, 950],
  [887, 919, 951],
  [888, 920, 952],
  [889, 921, 953],
  [890, 922, 954],
];

const BACK_PANTS_RIGHT_IDX = [
  [197, 196, 195, 194, 193],
  [165, 164, 163, 162, 161],
  [133, 132, 131, 130, 129],
  [101, 100, 99, 98, 97],
  [229, 228, 227, 226, 225],
  [261, 260, 259, 258, 257],
  [293, 292, 291, 290, 289],
  [325, 324, 323, 322, 321],
].reverse();

const BACK_PANTS_LEFT_IDX = [
  [495, 494, 493, 492, 491],
  [527, 526, 525, 524, 523],
  [559, 558, 557, 556, 555],
  [591, 590, 589, 588, 587],
  [463, 462, 461, 460, 459],
  [431, 430, 429, 428, 427],
  [399, 398, 397, 396, 395],
  [367, 366, 365, 364, 363],
].reverse();

const FRONT_PANTS_LEFT_IDX = [
  
  [500, 499, 498, 497, 496],
  [532, 531, 530, 529, 528],
  [564, 563, 562, 561, 560],
  [596, 595, 594, 593, 592],
  [468, 467, 466, 465, 464],
  [436, 435, 434, 433, 432],
  [404, 403, 402, 401, 400],
  [372, 371, 370, 369, 368],
];

const FRONT_PANTS_RIGHT_IDX = [
  [202, 201, 200, 199, 198],
  [170, 169, 168, 167, 166],
  [138, 137, 136, 135, 134],
  [106, 105, 104, 103, 102],
  [234, 233, 232, 231, 230],
  [266, 265, 264, 263, 262],
  [298, 297, 296, 295, 294],
  [330, 329, 328, 327, 326],
];

const createUvRegionFromGrid = (x1, x2, y1, y2) => {
  const cellSize = UV_CANVAS_SIZE / UV_GRID_SIZE;
  return {
    x: x1 * cellSize,
    y: y1 * cellSize,
    w: (x2 - x1) * cellSize,
    h: (y2 - y1) * cellSize,
  };
};

const UV_REGIONS = {
  back: createUvRegionFromGrid(2, 25, 2, 30),
  chest: createUvRegionFromGrid(2, 25, 35, 64),
  rightArm: createUvRegionFromGrid(19, 32, 28, 33),
  rightShoulder: createUvRegionFromGrid(30, 42, 25, 35),
  leftArm: createUvRegionFromGrid(48, 63, 28, 33),
  leftShoulder: createUvRegionFromGrid(39, 51, 25, 35),
  backPantsLeft: createUvRegionFromGrid(31, 42, 0, 28),
  backPantsRight: createUvRegionFromGrid(44, 54, 0, 28),
  frontPantsLeft: createUvRegionFromGrid(31, 42, 35, 64),
  frontPantsRight: createUvRegionFromGrid(44, 54, 35, 64),
};

const UV_REGIONS1 = {
  back: createUvRegionFromGrid(4, 21, 6, 24),
  chest: createUvRegionFromGrid(4, 21, 40, 60),
  rightArm: createUvRegionFromGrid(17, 36, 28, 33),
  rightShoulder: createUvRegionFromGrid(32, 40, 28, 33),
  leftArm: createUvRegionFromGrid(45, 63, 28, 33),
  leftShoulder: createUvRegionFromGrid(40, 48, 28, 33),
  backPantsLeft: createUvRegionFromGrid(31, 42, 1, 24),
  backPantsRight: createUvRegionFromGrid(44, 54, 1, 24),
  frontPantsLeft: createUvRegionFromGrid(31, 42, 30, 64),
  frontPantsRight: createUvRegionFromGrid(44, 54, 30, 64),
};

const createPartConfig = (key, idxMatrix, uv, options = {}) => ({
  key,
  uv,
  width: idxMatrix[0].length,
  height: idxMatrix.length,
  positions: idxMatrix.flat(),
  order: options.order ?? HUMAN_BODY_WEBGL_PADDING,
  interp1: options.interp1 ?? HUMAN_BODY_WEBGL_INTERP,
  interp2: options.interp2 ?? HUMAN_BODY_WEBGL_INTERP,
});

const BODY_PARTS = [
  createPartConfig("back", BACK_IDX, UV_REGIONS.back),
  createPartConfig("chest", CHEST_IDX, UV_REGIONS.chest),
  createPartConfig("rightArm", RIGHT_ARM_IDX, UV_REGIONS.rightArm),
  createPartConfig("rightShoulder", RIGHT_SHOULDER_IDX, UV_REGIONS.rightShoulder),
  createPartConfig("leftArm", LEFT_ARM_IDX, UV_REGIONS.leftArm),
  createPartConfig("leftShoulder", LEFT_SHOULDER_IDX, UV_REGIONS.leftShoulder),
  createPartConfig("backPantsLeft", BACK_PANTS_LEFT_IDX, UV_REGIONS.backPantsLeft),
  createPartConfig("backPantsRight", BACK_PANTS_RIGHT_IDX, UV_REGIONS.backPantsRight),
  createPartConfig("frontPantsLeft", FRONT_PANTS_LEFT_IDX, UV_REGIONS.frontPantsLeft),
  createPartConfig("frontPantsRight", FRONT_PANTS_RIGHT_IDX, UV_REGIONS.frontPantsRight),
];

const HumanBodyCanvas = React.forwardRef((props, refs) => {
  const textureCanvasRef = useRef();
  const textureRef = useRef();
  const webglHeatmapRef = useRef();
  const modelTransformRef = useRef(createDefaultModelTransform());
  const heatmapOptionsRef = useRef({
    ...DEFAULT_RENDER_OPTIONS,
    ...props.renderOptions,
  });

  const FPS = 10;
  let timeS = 0;
  const renderT = 1 / FPS;
  const clock = new THREE.Clock();

  let camera;
  let scene;
  let renderer;
  let controls;
  let animationRequestId;
  let chair;
  let controlsFlag = true;
  const lightGroup = new THREE.Group();

  const ALT_KEY = 18;
  const CTRL_KEY = 17;
  const CMD_KEY = 91;
  const LEFT_KEY = "ArrowLeft";
  const RIGHT_KEY = "ArrowRight";

  function paintBaseTexture(canvas) {
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#aaaaaa";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function buildPartHeatmapInput(source) {
    const threshold = Number(heatmapOptionsRef.current.filter) || 0;
    return BODY_PARTS.map((part) => ({
      arr: part.positions.map((position) => {
        const value = Number(source[position - 1]) || 0;
        return value >= threshold ? value : 0;
      }),
      width: part.width,
      height: part.height,
      order: part.order,
      interp1: part.interp1,
      interp2: part.interp2,
    }));
  }

  function drawHeatmapToUV(canvas, sourceCanvas) {
    paintBaseTexture(canvas);
    if (!sourceCanvas) {
      return;
    }

    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    BODY_PARTS.forEach((part, index) => {
      ctx.drawImage(
        sourceCanvas,
        0,
        WEBGL_TILE_SIZE * index,
        WEBGL_TILE_SIZE,
        WEBGL_TILE_SIZE,
        part.uv.x,
        part.uv.y,
        part.uv.w,
        part.uv.h
      );
    });
  }

  function applyModelTransform() {
    if (!chair) {
      return;
    }

    const { position, rotation } = modelTransformRef.current;
    chair.position.set(position.x, position.y, position.z);
    chair.rotation.set(
      THREE.MathUtils.degToRad(rotation.x),
      THREE.MathUtils.degToRad(rotation.y),
      THREE.MathUtils.degToRad(rotation.z)
    );
  }

  function syncControlsTargetToModel() {
    if (!chair || !controls || !camera) {
      return;
    }

    const box = new THREE.Box3().setFromObject(chair);
    const center = box.getCenter(new THREE.Vector3());
    controls.target.copy(center);
    camera.lookAt(center);
    controls.update();
  }

  function init() {
    const container = document.getElementById("canvasHumanBody");

    camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 1, 150000);
    camera.position.z = -10;
    camera.position.y = 30;
    camera.position.x = 0;
    camera.lookAt(0, 0, 0);

    scene = new THREE.Scene();
    scene.add(lightGroup);
    webglHeatmapRef.current = new WebGLCanvas();

    const loader = new GLTFLoader();
    loader.load(HUMAN_MODEL_ASSET, (gltf) => {
      chair = gltf.scene;
      scene.add(chair);
      applyModelTransform();

      textureCanvasRef.current = document.createElement("canvas");
      textureCanvasRef.current.width = UV_CANVAS_SIZE;
      textureCanvasRef.current.height = UV_CANVAS_SIZE;
      paintBaseTexture(textureCanvasRef.current);

      addCanvas(chair, textureCanvasRef.current);
      syncControlsTargetToModel();
    });

    const helper = new THREE.GridHelper(2000, 100);
    helper.position.y = -199;
    helper.material.opacity = 0.25;
    helper.material.transparent = true;
    scene.add(helper);

    const coordinates = [80, 0, -80];
    for (const x of coordinates) {
      for (const y of coordinates) {
        for (const z of coordinates) {
          const pointlight = new THREE.PointLight(0xffffff, DEFAULT_LIGHT_INTENSITY, 600);
          pointlight.position.set(x, y, z);
          lightGroup.add(pointlight);
        }
      }
    }

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.setClearColor(0x10152b);

    if (container.childNodes.length === 0) {
      container.appendChild(renderer.domElement);
    }

    controls = new TrackballControls(camera, renderer.domElement);
    controls.dynamicDampingFactor = 1;
    controls.domElement = container;
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.PAN,
      MIDDLE: THREE.MOUSE.ZOOM,
      RIGHT: THREE.MOUSE.ROTATE,
    };
    syncControlsTargetToModel();
  }

  function addCanvas(model, canvas) {
    textureRef.current = new THREE.CanvasTexture(canvas);
    textureRef.current.needsUpdate = true;
    textureRef.current.flipY = false;
    textureRef.current.repeat.set(1, 1);
    textureRef.current.premultiplyAlpha = false;
    textureRef.current.encoding = THREE.sRGBEncoding;
    textureRef.current.wrapS = THREE.ClampToEdgeWrapping;
    textureRef.current.wrapT = THREE.ClampToEdgeWrapping;

    const applyMatteFinish = (material) => {
      material.map = textureRef.current;

      if ("metalness" in material) material.metalness = 0;
      if ("roughness" in material) material.roughness = 1;
      if ("envMapIntensity" in material) material.envMapIntensity = 0;
      if ("clearcoat" in material) material.clearcoat = 0;
      if ("clearcoatRoughness" in material) material.clearcoatRoughness = 1;
      if ("sheen" in material) material.sheen = 0;
      if ("sheenRoughness" in material) material.sheenRoughness = 1;
      if ("reflectivity" in material) material.reflectivity = 0;
      if ("shininess" in material) material.shininess = 0;
      if ("specular" in material && material.specular?.setRGB) {
        material.specular.setRGB(0, 0, 0);
      }

      material.needsUpdate = true;
    };

    model.traverse((child) => {
      if (!child.isMesh) {
        return;
      }

      if (Array.isArray(child.material)) {
        child.material.forEach((mat) => {
          applyMatteFinish(mat);
        });
        return;
      }

      applyMatteFinish(child.material);
    });
  }

  function canvasRenew(texture, canvas) {
    canvas.id = "human-body-dynamic";
    // if(!document.getElementById("human-body-dynamic")){
    //   document.body.appendChild(canvas);
    // }
    if (!canvas || !webglHeatmapRef.current) {
      return;
    }
    // ndata1 = new Array(1024).fill(244)
    const sourceData = buildPartHeatmapInput(ndata1);
    const webglData = genWebglData(sourceData, {
      canvasWidth: WEBGL_TILE_SIZE,
      canvasHeight: WEBGL_TILE_SIZE,
    });
    const sourceCanvas = webglHeatmapRef.current.render(
      {
        width: WEBGL_SOURCE_WIDTH,
        height: WEBGL_SOURCE_HEIGHT,
        radius: heatmapOptionsRef.current.size,
        max: heatmapOptionsRef.current.max,
        min: heatmapOptionsRef.current.min,
        filter: heatmapOptionsRef.current.filter,
        blurFactor: heatmapOptionsRef.current.blurFactor,
        class: "body",
      },
      webglData,
      "human-body-dynamic"
    )[0];

    drawHeatmapToUV(canvas, sourceCanvas);

    if (texture) {
      texture.needsUpdate = true;
    }
  }

  function animate() {
    animationRequestId = requestAnimationFrame(animate);
    render();
  }

  function render() {
    const T = clock.getDelta();
    timeS += T;

    if (timeS > renderT) {
      canvasRenew(textureRef.current, textureCanvasRef.current);
      timeS = 0;
    }

    TWEEN.update();
    if (controlsFlag) {
      controls.mouseButtons = {
        LEFT: THREE.MOUSE.PAN,
        MIDDLE: THREE.MOUSE.ZOOM,
        RIGHT: THREE.MOUSE.ROTATE,
      };
      controls.keys = [ALT_KEY, CTRL_KEY, CMD_KEY];
      controls.update();
    } else {
      controls.keys = [];
      controls.mouseButtons = [];
    }

    renderer.render(scene, camera);
  }

  function sitData(prop) {
    const { wsPointData } = prop;

    if (wsPointData) {
      ndata1 = wsPointData.map((value) => Number(value)*10 || 0);
    }
    
  }

  function changeModelTransform(transformPatch) {
    if (!transformPatch) {
      return;
    }

    modelTransformRef.current = {
      position: {
        ...modelTransformRef.current.position,
        ...(transformPatch.position ?? {}),
      },
      rotation: {
        ...modelTransformRef.current.rotation,
        ...(transformPatch.rotation ?? {}),
      },
    };

    applyModelTransform();
    syncControlsTargetToModel();
  }

  function rotateModelByKeyboard(deltaY) {
    modelTransformRef.current = {
      ...modelTransformRef.current,
      rotation: {
        ...modelTransformRef.current.rotation,
        y: modelTransformRef.current.rotation.y + deltaY,
      },
    };
    applyModelTransform();
  }

  function isTextInputTarget(target) {
    const tagName = target?.tagName?.toLowerCase();
    return target?.isContentEditable || tagName === "input" || tagName === "textarea" || tagName === "select";
  }

  function handleKeyDown(event) {
    if (isTextInputTarget(event.target)) {
      return;
    }

    if (event.key === LEFT_KEY) {
      event.preventDefault();
      event.stopPropagation();
      event.nativeEvent?.stopImmediatePropagation?.();
      event.stopImmediatePropagation?.();
      rotateModelByKeyboard(-KEYBOARD_ROTATE_STEP);
      return;
    }

    if (event.key === RIGHT_KEY) {
      event.preventDefault();
      event.stopPropagation();
      event.nativeEvent?.stopImmediatePropagation?.();
      event.stopImmediatePropagation?.();
      rotateModelByKeyboard(KEYBOARD_ROTATE_STEP);
    }
  }

  function changeColor({ max, size, filter, light, blurFactor }) {
    if (max !== undefined) {
      heatmapOptionsRef.current.max = max;
    }
    if (size !== undefined) {
      heatmapOptionsRef.current.size = size;
    }
    if (filter !== undefined) {
      heatmapOptionsRef.current.filter = filter;
    }
    if (blurFactor !== undefined) {
      heatmapOptionsRef.current.blurFactor = blurFactor;
    }
    if (light !== undefined) {
      lightGroup.children.forEach((lightItem) => {
        lightItem.intensity = light;
      });
    }
  }

  function changeFlag(value) {
    controlsFlag = value;
  }

  useImperativeHandle(refs, () => ({
    sitData,
    changeColor,
    changeFlag,
    changeModelTransform,
  }));

  useEffect(() => {
    if (props.renderOptions) {
      heatmapOptionsRef.current = {
        ...heatmapOptionsRef.current,
        ...props.renderOptions,
      };
    }
  }, [props.renderOptions]);

  useEffect(() => {
    init();
    animate();
    window.addEventListener("keydown", handleKeyDown, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      if (animationRequestId) {
        cancelAnimationFrame(animationRequestId);
      }
    };
  }, []);

  return (
    <div>
      <div style={{ width: "100%", height: "100%" }} id="canvasHumanBody" />
    </div>
  );
});

export default HumanBodyCanvas;
