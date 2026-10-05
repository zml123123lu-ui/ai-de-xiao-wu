"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, BookOpenText, Heart, Mail, PenLine, Search } from "lucide-react";
import type { Profile } from "@/lib/types";
import { Avatar } from "./avatar";

const items = [
  { href: "/today", label: "今日", icon: Heart, key: "daily_status" },
  { href: "/discussions", label: "问题", icon: BookOpenText, key: "discussion" },
  { href: "/letters", label: "信件", icon: Mail, key: "letter" },
  { href: "/notifications", label: "通知", icon: Bell, key: "all" },
  { href: "/search", label: "搜索", icon: Search, key: "none" },
] as const;

export function Nav({ profile, unread, logoutSlot }: { profile: Profile; unread: Record<string, number>; logoutSlot?: React.ReactNode }) {
  const pathname = usePathname();
  const discussionCount = (unread.discussion ?? 0) + (unread.reply ?? 0);
  const total = Object.values(unread).reduce((sum, value) => sum + value, 0);
  const countOf = (key: string) => (key === "discussion" ? discussionCount : key === "all" ? total : unread[key] ?? 0);
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return <>
    <aside className="sidebar">
      <div className="brand"><PenLine size={20} /><span>爱的小屋</span></div>
      <p className="brand-note">留给彼此的一方安静之地</p>
      <form className="sidebar-search" action="/search" method="get" role="search">
        <Search size={15} />
        <input name="q" placeholder="找一句话…" aria-label="搜索" maxLength={40} />
      </form>
      <nav aria-label="主要导航">
        {items.map(({ href, label, icon: Icon, key }) => {
          const count = countOf(key);
          const active = isActive(href);
          return <Link href={href} key={href} className={active ? "active" : undefined} aria-current={active ? "page" : undefined}><Icon size={19} /><span>{label}</span>{count > 0 && <span className="badge" aria-label={`${count} 条未读`}>{count}</span>}</Link>;
        })}
      </nav>
      <div className="sidebar-user"><Avatar profile={profile} /><div><strong>{profile.display_name}</strong><span>已进入两人的空间</span></div></div>
      {logoutSlot}
      <Link className="sidebar-export" href="/export">导出备份</Link>
    </aside>
    <nav className="mobile-nav" aria-label="移动端主要导航">
      {items.map(({ href, label, icon: Icon, key }) => {
        const count = countOf(key);
        const active = isActive(href);
        return <Link href={href} key={href} className={active ? "active" : undefined} aria-current={active ? "page" : undefined}><span className="icon-wrap"><Icon size={20} />{count > 0 && <i>{count}</i>}</span><span>{label}</span></Link>;
      })}
    </nav>
  </>;
}
