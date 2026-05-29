/**
 * agent/scheduler.ts — 城市采集优先级调度
 *
 * 根据热度、数据新鲜度、质量缺口等因素计算采集优先级。
 * 支持增量模式: 跳过近期已采集城市，增加数据年龄因子。
 */

import type { CityInfo } from './sources/base.js'
import { getCityStats } from './db.js'
import { AGENT_CONFIG } from './config.js'

export interface PriorityResult {
  city: CityInfo
  score: number
  reasons: string[]
}

export function calculatePriorities(
  cities: CityInfo[],
  incrementalMode: boolean = false,
): PriorityResult[] {
  const results: PriorityResult[] = []
  const now = Date.now()
  const minGapMs = incrementalMode
    ? AGENT_CONFIG.incrementalMinDaysGap * 86_400_000
    : 0

  for (const city of cities) {
    const stats = getCityStats(city.id)
    const reasons: string[] = []

    // 增量模式: 跳过近期已采集的城市
    if (incrementalMode && stats?.last_collection_at) {
      const gap = now - stats.last_collection_at
      if (gap < minGapMs) continue
    }

    // 1. 热度 (0-100), 权重 30%
    const hotness = city.hotness || 50

    // 2. 新鲜度 (0-100), 权重 25%
    let freshness = 100
    let dataAgeDays = Infinity
    if (stats?.last_collection_at) {
      dataAgeDays = (now - stats.last_collection_at) / 86_400_000
      freshness = Math.max(0, 100 - dataAgeDays * 3)
      if (dataAgeDays > 30) reasons.push(`数据已 ${Math.round(dataAgeDays)} 天未更新`)
    } else {
      reasons.push('从未采集')
    }

    // 3. 质量缺口 (0-100), 权重 20%
    const qualityScore = stats?.quality_score ?? 50
    const qualityGap = 100 - qualityScore
    if (qualityScore < 40) reasons.push(`质量评分 ${qualityScore} (D级)`)

    // 4. 季节相关度 (0-100), 权重 15%
    const seasonGap = stats?.total_pois ? 30 : 100
    if (!stats?.total_pois) reasons.push('当前季节无数据')

    // 5. 失败补偿 (0-100), 权重 10%
    const failureBoost = Math.min(40, (stats?.failure_count || 0) * 20)
    if (stats?.failure_count > 0) reasons.push(`连续失败 ${stats.failure_count} 次`)

    // 加权求和
    let score = Math.round(
      0.30 * hotness +
      0.25 * freshness +
      0.20 * qualityGap +
      0.15 * seasonGap +
      0.10 * failureBoost
    )

    // 增量模式: 数据年龄加成 (越久越优先)
    if (incrementalMode && dataAgeDays < Infinity) {
      const ageBonus = Math.min(20, dataAgeDays * 0.5)
      score += Math.round(ageBonus)
      if (dataAgeDays > 7) reasons.push(`数据年龄 ${Math.round(dataAgeDays)} 天`)
    }

    results.push({ city, score, reasons })
  }

  // 按分数降序
  results.sort((a, b) => b.score - a.score)
  return results
}

/**
 * 选取下一批要采集的城市。
 */
export function selectNextBatch(
  priorities: PriorityResult[],
  batchSize: number,
): PriorityResult[] {
  return priorities.slice(0, batchSize)
}
