/**
 * agent/merger.ts — 多源数据合并管道 (v2)
 *
 * 基于 similarity.ts 的 5 路径决策树 + classifier.ts 的冲突解决，
 * 使用 Union-Find 进行传递性去重。
 *
 * 管道:
 *   Pre-filter → L1 分组 + 地理预分桶 → 两两相似度 + Union-Find
 *   → 跨类目去重 → 类目冲突解决 → 数据合并 → 后分类检查
 */

import { clamp, haversineDistance } from './utils.js'
import { resolveCategoryPath, L1_CATEGORIES } from './categories.js'
import type { RawPOI, L1Category, POI, CityInfo } from './sources/base.js'
import { getImageUrl, roundCoord } from './sources/base.js'
import {
  compositeSimilarity,
  isInvalidPOI,
  type CompositeResult,
} from './similarity.js'
import {
  classifyCategory,
  resolveCategoryConflict,
  resolveCategoryL3,
} from './classifier.js'

/* ═══════════════════════ Config ═══════════════════════ */

const MERGE_THRESHOLD = 0.90
const CROSS_CATEGORY_ENABLED = true
const MAX_TAGS = 6

const SOURCE_RELIABILITY: Record<string, number> = {
  osm: 3, google: 2, foursquare: 2, amap: 2, ai: 1,
}

/* ═══════════════════════ Union-Find ═══════════════════════ */

class UnionFind {
  private parent: number[]
  private rank: number[]

  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i)
    this.rank = new Array(n).fill(0)
  }

  find(x: number): number {
    while (this.parent[x] !== x) {
      this.parent[x] = this.parent[this.parent[x]]
      x = this.parent[x]
    }
    return x
  }

  union(a: number, b: number): void {
    const ra = this.find(a)
    const rb = this.find(b)
    if (ra === rb) return

    if (this.rank[ra] < this.rank[rb]) {
      this.parent[ra] = rb
    } else if (this.rank[ra] > this.rank[rb]) {
      this.parent[rb] = ra
    } else {
      this.parent[rb] = ra
      this.rank[ra]++
    }
  }

  groups(): Map<number, number[]> {
    const map = new Map<number, number[]>()
    for (let i = 0; i < this.parent.length; i++) {
      const root = this.find(i)
      const list = map.get(root) || []
      list.push(i)
      map.set(root, list)
    }
    return map
  }
}

/* ═══════════════════════ Types ═══════════════════════ */

export interface MergeDetail {
  indices: number[]
  path: string
  score: number
}

export interface MergeResult {
  pois: POI[]
  stats: {
    totalRaw: number
    invalidFiltered: number
    afterDedup: number
    afterMerge: number
    byCategory: Record<string, number>
    crossCategoryMerges: number
    categoryReclassifications: number
    duplicatePairs: number
    mergeDetails: MergeDetail[]
  }
}

/* ═══════════════════════ 1. Pre-filter ═══════════════════════ */

function preFilter(
  pois: RawPOI[],
  city: CityInfo,
): { valid: RawPOI[]; filtered: number } {
  const valid: RawPOI[] = []
  let filtered = 0

  for (const poi of pois) {
    // 无效 POI 检测
    if (isInvalidPOI(poi)) {
      filtered++
      continue
    }

    // 坐标远离城市 (>100km)
    if (city.lat !== 0 && city.lng !== 0) {
      const dist = haversineDistance(poi.lat, poi.lng, city.lat, city.lng)
      if (dist > 100) {
        filtered++
        continue
      }
    }

    valid.push(poi)
  }

  return { valid, filtered }
}

/* ═══════════════════════ 2. 地理预分桶 ═══════════════════════ */

/**
 * 坐标 round 到 0.01° (约 1.1km) 作为桶 key
 * 只比较同桶/相邻桶内的 POI
 */
function geoBucketKey(lat: number, lng: number): string {
  return `${Math.round(lat * 100)}|${Math.round(lng * 100)}`
}

function adjacentBucketKeys(key: string): string[] {
  const [latPart, lngPart] = key.split('|').map(Number)
  const keys: string[] = []
  for (let dlat = -1; dlat <= 1; dlat++) {
    for (let dlng = -1; dlng <= 1; dlng++) {
      keys.push(`${latPart + dlat}|${lngPart + dlng}`)
    }
  }
  return keys
}

/* ═══════════════════════ 3. 组内 Union-Find 去重 ═══════════════════════ */

function deduplicateGroup(
  pois: RawPOI[],
  startIndex: number,
): { uf: UnionFind; pairs: number; details: MergeDetail[] } {
  const n = pois.length
  const uf = new UnionFind(n)
  let pairs = 0
  const details: MergeDetail[] = []

  // 地理预分桶
  const buckets = new Map<string, number[]>()
  for (let i = 0; i < n; i++) {
    const key = geoBucketKey(pois[i].lat, pois[i].lng)
    const list = buckets.get(key) || []
    list.push(i)
    buckets.set(key, list)
  }

  // 只在相邻桶内两两比较
  const compared = new Set<string>()
  for (const [bucketKey, indices] of buckets) {
    const neighborKeys = adjacentBucketKeys(bucketKey)

    for (const i of indices) {
      for (const nKey of neighborKeys) {
        const neighbors = buckets.get(nKey)
        if (!neighbors) continue

        for (const j of neighbors) {
          if (j <= i) continue
          const pairKey = `${i}:${j}`
          if (compared.has(pairKey)) continue
          compared.add(pairKey)

          const result = compositeSimilarity(pois[i], pois[j])
          if (result.score >= MERGE_THRESHOLD && isMergeAllowed(result)) {
            uf.union(i, j)
            pairs++
            details.push({
              indices: [startIndex + i, startIndex + j],
              path: result.path,
              score: result.score,
            })
          }
        }
      }
    }
  }

  return { uf, pairs, details }
}

function isMergeAllowed(result: CompositeResult): boolean {
  // 阻止明确标记为 fail 的路径
  if (result.path === 'cross-related-fail') return false
  if (result.path === 'cross-unrelated-fail') return false
  if (result.path === 'same-type-perfect-low-content') return false
  return true
}

/* ═══════════════════════ 4. 跨类目去重 ═══════════════════════ */

function crossCategoryDedup(
  allPois: RawPOI[],
  l1Groups: Map<L1Category, number[]>,
  uf: UnionFind,
  baseIndex: Map<L1Category, number>,
): { pairs: number; details: MergeDetail[] } {
  if (!CROSS_CATEGORY_ENABLED) return { pairs: 0, details: [] }

  const relatedPairs: [L1Category, L1Category][] = [
    ['scenic', 'experience'],
    ['entertainment', 'experience'],
    ['food', 'experience'],
  ]

  let pairs = 0
  const details: MergeDetail[] = []

  for (const [l1a, l1b] of relatedPairs) {
    const indicesA = l1Groups.get(l1a) || []
    const indicesB = l1Groups.get(l1b) || []

    if (indicesA.length === 0 || indicesB.length === 0) continue

    // 地理预分桶优化
    const bucketsA = new Map<string, number[]>()
    for (const i of indicesA) {
      const key = geoBucketKey(allPois[i].lat, allPois[i].lng)
      const list = bucketsA.get(key) || []
      list.push(i)
      bucketsA.set(key, list)
    }

    for (const j of indicesB) {
      const key = geoBucketKey(allPois[j].lat, allPois[j].lng)
      const neighborKeys = adjacentBucketKeys(key)

      for (const nKey of neighborKeys) {
        const candidates = bucketsA.get(nKey)
        if (!candidates) continue

        for (const i of candidates) {
          if (uf.find(i) === uf.find(j)) continue // 已在同一组

          const result = compositeSimilarity(allPois[i], allPois[j])
          if (result.score >= MERGE_THRESHOLD && isMergeAllowed(result)) {
            uf.union(i, j)
            pairs++
            details.push({
              indices: [i, j],
              path: result.path,
              score: result.score,
            })
          }
        }
      }
    }
  }

  return { pairs, details }
}

/* ═══════════════════════ 5. 数据合并 ═══════════════════════ */

function mergeGroup(group: RawPOI[]): RawPOI {
  if (group.length === 1) return { ...group[0] }

  // 选择最佳基础 POI: 优先非 AI 来源中信息最丰富的
  const sorted = [...group].sort((a, b) => {
    const wA = SOURCE_RELIABILITY[a.source] || 1
    const wB = SOURCE_RELIABILITY[b.source] || 1
    if (wA !== wB) return wB - wA
    return (b.description?.length || 0) - (a.description?.length || 0)
  })

  const base: RawPOI = { ...sorted[0] }

  // 坐标: 可靠性加权平均
  let totalWeight = 0
  let wLat = 0
  let wLng = 0
  for (const p of group) {
    const w = SOURCE_RELIABILITY[p.source] || 1
    wLat += p.lat * w
    wLng += p.lng * w
    totalWeight += w
  }
  base.lat = roundCoord(wLat / totalWeight)
  base.lng = roundCoord(wLng / totalWeight)

  // 三名: 从各来源填补
  base.nameZh = group.find(p => p.nameZh && p.nameZh.trim())?.nameZh || base.nameZh
  base.nameEn = group.find(p => p.nameEn && p.nameEn.trim())?.nameEn || base.nameEn

  // 描述: 取最长
  base.description = group.reduce((best, p) =>
    (p.description?.length || 0) > (best?.length || 0) ? p.description : best
  , '') || ''

  // 评分: 来源可靠性加权平均
  const rated = group.filter(p => p.rating && p.rating > 0)
  if (rated.length > 0) {
    let rSum = 0
    let rWeight = 0
    for (const p of rated) {
      const w = SOURCE_RELIABILITY[p.source] || 1
      rSum += (p.rating || 0) * w
      rWeight += w
    }
    base.rating = Math.round((rSum / rWeight) * 10) / 10
  }

  // 费用: 非零值中位数
  const costs = group.map(p => p.cost).filter((c): c is number => !!c && c > 0)
  if (costs.length > 0) {
    costs.sort((a, b) => a - b)
    base.cost = costs[Math.floor(costs.length / 2)]
  }

  // 时长: 非零值中位数
  const durations = group.map(p => p.visitDuration).filter((d): d is number => !!d && d > 0)
  if (durations.length > 0) {
    durations.sort((a, b) => a - b)
    base.visitDuration = durations[Math.floor(durations.length / 2)]
  }

  // 标签: 并集, max 6
  const allTags = new Set<string>()
  for (const p of group) {
    for (const t of (p.tags || [])) allTags.add(t)
  }
  base.tags = [...allTags].slice(0, MAX_TAGS)

  // 地址: 最长本地 + 最长英文
  base.address = group.reduce((best, p) =>
    (p.address?.length || 0) > (best?.length || 0) ? p.address : best
  , '') || ''
  base.addressEn = group.reduce((best, p) =>
    (p.addressEn?.length || 0) > (best?.length || 0) ? p.addressEn : best
  , '') || ''

  // 月度指数: 优先非 AI, 然后平均
  const withIndex = group.filter(p => p.monthlyIndex && p.monthlyIndex.length === 12)
  if (withIndex.length > 0) {
    const nonAI = withIndex.find(p => p.source !== 'ai')
    if (nonAI && nonAI.monthlyIndex) {
      base.monthlyIndex = nonAI.monthlyIndex
    } else {
      // 平均
      const avg = new Array(12).fill(0)
      for (const p of withIndex) {
        for (let m = 0; m < 12; m++) {
          avg[m] += (p.monthlyIndex?.[m] || 0)
        }
      }
      base.monthlyIndex = avg.map(v => Math.round(v / withIndex.length))
    }
  }

  // 最佳季节: 并集
  const allSeasons = new Set<string>()
  for (const p of group) {
    for (const s of (p.bestSeasons || [])) allSeasons.add(s)
  }
  base.bestSeasons = [...allSeasons]

  // 营业时间: 取非空最长
  base.operatingHours = group.reduce((best, p) =>
    (p.operatingHours?.length || 0) > (best?.length || 0) ? p.operatingHours : best
  , '') || base.operatingHours

  return base
}

/* ═══════════════════════ 6. RawPOI → POI ═══════════════════════ */

function rawToPOI(raw: RawPOI, cityId: string, index: number): POI {
  const l1 = raw.categoryL1
  const path = resolveCategoryPath(raw.categoryL3)

  return {
    id: `${raw.source || 'agent'}-${cityId}-${index}`,
    namePrimary: raw.namePrimary,
    nameZh: raw.nameZh || '',
    nameEn: raw.nameEn || '',
    categoryL1: l1,
    categoryL2: path?.l2 || `${l1}.${getDefaultL2(l1)}`,
    categoryL3: raw.categoryL3,
    image: getImageUrl(l1, index),
    rating: clamp(raw.rating || 4.0, 1, 5),
    cost: Math.max(0, raw.cost || 0),
    visitDuration: clamp(raw.visitDuration || 60, 0, 720),
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
  }
}

function getDefaultL2(l1: L1Category): string {
  const map: Record<L1Category, string> = {
    scenic: 'modern', food: 'local', shopping: 'mall',
    entertainment: 'theme', experience: 'outdoor', hotel: 'comfort',
  }
  return map[l1]
}

/* ═══════════════════════ 主合并函数 ═══════════════════════ */

export function mergeAndDeduplicate(
  allRawPOIs: RawPOI[],
  city: CityInfo,
  targetPerCategory: number = 100,
): MergeResult {
  const totalRaw = allRawPOIs.length
  console.log(`  [Merge] Raw POIs: ${totalRaw}`)

  // ── Step 1: Pre-filter ──
  const { valid: filteredPois, filtered: invalidCount } = preFilter(allRawPOIs, city)
  console.log(`  [Merge] After pre-filter: ${filteredPois.length} (filtered: ${invalidCount})`)

  if (filteredPois.length === 0) {
    return {
      pois: [],
      stats: {
        totalRaw,
        invalidFiltered: invalidCount,
        afterDedup: 0,
        afterMerge: 0,
        byCategory: {},
        crossCategoryMerges: 0,
        categoryReclassifications: 0,
        duplicatePairs: 0,
        mergeDetails: [],
      },
    }
  }

  // ── Step 2: L1 分组 ──
  const l1Groups = new Map<L1Category, number[]>()
  for (let i = 0; i < filteredPois.length; i++) {
    const l1 = filteredPois[i].categoryL1
    const list = l1Groups.get(l1) || []
    list.push(i)
    l1Groups.set(l1, list)
  }

  // 全局 Union-Find
  const globalUF = new UnionFind(filteredPois.length)
  let totalPairs = 0
  const allMergeDetails: MergeDetail[] = []

  // ── Step 3: 组内 Union-Find 去重 ──
  for (const [, indices] of l1Groups) {
    const groupPois = indices.map(i => filteredPois[i])
    const { uf: groupUF, pairs, details } = deduplicateGroup(groupPois, indices[0])

    // 将局部 UF 结果映射回全局 UF
    const localGroups = groupUF.groups()
    for (const [, localIndices] of localGroups) {
      if (localIndices.length <= 1) continue
      for (let k = 1; k < localIndices.length; k++) {
        globalUF.union(indices[localIndices[0]], indices[localIndices[k]])
      }
    }
    totalPairs += pairs
    allMergeDetails.push(...details)
  }

  // ── Step 4: 跨类目去重 ──
  let crossPairs = 0
  if (CROSS_CATEGORY_ENABLED) {
    const baseIndex = new Map<L1Category, number>()
    for (const [l1, indices] of l1Groups) {
      baseIndex.set(l1, indices[0])
    }
    const { pairs, details } = crossCategoryDedup(
      filteredPois, l1Groups, globalUF, baseIndex,
    )
    crossPairs = pairs
    allMergeDetails.push(...details)
    totalPairs += pairs
  }

  // ── Step 5 & 6: 收集合并组 + 类目冲突解决 + 数据合并 ──
  const groups = globalUF.groups()
  let categoryReclassifications = 0
  const mergedPois: RawPOI[] = []

  for (const [, memberIndices] of groups) {
    const groupMembers = memberIndices.map(i => filteredPois[i])

    // 类目冲突解决 (组内有不同 L1 时)
    const uniqueL1s = new Set(groupMembers.map(p => p.categoryL1))
    if (uniqueL1s.size > 1) {
      // 跨类目合并组 — 需要解决冲突
      const classifierResult = classifyCategory(groupMembers[0])
      const resolved = resolveCategoryConflict(groupMembers, classifierResult)

      // 统一类目
      for (const p of groupMembers) {
        if (p.categoryL1 !== resolved.l1) {
          categoryReclassifications++
        }
      }

      const merged = mergeGroup(groupMembers)
      merged.categoryL1 = resolved.l1
      merged.categoryL3 = resolved.l3
      mergedPois.push(merged)
    } else {
      // 同类目组 — 直接合并
      const merged = mergeGroup(groupMembers)

      // L3 选择: 从候选中选最优
      const l3Candidates = groupMembers.map(p => p.categoryL3)
      merged.categoryL3 = resolveCategoryL3(merged.categoryL1, l3Candidates)

      mergedPois.push(merged)
    }
  }

  console.log(`  [Merge] After dedup: ${mergedPois.length} (pairs: ${totalPairs}, cross: ${crossPairs})`)

  // ── Step 7: 后分类检查 ──
  for (const poi of mergedPois) {
    const classification = classifyCategory(poi)

    // 仅当置信度 >0.9 且全部来自 AI 来源时才覆盖分类
    if (classification.confidence > 0.9 && classification.l1 !== poi.categoryL1) {
      // 检查是否所有原始成员都是 AI 来源 (此处简化: 仅检查当前 POI)
      if (poi.source === 'ai') {
        poi.categoryL1 = classification.l1
        poi.categoryL3 = resolveCategoryL3(classification.l1, [poi.categoryL3])
        categoryReclassifications++
      }
    }
  }

  // ── 按 L1 类目分组 & 排序 & 截取 top N ──
  const grouped = new Map<L1Category, RawPOI[]>()
  for (const poi of mergedPois) {
    const list = grouped.get(poi.categoryL1) || []
    list.push(poi)
    grouped.set(poi.categoryL1, list)
  }

  const finalPOIs: POI[] = []
  const byCategory: Record<string, number> = {}

  let globalIdx = 0
  for (const l1 of L1_CATEGORIES) {
    const items = grouped.get(l1) || []

    // 按评分排序 (高的在前)
    items.sort((a, b) => (b.rating || 0) - (a.rating || 0))

    // 截取目标数量
    const selected = items.slice(0, targetPerCategory)
    byCategory[l1] = selected.length

    for (const raw of selected) {
      globalIdx++
      finalPOIs.push(rawToPOI(raw, city.id, globalIdx))
    }
  }

  console.log(`  [Merge] Final: ${finalPOIs.length} POIs ` +
    `(${Object.entries(byCategory).map(([k, v]) => `${k}:${v}`).join(', ')})`)

  return {
    pois: finalPOIs,
    stats: {
      totalRaw,
      invalidFiltered: invalidCount,
      afterDedup: mergedPois.length,
      afterMerge: finalPOIs.length,
      byCategory,
      crossCategoryMerges: crossPairs,
      categoryReclassifications,
      duplicatePairs: totalPairs,
      mergeDetails: allMergeDetails,
    },
  }
}
