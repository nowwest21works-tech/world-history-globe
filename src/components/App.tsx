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

const TICK_MS = 450;

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

  useEffect(() => {
    const ok = hasWebGL();
    setWebgl(ok);
    if (!ok) setView("list");
  }, []);

  const filtered = useMemo(() => EVENTS.filter((e) => enabled.has(e.category)), [enabled]);
  const contemporary = useMemo(() => contemporaryEvents(filtered, year), [filtered, year]);
  const activeIds = useMemo(() => new Set(contemporary.events.map((e) => e.id)), [contemporary]);
  const globeEvents = showAll ? filtered : contemporary.events;
  const selected = useMemo(() => EVENTS.find((e) => e.id === selectedId) ?? null, [selectedId]);

  const flyKey = useRef(0);
  const flyToEvent = useCallback((e: HistoryEvent) => {
    flyKey.current += 1;
    setFlyTo({ lat: e.location.lat, lng: e.location.lng, key: flyKey.current });
  }, []);

  const select = useCallback(
    (id: string) => {
      setSelectedId(id);
      const e = EVENTS.find((x) => x.id === id);
      if (e) flyToEvent(e);
    },
    [flyToEvent],
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

  const toggleCategory = (c: EventCategory) =>
    setEnabled((prev) => {
      const n = new Set(prev);
      if (n.has(c)) n.delete(c);
      else n.add(c);
      return n;
    });

  const showGlobe = view === "globe" && webgl === true;

  return (
    <div className={`app${selected ? " has-detail" : ""}`}>
      <header className="topbar">
        <h1 className="brand">World History Globe</h1>
        <div className="current-year" aria-live="polite" data-testid="current-year">
          {formatYear(year)}
        </div>
        <div className="view-switch">
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
        {showGlobe && (
          <>
            <GlobeLoader
              events={globeEvents}
              activeIds={activeIds}
              selectedId={selectedId}
              flyTo={flyTo}
              onSelect={select}
              onUserInteract={onUserInteract}
            />
            <CategoryLegend enabled={enabled} onToggle={toggleCategory} showAll={showAll} onShowAll={setShowAll} />
          </>
        )}
        {!showGlobe && webgl !== null && (
          <ChronologyList events={filtered} selectedId={selectedId} onSelect={setSelectedId} />
        )}
        {selected && <EventDetail event={selected} onClose={() => setSelectedId(null)} />}
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
        />
        <p className="credit">
          収録データはすべて<strong>未検証</strong>です（人間による史実・出典の確認前）。出典はリンクのみで、本文は独自に作成しています。
          地球画像：NASA Blue Marble（three-globe 同梱）。現代の国境線は表示していません。
        </p>
      </footer>
    </div>
  );
}
