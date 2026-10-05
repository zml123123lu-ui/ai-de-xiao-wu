import { NextResponse } from "next/server";

/**
 * Supabase 转发器。
 *
 * 为什么需要它：Supabase 的域名（*.supabase.co）在国内网络下 TLS 被重置，
 * 而 Render / Netlify 这类免费托管的默认域名可以直连——于是让应用自己
 * 把 /supabase/* 的请求转发给真正的 Supabase，前端仍然只依赖一个域名。
 * 这样不需要买域名、不需要备案，也不需要改数据库与 RLS。
 *
 * 只放行 auth / rest / storage 三个前缀；配置了 SUPABASE_RELAY_TOKEN 时还要求携带令牌。
 */
const UPSTREAM = process.env.SUPABASE_UPSTREAM_URL ?? "";
const TOKEN = process.env.SUPABASE_RELAY_TOKEN ?? "";
const ALLOWED = ["auth/v1", "rest/v1", "storage/v1"];
const FORWARD = ["apikey", "authorization", "content-type", "accept", "prefer", "x-client-info"];
const FORWARD_BACK = ["content-type", "content-range", "location"];

async function relay(request: Request, context: { params: Promise<{ path: string[] }> }) {
  if (!UPSTREAM) return NextResponse.json({ message: "未配置 SUPABASE_UPSTREAM_URL" }, { status: 503 });

  const { path } = await context.params;
  const target = path.join("/");
  if (!ALLOWED.some((prefix) => target.startsWith(prefix))) {
    return NextResponse.json({ message: "不支持的路径" }, { status: 404 });
  }
  if (TOKEN && request.headers.get("x-relay-token") !== TOKEN) {
    return NextResponse.json({ message: "缺少转发令牌" }, { status: 403 });
  }

  const search = new URL(request.url).search;
  const headers = new Headers();
  for (const name of FORWARD) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  const init: RequestInit = { method: request.method, headers, cache: "no-store", redirect: "manual" };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.arrayBuffer();
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${UPSTREAM.replace(/\/+$/, "")}/${target}${search}`, init);
  } catch (error) {
    console.error("supabase relay failed", error);
    return NextResponse.json({ message: "转发失败" }, { status: 502 });
  }

  const out = new Headers();
  for (const name of FORWARD_BACK) {
    const value = upstream.headers.get(name);
    if (value) out.set(name, value);
  }
  out.set("cache-control", "no-store");
  if (request.method === "HEAD") return new NextResponse(null, { status: upstream.status, headers: out });
  return new NextResponse(upstream.body, { status: upstream.status, headers: out });
}

export { relay as GET, relay as POST, relay as PATCH, relay as PUT, relay as DELETE, relay as HEAD };
