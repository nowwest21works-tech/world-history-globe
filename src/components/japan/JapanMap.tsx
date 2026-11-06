"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { HistoryEvent } from "@/types/event";
import { CATEGORIES } from "@/lib/categories";
import { formatSpan } from "@/lib/year";
import { groupNearby } from "@/lib/markerGroups";
import type { TourArcView } from "@/lib/tours";
import {
  DEFAULT_VIEW,
  MAX_ZOOM,
  MIN_ZOOM,
  clampView,
  edgePoint,
  type Rect,
  interpolateView,
  panBy,
  pixelScale,
  project,
  reliefRect,
  toScreen,
  wantsHiRes,
  type ReliefLayer,
  unproject,
  zoomAt,
  type MapView,
} from "@/lib/japanMap";
import land from "@/data/japan-land.json";
import relief from "@/data/japan-relief.json";
import { assetPath } from "@/lib/assetPath";
import { CategoryIcon } from "@/components/legend/CategoryIcon";
import { useElementSize } from "@/components/globe/useElementSize";
import type { FlyTarget } from "@/components/globe/GlobeView";

/**
 * 日本地図では、地図の最大の拡大率でも見分けられない距離（約0.12度＝十数km）だけをまとめる。
 * 京都・奈良・大阪はまとめない（tests/unit/japanMap.test.ts）。
 */
export const JAPAN_GROUP_DISTANCE_DEG = 0.12;

/** 選んだときの拡大率（いまより引いていたら、ここまで寄る） */
const SELECT_ZOOM = 2.2;
const FLY_MS = 1000;

export interface JapanMapProps {
  events: HistoryEvent[];
  activeIds: Set<string>;
  selectedId: string | null;
  flyTo: FlyTarget | null;
  onSelect: (id: string) => void;
  onUserInteract: () => void;
  arcs?: TourArcView[];
  /** 選んだイベントとつながる、日本地図には出ない（世界史の）イベント。地図の端に矢印で出す */
  outsideLinks?: HistoryEvent[];
  onOutsideSelect?: (id: string) => void;
  /** 地図の右側が詳細パネルで隠れている幅（PC）。中央合わせと端の矢印はこの幅を除いて考える */
  insetRight?: number;
}

interface Picker {
  events: HistoryEvent[];
  x: number;
  y: number;
}

declare global {
  interface Window {
    /** E2Eテスト用：日本地図の表示位置の読み取りのみ */
    __WHG_JP__?: { view: () => MapView; size: () => { width: number; height: number } };
  }
}

const ARC_STROKE = {
  established: { color: "rgba(255, 210, 122, 0.95)", dash: undefined },
  traditional: { color: "rgba(255, 255, 255, 0.95)", dash: "9 6" },
  debated: { color: "rgba(170, 196, 255, 0.95)", dash: "2 6" },
} as const;
const ARC_PREFIX = { established: "", traditional: "伝承：", debated: "諸説あり：" } as const;

/** 経度を基準点から ±180 度の範囲に寄せる（太平洋の向こうへは東回りで矢印を向ける） */
const nearLng = (lng: number, ref: number) => lng + 360 * Math.round((ref - lng) / 360);

export default function JapanMap({
  events,
  activeIds,
  selectedId,
  flyTo,
  onSelect,
  onUserInteract,
  arcs = [],
  outsideLinks = [],
  onOutsideSelect,
  insetRight = 0,
}: JapanMapProps) {
  const [boxRef, size] = useElementSize<HTMLDivElement>();
  const boxEl = useRef<HTMLDivElement | null>(null);
  const setBox = useCallback(
    (node: HTMLDivElement | null) => {
      boxEl.current = node;
      boxRef(node);
    },
    [boxRef],
  );
  const [view, setViewState] = useState<MapView>(DEFAULT_VIEW);
  const viewRef = useRef(view);
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const setView = useCallback((v: MapView) => {
    viewRef.current = v;
    setViewState(v);
  }, []);
  const [picker, setPicker] = useState<Picker | null>(null);
  // 背景の陰影起伏画像。読み込めるまで（読み込めなかったときも）は、これまでのベクターの陸地で描く
  const [reliefState, setReliefState] = useState<"loading" | "ok" | "error">("loading");
  const [hiState, setHiState] = useState<"off" | "loading" | "ok" | "error">("off");
  const anim = useRef(0);
  const interactRef = useRef(onUserInteract);
  interactRef.current = onUserInteract;
  const insetRef = useRef(insetRight);
  insetRef.current = insetRight;

  const stopAnim = () => cancelAnimationFrame(anim.current);

  const animateTo = useCallback(
    (target: MapView, ms = FLY_MS) => {
      stopAnim();
      const from = viewRef.current;
      const t0 = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - t0) / ms);
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        setView(interpolateView(from, target, e));
        if (t < 1) anim.current = requestAnimationFrame(tick);
      };
      anim.current = requestAnimationFrame(tick);
    },
    [setView],
  );

  /** 地点を、見えている範囲（右側の詳細パネルを除く）の中央に置く表示 */
  const viewCentering = useCallback((lat: number, lng: number, zoom: number): MapView => {
    const s = sizeRef.current;
    const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
    if (!s.width) return clampView({ lat, lng, zoom: z });
    const k = pixelScale({ lat, lng, zoom: z }, s);
    const p = project(lat, lng);
    const c = unproject(p.x + insetRef.current / 2 / k, p.y);
    return clampView({ ...c, zoom: z });
  }, []);

  // 移動先が決まったら滑らかに動く（最初の1回だけは、準備ができた時点で一気に合わせる）
  const firstFly = useRef(true);
  useEffect(() => {
    if (!flyTo || size.width === 0) return;
    const zoom = flyTo.zoom ?? Math.max(viewRef.current.zoom, SELECT_ZOOM);
    const target = viewCentering(flyTo.lat, flyTo.lng, zoom);
    if (firstFly.current) {
      firstFly.current = false;
      setView(target);
    } else animateTo(target);
    // size.width が 0 → 実寸 になったときにも合わせる
  }, [flyTo, size.width > 0]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (size.width > 0) firstFly.current = false;
  }, [size.width]);

  useEffect(() => {
    window.__WHG_JP__ = { view: () => viewRef.current, size: () => sizeRef.current };
    return () => {
      stopAnim();
    };
  }, []);

  // ── 操作：ドラッグで移動、ホイール・ピンチで拡大縮小 ──
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const localXY = (e: { clientX: number; clientY: number }) => {
    const r = boxEl.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as Element).closest("button, a, .marker-picker")) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, localXY(e));
    stopAnim();
    setPicker(null);
    interactRef.current();
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const cur = localXY(e);
    const s = sizeRef.current;
    if (pointers.current.size === 1) {
      pointers.current.set(e.pointerId, cur);
      setView(panBy(viewRef.current, s, cur.x - prev.x, cur.y - prev.y));
      return;
    }
    // 2本指：前回の2点と今回の2点から、拡大率と中心の移動を求める
    const others = [...pointers.current.entries()].filter(([id]) => id !== e.pointerId);
    const other = others[0]?.[1];
    if (!other) return;
    const d0 = Math.hypot(prev.x - other.x, prev.y - other.y);
    const d1 = Math.hypot(cur.x - other.x, cur.y - other.y);
    pointers.current.set(e.pointerId, cur);
    if (d0 < 1) return;
    const c0 = { x: (prev.x + other.x) / 2, y: (prev.y + other.y) / 2 };
    const c1 = { x: (cur.x + other.x) / 2, y: (cur.y + other.y) / 2 };
    const zoomed = zoomAt(viewRef.current, s, d1 / d0, c0.x, c0.y);
    setView(panBy(zoomed, s, c1.x - c0.x, c1.y - c0.y));
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
  };

  useEffect(() => {
    const el = boxEl.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      stopAnim();
      setPicker(null);
      interactRef.current();
      const r = el.getBoundingClientRect();
      const factor = Math.exp(-e.deltaY * 0.0015);
      setView(zoomAt(viewRef.current, sizeRef.current, factor, e.clientX - r.left, e.clientY - r.top));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [setView]);

  const zoomButton = (factor: number) => {
    stopAnim();
    const s = sizeRef.current;
    animateTo(zoomAt(viewRef.current, s, factor, (s.width - insetRef.current) / 2, s.height / 2), 300);
  };

  // ── 描画 ──
  const groups = useMemo(() => groupNearby(events, JAPAN_GROUP_DISTANCE_DEG), [events]);
  const k = size.width ? pixelScale(view, size) : 0;
  const c = project(view.lat, view.lng);
  const landTransform = `translate(${size.width / 2 - c.x * k} ${size.height / 2 - c.y * k}) scale(${k})`;
  const landClass = reliefState === "ok" ? "jp-land is-outline" : "jp-land";
  const landPath = useMemo(() => <path d={(land as { path: string }).path} className={landClass} />, [landClass]);
  const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  const hiWanted = reliefState === "ok" && k > 0 && wantsHiRes(k, dpr, RELIEF_LO.pxPerDeg);
  useEffect(() => {
    if (hiWanted) setHiState((s) => (s === "off" ? "loading" : s));
  }, [hiWanted]);
  const visible = (x: number, y: number, m = 0) => x >= -m && y >= -m && x <= size.width + m && y <= size.height + m;

  const selected = selectedId ? events.find((e) => e.id === selectedId) : undefined;

  const arcViews = arcs.map((a) => {
    const p1 = toScreen(a.startLat, a.startLng, view, size);
    const p2 = toScreen(a.endLat, nearLng(a.endLng, a.startLng), view, size);
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy);
    // 弧のふくらみ（進む向きの左側へ、長さの2割）
    const cx = (p1.x + p2.x) / 2 + (dy / (len || 1)) * len * 0.2;
    const cy = (p1.y + p2.y) / 2 - (dx / (len || 1)) * len * 0.2;
    const mid = { x: 0.25 * p1.x + 0.5 * cx + 0.25 * p2.x, y: 0.25 * p1.y + 0.5 * cy + 0.25 * p2.y };
    return { a, d: `M${p1.x} ${p1.y}Q${cx} ${cy} ${p2.x} ${p2.y}`, mid };
  });

  // 地図の端の矢印（d）：選んだイベントから、つながる世界のイベントの方角へ。
  // 矢印のボタンの四角（左上の座標と推定の幅）で重なりを判定し、凡例・ボタン・選んだ地点・ほかの矢印を避ける
  const edgeLinks = useMemo(() => {
    if (!selected || !size.width || outsideLinks.length === 0) return [];
    const from = toScreen(selected.location.lat, selected.location.lng, view, size);
    const area = { width: size.width - insetRight, height: size.height };
    const wide = size.width >= 600;
    const margin = 8;
    const H = 36;
    const blocked: Rect[] = wide
      ? [{ x: 0, y: 0, w: 252, h: 222 }, { x: area.width - 140, y: area.height - 56, w: 140, h: 56 }, { x: 0, y: area.height - 34, w: 140, h: 34 }]
      : [{ x: 0, y: 0, w: 170, h: 52 }, { x: area.width - 190, y: 0, w: 190, h: 52 }, { x: area.width - 56, y: 52, w: 56, h: 150 }, { x: 0, y: area.height - 30, w: 140, h: 30 }];
    blocked.push({ x: from.x - 24, y: from.y - 24, w: 48, h: 48 });
    const hit = (r: Rect) =>
      blocked.some((q) => r.x < q.x + q.w && r.x + r.w > q.x && r.y < q.y + q.h && r.y + r.h > q.y) ||
      r.x < margin || r.y < margin || r.x + r.w > area.width - margin || r.y + r.h > area.height - margin;
    const placed: { e: HistoryEvent; x: number; y: number; w: number; angle: number }[] = [];
    for (const e of outsideLinks.slice(0, 4)) {
      const w = Math.min(wide ? 260 : 200, 64 + e.title.length * (wide ? 13.5 : 12));
      const t = toScreen(e.location.lat, nearLng(e.location.lng, selected.location.lng), view, size);
      const dir = { x: t.x - from.x, y: t.y - from.y };
      const tip = edgePoint(from, dir, area, { top: margin + H / 2, bottom: margin + H / 2, left: margin + w / 2, right: margin + w / 2 });
      // 目標が画面の中にあれば、その地点の近くに置く
      const inside = t.x > w / 2 + margin && t.x < area.width - w / 2 - margin && t.y > H && t.y < area.height - H;
      const c = inside ? { x: t.x, y: t.y } : tip;
      let r: Rect = { x: c.x - w / 2, y: c.y - H / 2, w, h: H };
      // 重なったら、選んだ地点から見た向きを保つよう、まわりに少しずつずらして空いている場所を探す
      if (hit(r)) {
        let best: Rect | null = null;
        for (let k = 1; k <= 14 && !best; k++) {
          for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]] as const) {
            const cand = { ...r, x: r.x + dx * k * 22, y: r.y + dy * k * 20 };
            if (!hit(cand)) {
              best = cand;
              break;
            }
          }
        }
        if (best) r = best;
      }
      blocked.push(r);
      const angle = Math.atan2(r.y + H / 2 - from.y, r.x + w / 2 - from.x) * (180 / Math.PI);
      placed.push({ e, x: r.x, y: r.y, w, angle });
    }
    return placed;
  }, [selected, outsideLinks, view, size, insetRight]);

  useEffect(() => setPicker(null), [events]);

  return (
    <div
      ref={setBox}
      className="japan-map"
      data-testid="japan-map"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      role="application"
      aria-label="日本周辺の地図（ドラッグで移動、ホイール・ピンチで拡大縮小）"
    >
      {size.width > 0 && (
        <>
          <svg className="jp-svg" width={size.width} height={size.height} aria-hidden="true">
            <g transform={landTransform}>
              {reliefState !== "error" && (
                <ReliefImage
                  layer={RELIEF_LO}
                  className={`jp-relief${reliefState === "ok" ? " is-ready" : ""}`}
                  testId="jp-relief-lo"
                  onLoad={() => setReliefState("ok")}
                  onError={() => setReliefState("error")}
                />
              )}
              {reliefState === "ok" && (hiState === "loading" || hiState === "ok") && (
                <ReliefImage
                  layer={RELIEF_HI}
                  className={`jp-relief${hiState === "ok" ? " is-ready" : ""}`}
                  testId="jp-relief-hi"
                  onLoad={() => setHiState("ok")}
                  onError={() => setHiState("error")}
                />
              )}
              {landPath}
            </g>
            {arcViews.map(({ a, d }) => (
              <path
                key={a.id}
                d={d}
                className={`jp-arc is-${a.certainty}${a.current ? " is-current" : ""}`}
                stroke={ARC_STROKE[a.certainty].color}
                strokeDasharray={ARC_STROKE[a.certainty].dash}
                strokeWidth={a.current ? 3 : 2}
                fill="none"
              />
            ))}
          </svg>
          {arcViews.map(({ a, mid }) =>
            visible(mid.x, mid.y) ? (
              <div
                key={`l-${a.id}`}
                className={`arc-label jp-pos is-${a.certainty}${a.current ? " is-current" : ""}`}
                style={{ left: mid.x, top: mid.y }}
                data-testid="arc-label"
                data-certainty={a.certainty}
              >
                {ARC_PREFIX[a.certainty]}
                {a.label}
              </div>
            ) : null,
          )}
          {groups.map((g) => {
            const head = g[0]!;
            const p = toScreen(head.location.lat, head.location.lng, view, size);
            const ids = g.map((e) => e.id);
            const active = g.some((e) => activeIds.has(e.id));
            const label = g.map((e) => `${e.title}（${formatSpan(e.start, e.end)}）`).join("、");
            return (
              <button
                key={ids.join("+")}
                type="button"
                className={[
                  "marker jp-pos",
                  `imp-${Math.max(...g.map((e) => e.importance))}`,
                  active ? "is-active" : "is-dim",
                  selectedId && ids.includes(selectedId) ? "is-selected" : "",
                  g.length > 1 ? "is-group" : "",
                  visible(p.x, p.y, 20) ? "" : "is-behind",
                ].join(" ")}
                style={{ left: p.x, top: p.y, ["--c" as string]: CATEGORIES[head.category].color }}
                data-event-id={head.id}
                data-event-ids={ids.join(" ")}
                data-count={g.length}
                aria-label={g.length > 1 ? `この地点のできごと${g.length}件：${label}` : label}
                title={g.map((e) => e.title).join(" / ")}
                onClick={(ev) => {
                  ev.stopPropagation();
                  if (g.length === 1) {
                    setPicker(null);
                    onSelect(head.id);
                    return;
                  }
                  const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
                  setPicker({ events: g, x: r.left + r.width / 2, y: r.top + r.height / 2 });
                }}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d={CATEGORIES[head.category].icon} />
                </svg>
                {g.length > 1 && (
                  <span className="marker-count" aria-hidden="true">
                    {g.length}
                  </span>
                )}
              </button>
            );
          })}
          {edgeLinks.map(({ e, x, y, w, angle }) => (
            <button
              key={`edge-${e.id}`}
              type="button"
              className="edge-link jp-pos"
              style={{ left: x, top: y, width: w }}
              onClick={(ev) => {
                ev.stopPropagation();
                onOutsideSelect?.(e.id);
              }}
              data-testid={`edge-link-${e.id}`}
              aria-label={`世界史で見る：${e.title}`}
              title={`世界史で見る：${e.title}（${e.location.placeName}）`}
            >
              <span className="edge-arrow" style={{ transform: `rotate(${angle}deg)` }} aria-hidden="true">
                ➜
              </span>
              <span className="edge-label">🌏 {e.title}</span>
            </button>
          ))}
        </>
      )}
      <div className="jp-controls">
        <button type="button" className="icon-btn" onClick={() => zoomButton(1.6)} aria-label="拡大" data-testid="jp-zoom-in">
          ＋
        </button>
        <button type="button" className="icon-btn" onClick={() => zoomButton(1 / 1.6)} aria-label="縮小" data-testid="jp-zoom-out">
          －
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={() => animateTo(viewCentering(DEFAULT_VIEW.lat, DEFAULT_VIEW.lng, 1), 600)}
          aria-label="日本全体を表示"
          title="日本全体を表示"
        >
          ⌂
        </button>
      </div>
      <span className="jp-attribution" data-testid="map-attribution">
        地図：Natural Earth
      </span>
      {picker &&
        createPortal(
          <div
            className="marker-picker"
            role="dialog"
            aria-label="この地点のできごと"
            data-testid="marker-picker"
            style={{
              left: Math.max(8, Math.min(picker.x - 130, window.innerWidth - 268)),
              top: picker.y + 22 + 200 > window.innerHeight ? Math.max(8, picker.y - 22 - 200) : picker.y + 22,
            }}
          >
            <div className="marker-picker-head">
              <span>この地点のできごと（{picker.events.length}件）</span>
              <button type="button" className="icon-btn" onClick={() => setPicker(null)} aria-label="一覧を閉じる">
                ×
              </button>
            </div>
            <ul>
              {picker.events.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    className={`marker-picker-item${activeIds.has(e.id) ? "" : " is-dim"}`}
                    onClick={() => {
                      setPicker(null);
                      onSelect(e.id);
                    }}
                    data-event-id={e.id}
                  >
                    <CategoryIcon category={e.category} size={12} />
                    <span className="marker-picker-title">{e.title}</span>
                    <span className="sub">{formatSpan(e.start, e.end).replace(/（.*）$/, "")}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>,
          document.body,
        )}
    </div>
  );
}

const RELIEF_LO = relief.layers.lo as ReliefLayer;
const RELIEF_HI = relief.layers.hi as ReliefLayer;

/** 背景の陰影起伏画像（メルカトル図法に投影済み）を、地図単位の四角に合わせて置く */
function ReliefImage({
  layer,
  className,
  testId,
  onLoad,
  onError,
}: {
  layer: ReliefLayer;
  className: string;
  testId: string;
  onLoad: () => void;
  onError: () => void;
}) {
  const r = reliefRect(layer);
  return (
    <image
      href={assetPath(layer.file)}
      x={r.x}
      y={r.y}
      width={r.w}
      height={r.h}
      preserveAspectRatio="none"
      className={className}
      data-testid={testId}
      onLoad={onLoad}
      onError={onError}
    />
  );
}
