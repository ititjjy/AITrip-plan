---
name: ops-rollback
version: 1.0.0
description: Rollback AITrip production server to a previous version. Use when user says rollback, revert, emergency, restore, or when deployment causes critical issues.
description_zh: 将 AITrip 生产服务器回滚到历史版本。当用户提到回滚、恢复、emergency、紧急，或部署导致严重问题时使用。
---

# 紧急回滚操作 (ops-rollback)

## 何时回滚

| 场景 | 是否回滚 | 说明 |
|------|----------|------|
| 健康检查失败（部署自动触发） | 自动回滚 | server-pull.sh 自动处理 |
| 部署后核心功能异常 | 手动回滚 | 使用 server-rollback.sh |
| 构建失败（部署自动触发） | 自动回滚 | server-pull.sh 自动处理 |
| 非核心功能小 Bug | 不回滚 | 通知开发 Agent 修复后重新部署 |

## 回滚步骤

### Step 1：查看可用版本

```bash
cd /opt/aitrip
bash scripts/server-rollback.sh
```

输出示例：
```
当前版本: v0.3.3

可用版本（最近 15 个）:
  ○ v0.3.3  2026-06-01  Release v0.3.3 ← 当前
  ○ v0.3.2  2026-05-31  Release v0.3.2
  ○ v0.3.1  2026-05-30  Release v0.3.1
  ...
```

### Step 2：执行回滚

```bash
bash scripts/server-rollback.sh v0.3.2
```

### Step 3：确认回滚

脚本会提示确认，输入 `y` 继续。

### 回滚流程（4 步）

| 步骤 | 动作 |
|------|------|
| 1/4 | `git checkout` 或 `git reset --hard` 到目标版本 |
| 2/4 | `npm install` + `npm run build` |
| 3/4 | PM2 重启（使用 ecosystem.config.cjs 或 fallback） |
| 4/4 | `curl /api/health` 健康检查 |

## 回滚后验证

```bash
# 健康检查
curl -s http://localhost:3001/api/health

# PM2 状态
pm2 status

# 版本确认
git describe --tags --always

# 日志检查（确认无 ERROR）
pm2 logs aitrip --lines 20
```

## 回滚后根因分析

回滚后应排查导致回滚的原因：

1. **查看 PM2 日志**：`pm2 logs aitrip --lines 50`
2. **对比版本差异**：`git log --oneline v0.3.2..v0.3.3`
3. **检查代码变更**：`git diff v0.3.2..v0.3.3 -- server/`
4. **通知开发 Agent**：告知问题版本和错误日志，请求修复
5. **修复后重新部署**：使用 ops-deploy skill

## 回滚脚本自身失败

如果 server-rollback.sh 中的构建失败，脚本会自动恢复到回滚前的版本。

手动紧急恢复：
```bash
cd /opt/aitrip
git reset --hard $(git describe --tags --always)
npm install --production=false
npm run build
pm2 restart aitrip
```

## 详细参考

- 回滚策略：`.qoder/knowledge/ops/deployment.md`
- 故障诊断：`.qoder/knowledge/ops/troubleshooting.md`
