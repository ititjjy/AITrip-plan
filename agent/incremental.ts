/**
 * agent/incremental.ts — 增量更新系统
 *
 * 无固定周期，完全由调度器根据优先级自动决定。
 *
 * 导出:
 *   shouldRunIncremental()    — 判断是否应执行增量更新
 *   selectIncrementalCities() — 选取增量目标城市
 *   selectIncrementalSources()— 选取廉价数据源
 *   mergeIncremental()        — 增量合并 (新数据融入已有)
 *   checkValidity()           — 全量刷新时的有效性检查
 */

import type { RawPOI, POI, CityInfo, SourceCollector, POIScore } from './sources/base.js'
import { AGENT_CONFIG } from './config.js'
import { getAllCityStats } from './db.js'
import { calculatePriorities } from './scheduler.js'
import { compositeSimilarity, isInvalidPOI } from './similarity.js'
import { resolveCategoryPath } from './categories.js'
import { computePOIScore } from './merger.js'

/* ═══════════════════════ Types ═══════════════════════ */

export interface IncrementalDecision {
  shouldRun: boolean
  mode: 'incremental' | 'full_refresh' | 'none'
  reason: string
  staleCityCount: number
  totalCityCount: number
}

export interface ValidityReport {
  cityId: string
  valid: number
  stale: number
  augmented: number
  newAdded: number
  total: number
}

/* ═══════════════════════ 1. 是否应执行增量 ═══════════════════════ */

/**
 * 根据数据新鲜度分布判断是否需要增量/全量刷新。
 *
 * - >50% 城市数据超过 7 天 → 建议增量更新
 * - >50% 城市数据超过 30 天 → 建议全量刷新
 */
export function shouldRunIncremental(): IncrementalDecision {
  const stats = getAllCityStats()
  const now = Date.now()
  const totalCities = stats.length

  if (totalCities === 0) {
    return {
      shouldRun: false,
      mode: 'none',
      reason: '无城市数据，请先执行 baseline 采集',
      staleCityCount: 0,
      totalCityCount: 0,
    }
  }

  let stale7 = 0
  let stale30 = 0
  for (const s of stats) {
    if (!s.last_collection_at) {
      stale7++
      stale30++
      continue
    }
    const ageDays = (now - s.last_collection_at) / 86_400_000
    if (ageDays > 7) stale7++
    if (ageDays > AGENT_CONFIG.staleThresholdDays) stale30++
  }

  const stale7Ratio = stale7 / totalCities
  const stale30Ratio = stale30 / totalCities

  if (stale30Ratio > 0.5) {
    return {
      shouldRun: true,
      mode: 'full_refresh',
      reason: `${stale30}/${totalCities} 城市数据超过 ${AGENT_CONFIG.staleThresholdDays} 天 (${Math.round(stale30Ratio * 100)}%)`,
      staleCityCount: stale30,
      totalCityCount: totalCities,
    }
  }

  if (stale7Ratio > 0.5) {
    return {
      shouldRun: true,
      mode: 'incremental',
      reason: `${stale7}/${totalCities} 城市数据超过 7 天 (${Math.round(stale7Ratio * 100)}%)`,
      staleCityCount: stale7,
      totalCityCount: totalCities,
    }
  }

  return {
    shouldRun: stale7 > 0,
    mode: 'incremental',
    reason: `${stale7}/${totalCities} 城市需要更新`,
    staleCityCount: stale7,
    totalCityCount: totalCities,
  }
}

/* ═══════════════════════ 2. 选取增量城市 ═══════════════════════ */

/**
 * 复用 scheduler 的优先级评分，跳过近期已采集的城市。
 * scheduler 在 incrementalMode=true 下已自动跳过近期采集的城市。
 */
export function selectIncrementalCities(
  cities: CityInfo[],
  maxCities?: number,
): CityInfo[] {
  const max = maxCities || Math.max(1, Math.floor(cities.length / 4))

  // scheduler 在 incrementalMode 下已跳过近期城市
  const priorities = calculatePriorities(cities, true)
  return priorities.slice(0, max).map(p => p.city)
}

/* ═══════════════════════ 3. 选取廉价数据源 ═══════════════════════ */

/**
 * 增量模式: 选 2 个最廉价可用来源
 * 全量刷新: 使用全部可用来源
 *
 * 优先级: OSM(免费) > AI > Foursquare > Amap > Google
 */
export function selectIncrementalSources(
  allCollectors: SourceCollector[],
  fullRefresh: boolean = false,
): SourceCollector[] {
  if (fullRefresh) return allCollectors

  const priority = ['osm', 'qwen', 'spark', 'doubao', 'foursquare', 'amap', 'google']
  const sorted = [...allCollectors].sort((a, b) => {
    const ia = priority.indexOf(a.name)
    const ib = priority.indexOf(b.name)
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
  })

  return sorted.slice(0, 2)
}

/* ═══════════════════════ 4. 增量合并 ═══════════════════════ */

/**
 * 将新采集的 RawPOI 融入已有 POI 数据。
 *
 * 三种结果:
 *   匹配 → 增强已有 POI (填补空白字段, 更新更好数据)
 *   无匹配的新 POI → 添加
 *   无匹配的已有 POI → 保留不变
 */
export function mergeIncremental(
  existingPOIs: POI[],
  newRawPOIs: RawPOI[],
  city: CityInfo,
): {
  pois: POI[]
  stats: { matched: number; newAdded: number; augmented: number; unchanged: number }
} {
  const MERGE_THRESHOLD = AGENT_CONFIG.mergeThreshold

  // 过滤无效新 POI
  const validNew = newRawPOIs.filter(p => !isInvalidPOI(p))

  // 标记哪些已有 POI 被匹配
  const matchedExisting = new Set<number>()
  // 标记哪些新 POI 已匹配
  const matchedNew = new Set<number>()
  // 增强记录
  let augmented = 0

  // 对每个新 POI, 尝试匹配已有 POI
  const result = [...existingPOIs]

  for (let ni = 0; ni < validNew.length; ni++) {
    const newPoi = validNew[ni]
    let bestMatch = -1
    let bestScore = 0

    for (let ei = 0; ei < existingPOIs.length; ei++) {
      if (matchedExisting.has(ei)) continue

      const existing = existingPOIs[ei]
      // 将 POI 转为 RawPOI-like 用于比较
      const existingAsRaw = poiToRawPOI(existing)
      const sim = compositeSimilarity(existingAsRaw, newPoi)

      if (sim.score >= MERGE_THRESHOLD && sim.score > bestScore) {
        bestScore = sim.score
        bestMatch = ei
      }
    }

    if (bestMatch >= 0) {
      // 匹配成功: 增强已有 POI
      matchedExisting.add(bestMatch)
      matchedNew.add(ni)
      result[bestMatch] = augmentPOI(result[bestMatch], newPoi)
      augmented++
    }
  }

  // 添加未匹配的新 POI
  let newAdded = 0
  for (let ni = 0; ni < validNew.length; ni++) {
    if (matchedNew.has(ni)) continue

    const newPoi = validNew[ni]
    const l1 = newPoi.categoryL1
    // 检查该类目是否已有足够 POI (不超过目标数)
    const categoryCount = result.filter(p => p.categoryL1 === l1).length
    if (categoryCount >= AGENT_CONFIG.targetPOIsPerCategory) continue

    // 转换为 POI 格式
    const poi = rawToMinimalPOI(newPoi, city.id, result.length + 1)
    result.push(poi)
    newAdded++
  }

  const unchanged = existingPOIs.length - matchedExisting.size

  return {
    pois: result,
    stats: {
      matched: matchedExisting.size,
      newAdded,
      augmented,
      unchanged,
    },
  }
}

/* ═══════════════════════ 5. 有效性检查 ═══════════════════════ */

/**
 * 全量刷新时检查 POI 是否仍出现在来源数据中。
 * 未找到的标记为 potentially_stale (不自动删除)。
 */
export function checkValidity(
  existingPOIs: POI[],
  newRawPOIs: RawPOI[],
  city: CityInfo,
): ValidityReport {
  const MERGE_THRESHOLD = 0.85 // 稍微降低阈值用于验证

  let valid = 0
  let stale = 0
  let augmentedCount = 0

  const validNew = newRawPOIs.filter(p => !isInvalidPOI(p))
  const matchedNew = new Set<number>()

  for (const existing of existingPOIs) {
    const existingAsRaw = poiToRawPOI(existing)
    let found = false

    for (let ni = 0; ni < validNew.length; ni++) {
      if (matchedNew.has(ni)) continue

      const sim = compositeSimilarity(existingAsRaw, validNew[ni])
      if (sim.score >= MERGE_THRESHOLD) {
        found = true
        matchedNew.add(ni)
        augmentedCount++
        break
      }
    }

    if (found) {
      valid++
    } else {
      stale++
    }
  }

  const newAdded = validNew.length - matchedNew.size

  return {
    cityId: city.id,
    valid,
    stale,
    augmented: augmentedCount,
    newAdded,
    total: existingPOIs.length,
  }
}

/* ═══════════════════════ Helpers ═══════════════════════ */

/** POI → RawPOI-like (用于相似度比较) */
function poiToRawPOI(poi: POI): RawPOI {
  return {
    namePrimary: poi.namePrimary,
    nameZh: poi.nameZh,
    nameEn: poi.nameEn,
    categoryL1: poi.categoryL1,
    categoryL3: poi.categoryL3,
    lat: poi.lat,
    lng: poi.lng,
    address: poi.address,
    addressEn: poi.addressEn,
    rating: poi.rating,
    cost: poi.cost,
    visitDuration: poi.visitDuration,
    description: poi.description,
    tags: poi.tags,
    operatingHours: poi.operatingHours,
    bestSeasons: poi.bestSeasons,
    monthlyIndex: poi.monthlyIndex,
    source: poi.id.split('-')[0] || 'agent',
  }
}

/** 为单源 POI 构造最小评分 */
function scoreForRawPOI(raw: RawPOI): POIScore {
  const report = {
    sourceCount: 1,
    sources: [raw.source || 'unknown'],
    comparablePairs: 0,
    conflictPairs: 0,
    conflictCount: 0,
    agreementRatio: 1,
    conflictFields: [],
  }
  return computePOIScore(raw, report)
}

/** 用新数据增强已有 POI (填补空白字段) */
function augmentPOI(existing: POI, newData: RawPOI): POI {
  const updated = { ...existing }

  // 填补空白名称
  if (!updated.nameZh && newData.nameZh) updated.nameZh = newData.nameZh
  if (!updated.nameEn && newData.nameEn) updated.nameEn = newData.nameEn

  // 描述: 取更长的
  if (newData.description && newData.description.length > (updated.description?.length || 0)) {
    updated.description = newData.description
  }

  // 评分: 优先非 AI 来源
  if (newData.rating && newData.source !== 'qwen') {
    if (!updated.rating || updated.rating === 0) {
      updated.rating = newData.rating
    }
  }

  // 标签: 合并
  if (newData.tags && newData.tags.length > 0) {
    const merged = new Set([...(updated.tags || []), ...newData.tags])
    updated.tags = [...merged].slice(0, 6)
  }

  // 地址: 填补空白
  if (!updated.address && newData.address) updated.address = newData.address
  if (!updated.addressEn && newData.addressEn) updated.addressEn = newData.addressEn

  // 月度指数: 仅当已有数据缺失时
  if ((!updated.monthlyIndex || updated.monthlyIndex.length !== 12) && newData.monthlyIndex) {
    updated.monthlyIndex = newData.monthlyIndex
  }

  // 最佳季节: 合并
  if (newData.bestSeasons && newData.bestSeasons.length > 0) {
    const merged = new Set([...(updated.bestSeasons || []), ...newData.bestSeasons])
    updated.bestSeasons = [...merged]
  }

  // 增强后重新计算 score
  const raw: RawPOI = {
    namePrimary: updated.namePrimary,
    nameZh: updated.nameZh,
    nameEn: updated.nameEn,
    categoryL1: updated.categoryL1,
    categoryL3: updated.categoryL3,
    lat: updated.lat,
    lng: updated.lng,
    address: updated.address,
    addressEn: updated.addressEn,
    rating: updated.rating,
    cost: updated.cost,
    visitDuration: updated.visitDuration,
    description: updated.description,
    tags: updated.tags,
    operatingHours: updated.operatingHours,
    bestSeasons: updated.bestSeasons,
    monthlyIndex: updated.monthlyIndex,
    source: updated.id.split('-')[0] || 'agent',
  }
  updated.score = scoreForRawPOI(raw)

  return updated
}

/** RawPOI → POI 最小转换 (用于新增) */
function rawToMinimalPOI(raw: RawPOI, cityId: string, index: number): POI {
  const path = resolveCategoryPath(raw.categoryL3)
  const score = scoreForRawPOI(raw)

  return {
    id: `${raw.source || 'agent'}-${cityId}-${index}`,
    namePrimary: raw.namePrimary,
    nameZh: raw.nameZh || '',
    nameEn: raw.nameEn || '',
    categoryL1: raw.categoryL1,
    categoryL2: path?.l2 || `${raw.categoryL1}.default`,
    categoryL3: raw.categoryL3,
    image: '',
    rating: Math.min(5, Math.max(1, raw.rating || 4.0)),
    cost: Math.max(0, raw.cost || 0),
    visitDuration: Math.min(720, Math.max(0, raw.visitDuration || 60)),
    description: raw.description || '',
    address: raw.address || '',
    addressEn: raw.addressEn || '',
    lat: raw.lat,
    lng: raw.lng,
    tags: (raw.tags || []).slice(0, 4),
    operatingHours: raw.operatingHours || '',
    recommendReason: '',
    bestSeasons: raw.bestSeasons || [],
    monthlyIndex: raw.monthlyIndex || [3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 3, 3],
    score,
  }
}
