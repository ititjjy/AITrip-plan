# POI 数据清洗合并策略 & 增量更新机制

## Context

当前 Agent 的 `merger.ts` 使用简单的 name+coord 聚类进行去重，缺乏以下能力：
- 精确的字符串相似度（Levenshtein、简称-全称模式、子串包含检测）
- 内容级验证（费用/标签/时长对比，防止同名不同体验的误合并）
- 跨类目冲突解决（同一 POI 在不同来源被标记为不同 L1 类目）
- Union-Find 传递性去重（A≈B, B≈C → A≈C）
- 增量更新机制（在 baseline 基础上以最小成本保持数据新鲜度）

`server/dedup.ts`（752 行，v3）已有成熟算法。本次将其核心能力移植到 Agent 并扩展为 6 类目模型 + 增量更新。

---

## 新建文件

### 1. `agent/similarity.ts` — 相似度引擎 (~300 行)

从 `server/dedup.ts` 移植核心算法，适配 Agent 的 `RawPOI` 数据模型。

**字段映射:**
| server/dedup.ts | agent RawPOI |
|---|---|
| `name` | `namePrimary` |
| `nameZh` | `nameZh` |
| `type` | `categoryL1` |
| `duration` | `visitDuration` |
| (无) | `nameEn`, `addressEn` |

**导出函数:**

```
stringSimilarity(a, b) → number (0-1)
  - Levenshtein 编辑距离 (O(min(m,n)) 空间)
  - 预处理: 小写化, 去空格, 统一 CJK 标点
  - 子串包含检测: 短串占长串 ≥60% → 提升至 0.92
  - 简称-全称模式: 150+ 地理后缀词典 (中/日/英), 前缀匹配 → ≥0.90

geoSimilarity(lat1, lng1, lat2, lng2) → number (0-1)
  - Haversine 距离 + 柔和衰减: 1/(1+(d/500)²)
  - 无效坐标 → 0.5 (中性值)

contentSimilarity(a, b) → number (0-1)
  - costSim(35%): 都免费→1.0, 一免一费→0.0, 都收费→min/max
  - tagSim(45%): Jaccard 系数, 都空→0.5
  - durationSim(20%): min/max, 缺失→0.5

nameSimilarity(a, b) → number (0-1)
  - 三轨比对: namePrimary + nameZh + nameEn, 取最大值
  - 过滤无效 nameZh/nameEn ("0", 空串, 单字符)

addressSimilarity(a, b) → number (0-1)
  - stringSimilarity(address) + stringSimilarity(addressEn), 取较大值
  - 都空 → 0.5

compositeSimilarity(a, b) → { score, path, details }
  五条决策路径 (见下文)

isInvalidPOI(poi) → boolean
  - 坐标(0,0), 纯数字名称, namePrimary<2字符
```

**compositeSimilarity 决策树:**

```
Path A — 同 L1, 近完美同名 (nameSim ≥ 0.95):
  contentSim ≥ 0.70 → MERGE (return nameSim)
  contentSim < 0.70 → 混合分 (nameSim×0.50 + contentSim×0.50, 通常 <0.9)

Path B — 同 L1, 高相似名 (0.90-0.95):
  geoSim ≥ 0.06 (≈2km内) + contentSim ≥ 0.50 → MERGE
  否则 → 降级到 Path E

Path C — 跨 L1, 密切相关对 (scenic↔experience, entertainment↔experience, food↔experience):
  nameSim ≥ 0.90 + contentSim ≥ 0.65 + geoSim ≥ 0.06 → MERGE
  否则 → 加权混合 (contentSim 占 35% 拉低分数, 防止常规路径误合并)

Path D — 跨 L1, 非相关对 (其他所有跨类组合):
  nameSim ≥ 0.95 + contentSim ≥ 0.80 + geoSim ≥ 0.20 → MERGE (极端置信)
  否则 → 保守混合 (nameSim×0.20 + contentSim×0.30 + addrSim×0.20 + geoSim×0.30)

Path E — 常规加权:
  nameSim×0.45 + addressSim×0.25 + geoSim×0.30
```

**跨类目密切关系矩阵:**
```
              scenic  food  shopping  entertainment  experience  hotel
scenic          —      ✗      ✗            ✗              ✓         ✗
food            ✗      —      ✗            ✗              ✓         ✗
shopping        ✗      ✗      —            ✗              ✗         ✗
entertainment   ✗      ✗      ✗            —              ✓         ✗
experience      ✓      ✓      ✗            ✓              —         ✗
hotel           ✗      ✗      ✗            ✗              ✗         —
```

### 2. `agent/classifier.ts` — 类目分类器 (~250 行)

将 server 的二分类 `classifyType()` 扩展为 6 类目分类。

**三层关键词打分:**
- 后缀词 (+5): 检查 namePrimary/nameZh 的结尾 (如 "公园"→scenic, "体验"→experience)
- 名称词 (+2): 出现在 namePrimary/nameZh 中的关键词
- 描述词 (+1): 出现在 description/tags 中的关键词

**六类关键词词典 (示例):**
| L1 | 后缀词示例 | 名称词示例 | 描述词示例 |
|---|---|---|---|
| scenic | 公园/寺/山/城堡/park/temple | 遗址/景区/monument | 位于/坐落于/建于 |
| food | 餐厅/饭店/食堂/restaurant/cafe | 料理/美食/菜 | 招牌菜/特色菜/主厨 |
| shopping | 商场/百货/市场/mall/outlet | 店铺/免税 | 购物/品牌/折扣 |
| entertainment | 乐园/赌场/剧院/casino | 表演/演出/夜生活 | 观看/欣赏/门票 |
| experience | 体验/工坊/课程/workshop/class | 徒步/潜水/瑜伽 | 可以参加/提供体验/学习 |
| hotel | 酒店/旅馆/民宿/hotel/hostel | 住宿/客房/度假 | 入住/退房/房间 |

**导出函数:**
```
classifyCategory(poi) → { l1, confidence, scores }
  - 对 6 个 L1 类目分别打分
  - 返回最高分类目 + 置信度 (winner/sum)
  - 平局优先级: scenic > experience > entertainment > food > shopping > hotel

resolveCategoryConflict(pois) → { l1, l3, method }
  - Step 1: 多数投票 (>50% 来源一致)
  - Step 2: 来源可靠性加权 (osm:3, google:2, foursquare:2, amap:2, ai:1)
  - Step 3: 分类器裁决 (作为 tiebreaker)
  - method 字段记录使用了哪种路径

resolveCategoryL3(l1, candidates) → string
  - 在已确定的 L1 下, 从多个候选 L3 中选最具体的
```

### 3. `agent/incremental.ts` — 增量更新系统 (~200 行)

无固定周期，完全由调度器根据优先级自动决定。

**导出函数:**
```
shouldRunIncremental(db) → { shouldRun, reason, suggestedCities }
  - 检查上次采集距今时间 + 城市数据新鲜度分布
  - 如果 >50% 城市数据超过 7 天 → 建议增量更新
  - 如果 >50% 城市数据超过 30 天 → 建议全量刷新

selectIncrementalCities(cities, db, maxCities) → CityInfo[]
  - 复用 scheduler.calculatePriorities() 的优先级评分
  - 跳过 3 天内已采集的城市
  - 选取 top N (默认 cities.length/4)

selectIncrementalSources() → SourceCollector[]
  - 选 2 个最廉价可用来源: OSM(免费) > AI > Foursquare > Amap > Google
  - 全量刷新时: 使用全部可用来源

mergeIncremental(existingPOIs, newRawPOIs, city) → MergeResult
  - 将已有 POI 转为 RawPOI-like 形式参与比对
  - 新 POI 与已有 POI 通过 similarity engine 匹配
  - 三种结果:
    匹配 → 增强已有 POI (填补空白字段, 更新更好数据)
    无匹配的新 POI → 添加
    无匹配的已有 POI → 保留不变 (保证数据稳定性)

checkValidity(pois, city, sources) → ValidityReport
  - 全量刷新时使用
  - 检查 POI 是否仍出现在至少一个来源中
  - 未找到的标记为 potentially_stale (不自动删除, 标记待审)
  - 报告: { valid, stale, augmented, new }
```

**增量更新流程:**
```
collectCityIncremental(city):
  1. getCachedPOIs(city.id) → 加载已有数据
  2. 用 2 个廉价来源采集新数据
  3. mergeIncremental(existing, newRaw, city)
  4. quality check
  5. upsertPOIs(city.id, merged)
  6. version++
```

---

## 修改文件

### 4. `agent/merger.ts` — 重写合并管道 (~350 行)

**新管道 (替换当前简单聚类):**

```
Input: RawPOI[] from all sources
  │
  Step 1: Pre-filter (isInvalidPOI, 坐标远离城市 >100km)
  │
  Step 2: L1 类目内分组 + 地理预分桶
  │  (坐标 round 到 0.01° 作为桶 key, 只比较同桶/相邻桶)
  │
  Step 3: 两两相似度 + Union-Find
  │  compositeSimilarity() ≥ threshold(0.90) → union(i, j)
  │
  Step 4: 跨类目去重
  │  对密切相关的 L1 对 (scenic↔experience, entertainment↔experience,
  │  food↔experience) 执行跨组比对, 使用 Path C 规则
  │
  Step 5: 类目冲突解决
  │  混合 L1 的 Union-Find 组 → resolveCategoryConflict()
  │
  Step 6: 数据合并
  │  Base: 最长 description
  │  三名: 从各来源填补 nameZh/nameEn
  │  评分: 来源可靠性加权平均 (osm/google > foursquare/amap > ai)
  │  费用: 非零值中位数
  │  标签: 并集, max 6
  │  地址: 最长本地 + 最长英文
  │  时长: 非零值中位数
  │  月度指数: 优先非 AI, 然后平均
  │  最佳季节: 并集
  │
  Step 7: 后分类检查
  │  classifyCategory() 对每个合并后 POI 打分
  │  仅当置信度 >0.9 且全部来自 AI 来源时才覆盖分类
  │
  Output: POI[] (top 100 per L1) + MergeStats
```

**MergeResult 扩展:**
```typescript
interface MergeResult {
  pois: POI[]
  stats: {
    totalRaw: number
    invalidFiltered: number
    afterDedup: number
    afterMerge: number
    byCategory: Record<string, number>
    crossCategoryMerges: number
    categoryReclassifications: number
    duplicatePairs: number
    mergeDetails: MergeDetail[]  // 每对合并的详情 (用于调试)
  }
}
```

### 5. `agent/db.ts` — Schema 扩展

**新增表:**
```sql
CREATE TABLE IF NOT EXISTS refresh_cycles (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  cycle_type   TEXT    NOT NULL,  -- 'baseline' | 'incremental' | 'full_refresh'
  status       TEXT    NOT NULL,  -- 'running' | 'completed' | 'failed'
  started_at   INTEGER NOT NULL,
  completed_at INTEGER,
  config       TEXT    NOT NULL DEFAULT '{}',  -- JSON
  results      TEXT    NOT NULL DEFAULT '{}'   -- JSON
)
```

**修改 `city_pois` 表:**
- 新增 `version INTEGER NOT NULL DEFAULT 1` 列 (每次成功更新 +1)

**新增函数:**
```
insertRefreshCycle(cycle) / updateRefreshCycle(id, updates)
getLatestRefreshCycle() / getRefreshHistory(limit?)
incrementCityVersion(cityId) / getCityVersion(cityId)
```

### 6. `agent/index.ts` — 新增 CLI 命令

**新增 `refresh` 命令:**
```
npx tsx agent/index.ts refresh                   # 自动决定模式
npx tsx agent/index.ts refresh --baseline         # 强制 baseline
npx tsx agent/index.ts refresh --full             # 强制全量刷新
npx tsx agent/index.ts refresh --city <id>        # 指定城市
npx tsx agent/index.ts refresh --max-cities <N>   # 限制城市数
```

**新增 `validate` 命令:**
```
npx tsx agent/index.ts validate                   # 全部城市
npx tsx agent/index.ts validate --city <id>       # 指定城市
```

**修改 `status` 命令:** 增加显示 refresh_cycles 状态和数据年龄分布。

### 7. `agent/config.ts` — 新增配置

```typescript
// 合并参数
mergeThreshold: 0.90,              // 综合相似度阈值
crossCategoryMergeEnabled: true,   // 允许跨类目合并 (密切对)
crossCategoryThreshold: 0.90,      // 跨类目合并阈值

// 增量更新参数
incrementalMaxCities: 50,          // 增量模式最大城市数
incrementalMinDaysGap: 3,          // 跳过 N 天内已采集的城市
staleThresholdDays: 30,            // 数据过期阈值
validityCheckSampleSize: 10,       // 全量校验时抽样数

// 来源可靠性权重
sourceReliability: {
  osm: 3, google: 2, foursquare: 2, amap: 2, ai: 1,
}
```

### 8. `agent/quality.ts` — 小幅扩展

- 新增类目一致性检查: POI 关键词强烈暗示其他 L1 时 flag warning
- 新增 `evaluateFreshness(pois, updatedAt)` 函数: 基于数据年龄的新鲜度评分

### 9. `agent/scheduler.ts` — 集成增量模式

- `calculatePriorities` 新增 `incrementalMode` 参数
- 增量模式下: 跳过 `incrementalMinDaysGap` 天内已采集的城市
- 新增 `dataAgeDays` 因子

### 10. `package.json` — 新增脚本

```json
"agent:refresh": "tsx agent/index.ts refresh",
"agent:validate": "tsx agent/index.ts validate"
```

---

## 实现顺序

| 步骤 | 文件 | 内容 |
|---|---|---|
| 1 | `agent/similarity.ts` | 相似度引擎 (stringSimilarity, geoSimilarity, contentSimilarity, nameSimilarity, addressSimilarity, compositeSimilarity, isInvalidPOI) |
| 2 | `agent/classifier.ts` | 6 类目分类器 + 冲突解决 |
| 3 | `agent/merger.ts` | 重写合并管道 (集成 similarity + classifier + Union-Find + 地理预分桶) |
| 4 | `agent/db.ts` | Schema 扩展 (refresh_cycles 表 + version 列) |
| 5 | `agent/incremental.ts` | 增量更新逻辑 (shouldRunIncremental, mergeIncremental, checkValidity) |
| 6 | `agent/config.ts` | 新增配置参数 |
| 7 | `agent/quality.ts` | 类目一致性检查 + evaluateFreshness |
| 8 | `agent/scheduler.ts` | 增量模式集成 |
| 9 | `agent/index.ts` | refresh/validate 命令 + status 增强 |
| 10 | `package.json` | 新脚本 |

---

## 验证方案

1. **单元测试 (similarity.ts):**
   - 移植 server/test-dedup.ts 中的测试用例, 适配 RawPOI 格式
   - 测试: 简称-全称 ("上野公园"↔"上野恩赐公园"), 跨类型保护, 内容验证

2. **集成测试:**
   - `npx tsx agent/index.ts collect --city sanya --sources osm` → 验证单来源采集+合并
   - `npx tsx agent/index.ts collect --city tokyo --sources osm,ai` → 验证多来源合并去重
   - 对比新旧 merger 的输出, 确认误合并率降低

3. **增量更新测试:**
   - baseline: `npx tsx agent/index.ts refresh --baseline --city sanya`
   - incremental: `npx tsx agent/index.ts refresh --city sanya`
   - 验证已有 POI 不被错误删除, 新 POI 被正确添加

4. **质量检查:**
   - `npx tsx agent/index.ts quality --city sanya` → 确认质量评分合理
   - `npx tsx agent/index.ts validate --city sanya` → 验证有效性报告
