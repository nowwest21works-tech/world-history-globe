import type { HistoryWork } from "@/types/work";
import raw from "./works.json";

/** 作品は「描く時代」の古い順（era.from 昇順。同じなら era.to 昇順）に並べて提供する */
export const WORKS: HistoryWork[] = (raw as HistoryWork[])
  .slice()
  .sort((a, b) => a.era.from - b.era.from || a.era.to - b.era.to);

const BY_EVENT = new Map<string, HistoryWork[]>();
for (const w of WORKS) {
  for (const id of w.eventIds) {
    const list = BY_EVENT.get(id) ?? [];
    list.push(w);
    BY_EVENT.set(id, list);
  }
}

/** イベントIDから、そのイベントに紐づく作品（時代順）を引く。なければ空配列 */
export function worksByEventId(id: string): HistoryWork[] {
  return BY_EVENT.get(id) ?? [];
}
