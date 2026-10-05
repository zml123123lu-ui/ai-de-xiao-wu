/** 区分三件事：服务端是否渲染出内容、客户端是否水合成功、控制台有无报错。
 *  用法: node dev/check-hydration.mjs [BASE_URL]
 */
import { chromium } from "@playwright/test";

const BASE = process.argv[2] ?? "http://127.0.0.1:3100";
const browser = await chromium.launch();

async function probe(label, { login }) {
  const context = await browser.newContext({ viewport: { width: 1200, height: 900 }, locale: "zh-CN" });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().split("\n")[0].slice(0, 120)); });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message.slice(0, 120)));

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  if (login) {
    await page.getByLabel("邮箱").fill("alan@demo.local");
    await page.getByLabel("密码").fill("demo-password-123");
    await page.getByRole("button", { name: "进入爱的小屋" }).click();
    await page.waitForURL(/\/today/, { timeout: 20000 });
    await page.waitForLoadState("networkidle");
  }
  const path = login ? "/today" : "/login";
  // 原始服务端输出（不执行 JS）
  const raw = await (await context.request.get(`${BASE}${path}`)).text();
  const dom = await page.evaluate(() => ({
    appShell: document.querySelectorAll(".app-shell").length,
    refreshPill: document.querySelectorAll(".refresh-pill").length,
    sidebarLinks: document.querySelectorAll(".sidebar nav a").length,
    bodyChildren: document.body.children.length,
  }));
  console.log(`[${label}] ${path}`);
  console.log(`  服务端原始 HTML: app-shell=${raw.includes('class="app-shell"')} refresh-pill=${raw.includes("refresh-pill")} sidebar=${raw.includes('class="sidebar"')}`);
  console.log(`  浏览器 DOM:       app-shell=${dom.appShell} refresh-pill=${dom.refreshPill} 侧栏链接=${dom.sidebarLinks} body子节点=${dom.bodyChildren}`);
  console.log(`  控制台错误: ${errors.length ? errors.slice(0, 2).join(" | ") : "（无）"}`);
  await context.close();
}

await probe("匿名登录页", { login: false });
await probe("登录后今日页", { login: true });
await browser.close();
