# Raw Data 持久化与采集/处理分离

## Context

当前 POI 采集管道将「采集 → 清洗 → 合并」全部串联：`collectCity()` 并行调用 5 个数据源获取 `RawPOI[]`，然后在内存中合并到 `allRawPOIs`，接着调用 `mergeAndDeduplicate()` → `cleanPOIs()` → `upsertPOIs()`，最终只保存处理后的 POI。RawPOI[] 从未持久化，每次调整清洗/合并策略都必须重新调用 API 采集，浪费时间和 API 配额。

**目标**: 在采集和处理之间插入一个持久化的 raw 数据层，使两者可以独立运行。

## 架构变化

```
现状:   Sources → RawPOI[] (内存) → merge → clean → upsertPOIs → city_pois

目标:   Phase 1 (采集):  Sources → RawPOI[] → saveRawPOIs → raw_pois 表
        Phase 2 (处理):  raw_pois → loadRawPOIs → merge → clean → upsertPOIs → city_pois
```

两个 phase 通过 `raw_pois` 表解耦，可独立触发。

## 修改清单

### 1. `agent/db.ts` — 新增 raw_pois 表 + 4 个 CRUD 函数

**initTables()** (L86 之后，`city_stats` 表创建之前) 新增:

```sql
CREATE TABLE IF NOT EXISTS raw_pois (
  city_id      TEXT    NOT NULL,
  source       TEXT    NOT NULL,
  data         TEXT    NOT NULL,
  items_count  INTEGER NOT NULL DEFAULT 0,
  collected_at INTEGER NOT NULL,
  PRIMARY KEY (city_id, source)
)
CREATE INDEX IF NOT EXISTS idx_raw_city ON raw_pois (city_id)
```

**新增 4 个导出函数:**

```typescript
// 保存某城市某数据源的原始数据 (INSERT OR REPLACE = 覆盖旧数据)
saveRawPOIs(cityId: string, source: string, data: RawPOI[]): void

// 加载某城市所有来源的原始数据
loadRawPOIs(cityId: string): { source: string; data: RawPOI[]; collected_at: number }[]

// 按来源加载单条原始数据
loadRawPOIsBySource(cityId: string, source: string): RawPOI[] | null

// 获取所有 raw 数据摘要 (给 status 命令用)
getRawPOIsSummary(): { city_id: string; source: string; items_count: number; collected_at: number }[]
```

### 2. `agent/index.ts` — 核心重构

#### 2a. 提取 `processRawData()` 函数

将 `collectCity()` 中 L187-L211 的后处理逻辑提取为独立函数:

```typescript
function processRawData(
  city: SourceCityInfo,
  allRawPOIs: RawPOI[],
  sourceNames: string[],
): { pois: number; success: boolean } {
  // 1. mergeAndDeduplicate(allRawPOIs, city, AGENT_CONFIG.targetPOIsPerCategory)
  // 2. cleanPOIs(pois, city)
  // 3. evaluateQuality(cleaned, city)
  // 4. upsertPOIs(city.id, cleaned)
  // 5. updateCityStats(city.id, { ... })
  // 6. return { pois, success: true }
}
```

#### 2b. 修改 `collectCity()` (L120-L214)

在每个数据源采集成功后 (L141 之后) 添加一行:

```typescript
const rawPOIs = await collector.collect(city, categories)
saveRawPOIs(city.id, collector.name, rawPOIs)  // ← 新增
```

然后将 L187-L211 的 inline 处理替换为:

```typescript
return processRawData(city, allRawPOIs, collectors.map(c => c.name))
```

#### 2c. 新增 `cmdReprocess()` 命令

```typescript
async function cmdReprocess(args: CLIArgs): Promise<void> {
  // 1. loadCities() 确定目标城市 (支持 --city / --all / --batch)
  // 2. 对每个城市: loadRawPOIs(city.id)
  //    - 无数据 → 警告跳过
  //    - 有数据 → flatten → processRawData(city, allRawPOIs, sourceNames)
  // 3. 打印汇总 (成功/失败/跳过)
}
```

#### 2d. 修改 `cmdRefresh()` 增量流程 (L556-L567)

在增量采集循环中添加 raw 数据保存:

```typescript
const raw = await collector.collect(city, categories)
saveRawPOIs(city.id, collector.name, raw)  // ← 新增
```

#### 2e. 增强 `cmdStatus()` (L374-L443)

在 "Data Age Distribution" 之后添加 raw 数据覆盖摘要:

```
Raw Data Coverage:
  Total city×source pairs: 5
  shanghai: osm(150) ai(80) foursquare(60) google(45) amap(70) = 405 items
```

#### 2f. 路由和 CLI 参数

- `main()` switch 添加 `case 'reprocess'`
- `parseArgs()` 添加 `--skip-collect` 参数
- `cmdCollect()` 中检测 `--skip-collect`: 若为 true，跳过采集阶段，直接读 raw_pois 后调 processRawData()
- `cmdHelp()` 添加 reprocess 命令帮助文本

### 3. `package.json` — 新增 script

```json
"agent:reprocess": "tsx agent/index.ts reprocess"
```

## 不修改的文件

- `agent/merger.ts` — 被 `processRawData()` 调用，无需改动
- `agent/quality.ts` — 被 `processRawData()` 调用，无需改动
- `agent/similarity.ts` — 无需改动
- `agent/classifier.ts` — 无需改动
- `server/` — 无需改动（server 读的是 city_pois，不受影响）

## 命令行用法

```bash
# 正常采集 (行为不变，但额外保存 raw data)
pnpm agent:collect --city shanghai

# 跳过采集，用已有 raw data 重新处理
pnpm agent:collect --city shanghai --skip-collect

# 独立 reprocess 命令
pnpm agent:reprocess --city shanghai

# 所有有 raw data 的城市重新处理
pnpm agent:reprocess --all

# 修改 merger.ts 阈值后，只需:
pnpm agent:reprocess --city shanghai
# 不需要重新调用任何 API
```

## 验证方案

1. **编译验证**: `tsc -p tsconfig.app.json --noEmit && tsc -p server/tsconfig.build.json`
2. **采集验证**: 运行 `agent:collect --city shanghai` (仅 OSM+AI 可用)，确认:
   - `raw_pois` 表出现 (shanghai, osm) 和 (shanghai, ai) 两行
   - `city_pois` 结果与之前一致
3. **重处理一致性**: 运行 `agent:reprocess --city shanghai`，确认输出 POI 数量与 collect 一致
4. **策略调整验证**: 临时改 `MERGE_THRESHOLD` → reprocess → POI 数量变化 → 改回 → reprocess → 恢复
5. **状态展示**: `agent:status` 显示 raw data 覆盖信息
