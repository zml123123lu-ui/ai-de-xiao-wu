/** 回归检查：提交表单后的跳转必须真正发生。
 *  覆盖两种路径：
 *   1) 已水合（JS 调用动作）——动作返回结果，由表单组件跳转（含整页兜底）
 *   2) 未水合 / 禁用 JS（原生表单提交）——服务端 redirect
 *  背景：Next 15 下按钮 formAction 触发的动作，其 x-action-redirect 时灵时不灵，
 *  表现为"内容确实写进去了，但页面停在写信页"。 */
import { chromium } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3101";
const L1 = "cccccccc-0000-4000-8000-000000000001";
let failed = 0;
const check = (ok, label, extra = "") => {
  if (!ok) failed += 1;
  console.log(`${ok ? "✓" : "✗"} ${label}${extra ? `  ${extra}` : ""}`);
};

const browser = await chromium.launch();

async function signIn(context) {
  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.getByLabel("邮箱").fill("alan@demo.local");
  await page.getByLabel("密码").fill("demo-password-123");
  await page.getByRole("button", { name: "进入爱的小屋" }).click();
  await page.waitForURL(/\/today/, { timeout: 20000 });
  return page;
}

/** 等到 React 真正接管了这个表单，再动手——真人填一封 20 行的信远慢于此。 */
async function waitForHydration(page) {
  await page.waitForFunction(() => {
    const form = document.querySelector("form.letter-paper");
    return !!form && Object.keys(form).some((key) => key.startsWith("__reactFiber"));
  }, { timeout: 15000 });
}

// —— 路径 1：已水合 ——
const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: "zh-CN" });
const page = await signIn(context);
// 另开一个已登录上下文，供路径 2 取会话 cookie
const context2 = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: "zh-CN" });
await signIn(context2);

async function expectSave(label, composeUrl) {
  await page.goto(composeUrl, { waitUntil: "load" });
  await page.locator("form.letter-paper input[name=title]").waitFor({ state: "visible", timeout: 15000 });
  await waitForHydration(page);
  const marker = `${label}-${Date.now()}`;
  await page.getByLabel("信的题目").fill(`回归 ${marker}`);
  await page.getByLabel("正文").fill(`回归正文 ${marker}`);
  let ok = true;
  try {
    await Promise.all([page.waitForURL(/tab=drafts/, { timeout: 15000 }), page.getByRole("button", { name: "保存草稿" }).click()]);
  } catch { ok = false; }
  check(ok, `${label}（已水合）`, `停在 ${page.url().replace(BASE, "")}`);
}

await expectSave("普通新信", `${BASE}/letters/compose`);
await expectSave("回信", `${BASE}/letters/compose?replyTo=${L1}`);

await page.goto(`${BASE}/letters?tab=drafts`, { waitUntil: "networkidle" });
const draftHref = await page.locator(".letter-row").first().getAttribute("href");
await expectSave("编辑草稿", `${BASE}${draftHref}`);
await context.close();

// —— 路径 2：原生表单提交（浏览器未水合 / 无 JS 时走的就是这条）——
// 说明：Next 流式渲染下，无 JS 页面只会停在骨架屏（内容在 <div hidden> 里等脚本换出），
// 所以这里不检查 DOM，而是直接按浏览器的原生提交方式打这个接口，验证它确实写入并 303 跳转。
const cookies = await context2.cookies();
const cookieHeader = cookies.map((item) => `${item.name}=${item.value}`).join("; ");
const native = await fetch(`${BASE}/api/letters/save`, {
  method: "POST",
  redirect: "manual",
  headers: { "content-type": "application/x-www-form-urlencoded", cookie: cookieHeader },
  body: new URLSearchParams({
    recipientId: "11111111-1111-4111-8111-111111111111",
    replyToId: "",
    title: "原生提交回归",
    body: "原生提交回归正文",
  }),
});
const location = native.headers.get("location") ?? "";
check(native.status === 303 && location.includes("tab=drafts"), "原生表单提交（无 JS 路径）", `HTTP ${native.status} → ${location}`);
await context2.close();

await browser.close();
if (failed) { console.log(`❌ ${failed} 项未通过`); process.exitCode = 1; }
else console.log("✅ 两种提交路径的跳转都正常");
