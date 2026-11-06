import { describe, expect, it } from "vitest";
import { ALL_EVENTS as EVENTS } from "@/data/events";
import { TOURS } from "@/data/tours";
import { arcsUpTo, crossesModes, parseTourQuery, positionMode, stepMode, tourEventIds, tourQuery, validateTours } from "@/lib/tours";

describe("tours.json", () => {
  it("検証に合格する", () => {
    expect(validateTours(TOURS, EVENTS)).toEqual([]);
  });

  it("7本：同時代型3本・つながり型4本（うち世界と日本をまたぐもの3本、日本だけのもの1本）", () => {
    expect(TOURS.map((t) => t.id)).toEqual(["bc500", "paper", "silver", "mongol", "ad800", "jp1600", "bakumatsu"]);
    expect(TOURS.filter((t) => t.kind === "contemporary").length).toBe(3);
    expect(TOURS.filter((t) => t.kind === "connection").length).toBe(4);
    expect(TOURS.filter(crossesModes).map((t) => t.id)).toEqual(["silver", "mongol", "bakumatsu"]);
  });

  it("「1600年、日本では？ 世界では？」：日本地図だけで巡る同時代型", () => {
    const t = TOURS.find((x) => x.id === "jp1600")!;
    expect(t.kind).toBe("contemporary");
    expect(t.steps.every((s) => stepMode(s) === "japan" && s.year === 1600)).toBe(true);
    expect(t.steps[0]!.eventId).toBe("jp-sekigahara");
  });

  it("元寇ツアー：地球儀で始まり、文永の役で日本地図へ切り替わる", () => {
    const t = TOURS.find((x) => x.id === "mongol")!;
    expect(t.steps.map((s) => s.eventId)).toEqual([
      "genghis-khan", "yuan-dadu", "goryeo", "jp-mongol-invasions", "jp-mongol-invasions", "jp-kamakura-fall",
    ]);
    expect(t.steps.map(stepMode)).toEqual(["world", "world", "world", "japan", "japan", "japan"]);
    expect(positionMode(t, -1)).toBe("world"); // 導入は最初のステップのモード
    expect(positionMode(t, t.steps.length)).toBe("japan"); // まとめは最後のステップのモード
    // 日本地図のカメラは緯度・経度と拡大率で表す
    expect(t.steps[3]!.camera?.zoom).toBeGreaterThan(0);
    expect(t.steps[3]!.camera?.altitude).toBeUndefined();
  });

  it("幕末ツアー：アヘン戦争とペリー来航を地球儀で見てから日本地図へ移り、箱館戦争で終わる", () => {
    const t = TOURS.find((x) => x.id === "bakumatsu")!;
    expect(t.kind).toBe("connection");
    expect(t.steps.map((s) => s.eventId)).toEqual([
      "opium-war", "jp-perry", "jp-harris-treaty", "jp-namamugi-satsuei", "jp-shimonoseki-war",
      "jp-satcho-alliance", "jp-taisei-hokan", "jp-boshin", "jp-edo-castle", "jp-hakodate",
    ]);
    expect(t.steps.map(stepMode)).toEqual(["world", "world", ...Array(8).fill("japan")]);
    expect(t.steps[2]!.camera?.zoom).toBeGreaterThan(0);
    expect(positionMode(t, t.steps.length)).toBe("japan");
  });

  it("銀のツアー：ポトシ → 石見銀山（日本地図）→ マニラ（地球儀に戻る）", () => {
    const t = TOURS.find((x) => x.id === "silver")!;
    const i = t.steps.findIndex((s) => s.eventId === "jp-iwami-silver");
    expect(t.steps[i - 1]!.eventId).toBe("potosi");
    expect(stepMode(t.steps[i]!)).toBe("japan");
    expect(t.steps[i + 1]!.eventId).toBe("manila-galleon");
    expect(stepMode(t.steps[i + 1]!)).toBe("world");
  });

  it("紙の旅：タラス→バグダードの弧は「伝承」", () => {
    const paper = TOURS.find((t) => t.id === "paper")!;
    const arc = paper.steps.find((s) => s.eventId === "baghdad-paper")!.arcFrom!;
    expect(arc.eventId).toBe("talas");
    expect(arc.certainty).toBe("traditional");
  });

  it("つながり型の弧は、通ったステップの分だけ積み重なる", () => {
    const silver = TOURS.find((t) => t.id === "silver")!;
    expect(arcsUpTo(silver, -1, EVENTS)).toHaveLength(0);
    expect(arcsUpTo(silver, 0, EVENTS)).toHaveLength(0);
    expect(arcsUpTo(silver, 2, EVENTS)).toHaveLength(2);
    const all = arcsUpTo(silver, silver.steps.length, EVENTS);
    expect(all).toHaveLength(silver.steps.length - 1);
    expect(all.filter((a) => a.current)).toHaveLength(0); // まとめ画面では「いまの弧」はない
    expect(arcsUpTo(silver, 3, EVENTS).filter((a) => a.current)).toHaveLength(1);
  });

  it("同時代型は全ステップのイベントを最初から地球に出す", () => {
    const t = TOURS.find((x) => x.id === "bc500")!;
    expect(tourEventIds(t, -1).size).toBe(t.steps.length);
  });

  it("URL ?tour=…&step=… の解釈（範囲外は丸める）", () => {
    expect(parseTourQuery("?tour=paper&step=3", TOURS)?.position).toBe(2);
    expect(parseTourQuery("?tour=paper", TOURS)?.position).toBe(-1);
    expect(parseTourQuery("?tour=paper&step=99", TOURS)?.position).toBe(6);
    expect(parseTourQuery("?tour=nope&step=1", TOURS)).toBeNull();
    const paper = TOURS.find((t) => t.id === "paper")!;
    expect(tourQuery(paper, 2)).toBe("?tour=paper&step=3");
  });
});
