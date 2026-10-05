import Link from "next/link";
import { Bell } from "lucide-react";
import { markAllNotificationsRead } from "@/app/actions";
import { Avatar } from "@/components/avatar";
import { SubmitButton } from "@/components/submit-button";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import type { Notification } from "@/lib/types";

const verbs: Record<Notification["type"], string> = {
  discussion: "发起了新问题",
  reply: "回复了问题",
  letter: "寄来一封信",
  daily_status: "更新了今天的状态",
};

export default async function NotificationsPage() {
  const { supabase, user } = await requireUser();
  const { data } = await supabase
    .from("notifications")
    .select("*, actor:profiles!notifications_actor_id_fkey(id, display_name, avatar_color)")
    .eq("recipient_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);
  const notifications = (data ?? []) as Notification[];

  // 一次性把涉及的问题/信件标题取回来，避免逐条查询
  const discussionIds = [...new Set(notifications.filter((item) => item.type === "discussion" || item.type === "reply").map((item) => item.resource_id))];
  const letterIds = [...new Set(notifications.filter((item) => item.type === "letter").map((item) => item.resource_id))];
  const titles = new Map<string, string>();
  if (discussionIds.length) {
    const { data: rows } = await supabase.from("discussions").select("id, title").in("id", discussionIds);
    for (const row of (rows ?? []) as { id: string; title: string }[]) titles.set(row.id, row.title);
  }
  if (letterIds.length) {
    const { data: rows } = await supabase.from("letters").select("id, title").in("id", letterIds);
    for (const row of (rows ?? []) as { id: string; title: string }[]) titles.set(row.id, row.title);
  }

  const unreadCount = notifications.filter((item) => !item.read_at).length;
  const hrefOf = (item: Notification) =>
    item.type === "letter" ? `/letters/${item.resource_id}` : item.type === "daily_status" ? "/today" : `/discussions/${item.resource_id}`;

  return <div className="page reading-page">
    <header className="page-header">
      <div><p className="eyebrow">留给彼此的动静</p><h1>通知</h1><p>{unreadCount ? `还有 ${unreadCount} 条没有看过。` : "都看过了，这里是最近的记录。"}</p></div>
      {unreadCount > 0 && <form action={markAllNotificationsRead}><SubmitButton className="button secondary" pendingText="正在标记…">全部标为已读</SubmitButton></form>}
    </header>
    {notifications.length ? <section className="notice-list">{notifications.map((item) => {
      const title = titles.get(item.resource_id);
      return <Link key={item.id} href={hrefOf(item)} className={`notice-row${item.read_at ? "" : " unread"}`}>
        <Avatar profile={item.actor} />
        <div className="notice-main">
          <div className="row-meta"><strong>{item.actor?.display_name ?? "对方"}</strong><span>{verbs[item.type]}</span><time>{formatDateTime(item.created_at)}</time></div>
          {title && <p className="notice-title">《{title}》</p>}
        </div>
        {!item.read_at && <span className="unread-mark">新</span>}
      </Link>;
    })}</section> : <div className="empty-state"><Bell size={30} /><h2>还没有通知</h2><p>对方发起问题、回复、寄信或者写下今天的状态时，这里会留下一条记录。</p></div>}
    <p className="export-hint">想把全部内容存一份？<Link href="/export">导出备份</Link></p>
  </div>;
}
