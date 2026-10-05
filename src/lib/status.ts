import { revalidatePath } from "next/cache";
import { requireUser } from "./auth";
import { getShanghaiDate, upsertDailyStatusSchema } from "./domain";

export type StatusWriteResult = { ok: true; href: string } | { ok: false; error: string };

/** 保存今天的每日状态（写入或更新）。由 /api/today/status 调用。 */
export async function saveDailyStatus(formData: FormData): Promise<StatusWriteResult> {
  const { supabase, user } = await requireUser();
  const parsed = upsertDailyStatusSchema.safeParse({
    mood: String(formData.get("mood") ?? ""),
    body: String(formData.get("body") ?? ""),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const { error } = await supabase
    .from("daily_statuses")
    .upsert({ author_id: user.id, status_date: getShanghaiDate(), ...parsed.data }, { onConflict: "author_id,status_date" });
  if (error) return { ok: false, error: "今日状态没有保存" };

  revalidatePath("/today");
  // 时间戳保证每次跳转目标都不同：目标若与当前 URL 完全一致，
  // Next/React 会把这次跳转当成无事发生，按钮会一直停在提交中。
  return { ok: true, href: `/today?saved=${Date.now()}` };
}
