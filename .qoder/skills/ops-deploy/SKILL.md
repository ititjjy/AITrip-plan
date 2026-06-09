---
name: ops-deploy
version: 1.0.0
description: Deploy AITrip application to Alibaba Cloud ECS server. Use when user says deploy, server-pull, publish to server, or needs to update the production environment.
description_zh: 将 AITrip 应用部署到阿里云 ECS 服务器。当用户提到部署、server-pull、发布到服务器时使用。
---

# 服务器部署操作 (ops-deploy)

## 前置条件

1. 代码已推送到 GitHub 或阿里代码库（由开发/数据 Agent 完成）
2. SSH 可连接到阿里云 ECS 服务器
3. 确认要部署的版本（最新 main 或指定 tag）

## 部署步骤

### 部署最新版本

```bash
# SSH 到服务器
ssh <user>@<server-ip>

# 执行部署脚本
cd /opt/aitrip
bash scripts/server-pull.sh
```

### 部署指定版本

```bash
cd /opt/aitrip
bash scripts/server-pull.sh v0.3.2
```

## 部署流程（7 步）

server-pull.sh 自动执行以下步骤：

| 步骤 | 动作 | 失败处理 |
|------|------|----------|
| 1/7 | 双源寻优拉取（优先 GitHub，失败切阿里代码库） | 检查网络 |
| 2/7 | 显示变更日志 | - |
| 3/7 | `npm install --production=false` | 自动回滚 |
| 4/7 | `npm run build` | 自动回滚 |
| 5/7 | POI 缓存数据导入（mtime 比较） | 不影响服务 |
| 6/7 | PM2 重启 | 检查 PM2 |
| 7/7 | `curl /api/health` 健康检查 | 自动回滚 |

## 部署后验证

```bash
# 1. 健康检查
curl -s http://localhost:3001/api/health

# 2. PM2 状态
pm2 status

# 3. 最近日志（确认无 ERROR）
pm2 logs aitrip --lines 10

# 4. 版本号确认
cd /opt/aitrip && git describe --tags --always
```

## 失败处理

### 拉取失败（双源均不可达）

```bash
# 检查远程仓库配置
git remote -v

# 手动尝试拉取
git fetch alibaba main --tags
git fetch origin main --tags

# 检查网络连通性
ping code.alibaba-inc.com
ping github.com
```

### 构建失败

脚本自动回滚。通知开发 Agent 修复编译错误后重新部署。

### 健康检查失败

脚本自动回滚。如果自动回滚也失败，手动执行：

```bash
cd /opt/aitrip
git reset --hard $(git describe --tags --abbrev=0 HEAD~1)
npm install --production=false
npm run build
pm2 restart aitrip
```

如需指定版本回滚，使用 `server-rollback.sh`（参考 ops-rollback skill）。

## 详细参考

- 部署流程全貌：`.qoder/knowledge/ops/deployment.md`
- 基础设施架构：`.qoder/knowledge/ops/infrastructure.md`
- 故障诊断手册：`.qoder/knowledge/ops/troubleshooting.md`
