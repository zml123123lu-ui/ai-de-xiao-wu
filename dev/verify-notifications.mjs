/** 通知中心：「全部标为已读」这个按钮此前没有任何自动化覆盖。
 *  它用的是只用 revalidatePath 的动作——正好验证"无查询参数的页面"上这条路是通的。 */
import { chromium } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3101";
const MOCK = process.env.MOCK_URL ?? "http://127.0.0.1:54321";
const ME = "22222222-2222-4222-8222-222222222222";
let failed = 0;
const check = (ok, label, extra = "") => {
  if (!ok) failed += 1;
  console.log(`${ok ? "✓" : "✗"} ${label}${extra ? `  ${extra}` : ""}`);
};
const unreadRows = async () => {
  const rows = await (await fetch(`${MOCK}/rest/v1/notifications?select=id,type,read_at&recipient_id=eq.${ME}`)).json();
  return rows.filter((row) => row.read_at === null || row.read_at === undefined);
};
const unreadCount = async () => (await unreadRows()).length;

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: "zh-CN", timezoneId: "Asia/Shanghai" });
const page = await context.newPage();
await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.getByLabel("邮箱").fill("alan@demo.local");
await page.getByLabel("密码").fill("demo-password-123");
await page.getByRole("button", { name: "进入爱的小屋" }).click();
await page.waitForURL(/\/today/, { timeout: 20000 });

// 自己造两条未读，不依赖 fixtures 的初始状态（否则重复运行会互相影响）
for (let i = 0; i < 2; i += 1) {
  await fetch(`${MOCK}/rest/v1/notifications`, {
    method: "POST",
    headers: { "content-type": "application/json", prefer: "return=minimal" },
    body: JSON.stringify({
      recipient_id: ME,
      actor_id: "11111111-1111-4111-8111-111111111111",
      type: "reply",
      resource_id: "aaaaaaaa-0000-4000-8000-000000000001",
      read_at: null,
    }),
  });
}
const before = await unreadCount();
check(before > 0, "已造出未读通知作为前提（自己造，不依赖初始状态）", `${before} 条`);

await page.goto(`${BASE}/notifications`, { waitUntil: "networkidle" });
await page.locator("h1").waitFor({ state: "visible", timeout: 15000 });
const shownBefore = await page.getByRole("button", { name: "全部标为已读" }).count();
check(shownBefore === 1, "有未读时显示「全部标为已读」按钮");

await page.getByRole("button", { name: "全部标为已读" }).click();
// 关键：这个动作只用 revalidatePath，界面必须自己更新（无查询参数的页面这条路应当通畅）
let cleared = true;
try {
  await page.getByRole("button", { name: "全部标为已读" }).waitFor({ state: "detached", timeout: 15000 });
} catch { cleared = false; }
check(cleared, "点击后按钮消失（界面已更新，不是只改了数据库）");
// 注意：不能只等按钮"消失"——表单提交时 DOM 会先被拆掉，动作可能还在飞。
// 这里轮询后端直到归零，断言的是最终状态。
let leftover = await unreadRows();
for (let attempt = 0; attempt < 20 && leftover.length > 0; attempt += 1) {
  await page.waitForTimeout(300);
  leftover = await unreadRows();
}
check(leftover.length === 0, "数据库中全部标记为已读", leftover.length ? `剩余 ${leftover.length} 条：${leftover.map((r) => `${r.type}/${r.id.slice(0, 8)}`).join(", ")}` : "");

const badge = await page.locator(".nav a", { hasText: "通知" }).locator(".badge").count();
check(badge === 0, "导航上的未读角标也清掉了");

await page.goto(`${BASE}/notifications`, { waitUntil: "networkidle" });
check((await page.getByRole("button", { name: "全部标为已读" }).count()) === 0, "刷新后仍然没有未读（状态持久）");

await context.close();
await browser.close();
if (failed) { console.log(`❌ ${failed} 项未通过`); process.exitCode = 1; }
else console.log("✅ 通知中心全部通过");
