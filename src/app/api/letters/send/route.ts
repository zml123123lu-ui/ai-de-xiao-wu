import { sendLetterNow } from "@/lib/letters";

/** 同上：普通表单 POST + 303，保证"有没有 JS 都能寄出去"。 */
export async function POST(request: Request) {
  const result = await sendLetterNow(await request.formData());
  const target = result.ok ? result.href : `/letters/compose?error=${encodeURIComponent(result.error)}`;
  // 用相对 Location：new URL(target, request.url) 会把域名规范成 localhost，
  // 而会话 cookie 是按访问域名绑定的，跨域名跳转会直接掉登录。
  return new Response(null, { status: 303, headers: { location: target } });
}
