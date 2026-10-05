#!/usr/bin/env bash
# 用 Netlify API 建站点、配好环境变量并触发部署。
#
# 与 Render 方案的差别：Netlify 免费层不要信用卡，且没有 15 分钟休眠
# （函数冷启动约 1 秒），对"随时打开就能用"这件事更合适。
#
# 用法：
#   NETLIFY_AUTH_TOKEN=xxx bash dev/deploy-netlify.sh --dry-run   # 只看会提交什么
#   NETLIFY_AUTH_TOKEN=xxx bash dev/deploy-netlify.sh             # 真的建站并部署
set -uo pipefail
cd "$(dirname "$0")/.."

SITE_NAME="${SITE_NAME:-ai-de-xiao-wu}"
REPO_URL="${REPO_URL:-https://github.com/zml123123lu-ui/ai-de-xiao-wu}"
DRY_RUN=""
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1

[ -n "${NETLIFY_AUTH_TOKEN:-}" ] || { echo "❌ 需要 NETLIFY_AUTH_TOKEN（Netlify → User settings → Applications → Personal access tokens）"; exit 1; }
[ -f .env.local ] || { echo "❌ 找不到 .env.local"; exit 1; }
API="https://api.netlify.com/api/v1"
AUTH=(-H "Authorization: Bearer $NETLIFY_AUTH_TOKEN")

read_env() { grep -E "^$1=" .env.local | head -1 | cut -d= -f2- | tr -d '"'"'"' '; }
SUPA_URL=$(read_env SUPABASE_URL); [ -n "$SUPA_URL" ] || SUPA_URL=$(read_env NEXT_PUBLIC_SUPABASE_URL)
SUPA_KEY=$(read_env NEXT_PUBLIC_SUPABASE_ANON_KEY)
RELAY_TOKEN="${SUPABASE_RELAY_TOKEN:-$(openssl rand -hex 24)}"
SITE_URL="https://${SITE_NAME}.netlify.app"

echo "  站点名: $SITE_NAME   地址: $SITE_URL"
echo "  仓库: $REPO_URL"
echo "  上游 Supabase: $SUPA_URL"
echo "  转发器令牌: ${RELAY_TOKEN:0:8}…（本地生成）"

if [ -n "$DRY_RUN" ]; then
  cat <<EOF

=== --dry-run：会设置这些环境变量（值打码）===
  NODE_VERSION=20.19.0
  NEXT_PUBLIC_SUPABASE_URL=${SITE_URL}/supabase
  SUPABASE_URL=${SITE_URL}/supabase
  NEXT_PUBLIC_SUPABASE_ANON_KEY=${SUPA_KEY:0:12}…（打码）
  SUPABASE_UPSTREAM_URL=${SUPA_URL}
  SUPABASE_RELAY_TOKEN=${RELAY_TOKEN:0:8}…（打码）
=== 其他 ===
  构建: pnpm build（netlify.toml）  Next 运行时: @netlify/plugin-nextjs
  发布目录: .next
（dry-run 结束，没有真的建站）
EOF
  exit 0
fi

# 1) 建站点（若已存在则复用）
SITE_ID=$(curl -sS -m 40 "${AUTH[@]}" "$API/sites?name=$SITE_NAME" | python3 -c "
import json,sys
try: d=json.load(sys.stdin)
except Exception: print(''); raise SystemExit
print(d[0]['id'] if isinstance(d, list) and d else (d.get('id') or ''))
")
if [ -z "$SITE_ID" ]; then
  SITE_ID=$(curl -sS -m 40 -X POST "${AUTH[@]}" -H "Content-Type: application/json" \
    -d "{\"name\":\"$SITE_NAME\"}" "$API/sites" | python3 -c "
import json,sys
d=json.load(sys.stdin); print(d.get('id',''))
")
fi
[ -n "$SITE_ID" ] || { echo "❌ 建站失败（站点名可能被占用，试试 SITE_NAME=别的名字）"; exit 1; }
echo "✓ 站点 ID: $SITE_ID"

# 2) 环境变量
for pair in "NODE_VERSION=20.19.0" "NEXT_PUBLIC_SUPABASE_URL=${SITE_URL}/supabase" "SUPABASE_URL=${SITE_URL}/supabase" \
            "NEXT_PUBLIC_SUPABASE_ANON_KEY=${SUPA_KEY}" "SUPABASE_UPSTREAM_URL=${SUPA_URL}" "SUPABASE_RELAY_TOKEN=${RELAY_TOKEN}"; do
  key="${pair%%=*}"; value="${pair#*=}"
  python3 -c "import json,sys; print(json.dumps({'key': sys.argv[1], 'values': [{'value': sys.argv[2], 'context': 'all'}]}))" "$key" "$value" > /tmp/nf-env.json
  code=$(curl -sS -m 30 -o /tmp/nf-env-out.json -w "%{http_code}" -X POST "${AUTH[@]}" -H "Content-Type: application/json" \
    --data @/tmp/nf-env.json "$API/accounts/$(curl -sS -m 20 "${AUTH[@]}" "$API/accounts" | python3 -c "import json,sys; print(json.load(sys.stdin)[0]['id'])")/env?site_id=$SITE_ID")
  [ "$code" = "200" ] || [ "$code" = "201" ] && echo "  ✓ $key" || { echo "  ✗ $key（HTTP $code）"; head -c 200 /tmp/nf-env-out.json; echo; }
done
rm -f /tmp/nf-env.json /tmp/nf-env-out.json

# 3) 关联仓库并触发部署
# 注意：repo.dir 是"基准目录"（monorepo 用），不是发布目录。
# 发布目录交给 Netlify 的 Next.js 零配置检测，避免写错反而构建失败。
python3 -c "
import json,sys
json.dump({
    'repo': {'provider': 'github', 'repo': sys.argv[1], 'branch': 'main', 'private': False},
    'build_settings': {'cmd': 'pnpm build', 'dir': ''},
}, open('/tmp/nf-site.json','w'))
" "zml123123lu-ui/ai-de-xiao-wu"
curl -sS -m 40 -X PATCH "${AUTH[@]}" -H "Content-Type: application/json" --data @/tmp/nf-site.json "$API/sites/$SITE_ID" > /dev/null
rm -f /tmp/nf-site.json
echo "✓ 已关联仓库并触发部署（Netlify 侧开始构建）"

echo
echo "=== 等待上线（首次构建约 2-4 分钟）==="
for i in $(seq 1 40); do
  sleep 15
  code=$(curl -sS -o /dev/null -m 20 -w "%{http_code}" "$SITE_URL/api/health" 2>/dev/null)
  printf "  [%02d] %s /api/health → %s\n" "$i" "$(date +%H:%M:%S)" "$code"
  [ "$code" = "200" ] && { echo "✅ 已上线：$SITE_URL"; break; }
done
echo; echo "=== 冒烟检查 ==="
node dev/verify-deployed.mjs "$SITE_URL" || true
