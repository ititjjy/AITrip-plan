# 知识库：POI 评分体系

> 适用角色：POI 数据管理员 Agent
> 最后更新：2026-06-01

---

## 一、评分公式

```
total = 0.55 × completeness + 0.45 × confidence + quality_bonus
```

**评级**：
- **A 级**：total ≥ 85
- **B 级**：65 ≤ total < 85
- **C 级**：45 ≤ total < 65
- **D 级**：total < 45

---

## 二、完整度（completeness）

### 计算方式

基于 4 个核心字段的命中情况计算，最高 100 分：

| 字段 | 权重 | 判断条件 |
|------|------|---------|
| 坐标（lat/lng） | 25 分 | `lat !== 0 && lng !== 0` |
| 名称（name） | 25 分 | `name.length > 0` |
| 地址（address） | 25 分 | `address && address.length > 0` |
| 类别（category） | 25 分 | `category && category.length > 0` |

**completeness = 命中字段数 × 25**

### 质量加成项（quality_bonus）

以下字段存在可获得额外加分（总加分上限 +10）：

| 字段 | 加分 |
|------|------|
| description（描述文字，长度>20） | +3 |
| rating（评分数值） | +2 |
| reviewCount（评论数 > 10） | +2 |
| imageUrl（图片链接） | +2 |
| hours（营业时间） | +1 |

---

## 三、置信度（confidence）

### 计算方式

```
confidence = baseScore × (1 - conflictPenalty)
```

#### baseScore（基础分，基于来源数量）

| 来源数量 (sourceCount) | baseScore |
|----------------------|-----------|
| 1 | 60 |
| 2 | 78 |
| ≥ 3 | min(sourceCount × 10, 100) = 最高 100 |

> **注意**：`sourceCount` 必须从 `sourceSet.size` 取，其中 `sourceSet = new Set(group.map(p => p.source))`，`sources = [...sourceSet]`（数组），**数组没有 `.size` 属性**，会返回 `undefined`，导致 NaN。

#### conflictPenalty（冲突惩罚）

```
conflictPenalty = conflictPairs / comparablePairs × 0.3
```

- `conflictPairs`：存在冲突的字段对数量
- `comparablePairs`：可比较的字段对数量
- 最大惩罚系数为 0.3（即使所有字段都冲突，置信度仍保留 70%）

---

## 四、评分诊断方法

### 查看城市整体评分分布

```bash
npx tsx agent/index.ts quality --city beijing
# 输出类似：
# A: 457 (98.3%)  B: 8 (1.7%)  C: 0  D: 0
```

### 定位低分 POI

通过 Admin API 按评分筛选：
```
GET /api/admin/pois?city=beijing&grade=D&limit=20
```

### 手动计算验证

```typescript
import { computePOIScore } from './agent/merger.js'
const score = computePOIScore(poi, conflictReport)
console.log(score)
// { completeness: 100, confidence: 78, qualityBonus: 7, total: 88.1, grade: 'A' }
```

---

## 五、常见低分原因与处理

| 问题 | 症状 | 处理方式 |
|------|------|---------|
| 全部 D 级 | 所有 total = NaN | 检查 `detectConflicts()` 的 `sourceCount = sourceSet.size` |
| 大量 C/D 级 | completeness 低 | 检查采集数据是否缺 address 字段；优先补充 amap/google 数据源 |
| 单源数据置信度低 | confidence ≈ 60 | 正常（单源最高 60），增加数据源覆盖度可提高 |
| 多源但冲突高 | confidence 低于预期 | 检查同名 POI 的 address/category 是否来自不同地区 |
| 评分未更新 | reprocess 后分数未变 | 确认修改已保存，加 `--no-cache` 参数 |

---

## 六、发布质量标准

**合格发布标准**（按城市）：

```
✅ A+B 级 POI 占比 ≥ 90%
✅ scenic 类目 ≥ 50 条 A/B 级
✅ food 类目 ≥ 50 条 A/B 级
✅ shopping 类目 ≥ 30 条 A/B 级
✅ 无坐标落在城市范围外（±15km）的 POI
```

**预警阈值**（触发人工审核）：

```
⚠️  某类目 D 级占比 > 20%
⚠️  总 POI 数量减少 > 15%（相比上次发布）
⚠️  A 级 POI 数量减少 > 10%
```

---

## 七、评分历史追踪

每次 reprocess 后，建议在 `wiki/changelog.md` 记录评分分布变化：

```markdown
## 2026-06-01 · 北京数据重处理

- **触发原因**：修复 sourceCount undefined Bug（merger.ts:353）
- **修改文件**：agent/merger.ts
- **修改内容**：`sources.size` → `sourceSet.size`

| 评级 | 修改前 | 修改后 |
|------|-------|-------|
| A    | 0     | 457   |
| B    | 0     | 8     |
| C    | 0     | 0     |
| D    | 465   | 0     |
```
