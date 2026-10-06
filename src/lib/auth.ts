import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient, hasSupabaseConfig } from "./supabase/server";
import type { Profile } from "./types";

export const requireUser = cache(async () => {
  if (!hasSupabaseConfig()) redirect("/login?setup=1");
  const supabase = await createClient();

  // 注意：这里必须用 getUser()。曾经为了省一次网络往返改成 getSession()，
  // 结果"免刷新更新"失灵——页面里那一段服务端数据不再随 router.refresh() 更新
  // （后端明明已返回新内容，界面却一直停在旧内容）。原因与 Next 对"用了哪些
  // 动态 API"的判定有关，不再冒这个险。
  const { data } = await supabase.auth.getUser();
  const user = data.user;
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
