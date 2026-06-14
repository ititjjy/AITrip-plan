/**
 * agent/sources/ai.ts — AI 生成数据采集器
 *
 * 使用阿里云 DashScope (通义千问) 生成 POI 数据。
 * 定位为补充数据源，在其他来源数据不足时使用。
 */

import { AGENT_CONFIG, API_KEYS } from '../config.js'
import { RateLimiter, clamp, delay, repairTruncatedJSON } from '../utils.js'
import { externalCategoryToL3 } from '../categories.js'
import { getQwenFallback } from '../model-fallback.js'
import type { SourceCollector, CityInfo, L1Category, RawPOI, ExperienceItem } from './base.js'
import { roundCoord } from './base.js'

const DASHSCOPE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'
/** 动态获取当前千问模型（支持自动降级） */
function getQwenModel(): string { return getQwenFallback().currentModel }

const rateLimiter = new RateLimiter(AGENT_CONFIG.aiCategoryDelay)

/* ── 6 大类目 Prompt 描述 ── */

export const CATEGORY_LABELS: Record<L1Category, string> = {
  scenic: '景点（自然风光、历史古迹、现代地标、公园园林）',
  food: '餐饮（地方特色、异国料理、咖啡茶饮、酒吧、美食集市）',
  shopping: '购物（商场百货、特色店铺、集市市场、免税店）',
  entertainment: '娱乐（主题乐园、演出表演、夜生活、体育赛事）',
  experience: '体验（户外运动、文化体验、休闲养生、研学教育、冒险运动）',
  hotel: '酒店（高端酒店、舒适酒店、经济住宿、特色住宿）',
}

/* ── Prompt 构建 ── */

export const JSON_FORMAT = `[
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
    "tags":["中文标签1|English Tag1","中文标签2|English Tag2"],
    "operatingHours":"09:00-18:00",
    "bestSeasons":["spring","autumn"],
    "monthlyIndex":[3,3,4,5,5,4,4,4,5,5,4,3]
  }
]`

/** 体验类目专用格式（含 experienceItems 字段） */
export const JSON_FORMAT_EXPERIENCE = `[
  {
    "namePrimary":"当地语言正式名称",
    "nameZh":"中文名称（无则空串）",
    "nameEn":"英文名称（无则空串）",
    "subCategory":"具体子类别英文（如 hiking, cooking_class, spa 等）",
    "lat":35.6762,
    "lng":139.6503,
    "address":"本地语言完整地址",
    "addressEn":"英文地址",
    "rating":4.5,
    "cost":0,
    "visitDuration":90,
    "description":"50字以内的简介",
    "tags":["中文标签1|English Tag1","中文标签2|English Tag2"],
    "operatingHours":"09:00-18:00",
    "bestSeasons":["spring","autumn"],
    "monthlyIndex":[3,3,4,5,5,4,4,4,5,5,4,3],
    "experienceItems":[
      {
        "name":"项目名称（如：皮划艇、陶艺体验、晨间太极课）",
        "summary":"1-2句话介绍项目内容、特色或适合人群",
        "durationMinutes":60,
        "pricePerPerson":200
      }
    ]
  }
]`

export const JSON_RULES = `要求：
1. 地点必须真实存在，坐标准确。
2. namePrimary 使用当地语言的正式名称。
3. monthlyIndex 为 1-12 月的推荐指数（0-5整数），反映该月的游览推荐度。
4. bestSeasons 可选值: spring, summer, autumn, winter。
5. cost 为人均费用（当地货币），免费填 0。
6. subCategory 填写具体的子类别关键词（英文），用于精确分类。
7. tags 必须使用 "中文|English" 的双语格式，如 "古迹|Historic Site"。
8. 按热门程度排序，最热门的排前面。`

export function buildPrompt(
  cityName: string,
  cityNameEn: string,
  category: L1Category,
  count: number,
  excludeNames?: string[],
): string {
  const catLabel = CATEGORY_LABELS[category]
  const format = category === 'experience' ? JSON_FORMAT_EXPERIENCE : JSON_FORMAT

  let excludeClause = ''
  if (excludeNames && excludeNames.length > 0) {
    // 只传最近一批已有名称，避免 prompt 过长
    const sample = excludeNames.slice(-60).join('、')
    excludeClause = `\n注意：以下地点已经收录，请推荐其他不同的地点（避免重复）：${sample}\n`
  }

  return `推荐${cityName}（${cityNameEn}）的${catLabel}类旅游地点，共${count}个。${excludeClause}
直接输出JSON数组，格式如下（不要输出任何说明文字，不要用markdown代码块）：
${format}

${JSON_RULES}`
}

/* ── DashScope API 调用 ── */

async function callDashScope(prompt: string): Promise<any[]> {
  await rateLimiter.wait()

  const controller = new AbortController()
  // 单批 15 个 POI 请求超时 90s，远小于全量 300s 避免长时间阻塞
  const timeout = setTimeout(() => controller.abort(), 90_000)

  try {
    const response = await fetch(DASHSCOPE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEYS.dashscope}`,
      },
      body: JSON.stringify({
        model: getQwenModel(),
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
      const errMsg = `HTTP ${response.status}: ${err.error?.message || err.error?.code || 'unknown'}`
      // 检查是否需要模型降级
      const fallback = getQwenFallback()
      const { degraded, newModel } = fallback.handleApiError(new Error(errMsg))
      if (degraded && newModel) {
        console.warn(`  [AI] 模型降级为 ${newModel}，将在此后请求中自动使用`)
      } else if (degraded && !newModel) {
        throw new Error(`QWEN_ALL_MODELS_EXHAUSTED: 所有千问模型额度已耗尽`)
      }
      throw new Error(errMsg)
    }

    const data = await response.json() as any
    const text = data.choices?.[0]?.message?.content
    if (!text) throw new Error('EMPTY_RESPONSE')

    // 报告 Token 消耗（预算制降级：额度用完前主动切换）
    const totalTokens = data.usage?.total_tokens as number | undefined
    if (totalTokens && totalTokens > 0) {
      const fallback = getQwenFallback()
      const result = fallback.reportUsage(totalTokens)
      if (result?.degraded && result.newModel) {
        console.warn(`  [AI] Token预算达阈值，模型主动降级为 ${result.newModel}`)
      } else if (result?.degraded && !result.newModel) {
        throw new Error(`QWEN_ALL_MODELS_EXHAUSTED: 所有千问模型额度已耗尽`)
      }
    }

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

export function transformItem(item: any, l1: L1Category, sourceName = 'qwen'): RawPOI {
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
    source: sourceName,
    experienceItems: l1 === 'experience' && Array.isArray(item.experienceItems)
      ? item.experienceItems
          .map((e: any): ExperienceItem => ({
            name: String(e.name || ''),
            summary: String(e.summary || ''),
            durationMinutes: Math.max(0, Number(e.durationMinutes) || 0),
            pricePerPerson: Math.max(0, Number(e.pricePerPerson) || 0),
          }))
          .filter((e: ExperienceItem) => e.name)
      : undefined,
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

/** 每轮请求 POI 数量（小批量以避免超时） */
export const BATCH_SIZE = 15

/** 单类目最大轮次（15×10=150，够采满 100 个去重后剩余） */
export const MAX_ROUNDS = 10

/** 名称归一化，用于去重判断 */
export function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/[\s\-·•·]+/g, '')
}

export class AICollector implements SourceCollector {
  readonly name = 'qwen'

  async isAvailable(): Promise<boolean> {
    return !!API_KEYS.dashscope
  }

  async collect(city: CityInfo, categories: L1Category[]): Promise<RawPOI[]> {
    const allPOIs: RawPOI[] = []
    const target = AGENT_CONFIG.targetPOIsPerCategory

    for (const category of categories) {
      console.log(`  [AI] ${city.name}/${category}: 开始多轮采集，目标 ${target} 条...`)
      const categoryPOIs: RawPOI[] = []
      // 用于去重和 exclude 提示的名称集合（归一化后）
      const seenNames = new Set<string>()
      // 传给 prompt 的原始名称列表
      const seenNamesRaw: string[] = []

      for (let round = 0; round < MAX_ROUNDS; round++) {
        if (categoryPOIs.length >= target) break

        const remaining = target - categoryPOIs.length
        const batchCount = Math.min(BATCH_SIZE, remaining + 5) // 多请求几个以弥补去重损耗

        let roundOk = false
        let lastError: Error | null = null

        for (let attempt = 0; attempt <= AGENT_CONFIG.retryCount; attempt++) {
          try {
            if (attempt > 0) {
              console.log(`    [AI] ${category} round${round + 1} retry ${attempt}...`)
              await delay(AGENT_CONFIG.retryDelayMs)
            }

            const prompt = buildPrompt(
              city.name,
              city.nameEn,
              category,
              batchCount,
              round > 0 ? seenNamesRaw : undefined,
            )
            const items = await callDashScope(prompt)

            if (items.length === 0) {
              console.log(`    [AI] ${category} round${round + 1}: 空响应，跳过`)
              roundOk = true // 空响应不重试
              break
            }

            let newCount = 0
            for (const item of items) {
              const poi = transformItem(item, category)
              const key = normalizeName(poi.namePrimary || poi.nameZh || poi.nameEn)
              if (key && !seenNames.has(key)) {
                seenNames.add(key)
                seenNamesRaw.push(poi.namePrimary || poi.nameZh || poi.nameEn)
                categoryPOIs.push(poi)
                newCount++
              }
            }

            console.log(
              `    [AI] ${category} round${round + 1}: +${newCount} 新增 (共 ${categoryPOIs.length}/${target})`,
            )
            roundOk = true
            lastError = null
            break
          } catch (err) {
            lastError = err as Error
            console.error(
              `    [AI] ${category} round${round + 1} attempt ${attempt + 1} failed:`,
              lastError.message,
            )
          }
        }

        if (!roundOk && lastError) {
          console.error(`    [AI] ${category} round${round + 1} 最终失败，停止该类目采集`)
          break
        }

        // 如果连续一轮新增为 0，说明 AI 已经没有更多新地点，退出
        if (roundOk && categoryPOIs.length < (round + 1) * BATCH_SIZE * 0.3 && round >= 2) {
          console.log(`    [AI] ${category} 新增率过低，提前结束`)
          break
        }
      }

      console.log(`  [AI] ${category} 采集完成: ${categoryPOIs.length} 条`)
      allPOIs.push(...categoryPOIs)
    }

    return allPOIs
  }
}
