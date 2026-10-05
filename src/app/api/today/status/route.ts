import { saveDailyStatus } from "@/lib/status";

/** 普通表单 POST + 303：不依赖 server action 的重定向（那条路径在本应用上时灵时不灵）。 */
export async function POST(request: Request) {
  const result = await saveDailyStatus(await request.formData());
  const target = result.ok ? result.href : `/today?error=${encodeURIComponent(result.error)}`;
  return new Response(null, { status: 303, headers: { location: target } });
}
