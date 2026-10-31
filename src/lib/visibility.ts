import type { AstroYear, HistoryEvent } from "@/types/event";

/** 現在年の前後で「同時代」とみなす基本の幅（年）。古代ほど広く、近現代ほど狭い。 */
export function baseWindow(year: AstroYear): number {
  if (year < -499) return 100;
  if (year < 1000) return 50;
  if (year < 1500) return 30;
  if (year < 1800) return 20;
  return 10;
}

/** イベントが現在年から何年離れているか（期間中なら 0） */
export function distanceFromEvent(e: HistoryEvent, year: AstroYear): number {
  const s = e.start.year;
  const t = e.end?.year ?? s;
  if (year < s) return s - year;
  if (year > t) return year - t;
  return 0;
}

export function isOngoing(e: HistoryEvent, year: AstroYear): boolean {
  return distanceFromEvent(e, year) === 0;
}

export const MIN_CONTEMPORARY = 2;

/**
 * 「同時代のできごと」を返す。基本の幅で2件未満なら、2件以上になるまで幅を広げる。
 * 広げた場合は window が基本値より大きくなるので、UI で幅を明示する。
 */
export function contemporaryEvents(
  events: HistoryEvent[],
  year: AstroYear,
  min = MIN_CONTEMPORARY,
): { events: HistoryEvent[]; window: number; expanded: boolean } {
  const base = baseWindow(year);
  let window = base;
  let hits = events.filter((e) => distanceFromEvent(e, year) <= window);
  if (hits.length < min && events.length >= min) {
    const dists = events.map((e) => distanceFromEvent(e, year)).sort((a, b) => a - b);
    window = Math.max(base, dists[min - 1]!);
    hits = events.filter((e) => distanceFromEvent(e, year) <= window);
  }
  hits.sort(
    (a, b) => distanceFromEvent(a, year) - distanceFromEvent(b, year) || a.start.year - b.start.year,
  );
  return { events: hits, window, expanded: window > base };
}
