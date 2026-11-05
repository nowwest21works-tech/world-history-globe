import type { HistoryEvent, Scope } from "@/types/event";
import worldRaw from "./events.json";
import japanRaw from "./events-japan.json";

const byStart = (a: HistoryEvent, b: HistoryEvent) => a.start.year - b.start.year;

/**
 * scopes を省略したイベントに既定値を入れる（events.json は ["world"]、events-japan.json は ["japan"]）。
 * 元の JSON は変えず、読み込み時に補う。
 */
function withScopes(list: HistoryEvent[], fallback: Scope): HistoryEvent[] {
  return list.map((e) => (e.scopes ? e : { ...e, scopes: [fallback] }));
}

/** 世界史のイベント（events.json）。開始年順 */
export const EVENTS: HistoryEvent[] = withScopes(worldRaw as HistoryEvent[], "world").sort(byStart);

/** 日本史のイベント（events-japan.json）。開始年順 */
export const JAPAN_EVENTS: HistoryEvent[] = withScopes(japanRaw as HistoryEvent[], "japan").sort(byStart);

/** 両方のデータ。ID は世界・日本を通して一意 */
export const ALL_EVENTS: HistoryEvent[] = [...EVENTS, ...JAPAN_EVENTS].sort(byStart);

export const EVENT_BY_ID = new Map(ALL_EVENTS.map((e) => [e.id, e]));

/** イベントを出す地図（読み込み時に既定値を補っているので必ずある） */
export function scopesOf(e: HistoryEvent): Scope[] {
  return e.scopes ?? ["world"];
}

export function inScope(e: HistoryEvent, mode: Scope): boolean {
  return scopesOf(e).includes(mode);
}

/** そのイベントの「本来の」モード（scopes の先頭）。もう一方のモードから開くときの行き先 */
export function homeMode(e: HistoryEvent): Scope {
  return scopesOf(e)[0]!;
}

/** 世界と日本の両方の地図に出るイベント */
export function isShared(e: HistoryEvent): boolean {
  const s = scopesOf(e);
  return s.includes("world") && s.includes("japan");
}

/** モードごとに地図に出すイベント（共有イベントは両方に入る） */
export const EVENTS_BY_MODE: Record<Scope, HistoryEvent[]> = {
  world: ALL_EVENTS.filter((e) => inScope(e, "world")),
  japan: ALL_EVENTS.filter((e) => inScope(e, "japan")),
};

/** もう一方のモードにだけあるイベント（「同じころ、世界では？／日本では？」の段に使う） */
export const OTHER_ONLY_BY_MODE: Record<Scope, HistoryEvent[]> = {
  world: ALL_EVENTS.filter((e) => inScope(e, "japan") && !inScope(e, "world")),
  japan: ALL_EVENTS.filter((e) => inScope(e, "world") && !inScope(e, "japan")),
};

export const otherMode = (m: Scope): Scope => (m === "world" ? "japan" : "world");
