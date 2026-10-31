"use client";

import { useCallback, useEffect, useState } from "react";

/** 要素の実寸を監視する。react-globe.gl は width/height を明示しないとウィンドウ全体の大きさで描画されるため。 */
export function useElementSize<T extends HTMLElement>() {
  const [el, setEl] = useState<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const ref = useCallback((node: T | null) => setEl(node), []);

  useEffect(() => {
    if (!el) return;
    const update = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);

  return [ref, size] as const;
}
