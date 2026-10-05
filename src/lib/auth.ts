import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient, hasSupabaseConfig } from "./supabase/server";
import type { Profile } from "./types";

export const requireUser = cache(async () => {
  if (!hasSupabaseConfig()) redirect("/login?setup=1");
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_color")
    .eq("id", data.user.id)
    .single();

  if (!profile) {
    await supabase.auth.signOut();
    redirect("/login?error=member");
  }

  return { supabase, user: data.user, profile: profile as Profile };
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
