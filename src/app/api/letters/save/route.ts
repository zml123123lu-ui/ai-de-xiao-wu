import { saveLetterDraft } from "@/lib/letters";

/** 用普通表单 POST + 303 跳转，绕开 server action 重定向在部分路径下不生效的问题。 */
export async function POST(request: Request) {
  const result = await saveLetterDraft(await request.formData());
  const target = result.ok ? result.href : `/letters/compose?error=${encodeURIComponent(result.error)}`;
  // 用相对 Location：new URL(target, request.url) 会把域名规范成 localhost，
  // 而会话 cookie 是按访问域名绑定的，跨域名跳转会直接掉登录。
  return new Response(null, { status: 303, headers: { location: target } });
}
