#!/usr/bin/env bash
# 一键验证套件：假后端 + 生产构建 + 生产服务，然后跑水合/免刷新/截图/布局四项检查。
# 用途：每次改动后确认"能构建、能水合、能免刷新、没溢出"。
set -uo pipefail
cd "$(dirname "$0")/.."
export NEXT_TELEMETRY_DISABLED=1
export NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
export NEXT_PUBLIC_SUPABASE_ANON_KEY=mock-anon-key
PORT="${PORT:-3101}"
BASE="http://127.0.0.1:${PORT}"
FAIL=0

node dev/mock-supabase.mjs > /tmp/dsh-mock.log 2>&1 & MOCK=$!
./node_modules/.bin/next build > /tmp/dsh-build.log 2>&1 || { echo "❌ 构建失败"; tail -20 /tmp/dsh-build.log; kill $MOCK 2>/dev/null; exit 1; }
echo "✅ 构建通过"
./node_modules/.bin/next start -p "$PORT" > /tmp/dsh-start.log 2>&1 & APP=$!
trap 'kill $MOCK $APP 2>/dev/null' EXIT
for _ in $(seq 1 40); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' -m 3 "$BASE/login")" = "200" ] && break
  sleep 1
done

echo; echo "—— 1/23 水合与控制台 ——"
BASE_URL="$BASE" node dev/check-hydration.mjs "$BASE" || FAIL=1
echo; echo "—— 2/23 免刷新 ——"
BASE_URL="$BASE" MOCK_URL=http://127.0.0.1:54321 node dev/verify-realtime.mjs || FAIL=1
echo; echo "—— 3/23 信内回信 ——"
BASE_URL="$BASE" MOCK_URL=http://127.0.0.1:54321 node dev/verify-reply.mjs || FAIL=1
echo; echo "—— 4/23 搜索 ——"
BASE_URL="$BASE" MOCK_URL=http://127.0.0.1:54321 node dev/verify-search.mjs || FAIL=1
echo; echo "—— 5/23 表单提交后的跳转 ——"
BASE_URL="$BASE" MOCK_URL=http://127.0.0.1:54321 node dev/verify-save.mjs || FAIL=1
echo; echo "—— 6/23 导出备份 ——"
BASE_URL="$BASE" MOCK_URL=http://127.0.0.1:54321 node dev/verify-export.mjs || FAIL=1
echo; echo "—— 7/23 月历回顾 ——"
BASE_URL="$BASE" MOCK_URL=http://127.0.0.1:54321 node dev/verify-review.mjs || FAIL=1
echo; echo "—— 8/23 列表分页 ——"
BASE_URL="$BASE" MOCK_URL=http://127.0.0.1:54321 node dev/verify-lists.mjs || FAIL=1
echo; echo "—— 9/23 问题讨论写入流程 ——"
BASE_URL="$BASE" MOCK_URL=http://127.0.0.1:54321 node dev/verify-discussions.mjs | tail -3 || FAIL=1
echo; echo "—— 10/23 未读徽标一致性 ——"
BASE_URL="$BASE" MOCK_URL=http://127.0.0.1:54321 node dev/verify-badges.mjs || FAIL=1
echo; echo "—— 11/23 会话续期与退出登录 ——"
BASE_URL="$BASE" MOCK_URL=http://127.0.0.1:54321 node dev/verify-session.mjs | tail -3 || FAIL=1
echo; echo "—— 12/23 账号与权限边界 ——"
BASE_URL="$BASE" node dev/verify-auth.mjs | tail -3 || FAIL=1
echo; echo "—— 13/23 每日状态流程 ——"
BASE_URL="$BASE" MOCK_URL=http://127.0.0.1:54321 node dev/verify-daily.mjs | tail -3 || FAIL=1
echo; echo "—— 14/23 通知中心 ——"
BASE_URL="$BASE" MOCK_URL=http://127.0.0.1:54321 node dev/verify-notifications.mjs | tail -3 || FAIL=1
echo; echo "—— 15/23 输入边界与异常路径 ——"
BASE_URL="$BASE" MOCK_URL=http://127.0.0.1:54321 node dev/verify-edge.mjs | tail -3 || FAIL=1
echo; echo "—— 16/23 配色对比度（token）——"
node dev/check-contrast.mjs | tail -3 || FAIL=1
echo; echo "—— 17/23 动效与减少动态效果 ——"
BASE_URL="$BASE" node dev/verify-motion.mjs | tail -3 || FAIL=1
echo; echo "—— 18/23 手机滑动切日期 ——"
BASE_URL="$BASE" node dev/verify-swipe.mjs | tail -3 || FAIL=1
echo; echo "—— 19/23 配色对比度（实际渲染）——"
BASE_URL="$BASE" node dev/check-contrast-live.mjs | tail -4 || FAIL=1
echo; echo "—— 20/23 零成本部署路径（自带转发器）——"
MOCK_URL=http://127.0.0.1:54321 bash dev/verify-relay.sh | tail -8 || FAIL=1
echo; echo "—— 21/23 超长文本布局 ——"
BASE_URL="$BASE" MOCK_URL=http://127.0.0.1:54321 node dev/verify-longtext.mjs | tail -3 || FAIL=1
echo; echo "—— 22/23 布局溢出与未定义样式 ——"
BASE_URL="$BASE" STRICT=1 node dev/diagnose.mjs /today /discussions /letters /notifications 2>&1 | grep -E "^###|越界元素|⚠ 未定义|✅ 各宽度|❌ 发现" || FAIL=1
[ "${PIPESTATUS[0]}" = "0" ] || FAIL=1
echo; echo "—— 23/23 截图 ——"
BASE_URL="$BASE" node dev/screenshot.mjs 2>&1 | grep -E "控制台报错|溢出=[1-9]" || echo "  无溢出、无控制台报错"
BASE_URL="$BASE" node dev/screenshot.mjs 2>&1 | grep -cE "^[0-9]{3} " | xargs -I{} echo "  完成 {} 张截图（含暗色）"
echo; [ "$FAIL" = "0" ] && echo "✅ 全部通过" || echo "❌ 有检查未通过"
exit $FAIL
