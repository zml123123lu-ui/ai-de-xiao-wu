/** 验证列表分页：单页条数有上限、翻页能到位、筛选计数仍准确。
 *  这是为了控制页面体积——分页前 243 个问题要传 760KB（见 measure-scale.mjs）。 */
import { chromium } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3101";
const MOCK = process.env.MOCK_URL ?? "http://127.0.0.1:54321";
const ME = "22222222-2222-4222-8222-222222222222";
const PAGE_SIZE = 20;
let failed = 0;
const check = (ok, label, extra = "") => {
  if (!ok) failed += 1;
  console.log(`${ok ? "✓" : "✗"} ${label}${extra ? `  ${extra}` : ""}`);
};

// 先灌到超过一页：以当前登录用户为作者，避免给对方的通知徽标添乱
const existing = (await (await fetch(`${MOCK}/rest/v1/discussions?select=id`)).json()).length;
const need = Math.max(0, PAGE_SIZE + 8 - existing);
if (need > 0) {
  const rows = Array.from({ length: need }, (_, index) => ({
    author_id: ME,
    title: `分页回归问题 ${index + 1}`,
    body: `正文 ${index + 1}。`.repeat(40),
    status: index % 4 === 0 ? "closed" : "open",
  }));
  await fetch(`${MOCK}/rest/v1/discussions`, {
    method: "POST",
    headers: { "content-type": "application/json", prefer: "return=minimal" },
    body: JSON.stringify(rows),
  });
}
const total = (await (await fetch(`${MOCK}/rest/v1/discussions?select=id`)).json()).length;
const openTotal = (await (await fetch(`${MOCK}/rest/v1/discussions?select=id&status=eq.open`)).json()).length;
console.log(`当前后端问题总数 ${total}（讨论中 ${openTotal}），页面大小上限 ${PAGE_SIZE}`);

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: "zh-CN" });
const page = await context.newPage();
await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.getByLabel("邮箱").fill("alan@demo.local");
await page.getByLabel("密码").fill("demo-password-123");
await page.getByRole("button", { name: "进入爱的小屋" }).click();
await page.waitForURL(/\/today/, { timeout: 20000 });

// 第一页
await page.goto(`${BASE}/discussions`, { waitUntil: "networkidle" });
await page.locator(".discussion-row").first().waitFor({ state: "visible", timeout: 15000 });
const firstCount = await page.locator(".discussion-row").count();
check(firstCount === PAGE_SIZE, `第一页只渲染 ${PAGE_SIZE} 条`, `实际 ${firstCount} 条 / 后端共 ${total}`);
check((await page.locator(".pager").count()) === 1, "出现翻页控件");
const pagerText = (await page.locator(".pager").innerText()).replace(/\s+/g, " ");
check(pagerText.includes(`共 ${total} 个问题`), "翻页控件里的总数与后端一致", pagerText);
check((await page.locator('.filter-row a', { hasText: "全部" }).innerText()).includes(String(total)), "筛选栏计数与后端一致");
check((await page.locator('.filter-row a', { hasText: "讨论中" }).innerText()).includes(String(openTotal)), "「讨论中」计数与后端一致");

// 上一页不该出现
check((await page.getByRole("link", { name: "上一页" }).count()) === 0, "第一页没有「上一页」");

// 第二页
await page.getByRole("link", { name: "下一页" }).click();
await page.waitForURL(/page=2/, { timeout: 15000 });
await page.locator(".discussion-row").first().waitFor({ state: "visible", timeout: 15000 });
const secondCount = await page.locator(".discussion-row").count();
check(secondCount === total - PAGE_SIZE, "第二页是剩下的条数", `实际 ${secondCount} 条 / 应为 ${total - PAGE_SIZE}`);
check(secondCount <= PAGE_SIZE, "第二页同样不超过上限");
check((await page.getByRole("link", { name: "上一页" }).count()) === 1, "第二页有「上一页」");
check((await page.getByRole("link", { name: "下一页" }).count()) === 0, "最后一页没有「下一页」");

// 筛选与分页能共存
await page.goto(`${BASE}/discussions?status=open`, { waitUntil: "networkidle" });
await page.locator(".discussion-row").first().waitFor({ state: "visible", timeout: 15000 });
const openRows = await page.locator(".discussion-row").count();
check(openRows === Math.min(PAGE_SIZE, openTotal), "筛选后仍受单页上限约束", `${openRows} 条 / 讨论中 ${openTotal}`);

// 信件列表：条数少时不出现翻页控件
await page.goto(`${BASE}/letters?tab=inbox`, { waitUntil: "networkidle" });
const letters = await page.locator(".letter-row").count();
check(letters <= 12, "信件列表单页不超过 12 封", `${letters} 封`);

await context.close();
await browser.close();
if (failed) { console.log(`❌ ${failed} 项未通过`); process.exitCode = 1; }
else console.log("✅ 列表分页全部通过");
