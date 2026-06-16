#!/bin/bash
#
# deploy.sh - 一键部署脚本（双开发机通用）
#
# 主开发机用法（网络可用时）:
#   bash scripts/deploy.sh              # 推送当前分支 + 部署
#   bash scripts/deploy.sh --push-only  # 仅推送，不部署（阿里郎阻断SSH时）
#
# 辅助开发机用法:
#   bash scripts/deploy.sh              # 合并到main + 推送 + 部署
#   bash scripts/deploy.sh --merge feat/office-xxx  # 合并指定分支 + 部署
#
set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

SERVER_IP="8.130.215.28"
SERVER_USER="root"
SERVER_DIR="/opt/aitrip"

PUSH_ONLY=false
MERGE_BRANCH=""

# ── 解析参数 ──
for arg in "$@"; do
  case "$arg" in
    --push-only) PUSH_ONLY=true ;;
    --merge)     shift; MERGE_BRANCH="$1" ;;
  esac
done

echo "═══════════════════════════════════════════"
echo "  AITrip 一键部署脚本"
echo "═══════════════════════════════════════════"

# ── 1. 合并分支（辅助机专用）──
if [ -n "$MERGE_BRANCH" ]; then
    echo ""
    echo "🔀 Step 0: 合并分支 ${MERGE_BRANCH} → main..."
    git checkout main
    git pull origin main
    git merge "origin/${MERGE_BRANCH}" --no-ff -m "merge: ${MERGE_BRANCH}" || {
        echo "❌ 合并冲突！请手动解决后再运行部署。"
        exit 1
    }
    echo "   ✅ 分支合并成功"
fi

# ── 2. 检查当前分支 ──
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "main" ]; then
    echo ""
    echo "⚠️  当前在分支: ${CURRENT_BRANCH}（非 main）"
    echo "   如需部署，请先合并到 main："
    echo "     bash scripts/deploy.sh --merge ${CURRENT_BRANCH}"
    echo ""
    echo "   或切换到 main 后再部署："
    echo "     git checkout main && bash scripts/deploy.sh"
    exit 1
fi

# ── 3. 检查本地是否有未提交的更改 ──
if [ -n "$(git status --short)" ]; then
    echo ""
    echo "⚠️  检测到本地有未提交的更改，先自动提交..."
    git add -A
    git commit -m "deploy: auto-commit before deployment ($(date '+%Y-%m-%d %H:%M'))" || true
fi

# ── 4. 推送到 GitHub + 阿里代码库 ──
echo ""
echo "📤 Step 1/3: 推送代码到远程仓库..."
git push origin main
git push alibaba main 2>/dev/null || echo "   ⚠️ 阿里代码库推送失败（不影响部署）"
echo "   ✅ 代码已推送"

if [ "$PUSH_ONLY" = true ]; then
    echo ""
    echo "═══════════════════════════════════════════"
    echo "  ✅ 仅推送模式，跳过服务器部署"
    echo "═══════════════════════════════════════════"
    exit 0
fi

# ── 5. 检查 SSH 免密登录 ──
echo ""
echo "🔑 Step 2/3: 检查服务器 SSH 免密登录..."
if ! ssh -o BatchMode=yes -o ConnectTimeout=3 "${SERVER_USER}@${SERVER_IP}" "echo OK" >/dev/null 2>&1; then
    echo ""
    echo "───────────────────────────────────────────"
    echo "⚠️  首次部署需要配置 SSH 免密登录"
    echo ""
    echo "   请在下方输入服务器密码（仅一次）:"
    echo "   ${SERVER_USER}@${SERVER_IP}"
    echo ""
    ssh-copy-id -i ~/.ssh/id_ed25519.pub "${SERVER_USER}@${SERVER_IP}"
    echo ""
    echo "   ✅ SSH 免密配置完成！"
    echo "───────────────────────────────────────────"
fi

# ── 6. 服务器部署 ──
echo ""
echo "🚀 Step 3/3: 部署到服务器 ${SERVER_IP}..."
ssh "${SERVER_USER}@${SERVER_IP}" "cd ${SERVER_DIR} && bash scripts/server-pull.sh"

echo ""
echo "═══════════════════════════════════════════"
echo "  ✅ 部署完成！"
echo "═══════════════════════════════════════════"
