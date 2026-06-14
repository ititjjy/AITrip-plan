#!/bin/bash
set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

SERVER_IP="8.130.215.28"
SERVER_USER="root"
SERVER_DIR="/opt/aitrip"

echo "═══════════════════════════════════════════"
echo "  AITrip 一键部署脚本"
echo "═══════════════════════════════════════════"

# ── 1. 检查本地是否有未提交的更改 ──
if [ -n "$(git status --short)" ]; then
    echo ""
    echo "⚠️  检测到本地有未提交的更改，先自动提交..."
    git add -A
    git commit -m "deploy: auto-commit before deployment ($(date '+%Y-%m-%d %H:%M'))" || true
fi

# ── 2. 推送到 GitHub ──
echo ""
echo "📤 Step 1/3: 推送代码到 GitHub..."
git push origin main
echo "   ✅ 代码已推送"

# ── 3. 检查 SSH 免密登录 ──
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
    echo "   下次运行 deploy.sh 将不再需要输入密码"
    echo "───────────────────────────────────────────"
fi

# ── 4. 服务器部署 ──
echo ""
echo "🚀 Step 3/3: 部署到服务器 ${SERVER_IP}..."
ssh "${SERVER_USER}@${SERVER_IP}" "cd ${SERVER_DIR} && bash scripts/server-pull.sh"

echo ""
echo "═══════════════════════════════════════════"
echo "  ✅ 部署完成！"
echo "═══════════════════════════════════════════"
