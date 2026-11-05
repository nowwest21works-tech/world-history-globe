/**
 * 日本モードの平面地図（メルカトル図法）の投影と表示範囲。
 * 地図データ（src/data/japan-land.json）は scripts/build-japan-map.mjs が同じ式で投影し、100倍した整数座標で持っている。
 * ここでの「地図単位」はその座標（経度・メルカトル緯度の 1/100 度）。
 */

export const MAP_SCALE = 100;

/** 初期表示で収める範囲（指示書の目安：東経122〜150度・北緯24〜46度。琉球・北海道・樺太南部が入る） */
export const JAPAN_BOUNDS = { west: 122, east: 150, south: 24, north: 46 } as const;

/** 拡大率の範囲。上限は、京都・奈良・大阪のマーカーが重ならずに見分けられる程度（tests/unit/japanMap.test.ts で確認） */
export const MIN_ZOOM = 0.8;
export const MAX_ZOOM = 12;
/** 地図の中心を動かせる範囲（地図データを切り出した範囲の内側） */
export const CENTER_LIMIT = { west: 100, east: 175, south: 14, north: 55 } as const;

export interface MapView {
  lat: number;
  lng: number;
  zoom: number;
}

export interface Size {
  width: number;
  height: number;
}

const RAD = Math.PI / 180;

export function mercY(lat: number): number {
  return Math.log(Math.tan(Math.PI / 4 + (lat * RAD) / 2)) / RAD;
}

export function invMercY(y: number): number {
  return (2 * Math.atan(Math.exp(y * RAD)) - Math.PI / 2) / RAD;
}

/** 緯度経度 → 地図単位 */
export function project(lat: number, lng: number): { x: number; y: number } {
  return { x: lng * MAP_SCALE, y: -mercY(lat) * MAP_SCALE };
}

/** 地図単位 → 緯度経度 */
export function unproject(x: number, y: number): { lat: number; lng: number } {
  return { lat: invMercY(-y / MAP_SCALE), lng: x / MAP_SCALE };
}

export const DEFAULT_VIEW: MapView = {
  lat: invMercY((mercY(JAPAN_BOUNDS.north) + mercY(JAPAN_BOUNDS.south)) / 2),
  lng: (JAPAN_BOUNDS.west + JAPAN_BOUNDS.east) / 2,
  zoom: 1,
};

/** zoom=1 のときの「地図単位 → 画面ピクセル」の倍率（JAPAN_BOUNDS がちょうど収まる） */
export function baseScale(size: Size): number {
  const w = (JAPAN_BOUNDS.east - JAPAN_BOUNDS.west) * MAP_SCALE;
  const h = (mercY(JAPAN_BOUNDS.north) - mercY(JAPAN_BOUNDS.south)) * MAP_SCALE;
  return Math.min(size.width / w, size.height / h);
}

export function pixelScale(view: MapView, size: Size): number {
  return baseScale(size) * view.zoom;
}

/** 緯度経度 → 画面座標（地図の左上が原点） */
export function toScreen(lat: number, lng: number, view: MapView, size: Size): { x: number; y: number } {
  const k = pixelScale(view, size);
  const c = project(view.lat, view.lng);
  const p = project(lat, lng);
  return { x: size.width / 2 + (p.x - c.x) * k, y: size.height / 2 + (p.y - c.y) * k };
}

/** 画面座標 → 緯度経度 */
export function fromScreen(x: number, y: number, view: MapView, size: Size): { lat: number; lng: number } {
  const k = pixelScale(view, size);
  const c = project(view.lat, view.lng);
  return unproject(c.x + (x - size.width / 2) / k, c.y + (y - size.height / 2) / k);
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function clampView(v: MapView): MapView {
  return {
    lat: clamp(v.lat, CENTER_LIMIT.south, CENTER_LIMIT.north),
    lng: clamp(v.lng, CENTER_LIMIT.west, CENTER_LIMIT.east),
    zoom: clamp(v.zoom, MIN_ZOOM, MAX_ZOOM),
  };
}

/** ドラッグで dx, dy ピクセル動かしたあとの表示 */
export function panBy(view: MapView, size: Size, dx: number, dy: number): MapView {
  const k = pixelScale(view, size);
  const c = project(view.lat, view.lng);
  const ll = unproject(c.x - dx / k, c.y - dy / k);
  return clampView({ ...view, ...ll });
}

/** 画面上の点 (x, y) を固定したまま、拡大率を factor 倍にする */
export function zoomAt(view: MapView, size: Size, factor: number, x: number, y: number): MapView {
  const zoom = clamp(view.zoom * factor, MIN_ZOOM, MAX_ZOOM);
  const anchor = fromScreen(x, y, view, size);
  const k2 = baseScale(size) * zoom;
  const a = project(anchor.lat, anchor.lng);
  const ll = unproject(a.x - (x - size.width / 2) / k2, a.y - (y - size.height / 2) / k2);
  return clampView({ ...ll, zoom });
}

/** 2つの表示のあいだを t (0..1) で補間する（中心は地図単位で直線、拡大率は対数で補間） */
export function interpolateView(a: MapView, b: MapView, t: number): MapView {
  const pa = project(a.lat, a.lng);
  const pb = project(b.lat, b.lng);
  const ll = unproject(pa.x + (pb.x - pa.x) * t, pa.y + (pb.y - pa.y) * t);
  return { ...ll, zoom: Math.exp(Math.log(a.zoom) + (Math.log(b.zoom) - Math.log(a.zoom)) * t) };
}

/**
 * 地図の端の矢印の位置：画面上の点 from から方向 (dx, dy) に進んで、余白 margin を取った枠に当たる点。
 * from が枠の外にあるときは画面の中心から進む。
 */
export function edgePoint(
  from: { x: number; y: number },
  dir: { x: number; y: number },
  size: Size,
  margin: number | { top: number; right: number; bottom: number; left: number },
): { x: number; y: number; angle: number } {
  const m = typeof margin === "number" ? { top: margin, right: margin, bottom: margin, left: margin } : margin;
  const L = m.left, R = size.width - m.right, T = m.top, B = size.height - m.bottom;
  const inside = from.x >= L && from.x <= R && from.y >= T && from.y <= B;
  const o = inside ? from : { x: size.width / 2, y: size.height / 2 };
  const len = Math.hypot(dir.x, dir.y) || 1;
  const ux = dir.x / len, uy = dir.y / len;
  let t = Infinity;
  if (ux > 0) t = Math.min(t, (R - o.x) / ux);
  if (ux < 0) t = Math.min(t, (L - o.x) / ux);
  if (uy > 0) t = Math.min(t, (B - o.y) / uy);
  if (uy < 0) t = Math.min(t, (T - o.y) / uy);
  if (!Number.isFinite(t)) t = 0;
  return { x: o.x + ux * t, y: o.y + uy * t, angle: Math.atan2(uy, ux) / RAD };
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
