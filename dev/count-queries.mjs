/** 量每个页面加载时向 Supabase 发了几次请求、都是什么。
 *  次数越多意味着服务端渲染越慢（每次都要跨网络往返），是性能上最容易忽视的开销。 */
import { chromium } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3101";
const LOG = process.env.MOCK_LOG ?? "/tmp/dsh-mock.log";
const paths = process.env.PATHS ? process.env.PATHS.split(",") : ["/today", "/discussions", "/letters", "/notifications", "/review", "/search?q=%E7%9A%84", "/export"];

const logLines = () => {
  if (!existsSync(LOG)) return [];
  return readFileSync(LOG, "utf8").split("\n");
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: "zh-CN", timezoneId: "Asia/Shanghai" });
const page = await context.newPage();
await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.getByLabel("邮箱").fill("alan@demo.local");
await page.getByLabel("密码").fill("demo-password-123");
await page.getByRole("button", { name: "进入爱的小屋" }).click();
await page.waitForURL(/\/today/, { timeout: 20000 });

let worst = 0;
console.log("页面".padEnd(30) + "请求数".padStart(8) + "  最多的重复查询");
for (const path of paths) {
  const before = logLines().length;
  const started = Date.now();
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  const ms = Date.now() - started;
  await page.waitForTimeout(600);
  const fresh = logLines().slice(before).filter((line) => line.includes("/rest/v1/") || line.includes("/auth/v1/"));
  const tables = fresh.map((line) => {
    const m = line.match(/\/rest\/v1\/(\w+)/);
    return m ? m[1] : line.match(/\/auth\/v1\/(\w+)/)?.[0] ?? "auth";
  });
  const counts = tables.reduce((acc, t) => ({ ...acc, [t]: (acc[t] ?? 0) + 1 }), {});
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t}×${n}`).join(", ");
  worst = Math.max(worst, fresh.length);
  console.log(path.padEnd(30) + String(fresh.length).padStart(8) + `  ${top}   (${ms}ms)`);
}
console.log(`\n最多的一次：${worst} 次请求`);
if (worst > 12) console.log("⚠ 有页面请求次数偏多，值得看看是否能合并");
await browser.close();
