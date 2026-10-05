#!/usr/bin/env bash
# 第 1 步：把本地仓库推到 GitHub。
# 用法：bash dev/push-to-github.sh https://github.com/<你的用户名>/<仓库名>.git
# 先在 GitHub 网页建一个**空仓库**（不要勾选 README / .gitignore / license），再来跑这个。
set -uo pipefail
cd "$(dirname "$0")/.."

URL="${1:-}"
if [ -z "$URL" ]; then
  echo "用法: bash dev/push-to-github.sh https://github.com/<用户名>/<仓库名>.git"
  echo "（先在 GitHub 建一个空仓库，然后把地址填在这里）"
  exit 1
fi

# 安全闸：确认密钥不会被推上去
if git ls-files --error-unmatch .env.local >/dev/null 2>&1; then
  echo "❌ .env.local 被 git 跟踪了，先执行：git rm --cached .env.local"
  exit 1
fi
echo "✓ 已确认 .env.local 没有被跟踪（密钥不会上传）"

if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "$URL"
  echo "✓ 已更新 origin"
else
  git remote add origin "$URL"
  echo "✓ 已添加 origin"
fi

echo "→ 推送 $(git rev-list --count HEAD) 个提交、分支 $(git branch --show-current)"
git push -u origin HEAD || { echo "❌ 推送失败：检查仓库地址、是否已在网页建好空仓库、以及登录状态"; exit 1; }

cat <<'NEXT'

✅ 推送完成。接下来四步：

  1) 打开 https://dashboard.render.com → New → Blueprint → 选中刚推的仓库
     （根目录的 render.yaml 会告诉 Render 怎么建；注意 region 已写死 singapore，
       若免费实例不支持该区域、创建时报错，删掉那一行用默认 oregon 再建）

  2) 在服务控制台补两个值：
       NEXT_PUBLIC_SUPABASE_ANON_KEY  = Supabase 项目的 anon key
       SUPABASE_UPSTREAM_URL          = https://<你的项目>.supabase.co
     若服务名不是 ai-de-xiao-wu，把 render.yaml 里两处 .../supabase 的域名一起改掉

  3) 生产库按顺序执行三个迁移，尤其 202608150001_letter_reply.sql

  4) 验收：node dev/verify-deployed.mjs https://<你的服务名>.onrender.com
     把输出贴给我，红了我去修
NEXT
