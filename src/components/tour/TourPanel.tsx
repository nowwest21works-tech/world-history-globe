"use client";

import type { HistoryEvent } from "@/types/event";
import type { Tour } from "@/types/tour";
import { CERTAINTY_LABEL, KIND_LABEL, type TourPosition } from "@/lib/tours";
import { formatSpan, formatYear } from "@/lib/year";
import { CategoryIcon } from "@/components/legend/CategoryIcon";

/** ツアー進行中のパネル（PC は右側、スマホは下45%。詳細パネルと同じ場所に出す） */
export function TourPanel({
  tour,
  position,
  events,
  onPrev,
  onNext,
  onExit,
  onShowDetail,
  onRecenter,
}: {
  tour: Tour;
  position: TourPosition;
  events: Map<string, HistoryEvent>;
  onPrev: () => void;
  onNext: () => void;
  onExit: () => void;
  onShowDetail: () => void;
  onRecenter: () => void;
}) {
  const n = tour.steps.length;
  const isIntro = position < 0;
  const isOutro = position >= n;
  const step = !isIntro && !isOutro ? tour.steps[position]! : null;
  const event = step ? events.get(step.eventId) : undefined;
  const positionLabel = isIntro ? "はじめに" : isOutro ? "まとめ" : `${position + 1} / ${n}`;

  return (
    <aside className="detail tour-panel" aria-label={`ツアー「${tour.title}」`} data-testid="tour-panel">
      <div className="tour-head">
        <span className={`tour-kind is-${tour.kind}`}>{KIND_LABEL[tour.kind]}</span>
        <span className="tour-title">{tour.title}</span>
        <span className="tour-position" data-testid="tour-position">
          {positionLabel}
        </span>
        <button
          type="button"
          className="icon-btn tour-exit"
          onClick={onExit}
          aria-label="ツアーを抜ける"
          title="ツアーを抜ける"
          data-testid="tour-exit"
        >
          ×
        </button>
      </div>

      <div className="tour-body" aria-live="polite">
        {isIntro && (
          <>
            <h2 className="tour-step-title" data-testid="tour-step-title">
              {tour.title}
            </h2>
            <p>{tour.intro}</p>
            {tour.kind === "contemporary" && (
              <p className="sub tour-hint">年代は{formatYear(tour.steps[0]!.year)}頃に止めたまま、世界各地を巡ります。</p>
            )}
            {tour.kind === "connection" && <ArcLegend />}
          </>
        )}

        {step && event && (
          <>
            <h2 className="tour-step-title" data-testid="tour-step-title">
              <CategoryIcon category={event.category} size={14} />
              {event.title}
            </h2>
            <p className="tour-meta">
              {formatSpan(event.start, event.end)}・{event.location.placeName}
            </p>
            <p className="tour-narration">{step.narration}</p>
            {step.arcFrom && (
              <p className={`tour-arc is-${step.arcFrom.certainty}`} data-testid="tour-arc">
                <span className="tour-arc-line" aria-hidden="true" />
                {step.arcFrom.label}
                <span className="sub">（{CERTAINTY_LABEL[step.arcFrom.certainty]}）</span>
              </p>
            )}
            <details className="tour-question" open>
              <summary>考えてみよう</summary>
              <p>{step.question}</p>
            </details>
            <div className="tour-actions">
              <button type="button" className="text-btn" onClick={onShowDetail} data-testid="tour-detail">
                このできごとの詳細
              </button>
              <button type="button" className="text-btn" onClick={onRecenter}>
                この地点に戻る
              </button>
            </div>
          </>
        )}

        {isOutro && (
          <>
            <h2 className="tour-step-title" data-testid="tour-step-title">
              まとめ
            </h2>
            <p>{tour.outro}</p>
            <details className="tour-question" open>
              <summary>考えてみよう</summary>
              <p>{tour.closingQuestion}</p>
            </details>
          </>
        )}
        <p className="sub tour-unverified">このツアーの語り文と問いは、まだ人間による確認を受けていません（未検証）。</p>
      </div>

      <div className="tour-nav">
        <button type="button" className="tour-nav-btn" onClick={onPrev} disabled={isIntro} data-testid="tour-prev">
          ← 前へ
        </button>
        {isOutro ? (
          <button type="button" className="tour-nav-btn is-primary" onClick={onExit} data-testid="tour-finish">
            ツアーを終える
          </button>
        ) : (
          <button type="button" className="tour-nav-btn is-primary" onClick={onNext} data-testid="tour-next">
            {isIntro ? "はじめる →" : position === n - 1 ? "まとめへ →" : "次へ →"}
          </button>
        )}
      </div>
    </aside>
  );
}

function ArcLegend() {
  return (
    <ul className="arc-legend" aria-label="線の種類">
      {(["established", "traditional", "debated"] as const).map((c) => (
        <li key={c} className={`tour-arc is-${c}`}>
          <span className="tour-arc-line" aria-hidden="true" />
          {CERTAINTY_LABEL[c]}
        </li>
      ))}
    </ul>
  );
}
