# World History Globe（MVP）

高校「世界史探究」向けの、インタラクティブな3D世界史Webアプリです。
地球を指やマウスで回しながら、紀元前3000年頃から現代までの出来事を **時間（年代スライダー）** と **場所（地球上の地点）** の両方から探索できます。
画面下の「同時代のできごと」には、いま見ている年の前後に世界の別の場所で起きていた出来事が並びます。

> ⚠️ 収録データ（58件）は **すべて未検証（`verified: false`）** です。出典記事との一次照合の結果は [docs/VERIFICATION.md](docs/VERIFICATION.md) にあります。人間が史実と出典を確認したものだけを `true` にする運用です。

## 使い方

```bash
npm install
npm run dev          # http://localhost:3000
```

| コマンド | 内容 |
|---|---|
| `npm run build` | 静的書き出し（`out/` に出力。`output: 'export'`） |
| `npm run typecheck` | TypeScript 型チェック |
| `npm test` | 単体テスト（年代計算・データ整合性・同時代表示） |
| `npm run test:e2e` | 操作テスト（要 `npm run build`。Playwright + Chromium） |
| `npm run serve` | `out/` をローカル配信（http://127.0.0.1:4173/） |
| `npm run check:sources` | 出典URL（ja.wikipedia.org）の実在を再確認 |

### GitHub Pages で公開する場合（未実施）
サブパスで公開するときは `NEXT_PUBLIC_BASE_PATH=/world-history-globe npm run build` のように basePath を指定してビルドし、`out/` を配信します。デプロイ設定は含めていません。

## 画面

- **3D地球**：ドラッグで回転、ホイール／ピンチでズーム。マーカーは6分類の色とアイコンで区別。
- **年代スライダー**：古代を圧縮し、近現代を拡大する非線形スケール。
- **同時代のできごと**：現在の年の前後（古代±100年〜近現代±10年）に重なる出来事を並べる。2件に満たない年代では、近い時代まで範囲を広げて表示し、その幅を明示する。
- **詳細パネル**：概要・年代（不確実性・継続期間つき）・位置（精度つき）・歴史的な注記・出典・未検証バッジ。スマホではボトムシート。
- **自動再生**：▶で年が進み、注目イベント（`featured`）の開始年を通過するとカメラがその地点へ移動。再生中に地球を触るとカメラ追従はオフになる。
- **年表表示**：WebGL が使えない環境では自動で年表に切り替わる。対応環境でもボタンで切り替え可能。
- 現代の国境線は表示しない（地球画像は国境線を含まない衛星画像）。

## データ（`src/data/events.json`）

型定義は `src/types/event.ts`。主な決まりごと：

- **年は天文学的年号**で保持する（前1年＝0、前2年＝−1、前N年＝1−N）。表示時のみ `src/lib/year.ts` の `formatYear` などで「前○年／○年」に変換する。西暦に0年がないことは、この変換で吸収している。
- 年代の不確実性：`exact`（確定）／`circa`（頃）／`plusMinus`（±n年）／`century`（「前18世紀頃」のように世紀単位でしか言えない場合）。継続期間は `start` と `end`。
- 位置の精度：`exact`（正確な地点）／`city`（都市レベル）／`region`（地域レベル＝代表点）。
- 将来拡張用の `question`（探究の問い）と `relatedEventIds`（関連イベント）は型だけ用意し、MVPでは空。

### 検証の運用
1. 人間が史実（年代・地点・概要・注記）と出典を確認する。`docs/VERIFICATION.md` の一次照合（出典記事の導入部との照合）で「要確認」「判断不能」とした項目から確認するとよい。
2. 問題がなければ、そのイベントの `verified` を `true` にする（UI の「未検証」バッジが「確認済み」に変わる）。
3. 出典は初期値としてウィキペディア日本語版を置いているが、三次資料のため、確認時に教科書・学術資料へ差し替えることを推奨。

### 出典と文章の方針
- 出典URLは、存在を確認できた記事だけを載せる。確認できない場合は空欄にし、推測で作らない。
- 使用している77記事すべてについて、MediaWiki API で記事が存在することを確認済み（2026-10-30〜31。作業環境からは ja.wikipedia.org へ直接接続できなかったため、Exa の Web 取得機能経由で API を呼んだ）。曖昧さ回避ページ・転送ページでないことも確認している。`npm run check:sources` で再確認できる。
- ウィキペディアの文章は CC BY-SA のため、**概要・注記はすべて独自の文章**で書き、ウィキペディアは**リンクの掲載のみ**としている。

## クレジットとライセンス

### 利用しているOSS
| パッケージ | バージョン | ライセンス |
|---|---|---|
| next | 16.4.3 | MIT |
| react / react-dom | 19.2.0 | MIT |
| react-globe.gl | 2.38.0 | MIT |
| three | 0.180.0 | MIT |
| three-globe（テクスチャ同梱元） | 2.45.6 | MIT |
| typescript（開発用） | 5.9.3 | Apache-2.0 |
| vitest（開発用） | 5.0.5 | MIT |
| playwright（開発用・環境にプリインストール済みのものを使用） | 1.63.0 | Apache-2.0 |

### 地球の画像
- `public/textures/earth-blue-marble.jpg` は three-globe（MIT）の `example/img/earth-blue-marble.jpg` をコピーしたもの。
- 画像は **NASA の「Blue Marble」に由来する画像** と考えられる（Imagery: NASA Blue Marble）。three-globe のライセンス文は `public/textures/LICENSE-three-globe.txt` に同梱。

### 技術参考：haakram/WHW（MIT License, Copyright (c) 2026 haakram）
コードはコピーしていません。次の考え方のみ参考にし、実装は独自に行いました。
1. react-globe.gl を `next/dynamic` + `ssr: false` でクライアント限定で読み込む構成（`src/components/globe/GlobeLoader.tsx`）
2. react-globe.gl に `width`/`height` を明示しないとウィンドウ全体の大きさで描画される点への対処（`useElementSize`）
3. 古代を圧縮し近現代を拡大する非線形タイムスライダーと、時代別の再生ステップ（`src/lib/timeScale.ts`）
4. three-globe 同梱テクスチャを `public/` に置き、CDN に依存しない構成

意図的な相違点：WHW は「0年なし」の暦年（前1年＝−1）で年を保持していますが、本プロジェクトは天文学的年号（前1年＝0）で保持しています。
なお WHW がビルド時に取得する歴史的国境データ（aourednik/historical-basemaps）は GPL-3.0 であり、本プロジェクトでは使用していません。

## 未確認事項
- **地球画像の正確な出どころ**：three-globe のリポジトリでは、この画像は 2019-03-17 のコミット「Add blue marble」で追加されている。ただしコミットにも README にも、元画像（NASA のどのデータセットか、加工の有無）の記載はなかった。NASA 由来であることは画像名と見た目からの推定にとどまり、**確認できていない**。
- **出典の内容**：記事の導入部との一次照合は行った（`docs/VERIFICATION.md`）。本文までの照合と、教科書・学術資料との照合は未実施（＝`verified: false` の理由）。
- 実機（iOS Safari / Android Chrome）での動作は未確認。スマホ幅の確認は Chromium のエミュレーション（iPhone 13 相当）で行った。
