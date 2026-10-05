import { chromium } from "@playwright/test";
const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3101";
const D1 = "aaaaaaaa-0000-4000-8000-000000000001";
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: "zh-CN" });
const page = await context.newPage();
await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.getByLabel("邮箱").fill("alan@demo.local");
await page.getByLabel("密码").fill("demo-password-123");
await page.getByRole("button", { name: "进入爱的小屋" }).click();
await page.waitForURL(/\/today/, { timeout: 20000 });

for (const url of [`${BASE}/discussions/${D1}`, `${BASE}/discussions/${D1}?saved=123`]) {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.locator(".thread-meta .status").waitFor({ state: "visible", timeout: 15000 });
  const before = (await page.locator(".thread-meta .status").innerText()).trim();
  const button = (await page.getByRole("button", { name: /标为聊完|重新打开/ }).first().innerText()).trim();
  await page.getByRole("button", { name: /标为聊完|重新打开/ }).first().click();
  let changed = true;
  try {
    await page.waitForFunction((was) => {
      const el = document.querySelector(".thread-meta .status");
      return el && el.textContent.trim() !== was;
    }, before, { timeout: 12000 });
  } catch { changed = false; }
  const after = (await page.locator(".thread-meta .status").innerText()).trim();
  console.log(`${url.replace(BASE, "")}：点「${button}」→ ${changed ? "状态已更新" : "状态未更新"}（${before} → ${after}）`);
}
await browser.close();
