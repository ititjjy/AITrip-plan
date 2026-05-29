#!/bin/bash
#
# server-pull.sh - 服务器端部署脚本
#
# 在阿里云服务器上执行:
#   cd /opt/aitrip && bash scripts/server-pull.sh
#
# 流程:
#   1. 拉取 GitHub 最新代码
#   2. 显示版本变更日志
#   3. 安装依赖
#   4. 构建项目
#   5. 重启 PM2 服务
#   6. 健康检查
#   7. 失败自动回滚

set -e

# ── 颜色 ──
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

PROJECT_DIR="/opt/aitrip"
cd "$PROJECT_DIR"

# ── 备份当前版本（用于回滚） ──
CURRENT_TAG=$(git describe --tags --always 2>/dev/null || echo "unknown")
BACKUP_BRANCH="backup-$(date '+%Y%m%d%H%M%S')"

echo -e "${CYAN}═══════════════════════════════════════════${NC}"
echo -e "${CYAN}  服务器部署工具${NC}"
echo -e "${CYAN}═══════════════════════════════════════════${NC}"
echo -e "${YELLOW}当前版本: ${CURRENT_TAG}${NC}"
echo ""

# ── 1. 拉取最新代码 ──
echo -e "${CYAN}[1/6] 拉取最新代码...${NC}"
OLD_COMMIT=$(git rev-parse HEAD)
git fetch origin main
git pull origin main 2>&1 || {
    echo -e "${RED}✗ 代码拉取失败${NC}"
    exit 1
}
NEW_COMMIT=$(git rev-parse HEAD)

if [ "$OLD_COMMIT" = "$NEW_COMMIT" ]; then
    echo -e "${GREEN}✓ 代码已是最新，无需部署${NC}"
    exit 0
fi

# ── 2. 显示变更日志 ──
echo ""
echo -e "${CYAN}[2/6] 本次变更:${NC}"
git log --oneline "$OLD_COMMIT..$NEW_COMMIT"
echo ""

# ── 3. 安装依赖 ──
echo -e "${CYAN}[3/6] 安装依赖...${NC}"
npm install --production=false 2>&1 || {
    echo -e "${RED}✗ 依赖安装失败，开始回滚...${NC}"
    git reset --hard "$OLD_COMMIT"
    echo -e "${YELLOW}已回滚到 ${CURRENT_TAG}${NC}"
    exit 1
}

# ── 4. 构建项目 ──
echo ""
echo -e "${CYAN}[4/6] 构建项目...${NC}"
npm run build 2>&1 || {
    echo -e "${RED}✗ 构建失败，开始回滚...${NC}"
    git reset --hard "$OLD_COMMIT"
    npm install --production=false 2>&1 >/dev/null
    npm run build 2>&1 >/dev/null
    echo -e "${YELLOW}已回滚到 ${CURRENT_TAG}${NC}"
    exit 1
}

# ── 5. 重启服务 ──
echo ""
echo -e "${CYAN}[5/6] 重启 PM2 服务...${NC}"
pm2 restart aitrip 2>&1 || {
    echo -e "${RED}✗ 服务重启失败${NC}"
    exit 1
}
sleep 3

# ── 6. 健康检查 ──
echo ""
echo -e "${CYAN}[6/6] 健康检查...${NC}"
HEALTH=$(curl -s http://localhost:3001/api/health 2>/dev/null || echo "failed")

if echo "$HEALTH" | grep -q '"ok"'; then
    NEW_TAG=$(git describe --tags --always 2>/dev/null || echo "unknown")
    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════${NC}"
    echo -e "${GREEN}✓ 部署成功！${NC}"
    echo -e "${GREEN}  版本: ${CURRENT_TAG} → ${NEW_TAG}${NC}"
    echo -e "${GREEN}  状态: ${HEALTH}${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════${NC}"
else
    echo -e "${RED}✗ 健康检查失败，开始回滚...${NC}"
    git reset --hard "$OLD_COMMIT"
    npm install --production=false 2>&1 >/dev/null
    npm run build 2>&1 >/dev/null
    pm2 restart aitrip 2>&1 >/dev/null
    echo -e "${YELLOW}已回滚到 ${CURRENT_TAG}${NC}"
    exit 1
fi
