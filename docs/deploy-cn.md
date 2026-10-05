# 让「爱的小屋」在国内不挂梯子也能打开 —— 迁移清单

> 这份文档是照着执行的清单，不是调研报告。参数（域名、账号）留空处等定了再填。
> 结论来自 2026-10 在本机的实测，证据见文末「附录」。

## 摘要

- **必须搬两样东西**：应用托管（现在 Vercel）与数据库/认证（现在 Supabase）。这两个域名在当前网络下都是 **IP 段 + TLS 层被阻断**，换自定义域名救不了。
- **代码几乎不用改**：全项目只读两个环境变量（见下面的审计），没有 Vercel 专有 API。
- **你要做的只有两件事**：买一个便宜域名（¥10-60/年），以及决定要不要备案。

## 一、两条路线

| | **路线 A：免费为主（建议先上这个）** | **路线 B：大陆节点（要备案）** |
| --- | --- | --- |
| 应用托管 | 腾讯云 EdgeOne Pages 免费版，**全球可用区**（免备案） | EdgeOne Pages **大陆可用区** |
| 数据库/认证 | 阿里云 AnalyticDB PostgreSQL **Supabase 版**（免费版 1vCPU/2GB） | 同左，付费版 |
| 域名 | 必须自有域名（EdgeOne 平台自带域名对大陆返回 401） | 必须**已备案**的域名 |
| 每月成本 | 只有域名摊销 ≈ ¥1-5 | ≈ ¥50-150 |
| 大陆首屏 | 0.8-2s，晚高峰可能丢包 | 200-600ms，稳定 |
| 一次性等待 | 无 | 域名实名满 3 天 + 管局审核 3-20 工作日 |
| 代码改动 | 改 2 个环境变量 | 相同 |

**建议**：先按 A 上线（一天内可完成，不必等备案），同时并行提交备案；批下来再从 A 切到 B——DNS 换一下就行，数据不用再动。

**路线 C（不推荐，但最可控）**：国内轻量云服务器（2C2G ≈ ¥45-50/月）自建 Next.js + 自托管 Supabase。首屏 100-300ms，但要自己管备份、升级、HTTPS 与安全。仍必须备案。文档末尾附了 Docker 骨架。

## 二、第一步：搬数据库（这一步最关键，做错了门就锁不上）

1. 在阿里云开通 AnalyticDB PostgreSQL Supabase 版，拿到 **Project URL** 与 **anon key**。
2. 迁移数据。两条路：
   - **推荐**：官方迁移工具 `supabase-cli migrate-project`，会带走 schema、表、函数、触发器、枚举、**auth 用户**、Storage 与 RLS 策略。
   - **手动兜底**：在目标库按文件名顺序执行本仓库的迁移：
     1. `supabase/migrations/202608130001_initial_schema.sql`
     2. `supabase/migrations/202608140001_fix_letter_notification_trigger.sql`
     3. `supabase/migrations/202608150001_letter_reply.sql`
     然后在 Authentication 里建两个邮箱账号（关闭注册、关闭邮件确认），复制两个 UUID 插入 `profiles`：
     ```sql
     insert into public.profiles (id, display_name, avatar_color) values
       ('第一个用户UUID', '你的名字', '#9A5540'),
       ('第二个用户UUID', '对方名字', '#627160');
     ```
3. **逐条核对（不要跳过）**：
   - [ ] 两个 auth 账号存在，`profiles` 恰好两行
   - [ ] 匿名访问 `/today` → 被送到登录页
   - [ ] 用一个**第三个**账号登录 → 被送到 `/login?error=member`（说明非成员没有权限）
   - [ ] 成员账号的「信件」里只能看到自己发出的、和自己收到的
   - [ ] 尝试改一封已寄出的信 → 数据库触发器应报错拒绝
   - [ ] 尝试"回"一封自己没收到的信 → RLS 应拒绝
4. **本地先验一遍**：把 `.env.local` 指向新库，跑
   ```bash
   bash dev/verify-all.sh
   ```
   十项检查全绿再往下走。这套检查会真实地走登录、发问题、回复、寄信、回信、搜索、导出、免刷新。

## 三、第二步：搬应用

1. EdgeOne Pages 里新建项目：连接 Git 仓库（或直接上传），构建命令 `pnpm build`，Node 20+。
2. 配环境变量（**只有这两个**）：
   ```
   NEXT_PUBLIC_SUPABASE_URL=<新库 URL>
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<新库 anon key>
   ```
   注意：不要放 service role key。
3. 绑定自有域名：按 EdgeOne 提示加 CNAME。
4. `vercel.json`（只有 `regions: ["syd1"]`）对 Vercel 之外无效，留着无害；想干净就删掉。
5. **审计结论（已核对）**：代码里 0 处 `vercel` 引用、0 个 `@vercel/*` 依赖、无 `waitUntil`/`after`/`request.ip` 等平台专属 API、只读上述 2 个环境变量。搬迁不需要改代码。

## 四、第三步：切换当天必须验的清单

- [ ] **手机关掉 WiFi 与代理**，用流量打开站点 → 能看到登录页
- [ ] 两个账号分别能登录
- [ ] `/today` 写一条状态 → 对方账号 20 秒内**自动**看到（免刷新）
- [ ] 发一个问题 → 对方回复 → 通知徽标数字变化
- [ ] 写一封信 → 寄出 → 对方能读 → 自己看到「对方已于 … 阅读」
- [ ] 从收到的信里「回一封信」→ 两封信互相链上
- [ ] 搜索一个词 → 四类内容都能命中并高亮
- [ ] 导出备份 → 打开 `.md` 确认内容完整
- [ ] 月历页能看到这个月的记录
- [ ] 手机加到主屏，横竖屏都不出现左右滑动
- [ ] 暗色模式正常

## 五、回滚

- 域名 DNS 指回 Vercel 即可恢复原状（数据库两份并存，代码只依赖环境变量）。
- **迁移后至少两周不要删原 Supabase 项目**，先当只读备份。

## 六、已知不确定项（不粉饰）

- 阿里云 AnalyticDB Supabase 免费版官方标注"仅供测试"，2025-12-11 起商业化，**具体价格没查到**。
- EdgeOne Pages 全球可用区在大陆的实测速度，官方没有承诺；表中的 0.8-2s 是社区口径与推测区间。
- 用免费二级域名绑 EdgeOne 理论可行，但容易被污染，不建议长期用。
- 备案时长取官方上限（管局 ≤20 工作日）；实际常见 3-10 工作日，属经验值。

## 附录：路线 C 的 Docker 骨架（自建时才需要）

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:20-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
EXPOSE 3000
CMD ["pnpm", "start"]
```

前面用 Nginx 或 Caddy 做 TLS；Supabase 自托管用官方 docker-compose，注意备份（官方明确说明备份/HA/监控由使用者自负）。

## 附录：为什么"换个域名"不行（实测证据）

| 测试 | 结果 |
| --- | --- |
| `ai-de-xiao-wu.vercel.app` DNS | 解析到 `162.125.2.3`（Dropbox 的 IP，说明被污染） |
| 用 Vercel 真实 anycast IP + 正确 SNI 直连 | `Connection reset by peer`（TCP 通、TLS 被 RST） |
| `vercel.com` | 同样解析到假 IP `64.239.109.1` |
| `*.supabase.co` | DNS 正常（Cloudflare IP），TLS 被 `Connection reset` |
| 本机 Clash 代理 `127.0.0.1:7897` | 走代理访问 Google/Vercel 也不通 |
| 对照组 `www.cloudflare.com` / `github.com` / `baidu.com` | 均 200 |

阻断发生在 IP 段与 TLS 首字节，不只是 DNS；Vercel 自定义域名只是解决"解析"，流量仍然落到被 RST 的地址段。参考：Vercel 官方 KB 说明大陆无节点、不支持备案；社区实测其 A 记录段 `216.198.79.0/24` 被中国移动整段阻断。

---

## 路线 Z：完全零成本（不买域名、不备案）——已实测可行

前面说过"域名这笔钱绕不开"。**这一点被本机实测推翻了**：免费托管平台的默认域名可以直连，
于是让应用自己承担 Supabase 的转发，就能做到零成本。下面是实测数据与做法。

### 前提实测（本机，同一网络）

| 类别 | 域名 | 结果 |
| --- | --- | --- |
| 免费托管 | Render `*.onrender.com` | **404＝可达** ✓ |
| 免费托管 | Netlify `*.netlify.app` | **200＝可达** ✓ |
| 免费托管 | Koyeb `*.koyeb.app` / Deno `*.deno.dev` / Surge `*.surge.sh` | 可达 ✓ |
| 免费托管 | Cloudflare `*.workers.dev` | **被污染**（解析到 199.59.148.97） ✗ |
| 免费托管 | Cloudflare `*.pages.dev` / `*.trycloudflare.com` | 连不上 ✗ |
| 免费域名 | eu.org / DuckDNS / FreeDNS | 连不上（连注册页都打不开） ✗ |
| 免费数据库 | Neon / Turso / Aiven / Upstash | **全部连不上** ✗ |
| 国内平台 | 腾讯云 / 阿里云控制台 | 可达 ✓ |
| 依赖源 | `registry.npmjs.org` | 连不上 ✗（本机装不了新依赖） |

结论：**托管能免费且国内直连，数据库不能**。所以数据库继续留在 Supabase，由应用自己转发。

### 架构：一个免费实例，同时跑应用 + 转发 Supabase

应用内置了一个转发器（`src/app/supabase/[...path]/route.ts`）：
把 `/supabase/auth/v1/*`、`/supabase/rest/v1/*`、`/supabase/storage/v1/*`
转发到真正的 `*.supabase.co`。于是前端只依赖一个国内可直连的域名，而 RLS、Auth、
触发器、数据全都不用动。

- 只放行上述三个前缀；配置了 `SUPABASE_RELAY_TOKEN` 时还要求携带令牌（Render 会自动生成）
- 服务端优先读运行时的 `SUPABASE_URL`，所以同一个构建产物既能直连、也能走转发器
- 中间件已排除 `/supabase/`（它没有会话 cookie，且不该被会话跳转拦截）

### 步骤

1. 把仓库推到 GitHub（`github.com` 可达）。
2. Render 注册（用 GitHub 账号登录）→ **New → Blueprint** → 选中本仓库；根目录的 `render.yaml` 已备好。
3. 在控制台补两个值（`sync: false` 的两项）：
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`：Supabase 项目的 anon key
   - `SUPABASE_UPSTREAM_URL`：`https://<你的项目>.supabase.co`
4. 若服务名不是 `ai-de-xiao-wu`，把 `render.yaml` 里两处 `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_URL` 改成 `https://<新名字>.onrender.com/supabase` 再部署（域名由服务名决定，必须全局唯一）。
5. **在生产库按顺序执行三个迁移**（尤其 `202608150001_letter_reply.sql`），否则新版本写入会失败。
6. 按上面「第四步：切换当天必须验的清单」逐条验收（记得手机关掉 WiFi 与代理）。

### 这条路的代价（必须知情）

- **闲置 15 分钟后休眠，冷启动约 1 分钟**。更正一处我先前的说法：这段时间**不是白屏**——
  Render 会向来访者显示它自己的加载页，所以体验是"等一下"，不是"打不开"。
- **750 实例小时/月是整个工作区共享**：一个常驻实例够用（一个月约 730 小时），
  但**不要再开第二个常驻服务**；一旦超额度，Render 会把这个工作区**所有免费服务停到月底**。
  休眠中的服务不消耗额度。
- 出口流量与构建分钟数计入工作区每月额度（具体数值以控制台显示的用量为准）。
- **`region` 创建后不可修改**：蓝图里已写 `singapore`（离国内最近）。若免费实例不支持该区域、
  创建时报错，删掉那一行用默认 `oregon`——但之后想换区域只能删掉服务重建。
- 健康检查走 `/api/health`（只回答进程存活，刻意不探 Supabase——否则依赖抖动会被放大成整站重启）。
- 数据仍在 Supabase 免费层，只是经转发器访问；Supabase 侧每日备份仍建议开启。
- 本机 `registry.npmjs.org` 不可达，所以新增依赖这类事只能由 Render 在构建时完成（`pnpm install` 在它那边跑，没问题）。

### 这条路的验证程度

`bash dev/verify-relay.sh`（已纳入套件第 14 项）会把**直连地址故意设成不存在的端口**，
再跑真实流程；八项检查全绿即证明所有数据库流量只走了转发器。隔离行为也一并断言：
带令牌 200 / 无令牌 403 / 白名单外 404。

### 蓝图命令已在本地逐条跑通

`render.yaml` 里的命令不是照文档抄的，而是本地按同样的方式执行过：

| 命令 | 结果 |
| --- | --- |
| `pnpm install --frozen-lockfile` | ✅ 成功（锁文件与 package.json 一致） |
| `pnpm build` | ✅ 成功（26 个路由） |
| `PORT=3105 pnpm start` | ✅ 听从 PORT —— Render 就是用这个变量指定端口的，应用不听会报"找不到端口" |
| `GET /api/health` | ✅ 200（这就是 healthCheckPath） |
| `GET /login` | ✅ 200 |
| `POST /supabase/auth/v1/token`（不带令牌） | ✅ 403（转发器守门有效） |

### 部署后的冒烟检查（对着真实网址跑）

```bash
node dev/verify-deployed.mjs https://你的应用.onrender.com
# 想连登录后的页面一起查，就带上账号：
E2E_USER_EMAIL=你的邮箱 E2E_USER_PASSWORD=密码 node dev/verify-deployed.mjs https://你的应用.onrender.com
```

它会检查：登录页可访问（并报告是否处于冷启动）、未登录访问 `/today` `/discussions` `/letters` `/notifications` `/export`
都会被拦回登录页、转发器拒绝不带令牌的请求；带账号时再逐个页面确认渲染正常且控制台无报错。
这就是上面「第四步」清单的自动化版本——先跑它，再按清单手工过一遍手机流量那几条。

### 可选：避免冷启动

`render.yaml` 同目录的 `.github/workflows/keep-alive.yml` 会在北京时间 07:00–24:00 每 10 分钟
ping 一次登录页，把实例保持在唤醒状态。代价与限制都写在文件顶部注释里（约 540 小时/月，
免费额度是 750；GitHub 定时任务在仓库 60 天无活动后会被停用）。不需要就直接删掉该文件。

### 常见故障

| 现象 | 原因与处理 |
| --- | --- |
| 构建失败，提示找不到 pnpm | `buildCommand` 已有 npm 兜底；若仍失败，把 `NPM_CONFIG_PRODUCTION` 之类环境变量清掉重试 |
| 构建失败，锁文件与 pnpm 版本不匹配 | `--frozen-lockfile` 失败会自动退回普通 `pnpm install` |
| 部署成功但一直跳登录页 | `SUPABASE_URL` 与 `NEXT_PUBLIC_SUPABASE_URL` 必须都是 `https://<你的域名>/supabase`，且与 Render 实际域名一致（服务名决定域名） |
| 页面能开但读不到数据 | 检查 `SUPABASE_UPSTREAM_URL` 是否是你的 `https://<项目>.supabase.co`，以及 `NEXT_PUBLIC_SUPABASE_ANON_KEY` 是否填了 |
| 写入时报 `reply_to_id` 不存在 | 生产库还没执行 `202608150001_letter_reply.sql` |
| 服务名被占用 | Render 的域名必须全局唯一，改名后同步改 `render.yaml` 里两处 URL |
