---
name: ops-health-check
version: 1.0.0
description: Check AITrip service health, diagnose issues, and monitor server status. Use when user says health check, service status, monitoring, why is it down, or needs to verify service availability.
description_zh: 检查 AITrip 服务健康状态、诊断问题和监控服务器。当用户提到健康检查、服务状态、监控、为什么挂了时使用。
---

# 健康检查与监控诊断 (ops-health-check)

## Step 1：快速健康检查

```bash
# 本地检查（SSH 到服务器后执行）
curl -s http://localhost:3001/api/health
```

**期望响应**：
```json
{"status":"ok","hasApiKey":true}
```

| 响应 | 含义 | 下一步 |
|------|------|--------|
| `{"status":"ok","hasApiKey":true}` | 一切正常 | 无需操作 |
| `{"status":"ok","hasApiKey":false}` | 服务正常但 API Key 缺失 | 配置环境变量 |
| Connection refused | 服务未运行 | Step 2 |
| 超时 | 服务可能卡住 | Step 2 + Step 5 |

## Step 2：PM2 进程状态

```bash
pm2 status                         # 查看进程状态
pm2 logs aitrip --lines 30         # 查看最近日志
pm2 logs aitrip --err --lines 20   # 只看错误日志
```

**状态解读**：
- `online` — 正常运行
- `errored` — 启动失败，查看日志
- `stopped` — 已停止，需要 `pm2 start`
- restart 次数过高 — 检查 crash 原因

## Step 3：端口与进程检查

```bash
lsof -i :3001                      # 检查端口占用
ps aux | grep node                 # Node.js 进程
```

## Step 4：Nginx 检查

```bash
nginx -t                           # 配置语法检查
tail -20 /var/log/nginx/error.log  # Nginx 错误日志
tail -20 /var/log/nginx/access.log # Nginx 访问日志
```

## Step 5：资源监控

```bash
df -h                              # 磁盘使用率
free -m                            # 内存使用
top -bn1 | head -20                # CPU 和进程
```

**告警阈值**：
- 磁盘使用 > 90% — 需要清理日志或扩容
- 内存使用 > 90% — 需要优化或扩容
- CPU 持续 > 80% — 需要排查性能问题

## 诊断决策树

```
curl /api/health 结果？
│
├── Connection refused
│   └── pm2 status 结果？
│       ├── 无 aitrip 进程 → pm2 start ecosystem.config.cjs
│       ├── errored → pm2 logs 查看错误
│       └── online → 端口不匹配（检查 ecosystem.config.cjs）
│
├── 返回 ok 但网站打不开
│   └── Nginx 问题
│       ├── nginx -t 报错 → 修复 Nginx 配置
│       ├── 502 → 上游未运行或端口不匹配
│       └── 504 → 超时（检查 AI API 响应时间）
│
├── 返回 ok 但 AI 功能不工作
│   └── hasApiKey 检查
│       ├── false → 配置 ARK_API_KEY
│       └── true → API 服务端问题或限流
│
└── 超时
    └── 进程可能卡住
        ├── pm2 restart aitrip
        └── 检查是否有死锁或资源耗尽
```

## Step 6：数据库完整性

```bash
# 检查数据库文件
ls -la /data/aitrip/pois.db*

# 完整性校验
sqlite3 /data/aitrip/pois.db "PRAGMA integrity_check"

# 数据量统计
sqlite3 /data/aitrip/pois.db "SELECT count(*) FROM city_pois"
```

## 定时巡检清单

日常巡检建议按此顺序执行：

1. `curl /api/health` — 服务存活
2. `pm2 status` — 进程状态
3. `pm2 logs aitrip --err --lines 10` — 有无新错误
4. `df -h` — 磁盘空间
5. `free -m` — 内存使用
6. `tail -5 /data/aitrip/refresh.log` — 定时刷新是否正常

## 详细参考

- 基础设施架构：`.qoder/knowledge/ops/infrastructure.md`
- 故障诊断手册：`.qoder/knowledge/ops/troubleshooting.md`
