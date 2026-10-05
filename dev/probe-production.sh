#!/usr/bin/env bash
# 透过应用自带的转发器探测生产库结构——用来判断三个迁移各自是否已执行。
# 不需要 Supabase 令牌，也不需要用户的登录密码。
#
# 原理：PostgREST 在解析 select 的列名时就校验列是否存在，
# 所以"列不存在"会返回 400，而 RLS 拦下的是 401/空数组——两者能区分开。
#
# 用法：bash dev/probe-production.sh https://<应用域名> [relay-token] [anon-key]
set -uo pipefail
cd "$(dirname "$0")/.."
BASE="${1:?用法: bash dev/probe-production.sh https://<应用域名> [relay-token] [anon-key]}"
BASE="${BASE%/}"
RELAY_TOKEN="${2:-${SUPABASE_RELAY_TOKEN:-}}"
ANON="${3:-}"
if [ -z "$ANON" ] && [ -f .env.local ]; then
  ANON=$(grep -E "^NEXT_PUBLIC_SUPABASE_ANON_KEY=" .env.local | head -1 | cut -d= -f2- | tr -d '"'"'"' ')
fi
[ -n "$ANON" ] || { echo "❌ 需要 anon key（第三个参数或 .env.local 里的 NEXT_PUBLIC_SUPABASE_ANON_KEY）"; exit 1; }

headers=(-H "apikey: $ANON" -H "Authorization: Bearer $ANON")
[ -n "$RELAY_TOKEN" ] && headers+=(-H "x-relay-token: $RELAY_TOKEN")

probe() {  # $1=路径 $2=说明
  local out code
  out=$(curl -sS -m 20 -o /tmp/probe-body.json -w "%{http_code}" "${headers[@]}" "$BASE/supabase/rest/v1/$1" 2>/dev/null)
  code="$out"
  local body; body=$(head -c 400 /tmp/probe-body.json 2>/dev/null | tr -d '\n')
  # 被 Netlify 的访问保护（Edge Access）挡住时也会返回 401，但那是登录页而不是数据库应答，
  # 必须识别出来——否则会把"站点被保护"误报成"表存在"（这次就被骗过一次）。
  if echo "$body" | grep -qi "edge-access\|Login Redirect"; then
    echo "  ✗ $2 —— 站点被 Netlify 访问保护挡住，测不到数据库（关闭站点级 sso_login 后重试）"
    return 1
  fi
  if [ "$code" = "400" ] && echo "$body" | grep -q "does not exist"; then
    echo "  ✗ $2 —— 列/表不存在：$(echo "$body" | grep -oE 'column [a-z_.]+ does not exist|relation \"[a-z_.]+\" does not exist' | head -1)"
    return 1
  elif [ "$code" = "404" ]; then
    echo "  ✗ $2 —— 表不存在（HTTP 404）"
    return 1
  elif [ "$code" = "401" ] || [ "$code" = "403" ] || [ "$code" = "200" ]; then
    echo "  ✓ $2（HTTP $code${code:+=已存在，数据受 RLS 保护}）"
    return 0
  else
    echo "  ? $2 —— HTTP $code  $body"
    return 0
  fi
}

echo "=== 转发器是否通 ==="
code=$(curl -sS -m 20 -o /dev/null -w "%{http_code}" "${headers[@]}" "$BASE/supabase/rest/v1/profiles?select=id&limit=1" 2>/dev/null)
case "$code" in
  200|401|403) echo "  ✓ 转发器可达（HTTP $code）";;
  502|503|504) echo "  ✗ 转发器 5xx（$code）——多半是 SUPABASE_UPSTREAM_URL 配错或 Render 还没起来";;
  *) echo "  ? HTTP $code";;
esac

echo "=== 迁移 1：初始表结构 ==="
for table in profiles letters discussions discussion_replies daily_statuses notifications; do
  probe "$table?select=id&limit=1" "$table 表"
done

echo "=== 迁移 3：信内回信 ==="
probe "letters?select=id,reply_to_id&limit=1" "letters.reply_to_id 列"

echo "=== 迁移 2：通知触发器修正 ==="
echo "  · 触发器函数无法用 REST 探测，需要实际发一封信看通知是否正常（或直接比对函数定义）"
