import { describe, expect, it } from "vitest";
import { EVENTS } from "@/data/events";
import { approxDistanceDeg, groupNearby } from "@/lib/markerGroups";

const ev = (id: string) => EVENTS.find((e) => e.id === id)!;
const ids = (groups: ReturnType<typeof groupNearby>) => groups.map((g) => g.map((e) => e.id).sort());

describe("ほぼ同じ地点のマーカーをまとめる", () => {
  it("1989年に同時に表示される「冷戦」と「ベルリンの壁崩壊」は1つにまとまる", () => {
    expect(ids(groupNearby([ev("cold-war"), ev("berlin-wall")]))).toEqual([["berlin-wall", "cold-war"]]);
  });

  it("同じ地点（ヴェルサイユ宮殿・バグダード）のイベントもまとまる", () => {
    const g = ids(groupNearby([ev("german-empire"), ev("versailles-treaty"), ev("abbasid-baghdad"), ev("baghdad-paper")]));
    expect(g).toHaveLength(2);
  });

  it("ズームすれば見分けられる距離（例：西周と秦、約0.13度より遠い0.3度以上）はまとめない", () => {
    expect(approxDistanceDeg(ev("uruk-cuneiform").location, ev("sumerian-city-states").location)).toBeGreaterThan(0.3);
    expect(groupNearby([ev("uruk-cuneiform"), ev("sumerian-city-states")])).toHaveLength(2);
  });

  it("A–B、B–C が近ければ A・B・C をまとめる（ローマの3件）", () => {
    const g = groupNearby([ev("roman-republic"), ev("roman-principate"), ev("charlemagne-coronation")]);
    expect(g).toHaveLength(1);
    expect(g[0]).toHaveLength(3);
  });

  it("グループ内は重要度の高い順に並ぶ", () => {
    const [g] = groupNearby([ev("cold-war"), ev("berlin-wall")]);
    expect(g![0]!.importance).toBeGreaterThanOrEqual(g![1]!.importance);
  });

  it("経度180度をまたいでも距離を正しく測る", () => {
    expect(approxDistanceDeg({ lat: 0, lng: 179.9 }, { lat: 0, lng: -179.9 })).toBeCloseTo(0.2, 5);
  });
});
