import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const relayToken = process.env.SUPABASE_RELAY_TOKEN;

  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    global: relayToken ? { headers: { "x-relay-token": relayToken } } : undefined,
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (items) => {
        items.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        items.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  const isLogin = request.nextUrl.pathname === "/login";
  const isPublicAsset = request.nextUrl.pathname.startsWith("/_next");
  // 非成员（有会话但没有 profiles 记录）被 requireUser 送来时带 error=member。
  // 这种会话必须在**中间件**里清掉：服务端组件写不了 cookie，
  // 否则"已登录→跳 /today→不是成员→跳回登录页→已登录"会变成无限重定向。
  const memberRejected = request.nextUrl.searchParams.get("error") === "member";

  if (!data.user && !isLogin && !isPublicAsset) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    return NextResponse.redirect(loginUrl);
  }

  if (data.user && isLogin && memberRejected) {
    // 清掉非成员会话（中间件里 setAll 有效），并让登录页正常显示"这个账号不是爱的小屋成员"
    await supabase.auth.signOut();
    return response;
  }

  if (data.user && isLogin) {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/today";
    return NextResponse.redirect(homeUrl);
  }

  return response;
}
