import { NextResponse } from "next/server";

/**
 * 健康检查：只回答"这个进程能正常响应请求"。
 * 刻意不去连 Supabase——否则 Supabase 抖一下就会让 Render 判定服务不健康并重启，
 * 把一次可恢复的依赖抖动放大成整站中断。
 */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ ok: true, at: new Date().toISOString() });
}
