import type { HistoryEvent } from "@/types/event";

const CATEGORIES = ["politics", "war", "religion", "culture", "economy", "exchange"];
const PRECISIONS = ["exact", "city", "region"];
const UNCERTAINTIES = ["exact", "circa", "plusMinus"];

/** events.json の整合性チェック。問題の一覧を返す（空なら OK）。 */
export function validateEvents(events: HistoryEvent[]): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const e of events) {
    const p = `[${e.id}]`;
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(e.id)) errors.push(`${p} id が kebab-case ではない`);
    if (ids.has(e.id)) errors.push(`${p} id が重複`);
    ids.add(e.id);
    if (!e.title || !e.summary || !e.historicalNote) errors.push(`${p} title/summary/historicalNote が空`);
    if (!CATEGORIES.includes(e.category)) errors.push(`${p} category が不正: ${e.category}`);
    for (const tp of [e.start, e.end]) {
      if (!tp) continue;
      if (!Number.isInteger(tp.year)) errors.push(`${p} year が整数ではない`);
      if (!UNCERTAINTIES.includes(tp.uncertainty.kind)) errors.push(`${p} uncertainty が不正`);
      if (tp.uncertainty.kind === "plusMinus" && !(tp.uncertainty.years > 0))
        errors.push(`${p} ±年数が正の数ではない`);
    }
    if (e.end && e.end.year < e.start.year) errors.push(`${p} end.year < start.year`);
    const { lat, lng, precision, placeName } = e.location;
    if (!(lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180)) errors.push(`${p} 緯度経度が範囲外`);
    if (!PRECISIONS.includes(precision)) errors.push(`${p} precision が不正`);
    if (!placeName) errors.push(`${p} placeName が空`);
    if (e.sources.length === 0) errors.push(`${p} sources が空`);
    for (const s of e.sources) {
      if (!s.title) errors.push(`${p} 出典名が空`);
      if (s.url !== "" && !/^https:\/\/[^\s]+$/.test(s.url)) errors.push(`${p} 出典URLが https でも空でもない`);
    }
    if (typeof e.verified !== "boolean") errors.push(`${p} verified が boolean ではない`);
    if (![1, 2, 3].includes(e.importance)) errors.push(`${p} importance が不正`);
  }
  for (const e of events) {
    for (const r of e.relatedEventIds ?? []) {
      if (!ids.has(r)) errors.push(`[${e.id}] relatedEventIds の参照先が存在しない: ${r}`);
    }
  }
  return errors;
}
