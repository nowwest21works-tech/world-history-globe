"use client";

import type { HistoryEvent } from "@/types/event";
import { CATEGORIES } from "@/lib/categories";
import { formatSpan } from "@/lib/year";
import { CategoryIcon } from "@/components/legend/CategoryIcon";

const ERAS: { label: string; from: number; to: number }[] = [
  { label: "前3000年〜前501年", from: -Infinity, to: -501 },
  { label: "前500年〜前1年", from: -500, to: 0 },
  { label: "1年〜1000年", from: 1, to: 1000 },
  { label: "1001年〜1500年", from: 1001, to: 1500 },
  { label: "1501年〜1800年", from: 1501, to: 1800 },
  { label: "1801年〜現代", from: 1801, to: Infinity },
];

/** WebGL 非対応時（または利用者が選んだとき）の年表表示 */
export function ChronologyList({
  events,
  selectedId,
  onSelect,
}: {
  events: HistoryEvent[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="chronology" data-testid="chronology">
      {ERAS.map((era) => {
        const list = events.filter((e) => e.start.year >= era.from && e.start.year <= era.to);
        if (list.length === 0) return null;
        return (
          <section key={era.label}>
            <h2>{era.label}</h2>
            <ol>
              {list.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    className={`chrono-item${e.id === selectedId ? " is-selected" : ""}`}
                    onClick={() => onSelect(e.id)}
                  >
                    <span className="chrono-date">{formatSpan(e.start, e.end)}</span>
                    <span className="chrono-title">
                      <CategoryIcon category={e.category} size={12} />
                      {e.title}
                    </span>
                    <span className="chrono-place">
                      {CATEGORIES[e.category].label}・{e.location.placeName}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </section>
        );
      })}
    </div>
  );
}
