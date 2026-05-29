/**
 * agent/quality.ts — 数据质量校验 & 清洗
 *
 * 对合并后的 POI 数据进行逐条检查和城市级评分。
 * 支持 6 大类目、三名系统、双语地址、月度指数等新字段。
 */

import { clamp, haversineDistance } from './utils.js'
import { L1_CATEGORIES } from './categories.js'
import type { POI, CityInfo, L1Category } from './sources/base.js'
import { classifyCategory } from './classifier.js'

/* ── 单 POI 校验 ── */

export interface POIIssue {
  poiId: string
  poiName: string
  issue: string
  severity: 'error' | 'warning'
  autoFixed: boolean
}

function validatePOI(poi: POI, city: CityInfo): POIIssue[] {
  const issues: POIIssue[] = []

  // 坐标有效性
  if (poi.lat === 0 && poi.lng === 0) {
    issues.push({ poiId: poi.id, poiName: poi.namePrimary, issue: 'INVALID_COORDS: (0,0)', severity: 'error', autoFixed: false })
  } else if (city.lat !== 0 && city.lng !== 0) {
    const dist = haversineDistance(poi.lat, poi.lng, city.lat, city.lng)
    if (dist > 50) {
      issues.push({ poiId: poi.id, poiName: poi.namePrimary, issue: `COORDS_TOO_FAR: ${dist.toFixed(1)}km from center`, severity: 'error', autoFixed: false })
    }
  }

  // 坐标精度 (应为 4 位小数)
  const latDecimals = countDecimals(poi.lat)
  const lngDecimals = countDecimals(poi.lng)
  if (latDecimals > 4 || lngDecimals > 4) {
    issues.push({ poiId: poi.id, poiName: poi.namePrimary, issue: `COORDS_PRECISION: lat=${latDecimals},lng=${lngDecimals} decimals`, severity: 'warning', autoFixed: true })
  }

  // 主名称有效性
  if (!poi.namePrimary || poi.namePrimary.trim().length < 2) {
    issues.push({ poiId: poi.id, poiName: poi.namePrimary, issue: 'INVALID_NAME_PRIMARY: too short', severity: 'error', autoFixed: false })
  }
  if (/^\d+$/.test(poi.namePrimary)) {
    issues.push({ poiId: poi.id, poiName: poi.namePrimary, issue: 'INVALID_NAME_PRIMARY: pure digits', severity: 'error', autoFixed: false })
  }

  // 中文名/英文名缺失 (warning)
  if (!poi.nameZh) {
    issues.push({ poiId: poi.id, poiName: poi.namePrimary, issue: 'MISSING_NAME_ZH', severity: 'warning', autoFixed: false })
  }
  if (!poi.nameEn) {
    issues.push({ poiId: poi.id, poiName: poi.namePrimary, issue: 'MISSING_NAME_EN', severity: 'warning', autoFixed: false })
  }

  // 评分范围
  if (poi.rating < 1 || poi.rating > 5) {
    issues.push({ poiId: poi.id, poiName: poi.namePrimary, issue: `INVALID_RATING: ${poi.rating}`, severity: 'warning', autoFixed: true })
  }

  // 费用合理
  if (poi.cost < 0) {
    issues.push({ poiId: poi.id, poiName: poi.namePrimary, issue: 'INVALID_COST: negative', severity: 'warning', autoFixed: true })
  }

  // 时长合理 (酒店可为 0)
  if (poi.categoryL1 !== 'hotel' && (poi.visitDuration < 15 || poi.visitDuration > 720)) {
    issues.push({ poiId: poi.id, poiName: poi.namePrimary, issue: `INVALID_DURATION: ${poi.visitDuration}`, severity: 'warning', autoFixed: true })
  }

  // 描述质量
  if (!poi.description || poi.description.length < 10) {
    issues.push({ poiId: poi.id, poiName: poi.namePrimary, issue: 'WEAK_DESCRIPTION', severity: 'warning', autoFixed: false })
  }

  // 地址缺失
  if (!poi.address) {
    issues.push({ poiId: poi.id, poiName: poi.namePrimary, issue: 'MISSING_ADDRESS', severity: 'warning', autoFixed: false })
  }

  // 月度指数校验
  if (poi.monthlyIndex.length !== 12) {
    issues.push({ poiId: poi.id, poiName: poi.namePrimary, issue: `INVALID_MONTHLY_INDEX: length=${poi.monthlyIndex.length}`, severity: 'warning', autoFixed: true })
  } else {
    const outOfRange = poi.monthlyIndex.some(v => v < 0 || v > 5)
    if (outOfRange) {
      issues.push({ poiId: poi.id, poiName: poi.namePrimary, issue: 'MONTHLY_INDEX_OUT_OF_RANGE', severity: 'warning', autoFixed: true })
    }
  }

  // 类目有效性
  if (!L1_CATEGORIES.includes(poi.categoryL1)) {
    issues.push({ poiId: poi.id, poiName: poi.namePrimary, issue: `INVALID_L1_CATEGORY: ${poi.categoryL1}`, severity: 'error', autoFixed: false })
  }

  // 类目一致性检查: POI 关键词是否强烈暗示其他 L1
  const classification = classifyCategory({
    namePrimary: poi.namePrimary,
    nameZh: poi.nameZh,
    nameEn: poi.nameEn,
    categoryL1: poi.categoryL1,
    categoryL3: poi.categoryL3,
    lat: poi.lat,
    lng: poi.lng,
    address: poi.address,
    addressEn: poi.addressEn,
    description: poi.description,
    tags: poi.tags,
    source: 'agent',
  })
  if (classification.confidence > 0.7 && classification.l1 !== poi.categoryL1) {
    issues.push({
      poiId: poi.id,
      poiName: poi.namePrimary,
      issue: `CATEGORY_MISMATCH: classified as ${classification.l1} (conf=${Math.round(classification.confidence * 100)}%) but stored as ${poi.categoryL1}`,
      severity: 'warning',
      autoFixed: false,
    })
  }

  return issues
}

function countDecimals(n: number): number {
  const str = String(n)
  const dotIdx = str.indexOf('.')
  return dotIdx >= 0 ? str.length - dotIdx - 1 : 0
}

/* ── 自动修正 ── */

function autoFixPOI(poi: POI): POI {
  return {
    ...poi,
    rating: clamp(poi.rating, 1, 5),
    cost: Math.max(0, poi.cost),
    visitDuration: poi.categoryL1 === 'hotel' ? Math.max(0, poi.visitDuration) : clamp(poi.visitDuration, 15, 720),
    lat: roundTo4(poi.lat),
    lng: roundTo4(poi.lng),
    monthlyIndex: normalizeMonthlyIndex(poi.monthlyIndex),
  }
}

function roundTo4(n: number): number {
  return Math.round(n * 10000) / 10000
}

function normalizeMonthlyIndex(arr: number[]): number[] {
  if (arr.length !== 12) return [3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 3, 3]
  return arr.map(v => clamp(Math.round(v), 0, 5))
}

/* ── 过滤无效 POI ── */

function shouldDiscard(poi: POI, city: CityInfo): boolean {
  if (poi.lat === 0 && poi.lng === 0) return true
  if (!poi.namePrimary || poi.namePrimary.trim().length < 2) return true
  if (/^\d+$/.test(poi.namePrimary)) return true

  if (city.lat !== 0 && city.lng !== 0) {
    const dist = haversineDistance(poi.lat, poi.lng, city.lat, city.lng)
    if (dist > 100) return true
  }

  return false
}

/* ── 城市级质量评估 ── */

export interface QualityReport {
  cityId: string
  overallScore: number
  dimensions: {
    completeness: number  // 完整性
    accuracy: number      // 准确性
    richness: number      // 丰富度
    diversity: number     // 多样性
  }
  issues: POIIssue[]
  totalPOIs: number
  discardedCount: number
  fixedCount: number
  byCategory: Record<string, number>
}

export function evaluateQuality(pois: POI[], city: CityInfo): QualityReport {
  // 1. 过滤无效 POI
  const validPOIs: POI[] = []
  const discarded: POI[] = []
  for (const poi of pois) {
    if (shouldDiscard(poi, city)) {
      discarded.push(poi)
    } else {
      validPOIs.push(autoFixPOI(poi))
    }
  }

  // 2. 逐 POI 校验
  const allIssues: POIIssue[] = []
  let fixedCount = 0
  for (const poi of validPOIs) {
    const issues = validatePOI(poi, city)
    allIssues.push(...issues)
    fixedCount += issues.filter(i => i.autoFixed).length
  }

  // 3. 完整性评分 (新字段权重调整)
  let completenessSum = 0
  for (const poi of validPOIs) {
    let filled = 0
    let total = 0
    // 必填字段 (权重 1)
    for (const f of [
      !!poi.namePrimary, poi.lat !== 0, poi.lng !== 0,
      !!poi.description, !!poi.address, !!poi.categoryL1,
    ]) { total++; if (f) filled++ }
    // 重要字段 (权重 0.5)
    for (const f of [
      !!poi.nameZh, !!poi.nameEn, !!poi.addressEn, poi.rating > 0,
      poi.monthlyIndex.length === 12, poi.bestSeasons.length > 0,
      !!poi.operatingHours, poi.tags.length > 0,
    ]) { total += 0.5; if (f) filled += 0.5 }
    completenessSum += (filled / total) * 100
  }
  const completeness = validPOIs.length > 0 ? completenessSum / validPOIs.length : 0

  // 4. 准确性评分
  const errorCount = allIssues.filter(i => i.severity === 'error').length
  const accuracy = validPOIs.length > 0
    ? Math.max(0, 100 - (errorCount / validPOIs.length) * 100)
    : 0

  // 5. 丰富度评分
  let richnessSum = 0
  for (const poi of validPOIs) {
    let score = 40  // 基础分
    if (poi.description && poi.description.length >= 50) score += 20
    else if (poi.description && poi.description.length >= 30) score += 10
    if (poi.tags && poi.tags.length >= 3) score += 10
    else if (poi.tags && poi.tags.length >= 2) score += 5
    if (poi.nameZh && poi.nameEn) score += 10  // 三名齐全
    else if (poi.nameZh || poi.nameEn) score += 5
    if (poi.addressEn) score += 5  // 双语地址
    if (poi.monthlyIndex.length === 12) score += 5  // 月度指数
    if (poi.bestSeasons.length > 0) score += 5  // 最佳季节
    richnessSum += Math.min(100, score)
  }
  const richness = validPOIs.length > 0 ? richnessSum / validPOIs.length : 0

  // 6. 多样性评分 (6 大类目)
  const counts = new Map<L1Category, number>()
  for (const cat of L1_CATEGORIES) counts.set(cat, 0)
  for (const poi of validPOIs) {
    const c = poi.categoryL1 as L1Category
    counts.set(c, (counts.get(c) || 0) + 1)
  }
  const total = validPOIs.length || 1
  const idealRatio = 1 / L1_CATEGORIES.length  // ~0.167
  let deviation = 0
  for (const [, count] of counts) {
    deviation += Math.abs(count / total - idealRatio)
  }
  const diversity = Math.max(0, 100 - deviation * 150)

  // 综合评分
  const overallScore = Math.round(
    0.25 * completeness + 0.25 * accuracy + 0.30 * richness + 0.20 * diversity
  )

  const byCategory: Record<string, number> = {}
  for (const [cat, count] of counts) {
    byCategory[cat] = count
  }

  return {
    cityId: city.id,
    overallScore,
    dimensions: {
      completeness: Math.round(completeness),
      accuracy: Math.round(accuracy),
      richness: Math.round(richness),
      diversity: Math.round(diversity),
    },
    issues: allIssues,
    totalPOIs: validPOIs.length,
    discardedCount: discarded.length,
    fixedCount,
    byCategory,
  }
}

/**
 * 清理并返回有效 POI 列表。
 */
export function cleanPOIs(pois: POI[], city: CityInfo): POI[] {
  return pois
    .filter(poi => !shouldDiscard(poi, city))
    .map(autoFixPOI)
}

/**
 * 质量等级。
 */
export function qualityGrade(score: number): string {
  if (score >= 80) return 'A'
  if (score >= 60) return 'B'
  if (score >= 40) return 'C'
  return 'D'
}

/**
 * 数据新鲜度评估。
 *
 * 基于数据年龄计算新鲜度得分 (0-100)。
 * @param updatedAt 上次更新时间戳 (ms)
 * @param maxAgeDays 最大有效天数 (默认 30)
 */
export function evaluateFreshness(
  updatedAt: number | null,
  maxAgeDays: number = 30,
): { score: number; ageDays: number; grade: string } {
  if (!updatedAt) {
    return { score: 0, ageDays: Infinity, grade: 'unknown' }
  }

  const now = Date.now()
  const ageDays = (now - updatedAt) / 86_400_000

  // 线性衰减: 0 天 → 100, maxAgeDays → 0
  const score = Math.max(0, Math.round(100 * (1 - ageDays / maxAgeDays)))

  let grade: string
  if (ageDays <= 3) grade = 'fresh'
  else if (ageDays <= 7) grade = 'recent'
  else if (ageDays <= 14) grade = 'aging'
  else if (ageDays <= maxAgeDays) grade = 'stale'
  else grade = 'expired'

  return { score, ageDays: Math.round(ageDays * 10) / 10, grade }
}
