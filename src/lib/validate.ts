import type { HistoryEvent } from "@/types/event";
import { JAPAN_ERA_NAMES } from "./japanEras";
import type { HistoryWork } from "@/types/work";
import { FIDELITY_ORDER, MEDIA_ORDER, RATING_ALLOWLIST } from "./works";

const CATEGORIES = ["politics", "war", "religion", "culture", "economy", "exchange"];
const PRECISIONS = ["exact", "city", "region"];
const UNCERTAINTIES = ["exact", "circa", "plusMinus", "century"];

/**
 * events.json（または events-japan.json）の整合性チェック。問題の一覧を返す（空なら OK）。
 * knownIds を渡すと、relatedEventIds の参照先をその集合で確かめる（世界と日本をまたぐ参照のため）。
 */
export function validateEvents(events: HistoryEvent[], knownIds?: Set<string>): string[] {
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
    if (e.scopes !== undefined) {
      if (!Array.isArray(e.scopes) || e.scopes.length === 0) errors.push(`${p} scopes が空`);
      else {
        for (const sc of e.scopes) if (sc !== "world" && sc !== "japan") errors.push(`${p} scopes が不正: ${sc}`);
        if (new Set(e.scopes).size !== e.scopes.length) errors.push(`${p} scopes が重複`);
      }
    }
    if (e.era !== undefined && !JAPAN_ERA_NAMES.includes(e.era)) errors.push(`${p} era が時代区分の一覧にない: ${e.era}`);
  }
  const known = knownIds ?? ids;
  for (const e of events) {
    for (const r of e.relatedEventIds ?? []) {
      if (!known.has(r)) errors.push(`[${e.id}] relatedEventIds の参照先が存在しない: ${r}`);
    }
  }
  return errors;
}

/** 地球儀に出してよい日本側のイベントは importance 3 の数件まで（世界史の画面が混み合わないように） */
export const MAX_JAPAN_ON_GLOBE = 6;

/**
 * 世界（events.json）と日本（events-japan.json）を合わせた整合性チェック。
 * - それぞれの単体チェック（relatedEventIds は両方をまたいで参照してよい）
 * - ID は世界・日本を通して一意。日本側の新しい ID は jp- で始める（世界側は jp- を使わない）
 * - 日本側のイベントは必ず "japan" を含み、世界側のイベントは必ず "world" を含む
 * - 日本側から地球儀にも出すもの（scopes に "world"）は importance 3 で、MAX_JAPAN_ON_GLOBE 件まで
 * - 日本の地図に出るイベントには era（時代区分）を付ける
 */
export function validateAllEvents(world: HistoryEvent[], japan: HistoryEvent[]): string[] {
  const all = [...world, ...japan];
  const known = new Set(all.map((e) => e.id));
  const errors = [...validateEvents(world, known), ...validateEvents(japan, known)];
  const seen = new Set<string>();
  for (const e of all) {
    if (seen.has(e.id)) errors.push(`[${e.id}] id が世界と日本で重複`);
    seen.add(e.id);
  }
  for (const e of japan) {
    if (!e.id.startsWith("jp-")) errors.push(`[${e.id}] 日本側の id が jp- で始まらない`);
    if (e.scopes && !e.scopes.includes("japan")) errors.push(`[${e.id}] 日本側のイベントの scopes に japan がない`);
    if (e.scopes?.[0] !== undefined && e.scopes[0] !== "japan") errors.push(`[${e.id}] 日本側のイベントの scopes の先頭が japan ではない`);
  }
  for (const e of world) {
    if (e.id.startsWith("jp-")) errors.push(`[${e.id}] 世界側の id が jp- で始まっている`);
    if (e.scopes && !e.scopes.includes("world")) errors.push(`[${e.id}] 世界側のイベントの scopes に world がない`);
    if (e.scopes?.[0] !== undefined && e.scopes[0] !== "world") errors.push(`[${e.id}] 世界側のイベントの scopes の先頭が world ではない`);
  }
  const onGlobe = japan.filter((e) => e.scopes?.includes("world"));
  for (const e of onGlobe) if (e.importance !== 3) errors.push(`[${e.id}] 地球儀にも出す日本のイベントが importance 3 ではない`);
  if (onGlobe.length > MAX_JAPAN_ON_GLOBE) errors.push(`地球儀にも出す日本のイベントが ${onGlobe.length} 件（上限 ${MAX_JAPAN_ON_GLOBE}）`);
  for (const e of all) {
    const onJapan = (e.scopes ?? []).includes("japan") || japan.includes(e);
    if (onJapan && !e.era) errors.push(`[${e.id}] 日本の地図に出るイベントに era がない`);
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
