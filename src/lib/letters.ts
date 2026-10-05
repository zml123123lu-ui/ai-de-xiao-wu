import { revalidatePath } from "next/cache";
import { letterSchema } from "./domain";
import { requireUser } from "./auth";

export type LetterWriteResult = { ok: true; href: string } | { ok: false; error: string };

function field(formData: FormData, name: string) {
  return String(formData.get(name) ?? "");
}

function writeError(error: { code?: string; message: string }) {
  console.error("Letter write failed", { code: error.code, message: error.message });
  if (error.code === "42501") return "没有寄信权限，请重新登录后再试";
  if (error.code === "23514") return "这封信的数据不完整，请补全题目和正文后重试";
  return "信没有寄出去，请稍后再试";
}

/** 保存草稿：由 /api/letters/save 调用，成功后由服务端 303 跳转。 */
export async function saveLetterDraft(formData: FormData): Promise<LetterWriteResult> {
  const { supabase, user } = await requireUser();
  const parsed = letterSchema.safeParse({
    id: field(formData, "id") || undefined,
    replyToId: field(formData, "replyToId") || undefined,
    recipientId: field(formData, "recipientId"),
    title: field(formData, "title"),
    body: field(formData, "body"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const payload = {
    recipient_id: parsed.data.recipientId,
    title: parsed.data.title,
    body: parsed.data.body,
    reply_to_id: parsed.data.replyToId ?? null,
  };
  const { error } = parsed.data.id
    ? await supabase.from("letters").update(payload).eq("id", parsed.data.id).eq("sender_id", user.id).eq("status", "draft")
    : await supabase.from("letters").insert({ ...payload, sender_id: user.id, status: "draft" });
  if (error) return { ok: false, error: writeError(error) };
  revalidatePath("/letters");
  return { ok: true, href: "/letters?tab=drafts&saved=1" };
}

/** 正式寄出：由 /api/letters/send 调用。已寄出的信由数据库触发器禁止修改。 */
export async function sendLetterNow(formData: FormData): Promise<LetterWriteResult> {
  const { supabase, user } = await requireUser();
  const parsed = letterSchema.safeParse({
    id: field(formData, "id") || undefined,
    replyToId: field(formData, "replyToId") || undefined,
    recipientId: field(formData, "recipientId"),
    title: field(formData, "title"),
    body: field(formData, "body"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { error } = parsed.data.id
    ? await supabase.from("letters").update({ title: parsed.data.title, body: parsed.data.body, status: "sent" }).eq("id", parsed.data.id).eq("sender_id", user.id).eq("status", "draft")
    : await supabase.from("letters").insert({
      sender_id: user.id,
      recipient_id: parsed.data.recipientId,
      reply_to_id: parsed.data.replyToId ?? null,
      title: parsed.data.title,
      body: parsed.data.body,
      status: "sent",
      sent_at: new Date().toISOString(),
    });
  if (error) return { ok: false, error: writeError(error) };
  revalidatePath("/letters");
  return { ok: true, href: "/letters?tab=sent&sent=1" };
}
