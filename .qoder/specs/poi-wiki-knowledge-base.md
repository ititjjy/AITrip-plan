# POI 分类知识库 (Wiki Knowledge Base)

## Context

POI 分类器 (`agent/classifier.ts`) 使用关键词匹配 + 排除规则将 POI 分入 6 个 L1 类目。当前分类规则主要来自代码层面的硬编码，缺少一个系统性的知识积累机制来捕获人工审核发现的分类错误和分类智慧。

用户需要一个"错题本"驱动的知识库，通过持续记录、分析、提炼分类错误模式，逐步提升分类准确性。

## 目录结构

在项目根目录创建 `wiki/` 目录，包含 6 个文件：

```
wiki/
├── README.md                  # 入口：导航、工作流、统计概览
├── error-notebook.md          # 错题本：核心文件，按时间倒序追加错误记录
├── principles.md              # 分类原则：从错题中提炼的规则（living doc）
├── confusion-pairs.md         # 混淆对分析：哪些类目对最容易混淆
├── review-guide.md            # 审核指南：如何高效抽样和记录错误
└── changelog.md               # 变更日志：wiki 驱动的代码变更记录
```

## 核心文件设计

### 1. `error-notebook.md` (错题本)

单文件、追加式、按时间倒序（新条目在最上面）。每条记录包含 4 个区块：

**区块 1 — POI 信息** (表格)
| 字段 | 说明 |
|------|------|
| POI 名称 | 主名称 + 中英文名 |
| POI ID | 系统 ID（如有）|
| 城市 | 所在城市 |
| 当前分类 | L1.L2.L3 路径 + 中文标签 |
| POI 描述 | 描述摘要（~100字）|
| 关键词命中 | 触发了哪些分类关键词及分值 |

**区块 2 — 错误分析** (表格)
| 字段 | 说明 |
|------|------|
| 错误类型 | L1错误 / L2错误 / L3错误 / 应排除 |
| 正确分类 | 正确的 L1.L2.L3 路径 |
| 错误原因 | 分类器为什么判错 |

**区块 3 — 人工推理** (自由文本段落)
最核心的部分 — 人类是如何判断这个 POI 应该属于哪个类目的推理过程。

**区块 4 — 行动项** (YAML 代码块，可机器解析)
```yaml
action_type: add_exclusion  # add_keyword | add_exclusion | remove_keyword | adjust_score | add_principle | none
target_file: agent/classifier.ts
target_section: CATEGORY_EXCLUSIONS.scenic
detail: 具体修改描述
related_entries: [关联的错题编号]
status: pending  # pending | applied | superseded
```

文件顶部有统计摘要（总记录数、最常见混淆对、最近更新）。

### 2. `principles.md` (分类原则)

从错题中提炼出的分类规则。按**混淆对**组织（如 scenic↔experience），每条原则包含：
- 混淆机制分析
- 判断规则（可测试的条件）
- 来源错题编号
- 推荐代码修改
- 生命周期状态：🔍观察中 → 📝待应用 → ✅已应用 → 🔄已修正 → ❌已废弃

初始种子：从 `classifier.ts` 现有排除规则中提取 ~10 条已知原则（如"游泳馆不是酒店""商业综合体不是景点"等），标记为 ✅已应用，为用户提供参考示例。

### 3. `confusion-pairs.md` (混淆对分析)

6×6 混淆矩阵热力图，统计各 L1 类目对之间的误判次数，指导优化优先级。

### 4. `review-guide.md` (审核指南)

抽样策略、分类错误识别清单、错题录入步骤说明。

### 5. `changelog.md` (变更日志)

记录每次由 wiki 驱动的代码变更，关联原则编号和错题编号，含 commit hash。

### 6. `README.md` (入口)

导航链接、工作流图（抽样→错题→原则→代码→验证）、当前统计。

## 工作流

```
抽样审核         错题本            分析提炼           代码变更
┌────────┐    ┌───────────┐    ┌───────────┐    ┌────────────┐
│ 审核POI │───▶│ 追加错题   │───▶│ 提炼原则   │───▶│ 修改分类器  │
│ 发现错误 │    │ error-    │    │ principles│    │ classifier │
└────────┘    │ notebook  │    └───────────┘    └─────┬──────┘
              └─────┬─────┘          ▲                │
                    │                │                ▼
                    ▼                │          ┌────────────┐
              ┌───────────┐         │          │ reprocess  │
              │ confusion │         └──────────│ 验证修正    │
              │ pairs.md  │           新错误反馈  └────────────┘
              └───────────┘
```

## 实现步骤

1. 创建 `wiki/` 目录
2. 创建 `wiki/README.md` — 完整导航、工作流图、统计占位
3. 创建 `wiki/error-notebook.md` — 头部、统计区、条目模板、0 条初始记录
4. 创建 `wiki/principles.md` — 从 `classifier.ts` 现有排除规则种子 ~10 条初始原则
5. 创建 `wiki/confusion-pairs.md` — 空矩阵
6. 创建 `wiki/review-guide.md` — 完整审核指南
7. 创建 `wiki/changelog.md` — 头部和模板

## 关键文件

- `wiki/` (新建) — 全部 6 个 wiki 文件
- `agent/classifier.ts` — 只读参考，提取现有排除规则作为种子原则
- `agent/categories.ts` — 只读参考，类目层级结构

## 验证方式

- 检查所有 6 个 wiki 文件存在且内容完整
- 确认 `principles.md` 中的种子原则与 `classifier.ts` 中的实际排除规则对应
- 确认 `error-notebook.md` 的条目模板可直接复制使用
