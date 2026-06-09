/**
 * agent/translate.ts — POI 名称翻译工具
 *
 * 使用 DashScope (通义千问) 批量翻译 POI 的缺失名称。
 * 支持两种翻译方向：
 *   - 外语 → 中文 (nameZh 补齐)
 *   - 中文 → 英文 (nameEn 补齐)
 *
 * 翻译策略：批量提交，每批最多 30 条，减少 API 调用次数。
 */

import { API_KEYS } from './config.js'
import { RateLimiter, delay } from './utils.js'
import type { RawPOI } from './sources/base.js'

const DASHSCOPE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'
const MODEL = 'qwen-plus'

const BATCH_SIZE = 30
const rateLimiter = new RateLimiter(500) // 翻译限速 2 req/s

/* ── 语言检测 ── */

/** 检测字符串是否主要是中文 */
function isChinese(text: string): boolean {
  if (!text) return false
  const cjk = text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []
  return cjk.length > text.length * 0.3
}

/** 检测字符串是否主要是拉丁字母（英文等） */
function isLatin(text: string): boolean {
  if (!text) return false
  const latin = text.match(/[a-zA-Z]/g) || []
  return latin.length > text.length * 0.3
}

/* ── 批量翻译 API ── */

async function callTranslate(prompt: string): Promise<string> {
  await rateLimiter.wait()

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000)

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
          {
            role: 'system',
            content: '你是一个专业翻译，精通全球地名和旅游场所的多语言翻译。只输出翻译结果，不要解释，不要编号，每行一条。',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({})) as any
      throw new Error(`Translate API HTTP ${response.status}: ${err.error?.message || 'unknown'}`)
    }

    const data = await response.json() as any
    return data.choices?.[0]?.message?.content?.trim() || ''
  } finally {
    clearTimeout(timeout)
  }
}

/* ── 批量翻译实现 ── */

interface TranslateEntry {
  index: number
  name: string
}

/**
 * 批量翻译名称列表
 * @param names 待翻译的名称列表
 * @param direction 'toZh' 或 'toEn'
 * @returns 翻译结果数组，与输入一一对应
 */
async function batchTranslate(
  names: string[],
  direction: 'toZh' | 'toEn',
): Promise<string[]> {
  if (names.length === 0) return []

  const targetLang = direction === 'toZh' ? '中文' : '英文'
  const prompt = `将以下地名/场所名翻译为${targetLang}，保持每行一个，顺序一致，不要编号：\n${names.join('\n')}`

  const result = await callTranslate(prompt)
  const lines = result.split('\n').map(l => l.replace(/^\d+[\.\)、]\s*/, '').trim()).filter(Boolean)

  // 对齐结果：如果翻译返回行数不够，用原文填充
  const translated: string[] = []
  for (let i = 0; i < names.length; i++) {
    translated.push(lines[i] || names[i])
  }
  return translated
}

/* ── POI 名称补齐主函数 ── */

/**
 * 对 POI 列表补齐缺失的 nameZh 和 nameEn
 *
 * 规则：
 *   - 如果 nameZh 为空且 namePrimary 不是中文 → 翻译为中文
 *   - 如果 nameEn 为空且 namePrimary 不是英文 → 翻译为英文
 *   - 如果 namePrimary 本身就是中文，则 nameZh 留空（反之亦然）
 */
export async function fillMissingTranslations(pois: RawPOI[]): Promise<RawPOI[]> {
  if (!API_KEYS.dashscope) {
    console.log('  [Translate] DashScope API Key 未配置，跳过翻译')
    return pois
  }

  // 收集需要翻译中文名的 POI
  const needZh: TranslateEntry[] = []
  // 收集需要翻译英文名的 POI
  const needEn: TranslateEntry[] = []

  for (let i = 0; i < pois.length; i++) {
    const poi = pois[i]
    const primary = poi.namePrimary || ''

    // 缺中文名，且主名称不是中文 → 需要翻译
    if (!poi.nameZh && !isChinese(primary)) {
      needZh.push({ index: i, name: primary })
    }

    // 缺英文名，且主名称不是英文 → 需要翻译
    if (!poi.nameEn && !isLatin(primary)) {
      needEn.push({ index: i, name: primary })
    }
  }

  console.log(`  [Translate] 需补齐翻译: 中文名 ${needZh.length} 条, 英文名 ${needEn.length} 条`)

  // 分批翻译中文名
  if (needZh.length > 0) {
    for (let batch = 0; batch < needZh.length; batch += BATCH_SIZE) {
      const slice = needZh.slice(batch, batch + BATCH_SIZE)
      const names = slice.map(e => e.name)

      try {
        const translated = await batchTranslate(names, 'toZh')
        for (let j = 0; j < slice.length; j++) {
          pois[slice[j].index].nameZh = translated[j]
        }
        console.log(`  [Translate] 中文名批次 ${Math.floor(batch / BATCH_SIZE) + 1}: ${slice.length} 条`)
      } catch (err) {
        console.error(`  [Translate] 中文名翻译失败:`, (err as Error).message)
      }

      if (batch + BATCH_SIZE < needZh.length) {
        await delay(300)
      }
    }
  }

  // 分批翻译英文名
  if (needEn.length > 0) {
    for (let batch = 0; batch < needEn.length; batch += BATCH_SIZE) {
      const slice = needEn.slice(batch, batch + BATCH_SIZE)
      const names = slice.map(e => e.name)

      try {
        const translated = await batchTranslate(names, 'toEn')
        for (let j = 0; j < slice.length; j++) {
          pois[slice[j].index].nameEn = translated[j]
        }
        console.log(`  [Translate] 英文名批次 ${Math.floor(batch / BATCH_SIZE) + 1}: ${slice.length} 条`)
      } catch (err) {
        console.error(`  [Translate] 英文名翻译失败:`, (err as Error).message)
      }

      if (batch + BATCH_SIZE < needEn.length) {
        await delay(300)
      }
    }
  }

  return pois
}
