/** 验证会话续期与退出登录——真实部署里 token 每小时过期，
 *  如果续期路径坏了，用户每小时会被踢回登录页。
 *  做法：把假后端的 token 有效期调到 2 秒，等它过期后再翻页，
 *  此时应当由 refresh_token 自动续期而不是掉登录。 */
import { chromium } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3101";
const MOCK = process.env.MOCK_URL ?? "http://127.0.0.1:54321";
let failed = 0;
const check = (ok, label, extra = "") => {
  if (!ok) failed += 1;
  console.log(`${ok ? "✓" : "✗"} ${label}${extra ? `  ${extra}` : ""}`);
};
const stats = async () => (await (await fetch(`${MOCK}/_control/stats`)).json());

// 1) 把 token 有效期调到 2 秒，让过期在测试里可复现
const ttl = await fetch(`${MOCK}/_control/token-ttl`, {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ seconds: 2 }),
});
check(ttl.ok, "已把假后端的 token 有效期调成 2 秒");

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: "zh-CN", timezoneId: "Asia/Shanghai" });
const page = await context.newPage();
// 续期发生在服务端（middleware 里），浏览器看不到，所以看假后端的计数
const beforeStats = await stats();

await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.getByLabel("邮箱").fill("alan@demo.local");
await page.getByLabel("密码").fill("demo-password-123");
await page.getByRole("button", { name: "进入爱的小屋" }).click();
await page.waitForURL(/\/today/, { timeout: 20000 });
check(true, "登录成功");

// 2) 等 token 过期，再翻几个页面：应当自动续期而不是掉登录
await page.waitForTimeout(3500);
for (const path of ["/letters", "/discussions", "/today"]) {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  const url = page.url().replace(BASE, "");
  check(!url.startsWith("/login"), `过期后访问 ${path} 仍是登录状态`, url);
}
const afterStats = await stats();
check(afterStats.refresh > beforeStats.refresh, "期间服务端确实走了 refresh_token 续期", `续期 ${afterStats.refresh - beforeStats.refresh} 次`);

// 3) 退出登录：应当跳回登录页、cookie 被清掉、再访问内容页被拦
await page.goto(`${BASE}/today`, { waitUntil: "networkidle" });
const statsBeforeLogout = await stats();
await page.getByRole("button", { name: "退出登录" }).click();
let loggedOut = true;
try {
  await page.waitForURL(/\/login/, { timeout: 15000 });
} catch { loggedOut = false; }
check(loggedOut, "点退出后回到登录页", page.url().replace(BASE, ""));
check((await stats()).logout > statsBeforeLogout.logout, "服务端确实收到了退出请求");
const cookiesLeft = (await context.cookies()).filter((item) => item.name.includes("auth-token"));
check(cookiesLeft.length === 0, "会话 cookie 已被清掉", cookiesLeft.map((item) => item.name).join(",") || "无");
await page.goto(`${BASE}/today`, { waitUntil: "networkidle" });
check(page.url().includes("/login"), "退出后再访问内容页会被送回登录页", page.url().replace(BASE, ""));

// 4) 复原有效期，避免影响同一套件里的后续检查
await fetch(`${MOCK}/_control/token-ttl`, {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ seconds: 31536000 }),
});
await context.close();
await browser.close();
if (failed) { console.log(`❌ ${failed} 项未通过`); process.exitCode = 1; }
else console.log("✅ 会话续期与退出登录全部通过");
