import type { AstroYear, SourceRef } from "./event";

/** 媒体 */
export type WorkMedia = "manga" | "anime" | "film" | "drama" | "novel" | "stage" | "game";

/**
 * 史実との距離
 * - historical：史実ベース（実在の人物・出来事が中心。演出上の脚色はある）
 * - historical-fiction：史実の枠に創作（史実の時代・事件を背景に、架空の人物や大胆な解釈を加える）
 * - inspired：時代を借りた創作（架空の国・時間移動・伝奇など）
 */
export type Fidelity = "historical" | "historical-fiction" | "inspired";

export interface HistoryWork {
  /** kebab-case・一意 */
  id: string;
  title: string;
  media: WorkMedia[];
  /** 作者・監督など表示用（独自の表記） */
  creators: string;
  /** 初出年（西暦。原作の連載開始・初公開など） */
  firstReleased: number;
  /** 主なメディア展開（表示用。空でよい） */
  adaptations: string;
  /** 作品が描く時代（天文学的年号） */
  era: { from: AstroYear; to: AstroYear };
  /** 時代についての補足（架空の国であること、諸説など） */
  eraNote: string;
  /** 舞台（独自の文章） */
  setting: string;
  /** 紐づくイベント（1件以上。events.json に存在すること） */
  eventIds: string[];
  fidelity: Fidelity;
  /** 作品を知っている人に向けた一言（独自の文章） */
  hook: string;
  /** 作品と史実の差分を問う探究の問い */
  gapQuestion: string;
  /** 描写についての注意（独自の文章。空でよい） */
  contentNote: string;
  /** 公式な年齢区分。確認できたときだけ。未確認は空文字 */
  rating: string;
  /** 公式ページ。実在を確認できたときだけ。未確認は空文字 */
  officialUrl: string;
  sources: SourceRef[];
  verified: boolean;
}
