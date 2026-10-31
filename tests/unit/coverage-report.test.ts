import { it } from "vitest";
import { EVENTS } from "@/data/events";
import { baseWindow, contemporaryEvents } from "@/lib/visibility";
import { MAX_YEAR, MIN_YEAR } from "@/lib/timeScale";
import { formatYear } from "@/lib/year";

// 基本の幅では2件に満たず、幅を広げた区間を一覧にする（報告用・常に成功）
it("同時代ウィンドウの拡張区間レポート", () => {
  const ranges: string[] = [];
  let startY: number | null = null;
  let maxW = 0;
  for (let y = MIN_YEAR; y <= MAX_YEAR + 1; y++) {
    const r = y <= MAX_YEAR ? contemporaryEvents(EVENTS, y) : null;
    if (r?.expanded) {
      if (startY === null) startY = y;
      maxW = Math.max(maxW, r.window);
    } else if (startY !== null) {
      ranges.push(`${formatYear(startY)}〜${formatYear(y - 1)}（基本±${baseWindow(startY)}年→最大±${maxW}年）`);
      startY = null;
      maxW = 0;
    }
  }
  console.log(`拡張区間 ${ranges.length} 件\n` + ranges.join("\n"));
});
