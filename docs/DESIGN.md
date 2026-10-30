# World History Globe — 第1段階 設計書（承認待ち）

対象：高校「世界史探究」／MVP
状態：**設計のみ。実装は承認後に着手。**

---

## 1. アーキテクチャ

| 層 | 採用 | ライセンス | 備考 |
|---|---|---|---|
| フレームワーク | Next.js 16（App Router）+ TypeScript strict | MIT | `output: 'export'`、`images.unoptimized`、`trailingSlash: true` |
| 3D地球 | react-globe.gl 2.38（three-globe / three.js） | いずれも MIT | `next/dynamic(..., { ssr: false })` でクライアント限定読み込み |
| テクスチャ | three-globe 同梱 `example/img/earth-blue-marble.jpg` 等を `public/textures/` へコピー | パッケージは MIT。元画像は NASA Blue Marble（※要確認：後述） | **国境線を含まない**衛星画像のみ使用 |
| データ | `src/data/events.json`（外部DBなし） | 自作 | ビルド時に型＋バリデーション |
| テスト | Vitest（単体）／Playwright（操作・E2E、環境にプリインストール済） | MIT／Apache-2.0 | |
| 状態管理 | React の `useReducer` + Context（外部ライブラリなし） | — | |

```
src/
  app/            layout.tsx, page.tsx, globals.css
  components/
    globe/        GlobeView.tsx（react-globe.gl本体） / GlobeLoader.tsx（dynamic, ssr:false）
    timeline/     TimeSlider.tsx, PlayControls.tsx, ContemporaryStrip.tsx（同時代のできごと）
    panel/        EventDetail.tsx（PC=右パネル / SP=ボトムシート）, UnverifiedBadge.tsx
    legend/       CategoryLegend.tsx（6分類・表示切替）
    fallback/     ChronologyList.tsx（WebGL非対応時の年表）
  lib/
    year.ts       天文学的年号 ⇔ 表示 の変換（純関数・単体テスト対象）
    timeScale.ts  スライダー位置 ⇔ 年（非線形）・再生ステップ
    visibility.ts 現在年に対し「いま起きている／同時代」のイベント抽出
    categories.ts 6分類の色・アイコン（自作SVG）
    webgl.ts      WebGL 対応判定
    validate.ts   events.json の検証
  data/events.json
  types/event.ts
scripts/check-sources.ts   出典URLの実在確認（HTTP 200 以外は空欄に戻す）
tests/unit/*.test.ts, tests/e2e/*.spec.ts
```

- **GitHub Pages 対応**：`basePath` を環境変数 `NEXT_PUBLIC_BASE_PATH` で切替（ローカルは空）。テクスチャ等のパスも basePath 経由で解決。デプロイ設定（Actions）は**作らない**（公開は別途承認）。
- **国境線**：表示しない。ポリゴン層は使わず、地点マーカーのみ。

## 2. 画面構成

```
PC（≥ 768px）
┌──────────────────────────────────────────────┐
│ World History Globe   [前221年]      [年表表示] │ ← ヘッダ（現在年を大きく）
│ ┌凡例/分類フィルタ┐                ┌詳細パネル──┐ │
│ │● 政治・国家 …  │   3D 地球       │ 秦の統一   │ │
│ └───────────────┘  （ドラッグ/ズーム）│ 前221年    │ │
│                                    │ 位置:都市級 │ │
│                                    │ 出典…      │ │
│                                    │ ⓘ未検証    │ │
│                                    └───────────┘ │
│ 同時代のできごと: [ローマ…][アショーカ…][…]     │ ← 同時代ストリップ
│ ▶ ×1  ├──────●──────────────────────┤        │ ← 年代スライダー
│       前3000   前500  1   1000  1500 1800 1900 2025│
└──────────────────────────────────────────────┘
スマホ（< 768px）：凡例はボタン化、詳細はボトムシート（半分の高さ・スワイプ/×で閉じる）、
スライダーは全幅・つまみ大きめ（44px タップ領域）。
```

- **マーカー**：react-globe.gl の `htmlElementsData` で「色付き円＋分類アイコン」を描画（クリック/タップ可）。選択中はリング（`ringsData`）で強調。
- **表示ルール**：現在年 `y` に対し、`[開始 − W, 終了 + W]` に入るイベントを表示（W は時代で可変：前500年以前 100年、〜1500年 50年、〜1800年 20年、以降 10年）。「全期間を薄く表示」トグルあり。
- **同時代ストリップ**：上記ウィンドウ内のイベントを地域横断で並べる → 「同じ時代に別の場所で何が」の気づきの中核。
- **自動再生**：▶で年が進む（時代別ステップ：古代 25年/tick 〜 近代 1年/tick、速度 ×1/×2/×4）。`featured: true` のイベントの開始年を通過したら、その地点へ `pointOfView(..., 1500ms)` でカメラ移動し、詳細を一時表示。ユーザーがドラッグしたら追従を一時停止。
- **WebGL非対応**：起動時に判定 → `ChronologyList`（時代別の年表＋同じ詳細パネル）。対応環境でも「年表表示」ボタンで切替可（アクセシビリティ兼用）。
- **未検証表示**：詳細パネルに灰色の小バッジ「未検証」＋説明「史実・出典は人間による確認前です」。フッターに一行注記。

## 3. 年代モデル（天文学的年号）

- 内部：整数 `AstroYear`。**前1年 = 0、前2年 = −1、前N年 = 1 − N**、西暦N年 = N。
- 期間計算は単純な引き算でよい（0年問題を内部で吸収）。例：前27年(−26)〜14年 → 14 − (−26) = 40年。
- 表示時のみ変換：

```ts
toAstronomical(era: 'BCE' | 'CE', n: number): AstroYear   // ('BCE',1) → 0
formatYear(y: AstroYear): string                          // 0 → "前1年", -2999 → "前3000年", 1 → "1年"
formatTimePoint(p: TimePoint): string                     // "前2560年頃" / "前1750年（±50年）"
formatSpan(start, end?): string                           // "前27年〜14年（約40年間）"
yearsBetween(a, b): number                                // b − a
```

- スライダー範囲：前3000年（−2999）〜 2025年。非線形スケール（古代を圧縮・近現代を拡大）。

## 4. データ構造（TypeScript 型定義）

```ts
/** 天文学的年号：前1年=0、前2年=-1。表示時のみ formatYear で変換する。 */
export type AstroYear = number;

export type Uncertainty =
  | { kind: 'exact' }                       // 確定
  | { kind: 'circa' }                       // 「頃」
  | { kind: 'plusMinus'; years: number };   // 「±n年」

export interface TimePoint {
  year: AstroYear;
  uncertainty: Uncertainty;
}

export type EventCategory =
  | 'politics'   // 政治・国家
  | 'war'        // 戦争・紛争
  | 'religion'   // 宗教・思想
  | 'culture'    // 文化・科学技術
  | 'economy'    // 経済・交易
  | 'exchange';  // 交流・移動（遠征・航海・民族移動・伝播）

export type LocationPrecision = 'exact' | 'city' | 'region'; // 正確な地点／都市レベル／地域レベル

export interface EventLocation {
  lat: number;              // -90..90
  lng: number;              // -180..180
  placeName: string;        // 表示用地名（例：「長安（現・西安）」）
  precision: LocationPrecision;
}

export interface SourceRef {
  title: string;            // 出典名
  url: string;              // 実在確認済みURLのみ。確認できなければ ''（推測で作らない）
  accessedAt?: string;      // 確認日 YYYY-MM-DD
}

export interface HistoryEvent {
  id: string;               // kebab-case・一意
  title: string;            // 日本語
  summary: string;          // 概要（日本語・自作文）
  category: EventCategory;
  start: TimePoint;
  end?: TimePoint;          // 継続期間がある場合のみ。end.year >= start.year
  location: EventLocation;
  sources: SourceRef[];
  historicalNote: string;   // 歴史的注記（諸説・年代論争・用語の注意など）
  importance: 1 | 2 | 3;    // マーカー大きさ・再生時の優先度
  featured: boolean;        // 自動再生でカメラが向かう注目イベント
  verified: boolean;        // 初期値はすべて false。人間が確認したものだけ true
  // ── 将来拡張（MVPでは未使用・空でよい）──
  question?: string;            // 探究用の問い
  relatedEventIds?: string[];   // 伝播・影響アーク表示用
}
```

## 5. 収録イベント案（48件・承認時に増減可）

| # | 年代（表示） | イベント | 分類 | 位置精度 |
|---|---|---|---|---|
| 1 | 前3000年頃 | エジプトの統一 | 政治 | 地域 |
| 2 | 前3200〜前3000年頃 | ウルクと楔形文字 | 文化 | 都市 |
| 3 | 前2600〜前1900年頃 | インダス文明（モヘンジョ=ダロ） | 文化 | 都市 |
| 4 | 前2560年頃 | ギザの大ピラミッド | 文化 | 正確 |
| 5 | 前1750年頃 | ハンムラビ法典 | 政治 | 都市 |
| 6 | 前1600年頃 | 殷（商）の成立 | 政治 | 地域 |
| 7 | 前1200年頃 | オルメカ文明 | 文化 | 地域 |
| 8 | 前6〜前5世紀 | 孔子と儒家 | 宗教・思想 | 都市 |
| 9 | 前5世紀頃 | ガウタマ=シッダールタと仏教 | 宗教・思想 | 地域 |
| 10 | 前509年 | ローマ共和政の成立 | 政治 | 都市 |
| 11 | 前500年頃 | アケメネス朝と「王の道」 | 経済・交易 | 地域 |
| 12 | 前500〜前449年 | ペルシア戦争 | 戦争 | 地域 |
| 13 | 前334〜前323年 | アレクサンドロスの東方遠征 | 交流・移動 | 地域 |
| 14 | 前268年頃〜前232年頃 | アショーカ王と仏教 | 宗教・思想 | 都市 |
| 15 | 前221年 | 秦の中国統一 | 政治 | 都市 |
| 16 | 前139年頃 | 張騫の西域派遣 | 交流・移動 | 都市 |
| 17 | 前27年 | ローマ帝政の開始 | 政治 | 都市 |
| 18 | 30年頃 | イエスの刑死とキリスト教の成立 | 宗教・思想 | 都市 |
| 19 | 105年 | 蔡倫による製紙法の改良 | 文化 | 都市 |
| 20 | 375年〜 | ゲルマン人の大移動 | 交流・移動 | 地域 |
| 21 | 476年 | 西ローマ帝国の滅亡 | 政治 | 都市 |
| 22 | 618年 | 唐の成立 | 政治 | 都市 |
| 23 | 622年 | ヒジュラ | 宗教・思想 | 都市 |
| 24 | 751年 | タラス河畔の戦い | 戦争 | 地域 |
| 25 | 800年 | カールの戴冠 | 政治 | 正確 |
| 26 | 1096〜1099年 | 第1回十字軍 | 戦争 | 都市 |
| 27 | 1206年 | チンギス=カンのモンゴル統一 | 政治 | 地域 |
| 28 | 1324年 | マンサ=ムーサのメッカ巡礼 | 経済・交易 | 地域 |
| 29 | 1405〜1433年 | 鄭和の南海遠征 | 交流・移動 | 都市 |
| 30 | 1438年頃 | インカ帝国の拡大 | 政治 | 都市 |
| 31 | 1450年頃 | グーテンベルクの活版印刷 | 文化 | 都市 |
| 32 | 1453年 | コンスタンティノープル陥落 | 戦争 | 都市 |
| 33 | 1492年 | コロンブスのカリブ到達 | 交流・移動 | 地域 |
| 34 | 1517年 | ルターと宗教改革 | 宗教・思想 | 都市 |
| 35 | 1526年 | ムガル帝国の成立 | 政治 | 地域 |
| 36 | 16〜19世紀 | 大西洋奴隷貿易 | 経済・交易 | 地域 |
| 37 | 1687年 | ニュートン『プリンキピア』 | 文化 | 都市 |
| 38 | 1760年代〜 | イギリス産業革命 | 経済・交易 | 地域 |
| 39 | 1776年 | アメリカ独立宣言 | 政治 | 正確 |
| 40 | 1789年 | フランス革命 | 政治 | 都市 |
| 41 | 1840〜1842年 | アヘン戦争 | 戦争 | 地域 |
| 42 | 1868年 | 明治維新 | 政治 | 都市 |
| 43 | 1869年 | スエズ運河開通 | 経済・交易 | 地域 |
| 44 | 1914〜1918年 | 第一次世界大戦 | 戦争 | 地域 |
| 45 | 1917年 | ロシア革命 | 政治 | 都市 |
| 46 | 1929年 | 世界恐慌 | 経済・交易 | 都市 |
| 47 | 1939〜1945年 | 第二次世界大戦 | 戦争 | 地域 |
| 48 | 1989年 | ベルリンの壁崩壊 | 政治 | 正確 |

- 地域バランス：西アジア・地中海・南アジア・東アジア・アフリカ・アメリカを各時代に配置し、同時代ストリップで横断比較できるようにする。
- 「地域」精度のイベントは代表点に置き、`historicalNote` に「代表点であり範囲を示すものではない」旨を記載。

### 出典ポリシー
- 候補：日本語版ウィキペディア記事 URL（実在確認しやすい）。`scripts/check-sources.ts` で HTTP 200 を確認できたものだけ記載、できないものは `url: ''`。
- ウィキペディアは三次資料のため、人間による検証時に教科書・学術資料への差し替えを推奨（`historicalNote` とは別に README に運用手順を記載）。
- 全件 `verified: false`。

## 6. 検証条件（Definition of Done）

| 区分 | 検証内容 | 手段 |
|---|---|---|
| ビルド | `next build` が成功し `out/` に静的書き出し | npm script |
| 型 | `tsc --noEmit` エラー 0 | npm script |
| データ | id一意／緯度経度範囲／`end.year ≥ start.year`／`verified === false` 全件／`relatedEventIds` の参照先存在／URLは空 or https／件数 30〜50／6分類すべて使用 | Vitest |
| 年代計算 | `formatYear(0)="前1年"`, `formatYear(-1)="前2年"`, `formatYear(1)="1年"`; `toAstronomical('BCE',1)=0`; 前1年→1年 の差は1年（0年が存在しない）; 前27年〜14年=40年; 「頃」「±50年」表示; 往復変換の一致 | Vitest |
| 操作 | 回転（ドラッグで視点変化）／ズーム（ホイールで高度変化）／スライダーで年・表示イベント変化／マーカー選択で詳細表示（概要・年代・位置・出典・未検証）／自動再生で年が進みカメラ移動 | Playwright（Chromium） |
| スマホ幅 | 390×844 で横スクロールなし・ボトムシート表示・スライダー操作可 | Playwright |
| フォールバック | WebGL 無効時に年表表示 | Playwright（`getContext` を無効化して起動） |

## 7. haakram/WHW 調査結果

- **ライセンス：MIT**（Copyright (c) 2026 haakram）。ただし同リポジトリがビルド時に取得する歴史的国境データ（aourednik/historical-basemaps）は **GPL-3.0** → **本プロジェクトでは使用しない**（国境非表示の方針とも一致）。
- **方針：コードはコピーしない。** 以下の設計上の知見のみ参考にし、README に明記する。
  1. `next/dynamic` + `ssr: false` でグローブをクライアント限定読み込みする構成
  2. react-globe.gl に `width/height` を明示しないとウィンドウサイズで描画されパネルと重なる、という注意点
  3. 古代を圧縮・近現代を拡大する非線形タイムスライダーと、時代別の再生ステップ
  4. three-globe 同梱テクスチャを `public/` にコピーし CDN 非依存にする手法
- **相違点（意図的）**：WHW は「0年なし」の暦年（前1年=−1）で保持。本プロジェクトは要件どおり**天文学的年号（前1年=0）**で保持し、表示時のみ変換する。

## 8. 要確認事項（承認時に判断いただきたい点）

1. **地球テクスチャ**：three-globe（MIT）同梱の Blue Marble 画像を使用予定。元は NASA 画像（NASA 画像は原則著作権表示不要だが、同梱画像の正確な由来は未確認）。可否をご判断ください。代替は無地の球＋海陸のみの簡易表示。
2. **出典**：日本語版ウィキペディアを初期出典とする方針でよいか。
3. **イベント48件の選定**：差し替え・追加希望があれば。
4. **コミット／プッシュ**：実装完了後、作業ブランチ `claude/kind-cray-8tlate` へのコミット・プッシュまで行ってよいか（GitHub Pages 公開・PR作成は行わない）。
