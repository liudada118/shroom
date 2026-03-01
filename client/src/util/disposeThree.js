/**
 * Three.js 资源清理工具
 * 
 * 用于在组件卸载时释放 GPU 资源，防止内存泄漏。
 * 
 * 使用方式：
 *   import { disposeScene, disposeRenderer } from '../util/disposeThree'
 *   
 *   useEffect(() => {
 *     // ... 初始化 scene, renderer ...
 *     return () => {
 *       disposeScene(scene)
 *       disposeRenderer(renderer)
 *     }
 *   }, [])
 */

/**
 * 递归释放一个 Three.js 对象及其所有子对象的 geometry、material、texture
 */
export function disposeObject(obj) {
  if (!obj) return

  // 递归处理子对象
  if (obj.children) {
    while (obj.children.length > 0) {
      disposeObject(obj.children[0])
      obj.remove(obj.children[0])
    }
  }

  // 释放 geometry
  if (obj.geometry) {
    obj.geometry.dispose()
  }

  // 释放 material（可能是数组）
  if (obj.material) {
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
    for (const mat of materials) {
      // 释放 material 上的所有 texture
      for (const key of Object.keys(mat)) {
        const value = mat[key]
        if (value && typeof value === 'object' && typeof value.dispose === 'function') {
          value.dispose()
        }
      }
      mat.dispose()
    }
  }

  // 释放 texture（如 DataTexture 直接挂在对象上的情况）
  if (obj.texture && typeof obj.texture.dispose === 'function') {
    obj.texture.dispose()
  }
}

/**
 * 清理整个 scene 中的所有资源
 */
export function disposeScene(scene) {
  if (!scene) return
  disposeObject(scene)
}

/**
 * 清理 renderer 并释放 WebGL 上下文
 */
export function disposeRenderer(renderer) {
  if (!renderer) return
  renderer.dispose()
  renderer.forceContextLoss()
  const canvas = renderer.domElement
  if (canvas && canvas.parentNode) {
    canvas.parentNode.removeChild(canvas)
  }
}

/**
 * 一站式清理：scene + renderer + cancelAnimationFrame
 */
export function cleanupThree({ scene, renderer, animationId, controls }) {
  if (animationId) {
    cancelAnimationFrame(animationId)
  }
  if (controls && typeof controls.dispose === 'function') {
    controls.dispose()
  }
  disposeScene(scene)
  disposeRenderer(renderer)
}
