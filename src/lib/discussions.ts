import { revalidatePath } from "next/cache";
import { requireUser } from "./auth";
import { createDiscussionSchema, replySchema, updateDiscussionSchema, updateReplySchema } from "./domain";

export type WriteResult = { ok: true; href: string } | { ok: false; error: string; back: string };

const field = (formData: FormData, name: string) => String(formData.get(name) ?? "");

/** 写入后统一整页跳转：因为每次都是整页加载，界面一定是新的，
 *  也避免了"revalidatePath 的路径与当前带查询的 URL 对不上 → 界面不更新"这类问题。 */
const saved = (path: string) => `${path}${path.includes("?") ? "&" : "?"}saved=1`;

/** 发起问题（跳到一个新地址，行为稳定） */
export async function createDiscussionNow(formData: FormData): Promise<WriteResult> {
  const { supabase, user } = await requireUser();
  const parsed = createDiscussionSchema.safeParse({ title: field(formData, "title"), body: field(formData, "body") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message, back: "/discussions/new" };
  const { data, error } = await supabase.from("discussions").insert({ ...parsed.data, author_id: user.id }).select("id").single();
  if (error || !data) return { ok: false, error: "问题没有保存，请稍后再试", back: "/discussions/new" };
  revalidatePath("/discussions");
  return { ok: true, href: `/discussions/${data.id}` };
}

/** 回复某个问题 */
export async function createReplyFor(formData: FormData): Promise<WriteResult> {
  const { supabase, user } = await requireUser();
  const path = `/discussions/${field(formData, "discussionId")}`;
  const parsed = replySchema.safeParse({ discussionId: field(formData, "discussionId"), body: field(formData, "body") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message, back: path };
  const { error } = await supabase.from("discussion_replies").insert({ discussion_id: parsed.data.discussionId, body: parsed.data.body, author_id: user.id });
  if (error) return { ok: false, error: "回复没有发出", back: path };
  revalidatePath(path);
  return { ok: true, href: saved(path) };
}

/** 修改一条回复 */
export async function updateReplyFor(formData: FormData): Promise<WriteResult> {
  const { supabase, user } = await requireUser();
  const path = `/discussions/${field(formData, "discussionId")}`;
  const parsed = updateReplySchema.safeParse({ id: field(formData, "id"), discussionId: field(formData, "discussionId"), body: field(formData, "body") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message, back: path };
  const { error } = await supabase.from("discussion_replies").update({ body: parsed.data.body, edited_at: new Date().toISOString() }).eq("id", parsed.data.id).eq("author_id", user.id).is("deleted_at", null);
  if (error) return { ok: false, error: "修改没有保存", back: path };
  revalidatePath(path);
  return { ok: true, href: saved(path) };
}

/** 修改问题本身 */
export async function updateDiscussionNow(formData: FormData): Promise<WriteResult> {
  const { supabase, user } = await requireUser();
  const path = `/discussions/${field(formData, "id")}`;
  const parsed = updateDiscussionSchema.safeParse({ id: field(formData, "id"), title: field(formData, "title"), body: field(formData, "body") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message, back: path };
  const { error } = await supabase.from("discussions").update({ title: parsed.data.title, body: parsed.data.body, edited_at: new Date().toISOString() }).eq("id", parsed.data.id).eq("author_id", user.id).is("deleted_at", null);
  if (error) return { ok: false, error: "修改没有保存", back: path };
  revalidatePath(path);
  return { ok: true, href: saved(path) };
}

/** 标为聊完 / 重新打开 */
export async function toggleDiscussionNow(formData: FormData): Promise<WriteResult> {
  const { supabase, user } = await requireUser();
  const id = field(formData, "id");
  const path = `/discussions/${id}`;
  const status = field(formData, "status") === "closed" ? "closed" : "open";
  const { error } = await supabase.from("discussions").update({ status }).eq("id", id).eq("author_id", user.id).is("deleted_at", null);
  if (error) return { ok: false, error: "状态没有更新", back: path };
  return { ok: true, href: saved(path) };
}

/** 删除问题（软删除） */
export async function deleteDiscussionNow(formData: FormData): Promise<WriteResult> {
  const { supabase, user } = await requireUser();
  const id = field(formData, "id");
  const { error } = await supabase.from("discussions").update({ deleted_at: new Date().toISOString() }).eq("id", id).eq("author_id", user.id).is("deleted_at", null);
  if (error) return { ok: false, error: "没有删除成功", back: `/discussions/${id}` };
  return { ok: true, href: "/discussions?saved=1" };
}

/** 删除一条回复（软删除） */
export async function deleteReplyNow(formData: FormData): Promise<WriteResult> {
  const { supabase, user } = await requireUser();
  const id = field(formData, "id");
  const path = `/discussions/${field(formData, "discussionId")}`;
  const { error } = await supabase.from("discussion_replies").update({ deleted_at: new Date().toISOString() }).eq("id", id).eq("author_id", user.id).is("deleted_at", null);
  if (error) return { ok: false, error: "没有删除成功", back: path };
  return { ok: true, href: saved(path) };
}

/** 供路由处理器共用：把结果变成 303 */
export function redirectAfter(result: WriteResult) {
  const target = result.ok ? result.href : `${result.back}${result.back.includes("?") ? "&" : "?"}error=${encodeURIComponent(result.error)}`;
  return new Response(null, { status: 303, headers: { location: target } });
}
