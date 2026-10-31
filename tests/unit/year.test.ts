import { describe, expect, it } from "vitest";
import {
  formatSpan,
  formatTimePoint,
  formatYear,
  fromAstronomical,
  toAstronomical,
  uncertaintyRange,
  yearsBetween,
} from "@/lib/year";
import type { TimePoint } from "@/types/event";

const ex = (year: number): TimePoint => ({ year, uncertainty: { kind: "exact" } });

describe("天文学的年号 ⇔ 表示", () => {
  it("前1年=0、前2年=-1、前3000年=-2999", () => {
    expect(toAstronomical("BCE", 1)).toBe(0);
    expect(toAstronomical("BCE", 2)).toBe(-1);
    expect(toAstronomical("BCE", 3000)).toBe(-2999);
    expect(toAstronomical("CE", 1)).toBe(1);
  });

  it("表示は「前○年／○年」", () => {
    expect(formatYear(0)).toBe("前1年");
    expect(formatYear(-1)).toBe("前2年");
    expect(formatYear(-2999)).toBe("前3000年");
    expect(formatYear(1)).toBe("1年");
    expect(formatYear(2025)).toBe("2025年");
  });

  it("0年は存在しない：表示上の0年は受け付けず、どの内部年も「0年」とは表示されない", () => {
    expect(() => toAstronomical("BCE", 0)).toThrow(RangeError);
    expect(() => toAstronomical("CE", 0)).toThrow(RangeError);
    for (let y = -3000; y <= 2100; y++) {
      expect(formatYear(y)).not.toMatch(/^0年$|^前0年$/);
    }
  });

  it("往復変換が一致する", () => {
    for (let y = -3000; y <= 2100; y++) {
      const { era, n } = fromAstronomical(y);
      expect(toAstronomical(era, n)).toBe(y);
    }
  });

  it("前1年の翌年は1年（差は1年）", () => {
    expect(yearsBetween(toAstronomical("BCE", 1), toAstronomical("CE", 1))).toBe(1);
    expect(formatYear(toAstronomical("BCE", 1) + 1)).toBe("1年");
  });
});

describe("紀元前→紀元後をまたぐ期間", () => {
  it("前27年〜14年 は 40年間", () => {
    const s = ex(toAstronomical("BCE", 27));
    const e = ex(toAstronomical("CE", 14));
    expect(yearsBetween(s.year, e.year)).toBe(40);
    expect(formatSpan(s, e)).toBe("前27年〜14年（40年間）");
  });

  it("前4年〜30年 は 33年間（0年を数えない）", () => {
    expect(yearsBetween(toAstronomical("BCE", 4), toAstronomical("CE", 30))).toBe(33);
  });

  it("前1年〜1年 は 1年間", () => {
    expect(formatSpan(ex(0), ex(1))).toBe("前1年〜1年（1年間）");
  });

  it("紀元前どうしの期間：前334年〜前323年 は 11年間", () => {
    expect(formatSpan(ex(toAstronomical("BCE", 334)), ex(toAstronomical("BCE", 323)))).toBe(
      "前334年〜前323年（11年間）",
    );
  });
});

describe("不確実性・継続期間の表示", () => {
  it("「頃」", () => {
    expect(formatTimePoint({ year: toAstronomical("BCE", 2560), uncertainty: { kind: "circa" } })).toBe(
      "前2560年頃",
    );
  });

  it("「±50年」", () => {
    const p: TimePoint = { year: toAstronomical("BCE", 1750), uncertainty: { kind: "plusMinus", years: 50 } };
    expect(formatTimePoint(p)).toBe("前1750年（±50年）");
    expect(uncertaintyRange(p)).toEqual([toAstronomical("BCE", 1800), toAstronomical("BCE", 1700)]);
  });

  it("「前18世紀頃」（世紀単位）と、その幅", () => {
    const p: TimePoint = { year: toAstronomical("BCE", 1750), uncertainty: { kind: "century" } };
    expect(formatTimePoint(p)).toBe("前18世紀頃");
    expect(uncertaintyRange(p)).toEqual([toAstronomical("BCE", 1800), toAstronomical("BCE", 1701)]);
    const q: TimePoint = { year: 1450, uncertainty: { kind: "century" } };
    expect(formatTimePoint(q)).toBe("15世紀頃");
    expect(uncertaintyRange(q)).toEqual([1401, 1500]);
    expect(formatTimePoint({ year: toAstronomical("BCE", 100), uncertainty: { kind: "century" } })).toBe("前1世紀頃");
    expect(formatTimePoint({ year: 0, uncertainty: { kind: "century" } })).toBe("前1世紀頃");
    expect(formatTimePoint({ year: 1, uncertainty: { kind: "century" } })).toBe("1世紀頃");
  });

  it("不確実な端点を含む期間には「約」がつく", () => {
    const s: TimePoint = { year: toAstronomical("BCE", 2600), uncertainty: { kind: "circa" } };
    const e: TimePoint = { year: toAstronomical("BCE", 1900), uncertainty: { kind: "circa" } };
    expect(formatSpan(s, e)).toBe("前2600年頃〜前1900年頃（約700年間）");
  });

  it("終了がないイベントは開始のみ表示", () => {
    expect(formatSpan(ex(1453))).toBe("1453年");
  });
});
