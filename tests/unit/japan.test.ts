import { describe, expect, it } from "vitest";
import {
  ALL_EVENTS,
  EVENTS,
  EVENTS_BY_MODE,
  EVENT_BY_ID,
  JAPAN_EVENTS,
  OTHER_ONLY_BY_MODE,
  homeMode,
  inScope,
  isShared,
  scopesOf,
} from "@/data/events";
import { MAX_JAPAN_ON_GLOBE, validateAllEvents } from "@/lib/validate";
import { crossLinks } from "@/lib/crossLinks";
import { contemporaryEvents, otherContemporary } from "@/lib/visibility";
import { JAPAN_SCALE, JAPAN_MIN_YEAR, MAX_YEAR, MIN_YEAR, WORLD_SCALE, carryYear } from "@/lib/timeScale";
import { JAPAN_ERAS, JAPAN_ERA_NAMES, eraOf } from "@/lib/japanEras";
import { buildQuery, parseEventQuery, parseModeQuery } from "@/lib/mode";
import { WORKS } from "@/data/works";

const SHARED = ["heian-kyo", "paper-east-asia", "edo-sakoku", "meiji-restoration", "russo-japanese-war", "atomic-bombings"];

describe("日本史のイベント（events-japan.json）と世界史との共有", () => {
  it("世界・日本を合わせた整合性チェックに合格する", () => {
    expect(validateAllEvents(EVENTS, JAPAN_EVENTS)).toEqual([]);
  });

  it("ID は世界・日本を通して一意で、日本側の ID は jp- で始まる", () => {
    const ids = ALL_EVENTS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(JAPAN_EVENTS.every((e) => e.id.startsWith("jp-"))).toBe(true);
    expect(EVENTS.some((e) => e.id.startsWith("jp-"))).toBe(false);
  });

  it("relatedEventIds は世界・日本のどちらかに存在するイベントを指す（両データをまたぐ参照がある）", () => {
    const ids = new Set(ALL_EVENTS.map((e) => e.id));
    for (const e of ALL_EVENTS) for (const r of e.relatedEventIds ?? []) expect(ids.has(r), `${e.id} → ${r}`).toBe(true);
    const crossing = ALL_EVENTS.filter((e) =>
      (e.relatedEventIds ?? []).some((r) => homeMode(EVENT_BY_ID.get(r)!) !== homeMode(e)),
    );
    expect(crossing.length).toBeGreaterThanOrEqual(15);
  });

  it("validateAllEvents は、ID の重複・jp- 以外の日本の ID・存在しない参照を検出する", () => {
    const jp = JAPAN_EVENTS[0]!;
    expect(validateAllEvents(EVENTS, [...JAPAN_EVENTS, jp]).some((x) => x.includes("重複"))).toBe(true);
    expect(validateAllEvents(EVENTS, [{ ...jp, id: "mongol" }]).some((x) => x.includes("jp-"))).toBe(true);
    expect(
      validateAllEvents(EVENTS, [{ ...jp, relatedEventIds: ["no-such-event"] }]).some((x) => x.includes("参照先")),
    ).toBe(true);
  });

  it("verified はすべて false、出典は ja.wikipedia.org のみ、画像を持たない", () => {
    for (const e of JAPAN_EVENTS) {
      expect(e.verified, e.id).toBe(false);
      expect(e.sources.length, e.id).toBeGreaterThan(0);
      for (const s of e.sources) expect(s.url.startsWith("https://ja.wikipedia.org/wiki/"), e.id).toBe(true);
      expect(Object.keys(e).some((k) => /image|img|photo|thumb/i.test(k)), e.id).toBe(false);
    }
  });

  it("既存の日本の出来事6件は作り直さず、scopes に japan を足して両方の地図に出す", () => {
    for (const id of SHARED) {
      const e = EVENT_BY_ID.get(id)!;
      expect(scopesOf(e), id).toEqual(["world", "japan"]);
      expect(isShared(e), id).toBe(true);
      expect(EVENTS_BY_MODE.world.includes(e) && EVENTS_BY_MODE.japan.includes(e), id).toBe(true);
    }
    // 日本側に同じ出来事を作り直していない
    const titles = new Set(JAPAN_EVENTS.map((e) => e.title));
    for (const id of SHARED) expect(titles.has(EVENT_BY_ID.get(id)!.title)).toBe(false);
  });

  it("地球儀に出す日本のイベントは importance 3 の数件だけ", () => {
    const onGlobe = JAPAN_EVENTS.filter((e) => inScope(e, "world"));
    expect(onGlobe.length).toBeGreaterThan(0);
    expect(onGlobe.length).toBeLessThanOrEqual(MAX_JAPAN_ON_GLOBE);
    expect(onGlobe.every((e) => e.importance === 3)).toBe(true);
    expect(onGlobe.map((e) => e.id)).toContain("jp-mongol-invasions");
  });

  it("scopes を省略したイベントは、世界側は world・日本側は japan とみなす", () => {
    expect(scopesOf(EVENT_BY_ID.get("qin-unification")!)).toEqual(["world"]);
    expect(scopesOf(EVENT_BY_ID.get("jp-hakusonko")!)).toEqual(["japan"]);
  });

  it("日本の地図に出るイベントにはすべて時代区分（era）がある", () => {
    for (const e of EVENTS_BY_MODE.japan) expect(JAPAN_ERA_NAMES, e.id).toContain(e.era);
  });

  it("「同じころ」の段に出すのは、もう一方のモードにだけある出来事", () => {
    expect(OTHER_ONLY_BY_MODE.japan.every((e) => !inScope(e, "japan"))).toBe(true);
    expect(OTHER_ONLY_BY_MODE.world.every((e) => !inScope(e, "world"))).toBe(true);
    // 共有イベントはどちらの「同じころ」にも出ない（同じ出来事を2つの段に出さない）
    for (const id of SHARED) {
      expect(OTHER_ONLY_BY_MODE.japan.some((e) => e.id === id)).toBe(false);
      expect(OTHER_ONLY_BY_MODE.world.some((e) => e.id === id)).toBe(false);
    }
  });

  it("1274年：日本モードの「同じころ、世界では？」に元の成立が、世界モードの「同じころ、日本では？」は別の段になる", () => {
    const jp = otherContemporary(OTHER_ONLY_BY_MODE.japan, 1274);
    expect(jp.events.map((e) => e.id)).toContain("yuan-dadu");
    const world = contemporaryEvents(EVENTS_BY_MODE.world, 1274).events.map((e) => e.id);
    // 地球儀にも出す元寇は世界の同時代リストに入るが、日本だけの出来事は入らない
    expect(world).toContain("jp-mongol-invasions");
    expect(world.some((id) => id.startsWith("jp-") && !inScope(EVENT_BY_ID.get(id)!, "world"))).toBe(false);
  });

  it("日本モードの年代スライダーのどの年でも、日本の「同時代」に2件以上並ぶ", () => {
    for (let y = JAPAN_MIN_YEAR; y <= MAX_YEAR; y += y < -1000 ? 97 : 1) {
      expect(contemporaryEvents(EVENTS_BY_MODE.japan, y).events.length, String(y)).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("世界とのつながり（もう一方のモードにある関連イベント）", () => {
  const ids = (id: string, mode: "world" | "japan") =>
    crossLinks(EVENT_BY_ID.get(id)!, mode, ALL_EVENTS, scopesOf).map((e) => e.id);

  it("元寇を日本地図で開くと、チンギス=カン・元・高麗が「世界史で見る」に出る", () => {
    expect(ids("jp-mongol-invasions", "japan")).toEqual(expect.arrayContaining(["genghis-khan", "yuan-dadu", "goryeo"]));
  });

  it("地球儀で元の成立を開くと、日本だけにある鎌倉幕府の滅亡は出ず、両方に出る元寇も出ない", () => {
    const list = ids("yuan-dadu", "world");
    expect(list).not.toContain("jp-mongol-invasions"); // 地球儀にも出ているので「日本史で見る」には入れない
  });

  it("地球儀で明を開くと、逆向きのつながり（日明貿易・琉球王国など）が「日本史で見る」に出る", () => {
    expect(ids("ming", "world")).toEqual(expect.arrayContaining(["jp-ming-trade", "jp-ryukyu-kingdom"]));
  });

  it("どちらのモードにも出る共有イベントは、つながりのカードに出さない", () => {
    for (const e of EVENTS_BY_MODE.japan) {
      for (const x of crossLinks(e, "japan", ALL_EVENTS, scopesOf)) expect(inScope(x, "japan")).toBe(false);
    }
  });

  it("第1回の橋のイベント（指示書の太字）は、すべて世界史側の出来事とつながっている", () => {
    const BRIDGES = [
      "jp-gold-seal", "jp-buddhism-arrives", "jp-kenzuishi", "jp-hakusonko", "jp-todaiji-ganjin", "jp-kentoshi-end",
      "jp-nisso-trade", "jp-mongol-invasions", "jp-ming-trade", "jp-ryukyu-kingdom", "jp-iwami-silver",
      "jp-tanegashima-guns", "jp-xavier", "jp-hideyoshi-korea", "jp-dejima", "jp-perry", "jp-sino-japanese-war",
    ];
    for (const id of BRIDGES) {
      expect(crossLinks(EVENT_BY_ID.get(id)!, "japan", ALL_EVENTS, scopesOf).length, id).toBeGreaterThan(0);
    }
    // 世界史側に対応するイベント（三国時代の魏・朝鮮半島の稲作）がまだないもの。注記でつながりを示している
    for (const id of ["jp-rice-farming", "jp-himiko"]) expect(EVENT_BY_ID.get(id)!.historicalNote).toContain("世界史側には");
  });
});

describe("年代スライダーのモード別の目盛り", () => {
  it("世界は前3000年〜、日本は前3万年（旧石器時代）〜。どちらも2025年まで", () => {
    expect(WORLD_SCALE.min).toBe(MIN_YEAR);
    expect(JAPAN_SCALE.min).toBe(-29999);
    expect(JAPAN_SCALE.max).toBe(MAX_YEAR);
    expect(JAPAN_SCALE.sliderToYear(0)).toBe(-29999);
    expect(JAPAN_SCALE.sliderToYear(1)).toBe(MAX_YEAR);
  });

  it("日本の目盛りは先史時代を強く圧縮する（前3万年〜前1年がスライダーの2割未満）", () => {
    expect(JAPAN_SCALE.yearToSlider(0)).toBeLessThan(0.2);
    expect(JAPAN_SCALE.yearToSlider(1600) - JAPAN_SCALE.yearToSlider(1200)).toBeGreaterThan(0.15);
  });

  it("年→位置→年 で元に戻り、位置が増えれば年も増える", () => {
    for (let y = JAPAN_SCALE.min; y <= JAPAN_SCALE.max; y += 13) {
      const back = JAPAN_SCALE.sliderToYear(JAPAN_SCALE.yearToSlider(y));
      // 先史時代は1目盛り（1/1000）が数十年にあたるので、丸め誤差の許容を広くとる
      expect(Math.abs(back - y), String(y)).toBeLessThanOrEqual(y < -999 ? 30 : 1);
    }
    let prev = -Infinity;
    for (let t = 0; t <= 1; t += 0.001) {
      const y = JAPAN_SCALE.sliderToYear(t);
      expect(y).toBeGreaterThanOrEqual(prev);
      prev = y;
    }
  });

  it("自動再生：日本の先史時代は大きく進み、戻らない", () => {
    let y = JAPAN_SCALE.min;
    let n = 0;
    while (y < 0 && n < 10000) {
      const next = JAPAN_SCALE.nextYear(y);
      expect(next).toBeGreaterThan(y);
      y = next;
      n++;
    }
    expect(n).toBeLessThan(400);
    expect(JAPAN_SCALE.nextYear(MAX_YEAR)).toBe(MAX_YEAR);
  });

  it("時代区分は旧石器〜令和の16区分で、すき間なく並ぶ（境目は目安）", () => {
    expect(JAPAN_ERA_NAMES).toEqual([
      "旧石器", "縄文", "弥生", "古墳", "飛鳥", "奈良", "平安", "鎌倉", "室町", "安土桃山", "江戸", "明治", "大正", "昭和", "平成", "令和",
    ]);
    for (let i = 1; i < JAPAN_ERAS.length; i++) expect(JAPAN_ERAS[i]!.from).toBe(JAPAN_ERAS[i - 1]!.to);
    expect(eraOf(1274).name).toBe("鎌倉");
    expect(eraOf(1600).name).toBe("安土桃山");
    expect(eraOf(-20000).name).toBe("旧石器");
  });
});

describe("モード切り替え時の年の引き継ぎと URL", () => {
  it("年はそのまま引き継ぎ、切り替え先の範囲の外なら端に合わせる", () => {
    expect(carryYear(1274, "japan")).toBe(1274);
    expect(carryYear(1274, "world")).toBe(1274);
    expect(carryYear(-20000, "world")).toBe(MIN_YEAR); // 旧石器の年から世界へ → 前3000年
    expect(carryYear(-2999, "japan")).toBe(-2999); // 世界の最初の年は日本の範囲内
    expect(carryYear(3000, "japan")).toBe(MAX_YEAR);
  });

  it("?mode=japan の解釈と、ほかの指定（?tour=・?work=・?event=）との組み合わせ", () => {
    expect(parseModeQuery("?mode=japan")).toBe("japan");
    expect(parseModeQuery("")).toBe("world");
    expect(parseModeQuery("?mode=mars")).toBe("world");
    expect(buildQuery("world")).toBe("");
    expect(buildQuery("japan")).toBe("?mode=japan");
    expect(buildQuery("japan", "?tour=mongol&step=4")).toBe("?mode=japan&tour=mongol&step=4");
    expect(buildQuery("world", "?mode=japan&work=a-un-okazaki")).toBe("?work=a-un-okazaki");
    expect(parseEventQuery("?mode=japan&event=jp-hakusonko")).toBe("jp-hakusonko");
  });
});

describe("作品データ（works.json）は日本の出来事にも紐づく", () => {
  it("日本が舞台の6作品は、日本の地図に出る出来事に紐づいている", () => {
    const ids = ["a-un-okazaki", "silence-2016", "saka-no-ue-no-kumo", "golden-kamuy", "kono-sekai-no-katasumi-ni", "hadashi-no-gen"];
    for (const id of ids) {
      const w = WORKS.find((x) => x.id === id)!;
      expect(w.eventIds.some((e) => inScope(EVENT_BY_ID.get(e)!, "japan")), id).toBe(true);
    }
  });
});

describe("日本史の作品：大河ドラマ3作（PR③）", () => {
  const TAIGA = {
    ryomaden: ["jp-perry", "jp-ansei-purge", "jp-sakuradamon", "jp-shimonoseki-war", "jp-ikedaya", "jp-kinmon", "jp-satcho-alliance", "jp-taisei-hokan", "jp-omiya-incident"],
    sanadamaru: ["jp-honnoji", "jp-tensho-jingo", "jp-komaki-nagakute", "jp-ueda-kassen", "jp-odawara", "jp-hideyoshi-korea", "jp-sekigahara", "jp-edo-shogunate", "jp-osaka-siege"],
    "kamakuradono-no-13-nin": ["jp-ishibashiyama", "jp-genpei-war", "jp-kamakura-shogunate", "jp-hiki-incident", "jp-jokyu-war"],
  } as const;

  it("3作が作品データにあり、ドラマ・史実ベース・未検証・出典は作品記事", () => {
    for (const [id, events] of Object.entries(TAIGA)) {
      const w = WORKS.find((x) => x.id === id)!;
      expect(w, id).toBeDefined();
      expect(w.media).toEqual(["drama"]);
      expect(w.fidelity).toBe("historical");
      expect(w.verified).toBe(false);
      expect(w.eventIds).toEqual(events);
      expect(w.sources[0]!.url.startsWith("https://ja.wikipedia.org/wiki/")).toBe(true);
    }
  });

  it("紐づく出来事はすべて日本の地図に出る（日本モードで選ぶと日本地図のまま移る）", () => {
    for (const events of Object.values(TAIGA))
      for (const e of events) expect(inScope(EVENT_BY_ID.get(e)!, "japan"), e).toBe(true);
  });

  it("世界モードから選んだときの行き先：龍馬伝は共有イベント（ペリー来航）なので地球儀のまま、ほかの2作は日本地図へ切り替わる", () => {
    const first = (id: keyof typeof TAIGA) => EVENT_BY_ID.get(TAIGA[id][0])!;
    expect(inScope(first("ryomaden"), "world")).toBe(true);
    expect(inScope(first("sanadamaru"), "world")).toBe(false);
    expect(inScope(first("kamakuradono-no-13-nin"), "world")).toBe(false);
  });

  it("追加した錨のイベント6件は jp- で始まり、日本の地図にだけ出る", () => {
    for (const id of ["jp-ishibashiyama", "jp-hiki-incident", "jp-tensho-jingo", "jp-ueda-kassen", "jp-kinmon", "jp-omiya-incident"]) {
      const e = EVENT_BY_ID.get(id)!;
      expect(e, id).toBeDefined();
      expect(inScope(e, "japan")).toBe(true);
      expect(inScope(e, "world")).toBe(false);
      expect(e.verified).toBe(false);
    }
  });
});
