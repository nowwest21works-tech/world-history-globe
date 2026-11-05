"use client";

import type { HistoryEvent, Scope } from "@/types/event";
import { CATEGORIES, PRECISION_LABEL } from "@/lib/categories";
import { formatSpan, formatYear, uncertaintyRange } from "@/lib/year";
import { CategoryIcon } from "@/components/legend/CategoryIcon";
import { UnverifiedBadge } from "./UnverifiedBadge";
import { EventWorks } from "@/components/works/EventWorks";
import { worksByEventId } from "@/data/works";

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
  activeWorkId = null,
  onWorkToggle,
  scrollToWorksKey = 0,
  mode = "world",
  crossLinks = [],
  onCrossLink,
  onShowInOtherMode,
}: {
  event: HistoryEvent;
  onClose: () => void;
  /** ツアー中に開いたときは「ツアーに戻る」 */
  closeLabel?: string;
  /** 「作品から探す」で選んだ作品（作品セクションで開いた状態にする） */
  activeWorkId?: string | null;
  onWorkToggle?: (id: string | null) => void;
  /** 値が変わるたびに、作品セクションが見えるところまで詳細の中をスクロールする（0 は何もしない） */
  scrollToWorksKey?: number;
  /** いま表示しているモード */
  mode?: Scope;
  /** 関連イベントのうち、もう一方のモードにあるもの（「世界とのつながり」のカード） */
  crossLinks?: HistoryEvent[];
  /** カードを押したとき：モードを切り替え、その年・その地点へ移り、詳細を開く */
  onCrossLink?: (id: string) => void;
  /** 世界と日本の両方の地図に出る共有イベントのとき：もう一方の地図で同じイベントを見る */
  onShowInOtherMode?: () => void;
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
      {onShowInOtherMode && (
        <p className="shared-note" data-testid="shared-note">
          <span className="sub">このできごとは、世界史と日本史の両方の地図に出ています。</span>
          <button type="button" className="text-btn" onClick={onShowInOtherMode} data-testid="show-in-other-mode">
            {mode === "japan" ? "🌏 地球儀で見る" : "🗾 日本地図で見る"}
          </button>
        </p>
      )}
      {crossLinks.length > 0 && (
        <section className="cross-links" data-testid="cross-links" aria-labelledby="cross-links-head">
          <h3 id="cross-links-head">{mode === "japan" ? "世界とのつながり" : "日本とのつながり"}</h3>
          <ul>
            {crossLinks.map((x) => (
              <li key={x.id}>
                <button
                  type="button"
                  className={`cross-card to-${mode === "japan" ? "world" : "japan"}`}
                  onClick={() => onCrossLink?.(x.id)}
                  data-testid={`cross-link-${x.id}`}
                >
                  <span className="cross-go">{mode === "japan" ? "🌏 世界史で見る" : "🗾 日本史で見る"}</span>
                  <span className="cross-title">
                    <CategoryIcon category={x.category} size={12} />
                    {x.title}
                  </span>
                  <span className="sub">
                    {formatSpan(x.start, x.end).replace(/（.*）$/, "")}・{x.location.placeName}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <EventWorks
        works={worksByEventId(event.id)}
        activeWorkId={activeWorkId}
        onToggle={onWorkToggle}
        scrollKey={scrollToWorksKey}
      />
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
