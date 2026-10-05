"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import {
  loginSchema,
} from "@/lib/domain";
import { markLetterRead, markNotificationsRead } from "@/lib/reads";
import { createClient, hasSupabaseConfig } from "@/lib/supabase/server";


function field(formData: FormData, name: string) {
  return String(formData.get(name) ?? "");
}

function fail(path: string, message: string): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(message)}`);
}
export async function login(formData: FormData) {
  if (!hasSupabaseConfig()) fail("/login", "请先配置 Supabase 环境变量");
  const parsed = loginSchema.safeParse({
    email: field(formData, "email"),
    password: field(formData, "password"),
  });
  if (!parsed.success) fail("/login", parsed.error.issues[0].message);
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) fail("/login", "邮箱或密码不正确");
  redirect("/today");
}

export async function markAllNotificationsRead() {
  const { supabase, user } = await requireUser();
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", user.id)
    .is("read_at", null);
  revalidatePath("/", "layout");
}

/**
 * 标记"这一条我已经看过了"。由客户端在页面挂载后调用，
 * 而不是在服务端渲染过程中写库——渲染保持无副作用，未读徽标也就不会和正文打架。
 */
export async function markRead(kind: "discussion" | "letter" | "daily_status", resourceId?: string) {
  const { supabase, user } = await requireUser();
  if (!resourceId) return;
  if (kind === "letter") await markLetterRead(supabase, user.id, resourceId);
  else if (kind === "discussion") await markNotificationsRead(supabase, user.id, ["discussion", "reply"], resourceId);
  else await markNotificationsRead(supabase, user.id, ["daily_status"], resourceId);
  revalidatePath("/", "layout");
}
