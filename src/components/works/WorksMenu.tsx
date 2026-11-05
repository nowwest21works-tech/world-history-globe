"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { HistoryWork, WorkMedia } from "@/types/work";
import {
  FIDELITY_DESCRIPTION,
  FIDELITY_LABEL,
  MEDIA_LABEL,
  MEDIA_ORDER,
  filterWorks,
  formatEra,
  mediaLabels,
} from "@/lib/works";

/** 「作品から探す」ダイアログ。作品は時代順に並べ、選ぶとその時代・地点の出来事へ移る */
export function WorksMenu({
  works,
  onStart,
  onClose,
}: {
  works: HistoryWork[];
  onStart: (work: HistoryWork) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [media, setMedia] = useState<Set<WorkMedia>>(() => new Set());

  // 開いたら検索欄へ、閉じたら開く前の要素（「作品から探す」ボタン）へフォーカスを戻す
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "Tab" && ref.current) {
        // ダイアログの外へフォーカスが出ないようにする
        const items = ref.current.querySelectorAll<HTMLElement>("button, input, [href]");
        const first = items[0];
        const last = items[items.length - 1];
        if (!first || !last) return;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      opener?.focus?.();
    };
  }, [onClose]);

  // 作品に使われている媒体だけをチップに出す
  const mediaInUse = useMemo(() => MEDIA_ORDER.filter((m) => works.some((w) => w.media.includes(m))), [works]);
  const list = useMemo(() => filterWorks(works, query, media), [works, query, media]);

  const toggleMedia = (m: WorkMedia) =>
    setMedia((prev) => {
      const n = new Set(prev);
      if (n.has(m)) n.delete(m);
      else n.add(m);
      return n;
    });

  return (
    <div className="tour-menu-backdrop" onClick={onClose}>
      <div
        ref={ref}
        className="tour-menu works-menu"
        role="dialog"
        aria-modal="true"
        aria-labelledby="works-menu-title"
        data-testid="works-menu"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="tour-menu-head">
          <h2 id="works-menu-title">作品から探す</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="作品の一覧を閉じる">
            ×
          </button>
        </div>
        <p className="tour-menu-lead">
          知っている作品から、その時代の出来事と場所へ。作品は入口です。史実とのちがいは、出典や教科書で確かめよう。
        </p>
        <div className="works-filters">
          <label className="works-search">
            <span className="visually-hidden">題名・作者で検索</span>
            <input
              ref={inputRef}
              type="search"
              placeholder="題名・作者で検索"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              data-testid="works-search"
            />
          </label>
          <div className="works-media" role="group" aria-label="媒体で絞り込む">
            {mediaInUse.map((m) => (
              <button
                key={m}
                type="button"
                className={`works-chip${media.has(m) ? " is-on" : ""}`}
                aria-pressed={media.has(m)}
                onClick={() => toggleMedia(m)}
                data-testid={`works-media-${m}`}
              >
                {MEDIA_LABEL[m]}
              </button>
            ))}
          </div>
        </div>
        <p className="sub works-count" aria-live="polite" data-testid="works-count">
          {list.length}件（描いている時代の古い順）
        </p>
        {list.length === 0 ? (
          <p className="works-empty">見つかりませんでした。題名の一部や、作者名でも探せます。</p>
        ) : (
          <ul className="works-cards" data-testid="works-list">
            {list.map((w) => (
              <li key={w.id}>
                <button
                  type="button"
                  className="work-card"
                  onClick={() => onStart(w)}
                  data-testid={`work-start-${w.id}`}
                >
                  <span className="work-card-meta">
                    <span className="work-media">{mediaLabels(w.media)}</span>
                    <span className={`work-fidelity is-${w.fidelity}`} title={FIDELITY_DESCRIPTION[w.fidelity]}>
                      {FIDELITY_LABEL[w.fidelity]}
                    </span>
                  </span>
                  <span className="work-card-title">{w.title}</span>
                  <span className="work-card-sub">
                    {w.creators}・{w.firstReleased}年
                  </span>
                  <span className="work-card-era">描く時代：{formatEra(w.era)}</span>
                  <span className="work-card-hook">{w.hook}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <dl className="works-legend">
          {(["historical", "historical-fiction", "inspired"] as const).map((f) => (
            <div key={f}>
              <dt>
                <span className={`work-fidelity is-${f}`}>{FIDELITY_LABEL[f]}</span>
              </dt>
              <dd>{FIDELITY_DESCRIPTION[f].replace(/^[^（]+（/, "").replace(/）$/, "")}</dd>
            </div>
          ))}
        </dl>
        <p className="sub tour-menu-note">
          作品の情報と、出来事との紐づけは、まだ人間による確認を受けていません（未検証）。作品の評価や紹介文は載せていません。
        </p>
      </div>
    </div>
  );
}
