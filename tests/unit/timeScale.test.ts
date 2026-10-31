import { describe, expect, it } from "vitest";
import { MAX_YEAR, MIN_YEAR, nextYear, sliderToYear, yearToSlider } from "@/lib/timeScale";

describe("タイムスライダーの非線形スケール", () => {
  it("両端", () => {
    expect(sliderToYear(0)).toBe(MIN_YEAR);
    expect(sliderToYear(1)).toBe(MAX_YEAR);
  });

  it("年→位置→年 で元に戻る（丸め誤差の範囲）", () => {
    for (let y = MIN_YEAR; y <= MAX_YEAR; y += 7) {
      expect(Math.abs(sliderToYear(yearToSlider(y)) - y)).toBeLessThanOrEqual(1);
    }
  });

  it("位置が増えれば年も単調に増える", () => {
    let prev = -Infinity;
    for (let t = 0; t <= 1; t += 0.001) {
      const y = sliderToYear(t);
      expect(y).toBeGreaterThanOrEqual(prev);
      prev = y;
    }
  });

  it("自動再生は前1年(0)をまたいでも年が飛ばない・戻らない", () => {
    let y = -15;
    const seen: number[] = [];
    while (y < 20) {
      seen.push(y);
      y = nextYear(y);
    }
    expect(seen.every((v, i) => i === 0 || v > seen[i - 1]!)).toBe(true);
    expect(nextYear(MAX_YEAR)).toBe(MAX_YEAR);
  });
});
