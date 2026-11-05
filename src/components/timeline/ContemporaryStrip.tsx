"use client";

import type { AstroYear, HistoryEvent, Scope } from "@/types/event";
import { formatSpan } from "@/lib/year";
import { isOngoing } from "@/lib/visibility";
import { CategoryIcon } from "@/components/legend/CategoryIcon";

/** もう一方のモードの段の見出し */
const OTHER_TITLE: Record<Scope, string> = {
  world: "🗾 同じころ、日本では？",
  japan: "🌏 同じころ、世界では？",
};

export function ContemporaryStrip({
  events,
  year,
  window,
  expanded,
  selectedId,
  onSelect,
  mode = "world",
  other,
  onSelectOther,
}: {
  events: HistoryEvent[];
  year: AstroYear;
  window: number;
  expanded: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  mode?: Scope;
  /** もう一方のモードにだけある、同じころの出来事（押すとモードを切り替えて開く） */
  other?: { events: HistoryEvent[]; window: number };
  onSelectOther?: (id: string) => void;
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
      {other && other.events.length > 0 && (
        <div className={`strip-other is-${mode}`} data-testid="strip-other">
          <h3 className="strip-title strip-other-title">
            {OTHER_TITLE[mode]}
            <span className="sub">（前後{other.window}年。押すと{mode === "world" ? "日本地図" : "地球儀"}に切り替わります）</span>
          </h3>
          <ul className="strip-list" data-testid="strip-other-list">
            {other.events.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  className={`chip chip-other${isOngoing(e, year) ? " is-ongoing" : ""}`}
                  onClick={() => onSelectOther?.(e.id)}
                  data-event-id={e.id}
                >
                  <CategoryIcon category={e.category} size={12} />
                  <span className="chip-title">{e.title}</span>
                  <span className="chip-date">{formatSpan(e.start, e.end).replace(/（.*）$/, "")}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
