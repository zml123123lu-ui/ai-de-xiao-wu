import { chromium } from "@playwright/test";
const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3101";
const MOCK = process.env.MOCK_URL ?? "http://127.0.0.1:54321";
const PARTNER = "11111111-1111-4111-8111-111111111111";
const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: "zh-CN" });
const page = await context.newPage();
await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.getByLabel("邮箱").fill("alan@demo.local");
await page.getByLabel("密码").fill("demo-password-123");
await page.getByRole("button", { name: "进入爱的小屋" }).click();
await page.waitForURL(/\/today/, { timeout: 20000 });
await page.locator(".status-sheet").nth(1).waitFor({ state: "visible", timeout: 15000 });

const card = async () => (await page.locator(".status-sheet").nth(1).innerText()).replace(/\n+/g, " | ").slice(0, 70);
console.log("① 初始时对方卡片:", await card());

const marker = `诊断-${Date.now()}`;
const res = await fetch(`${MOCK}/rest/v1/daily_statuses?author_id=eq.${PARTNER}&status_date=eq.${today}`, {
  method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ body: marker }),
});
console.log(`② 写入假后端: HTTP ${res.status}，marker=${marker}`);
const rows = await (await fetch(`${MOCK}/rest/v1/daily_statuses?select=author_id,body&status_date=eq.${today}`)).json();
console.log("   后端现有行:", rows.map((r) => `${r.author_id.slice(0, 4)}:${String(r.body).slice(0, 12)}`).join(" / "));

console.log("③ 等服务端组件刷新（最多 40 秒）…");
for (let i = 0; i < 8; i += 1) {
  await page.waitForTimeout(5000);
  const text = await card();
  const has = text.includes(marker.slice(0, 10));
  console.log(`   +${(i + 1) * 5}s 卡片: ${text}  ${has ? "← 已更新 ✓" : ""}`);
  if (has) break;
}
console.log("④ 期间有没有整页刷新:", await page.evaluate(() => performance.getEntriesByType("navigation").length));
await browser.close();
