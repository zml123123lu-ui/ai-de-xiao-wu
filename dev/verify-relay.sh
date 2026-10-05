#!/usr/bin/env bash
# 验证「应用自带 Supabase 转发器」这条零成本部署路径。
# 关键手法：把直连地址故意设成不存在的端口（59999）。如果各项检查仍然通过，
# 就证明所有数据库流量确实只走了应用自己的 /supabase，没有偷偷直连。
# 前置：假后端已在 54321 运行、应用已构建（verify-all.sh 会准备好）。
set -uo pipefail
cd "$(dirname "$0")/.."
PORT="${PORT:-3102}"
export NEXT_TELEMETRY_DISABLED=1
export NEXT_PUBLIC_SUPABASE_ANON_KEY=mock-anon-key
export NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:59999          # 故意不可用
export SUPABASE_URL="http://127.0.0.1:${PORT}/supabase"          # 走自己的转发器
export SUPABASE_UPSTREAM_URL=http://127.0.0.1:54321
export SUPABASE_RELAY_TOKEN=relay-check-token
BASE="http://127.0.0.1:${PORT}"
FAIL=0

./node_modules/.bin/next start -p "$PORT" > /tmp/dsh-relay.log 2>&1 & APP=$!
trap 'kill $APP 2>/dev/null' EXIT
for _ in $(seq 1 40); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' -m 3 "$BASE/login")" = "200" ] && break
  sleep 1
done

# 转发器本身的边界
status_with_token=$(curl -s -o /dev/null -w '%{http_code}' -m 8 -X POST "$BASE/supabase/auth/v1/token?grant_type=password" \
  -H "content-type: application/json" -H "x-relay-token: relay-check-token" -H "apikey: mock-anon-key" \
  -d '{"email":"alan@demo.local","password":"demo-password-123"}')
status_without_token=$(curl -s -o /dev/null -w '%{http_code}' -m 8 -X POST "$BASE/supabase/auth/v1/token" -H "content-type: application/json" -d '{}')
status_other=$(curl -s -o /dev/null -w '%{http_code}' -m 8 "$BASE/supabase/other/v1/x")
[ "$status_with_token" = "200" ] && echo "✓ 转发器放行（带令牌）" || { echo "✗ 转发器未放行：HTTP $status_with_token"; FAIL=1; }
[ "$status_without_token" = "403" ] && echo "✓ 缺少令牌被拒" || { echo "✗ 无令牌未被拒：HTTP $status_without_token"; FAIL=1; }
[ "$status_other" = "404" ] && echo "✓ 白名单外的路径被拒" || { echo "✗ 白名单未生效：HTTP $status_other"; FAIL=1; }

# 在「直连不可用」的前提下跑真实流程
for script in verify-reply verify-export verify-badges verify-realtime verify-session; do
  if BASE_URL="$BASE" MOCK_URL=http://127.0.0.1:54321 node "dev/${script}.mjs" > "/tmp/dsh-relay-${script}.log" 2>&1; then
    echo "✓ 转发器模式下 ${script} 通过"
  else
    echo "✗ 转发器模式下 ${script} 失败"; tail -4 "/tmp/dsh-relay-${script}.log"; FAIL=1
  fi
done
[ "$FAIL" = "0" ] && echo "✅ 零成本部署路径（自带转发器）验证通过" || echo "❌ 转发器路径有问题"
exit $FAIL
