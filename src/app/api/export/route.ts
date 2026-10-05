import { requireUser } from "@/lib/auth";
import {
  buildJson,
  buildMarkdown,
  exportFilenames,
  type ExportBundle,
  type ExportDiscussion,
  type ExportLetter,
  type ExportMember,
  type ExportReply,
  type ExportStatus,
} from "@/lib/export";

const PAGE = 500;

/** 逐页取完，避免 Supabase 单次返回上限（默认 1000 行）悄悄截断备份。 */
async function fetchAll<T>(run: (from: number, to: number) => PromiseLike<{ data: T[] | null }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data } = await run(from, from + PAGE - 1);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows;
}

export async function GET(request: Request) {
  const format = new URL(request.url).searchParams.get("format") === "json" ? "json" : "md";
  const { supabase } = await requireUser(); // 未登录会跳转到登录页

  const [members, discussions, replies, letters, statuses] = await Promise.all([
    supabase.from("profiles").select("id, display_name").order("created_at"),
    fetchAll<Omit<ExportDiscussion, "replies">>((from, to) =>
      supabase.from("discussions").select("*, author:profiles!discussions_author_id_fkey(id, display_name)").order("created_at", { ascending: true }).range(from, to)),
    fetchAll<ExportReply & { discussion_id: string }>((from, to) =>
      supabase.from("discussion_replies").select("*, author:profiles!discussion_replies_author_id_fkey(id, display_name)").order("created_at", { ascending: true }).range(from, to)),
    fetchAll<ExportLetter>((from, to) =>
      supabase.from("letters").select("*, sender:profiles!letters_sender_id_fkey(id, display_name), recipient:profiles!letters_recipient_id_fkey(id, display_name)").order("created_at", { ascending: true }).range(from, to)),
    fetchAll<ExportStatus>((from, to) =>
      supabase.from("daily_statuses").select("*, author:profiles!daily_statuses_author_id_fkey(id, display_name)").order("status_date", { ascending: true }).range(from, to)),
  ]);

  const bundle: ExportBundle = {
    exportedAt: new Date().toISOString(),
    members: (members.data ?? []) as ExportMember[],
    discussions: discussions.map((item) => ({ ...item, replies: replies.filter((reply) => reply.discussion_id === item.id) })),
    letters,
    statuses,
  };

  const body = format === "json" ? buildJson(bundle) : buildMarkdown(bundle);
  const names = exportFilenames(format);
  return new Response(body, {
    headers: {
      "content-type": format === "json" ? "application/json; charset=utf-8" : "text/markdown; charset=utf-8",
      "content-disposition": `attachment; filename="${names.ascii}"; filename*=UTF-8''${encodeURIComponent(names.utf8)}`,
      "cache-control": "no-store",
    },
  });
}
