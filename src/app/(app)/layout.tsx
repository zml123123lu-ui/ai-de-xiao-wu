import { AutoRefresh } from "@/components/auto-refresh";
import { LogoutForm } from "@/components/logout-form";
import { Nav } from "@/components/nav";
import { requireUser } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, profile, user } = await requireUser();
  const [{ data: unreadRows }, { data: latest }] = await Promise.all([
    supabase.from("notifications").select("type").eq("recipient_id", user.id).is("read_at", null),
    supabase.from("notifications").select("created_at").eq("recipient_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const unread = (unreadRows ?? []).reduce<Record<string, number>>((counts, item) => {
    counts[item.type] = (counts[item.type] ?? 0) + 1;
    return counts;
  }, {});
  // 只随"新内容"单调变化，标记已读不会让它改变
  const syncKey = (latest as { created_at: string } | null)?.created_at ?? "";
  return <div className="app-shell"><Nav profile={profile} unread={unread} logoutSlot={<LogoutForm />} /><main className="main-content">{children}</main><AutoRefresh syncKey={syncKey} /></div>;
}
