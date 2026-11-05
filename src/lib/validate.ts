import type { HistoryEvent } from "@/types/event";
import type { HistoryWork } from "@/types/work";
import { FIDELITY_ORDER, MEDIA_ORDER, RATING_ALLOWLIST } from "./works";

const CATEGORIES = ["politics", "war", "religion", "culture", "economy", "exchange"];
const PRECISIONS = ["exact", "city", "region"];
const UNCERTAINTIES = ["exact", "circa", "plusMinus", "century"];

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

/** 作品とイベントの時代が「ずれている」とみなす差（年）。重なるか、端どうしの差がこれ以内なら OK */
export const WORK_ERA_TOLERANCE = 50;
/** 画像を思わせるキー。作品データには画像を一切持たせない */
const IMAGE_KEY = /image|img|cover|thumbnail|thumb|poster|photo|picture|still|visual|icon|logo/i;
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const WIKI_JA = "https://ja.wikipedia.org/wiki/";

/** works.json の整合性チェック。問題の一覧を返す（空なら OK）。 */
export function validateWorks(works: HistoryWork[], events: HistoryEvent[], thisYear = new Date().getFullYear()): string[] {
  const errors: string[] = [];
  const byId = new Map(events.map((e) => [e.id, e]));
  const ids = new Set<string>();
  for (const w of works) {
    const p = `[${w.id}]`;
    if (!KEBAB.test(w.id)) errors.push(`${p} id が kebab-case ではない`);
    if (ids.has(w.id)) errors.push(`${p} id が重複`);
    ids.add(w.id);
    for (const k of ["title", "creators", "setting", "hook", "gapQuestion", "eraNote"] as const) {
      if (typeof w[k] !== "string" || w[k].trim() === "") errors.push(`${p} ${k} が空`);
    }
    for (const k of ["adaptations", "contentNote", "rating", "officialUrl"] as const) {
      if (typeof w[k] !== "string") errors.push(`${p} ${k} が文字列ではない`);
    }
    if (!Array.isArray(w.media) || w.media.length === 0) errors.push(`${p} media が空`);
    else {
      for (const m of w.media) if (!MEDIA_ORDER.includes(m)) errors.push(`${p} media が不正: ${m}`);
      if (new Set(w.media).size !== w.media.length) errors.push(`${p} media が重複`);
    }
    if (!FIDELITY_ORDER.includes(w.fidelity)) errors.push(`${p} fidelity が不正: ${w.fidelity}`);
    const { from, to } = w.era ?? {};
    if (!Number.isInteger(from) || !Number.isInteger(to)) errors.push(`${p} era が整数ではない`);
    else if (to < from) errors.push(`${p} era.to < era.from`);
    if (!Number.isInteger(w.firstReleased) || w.firstReleased < 1900 || w.firstReleased > thisYear)
      errors.push(`${p} firstReleased が 1900〜${thisYear} の整数ではない: ${w.firstReleased}`);
    if (!Array.isArray(w.eventIds) || w.eventIds.length === 0) errors.push(`${p} eventIds が空`);
    else {
      if (new Set(w.eventIds).size !== w.eventIds.length) errors.push(`${p} eventIds が重複`);
      for (const id of w.eventIds) {
        const e = byId.get(id);
        if (!e) {
          errors.push(`${p} eventIds の参照先が存在しない: ${id}`);
          continue;
        }
        if (Number.isInteger(from) && Number.isInteger(to)) {
          const s = e.start.year;
          const end = e.end?.year ?? s;
          const gap = Math.max(0, from - end, s - to);
          if (gap > WORK_ERA_TOLERANCE) errors.push(`${p} ${id} と時代が ${gap} 年ずれている`);
        }
      }
    }
    if (w.officialUrl !== "" && !/^https:\/\/[^\s]+$/.test(w.officialUrl)) errors.push(`${p} officialUrl が https でも空でもない`);
    if (!(RATING_ALLOWLIST as readonly string[]).includes(w.rating) && w.rating !== "")
      errors.push(`${p} rating が許可リストにない: ${w.rating}`);
    if (!Array.isArray(w.sources)) errors.push(`${p} sources が配列ではない`);
    else
      for (const s of w.sources) {
        if (!s.title) errors.push(`${p} 出典名が空`);
        if (s.url !== "" && !(s.url.startsWith(WIKI_JA) && /^\S+$/.test(s.url)))
          errors.push(`${p} 出典URLが ja.wikipedia.org でも空でもない: ${s.url}`);
      }
    if (typeof w.verified !== "boolean") errors.push(`${p} verified が boolean ではない`);
    const imageKeys = Object.keys(w).filter((k) => IMAGE_KEY.test(k));
    if (imageKeys.length) errors.push(`${p} 画像らしきフィールドがある: ${imageKeys.join(", ")}`);
  }
  return errors;
}
