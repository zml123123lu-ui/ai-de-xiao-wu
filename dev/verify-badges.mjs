/** 断言"未读徽标"与后端真实未读一致——防止渲染期写库造成的竞态回归。 */
import { chromium } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3101";
const MOCK = process.env.MOCK_URL ?? "http://127.0.0.1:54321";
const ME = "22222222-2222-4222-8222-222222222222";
const D1 = "aaaaaaaa-0000-4000-8000-000000000001";
const L1 = "cccccccc-0000-4000-8000-000000000001";

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1400, height: 900 }, locale: "zh-CN" });
const page = await context.newPage();
await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.getByLabel("邮箱").fill("alan@demo.local");
await page.getByLabel("密码").fill("demo-password-123");
await page.getByRole("button", { name: "进入爱的小屋" }).click();
await page.waitForURL(/\/today/, { timeout: 20000 });

async function backend() {
  const rows = await (await fetch(`${MOCK}/rest/v1/notifications?recipient_id=eq.${ME}&read_at=is.null&select=type`)).json();
  const counts = { daily_status: 0, discussion: 0, reply: 0, letter: 0 };
  for (const row of rows) counts[row.type] += 1;
  return { ...counts, total: rows.length };
}
async function dom() {
  return page.evaluate(() => {
    const out = {};
    for (const link of document.querySelectorAll(".sidebar nav a")) {
      const label = link.querySelector("span")?.textContent ?? "";
      out[label] = Number(link.querySelector(".badge")?.textContent ?? 0);
    }
    return out;
  });
}

let failed = 0;
for (const path of ["/today", `/discussions/${D1}`, `/letters/${L1}`, "/notifications", "/today"]) {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500); // 等客户端标记已读 + 刷新徽标
  const [b, d] = [await backend(), await dom()];
  const expected = {
    今日: b.daily_status,
    问题: b.discussion + b.reply,
    信件: b.letter,
    通知: b.total,
  };
  const ok = Object.entries(expected).every(([label, value]) => (d[label] ?? 0) === value);
  if (!ok) failed += 1;
  console.log(`${ok ? "✓" : "✗"} ${path.padEnd(48)} 页面徽标 ${JSON.stringify(d)}  后端 ${JSON.stringify(expected)}`);
}
await browser.close();
if (failed) { console.log(`❌ ${failed} 个页面的徽标与后端不一致`); process.exitCode = 1; }
else console.log("✅ 所有页面的未读徽标与后端一致");
