import { describe, expect, it } from "vitest";
import {
  DEFAULT_VIEW,
  JAPAN_BOUNDS,
  MAX_ZOOM,
  edgePoint,
  fromScreen,
  panBy,
  toScreen,
  zoomAt,
} from "@/lib/japanMap";
import { approxDistanceDeg, groupNearby } from "@/lib/markerGroups";
import { JAPAN_GROUP_DISTANCE_DEG } from "@/components/japan/JapanMap";
import land from "@/data/japan-land.json";
import type { HistoryEvent } from "@/types/event";

const size = { width: 1280, height: 600 };
const KYOTO = { lat: 35.0116, lng: 135.7681 };
const NARA = { lat: 34.685, lng: 135.805 };
const OSAKA = { lat: 34.6937, lng: 135.5023 };

describe("日本地図の投影と操作", () => {
  it("初期表示で、北緯24〜46度・東経122〜150度（琉球〜北海道・樺太南部）が画面に収まる", () => {
    for (const [lat, lng] of [
      [JAPAN_BOUNDS.south, JAPAN_BOUNDS.west],
      [JAPAN_BOUNDS.north, JAPAN_BOUNDS.east],
      [26.2, 127.7], // 那覇
      [45.4, 141.7], // 稚内
      [46.0, 142.0], // 樺太南部
      [37.5, 127.0], // ソウル（朝鮮半島）
    ] as const) {
      const p = toScreen(lat, lng, DEFAULT_VIEW, size);
      expect(p.x, `${lat},${lng}`).toBeGreaterThanOrEqual(-0.5);
      expect(p.x).toBeLessThanOrEqual(size.width + 0.5);
      expect(p.y).toBeGreaterThanOrEqual(-0.5);
      expect(p.y).toBeLessThanOrEqual(size.height + 0.5);
    }
  });

  it("画面座標と緯度経度の往復で元に戻る", () => {
    const v = { lat: 34, lng: 133, zoom: 3 };
    const p = toScreen(KYOTO.lat, KYOTO.lng, v, size);
    const back = fromScreen(p.x, p.y, v, size);
    expect(back.lat).toBeCloseTo(KYOTO.lat, 6);
    expect(back.lng).toBeCloseTo(KYOTO.lng, 6);
  });

  it("ドラッグで地図が動き、ホイールの位置を固定したまま拡大する", () => {
    const v = panBy(DEFAULT_VIEW, size, 100, 0);
    expect(v.lng).toBeLessThan(DEFAULT_VIEW.lng);
    const before = fromScreen(300, 200, DEFAULT_VIEW, size);
    const z = zoomAt(DEFAULT_VIEW, size, 2, 300, 200);
    expect(z.zoom).toBeCloseTo(2);
    const after = fromScreen(300, 200, z, size);
    expect(after.lat).toBeCloseTo(before.lat, 5);
    expect(after.lng).toBeCloseTo(before.lng, 5);
    expect(zoomAt(DEFAULT_VIEW, size, 1000, 0, 0).zoom).toBe(MAX_ZOOM);
  });

  it("最大まで拡大すると、京都・奈良・大阪のマーカー（最大28px）が重ならずに見分けられる", () => {
    const v = { lat: 34.8, lng: 135.7, zoom: MAX_ZOOM };
    const pts = [KYOTO, NARA, OSAKA].map((p) => toScreen(p.lat, p.lng, v, size));
    for (let i = 0; i < pts.length; i++)
      for (let j = i + 1; j < pts.length; j++) {
        expect(Math.hypot(pts[i]!.x - pts[j]!.x, pts[i]!.y - pts[j]!.y)).toBeGreaterThan(40);
      }
  });

  it("京都・奈良・大阪は1つのマーカーにまとめない（まとめるのは十数km以内だけ）", () => {
    const mk = (id: string, p: { lat: number; lng: number }) =>
      ({ id, importance: 2, start: { year: 0 }, location: { ...p } }) as unknown as HistoryEvent;
    const g = groupNearby([mk("k", KYOTO), mk("n", NARA), mk("o", OSAKA)], JAPAN_GROUP_DISTANCE_DEG);
    expect(g).toHaveLength(3);
    expect(approxDistanceDeg(NARA, OSAKA)).toBeGreaterThan(JAPAN_GROUP_DISTANCE_DEG);
  });

  it("地図の端の矢印：選んだ地点から大陸（北西）の方角へ、画面の枠に当たる点に置く", () => {
    const from = { x: 640, y: 300 };
    const p = edgePoint(from, { x: -10, y: -6 }, size, 30);
    expect(p.x === 30 || p.y === 30).toBe(true);
    expect(p.angle).toBeLessThan(-90); // 左上
  });

  it("地図データは軽い（100KB以下）、Natural Earth 由来で、現代の国境・県境を含まない", () => {
    const json = JSON.stringify(land);
    expect(json.length).toBeLessThan(100 * 1024);
    expect(land.source).toContain("Natural Earth");
    expect(Object.keys(land).sort()).toEqual(["clip", "note", "path", "scale", "source", "sourceRepo"]);
    expect(land.path.startsWith("M")).toBe(true);
  });
});
