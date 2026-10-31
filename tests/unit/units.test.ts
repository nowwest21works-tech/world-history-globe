import { describe, expect, it } from "vitest";
import { EVENTS } from "@/data/events";
import units from "@/data/units.json";

describe("単元カバー表（src/data/units.json）", () => {
  it("すべてのイベントが、ちょうど1つの単元に割り当てられている", () => {
    const assigned = units.units.flatMap((u) => u.eventIds);
    expect(new Set(assigned).size).toBe(assigned.length); // 重複なし
    const ids = EVENTS.map((e) => e.id).sort();
    expect([...assigned].sort()).toEqual(ids); // 漏れも余りもない
  });

  it("中項目は世界史探究の16単元（A1〜E4）", () => {
    expect(units.units.map((u) => u.code)).toEqual([
      "A1", "A2", "B1", "B2", "B3", "C1", "C2", "C3", "D1", "D2", "D3", "D4", "E1", "E2", "E3", "E4",
    ]);
  });

  it("追加の計画は1回20件以内", () => {
    const count = new Map<string, number>();
    for (const u of units.units) for (const c of u.candidates) count.set(c.batch, (count.get(c.batch) ?? 0) + 1);
    for (const [batch, n] of count) if (batch !== "予備") expect(n, batch).toBeLessThanOrEqual(20);
  });
});
