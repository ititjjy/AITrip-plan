> 适用角色：运维工程师 Agent | 最后更新：2026-06-01

# 故障诊断手册

## 1. 服务无法启动

**症状**：PM2 进程反复重启或 status 显示 errored

**诊断命令**：
```bash
pm2 status                        # 查看进程状态和重启次数
pm2 logs aitrip --lines 50        # 查看错误日志
lsof -i :3001                     # 检查端口是否被占用
```

**常见根因与修复**：

| 根因 | 症状特征 | 修复 |
|------|----------|------|
| 端口冲突 | `Error: listen EADDRINUSE :::3001` | `kill -9 $(lsof -t -i:3001)` 后重启 |
| 缺少环境变量 | AI 功能不工作但服务能启动 | 更新 `.env.local`，`pm2 restart --update-env` |
| 构建失败 | `dist-server/` 目录不存在或缺失文件 | `npm run build` 重新构建 |
| Node.js 版本不匹配 | 语法错误、module 不兼容 | 确认 Node.js ≥ 20 |
| 依赖缺失 | `Cannot find module 'xxx'` | `npm install` 重新安装 |

## 2. 健康检查失败

**症状**：`curl /api/health` 返回错误或超时

**诊断命令**：
```bash
curl -v http://localhost:3001/api/health    # 详细输出
pm2 logs aitrip --lines 20                  # 最近日志
ls -la /data/aitrip/pois.db                 # 数据库文件
```

**常见根因与修复**：

| 根因 | 返回内容 | 修复 |
|------|----------|------|
| 服务未启动 | Connection refused | `pm2 start ecosystem.config.cjs` |
| DB 路径错误 | 启动时 DB 初始化失败 | 检查 `DB_DIR` 环境变量或 `/data/aitrip` 目录 |
| API Key 缺失 | `{"ok":true,"hasApiKey":false}` | 配置 `.env.local` 中对应的 Key |
| 启动未完成 | 暂时性 Connection refused | 等待 3-5 秒后重试 |

## 3. 部署脚本失败

**server-pull.sh 各步骤失败分析**：

| 步骤 | 失败表现 | 处理 |
|------|----------|------|
| [1/7] 拉取代码 | 双源均不可达 | 检查网络连接、远程仓库 URL |
| [2/7] 变更日志 | 极少失败 | - |
| [3/7] npm install | 依赖安装错误 | 脚本自动回滚；检查 npm registry 网络 |
| [4/7] npm run build | TypeScript 编译错误 | 脚本自动回滚；通知开发 Agent 修复代码 |
| [5/7] POI 数据导入 | import-cache.js 报错 | 不影响服务；检查 cache-export.json 格式 |
| [6/7] PM2 重启 | 进程启动失败 | 参考「服务无法启动」 |
| [7/7] 健康检查 | /api/health 不返回 ok | 脚本自动回滚；参考「健康检查失败」 |

**手动补救**：如果自动回滚失败，手动执行：
```bash
cd /opt/aitrip
git reset --hard $(git describe --tags --abbrev=0 HEAD~1)
npm install --production=false && npm run build
pm2 restart aitrip
```

## 4. Nginx 502/504

**症状**：用户访问网站返回 502 Bad Gateway 或 504 Gateway Timeout

**诊断命令**：
```bash
nginx -t                            # 检查配置语法
tail -20 /var/log/nginx/error.log   # 查看错误日志
curl http://localhost:3001/api/health  # 直接访问上游
pm2 status                          # 检查 Node 进程
```

**常见根因与修复**：

| 根因 | 症状特征 | 修复 |
|------|----------|------|
| 上游服务未运行 | 502 Bad Gateway | 启动 PM2 进程 |
| AI API 超时 | 504 在特定页面出现 | Nginx 超时设 180s（已配置） |
| 端口不匹配 | 502，上游 healthy | 检查 Nginx proxy_pass 端口是否为 3001 |
| 连接数耗尽 | 间歇性 502 | 调整 Nginx worker_connections |

## 5. 数据库损坏

**症状**：SQLite 报错 `database disk image is malformed` 或 `file is not a database`

**诊断命令**：
```bash
sqlite3 /data/aitrip/pois.db "PRAGMA integrity_check"
ls -la /data/aitrip/pois.db*
```

**修复方案**：

1. **WAL 恢复**（如果有 `-wal` 和 `-shm` 文件）：
   ```bash
   sqlite3 /data/aitrip/pois.db "PRAGMA wal_checkpoint(TRUNCATE)"
   ```

2. **从缓存恢复**：
   ```bash
   # 如果 data-sync/cache-export.json 存在
   cd /opt/aitrip
   node scripts/import-cache.js
   ```

3. **重建数据库**：
   ```bash
   # 删除旧数据库，重新初始化
   rm /data/aitrip/pois.db*
   npm run agent:init-db
   # 然后执行数据导入
   node scripts/import-cache.js
   ```

## 6. API Key 失效

**症状**：AI 推荐功能不工作，返回空结果或 API 错误

**关键区分**：

| 环境变量 | 消费方 | 用途 |
|----------|--------|------|
| `ARK_API_KEY` | `server/qwen.ts` + `server/qwen-hotels.ts` | 网站在线 POI/酒店推荐 |
| `DASHSCOPE_API_KEY` | `agent/sources/ai.ts` | Agent 数据采集（AI 数据源） |
| `VITE_DASHSCOPE_API_KEY` | `scripts/daily-refresh.js` + 前端 | 每日刷新 + 前端构建 |

**诊断**：
```bash
# 检查健康检查中的 API Key 状态
curl http://localhost:3001/api/health
# hasApiKey: false → ARK_API_KEY 未配置

# 检查 PM2 环境变量
pm2 env aitrip | grep -i api
```

**修复**：
```bash
# 更新 .env.local
vi /opt/aitrip/.env.local

# 重启 PM2 使环境变量生效
pm2 restart aitrip --update-env
curl http://localhost:3001/api/health
```

## 7. 定时任务不执行

### macOS launchd

**诊断命令**：
```bash
launchctl list | grep aitrip              # 检查任务是否注册
launchctl list com.aitrip.daily           # 查看详细状态
cat ~/Library/LaunchAgents/com.aitrip.daily.plist  # 检查配置
tail server/data/launchd-out.log          # 查看输出日志
tail server/data/launchd-err.log          # 查看错误日志
```

**常见问题**：
- 任务未注册 → 执行 `bash scripts/setup-launchd.sh`
- Node.js 路径错误 → 检查 plist 中的 PATH 环境变量
- 脚本路径变更 → 卸载后重新安装 launchd 任务

### 服务器 crontab

**诊断命令**：
```bash
crontab -l                                # 查看定时任务
tail /data/aitrip/refresh.log             # 查看执行日志
cat /data/aitrip/refresh-state.json       # 查看刷新状态
```

**常见问题**：
- crontab 未配置 → 手动添加 `0 3 * * * cd /opt/aitrip && node scripts/daily-refresh.js >> /data/aitrip/refresh.log 2>&1`
- Node.js 不在 PATH → 使用绝对路径 `/usr/bin/node`
- API 限流 → 检查 `API_DELAY_MS` 和 `CATEGORY_DELAY_MS` 配置

## 8. 双仓库不同步

**症状**：GitHub 和阿里代码库的 commit 不一致

**诊断命令**：
```bash
git remote -v                             # 查看远程仓库 URL
git log --oneline -5 origin/main          # GitHub 最近提交
git log --oneline -5 alibaba/main         # 阿里代码库最近提交
git rev-parse origin/main                 # GitHub HEAD commit
git rev-parse alibaba/main                # 阿里 HEAD commit
```

**修复**：
```bash
# 以本地为准，重新推送到滞后的仓库
git push origin main --tags
git push alibaba main --tags

# 或者从领先的仓库拉取后推送
git fetch origin main
git push alibaba FETCH_HEAD:main --tags
```

**预防**：始终使用 `release.sh` 发布，它会自动推送到双仓库。避免手动 push 单个仓库。
