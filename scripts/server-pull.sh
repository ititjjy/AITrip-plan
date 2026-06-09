#!/bin/bash
#
# server-pull.sh - 服务器端部署脚本（双源自动寻优）
#
# 在阿里云服务器上执行:
#   cd /opt/aitrip && bash scripts/server-pull.sh           # 部署最新版本
#   cd /opt/aitrip && bash scripts/server-pull.sh v0.3.2    # 部署指定版本
#
# 流程:
#   1. 自动寻优：优先 GitHub，失败自动切换阿里云仓库
#   2. 显示版本变更日志
#   3. 安装依赖
#   4. 构建项目
#   5. 同步 POI 缓存数据
#   6. 重启 PM2 服务
#   7. 健康检查（失败自动回滚）

set -e

# ── 颜色 ──
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

PROJECT_DIR="/opt/aitrip"
DATA_DIR="/data/aitrip"
cd "$PROJECT_DIR"

# ── 确保数据目录存在 ──
mkdir -p "$DATA_DIR"

# ── 配置双源远程仓库 ──
setup_remotes() {
    # 确保 alibaba 远程存在（HTTPS 方式，服务器在国内速度快）
    if ! git remote get-url alibaba &>/dev/null; then
        git remote add alibaba https://code.alibaba-inc.com/ET_PlatformMarktingProduct_AITest/AItrip.git
        echo -e "${GREEN}  ✓ 已添加阿里云远程仓库${NC}"
    fi
    # 确保 origin (GitHub) 存在
    if ! git remote get-url origin &>/dev/null; then
        echo -e "${RED}  ✗ 未配置 origin 远程仓库${NC}"
        exit 1
    fi
}

# ── 双源自动寻优拉取 ──
# 优先尝试 GitHub，失败则切换阿里云仓库
smart_fetch() {
    local target="${1:-main}"

    echo -e "${CYAN}  尝试 [1/2] GitHub...${NC}"
    if git fetch origin "$target" --tags 2>/dev/null; then
        echo -e "${GREEN}  ✓ GitHub 拉取成功${NC}"
        FETCH_REMOTE="origin"
        return 0
    fi

    echo -e "${YELLOW}  ⚠ GitHub 不可达，切换 [2/2] 阿里云仓库...${NC}"
    if git fetch alibaba "$target" --tags 2>/dev/null; then
        echo -e "${GREEN}  ✓ 阿里云仓库拉取成功${NC}"
        FETCH_REMOTE="alibaba"
        return 0
    fi

    echo -e "${RED}  ✗ 两个仓库均不可达，请检查网络${NC}"
    return 1
}

# ── 主流程 ──
main() {
    local target_version="${1:-}"  # 可选: v0.3.2 或留空（最新）
    local CURRENT_TAG
    local OLD_COMMIT

    CURRENT_TAG=$(git describe --tags --always 2>/dev/null || echo "unknown")
    OLD_COMMIT=$(git rev-parse HEAD)

    echo -e "${CYAN}═══════════════════════════════════════════${NC}"
    echo -e "${CYAN}  AI 行程规划 - 服务器部署工具${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════${NC}"
    echo -e "${YELLOW}  当前版本: ${CURRENT_TAG}${NC}"
    echo -e "${YELLOW}  数据目录: ${DATA_DIR}${NC}"
    echo ""

    # ── 1. 配置远程仓库并拉取 ──
    echo -e "${CYAN}[1/7] 拉取最新代码...${NC}"
    setup_remotes

    if [ -n "$target_version" ]; then
        # 部署指定版本 tag
        echo -e "${YELLOW}  目标版本: ${target_version}${NC}"
        smart_fetch "refs/tags/${target_version}" || exit 1
        git checkout "$target_version" 2>/dev/null || {
            echo -e "${RED}✗ 版本 ${target_version} 不存在${NC}"
            echo -e "${YELLOW}可用版本:${NC}"
            git tag -l 'v*' --sort=-version:refname | head -10
            exit 1
        }
    else
        # 部署最新版本
        smart_fetch "main" || exit 1
        git merge "FETCH_HEAD" --ff-only 2>/dev/null || git reset --hard "FETCH_HEAD"
    fi

    local NEW_COMMIT
    NEW_COMMIT=$(git rev-parse HEAD)

    if [ "$OLD_COMMIT" = "$NEW_COMMIT" ]; then
        echo -e "${GREEN}  ✓ 代码已是最新，无需部署${NC}"
        exit 0
    fi

    # ── 2. 显示变更日志 ──
    echo ""
    echo -e "${CYAN}[2/7] 本次变更:${NC}"
    git log --oneline "$OLD_COMMIT..$NEW_COMMIT"
    echo ""

    # ── 3. 安装依赖 ──
    echo -e "${CYAN}[3/7] 安装依赖...${NC}"
    npm install --production=false 2>&1 || {
        echo -e "${RED}✗ 依赖安装失败，开始回滚...${NC}"
        git reset --hard "$OLD_COMMIT"
        echo -e "${YELLOW}  已回滚到 ${CURRENT_TAG}${NC}"
        exit 1
    }

    # ── 4. 构建项目 ──
    echo ""
    echo -e "${CYAN}[4/7] 构建项目...${NC}"
    npm run build 2>&1 || {
        echo -e "${RED}✗ 构建失败，开始回滚...${NC}"
        git reset --hard "$OLD_COMMIT"
        npm install --production=false 2>&1 >/dev/null
        npm run build 2>&1 >/dev/null
        echo -e "${YELLOW}  已回滚到 ${CURRENT_TAG}${NC}"
        exit 1
    }

    # ── 5. 同步 POI 缓存数据 ──
    echo ""
    echo -e "${CYAN}[5/7] 检查 POI 缓存数据同步...${NC}"
    if [ -f "data-sync/cache-export.json" ]; then
        SYNC_MTIME=$(stat -c %Y data-sync/cache-export.json 2>/dev/null || stat -f %m data-sync/cache-export.json 2>/dev/null)
        DB_MTIME=$(stat -c %Y "$DATA_DIR/pois.db" 2>/dev/null || stat -f %m "$DATA_DIR/pois.db" 2>/dev/null || echo 0)
        if [ "$SYNC_MTIME" -gt "$DB_MTIME" ]; then
            echo -e "${YELLOW}  检测到新的 POI 缓存数据，开始导入...${NC}"
            node scripts/import-cache.js 2>&1 && echo -e "${GREEN}  ✓ POI 缓存导入成功${NC}" || echo -e "${YELLOW}  ⚠ POI 缓存导入失败（不影响服务）${NC}"
        else
            echo -e "${GREEN}  ✓ POI 缓存数据已是最新${NC}"
        fi
    else
        echo -e "${YELLOW}  ⚠ 未找到 POI 缓存同步文件（不影响服务）${NC}"
    fi

    # ── 6. 重启服务 ──
    echo ""
    echo -e "${CYAN}[6/7] 重启 PM2 服务...${NC}"
    if [ -f "ecosystem.config.cjs" ]; then
        pm2 delete aitrip 2>/dev/null
        pm2 start ecosystem.config.cjs --env production 2>&1
    else
        pm2 restart aitrip 2>&1 || pm2 start npm --name aitrip -- start 2>&1
    fi
    sleep 3

    # ── 7. 健康检查 ──
    echo ""
    echo -e "${CYAN}[7/7] 健康检查...${NC}"
    HEALTH=$(curl -s http://localhost:3001/api/health 2>/dev/null || echo "failed")

    if echo "$HEALTH" | grep -q '"ok"'; then
        local NEW_TAG
        NEW_TAG=$(git describe --tags --always 2>/dev/null || echo "unknown")
        echo ""
        echo -e "${GREEN}═══════════════════════════════════════════${NC}"
        echo -e "${GREEN}  ✓ 部署成功！${NC}"
        echo -e "${GREEN}  版本: ${CURRENT_TAG} → ${NEW_TAG}${NC}"
        echo -e "${GREEN}  来源: ${FETCH_REMOTE}${NC}"
        echo -e "${GREEN}  状态: ${HEALTH}${NC}"
        echo -e "${GREEN}═══════════════════════════════════════════${NC}"
        echo ""
        echo -e "${YELLOW}  回滚命令: bash scripts/server-rollback.sh ${CURRENT_TAG}${NC}"
    else
        echo -e "${RED}✗ 健康检查失败，开始回滚...${NC}"
        git reset --hard "$OLD_COMMIT"
        npm install --production=false 2>&1 >/dev/null
        npm run build 2>&1 >/dev/null
        pm2 restart aitrip 2>&1 >/dev/null
        echo -e "${YELLOW}  已回滚到 ${CURRENT_TAG}${NC}"
        exit 1
    fi
}

main "$@"
