---
name: ops-env-manager
version: 1.0.0
description: Manage AITrip environment variables and API keys. Use when user says environment variables, API key, secrets, .env, or needs to rotate credentials.
description_zh: 管理 AITrip 环境变量和 API 密钥。当用户提到环境变量、API key、密钥、.env、需要轮换凭证时使用。
---

# 环境变量与密钥管理 (ops-env-manager)

## 环境文件位置

| 文件 | 位置 | 用途 |
|------|------|------|
| `.env.local` | 项目根目录 | 本地开发和服务器的环境变量 |
| `ecosystem.config.cjs` | 项目根目录 | PM2 进程环境变量（NODE_ENV, PORT） |

## API Key 清单

| 变量名 | 消费方 | 用途 | 格式 |
|--------|--------|------|------|
| `ARK_API_KEY` | `server/qwen.ts` + `server/qwen-hotels.ts` | 网站在线 POI 推荐 + 酒店推荐 | `ark-xxx` |
| `DASHSCOPE_API_KEY` | `agent/sources/ai.ts` | Agent 数据采集（AI 数据源） | `sk-xxx` |
| `VITE_DASHSCOPE_API_KEY` | `scripts/daily-refresh.js` + 前端 | 每日刷新 + 前端构建时注入 | `sk-xxx` |

## .env.local 文件格式

```bash
# 火山引擎豆包 ARK API Key（网站在线服务用）
ARK_API_KEY=ark-xxxxx

# 阿里云百联 DashScope API Key（Agent 采集 + 数据脚本用）
DASHSCOPE_API_KEY=sk-xxxxx
VITE_DASHSCOPE_API_KEY=sk-xxxxx
```

## Key 轮换流程

### Step 1：获取新 Key

从对应平台获取新的 API Key：
- 火山引擎 ARK → 控制台获取新 Key
- 阿里云百联 DashScope → 控制台获取新 Key

### Step 2：更新本地 .env.local

```bash
vi .env.local
# 更新对应的 Key 值
```

### Step 3：本地验证

```bash
# 重启本地服务验证
npx tsx server/index.ts
curl http://localhost:3001/api/health
# 确认 hasApiKey: true
```

### Step 4：更新服务器

```bash
# SSH 到服务器
ssh <user>@<server-ip>
cd /opt/aitrip

# 更新 .env.local
vi .env.local

# 重启 PM2（必须加 --update-env）
pm2 restart aitrip --update-env

# 验证
curl -s http://localhost:3001/api/health
```

### Step 5：提交变更（如需）

`.env.local` 已在 `.gitignore` 中，**不会**被提交到仓库。
如果需要在多台机器同步，需手动复制文件。

## 安全规则

1. **绝不提交** `.env.local` 到 Git 仓库
2. `.gitignore` 已包含 `.env.local` 规则
3. API Key 不出现在代码注释或日志中
4. 轮换后旧 Key 应在平台端撤销

## PM2 环境变量更新

PM2 启动时会缓存环境变量。修改 `.env.local` 后必须使用 `--update-env`：

```bash
# 正确：更新环境变量
pm2 restart aitrip --update-env

# 错误：不会读取新的环境变量
pm2 restart aitrip
```

对于 `ecosystem.config.cjs` 中的变量（NODE_ENV, PORT），需要重新加载配置：

```bash
pm2 delete aitrip
pm2 start ecosystem.config.cjs --env production
```

## 诊断 Key 问题

```bash
# 检查健康检查中的 Key 状态
curl http://localhost:3001/api/health
# {"ok":true,"hasApiKey":false} → ARK_API_KEY 未生效

# 检查 PM2 环境变量
pm2 env aitrip | grep -i key

# 检查 .env.local 文件
cat .env.local | grep -v "^#" | grep "="
```

## 详细参考

- 基础设施架构：`.qoder/knowledge/ops/infrastructure.md`
- 故障诊断手册：`.qoder/knowledge/ops/troubleshooting.md` → API Key 失效
