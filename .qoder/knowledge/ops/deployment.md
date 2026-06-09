> 适用角色：运维工程师 Agent | 最后更新：2026-06-01

# 部署与发布流程

## 发布流程全貌

```
本地 macOS                          阿里云 ECS
───────────                         ───────────

1. 开发完成
   npm run build 通过
        │
2. release.sh ──────→ 版本号升级
   ├── 更新 package.json             Git Tag 创建
   ├── 推送 origin (GitHub)
   └── 推送 alibaba (阿里代码库)
                                     │
3. SSH 到服务器 ◄─────────────────────┘
   server-pull.sh
   ├── [1/7] 双源寻优拉取
   ├── [2/7] 显示变更日志
   ├── [3/7] npm install
   ├── [4/7] npm run build
   ├── [5/7] POI 缓存数据导入
   ├── [6/7] PM2 重启
   └── [7/7] 健康检查
              │
              ├── 成功 → 部署完成
              └── 失败 → 自动回滚到旧版本
```

## 脚本清单

| 脚本 | 路径 | 执行环境 | 用途 | 关键参数 |
|------|------|----------|------|----------|
| release.sh | `scripts/release.sh` | 本地 macOS | 版本发布 | `patch`(默认) / `minor` / `major` / `x.y.z` |
| server-pull.sh | `scripts/server-pull.sh` | 服务器 ECS | 一键部署 | `[version]`（可选，如 `v0.3.2`） |
| server-rollback.sh | `scripts/server-rollback.sh` | 服务器 ECS | 版本回滚 | `[version]`（无参数列出可用版本） |
| local-daily-run.sh | `scripts/local-daily-run.sh` | 本地 macOS | 数据导出+发布 | `AUTO_CONFIRM=1` 跳过确认 |
| setup-launchd.sh | `scripts/setup-launchd.sh` | 本地 macOS | 安装定时任务 | 无参数 |
| daily-refresh.js | `scripts/daily-refresh.js` | 服务器 ECS | 每日POI刷新 | `DEBUG=1` / `FORCE_CITY=<id>` |
| db-export.js | `scripts/db-export.js` | 本地 macOS | 数据库导出JSON | 无参数 |
| import-cache.js | `scripts/import-cache.js` | 服务器 ECS | 缓存导入数据库 | 无参数 |
| migrate-season-pk.js | `scripts/migrate-season-pk.js` | 任意 | DB Schema 迁移 | 无参数 |

## 版本号规范

遵循 SemVer 语义化版本：`MAJOR.MINOR.PATCH`

| release.sh 参数 | 效果 | 示例 |
|----------------|------|------|
| `patch`（默认） | PATCH +1 | v0.3.2 → v0.3.3 |
| `minor` | MINOR +1, PATCH 归零 | v0.3.2 → v0.4.0 |
| `major` | MAJOR +1, 其余归零 | v0.3.2 → v1.0.0 |
| `x.y.z` | 指定任意版本 | v0.3.2 → v1.2.3 |

### release.sh 执行流程

1. 检查工作区是否有未提交改动（有则提示提交）
2. 计算新版本号
3. 用户确认发布
4. 更新 `package.json` 版本号
5. 提交 `data-sync/cache-export.json`（如存在新数据）
6. 创建 Git Tag（`-a "v{version}" -m "Release v{version}"`）
7. 推送 origin (GitHub) + tags
8. 推送 alibaba (阿里代码库) + tags
9. 输出服务器部署命令

## 回滚策略

### 自动回滚（server-pull.sh 内置）

以下情况 server-pull.sh 会自动回滚到部署前版本：
- `npm install` 失败（Step 3）
- `npm run build` 失败（Step 4）
- 健康检查失败（Step 7）

自动回滚动作：`git reset --hard $OLD_COMMIT` → 重新 install → 重新 build → 重启 PM2

### 手动回滚（server-rollback.sh）

用于部署后发现严重问题需要回退：

```bash
# 查看可用版本
bash scripts/server-rollback.sh

# 回滚到指定版本
bash scripts/server-rollback.sh v0.3.2
```

手动回滚流程：
1. 列出可用版本（无参数时）或验证目标版本存在
2. 用户确认回滚
3. `git checkout` 或 `git reset --hard` 到目标版本
4. `npm install` + `npm run build`
5. PM2 重启
6. 健康检查

## POI 数据同步机制

### 数据同步触发条件（server-pull.sh Step 5）

```bash
# 比较 cache-export.json 和 pois.db 的修改时间
if [ "$SYNC_MTIME" -gt "$DB_MTIME" ]; then
    node scripts/import-cache.js
fi
```

- 仅当 `data-sync/cache-export.json` 比 `/data/aitrip/pois.db` 更新时才执行导入
- 导入失败不影响服务运行（仅输出警告）

### 数据流完整路径

```
本地 agent/data/agent.db
  → db-export.js → data-sync/cache-export.json
  → git commit + push
  → server-pull.sh 拉取
  → import-cache.js → /data/aitrip/pois.db
```

## 健康检查协议

### 检查方式

```bash
curl -s http://localhost:3001/api/health
```

### 期望响应

```json
{ "status": "ok", "hasApiKey": true }
```

### 健康检查失败排查步骤

1. **PM2 进程是否存在**：`pm2 status`
2. **PM2 日志是否有错误**：`pm2 logs aitrip --lines 30`
3. **端口是否被占用**：`lsof -i :3001`
4. **数据库文件是否存在**：`ls -la /data/aitrip/pois.db`
5. **环境变量是否配置**：检查 `.env.local` 或 PM2 环境配置
6. **Nginx 是否正常**：`nginx -t` + `tail /var/log/nginx/error.log`
