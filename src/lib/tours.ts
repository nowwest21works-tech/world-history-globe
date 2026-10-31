import type { HistoryEvent } from "@/types/event";
import type { ArcCertainty, Tour } from "@/types/tour";
import { contemporaryEvents, distanceFromEvent } from "./visibility";

/**
 * ツアーの表示位置。
 *   -1          … 導入（はじめに）
 *   0..N-1      … 各ステップ
 *   N           … まとめ
 */
export type TourPosition = number;

export const KIND_LABEL = { contemporary: "同時代型", connection: "つながり型" } as const;

export const CERTAINTY_LABEL: Record<ArcCertainty, string> = {
  established: "史実として確かめられたつながり",
  traditional: "伝承（確かな記録がそろっていない）",
  debated: "諸説あり",
};

export interface TourArcView {
  id: string;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  certainty: ArcCertainty;
  label: string;
  /** いま表示中のステップで新しく引かれた弧か */
  current: boolean;
}

/** つながり型：position までに通ったステップの弧（積み重ね）。同時代型は空 */
export function arcsUpTo(tour: Tour, position: TourPosition, events: HistoryEvent[]): TourArcView[] {
  if (tour.kind !== "connection") return [];
  const byId = new Map(events.map((e) => [e.id, e]));
  const last = Math.min(position, tour.steps.length - 1);
  const arcs: TourArcView[] = [];
  for (let i = 0; i <= last; i++) {
    const step = tour.steps[i]!;
    if (!step.arcFrom) continue;
    const from = byId.get(step.arcFrom.eventId);
    const to = byId.get(step.eventId);
    if (!from || !to) continue;
    arcs.push({
      id: `${tour.id}:${step.id}`,
      startLat: from.location.lat,
      startLng: from.location.lng,
      endLat: to.location.lat,
      endLng: to.location.lng,
      certainty: step.arcFrom.certainty,
      label: step.arcFrom.label,
      current: i === position,
    });
  }
  return arcs;
}

/** 地球上に出しておくイベント（同時代型は全ステップ、つながり型は通ったステップと弧の始点） */
export function tourEventIds(tour: Tour, position: TourPosition): Set<string> {
  const ids = new Set<string>();
  const last = tour.kind === "contemporary" ? tour.steps.length - 1 : Math.min(position, tour.steps.length - 1);
  for (let i = 0; i <= last; i++) {
    const s = tour.steps[i]!;
    ids.add(s.eventId);
    if (s.arcFrom) ids.add(s.arcFrom.eventId);
  }
  return ids;
}

/** URL の ?tour=paper&step=3 を解釈する（step は 1 始まり。0 は導入、N+1 はまとめ） */
export function parseTourQuery(search: string, tours: Tour[]): { tour: Tour; position: TourPosition } | null {
  const q = new URLSearchParams(search);
  const tour = tours.find((t) => t.id === q.get("tour"));
  if (!tour) return null;
  const n = Number.parseInt(q.get("step") ?? "0", 10);
  const step = Number.isFinite(n) ? Math.max(0, Math.min(n, tour.steps.length + 1)) : 0;
  return { tour, position: step - 1 };
}

export function tourQuery(tour: Tour, position: TourPosition): string {
  return `?tour=${encodeURIComponent(tour.id)}&step=${position + 1}`;
}

/** tours.json の検証。問題の一覧を返す（空なら OK） */
export function validateTours(tours: Tour[], events: HistoryEvent[]): string[] {
  const errors: string[] = [];
  const byId = new Map(events.map((e) => [e.id, e]));
  const tourIds = new Set<string>();
  for (const t of tours) {
    const p = `[${t.id}]`;
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(t.id)) errors.push(`${p} id が kebab-case ではない`);
    if (tourIds.has(t.id)) errors.push(`${p} id が重複`);
    tourIds.add(t.id);
    if (!t.title || !t.intro || !t.outro || !t.closingQuestion) errors.push(`${p} 文面が空`);
    if (t.verified !== false) errors.push(`${p} verified が false ではない`);
    if (t.steps.length < 3) errors.push(`${p} ステップが少なすぎる`);
    const stepIds = new Set<string>();
    t.steps.forEach((s, i) => {
      const q = `${p} step${i + 1}(${s.id})`;
      if (stepIds.has(s.id)) errors.push(`${q} step id が重複`);
      stepIds.add(s.id);
      const e = byId.get(s.eventId);
      if (!e) {
        errors.push(`${q} eventId が存在しない: ${s.eventId}`);
        return;
      }
      if (!Number.isInteger(s.year)) errors.push(`${q} year が整数ではない`);
      if (s.narration.length < 40 || s.narration.length > 180) errors.push(`${q} 語り文の長さ ${s.narration.length} 字`);
      if (!s.question.endsWith("？") && !s.question.endsWith("。")) errors.push(`${q} 問いの形になっていない`);
      if (t.kind === "contemporary") {
        if (s.year !== t.steps[0]!.year) errors.push(`${q} 同時代型なのに年がそろっていない`);
        if (!contemporaryEvents(events, s.year).events.some((x) => x.id === e.id))
          errors.push(`${q} その年の「同時代」にイベントが入っていない`);
        if (s.arcFrom) errors.push(`${q} 同時代型に弧がある`);
      } else {
        if (distanceFromEvent(e, s.year) > 30) errors.push(`${q} year がイベントの年代から離れすぎ`);
        if (i > 0 && s.year < t.steps[i - 1]!.year) errors.push(`${q} 年が前のステップより戻っている`);
        if (i > 0 && !s.arcFrom) errors.push(`${q} つながり型の2番目以降に弧がない`);
      }
      if (s.arcFrom) {
        const from = byId.get(s.arcFrom.eventId);
        if (!from) errors.push(`${q} 弧の始点が存在しない: ${s.arcFrom.eventId}`);
        else if (!(from.relatedEventIds ?? []).includes(s.eventId))
          errors.push(`${q} ${from.id} の relatedEventIds に ${s.eventId} がない`);
      }
    });
  }
  return errors;
}
