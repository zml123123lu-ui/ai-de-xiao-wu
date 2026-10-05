# 爱的小屋

只供两位固定成员使用的私人交流网站。包含问题讨论、不可修改的正式信件，以及按上海日期记录的每日状态。

## 本地启动

需要 Node.js 20+ 与 pnpm 11。

```bash
pnpm install --ignore-scripts
cp .env.example .env.local
pnpm dev
```

打开 `http://localhost:3000`。在 Supabase 配置完成前，登录页会显示初始化提示。

## 初始化 Supabase

1. 创建 Supabase 项目，在 Authentication 的 Providers 中启用 Email，并关闭“Allow new users to sign up”。
2. 在 SQL Editor 按文件名顺序执行 `supabase/migrations/` 下的全部迁移（含 `202608150001_letter_reply.sql`，为信件回信增加 `reply_to_id`）。
3. 在 Authentication > Users 手动创建两个邮箱账号，并关闭邮件确认或手动确认这两个账号。
4. 复制两个用户的 UUID，在 SQL Editor 中插入成员资料：

```sql
insert into public.profiles (id, display_name, avatar_color) values
  ('第一个用户UUID', '你的名字', '#9A5540'),
  ('第二个用户UUID', '对方名字', '#627160');
```

数据库只允许 `profiles` 中的成员读取交流内容。创建第三个 Auth 用户并不会自动获得访问权限。

5. 将项目 URL 与 anon key 写入 `.env.local`：

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Anon key 可以出现在浏览器端；数据安全由 RLS 保证。不要将 service role key 放入本项目或 Vercel 客户端环境变量。

## 验证

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm audit --prod
```

数据库 RLS 断言位于 `supabase/tests/rls.sql`，适合在安装了 pgTAP 的本地 Supabase 环境运行。浏览器测试需要本地服务和可用测试账号：

```bash
E2E_USER_EMAIL=member@example.com E2E_USER_PASSWORD='test-password' pnpm test:e2e
```

## 在国内可直连的部署（推荐先看这个）

Vercel 与 Supabase 在大陆网络下是 IP 段 + TLS 层被阻断，换自定义域名无效。**上线就照 [`docs/上线速查.md`](docs/上线速查.md) 走（一页纸五步）**；**另有一条完全零成本路线**（免费托管 + 应用自带 Supabase 转发器，不买域名、不备案），已实测可行，见同一文档的「路线 Z」。迁移清单（含验收与回滚）见 [`docs/deploy-cn.md`](docs/deploy-cn.md)：EdgeOne Pages 免费版 + 阿里云 Supabase 版，代码只需改两个环境变量。

## 部署到 Vercel（原始方案，作为备选）

1. 将仓库推送到 GitHub，并在 Vercel 导入。
2. 在 Vercel Project Settings > Environment Variables 配置两个 `NEXT_PUBLIC_SUPABASE_*` 变量。
3. 将 Vercel 正式域名添加到 Supabase Authentication > URL Configuration 的 Site URL 和 Redirect URLs。
4. 使用 `pnpm build` 作为构建命令并部署。
5. 用两个账号分别验证登录、相互回复、寄信/已读与每日状态，再确认匿名窗口访问 `/today` 会被送回登录页。

## 数据与备份

所有正文均以纯文本存储和渲染。讨论删除采用软删除；正式寄出的信件由数据库触发器禁止修改。上线后建议在 Supabase 启用每日备份，并定期验证恢复流程。
