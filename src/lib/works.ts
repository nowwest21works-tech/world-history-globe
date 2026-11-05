import type { Fidelity, HistoryWork, WorkMedia } from "@/types/work";
import { formatYear } from "./year";

export const MEDIA_ORDER: WorkMedia[] = ["manga", "anime", "film", "drama", "novel", "stage", "game"];

export const MEDIA_LABEL: Record<WorkMedia, string> = {
  manga: "漫画",
  anime: "アニメ",
  film: "映画",
  drama: "ドラマ",
  novel: "小説",
  stage: "舞台",
  game: "ゲーム",
};

export const FIDELITY_ORDER: Fidelity[] = ["historical", "historical-fiction", "inspired"];

export const FIDELITY_LABEL: Record<Fidelity, string> = {
  historical: "史実ベース",
  "historical-fiction": "史実の枠に創作",
  inspired: "時代を借りた創作",
};

/** ラベルの補足（ツールチップ・凡例用） */
export const FIDELITY_DESCRIPTION: Record<Fidelity, string> = {
  historical: "史実ベース（実在の人物・出来事が中心。演出上の脚色はある）",
  "historical-fiction": "史実の枠に創作（史実の時代・事件を背景に、架空の人物や大胆な解釈を加える）",
  inspired: "時代を借りた創作（架空の国・時間移動・伝奇など）",
};

/** 公式な年齢区分として受け付ける値（映倫区分・CERO 区分） */
export const RATING_ALLOWLIST = [
  "G",
  "PG12",
  "R15+",
  "R18+",
  "CERO A",
  "CERO B",
  "CERO C",
  "CERO D",
  "CERO Z",
] as const;

/** 描く時代の表示："前258年〜前220年" / "1945年" */
export function formatEra(era: HistoryWork["era"]): string {
  return era.from === era.to ? formatYear(era.from) : `${formatYear(era.from)}〜${formatYear(era.to)}`;
}

export function mediaLabels(media: WorkMedia[]): string {
  return media.map((m) => MEDIA_LABEL[m]).join("・");
}

/**
 * 検索用の正規化：カタカナをひらがなに、全角英数を半角に、大文字を小文字にそろえ、
 * 空白と記号（・、。「」―〜など）を取り除く。「ベルサイユ」「べるさいゆ」のどちらでも引けるようにする。
 */
export function normalizeForSearch(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/[\s・、。，．,.!！?？「」『』（）()〈〉《》【】\-‐―ー〜~:：/／]/g, "");
}

/** 題名・作者のあいまい一致（正規化した文字列の部分一致） */
export function matchesWork(w: HistoryWork, query: string): boolean {
  const q = normalizeForSearch(query);
  if (!q) return true;
  return normalizeForSearch(w.title).includes(q) || normalizeForSearch(w.creators).includes(q);
}

/** 検索と媒体の絞り込み（媒体は「いずれかを含む」。空なら絞り込まない） */
export function filterWorks(works: HistoryWork[], query: string, media: Set<WorkMedia>): HistoryWork[] {
  return works.filter((w) => matchesWork(w, query) && (media.size === 0 || w.media.some((m) => media.has(m))));
}

/** URL の ?work=<id> を解釈する */
export function parseWorkQuery(search: string, works: HistoryWork[]): HistoryWork | null {
  const id = new URLSearchParams(search).get("work");
  return works.find((w) => w.id === id) ?? null;
}

export function workQuery(work: HistoryWork): string {
  return `?work=${encodeURIComponent(work.id)}`;
}
