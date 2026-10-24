import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FundLens · 私人基金研究",
  description: "从正式净值出发，让每日基金研究有据可循。",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "FundLens", statusBarStyle: "default" },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/icons/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <head><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/><meta name="theme-color" content="#153c34"/></head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
