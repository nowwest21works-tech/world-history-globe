/**
 * 天文学的年号（astronomical year numbering）。
 * 西暦N年 = N、前1年 = 0、前2年 = -1、前N年 = 1 - N。
 * 内部計算はすべてこの整数で行い、表示時のみ src/lib/year.ts で「前○年／○年」に変換する。
 */
export type AstroYear = number;

/** 年代の不確実性。 */
export type Uncertainty =
  | { kind: "exact" } // 確定
  | { kind: "circa" } // 「頃」
  | { kind: "plusMinus"; years: number } // 「±n年」
  | { kind: "century" }; // 「前18世紀頃」：year を含む世紀単位でしか言えない場合（year は代表値）

export interface TimePoint {
  year: AstroYear;
  uncertainty: Uncertainty;
}

export type EventCategory =
  | "politics" // 政治・国家
  | "war" // 戦争・紛争
  | "religion" // 宗教・思想
  | "culture" // 文化・科学技術
  | "economy" // 経済・交易
  | "exchange"; // 交流・移動（遠征・航海・民族移動・伝播）

/** 位置の精度：正確な地点／都市レベル／地域レベル（代表点） */
export type LocationPrecision = "exact" | "city" | "region";

export interface EventLocation {
  lat: number;
  lng: number;
  /** 表示用地名（例：「長安（現・西安）」） */
  placeName: string;
  precision: LocationPrecision;
}

export interface SourceRef {
  /** 出典名 */
  title: string;
  /** 実在を確認できたURLのみ。確認できない場合は空文字（推測で作らない）。 */
  url: string;
  /** URLの実在を確認した日（YYYY-MM-DD） */
  accessedAt?: string;
}

export interface HistoryEvent {
  /** kebab-case・一意 */
  id: string;
  title: string;
  /** 概要（独自の文章。ウィキペディア等からの転載・言い換えはしない） */
  summary: string;
  category: EventCategory;
  start: TimePoint;
  /** 継続期間がある場合のみ。end.year >= start.year */
  end?: TimePoint;
  location: EventLocation;
  sources: SourceRef[];
  /** 歴史的注記（諸説・年代論争・用語上の注意など） */
  historicalNote: string;
  /** 1〜3。マーカーの大きさと自動再生時の優先度に使う */
  importance: 1 | 2 | 3;
  /** 自動再生でカメラが向かう注目イベント */
  featured: boolean;
  /** 人間が史実と出典を確認したものだけ true。初期値はすべて false */
  verified: boolean;
  /** 将来拡張：探究用の問い（MVPでは未使用） */
  question?: string;
  /** 将来拡張：関連イベントへの参照（伝播・影響のアーク表示用。MVPでは未使用） */
  relatedEventIds?: string[];
}
