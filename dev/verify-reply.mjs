/** 端到端验证"信内回信"：收到的信 → 回信预填 → 存草稿 → 寄出 → 两封信互相连成线索。
 *  最后用对方账号登录，确认"已回信"在发信人那一侧也成立。 */
import { chromium } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3101";
const L1 = "cccccccc-0000-4000-8000-000000000001"; // 小九 → 阿澜
const marker = `回信验证-${Date.now()}`;
let failed = 0;
const check = (ok, label, extra = "") => {
  if (!ok) failed += 1;
  console.log(`${ok ? "✓" : "✗"} ${label}${extra ? `  ${extra}` : ""}`);
};

const browser = await chromium.launch();

async function signIn(email) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: "zh-CN" });
  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill("demo-password-123");
  await page.getByRole("button", { name: "进入爱的小屋" }).click();
  await page.waitForURL(/\/today/, { timeout: 20000 });
  return { context, page };
}

// —— 收信人：阿澜 ——
const me = await signIn("alan@demo.local");
const page = me.page;

await page.goto(`${BASE}/letters/${L1}`, { waitUntil: "networkidle" });
check(await page.getByRole("link", { name: "回一封信" }).count() === 1, "收到的信上有「回一封信」入口");
await page.getByRole("link", { name: "回一封信" }).click();
await page.waitForURL(/replyTo=/, { timeout: 15000 });
check(page.url().includes(`replyTo=${L1}`), "点击后进入回信页并带上原信", page.url().replace(BASE, ""));

const title = await page.getByLabel("信的题目").inputValue();
const body = await page.getByLabel("正文").inputValue();
check(title.startsWith("回："), "标题已预填为「回：……」", JSON.stringify(title));
check(body.includes("你写：「") && body.includes("」"), "正文已预填一句可删掉的引用", JSON.stringify(body.slice(0, 46)));
check((await page.getByText(/这是对《.*》的回信/).count()) === 1, "页面说明了这是对哪封信的回信");

await page.getByLabel("正文").fill(`${body}${marker}`);
await page.getByRole("button", { name: "保存草稿" }).click();
await page.waitForURL(/tab=drafts/, { timeout: 20000 });
const draftHref = await page.locator(".letter-row", { hasText: marker }).first().getAttribute("href");
check(Boolean(draftHref), "草稿出现在草稿箱", draftHref ?? "");

await page.goto(`${BASE}${draftHref}`, { waitUntil: "networkidle" });
const draftTitle = await page.getByLabel("信的题目").inputValue();
check(draftTitle.startsWith("回："), "重新打开草稿仍保留回信关系", JSON.stringify(draftTitle));
await page.getByRole("button", { name: "正式寄出" }).click();
await page.waitForURL(/tab=sent/, { timeout: 20000 });
check(true, "回信已寄出");

const sentHref = await page.locator(".letter-row", { hasText: marker }).first().getAttribute("href");
await page.goto(`${BASE}${sentHref}`, { waitUntil: "networkidle" });
check((await page.getByText("这是对《写在你出差第三天》的回信").count()) === 1, "回信里链回了原信");

// —— 发信人：小九 ——
const partner = await signIn("xiaojiu@demo.local");
await partner.page.goto(`${BASE}/letters/${L1}`, { waitUntil: "networkidle" });
const replied = await partner.page.locator(".letter-linkage", { hasText: "已回信" }).first().textContent();
check(Boolean(replied), "对方那一侧显示「已回信」", replied ?? "（没找到）");

await me.context.close();
await partner.context.close();
await browser.close();
if (failed) { console.log(`❌ ${failed} 项未通过`); process.exitCode = 1; }
else console.log("✅ 回信流程全部通过");
