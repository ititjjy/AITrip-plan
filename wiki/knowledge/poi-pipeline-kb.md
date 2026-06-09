# 知识库：POI 数据管道

> 适用角色：POI 数据管理员 Agent
> 最后更新：2026-06-01

---

## 一、数据管道全貌

```
原始采集层
──────────────────────────────────────────────────────────────────
  OSM ──┐
  AI  ──┤
  FSQ ──┼──▶ RawPOI[] ──▶ saveRawPOIs() ──▶ raw_pois 表 (agent.db)
  GGL ──┤
  AMAP─┘
                                  │
                                  ▼ reprocess 从此开始
处理合并层
──────────────────────────────────────────────────────────────────
  loadRawPOIs(cityId)
        │
        ▼
  按 L1 类目分组 (categorizePOIs)
        │
        ▼ 并行处理各类目
  ┌─────────────────────────────────────────────┐
  │  单类目内处理                                  │
  │                                              │
  │  1. 地理分桶 (geo-bucketing, 50m 半径)         │
  │  2. Union-Find 名称相似度去重 (≥0.90 阈值)     │
  │  3. 合并同组 POI → 取最丰富字段               │
  │  4. detectConflicts() → ConflictReport       │
  │  5. computePOIScore() → ABCD 评分             │
  └─────────────────────────────────────────────┘
        │
        ▼
  跨类目去重 (crossCategoryThreshold=0.90)
        │
        ▼
  cleanPOIs() → 字段标准化
        │
        ▼
  upsertPOIs() ──▶ city_pois 表 (agent.db)

发布层
──────────────────────────────────────────────────────────────────
  Admin API: POST /api/admin/publish/city
        │
        ▼
  pois.db (server DB) ──▶ 前端网站展示
```

---

## 二、RawPOI 数据结构

```typescript
interface RawPOI {
  id: string          // 格式: <source>_<原始ID>
  source: string      // 'osm' | 'ai' | 'foursquare' | 'google' | 'amap'
  name: string
  nameEn?: string
  lat: number
  lng: number
  address?: string
  description?: string
  category: string    // L1.L2.L3 格式，如 'scenic.nature.park'
  tags?: string[]
  rating?: number
  reviewCount?: number
  priceLevel?: number
  hours?: string
  phone?: string
  website?: string
  imageUrl?: string
}
```

---

## 三、分类体系（三级分类）

### L1 类目（6个）

| L1 | 中文 | 主要场所类型 |
|----|------|------------|
| scenic | 景点 | 公园、自然风光、历史遗迹、博物馆、地标 |
| food | 餐饮 | 餐厅、咖啡馆、酒吧、食市、甜品店 |
| shopping | 购物 | 商场、特色店、集市、免税店、书店 |
| entertainment | 娱乐 | 主题乐园、剧院、夜生活、电影院、体育馆 |
| experience | 体验 | 户外运动、文化手工、温泉、自然教育、岛屿 |
| hotel | 酒店 | 星级酒店、民宿、度假村、青旅 |

### 关键词评分权重

| 命中位置 | 分值 | 说明 |
|---------|------|------|
| suffix（名称后缀） | +5 | 如"公园""餐厅""酒店"作为名称结尾 |
| name（名称包含） | +2 | 关键词在名称中出现（非后缀） |
| description（描述） | +1 | 关键词仅在描述中出现 |

**核心文件**：`agent/classifier.ts`，函数 `classifyPOI(poi: RawPOI): Classification`

---

## 四、合并去重算法

### 4.1 地理分桶（Geo-bucketing）

- 半径阈值：50 米（`GEO_BUCKET_RADIUS_M = 50`）
- 策略：同一 L1 类目内，坐标距离 ≤ 50m 的 POI 视为候选合并对
- 目的：减少后续相似度计算的开销

### 4.2 Union-Find 名称相似度去重

- 综合相似度阈值：`mergeThreshold = 0.90`
- 相似度计算：`computeSimilarity(a, b)` 综合名称编辑距离、坐标距离、类别匹配
- 同组 POI 合并规则：取字段非空最多的 POI 为基础，其余来源补充空字段

### 4.3 跨类目去重

- 仅限密切类目对（如 scenic↔experience、food↔shopping）
- 阈值：`crossCategoryThreshold = 0.90`
- 保留逻辑：按 source 可靠性权重选择归属类目

### 4.4 ConflictReport 结构

```typescript
interface ConflictReport {
  sourceCount: number      // 来源数量（必须从 sourceSet.size 取，不是 sources.size！）
  sources: string[]
  comparablePairs: number
  conflictPairs: number
  conflictCount: number
  agreementRatio: number   // 一致率 = (comparablePairs - conflictPairs) / comparablePairs
  conflictFields: string[] // 存在冲突的字段名
}
```

> ⚠️ **关键 Bug 记录**：`detectConflicts()` 中 `const sourceCount = sources.size` 是错误写法（Array 没有 `.size`），正确写法为 `sourceSet.size`。此 bug 会导致所有 POI 的置信度计算为 NaN，全部降为 D 级。

---

## 五、数据源操作指南

### OSM (OpenStreetMap)

- **特点**：免费、无 API Key、数据较完整但标准化程度低
- **速率限制**：10 秒间隔（`osmInterval: 10_000`）
- **超时**：180 秒（数据量大）
- **Key 字段**：`osm_type`, `osm_id` 可用于去重

### AI (DashScope/阿里云百炼)

- **特点**：兜底补全，对稀缺地区效果好，数据质量不稳定
- **Key**：`VITE_DASHSCOPE_API_KEY` 或 `DASHSCOPE_API_KEY`
- **超时**：300 秒
- **注意**：返回的坐标可能不精确，应与 OSM/Google 来源验证

### Foursquare

- **特点**：国际 POI 质量高，分类体系完善
- **Key**：`FOURSQUARE_API_KEY`
- **速率**：1 req/s

### Google Places

- **特点**：全球覆盖最广，评分/评论数据丰富
- **Key**：`GOOGLE_PLACES_API_KEY`
- **速率**：2 req/s
- **注意**：付费 API，避免大范围无效查询

### 高德地图 (Amap)

- **特点**：国内 POI 数据最佳（精确地址、营业时间）
- **Key**：`AMAP_API_KEY`
- **速率**：5 req/s
- **注意**：仅对国内城市（`isDomestic: true`）有效

---

## 六、数据库表结构

### agent.db 主要表

| 表名 | 说明 | 主键 |
|------|------|------|
| `raw_pois` | 原始采集数据（按城市×来源存储） | `(city_id, source)` |
| `city_pois` | 处理后的最终 POI 数据（JSON 格式） | `city_id` |
| `city_stats` | 城市采集统计（最后采集时间/来源/POI 数） | `city_id` |
| `collection_log` | 每次采集的日志记录 | `id` |
| `refresh_cycles` | 增量刷新周期记录 | `id` |

### 关键 SQL 查询

```sql
-- 查看城市的原始数据摘要
SELECT city_id, source, poi_count, collected_at
FROM raw_pois WHERE city_id = 'beijing';

-- 查看城市 POI 数量和最后更新
SELECT city_id, total_pois, last_collection_at
FROM city_stats WHERE city_id = 'beijing';
```

---

## 七、常见问题排查

| 问题 | 可能原因 | 排查步骤 |
|------|---------|---------|
| 全部 POI 评分 D 级 | `sourceCount` 为 undefined（Array.size Bug） | 检查 `merger.ts` 的 `detectConflicts()`，确认用 `sourceSet.size` |
| 某数据源无数据 | API Key 未配置 | `npx tsx agent/index.ts sources` 查看可用数据源 |
| reprocess 后分类无变化 | Node 模块缓存 | 加 `--no-cache` 参数 |
| 城市坐标读不到 | city-coords.json 键名与 city-registry.json 中 id 不匹配 | 两文件中城市 id 必须完全一致 |
| 大洲/省份为空 | `loadCityCoords()` 路径解析失败（静默返回 `{}`） | 确认 `server/admin-routes.ts` 中使用 `PROJECT_ROOT`（process.cwd()）而非 `__dirname` |
