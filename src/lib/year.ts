import type { AstroYear, TimePoint } from "@/types/event";

/**
 * 天文学的年号 ⇔ 表示用年号 の変換。
 * 西暦には0年が存在しない（前1年の翌年が1年）。内部では前1年=0とすることで、
 * 期間計算を単純な引き算で正しく行えるようにしている。
 */

export type Era = "BCE" | "CE";

/** 表示上の年号（紀元前/紀元後 + 1以上の整数）→ 天文学的年号 */
export function toAstronomical(era: Era, n: number): AstroYear {
  if (!Number.isInteger(n) || n < 1) {
    throw new RangeError(`年は1以上の整数で指定してください（0年は存在しません）: ${n}`);
  }
  return era === "BCE" ? 1 - n : n;
}

/** 天文学的年号 → 表示上の年号 */
export function fromAstronomical(year: AstroYear): { era: Era; n: number } {
  if (!Number.isInteger(year)) throw new RangeError(`年は整数で指定してください: ${year}`);
  return year <= 0 ? { era: "BCE", n: 1 - year } : { era: "CE", n: year };
}

/** 0 → "前1年", -2999 → "前3000年", 1 → "1年" */
export function formatYear(year: AstroYear): string {
  const { era, n } = fromAstronomical(year);
  return era === "BCE" ? `前${n}年` : `${n}年`;
}

/** year を含む世紀（前18世紀 → { era: "BCE", c: 18 }） */
export function centuryOf(year: AstroYear): { era: Era; c: number } {
  const { era, n } = fromAstronomical(year);
  return { era, c: Math.ceil(n / 100) };
}

/** 世紀の表示："前18世紀" / "15世紀" */
export function formatCentury(year: AstroYear): string {
  const { era, c } = centuryOf(year);
  return era === "BCE" ? `前${c}世紀` : `${c}世紀`;
}

/** 不確実性つきの年代表示："前2560年頃" / "前1750年（±50年）" / "前18世紀頃" / "1453年" */
export function formatTimePoint(p: TimePoint): string {
  if (p.uncertainty.kind === "century") return `${formatCentury(p.year)}頃`;
  const base = formatYear(p.year);
  switch (p.uncertainty.kind) {
    case "circa":
      return `${base}頃`;
    case "plusMinus":
      return `${base}（±${p.uncertainty.years}年）`;
    default:
      return base;
  }
}

/** a から b までの経過年数（天文学的年号なので単純な差）。 */
export function yearsBetween(a: AstroYear, b: AstroYear): number {
  return b - a;
}

/** 継続期間の表示："前27年〜14年（約40年間）"。終了がなければ開始のみ。 */
export function formatSpan(start: TimePoint, end?: TimePoint): string {
  if (!end || end.year === start.year) return formatTimePoint(start);
  const years = yearsBetween(start.year, end.year);
  const approx =
    start.uncertainty.kind !== "exact" || end.uncertainty.kind !== "exact" ? "約" : "";
  return `${formatTimePoint(start)}〜${formatTimePoint(end)}（${approx}${years}年間）`;
}

/** 不確実性を含めた年代の取りうる幅 [最早, 最遅]。「頃」は幅を持たせず点として扱う。 */
export function uncertaintyRange(p: TimePoint): [AstroYear, AstroYear] {
  if (p.uncertainty.kind === "plusMinus") {
    return [p.year - p.uncertainty.years, p.year + p.uncertainty.years];
  }
  if (p.uncertainty.kind === "century") {
    // 前18世紀 = 前1800年〜前1701年、15世紀 = 1401年〜1500年
    const { era, c } = centuryOf(p.year);
    return era === "BCE"
      ? [toAstronomical("BCE", c * 100), toAstronomical("BCE", (c - 1) * 100 + 1)]
      : [toAstronomical("CE", (c - 1) * 100 + 1), toAstronomical("CE", c * 100)];
  }
  return [p.year, p.year];
}
