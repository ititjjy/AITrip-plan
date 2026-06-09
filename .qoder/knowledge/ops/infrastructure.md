> 适用角色：运维工程师 Agent | 最后更新：2026-06-01

# 基础设施架构

## 三层架构总览

```
┌─────────────────────────────────────────────────────────┐
│                    本地开发环境 (macOS)                     │
│  项目路径：~/行程规划 demo/                                  │
│  运行时：Node.js 20+ | npm | tsx                          │
│  定时任务：launchd (每天 12:00 执行 local-daily-run.sh)      │
└───────────┬──────────────────────┬──────────────────────┘
            │ git push origin      │ git push alibaba
            ▼                      ▼
┌───────────────────────┐  ┌───────────────────────────────┐
│  GitHub (origin)       │  │  阿里代码库 (alibaba)           │
│  主远程仓库             │  │  镜像远程 + 服务器拉取主通道      │
│  git@github.com:       │  │  https://code.alibaba-inc.com/ │
│  ititjjy/AITrip-plan   │  │  ET_PlatformMarktingProduct_  │
│                        │  │  AITest/AItrip.git            │
└───────────┬───────────┘  └──────────┬────────────────────┘
            │                          │
            │    server-pull.sh 双源寻优  │
            └────────────┬─────────────┘
                         ▼
┌─────────────────────────────────────────────────────────┐
│                  阿里云 ECS 服务器                          │
│  部署路径：/opt/aitrip (代码)                               │
│  数据路径：/data/aitrip (pois.db + 日志)                    │
│  运行时：Node.js 20+ | PM2 (进程名: aitrip)                │
│  端口：3001 | Nginx 反向代理 (180s 超时)                    │
│  定时任务：crontab (每天 03:00 执行 daily-refresh.js)       │
└─────────────────────────────────────────────────────────┘
```

## 代码同步原则

1. **本地先行**：所有代码变更必须先在本地完成编译和验证
2. **双端推送**：`release.sh` 自动推送到 GitHub 和阿里代码库
3. **主通道**：服务器优先从 GitHub 拉取，失败自动切阿里代码库
4. **禁止直改**：禁止在服务器上直接修改代码

## 生产服务器详细配置

| 配置项 | 值 |
|--------|---|
| 云服务商 | 阿里云 ECS |
| 代码路径 | `/opt/aitrip` |
| 数据路径 | `/data/aitrip` |
| Node.js | v20.20.2 |
| 进程管理 | PM2，进程名 `aitrip` |
| 监听端口 | 3001 |
| 健康检查 | `GET /api/health` |
| 反向代理 | Nginx |
| Nginx 超时 | proxy_read_timeout 180s, proxy_connect_timeout 180s |
| 数据库 | SQLite (better-sqlite3)，文件 `pois.db` |

## PM2 配置

`ecosystem.config.cjs` 位于项目根目录：

```javascript
module.exports = {
  apps: [{
    name: 'aitrip',
    script: 'npm',
    args: 'start',
    cwd: '/opt/aitrip',
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3001
    }
  }]
}
```

**常用 PM2 命令**：
- `pm2 start ecosystem.config.cjs --env production` — 启动服务
- `pm2 restart aitrip` — 重启
- `pm2 restart aitrip --update-env` — 重启并更新环境变量
- `pm2 stop aitrip` — 停止
- `pm2 delete aitrip` — 删除进程
- `pm2 status` — 查看状态
- `pm2 logs aitrip` — 查看日志
- `pm2 logs aitrip --lines 50` — 查看最近 50 行日志

## Nginx 配置要点

- 反向代理 `proxy_pass http://localhost:3001`
- `proxy_read_timeout` 和 `proxy_connect_timeout` 设为 180s
  - 原因：AI API（豆包/DashScope）首次无缓存请求可能耗时超过 60s
- 静态文件服务指向 `dist/` 目录
- HTTPS 证书管理（SSL）

## 数据流

```
Agent DB (agent/data/agent.db)
    │ 数据管理员执行 export
    ▼
data-sync/cache-export.json (JSON 格式)
    │ git commit + push
    ▼
GitHub / 阿里代码库
    │ server-pull.sh 自动检测 mtime
    ▼
import-cache.js (导入到生产 DB)
    ▼
/data/aitrip/pois.db (生产数据库)
```

**数据库路径策略**：
- 优先读取 `DB_DIR` 环境变量
- 未设置时自动检测 `/data/aitrip` 目录是否存在
- 存在 → 使用 `/data/aitrip/pois.db`
- 不存在 → 回退到项目内路径 `server/data/pois.db`

## 定时任务

### macOS 本地 (launchd)

| 配置 | 值 |
|------|---|
| 任务名 | com.aitrip.daily |
| 安装脚本 | `scripts/setup-launchd.sh` |
| 执行时间 | 每天 12:00 |
| 执行脚本 | `scripts/local-daily-run.sh` |
| 输出日志 | `server/data/launchd-out.log` |
| 错误日志 | `server/data/launchd-err.log` |

### 服务器 (crontab)

| 配置 | 值 |
|------|---|
| 执行时间 | 每天 03:00 |
| 执行脚本 | `scripts/daily-refresh.js` |
| 日志 | `/data/aitrip/refresh.log` |
| 状态文件 | `/data/aitrip/refresh-state.json` |
