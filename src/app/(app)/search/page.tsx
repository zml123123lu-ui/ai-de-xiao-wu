import Link from "next/link";
import { BookOpenText, Heart, Mail, MessageCircle, Search as SearchIcon } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { formatDateTime, previewText } from "@/lib/format";

type DiscussionHit = { id: string; title: string; body: string; updated_at: string };
type ReplyHit = { id: string; discussion_id: string; body: string; created_at: string };
type LetterHit = { id: string; title: string; body: string; sent_at: string | null };
type StatusHit = { id: string; status_date: string; body: string; mood: string };

/** 把一段短文本里所有命中词都包进 <mark>（用于标题）。 */
function Highlight({ text, term }: { text: string; term: string }) {
  if (!term) return <>{text}</>;
  const lower = text.toLowerCase();
  const needle = term.toLowerCase();
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  let index = lower.indexOf(needle);
  while (index >= 0) {
    if (index > cursor) parts.push(text.slice(cursor, index));
    parts.push(<mark key={index}>{text.slice(index, index + term.length)}</mark>);
    cursor = index + term.length;
    index = lower.indexOf(needle, cursor);
  }
  if (!parts.length) return <>{text}</>;
  parts.push(text.slice(cursor));
  return <>{parts}</>;
}

/** 截取命中词附近的一段，并把命中词包进 <mark>。 */
function Snippet({ text, term, span = 150 }: { text: string; term: string; span?: number }) {
  const flat = text.replace(/\s+/g, " ").trim();
  const index = flat.toLowerCase().indexOf(term.toLowerCase());
  if (index < 0) return <>{previewText(flat, span)}</>;
  const start = Math.max(0, index - 34);
  const end = Math.min(flat.length, index + term.length + 70);
  return <>{start > 0 && "…"}{flat.slice(start, index)}<mark>{flat.slice(index, index + term.length)}</mark>{flat.slice(index + term.length, end)}{end < flat.length && "…"}</>;
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const term = (params.q ?? "").trim().slice(0, 40).replace(/[%_,()"\\*]/g, "");
  const { supabase } = await requireUser();

  let discussions: DiscussionHit[] = [];
  let replies: ReplyHit[] = [];
  let letters: LetterHit[] = [];
  let statuses: StatusHit[] = [];
  let replyTitles = new Map<string, string>();

  if (term) {
    const like = `%${term}%`;
    const [d, r, l, s] = await Promise.all([
      supabase.from("discussions").select("id, title, body, updated_at").is("deleted_at", null).or(`title.ilike.${like},body.ilike.${like}`).order("updated_at", { ascending: false }).limit(10),
      supabase.from("discussion_replies").select("id, discussion_id, body, created_at").is("deleted_at", null).ilike("body", like).order("created_at", { ascending: false }).limit(10),
      supabase.from("letters").select("id, title, body, sent_at").eq("status", "sent").or(`title.ilike.${like},body.ilike.${like}`).order("sent_at", { ascending: false }).limit(10),
      supabase.from("daily_statuses").select("id, status_date, body, mood").ilike("body", like).order("status_date", { ascending: false }).limit(10),
    ]);
    discussions = (d.data ?? []) as DiscussionHit[];
    replies = (r.data ?? []) as ReplyHit[];
    letters = (l.data ?? []) as LetterHit[];
    statuses = (s.data ?? []) as StatusHit[];

    const ids = [...new Set(replies.map((item) => item.discussion_id))];
    if (ids.length) {
      const { data: rows } = await supabase.from("discussions").select("id, title").in("id", ids);
      replyTitles = new Map(((rows ?? []) as { id: string; title: string }[]).map((row) => [row.id, row.title]));
    }
  }

  const LIMIT_PER_KIND = 10;
  const total = discussions.length + replies.length + letters.length + statuses.length;

  return <div className="page">
    <header className="page-header"><div><p className="eyebrow">翻找写过的话</p><h1>搜索</h1><p>{term ? `「${term}」找到 ${total} 处${total >= LIMIT_PER_KIND ? "（每类最多显示 10 条）" : ""}。` : "问题、回复、信件和每日状态会一起找。"}</p></div></header>
    <form className="search-form" action="/search" method="get" role="search">
      <SearchIcon size={18} />
      <input name="q" defaultValue={term} placeholder="比如：椅子、馄饨、吵架、明年" aria-label="搜索内容" maxLength={40} autoFocus />
      <button className="button primary" type="submit">查找</button>
    </form>
    {!term ? <div className="empty-state"><SearchIcon size={30} /><h2>想找哪句话？</h2><p>写一两个词就够了，不必记得原话。</p></div>
      : total === 0 ? <div className="empty-state"><SearchIcon size={30} /><h2>没有找到「{term}」</h2><p>换一个词，或者只写其中两个字试试。</p></div>
      : <div className="search-results">
        {discussions.length > 0 && <section><h2><BookOpenText size={16} />问题 · {discussions.length}</h2>{discussions.map((item) => <Link className="search-hit" href={`/discussions/${item.id}`} key={item.id}><div className="row-meta"><span>{formatDateTime(item.updated_at)}</span></div><h3><Highlight text={item.title} term={term} /></h3><p><Snippet text={item.body} term={term} /></p></Link>)}</section>}
        {replies.length > 0 && <section><h2><MessageCircle size={16} />回复 · {replies.length}</h2>{replies.map((item) => <Link className="search-hit" href={`/discussions/${item.discussion_id}`} key={item.id}><div className="row-meta"><span>《{replyTitles.get(item.discussion_id) ?? "问题"}》</span><time>{formatDateTime(item.created_at)}</time></div><p><Snippet text={item.body} term={term} /></p></Link>)}</section>}
        {letters.length > 0 && <section><h2><Mail size={16} />信件 · {letters.length}</h2>{letters.map((item) => <Link className="search-hit" href={`/letters/${item.id}`} key={item.id}><div className="row-meta"><span>{item.sent_at ? formatDateTime(item.sent_at) : ""}</span></div><h3><Highlight text={item.title} term={term} /></h3><p><Snippet text={item.body} term={term} /></p></Link>)}</section>}
        {statuses.length > 0 && <section><h2><Heart size={16} />今日状态 · {statuses.length}</h2>{statuses.map((item) => <Link className="search-hit" href={`/today?date=${item.status_date}`} key={item.id}><div className="row-meta"><span>{item.status_date}</span><span>{item.mood}</span></div><p><Snippet text={item.body} term={term} /></p></Link>)}</section>}
      </div>}
  </div>;
}
