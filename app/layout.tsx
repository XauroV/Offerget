import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "offerget｜27届秋招记录",
  description: "一个本地运行、只需粘贴岗位链接的秋招投递记录平台。",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
