/**
 * agent/sources/ai.ts — AI 生成数据采集器
 *
 * 使用阿里云 DashScope (通义千问) 生成 POI 数据。
 * 定位为补充数据源，在其他来源数据不足时使用。
 */

import { AGENT_CONFIG, API_KEYS } from '../config.js'
import { RateLimiter, clamp, delay, repairTruncatedJSON } from '../utils.js'
import { externalCategoryToL3 } from '../categories.js'
import type { SourceCollector, CityInfo, L1Category, RawPOI } from './base.js'
import { roundCoord } from './base.js'

const DASHSCOPE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'
const MODEL = 'qwen-plus'

const rateLimiter = new RateLimiter(AGENT_CONFIG.aiCategoryDelay)

/* ── 6 大类目 Prompt 描述 ── */

const CATEGORY_LABELS: Record<L1Category, string> = {
  scenic: '景点（自然风光、历史古迹、现代地标、公园园林）',
  food: '餐饮（地方特色、异国料理、咖啡茶饮、酒吧、美食集市）',
  shopping: '购物（商场百货、特色店铺、集市市场、免税店）',
  entertainment: '娱乐（主题乐园、演出表演、夜生活、体育赛事、赌场）',
  experience: '体验（户外运动、文化体验、休闲养生、研学教育、冒险运动）',
  hotel: '酒店（高端酒店、舒适酒店、经济住宿、特色住宿）',
}

/* ── 月份标签 ── */

const MONTH_NAMES = ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月']

/* ── Prompt 构建 ── */

function buildPrompt(
  cityName: string,
  cityNameEn: string,
  category: L1Category,
  count: number,
): string {
  const catLabel = CATEGORY_LABELS[category]

  return `推荐${cityName}（${cityNameEn}）的${catLabel}类旅游地点，共${count}个。

直接输出JSON数组，格式如下（不要输出任何说明文字，不要用markdown代码块）：
[
  {
    "namePrimary":"当地语言正式名称",
    "nameZh":"中文名称（无则空串）",
    "nameEn":"英文名称（无则空串）",
    "subCategory":"具体子类别英文（如 mountain, temple, cafe 等）",
    "lat":35.6762,
    "lng":139.6503,
    "address":"本地语言完整地址",
    "addressEn":"英文地址",
    "rating":4.5,
    "cost":0,
    "visitDuration":90,
    "description":"50字以内的简介",
    "tags":["标签1","标签2"],
    "operatingHours":"09:00-18:00",
    "bestSeasons":["spring","autumn"],
    "monthlyIndex":[3,3,4,5,5,4,4,4,5,5,4,3]
  }
]

要求：
1. 地点必须真实存在，坐标准确。
2. namePrimary 使用当地语言的正式名称。
3. monthlyIndex 为 1-12 月的推荐指数（0-5整数），反映该月的游览推荐度。
4. bestSeasons 可选值: spring, summer, autumn, winter。
5. cost 为人均费用（当地货币），免费填 0。
6. subCategory 填写具体的子类别关键词（英文），用于精确分类。
7. 按热门程度排序，最热门的排前面。`
}

/* ── DashScope API 调用 ── */

async function callDashScope(prompt: string): Promise<any[]> {
  await rateLimiter.wait()

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), AGENT_CONFIG.aiTimeout)

  try {
    const response = await fetch(DASHSCOPE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEYS.dashscope}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: '你是一位资深旅行规划师，精通全球各地旅游资源。你只输出合法的JSON，不输出任何其他文字。' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({})) as any
      throw new Error(`HTTP ${response.status}: ${err.error?.message || 'unknown'}`)
    }

    const data = await response.json() as any
    const text = data.choices?.[0]?.message?.content
    if (!text) throw new Error('EMPTY_RESPONSE')

    try {
      const parsed = JSON.parse(text)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      const repaired = repairTruncatedJSON(text)
      if (repaired) return JSON.parse(repaired)
      throw new Error('JSON_PARSE_ERROR')
    }
  } finally {
    clearTimeout(timeout)
  }
}

/* ── Raw Response → RawPOI ── */

function transformItem(item: any, l1: L1Category): RawPOI {
  // 尝试从 subCategory 映射到 L3
  const subCat = String(item.subCategory || '')
  const mapped = subCat ? externalCategoryToL3('google', subCat) : null

  return {
    namePrimary: String(item.namePrimary || item.name || ''),
    nameZh: String(item.nameZh || ''),
    nameEn: String(item.nameEn || ''),
    categoryL1: l1,
    categoryL3: mapped?.l3 || `${l1}.${getDefaultL2(l1)}.${getDefaultL3(l1)}`,
    lat: roundCoord(Number(item.lat) || 0),
    lng: roundCoord(Number(item.lng) || 0),
    address: String(item.address || ''),
    addressEn: String(item.addressEn || ''),
    rating: clamp(Number(item.rating) || 4.0, 1, 5),
    cost: Math.max(0, Number(item.cost) || 0),
    visitDuration: clamp(Number(item.visitDuration) || 60, 0, 720),
    description: String(item.description || ''),
    tags: Array.isArray(item.tags) ? item.tags.map(String).slice(0, 4) : [],
    operatingHours: String(item.operatingHours || '09:00-22:00'),
    bestSeasons: Array.isArray(item.bestSeasons) ? item.bestSeasons.map(String) : [],
    monthlyIndex: normalizeMonthlyIndex(item.monthlyIndex),
    source: 'ai',
  }
}

/* ── 默认 L2/L3 回退 ── */

function getDefaultL2(l1: L1Category): string {
  const map: Record<L1Category, string> = {
    scenic: 'modern', food: 'local', shopping: 'mall',
    entertainment: 'theme', experience: 'outdoor', hotel: 'comfort',
  }
  return map[l1]
}

function getDefaultL3(l1: L1Category): string {
  const map: Record<L1Category, string> = {
    scenic: 'scenic.modern.square', food: 'food.local.signature',
    shopping: 'shopping.mall.comprehensive', entertainment: 'entertainment.theme.amusement',
    experience: 'experience.outdoor.hiking', hotel: 'hotel.comfort.fourstar',
  }
  return map[l1]
}

/* ── 月度指数标准化 ── */

function normalizeMonthlyIndex(raw: any): number[] {
  if (!Array.isArray(raw) || raw.length !== 12) {
    return [3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 3, 3]  // 默认值
  }
  return raw.map((v: any) => clamp(Math.round(Number(v) || 3), 0, 5))
}

/* ── SourceCollector 实现 ── */

export class AICollector implements SourceCollector {
  readonly name = 'ai'

  async isAvailable(): Promise<boolean> {
    return !!API_KEYS.dashscope
  }

  async collect(city: CityInfo, categories: L1Category[]): Promise<RawPOI[]> {
    const allPOIs: RawPOI[] = []
    const countPerCategory = AGENT_CONFIG.maxPOIsPerCategory

    for (const category of categories) {
      let lastError: Error | null = null

      for (let attempt = 0; attempt <= AGENT_CONFIG.retryCount; attempt++) {
        try {
          if (attempt > 0) {
            console.log(`  [AI] ${category} retry ${attempt}...`)
            await delay(AGENT_CONFIG.retryDelayMs)
          }

          console.log(`  [AI] Generating ${category} for ${city.name}...`)
          const prompt = buildPrompt(city.name, city.nameEn, category, countPerCategory)
          const items = await callDashScope(prompt)

          if (items.length > 0) {
            for (const item of items) {
              allPOIs.push(transformItem(item, category))
            }
            console.log(`  [AI] ${category}: ${items.length} POIs generated`)
            lastError = null
            break
          }
        } catch (err) {
          lastError = err as Error
          console.error(`  [AI] ${category} attempt ${attempt + 1} failed:`, lastError.message)
        }
      }

      if (lastError) {
        console.error(`  [AI] ${category} failed after ${AGENT_CONFIG.retryCount + 1} attempts`)
      }
    }

    return allPOIs
  }
}
