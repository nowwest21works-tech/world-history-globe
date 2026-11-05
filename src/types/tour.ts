import type { AstroYear, Scope } from "./event";

/** 同時代型：ある年に止まって世界各地を巡る／つながり型：弧でつなぎながら時代を追う */
export type TourKind = "contemporary" | "connection";

/** つながりの確かさ。史実＝実線、伝承＝破線（「伝承」と表示）、諸説あり＝点線 */
export type ArcCertainty = "established" | "traditional" | "debated";

/**
 * カメラの位置。モードによって解釈が変わる。
 * - 世界（地球儀）：lat / lng と altitude（地球の半径を1とした高さ）
 * - 日本（平面地図）：lat / lng（地図の中心）と zoom（日本全体が収まる大きさを1とした拡大率）
 */
export interface CameraPose {
  lat: number;
  lng: number;
  altitude?: number;
  zoom?: number;
}

export interface TourArc {
  /** 弧の始点となるイベント。到着側（このステップ）のイベントが、その relatedEventIds に含まれていること */
  eventId: string;
  certainty: ArcCertainty;
  /** 弧に添える短い説明（例：「製紙法」） */
  label: string;
}

export interface TourStep {
  /** ツアー内で一意 */
  id: string;
  /** 対象イベント（events.json の id） */
  eventId: string;
  /** このステップでスライダーを合わせる年（天文学的年号） */
  year: AstroYear;
  /** 省略時はイベントの地点・既定の高さ */
  camera?: CameraPose;
  /** 語り文（独自の文章） */
  narration: string;
  /** 探究の問い */
  question: string;
  /** つながり型のみ：どのイベントから弧を引くか */
  arcFrom?: TourArc;
  /** このステップを表示するモード（省略時は世界）。ツアーの途中で地球儀と日本地図を切り替えられる */
  mode?: Scope;
}

export interface Tour {
  /** URL にも使う（?tour=paper&step=3） */
  id: string;
  title: string;
  kind: TourKind;
  /** 開始前の導入文 */
  intro: string;
  steps: TourStep[];
  /** 最後のまとめ */
  outro: string;
  /** ツアー全体を振り返る問い */
  closingQuestion: string;
  /** ツアーの文面も人間による確認の対象。初期値 false */
  verified: boolean;
}
