import { useEffect, useRef } from 'react'

/**
 * 浮层面板是 position:fixed + 可拖拽的，位置变化既不会触发 resize
 * 也不会被 ResizeObserver 感知，所以统一在这些时机重算一次布局：
 * - 首次挂载
 * - 拖拽中（按住鼠标移动）与松手
 * - 视口尺寸变化
 * - 被监听元素自身尺寸变化（内容增减）
 *
 * @param {() => void} sync        重算回调
 * @param {() => Array} getTargets 需要监听尺寸变化的元素，允许返回 null（尚未挂载）
 */
export default function usePanelLayoutSync(sync, getTargets) {
    const syncRef = useRef(sync)
    const targetsRef = useRef(getTargets)
    syncRef.current = sync
    targetsRef.current = getTargets

    useEffect(() => {
        let raf = 0
        let retry = 0
        let observed = []

        const schedule = () => {
            if (raf) return
            raf = requestAnimationFrame(run)
        }

        const observer = typeof ResizeObserver !== 'undefined'
            ? new ResizeObserver(schedule)
            : null

        function run() {
            raf = 0
            const raw = targetsRef.current?.() || []
            const targets = raw.filter(Boolean)
            const changed = targets.length !== observed.length
                || targets.some((el, i) => el !== observed[i])
            if (observer && changed) {
                observer.disconnect()
                targets.forEach((el) => observer.observe(el))
                observed = targets
            }
            syncRef.current?.()
            // 还有面板没挂载（尺寸变化观察不到），轮询等它出现
            clearTimeout(retry)
            if (!targets.length || targets.length !== raw.length) {
                retry = setTimeout(schedule, 300)
            }
        }

        const onMouseMove = (e) => {
            if (e.buttons) schedule()
        }

        schedule()
        window.addEventListener('resize', schedule)
        window.addEventListener('mousemove', onMouseMove)
        window.addEventListener('mouseup', schedule)
        return () => {
            if (raf) cancelAnimationFrame(raf)
            clearTimeout(retry)
            observer?.disconnect()
            window.removeEventListener('resize', schedule)
            window.removeEventListener('mousemove', onMouseMove)
            window.removeEventListener('mouseup', schedule)
        }
    }, [])
}
