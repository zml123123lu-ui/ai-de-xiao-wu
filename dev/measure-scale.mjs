/**
 * 规模实测：把假后端灌到"用了几年"的量级，量每个页面实际要传多少字节。
 * 用法: node dev/measure-scale.mjs [讨论数=240] [信件数=120] [状态数=540]
 */
import { chromium } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3101";
const MOCK = process.env.MOCK_URL ?? "http://127.0.0.1:54321";
const [wantDiscussions = 240, wantLetters = 120, wantStatuses = 540] = process.argv.slice(2).map(Number);
const ME = "22222222-2222-4222-8222-222222222222";
const PARTNER = "11111111-1111-4111-8111-111111111111";

const post = (table, rows) =>
  fetch(`${MOCK}/rest/v1/${table}`, {
    method: "POST",
    headers: { "content-type": "application/json", prefer: "return=minimal" },
    body: JSON.stringify(rows),
  });

const longBody = (index) =>
  `第 ${index} 段想说的话。`.repeat(28) + "\n\n" + `这是第 ${index} 段的后半部分，用来把正文撑到接近 1500 字的真实长度。`.repeat(12);

console.log(`正在灌数据：${wantDiscussions} 个问题 / ${wantLetters} 封信 / ${wantStatuses} 条状态…`);
const day = (offset) => new Date(Date.now() - offset * 86400000).toISOString().slice(0, 10);

for (let batch = 0; batch < wantDiscussions; batch += 40) {
  const rows = [];
  for (let index = batch; index < Math.min(batch + 40, wantDiscussions); index += 1) {
    rows.push({
      author_id: index % 2 ? ME : PARTNER,
      title: `第 ${index} 个问题：我们之间的一件小事`,
      body: longBody(index),
      status: index % 5 === 0 ? "closed" : "open",
      created_at: new Date(Date.now() - index * 3600000).toISOString(),
      updated_at: new Date(Date.now() - index * 3600000).toISOString(),
    });
  }
  await post("discussions", rows);
  const replies = rows.flatMap((row, index) => [
    { discussion_id: row.id, author_id: ME, body: `对第 ${batch + index} 个问题的回应。`.repeat(12) },
  ]);
  await post("discussion_replies", replies);
}
console.log("  问题与回复灌完");

for (let batch = 0; batch < wantLetters; batch += 40) {
  const rows = [];
  for (let index = batch; index < Math.min(batch + 40, wantLetters); index += 1) {
    rows.push({
      sender_id: index % 2 ? ME : PARTNER,
      recipient_id: index % 2 ? PARTNER : ME,
      title: `第 ${index} 封信`,
      body: longBody(index).slice(0, 6000),
      status: "sent",
      sent_at: new Date(Date.now() - index * 7200000).toISOString(),
    });
  }
  await post("letters", rows);
}
console.log("  信件灌完");

for (let batch = 0; batch < wantStatuses; batch += 60) {
  const rows = [];
  for (let index = batch; index < Math.min(batch + 60, wantStatuses); index += 1) {
    rows.push({
      author_id: index % 2 ? ME : PARTNER,
      status_date: day(index),
      mood: ["很好", "平静", "疲惫", "低落", "烦躁"][index % 5],
      body: `第 ${index} 天的状态，随便写几句。`.repeat(6),
    });
  }
  await post("daily_statuses", rows);
}
console.log("  状态灌完");

// 登录拿 cookie，然后逐个页面量字节数
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: "zh-CN" });
const page = await context.newPage();
await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.getByLabel("邮箱").fill("alan@demo.local");
await page.getByLabel("密码").fill("demo-password-123");
await page.getByRole("button", { name: "进入爱的小屋" }).click();
await page.waitForURL(/\/today/, { timeout: 20000 });
const cookie = (await context.cookies()).map((item) => `${item.name}=${item.value}`).join("; ");

const pages = ["/today", "/review", "/discussions", "/letters", "/letters/compose", "/notifications", "/search?q=第"];
const rows = [];
for (const path of pages) {
  const started = Date.now();
  const res = await fetch(`${BASE}${path}`, { headers: { cookie } });
  const body = await res.text();
  rows.push({ path, status: res.status, kb: body.length / 1024, ms: Date.now() - started });
}
await browser.close();

console.log("\n页面".padEnd(22) + "状态".padEnd(6) + "HTML 大小".padEnd(12) + "本机耗时");
for (const row of rows.sort((a, b) => b.kb - a.kb)) {
  console.log(`${row.path.padEnd(22)}${String(row.status).padEnd(6)}${(row.kb.toFixed(0) + " KB").padEnd(12)}${row.ms} ms`);
}

const counts = await Promise.all(
  ["discussions", "discussion_replies", "letters", "daily_statuses"].map(async (table) => {
    const list = await (await fetch(`${MOCK}/rest/v1/${table}?select=id`)).json();
    return `${table}=${list.length}`;
  }),
);
console.log("\n当前数据量：" + counts.join("  "));
