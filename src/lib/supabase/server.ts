import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** 服务端优先用运行时变量：便于把地址指向本应用自带的 /supabase 转发器。 */
export function supabaseUrl() {
  return process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
}

export function hasSupabaseConfig() {
  return Boolean(supabaseUrl() && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export async function createClient() {
  const cookieStore = await cookies();
  const url = supabaseUrl();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const relayToken = process.env.SUPABASE_RELAY_TOKEN;

  if (!url || !key) throw new Error("Supabase environment variables are not configured");

  return createServerClient(url, key, {
    global: relayToken ? { headers: { "x-relay-token": relayToken } } : undefined,
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (items) => {
        try {
          items.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components cannot set cookies; middleware refreshes them.
        }
      },
    },
  });
}
