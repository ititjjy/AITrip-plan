# AITrip 行程规划 - Agent 协作路由表

> 版本：v2.0 | 更新日期：2026-06-11
> 本文件定义五个 Agent 的职责边界、路由规则和协作协议。

---

## 一、角色注册表

| 角色 ID | 中文名 | 职责摘要 |
|---------|--------|----------|
| `poi-collector-agent` | POI 数据采集师 | 各渠道原始数据采集、Raw 数据库维护、城市元数据配置、采集计划监控 |
| `poi-engineer-agent` | POI 数据攻城狮 | Raw 数据加工清洗合并、分类迭代、质量评分、POI Admin 开发、版本管理 |
| `ops-agent` | 网站运维攻城狮 | 服务器部署、版本发布、服务监控、PM2/Nginx 管理、环境变量 |
| `webdev-agent` | 网站开发攻城狮 | Web 前端 UI / 后端 API / AI 集成 / 算法 / 测试 |
| `miniprogram-agent` | 微信小程序攻城狮 | 小程序端 UI 开发、微信 API 对接、小程序发布与版本管理 |

---

## 二、关键词路由表

接收用户指令后，先按关键词快速匹配到对应 Agent：

### 采集关键词 → poi-collector-agent

```
采集 | collect | 数据源 | raw_pois | 原始数据 | 采集批次
增量更新 | 采集计划 | city-registry | city-coords | 城市元数据
数据源接口 | osm | foursquare | amap | doubao | spark | google
```

### 加工关键词 → poi-engineer-agent

```
加工 | reprocess | 分类 | classifier | 评分 | merger | 质量审核
错题本 | 知识库 | export | 数据发布 | 版本管理 | 数据质量
POI Admin | 审核队列 | city_pois | 去重合并
```

### 运维关键词 → ops-agent

```
部署 | deploy | 服务器 | PM2 | Nginx | SSH | 回滚 | rollback
发布版本 | release | 打tag | version | 健康检查 | health | 服务状态
环境变量 | API Key | 密钥 | .env | 磁盘 | 内存 | CPU
crontab | launchd | 定时任务 | 日志 | logs | 重启 | restart
上线 | 发布到服务器 | server-pull | 备份 | 恢复
502 | 504 | 宕机 | 挂了 | 超时 | timeout
```

### Web 开发关键词 → webdev-agent

```
页面 | 组件 | component | API | React | UI | bug | 功能 | 样式
路由 | 端点 | endpoint | TypeScript | CSS | Tailwind | 动画
表单 | 按钮 | 交互 | 设计系统 | 响应式 | 加载状态 | 报错提示
地图 | Leaflet | 行程 | 酒店详情 | 首页 | 后端API | 数据库Schema
```

### 小程序关键词 → miniprogram-agent

```
小程序 | miniprogram | 微信 | weapp | Taro | wx.login
小程序页面 | 微信登录 | openid | 分享 | 订阅消息
小程序构建 | 审核 | mp build | rpx | 微信开发者工具
```

---

## 三、模糊意图判定

当关键词命中多个角色或无命中时，按以下顺序判定：

1. **检查引用文件** → 文件属于谁的文件域？
   - `src/*`, `server/*.ts` → webdev-agent
   - `admin/pages/POI*`, `admin/pages/Collection*`, `server/admin-routes.ts` (POI相关) → poi-engineer-agent
   - `admin/pages/Cities`, `admin/pages/Dashboard`, `admin/pages/Updates` → webdev-agent
   - `miniprogram/*` → miniprogram-agent
   - `agent/sources/*`, `agent/index.ts`(collect), `scripts/city-*.json`, `agent/data/agent.db` → poi-collector-agent
   - `agent/classifier.ts`, `agent/merger.ts`, `agent/quality.ts`, `wiki/*`, `data-sync/*` → poi-engineer-agent
   - `scripts/release.sh`, `scripts/server-*.sh`, `ecosystem.config.cjs`, `.env.local` → ops-agent

2. **检查期望终态** → 最终要达成什么？
   - 代码变更（Web 前端/后端功能） → webdev-agent
   - 代码变更（小程序端功能） → miniprogram-agent
   - 数据采集（原始数据入库） → poi-collector-agent
   - 数据加工（分类/评分/合并） → poi-engineer-agent
   - 基础设施变更（部署/发布/配置修改） → ops-agent

3. **检查产出物** → 谁管理最终产物？
   - 产出是线上运行的服务 → ops-agent
   - 产出是 Web 端用户可见的功能界面 → webdev-agent
   - 产出是小程序端用户可见的功能 → miniprogram-agent
   - 产出是 Raw 原始数据 → poi-collector-agent
   - 产出是加工后的 POI 数据 → poi-engineer-agent

**仍无法判定时**：向用户确认意图后再执行。

---

## 四、边界矩阵（跨域协作 RACI）

| 场景 | 运维 | Web开发 | 小程序 | 采集师 | 攻城狮 |
|------|------|---------|--------|--------|--------|
| 新功能上线 | **Deploy** | Lead | — | — | Inform |
| 小程序功能上线 | **Deploy** | Consult | **Lead** | — | — |
| 数据发布到生产 | **Deploy** | Verify | — | Inform | **Lead** |
| 性能问题排查 | **Lead** | Consult | — | Inform | Inform |
| API Key 轮换 | **Lead** | Inform | Inform | Inform | Inform |
| Bug 修复并部署 | Deploy | **Lead** | — | — | Inform |
| 新城市数据采集 | — | — | — | **Lead** | Inform |
| 城市数据加工发布 | Deploy | Inform | — | Inform | **Lead** |
| 微信登录对接 | — | **Build** | Lead | — | — |
| 小程序审核发布 | — | — | **Lead** | — | — |
| 完整版本发布 | **Lead** | Build Verify | Verify | Data Verify | Data Verify |
| 数据库 Schema 迁移 | Execute | **Lead** | — | Consult | Consult |

> **Lead** = 主导执行 | **Deploy** = 负责部署 | **Consult** = 提供咨询 | **Verify** = 验证结果 | **Inform** = 知会通知

---

## 五、协作交接协议

### Pattern A - 代码发布（Web 开发 → 运维）

```
Web 开发 Agent 完成：
  1. npm run build 零报错
  2. 代码已 git commit
  3. 已 push 到 origin (GitHub) + alibaba (阿里代码库)

交接给运维 Agent：
  运维执行 release.sh 发布版本
  运维 SSH 到服务器执行 server-pull.sh 部署
  运维验证健康检查通过
```

### Pattern B - 数据发布（攻城狮 → 运维）

```
攻城狮 Agent 完成：
  1. 数据文件已更新（cache-export.json / city-coords.json）
  2. 已 git commit 数据文件
  3. 已 push 到双仓库

交接给运维 Agent：
  运维 SSH 到服务器执行 server-pull.sh
  运维确认 POI 数据导入成功
  运维验证健康检查通过
```

### Pattern C - 完整发布周期（采集师 → 攻城狮 → 开发 → 运维）

```
Phase 1（采集）：采集师确认 Raw 数据已采集完毕
Phase 2（加工）：攻城师确认数据已加工并导出
Phase 3（开发）：Web 开发 Agent 确认 npm run build 通过
Phase 4（运维）：运维 Agent 执行 release.sh + server-pull.sh + 健康检查
```

### Pattern D - 小程序发布（小程序攻城狮自主管理）

```
小程序攻城狮：
  1. npm run build:weapp 零报错
  2. 微信开发者工具上传代码
  3. 提交审核 → 等待通过 → 发布

如涉及后端变更：
  需 webdev-agent 配合实现后端 API
  需 ops-agent 配合部署服务端更新
```

---

## 六、数据铁律

以下规则不可违反，任何 Agent 不得绕过：

1. **攻城狮严禁直接调用采集渠道补数据** — 发现 Raw 数据不足时，提需求给采集师
2. **采集师严禁操作加工后 POI 数据库** — 你只管 Raw 数据，加工是攻城狮的事
3. **新版 POI 数据不能自动替换旧版** — 需提交版本对比，等用户审批后才可替换
4. **小程序攻城狮严禁开发后端 API** — 需要新 API 时，向 TL 提需求，由 webdev-agent 实现

---

## 七、升级规则

以下场景必须请求人类介入，Agent 不自主处理：

- 服务器完全不可达（SSH 连接失败）
- 数据库文件损坏且无备份
- API Key 疑似泄露需要紧急轮换
- 回滚后健康检查仍然失败
- 磁盘空间耗尽导致服务崩溃
- Git 仓库出现不可恢复的冲突
