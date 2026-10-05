/** 验证导出备份：页面统计、Markdown/JSON 下载、文件名头、未登录必须被拦。 */
import { chromium } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3101";
const MOCK = process.env.MOCK_URL ?? "http://127.0.0.1:54321";
let failed = 0;
const check = (ok, label, extra = "") => {
  if (!ok) failed += 1;
  console.log(`${ok ? "✓" : "✗"} ${label}${extra ? `  ${extra}` : ""}`);
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: "zh-CN" });
const page = await context.newPage();
await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.getByLabel("邮箱").fill("alan@demo.local");
await page.getByLabel("密码").fill("demo-password-123");
await page.getByRole("button", { name: "进入爱的小屋" }).click();
await page.waitForURL(/\/today/, { timeout: 20000 });

// 1) 导出页
await page.goto(`${BASE}/export`, { waitUntil: "networkidle" });
const summary = (await page.locator(".export-summary").innerText()).replace(/\s+/g, " ");
check(/个问题/.test(summary) && /封信/.test(summary), "导出页给出内容统计", summary);
check((await page.locator(".export-card").count()) === 2, "提供 Markdown 与 JSON 两种下载");
check((await page.locator('.export-card[href="/api/export?format=json"]').count()) === 1, "JSON 卡片指向下载接口");

// 2) 后端真实数量（直接问假后端）
const countOf = async (table, extra = "") =>
  (await (await fetch(`${MOCK}/rest/v1/${table}?select=id${extra}`, { method: "GET" })).json()).length;
const truth = {
  discussions: await countOf("discussions"),
  replies: await countOf("discussion_replies"),
  letters: await countOf("letters"),   // 导出包含未寄出的草稿
  statuses: await countOf("daily_statuses"),
};

// 3) JSON 下载
const cookies = await context.cookies();
const cookieHeader = cookies.map((item) => `${item.name}=${item.value}`).join("; ");
const jsonRes = await fetch(`${BASE}/api/export?format=json`, { headers: { cookie: cookieHeader } });
const json = await jsonRes.json();
check(jsonRes.status === 200 && jsonRes.headers.get("content-type")?.includes("application/json"), "JSON 接口返回 200 与正确类型");
check(
  json.counts.discussions === truth.discussions && json.counts.replies === truth.replies && json.counts.letters === truth.letters && json.counts.statuses === truth.statuses,
  "JSON 里的数量与后端一致",
  `导出 ${JSON.stringify(json.counts)} / 后端 ${JSON.stringify(truth)}`,
);
check(Array.isArray(json.members) && json.members.length === 2 && json.discussions[0].replies.length > 0, "JSON 含成员、问题与嵌套回复");

// 4) Markdown 下载
const mdRes = await fetch(`${BASE}/api/export?format=md`, { headers: { cookie: cookieHeader } });
const md = await mdRes.text();
check(mdRes.status === 200 && mdRes.headers.get("content-type")?.includes("text/markdown"), "Markdown 接口返回 200 与正确类型");
const markers = ["# 爱的小屋 · 备份", "## 问题", "## 信件", "## 每日状态", "最近有哪件事让你觉得我没有真正听懂你？", "椅子搬回屋里了"];
const missing = markers.filter((marker) => !md.includes(marker));
check(missing.length === 0, "Markdown 覆盖四类内容与原文", missing.length ? `缺少 ${missing.join("、")}` : `${md.length} 字符`);
const disposition = mdRes.headers.get("content-disposition") ?? "";
check(/filename="ai-de-xiao-wu-backup-/.test(disposition) && /filename\*=UTF-8''/.test(disposition), "下载文件名带中文名与 ASCII 兜底", disposition.slice(0, 80));

// 5) 未登录必须被拦
const anon = await fetch(`${BASE}/api/export?format=json`, { redirect: "manual" });
check(anon.status >= 300 && anon.status < 400, "未登录访问导出接口被重定向", `HTTP ${anon.status}`);

await context.close();
await browser.close();
if (failed) { console.log(`❌ ${failed} 项未通过`); process.exitCode = 1; }
else console.log("✅ 导出备份全部通过");
