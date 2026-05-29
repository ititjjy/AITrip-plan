#!/bin/bash
#
# setup-launchd.sh — 安装 macOS 定时任务
#
# 每天中午12:00自动执行 local-daily-run.sh
#
# 用法:
#   bash scripts/setup-launchd.sh
#
# 卸载:
#   launchctl unload ~/Library/LaunchAgents/com.aitrip.daily.plist
#   rm ~/Library/LaunchAgents/com.aitrip.daily.plist
#

set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PLIST_NAME="com.aitrip.daily"
PLIST_PATH="$HOME/Library/LaunchAgents/${PLIST_NAME}.plist"
RUN_SCRIPT="$PROJECT_DIR/scripts/local-daily-run.sh"

# ── 颜色 ──
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}═══════════════════════════════════════════${NC}"
echo -e "${CYAN}  AITrip - macOS 定时任务安装${NC}"
echo -e "${CYAN}═══════════════════════════════════════════${NC}"
echo ""

# ── 检查脚本路径 ──
if [ ! -f "$RUN_SCRIPT" ]; then
    echo "ERROR: 执行脚本不存在: $RUN_SCRIPT"
    exit 1
fi

# ── 卸载旧任务（如果存在）──
if [ -f "$PLIST_PATH" ]; then
    echo -e "${YELLOW}  发现旧定时任务，正在卸载...${NC}"
    launchctl unload "$PLIST_PATH" 2>/dev/null || true
    rm -f "$PLIST_PATH"
fi

# ── 创建 plist 文件 ──
cat > "$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${PLIST_NAME}</string>

    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>${RUN_SCRIPT}</string>
    </array>

    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>12</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>

    <key>StandardOutPath</key>
    <string>${PROJECT_DIR}/server/data/launchd-out.log</string>

    <key>StandardErrorPath</key>
    <string>${PROJECT_DIR}/server/data/launchd-err.log</string>

    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>$HOME/.local/node/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin</string>
    </dict>

    <key>RunAtLoad</key>
    <false/>
</dict>
</plist>
EOF

# ── 加载任务 ──
launchctl load "$PLIST_PATH"

echo ""
echo -e "${GREEN}✓ 定时任务已安装！${NC}"
echo ""
echo -e "  任务名称: ${CYAN}${PLIST_NAME}${NC}"
echo -e "  执行时间: ${CYAN}每天 12:00${NC}"
echo -e "  执行脚本: ${CYAN}${RUN_SCRIPT}${NC}"
echo -e "  输出日志: ${CYAN}${PROJECT_DIR}/server/data/launchd-out.log${NC}"
echo -e "  错误日志: ${CYAN}${PROJECT_DIR}/server/data/launchd-err.log${NC}"
echo ""
echo -e "${GREEN}═══════════════════════════════════════════${NC}"

# ── 立即测试一次 ──
echo ""
echo -e "${YELLOW}是否立即执行一次测试？(y/n)${NC}"
read -r answer
if [ "$answer" = "y" ] || [ "$answer" = "Y" ]; then
    echo ""
    echo -e "${CYAN}开始测试执行...${NC}"
    bash "$RUN_SCRIPT"
else
    echo -e "${YELLOW}  跳过测试。明天12:00会自动执行。${NC}"
    echo -e "  手动执行命令: ${CYAN}bash scripts/local-daily-run.sh${NC}"
fi
