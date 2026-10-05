/** 量一量各页面的体量（HTML/RSC 文档大小与请求数），大改之后用来复核有没有变胖。 */
import { chromium } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3101";
const paths = ["/today", "/discussions", "/discussions/aaaaaaaa-0000-4000-8000-000000000001", "/letters", "/notifications", "/review", "/search?q=%E7%9A%84", "/export"];

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: "zh-CN", timezoneId: "Asia/Shanghai" });
const page = await context.newPage();
await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.getByLabel("邮箱").fill("alan@demo.local");
await page.getByLabel("密码").fill("demo-password-123");
await page.getByRole("button", { name: "进入爱的小屋" }).click();
await page.waitForURL(/\/today/, { timeout: 20000 });

console.log("页面".padEnd(34) + "文档".padStart(10) + "本轮资源".padStart(12) + "请求数".padStart(8));
for (const path of paths) {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  const m = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const resources = performance.getEntriesByType("resource");
    return {
      doc: nav?.transferSize ?? 0,
      resources: resources.reduce((sum, r) => sum + (r.transferSize ?? 0), 0),
      count: resources.length,
    };
  });
  console.log(path.padEnd(34) + `${(m.doc / 1024).toFixed(0)}KB`.padStart(10) + `${(m.resources / 1024).toFixed(0)}KB`.padStart(12) + String(m.count).padStart(8));
}
await browser.close();
