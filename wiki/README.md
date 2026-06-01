# POI 分类知识库

> 通过人工审核持续改进 POI 分类准确性的知识积累系统。

## 文件导航

| 文件 | 用途 | 更新频率 |
|------|------|---------|
| [error-notebook.md](error-notebook.md) | 错题本：记录分类错误案例 | 每次发现错误时追加 |
| [principles.md](principles.md) | 分类原则：从错题提炼的规则 | 发现新模式时更新 |
| [confusion-pairs.md](confusion-pairs.md) | 混淆对分析：类目间混淆统计 | 错题本更新后同步 |
| [review-guide.md](review-guide.md) | 审核指南：抽样与录入方法 |  rarely 变动 |
| [changelog.md](changelog.md) | 变更日志：代码修改记录 | 每次应用原则后追加 |

## 工作流

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

## 使用方式

1. 日常抽样：按 [review-guide.md](review-guide.md) 的方法审核生成的 POI 数据
2. 发现错误：在 [error-notebook.md](error-notebook.md) 中追加一条记录
3. 积累模式：当同一混淆对出现 3+ 次错误时，在 [principles.md](principles.md) 中提炼原则
4. 应用修改：原则成熟后修改 `agent/classifier.ts`，并在 [changelog.md](changelog.md) 中记录
