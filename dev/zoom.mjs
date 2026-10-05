/** 放大截取某个元素，用来核对细节（圆点颜色、间距、印章等）。
 *  用法: node dev/zoom.mjs "<css 选择器>" <路径> <输出文件> [宽度]
 */
import { chromium } from "@playwright/test";

const [selector, path, out, width = "1440"] = process.argv.slice(2);
const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3100";
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: Number(width), height: 900 }, deviceScaleFactor: 3, locale: "zh-CN", timezoneId: "Asia/Shanghai" });
const page = await context.newPage();
await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.getByLabel("邮箱").fill("alan@demo.local");
await page.getByLabel("密码").fill("demo-password-123");
await page.getByRole("button", { name: "进入爱的小屋" }).click();
await page.waitForURL(/\/today/, { timeout: 20000 });
await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
const target = page.locator(selector).first();
await target.screenshot({ path: out });
console.log(`已截取 ${selector} (${path}) -> ${out}`);
await browser.close();
