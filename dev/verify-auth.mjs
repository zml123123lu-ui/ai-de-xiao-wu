/** 账号与权限边界：密码错误、匿名访问、以及**非成员账号必须拿不到任何内容**。
 *  最后一条是设计里的安全约束（只允许 profiles 中的两位成员），此前只写在部署清单里当人工步骤。 */
import { chromium } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3101";
let failed = 0;
const check = (ok, label, extra = "") => {
  if (!ok) failed += 1;
  console.log(`${ok ? "✓" : "✗"} ${label}${extra ? `  ${extra}` : ""}`);
};

const browser = await chromium.launch();

// ---- 1) 密码错误：留在登录页并给出提示 ----
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: "zh-CN" });
  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.getByLabel("邮箱").fill("alan@demo.local");
  await page.getByLabel("密码").fill("wrong-password-999");
  await page.getByRole("button", { name: "进入爱的小屋" }).click();
  await page.locator(".error").waitFor({ state: "visible", timeout: 15000 });
  const message = (await page.locator(".error").innerText()).trim();
  check(page.url().includes("/login") && message.includes("邮箱或密码不正确"), "密码错误时留在登录页并提示", message);
  await context.close();
}

// ---- 2) 匿名访问内容页 ----
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: "zh-CN" });
  const page = await context.newPage();
  await page.goto(`${BASE}/today`, { waitUntil: "networkidle" });
  check(page.url().includes("/login"), "匿名访问 /today 被送到登录页", page.url().replace(BASE, ""));
  await context.close();
}

// ---- 3) 非成员账号：能通过邮箱密码，但拿不到任何内容 ----
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: "zh-CN" });
  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.getByLabel("邮箱").fill("outsider@demo.local");
  await page.getByLabel("密码").fill("demo-password-123");
  await page.getByRole("button", { name: "进入爱的小屋" }).click();
  let bounced = true;
  try {
    await page.waitForURL(/error=member/, { timeout: 15000 });
  } catch { bounced = false; }
  check(bounced && page.url().includes("/login"), "非成员登录后被拒，人停在登录页（带 error=member）", page.url().replace(BASE, ""));
  check((await context.cookies()).filter((item) => item.name.includes("auth-token")).length === 0, "非成员的会话已被清掉");

  await page.goto(`${BASE}/today`, { waitUntil: "networkidle" });
  check(page.url().includes("/login"), "非成员访问内容页同样被拦", page.url().replace(BASE, ""));

  const leaked = await page.evaluate(() => document.body.innerText.includes("报表") || document.body.innerText.includes("馄饨"));
  check(!leaked, "非成员页面上看不到任何内容片段");
  await context.close();
}

// ---- 4) 正常账号仍然可以登录（确认上面的拦截没有误伤）----
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: "zh-CN" });
  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.getByLabel("邮箱").fill("alan@demo.local");
  await page.getByLabel("密码").fill("demo-password-123");
  await page.getByRole("button", { name: "进入爱的小屋" }).click();
  let ok = true;
  try {
    await page.waitForURL(/\/today/, { timeout: 20000 });
  } catch { ok = false; }
  if (ok) await page.locator(".status-grid").waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
  check(ok && (await page.locator(".status-grid").count()) === 1, "成员账号照常登录并看到今日页");
  await context.close();
}

await browser.close();
if (failed) { console.log(`❌ ${failed} 项未通过`); process.exitCode = 1; }
else console.log("✅ 账号与权限边界全部通过");
