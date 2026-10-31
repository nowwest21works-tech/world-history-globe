"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import Globe, { type GlobeMethods } from "react-globe.gl";
import type { HistoryEvent } from "@/types/event";
import { CATEGORIES } from "@/lib/categories";
import { formatSpan } from "@/lib/year";
import { assetPath } from "@/lib/assetPath";
import type { TourArcView } from "@/lib/tours";
import { useElementSize } from "./useElementSize";

export interface FlyTarget {
  lat: number;
  lng: number;
  altitude?: number;
  /** 同じ地点へ再度飛ぶ場合も反応させるためのキー */
  key: number;
}

export interface GlobeViewProps {
  events: HistoryEvent[];
  /** 現在の「同時代」に含まれるイベントID（それ以外は薄く表示） */
  activeIds: Set<string>;
  selectedId: string | null;
  flyTo: FlyTarget | null;
  onSelect: (id: string) => void;
  /** ユーザーがドラッグ・ズームを始めたとき */
  onUserInteract: () => void;
  /** 学習ツアー（つながり型）の弧 */
  arcs?: TourArcView[];
}

interface Marker {
  kind: "marker";
  id: string;
  lat: number;
  lng: number;
  event: HistoryEvent;
  active: boolean;
}

/** 弧の中点に置く短いラベル（「伝承」などを地球上でも見分けられるようにする） */
interface ArcLabel {
  kind: "arc-label";
  id: string;
  lat: number;
  lng: number;
  arc: TourArcView;
}

const ARC_STYLE = {
  // 史実＝実線、伝承＝破線、諸説あり＝点線
  established: { color: "rgba(255, 210, 122, 0.95)", dash: 1, gap: 0 },
  traditional: { color: "rgba(255, 255, 255, 0.95)", dash: 0.05, gap: 0.035 },
  debated: { color: "rgba(170, 196, 255, 0.95)", dash: 0.012, gap: 0.02 },
} as const;

const ARC_PREFIX = { established: "", traditional: "伝承：", debated: "諸説あり：" } as const;

/** 大円上の中点（緯度経度） */
function midpoint(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = Math.PI / 180;
  const toV = (p: { lat: number; lng: number }) => [
    Math.cos(p.lat * r) * Math.cos(p.lng * r),
    Math.cos(p.lat * r) * Math.sin(p.lng * r),
    Math.sin(p.lat * r),
  ];
  const [x1, y1, z1] = toV(a);
  const [x2, y2, z2] = toV(b);
  const x = x1! + x2!, y = y1! + y2!, z = z1! + z2!;
  return { lat: Math.atan2(z, Math.hypot(x, y)) / r, lng: Math.atan2(y, x) / r };
}

declare global {
  interface Window {
    /** E2Eテスト用：カメラ位置の読み取りのみ */
    __WHG__?: { pov: () => { lat: number; lng: number; altitude: number } | undefined };
  }
}

export default function GlobeView({
  events,
  activeIds,
  selectedId,
  flyTo,
  onSelect,
  onUserInteract,
  arcs = [],
}: GlobeViewProps) {
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const [boxRef, size] = useElementSize<HTMLDivElement>();
  const onSelectRef = useRef(onSelect);
  const onInteractRef = useRef(onUserInteract);
  onSelectRef.current = onSelect;
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  const boxEl = useRef<HTMLDivElement | null>(null);
  const setBox = useCallback(
    (node: HTMLDivElement | null) => {
      boxEl.current = node;
      boxRef(node);
    },
    [boxRef],
  );
  onInteractRef.current = onUserInteract;

  const markers = useMemo<(Marker | ArcLabel)[]>(
    () => [
      ...events.map((e): Marker => ({
        kind: "marker",
        id: e.id,
        lat: e.location.lat,
        lng: e.location.lng,
        event: e,
        active: activeIds.has(e.id),
      })),
      ...arcs.map((a): ArcLabel => ({
        kind: "arc-label",
        id: a.id,
        ...midpoint({ lat: a.startLat, lng: a.startLng }, { lat: a.endLat, lng: a.endLng }),
        arc: a,
      })),
    ],
    [events, activeIds, arcs],
  );

  // 選択状態はクラスの付け替えだけで反映する（要素を作り直すと一瞬位置が未確定になるため）
  useEffect(() => {
    const root = boxEl.current;
    if (!root) return;
    const sync = () =>
      root.querySelectorAll<HTMLElement>(".marker").forEach((el) => {
        el.classList.toggle("is-selected", el.dataset.eventId === selectedId);
      });
    sync();
    const id = requestAnimationFrame(sync);
    return () => cancelAnimationFrame(id);
  }, [selectedId, markers]);

  const makeElement = useCallback((d: object) => {
    if ((d as ArcLabel).kind === "arc-label") {
      const { arc } = d as ArcLabel;
      const el = document.createElement("div");
      el.className = `arc-label is-${arc.certainty}${arc.current ? " is-current" : ""}`;
      el.dataset.testid = "arc-label";
      el.dataset.certainty = arc.certainty;
      // 地球上ではラベルだけが見えるので、確かさを文字でも添える
      el.textContent = `${ARC_PREFIX[arc.certainty]}${arc.label}`;
      return el;
    }
    const m = d as Marker;
    const cat = CATEGORIES[m.event.category];
    const el = document.createElement("button");
    el.type = "button";
    el.className = [
      "marker",
      `imp-${m.event.importance}`,
      m.active ? "is-active" : "is-dim",
      m.id === selectedIdRef.current ? "is-selected" : "",
    ].join(" ");
    el.style.setProperty("--c", cat.color);
    el.dataset.eventId = m.id;
    el.setAttribute("aria-label", `${m.event.title}（${formatSpan(m.event.start, m.event.end)}）`);
    el.title = m.event.title;
    el.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${cat.icon}"/></svg>`;
    el.addEventListener("click", (ev) => {
      ev.stopPropagation();
      onSelectRef.current(m.id);
    });
    // マーカー上で始まったドラッグが地球の回転として扱われないようにする
    el.addEventListener("pointerdown", (ev) => ev.stopPropagation());
    return el;
  }, []);

  const handleReady = useCallback(() => {
    const g = globeRef.current;
    if (!g) return;
    g.pointOfView({ lat: 25, lng: 60, altitude: window.innerWidth < 768 ? 2.9 : 2.2 }, 0);
    const controls = g.controls();
    controls.enableDamping = true;
    controls.minDistance = 130;
    controls.maxDistance = 700;
    controls.addEventListener("start", () => onInteractRef.current());
    window.__WHG__ = { pov: () => globeRef.current?.pointOfView() };
  }, []);

  useEffect(() => {
    if (!flyTo || !globeRef.current) return;
    const current = globeRef.current.pointOfView();
    const altitude = flyTo.altitude ?? Math.min(current.altitude, 1.9);
    // スマホで詳細を開いたときは地球の描画領域そのものが上半分に縮むので、地点をそのまま中央に合わせればよい
    globeRef.current.pointOfView({ lat: flyTo.lat, lng: flyTo.lng, altitude }, 1500);
  }, [flyTo]);

  return (
    <div ref={setBox} className="globe-box" data-testid="globe">
      {size.width > 0 && (
        <Globe
          ref={globeRef}
          width={size.width}
          height={size.height}
          backgroundColor="rgba(0,0,0,0)"
          globeImageUrl={assetPath("/textures/earth-blue-marble.jpg")}
          showAtmosphere
          atmosphereColor="#8ab4ff"
          atmosphereAltitude={0.15}
          onGlobeReady={handleReady}
          htmlElementsData={markers}
          htmlLat="lat"
          htmlLng="lng"
          htmlAltitude={0.01}
          htmlElement={makeElement}
          htmlTransitionDuration={0}
          htmlElementVisibilityModifier={(el, visible) => {
            el.classList.toggle("is-behind", !visible);
          }}
          arcsData={arcs}
          arcColor={(d: object) => ARC_STYLE[(d as TourArcView).certainty].color}
          arcDashLength={(d: object) => ARC_STYLE[(d as TourArcView).certainty].dash}
          arcDashGap={(d: object) => ARC_STYLE[(d as TourArcView).certainty].gap}
          arcDashAnimateTime={0}
          arcStroke={(d: object) => ((d as TourArcView).current ? 0.9 : 0.55)}
          arcAltitudeAutoScale={0.35}
          arcsTransitionDuration={1200}
        />
      )}
    </div>
  );
}
