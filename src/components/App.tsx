"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AstroYear, EventCategory, HistoryEvent } from "@/types/event";
import { EVENTS } from "@/data/events";
import { CATEGORY_ORDER } from "@/lib/categories";
import { MAX_YEAR, MIN_YEAR, nextYear } from "@/lib/timeScale";
import { contemporaryEvents } from "@/lib/visibility";
import { formatYear } from "@/lib/year";
import { hasWebGL } from "@/lib/webgl";
import GlobeLoader from "@/components/globe/GlobeLoader";
import type { FlyTarget } from "@/components/globe/GlobeView";
import { TimeControls } from "@/components/timeline/TimeControls";
import { ContemporaryStrip } from "@/components/timeline/ContemporaryStrip";
import { CategoryLegend } from "@/components/legend/CategoryLegend";
import { EventDetail } from "@/components/panel/EventDetail";
import { ChronologyList } from "@/components/fallback/ChronologyList";
import { PreviewBanner } from "@/components/PreviewBanner";
import { TourMenu } from "@/components/tour/TourMenu";
import { TourPanel } from "@/components/tour/TourPanel";
import { TOURS } from "@/data/tours";
import type { Tour } from "@/types/tour";
import { arcsUpTo, parseTourQuery, tourEventIds, tourQuery, type TourPosition } from "@/lib/tours";

const TICK_MS = 450;
const EVENT_MAP = new Map(EVENTS.map((e) => [e.id, e]));

export default function App() {
  const [year, setYear] = useState<AstroYear>(MIN_YEAR);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [follow, setFollow] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [flyTo, setFlyTo] = useState<FlyTarget | null>(null);
  const [enabled, setEnabled] = useState<Set<EventCategory>>(() => new Set(CATEGORY_ORDER));
  const [showAll, setShowAll] = useState(false);
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [view, setView] = useState<"globe" | "list">("globe");
  // ── 学習ツアー ──
  const [tour, setTour] = useState<Tour | null>(null);
  const [tourPos, setTourPos] = useState<TourPosition>(-1);
  const [tourMenuOpen, setTourMenuOpen] = useState(false);
  /** ツアー中に「このできごとの詳細」を開いているか */
  const [tourDetail, setTourDetail] = useState(false);

  useEffect(() => {
    const ok = hasWebGL();
    setWebgl(ok);
    if (!ok) setView("list");
  }, []);

  const filtered = useMemo(() => EVENTS.filter((e) => enabled.has(e.category)), [enabled]);
  const contemporary = useMemo(() => contemporaryEvents(filtered, year), [filtered, year]);
  const activeIds = useMemo(() => new Set(contemporary.events.map((e) => e.id)), [contemporary]);
  const selected = useMemo(() => EVENTS.find((e) => e.id === selectedId) ?? null, [selectedId]);
  // 選択中のイベントは、年を動かして「同時代」から外れても地球上に（薄く）残す
  const globeEvents = useMemo(() => {
    const base = showAll ? filtered : contemporary.events;
    const extra = new Set<string>(tour ? tourEventIds(tour, tourPos) : []);
    if (selected) extra.add(selected.id);
    const have = new Set(base.map((e) => e.id));
    const add = [...extra].filter((id) => !have.has(id)).map((id) => EVENT_MAP.get(id)!);
    return add.length ? [...base, ...add] : base;
  }, [showAll, filtered, contemporary, selected, tour, tourPos]);
  const arcs = useMemo(() => (tour ? arcsUpTo(tour, tourPos, EVENTS) : []), [tour, tourPos]);

  const flyKey = useRef(0);
  const flyToEvent = useCallback((e: HistoryEvent) => {
    flyKey.current += 1;
    setFlyTo({ lat: e.location.lat, lng: e.location.lng, key: flyKey.current });
  }, []);

  const select = useCallback(
    (id: string) => {
      setSelectedId(id);
      // ツアー中にマーカーやチップを選んだら、ツアーの上に詳細を重ねて開く（閉じるとツアーに戻る）
      if (tour) setTourDetail(true);
      const e = EVENT_MAP.get(id);
      if (e) flyToEvent(e);
    },
    [flyToEvent, tour],
  );

  // ── 自動再生：年を進め、注目イベントの開始年を通過したらカメラを移動する ──
  const yearRef = useRef(year);
  yearRef.current = year;
  const followRef = useRef(follow);
  followRef.current = follow;
  const filteredRef = useRef(filtered);
  filteredRef.current = filtered;

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      const prev = yearRef.current;
      const next = nextYear(prev);
      setYear(next);
      const crossed = filteredRef.current
        .filter((e) => e.featured && e.start.year > prev && e.start.year <= next)
        .sort((a, b) => b.importance - a.importance)[0];
      if (crossed) {
        setSelectedId(crossed.id);
        if (followRef.current) flyToEvent(crossed);
      }
      if (next >= MAX_YEAR) setPlaying(false);
    }, TICK_MS / speed);
    return () => clearInterval(timer);
  }, [playing, speed, flyToEvent]);

  const togglePlay = () => {
    if (!playing && year >= MAX_YEAR) setYear(MIN_YEAR);
    setPlaying((p) => !p);
  };

  const onUserInteract = useCallback(() => {
    // 再生中にユーザーが地球を動かしたら、カメラ追従を止めて操作を優先する
    if (playing) setFollow(false);
  }, [playing]);

  // ── 学習ツアーの進行 ──
  /** 表示位置に合わせて年・選択・カメラを動かす */
  const goTourPosition = useCallback(
    (t: Tour, pos: TourPosition) => {
      const n = t.steps.length;
      const p = Math.max(-1, Math.min(pos, n));
      setTourPos(p);
      setTourDetail(false);
      setPlaying(false);
      flyKey.current += 1;
      if (p >= 0 && p < n) {
        const step = t.steps[p]!;
        const e = EVENT_MAP.get(step.eventId)!;
        setYear(step.year);
        setSelectedId(step.eventId);
        const cam = step.camera ?? { lat: e.location.lat, lng: e.location.lng, altitude: undefined };
        setFlyTo({ ...cam, key: flyKey.current });
      } else {
        // 導入とまとめでは、関係する地点が見渡せるよう少し引いて見せる
        const step = p < 0 ? t.steps[0]! : t.steps[n - 1]!;
        const e = EVENT_MAP.get(step.eventId)!;
        setYear(step.year);
        setSelectedId(null);
        setFlyTo({ lat: e.location.lat, lng: e.location.lng, altitude: 2.6, key: flyKey.current });
      }
      try {
        window.history.replaceState(null, "", window.location.pathname + tourQuery(t, p));
      } catch {
        // URL を書き換えられない環境でもツアー自体は動く
      }
    },
    [],
  );

  const startTour = useCallback(
    (t: Tour, pos: TourPosition = -1) => {
      setTourMenuOpen(false);
      setTour(t);
      goTourPosition(t, pos);
    },
    [goTourPosition],
  );

  const exitTour = useCallback(() => {
    // 抜けたあとは、その年・その場所のまま自由に見て回れる状態に戻る
    setTour(null);
    setTourDetail(false);
    setSelectedId(null);
    try {
      window.history.replaceState(null, "", window.location.pathname);
    } catch {
      // 何もしない
    }
  }, []);

  const tourPrev = useCallback(() => tour && goTourPosition(tour, tourPos - 1), [tour, tourPos, goTourPosition]);
  const tourNext = useCallback(() => tour && goTourPosition(tour, tourPos + 1), [tour, tourPos, goTourPosition]);

  // URL から直接開始（?tour=paper&step=3）
  useEffect(() => {
    const q = parseTourQuery(window.location.search, TOURS);
    if (q) startTour(q.tour, q.position);
  }, [startTour]);

  // キーボード：← → で前後、Esc で抜ける（スライダーなど入力中は除く）
  useEffect(() => {
    if (!tour) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && ["INPUT", "SELECT", "TEXTAREA"].includes(el.tagName)) return;
      if (e.key === "ArrowRight") tourNext();
      else if (e.key === "ArrowLeft") tourPrev();
      else if (e.key === "Escape") {
        if (tourDetail) setTourDetail(false);
        else exitTour();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tour, tourDetail, tourNext, tourPrev, exitTour]);

  const closeTourDetail = () => {
    setTourDetail(false);
    if (tour) {
      const step = tour.steps[tourPos];
      setSelectedId(step ? step.eventId : null);
    }
  };

  const recenterTourStep = () => {
    const step = tour?.steps[tourPos];
    const e = step && EVENT_MAP.get(step.eventId);
    if (e) flyToEvent(e);
  };

  const toggleCategory = (c: EventCategory) =>
    setEnabled((prev) => {
      const n = new Set(prev);
      if (n.has(c)) n.delete(c);
      else n.add(c);
      return n;
    });

  const showGlobe = view === "globe" && webgl === true;
  const showTourPanel = tour !== null && !tourDetail;
  const showDetail = selected !== null && (tour === null || tourDetail);

  return (
    <div className={`app${showTourPanel || showDetail ? " has-detail" : ""}${tour ? " in-tour" : ""}`}>
      <PreviewBanner />
      <header className="topbar">
        <h1 className="brand">World History Globe</h1>
        <div className="current-year" aria-live="polite" data-testid="current-year">
          {formatYear(year)}
        </div>
        <div className="view-switch">
          <button
            type="button"
            className="text-btn tour-open"
            onClick={() => setTourMenuOpen(true)}
            data-testid="tour-open"
          >
            歴史を旅する
          </button>
          {webgl ? (
            <button
              type="button"
              className="text-btn"
              onClick={() => setView((v) => (v === "globe" ? "list" : "globe"))}
              data-testid="view-toggle"
            >
              {view === "globe" ? "年表表示" : "地球表示"}
            </button>
          ) : null}
        </div>
      </header>

      {webgl === false && (
        <p className="fallback-notice" role="status" data-testid="fallback-notice">
          この環境では3D地球（WebGL）を表示できないため、年表で表示しています。
        </p>
      )}

      <main className="stage">
        <div className="stage-main">
        {showGlobe && (
          <>
            <GlobeLoader
              events={globeEvents}
              activeIds={activeIds}
              selectedId={selectedId}
              flyTo={flyTo}
              onSelect={select}
              onUserInteract={onUserInteract}
              arcs={arcs}
            />
            <CategoryLegend enabled={enabled} onToggle={toggleCategory} showAll={showAll} onShowAll={setShowAll} />
          </>
        )}
        {!showGlobe && webgl !== null && (
          <ChronologyList events={filtered} selectedId={selectedId} onSelect={select} />
        )}
        </div>
        {showTourPanel && (
          <TourPanel
            tour={tour}
            position={tourPos}
            events={EVENT_MAP}
            onPrev={tourPrev}
            onNext={tourNext}
            onExit={exitTour}
            onShowDetail={() => setTourDetail(true)}
            onRecenter={recenterTourStep}
          />
        )}
        {showDetail && selected && (
          <EventDetail
            event={selected}
            onClose={tour ? closeTourDetail : () => setSelectedId(null)}
            closeLabel={tour ? "ツアーに戻る" : "詳細を閉じる"}
          />
        )}
      </main>

      <footer className="bottombar">
        <ContemporaryStrip
          events={contemporary.events}
          year={year}
          window={contemporary.window}
          expanded={contemporary.expanded}
          selectedId={selectedId}
          onSelect={select}
        />
        <TimeControls
          year={year}
          playing={playing}
          speed={speed}
          follow={follow}
          onYear={setYear}
          onTogglePlay={togglePlay}
          onSpeed={setSpeed}
          onFollow={setFollow}
          playDisabled={tour !== null}
        />
        <p className="credit">
          収録データはすべて<strong>未検証</strong>です（人間による史実・出典の確認前）。出典はリンクのみで、本文は独自に作成しています。
          地球画像：NASA Blue Marble（three-globe 同梱）。現代の国境線は表示していません。
        </p>
      </footer>
      {tourMenuOpen && <TourMenu tours={TOURS} onStart={(t) => startTour(t)} onClose={() => setTourMenuOpen(false)} />}
    </div>
  );
}
