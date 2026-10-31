"use client";

import type { HistoryEvent } from "@/types/event";
import { CATEGORIES, PRECISION_LABEL } from "@/lib/categories";
import { formatSpan, formatYear, uncertaintyRange } from "@/lib/year";
import { CategoryIcon } from "@/components/legend/CategoryIcon";
import { UnverifiedBadge } from "./UnverifiedBadge";

function rangeNote(e: HistoryEvent): string | null {
  const parts: string[] = [];
  for (const [label, p] of [["開始", e.start], ["終了", e.end]] as const) {
    if (p?.uncertainty.kind === "plusMinus" || p?.uncertainty.kind === "century") {
      const [a, b] = uncertaintyRange(p);
      parts.push(`${label}は${formatYear(a)}〜${formatYear(b)}の幅`);
    }
  }
  return parts.length ? parts.join("、") : null;
}

export function EventDetail({
  event,
  onClose,
  closeLabel = "詳細を閉じる",
}: {
  event: HistoryEvent;
  onClose: () => void;
  /** ツアー中に開いたときは「ツアーに戻る」 */
  closeLabel?: string;
}) {
  const cat = CATEGORIES[event.category];
  const range = rangeNote(event);
  const { lat, lng } = event.location;
  return (
    <aside className="detail" aria-label="イベントの詳細" data-testid="event-detail">
      <div className="detail-head">
        <span className="detail-cat head-only">
          <CategoryIcon category={event.category} size={14} />
          {cat.label}
        </span>
        <span className="head-only">
          <UnverifiedBadge verified={event.verified} />
        </span>
        <button type="button" className="icon-btn detail-close" onClick={onClose} aria-label={closeLabel} title={closeLabel}>
          ×
        </button>
      </div>
      <h2 className="detail-title">{event.title}</h2>
      <dl className="detail-meta">
        <dt>年代</dt>
        <dd data-testid="detail-date">
          {formatSpan(event.start, event.end)}
          {range && <span className="sub">（{range}）</span>}
        </dd>
        <dt>位置</dt>
        <dd>
          {event.location.placeName}
          <span className="sub">
            {PRECISION_LABEL[event.location.precision]}・{lat >= 0 ? "北緯" : "南緯"}{Math.abs(lat).toFixed(2)}°、
            {lng >= 0 ? "東経" : "西経"}{Math.abs(lng).toFixed(2)}°
          </span>
        </dd>
      </dl>
      <h3 className="detail-summary-head">概要</h3>
      <p data-testid="detail-summary">{event.summary}</p>
      <h3 data-testid="detail-note-head">歴史的な注記</h3>
      <p className="note">{event.historicalNote}</p>
      <h3>出典</h3>
      <ul className="sources">
        {event.sources.map((s, i) => (
          <li key={i}>
            {s.url ? (
              <a href={s.url} target="_blank" rel="noopener noreferrer">
                {s.title}
              </a>
            ) : (
              <span>
                {s.title}
                <span className="sub">（URL未確認）</span>
              </span>
            )}
            {s.accessedAt && <span className="sub">（URL確認日 {s.accessedAt}）</span>}
          </li>
        ))}
      </ul>
      <div className="detail-foot">
        {/* スマホでは分類と未検証バッジをここ（末尾）に表示する。PC では上部に表示済みなので隠す */}
        <div className="foot-only">
          <span className="detail-cat">
            <CategoryIcon category={event.category} size={14} />
            {cat.label}
          </span>
          <UnverifiedBadge verified={event.verified} />
        </div>
        {!event.verified && (
          <p className="unverified-note">このイベントの史実・出典は、まだ人間による確認を受けていません。</p>
        )}
      </div>
    </aside>
  );
}
