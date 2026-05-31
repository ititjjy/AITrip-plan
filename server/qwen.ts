/**
 * qwen.ts – 豆包（Doubao/Volcengine ARK）API integration for POI recommendations
 *
 * Calls Volcengine ARK API (OpenAI-compatible format) to generate
 * TOP 50 POIs per category (200 total) for a given city + season.
 */

import { deduplicatePOIs } from './dedup.js'

const ARK_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions'
const MODEL_NAME = 'ep-m-20260531112146-l9cfz'

/* ── Season helpers ── */

const SEASON_LABELS: Record<string, string> = {
  spring: '春季',
  summer: '夏季',
  autumn: '秋季',
  winter: '冬季',
}

function getSeasonContext(season: string): string {
  const month = new Date().getMonth() + 1
  const monthNames = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月']
  const label = SEASON_LABELS[season] || '四季'
  return `${label}（${monthNames[month - 1]}）`
}

/* ── Image URL sets (for POI display) ── */

const categoryImageSets: Record<string, string[]> = {
  scenic: [
    'photo-1493976040374-85c8e12f0c0e', 'photo-1506748686214-e9df14d4d9d0',
    'photo-1533929736458-ca588d08c8be', 'photo-1518548419970-58e3b4079ab2',
    'photo-1523731407965-2430cd12f5e4', 'photo-1476514525535-07fb3b4ae5f1',
    'photo-1502602898657-3e91760cbb34', 'photo-1467269204594-9661b134dd2b',
    'photo-1520250497591-112f2f40a3f4', 'photo-1540959733332-eab4deabeeaf',
    'photo-1524413840807-0c3cb6fa808d', 'photo-1518998053901-5348d3961a04',
    'photo-1512453979798-5ea266f8880c', 'photo-1507003211169-0a1dd7228f2d',
    'photo-1528164344885-47b1492b73c7', 'photo-1546412414-e1885e51148b',
    'photo-1500530855697-b586d89ba3ee', 'photo-1504214208698-ea1916a2195a',
    'photo-1495562569060-2eec283d3391', 'photo-1469474968028-56623f02e42e',
    'photo-1499856871958-5b9627545d1a', 'photo-1526481280693-3bfa7568e0f3',
    'photo-1501594907352-04cda38ebc29', 'photo-1464822759023-fed622ff2c3b',
    'photo-1470071459604-3b5ec3a7fe05', 'photo-1490730141103-6cac27aaab94',
    'photo-1506929562872-bb421503ef21', 'photo-1519046904884-53103b34b206',
    'photo-1475924156734-496f6cac6ec1', 'photo-1491002052546-bf38f186af56',
    'photo-1516483638261-f4dbaf036963', 'photo-1530789253388-582c481c54b0',
    'photo-1507525428034-b723cf961d3e', 'photo-1473496169904-658ba7c44d8a',
    'photo-1518791841217-8f162f1e1131', 'photo-1539635278303-d4002c07eae3',
    'photo-1517760444937-f6397edcbbcd', 'photo-1510414842594-a61c69b5ae57',
    'photo-1498307833015-e7b400441eb8', 'photo-1485738422979-f5c462d49f04',
    'photo-1469474968028-56623f02e42e', 'photo-1482192505345-5655af888cc4',
    'photo-1470770903676-69b98201ea1c', 'photo-1446776811953-b23d57bd21aa',
    'photo-1491466424936-e304919aada7', 'photo-1507608616759-54f48f0af0ee',
    'photo-1444723121867-7a241cacace9', 'photo-1504567961542-e24d9439a724',
    'photo-1517638851339-3ea2fdf24e2b', 'photo-1500835556837-99ac94a94552',
  ],
  food: [
    'photo-1504674900247-0877df9cc836', 'photo-1414235077428-338989a2e8c0',
    'photo-1476224203421-9ac39bcb3327', 'photo-1555396273-367ea4eb4db5',
    'photo-1567620905732-2d1ec7ab7445', 'photo-1540189549336-e6e99c3679fe',
    'photo-1565299624946-b28f40a0ae38', 'photo-1482049016688-2d3e1b311543',
    'photo-1529692236671-f1f6cf9683ba', 'photo-1551218808-94e220e084d2',
    'photo-1517248135467-4c7edcad34c4', 'photo-1559339352-11d035aa65de',
    'photo-1544025162-d76694265947', 'photo-1547592180-85f173990554',
    'photo-1455619452474-d2be8b1e70cd', 'photo-1432139509613-5c4255a1d277',
    'photo-1484723091739-30a097e8f929', 'photo-1506354666786-959d6d497f1a',
    'photo-1551183053-bf91a1d81141', 'photo-1498654896293-37aacf113fd9',
    'photo-1546069901-ba9599a7e63c', 'photo-1473093295043-cdd812d0e601',
    'photo-1490645935967-10de6ba17061', 'photo-1485963631004-f2f00b1d6571',
    'photo-1519708227418-c8fd9a32b7a2', 'photo-1476718406336-bb5a9690ee2a',
    'photo-1504674900247-0877df9cc836', 'photo-1512621776951-a57141f2eefd',
    'photo-1497888329096-51c27beff665', 'photo-1546833999-b9f581a1996d',
    'photo-1499028344343-cd173ffc68a9', 'photo-1535473895227-bdecb20fb157',
    'photo-1540914124281-342587941389', 'photo-1563379926898-05f4575a45d8',
    'photo-1505253716362-afaea1d3d1af', 'photo-1543339308-d595a3acdb73',
    'photo-1551504734-5ee1c4a1479b', 'photo-1552566626-52f8b828add9',
    'photo-1571091718767-18b5b1457add', 'photo-1569058242567-93de6f36f8e6',
    'photo-1534422298391-e4f8c172dddb', 'photo-1497534446932-c925b458314e',
    'photo-1555126634-323283e090fa', 'photo-1517244683847-7456b63c5969',
    'photo-1485921325833-c519f76c4927', 'photo-1536304929831-ee1ca9d44726',
    'photo-1478145046317-39f10e56b5e9', 'photo-1414235077428-338989a2e8c0',
    'photo-1550547660-d9faeaae01b3', 'photo-1565958011703-44f9829ba187',
  ],
  shopping: [
    'photo-1441986300917-64674bd600d8', 'photo-1555529669-e69e7aa0ba9a',
    'photo-1472851294608-062f824d29cc', 'photo-1556742049-0cfed4f6a45d',
    'photo-1534452203293-494d7ddbf7e0', 'photo-1555529771-835f59fc5efe',
    'photo-1481437156560-3205f6a55acc', 'photo-1519420573924-65fcd45245f8',
    'photo-1445205170230-053b83016050', 'photo-1556742502-ec7c0e9f34b1',
    'photo-1528698827591-e19cef1a992c', 'photo-1490312278390-ab64016e0aa9',
    'photo-1555529902-5261145633bf', 'photo-1483985988355-763728e1935b',
    'photo-1441984904996-e0b6ba687e04', 'photo-1490367532201-b9bc1dc483f6',
    'photo-1558618666-fcd25c85f82e', 'photo-1470309864661-68328b2cd0a5',
    'photo-1528459801416-a9e53bbf4e17', 'photo-1555529733-a2f0aea46d24',
    'photo-1607082350899-7e105aa886ae', 'photo-1604719312566-8912e9227c6a',
    'photo-1555529669-e69e7aa0ba9a', 'photo-1583922606661-0822ed0bd916',
    'photo-1570857502809-17e1e5b7e0bd', 'photo-1567401893414-76b7b1e5a7a5',
    'photo-1555529771-835f59fc5efe', 'photo-1605000797499-95a51c5269ae',
    'photo-1580828343064-fde4fc206bc6', 'photo-1596462502278-27bfdc403348',
    'photo-1607083206968-36bf3f855ef1', 'photo-1604176354204-9268737828e4',
    'photo-1519420573924-65fcd45245f8', 'photo-1541123603104-512919d6a96c',
    'photo-1572584642822-2c4fe0900b7c', 'photo-1601924582970-9238bcb495d9',
    'photo-1556742049-0cfed4f6a45d', 'photo-1528698827591-e19cef1a992c',
    'photo-1555529902-5261145633bf', 'photo-1490312278390-ab64016e0aa9',
    'photo-1481437156560-3205f6a55acc', 'photo-1445205170230-053b83016050',
    'photo-1556742502-ec7c0e9f34b1', 'photo-1534452203293-494d7ddbf7e0',
    'photo-1441986300917-64674bd600d8', 'photo-1472851294608-062f824d29cc',
    'photo-1483985988355-763728e1935b', 'photo-1441984904996-e0b6ba687e04',
    'photo-1490367532201-b9bc1dc483f6', 'photo-1558618666-fcd25c85f82e',
  ],
  activity: [
    'photo-1533174072545-7a4b6ad7a6c3', 'photo-1506197603052-3cc9c3a201bd',
    'photo-1527631746610-bca00a040d60', 'photo-1551632811-561732d1e306',
    'photo-1544551763-46a013bb70d5', 'photo-1530521954074-e64f6810b32d',
    'photo-1519671482749-fd09be7ccebf', 'photo-1517457373958-b7bdd4587205',
    'photo-1492684223066-81342ee5ff30', 'photo-1499363536502-87642509e7b8',
    'photo-1470229722913-7c0e2dbbafd3', 'photo-1508700115892-45ecd05ae2ad',
    'photo-1519389950473-47ba0277781c', 'photo-1454391304352-2bf4678b1a7a',
    'photo-1526786220381-1d21eedf92bf', 'photo-1511632765486-a01980e01a18',
    'photo-1504608524841-42fe6f032b4b', 'photo-1494548162494-384bba4ab999',
    'photo-1502680390548-bdbac40529a6', 'photo-1522158637959-30385a09e0da',
    'photo-1534067783941-51c9c23ecefd', 'photo-1528543606781-2f6e6857f318',
    'photo-1473116763249-2faaef81ccda', 'photo-1517649763962-0c623066013b',
    'photo-1541534741688-6078c6bfb5c5', 'photo-1461896836934-bd45ba07e88c',
    'photo-1486218119243-13883505764c', 'photo-1507034589631-9433cc6bc453',
    'photo-1549060279-7e168fcee0c2', 'photo-1535131749006-b7f58c99034b',
    'photo-1440688807730-73e4e2169fb8', 'photo-1474224017046-182ece80b263',
    'photo-1501281668745-f7f57925c3b4', 'photo-1530549387789-4c1017266635',
    'photo-1504280390367-361c6d9f38f4', 'photo-1537225228614-56cc3556d7ed',
    'photo-1476673160081-cf065607f449', 'photo-1445307806294-bff7f67ff225',
    'photo-1486890598084-3673ba1a427a', 'photo-1506126613408-eca07ce68773',
    'photo-1470252649378-9c29740c9fa8', 'photo-1468276311594-df7cb65d8df6',
    'photo-1504609813442-a8924e83f76e', 'photo-1536768139911-e290a59e87b9',
    'photo-1544551763-77932ad0a135', 'photo-1517649763962-0c623066013b',
    'photo-1543051932-6ef9fecfbc80', 'photo-1473116763249-2faaef81ccda',
    'photo-1528543606781-2f6e6857f318', 'photo-1534067783941-51c9c23ecefd',
  ],
}

function getImageUrl(type: string, index: number): string {
  const set = categoryImageSets[type] || categoryImageSets.scenic
  const photoId = set[index % set.length]
  return `https://images.unsplash.com/${photoId}?w=400&h=300&fit=crop`
}

/* ── Prompt builder (per-category, 50 POIs) ── */

const CATEGORY_LABELS: Record<string, string> = {
  scenic: '景点（名胜古迹、自然风光、历史建筑、公园、地标建筑、观景台）',
  food: '餐饮（餐厅、小吃、咖啡馆、酒吧）',
  shopping: '购物（商场、市场、特色店铺、免税店）',
  activity: '娱乐（主题乐园、游乐园、体验活动、表演、户外运动、休闲、水族馆、动物园）',
}

function buildCategoryPrompt(
  cityName: string,
  cityNameEn: string,
  seasonCtx: string,
  category: string,
): string {
  const catLabel = CATEGORY_LABELS[category] || category
  const mealNote = category === 'food'
    ? `每个对象额外增加 "mealType" 字段，值为 "breakfast"、"lunch"、"dinner" 或 "snack"。
注意：餐饮推荐要合理分布在一天的不同时段，避免连续推荐多个餐厅。早餐推荐 2-3 个，午餐推荐 5-8 个，晚餐推荐 5-8 个，下午茶/小吃推荐 3-5 个。同一餐次（如午餐）的餐厅之间应该间隔至少 2 小时以上的游览时间。`
    : ''

  return `推荐${cityName}（${cityNameEn}）${seasonCtx}的${catLabel}类旅游地点，共50个。

直接输出JSON数组，格式如下（不要输出任何说明文字，不要用markdown代码块）：
[
  {"name":"当地语言地点名","nameZh":"中文名称","description":"简介","rating":4.5,"duration":90,"cost":0,"address":"地址","lat":35.6762,"lng":139.6503,"tags":["标签1","标签2"],"openTime":"09:00","closeTime":"18:00","recommendReason":"推荐理由","seasonScore":9}
]

${mealNote}
要求：
1. 地点真实存在，坐标准确，费用为人民币，按seasonScore从高到低排序。
2. "name"字段使用当地语言的正式名称（如日文、英文、法文等）。
3. "nameZh"字段填写对应的中文名称或中文翻译，若地点本身就是中文名称则与name相同。`
}

/* ── Response transformer ── */

interface RawPOI {
  name?: string
  nameZh?: string
  description?: string
  rating?: number
  duration?: number
  cost?: number
  address?: string
  lat?: number
  lng?: number
  tags?: string[]
  openTime?: string
  closeTime?: string
  mealType?: string
  recommendReason?: string
  seasonScore?: number
}

interface POI {
  id: string
  name: string
  nameZh: string
  type: string
  image: string
  rating: number
  duration: number
  cost: number
  description: string
  address: string
  lat: number
  lng: number
  tags: string[]
  openTime: string
  closeTime: string
  recommendReason: string
  mealType?: string
  seasonScore?: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function transformResponse(
  parsed: Record<string, RawPOI[]>,
  cityId: string,
): POI[] {
  const validTypes = ['scenic', 'food', 'shopping', 'activity']
  const all: POI[] = []
  let globalIdx = 0

  for (const [category, items] of Object.entries(parsed)) {
    if (!validTypes.includes(category) || !Array.isArray(items)) continue

    items.forEach((item, catIdx) => {
      globalIdx++
      const poi: POI = {
        id: `ai-${cityId}-${globalIdx}`,
        name: String(item.name || `未知地点 ${globalIdx}`),
        nameZh: String(item.nameZh || item.name || `未知地点 ${globalIdx}`),
        type: category,
        image: getImageUrl(category, catIdx),
        rating: clamp(Number(item.rating) || 4.0, 1, 5),
        duration: clamp(Number(item.duration) || 60, 15, 480),
        cost: Math.max(0, Number(item.cost) || 0),
        description: String(item.description || ''),
        address: String(item.address || ''),
        lat: Number(item.lat) || 0,
        lng: Number(item.lng) || 0,
        tags: Array.isArray(item.tags) ? item.tags.map(String).slice(0, 4) : [],
        openTime: String(item.openTime || '09:00'),
        closeTime: String(item.closeTime || '22:00'),
        recommendReason: String(item.recommendReason || ''),
        seasonScore: clamp(Number(item.seasonScore) || 5, 1, 10),
      }

      if (category === 'food' && item.mealType) {
        const validMeals = ['breakfast', 'lunch', 'dinner', 'snack']
        const mt = String(item.mealType)
        if (validMeals.includes(mt)) {
          poi.mealType = mt
        }
      }

      all.push(poi)
    })
  }

  return all
}

/* ── JSON repair helper ── */

/**
 * Attempt to repair truncated JSON output from LLM.
 * Common case: array cut off mid-object due to token limit.
 */
function repairTruncatedJSON(text: string): string | null {
  // Strip markdown code blocks if present
  let clean = text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim()

  // Find the array start
  const arrStart = clean.indexOf('[')
  if (arrStart === -1) return null
  clean = clean.slice(arrStart)

  // If it already ends with ], try as-is
  if (clean.endsWith(']')) return clean

  // Find the last complete object (ending with `}`)
  const lastBrace = clean.lastIndexOf('}')
  if (lastBrace === -1) return null

  // Truncate after last complete object and close the array
  const truncated = clean.slice(0, lastBrace + 1) + ']'

  // Validate it parses
  try {
    JSON.parse(truncated)
    return truncated
  } catch {
    return null
  }
}

/* ── Deep extraction helper ── */

/**
 * Extract POI array from API response, handling various structures:
 *   { "food": [ ... ] }           — direct array
 *   { "food": { "items": [...] }} — nested object with array
 *   { "restaurants": [ ... ] }    — different key name
 */
function extractPOIArray(parsed: Record<string, unknown>, category: string): RawPOI[] {
  // 1. Direct match: parsed[category] is array
  const direct = parsed[category]
  if (Array.isArray(direct) && direct.length > 0) {
    return direct as RawPOI[]
  }

  // 2. If direct value is an object, look for arrays inside it
  if (direct && typeof direct === 'object' && !Array.isArray(direct)) {
    for (const val of Object.values(direct as Record<string, unknown>)) {
      if (Array.isArray(val) && val.length > 0) {
        return val as RawPOI[]
      }
    }
  }

  // 3. Find any top-level array value (model used different key)
  for (const val of Object.values(parsed)) {
    if (Array.isArray(val) && val.length > 0) {
      return val as RawPOI[]
    }
  }

  // 4. The entire parsed might be nested: { "data": { "food": [...] } }
  for (const val of Object.values(parsed)) {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      for (const inner of Object.values(val as Record<string, unknown>)) {
        if (Array.isArray(inner) && inner.length > 0) {
          return inner as RawPOI[]
        }
      }
    }
  }

  return []
}

/* ═══════════════════════ Public API ═══════════════════════ */

/**
 * Fetch POIs from Doubao (Volcengine ARK) API — sequential calls, one per category.
 * Each call requests 50 POIs. Total: up to 200.
 */
export async function fetchPOIsFromQwen(
  cityName: string,
  cityNameEn: string,
  cityId: string,
  season: string,
  apiKey: string,
): Promise<POI[]> {
  console.log(`  [Doubao] fetchPOIsFromQwen called, apiKey=${apiKey.slice(0,15)}..., model=${MODEL_NAME}`)
  const seasonCtx = getSeasonContext(season)
  const systemPrompt = '你是一位资深旅行规划师，精通全球各地旅游资源。你只输出合法的JSON，不输出任何其他文字。'
  const categories = ['scenic', 'food', 'shopping', 'activity']

  const merged: Record<string, RawPOI[]> = {}

  for (const category of categories) {
    try {
      const userPrompt = buildCategoryPrompt(cityName, cityNameEn, seasonCtx, category)
      console.log(`  [Doubao] Requesting ${category}...`)

      // 添加 60 秒超时保护，防止 fetch 无限挂起
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 120_000)

      const response = await fetch(ARK_BASE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: MODEL_NAME,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.7,
        }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout))

      if (!response.ok) {
        const errData = await response.json().catch(() => ({})) as { error?: { message?: string } }
        const msg = errData?.error?.message || `HTTP ${response.status}`
        console.error(`  [Doubao] ${category} HTTP error: ${msg}`)
        if (response.status === 401) throw new Error(`API_KEY_INVALID: ${msg}`)
        if (response.status === 429) {
          console.warn(`  [Doubao] Rate limited, waiting 5s...`)
          await new Promise(r => setTimeout(r, 5000))
          continue
        }
        continue
      }

      const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
      const text = data?.choices?.[0]?.message?.content
      if (!text) {
        console.warn(`  [Doubao] ${category}: empty response`)
        continue
      }

      // Log a snippet for debugging
      console.log(`  [Doubao] ${category} response (${text.length} chars): ${text.slice(0, 300)}...`)

      let parsed: Record<string, unknown>
      try {
        const raw = JSON.parse(text)
        if (Array.isArray(raw)) {
          parsed = { [category]: raw }
        } else {
          parsed = raw as Record<string, unknown>
        }
      } catch {
        // Model output may be truncated — try to repair
        const repaired = repairTruncatedJSON(text)
        if (repaired) {
          try {
            const raw = JSON.parse(repaired)
            parsed = Array.isArray(raw) ? { [category]: raw } : raw as Record<string, unknown>
            console.log(`  [Doubao] ${category}: repaired truncated JSON`)
          } catch {
            console.error(`  [Doubao] ${category}: JSON repair also failed`)
            continue
          }
        } else {
          console.error(`  [Doubao] ${category}: no JSON found in response`)
          continue
        }
      }
      const items = extractPOIArray(parsed, category)
      if (items.length > 0) {
        merged[category] = items
        console.log(`  [Doubao] ${category}: ${items.length} POIs ✓`)
      } else {
        console.warn(`  [Doubao] ${category}: 0 POIs extracted`)
      }
    } catch (err) {
      if (err instanceof Error && (err.message.startsWith('API_KEY_INVALID') || err.message.startsWith('RATE_LIMIT'))) {
        throw err
      }
      console.error(`  [Qwen] ${category} failed:`, err)
    }
  }

  if (Object.keys(merged).length === 0) {
    throw new Error('ALL_CATEGORIES_FAILED: 所有类别的 API 调用均失败')
  }

  const rawPois = transformResponse(merged, cityId)

  // ── 去重合并：消除 scenic/activity 之间的重复 POI ──
  const { pois: dedupedPois, stats } = deduplicatePOIs(rawPois)

  if (stats.duplicatePairs > 0) {
    console.log(`  [Dedup] ${cityName}: 发现 ${stats.duplicatePairs} 对重复POI, ` +
      `移除 ${stats.removedCount} 个, 重分类 ${stats.reclassifiedCount} 个`)
    console.log(`  [Dedup] scenic: ${stats.scenicBefore} → ${stats.scenicAfter}, ` +
      `activity: ${stats.activityBefore} → ${stats.activityAfter}`)
    for (const d of stats.details) {
      console.log(`    ↳ ${d.poiA} ≈ ${d.poiB} (${(d.similarity * 100).toFixed(1)}%) → [${d.keptType}] ${d.mergedAs}`)
    }
  } else {
    console.log(`  [Dedup] ${cityName}: 无重复POI`)
  }

  return dedupedPois as POI[]
}
