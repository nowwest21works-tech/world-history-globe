#!/usr/bin/env python3
"""日本モードの背景（地形が見える陰影起伏の画像）を Natural Earth のラスターから作る。

    python scripts/build-japan-relief.py <NE1_HR_LC_SR_W_DR.tif> [出力先ディレクトリ]

素材：Natural Earth 1:10m「Natural Earth I with Shaded Relief, Water, and Drainages」
      （NE1_HR_LC_SR_W_DR、21600×10800、正距円筒図法、パブリックドメイン）。
      取得例（必要な .tif の blob を1つだけ取る）：
        git clone --filter=blob:none --no-checkout --depth 1 https://github.com/nvkelso/natural-earth-raster.git ner
        cd ner && git cat-file -p HEAD:10m_rasters/NE1_HR_LC_SR_W_DR/NE1_HR_LC_SR_W_DR.tif > NE1_HR_LC_SR_W_DR.tif
      （約700MB。リポジトリには入れない）

処理：
  1. 正距円筒図法の画像を、アプリと同じメルカトル図法（src/lib/japanMap.ts の mercY）に投影し直す。
     出力の1画素は「経度方向に 1/R 度、メルカトル緯度方向に 1/R 度」。地図単位（1/100度）にそのまま重なる。
  2. 海を濃紺に、陸を少し暗くする（tone。アプリの暗い画面と、世界の地球儀の衛星写真ふうの見た目に合わせる）。
  3. 2段階の解像度で書き出す（public/japan/）。
       relief-lo.webp … 地図データと同じ広い範囲（東経96〜178度・北緯10〜58度）、1度あたり20画素
       relief-hi.webp … 初期表示の範囲（東経122〜150度・北緯24〜46度）、1度あたり60画素（原寸）
  4. 範囲は src/data/japan-relief.json に書き、アプリはその値で <image> を地図単位に置く。

依存：Pillow・numpy・tifffile（scratchpad の仮想環境などに入れる）。現代の国境・県境は含まない（素材にない）。
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np
import tifffile
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC_PX_PER_DEG = 60  # 21600 / 360
LAYERS = [
    # name, west, east, south, north, 画素/度, WebP の品質
    ("lo", 96, 178, 10, 58, 20, 74),
    ("hi", 122, 150, 24, 46, 60, 76),
]


def merc_y(lat: float | np.ndarray):
    return np.degrees(np.log(np.tan(np.pi / 4 + np.radians(lat) / 2)))


def inv_merc_y(y: np.ndarray) -> np.ndarray:
    return np.degrees(2 * np.arctan(np.exp(np.radians(y))) - np.pi / 2)


def reproject(src: np.ndarray, west, east, north, w, h, ppd) -> np.ndarray:
    """src（正距円筒、画素の中心が (-180 + (i+0.5)/60, 90 - (j+0.5)/60)）から、左上が (west, north)、
    w×h 画素（1画素 = 経度・メルカトル緯度とも 1/ppd 度）のメルカトルの画像を双線形補間で作る"""
    y_top = float(merc_y(north))
    lng = west + (np.arange(w) + 0.5) / ppd
    lat = inv_merc_y(y_top - (np.arange(h) + 0.5) / ppd)
    col = (lng + 180) * SRC_PX_PER_DEG - 0.5
    row = (90 - lat) * SRC_PX_PER_DEG - 0.5
    c0 = np.floor(col).astype(int)
    r0 = np.floor(row).astype(int)
    fc = (col - c0)[None, :, None]
    fr = (row - r0)[:, None, None]
    # 必要な行・列だけを切り出してから補間する（メモリ節約）
    rs, re = r0.min(), r0.max() + 2
    cs, ce = c0.min(), c0.max() + 2
    sub = src[rs:re, cs:ce].astype(np.float32)
    r = (r0 - rs)[:, None]
    c = (c0 - cs)[None, :]
    a = sub[r, c] * (1 - fc) + sub[r, c + 1] * fc
    b = sub[r + 1, c] * (1 - fc) + sub[r + 1, c + 1] * fc
    out = a * (1 - fr) + b * fr
    return np.clip(out + 0.5, 0, 255).astype(np.uint8)


NAVY = np.array([16, 38, 70], np.float32)


def tone(a: np.ndarray) -> np.ndarray:
    """アプリの暗い画面になじむよう、海を濃紺に（海底地形の陰影は明るさとして残す）、陸を少し暗くする"""
    a = a.astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    # 水域らしさ（0..1）：青が赤・緑より強いほど水。海岸の混じった画素はなめらかに混ぜる
    wf = (np.clip(((b - r) - 8) / 20, 0, 1) * np.clip(((b - g) + 2) / 10, 0, 1))[..., None]
    lum = (0.3 * r + 0.59 * g + 0.11 * b) / 255
    water = NAVY * np.clip(lum / 0.64, 0.5, 1.6)[..., None]
    land = 255 * (a / 255) ** 1.6 * 0.86
    return np.clip(land * (1 - wf) + water * wf + 0.5, 0, 255).astype(np.uint8)


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    tif = Path(sys.argv[1])
    out_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / "public" / "japan"
    out_dir.mkdir(parents=True, exist_ok=True)
    src = tifffile.memmap(tif) if tifffile.TiffFile(tif).pages[0].compression == 1 else tifffile.imread(tif)
    assert src.shape[:2] == (10800, 21600), src.shape
    meta = {"source": tif.stem, "layers": {}}
    for name, west, east, south, north, ppd, quality in LAYERS:
        # 画素数は整数に丸めるので、南端は丸めた画素数から逆算した値にする（画像を地図単位にぴったり重ねるため）
        y_top = float(merc_y(north))
        w = round((east - west) * ppd)
        h = round((y_top - float(merc_y(south))) * ppd)
        south_exact = float(inv_merc_y(np.array(y_top - h / ppd)))
        # いったん原寸（60画素/度）で投影し、必要ならちょうど整数分の1に縮小する
        f = SRC_PX_PER_DEG // ppd
        img = Image.fromarray(tone(reproject(src, west, east, north, w * f, h * f, SRC_PX_PER_DEG)))
        if f != 1:
            img = img.resize((w, h), Image.LANCZOS)
        path = out_dir / f"relief-{name}.webp"
        img.save(path, "WEBP", quality=quality, method=6)
        print(f"{path.relative_to(ROOT) if path.is_relative_to(ROOT) else path}: {img.size[0]}x{img.size[1]}, {path.stat().st_size // 1024} KB")
        meta["layers"][name] = {
            "file": f"/japan/relief-{name}.webp",
            "west": west,
            "east": east,
            "south": round(south_exact, 6),
            "north": north,
            "width": img.size[0],
            "height": img.size[1],
            "pxPerDeg": ppd,
        }
    if out_dir == ROOT / "public" / "japan":
        (ROOT / "src" / "data" / "japan-relief.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    main()
