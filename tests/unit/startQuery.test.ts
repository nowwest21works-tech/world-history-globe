import { describe, expect, it } from "vitest";
import { EVENTS, EVENT_BY_ID, EVENTS_BY_MODE } from "@/data/events";
import { TOURS } from "@/data/tours";
import { WORKS } from "@/data/works";
import { parseStartQuery, parseYearQuery, yearFocusEvent, yearParam, yearQuery } from "@/lib/startQuery";
import { buildQuery } from "@/lib/mode";
import { formatYear } from "@/lib/year";
import { SCHOOL_URL } from "@/config/site";
import units from "@/data/units.json";

const DATA = { tours: TOURS, works: WORKS, events: EVENT_BY_ID };

describe("?year= の解釈（parseYearQuery）", () => {
  it("正の数は西暦", () => {
    expect(parseYearQuery("?year=1989", "world")).toBe(1989);
    expect(parseYearQuery("?year=1", "world")).toBe(1);
    expect(parseYearQuery("?year=2025", "world")).toBe(2025);
    expect(formatYear(parseYearQuery("?year=1989", "world")!)).toBe("1989年");
  });

  it("負の数は紀元前（-470 は前470年、-1 は前1年）", () => {
    expect(formatYear(parseYearQuery("?year=-470", "world")!)).toBe("前470年");
    expect(parseYearQuery("?year=-470", "world")).toBe(-469); // 内部は天文学的年号
    expect(parseYearQuery("?year=-1", "world")).toBe(0);
    expect(formatYear(parseYearQuery("?year=-1", "world")!)).toBe("前1年");
    expect(formatYear(parseYearQuery("?year=-3000", "world")!)).toBe("前3000年"); // 世界モードの下端
  });

  it("0 は無効（西暦0年は存在しない）", () => {
    expect(parseYearQuery("?year=0", "world")).toBeNull();
    expect(parseYearQuery("?year=-0", "world")).toBeNull();
    expect(parseYearQuery("?year=00", "world")).toBeNull();
  });

  it("範囲外は無効（端に合わせない）", () => {
    expect(parseYearQuery("?year=2026", "world")).toBeNull();
    expect(parseYearQuery("?year=99999", "world")).toBeNull();
    expect(parseYearQuery("?year=-3001", "world")).toBeNull();
    expect(parseYearQuery("?year=-10000", "world")).toBeNull();
    expect(parseYearQuery("?year=-1000000", "world")).toBeNull();
  });

  it("範囲はモードごと（日本モードは前30000年から）", () => {
    expect(parseYearQuery("?year=-10000", "japan")).toBe(-9999);
    expect(formatYear(parseYearQuery("?year=-30000", "japan")!)).toBe("前30000年");
    expect(parseYearQuery("?year=-30001", "japan")).toBeNull();
    expect(parseYearQuery("?year=1868", "japan")).toBe(1868);
  });

  it("数字以外・小数・空・指数表記などは無効", () => {
    for (const v of ["abc", "", "1989.5", "1e3", "１９８９", "前470", "BC470", "1989年", "+1989", "--5", "0x7c5", "Infinity", "NaN"]) {
      expect(parseYearQuery(`?year=${encodeURIComponent(v)}`, "world"), v).toBeNull();
    }
    expect(parseYearQuery("?year", "world")).toBeNull();
    expect(parseYearQuery("", "world")).toBeNull();
  });

  it("前後の空白は許す", () => {
    expect(parseYearQuery("?year=%201989%20", "world")).toBe(1989);
  });

  it("天文学的年号 → ?year= の値は往復できる", () => {
    for (const y of [-2999, -469, -1, 0, 1, 1868, 1989, 2025]) {
      expect(parseYearQuery(`?${yearQuery(y)}`, "world")).toBe(y);
    }
    expect(yearParam(0)).toBe("-1");
    expect(yearParam(-469)).toBe("-470");
    expect(yearParam(1989)).toBe("1989");
  });
});

describe("開き方の優先順位（parseStartQuery）", () => {
  it("?year= だけなら年で開く（世界）", () => {
    expect(parseStartQuery("?year=1989", DATA)).toEqual({ kind: "year", mode: "world", year: 1989 });
  });

  it("?mode=japan と組み合わせられる（順番は問わない）", () => {
    expect(parseStartQuery("?mode=japan&year=1868", DATA)).toEqual({ kind: "year", mode: "japan", year: 1868 });
    expect(parseStartQuery("?year=1868&mode=japan", DATA)).toEqual({ kind: "year", mode: "japan", year: 1868 });
  });

  it("?event= と ?year= が両方あるときは ?event= を優先する", () => {
    const q = parseStartQuery("?year=1989&event=september-11", DATA);
    expect(q.kind).toBe("event");
    if (q.kind === "event") expect(q.event.id).toBe("september-11");
  });

  it("?event= の ID が存在しなければ、?year= で開く", () => {
    expect(parseStartQuery("?event=no-such-event&year=1989", DATA)).toEqual({ kind: "year", mode: "world", year: 1989 });
  });

  it("作品とツアーは ?year= より優先する（既存の URL を壊さない）", () => {
    const w = WORKS[0]!;
    expect(parseStartQuery(`?work=${w.id}&year=1989`, DATA).kind).toBe("work");
    const t = TOURS[0]!;
    expect(parseStartQuery(`?tour=${t.id}&step=1&year=1989`, DATA).kind).toBe("tour");
  });

  it("無効な年・範囲外の年は無視して、いつもの初期表示にする", () => {
    for (const v of ["0", "abc", "2026", "-3001", "1989.5"]) {
      expect(parseStartQuery(`?year=${v}`, DATA), v).toEqual({ kind: "default", mode: "world" });
    }
    expect(parseStartQuery("?mode=japan&year=-30001", DATA)).toEqual({ kind: "default", mode: "japan" });
  });

  it("前470年のように紀元前でも開ける", () => {
    expect(parseStartQuery("?year=-470", DATA)).toEqual({ kind: "year", mode: "world", year: -469 });
  });

  it("書き戻す URL は ?year=（日本なら ?mode=japan&year=）", () => {
    expect(buildQuery("world", yearQuery(1989))).toBe("?year=1989");
    expect(buildQuery("japan", yearQuery(1868))).toBe("?mode=japan&year=1868");
    expect(buildQuery("world", yearQuery(-469))).toBe("?year=-470");
  });
});

describe("?year= で開いたときにカメラを向ける出来事（yearFocusEvent）", () => {
  it("その年の「同時代」に入る出来事から、いちばん近いものを選ぶ", () => {
    const e = yearFocusEvent(EVENTS_BY_MODE.world, 1989)!;
    expect(["berlin-wall", "tiananmen"]).toContain(e.id);
  });

  it("スライダーのどの年でも、向ける出来事が見つかる（世界・日本）", () => {
    for (const y of [-2999, -469, 0, 1000, 1868, 1979, 2000, 2025]) {
      expect(yearFocusEvent(EVENTS_BY_MODE.world, y), String(y)).not.toBeNull();
    }
    for (const y of [-29999, -9999, 794, 1868, 1989]) {
      expect(yearFocusEvent(EVENTS_BY_MODE.japan, y), String(y)).not.toBeNull();
    }
  });
});

describe("マホロバ学校との接続", () => {
  it("戻り先はマホロバ学校の「地球儀の教室」", () => {
    expect(SCHOOL_URL).toBe("https://www.mahoroba-office.co.jp/b05#school-globe");
  });

  it("年代史の22年（1979〜2000年）に、世界の出来事が1年ごとに見える（基本の幅±10年で2件以上）", () => {
    const inRange = EVENTS.filter((e) => (e.end?.year ?? e.start.year) >= 1979 && e.start.year <= 2000);
    expect(inRange.length).toBeGreaterThanOrEqual(15);
  });

  it("1979〜2000年の補充分（8件）は単元に割り当て済みで、verified=false", () => {
    const added = ["iran-revolution", "soviet-afghan-war", "chernobyl", "tiananmen", "gulf-war", "rwanda-genocide", "hong-kong-handover", "asian-financial-crisis"];
    const assigned = new Set(units.units.flatMap((u) => u.eventIds));
    for (const id of added) {
      const e = EVENT_BY_ID.get(id);
      expect(e, id).toBeDefined();
      expect(e!.verified, id).toBe(false);
      expect(assigned.has(id), id).toBe(true);
      expect(e!.sources.length, id).toBeGreaterThan(0);
    }
  });
});
