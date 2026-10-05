import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient, hasSupabaseConfig } from "./supabase/server";
import type { Profile } from "./types";

export const requireUser = cache(async () => {
  if (!hasSupabaseConfig()) redirect("/login?setup=1");
  const supabase = await createClient();

  // 这里刻意用 getSession() 而不是 getUser()：后者每次都会向 Auth 服务发一趟
  // 网络请求。中间件已经在每个请求上用 getUser() 验证过会话（并顺带刷新令牌），
  // 页面内不必再验一次——而首页会预取十几个路由，重复验证实测能累加到 16 次往返。
  // 安全性不受影响：伪造的会话过不了中间件那一关；即便绕过，
  // 真正的数据访问仍然由 RLS 按 JWT 把关。
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_color")
    .eq("id", user.id)
    .single();

  if (!profile) {
    await supabase.auth.signOut();
    redirect("/login?error=member");
  }

  return { supabase, user, profile: profile as Profile };
});

export const getPartner = cache(async (userId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_color")
    .neq("id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as Profile | null) ?? null;
});
