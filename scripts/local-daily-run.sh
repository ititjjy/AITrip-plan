#!/bin/bash
#
# local-daily-run.sh — 导出本地数据库 + 确认后发布到服务器
#
# 新方案流程:
#   1. "全球城市POI大师" Agent 维护本地 server/data/pois.db
#   2. 本脚本导出数据库到 data-sync/cache-export.json
#   3. macOS 弹出确认对话框，显示城市和POI统计
#   4. 用户确认 → 自动执行 release.sh 发布到GitHub
#   5. 服务器执行 server-pull.sh 自动导入数据
#
# 安装定时任务:
#   bash scripts/setup-launchd.sh
#
# 手动执行:
#   bash scripts/local-daily-run.sh
#
# 跳过确认直接发布:
#   AUTO_CONFIRM=1 bash scripts/local-daily-run.sh
#

set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

# ── 检测 Node.js ──
if [ -x "$HOME/.local/node/bin/node" ]; then
    export PATH="$HOME/.local/node/bin:$PATH"
elif [ -x "/opt/homebrew/bin/node" ]; then
    export PATH="/opt/homebrew/bin:$PATH"
elif [ -x "/usr/local/bin/node" ]; then
    export PATH="/usr/local/bin:$PATH"
fi

if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js not found"
    osascript -e 'display notification "Node.js not found" with title "AITrip Error"'
    exit 1
fi

# ── 颜色 ──
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo -e "${CYAN}═══════════════════════════════════════════${NC}"
echo -e "${CYAN}  AITrip - 本地数据导出 & 同步发布${NC}"
echo -e "${CYAN}═══════════════════════════════════════════${NC}"
echo ""

# ── 1. 导出本地数据库 ──
echo -e "${CYAN}[1/3] 导出本地数据库...${NC}"
echo ""

EXPORT_OUTPUT=$(node scripts/db-export.js 2>&1)
echo "$EXPORT_OUTPUT"

if [ $? -ne 0 ]; then
    echo -e "\n❌ 数据库导出失败"
    osascript -e 'display notification "数据库导出失败，请检查本地数据库" with title "AITrip Export Error"'
    exit 1
fi

# ── 2. 解析导出结果，生成摘要 ──
echo ""
echo -e "${CYAN}[2/3] 解析导出结果...${NC}"

SYNC_FILE="$PROJECT_DIR/data-sync/cache-export.json"
if [ ! -f "$SYNC_FILE" ]; then
    echo "❌ 导出文件不存在"
    exit 1
fi

# 从导出文件提取统计信息
POI_CITIES=$(node -e "const d=require('$SYNC_FILE'); console.log(d.poiCityCount||0)")
HOTEL_CITIES=$(node -e "const d=require('$SYNC_FILE'); console.log(d.hotelCityCount||0)")
EXPORT_TIME=$(node -e "const d=require('$SYNC_FILE'); console.log(d.exportedAtStr||'unknown')")

# 生成城市列表摘要（最多显示10个）
CITY_SUMMARY=""
CITIES=$(node -e "
const d=require('$SYNC_FILE');
(d.cities||[]).forEach(c => console.log(c.city + '/' + c.season + ':' + c.count));
")
CITY_COUNT=0
while IFS='/' read -r city_season count; do
    CITY_NAME=$(echo "$city_season" | cut -d'/' -f1)
    SEASON=$(echo "$city_season" | cut -d'/' -f2)
    CITY_SUMMARY="${CITY_SUMMARY}• ${CITY_NAME}(${SEASON}): ${count}个POI\n"
    CITY_COUNT=$((CITY_COUNT + 1))
    if [ $CITY_COUNT -ge 10 ]; then
        REMAINING=$((POI_CITIES - 10))
        if [ $REMAINING -gt 0 ]; then
            CITY_SUMMARY="${CITY_SUMMARY}• ...及其他${REMAINING}个城市\n"
        fi
        break
    fi
done <<< "$CITIES"

# ── 3. 确认对话框 ──
echo ""
echo -e "${CYAN}[3/3] 等待确认...${NC}"

DIALOG_MSG="本地数据库导出完成 ✅

导出时间: ${EXPORT_TIME}
POI缓存: ${POI_CITIES}个城市
酒店缓存: ${HOTEL_CITIES}个城市

城市POI数据:
${CITY_SUMMARY}
是否确认将数据发布到服务器？"

if [ "${AUTO_CONFIRM}" = "1" ]; then
    echo -e "${GREEN}✓ AUTO_CONFIRM模式，自动确认发布${NC}"
    USER_CHOICE="确认发布"
else
    # macOS 确认对话框
    USER_CHOICE=$(osascript <<APPLESCRIPT 2>/dev/null
set dialogResult to display dialog "$DIALOG_MSG" ¬
    buttons {"跳过", "确认发布"} ¬
    default button "确认发布" ¬
    with title "AITrip - 数据同步发布" ¬
    with icon note
return button returned of dialogResult
APPLESCRIPT
    )
fi

if [ "$USER_CHOICE" = "确认发布" ]; then
    echo ""
    echo -e "${GREEN}✓ 用户确认发布，执行 release.sh...${NC}"
    echo ""

    bash scripts/release.sh patch

    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════${NC}"
    echo -e "${GREEN}✓ 本地发布完成！${NC}"
    echo ""
    echo -e "${YELLOW}请在阿里云服务器上执行:${NC}"
    echo -e "  ${CYAN}cd /opt/aitrip && bash scripts/server-pull.sh${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════${NC}"

    osascript -e 'display notification "数据已发布到GitHub，请在服务器执行部署" with title "AITrip 发布成功"'
else
    echo ""
    echo -e "${YELLOW}⚠ 跳过发布，数据保留在本地。${NC}"
    echo -e "  手动发布: ${CYAN}bash scripts/release.sh patch${NC}"

    osascript -e 'display notification "数据已导出但未发布" with title "AITrip 已跳过"'
fi
