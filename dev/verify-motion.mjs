/**
 * 验证动效：
 *  1) 这些元素确实挂上了动画
 *  2) 动画真的在改变状态（把动画停在指定帧读计算样式，而不只是看 animation-name）
 *  3) 开启「减少动态效果」后必须全部关闭
 *  4) FULL_MOTION=1 时额外验证：自动刷新（每 20s 一次）不会让页面动画重播（否则内容会闪）
 */
import { chromium } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3101";
const L1 = "cccccccc-0000-4000-8000-000000000001";
const FULL = process.env.FULL_MOTION === "1";
let failed = 0;
const check = (ok, label, extra = "") => {
  if (!ok) failed += 1;
  console.log(`${ok ? "✓" : "✗"} ${label}${extra ? `  ${extra}` : ""}`);
};

const CASES = [
  { path: "/today", selector: ".page", label: "页面淡入" },
  { path: "/discussions", selector: ".discussion-list > *", label: "列表项错开" },
  { path: `/letters/${L1}`, selector: ".opened-letter", label: "信纸展开" },
  { path: `/letters/${L1}`, selector: ".opened-letter footer .seal", label: "朱砂印落章" },
];

const browser = await chromium.launch();

async function signIn(options = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: "zh-CN", timezoneId: "Asia/Shanghai", ...options });
  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.getByLabel("邮箱").fill("alan@demo.local");
  await page.getByLabel("密码").fill("demo-password-123");
  await page.getByRole("button", { name: "进入爱的小屋" }).click();
  await page.waitForURL(/\/today/, { timeout: 20000 });
  return { context, page };
}

const animationNameOf = (page, selector) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    return el ? getComputedStyle(el).animationName : null;
  }, selector);

// ---- 1) 正常情况下应挂上动画 ----
const normal = await signIn();
console.log("=== 正常模式应挂上动画 ===");
for (const item of CASES) {
  await normal.page.goto(`${BASE}${item.path}`, { waitUntil: "networkidle" });
  const name = await animationNameOf(normal.page, item.selector);
  check(Boolean(name) && name !== "none", item.label, `animation-name: ${name}`);
}

// ---- 2) 朱砂印：把动画停在 0 / 中段 / 结束，看它是否真的在改变状态 ----
await normal.page.goto(`${BASE}/letters/${L1}`, { waitUntil: "networkidle" });
await normal.page.locator(".opened-letter footer .seal").waitFor({ state: "visible", timeout: 15000 });
const phases = await normal.page.evaluate(() => {
  const seal = document.querySelector(".opened-letter footer .seal");
  const animation = seal.getAnimations().find((item) => item.animationName === "seal-stamp");
  if (!animation) return null;
  const duration = Number(animation.effect.getTiming().duration);
  animation.pause();
  const read = (time) => {
    animation.currentTime = time;
    const style = getComputedStyle(seal);
    return { opacity: Number(style.opacity), transform: style.transform };
  };
  return { start: read(0), middle: read(duration * 0.5), end: read(duration - 1) };
});
check(Boolean(phases), "找到朱砂印的动画");
if (phases) {
  check(phases.start.opacity < 0.2, "起始帧是透明浮现的", `opacity=${phases.start.opacity}`);
  check(phases.end.opacity > 0.8, "结束帧落定在可见状态", `opacity=${phases.end.opacity}`);
  check(phases.start.transform !== phases.end.transform, "过程中确实在缩放（落章手感）");
}

// 停在中间帧截图，人眼可查
await normal.page.evaluate(() => {
  const seal = document.querySelector(".opened-letter footer .seal");
  const animation = seal.getAnimations().find((item) => item.animationName === "seal-stamp");
  if (animation) { animation.pause(); animation.currentTime = Number(animation.effect.getTiming().duration) * 0.6; }
});
await normal.page.screenshot({ path: "dev/shots/motion-seal.png" });
await normal.page.evaluate(() => document.getAnimations().forEach((item) => item.play()));
await normal.context.close();

// ---- 4) 自动刷新不应让页面动画重播 ----
if (FULL) {
  const slow = await signIn();
  await slow.page.goto(`${BASE}/today`, { waitUntil: "networkidle" });
  await slow.page.waitForTimeout(1200);
  const before = await slow.page.evaluate(() => {
    const page = document.querySelector(".page");
    return page.getAnimations().map((item) => item.playState);
  });
  await slow.page.waitForTimeout(22000); // 等一次自动刷新
  const after = await slow.page.evaluate(() => {
    const page = document.querySelector(".page");
    return page.getAnimations().map((item) => item.playState);
  });
  check(!after.includes("running"), "自动刷新后页面动画没有重播（内容不会闪）", `刷新前 ${before.join(",") || "已完成"} → 刷新后 ${after.join(",") || "已完成"}`);
  await slow.context.close();
}

// ---- 3) 减少动态效果 ----
const reduced = await signIn({ reducedMotion: "reduce" });
console.log("\n=== 开启「减少动态效果」后应全部关闭 ===");
for (const item of CASES) {
  await reduced.page.goto(`${BASE}${item.path}`, { waitUntil: "networkidle" });
  const name = await animationNameOf(reduced.page, item.selector);
  check(name === "none", item.label, `animation-name: ${name}`);
}
await reduced.context.close();

await browser.close();
if (failed) { console.log(`❌ ${failed} 项未通过`); process.exitCode = 1; }
else console.log("✅ 动效、减少动态效果与自动刷新共存都符合预期");
