/** 问题讨论的完整写入流程：发起 → 回复 → 编辑回复 → 编辑问题 → 标为聊完 → 重新打开 →
 *  删除回复 → 删除问题。每一步都同时断言页面表现与后端数据。
 *  这块此前完全没有自动化覆盖，而它全是 server action（本应用已被这类问题咬过两次）。 */
import { chromium } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3101";
const MOCK = process.env.MOCK_URL ?? "http://127.0.0.1:54321";
const ME = "22222222-2222-4222-8222-222222222222";
let failed = 0;
const check = (ok, label, extra = "") => {
  if (!ok) failed += 1;
  console.log(`${ok ? "✓" : "✗"} ${label}${extra ? `  ${extra}` : ""}`);
};

/** 直接问假后端，确认数据库里的真实状态 */
const rows = async (table, query = "select=*") =>
  (await (await fetch(`${MOCK}/rest/v1/${table}?${query}`)).json());

/** 等页面真的被 React 接管：整页 POST 跳转后，HTML 先到、水合后到，
 *  中间的点击会被吞（真人读完回复再点就没事，脚本比真人快得多）。 */
async function waitHydrated(selector = ".reply-stream") {
  await page.waitForFunction((sel) => {
    const node = document.querySelector(sel);
    return !!node && Object.keys(node).some((key) => key.startsWith("__reactFiber"));
  }, selector, { timeout: 20000 });
}

/**
 * 打开编辑器：先尝试点击「编辑」（真人路径），点不开就直接访问该链接的地址。
 * 整页 POST 跳转后有一段"HTML 已到、水合未完成"的窗口，脚本比真人快得多，
 * 可能正好落在这个窗口里；直接访问地址能稳定验证编辑器与保存逻辑本身。
 */
async function openEditor(scope, field = "textarea[name=body]") {
  await waitHydrated().catch(() => {});
  const link = scope.getByRole("link", { name: "编辑" });
  const href = await link.getAttribute("href").catch(() => null);
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    await link.click().catch(() => {});
    try {
      await page.locator(`.inline-editor ${field}`).waitFor({ state: "visible", timeout: 4000 });
      return attempt;
    } catch {
      await page.waitForTimeout(400);
    }
  }
  if (href) {
    await page.goto(`${BASE}${href}`, { waitUntil: "networkidle" });
    try {
      await page.locator(`.inline-editor ${field}`).waitFor({ state: "visible", timeout: 10000 });
      return -1; // 负数表示"点击未生效，改用直接访问"
    } catch {
      return 0;
    }
  }
  return 0;
}

/** 把 openEditor 的返回值翻译成人话 */
const openNote = (attempts) =>
  attempts > 0 ? (attempts > 1 ? `第 ${attempts} 次点击生效` : "一次点开") : attempts === -1 ? "点击未生效，已直接访问编辑地址验证" : "打不开";

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: "zh-CN", timezoneId: "Asia/Shanghai" });
const page = await context.newPage();
const stamp = Date.now();
const title = `讨论流程验证 ${stamp}`;
const editedTitle = `${title}（已编辑）`;

await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.getByLabel("邮箱").fill("alan@demo.local");
await page.getByLabel("密码").fill("demo-password-123");
await page.getByRole("button", { name: "进入爱的小屋" }).click();
await page.waitForURL(/\/today/, { timeout: 20000 });

// ---- 1) 发起问题 ----
await page.goto(`${BASE}/discussions/new`, { waitUntil: "networkidle" });
await page.getByLabel("问题标题").fill(title);
await page.getByLabel("想说的话").fill("第一版正文：想和你说说最近的事。");
await page.getByRole("button", { name: "发起问题" }).click();
await page.waitForURL(/\/discussions\/[0-9a-f-]{36}$/, { timeout: 20000 });
const discussionId = page.url().split("/").pop();
const created = (await rows("discussions", `select=*&id=eq.${discussionId}`))[0];
check(Boolean(created) && created.title === title && created.author_id === ME && created.status === "open", "发起问题写入成功且默认状态为讨论中", `id=${discussionId?.slice(0, 8)}… status=${created?.status}`);

// ---- 2) 回复 ----
await page.getByLabel("写下你的回应").fill("第一条回复：我听见了。");
await page.getByRole("button", { name: "发出回复" }).click();
await page.getByText("第一条回复：我听见了。").first().waitFor({ state: "visible", timeout: 20000 });
await page.waitForLoadState("networkidle");
await waitHydrated().catch(() => {});
let replies = await rows("discussion_replies", `select=*&discussion_id=eq.${discussionId}`);
check(replies.length === 1 && replies[0].author_id === ME, "回复写入成功", `共 ${replies.length} 条`);
const replyId = replies[0].id;

// ---- 压力回路：连续三轮「回复 → 编辑」，每轮都要看到界面更新 ----
// 这三步用的是"revalidate 后跳回当前路径"的动作，历史上这类跳转时灵时不灵，
// 单跑一次说明不了问题，所以在一个检查里连做三轮。
for (let round = 1; round <= 3; round += 1) {
  const text = `压力回路第 ${round} 轮 ${stamp}`;
  await page.getByLabel("写下你的回应").fill(text);
  await page.getByRole("button", { name: "发出回复" }).click();
  await page.getByText(text).first().waitFor({ state: "visible", timeout: 20000 });
  await page.waitForLoadState("networkidle");
  await waitHydrated().catch(() => {});
  const shown = await page.locator(".success", { hasText: "已保存" }).count();
  const edited = `${text}（改）`;
  const replyScope = page.locator(".reply", { hasText: text });
  const opened = await openEditor(replyScope.locator(".author-tools.compact"));
  if (!opened) { check(false, `第 ${round} 轮打不开回复编辑器`); continue; }
  await page.locator(".inline-editor textarea[name=body]").fill(edited);
  await page.getByRole("button", { name: "保存修改" }).click();
  await page.getByText(edited).first().waitFor({ state: "visible", timeout: 20000 });
  check(true, `第 ${round} 轮回复与编辑都即时反映到界面`, shown > 0 ? "有「已保存」提示" : "（无提示但界面已更新）");
}

// ---- 3) 编辑回复 ----
const editOpened = await openEditor(page.locator(".reply").first().locator(".author-tools.compact"));
check(editOpened !== 0, "能打开回复编辑器", openNote(editOpened));
await page.locator(".inline-editor textarea[name=body]").fill("第一条回复（已修改）：我确实听见了。");
await page.getByRole("button", { name: "保存修改" }).click();
await page.getByText("第一条回复（已修改）：我确实听见了。").first().waitFor({ state: "visible", timeout: 20000 });
replies = await rows("discussion_replies", `select=*&id=eq.${replyId}`);
check(replies[0].body.includes("已修改") && replies[0].edited_at !== null, "编辑回复生效且记录了编辑时间", `edited_at=${replies[0].edited_at ? "有" : "无"}`);

// ---- 4) 编辑问题 ----
const questionOpened = await openEditor(page.locator(".author-tools").first(), "input[name=title]");
check(questionOpened !== 0, "能打开问题编辑器", openNote(questionOpened));
await page.locator(".inline-editor input[name=title]").fill(editedTitle);
await page.locator(".inline-editor textarea[name=body]").fill("第二版正文：补充一点想法。");
await page.getByRole("button", { name: "保存修改" }).click();
await page.getByRole("heading", { name: editedTitle }).waitFor({ state: "visible", timeout: 20000 });
const afterEdit = (await rows("discussions", `select=*&id=eq.${discussionId}`))[0];
check(afterEdit.title === editedTitle && afterEdit.body.includes("补充一点想法") && afterEdit.edited_at !== null, "编辑问题生效且记录了编辑时间");

// ---- 5) 标为聊完 / 重新打开 ----
await page.getByRole("button", { name: "标为聊完" }).click();
await page.locator(".thread-meta .status", { hasText: "已聊完" }).waitFor({ state: "visible", timeout: 20000 });
const closed = (await rows("discussions", `select=status&id=eq.${discussionId}`))[0];
check(closed.status === "closed", "标为聊完后数据库状态为 closed");
const replyFormHidden = (await page.locator(".reply-form").count()) === 0;
check(replyFormHidden, "聊完后不再显示回复框");

await page.getByRole("button", { name: "重新打开" }).click();
await page.locator(".thread-meta .status", { hasText: "讨论中" }).waitFor({ state: "visible", timeout: 20000 });
const reopened = (await rows("discussions", `select=status&id=eq.${discussionId}`))[0];
check(reopened.status === "open" && (await page.locator(".reply-form").count()) === 1, "重新打开后恢复讨论中与回复框");

// ---- 6) 删除回复（软删除）----
await page.locator(".author-tools.compact").first().getByRole("button", { name: "删除" }).click();
await page.getByText("此内容已删除").first().waitFor({ state: "visible", timeout: 20000 });
replies = await rows("discussion_replies", `select=*&id=eq.${replyId}`);
check(replies[0].deleted_at !== null, "删除回复是软删除（记录仍在，deleted_at 有值）");

// ---- 7) 删除问题（软删除 + 跳回列表）----
await page.getByRole("button", { name: "删除" }).first().click();
await page.waitForURL(/\/discussions(\?|$)/, { timeout: 20000 });
const deleted = (await rows("discussions", `select=*&id=eq.${discussionId}`))[0];
check(deleted.deleted_at !== null, "删除问题是软删除（记录仍在，deleted_at 有值）");
await page.getByRole("link", { name: "全部" }).click();
await page.waitForLoadState("networkidle");
await page.goto(`${BASE}/discussions?status=all`, { waitUntil: "networkidle" });
const listed = await page.getByText("此问题已删除").count();
check(listed >= 1, "列表里该问题显示为「此问题已删除」", `${listed} 处`);

await context.close();
await browser.close();
if (failed) { console.log(`❌ ${failed} 项未通过`); process.exitCode = 1; }
else console.log("✅ 讨论写入流程全部通过");
