import React, { useEffect } from "react";

export function useWindowSize() {
    const browserResized = () => {
        // const rem = window.innerWidth / 140 > 20 ? 20 : window.innerWidth / 140

        const prop = window.innerWidth / 1920 > 1.2 ? 1.2 : window.innerWidth / 1920 < 0.8 ? 0.8 : window.innerWidth / 1920

        const rem = 14 * prop

        document.documentElement.style.fontSize = `${rem}px`;
    }
    useEffect(() => {
        browserResized()
        window.addEventListener('resize', browserResized)
        return () => {
            window.removeEventListener("resize", browserResized);
        }
    }, [])
}

export function useWhyReRender(props) {
  const prev = React.useRef(props);
  React.useEffect(() => {
    const p = prev.current;
    Object.keys({ ...p, ...props }).forEach(k => {
      if (p[k] !== props[k]) {
        // 注意：仅比较引用
        console.log('[rerender] prop changed:', k, p[k], '->', props[k]);
      }
    });
    prev.current = props;
  });
}