import { cookies } from "next/headers";
import { createClient, hasSupabaseConfig } from "@/lib/supabase/server";

/**
 * 退出登录。
 * 走"普通表单 POST + 303"而不是 server action 的 redirect——后者在 Next 15 下
 * 时灵时不灵（写信保存踩过同一个坑），而且这里还需要显式清掉会话 cookie。
 */
export async function POST() {
  const store = await cookies();
  const authCookies = store.getAll().filter((item) => item.name.includes("auth-token"));

  if (hasSupabaseConfig()) {
    try {
      const supabase = await createClient();
      await supabase.auth.signOut();
    } catch (error) {
      console.error("signOut failed", error);
    }
  }

  // 兜底：无论 signOut 是否清干净，都把会话 cookie 显式删掉
  for (const item of authCookies) {
    store.delete(item.name);
  }

  return new Response(null, { status: 303, headers: { location: "/login" } });
}
