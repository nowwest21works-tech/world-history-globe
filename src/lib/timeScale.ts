import type { AstroYear, Scope } from "@/types/event";

/**
 * タイムスライダーの非線形スケール（古い時代を圧縮し、近現代を拡大）。
 * 考え方は haakram/WHW（MIT）の time-scale を参考にしたが、実装は独自で、
 * 年は天文学的年号（前1年=0）で扱う。
 *
 * 世界モードと日本モードで範囲と目盛りが違うので、モード別に TimeScale を持つ。
 */
export interface TimeScale {
  min: AstroYear;
  max: AstroYear;
  /** [年, スライダー位置 0..1] の区分線形の折れ点 */
  breakpoints: ReadonlyArray<readonly [AstroYear, number]>;
  /** スライダー目盛り（天文学的年号） */
  ticks: AstroYear[];
  sliderToYear: (t: number) => AstroYear;
  yearToSlider: (year: AstroYear) => number;
  /** 自動再生で1ティックに進む年数 */
  playStep: (year: AstroYear) => number;
  nextYear: (year: AstroYear) => AstroYear;
  clamp: (year: AstroYear) => AstroYear;
}

const clampNum = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function makeScale(
  breakpoints: ReadonlyArray<readonly [AstroYear, number]>,
  ticks: AstroYear[],
  playStep: (year: AstroYear) => number,
): TimeScale {
  const min = breakpoints[0]![0];
  const max = breakpoints[breakpoints.length - 1]![0];
  const sliderToYear = (t: number): AstroYear => {
    const x = clampNum(t, 0, 1);
    for (let i = 1; i < breakpoints.length; i++) {
      const [y0, t0] = breakpoints[i - 1]!;
      const [y1, t1] = breakpoints[i]!;
      if (x <= t1) return Math.round(y0 + ((x - t0) / (t1 - t0)) * (y1 - y0));
    }
    return max;
  };
  const yearToSlider = (year: AstroYear): number => {
    const y = clampNum(year, min, max);
    for (let i = 1; i < breakpoints.length; i++) {
      const [y0, t0] = breakpoints[i - 1]!;
      const [y1, t1] = breakpoints[i]!;
      if (y <= y1) return t0 + ((y - y0) / (y1 - y0)) * (t1 - t0);
    }
    return 1;
  };
  return {
    min,
    max,
    breakpoints,
    ticks,
    sliderToYear,
    yearToSlider,
    playStep,
    nextYear: (year) => Math.min(max, year + playStep(year)),
    clamp: (year) => clampNum(year, min, max),
  };
}

// ───────────── 世界モード：前3000年〜2025年 ─────────────
export const MIN_YEAR: AstroYear = -2999; // 前3000年
export const MAX_YEAR: AstroYear = 2025;

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

/** 自動再生で1ティックに進む年数（古代は粗く、近現代は細かく） */
export function playStep(year: AstroYear): number {
  if (year < -499) return 20;
  if (year < 0) return 10;
  if (year < 1000) return 10;
  if (year < 1500) return 5;
  if (year < 1800) return 2;
  return 1;
}

export const TICKS: AstroYear[] = [-2999, -1999, -999, -499, 0, 500, 1000, 1500, 1800, 1900, 2000];

export const WORLD_SCALE = makeScale(BREAKPOINTS, TICKS, playStep);

export const sliderToYear = WORLD_SCALE.sliderToYear;
export const yearToSlider = WORLD_SCALE.yearToSlider;
export const nextYear = WORLD_SCALE.nextYear;

// ───────────── 日本モード：前3万年頃（旧石器時代）〜2025年 ─────────────
/** 日本モードの始まり。旧石器時代の目安として前3万年とする（日本列島に人が住み始めた時期には諸説ある） */
export const JAPAN_MIN_YEAR: AstroYear = -29999; // 前30000年

/** 先史時代（旧石器・縄文）を強く圧縮し、古代以降を広く取る */
export const JAPAN_BREAKPOINTS: ReadonlyArray<readonly [AstroYear, number]> = [
  [JAPAN_MIN_YEAR, 0],
  [-14999, 0.05], // 前15000年
  [-999, 0.13], // 前1000年
  [0, 0.19], // 前1年
  [600, 0.31],
  [1200, 0.47],
  [1600, 0.65],
  [1868, 0.81],
  [1945, 0.91],
  [MAX_YEAR, 1],
];

export const JAPAN_TICKS: AstroYear[] = [-29999, -9999, 0, 600, 1000, 1200, 1400, 1600, 1800, 1900, 2000];

export function japanPlayStep(year: AstroYear): number {
  if (year < -14999) return 500;
  if (year < -999) return 200;
  return playStep(year);
}

export const JAPAN_SCALE = makeScale(JAPAN_BREAKPOINTS, JAPAN_TICKS, japanPlayStep);

export const TIME_SCALES: Record<Scope, TimeScale> = { world: WORLD_SCALE, japan: JAPAN_SCALE };

/** モードを切り替えたときの年：そのまま引き継ぎ、切り替え先の範囲の外なら端に合わせる */
export function carryYear(year: AstroYear, to: Scope): AstroYear {
  return TIME_SCALES[to].clamp(year);
}
