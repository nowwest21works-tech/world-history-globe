import type { NextConfig } from "next";

/** GitHub Pages 等のサブパス公開時は NEXT_PUBLIC_BASE_PATH=/world-history-globe のように指定する。 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  basePath: basePath || undefined,
  reactStrictMode: true,
};

export default nextConfig;
