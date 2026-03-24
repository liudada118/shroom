import Stats from "three/examples/jsm/libs/stats.module.js";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { TrackballControls } from "three/examples/jsm/controls/TrackballControls";
import React, { memo, useContext, useEffect, useImperativeHandle, useRef, useState, useCallback } from "react";
import { cleanupThree } from '../../util/disposeThree'
import { TextureLoader } from "three";
import * as TWEEN from '@tweenjs/tween.js'
import {
    addSide,
    gaussBlur_return,
    interpSquare,
    jet,
    jetgGrey,
} from "../../util/util";
import gsap from "gsap";
import { pageContext } from "../../page/test/Test";
import { jetWhite3, lineInterp } from "../../assets/util/line";
import { getDisplayType, getSettingValue, getStatus } from "../../store/equipStore";
import { useWhyReRender } from "../../hooks/useWindowsize";

// function rotate90(arr, height, width) {
//     //逆时针旋转 90 度
//     //列 = 行
//     //行 = n - 1 - 列(j);  n表示总行数
//     let matrix = [];
//     for (let i = 0; i < height; i++) {
//         matrix[i] = [];
//         for (let j = 0; j < width; j++) {
//             matrix[i].push(arr[i * height + j]);
//         }
//     }

//     var temp = [];
//     var len = matrix.length;
//     for (var i = 0; i < len; i++) {
//         for (var j = 0; j < len; j++) {
//             var k = len - 1 - j;
//             if (!temp[k]) {
//                 temp[k] = [];
//             }
//             temp[k][i] = matrix[i][j];
//         }
//     }
//     let res = [];
//     for (let i = 0; i < temp.length; i++) {
//         res = res.concat(temp[i]);
//     }
//     return res;
// }

function rotateMatrix(matrix, m, n) {
    const rotatedMatrix = new Array(n);

    for (let i = 0; i < n; i++) {
        rotatedMatrix[i] = new Array(m);
        for (let j = 0; j < m; j++) {
            rotatedMatrix[i][j] = matrix[(m - 1 - j) * n + i];
        }
    }
    const rotatedArray = rotatedMatrix.flat();
    return rotatedArray;
}


const sitObj = {

}

const Canvas =
    memo(React.forwardRef((props, refs) => {

        useWhyReRender(props)

        console.log('renderCanvas')
        const {
            // sitnum1 = 32, sitnum2 = 32, sitInterp = 4, sitInterp2 = 2, sitOrder = 4 , 
            sitConfig, backConfig } = props
        let group = new THREE.Group();

        let controlsFlag = true;

        // === 配置面板状态 ===
        const pointGroupRef = useRef(null)
        const [configPanelOpen, setConfigPanelOpen] = useState(false)
        const [configValues, setConfigValues] = useState({
            back: {
                position: props.backPointConfig?.position || [2.5, -15, 0],
                rotation: props.backPointConfig?.rotation || [-Math.PI / 12 - Math.PI / 2, 0, 0],
                scale: props.backPointConfig?.scale || [0.0015, 0.002, 0.002],
                pointSize: props.backPointConfig?.pointSize || 1.0,
            },
            sit: {
                position: props.sitPointConfig?.position || [0, -30, -5],
                rotation: props.sitPointConfig?.rotation || [-Math.PI / 6 - Math.PI / 2 + Math.PI / 2, 0, 0],
                scale: props.sitPointConfig?.scale || [0.0018, 0.0018, 0.0018],
                pointSize: props.sitPointConfig?.pointSize || 1.0,
            }
        })

        const updateThreeObject = useCallback((name, prop, axis, value) => {
            const pg = pointGroupRef.current
            if (!pg) return
            const obj = pg.children.find(a => a.name === name)
            const border = pg.children.find(a => a.name === name + '_border')
            if (!obj) return
            if (prop === 'position') {
                obj.position[axis] = value
                if (border) border.position[axis] = value
            } else if (prop === 'rotation') {
                obj.rotation[axis] = value
                if (border) border.rotation[axis] = value
            } else if (prop === 'scale') {
                obj.scale[axis] = value
                if (border) border.scale[axis] = value
            } else if (prop === 'pointSize') {
                // 更新 PointsMaterial 的 size 属性（pointSize * scale.x * 300）
                if (obj.material) {
                    obj.material.size = value * obj.scale.x * 300
                    obj.material.needsUpdate = true
                }
            }
        }, [])

        const handleConfigChange = useCallback((name, prop, axisIdx, value) => {
            if (value === null || value === undefined) return
            const axisMap = ['x', 'y', 'z']
            if (prop === 'pointSize') {
                setConfigValues(prev => {
                    const next = { ...prev }
                    next[name] = { ...next[name], pointSize: value }
                    return next
                })
                updateThreeObject(name, 'pointSize', null, value)
            } else {
                setConfigValues(prev => {
                    const next = { ...prev }
                    next[name] = { ...next[name] }
                    next[name][prop] = [...next[name][prop]]
                    next[name][prop][axisIdx] = value
                    return next
                })
                updateThreeObject(name, prop, axisMap[axisIdx], value)
            }
        }, [updateThreeObject])

        // let smoothBig = new Array(
        //     (sitnum1 * sitInterp + sitOrder * 2) *
        //     (sitnum2 * sitInterp2 + sitOrder * 2)
        // ).fill(1);

        let timer
        // let camera, 
        let sitshowFlag = false, backshowFlag = false

        function debounce(fn, time) {
            if (timer) clearTimeout(timer)
            timer = setTimeout(() => {
                fn()
            }, time);
        }

        var FPS = 10;
        var timeS = 0;
        var renderT = 1 / FPS;
        let totalArr = [],
            totalPointArr = [];
        let local
        let pointGroup = pointGroupRef.current || new THREE.Group();
        if (!pointGroupRef.current) pointGroupRef.current = pointGroup;
        let particles,
            particles1,
            material,
            backGeometry,
            sitGeometry
        // let controls;

        const controls = useRef()
        const camera = useRef()

        console.log('Canvas')

        // const pageInfo = useContext(pageContext);

        // const pageRef = useRef(pageInfo)

        // useEffect(() => {
        //     pageRef.current = pageInfo
        // }, [pageInfo])



        local = props.local
        var animationRequestId, colSelectFlag = false
        let dataFlag = false;
        const changeDataFlag = () => {
            dataFlag = true;

        };


        let container;

        let scene, renderer;


        const clock = new THREE.Clock();
        const ALT_KEY = 18;
        const CTRL_KEY = 17;
        const CMD_KEY = 91;
        // const AMOUNTX = sitnum1 * sitInterp + sitOrder * 2;
        // const AMOUNTY = sitnum2 * sitInterp2 + sitOrder * 2;
        const SEPARATION = 100;
        // let group = new THREE.Group();
        const groupX = 0, groupY = 20, groupZ = -10

        let positions;
        let colors, scales;

        const stats = new Stats();
        stats.showPanel(0); // 0: FPS, 1: ms, 2: memory
        // document.body.appendChild(stats.dom);

        function init() {



            container = document.getElementById(`canvas`);

            camera.current = new THREE.PerspectiveCamera(
                40,
                window.innerWidth / window.innerHeight,
                1,
                150000
            );


            // camera.position.z = -50;
            // camera.position.y = 0;

            camera.current.position.set(0, 43.05, -120)


            scene = new THREE.Scene();

            // model
            const loader = new GLTFLoader();



            // initSet();
            // initBack();
            group.add(pointGroup);
            initPoints()
            initModel();
            // initMovePoint()
            group.position.x = groupX
            group.position.y = groupY
            group.position.z = groupZ
            group.rotation.x = Math.PI / 6
            // scene.add(group);
            const helper = new THREE.GridHelper(2000, 100);
            helper.position.y = -199;
            helper.material.opacity = 0.25;
            helper.material.transparent = true;
            scene.add(helper);

            // lights
            // const light = new THREE.AmbientLight(0x404040 ,1); // 柔和的白光
            // scene.add(light);
            // const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444);
            // hemiLight.position.set(0, 200, 0);
            // scene.add(hemiLight);
            // const dirLight = new THREE.DirectionalLight(0xffffff);
            // dirLight.position.set(0, 200, 10);
            // scene.add(dirLight);
            // const dirLight1 = new THREE.DirectionalLight(0xffffff);
            // dirLight1.position.set(0, 10, 200);
            // scene.add(dirLight1);

            // Lights
            scene.add(new THREE.AmbientLight(0xffffff, 1));
            scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1));
            const dir = new THREE.DirectionalLight(0xffffff, 1.0);
            dir.position.set(5, 10, 5);
            dir.castShadow = true;
            scene.add(dir);

            // renderer

            renderer = new THREE.WebGLRenderer({ antialias: true });
            renderer.setAnimationLoop(animate);
            renderer.setPixelRatio(window.devicePixelRatio);
            // renderer.setSize(window.innerWidth, window.innerHeight);

            renderer.setSize(window.innerWidth, window.innerHeight);

            container.appendChild(renderer.domElement);

            renderer.setClearColor(0x000000);

            renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
            renderer.toneMapping = THREE.NoToneMapping;

            //FlyControls
            controls.current = new TrackballControls(camera.current, renderer.domElement);
            // 缩放优化配置
            controls.current.zoomSpeed = 0.8;        // 缩放灵敏度（默认1.2，降低使滚轮更平滑）
            controls.current.rotateSpeed = 2.0;      // 旋转灵敏度
            controls.current.panSpeed = 0.8;          // 平移灵敏度
            controls.current.minDistance = 12;        // 最近距离（对应约1000%）
            controls.current.maxDistance = 1200;      // 最远距离（对应约10%）
            controls.current.dynamicDampingFactor = 0.15; // 阻尼系数，使缩放有惯性过渡
            controls.current?.update();
            window.addEventListener("resize", onWindowResize);



        }
        let pointParticles
        function initMovePoint() {
            const SEPARATION = 100, AMOUNTX = 50, AMOUNTY = 50;
            const numParticles = AMOUNTX * AMOUNTY;

            const positions = new Float32Array(numParticles * 3);
            const scales = new Float32Array(numParticles);

            let i = 0, j = 0;

            for (let ix = 0; ix < AMOUNTX; ix++) {

                for (let iy = 0; iy < AMOUNTY; iy++) {

                    positions[i] = ix * SEPARATION - ((AMOUNTX * SEPARATION) / 2); // x
                    positions[i + 1] = 0; // y
                    positions[i + 2] = iy * SEPARATION - ((AMOUNTY * SEPARATION) / 2); // z

                    scales[j] = 1;

                    i += 3;
                    j++;

                }

            }

            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            geometry.setAttribute('scale', new THREE.BufferAttribute(scales, 1));

            const material = new THREE.ShaderMaterial({

                uniforms: {
                    color: { value: new THREE.Color(0xffffff) },
                },
                vertexShader: document.getElementById('vertexshader').textContent,
                fragmentShader: document.getElementById('fragmentshader').textContent

            });

            //

            pointParticles = new THREE.Points(geometry, material);
            scene.add(pointParticles);
        }



        //   初始化座椅
        // function initSet() {
        //     const numParticles = AMOUNTX * AMOUNTY;
        //     const positions = new Float32Array(numParticles * 3);
        //     scales = new Float32Array(numParticles);
        //     colors = new Float32Array(numParticles * 3);
        //     let i = 0,
        //         j = 0;

        //     for (let ix = 0; ix < AMOUNTX; ix++) {
        //         for (let iy = 0; iy < AMOUNTY; iy++) {
        //             positions[i] = ix * SEPARATION - (AMOUNTX * SEPARATION) / 2 + ix * 20; // x
        //             positions[i + 1] = 0; // y
        //             positions[i + 2] = iy * SEPARATION - (AMOUNTY * SEPARATION) / 2; // z

        //             scales[j] = 1;
        //             colors[i] = 0 / 255;
        //             colors[i + 1] = 0 / 255;
        //             colors[i + 2] = 255 / 255;
        //             i += 3;
        //             j++;
        //         }
        //     }

        //     sitGeometry = new THREE.BufferGeometry();
        //     sitGeometry.setAttribute(
        //         "position",
        //         new THREE.BufferAttribute(positions, 3)
        //     );
        //     function getTexture() {
        //         return new TextureLoader().load("");
        //     }
        //     // require("../../assets/images/circle.png")
        //     const spite = new THREE.TextureLoader().load("./circle.png");
        //     material = new THREE.PointsMaterial({
        //         vertexColors: true,
        //         transparent: true,
        //         //   color: 0xffffff,
        //         map: spite,
        //         size: 1,
        //     });
        //     sitGeometry.setAttribute("scale", new THREE.BufferAttribute(scales, 1));
        //     sitGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
        //     particles = new THREE.Points(sitGeometry, material);

        //     particles.scale.x = 0.0052;
        //     particles.scale.y = 0.0052;
        //     particles.scale.z = 0.0052;


        //     particles.rotation.x = -Math.PI / 2 - Math.PI / 12;
        //     // particles.rotation.y = Math.PI/2
        //     particles.position.z = 98
        //     particles.position.y = 10
        //     particles.position.x = -33
        //     group.add(particles);

        // }

        // const neckConfig = { sitnum1: 10, sitnum2: 10, sitInterp: 2, sitInterp1: 4, sitOrder: 3, }
        // const backConfig = { sitnum1: 32, sitnum2: 32, sitInterp: 4, sitInterp1: 2, sitOrder: 3 }
        // const sitConfig = { sitnum1: 32, sitnum2: 32, sitInterp: 2, sitInterp1: 2, sitOrder: 3 }

        // 默认点位配置
        const defaultBackPointConfig = { position: [2.5, -15, 0], rotation: [-Math.PI / 12 - Math.PI / 2, 0, 0], scale: [0.0015, 0.002, 0.002] }
        const defaultSitPointConfig = { position: [0, -30, -5], rotation: [-Math.PI / 6 - Math.PI / 2 + Math.PI / 2, 0, 0], scale: [0.0018, 0.0018, 0.0018] }

        let allConfig = {
            // neck: {
            //     dataConfig: neckConfig,
            //     name: 'neck',
            //     pointConfig: { position: [- 2.5, - 5.5, -103], rotation: [-Math.PI / 12, 0, 0], scale: [0.006, 0.006, 0.006] },
            // },
            back: {
                dataConfig: backConfig,
                name: 'back',
                pointConfig: props.backPointConfig || defaultBackPointConfig,
                // pointConfig: { position: [2.5, -28, -50], rotation: [-Math.PI / 12 - Math.PI / 2, 0, 0], scale: [0.0015, 0.002, 0.002] },
            },
            sit: {
                dataConfig: sitConfig,
                name: 'sit',
                pointConfig: props.sitPointConfig || defaultSitPointConfig,
                //  pointConfig: { position: [0, -28, -65], rotation: [ + Math.PI*11 / 24, 0, 0], scale: [0.0018, 0.0018, 0.0018] },
            },
            // handLeft: {
            //   dataConfig: handLeftConfig,
            //   name: 'handLeft',
            //   pointConfig: { position: [-6, yValue, -5 + zValue], rotation: [0, -Math.PI * 2 / 12, 0] },
            // },
            // handRight: {
            //   dataConfig: handRightConfig,
            //   name: 'handRight',
            //   pointConfig: { position: [13, yValue, -5 + zValue], rotation: [0, Math.PI * 2 / 12, 0] },
            // }
        }


        const initPoint = (config, pointConfig, name, group) => {
            const { sitnum1, sitnum2, sitInterp, sitInterp1, sitOrder } = config
            const { position, rotation, scale, pointSize } = pointConfig
            const AMOUNTX = sitnum1 * sitInterp + sitOrder * 2;
            const AMOUNTY = sitnum2 * sitInterp1 + sitOrder * 2;
            const numParticles = AMOUNTX * AMOUNTY;
            const positions = new Float32Array(numParticles * 3);
            const scales = new Float32Array(numParticles);
            const colors = new Float32Array(numParticles * 3);

            let i = 0,
                j = 0;

            for (let ix = 0; ix < AMOUNTX; ix++) {
                for (let iy = 0; iy < AMOUNTY; iy++) {
                    positions[i] = iy * SEPARATION - (AMOUNTX * SEPARATION) / 2; // x
                    positions[i + 1] = 0; // y
                    positions[i + 2] = ix * SEPARATION - (AMOUNTY * SEPARATION) / 2; // z

                    scales[j] = 1;
                    colors[i] = 0 / 255;
                    colors[i + 1] = 0 / 255;
                    colors[i + 2] = 255 / 255;
                    i += 3;
                    j++;
                }
            }

            const sitGeometry = new THREE.BufferGeometry();
            sitGeometry.setAttribute(
                "position",
                new THREE.BufferAttribute(positions, 3)
            );
            function getTexture() {
                return new TextureLoader().load("");
            }
            // require("../../assets/images/circle.png")
            const spite = new THREE.TextureLoader().load("./circle.png");
            const hand = new THREE.TextureLoader().load("./hand.jpg");
            const material = new THREE.PointsMaterial({
                vertexColors: true,
                transparent: true,
                map: spite,
                size: (pointSize != null ? pointSize : 1.0) * scale[0] * 300,
            });
            material.onBeforeCompile = (shader) => {
                shader.vertexShader = shader.vertexShader
                    .replace(
                        "void main() {",
                        "attribute float aScale;\nvarying float vScale;\nvoid main() {"
                    )
                    .replace(
                        "#include <begin_vertex>",
                        "#include <begin_vertex>\n vScale = aScale;"
                    );
                shader.fragmentShader = shader.fragmentShader
                    .replace(
                        "void main() {",
                        "varying float vScale;\nvoid main() {"
                    )
                    .replace(
                        "#include <clipping_planes_fragment>",
                        "#include <clipping_planes_fragment>\n if (vScale <= 0.0) discard;"
                    );
            };
            sitGeometry.setAttribute("aScale", new THREE.BufferAttribute(scales, 1));
            sitGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
            const particles = new THREE.Points(sitGeometry, material);

            particles.scale.x = scale[0];
            particles.scale.y = scale[1];
            particles.scale.z = scale[2];

            // particles.position.z = 0
            // particles.position.y = 0
            // particles.position.x = 0
            if (position.length) particles.position.set(...position)
            if (rotation.length) particles.rotation.set(...rotation)
            particles.name = name
            group.add(particles);

            // 为坐垫/靠背添加有效识别范围的边缘外框
            // 点阵坐标计算：
            //   x 方向: iy * SEPARATION - (AMOUNTX * SEPARATION) / 2, iy 范围 [0, AMOUNTY-1]
            //     实际 x 范围: [-(AMOUNTX*SEP)/2, (AMOUNTY-1)*SEP - (AMOUNTX*SEP)/2]
            //   z 方向: ix * SEPARATION - (AMOUNTY * SEPARATION) / 2, ix 范围 [0, AMOUNTX-1]
            //     实际 z 范围: [-(AMOUNTY*SEP)/2, (AMOUNTX-1)*SEP - (AMOUNTY*SEP)/2]
            const xMin = -(AMOUNTX * SEPARATION) / 2
            const xMax = (AMOUNTY - 1) * SEPARATION - (AMOUNTX * SEPARATION) / 2
            const zMin = -(AMOUNTY * SEPARATION) / 2
            const zMax = (AMOUNTX - 1) * SEPARATION - (AMOUNTY * SEPARATION) / 2
            // 边框稍微扩大半个 SEPARATION 的间距，确保完全包围所有点
            const padding = SEPARATION * 0.5
            const borderPoints = [
                new THREE.Vector3((xMin - padding) * scale[0], 0, (zMin - padding) * scale[2]),
                new THREE.Vector3((xMax + padding) * scale[0], 0, (zMin - padding) * scale[2]),
                new THREE.Vector3((xMax + padding) * scale[0], 0, (zMax + padding) * scale[2]),
                new THREE.Vector3((xMin - padding) * scale[0], 0, (zMax + padding) * scale[2]),
            ]
            const borderGeometry = new THREE.BufferGeometry().setFromPoints(borderPoints)
            const borderMaterial = new THREE.LineBasicMaterial({
                color: 0x00ccff,
                linewidth: 2,
                transparent: true,
                opacity: 0.8,
            })
            const borderLine = new THREE.LineLoop(borderGeometry, borderMaterial)
            borderLine.name = name + '_border'
            // 外框跟随点阵的位置和旋转
            if (position.length) borderLine.position.set(...position)
            if (rotation.length) borderLine.rotation.set(...rotation)
            // 默认隐藏，只在单独坐垫/靠背模式下显示
            borderLine.visible = false
            group.add(borderLine);
        }

        function initPoints() {
            Object.keys(allConfig).forEach((key) => {
                const obj = allConfig[key]
                initPoint(obj.dataConfig, obj.pointConfig, obj.name, pointGroup)
            })
        }

        let chair
        function initModel() {
            // model
            const loader = new GLTFLoader();

            loader.load("./model/chair3.glb", function (gltf) {
                chair = gltf.scene;

                // scene.add(chair);
                // gltf.scene.traverse((obj) => {
                //     if (obj.isMesh) {
                //         obj.castShadow = obj.receiveShadow = true;
                //         const m = obj.material;
                //         if (m && (m.isMeshStandardMaterial || m.isMeshPhysicalMaterial)) {
                //             // 仅基色贴图设 sRGB
                //             if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
                //             // 防黑：先给个稳妥值
                //             if (m.metalness === undefined) m.metalness = 0.1;
                //             if (m.roughness === undefined) m.roughness = 0.8;
                //         }
                //         if (obj.geometry && !obj.geometry.attributes.normal) {
                //             obj.geometry.computeVertexNormals();
                //         }
                //     }
                // });
                group.add(chair);
                chair.rotation.y = -Math.PI
                chair.rotation.x = -Math.PI / 6
                chair.scale.set(0.4, 0.4, 0.4)
                chair.position.y = -25
                chair.position.z = 60
                chair.position.x = -0
                scene.add(group);
                // group.position.x = -10;
                // group.position.y = -20;
            });
        }

        function tweenToModel(index) {
            const attr = sitGeometry.attributes.position;
            const attrTo = backGeometry.attributes.position;
            const from = attr.array.slice(); // 起始状态的拷贝
            const to = attrTo.array.slice()   // 目标 Float32Array（已准备好）

            const offsets = Array.from({ length: attr.count }, () => Math.random() * 0.5); // 每个点一个随机偏移


            // gsap.to({ t: 0 }, {
            //   t: 1,
            //   duration: 3,
            //   ease: 'power2.inOut',
            //    delay: Math.random() * 1.0,
            //   onUpdate() {
            //     const t = this.targets()[0].t;
            //     const pos = attr.array;
            //     for (let i = 0; i < pos.length; i++) {
            //       pos[i] = from[i] * (1 - t) + to[i] * t;
            //     }
            //     attr.needsUpdate = true;
            //   }
            // });

            const date = new Date().getTime()
            for (let i = 0; i < attr.count; i++) {
                const i3 = i * 3;
                const toi3 = (i % to.length) * 3
                const tweenObj = {
                    x: from[i3],
                    y: from[i3 + 1],
                    z: from[i3 + 2]
                };

                // i3 = (i % to.length) * 3

                gsap.to(tweenObj, {

                    // const endPoint = target[i % target.length];

                    x: to[toi3],
                    y: to[toi3 + 1],
                    z: to[toi3 + 2],
                    duration: 1.5,
                    ease: 'expo.inOut',
                    delay: Math.random() * 1.0,
                    onUpdate() {
                        attr.array[i3] = tweenObj.x;
                        attr.array[i3 + 1] = tweenObj.y;
                        attr.array[i3 + 2] = tweenObj.z;
                        attr.needsUpdate = true;
                        // pointParticles.rotation.x = Math.PI/2
                    },
                    onComplete() {

                    }
                });
            }
            console.log(new Date().getTime() - date, 'date')
        }




        function morphGeometryWithChaosPath(attr, toArray, duration = 1.5) {
            const count = attr.count;
            const buffer = attr.array;
            const from = buffer.slice();
            const mid = new Float32Array(count * 3); // 中间扰动点

            // 构建中间路径点（扰动一下）
            for (let i = 0; i < count; i++) {
                const i3 = i * 3;
                const dx = (Math.random() - 0.5) * 1000;
                const dy = (Math.random() - 0.5) * 1000;
                const dz = (Math.random() - 0.5) * 1000;

                mid[i3] = (from[i3] + toArray[i3]) / 2 + dx;
                mid[i3 + 1] = (from[i3 + 1] + toArray[i3 + 1]) / 2 + dy;
                mid[i3 + 2] = (from[i3 + 2] + toArray[i3 + 2]) / 2 + dz;
            }

            gsap.to({ t: 0 }, {
                t: 1,
                duration,
                ease: 'power3.inOut',
                onUpdate() {
                    const t = this.targets()[0].t;

                    for (let i = 0; i < count; i++) {
                        const i3 = i * 3;

                        // 二阶贝塞尔插值 from → mid → to
                        const x1 = THREE.MathUtils.lerp(from[i3], mid[i3], t);
                        const x2 = THREE.MathUtils.lerp(mid[i3], toArray[i3], t);
                        buffer[i3] = THREE.MathUtils.lerp(x1, x2, t);

                        const y1 = THREE.MathUtils.lerp(from[i3 + 1], mid[i3 + 1], t);
                        const y2 = THREE.MathUtils.lerp(mid[i3 + 1], toArray[i3 + 1], t);
                        buffer[i3 + 1] = THREE.MathUtils.lerp(y1, y2, t);

                        const z1 = THREE.MathUtils.lerp(from[i3 + 2], mid[i3 + 2], t);
                        const z2 = THREE.MathUtils.lerp(mid[i3 + 2], toArray[i3 + 2], t);
                        buffer[i3 + 2] = THREE.MathUtils.lerp(z1, z2, t);
                    }

                    attr.needsUpdate = true;
                },
                onComplete() {
                    // 强制精准对齐目标点
                    for (let i = 0; i < count * 3; i++) {
                        buffer[i] = toArray[i];
                    }
                    attr.needsUpdate = true;
                }
            });
        }

        let tween, tween1
        function morphWithTWEEN(attr, toArray, duration = 1500) {
            const buffer = attr.array;
            const from = buffer.slice();
            const count = attr.count;

            for (let i = 0; i < count; i++) {
                const i3 = i * 3;
                const point = {
                    x: from[i3],
                    y: from[i3 + 1],
                    z: from[i3 + 2]
                };

                const target = {
                    x: toArray[i3],
                    y: toArray[i3 + 1],
                    z: toArray[i3 + 2]
                };

                tween = new TWEEN.Tween(point)
                    .to(target, duration)
                    .easing(TWEEN.Easing.Exponential.InOut)
                    .onUpdate(() => {
                        buffer[i3] = point.x;
                        buffer[i3 + 1] = point.y;
                        buffer[i3 + 2] = point.z;
                        attr.needsUpdate = true;
                    })
                    .onComplete(() => {
                        // 最终对齐
                        buffer[i3] = target.x;
                        buffer[i3 + 1] = target.y;
                        buffer[i3 + 2] = target.z;
                        attr.needsUpdate = true;
                    })
                    .delay(Math.random() * 1000)
                    .easing(TWEEN.Easing.Exponential.In)

                    .start();
            }
        }

        let currentIndex = 0;
        document.addEventListener('keydown', () => {
            // currentIndex = (currentIndex + 1) % backGeometry.attributes.position.array.length;
            // tweenToModel(currentIndex);
            // tweenToModelRandomDelay(sitGeometry.attributes.position, backGeometry.attributes.position);
            // morphSitToBack(sitGeometry.attributes.position, backGeometry.attributes.position.array);
            // morp()

            // morphGeometryWithChaosPath(sitGeometry.attributes.position, backGeometry.attributes.position.array)

            // console.log('morphWithTWEEN')
            // morphWithTWEEN(sitGeometry.attributes.position, backGeometry.attributes.position.array)
        });



        function onWindowResize() {
            renderer.setSize(window.innerWidth, window.innerHeight);

            camera.current.aspect = window.innerWidth / window.innerHeight;

            // camera.current.aspect = window.innerWidth / window.innerHeight;
            camera.current.updateProjectionMatrix();
        }
        let count = 0;
        // function pointMove() {
        //     let i = 0, j = 0;

        //     const positions = pointParticles.geometry.attributes.position.array;
        //     const scales = pointParticles.geometry.attributes.scale.array;
        //     for (let ix = 0; ix < AMOUNTX; ix++) {

        //         for (let iy = 0; iy < AMOUNTY; iy++) {

        //             positions[i + 1] = (Math.sin((ix + count) * 0.3) * 50) +
        //                 (Math.sin((iy + count) * 0.5) * 50);

        //             scales[j] = (Math.sin((ix + count) * 0.3) + 1) * 20 +
        //                 (Math.sin((iy + count) * 0.5) + 1) * 20;

        //             i += 3;
        //             j++;

        //         }

        //     }

        //     pointParticles.geometry.attributes.position.needsUpdate = true;
        //     pointParticles.geometry.attributes.scale.needsUpdate = true;

        //     count += 0.1;
        // }


        //  更新座椅数据
        // function sitRenew() {
        //     // console.log(group)
        //     // console.log(props)
        //     // valueg1 = 2
        //     // valuej1 = 500 
        //     // value1 =2

        //     const {
        //         gauss = 1, color, filter, height = 1, coherent = 1
        //     } = pageRef.current.settingValue
        //     const numParticles = AMOUNTX * AMOUNTY;
        //     const positions = new Float32Array(numParticles * 3);
        //     const colors = new Float32Array(numParticles * 3);

        //     // let ndata1 = pageRef.current.equipStatus.data.length == 4096 ?pageRef.current.equipStatus.data : new Array(4096).fill(0)
        //     let ndata1 = getStatus()

        //     // if (props.type) {

        //     //     ndata1 = rotateMatrix(ndata1, 32, 32)
        //     // }
        //     // if(!ndata1) return 
        //     let bigArr = lineInterp(ndata1, sitnum2, sitnum1, sitInterp2, sitInterp)
        //     let bigArrs = addSide(
        //         bigArr,
        //         sitnum2 * sitInterp2,
        //         sitnum1 * sitInterp,
        //         sitOrder,
        //         sitOrder
        //     );
        //     let bigArrg = gaussBlur_return(
        //         bigArrs,
        //         sitnum2 * sitInterp2 + sitOrder * 2,
        //         sitnum1 * sitInterp + sitOrder * 2,
        //         gauss
        //     );

        //     let k = 0,
        //         l = 0;
        //     let dataArr = []
        //     for (let ix = 0; ix < AMOUNTX; ix++) {
        //         for (let iy = 0; iy < AMOUNTY; iy++) {
        //             const value = bigArrg[l] * 10;

        //             //柔化处理smooth
        //             smoothBig[l] = smoothBig[l] + (value - smoothBig[l] + 0.5) / coherent;

        //             positions[k] = 13500 - iy * SEPARATION - (AMOUNTY * SEPARATION) / 2;// x
        //             positions[k + 1] = smoothBig[l] * height; // y
        //             positions[k + 2] = ix * SEPARATION - (AMOUNTX * SEPARATION) / 2; // z

        //             let rgb
        //             rgb = jetWhite3(0, color, smoothBig[l]);

        //             colors[k] = rgb[0] / 255;
        //             colors[k + 1] = rgb[1] / 255;
        //             colors[k + 2] = rgb[2] / 255;

        //             k += 3;
        //             l++;
        //         }
        //     }

        //     particles.geometry.attributes.position.needsUpdate = true;
        //     particles.geometry.attributes.color.needsUpdate = true;


        //     sitGeometry.setAttribute(
        //         "position",
        //         new THREE.BufferAttribute(positions, 3)
        //     );
        //     sitGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
        // }


        function sitRenew(config, name, ndata1, smoothBig) {
            // console.log(ndata1)
            const { sitnum1, sitnum2, sitInterp, sitInterp1, sitOrder } = config
            const AMOUNTX = sitnum1 * sitInterp + sitOrder * 2;
            const AMOUNTY = sitnum2 * sitInterp1 + sitOrder * 2;


            // const AMOUNTX = sitnum1 * sitInterp   //height
            // const AMOUNTY = sitnum2 * sitInterp1 //width

            const numParticles = AMOUNTX * AMOUNTY;
            const particles = pointGroup.children.find((a) => a.name == name)

            const { geometry } = particles
            const position = new Float32Array(numParticles * 3);
            const colors = new Float32Array(numParticles * 3);
            const scales = geometry.attributes.aScale.array;


            // const gauss = 1, color  =1, filter=1, height = 1, coherent = 1
            const {
                gauss = 1, color, filter, height = 1, coherent = 1
            } = getSettingValue() //pageRef.current.settingValue

            // height , width , heightInterp , widthInterp
            // export function interpSmall(smallMat, width, height, interp1, interp2)

            let bigArr = lineInterp(ndata1, sitnum2, sitnum1, sitInterp1, sitInterp)
            let bigArrs = addSide(
                bigArr,
                sitnum2 * sitInterp1,
                sitnum1 * sitInterp,
                sitOrder,
                sitOrder
            );
            let bigArrg = gaussBlur_return(
                bigArrs,
                sitnum2 * sitInterp1 + sitOrder * 2,
                sitnum1 * sitInterp + sitOrder * 2,
                gauss
            );

            let k = 0, l = 0, j = 0;
            let dataArr = []
            for (let ix = 0; ix < AMOUNTX; ix++) {
                for (let iy = 0; iy < AMOUNTY; iy++) {
                    const value = bigArrg[l] * 10;
                    //柔化处理smooth
                    smoothBig[l] = smoothBig[l] + (value - smoothBig[l]) / coherent;

                    position[k] = iy * SEPARATION - (AMOUNTX * SEPARATION) / 2; // x

                    position[k + 1] = smoothBig[l] * height * 0.1; // y (乘以0.1缩放因子使高度调节更合理)

                    position[k + 2] = ix * SEPARATION - (AMOUNTY * SEPARATION) / 2; // z 

                    let rgb
                    // if (name == 'sit') {
                    //     if (value < 50 && sitshowFlag == false) {
                    //         position[k] = 0;
                    //         position[k + 1] = -0; // y
                    //         position[k + 2] = 0; // z
                    //     }
                    // }

                    // if (name == 'back') {
                    //     if (value < 50 && backshowFlag == false) {
                    //         position[k] = 0;
                    //         position[k + 1] = -0; // y
                    //         position[k + 2] = 0; // z
                    //     }
                    // }

                    const isHidden = value < color * 0.3;
                    scales[j] = isHidden ? 0 : 1;



                    rgb = jetWhite3(0, color, smoothBig[l]);




                    colors[k] = rgb[0] / 255;
                    colors[k + 1] = rgb[1] / 255;
                    colors[k + 2] = rgb[2] / 255;

                    // if (value > 10) {
                    //   color[k] = 255 / 255;
                    //   color[k + 1] = 0 / 255;
                    //   color[k + 2] = 0 / 255;
                    // }

                    k += 3;
                    l++;
                    j++;
                }
            }




            particles.geometry.attributes.position.needsUpdate = true;
            particles.geometry.attributes.color.needsUpdate = true;
            particles.geometry.attributes.aScale.needsUpdate = true;
            geometry.setAttribute(
                "position",
                new THREE.BufferAttribute(position, 3)
            );
            geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
        }

        //模型动画

        function animate(time) {

            const date = new Date().getTime();
            controls.current?.update();  // 必须更新
            if (tween) tween.update(time); // 👈 必须传入时间参数！
            if (tween1) tween1.update(time); // 👈 必须传入时间参数！
            render();

            // pointMove()
        }


        function addTotal(objArr) {
            objArr.forEach((obj) => {
                const { sitnum1, sitnum2, sitInterp, sitInterp1, sitOrder } = obj
                const AMOUNTX = sitnum1 * sitInterp + sitOrder * 2;
                const AMOUNTY = sitnum2 * sitInterp1 + sitOrder * 2;
                const numParticles = AMOUNTX * AMOUNTY;
                obj.total = numParticles
            })
        }

        addTotal([backConfig, sitConfig,])
        const smoothBig = {
            // neck: new Array(neckConfig.total).fill(1),
            back: new Array(backConfig.total).fill(1),
            sit: new Array(sitConfig.total).fill(1),
        }
        // const sitDataRef = useRef(props.sitData);
        // useEffect(() => { sitDataRef.current = props.sitData }, [props.sitData]);
        // return ref; // .current 永远是最新
        function render() {
            stats.begin();
            // TWEEN.update();
            const sitnum1 = 16;
            const sitnum2 = 16;
            const sitInterp = 2;
            const sitOrder = 4;
            const backnum1 = 16;
            const backnum2 = 16;
            const backInterp = 2;
            const headnum1 = 10;
            const headnum2 = 10;
            var back = new Array(backnum1 * backnum2).fill(0), sit = new Array(sitnum1 * sitnum2).fill(0), neck = new Array(headnum1 * headnum2).fill(0);


            // let ndata1 = getStatus()
            // console.log(ndata1)
            // if (!Object.keys(ndata1).length) return


            // const {back , sit} = props.sitData.current

            const sitW = sitConfig.sitnum1
            const sitH = sitConfig.sitnum2
            const backW = backConfig.sitnum2
            const backH = backConfig.sitnum1
            const defaultSitLen = sitW * sitH
            const defaultBackLen = backW * backH

            const data = {
                back: props.sitData.current.back || new Array(defaultBackLen).fill(0),
                sit: props.sitData.current.sit || new Array(defaultSitLen).fill(0),
            }

            {
                const yArr = []
                for (let i = 0; i < sitH; i++) {
                    yArr.push(sitH - 1 - i)
                }

                const newArr = []
                for (let i = 0; i < sitH; i++) {
                    for (let j = 0; j < sitW; j++) {
                        const width = yArr[i]
                        newArr.push(data.sit[width * sitW + sitW - 1 - j])
                    }
                }
                data.sit = newArr
            }

            {
                const yArr = []
                for (let i = 0; i < backH; i++) {
                    yArr.push(backH - 1 - i)
                }

                const newArr = []
                for (let i = 0; i < backH; i++) {
                    for (let j = 0; j < backW; j++) {
                        const width = yArr[i]
                        newArr.push(data.back[width * backW + backW - 1 - j])
                    }
                }
                data.back = newArr
            }


            Object.keys(allConfig).forEach((key) => {
                const obj = allConfig[key]
                sitRenew(obj.dataConfig, obj.name, data[obj.name], smoothBig[obj.name]);
            })
            // animationRequestId =requestAnimationFrame(animate);
            renderer.render(scene, camera.current);
            stats.end();
        }

        function changePointRotation(value) {
            console.log('three', value, group)

            const type = getDisplayType()
            console.log(type)

            if (type === 'all') {
                // 整体模式：同时旋转所有子点阵，使用各自的初始 rotation 作为基准
                const sitParticles = pointGroup.children.find((a) => a.name == 'sit')
                const backParticles = pointGroup.children.find((a) => a.name == 'back')
                const sitBorder = pointGroup.children.find((a) => a.name == 'sit_border')
                const backBorder = pointGroup.children.find((a) => a.name == 'back_border')
                const rotationOffset = (value * 2) / 12
                if (sitParticles) {
                    sitParticles.rotation.x = allConfig.sit.pointConfig.rotation[0] + rotationOffset
                    if (sitBorder) sitBorder.rotation.x = sitParticles.rotation.x
                }
                if (backParticles) {
                    backParticles.rotation.x = allConfig.back.pointConfig.rotation[0] + rotationOffset
                    if (backBorder) backBorder.rotation.x = backParticles.rotation.x
                }
                // 同时旋转椅子模型
                if (group) group.rotation.x = Math.PI / 6 + rotationOffset
            } else {
                // 单独坐垫/靠背模式：与整体模式一致的旋转逻辑
                const particles = pointGroup.children.find((a) => a.name == type)
                if (!particles) return
                const baseRotation = allConfig[type] ? allConfig[type].pointConfig.rotation[0] : -Math.PI / 2
                particles.rotation.x = baseRotation + (value * 2) / 12
                // 同步边框旋转
                const border = pointGroup.children.find((a) => a.name == type + '_border')
                if (border) border.rotation.x = particles.rotation.x
            }
        }

        function changeCamera(value) {
            // 限制缩放范围 10%-1000%
            const clampedValue = Math.max(10, Math.min(1000, value))
            if (!camera.current) return
            const targetZ = -120 * 100 / clampedValue
            const startZ = camera.current.position.z
            // 平滑过渡动画（200ms）
            const duration = 200
            const startTime = performance.now()
            function animateZoom(now) {
                const elapsed = now - startTime
                const progress = Math.min(elapsed / duration, 1)
                // easeOutCubic 缓动函数，先快后慢更自然
                const eased = 1 - Math.pow(1 - progress, 3)
                camera.current.position.z = startZ + (targetZ - startZ) * eased
                if (progress < 1) {
                    requestAnimationFrame(animateZoom)
                }
            }
            requestAnimationFrame(animateZoom)
            // 放大缩小时回到初始位置（整体模式）
            actionSit('all');
        }

        useImperativeHandle(refs, () => ({
            changePointRotation: changePointRotation,
            changeCamera,
            actionSit,
            reset3D
        }));
        //   视图数据

        // 用于滚轮实时更新的 requestAnimationFrame ID
        let wheelRAF = null

        function wheel(event) {
            // 限制 camera.position.z 在 10%-1000% 对应的范围内
            const minZ = -120 * 100 / 10   // -1200 (对应10%)
            const maxZ = -120 * 100 / 1000 // -12   (对应1000%)
            if (camera.current) {
                camera.current.position.z = Math.max(minZ, Math.min(maxZ, camera.current.position.z))
            }

            // 使用 requestAnimationFrame 实时更新百分比显示，避免延迟感
            if (wheelRAF) cancelAnimationFrame(wheelRAF)
            wheelRAF = requestAnimationFrame(() => {
                if (camera.current) {
                    let zoomValue = Math.round(-120 * 100 / camera.current.position.z)
                    zoomValue = Math.max(10, Math.min(1000, zoomValue))
                    props.changeViewProp(zoomValue)
                }
                wheelRAF = null
            })
        }

        function move(position, time, particles) {
            // 查找对应的边框，使边框跟随粒子同步移动
            const borderName = particles.name + '_border'
            const border = pointGroup.children.find((a) => a.name === borderName)

            const p1 = {
                x: particles.position.x,
                y: particles.position.y,
                z: particles.position.z,
                rotationx: particles.rotation.x,
                rotationy: particles.rotation.y,
                rotationz: particles.rotation.z,
            };

            const tween1 = new TWEEN.Tween(p1)
                .to(position, time)
                .easing(TWEEN.Easing.Quadratic.InOut);

            tween1.onUpdate(() => {
                particles.position.set(p1.x, p1.y, p1.z);
                if (p1.rotationx) particles.rotation.x = p1.rotationx;
                // 同步更新边框位置和旋转
                if (border) {
                    border.position.set(p1.x, p1.y, p1.z);
                    if (p1.rotationx) border.rotation.x = p1.rotationx;
                }
            });

            return tween1;
        }

        function reset3D() {
            controls.current?.reset()
            props.changeViewProp(100)
        }

        function actionSit(type) {


            // 隐藏所有边框
            const hideBorders = () => {
                pointGroup.children.forEach((a) => {
                    if (a.name && a.name.endsWith('_border')) a.visible = false
                })
            }
            // 显示指定边框
            const showBorder = (name) => {
                const border = pointGroup.children.find((a) => a.name == name + '_border')
                if (border) border.visible = true
            }

            if (type == 'sit') {
                // 隐藏所有子对象（包括边框）
                pointGroup.children.forEach((a) => a.visible = false)
                if (chair) chair.visible = false
                hideBorders()
                showBorder('sit')

                const particles = pointGroup.children.find((a) => a.name == 'sit')
                particles.visible = true;
                controls.current?.reset()
                tween = move(
                    {
                        x: 0,
                        y: -28,
                        z: -65,
                        rotationx: - Math.PI * 13 / 24,
                    },
                    600,
                    particles
                );

                tween.start();
                sitshowFlag = true
                backshowFlag = false
            } else if (type == 'back') {
                // 隐藏所有子对象（包括边框）
                pointGroup.children.forEach((a) => a.visible = false)
                if (chair) chair.visible = false
                hideBorders()
                showBorder('back')

                const particles = pointGroup.children.find((a) => a.name == 'back')
                particles.visible = true;
                controls.current?.reset()
                tween = move(
                    {
                        x: 2.5,
                        y: -28,
                        z: -50,
                        rotationx: - Math.PI * 13 / 24,
                    },
                    600,
                    particles
                );

                tween.start();

                sitshowFlag = false
                backshowFlag = true
            } else {
                // 整体模式：先隐藏所有，再恢复 sit 和 back 到初始位置
                controls.current?.reset()
                pointGroup.children.forEach((a) => a.visible = false)
                hideBorders()
                if (chair) chair.visible = true
                const sit = pointGroup.children.find((a) => a.name == 'sit')
                const back = pointGroup.children.find((a) => a.name == 'back')
                if (sit) sit.visible = true
                if (back) back.visible = true

                // 恢复 sit 到 allConfig 中定义的初始位置和旋转
                const sitInitPos = allConfig.sit.pointConfig.position
                const sitInitRot = allConfig.sit.pointConfig.rotation
                tween = move(
                    {
                        x: sitInitPos[0],
                        y: sitInitPos[1],
                        z: sitInitPos[2],
                        rotationx: sitInitRot[0],
                    },
                    600,
                    sit
                );
                tween.start();

                // 恢复 back 到 allConfig 中定义的初始位置和旋转
                const backInitPos = allConfig.back.pointConfig.position
                const backInitRot = allConfig.back.pointConfig.rotation
                tween1 = move(
                    {
                        x: backInitPos[0],
                        y: backInitPos[1],
                        z: backInitPos[2],
                        rotationx: backInitRot[0],
                    },
                    600,
                    back
                );
                tween1.start();

                sitshowFlag = false
                backshowFlag = false
            }


        }



        useEffect(() => {
            // 靠垫数据
            init();
            animate();

            document.addEventListener("wheel", wheel);
            return () => {
                renderer.setAnimationLoop(null);
                document.removeEventListener("wheel", wheel)
                if (wheelRAF) cancelAnimationFrame(wheelRAF)
                cleanupThree({ scene, renderer, controls: controls.current })
            };
        }, []);
        return (
            <div style={{ position: 'relative' }}>
                <div
                    // style={{ width: "100%", height: "100%" }}
                    id={`canvas`}
                ></div>

                {/* 点位配置面板 */}
                <div style={{
                    position: 'absolute',
                    bottom: 10,
                    right: 10,
                    zIndex: 9999,
                    background: 'rgba(30, 35, 42, 0.92)',
                    borderRadius: 8,
                    color: '#E6EBF0',
                    fontSize: 12,
                    minWidth: configPanelOpen ? 320 : 'auto',
                    maxHeight: '70vh',
                    overflowY: 'auto',
                    boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
                    border: '1px solid rgba(255,255,255,0.1)',
                }}>
                    <div
                        onClick={() => setConfigPanelOpen(!configPanelOpen)}
                        style={{
                            padding: '6px 12px',
                            cursor: 'pointer',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            borderBottom: configPanelOpen ? '1px solid rgba(255,255,255,0.1)' : 'none',
                            userSelect: 'none',
                        }}
                    >
                        <span style={{ fontWeight: 'bold' }}>点位配置</span>
                        <span style={{ transform: configPanelOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▲</span>
                    </div>

                    {configPanelOpen && (
                        <div style={{ padding: '8px 12px' }}>
                            {['back', 'sit'].map(name => (
                                <div key={name} style={{ marginBottom: 12 }}>
                                    <div style={{ fontWeight: 'bold', marginBottom: 4, color: '#00ccff', fontSize: 13 }}>
                                        {name === 'back' ? '靠背 (back)' : '坐垫 (sit)'}
                                    </div>
                                    {['position', 'rotation', 'scale'].map(prop => (
                                        <div key={prop} style={{ marginBottom: 6 }}>
                                            <div style={{ color: '#8899aa', marginBottom: 2 }}>{prop}</div>
                                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                                {['X', 'Y', 'Z'].map((axis, idx) => (
                                                    <div key={axis} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                                        <span style={{ color: '#667788', fontSize: 11 }}>{axis}:</span>
                                                        <input
                                                            type="number"
                                                            step={prop === 'scale' ? 0.0001 : prop === 'rotation' ? 0.01 : 0.5}
                                                            value={Number(configValues[name][prop][idx].toFixed(4))}
                                                            onChange={e => handleConfigChange(name, prop, idx, parseFloat(e.target.value) || 0)}
                                                            style={{
                                                                width: prop === 'scale' ? 70 : 60,
                                                                background: 'rgba(0,0,0,0.3)',
                                                                border: '1px solid rgba(255,255,255,0.15)',
                                                                borderRadius: 4,
                                                                color: '#E6EBF0',
                                                                padding: '2px 4px',
                                                                fontSize: 11,
                                                                outline: 'none',
                                                            }}
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                    {/* 点大小控件 */}
                                    <div style={{ marginBottom: 6 }}>
                                        <div style={{ color: '#8899aa', marginBottom: 2 }}>pointSize</div>
                                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                            <input
                                                type="range"
                                                min={0.1}
                                                max={5}
                                                step={0.05}
                                                value={configValues[name].pointSize}
                                                onChange={e => handleConfigChange(name, 'pointSize', null, parseFloat(e.target.value))}
                                                style={{ flex: 1, accentColor: '#00ccff' }}
                                            />
                                            <input
                                                type="number"
                                                step={0.05}
                                                value={Number(configValues[name].pointSize.toFixed(2))}
                                                onChange={e => handleConfigChange(name, 'pointSize', null, parseFloat(e.target.value) || 0.1)}
                                                style={{
                                                    width: 55,
                                                    background: 'rgba(0,0,0,0.3)',
                                                    border: '1px solid rgba(255,255,255,0.15)',
                                                    borderRadius: 4,
                                                    color: '#E6EBF0',
                                                    padding: '2px 4px',
                                                    fontSize: 11,
                                                    outline: 'none',
                                                }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}

                            {/* 复制配置按钮 */}
                            <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 8, marginTop: 4 }}>
                                <button
                                    onClick={() => {
                                        const code = `backPointConfig={{ position: [${configValues.back.position.map(v => v.toFixed(4)).join(', ')}], rotation: [${configValues.back.rotation.map(v => v.toFixed(4)).join(', ')}], scale: [${configValues.back.scale.map(v => v.toFixed(4)).join(', ')}], pointSize: ${configValues.back.pointSize.toFixed(2)} }}
sitPointConfig={{ position: [${configValues.sit.position.map(v => v.toFixed(4)).join(', ')}], rotation: [${configValues.sit.rotation.map(v => v.toFixed(4)).join(', ')}], scale: [${configValues.sit.scale.map(v => v.toFixed(4)).join(', ')}], pointSize: ${configValues.sit.pointSize.toFixed(2)} }}`
                                        navigator.clipboard?.writeText(code)
                                        console.log('\n点位配置:\n' + code)
                                    }}
                                    style={{
                                        width: '100%',
                                        padding: '4px 8px',
                                        background: 'rgba(0, 204, 255, 0.15)',
                                        border: '1px solid rgba(0, 204, 255, 0.3)',
                                        borderRadius: 4,
                                        color: '#00ccff',
                                        cursor: 'pointer',
                                        fontSize: 11,
                                    }}
                                >
                                    复制配置代码
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    }));
export default Canvas;
