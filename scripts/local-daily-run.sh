#!/bin/bash
#
# local-daily-run.sh — 本地每日定时执行 + 确认后上传
#
# 流程:
#   1. 运行 daily-refresh.js 调用AI刷新3个城市
#   2. 解析执行结果生成摘要
#   3. macOS 弹出确认对话框
#   4. 用户确认 → 自动执行 release.sh 发布到GitHub
#   5. 提示用户在服务器执行 server-pull.sh
#
# 安装定时任务:
#   bash scripts/setup-launchd.sh
#
# 手动测试:
#   bash scripts/local-daily-run.sh
#

set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
STATE_FILE="$PROJECT_DIR/server/data/refresh-state.json"
LOG_FILE="$PROJECT_DIR/server/data/refresh.log"

cd "$PROJECT_DIR"

# ── 检测 Node.js ──
if [ -x "$HOME/.local/node/bin/node" ]; then
    export PATH="$HOME/.local/node/bin:$PATH"
    echo "Using Node.js from $HOME/.local/node/bin"
elif [ -x "/opt/homebrew/bin/node" ]; then
    export PATH="/opt/homebrew/bin:$PATH"
    echo "Using Node.js from /opt/homebrew/bin"
elif [ -x "/usr/local/bin/node" ]; then
    export PATH="/usr/local/bin:$PATH"
    echo "Using Node.js from /usr/local/bin"
fi

if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js not found. Please install Node.js 18+."
    osascript -e 'display notification "Node.js not found" with title "AITrip Error"'
    exit 1
fi

# ── 颜色 ──
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}═══════════════════════════════════════════${NC}"
echo -e "${CYAN}  AI Trip - 本地每日POI刷新${NC}"
echo -e "${CYAN}═══════════════════════════════════════════${NC}"
echo ""

# ── 1. 运行 daily-refresh.js ──
echo -e "${CYAN}[1/3] 正在调用AI刷新今日批次...${NC}"
echo "   (预计耗时 3-8 分钟)"
echo ""

node scripts/daily-refresh.js 2>&1 | tee -a "$LOG_FILE"

EXIT_CODE=${PIPESTATUS[0]}
if [ $EXIT_CODE -ne 0 ]; then
    echo -e "${RED}✗ daily-refresh.js 执行失败 (exit $EXIT_CODE)${NC}"
    # 弹出失败通知
    osascript -e 'display notification "AI POI刷新执行失败，请查看日志" with title "AITrip Daily Refresh"'
    exit 1
fi

# ── 2. 解析今日执行摘要 ──
echo ""
echo -e "${CYAN}[2/3] 解析执行结果...${NC}"

# 从STATE_FILE获取今日批次信息
CYCLE="unknown"
PENDING="unknown"
if [ -f "$STATE_FILE" ]; then
    CYCLE=$(node -e "const s=require('$STATE_FILE'); console.log(s.cycle||1)")
    PENDING=$(node -e "const s=require('$STATE_FILE'); console.log(s.pendingIds?s.pendingIds.length:0)")
fi

# 从日志提取今日刷新的城市
TODAY_CITIES=$(grep -E "^\[.*\] \[.*\].*starting refresh" "$LOG_FILE" | tail -3 | sed -E 's/.*\[(.*)\] (.*) \(.*$/\1(\2)/')

# 从日志提取POI数量
POI_COUNTS=""
while IFS= read -r line; do
    CITY_ID=$(echo "$line" | sed -E 's/.*\[(.*)\].*Saved ([0-9]+) POIs/\1/')
    COUNT=$(echo "$line" | sed -E 's/.*\[(.*)\].*Saved ([0-9]+) POIs/\2/')
    if [ -n "$CITY_ID" ] && [ -n "$COUNT" ]; then
        POI_COUNTS="$POI_COUNTS• $CITY_ID: $COUNT 个POI\n"
    fi
done < <(grep -E "\[.*\].*Saved [0-9]+ POIs" "$LOG_FILE" | tail -3)

# 计算本轮进度
if [ "$PENDING" != "unknown" ]; then
    TOTAL_CITIES=200
    DONE=$((TOTAL_CITIES - PENDING))
    PERCENT=$((DONE * 100 / TOTAL_CITIES))
    PROGRESS="本轮进度: $DONE/$TOTAL_CITIES 城市 ($PERCENT%)"
else
    PROGRESS=""
fi

# ── 3. macOS 确认对话框 ──
echo ""
echo -e "${CYAN}[3/3] 等待确认...${NC}"

DIALOG_MSG="今日POI刷新完成 ✅\n\n${POI_COUNTS}\n${PROGRESS}\n\n是否确认将数据发布到服务器？"

echo ""
echo -e "${YELLOW}弹出确认对话框...${NC}"

# 使用 osascript 弹出确认对话框
osascript <<APPLESCRIPT
set dialogResult to display dialog "$DIALOG_MSG" ¬
    buttons {"跳过", "确认发布"} ¬
    default button "确认发布" ¬
    with title "AITrip - 每日POI刷新完成" ¬
    with icon note

return button returned of dialogResult
APPLESCRIPT

DIALOG_EXIT=$?

# osascript 返回结果在 stdout，我们重新获取
USER_CHOICE=$(osascript <<APPLESCRIPT 2>/dev/null
set dialogResult to display dialog "$DIALOG_MSG" ¬
    buttons {"跳过", "确认发布"} ¬
    default button "确认发布" ¬
    with title "AITrip - 每日POI刷新完成" ¬
    with icon note

return button returned of dialogResult
APPLESCRIPT
)

if [ "$USER_CHOICE" = "确认发布" ]; then
    echo ""
    echo -e "${GREEN}✓ 用户确认发布，开始执行 release.sh...${NC}"
    echo ""

    # 自动执行 release.sh (patch 版本)
    bash scripts/release.sh patch

    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════${NC}"
    echo -e "${GREEN}✓ 本地发布完成！${NC}"
    echo ""
    echo -e "${YELLOW}请在阿里云服务器上执行以下命令完成部署:${NC}"
    echo ""
    echo -e "  ${CYAN}cd /opt/aitrip && bash scripts/server-pull.sh${NC}"
    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════${NC}"

    # 弹出最终通知
    osascript -e 'display notification "POI数据已发布到GitHub，请在服务器执行部署" with title "AITrip 发布成功"'

else
    echo ""
    echo -e "${YELLOW}⚠ 用户选择跳过发布，数据保留在本地。${NC}"
    echo -e "${YELLOW}  稍后可通过以下命令手动发布:${NC}"
    echo -e "  ${CYAN}bash scripts/release.sh patch${NC}"

    osascript -e 'display notification "今日POI数据已缓存，未发布到服务器" with title "AITrip 已跳过"'
fi
