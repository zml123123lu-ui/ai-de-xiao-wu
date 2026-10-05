/** 验证搜索：侧栏入口、跨四类内容的命中、命中词高亮、无结果时的提示。 */
import { chromium } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3101";
let failed = 0;
const check = (ok, label, extra = "") => {
  if (!ok) failed += 1;
  console.log(`${ok ? "✓" : "✗"} ${label}${extra ? `  ${extra}` : ""}`);
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: "zh-CN" });
const page = await context.newPage();
await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.getByLabel("邮箱").fill("alan@demo.local");
await page.getByLabel("密码").fill("demo-password-123");
await page.getByRole("button", { name: "进入爱的小屋" }).click();
await page.waitForURL(/\/today/, { timeout: 20000 });

// 1) 侧栏入口能直接搜
await page.locator('.sidebar-search input[name="q"]').fill("馄饨");
await page.locator('.sidebar-search input[name="q"]').press("Enter");
await page.waitForURL(/\/search\?q=/, { timeout: 15000 });
check(true, "侧栏搜索框可用", page.url().replace(BASE, ""));

// 2) 四类内容各自命中
const cases = [
  { term: "馄饨", group: "信件", why: "信件正文" },
  { term: "听懂", group: "问题", why: "问题标题" },
  { term: "外卖", group: "回复", why: "回复正文" },
  { term: "脑子", group: "今日状态", why: "每日状态正文（另一人的状态不受免刷新检查影响）" },
];
for (const item of cases) {
  await page.goto(`${BASE}/search?q=${encodeURIComponent(item.term)}`, { waitUntil: "networkidle" });
  const section = page.locator("section", { hasText: item.group });
  const hits = await section.locator(".search-hit").count();
  const marked = await section.locator("mark").first().textContent().catch(() => null);
  check(hits >= 1 && marked === item.term, `搜「${item.term}」命中${item.group}（${item.why}）`, `${hits} 条，高亮=${JSON.stringify(marked)}`);
}

// 3) 无结果
await page.goto(`${BASE}/search?q=zzzzz`, { waitUntil: "networkidle" });
check((await page.getByText("没有找到").count()) === 1, "无关词显示\"没有找到\"提示");

// 4) 命中回复时带上所属问题
await page.goto(`${BASE}/search?q=${encodeURIComponent("外卖")}`, { waitUntil: "networkidle" });
const replyMeta = await page.locator("section", { hasText: "回复" }).locator(".row-meta").first().textContent();
check((replyMeta ?? "").includes("最近有哪件事"), "回复结果里带上所属问题的标题", (replyMeta ?? "").trim());

// 5) 点进结果能到达原文
await page.goto(`${BASE}/search?q=${encodeURIComponent("馄饨")}`, { waitUntil: "networkidle" });
await page.locator("section", { hasText: "信件" }).locator(".search-hit").first().click();
await page.waitForURL(/\/letters\//, { timeout: 15000 });
check(/\/letters\/[0-9a-f-]{36}/.test(page.url()), "搜索结果可点进原文", page.url().replace(BASE, ""));

await context.close();
await browser.close();
if (failed) { console.log(`❌ ${failed} 项未通过`); process.exitCode = 1; }
else console.log("✅ 搜索全部通过");
