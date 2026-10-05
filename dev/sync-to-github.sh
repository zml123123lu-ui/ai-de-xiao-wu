#!/usr/bin/env bash
# 把当前代码同步到 GitHub。
#
# 为什么需要它：国内网络下 github.com 网页能开，但 git push 的连接经常被掐
# （Recv failure: Operation timed out）。而这个脚本走 GitHub 的 REST API
# （api.github.com，实测可用），把整棵代码树作为一个提交推上去。
#
# 用法：bash dev/sync-to-github.sh [owner/repo]
# 前置：gh 已登录（gh auth status 显示 Logged in 即可，需要 repo 权限）
set -euo pipefail
cd "$(dirname "$0")/.."
REPO="${1:-zml123123lu-ui/ai-de-xiao-wu}"

gh auth status >/dev/null 2>&1 || { echo "❌ gh 未登录，先执行：gh auth login"; exit 1; }

REPO_SLUG="$REPO"
# 注意：仓库为空时 gh 会把 409 的错误 JSON 打到 stdout，捕获到的是错误文本而不是空值，
# 所以这里必须校验"确实是 40 位十六进制"，否则会误以为已有提交而跳过播种。
PARENT=$(gh api "/repos/$REPO_SLUG/git/ref/heads/main" --jq .object.sha 2>/dev/null | tr -d '[:space:]' || true)
case "$PARENT" in *[!0-9a-f]*|"") PARENT="" ;; esac
[ "${#PARENT}" -eq 40 ] || PARENT=""
# 空仓库上 Git Data API 会直接报 409 "Git Repository is empty"，
# 所以先用 Contents API 建一个初始提交（用真实的 README.md 当种子，不留占位文件）。
if [ -z "$PARENT" ]; then
  echo "  仓库还是空的：先用 Contents API 建初始提交"
  SEED=$(base64 < README.md | tr -d '\n')
  gh api --method PUT "/repos/$REPO_SLUG/contents/README.md" -f message="初始化仓库" -f content="$SEED" >/dev/null
  PARENT=$(gh api "/repos/$REPO_SLUG/git/ref/heads/main" --jq .object.sha)
  echo "  初始提交：${PARENT:0:7}"
fi
if [ -n "$(git status --porcelain)" ]; then
  echo "⚠ 工作区有未提交的改动，先 commit 再同步（同步的是当前工作区内容）"
fi

python3 - "$REPO" <<'PY'
import base64, json, subprocess, sys, os

repo = sys.argv[1]
# -z：用 NUL 分隔并关闭 core.quotepath，否则中文文件名会被转义成 \344\270\212...
listed = subprocess.run(["git", "ls-files", "-s", "-z"], capture_output=True, text=True, check=True).stdout
tree, binaries, skipped = [], [], []

for line in [item for item in listed.split("\0") if item]:
    meta, path = line.split("\t", 1)
    # gh 的令牌没有 workflow 权限时，推送 .github/workflows/ 会被拒绝
    if path.startswith(".github/workflows/") and "--with-workflows" not in sys.argv:
        skipped.append(path)
        continue
    mode = meta.split()[0]
    with open(path, "rb") as handle:
        raw = handle.read()
    try:
        text = raw.decode("utf-8")
        tree.append({"path": path, "mode": mode, "type": "blob", "content": text})
    except UnicodeDecodeError:
        binaries.append((path, mode, base64.b64encode(raw).decode()))

json.dump({"tree": tree}, open("/tmp/gh-tree.json", "w"), ensure_ascii=False)
json.dump(binaries, open("/tmp/gh-binaries.json", "w"), ensure_ascii=False)
print(f"  文本文件 {len(tree)} 个，二进制 {len(binaries)} 个")
if skipped:
    print(f"  跳过 {len(skipped)} 个（{', '.join(skipped)}）")
    print("  → gh 令牌缺 workflow 权限；想带上它请先执行：gh auth refresh -h github.com -s workflow")
PY

# 文本文件直接内联进 tree；二进制先建 blob（本项目目前没有二进制文件，留个保险）
if python3 -c "import json,sys; sys.exit(0 if json.load(open('/tmp/gh-binaries.json')) else 1)"; then
  python3 - "$REPO" <<'PY'
import json, subprocess, sys
repo = sys.argv[1]
tree = json.load(open("/tmp/gh-tree.json"))
for path, mode, content in json.load(open("/tmp/gh-binaries.json")):
    sha = subprocess.run(["gh", "api", "--method", "POST", f"/repos/{repo}/git/blobs",
                          "-f", "encoding=base64", "-f", f"content={content}", "--jq", ".sha"],
                         capture_output=True, text=True, check=True).stdout.strip()
    tree["tree"].append({"path": path, "mode": mode, "type": "blob", "sha": sha})
    print(f"  已上传二进制 {path}")
json.dump(tree, open("/tmp/gh-tree.json", "w"), ensure_ascii=False)
PY
fi

TREE=$(gh api --method POST "/repos/$REPO/git/trees" --input /tmp/gh-tree.json --jq .sha)
echo "✓ 代码树已建：$TREE"


STAMP=$(date "+%Y-%m-%d %H:%M")
if [ -n "$PARENT" ]; then
  python3 -c "
import json, sys
json.dump({'message': f'同步本地代码 $STAMP', 'tree': '$TREE', 'parents': ['$PARENT']}, open('/tmp/gh-commit.json','w'), ensure_ascii=False)
"
  COMMIT=$(gh api --method POST "/repos/$REPO/git/commits" --input /tmp/gh-commit.json --jq .sha)
  gh api --method PATCH "/repos/$REPO/git/refs/heads/main" -f sha="$COMMIT" >/dev/null
  echo "✓ 已更新 main：$COMMIT（父提交 ${PARENT:0:7}）"
else
  python3 -c "
import json
json.dump({'message': '导入现有代码（本地 30 个提交的当前状态）', 'tree': '$TREE'}, open('/tmp/gh-commit.json','w'), ensure_ascii=False)
"
  COMMIT=$(gh api --method POST "/repos/$REPO/git/commits" --input /tmp/gh-commit.json --jq .sha)
  gh api --method POST "/repos/$REPO/git/refs" -f ref="refs/heads/main" -f sha="$COMMIT" >/dev/null
  echo "✓ 已创建 main：$COMMIT"
fi

gh api --method PATCH "/repos/$REPO" -f default_branch="main" >/dev/null 2>&1 || true
echo "✓ 完成：https://github.com/$REPO"
echo "  远端文件数：$(gh api "/repos/$REPO/git/trees/main?recursive=1" --jq '[.tree[] | select(.type=="blob")] | length')"
rm -f /tmp/gh-tree.json /tmp/gh-binaries.json /tmp/gh-commit.json
