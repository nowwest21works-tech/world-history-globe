"use client";

import dynamic from "next/dynamic";

/** 日本地図は SVG なので WebGL は不要だが、地図データ（約60KB）を初期表示の JS から外すため、使うときに読み込む。 */
const JapanMapLoader = dynamic(() => import("./JapanMap"), {
  ssr: false,
  loading: () => (
    <div className="japan-map globe-loading" role="status">
      地図を準備しています…
    </div>
  ),
});

export default JapanMapLoader;
