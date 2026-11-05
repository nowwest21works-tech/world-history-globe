"use client";

import { useEffect, useRef } from "react";
import type { HistoryWork } from "@/types/work";
import { FIDELITY_DESCRIPTION, FIDELITY_LABEL, formatEra, mediaLabels } from "@/lib/works";
import { UnverifiedBadge } from "@/components/panel/UnverifiedBadge";

/** イベント詳細の「この時代を描いた作品」。作品ごとに折りたたみ、主役は「作品と史実のあいだ」の問い */
export function EventWorks({
  works,
  activeWorkId,
  onToggle,
  scrollKey = 0,
}: {
  works: HistoryWork[];
  /** 「作品から探す」で選んだ作品。開いた状態・強調表示にする */
  activeWorkId: string | null;
  /** 作品の折りたたみを開閉したとき（開いた作品の id、閉じたら null） */
  onToggle?: (id: string | null) => void;
  /** 値が変わるたびに、このセクションの見出しが見えるところまでスクロールする */
  scrollKey?: number;
}) {
  const ref = useRef<HTMLElement>(null);
  // 選んだ作品が見えるところまで、詳細パネルの中をスクロールする
  useEffect(() => {
    if (!activeWorkId) return;
    const el = ref.current?.querySelector<HTMLElement>(`[data-work-id="${activeWorkId}"]`);
    el?.scrollIntoView?.({ block: "nearest" });
  }, [activeWorkId]);
  useEffect(() => {
    if (scrollKey) ref.current?.scrollIntoView?.({ block: "start" });
  }, [scrollKey]);

  if (works.length === 0) return null;
  return (
    <section ref={ref} className="detail-works" data-testid="detail-works" aria-labelledby="detail-works-head">
      <h3 id="detail-works-head">この時代を描いた作品</h3>
      <p className="sub detail-works-lead">作品は入口。史実とのちがいを問いにして、出典や教科書で確かめよう。</p>
      <ul className="detail-works-list">
        {works.map((w) => (
          <li key={w.id}>
            <details
              className={`detail-work${w.id === activeWorkId ? " is-active" : ""}`}
              open={w.id === activeWorkId}
              data-work-id={w.id}
              data-testid={`detail-work-${w.id}`}
              onToggle={(e) => {
                const open = (e.currentTarget as HTMLDetailsElement).open;
                if (open && w.id !== activeWorkId) onToggle?.(w.id);
                else if (!open && w.id === activeWorkId) onToggle?.(null);
              }}
            >
              <summary>
                <span className="detail-work-title">{w.title}</span>
                <span className="detail-work-tags">
                  <span className="work-media">{mediaLabels(w.media)}</span>
                  <span className={`work-fidelity is-${w.fidelity}`} title={FIDELITY_DESCRIPTION[w.fidelity]}>
                    {FIDELITY_LABEL[w.fidelity]}
                  </span>
                </span>
              </summary>
              <div className="detail-work-body">
                <dl className="detail-meta">
                  <dt>作者など</dt>
                  <dd>
                    {w.creators}
                    <span className="sub">初出 {w.firstReleased}年</span>
                    {w.adaptations && <span className="sub">{w.adaptations}</span>}
                  </dd>
                  <dt>描く時代</dt>
                  <dd>
                    {formatEra(w.era)}
                    <span className="sub">{w.eraNote}</span>
                  </dd>
                  <dt>舞台</dt>
                  <dd>{w.setting}</dd>
                </dl>
                <div className="work-gap" data-testid="work-gap">
                  <h4>作品と史実のあいだ</h4>
                  <p>{w.gapQuestion}</p>
                </div>
                {(w.contentNote || w.rating) && (
                  <p className="work-note">
                    {w.rating && <span className="work-rating">年齢区分 {w.rating}</span>}
                    {w.contentNote}
                  </p>
                )}
                {w.officialUrl && (
                  <p className="work-official">
                    <a href={w.officialUrl} target="_blank" rel="noopener noreferrer">
                      公式サイト<span className="sub">（外部サイトが開きます）</span>
                    </a>
                  </p>
                )}
                {w.sources.length > 0 && (
                  <ul className="sources">
                    {w.sources.map((s, i) => (
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
                      </li>
                    ))}
                  </ul>
                )}
                <p className="work-foot">
                  <UnverifiedBadge verified={w.verified} />
                  {!w.verified && <span className="sub">作品情報と紐づけは、人間による確認前です。</span>}
                </p>
              </div>
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}
