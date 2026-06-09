# AITrip 行程规划 - Agent 协作路由表

> 版本：v1.0 | 更新日期：2026-06-01
> 本文件定义三个 Agent 的职责边界、路由规则和协作协议。

---

## 一、角色注册表

| 角色 ID | 中文名 | 职责摘要 |
|---------|--------|----------|
| `ops-agent` | 运维工程师 | 服务器部署、版本发布、服务监控、PM2/Nginx 管理、环境变量、数据库备份 |
| `webdev-agent` | 全栈开发工程师 | 前端 UI / 后端 API / AI 集成 / 算法 / 测试 |
| `poi-data-agent` | POI 数据管理员 | POI 数据采集、分类、评分、城市元数据、知识库维护 |

---

## 二、关键词路由表

接收用户指令后，先按关键词快速匹配到对应 Agent：

### 运维关键词 → ops-agent

```
部署 | deploy | 服务器 | PM2 | Nginx | SSH | 回滚 | rollback
发布版本 | release | 打tag | version | 健康检查 | health | 服务状态
环境变量 | API Key | 密钥 | .env | 磁盘 | 内存 | CPU
crontab | launchd | 定时任务 | 日志 | logs | 重启 | restart
上线 | 发布到服务器 | server-pull | 备份 | 恢复
502 | 504 | 宕机 | 挂了 | 超时 | timeout
```

### 开发关键词 → webdev-agent

```
页面 | 组件 | component | API | React | UI | bug | 功能 | 样式
路由 | 端点 | endpoint | TypeScript | CSS | Tailwind | 动画
表单 | 按钮 | 交互 | 设计系统 | 响应式 | 加载状态 | 报错提示
地图 | Leaflet | 行程 | 酒店详情 | 首页 | 后台页面
```

### 数据关键词 → poi-data-agent

```
POI | 采集 | collect | 分类 | reprocess | 评分 | 城市数据
错题本 | 知识库 | classifier | merger | export | 城市元数据
数据源 | 原始数据 | raw_pois | 去重 | 城市上线 | 数据质量
city-registry | city-coords | 数据发布
```

---

## 三、模糊意图判定

当关键词命中多个角色或无命中时，按以下顺序判定：

1. **检查引用文件** → 文件属于谁的文件域？
   - `src/*`, `server/*.ts`, `admin/*` → webdev-agent
   - `agent/*.ts`, `wiki/*`, `scripts/city-*.json` → poi-data-agent
   - `scripts/release.sh`, `scripts/server-*.sh`, `ecosystem.config.cjs`, `.env.local` → ops-agent

2. **检查期望终态** → 最终要达成什么？
   - 代码变更（新增/修改功能） → webdev-agent
   - 数据变更（POI 增加/修正/分类调整） → poi-data-agent
   - 基础设施变更（部署/发布/配置修改） → ops-agent

3. **检查产出物** → 谁管理最终产物？
   - 产出是线上运行的服务 → ops-agent
   - 产出是用户可见的功能界面 → webdev-agent
   - 产出是结构化的 POI 数据 → poi-data-agent

**仍无法判定时**：向用户确认意图后再执行。

---

## 四、边界矩阵（跨域协作 RACI）

| 场景 | 运维 | 开发 | 数据 |
|------|------|------|------|
| 新功能上线 | **Deploy** | Lead | Inform |
| 数据发布到生产 | **Deploy** | Verify | Lead |
| 性能问题排查 | **Lead** | Consult | Inform |
| API Key 轮换 | **Lead** | Inform | Inform |
| Bug 修复并部署 | Deploy | **Lead** | Inform |
| 新城市数据上线 | Deploy | Inform | **Lead** |
| 完整版本发布 | **Lead** | Build Verify | Data Verify |
| 数据库 Schema 迁移 | Execute | **Lead** | Consult |

> **Lead** = 主导执行 | **Deploy** = 负责部署 | **Consult** = 提供咨询 | **Verify** = 验证结果 | **Inform** = 知会通知

---

## 五、协作交接协议

### Pattern A - 代码发布（开发 → 运维）

```
开发 Agent 完成：
  1. npm run build 零报错
  2. 代码已 git commit
  3. 已 push 到 origin (GitHub) + alibaba (阿里代码库)

交接给运维 Agent：
  运维执行 release.sh 发布版本
  运维 SSH 到服务器执行 server-pull.sh 部署
  运维验证健康检查通过
```

### Pattern B - 数据发布（数据 → 运维）

```
数据 Agent 完成：
  1. 数据文件已更新（cache-export.json / city-coords.json）
  2. 已 git commit 数据文件
  3. 已 push 到双仓库

交接给运维 Agent：
  运维 SSH 到服务器执行 server-pull.sh
  运维确认 POI 数据导入成功
  运维验证健康检查通过
```

### Pattern C - 完整发布周期（数据 → 开发 → 运维）

```
Phase 1（数据）：数据 Agent 确认数据已提交并 push
Phase 2（开发）：开发 Agent 确认 npm run build 通过
Phase 3（运维）：运维 Agent 执行 release.sh + server-pull.sh + 健康检查
```

---

## 六、升级规则

以下场景必须请求人类介入，Agent 不自主处理：

- 服务器完全不可达（SSH 连接失败）
- 数据库文件损坏且无备份
- API Key 疑似泄露需要紧急轮换
- 回滚后健康检查仍然失败
- 磁盘空间耗尽导致服务崩溃
- Git 仓库出现不可恢复的冲突
