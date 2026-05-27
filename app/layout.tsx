import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { NavLink } from "@/components/nav-link";

export const metadata: Metadata = {
  title: "AI Model Tracker",
  description: "Free model lifecycle monitoring",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className="min-h-full flex flex-col bg-gradient-to-b from-[#FAFBFC] to-[#F0F4F8] text-[#1A2332]"
        style={{
          fontFamily:
            "'Inter', system-ui, -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif",
        }}
      >
        <header className="sticky top-0 z-50 border-b border-[#E8EEF7] bg-white/80 backdrop-blur-[8px]">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-12">
            <Link
              href="/"
              className="text-base font-semibold text-[#1A2332] tracking-tight"
            >
              AI Model Tracker
            </Link>
            <nav className="flex items-center gap-6 text-sm font-medium">
              <NavLink href="/">首页</NavLink>
              <NavLink href="/compare">趋势对比</NavLink>
              <NavLink href="/transitions">转付费分析</NavLink>
              <NavLink href="/events">事件管理</NavLink>
            </nav>
          </div>
        </header>
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
