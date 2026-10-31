"use client";

import { useEffect, useState } from "react";
import { PREVIEW_MESSAGE, PREVIEW_MODE } from "@/config/site";

const STORAGE_KEY = "whg-preview-banner-closed";

/** 試作版の帯。閉じた状態はそのタブの間だけ覚えておく（ストレージが使えない環境でも表示自体は動く）。 */
export function PreviewBanner() {
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(STORAGE_KEY) === "1") setClosed(true);
    } catch {
      // ストレージが使えない環境では毎回表示する
    }
  }, []);

  if (!PREVIEW_MODE || closed) return null;

  const close = () => {
    setClosed(true);
    try {
      sessionStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // 保存できなくても閉じる操作自体は有効
    }
  };

  return (
    <div className="preview-banner" role="note" data-testid="preview-banner">
      <span>{PREVIEW_MESSAGE}</span>
      <button type="button" className="preview-close" onClick={close} aria-label="試作版の表示を閉じる">
        ×
      </button>
    </div>
  );
}
