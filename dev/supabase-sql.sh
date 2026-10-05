#!/usr/bin/env bash
# 通过 Supabase 管理 API 检查/执行 SQL（用来确认并补齐数据库迁移）。
#
# 为什么需要它：这台网络连不上 *.supabase.co（数据库直连域名被阻断），
# 但 api.supabase.com 可达，所以管理 API 是唯一能从这里操作生产库的通道。
#
# 用法：
#   SUPABASE_ACCESS_TOKEN=sbp_xxx bash dev/supabase-sql.sh --status
#   SUPABASE_ACCESS_TOKEN=sbp_xxx bash dev/supabase-sql.sh supabase/migrations/202608150001_letter_reply.sql
set -uo pipefail
cd "$(dirname "$0")/.."
PROJECT_REF="${PROJECT_REF:-cnokkzsvbikkmcgbtfis}"
API="https://api.supabase.com/v1/projects/$PROJECT_REF/database/query"

[ -n "${SUPABASE_ACCESS_TOKEN:-}" ] || { echo "❌ 需要 SUPABASE_ACCESS_TOKEN（supabase.com/dashboard/account/tokens）"; exit 1; }

run_sql() {
  python3 -c 'import json,sys; print(json.dumps({"query": sys.argv[1]}))' "$1" > /tmp/supa-query.json
  curl -sS -m 60 -X POST "$API" \
    -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
    -H "Content-Type: application/json" --data @/tmp/supa-query.json
  rm -f /tmp/supa-query.json
}

if [ "${1:-}" = "--status" ]; then
  echo "=== 公共表 ==="
  run_sql "select table_name from information_schema.tables where table_schema='public' order by 1" | python3 -c "
import json,sys
try: rows=json.load(sys.stdin)
except Exception: print('  （无法解析，可能是权限或令牌问题）'); raise SystemExit
for r in rows: print('  ', r.get('table_name'))
" 2>/dev/null
  echo "=== letters 表的列（有 reply_to_id 就说明第三个迁移已执行）==="
  run_sql "select column_name from information_schema.columns where table_schema='public' and table_name='letters' order by 1" | python3 -c "
import json,sys
try: rows=json.load(sys.stdin)
except Exception: print('  （无法解析）'); raise SystemExit
print('  ', ', '.join(r.get('column_name','') for r in rows))
" 2>/dev/null
  echo "=== 相关函数 ==="
  run_sql "select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' order by 1" | python3 -c "
import json,sys
try: rows=json.load(sys.stdin)
except Exception: print('  （无法解析）'); raise SystemExit
print('  ', ', '.join(r.get('proname','') for r in rows))
" 2>/dev/null
  exit 0
fi

FILE="${1:-}"
[ -f "$FILE" ] || { echo "用法: bash dev/supabase-sql.sh --status | <某个 .sql 文件>"; exit 1; }
echo "=== 执行 $FILE ==="
SQL=$(cat "$FILE")
RESULT=$(run_sql "$SQL")
if echo "$RESULT" | head -c 200 | grep -qiE '"message"|error'; then
  echo "❌ 执行报错："; echo "$RESULT" | head -c 600; echo; exit 1
fi
echo "✓ 执行成功（返回 $(echo "$RESULT" | wc -c | tr -d ' ') 字节）"
