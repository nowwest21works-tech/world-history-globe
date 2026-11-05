// 日本モードの地図データ（src/data/japan-land.json）を Natural Earth から作る。
//
//   node scripts/build-japan-map.mjs                 … GitHub（nvkelso/natural-earth-vector）から取得して作る
//   node scripts/build-japan-map.mjs <dir>           … <dir> に置いた ne_10m_land.geojson / ne_10m_minor_islands.geojson から作る
//
// 処理：
//   1. Natural Earth の 1:10m 陸地（land）と小島（minor islands）を読む（パブリックドメイン）
//   2. 日本周辺の範囲（CLIP）で多角形を切り取る（Sutherland–Hodgman 法）
//   3. メルカトル図法で平面に投影し（x = 経度、y = −メルカトル緯度。単位は「度」）、100倍して整数に丸める
//   4. Douglas–Peucker 法で点を間引き、小さすぎる島を落とす
//   5. 1本の SVG パス文字列として書き出す（現代の国境・県境は含まない。陸と海の区別だけ）
//
// 依存ライブラリは使わない（投影はアプリ側の src/lib/japanMap.ts と同じ式）。
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const REPO = "nvkelso/natural-earth-vector";
const REF = process.env.NE_REF ?? "master";
const FILES = ["ne_10m_land.geojson", "ne_10m_minor_islands.geojson"];

/** 切り取る範囲（経度・緯度）。表示の範囲（東経122〜150度・北緯24〜46度）より広く取り、横長の画面でも端が切れないようにする */
const CLIP = { west: 96, east: 178, south: 10, north: 58 };
/** 座標の倍率（1/100度 ≒ 1km 単位で丸める） */
const SCALE = 100;
/** 間引きの許容誤差（1/100度単位） */
const TOLERANCE = 1.1;
/** これより小さい（1/100度単位の面積）島は落とす */
const MIN_AREA = 6;

const mercY = (lat) => (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));

async function load(name) {
  const dir = process.argv[2];
  if (dir) return JSON.parse(readFileSync(join(dir, name), "utf8"));
  const url = `https://raw.githubusercontent.com/${REPO}/${REF}/geojson/${name}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

/** 長方形での多角形の切り取り（Sutherland–Hodgman）。ring は [lng, lat] の配列（閉じていなくてよい） */
function clipRing(ring) {
  const edges = [
    (p) => p[0] >= CLIP.west,
    (p) => p[0] <= CLIP.east,
    (p) => p[1] >= CLIP.south,
    (p) => p[1] <= CLIP.north,
  ];
  const cross = [
    (a, b) => lerpAt(a, b, 0, CLIP.west),
    (a, b) => lerpAt(a, b, 0, CLIP.east),
    (a, b) => lerpAt(a, b, 1, CLIP.south),
    (a, b) => lerpAt(a, b, 1, CLIP.north),
  ];
  let out = ring;
  for (let k = 0; k < 4; k++) {
    const input = out;
    out = [];
    if (input.length === 0) break;
    for (let i = 0; i < input.length; i++) {
      const cur = input[i];
      const prev = input[(i + input.length - 1) % input.length];
      const inCur = edges[k](cur);
      const inPrev = edges[k](prev);
      if (inCur) {
        if (!inPrev) out.push(cross[k](prev, cur));
        out.push(cur);
      } else if (inPrev) out.push(cross[k](prev, cur));
    }
  }
  return out;
}
function lerpAt(a, b, axis, v) {
  const t = (v - a[axis]) / (b[axis] - a[axis]);
  const p = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
  p[axis] = v;
  return p;
}

/** Douglas–Peucker（開いた折れ線として扱う） */
function simplify(pts, tol) {
  if (pts.length <= 2) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    let maxD = -1;
    let idx = -1;
    const [ax, ay] = pts[s];
    const [bx, by] = pts[e];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    for (let i = s + 1; i < e; i++) {
      const [px, py] = pts[i];
      let d;
      if (len2 === 0) d = Math.hypot(px - ax, py - ay);
      else {
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
        d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      }
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > tol) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

const area = (pts) => {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
};

const polygonsOf = (geom) =>
  geom.type === "Polygon" ? [geom.coordinates] : geom.type === "MultiPolygon" ? geom.coordinates : [];

const parts = [];
let ringsIn = 0;
let pointsOut = 0;
for (const name of FILES) {
  const fc = await load(name);
  for (const f of fc.features) {
    for (const poly of polygonsOf(f.geometry)) {
      for (const ring of poly) {
        ringsIn++;
        // すべての点が範囲の外にある輪は早めに落とす
        if (!ring.some(([x, y]) => x >= CLIP.west - 5 && x <= CLIP.east + 5 && y >= CLIP.south - 5 && y <= CLIP.north + 5)) continue;
        const open = ring.length > 1 && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1] ? ring.slice(0, -1) : ring;
        const clipped = clipRing(open);
        if (clipped.length < 3) continue;
        const projected = clipped.map(([lng, lat]) => [lng * SCALE, -mercY(lat) * SCALE]);
        const simple = simplify([...projected, projected[0]], TOLERANCE).slice(0, -1);
        const rounded = [];
        for (const [x, y] of simple) {
          const p = [Math.round(x), Math.round(y)];
          const last = rounded.at(-1);
          if (!last || last[0] !== p[0] || last[1] !== p[1]) rounded.push(p);
        }
        if (rounded.length < 3 || area(rounded) < MIN_AREA) continue;
        pointsOut += rounded.length;
        // 相対座標の SVG パス（M 絶対 → l 相対の連続 → z）
        let d = `M${rounded[0][0]} ${rounded[0][1]}l`;
        for (let i = 1; i < rounded.length; i++) {
          const dx = rounded[i][0] - rounded[i - 1][0];
          const dy = rounded[i][1] - rounded[i - 1][1];
          d += `${i > 1 && dx >= 0 ? " " : ""}${dx}${dy >= 0 ? " " : ""}${dy}`;
        }
        parts.push(d + "z");
      }
    }
  }
}

const out = {
  source: "Natural Earth 1:10m Land / Minor Islands（パブリックドメイン）",
  sourceRepo: `https://github.com/${REPO}`,
  note: "scripts/build-japan-map.mjs で生成。手で編集しない。メルカトル図法（x=経度、y=−メルカトル緯度）を100倍した整数座標。現代の国境・県境は含まない。",
  clip: CLIP,
  scale: SCALE,
  path: parts.join(""),
};
const file = new URL("../src/data/japan-land.json", import.meta.url);
writeFileSync(file, JSON.stringify(out) + "\n");
const bytes = Buffer.byteLength(JSON.stringify(out));
console.log(`輪 ${ringsIn} → ${parts.length}、点 ${pointsOut}、${(bytes / 1024).toFixed(1)} KB → src/data/japan-land.json`);
