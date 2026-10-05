/**
 * 用 WCAG 2.1 公式实测配色的文字对比度（浅色与暗色两套都跑）。
 * 阈值：正文 4.5:1；非文字图形（边线、焦点、圆点）3:1。
 * 用法: node dev/check-contrast.mjs
 */
import { readFileSync } from "node:fs";

const css = readFileSync("src/app/globals.css", "utf8");
const tokensOf = (block) => Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{3,8})/g)].map((m) => [m[1], m[2]]));
const light = tokensOf(css.match(/:root\s*\{([^}]*)\}/)[1]);
const dark = { ...light, ...tokensOf(css.match(/@media \(prefers-color-scheme:dark\)\s*\{\s*:root\s*\{([^}]*)\}/)?.[1] ?? "") };

const rgb = (hex) => [0, 2, 4].map((i) => parseInt(hex.replace("#", "").slice(i, i + 2), 16));
const luminance = (hex) => {
  const [r, g, b] = rgb(hex).map((v) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

// fg/bg 可以是 token 名（两套主题都会解析）或字面量；theme 限定只在某套主题里检查
const PAIRS = [
  { label: "正文 ink / paper", fg: "--ink", bg: "--paper" },
  { label: "正文 ink / card", fg: "--ink", bg: "--card" },
  { label: "次要文字 muted / paper", fg: "--muted", bg: "--paper" },
  { label: "次要文字 muted / card", fg: "--muted", bg: "--card" },
  { label: "次级正文 ink-soft / paper", fg: "--ink-soft", bg: "--paper" },
  { label: "强调色当文字 accent / paper", fg: "--accent", bg: "--paper" },
  { label: "印章色当文字 seal / paper", fg: "--seal", bg: "--paper" },
  { label: "对方标记 green / paper", fg: "--green", bg: "--paper" },
  { label: "主按钮白字 / accent-fill", fg: "#ffffff", bg: "--accent-fill" },
  { label: "主按钮白字 / accent-dark（悬停）", fg: "#ffffff", bg: "--accent-dark" },
  // 暗色下 mark 有自己的字面量（见下面的暗色条目），所以这条只在浅色检查
  { label: "高亮 mark 文字 / accent-soft", fg: "--accent-dark", bg: "--accent-soft", theme: "light" },
  { label: "输入框文字 ink / 输入框底", fg: "--ink", bg: "--field-bg" },
  { label: "心情药丸 ink-soft / 药丸底", fg: "--ink-soft", bg: "--chip-bg" },
  { label: "日期格 muted / 日期格底", fg: "--muted", bg: "--chip-bg-soft" },
  { label: "边线 field-line / paper（功能边界，需 ≥3）", fg: "--field-line", bg: "--paper", min: 3, graphic: true },
  { label: "焦点轮廓 accent / paper（需 ≥3）", fg: "--accent", bg: "--paper", min: 3, graphic: true },
  { label: "错误条文字 / 背景", fg: "#7c2a20", bg: "#f7e2dd", theme: "light" },
  { label: "成功条文字 / 背景", fg: "#3f4c3b", bg: "#e6ecdf", theme: "light" },
  { label: "状态标签 讨论中 / 背景", fg: "#6b6a45", bg: "#f1efe0", theme: "light" },
  { label: "错误条文字 / 背景", fg: "#f0c3b6", bg: "#3a221d", theme: "dark" },
  { label: "成功条文字 / 背景", fg: "#c3d3b6", bg: "#242c20", theme: "dark" },
  { label: "状态标签 讨论中 / 背景", fg: "#cfc59a", bg: "#2d2a1e", theme: "dark" },
  { label: "高亮 mark 文字 / 背景", fg: "#f0b9a4", bg: "#43291f", theme: "dark" },
];

let failed = 0;
for (const theme of ["light", "dark"]) {
  const palette = theme === "light" ? light : dark;
  console.log(`\n=== ${theme === "light" ? "浅色" : "暗色"} ===`);
  for (const pair of PAIRS.filter((item) => !item.theme || item.theme === theme)) {
    const min = pair.min ?? 4.5;
    const resolve = (value) => (value.startsWith("#") ? value : palette[value.replace(/^--/, "")] ?? "#000000");
    const value = ratio(resolve(pair.fg), resolve(pair.bg));
    const ok = value >= min;
    if (!ok) failed += 1;
    console.log(`${ok ? "✓" : "✗"} ${pair.label.padEnd(36)} ${value.toFixed(2)}:1（需 ≥${min}${pair.graphic ? "，图形" : ""}）`);
  }
}
console.log(failed ? `\n❌ ${failed} 项对比度不足` : "\n✅ 对比度全部达标");
process.exitCode = failed ? 1 : 0;
