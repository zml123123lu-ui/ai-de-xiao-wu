/**
 * 按浏览器实际计算样式测对比度——比检查 token 更可信：
 * token 定义了却没用上、或某处写了字面量浅色，这里都会现形。
 * 浅色与暗色各跑一遍。
 */
import { chromium } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3101";
const CASES = [
  { path: "/today", selector: ".mood-options span", label: "心情药丸（未选中）" },
  { path: "/today", selector: ".status-form textarea", label: "今日状态输入框" },
  { path: "/today", selector: ".week-day .weekday", label: "七日历的星期" },
  { path: "/today", selector: ".sheet-heading small", label: "便签里的次要文字" },
  { path: "/discussions", selector: ".row-meta span", label: "列表行的时间" },
  { path: "/discussions", selector: ".status.open", label: "「讨论中」标签" },
  { path: "/discussions", selector: ".button.primary", label: "主按钮" },
  { path: "/discussions", selector: ".button.secondary", label: "次要按钮" },
  { path: "/letters?tab=inbox", selector: ".letter-row .letter-main p", label: "信件列表摘要" },
  { path: "/notifications", selector: ".notice-title", label: "通知里的标题" },
  { path: "/search?q=%E9%A6%84%E9%A5%A8", selector: ".search-hit mark", label: "搜索命中高亮" },
  { path: "/export", selector: ".export-card span", label: "导出页说明文字" },
  { path: "/review", selector: ".month-cell.today .month-day", label: "月历今天的日号" },
  { path: "/review", selector: ".review-summary span", label: "回顾统计标签" },
  { path: "/letters/compose", selector: ".letter-paper input", label: "信件题目输入框" },
  { path: "/letters/compose", selector: ".letter-paper textarea", label: "信件正文输入框" },
];

const rgb = (value) => value.match(/[\d.]+/g)?.map(Number) ?? null;
const luminance = ([r, g, b]) => {
  const [x, y, z] = [r, g, b].map((v) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4));
  return 0.2126 * x + 0.7152 * y + 0.0722 * z;
};
const contrast = (fg, bg) => {
  const [a, b] = [luminance(fg), luminance(bg)].sort((m, n) => n - m);
  return (a + 0.05) / (b + 0.05);
};
/** 把祖先链上的半透明背景由下往上合成，得到文字真正盖住的颜色 */
const composite = (layers) => {
  let base = [255, 255, 255];
  for (const layer of layers.reverse()) {
    const [r, g, b, alpha = 1] = layer;
    base = [r * alpha + base[0] * (1 - alpha), g * alpha + base[1] * (1 - alpha), b * alpha + base[2] * (1 - alpha)];
  }
  return base;
};

const browser = await chromium.launch();
let failed = 0;
for (const theme of ["light", "dark"]) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: "zh-CN", colorScheme: theme, timezoneId: "Asia/Shanghai" });
  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.getByLabel("邮箱").fill("alan@demo.local");
  await page.getByLabel("密码").fill("demo-password-123");
  await page.getByRole("button", { name: "进入爱的小屋" }).click();
  await page.waitForURL(/\/today/, { timeout: 20000 });

  console.log(`\n=== ${theme === "light" ? "浅色（实际渲染）" : "暗色（实际渲染）"} ===`);
  for (const item of CASES) {
    await page.goto(`${BASE}${item.path}`, { waitUntil: "networkidle" });
    const sampled = await page.evaluate((selector) => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const style = getComputedStyle(el);
      const layers = [];
      let node = el;
      while (node && node !== document.documentElement) {
        const bg = getComputedStyle(node).backgroundColor;
        const parsed = bg.match(/[\d.]+/g)?.map(Number);
        if (parsed && parsed[3] !== 0) {
          layers.push(parsed);
          if (parsed[3] === undefined || parsed[3] >= 1) break;
        }
        node = node.parentElement;
      }
      return { color: style.color, fontSize: parseFloat(style.fontSize), fontWeight: Number(style.fontWeight), layers };
    }, item.selector);
    if (!sampled) { console.log(`⚠ ${item.label}：找不到 ${item.selector}`); continue; }
    const fg = rgb(sampled.color);
    const bg = composite(sampled.layers.length ? sampled.layers : [[255, 255, 255, 1]]);
    const value = contrast(fg, bg);
    const large = sampled.fontSize >= 24 || (sampled.fontSize >= 18.66 && sampled.fontWeight >= 700);
    const min = large ? 3 : 4.5;
    const ok = value >= min;
    if (!ok) failed += 1;
    console.log(`${ok ? "✓" : "✗"} ${item.label.padEnd(20)} ${value.toFixed(2)}:1（需 ≥${min}）`);
  }
  await context.close();
}
await browser.close();
console.log(failed ? `\n❌ ${failed} 处实际渲染对比度不足` : "\n✅ 实际渲染的对比度全部达标");
process.exitCode = failed ? 1 : 0;
