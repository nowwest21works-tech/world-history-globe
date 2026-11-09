import { SCHOOL_URL } from "@/config/site";

/**
 * マホロバ学校へ戻るリンク。PC はヘッダーの右端、スマホは画面下の再生ボタンの並びの右端に置く。
 * 同じタブで開く（target は付けない）。まちの中の移動なので、ブラウザの戻るで地球儀にも戻れる。
 */
export function SchoolLink({ place }: { place: "header" | "bottom" }) {
  return (
    <a className={`school-link is-${place}`} href={SCHOOL_URL} data-testid={`school-link-${place}`} title="MAHOROBA のマホロバ学校に戻ります">
      <span aria-hidden="true">🏫</span>
      <span className="school-text">マホロバ学校へ</span>
    </a>
  );
}
