import { describe, expect, it } from "vitest";
import { EVENTS } from "@/data/events";
import { validateEvents } from "@/lib/validate";
import { CATEGORIES } from "@/lib/categories";
import { contemporaryEvents } from "@/lib/visibility";
import { MAX_YEAR, MIN_YEAR } from "@/lib/timeScale";

describe("events.json", () => {
  it("整合性チェックに合格する", () => {
    expect(validateEvents(EVENTS)).toEqual([]);
  });

  it("件数は 30〜60 件", () => {
    expect(EVENTS.length).toBeGreaterThanOrEqual(30);
    expect(EVENTS.length).toBeLessThanOrEqual(60);
  });

  it("verified はすべて false（人間による確認前）", () => {
    expect(EVENTS.filter((e) => e.verified !== false).map((e) => e.id)).toEqual([]);
  });

  it("分類「religion」の表示名は「宗教・思想」", () => {
    expect(CATEGORIES.religion.label).toBe("宗教・思想");
    expect(EVENTS.find((e) => e.id === "confucius")?.category).toBe("religion");
  });

  it("6分類すべてが使われている", () => {
    expect(new Set(EVENTS.map((e) => e.category)).size).toBe(6);
  });

  it("前3000年〜前500年に10件以上", () => {
    expect(EVENTS.filter((e) => e.start.year <= -499).length).toBeGreaterThanOrEqual(10);
  });

  it("出典URLは空か ja.wikipedia.org のみ（確認済みのものだけ載せる運用）", () => {
    for (const e of EVENTS) for (const s of e.sources) {
      expect(s.url === "" || s.url.startsWith("https://ja.wikipedia.org/wiki/")).toBe(true);
    }
  });

  it("将来拡張フィールド（question / relatedEventIds）はMVPでは空", () => {
    for (const e of EVENTS) {
      expect(e.question ?? "").toBe("");
      expect(e.relatedEventIds ?? []).toEqual([]);
    }
  });

  it("スライダーのどの年でも「同時代」に2件以上並ぶ", () => {
    for (let y = MIN_YEAR; y <= MAX_YEAR; y++) {
      expect(contemporaryEvents(EVENTS, y).events.length).toBeGreaterThanOrEqual(2);
    }
  });
});
