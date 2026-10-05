/** 验证手机上左右滑动切换日期，以及不会误触（纵向滚动、昨天之后不能再往后）。 */
import { chromium, devices } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3101";
let failed = 0;
const check = (ok, label, extra = "") => {
  if (!ok) failed += 1;
  console.log(`${ok ? "✓" : "✗"} ${label}${extra ? `  ${extra}` : ""}`);
};

const browser = await chromium.launch();
const context = await browser.newContext({ ...devices["Pixel 5"] });
const page = await context.newPage();
await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.getByLabel("邮箱").fill("alan@demo.local");
await page.getByLabel("密码").fill("demo-password-123");
await page.getByRole("button", { name: "进入爱的小屋" }).click();
await page.waitForURL(/\/today/, { timeout: 20000 });
await page.locator(".status-grid").waitFor({ state: "visible", timeout: 15000 });

/** 等这一页的客户端逻辑真的挂上（滑动监听在 useEffect 里，水合前派发触摸事件会丢） */
async function waitInteractive() {
  await page.waitForFunction(() => {
    const grid = document.querySelector(".status-grid") ?? document.body;
    return Object.keys(grid).some((key) => key.startsWith("__reactFiber"));
  }, null, { timeout: 15000 });
  await page.waitForTimeout(400);
}

/** 反复滑动直到条件成立——换页后新组件的监听需要时间挂上 */
async function swipeUntil(dx, dy, predicate, attempts = 4) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    await swipe(dx, dy);
    if (await predicate()) return attempt;
  }
  return 0;
}

/** 用合成的 TouchEvent 模拟滑动 */
async function swipe(dx, dy) {
  await page.evaluate(({ dx, dy }) => {
    const target = document.querySelector(".status-grid") ?? document.body;
    const box = target.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    const make = (type, clientX, clientY) => {
      const touch = new Touch({ identifier: 1, target, clientX, clientY });
      return new TouchEvent(type, { touches: type === "touchend" ? [] : [touch], changedTouches: [touch], bubbles: true, cancelable: true });
    };
    target.dispatchEvent(make("touchstart", x, y));
    target.dispatchEvent(make("touchend", x + dx, y + dy));
  }, { dx, dy });
  await page.waitForTimeout(600);
}

const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
const yesterday = new Date(Date.now() + 8 * 3600 * 1000 - 86400000).toISOString().slice(0, 10);

// 1) 纵向滚动不应触发
await waitInteractive();
const before = page.url();
await swipe(20, 180);
check(page.url() === before, "纵向滑动不切换日期", page.url().replace(BASE, ""));

// 2) 右滑回到昨天
const rightAttempts = await swipeUntil(160, 6, async () => page.url().includes(`date=${yesterday}`));
check(rightAttempts > 0, "右滑回到前一天", `${page.url().replace(BASE, "")}${rightAttempts > 1 ? `（第 ${rightAttempts} 次生效）` : ""}`);

// 3) 左滑回到今天
await waitInteractive();
const leftAttempts = await swipeUntil(-160, 6, async () => page.url().includes(`date=${today}`));
check(leftAttempts > 0, "左滑回到后一天", `${page.url().replace(BASE, "")}${leftAttempts > 1 ? `（第 ${leftAttempts} 次生效）` : ""}`);

// 4) 在今天就停住，不能滑到未来
await waitInteractive();
await swipe(-170, 4);
check(page.url().includes(`date=${today}`), "今天之后不再往后滑", page.url().replace(BASE, ""));

// 5) 桌面端拖动鼠标不该切换日期（必须是已登录的真实页面，否则测到的是登录跳转）
const desktop = await browser.newContext({ viewport: { width: 1440, height: 950 } });
const deskPage = await desktop.newPage();
await deskPage.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await deskPage.getByLabel("邮箱").fill("alan@demo.local");
await deskPage.getByLabel("密码").fill("demo-password-123");
await deskPage.getByRole("button", { name: "进入爱的小屋" }).click();
await deskPage.waitForURL(/\/today/, { timeout: 20000 });
await deskPage.goto(`${BASE}/today?date=${yesterday}`, { waitUntil: "networkidle" });
await deskPage.locator(".status-grid").waitFor({ state: "visible", timeout: 15000 });
const deskBefore = deskPage.url();
await deskPage.mouse.move(700, 400);
await deskPage.mouse.down();
await deskPage.mouse.move(300, 400);
await deskPage.mouse.up();
await deskPage.waitForTimeout(500);
check(deskPage.url() === deskBefore, "桌面端拖动鼠标不会切换日期", deskPage.url().replace(BASE, ""));
check(deskPage.url().includes("/today"), "（该桌面页面确实是已登录的今日页）", deskPage.url().replace(BASE, ""));
await desktop.close();

await context.close();
await browser.close();
if (failed) { console.log(`❌ ${failed} 项未通过`); process.exitCode = 1; }
else console.log("✅ 滑动切换日期全部通过");
