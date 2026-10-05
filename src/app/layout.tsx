import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "爱的小屋", template: "%s · 爱的小屋" },
  description: "只属于两个人的深度交流空间",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
