/**
 * agent/sources/spark.ts — 讯飞星火 AI 采集器
 *
 * 使用科大讯飞 Spark OpenAI 兼容接口生成 POI 数据。
 * 接口文档: https://www.xfyun.cn/doc/spark/HTTP调用文档.html
 * OpenAI 兼容端点: https://spark-api-open.xf-yun.com/v1/chat/completions
 * 鉴权方式: Bearer {APIKey}:{APISecret}
 */

import { AGENT_CONFIG, API_KEYS } from '../config.js'
import { RateLimiter, clamp, delay, repairMalformedJSON, repairTruncatedJSON } from '../utils.js'
import type { SourceCollector, CityInfo, L1Category, RawPOI } from './base.js'
import {
  buildPrompt,
  transformItem,
  normalizeName,
  BATCH_SIZE,
  MAX_ROUNDS,
} from './ai.js'

const SPARK_URL = 'https://spark-api-open.xf-yun.com/v1/chat/completions'
/** 讯飞 Spark 推荐模型: generalv3.5 (Spark Max) */
const SPARK_MODEL = 'lite'

const rateLimiter = new RateLimiter(AGENT_CONFIG.sparkCategoryDelay ?? AGENT_CONFIG.aiCategoryDelay)

/* ── Spark API 调用 ── */

async function callSpark(prompt: string): Promise<any[]> {
  await rateLimiter.wait()

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 90_000)

  const { sparkApiKey, sparkApiSecret } = API_KEYS
  const authToken = `${sparkApiKey}:${sparkApiSecret}`

  try {
    const response = await fetch(SPARK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        model: SPARK_MODEL,
        messages: [
          {
            role: 'system',
            content: '你是一位资深旅行规划师，精通全球各地旅游资源。你只输出合法的JSON，不输出任何其他文字。',
          },
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
      // 先尝试修复格式问题（未引号属性名等），再尝试修复截断
      const repaired = repairMalformedJSON(text) || repairTruncatedJSON(text)
      if (repaired) return JSON.parse(repaired)
      throw new Error('JSON_PARSE_ERROR')
    }
  } finally {
    clearTimeout(timeout)
  }
}

/* ── SourceCollector 实现 ── */

export class SparkCollector implements SourceCollector {
  readonly name = 'spark'

  async isAvailable(): Promise<boolean> {
    return !!(API_KEYS.sparkApiKey && API_KEYS.sparkApiSecret)
  }

  async collect(city: CityInfo, categories: L1Category[]): Promise<RawPOI[]> {
    const allPOIs: RawPOI[] = []
    const target = AGENT_CONFIG.targetPOIsPerCategory

    for (const category of categories) {
      console.log(`  [Spark] ${city.name}/${category}: 开始多轮采集，目标 ${target} 条...`)
      const categoryPOIs: RawPOI[] = []
      const seenNames = new Set<string>()
      const seenNamesRaw: string[] = []

      for (let round = 0; round < MAX_ROUNDS; round++) {
        if (categoryPOIs.length >= target) break

        const remaining = target - categoryPOIs.length
        const batchCount = Math.min(BATCH_SIZE, remaining + 5)

        let roundOk = false
        let lastError: Error | null = null

        for (let attempt = 0; attempt <= AGENT_CONFIG.retryCount; attempt++) {
          try {
            if (attempt > 0) {
              console.log(`    [Spark] ${category} round${round + 1} retry ${attempt}...`)
              await delay(AGENT_CONFIG.retryDelayMs)
            }

            const prompt = buildPrompt(
              city.name,
              city.nameEn,
              category,
              batchCount,
              round > 0 ? seenNamesRaw : undefined,
            )
            const items = await callSpark(prompt)

            if (items.length === 0) {
              console.log(`    [Spark] ${category} round${round + 1}: 空响应，跳过`)
              roundOk = true
              break
            }

            let newCount = 0
            for (const item of items) {
              const poi = transformItem(item, category, 'spark')
              const key = normalizeName(poi.namePrimary || poi.nameZh || poi.nameEn)
              if (key && !seenNames.has(key)) {
                seenNames.add(key)
                seenNamesRaw.push(poi.namePrimary || poi.nameZh || poi.nameEn)
                categoryPOIs.push(poi)
                newCount++
              }
            }

            console.log(
              `    [Spark] ${category} round${round + 1}: +${newCount} 新增 (共 ${categoryPOIs.length}/${target})`,
            )
            roundOk = true
            lastError = null
            break
          } catch (err) {
            lastError = err as Error
            console.error(
              `    [Spark] ${category} round${round + 1} attempt ${attempt + 1} failed:`,
              lastError.message,
            )
          }
        }

        if (!roundOk && lastError) {
          console.error(`    [Spark] ${category} round${round + 1} 最终失败，停止该类目采集`)
          break
        }

        if (roundOk && categoryPOIs.length < (round + 1) * BATCH_SIZE * 0.3 && round >= 2) {
          console.log(`    [Spark] ${category} 新增率过低，提前结束`)
          break
        }
      }

      console.log(`  [Spark] ${category} 采集完成: ${categoryPOIs.length} 条`)
      allPOIs.push(...categoryPOIs)
    }

    return allPOIs
  }
}
