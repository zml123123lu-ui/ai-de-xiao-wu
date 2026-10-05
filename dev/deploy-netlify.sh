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

# 1) 建站点：创建时就带上仓库关联（比先建站再 PATCH 更可靠）
ACCOUNT_ID=$(curl -sS -m 25 "${AUTH[@]}" "$API/accounts" | python3 -c "import json,sys; print(json.load(sys.stdin)[0]['id'])")
echo "  账号 ID: $ACCOUNT_ID"

SITE_ID=$(curl -sS -m 25 "${AUTH[@]}" "$API/sites?name=$SITE_NAME" | python3 -c "
import json,sys
data=json.load(sys.stdin)
print(data[0]['id'] if isinstance(data, list) and data else '')
")
if [ -z "$SITE_ID" ]; then
  python3 - "$SITE_NAME" "zml123123lu-ui/ai-de-xiao-wu" <<'PYJSON' > /tmp/nf-create.json
import json, sys
name, slug = sys.argv[1], sys.argv[2]
json.dump({
    "name": name,
    "repo": {"provider": "github", "repo": slug, "branch": "main", "private": False},
    "build_settings": {"cmd": "pnpm build", "dir": ""},
}, open("/tmp/nf-create.json", "w"))
PYJSON
  RESP=$(curl -sS -m 60 -X POST "${AUTH[@]}" -H "Content-Type: application/json" --data @/tmp/nf-create.json "$API/sites")
  SITE_ID=$(echo "$RESP" | python3 -c "
import json,sys
raw=sys.stdin.read()
try: d=json.loads(raw)
except Exception: print(''); raise SystemExit
if d.get('message'): import sys as s; print('', end=''); s.stderr.write('  建站报错: ' + str(d.get('message')) + '\n')
print(d.get('id',''))
")
  rm -f /tmp/nf-create.json
fi
[ -n "$SITE_ID" ] || { echo "❌ 建站失败"; exit 1; }
echo "✓ 站点 ID: $SITE_ID"

# 2) 环境变量：Netlify 的接口要的是**数组**（每项 key + values[{value, context}]）
python3 - "$SITE_URL" "$SUPA_KEY" "$SUPA_URL" "$RELAY_TOKEN" <<'PYJSON' > /tmp/nf-env.json
import json, sys
site, key, upstream, token = sys.argv[1:5]
vars_ = [
    ("NODE_VERSION", "20.19.0"),
    ("NEXT_PUBLIC_SUPABASE_URL", f"{site}/supabase"),
    ("SUPABASE_URL", f"{site}/supabase"),
    ("NEXT_PUBLIC_SUPABASE_ANON_KEY", key),
    ("SUPABASE_UPSTREAM_URL", upstream),
    ("SUPABASE_RELAY_TOKEN", token),
]
json.dump([{"key": k, "values": [{"value": v, "context": "all"}]} for k, v in vars_], open("/tmp/nf-env.json", "w"))
PYJSON
code=$(curl -sS -m 40 -o /tmp/nf-env-out.json -w "%{http_code}" -X POST "${AUTH[@]}" -H "Content-Type: application/json" \
  --data @/tmp/nf-env.json "$API/accounts/$ACCOUNT_ID/env?site_id=$SITE_ID")
if [ "$code" = "200" ] || [ "$code" = "201" ]; then
  echo "✓ 六个环境变量已设置"
else
  echo "⚠ 环境变量提交返回 HTTP $code，响应："; head -c 300 /tmp/nf-env-out.json; echo
fi
rm -f /tmp/nf-env.json /tmp/nf-env-out.json

# 3) 触发一次构建（若站点是刚建的，Netlify 通常已经自动开始；这里兜底再触发一次）
curl -sS -m 30 -X POST "${AUTH[@]}" -H "Content-Type: application/json" -d '{}' "$API/sites/$SITE_ID/builds" > /tmp/nf-build.json 2>&1
python3 -c "
import json
try: d=json.load(open('/tmp/nf-build.json'))
except Exception: print('  （构建触发返回无法解析，通常不影响）'); raise SystemExit
print('  构建 ID:', d.get('id',''), ' 状态:', d.get('state',''))
" 2>/dev/null
rm -f /tmp/nf-build.json

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
