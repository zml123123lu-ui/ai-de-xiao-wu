/** 用本地 mock 数据把每个页面截图到 dev/shots/，供设计走查与回归对比。 */
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3100";
const OUT = "dev/shots";
const D1 = "aaaaaaaa-0000-4000-8000-000000000001";
const D3 = "aaaaaaaa-0000-4000-8000-000000000003";
const L1 = "cccccccc-0000-4000-8000-000000000001";
const L3 = "cccccccc-0000-4000-8000-000000000003";
const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

const PAGES = [
  { name: "01-login", path: "/login", anon: true },
  { name: "02-today", path: "/today" },
  { name: "03-today-history", path: `/today?date=${yesterday}` },
  { name: "04-discussions", path: "/discussions" },
  { name: "05-discussion-open", path: `/discussions/${D1}` },
  { name: "06-discussion-closed", path: `/discussions/${D3}` },
  { name: "07-discussion-new", path: "/discussions/new" },
  { name: "08-letters-inbox", path: "/letters?tab=inbox" },
  { name: "09-letters-sent", path: "/letters?tab=sent" },
  { name: "10-letters-drafts", path: "/letters?tab=drafts" },
  { name: "11-letter-open", path: `/letters/${L1}` },
  { name: "12-letter-own", path: `/letters/${L3}` },
  { name: "13-letter-compose", path: "/letters/compose" },
  { name: "14-notifications", path: "/notifications" },
  { name: "16-search", path: "/search?q=%E9%A6%84%E9%A5%A8" },
  { name: "17-export", path: "/export" },
  { name: "18-review", path: "/review" },
];

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const report = [];

for (const vp of [{ name: "desktop", width: 1440, height: 950 }, { name: "mobile", width: 390, height: 844 }]) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2, locale: "zh-CN", timezoneId: "Asia/Shanghai" });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

  // 先登录（anon 页面用匿名上下文另开）
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.getByLabel("邮箱").fill("alan@demo.local");
  await page.getByLabel("密码").fill("demo-password-123");
  await page.getByRole("button", { name: "进入爱的小屋" }).click();
  await page.waitForURL(/\/today/, { timeout: 20000 });

  for (const item of PAGES) {
    const target = item.anon ? await context.browser().newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2, locale: "zh-CN" }).then((c) => c.newPage()) : page;
    const res = await target.goto(`${BASE}${item.path}`, { waitUntil: "networkidle" });
    const file = `${OUT}/${item.name}-${vp.name}.png`;
    await target.screenshot({ path: file, fullPage: true });
    const overflow = await target.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    report.push(`${res?.status()} ${item.path} [${vp.name}] -> ${file} 横向溢出=${overflow}px 最终URL=${new URL(target.url()).pathname}`);
  }
  if (consoleErrors.length) report.push(`!! [${vp.name}] 控制台报错 ${consoleErrors.length} 条: ${consoleErrors.slice(0, 3).join(" | ")}`);
  await context.close();
}
// 暗色模式抽查
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, deviceScaleFactor: 2, locale: "zh-CN", timezoneId: "Asia/Shanghai", colorScheme: "dark" });
  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.getByLabel("邮箱").fill("alan@demo.local");
  await page.getByLabel("密码").fill("demo-password-123");
  await page.getByRole("button", { name: "进入爱的小屋" }).click();
  await page.waitForURL(/\/today/, { timeout: 20000 });
  for (const item of PAGES.filter((p) => ["02-today", "04-discussions", "05-discussion-open", "08-letters-inbox", "11-letter-open", "14-notifications"].includes(p.name))) {
    await page.goto(`${BASE}${item.path}`, { waitUntil: "networkidle" });
    await page.screenshot({ path: `${OUT}/${item.name}-dark.png`, fullPage: true });
    report.push(`dark ${item.path} -> ${OUT}/${item.name}-dark.png`);
  }
  await context.close();
}
await browser.close();
console.log(report.join("\n"));
