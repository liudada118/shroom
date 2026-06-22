import React, { memo, useEffect, useImperativeHandle, useRef } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { TrackballControls } from 'three/examples/jsm/controls/TrackballControls'
import { cleanupThree } from '../../util/disposeThree'
import { animateCameraZoom, applyZoomBounds, bindZoomValueSync, getZoomValueFromCamera } from '../../util/threeZoom'

const MODEL_PATH = './model/human.glb'

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
  model.position.y = -2
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
  const { changeViewProp } = props
  const mountRef = useRef(null)
  const cameraRef = useRef(null)
  const controlsRef = useRef(null)
  const frameRef = useRef(null)
  const cleanupZoomRef = useRef(null)
  const baseDistanceRef = useRef(120)

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
    loader.load(MODEL_PATH, (gltf) => {
      const model = gltf.scene
      fitModelToScene(model)
      scene.add(model)
    })

    cameraRef.current = camera
    controlsRef.current = controls

    const animate = () => {
      controls.update()
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
      window.removeEventListener('resize', handleResize)
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
      cleanupZoomRef.current?.()
      cleanupThree({ scene, renderer, controls })
      if (renderer.domElement?.parentNode === mount) {
        mount.removeChild(renderer.domElement)
      }
    }
  }, [changeViewProp])

  return <div ref={mountRef} style={{ width: '100vw', height: '100vh' }} />
}))

export default ThreeHumanPoint
