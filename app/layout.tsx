import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ResumePilot · AI 岗位定制简历",
  description: "将个人经历整理成岗位匹配、ATS 友好的专业简历。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
