# dev/ 本地离线预览工具

不需要梯子、不需要连 Supabase，就能在本地打开完整的真实界面，用来改样式和验证交互。

## 用法

```bash
# 终端 A：假后端（内存数据库）
node dev/mock-supabase.mjs

# 终端 B：指向假后端启动应用
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
NEXT_PUBLIC_SUPABASE_ANON_KEY=mock-anon-key \
pnpm dev -p 3100
```

打开 <http://127.0.0.1:3100>，用 `alan@demo.local` 或 `xiaojiu@demo.local`，密码都是 `demo-password-123`。

## 一键验证

```bash
bash dev/verify-all.sh
```

它会启动假后端 + **生产构建** + 生产服务，然后依次检查：客户端水合与控制台报错、免刷新是否生效、四个页面有无布局溢出、并重拍全部截图（含暗色）。

> **为什么用生产模式而不是 `next dev`**：Next 15 + pnpm 在 dev 模式下存在分包竞态，浏览器可能在首次编译某页时抢到半成品 chunk，报 `__webpack_require__.n is not a function` 并让整棵客户端树水合失败。实测同一份代码 `next start` 完全正常（侧栏、免刷新都在，控制台零错误），所以验证以生产模式为准；dev 下若遇到该报错，重启 dev 服务或先访问一遍各页面即可。

## 可用脚本

| 脚本 | 作用 |
| --- | --- |
| `verify-all.sh` | 一键跑完下面所有检查（生产模式）。 |
| `check-hydration.mjs` | 对比服务端原始 HTML 与浏览器 DOM，判断是否真的水合成功。 |
| `mock-supabase.mjs` | PostgREST + GoTrue 的最小替身。内存数据库，并模拟线上那几个关键触发器：通知、`updated_at`、草稿寄出补 `sent_at`、每日状态去重。 |
| `screenshot.mjs` | 桌面（1440）与移动（390）两个视口，把 13 个页面截到 `dev/shots/`，同时报告横向溢出和控制台报错。 |
| `verify-save.mjs` | 回归检查：保存草稿等表单提交后必须真正发生跳转（防止自动刷新顶掉 redirect）。 |
| `verify-auth.mjs` | 账号与权限边界：密码错误提示、匿名被拦、**非成员账号必须拿不到任何内容**。 |
| `verify-edge.mjs` | 输入边界与异常路径：搜索特殊字符/超长/空、超长或非法正文被服务端拒绝且不写库、未登录写入被挡回。 |
| `verify-notifications.mjs` | 通知中心：「全部标为已读」后界面与后端都清空（轮询后端断言最终状态）。 |
| `verify-daily.mjs` | 每日状态：写下 → 再改（更新而非新增）→ 翻看历史日期（只读）。 |
| `verify-discussions.mjs` | 问题讨论的完整写入流程：发起/回复/编辑/标为聊完/重开/软删除，每步同时断言页面与后端数据。 |
| `verify-session.mjs` | 验证会话续期（token 过期后自动 refresh 而不是掉登录）与退出登录（跳登录 + cookie 清空）。 |
| `verify-deployed.mjs` | 对着**真实部署好的网址**跑冒烟检查（登录页、未登录拦截、转发器守门；带账号再逐页验证）。 |
| `verify-relay.sh` | 验证零成本部署路径：把直连地址设成不存在的端口，若检查仍通过即证明只走了应用自带的 /supabase 转发器。 |
| `verify-swipe.mjs` | 验证手机左右滑动切日期，以及纵向滑动/桌面拖动不误触。 |
| `verify-motion.mjs` | 验证动效存在、且开启「减少动态效果」后全部关闭。 |
| `check-contrast-live.mjs` | 按浏览器**实际计算样式**测对比度（浅色+暗色）：token 没用上、或写了字面量浅色，都会现形。 |
| `check-contrast.mjs` | 用 WCAG 公式实测浅色/暗色两套配色的文字与图形对比度。 |
| `verify-lists.mjs` | 验证列表分页：单页上限、翻页、筛选计数（分页前 243 个问题要传 760KB）。 |
| `measure-scale.mjs` | 规模实测：灌入数年的数据量，量每个页面实际传输字节数。 |
| `verify-review.mjs` | 验证月历回顾：格子数、统计数字、今天高亮、点进某天、翻月。 |
| `verify-export.mjs` | 验证导出：页面统计、Markdown/JSON 下载、文件名头、未登录被拦。 |
| `verify-search.mjs` | 验证搜索：侧栏入口、四类内容命中、命中词高亮、无结果提示。 |
| `verify-reply.mjs` | 端到端验证信内回信（预填、草稿、寄出、双方视角的线索）。 |
| `verify-badges.mjs` | 断言未读徽标与后端真实未读一致，防止渲染期写库的竞态回归。 |
| `verify-realtime.mjs` | 验证"免刷新"：模拟对方写入假后端，检查页面是否自动出现新内容（同时断言没有发生重新加载）。 |
| `zoom.mjs` | 放大核对细节：`node dev/zoom.mjs ".week-strip" /today dev/shots/zoom-week.png`。 |
| `diagnose.mjs` | 定位越界元素：`node dev/diagnose.mjs /today /letters`，直接列出超出视口宽度的 DOM 节点。 |

## 注意

- 数据只在内存里，重启即回到 `dev/fixtures.mjs` 里的初始假数据。
- 它只是本地替身，**不影响生产**：`src/` 不引用 `dev/`，线上仍然走真实 Supabase + RLS。
- 假数据里的"今天"按上海时区实时计算，所以 `/today` 的当日/历史视图始终有内容可比。
