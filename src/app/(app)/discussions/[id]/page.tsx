import Link from "next/link";
import { ArrowLeft, Check, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { notFound } from "next/navigation";
import { markRead } from "@/app/actions";
import { Avatar } from "@/components/avatar";
import { MarkRead } from "@/components/mark-read";
import { Prose } from "@/components/prose";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import type { Discussion, Reply } from "@/lib/types";

export default async function DiscussionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params; const query = await searchParams;
  const { supabase, user } = await requireUser();
  const { data } = await supabase.from("discussions").select("*, author:profiles!discussions_author_id_fkey(id, display_name, avatar_color)").eq("id", id).single();
  if (!data) notFound();
  const discussion = data as Discussion;
  const { data: replyData } = await supabase.from("discussion_replies").select("*, author:profiles!discussion_replies_author_id_fkey(id, display_name, avatar_color)").eq("discussion_id", id).order("created_at");
  const replies = (replyData ?? []) as Reply[];
  const isAuthor = discussion.author_id === user.id;
  return <div className="page reading-page"><MarkRead action={markRead} kind="discussion" resourceId={id} /><Link className="back-link" href="/discussions"><ArrowLeft size={17} />返回问题</Link>{query.error && <div className="error">{query.error}</div>}{query.saved && <div className="success" role="status">已保存。</div>}
    <article className="thread"><div className="thread-meta"><Avatar profile={discussion.author} /><div><strong>{discussion.author?.display_name}</strong><span>{formatDateTime(discussion.created_at)}{discussion.edited_at ? " · 已编辑" : ""}</span></div><span className={`status ${discussion.status}`}>{discussion.status === "open" ? "讨论中" : "已聊完"}</span></div>
      {query.edit === "question" && isAuthor && !discussion.deleted_at ? <form action="/api/discussions/update" method="post" className="form-stack inline-editor"><input type="hidden" name="id" value={id} /><label>问题标题<input name="title" defaultValue={discussion.title} maxLength={120} required /></label><label>正文<textarea name="body" defaultValue={discussion.body} rows={10} maxLength={5000} required /></label><div className="form-actions"><Link className="button secondary" href={`/discussions/${id}`}>取消</Link><button className="button primary" type="submit">保存修改</button></div></form> : <><h1>{discussion.deleted_at ? "此问题已删除" : discussion.title}</h1><div className={`thread-body ${discussion.deleted_at ? "deleted" : ""}`}>{discussion.deleted_at ? "原内容已由作者删除。" : <Prose text={discussion.body} />}</div></>}
      {isAuthor && !discussion.deleted_at && query.edit !== "question" && <div className="author-tools"><Link href={`/discussions/${id}?edit=question`}><Pencil size={15} />编辑</Link><form action="/api/discussions/delete" method="post"><input type="hidden" name="id" value={id} /><button type="submit"><Trash2 size={15} />删除</button></form><form action="/api/discussions/toggle" method="post"><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value={discussion.status === "open" ? "closed" : "open"} /><button type="submit">{discussion.status === "open" ? <><Check size={15} />标为聊完</> : <><RotateCcw size={15} />重新打开</>}</button></form></div>}
    </article>
    <section className="reply-section"><h2>{replies.length ? `${replies.length} 条回复` : "等待第一条回复"}</h2><div className="reply-stream">{replies.map((reply) => <article className="reply" key={reply.id}><div className="reply-rail"><Avatar profile={reply.author} size="small" /><span className="rail-line" /></div><div className="reply-content"><div className="row-meta"><strong>{reply.author?.display_name}</strong><time>{formatDateTime(reply.created_at)}</time>{reply.edited_at && <span>已编辑</span>}</div>{query.edit === reply.id && reply.author_id === user.id && !reply.deleted_at ? <form action="/api/discussions/reply/update" method="post" className="form-stack inline-editor"><input type="hidden" name="id" value={reply.id} /><input type="hidden" name="discussionId" value={id} /><textarea name="body" defaultValue={reply.body} rows={6} maxLength={5000} required /><div className="form-actions"><Link className="button secondary" href={`/discussions/${id}`}>取消</Link><button className="button primary" type="submit">保存修改</button></div></form> : <p className={reply.deleted_at ? "deleted" : ""}>{reply.deleted_at ? "此内容已删除" : reply.body}</p>}{reply.author_id === user.id && !reply.deleted_at && query.edit !== reply.id && <div className="author-tools compact"><Link href={`/discussions/${id}?edit=${reply.id}`}><Pencil size={14} />编辑</Link><form action="/api/discussions/reply/delete" method="post"><input type="hidden" name="id" value={reply.id} /><input type="hidden" name="discussionId" value={id} /><button><Trash2 size={14} />删除</button></form></div>}</div></article>)}</div>
      {discussion.status === "open" && !discussion.deleted_at && <form action="/api/discussions/reply" method="post" className="reply-form form-stack"><input type="hidden" name="discussionId" value={id} /><label>写下你的回应<textarea name="body" rows={7} maxLength={5000} required placeholder="先回应你真正听见的部分，再说自己的感受和想法……" /></label><div className="form-actions"><button className="button primary" type="submit">发出回复</button></div></form>}
    </section>
  </div>;
}
