import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "World History Globe",
  description: "地球を回しながら、紀元前3000年から現代までの世界史を時間と場所の両方から探索する学習用Webアプリ（高校・世界史探究向けMVP）",
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
