import Link from "next/link";
import { ArrowRight, Mail, Plus } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { requireUser } from "@/lib/auth";
import { formatDateTime, previewText } from "@/lib/format";
import type { Letter } from "@/lib/types";

const PAGE_SIZE = 12;
const tabs = [{ key: "inbox", label: "收件箱" }, { key: "sent", label: "已寄出" }, { key: "drafts", label: "草稿箱" }] as const;

export default async function LettersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const tab = tabs.some((item) => item.key === params.tab) ? params.tab! : "inbox";
  const page = Math.max(1, Math.floor(Number(params.page ?? "1")) || 1);
  const { supabase, user } = await requireUser();

  let query = supabase
    .from("letters")
    .select("*, sender:profiles!letters_sender_id_fkey(id, display_name, avatar_color), recipient:profiles!letters_recipient_id_fkey(id, display_name, avatar_color)", { count: "exact" });
  if (tab === "inbox") query = query.eq("recipient_id", user.id).eq("status", "sent").order("sent_at", { ascending: false });
  else if (tab === "sent") query = query.eq("sender_id", user.id).eq("status", "sent").order("sent_at", { ascending: false });
  else query = query.eq("sender_id", user.id).eq("status", "draft").order("updated_at", { ascending: false });

  const from = (page - 1) * PAGE_SIZE;
  const { data, count } = await query.range(from, from + PAGE_SIZE - 1);
  const letters = (data ?? []) as Letter[];
  const total = count ?? letters.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (nextPage: number) => (nextPage > 1 ? `/letters?tab=${tab}&page=${nextPage}` : `/letters?tab=${tab}`);

  return <div className="page"><header className="page-header"><div><p className="eyebrow">写给彼此的话</p><h1>信件</h1><p>比消息慢一点，也完整一点。寄出之前，可以先好好想清楚。</p></div><Link className="button primary" href="/letters/compose"><Plus size={18} />写一封信</Link></header>
    {params.saved && <div className="success">草稿已保存。</div>}{params.sent && <div className="success">信已经寄出，正文将不能再修改。</div>}
    <nav className="tabs" aria-label="信件分类">{tabs.map((item) => <Link className={tab === item.key ? "active" : ""} key={item.key} href={`/letters?tab=${item.key}`}>{item.label}</Link>)}</nav>
    {letters.length ? <section className="letter-list">{letters.map((letter) => { const person = tab === "inbox" ? letter.sender : letter.recipient; const href = letter.status === "draft" ? `/letters/compose?id=${letter.id}` : `/letters/${letter.id}`; return <Link href={href} className={`letter-row ${tab === "inbox" && !letter.read_at ? "unread" : ""}`} key={letter.id}><Avatar profile={person} /><div className="letter-main"><div className="row-meta"><strong>{tab === "inbox" ? `来自 ${person?.display_name}` : `写给 ${person?.display_name}`}</strong><time>{formatDateTime(letter.sent_at ?? letter.updated_at)}</time></div><h2>{letter.title}</h2><p>{previewText(letter.body)}</p><div className="row-footer">{letter.status === "draft" ? <span>草稿</span> : tab === "sent" ? <span>{letter.read_at ? `已读 · ${formatDateTime(letter.read_at)}` : "尚未阅读"}</span> : !letter.read_at ? <span className="unread-mark">新信</span> : <span>已读</span>}</div></div><ArrowRight size={18} /></Link>; })}</section> : <div className="empty-state"><Mail size={30} /><h2>{tab === "inbox" ? "收件箱还是空的" : tab === "sent" ? "还没有寄出的信" : "没有未完成的草稿"}</h2><p>一封信不必等到重要日子，也可以只是认真讲完今天没讲完的话。</p><Link className="button primary" href="/letters/compose">写一封信</Link></div>}
    {pageCount > 1 && <nav className="pager" aria-label="翻页">
      <span>第 {page} / {pageCount} 页 · 共 {total} 封</span>
      <div className="pager-actions">
        {page > 1 && <Link className="button secondary" href={pageHref(page - 1)}>上一页</Link>}
        {page < pageCount && <Link className="button secondary" href={pageHref(page + 1)}>下一页</Link>}
      </div>
    </nav>}
  </div>;
}
