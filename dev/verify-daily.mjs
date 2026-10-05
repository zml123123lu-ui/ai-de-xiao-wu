/** 每日状态：写下 → 再改（应当是更新而不是新增一条）→ 翻看历史日期（只读）。 */
import { chromium } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3101";
const MOCK = process.env.MOCK_URL ?? "http://127.0.0.1:54321";
const ME = "22222222-2222-4222-8222-222222222222";
let failed = 0;
const check = (ok, label, extra = "") => {
  if (!ok) failed += 1;
  console.log(`${ok ? "✓" : "✗"} ${label}${extra ? `  ${extra}` : ""}`);
};
const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
const yesterday = new Date(Date.now() + 8 * 3600 * 1000 - 86400000).toISOString().slice(0, 10);
const mineRows = async () =>
  (await (await fetch(`${MOCK}/rest/v1/daily_statuses?select=*&author_id=eq.${ME}&status_date=eq.${today}`)).json());

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: "zh-CN", timezoneId: "Asia/Shanghai" });
const page = await context.newPage();
await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.getByLabel("邮箱").fill("alan@demo.local");
await page.getByLabel("密码").fill("demo-password-123");
await page.getByRole("button", { name: "进入爱的小屋" }).click();
await page.waitForURL(/\/today/, { timeout: 20000 });

// ---- 1) 写下今天 ----
const firstMark = `状态写入-${Date.now()}`;
await page.locator(".mood-options label", { hasText: "低落" }).click();
await page.locator(".status-form textarea").fill(firstMark);
await page.locator(".status-form button").first().click();
await page.waitForURL(/saved=/, { timeout: 20000 });
await page.locator(".success").waitFor({ state: "visible", timeout: 15000 });
check(true, "提交后出现已保存提示");
await page.locator(".status-form button", { hasText: "更新今天" }).waitFor({ state: "visible", timeout: 15000 });
check(true, "首次保存后按钮恢复可用（没有卡在提交中）");
let rows = await mineRows();
check(rows.length === 1 && rows[0].mood === "低落" && rows[0].body === firstMark, "今天的状态已写入且心情正确", `共 ${rows.length} 条 / mood=${rows[0]?.mood}`);
await page.locator(".status-sheet.mine textarea").waitFor({ state: "visible", timeout: 15000 });
check((await page.locator(".status-sheet.mine textarea").inputValue()) === firstMark, "输入框里是刚写的状态");

// ---- 2) 再改一次：应当是更新，不是新增 ----
const secondMark = `${firstMark}-改`;
await page.locator(".mood-options label", { hasText: "很好" }).click();
await page.locator(".status-form textarea").fill(secondMark);
await page.locator(".status-form button").first().click();
await page.waitForURL(/saved=/, { timeout: 20000 });
// 关键回归点：第二次保存的重定向目标原先与当前 URL 相同，会让按钮永远卡在"正在写下…"
await page.locator(".status-form button", { hasText: "更新今天" }).waitFor({ state: "visible", timeout: 15000 });
check((await page.locator(".status-sheet.mine textarea").inputValue()) === secondMark, "第二次保存后输入框里是刚写的内容");
rows = await mineRows();
check(rows.length === 1 && rows[0].mood === "很好" && rows[0].body === secondMark, "再次提交是更新而非新增（每天只有一条）", `共 ${rows.length} 条 / mood=${rows[0]?.mood}`);

// ---- 3) 翻看昨天：只读 ----
await page.locator(".date-picker summary").click();
await page.locator("#status-date").fill(yesterday);
// 页面可能还在做上一轮的重新渲染，点不到就等一会儿再点
for (let attempt = 1; attempt <= 3; attempt += 1) {
  try {
    await page.getByRole("button", { name: "查看这天" }).click({ timeout: 5000 });
    break;
  } catch {
    await page.waitForTimeout(700);
  }
}
await page.waitForURL(new RegExp(`date=${yesterday}`), { timeout: 20000 });
check((await page.locator(".status-sheet.mine textarea").count()) === 0, "历史日期是只读的（没有输入框）");
check((await page.locator(".status-sheet.mine .status-body").count()) === 1, "历史日期显示当时写下的内容");

// ---- 4) 回到今天：可编辑且是最后一次的内容 ----
await page.goto(`${BASE}/today`, { waitUntil: "networkidle" });
await page.locator(".status-sheet.mine textarea").waitFor({ state: "visible", timeout: 15000 });
const value = await page.locator(".status-sheet.mine textarea").inputValue();
check(value === secondMark, "回到今天仍带着最后一次的内容", value.slice(0, 14));

await context.close();
await browser.close();
if (failed) { console.log(`❌ ${failed} 项未通过`); process.exitCode = 1; }
else console.log("✅ 每日状态流程全部通过");
