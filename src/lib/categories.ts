import type { EventCategory, LocationPrecision } from "@/types/event";

export interface CategoryStyle {
  label: string;
  color: string;
  /** 自作のSVGパス（viewBox 0 0 24 24、stroke描画） */
  icon: string;
}

/** 色は暗い地球の上でも区別しやすく、色覚の違いにも配慮して明度差をつけている。 */
export const CATEGORIES: Record<EventCategory, CategoryStyle> = {
  politics: { label: "政治・国家", color: "#4f8ef7", icon: "M5 21h14M6 18V10M10 18V10M14 18V10M18 18V10M4 10h16L12 4z" },
  war: { label: "戦争・紛争", color: "#e5484d", icon: "M5 19L19 5M15 5h4v4M5 15l4 4M3 21l3-3" },
  religion: { label: "宗教・思想", color: "#b07cf7", icon: "M12 3v18M7 8h10M8 21h8" },
  culture: { label: "文化・科学技術", color: "#f5c542", icon: "M4 5h7a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H4zM20 5h-7a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h7z" },
  economy: { label: "経済・交易", color: "#3fc28a", icon: "M12 3v18M16 7.5C16 5.6 14.2 5 12 5s-4 .9-4 3 2 2.6 4 3 4 1 4 3-1.8 3-4 3-4-.6-4-2.5" },
  exchange: { label: "交流・移動", color: "#f28c38", icon: "M3 12h16M14 7l5 5-5 5M3 6h6M3 18h6" },
};

export const CATEGORY_ORDER: EventCategory[] = ["politics", "war", "religion", "culture", "economy", "exchange"];

export const PRECISION_LABEL: Record<LocationPrecision, string> = {
  exact: "正確な地点",
  city: "都市レベル",
  region: "地域レベル（代表点）",
};
