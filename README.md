# World History Globe（MVP）

高校「世界史探究」向けの、インタラクティブな3D世界史Webアプリです。
地球を指やマウスで回しながら、紀元前3000年頃から現代までの出来事を **時間（年代スライダー）** と **場所（地球上の地点）** の両方から探索できます。
画面下の「同時代のできごと」には、いま見ている年の前後に世界の別の場所で起きていた出来事が並びます。

ヘッダーの「🌏 世界／🗾 日本」で **日本史モード**（日本周辺の平面地図と、旧石器時代から現代までの年表）に切り替えられます。元寇・鉄砲伝来・石見銀山・開国のような場面で、日本地図と地球儀を行き来しながら「同じころ、世界では？」と「つながり」をたどれます。設計は [docs/JAPAN_SPEC.md](docs/JAPAN_SPEC.md)。

> ⚠️ 収録データ（世界史152件・日本史120件）、学習ツアー（8本）、作品データ（39本）の文面は **すべて未検証（`verified: false`）** です。出典記事との一次照合の結果は [docs/VERIFICATION.md](docs/VERIFICATION.md)（世界史）と [docs/VERIFICATION-JAPAN.md](docs/VERIFICATION-JAPAN.md)（日本史）にあります。高校「世界史探究」の単元ごとの収録状況は [docs/COVERAGE.md](docs/COVERAGE.md)、「日本史探究」は [docs/COVERAGE-JAPAN.md](docs/COVERAGE-JAPAN.md)（どちらも `npm run coverage:doc` で再生成。日本史の単元定義は `src/data/units-japan.json`）にあります。人間が史実と出典を確認したものだけを `true` にする運用です。

## 使い方

```bash
npm install
npm run dev          # http://localhost:3000
```

| コマンド | 内容 |
|---|---|
| `npm run build` | 静的書き出し（`out/` に出力。`output: 'export'`） |
| `npm run typecheck` | TypeScript 型チェック |
| `npm test` | 単体テスト（年代計算・データ整合性・同時代表示・作品データ・日本モード） |
| `npm run test:e2e` | 操作テスト（要 `npm run build`。Playwright + Chromium） |
| `npm run serve` | `out/` をローカル配信（http://127.0.0.1:4173/） |
| `npm run check:sources` | 出典URL（ja.wikipedia.org）の実在を再確認（世界史・日本史のイベントと作品） |
| `npm run map:japan` | 日本モードの地図データ `src/data/japan-land.json` を Natural Earth から作り直す（`scripts/build-japan-map.mjs`） |

### GitHub Pages での公開
`.github/workflows/deploy-pages.yml` が、main への push 時と Actions 画面からの手動実行で動きます。
型チェックと単体テストのあと、`NEXT_PUBLIC_BASE_PATH=/リポジトリ名` で静的書き出しし、`out/`（`.nojekyll` を含む）を GitHub Pages にデプロイします。

初回だけ、リポジトリの **Settings → Pages → Build and deployment → Source** を **GitHub Actions** にしてください。

サブパス付きの状態をローカルで確かめるとき：

```bash
NEXT_PUBLIC_BASE_PATH=/world-history-globe npm run build
NEXT_PUBLIC_BASE_PATH=/world-history-globe npm run test:e2e   # 操作テスト
NEXT_PUBLIC_BASE_PATH=/world-history-globe npm run serve      # http://127.0.0.1:4173/world-history-globe/
```

### 試作版の表示
`src/config/site.ts` の `PREVIEW_MODE` 1か所で切り替えます。

- `true`（現在）：画面上部に「試作版｜掲載内容は検証中です」の帯（×で閉じられる。閉じた状態はそのタブのあいだ保持）を出し、`<meta name="robots" content="noindex">` を出力する。
- `false`：帯も noindex も出さない。

## 画面

- **3D地球**：ドラッグで回転、ホイール／ピンチでズーム。マーカーは6分類の色とアイコンで区別。
- **年代スライダー**：古代を圧縮し、近現代を拡大する非線形スケール。
- **同時代のできごと**：現在の年の前後（古代±100年〜近現代±10年）に重なる出来事を並べる。2件に満たない年代では、近い時代まで範囲を広げて表示し、その幅を明示する。
- **同じ地点のマーカー**：0.3度以内（最大までズームしても見分けられない距離）にあるイベントは1つのマーカーにまとめて件数のバッジを付け、押すと一覧から選べる。地点そのものはずらさない。
- **詳細パネル**：概要・年代（不確実性・継続期間つき）・位置（精度つき）・歴史的な注記・出典・未検証バッジ。スマホではボトムシート。
- **自動再生**：▶で年が進み、注目イベント（`featured`）の開始年を通過するとカメラがその地点へ移動。再生中に地球を触るとカメラ追従はオフになる。
- **年表表示**：WebGL が使えない環境では自動で年表に切り替わる。対応環境でもボタンで切り替え可能。
- **学習ツアー「歴史を旅する」**：同時代型（ある年に止まって世界を巡る）とつながり型（弧で結びながら時代を追う）の4本。前へ／次へ・途中で抜ける・`?tour=paper&step=3` のような URL からの直接開始ができる。つながりの確かさを線の種類（史実＝実線、伝承＝破線、諸説あり＝点線）で示す。設計は [docs/TOURS.md](docs/TOURS.md)。
- **作品から探す**：ヘッダーの「作品から探す」から、歴史を描いた漫画・アニメ・映画・ドラマ・小説・舞台（39本。日本史の大河ドラマ『龍馬伝』『真田丸』『鎌倉殿の13人』を含む）を選ぶと、年代スライダーがその時代に合わせて動き、紐づく出来事へカメラが移動して詳細が開く。一覧は描いている時代の古い順で、題名・作者の検索（ひらがな／カタカナの違いは吸収）と媒体での絞り込みができる。`?work=kingdom-hara` のような URL から直接開ける（`?tour=` と両方あればツアーを優先）。
  - イベント詳細の「この時代を描いた作品」に、作品ごとの「史実との距離」（史実ベース／史実の枠に創作／時代を借りた創作）と、**「作品と史実のあいだ」の問い**を表示する。作品は入口で、違いは断定せず問いとして示し、答えは出典・教科書へ向かわせる。年表表示では、作品が紐づく出来事に「作品 n」が付く。
  - 画像（書影・ポスター・スチルなど）は一切使わず、紹介文・あらすじも載せない。運用ルール・選定基準・ウィキペディアとの照合記録は [docs/WORKS.md](docs/WORKS.md)、実装指示は [docs/WORKS_SPEC.md](docs/WORKS_SPEC.md)。
- 現代の国境線は表示しない（地球画像は国境線を含まない衛星画像）。

### 日本史モード（`?mode=japan`）
- **切り替え**：ヘッダーの「🌏 世界」「🗾 日本」（スマホでは地図の右上）。URL は `?mode=japan`（省略時は世界）で、`?tour=`・`?work=`・`?event=<id>` と組み合わせられる。切り替えても年はそのまま引き継ぎ、範囲の外なら端に合わせる。選んでいたイベントが両方の地図に出る共有イベントなら、選択も引き継ぐ。
- **日本地図**：日本周辺（目安は北緯24〜46度・東経122〜150度。琉球・北海道・樺太南部・朝鮮半島・大陸沿岸が入る）の平面地図（SVG・メルカトル図法）。ドラッグで移動、ホイール・ピンチ・＋／－で拡大縮小。拡大の上限は京都・奈良・大阪のマーカーが重ならずに見分けられる程度。**海岸線（陸と海）だけを描き、現代の県境・国境は描かない。** WebGL を使わないので、WebGL 非対応の端末でも地図が出る。
- **年代スライダー**：前3万年頃（旧石器時代）〜現代。先史時代を強く圧縮し、時代区分（旧石器〜令和）を薄い帯で添える。**時代区分の境目には諸説あるため「目安」と明記**している（`src/lib/japanEras.ts`）。
- **世界との連動**：
  - **共有イベント**：既存の日本の出来事（平安京・曇徴・江戸幕府の対外政策・明治維新・日露戦争・原爆投下）は作り直さず `scopes: ["world","japan"]` にして両方の地図に出す。日本側の新しいイベントで世界史としても重要なもの（元寇・石見銀山・ペリー来航）は地球儀にも出す（importance 3 の数件に限定）。
  - **「世界とのつながり」**：イベント詳細に、`relatedEventIds`（向きは問わない）のうちもう一方のモードにあるものを「🌏 世界史で見る」「🗾 日本史で見る」のカードで出す。押すとモードを切り替え、その年・その地点へ移り、詳細を開く。
  - **「同じころ、世界では？／日本では？」**：同時代リストに、もう一方のモードの出来事を別の段で出す（押すと切り替えて開く）。
  - **地図の端の矢印**：日本地図で、選んだイベントとつながる世界のイベントの方角へ、地図の端から矢印を出す（押すとカードと同じ動き）。
  - **モードをまたぐツアー**：ツアーのステップごとに `mode` を持ち、途中で地球儀と日本地図が切り替わる（「元寇――ユーラシアの嵐が博多湾へ」「銀が世界をめぐる」）。日本地図だけで巡る同時代型「1600年、日本では？ 世界では？」もある（画面下の「同じころ、世界では？」の段とあわせて見る）。

## データ（`src/data/events.json`・`src/data/events-japan.json`）

型定義は `src/types/event.ts`。世界史は `events.json`、日本史は `events-japan.json`（ID は `jp-` で始める）。ID は世界・日本を通して一意で、`relatedEventIds` は両方をまたいで参照してよい（整合性チェックは `src/lib/validate.ts` の `validateAllEvents`）。主な決まりごと：

- **年は天文学的年号**で保持する（前1年＝0、前2年＝−1、前N年＝1−N）。表示時のみ `src/lib/year.ts` の `formatYear` などで「前○年／○年」に変換する。西暦に0年がないことは、この変換で吸収している。
- 年代の不確実性：`exact`（確定）／`circa`（頃）／`plusMinus`（±n年）／`century`（「前18世紀頃」のように世紀単位でしか言えない場合）。継続期間は `start` と `end`。
- 位置の精度：`exact`（正確な地点）／`city`（都市レベル）／`region`（地域レベル＝代表点）。
- `relatedEventIds`（関連イベント）はツアーの弧と「世界とのつながり」に使う。`question`（探究の問い）は型だけ用意し、問いはツアー側に持たせている。
- `scopes`（任意）：どちらの地図に出すか。省略時は `events.json` は `["world"]`、`events-japan.json` は `["japan"]`。`era`（任意）：日本モードの時代区分（目安）。日本の地図に出るイベントには必ず付ける。

### 検証の運用
1. 人間が史実（年代・地点・概要・注記）と出典を確認する。`docs/VERIFICATION.md` の一次照合（出典記事の導入部との照合）で「要確認」「判断不能」とした項目から確認するとよい。
2. 問題がなければ、そのイベントの `verified` を `true` にする（UI の「未検証」バッジが「確認済み」に変わる）。
3. 出典は初期値としてウィキペディア日本語版を置いているが、三次資料のため、確認時に教科書・学術資料へ差し替えることを推奨。

### 出典と文章の方針
- 出典URLは、存在を確認できた記事だけを載せる。確認できない場合は空欄にし、推測で作らない。
- 使用している198記事すべてについて、MediaWiki API で記事が存在することを確認済み（2026-10-30〜31。作業環境からは ja.wikipedia.org へ直接接続できなかったため、Exa の Web 取得機能経由で API を呼んだ）。曖昧さ回避ページ・転送ページでないことも確認している。`npm run check:sources` で再確認できる。
- 作品データ（`src/data/works.json`）の出典46記事も、同じ方法（Exa 経由で MediaWiki API）で存在・曖昧さ回避でないこと・転送でないことを確認した（2026-11-05）。
- 日本史のイベント（`src/data/events-japan.json`）と世界史に足した「高麗」の出典記事も、同じ方法で存在・曖昧さ回避でないこと・転送でないことを確認した（2026-11-05〜06）。照合記録は [docs/VERIFICATION-JAPAN.md](docs/VERIFICATION-JAPAN.md)。作者・初出年・メディア展開の照合と、修正・未確認の項目は [docs/WORKS.md](docs/WORKS.md) にある。
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

日本モードのために新しく追加した依存ライブラリはない（地図の投影・描画は `src/lib/japanMap.ts` で自作。指示書で候補に挙がっていた d3-geo（ISC）は、メルカトル図法1つだけなら自作で足りるため使っていない）。

### 日本モードの地図（地図：Natural Earth）
- `src/data/japan-land.json` は **Natural Earth** の 1:10m 陸地（`ne_10m_land`）と小島（`ne_10m_minor_islands`）を、`scripts/build-japan-map.mjs` で日本周辺（東経96〜178度・北緯10〜58度）に切り出し、メルカトル図法で投影して点を間引いたもの（約60KB）。取得元は GitHub の [nvkelso/natural-earth-vector](https://github.com/nvkelso/natural-earth-vector)（master、2026-11-05 時点のコミット `ca96624`）。
- Natural Earth のデータは **パブリックドメイン**（同リポジトリの LICENSE.md：「All versions of Natural Earth raster + vector map data … are in the public domain」）。表記は不要とされているが、画面の地図の隅とフッター、この README に「地図：Natural Earth」と入れている。
- 陸地（land）のデータには国境・県境の線は含まれない。陸と海の区別（海岸線）だけを描いている。
- 再生成：`npm run map:japan`（GitHub から取得）または `node scripts/build-japan-map.mjs <ダウンロードしたフォルダ>`。

#### 背景の陰影起伏（地形が見える衛星写真ふうの背景）
- `public/japan/relief-lo.webp`（東経96〜178度・北緯10〜58度、1度あたり20画素）と `public/japan/relief-hi.webp`（東経122〜150度・北緯24〜46度、1度あたり60画素＝原寸）は、**Natural Earth の 1:10m ラスター「Natural Earth I with Shaded Relief, Water, and Drainages」（`NE1_HR_LC_SR_W_DR`、21600×10800、正距円筒図法）** から作ったもの。こちらも **パブリックドメイン**（上記と同じ LICENSE.md）。取得元は GitHub の [nvkelso/natural-earth-raster](https://github.com/nvkelso/natural-earth-raster)（コミット `f04832c`）の `10m_rasters/NE1_HR_LC_SR_W_DR/`。
- 植生の色・陰影起伏（山地）・湖（琵琶湖など）・主な川が入っている。現代の国境・県境・地名は含まない。
- `scripts/build-japan-relief.py` で、アプリと同じメルカトル図法に投影し直し（地図の座標と画素が一致する）、海を濃紺に・陸を少し暗くして（暗い画面と世界の地球儀に合わせる）、WebP で書き出す（合計約290KB）。範囲は `src/data/japan-relief.json` に入り、画面ではベクターの海岸線を細い線として上に重ねている。
- 低解像度を先に読み込み、拡大したとき（または画素密度の高い画面）だけ高解像度を読み込む。画像を読み込めないときは、これまでのベクターの陸地（塗りつぶし）で描く。
- 再生成：元の .tif（約700MB）は大きいのでリポジトリに入れない。`git clone --filter=blob:none --no-checkout --depth 1 https://github.com/nvkelso/natural-earth-raster.git` のあと `git cat-file -p HEAD:10m_rasters/NE1_HR_LC_SR_W_DR/NE1_HR_LC_SR_W_DR.tif > NE1_HR_LC_SR_W_DR.tif` で1つだけ取り、Pillow・numpy・tifffile を入れた Python で `python scripts/build-japan-relief.py NE1_HR_LC_SR_W_DR.tif`。
- 比べた候補：`NE1_HR_LC_SR_W`（同じ見た目だが湖と川がなく、琵琶湖が陸になる）、`HYP_HR_SR_OB_DR`（標高を段彩で塗る地図帳ふうの見た目で、衛星写真ふうではない）。

- **採用しなかった候補**：
  - 国土地理院の地図タイル：現代の地名・行政界が入ること、タイル配信サーバーに依存してオフライン・静的書き出しで完結しなくなることから見送った。
  - 3D地球儀のズームで日本を見せる案：京都・奈良・大阪のような近い地点を見分けられず、地表画像も粗くなるため見送った（指示書 1.2）。
  - Natural Earth の 1:50m／1:110m：瀬戸内海の島々や琉球の島が欠けたり粗くなったりするため、1:10m を間引いて使った。

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
- 日本モードの時代区分の境目は目安で、教科書によって区切り方が異なる（`src/lib/japanEras.ts` の注記）。
