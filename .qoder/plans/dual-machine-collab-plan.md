# AITrip 双电脑协作开发方案

## Context

用户有两台 Mac 电脑需要协同开发 AITrip 项目：
- **主开发机**：办公电脑，连公司内网，有阿里郎安全软件限制（SSH/git push 间歇性不可用、微信开发者工具受限）
- **辅助开发机**：个人 Mac，无任何网络限制，能正常访问 GitHub 和阿里云服务器

核心痛点：双端分别甚至同时开发时如何避免代码冲突和数据不一致。

---

## 1. Git 分支策略：Feature Branch + 共享 main

**核心规则：禁止直接在 main 上开发，所有变更走功能分支。**

### 分支命名

| 场景 | 前缀 | 示例 |
|------|------|------|
| 主开发机功能 | `feat/office-` | `feat/office-hotel-booking` |
| 辅助机功能 | `feat/home-` | `feat/home-trip-share` |
| 修复 | `fix/office-` / `fix/home-` | `fix/office-dedup-crash` |
| 数据更新 | `data/refresh-` | `data/refresh-2026-06-16` |
| 小程序 | `feat/mini-` | `feat/mini-login-flow` |

### 合并规则

- **辅助机负责合并到 main**（因为它始终能访问 GitHub）
- 辅助机自己的功能分支，测试通过后自行合并推送
- 主开发机推送功能分支后通知辅助机合并测试

### 冲突预防

- 开发前通过 IM 沟通分工范围，避免同时改同一文件
- 合并前必须 `git pull origin main`
- `cache-export.json` 只在 `data/` 分支修改，辅助机不碰

---

## 2. 数据同步机制

### 三端数据流向

```
主开发机 agent.db (55MB, 不进Git)
       │ npm run agent:export / node scripts/db-export.js
       ▼
cache-export.json (18MB, 进Git + LFS)
       │ git push → server-pull.sh 步骤5自动导入
       ▼
服务器 /data/aitrip/pois.db + 辅助机 server/data/pois.db
```

### 具体改动

#### 2a. agent.db 移出 Git（解决 55MB 大文件警告）

文件：`.gitignore`

```diff
+ # Agent 采集数据库（大文件，不进 Git）
+ agent/data/agent.db
+ agent/data/agent.db-shm
+ agent/data/agent.db-wal
```

执行：
```bash
git rm --cached agent/data/agent.db agent/data/agent.db-shm agent/data/agent.db-wal
```

#### 2b. cache-export.json 启用 Git LFS

执行：
```bash
git lfs install
git lfs track "data-sync/cache-export.json"
# 这会生成 .gitattributes
```

#### 2c. 辅助机获取数据

- 方式1（推荐）：`git pull origin main` + `node scripts/import-cache.js`
- 方式2：`scp root@8.130.215.28:/data/aitrip/pois.db ./server/data/pois.db`

#### 2d. 新增数据同步脚本

文件：`scripts/sync-data.sh`

- `bash scripts/sync-data.sh pull`：拉取最新 cache-export.json + 导入本地 pois.db
- `bash scripts/sync-data.sh push`：导出本地数据 + 提交 cache-export.json 变更

---

## 3. 部署流程：辅助机是部署门卫

| 职责 | 主开发机 | 辅助机 |
|------|----------|--------|
| 代码推 GitHub | 有网时 push 分支 | 始终可 push |
| 合并到 main | 不参与 | **负责** |
| 发布 tag + 部署 | 不参与 | **负责** |
| 数据采集+导出 | **负责** | 不参与 |

### 标准部署链路

```
主开发机: 采集数据 → export → push data/ 分支
辅助机:   fetch → merge → 测试 → release.sh → SSH server-pull.sh
```

### 主开发机网络不通时的应急

- 走阿里代码库：`git push alibaba feat/office-xxx`
- 辅助机拉取：`git fetch alibaba && git checkout -b feat/office-xxx alibaba/feat/office-xxx`

---

## 4. 辅助开发机初始化

```bash
# 1. 克隆
git clone git@github.com:ititjjy/AITrip-plan.git aitrip && cd aitrip
git lfs install && git lfs pull

# 2. 添加阿里代码库
git remote add alibaba git@code.alibaba-inc.com:ET_PlatformMarktingProduct_AITest/AItrip.git

# 3. 安装依赖
npm install
cd miniprogram && yarn install && cd ..

# 4. 配置环境变量（从主开发机复制 .env.local）

# 5. 导入数据
node scripts/import-cache.js

# 6. 验证本地服务
npm run dev:all   # 前端(5173) + 后端(3001)

# 7. SSH 免密
ssh-copy-id -i ~/.ssh/id_ed25519.pub root@8.130.215.28
```

需要从主开发机复制的文件：`.env.local`（API Key 等敏感配置）

---

## 5. 需要修改/新增的文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `.gitignore` | 修改 | 添加 agent.db* 排除规则 |
| `.gitattributes` | 新增 | Git LFS 追踪 cache-export.json |
| `scripts/sync-data.sh` | 新增 | 辅助机数据同步脚本 |
| `scripts/deploy.sh` | 修改 | 辅助机部署版本（去掉自动 commit，增加分支合并检查） |
| `vite.config.ts` | 修改 | proxy target 从 3002 改为 3001（当前端口不一致） |

---

## 6. 验证步骤

1. 主开发机：`git rm --cached agent/data/agent.db*` → 更新 .gitignore → `git lfs track` → push
2. 辅助机：clone → `git lfs pull` → `npm install` → `node scripts/import-cache.js` → `npm run dev:all` → 浏览器验证
3. 辅助机：`ssh root@8.130.215.28 "cd /opt/aitrip && bash scripts/server-pull.sh"` → 验证部署
4. 双端各推一个功能分支 → 辅助机合并 → 验证无冲突
