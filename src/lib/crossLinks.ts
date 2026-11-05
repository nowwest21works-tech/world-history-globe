import type { HistoryEvent, Scope } from "@/types/event";

/**
 * 「世界とのつながり」：あるイベントと relatedEventIds でつながっているイベントのうち、
 * いまのモードの地図には出ない（もう一方のモードにだけある）もの。
 * つながりは向きを問わない（A が B を挙げていれば、B の詳細にも A を出す）。
 */
export function crossLinks(
  e: HistoryEvent,
  mode: Scope,
  all: HistoryEvent[],
  scopesOf: (x: HistoryEvent) => Scope[],
): HistoryEvent[] {
  const byId = new Map(all.map((x) => [x.id, x]));
  const ids = new Set<string>(e.relatedEventIds ?? []);
  for (const x of all) if (x.id !== e.id && (x.relatedEventIds ?? []).includes(e.id)) ids.add(x.id);
  return [...ids]
    .map((id) => byId.get(id))
    .filter((x): x is HistoryEvent => !!x && !scopesOf(x).includes(mode))
    .sort((a, b) => a.start.year - b.start.year);
}
