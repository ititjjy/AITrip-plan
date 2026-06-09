# POI 数据管理员 Wiki

> Trip-Planner 项目 — POI 数据采集、分类、评分与管理的完整知识体系。

## 角色文档

| 文件 | 用途 |
|------|------|
| [poi-data-agent-role.md](poi-data-agent-role.md) | **角色定义**：职责范围、工作流程、交接协议、质量标准 |
| [webdev-agent-role.md](webdev-agent-role.md) | 网站开发工程师角色定义（参考） |
| [ops-agent-role.md](ops-agent-role.md) | **运维工程师角色定义**：部署流程、交接协议、运维标准 |

## 专项知识库

| 文件 | 用途 | 更新频率 |
|------|------|---------|
| [knowledge/poi-pipeline-kb.md](knowledge/poi-pipeline-kb.md) | 数据管道全貌、RawPOI 结构、合并去重算法、数据源指南 | 管道变更时更新 |
| [knowledge/city-data-kb.md](knowledge/city-data-kb.md) | 城市双文件架构、字段规范、新增城市流程、常见问题 | 城市数据变更时更新 |
| [knowledge/scoring-kb.md](knowledge/scoring-kb.md) | 评分公式详解、完整度/置信度计算、低分诊断、发布标准 | 评分策略变更时更新 |

## 分类迭代记录

| 文件 | 用途 | 更新频率 |
|------|------|---------|
| [error-notebook.md](error-notebook.md) | 错题本：记录分类错误案例 | 每次发现错误时追加 |
| [principles.md](principles.md) | 分类原则：从错题提炼的规则（当前 10 条） | 发现新模式时更新 |
| [confusion-pairs.md](confusion-pairs.md) | 混淆对分析：类目间混淆统计矩阵 | 错题本更新后同步 |
| [review-guide.md](review-guide.md) | 审核指南：抽样策略与录入方法 | rarely 变动 |
| [changelog.md](changelog.md) | 变更日志：分类规则代码修改记录 | 每次应用原则后追加 |

## 分类迭代工作流

```
  抽样审核              错题本              分析提炼             代码变更
 ┌─────────┐      ┌─────────────┐      ┌─────────────┐      ┌────────────┐
 │ 审核 POI │─────▶│ 追加错题条目 │─────▶│ 提炼/更新原则│─────▶│ 修改分类器  │
 │ 发现错误  │      │ error-      │      │ principles  │      │ classifier │
 └─────────┘      │ notebook    │      └──────┬──────┘      └─────┬──────┘
                  └──────┬──────┘             │                   │
                         │                    │                   ▼
                         ▼                    │            ┌────────────┐
                  ┌─────────────┐             │            │ reprocess  │
                  │ confusion-  │             └───────────▶│ 验证修正   │
                  │ pairs.md    │              新错误反馈    └────────────┘
                  └─────────────┘
```

## 当前统计

- 错题记录: 0 条
- 分类原则: 10 条 (全部为初始种子，来自代码审查)
- 已应用变更: 0 次
- 最近更新: 2026-06-01 (知识库创建)

## 6 个 L1 类目速查

| 类目 | 中文 | 说明 |
|------|------|------|
| scenic | 景点 | 自然与人文景观、公园、历史遗迹 |
| food | 餐饮 | 餐厅、咖啡馆、酒吧、美食集市 |
| shopping | 购物 | 商场、特色店铺、集市、免税店 |
| entertainment | 娱乐 | 主题乐园、剧院演出、夜生活、体育 |
| experience | 体验 | 户外活动、文化体验、手工坊、温泉 |
| hotel | 酒店 | 酒店、民宿、度假村、青旅 |

## 运维知识库

| 文件 | 用途 | 更新频率 |
|------|------|---------|
| [../.qoder/knowledge/ops/infrastructure.md](../.qoder/knowledge/ops/infrastructure.md) | 三层架构、服务器环境、PM2/Nginx、数据流、定时任务 | 架构变更时更新 |
| [../.qoder/knowledge/ops/deployment.md](../.qoder/knowledge/ops/deployment.md) | 脚本详解、发布流程、版本号规范、回滚策略 | 脚本变更时更新 |
| [../.qoder/knowledge/ops/troubleshooting.md](../.qoder/knowledge/ops/troubleshooting.md) | 8 类故障诊断手册 | 发现新故障时追加 |

## 快速操作入口

1. **发现分类错误** → [error-notebook.md](error-notebook.md) 追加记录
2. **新城市上线** → [knowledge/city-data-kb.md](knowledge/city-data-kb.md) 查看流程
3. **评分异常排查** → [knowledge/scoring-kb.md](knowledge/scoring-kb.md) 查看诊断表
4. **理解数据管道** → [knowledge/poi-pipeline-kb.md](knowledge/poi-pipeline-kb.md)
5. **角色职责边界** → [poi-data-agent-role.md](poi-data-agent-role.md)
