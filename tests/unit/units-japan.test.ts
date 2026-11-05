import { describe, expect, it } from "vitest";
import { EVENTS_BY_MODE } from "@/data/events";
import units from "@/data/units-japan.json";

describe("日本史の単元カバー表（src/data/units-japan.json）", () => {
  it("中項目は日本史探究の13単元（A1〜A3・B1〜B3・C1〜C3・D1〜D4）", () => {
    expect(units.units.map((u) => u.code)).toEqual([
      "A1", "A2", "A3", "B1", "B2", "B3", "C1", "C2", "C3", "D1", "D2", "D3", "D4",
    ]);
    expect(units.majors.map((m) => m.code)).toEqual(["A", "B", "C", "D"]);
  });

  it("日本の地図に出るすべてのイベントが、ちょうど1つの単元に割り当てられている", () => {
    const assigned = units.units.flatMap((u) => u.eventIds);
    expect(new Set(assigned).size).toBe(assigned.length);
    expect([...assigned].sort()).toEqual(EVENTS_BY_MODE.japan.map((e) => e.id).sort());
  });

  it("件数の目安は (3) と D(3) だけに置き、(1)(2)・D(4) は目安なし", () => {
    for (const u of units.units) {
      const counted = u.code.endsWith("3");
      expect(u.min > 0, u.code).toBe(counted);
      if (!counted) expect(u.eventIds, u.code).toEqual([]);
    }
  });

  it("最低件数の合計は 120〜150件（指示書 4.4 の想定）", () => {
    const total = units.units.reduce((s, u) => s + u.min, 0);
    expect(total).toBeGreaterThanOrEqual(120);
    expect(total).toBeLessThanOrEqual(150);
  });

  it("追加の計画は1回20件以内", () => {
    const count = new Map<string, number>();
    for (const u of units.units) for (const c of u.candidates) count.set(c.batch, (count.get(c.batch) ?? 0) + 1);
    for (const [batch, n] of count) if (batch !== "予備") expect(n, batch).toBeLessThanOrEqual(20);
  });

  it("単元の説明は空でなく、学習指導要領の文章をそのまま写していない（「次の事項を身に付ける」などの定型句を含まない）", () => {
    for (const u of units.units) {
      expect(u.summary.length, u.code).toBeGreaterThan(20);
      expect(u.summary.includes("身に付けることができるよう指導する"), u.code).toBe(false);
    }
  });
});
