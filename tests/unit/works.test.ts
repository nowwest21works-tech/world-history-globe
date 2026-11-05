import { describe, expect, it } from "vitest";
import { ALL_EVENTS as EVENTS } from "@/data/events";
import { WORKS, worksByEventId } from "@/data/works";
import { validateWorks } from "@/lib/validate";
import {
  FIDELITY_LABEL,
  MEDIA_LABEL,
  filterWorks,
  formatEra,
  normalizeForSearch,
  parseWorkQuery,
  workQuery,
} from "@/lib/works";
import type { HistoryWork } from "@/types/work";

const eventIds = new Set(EVENTS.map((e) => e.id));

describe("works.json", () => {
  it("検証に合格する", () => {
    expect(validateWorks(WORKS, EVENTS)).toEqual([]);
  });

  it("件数は30〜200", () => {
    expect(WORKS.length).toBeGreaterThanOrEqual(30);
    expect(WORKS.length).toBeLessThanOrEqual(200);
  });

  it("verified はすべて false", () => {
    expect(WORKS.filter((w) => w.verified !== false).map((w) => w.id)).toEqual([]);
  });

  it("全作品の eventIds が実在する", () => {
    for (const w of WORKS) for (const id of w.eventIds) expect(eventIds.has(id), `${w.id} → ${id}`).toBe(true);
  });

  it("worksByEventId('qin-unification') に kingdom-hara が含まれる", () => {
    expect(worksByEventId("qin-unification").map((w) => w.id)).toContain("kingdom-hara");
    expect(worksByEventId("no-such-event")).toEqual([]);
  });

  it("fidelity 3種がすべて使われている", () => {
    expect(new Set(WORKS.map((w) => w.fidelity))).toEqual(new Set(Object.keys(FIDELITY_LABEL)));
  });

  it("WORKS は描く時代（era.from）の古い順", () => {
    const froms = WORKS.map((w) => w.era.from);
    expect(froms).toEqual([...froms].sort((a, b) => a - b));
  });

  it("出典はウィキペディア日本語版の URL のみで、全作品に1件以上ある", () => {
    for (const w of WORKS) {
      expect(w.sources.length, w.id).toBeGreaterThan(0);
      for (const s of w.sources) expect(s.url.startsWith("https://ja.wikipedia.org/wiki/"), `${w.id}: ${s.url}`).toBe(true);
    }
  });

  it("画像のフィールドを持たない", () => {
    for (const w of WORKS) expect(Object.keys(w).some((k) => /image|cover|thumbnail|poster/i.test(k)), w.id).toBe(false);
  });
});

describe("validateWorks の検出", () => {
  const base = WORKS.find((w) => w.id === "kingdom-hara")!;
  const make = (patch: Record<string, unknown>) => ({ ...base, ...patch }) as HistoryWork;

  it.each([
    ["id が kebab-case でない", { id: "Kingdom_Hara" }, "kebab-case"],
    ["gapQuestion が空", { gapQuestion: " " }, "gapQuestion が空"],
    ["媒体が既定外", { media: ["comic"] }, "media が不正"],
    ["媒体が空", { media: [] }, "media が空"],
    ["fidelity が既定外", { fidelity: "fantasy" }, "fidelity が不正"],
    ["era が逆転", { era: { from: -200, to: -250 } }, "era.to < era.from"],
    ["初出年が範囲外", { firstReleased: 1850 }, "firstReleased"],
    ["存在しないイベント", { eventIds: ["nope"] }, "参照先が存在しない"],
    ["イベントが重複", { eventIds: ["qin-unification", "qin-unification"] }, "eventIds が重複"],
    ["時代が離れすぎ", { era: { from: 1000, to: 1100 } }, "年ずれている"],
    ["officialUrl が http", { officialUrl: "http://example.com/" }, "officialUrl"],
    ["出典がウィキペディア以外", { sources: [{ title: "x", url: "https://example.com/" }] }, "ja.wikipedia.org"],
    ["年齢区分が許可リスト外", { rating: "15歳以上" }, "rating"],
    ["画像らしきフィールド", { coverImage: "a.jpg" }, "画像らしき"],
  ])("%s", (_name, patch, msg) => {
    const errors = validateWorks([make(patch)], EVENTS);
    expect(errors.some((e) => e.includes(msg)), errors.join("\n")).toBe(true);
  });

  it("id の重複", () => {
    expect(validateWorks([base, base], EVENTS).some((e) => e.includes("id が重複"))).toBe(true);
  });

  it("時代のずれは端どうし50年までは許す", () => {
    // qin-unification は前221年（天文学的年号 -220）。作品の終わりがその50年前ならOK、51年前ならNG
    expect(validateWorks([make({ era: { from: -300, to: -270 } })], EVENTS)).toEqual([]);
    expect(validateWorks([make({ era: { from: -300, to: -271 } })], EVENTS).length).toBe(1);
  });
});

describe("表示と検索", () => {
  it("媒体ラベル", () => {
    expect(MEDIA_LABEL).toEqual({ manga: "漫画", anime: "アニメ", film: "映画", drama: "ドラマ", novel: "小説", stage: "舞台", game: "ゲーム" });
    expect(FIDELITY_LABEL).toEqual({ historical: "史実ベース", "historical-fiction": "史実の枠に創作", inspired: "時代を借りた創作" });
  });

  it("描く時代は formatYear で表示する", () => {
    expect(formatEra({ from: -258, to: -220 })).toBe("前259年〜前221年");
    expect(formatEra({ from: 1945, to: 1945 })).toBe("1945年");
  });

  it("ひらがな・カタカナ・全角の違いを吸収する", () => {
    expect(normalizeForSearch("ベルサイユ")).toBe(normalizeForSearch("べるさいゆ"));
    expect(normalizeForSearch("ＫＩＮＧ")).toBe("king");
  });

  it("「ベルサイユ」で1件に絞られる", () => {
    expect(filterWorks(WORKS, "ベルサイユ", new Set()).map((w) => w.id)).toEqual(["rose-of-versailles"]);
    expect(filterWorks(WORKS, "べるさいゆ", new Set()).map((w) => w.id)).toEqual(["rose-of-versailles"]);
  });

  it("作者名でも探せる", () => {
    expect(filterWorks(WORKS, "原泰久", new Set()).map((w) => w.id)).toEqual(["kingdom-hara"]);
  });

  it("媒体の絞り込み（複数選択はいずれかを含む）", () => {
    const stage = filterWorks(WORKS, "", new Set(["stage"]));
    expect(stage.length).toBeGreaterThan(0);
    expect(stage.every((w) => w.media.includes("stage"))).toBe(true);
    const both = filterWorks(WORKS, "", new Set(["stage", "drama"]));
    expect(both.length).toBeGreaterThan(stage.length);
    expect(filterWorks(WORKS, "", new Set())).toHaveLength(WORKS.length);
  });

  it("URL ?work=<id> の解釈と生成", () => {
    const w = parseWorkQuery("?work=rose-of-versailles", WORKS)!;
    expect(w.id).toBe("rose-of-versailles");
    expect(workQuery(w)).toBe("?work=rose-of-versailles");
    expect(parseWorkQuery("?work=nope", WORKS)).toBeNull();
    expect(parseWorkQuery("", WORKS)).toBeNull();
  });
});
