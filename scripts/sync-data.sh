#!/bin/bash
#
# sync-data.sh - 双开发机数据同步工具
#
# 用法:
#   bash scripts/sync-data.sh pull   # 辅助机：拉取最新数据 + 导入本地数据库
#   bash scripts/sync-data.sh push   # 主开发机：导出本地采集数据 + 提交到 Git
#   bash scripts/sync-data.sh server # 辅助机：从服务器直接拉取 pois.db（数据最实时）
#
set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

SERVER_IP="8.130.215.28"
SERVER_USER="root"
SERVER_DATA_DIR="/data/aitrip"

case "${1:-pull}" in
  pull)
    echo "═══════════════════════════════════════════"
    echo "  📥 拉取最新数据"
    echo "═══════════════════════════════════════════"

    echo ""
    echo "  [1/3] 从 GitHub 拉取最新代码和数据..."
    git pull origin main

    echo ""
    echo "  [2/3] 导入 POI 缓存到本地数据库..."
    if [ -f "data-sync/cache-export.json" ]; then
      node scripts/import-cache.js
      echo "  ✅ 数据导入完成"
    else
      echo "  ⚠️  未找到 data-sync/cache-export.json"
    fi

    echo ""
    echo "  [3/3] 数据统计..."
    if [ -f "server/data/pois.db" ]; then
      CITY_COUNT=$(node -e "
        const Database = require('better-sqlite3');
        const db = new Database('server/data/pois.db');
        const r = db.prepare('SELECT COUNT(*) as c FROM city_pois').get();
        console.log(r.c);
      " 2>/dev/null || echo "?")
      echo "  📊 本地数据库: ${CITY_COUNT} 个城市"
    fi

    echo ""
    echo "═══════════════════════════════════════════"
    echo "  ✅ 数据同步完成"
    echo "═══════════════════════════════════════════"
    ;;

  push)
    echo "═══════════════════════════════════════════"
    echo "  📤 导出并提交数据"
    echo "═══════════════════════════════════════════"

    echo ""
    echo "  [1/2] 从本地数据库导出 cache-export.json..."
    node scripts/db-export.js

    echo ""
    echo "  [2/2] 提交数据变更..."
    git add data-sync/cache-export.json
    DIFF_SIZE=$(git diff --cached --stat data-sync/cache-export.json | head -1)
    if [ -n "$DIFF_SIZE" ]; then
      BRANCH_NAME="data/refresh-$(date '+%Y-%m-%d')"
      git checkout -b "$BRANCH_NAME" 2>/dev/null || git checkout "$BRANCH_NAME"
      git commit -m "data: refresh POI data $(date '+%Y-%m-%d %H:%M')"
      echo "  ✅ 数据已提交到分支 ${BRANCH_NAME}"
      echo ""
      echo "  推送命令:"
      echo "    git push origin ${BRANCH_NAME}"
    else
      echo "  ℹ️  数据无变化，无需提交"
    fi

    echo ""
    echo "═══════════════════════════════════════════"
    echo "  ✅ 数据导出完成"
    echo "═══════════════════════════════════════════"
    ;;

  server)
    echo "═══════════════════════════════════════════"
    echo "  📥 从服务器拉取最新 pois.db"
    echo "═══════════════════════════════════════════"

    echo ""
    echo "  从 ${SERVER_IP} 拉取 /data/aitrip/pois.db ..."
    mkdir -p server/data
    scp "${SERVER_USER}@${SERVER_IP}:${SERVER_DATA_DIR}/pois.db" ./server/data/pois.db

    echo ""
    echo "  ✅ 服务器数据已同步到本地"
    echo "═══════════════════════════════════════════"
    ;;

  *)
    echo "用法: bash scripts/sync-data.sh [pull|push|server]"
    echo ""
    echo "  pull   - 辅助机：从 GitHub 拉取最新数据 + 导入本地数据库"
    echo "  push   - 主开发机：导出本地采集数据 + 提交到 Git 分支"
    echo "  server - 辅助机：从服务器直接拉取 pois.db"
    ;;
esac
