/**
 * agent/sources/doubao.ts — 火山引擎豆包 AI 采集器
 *
 * 使用火山方舟 Doubao OpenAI 兼容接口生成 POI 数据。
 * 接口文档: https://www.volcengine.com/docs/82379/1330626
 * 端点: https://ark.cn-beijing.volces.com/api/v3/chat/completions
 * 鉴权方式: Bearer {API_KEY}
 */

import { AGENT_CONFIG, API_KEYS } from '../config.js'
import { RateLimiter, delay, repairMalformedJSON, repairTruncatedJSON } from '../utils.js'
import { fillMissingTranslations } from '../translate.js'
import { getDoubaoFallback } from '../model-fallback.js'
import type { SourceCollector, CityInfo, L1Category, RawPOI } from './base.js'
import {
  buildPrompt,
  transformItem,
  normalizeName,
  BATCH_SIZE,
  MAX_ROUNDS,
} from './ai.js'

const DOUBAO_URL = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions'
/** 动态获取当前豆包模型（支持自动降级） */
function getDoubaoModel(): string { return getDoubaoFallback().currentModel }

const rateLimiter = new RateLimiter(AGENT_CONFIG.doubaoCategoryDelay ?? AGENT_CONFIG.aiCategoryDelay)

/* ── 豆包 API 调用 ── */

async function callDoubao(prompt: string): Promise<any[]> {
  await rateLimiter.wait()

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 180_000)  // 豆包响应较慢

  try {
    const response = await fetch(DOUBAO_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEYS.doubaoApiKey}`,
      },
      body: JSON.stringify({
        model: getDoubaoModel(),
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
      const errMsg = `HTTP ${response.status}: ${err.error?.message || err.error?.code || 'unknown'}`
      // 检查是否需要模型降级
      const fallback = getDoubaoFallback()
      const { degraded, newModel } = fallback.handleApiError(new Error(errMsg))
      if (degraded && newModel) {
        console.warn(`  [Doubao] 模型降级为 ${newModel}，将在此后请求中自动使用`)
      } else if (degraded && !newModel) {
        throw new Error(`DOUBAO_ALL_MODELS_EXHAUSTED: 所有豆包模型额度已耗尽`)
      }
      throw new Error(errMsg)
    }

    const data = await response.json() as any
    const text = data.choices?.[0]?.message?.content
    if (!text) throw new Error('EMPTY_RESPONSE')

    // 报告 Token 消耗（预算制降级：额度用完前主动切换）
    const totalTokens = data.usage?.total_tokens as number | undefined
    if (totalTokens && totalTokens > 0) {
      const fallback = getDoubaoFallback()
      const result = fallback.reportUsage(totalTokens)
      if (result?.degraded && result.newModel) {
        console.warn(`  [Doubao] Token预算达阈值，模型主动降级为 ${result.newModel}`)
      } else if (result?.degraded && !result.newModel) {
        throw new Error(`DOUBAO_ALL_MODELS_EXHAUSTED: 所有豆包模型额度已耗尽`)
      }
    }

    try {
      const parsed = JSON.parse(text)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      // 先尝试修复格式问题，再尝试修复截断
      const repaired = repairMalformedJSON(text) || repairTruncatedJSON(text)
      if (repaired) return JSON.parse(repaired)
      throw new Error('JSON_PARSE_ERROR')
    }
  } finally {
    clearTimeout(timeout)
  }
}

/* ── SourceCollector 实现 ── */

export class DoubaoCollector implements SourceCollector {
  readonly name = 'doubao'

  async isAvailable(): Promise<boolean> {
    return !!API_KEYS.doubaoApiKey
  }

  async collect(city: CityInfo, categories: L1Category[]): Promise<RawPOI[]> {
    const allPOIs: RawPOI[] = []
    const target = AGENT_CONFIG.targetPOIsPerCategory

    for (const category of categories) {
      console.log(`  [Doubao] ${city.name}/${category}: 开始多轮采集，目标 ${target} 条...`)
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
              console.log(`    [Doubao] ${category} round${round + 1} retry ${attempt}...`)
              await delay(AGENT_CONFIG.retryDelayMs)
            }

            const prompt = buildPrompt(
              city.name,
              city.nameEn,
              category,
              batchCount,
              round > 0 ? seenNamesRaw : undefined,
            )
            const items = await callDoubao(prompt)

            if (items.length === 0) {
              console.log(`    [Doubao] ${category} round${round + 1}: 空响应，跳过`)
              roundOk = true
              break
            }

            let newCount = 0
            for (const item of items) {
              const poi = transformItem(item, category, 'doubao')
              const key = normalizeName(poi.namePrimary || poi.nameZh || poi.nameEn)
              if (key && !seenNames.has(key)) {
                seenNames.add(key)
                seenNamesRaw.push(poi.namePrimary || poi.nameZh || poi.nameEn)
                categoryPOIs.push(poi)
                newCount++
              }
            }

            console.log(
              `    [Doubao] ${category} round${round + 1}: +${newCount} 新增 (共 ${categoryPOIs.length}/${target})`,
            )
            roundOk = true
            lastError = null
            break
          } catch (err) {
            lastError = err as Error
            console.error(
              `    [Doubao] ${category} round${round + 1} attempt ${attempt + 1} failed:`,
              lastError.message,
            )
          }
        }

        if (!roundOk && lastError) {
          console.error(`    [Doubao] ${category} round${round + 1} 最终失败，停止该类目采集`)
          break
        }

        if (roundOk && categoryPOIs.length < (round + 1) * BATCH_SIZE * 0.3 && round >= 2) {
          console.log(`    [Doubao] ${category} 新增率过低，提前结束`)
          break
        }
      }

      console.log(`  [Doubao] ${category} 采集完成: ${categoryPOIs.length} 条`)
      allPOIs.push(...categoryPOIs)
    }

    // 补齐缺失的中文名/英文名翻译
    await fillMissingTranslations(allPOIs)

    return allPOIs
  }
}
