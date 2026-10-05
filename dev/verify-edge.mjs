/** 输入边界与异常路径：乱输入不能 500、不能写坏数据、未登录不能写入。
 *  服务端校验此前只有单元测试（schema 层面），端到端的拒绝路径没有覆盖。 */
import { chromium } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3101";
const MOCK = process.env.MOCK_URL ?? "http://127.0.0.1:54321";
const ME = "22222222-2222-4222-8222-222222222222";
const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
let failed = 0;
const check = (ok, label, extra = "") => {
  if (!ok) failed += 1;
  console.log(`${ok ? "✓" : "✗"} ${label}${extra ? `  ${extra}` : ""}`);
};
const mineStatus = async () =>
  (await (await fetch(`${MOCK}/rest/v1/daily_statuses?select=body&author_id=eq.${ME}&status_date=eq.${today}`)).json())[0]?.body;

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: "zh-CN", timezoneId: "Asia/Shanghai" });
const page = await context.newPage();
await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.getByLabel("邮箱").fill("alan@demo.local");
await page.getByLabel("密码").fill("demo-password-123");
await page.getByRole("button", { name: "进入爱的小屋" }).click();
await page.waitForURL(/\/today/, { timeout: 20000 });

// ---- 1) 搜索：特殊字符 / 超长 / 空 / 无结果，都不该 500 或报错 ----
const queries = [
  ["百分号", "%"],
  ["下划线", "_"],
  ["逗号与括号", "a,b(c)"],
  ["反斜杠与引号", "\\'\"`"],
  ["超长", "啊".repeat(300)],
  ["空", ""],
  ["无结果", "zzz-not-exist-" + Date.now()],
];
for (const [label, q] of queries) {
  const response = await page.goto(`${BASE}/search?q=${encodeURIComponent(q)}`, { waitUntil: "networkidle" });
  const status = response?.status() ?? 0;
  const crashed = (await page.locator(".error").count()) > 0 || (await page.locator("h1", { hasText: "出错了" }).count()) > 0;
  check(status === 200 && !crashed, `搜索「${label}」正常渲染`, `HTTP ${status}`);
}

// ---- 2) 超长正文：绕过浏览器的 maxLength 直接 POST，服务端必须拒绝且不写库 ----
const before = await mineStatus();
const tooLong = "啊".repeat(2500);
const longResponse = await page.request.post(`${BASE}/api/today/status`, { form: { mood: "平静", body: tooLong }, maxRedirects: 0 });
const longLocation = longResponse.headers()["location"] ?? "";
const after = await mineStatus();
check(longResponse.status() === 303 && longLocation.includes("error="), "超长正文被服务端拒绝（带 error 跳回）", `HTTP ${longResponse.status()} → ${longLocation.replace(BASE, "")}`);
check(after === before, "被拒绝的正文没有写进数据库");

// ---- 3) 缺字段 / 非法值：应当跳回并带错误，而不是 500 ----
const missing = await page.request.post(`${BASE}/api/discussions/reply`, { form: {}, maxRedirects: 0 });
check(missing.status() === 303, "缺字段的回复提交被挡住（303 而非 500）", `HTTP ${missing.status()}`);
const badMood = await page.request.post(`${BASE}/api/today/status`, { form: { mood: "不存在的情绪", body: "测试" }, maxRedirects: 0 });
check(badMood.status() === 303 && (badMood.headers()["location"] ?? "").includes("error="), "非法心情被服务端拒绝", `HTTP ${badMood.status()}`);
check((await mineStatus()) === before, "非法心情也没有写进数据库");

// ---- 4) 未登录直接 POST 写入：必须被挡回登录页 ----
const anonymous = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: "zh-CN" });
const anonPage = await anonymous.newPage();
const anonResponse = await anonPage.request.post(`${BASE}/api/today/status`, { form: { mood: "平静", body: "未登录写入" }, maxRedirects: 0 });
const anonLocation = anonResponse.headers()["location"] ?? "";
check([303, 307, 302].includes(anonResponse.status()) && anonLocation.includes("/login"), "未登录写入被挡回登录页", `HTTP ${anonResponse.status()} → ${anonLocation.replace(BASE, "")}`);
check((await mineStatus()) === before, "未登录的写入没有落库");
await anonymous.close();

await context.close();
await browser.close();
if (failed) { console.log(`❌ ${failed} 项未通过`); process.exitCode = 1; }
else console.log("✅ 输入边界与异常路径全部通过");
