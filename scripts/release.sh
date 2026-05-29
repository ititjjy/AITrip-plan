#!/bin/bash
#
# release.sh - 本地发布脚本
#
# 用法:
#   ./scripts/release.sh              # 自动补丁版本 (v1.0.0 → v1.0.1)
#   ./scripts/release.sh minor        # 次版本 (v1.0.0 → v1.1.0)
#   ./scripts/release.sh major        # 主版本 (v1.0.0 → v2.0.0)
#   ./scripts/release.sh 1.2.3        # 指定版本号
#
# 流程:
#   1. 检查工作区是否干净（或提示提交）
#   2. 更新 package.json 版本号
#   3. 创建 Git Tag
#   4. 推送代码和 Tag 到 GitHub
#   5. 推送代码和 Tag 到阿里代码库
#   6. 输出服务器部署命令

set -e

# ── 颜色 ──
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# ── 项目路径 ──
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

# ── 检查是否有未提交的改动 ──
check_changes() {
    if [ -n "$(git status --porcelain)" ]; then
        echo -e "${YELLOW}⚠ 检测到未提交的改动:${NC}"
        git status --short
        echo ""
        echo -e "${CYAN}是否提交这些改动？(y/n)${NC}"
        read -r answer
        if [ "$answer" = "y" ] || [ "$answer" = "Y" ]; then
            echo -e "${CYAN}请输入提交信息:${NC}"
            read -r commit_msg
            if [ -z "$commit_msg" ]; then
                commit_msg="chore: 发布前提交 $(date '+%Y-%m-%d %H:%M')"
            fi
            git add -A
            git commit -m "$commit_msg"
            echo -e "${GREEN}✓ 改动已提交${NC}"
        else
            echo -e "${RED}✗ 请先提交改动后再发布${NC}"
            exit 1
        fi
    fi
}

# ── 获取当前版本 ──
get_current_version() {
    node -p "require('./package.json').version"
}

# ── 计算新版本号 ──
bump_version() {
    local current="$1"
    local bump_type="$2"
    local major minor patch

    IFS='.' read -r major minor patch <<< "$current"

    case "$bump_type" in
        major)
            major=$((major + 1))
            minor=0
            patch=0
            ;;
        minor)
            minor=$((minor + 1))
            patch=0
            ;;
        patch|"")
            patch=$((patch + 1))
            ;;
        *)
            # 直接使用指定版本号
            echo "$bump_type"
            return
            ;;
    esac

    echo "${major}.${minor}.${patch}"
}

# ── 主流程 ──
main() {
    local bump_type="${1:-patch}"
    local current_version
    local new_version

    echo -e "${CYAN}═══════════════════════════════════════════${NC}"
    echo -e "${CYAN}  AI 行程规划 - 版本发布工具${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════${NC}"
    echo ""

    # 1. 检查未提交改动
    check_changes
    echo ""

    # 2. 计算版本号
    current_version=$(get_current_version)
    new_version=$(bump_version "$current_version" "$bump_type")

    echo -e "${GREEN}当前版本: v${current_version}${NC}"
    echo -e "${YELLOW}发布版本: v${new_version}${NC}"
    echo ""

    # 3. 确认发布
    echo -e "${CYAN}确认发布 v${new_version}？(y/n)${NC}"
    read -r answer
    if [ "$answer" != "y" ] && [ "$answer" != "Y" ]; then
        echo -e "${RED}✗ 已取消发布${NC}"
        exit 0
    fi

    # 4. 更新 package.json 版本号
    node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('package.json','utf8'));p.version='${new_version}';fs.writeFileSync('package.json',JSON.stringify(p,null,2)+'\n')"
    git add package.json
    git commit -m "chore: 发布 v${new_version}"

    # 5. 创建 Git Tag
    git tag -a "v${new_version}" -m "Release v${new_version}"
    echo -e "${GREEN}✓ Tag v${new_version} 已创建${NC}"

    # 6. 推送到 GitHub
    echo ""
    echo -e "${CYAN}推送代码到 GitHub...${NC}"
    git push origin main --tags 2>&1 || {
        echo -e "${RED}✗ GitHub 推送失败，请检查网络${NC}"
    }
    echo -e "${GREEN}✓ GitHub 推送完成${NC}"

    # 7. 推送到阿里代码库
    echo ""
    echo -e "${CYAN}推送代码到阿里代码库...${NC}"
    git push alibaba main --tags 2>&1 || {
        echo -e "${YELLOW}⚠ 阿里代码库推送失败，可稍后手动推送${NC}"
    }
    echo -e "${GREEN}✓ 阿里代码库推送完成${NC}"

    # 8. 输出服务器部署命令
    echo ""
    echo -e "${CYAN}═══════════════════════════════════════════${NC}"
    echo -e "${GREEN}✓ v${new_version} 发布完成！${NC}"
    echo ""
    echo -e "${YELLOW}在阿里云服务器上执行以下命令完成部署:${NC}"
    echo ""
    echo -e "  ${CYAN}cd /opt/aitrip && bash scripts/server-pull.sh${NC}"
    echo ""
    echo -e "${CYAN}═══════════════════════════════════════════${NC}"
}

main "$@"
