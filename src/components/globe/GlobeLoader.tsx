"use client";

import dynamic from "next/dynamic";

/** WebGL はブラウザにしか存在しないため、SSR せずクライアントでのみ読み込む。 */
const GlobeLoader = dynamic(() => import("./GlobeView"), {
  ssr: false,
  loading: () => (
    <div className="globe-box globe-loading" role="status">
      地球を準備しています…
    </div>
  ),
});

export default GlobeLoader;
