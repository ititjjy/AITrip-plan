# 知识库：城市数据管理

> 适用角色：POI 数据管理员 Agent
> 最后更新：2026-06-01

---

## 一、城市数据双文件架构

项目通过**两个独立 JSON 文件**管理城市数据，运行时合并：

| 文件 | 路径 | 条数 | 职责 |
|------|------|------|------|
| 城市注册表 | `scripts/city-registry.json` | 230 | 城市基础信息、采集顺序 |
| 城市坐标表 | `agent/data/city-coords.json` | 297 | 地理元数据、分类归属 |

**联结键**：两文件均以 `city.id`（小写英文，如 `beijing`、`paris`）作为联结键。

---

## 二、city-registry.json 字段规范

```json
{
  "id": "beijing",
  "name": "北京",
  "nameEn": "Beijing",
  "hotness": 95
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 全小写英文，用作系统内部唯一标识 |
| name | string | 城市中文名 |
| nameEn | string | 城市英文名（首字母大写） |
| hotness | number | 热度值 0-100，影响采集批次优先级 |

**hotness 参考标准**：

| 分档 | 范围 | 对应城市类型 |
|------|------|------------|
| 极热门 | 90-100 | 北京、上海、巴黎、东京 |
| 热门 | 70-89 | 成都、杭州、首尔、新加坡 |
| 普通 | 40-69 | 二线城市、普通国际城市 |
| 冷门 | 0-39 | 小众目的地 |

---

## 三、city-coords.json 字段规范

```json
{
  "beijing": {
    "lat": 39.9042,
    "lng": 116.4074,
    "isDomestic": true,
    "continent": "亚洲",
    "country": "中国",
    "province": "北京"
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| lat | number | 纬度（WGS84，精度 4 位小数） |
| lng | number | 经度（WGS84，精度 4 位小数） |
| isDomestic | boolean | 是否为国内城市（影响数据源选择） |
| continent | string | 大洲中文名（见规范值表） |
| country | string | 国家中文名 |
| province | string | 省/省级行政区中文名，国际城市填 `""` |

### 大洲规范值

| 大洲 | 规范中文值 |
|------|----------|
| Asia | 亚洲 |
| Europe | 欧洲 |
| North America | 北美洲 |
| South America | 南美洲 |
| Africa | 非洲 |
| Oceania | 大洋洲 |

### 省份填写规范

- **国内城市**：填写省/直辖市/自治区名称（不含"省"字），如 `北京`、`四川`、`海南`
- **直辖市**：province = city name，如北京的 province 填 `北京`
- **国际城市**：province 填 `""`（空字符串，不填 null）

---

## 四、新增城市完整流程

### 步骤 1：查找城市坐标

可通过以下方式获取经纬度：
- Google Maps：右键城市中心点 → 复制坐标
- OpenStreetMap：搜索城市名 → 查看 URL 中的坐标

### 步骤 2：在 city-registry.json 末尾追加

```json
// 在数组最后一个 } 之后，] 之前追加：
,
{
  "id": "chongqing",
  "name": "重庆",
  "nameEn": "Chongqing",
  "hotness": 85
}
```

### 步骤 3：在 city-coords.json 中追加

```json
// 在 JSON 对象的最后一个字段之后追加：
,
"chongqing": {
  "lat": 29.5630,
  "lng": 106.5516,
  "isDomestic": true,
  "continent": "亚洲",
  "country": "中国",
  "province": "重庆"
}
```

### 步骤 4：验证

```bash
# 检查 JSON 语法正确
node -e "require('./scripts/city-registry.json'); console.log('OK')"
node -e "require('./agent/data/city-coords.json'); console.log('OK')"

# 检查城市是否能被 loadCities() 识别
npx tsx agent/index.ts status | grep <id>
```

---

## 五、城市数据常见问题

### Q1：新城市采集后大洲/省份显示为空

**原因**：city-coords.json 中该城市的 continent/province 字段为空，或 id 拼写不一致。

**排查**：
```bash
# 检查 city-coords.json 中的城市数据
node -e "const d=require('./agent/data/city-coords.json'); console.log(d['<id>'])"
```

### Q2：server/admin-routes.ts 中大洲为空

**原因**：`loadCityCoords()` 路径解析失败（开发/生产环境 `__dirname` 指向不同路径）。

**正确做法**：`CITY_COORDS_PATH` 必须用 `process.cwd()`（`PROJECT_ROOT`）而非 `__dirname` 拼接。

```typescript
// ✅ 正确
const PROJECT_ROOT = process.cwd()
const CITY_COORDS_PATH = path.join(PROJECT_ROOT, 'agent', 'data', 'city-coords.json')

// ❌ 错误（生产环境 dist-server/ 下 __dirname 会指向错误位置）
const CITY_COORDS_PATH = path.join(__dirname, '..', 'agent', 'data', 'city-coords.json')
```

### Q3：city-registry.json 和 city-coords.json 城市数量不一致

**说明**：这是正常的。city-coords.json 有 297 条，比 city-registry.json（230 条）多，因为部分城市有坐标数据但未纳入采集列表。以 city-registry.json 为权威列表，多余的 city-coords.json 数据不影响运行。

### Q4：国内城市用哪些数据源

`isDomestic: true` 的城市会额外启用 amap（高德地图）数据源，amap 对国内城市的 POI 数据（精确地址、营业时间）质量最佳。

---

## 六、批量城市数据校验脚本

```typescript
// 检查所有城市的坐标和地理元数据完整性
import fs from 'fs'
const registry = JSON.parse(fs.readFileSync('scripts/city-registry.json', 'utf-8'))
const coords = JSON.parse(fs.readFileSync('agent/data/city-coords.json', 'utf-8'))

let issues = 0
for (const city of registry) {
  const coord = coords[city.id]
  if (!coord) { console.log(`❌ 缺少坐标: ${city.id}`); issues++; continue }
  if (!coord.continent) { console.log(`⚠️  大洲为空: ${city.id}`); issues++ }
  if (!coord.country) { console.log(`⚠️  国家为空: ${city.id}`); issues++ }
  if (coord.isDomestic && !coord.province) { console.log(`⚠️  国内城市省份为空: ${city.id}`); issues++ }
  if (!coord.lat || !coord.lng) { console.log(`❌ 坐标缺失: ${city.id}`); issues++ }
}
console.log(`\n共 ${registry.length} 城市，发现 ${issues} 个问题`)
```
