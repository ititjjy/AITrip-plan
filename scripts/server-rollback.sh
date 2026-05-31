#!/bin/bash
#
# server-rollback.sh - 服务器版本回滚脚本
#
# 在阿里云服务器上执行:
#   bash scripts/server-rollback.sh v0.3.2     # 回滚到指定版本
#   bash scripts/server-rollback.sh             # 列出可用版本
#
# 流程:
#   1. 列出可用版本（无参数时）
#   2. 切换到指定版本 tag
#   3. 重新构建
#   4. 重启服务
#   5. 健康检查

set -e

# ── 颜色 ──
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

PROJECT_DIR="/opt/aitrip"
cd "$PROJECT_DIR"

# ── 主流程 ──
main() {
    local target_version="${1:-}"
    local CURRENT_TAG
    CURRENT_TAG=$(git describe --tags --always 2>/dev/null || echo "unknown")

    echo -e "${CYAN}═══════════════════════════════════════════${NC}"
    echo -e "${CYAN}  AI 行程规划 - 版本回滚工具${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════${NC}"
    echo -e "${YELLOW}  当前版本: ${CURRENT_TAG}${NC}"
    echo ""

    # 无参数时列出版本
    if [ -z "$target_version" ]; then
        echo -e "${CYAN}可用版本（最近 15 个）:${NC}"
        echo ""
        git tag -l 'v*' --sort=-version:refname | head -15 | while read -r tag; do
            local date
            date=$(git log -1 --format='%ci' "$tag" 2>/dev/null | cut -d' ' -f1)
            local msg
            msg=$(git tag -l -n1 "$tag" | sed 's/^v[0-9.]* *//')
            if [ "$tag" = "$CURRENT_TAG" ]; then
                echo -e "  ${GREEN}● ${tag}${NC}  ${date}  ${msg} ${YELLOW}← 当前${NC}"
            else
                echo -e "  ○ ${tag}  ${date}  ${msg}"
            fi
        done
        echo ""
        echo -e "${YELLOW}用法: bash scripts/server-rollback.sh v0.3.2${NC}"
        exit 0
    fi

    # 验证版本存在
    if ! git rev-parse "$target_version" &>/dev/null; then
        echo -e "${RED}✗ 版本 ${target_version} 不存在${NC}"
        echo ""
        echo -e "${YELLOW}可用版本:${NC}"
        git tag -l 'v*' --sort=-version:refname | head -10
        exit 1
    fi

    if [ "$target_version" = "$CURRENT_TAG" ]; then
        echo -e "${YELLOW}  已在版本 ${target_version}，无需回滚${NC}"
        exit 0
    fi

    # 确认回滚
    echo -e "${RED}⚠ 即将回滚: ${CURRENT_TAG} → ${target_version}${NC}"
    echo -e "${CYAN}确认回滚？(y/n)${NC}"
    read -r answer
    if [ "$answer" != "y" ] && [ "$answer" != "Y" ]; then
        echo -e "${YELLOW}已取消${NC}"
        exit 0
    fi

    # 切换版本
    echo ""
    echo -e "${CYAN}[1/4] 切换到 ${target_version}...${NC}"
    git checkout "$target_version" 2>/dev/null || git reset --hard "$target_version"

    # 安装依赖 + 构建
    echo -e "${CYAN}[2/4] 安装依赖并构建...${NC}"
    npm install --production=false 2>&1 >/dev/null
    npm run build 2>&1 || {
        echo -e "${RED}✗ 构建失败，恢复到原版本...${NC}"
        git checkout "$CURRENT_TAG" 2>/dev/null || git reset --hard "$CURRENT_TAG"
        npm install --production=false 2>&1 >/dev/null
        npm run build 2>&1 >/dev/null
        exit 1
    }

    # 重启服务
    echo -e "${CYAN}[3/4] 重启服务...${NC}"
    if [ -f "ecosystem.config.cjs" ]; then
        pm2 delete aitrip 2>/dev/null
        pm2 start ecosystem.config.cjs --env production 2>&1
    else
        pm2 restart aitrip 2>&1 || pm2 start npm --name aitrip -- start 2>&1
    fi
    sleep 3

    # 健康检查
    echo -e "${CYAN}[4/4] 健康检查...${NC}"
    HEALTH=$(curl -s http://localhost:3001/api/health 2>/dev/null || echo "failed")

    if echo "$HEALTH" | grep -q '"ok"'; then
        echo ""
        echo -e "${GREEN}═══════════════════════════════════════════${NC}"
        echo -e "${GREEN}  ✓ 回滚成功！${NC}"
        echo -e "${GREEN}  版本: ${CURRENT_TAG} → ${target_version}${NC}"
        echo -e "${GREEN}═══════════════════════════════════════════${NC}"
    else
        echo -e "${RED}✗ 回滚后健康检查失败，请手动排查${NC}"
        pm2 logs aitrip --lines 20
        exit 1
    fi
}

main "$@"
