/** 定位横向溢出/布局异常：列出超出视口宽度的元素。 */
import { chromium } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3100";
const paths = process.argv.slice(2);
const targets = paths.length ? paths : ["/today", "/discussions", "/letters"];

const browser = await chromium.launch();
for (const width of [1440, 390]) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: "Asia/Shanghai", locale: "zh-CN" });
  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.getByLabel("邮箱").fill("alan@demo.local");
  await page.getByLabel("密码").fill("demo-password-123");
  await page.getByRole("button", { name: "进入爱的小屋" }).click();
  await page.waitForURL(/\/today/, { timeout: 20000 });

  for (const path of targets) {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    const info = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const offenders = [];
      for (const el of document.querySelectorAll("body *")) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        if (r.right > vw + 1 || r.left < -1) {
          offenders.push({
            tag: el.tagName.toLowerCase(),
            cls: (el.className && typeof el.className === "string" ? el.className : "").slice(0, 60),
            left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width),
            text: (el.textContent ?? "").trim().slice(0, 28),
          });
        }
      }
      // 只保留最外层（父元素也溢出的就跳过子元素）
      // 找出 DOM 里出现、但样式表里没有任何规则命中的类
      const selectors = new Set();
      for (const sheet of document.styleSheets) {
        try { for (const rule of sheet.cssRules) if (rule.selectorText) selectors.add(rule.selectorText); } catch {}
      }
      const all = [...selectors].join(" ");
      const unstyled = new Set();
      for (const el of document.querySelectorAll("body *")) {
        const list = typeof el.className === "string" ? el.className.split(/\s+/) : [];
        for (const c of list) if (c && !all.includes(`.${c}`)) unstyled.add(c);
      }
      return { vw, scrollWidth: document.documentElement.scrollWidth, offenders: offenders.slice(0, 25), unstyled: [...unstyled] };
    });
    console.log(`\n### ${path}  @${width}px  视口=${info.vw} 文档宽=${info.scrollWidth} 溢出=${info.scrollWidth - info.vw}px`);
    if (!info.offenders.length) console.log("  无越界元素");
    for (const o of info.offenders) console.log(`  <${o.tag} class="${o.cls}"> left=${o.left} right=${o.right} w=${o.w} "${o.text}"`);
    if (info.unstyled?.length) console.log(`  ⚠ 未定义样式的类: ${info.unstyled.join(" ")}`);
  }
  await context.close();
}
await browser.close();
