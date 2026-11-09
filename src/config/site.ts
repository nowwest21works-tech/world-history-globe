/**
 * 公開状態の設定。試作版の表示をまとめて外すときは、PREVIEW_MODE を false にするだけでよい。
 *   true  … 画面上部に「試作版」の帯を表示し、<meta name="robots" content="noindex"> を出力する
 *   false … 帯も noindex も出さない（正式公開）
 */
export const PREVIEW_MODE = true;

/**
 * マホロバ学校（MAHOROBA の B05）の「地球儀の教室」へ戻るリンク。
 * この地球儀は MAHOROBA のまちの中の教室なので、外へ出ていくだけにならないよう、いつでも学校へ戻れる道を置く。
 */
export const SCHOOL_URL = "https://www.mahoroba-office.co.jp/b05#school-globe";

/** 試作版の帯に表示する文言 */
export const PREVIEW_MESSAGE = "試作版｜掲載内容は検証中です";
