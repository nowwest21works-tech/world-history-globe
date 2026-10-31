"use client";

import { useEffect, useRef } from "react";
import type { Tour } from "@/types/tour";
import { KIND_LABEL } from "@/lib/tours";

/** ツアーの一覧（はじめるツアーを選ぶ） */
export function TourMenu({
  tours,
  onStart,
  onClose,
}: {
  tours: Tour[];
  onStart: (tour: Tour) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>("button.tour-card-start")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="tour-menu-backdrop" onClick={onClose}>
      <div
        ref={ref}
        className="tour-menu"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-menu-title"
        data-testid="tour-menu"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="tour-menu-head">
          <h2 id="tour-menu-title">歴史を旅する</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="ツアーの一覧を閉じる">
            ×
          </button>
        </div>
        <p className="tour-menu-lead">地球を巡りながら、「同じころ、世界では？」と「歴史のつながり」をたどります。</p>
        <ul className="tour-cards">
          {tours.map((t) => (
            <li key={t.id} className="tour-card">
              <div className="tour-card-meta">
                <span className={`tour-kind is-${t.kind}`}>{KIND_LABEL[t.kind]}</span>
                <span className="sub">{t.steps.length}か所</span>
              </div>
              <h3>{t.title}</h3>
              <p>{t.intro}</p>
              <button
                type="button"
                className="tour-card-start"
                onClick={() => onStart(t)}
                data-testid={`tour-start-${t.id}`}
              >
                はじめる
              </button>
            </li>
          ))}
        </ul>
        <p className="sub tour-menu-note">ツアーの語り文と問いも、まだ人間による確認を受けていません（未検証）。</p>
      </div>
    </div>
  );
}
