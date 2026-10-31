import type { HistoryEvent } from "@/types/event";
import raw from "./events.json";

/** イベントは開始年順に並べて提供する */
export const EVENTS: HistoryEvent[] = (raw as HistoryEvent[])
  .slice()
  .sort((a, b) => a.start.year - b.start.year);
