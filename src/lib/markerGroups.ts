import type { HistoryEvent } from "@/types/event";

/**
 * 地球上でほぼ同じ地点にあるイベントをまとめる。
 * 0.3度（最大までズームしても15ピクセル程度しか離れない距離）以内のものは、ズームしても見分けられないので
 * 1つのマーカーにまとめ、選んだときに一覧で選べるようにする。地点そのものはずらさない。
 */
export const GROUP_DISTANCE_DEG = 0.3;

/** 2地点のおおよその角距離（度）。近い距離だけを判定するので平面近似で十分 */
export function approxDistanceDeg(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLng = ((a.lng - b.lng + 540) % 360) - 180;
  return Math.hypot(a.lat - b.lat, dLng * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180)));
}

/**
 * 近いイベントどうしをつないだグループを返す（A–B、B–C が近ければ A・B・C を1つにまとめる）。
 * 各グループ内は 重要度の高い順 → 開始年の古い順。グループ自体は入力の並び順を保つ。
 */
export function groupNearby(events: HistoryEvent[], threshold = GROUP_DISTANCE_DEG): HistoryEvent[][] {
  const parent = events.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < events.length; j++) {
      if (approxDistanceDeg(events[i]!.location, events[j]!.location) < threshold) {
        parent[find(i)] = find(j);
      }
    }
  }
  const byRoot = new Map<number, HistoryEvent[]>();
  events.forEach((e, i) => {
    const r = find(i);
    if (!byRoot.has(r)) byRoot.set(r, []);
    byRoot.get(r)!.push(e);
  });
  return [...byRoot.values()].map((g) =>
    g.slice().sort((a, b) => b.importance - a.importance || a.start.year - b.start.year),
  );
}
