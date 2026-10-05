/** 超长无空格文本（比如粘一个长链接）会不会把布局撑破。
 *  正文容器已经有 overflow-wrap:anywhere，但**标题**没有——这里专挑标题下手。 */
import { chromium } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3101";
const MOCK = process.env.MOCK_URL ?? "http://127.0.0.1:54321";
const ME = "22222222-2222-4222-8222-222222222222";
const PARTNER = "11111111-1111-4111-8111-111111111111";
const stamp = Date.now();
// 一个 240 字符、没有任何空格或换行机会的串（最长的那种链接的样子）
const LONG = `https://example.com/${"a".repeat(80)}/${"b".repeat(80)}/${"c".repeat(60)}?x=${stamp}`;
let failed = 0;
const check = (ok, label, extra = "") => {
  if (!ok) failed += 1;
  console.log(`${ok ? "✓" : "✗"} ${label}${extra ? `  ${extra}` : ""}`);
};
const post = (table, body) =>
  fetch(`${MOCK}/rest/v1/${table}`, {
    method: "POST",
    headers: { "content-type": "application/json", prefer: "return=representation" },
    body: JSON.stringify(body),
  }).then((r) => r.json());

const threadId = `dddddddd-0000-4000-8000-${String(stamp).slice(-12)}`;
await post("discussions", {
  id: threadId, author_id: ME, title: LONG, body: "正文里也塞一个超长链接：\n" + LONG, status: "open",
});
await post("discussion_replies", { discussion_id: threadId, author_id: PARTNER, body: LONG });
const createdLetters = await post("letters", {
  sender_id: PARTNER, recipient_id: ME, title: LONG, body: LONG + "\n\n第二段：" + LONG, status: "sent",
  sent_at: new Date().toISOString(),
});
const letterId = Array.isArray(createdLetters) ? createdLetters[0]?.id : createdLetters?.id;
const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
// 用 PATCH 改掉已有的那条（POST 会插入重复行，页面可能仍显示原来那条）
await fetch(`${MOCK}/rest/v1/daily_statuses?author_id=eq.${ME}&status_date=eq.${today}`, {
  method: "PATCH",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ body: LONG }),
});

const browser = await chromium.launch();
for (const width of [390, 320]) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, locale: "zh-CN", timezoneId: "Asia/Shanghai" });
  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.getByLabel("邮箱").fill("alan@demo.local");
  await page.getByLabel("密码").fill("demo-password-123");
  await page.getByRole("button", { name: "进入爱的小屋" }).click();
  await page.waitForURL(/\/today/, { timeout: 20000 });

  const paths = ["/today", `/discussions/${threadId}`, "/discussions", "/letters", "/notifications"];
  if (letterId) paths.push(`/letters/${letterId}`);
  for (const path of paths) {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    const info = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const offenders = [...document.querySelectorAll("body *")]
        .filter((el) => {
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.right > vw + 1;
        })
        .slice(0, 5)
        .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]}`);
      return { vw, scrollWidth: document.documentElement.scrollWidth, offenders };
    });
    const overflow = info.scrollWidth - info.vw;
    check(overflow <= 1, `${path} @${width}px 无横向溢出`, `溢出 ${overflow}px${info.offenders.length ? " 越界：" + info.offenders.join(", ") : ""}`);
  }
  // 确认长文本确实渲染出来了（否则这条检查是空的）
  await page.goto(`${BASE}/today`, { waitUntil: "networkidle" });
  const shown = await page.getByText(LONG.slice(0, 60), { exact: false }).count();
  check(shown > 0, `@${width}px 超长文本确实渲染在页面上`);
  await context.close();
}
await browser.close();
if (failed) { console.log(`❌ ${failed} 项未通过`); process.exitCode = 1; }
else console.log("✅ 超长文本布局全部通过");
