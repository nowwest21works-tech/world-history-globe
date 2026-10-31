import type { AstroYear } from "@/types/event";

/**
 * タイムスライダーの非線形スケール（古代を圧縮し、近現代を拡大）。
 * 考え方は haakram/WHW（MIT）の time-scale を参考にしたが、実装は独自で、
 * 年は天文学的年号（前1年=0）で扱う。
 */
export const MIN_YEAR: AstroYear = -2999; // 前3000年
export const MAX_YEAR: AstroYear = 2025;

/** [年, スライダー位置 0..1] の区分線形の折れ点 */
export const BREAKPOINTS: ReadonlyArray<readonly [AstroYear, number]> = [
  [MIN_YEAR, 0],
  [-499, 0.25], // 前500年
  [0, 0.36], // 前1年
  [1000, 0.52],
  [1500, 0.65],
  [1800, 0.78],
  [1900, 0.88],
  [MAX_YEAR, 1],
];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function sliderToYear(t: number): AstroYear {
  const x = clamp(t, 0, 1);
  for (let i = 1; i < BREAKPOINTS.length; i++) {
    const [y0, t0] = BREAKPOINTS[i - 1]!;
    const [y1, t1] = BREAKPOINTS[i]!;
    if (x <= t1) return Math.round(y0 + ((x - t0) / (t1 - t0)) * (y1 - y0));
  }
  return MAX_YEAR;
}

export function yearToSlider(year: AstroYear): number {
  const y = clamp(year, MIN_YEAR, MAX_YEAR);
  for (let i = 1; i < BREAKPOINTS.length; i++) {
    const [y0, t0] = BREAKPOINTS[i - 1]!;
    const [y1, t1] = BREAKPOINTS[i]!;
    if (y <= y1) return t0 + ((y - y0) / (y1 - y0)) * (t1 - t0);
  }
  return 1;
}

/** 自動再生で1ティックに進む年数（古代は粗く、近現代は細かく） */
export function playStep(year: AstroYear): number {
  if (year < -499) return 20;
  if (year < 0) return 10;
  if (year < 1000) return 10;
  if (year < 1500) return 5;
  if (year < 1800) return 2;
  return 1;
}

export function nextYear(year: AstroYear): AstroYear {
  return Math.min(MAX_YEAR, year + playStep(year));
}

/** スライダー目盛り（天文学的年号） */
export const TICKS: AstroYear[] = [-2999, -1999, -999, -499, 0, 500, 1000, 1500, 1800, 1900, 2000];
