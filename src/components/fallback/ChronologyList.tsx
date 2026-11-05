"use client";

import type { HistoryEvent, Scope } from "@/types/event";
import { JAPAN_ERAS, ERA_NOTE } from "@/lib/japanEras";
import { CATEGORIES } from "@/lib/categories";
import { formatSpan } from "@/lib/year";
import { CategoryIcon } from "@/components/legend/CategoryIcon";
import { worksByEventId } from "@/data/works";

const ERAS: { label: string; from: number; to: number }[] = [
  { label: "前3000年〜前501年", from: -Infinity, to: -501 },
  { label: "前500年〜前1年", from: -500, to: 0 },
  { label: "1年〜1000年", from: 1, to: 1000 },
  { label: "1001年〜1500年", from: 1001, to: 1500 },
  { label: "1501年〜1800年", from: 1501, to: 1800 },
  { label: "1801年〜現代", from: 1801, to: Infinity },
];

/** 日本モードの年表は時代区分（目安）で見出しを立てる */
const JAPAN_SECTIONS = JAPAN_ERAS.map((e, i) => ({
  label: `${e.name}（目安）`,
  from: i === 0 ? -Infinity : e.from,
  to: i === JAPAN_ERAS.length - 1 ? Infinity : e.to - 1,
}));

/** WebGL 非対応時（または利用者が選んだとき）の年表表示 */
export function ChronologyList({
  events,
  selectedId,
  onSelect,
  onSelectWorks,
  mode = "world",
}: {
  events: HistoryEvent[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** 「作品 n」の表示を押したとき：詳細を開き、作品セクションまで送る */
  onSelectWorks?: (id: string) => void;
  mode?: Scope;
}) {
  const sections = mode === "japan" ? JAPAN_SECTIONS : ERAS;
  return (
    <div className="chronology" data-testid="chronology">
      {mode === "japan" && <p className="sub chrono-note">{ERA_NOTE}</p>}
      {sections.map((era) => {
        const list = events.filter((e) => e.start.year >= era.from && e.start.year <= era.to);
        if (list.length === 0) return null;
        return (
          <section key={era.label}>
            <h2>{era.label}</h2>
            <ol>
              {list.map((e) => {
                const nWorks = worksByEventId(e.id).length;
                return (
                <li key={e.id}>
                  <button
                    type="button"
                    className={`chrono-item${e.id === selectedId ? " is-selected" : ""}`}
                    onClick={(ev) => {
                      const onBadge = (ev.target as Element).closest?.(".chrono-works");
                      if (onBadge && onSelectWorks) onSelectWorks(e.id);
                      else onSelect(e.id);
                    }}
                    data-testid={`chrono-${e.id}`}
                  >
                    <span className="chrono-date">{formatSpan(e.start, e.end)}</span>
                    <span className="chrono-title">
                      <CategoryIcon category={e.category} size={12} />
                      {e.title}
                      {nWorks > 0 && (
                        <span className="chrono-works" title={`この時代を描いた作品が${nWorks}件あります`} data-testid="chrono-works">
                          作品 {nWorks}
                        </span>
                      )}
                    </span>
                    <span className="chrono-place">
                      {CATEGORIES[e.category].label}・{e.location.placeName}
                    </span>
                  </button>
                </li>
                );
              })}
            </ol>
          </section>
        );
      })}
    </div>
  );
}
