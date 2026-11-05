import type { AstroYear } from "@/types/event";
import { JAPAN_MIN_YEAR, MAX_YEAR } from "./timeScale";

/**
 * 日本モードの時代区分（年代スライダーに薄く添える目盛り・年表の見出し・イベントの era に使う）。
 * 時代区分の境目には諸説あるため、ここでの年はすべて「目安」。historicalNote と同じ扱いで、画面にも「目安」と明記する。
 * - 旧石器／縄文の境（前14000年頃）と縄文／弥生の境（前800年頃。前10世紀とする説もある）は特に幅が大きい。
 * - 古墳時代の始まり（3世紀中頃）、鎌倉時代の始まり（1185年・1192年など）、室町時代の始まり（1333年・1336年・1338年など）も見方が分かれる。
 */
export interface JapanEra {
  name: string;
  /** この区分の始まり（目安。天文学的年号） */
  from: AstroYear;
  /** 次の区分の始まり（目安） */
  to: AstroYear;
}

export const JAPAN_ERAS: JapanEra[] = [
  { name: "旧石器", from: JAPAN_MIN_YEAR, to: -13999 },
  { name: "縄文", from: -13999, to: -799 },
  { name: "弥生", from: -799, to: 250 },
  { name: "古墳", from: 250, to: 592 },
  { name: "飛鳥", from: 592, to: 710 },
  { name: "奈良", from: 710, to: 794 },
  { name: "平安", from: 794, to: 1185 },
  { name: "鎌倉", from: 1185, to: 1333 },
  { name: "室町", from: 1333, to: 1573 },
  { name: "安土桃山", from: 1573, to: 1603 },
  { name: "江戸", from: 1603, to: 1868 },
  { name: "明治", from: 1868, to: 1912 },
  { name: "大正", from: 1912, to: 1926 },
  { name: "昭和", from: 1926, to: 1989 },
  { name: "平成", from: 1989, to: 2019 },
  { name: "令和", from: 2019, to: MAX_YEAR },
];

export const JAPAN_ERA_NAMES = JAPAN_ERAS.map((e) => e.name);

/** その年の時代区分（目安）。範囲より前なら最初、後なら最後の区分 */
export function eraOf(year: AstroYear): JapanEra {
  let found = JAPAN_ERAS[0]!;
  for (const e of JAPAN_ERAS) if (year >= e.from) found = e;
  return found;
}

export const ERA_NOTE = "時代区分の境目には諸説あり、ここでの区切りは目安です。";
