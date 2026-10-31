import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PREVIEW_MODE } from "@/config/site";

export const metadata: Metadata = {
  title: "World History Globe",
  description: "地球を回しながら、紀元前3000年から現代までの世界史を時間と場所の両方から探索する学習用Webアプリ（高校・世界史探究向けMVP）",
  // 試作版のあいだは検索エンジンに載せない（src/config/site.ts で切り替え）
  ...(PREVIEW_MODE ? { robots: "noindex" } : {}),
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#05070d",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
