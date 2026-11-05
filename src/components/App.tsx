"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AstroYear, EventCategory, HistoryEvent, Scope } from "@/types/event";
import {
  ALL_EVENTS,
  EVENT_BY_ID,
  EVENTS_BY_MODE,
  OTHER_ONLY_BY_MODE,
  homeMode,
  inScope,
  isShared,
  otherMode,
  scopesOf,
} from "@/data/events";
import { CATEGORY_ORDER } from "@/lib/categories";
import { MIN_YEAR, TIME_SCALES, carryYear } from "@/lib/timeScale";
import { contemporaryEvents, otherContemporary } from "@/lib/visibility";
import { crossLinks } from "@/lib/crossLinks";
import { DEFAULT_VIEW } from "@/lib/japanMap";
import { MODE_LABEL, buildQuery, parseEventQuery, parseModeQuery } from "@/lib/mode";
import JapanMapLoader from "@/components/japan/JapanMapLoader";
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
import { arcsUpTo, parseTourQuery, positionMode, stepMode, tourEventIds, tourQuery, type TourPosition } from "@/lib/tours";
import { WorksMenu } from "@/components/works/WorksMenu";
import { WORKS } from "@/data/works";
import type { HistoryWork } from "@/types/work";
import { parseWorkQuery, workQuery } from "@/lib/works";

const TICK_MS = 450;
const EVENT_MAP = EVENT_BY_ID;
const WORK_MAP = new Map(WORKS.map((w) => [w.id, w]));
/** PC で詳細パネルが地図の右側を覆う幅（パネル 380px ＋ 余白） */
const PANEL_INSET = 404;
/** 日本地図の範囲（地図データを切り出した範囲）に入る地点か。範囲外の弧は日本地図に描かない */
const onJapanMap = (lat: number, lng: number) => lat >= 10 && lat <= 58 && lng >= 96 && lng <= 178;

/** モードを切り替えたとき、選んでいるものがなければ、つながりが見えやすい場所を映す */
const MODE_HOME: Record<Scope, { lat: number; lng: number; altitude?: number; zoom?: number }> = {
  world: { lat: 32, lng: 118, altitude: 2.2 }, // 日本から戻ったときは東アジアを中心に
  japan: { lat: DEFAULT_VIEW.lat, lng: DEFAULT_VIEW.lng, zoom: 1 },
};

/** URL を書き換える（書き換えられない環境でも画面は動く） */
function replaceUrl(search: string) {
  try {
    window.history.replaceState(null, "", window.location.pathname + search);
  } catch {
    // 何もしない
  }
}

export default function App() {
  // ── 世界（地球儀）／日本（平面地図）の切り替え ──
  const [mode, setMode] = useState<Scope>("world");
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const scale = TIME_SCALES[mode];
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
  // ── 作品から探す ──
  const [worksMenuOpen, setWorksMenuOpen] = useState(false);
  /** 詳細の作品セクションで開いている（強調している）作品 */
  const [activeWorkId, setActiveWorkId] = useState<string | null>(null);
  /** 年表の「作品 n」から開いたとき、詳細を作品セクションまで送るためのキー */
  const [scrollWorksKey, setScrollWorksKey] = useState(0);

  // 画面幅（PC では詳細パネルが地図の右側を覆うので、日本地図の中央合わせでその幅を除く）
  const [wide, setWide] = useState(true);

  useEffect(() => {
    setWebgl(hasWebGL());
    const mq = window.matchMedia?.("(min-width: 768px)");
    if (!mq) return;
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);

  const filtered = useMemo(() => EVENTS_BY_MODE[mode].filter((e) => enabled.has(e.category)), [enabled, mode]);
  const contemporary = useMemo(() => contemporaryEvents(filtered, year), [filtered, year]);
  // 「同じころ、世界では？／日本では？」：もう一方のモードにだけある出来事
  const otherFiltered = useMemo(() => OTHER_ONLY_BY_MODE[mode].filter((e) => enabled.has(e.category)), [enabled, mode]);
  const otherNow = useMemo(() => otherContemporary(otherFiltered, year), [otherFiltered, year]);
  const activeIds = useMemo(() => new Set(contemporary.events.map((e) => e.id)), [contemporary]);
  const selected = useMemo(() => (selectedId ? EVENT_MAP.get(selectedId) ?? null : null), [selectedId]);
  // 選択中のイベントは、年を動かして「同時代」から外れても地図上に（薄く）残す
  const globeEvents = useMemo(() => {
    const base = showAll ? filtered : contemporary.events;
    const extra = new Set<string>(tour ? tourEventIds(tour, tourPos) : []);
    if (selected) extra.add(selected.id);
    const have = new Set(base.map((e) => e.id));
    const add = [...extra]
      .filter((id) => !have.has(id))
      .map((id) => EVENT_MAP.get(id)!)
      // 日本地図には、日本の地図に出るイベントだけを置く（ツアーの弧の始点が世界のイベントでも、点は置かない）
      .filter((e) => mode === "world" || inScope(e, "japan"));
    return add.length ? [...base, ...add] : base;
  }, [showAll, filtered, contemporary, selected, tour, tourPos, mode]);
  const arcs = useMemo(() => {
    if (!tour) return [];
    const all = arcsUpTo(tour, tourPos, ALL_EVENTS);
    return mode === "world" ? all : all.filter((a) => onJapanMap(a.startLat, a.startLng) || onJapanMap(a.endLat, a.endLng));
  }, [tour, tourPos, mode]);
  // 「世界とのつながり」：選んだイベントの関連のうち、いまの地図に出ないもの
  const links = useMemo(() => (selected ? crossLinks(selected, mode, ALL_EVENTS, scopesOf) : []), [selected, mode]);

  const flyKey = useRef(0);
  const flyToEvent = useCallback((e: HistoryEvent) => {
    flyKey.current += 1;
    setFlyTo({ lat: e.location.lat, lng: e.location.lng, key: flyKey.current });
  }, []);
  const flyHome = useCallback((m: Scope) => {
    flyKey.current += 1;
    setFlyTo({ ...MODE_HOME[m], key: flyKey.current });
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
      const next = TIME_SCALES[modeRef.current].nextYear(prev);
      setYear(next);
      const crossed = filteredRef.current
        .filter((e) => e.featured && e.start.year > prev && e.start.year <= next)
        .sort((a, b) => b.importance - a.importance)[0];
      if (crossed) {
        setSelectedId(crossed.id);
        if (followRef.current) flyToEvent(crossed);
      }
      if (next >= TIME_SCALES[modeRef.current].max) setPlaying(false);
    }, TICK_MS / speed);
    return () => clearInterval(timer);
  }, [playing, speed, flyToEvent]);

  const togglePlay = () => {
    if (!playing && year >= scale.max) setYear(scale.min);
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
      // ステップごとに地球儀と日本地図を切り替える（導入は最初のステップ、まとめは最後のステップのモード）
      const m = positionMode(t, p);
      setMode(m);
      if (p >= 0 && p < n) {
        const step = t.steps[p]!;
        const e = EVENT_MAP.get(step.eventId)!;
        setYear(step.year);
        setSelectedId(step.eventId);
        const cam = step.camera ?? { lat: e.location.lat, lng: e.location.lng };
        setFlyTo({ ...cam, key: flyKey.current });
      } else {
        // 導入とまとめでは、関係する地点が見渡せるよう少し引いて見せる
        const step = p < 0 ? t.steps[0]! : t.steps[n - 1]!;
        const e = EVENT_MAP.get(step.eventId)!;
        setYear(step.year);
        setSelectedId(null);
        const far = stepMode(step) === "japan" ? { zoom: 1.2 } : { altitude: 2.6 };
        setFlyTo({ lat: e.location.lat, lng: e.location.lng, ...far, key: flyKey.current });
      }
      replaceUrl(buildQuery(m, tourQuery(t, p)));
    },
    [],
  );

  const startTour = useCallback(
    (t: Tour, pos: TourPosition = -1) => {
      setTourMenuOpen(false);
      setActiveWorkId(null);
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
    replaceUrl(buildQuery(modeRef.current));
  }, []);

  const tourPrev = useCallback(() => tour && goTourPosition(tour, tourPos - 1), [tour, tourPos, goTourPosition]);
  const tourNext = useCallback(() => tour && goTourPosition(tour, tourPos + 1), [tour, tourPos, goTourPosition]);

  // ── 作品から探す：作品を選ぶと、最初に紐づくイベントの年・地点へ移り、詳細の作品セクションで開く ──
  const startWork = useCallback(
    (w: HistoryWork) => {
      const e = EVENT_MAP.get(w.eventIds[0]!);
      if (!e) return;
      // いまのモードの地図に出る出来事ならそのまま、出なければその出来事のモードへ切り替える
      const m = inScope(e, modeRef.current) ? modeRef.current : homeMode(e);
      setWorksMenuOpen(false);
      setTour(null);
      setTourDetail(false);
      setPlaying(false);
      setMode(m);
      setYear(carryYear(e.start.year, m));
      setSelectedId(e.id);
      setActiveWorkId(w.id);
      flyToEvent(e);
      replaceUrl(buildQuery(m, workQuery(w)));
    },
    [flyToEvent],
  );

  /** 詳細の中で作品を開閉したとき。開いた作品を URL に反映し、閉じたら外す */
  const toggleWork = useCallback(
    (id: string | null) => {
      setActiveWorkId(id);
      if (tour) return; // ツアー中の URL はツアーが持つ
      const w = id ? WORK_MAP.get(id) : undefined;
      replaceUrl(buildQuery(modeRef.current, w ? workQuery(w) : ""));
    },
    [tour],
  );

  // 選んだ作品に紐づかない出来事へ移ったら（詳細を閉じた・別の出来事を選んだ・自動再生など）、作品の強調と URL を外す
  useEffect(() => {
    if (!activeWorkId) return;
    const w = WORK_MAP.get(activeWorkId);
    if (!w || !selectedId || !w.eventIds.includes(selectedId)) toggleWork(null);
  }, [selectedId, activeWorkId, toggleWork]);

  // ── 世界↔日本の切り替え ──
  /**
   * モードを切り替える。年はそのまま引き継ぎ（範囲の外なら端に合わせる）、
   * 選んでいたイベントが切り替え先の地図にも出るもの（共有イベント）なら選択も引き継ぐ。
   */
  const switchMode = useCallback(
    (to: Scope) => {
      if (to === modeRef.current) return;
      if (tour) {
        setTour(null);
        setTourDetail(false);
      }
      setPlaying(false);
      setMode(to);
      setYear((y) => carryYear(y, to));
      const keep = selected && inScope(selected, to) ? selected : null;
      if (keep) flyToEvent(keep);
      else {
        setSelectedId(null);
        flyHome(to);
      }
      const w = activeWorkId && keep ? WORK_MAP.get(activeWorkId) : undefined;
      replaceUrl(buildQuery(to, w ? workQuery(w) : ""));
    },
    [tour, selected, activeWorkId, flyToEvent, flyHome],
  );

  /**
   * もう一方のモードにあるイベントを開く（「世界とのつながり」のカード・地図の端の矢印・「同じころ」の段）。
   * モードを切り替え、その年・その地点へ移動し、詳細を開く。ツアー中なら、ツアーを抜けてから移る。
   */
  const openInOtherMode = useCallback(
    (id: string) => {
      const e = EVENT_MAP.get(id);
      if (!e) return;
      const to = inScope(e, modeRef.current) ? otherMode(modeRef.current) : homeMode(e);
      setTour(null);
      setTourDetail(false);
      setPlaying(false);
      setMode(to);
      setYear(carryYear(e.start.year, to));
      setSelectedId(e.id);
      flyToEvent(e);
      replaceUrl(buildQuery(to));
    },
    [flyToEvent],
  );

  // URL から直接開始（?tour=paper&step=3 ／ ?work=kingdom-hara ／ ?event=<id>。?mode=japan と組み合わせられる。
  // 複数あれば ツアー → 作品 → イベント の順に優先）
  useEffect(() => {
    const search = window.location.search;
    const q = parseTourQuery(search, TOURS);
    if (q) {
      startTour(q.tour, q.position);
      return;
    }
    const m = parseModeQuery(search);
    setMode(m);
    modeRef.current = m;
    const w = parseWorkQuery(search, WORKS);
    if (w) {
      startWork(w);
      return;
    }
    const id = parseEventQuery(search);
    const e = id ? EVENT_MAP.get(id) : undefined;
    if (e) {
      const to = inScope(e, m) ? m : homeMode(e);
      setMode(to);
      setYear(carryYear(e.start.year, to));
      setSelectedId(e.id);
      flyToEvent(e);
      replaceUrl(buildQuery(to, `event=${encodeURIComponent(e.id)}`));
      return;
    }
    setYear(TIME_SCALES[m].min);
  }, [startTour, startWork, flyToEvent]); // いずれも依存のない useCallback なので、実質的に初回だけ動く

  // キーボード：← → で前後、Esc で抜ける（スライダーなど入力中は除く）
  useEffect(() => {
    if (!tour || tourMenuOpen || worksMenuOpen) return;
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
  }, [tour, tourDetail, tourNext, tourPrev, exitTour, tourMenuOpen, worksMenuOpen]);

  const closeWorksMenu = useCallback(() => setWorksMenuOpen(false), []);

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

  // 日本地図は WebGL を使わない（SVG）ので、WebGL 非対応の端末でも表示できる
  const mapAvailable = mode === "japan" || webgl === true;
  const showGlobe = view === "globe" && webgl === true && mode === "world";
  const showJapanMap = view === "globe" && mode === "japan" && webgl !== null;
  const showTourPanel = tour !== null && !tourDetail;
  const showDetail = selected !== null && (tour === null || tourDetail);

  // 世界／日本の切り替え。PC はヘッダーに、スマホは地図の右上に重ねて出す（ヘッダーに収まらないため）
  const modeSwitch = (
      <div className={`mode-switch${wide ? "" : " is-floating"}`} role="group" aria-label="表示する地図" data-testid="mode-switch">
          {(["world", "japan"] as const).map((m) => (
            <button
              key={m}
              type="button"
              className={`mode-btn${mode === m ? " is-on" : ""}`}
              aria-pressed={mode === m}
              onClick={() => switchMode(m)}
              data-testid={`mode-${m}`}
              title={m === "world" ? "世界（3D地球儀）" : "日本（日本周辺の地図）"}
            >
              <span aria-hidden="true">{m === "world" ? "🌏" : "🗾"}</span>
              <span className="mode-label">{MODE_LABEL[m]}</span>
            </button>
          ))}
        </div>
  );

  return (
    <div
      className={`app mode-${mode}${showTourPanel || showDetail ? " has-detail" : ""}${tour ? " in-tour" : ""}`}
      data-mode={mode}
    >
      <PreviewBanner />
      <header className="topbar">
        <h1 className="brand">World History Globe</h1>
        <div className="current-year" aria-live="polite" data-testid="current-year">
          {formatYear(year)}
        </div>
        {wide && modeSwitch}
        <div className="view-switch">
          <button
            type="button"
            className="text-btn tour-open"
            onClick={() => setTourMenuOpen(true)}
            data-testid="tour-open"
          >
            歴史を旅する
          </button>
          <button
            type="button"
            className="text-btn works-open"
            onClick={() => setWorksMenuOpen(true)}
            data-testid="works-open"
          >
            作品から探す
          </button>
          {mapAvailable ? (
            <button
              type="button"
              className="text-btn"
              onClick={() => setView((v) => (v === "globe" ? "list" : "globe"))}
              data-testid="view-toggle"
            >
              {view === "globe" ? "年表" : mode === "japan" ? "地図" : "地球"}
              <span className="sp-hide">表示</span>
            </button>
          ) : null}
        </div>
      </header>

      {webgl === false && mode === "world" && (
        <p className="fallback-notice" role="status" data-testid="fallback-notice">
          この環境では3D地球（WebGL）を表示できないため、年表で表示しています。
        </p>
      )}

      <main className="stage">
        <div className="stage-main">
        {!wide && modeSwitch}
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
        {showJapanMap && (
          <>
            <JapanMapLoader
              events={globeEvents}
              activeIds={activeIds}
              selectedId={selectedId}
              flyTo={flyTo}
              onSelect={select}
              onUserInteract={onUserInteract}
              arcs={arcs}
              outsideLinks={tour ? [] : links}
              onOutsideSelect={openInOtherMode}
              insetRight={wide && (showTourPanel || showDetail) ? PANEL_INSET : 0}
            />
            <CategoryLegend enabled={enabled} onToggle={toggleCategory} showAll={showAll} onShowAll={setShowAll} />
          </>
        )}
        {!showGlobe && !showJapanMap && webgl !== null && (
          <ChronologyList
            mode={mode}
            events={filtered}
            selectedId={selectedId}
            onSelect={select}
            onSelectWorks={(id) => {
              select(id);
              setScrollWorksKey((k) => k + 1);
            }}
          />
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
            mode={mode}
            crossLinks={links}
            onCrossLink={openInOtherMode}
            onShowInOtherMode={isShared(selected) ? () => switchMode(otherMode(mode)) : undefined}
            activeWorkId={activeWorkId}
            onWorkToggle={toggleWork}
            scrollToWorksKey={scrollWorksKey}
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
          mode={mode}
          other={otherNow}
          onSelectOther={openInOtherMode}
        />
        <TimeControls
          mode={mode}
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
          {mode === "japan"
            ? "地図：Natural Earth（パブリックドメイン）。現代の国境・県境は表示していません。時代区分の境目は目安です。"
            : "地球画像：NASA Blue Marble（three-globe 同梱）。現代の国境線は表示していません。"}
        </p>
      </footer>
      {tourMenuOpen && <TourMenu tours={TOURS} onStart={(t) => startTour(t)} onClose={() => setTourMenuOpen(false)} />}
      {worksMenuOpen && <WorksMenu works={WORKS} onStart={startWork} onClose={closeWorksMenu} />}
    </div>
  );
}
