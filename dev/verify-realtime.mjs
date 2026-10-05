/**
 * 验证"免刷新"：在页面不重新加载的前提下，模拟对方在另一台设备上写入，
 * 检查页面是否会自动出现新内容。
 */
import { chromium } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3100";
const MOCK = process.env.MOCK_URL ?? "http://127.0.0.1:54321";
const PARTNER_ID = "11111111-1111-4111-8111-111111111111";
const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: "zh-CN", timezoneId: "Asia/Shanghai" });
const page = await context.newPage();
await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.getByLabel("邮箱").fill("alan@demo.local");
await page.getByLabel("密码").fill("demo-password-123");
await page.getByRole("button", { name: "进入爱的小屋" }).click();
await page.waitForURL(/\/today/, { timeout: 20000 });
// headless 下若页面不在前台，浏览器会把 visibilityState 记为 hidden，
// 而 AutoRefresh 的设计就是在不可见时暂停刷新——那是正确行为，测试需要显式置前。
await page.bringToFront();
await page.waitForTimeout(300);

// 证据：整页文档加载次数（load 事件）与 RSC 局部刷新次数
let fullLoads = 0;
let rscFetches = 0;
page.on("load", () => { fullLoads += 1; });
page.on("request", (request) => {
  const isRsc = request.headers()["rsc"] === "1" || request.url().includes("_rsc=");
  if (isRsc && request.url().includes("/today")) rscFetches += 1;
});
const loadsBefore = fullLoads;

const marker = `自动刷新验证-${Date.now()}`;
const written = await fetch(`${MOCK}/rest/v1/daily_statuses?author_id=eq.${PARTNER_ID}&status_date=eq.${today}`, {
  method: "PATCH",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ mood: "很好", body: marker }),
});
console.log(`模拟对方写入假后端: HTTP ${written.status}`);

const started = Date.now();
let ok = false;
try {
  await page.getByText(marker).waitFor({ timeout: 45000 });
  ok = true;
  console.log(`✅ 免刷新生效：${((Date.now() - started) / 1000).toFixed(1)}s 后新内容自动出现`);
} catch {
  const why = await page.evaluate(() => ({
    visibility: document.visibilityState,
    hasFocus: document.hasFocus(),
  }));
  console.log(`❌ 45s 内页面没有自动出现新内容（visibilityState=${why.visibility} hasFocus=${why.hasFocus}）`);
}
console.log(`期间整页加载次数: ${fullLoads - loadsBefore}（0 = 没有重新加载页面）`);
console.log(`期间 RSC 局部刷新请求: ${rscFetches} 次（服务端组件数据被重新拉取）`);
console.log(`刷新提示元素: ${(await page.locator(".refresh-pill").count()) ? "存在" : "缺失"}`);
await page.screenshot({ path: "dev/shots/15-autorefresh.png", fullPage: true });
await browser.close();
if (!ok) process.exitCode = 1;
