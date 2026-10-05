#!/usr/bin/env bash
# 用 Render API 建好服务并等它上线，最后跑冒烟检查。
#
# 用法：
#   RENDER_API_KEY=rnd_xxx bash dev/deploy-render.sh --dry-run   # 只看会提交什么（密钥打码）
#   RENDER_API_KEY=rnd_xxx bash dev/deploy-render.sh             # 真的建服务
#
# 说明：Render 上没有 Blueprint 的官方 API，所以这里按 render.yaml 的等价配置
# 直接建一个 web_service。区域、计划、构建/启动命令都与 render.yaml 一致。
set -uo pipefail
cd "$(dirname "$0")/.."

REPO_URL="${REPO_URL:-https://github.com/zml123123lu-ui/ai-de-xiao-wu}"
SERVICE_NAME="${SERVICE_NAME:-ai-de-xiao-wu}"
BRANCH="${BRANCH:-main}"
DRY_RUN=""
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1

[ -n "${RENDER_API_KEY:-}" ] || { echo "❌ 需要 RENDER_API_KEY（Render 控制台 → Account Settings → API Keys）"; exit 1; }
[ -f .env.local ] || { echo "❌ 找不到 .env.local（要从里面读 Supabase 地址与 anon key）"; exit 1; }

read_env() { grep -E "^$1=" .env.local | head -1 | cut -d= -f2- | tr -d '"'"'"' '; }
SUPA_URL=$(read_env SUPABASE_URL); [ -n "$SUPA_URL" ] || SUPA_URL=$(read_env NEXT_PUBLIC_SUPABASE_URL)
SUPA_KEY=$(read_env NEXT_PUBLIC_SUPABASE_ANON_KEY)
[ -n "$SUPA_URL" ] && [ -n "$SUPA_KEY" ] || { echo "❌ .env.local 里缺少 Supabase 地址或 anon key"; exit 1; }
RELAY_TOKEN="${SUPABASE_RELAY_TOKEN:-$(openssl rand -hex 24)}"

echo "  服务名: $SERVICE_NAME   仓库: $REPO_URL   分支: $BRANCH"
echo "  上游 Supabase: $SUPA_URL"
echo "  anon key: ${SUPA_KEY:0:12}…（共 ${#SUPA_KEY} 字符）"
echo "  转发器令牌: ${RELAY_TOKEN:0:8}…（本地生成，仅存在于 Render 环境变量）"

if [ -n "$DRY_RUN" ]; then
  echo; echo "=== --dry-run：会向 Render 提交下面这些环境变量（值已打码）==="
  cat <<EOF
  NODE_VERSION=20.19.0
  NEXT_PUBLIC_SUPABASE_URL=https://${SERVICE_NAME}.onrender.com/supabase
  SUPABASE_URL=https://${SERVICE_NAME}.onrender.com/supabase
  NEXT_PUBLIC_SUPABASE_ANON_KEY=${SUPA_KEY:0:12}…（打码）
  SUPABASE_UPSTREAM_URL=${SUPA_URL}
  SUPABASE_RELAY_TOKEN=${RELAY_TOKEN:0:8}…（打码）
  --- 其他 ---
  type=web_service  plan=free  region=singapore  healthCheckPath=/api/health
  buildCommand=（render.yaml 里那条带兜底的命令）
  startCommand=pnpm start
EOF
  echo; echo "（dry-run 结束，没有真的创建服务）"
  exit 0
fi

OWNER_ID=$(curl -sS -m 30 -H "Authorization: Bearer $RENDER_API_KEY" https://api.render.com/v1/owners \
  | python3 -c "import json,sys; data=json.load(sys.stdin); print(data[0]['owner']['id'] if data else '')")
[ -n "$OWNER_ID" ] || { echo "❌ 拿不到工作区 ID（检查 RENDER_API_KEY 是否有效）"; exit 1; }
echo "  工作区 ID: $OWNER_ID"

python3 - "$OWNER_ID" "$SERVICE_NAME" "$REPO_URL" "$BRANCH" "$SUPA_KEY" "$SUPA_URL" "$RELAY_TOKEN" <<'PY' > /tmp/render-service.json
import json, sys
owner, name, repo, branch, key, upstream, token = sys.argv[1:8]
build = '(corepack enable || true) && (pnpm --version >/dev/null 2>&1 || npm i -g pnpm) && (pnpm install --frozen-lockfile || pnpm install) && pnpm build'
json.dump({
    "type": "web_service",
    "name": name,
    "ownerId": owner,
    "repo": repo,
    "branch": branch,
    "autoDeployTrigger": "commit",
    "serviceDetails": {
        "env": "node",
        "plan": "free",
        "region": "singapore",
        "healthCheckPath": "/api/health",
        "envSpecificDetails": {"buildCommand": build, "startCommand": "pnpm start"},
        "envVars": [
            {"key": "NODE_VERSION", "value": "20.19.0"},
            {"key": "NEXT_PUBLIC_SUPABASE_URL", "value": f"https://{name}.onrender.com/supabase"},
            {"key": "SUPABASE_URL", "value": f"https://{name}.onrender.com/supabase"},
            {"key": "NEXT_PUBLIC_SUPABASE_ANON_KEY", "value": key},
            {"key": "SUPABASE_UPSTREAM_URL", "value": upstream},
            {"key": "SUPABASE_RELAY_TOKEN", "value": token},
        ],
    },
}, open("/tmp/render-service.json", "w"), ensure_ascii=False)
PY

echo "=== 创建服务 ==="
RESPONSE=$(curl -sS -m 60 -X POST https://api.render.com/v1/services \
  -H "Authorization: Bearer $RENDER_API_KEY" -H "Content-Type: application/json" \
  --data @/tmp/render-service.json)
SERVICE_ID=$(echo "$RESPONSE" | python3 -c "import json,sys; d=json.load(sys.stdin); print((d.get('service') or {}).get('id',''))" 2>/dev/null)
if [ -z "$SERVICE_ID" ]; then
  echo "❌ 创建失败，Render 的返回："; echo "$RESPONSE" | head -c 800; echo; rm -f /tmp/render-service.json; exit 1
fi
rm -f /tmp/render-service.json
echo "✓ 服务已创建：$SERVICE_ID"
echo "  地址：https://${SERVICE_NAME}.onrender.com"

echo "=== 等待上线（首次构建通常 3-6 分钟）==="
for i in $(seq 1 60); do
  sleep 20
  code=$(curl -sS -o /dev/null -m 20 -w "%{http_code}" "https://${SERVICE_NAME}.onrender.com/api/health" 2>/dev/null)
  printf "  [%02d] %s /api/health → %s\n" "$i" "$(date +%H:%M:%S)" "$code"
  [ "$code" = "200" ] && { echo "✅ 已上线"; break; }
done

echo; echo "=== 冒烟检查 ==="
node dev/verify-deployed.mjs "https://${SERVICE_NAME}.onrender.com" || true
echo
echo "如果登录后才发现读不到数据，多半是生产库还缺迁移——见 docs/上线速查.md 第 4 步。"
