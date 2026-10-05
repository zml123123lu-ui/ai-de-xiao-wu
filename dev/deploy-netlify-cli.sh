#!/usr/bin/env bash
# 更新线上站点（Netlify）。这是**实际可用**的部署方式。
#
# 为什么不用 Git 集成：Netlify 的 Git 集成需要先授权它的 GitHub App；
# 用 API 直接建站时没有这一步，构建会在 "preparing repo" 阶段失败（Host key verification failed）。
# 所以改成：本地构建（Netlify 的 Next.js 运行时会把产物打包成 Functions）+ CLI 直传。
#
# 用法：NETLIFY_AUTH_TOKEN=xxx bash dev/deploy-netlify-cli.sh
# 前置：netlify CLI（npm i -g netlify-cli --registry=https://registry.npmmirror.com）
set -euo pipefail
cd "$(dirname "$0")/.."
SITE_ID="${SITE_ID:-707a426b-381d-4129-a9e5-503cac4c987a}"
SITE_URL="${SITE_URL:-https://ai-de-xiao-wu.netlify.app}"

[ -n "${NETLIFY_AUTH_TOKEN:-}" ] || { echo "❌ 需要 NETLIFY_AUTH_TOKEN"; exit 1; }
[ -f .env.local ] || { echo "❌ 找不到 .env.local"; exit 1; }
command -v netlify >/dev/null || { echo "❌ 没装 netlify CLI：npm i -g netlify-cli --registry=https://registry.npmmirror.com"; exit 1; }

read_env() { grep -E "^$1=" .env.local | head -1 | cut -d= -f2- | tr -d '"'"'"' '; }
# NEXT_PUBLIC_* 会在构建时被内联，所以构建环境必须有正确值
export NEXT_PUBLIC_SUPABASE_URL="${SITE_URL}/supabase"
export SUPABASE_URL="${SITE_URL}/supabase"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="$(read_env NEXT_PUBLIC_SUPABASE_ANON_KEY)"
export SUPABASE_UPSTREAM_URL="$(read_env NEXT_PUBLIC_SUPABASE_URL)"
export SUPABASE_RELAY_TOKEN="${SUPABASE_RELAY_TOKEN:-$(cat /tmp/.relay-token 2>/dev/null || openssl rand -hex 24)}"
export NEXT_TELEMETRY_DISABLED=1
# 插件要从官方 registry 装（国内镜像常常落后一两个小版本）
export npm_config_registry=https://registry.npmjs.org

echo "  站点: $SITE_URL"
echo "  上游 Supabase: $SUPABASE_UPSTREAM_URL"
netlify deploy --build --prod --site "$SITE_ID"
echo
echo "=== 冒烟检查 ==="
node dev/verify-deployed.mjs "$SITE_URL" || true
