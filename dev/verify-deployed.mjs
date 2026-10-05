/**
 * 对着**真实部署好的网址**跑冒烟检查（不需要假后端）。
 * 用法：
 *   node dev/verify-deployed.mjs https://你的应用.onrender.com
 * 可选：设 E2E_USER_EMAIL / E2E_USER_PASSWORD 后会额外验证登录与各页面。
 */
import { chromium } from "@playwright/test";

const BASE = (process.argv[2] ?? process.env.DEPLOY_URL ?? "").replace(/\/+$/, "");
if (!BASE) {
  console.log("用法: node dev/verify-deployed.mjs https://你的应用域名");
  process.exit(1);
}
const EMAIL = process.env.E2E_USER_EMAIL;
const PASSWORD = process.env.E2E_USER_PASSWORD;
let failed = 0;
const check = (ok, label, extra = "") => {
  if (!ok) failed += 1;
  console.log(`${ok ? "✓" : "✗"} ${label}${extra ? `  ${extra}` : ""}`);
};

/** 计时请求：同时用来判断是否处于冷启动 */
async function timed(path, options = {}) {
  const started = Date.now();
  const response = await fetch(`${BASE}${path}`, { redirect: "manual", ...options });
  const body = await response.text().catch(() => "");
  return { status: response.status, ms: Date.now() - started, headers: response.headers, body };
}

console.log(`目标：${BASE}\n`);

// 1) 首页可访问
const login = await timed("/login");
check(login.status === 200, "登录页返回 200", `${login.ms}ms`);
check(login.body.includes("爱的小屋"), "登录页内容正确");
if (login.ms > 5000) console.log(`  ℹ 首次响应 ${(login.ms / 1000).toFixed(1)}s，像是在冷启动（Render 免费实例闲置后会休眠）`);

// 2) 未登录访问内容页必须被送回登录页
const today = await timed("/today");
check([301, 302, 303, 307, 308].includes(today.status) || today.body.includes("回到我们的空间"), "未登录访问 /today 被送到登录页", `HTTP ${today.status}`);

// 3) 转发器的守门行为
const relayNoToken = await timed("/supabase/auth/v1/token", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: "{}",
});
check(relayNoToken.status === 403, "转发器拒绝不带令牌的请求", `HTTP ${relayNoToken.status}`);
if (relayNoToken.status !== 403) {
  console.log("  ℹ 若这里是 400/401，说明 SUPABASE_RELAY_TOKEN 没配；功能仍可用，但转发器是开放的");
}

// 4) 四个页面在未登录时都应被拦（不能泄漏内容）
for (const path of ["/discussions", "/letters", "/notifications", "/export"]) {
  const result = await timed(path);
  const blocked = [301, 302, 303, 307, 308].includes(result.status) || result.body.includes("回到我们的空间");
  check(blocked, `未登录访问 ${path} 被拦下`, `HTTP ${result.status}`);
}

// 5) 登录后逐个页面走一遍
if (EMAIL && PASSWORD) {
  console.log("\n—— 使用提供的账号登录 ——");
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: "zh-CN", timezoneId: "Asia/Shanghai" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message.slice(0, 120)));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text().slice(0, 120)); });

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.getByLabel("邮箱").fill(EMAIL);
  await page.getByLabel("密码").fill(PASSWORD);
  await page.getByRole("button", { name: "进入爱的小屋" }).click();
  let loggedIn = true;
  try {
    await page.waitForURL(/\/today/, { timeout: 30000 });
  } catch { loggedIn = false; }
  check(loggedIn, "能登录并进入今日页");

  if (loggedIn) {
    for (const [path, marker] of [["/today", ".status-grid"], ["/discussions", ".page-header"], ["/letters", ".tabs"], ["/notifications", ".page-header"], ["/review", ".month-grid"], ["/search?q=%E7%9A%84", ".search-form"], ["/export", ".export-summary"]]) {
      const started = Date.now();
      const response = await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
      const found = await page.locator(marker).count();
      check(response?.status() === 200 && found > 0, `${path} 正常渲染`, `${Date.now() - started}ms`);
    }
    check(errors.length === 0, "浏览器控制台没有报错", errors.slice(0, 2).join(" | "));
  }
  await context.close();
  await browser.close();
} else {
  console.log("\n（未提供 E2E_USER_EMAIL / E2E_USER_PASSWORD，跳过登录后的页面检查）");
}

console.log(failed ? `\n❌ ${failed} 项未通过` : "\n✅ 部署冒烟检查全部通过");
process.exitCode = failed ? 1 : 0;
