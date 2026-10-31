"use client";

import { useState } from "react";
import type { EventCategory } from "@/types/event";
import { CATEGORIES, CATEGORY_ORDER } from "@/lib/categories";
import { CategoryIcon } from "./CategoryIcon";

export function CategoryLegend({
  enabled,
  onToggle,
  showAll,
  onShowAll,
}: {
  enabled: Set<EventCategory>;
  onToggle: (c: EventCategory) => void;
  showAll: boolean;
  onShowAll: (v: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`legend${open ? " is-open" : ""}`}>
      <button
        type="button"
        className="legend-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        凡例・絞り込み
      </button>
      <div className="legend-body">
        <ul>
          {CATEGORY_ORDER.map((c) => (
            <li key={c}>
              <label>
                <input type="checkbox" checked={enabled.has(c)} onChange={() => onToggle(c)} />
                <CategoryIcon category={c} size={12} />
                {CATEGORIES[c].label}
              </label>
            </li>
          ))}
        </ul>
        <label className="show-all">
          <input type="checkbox" checked={showAll} onChange={(e) => onShowAll(e.target.checked)} />
          他の時代のイベントも薄く表示
        </label>
      </div>
    </div>
  );
}
