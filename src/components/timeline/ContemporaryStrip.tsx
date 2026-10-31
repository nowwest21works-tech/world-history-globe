"use client";

import type { AstroYear, HistoryEvent } from "@/types/event";
import { formatSpan } from "@/lib/year";
import { isOngoing } from "@/lib/visibility";
import { CategoryIcon } from "@/components/legend/CategoryIcon";

export function ContemporaryStrip({
  events,
  year,
  window,
  expanded,
  selectedId,
  onSelect,
}: {
  events: HistoryEvent[];
  year: AstroYear;
  window: number;
  expanded: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <section className="strip" aria-label="同時代のできごと">
      <h2 className="strip-title">
        同時代のできごと
        <span className="sub" data-testid="strip-window">
          （前後{window}年{expanded ? "・近い時代まで範囲を広げて表示" : ""}）
        </span>
      </h2>
      <ul className="strip-list" data-testid="strip-list">
        {events.map((e) => (
          <li key={e.id}>
            <button
              type="button"
              className={`chip${e.id === selectedId ? " is-selected" : ""}${isOngoing(e, year) ? " is-ongoing" : ""}`}
              onClick={() => onSelect(e.id)}
            >
              <CategoryIcon category={e.category} size={12} />
              <span className="chip-title">{e.title}</span>
              <span className="chip-date">{formatSpan(e.start, e.end).replace(/（.*）$/, "")}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
