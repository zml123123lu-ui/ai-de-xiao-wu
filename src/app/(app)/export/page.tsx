import Link from "next/link";
import { FileJson, FileText } from "lucide-react";
import { requireUser } from "@/lib/auth";

export default async function ExportPage() {
  const { supabase } = await requireUser();
  const [discussions, replies, letters, draftLetters, statuses] = await Promise.all([
    supabase.from("discussions").select("*", { count: "exact", head: true }),
    supabase.from("discussion_replies").select("*", { count: "exact", head: true }),
    supabase.from("letters").select("*", { count: "exact", head: true }),
    supabase.from("letters").select("*", { count: "exact", head: true }).is("sent_at", null),
    supabase.from("daily_statuses").select("*", { count: "exact", head: true }),
  ]);
  const counts = {
    discussions: discussions.count ?? 0,
    replies: replies.count ?? 0,
    letters: letters.count ?? 0,
    drafts: draftLetters.count ?? 0,
    statuses: statuses.count ?? 0,
  };

  return <div className="page reading-page">
    <header className="page-header">
      <div>
        <p className="eyebrow">带走一份</p>
        <h1>导出备份</h1>
        <p>把你们写过的全部内容存到自己的电脑上，不依赖任何平台。</p>
      </div>
    </header>

    <section className="export-summary" aria-label="将要导出的内容">
      <div><strong>{counts.discussions}</strong><span>个问题</span></div>
      <div><strong>{counts.replies}</strong><span>条回复</span></div>
      <div><strong>{counts.letters}</strong><span>封信{counts.drafts ? `（含 ${counts.drafts} 封草稿）` : ""}</span></div>
      <div><strong>{counts.statuses}</strong><span>条每日状态</span></div>
    </section>

    <div className="export-grid">
      <a className="export-card" href="/api/export?format=md" download>
        <FileText size={22} />
        <strong>Markdown 备份</strong>
        <span>按问题、信件、每日状态分好章节，适合自己读、打印，或者存进笔记软件。</span>
        <em>.md</em>
      </a>
      <a className="export-card" href="/api/export?format=json" download>
        <FileJson size={22} />
        <strong>JSON 备份</strong>
        <span>结构化数据，包含全部原始字段，适合长期归档或以后导入别处。</span>
        <em>.json</em>
      </a>
    </div>

    <section className="export-notes">
      <h2>说明</h2>
      <ul>
        <li>导出的是<strong>纯文本原文</strong>，没有任何改写或美化；未寄出的草稿也在里面。</li>
        <li>包含你们两人的全部内容与已删除内容的标记，但<strong>不包含登录密码</strong>。</li>
        <li>建议每隔一段时间导出一份；文件可以随时删，网站这边不受影响。</li>
      </ul>
      <Link className="back-link" href="/notifications">← 返回通知</Link>
    </section>
  </div>;
}
