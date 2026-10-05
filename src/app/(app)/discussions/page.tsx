import Link from "next/link";
import { ArrowRight, MessageCircle, Plus } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { requireUser } from "@/lib/auth";
import { formatDateTime, previewText } from "@/lib/format";
import type { Discussion } from "@/lib/types";

const PAGE_SIZE = 20;

const filters = [
  { key: "all", label: "全部" },
  { key: "open", label: "讨论中" },
  { key: "closed", label: "已聊完" },
] as const;

export default async function DiscussionsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const requested = params.status;
  const active: "all" | "open" | "closed" = requested === "open" || requested === "closed" ? requested : "all";
  const page = Math.max(1, Math.floor(Number(params.page ?? "1")) || 1);
  const { supabase } = await requireUser();

  // 三个数字用 HEAD 计数拿，不再为了统计把整张表拉回来
  const countOf = (status?: "open" | "closed") => {
    const query = supabase.from("discussions").select("*", { count: "exact", head: true });
    return status ? query.eq("status", status) : query;
  };
  const [allCount, openCount, closedCount] = await Promise.all([countOf(), countOf("open"), countOf("closed")]);
  const counts = { all: allCount.count ?? 0, open: openCount.count ?? 0, closed: closedCount.count ?? 0 };

  const from = (page - 1) * PAGE_SIZE;
  let query = supabase
    .from("discussions")
    .select("*, author:profiles!discussions_author_id_fkey(id, display_name, avatar_color), discussion_replies(count)", { count: "exact" })
    .order("updated_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);
  if (active !== "all") query = query.eq("status", active);
  const { data, count, error } = await query;
  if (error) {
    throw new Error(`无法读取问题列表：${error.message}`);
  }
  const discussions = (data ?? []) as (Discussion & { discussion_replies: { count: number }[] })[];
  const total = count ?? counts[active];
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (nextPage: number) => {
    const search = new URLSearchParams();
    if (active !== "all") search.set("status", active);
    if (nextPage > 1) search.set("page", String(nextPage));
    const qs = search.toString();
    return qs ? `/discussions?${qs}` : "/discussions";
  };

  return <div className="page"><header className="page-header"><div><p className="eyebrow">想一起聊的事</p><h1>问题</h1><p>把还没找到合适时机说的话，先认真地放在这里。</p></div><Link className="button primary" href="/discussions/new"><Plus size={18} />发起问题</Link></header>
    <nav className="filter-row" aria-label="按状态筛选">{filters.map((item) => <Link key={item.key} className={active === item.key ? "active" : undefined} aria-current={active === item.key ? "page" : undefined} href={item.key === "all" ? "/discussions" : `/discussions?status=${item.key}`}>{item.label} {counts[item.key]}</Link>)}</nav>
    {discussions.length ? <section className="discussion-list">{discussions.map((item) => <Link className="discussion-row" href={`/discussions/${item.id}`} key={item.id}><div className="row-avatar"><Avatar profile={item.author} /></div><div className="row-main"><div className="row-meta"><span>{item.author?.display_name}</span><time>{formatDateTime(item.updated_at)}</time>{item.edited_at && <span>已编辑</span>}</div><h2>{item.deleted_at ? "此问题已删除" : item.title}</h2><p>{item.deleted_at ? "原内容已由作者删除。" : previewText(item.body)}</p><div className="row-footer"><span className={`status ${item.status}`}>{item.status === "open" ? "讨论中" : "已聊完"}</span><span><MessageCircle size={15} />{item.discussion_replies?.[0]?.count ?? 0} 条回复</span></div></div><ArrowRight className="row-arrow" size={19} /></Link>)}</section> : <div className="empty-state"><MessageCircle size={30} /><h2>{active === "all" ? "还没有问题" : "这一栏还是空的"}</h2><p>{active === "all" ? "第一句话可以很简单，比如“最近有什么是我没有注意到的吗？”" : "换个筛选看看，或者现在就发起一个问题。"}</p><Link className="button primary" href={active === "all" ? "/discussions/new" : "/discussions?status=all"}>写下第一个问题</Link></div>}
    {pageCount > 1 && <nav className="pager" aria-label="翻页">
      <span>第 {page} / {pageCount} 页 · 共 {total} 个问题</span>
      <div className="pager-actions">
        {page > 1 && <Link className="button secondary" href={pageHref(page - 1)}>上一页</Link>}
        {page < pageCount && <Link className="button secondary" href={pageHref(page + 1)}>下一页</Link>}
      </div>
    </nav>}
  </div>;
}
