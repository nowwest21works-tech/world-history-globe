import { describe, expect, it } from "vitest";
import { EVENTS } from "@/data/events";
import { TOURS } from "@/data/tours";
import { arcsUpTo, parseTourQuery, tourEventIds, tourQuery, validateTours } from "@/lib/tours";

describe("tours.json", () => {
  it("検証に合格する", () => {
    expect(validateTours(TOURS, EVENTS)).toEqual([]);
  });

  it("4本：同時代型2本・つながり型2本", () => {
    expect(TOURS.map((t) => t.id)).toEqual(["bc500", "paper", "silver", "ad800"]);
    expect(TOURS.filter((t) => t.kind === "contemporary").length).toBe(2);
    expect(TOURS.filter((t) => t.kind === "connection").length).toBe(2);
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
