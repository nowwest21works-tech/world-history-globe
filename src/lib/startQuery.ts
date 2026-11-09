import type { AstroYear, HistoryEvent, Scope } from "@/types/event";
import type { Tour } from "@/types/tour";
import type { HistoryWork } from "@/types/work";
import { TIME_SCALES } from "./timeScale";
import { contemporaryEvents, distanceFromEvent } from "./visibility";
import { parseEventQuery, parseModeQuery } from "./mode";
import { parseTourQuery, type TourPosition } from "./tours";
import { parseWorkQuery } from "./works";
import { fromAstronomical, toAstronomical } from "./year";

/**
 * URL の ?year=N を解釈する（MAHOROBA の年代史・賢人対話室などから、その年の地球儀を開くための入口）。
 *
 * - N は表示上の年号の整数。**正の数は西暦、負の数は紀元前**（-470 は「前470年」、-1 は「前1年」）。
 * - 0（西暦0年は存在しない）・小数・数字以外・空は無効（null）。
 * - そのモードの年代スライダーの範囲（世界：前3000年〜2025年、日本：前30000年〜2025年）の外も無効。
 *   端に合わせることはせず、いつもの初期表示にする。
 * 戻り値は天文学的年号（前1年 = 0、前470年 = -469）。
 */
export function parseYearQuery(search: string, mode: Scope): AstroYear | null {
  const raw = new URLSearchParams(search).get("year");
  if (raw === null) return null;
  const s = raw.trim();
  if (!/^-?[1-9]\d{0,5}$/.test(s)) return null;
  const n = Number(s);
  const year = n > 0 ? toAstronomical("CE", n) : toAstronomical("BCE", -n);
  const scale = TIME_SCALES[mode];
  return year >= scale.min && year <= scale.max ? year : null;
}

/** 天文学的年号 → ?year= の値（1989 → "1989"、前470年（-469）→ "-470"、前1年（0）→ "-1"） */
export function yearParam(year: AstroYear): string {
  const { era, n } = fromAstronomical(year);
  return era === "BCE" ? `-${n}` : String(n);
}

/** URL の検索部分に入れる year=… （buildQuery の rest に渡す） */
export function yearQuery(year: AstroYear): string {
  return `year=${yearParam(year)}`;
}

/** 開いたときに何から始めるか */
export type StartQuery =
  | { kind: "tour"; tour: Tour; position: TourPosition }
  | { kind: "work"; mode: Scope; work: HistoryWork }
  | { kind: "event"; mode: Scope; event: HistoryEvent }
  | { kind: "year"; mode: Scope; year: AstroYear }
  | { kind: "default"; mode: Scope };

/**
 * URL から開き方を決める。複数あれば ツアー → 作品 → イベント → 年 の順に優先する
 * （?event= と ?year= が両方あるときは ?event=）。?mode=japan はツアー以外と組み合わせられる。
 * 見つからない ID・無効な年は無視して、次の候補（最後はいつもの初期表示）に進む。
 */
export function parseStartQuery(
  search: string,
  data: { tours: Tour[]; works: HistoryWork[]; events: ReadonlyMap<string, HistoryEvent> },
): StartQuery {
  const t = parseTourQuery(search, data.tours);
  if (t) return { kind: "tour", tour: t.tour, position: t.position };
  const mode = parseModeQuery(search);
  const work = parseWorkQuery(search, data.works);
  if (work) return { kind: "work", mode, work };
  const id = parseEventQuery(search);
  const event = id ? data.events.get(id) : undefined;
  if (event) return { kind: "event", mode, event };
  const year = parseYearQuery(search, mode);
  if (year !== null) return { kind: "year", mode, year };
  return { kind: "default", mode };
}

/**
 * ?year= で開いたとき、カメラを向ける出来事（詳細は開かない）。
 * 「同時代」の範囲（contemporaryEvents）に入る出来事のうち、その年にいちばん近く、重要度の高いもの。
 */
export function yearFocusEvent(events: HistoryEvent[], year: AstroYear): HistoryEvent | null {
  const near = contemporaryEvents(events, year).events;
  if (!near.length) return null;
  return [...near].sort(
    (a, b) =>
      distanceFromEvent(a, year) - distanceFromEvent(b, year) ||
      b.importance - a.importance ||
      Number(b.featured) - Number(a.featured) ||
      a.start.year - b.start.year,
  )[0]!;
}
