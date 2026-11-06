import { describe, expect, it } from "vitest";
import {
  DEFAULT_VIEW,
  JAPAN_BOUNDS,
  MAX_ZOOM,
  edgePoint,
  fromScreen,
  mercY,
  panBy,
  reliefRect,
  toScreen,
  wantsHiRes,
  zoomAt,
  type ReliefLayer,
} from "@/lib/japanMap";
import relief from "@/data/japan-relief.json";
import { existsSync, statSync } from "node:fs";
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

describe("背景の陰影起伏画像（src/data/japan-relief.json）", () => {
  const lo = relief.layers.lo as ReliefLayer;
  const hi = relief.layers.hi as ReliefLayer;

  it("画像ファイルがあり、合計 600KB 以下", () => {
    let total = 0;
    for (const l of [lo, hi]) {
      const f = `public${l.file}`;
      expect(existsSync(f), f).toBe(true);
      total += statSync(f).size;
    }
    expect(total).toBeLessThan(600 * 1024);
  });

  it("高解像度は日本地図の初期範囲（東経122〜150度・北緯24〜46度）、低解像度はベクターの地図と同じ広い範囲を覆う", () => {
    // 南端は、画素数を整数に丸めた分だけずれる（1画素未満）
    expect([hi.west, hi.east, hi.north]).toEqual([JAPAN_BOUNDS.west, JAPAN_BOUNDS.east, JAPAN_BOUNDS.north]);
    expect(Math.abs(hi.south - JAPAN_BOUNDS.south)).toBeLessThan(1 / hi.pxPerDeg);
    expect(lo.west).toBeLessThanOrEqual(hi.west);
    expect(lo.east).toBeGreaterThanOrEqual(hi.east);
    expect(lo.south).toBeLessThanOrEqual(hi.south);
    expect(lo.north).toBeGreaterThanOrEqual(hi.north);
  });

  it("画像の縦横の画素数は、メルカトル図法での範囲と同じ比率（地図単位に歪みなく重なる）", () => {
    for (const l of [lo, hi]) {
      expect(l.width).toBe(Math.round((l.east - l.west) * l.pxPerDeg));
      expect(l.height).toBe(Math.round((mercY(l.north) - mercY(l.south)) * l.pxPerDeg));
      const r = reliefRect(l);
      expect(r.w / r.h).toBeCloseTo(l.width / l.height, 2);
    }
  });

  it("画像の四角を置くと、目印（博多湾・浦賀・関ヶ原）は画像の中で緯度経度どおりの画素に来る", () => {
    const size = { width: 1280, height: 800 };
    for (const [lat, lng] of [[33.62, 130.35], [35.24, 139.72], [35.37, 136.47]] as const) {
      const view = { lat, lng, zoom: 6 };
      const p = toScreen(lat, lng, view, size);
      const nw = toScreen(hi.north, hi.west, view, size);
      const se = toScreen(hi.south, hi.east, view, size);
      // 画面上の位置を画像の画素に直す
      const px = ((p.x - nw.x) / (se.x - nw.x)) * hi.width;
      const py = ((p.y - nw.y) / (se.y - nw.y)) * hi.height;
      expect(px).toBeCloseTo((lng - hi.west) * hi.pxPerDeg, 3);
      expect(py).toBeCloseTo((mercY(hi.north) - mercY(lat)) * hi.pxPerDeg, 3);
    }
  });

  it("高解像度への切り替えは、低解像度の画像が 1.3 倍より大きく引き伸ばされるとき", () => {
    expect(wantsHiRes(0.1, 1, lo.pxPerDeg)).toBe(false); // 10画素/度
    expect(wantsHiRes(0.1, 3, lo.pxPerDeg)).toBe(true); // 30画素/度（画素密度3）
    expect(wantsHiRes(0.3, 1, lo.pxPerDeg)).toBe(true);
  });
});
