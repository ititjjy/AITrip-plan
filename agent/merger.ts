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
import type { RawPOI, L1Category, POI, CityInfo, POIScore } from './sources/base.js'
import { getImageUrl, roundCoord } from './sources/base.js'
import {
  compositeSimilarity,
  stringSimilarity,
  isInvalidPOI,
  type CompositeResult,
} from './similarity.js'
import {
  classifyCategory,
  resolveCategoryConflict,
  resolveCategoryL3,
  isCommercialComplex,
} from './classifier.js'

/* ═══════════════════════ Config ═══════════════════════ */

const MERGE_THRESHOLD = 0.90
const CROSS_CATEGORY_ENABLED = true
const MAX_TAGS = 6

const SOURCE_RELIABILITY: Record<string, number> = {
  ai: 3,
  spark: 3,
  doubao: 3,
  foursquare: 2,
  amap: 2,
  siliconflow: 2,
  osm: 1,
  google: 1,
}

/* ═══════════════════════ Tag 双语化 ═══════════════════════ */

/** 常见标签中英对照表: 统一小写用于匹配 */
const TAG_TRANSLATIONS: Record<string, { zh: string; en: string }> = {
  // 景点
  'historic': { zh: '古迹', en: 'Historic' },
  'historical': { zh: '古迹', en: 'Historic' },
  'heritage': { zh: '遗产', en: 'Heritage' },
  'temple': { zh: '寺庙', en: 'Temple' },
  'shrine': { zh: '神社', en: 'Shrine' },
  'church': { zh: '教堂', en: 'Church' },
  'palace': { zh: '宫殿', en: 'Palace' },
  'castle': { zh: '城堡', en: 'Castle' },
  'museum': { zh: '博物馆', en: 'Museum' },
  'gallery': { zh: '美术馆', en: 'Gallery' },
  'park': { zh: '公园', en: 'Park' },
  'garden': { zh: '园林', en: 'Garden' },
  'zoo': { zh: '动物园', en: 'Zoo' },
  'aquarium': { zh: '水族馆', en: 'Aquarium' },
  'mountain': { zh: '山岳', en: 'Mountain' },
  'lake': { zh: '湖泊', en: 'Lake' },
  'beach': { zh: '海滩', en: 'Beach' },
  'forest': { zh: '森林', en: 'Forest' },
  'waterfall': { zh: '瀑布', en: 'Waterfall' },
  'cave': { zh: '溶洞', en: 'Cave' },
  'island': { zh: '岛屿', en: 'Island' },
  'view': { zh: '观景', en: 'View' },
  'landmark': { zh: '地标', en: 'Landmark' },
  'nature': { zh: '自然', en: 'Nature' },
  'scenic': { zh: '风景', en: 'Scenic' },
  'architecture': { zh: '建筑', en: 'Architecture' },
  'cultural': { zh: '文化', en: 'Cultural' },
  'religious': { zh: '宗教', en: 'Religious' },
  '免费': { zh: '免费', en: 'Free' },
  'free': { zh: '免费', en: 'Free' },

  // 餐饮
  'restaurant': { zh: '餐厅', en: 'Restaurant' },
  'cafe': { zh: '咖啡馆', en: 'Cafe' },
  'coffee': { zh: '咖啡', en: 'Coffee' },
  'tea': { zh: '茶饮', en: 'Tea' },
  'bar': { zh: '酒吧', en: 'Bar' },
  'pub': { zh: '酒馆', en: 'Pub' },
  'dessert': { zh: '甜品', en: 'Dessert' },
  'bakery': { zh: '烘焙', en: 'Bakery' },
  'local': { zh: '本地特色', en: 'Local' },
  'street food': { zh: '街头美食', en: 'Street Food' },
  'seafood': { zh: '海鲜', en: 'Seafood' },
  'sushi': { zh: '寿司', en: 'Sushi' },
  'ramen': { zh: '拉面', en: 'Ramen' },
  'noodle': { zh: '面食', en: 'Noodles' },
  'bbq': { zh: '烧烤', en: 'BBQ' },
  'hot pot': { zh: '火锅', en: 'Hot Pot' },
  'vegetarian': { zh: '素食', en: 'Vegetarian' },
  'vegan': { zh: '纯素', en: 'Vegan' },
  'michelin': { zh: '米其林', en: 'Michelin' },
  'fine dining': { zh: '高级餐厅', en: 'Fine Dining' },
  'buffet': { zh: '自助餐', en: 'Buffet' },
  'fast food': { zh: '快餐', en: 'Fast Food' },
  '美食': { zh: '美食', en: 'Gourmet' },
  '小吃': { zh: '小吃', en: 'Snack' },
  '网红': { zh: '网红', en: 'Trending' },

  // 购物
  'shopping': { zh: '购物', en: 'Shopping' },
  'mall': { zh: '商场', en: 'Mall' },
  'department store': { zh: '百货', en: 'Department Store' },
  'boutique': { zh: '精品店', en: 'Boutique' },
  'market': { zh: '市场', en: 'Market' },
  'supermarket': { zh: '超市', en: 'Supermarket' },
  'duty-free': { zh: '免税', en: 'Duty-Free' },
  'luxury': { zh: '奢侈品', en: 'Luxury' },
  'handicraft': { zh: '手工艺', en: 'Handicraft' },
  'souvenir': { zh: '纪念品', en: 'Souvenir' },
  'antique': { zh: '古董', en: 'Antique' },
  'brand': { zh: '品牌', en: 'Brand' },
  'discount': { zh: '折扣', en: 'Discount' },
  '特产': { zh: '特产', en: 'Local Product' },

  // 娱乐
  'amusement park': { zh: '游乐园', en: 'Amusement Park' },
  'theme park': { zh: '主题乐园', en: 'Theme Park' },
  'water park': { zh: '水上乐园', en: 'Water Park' },
  'casino': { zh: '赌场', en: 'Casino' },
  'theater': { zh: '剧院', en: 'Theater' },
  'cinema': { zh: '影院', en: 'Cinema' },
  'concert': { zh: '音乐会', en: 'Concert' },
  'show': { zh: '演出', en: 'Show' },
  'performance': { zh: '表演', en: 'Performance' },
  'nightlife': { zh: '夜生活', en: 'Nightlife' },
  'club': { zh: '夜店', en: 'Club' },
  'karaoke': { zh: 'KTV', en: 'Karaoke' },
  'live music': { zh: '现场音乐', en: 'Live Music' },
  'sports': { zh: '体育', en: 'Sports' },
  'stadium': { zh: '体育馆', en: 'Stadium' },
  'night view': { zh: '夜景', en: 'Night View' },
  '亲子': { zh: '亲子', en: 'Family' },
  'family': { zh: '亲子', en: 'Family' },

  // 体验
  'hiking': { zh: '徒步', en: 'Hiking' },
  'cycling': { zh: '骑行', en: 'Cycling' },
  'camping': { zh: '露营', en: 'Camping' },
  'diving': { zh: '潜水', en: 'Diving' },
  'surfing': { zh: '冲浪', en: 'Surfing' },
  'skiing': { zh: '滑雪', en: 'Skiing' },
  'rafting': { zh: '漂流', en: 'Rafting' },
  'paragliding': { zh: '滑翔伞', en: 'Paragliding' },
  'yoga': { zh: '瑜伽', en: 'Yoga' },
  'spa': { zh: 'SPA', en: 'Spa' },
  'hotspring': { zh: '温泉', en: 'Hot Spring' },
  'wellness': { zh: '养生', en: 'Wellness' },
  'workshop': { zh: '工坊', en: 'Workshop' },
  'cooking class': { zh: '烹饪课', en: 'Cooking Class' },
  'pottery': { zh: '陶艺', en: 'Pottery' },
  'costume': { zh: '服饰体验', en: 'Costume' },
  'adventure': { zh: '冒险', en: 'Adventure' },
  'outdoor': { zh: '户外', en: 'Outdoor' },
  'photography': { zh: '摄影', en: 'Photography' },
  '体验': { zh: '体验', en: 'Experience' },

  // 酒店
  'hotel': { zh: '酒店', en: 'Hotel' },
  'resort': { zh: '度假村', en: 'Resort' },
  'hostel': { zh: '青旅', en: 'Hostel' },
  'inn': { zh: '客栈', en: 'Inn' },
  'homestay': { zh: '民宿', en: 'Homestay' },
  'boutique hotel': { zh: '精品酒店', en: 'Boutique Hotel' },
  'luxury hotel': { zh: '豪华酒店', en: 'Luxury Hotel' },
  ' ryokan': { zh: '温泉旅馆', en: 'Ryokan' },
  'onsen': { zh: '温泉', en: 'Onsen' },
  'glamping': { zh: '豪华露营', en: 'Glamping' },
  'pool': { zh: '泳池', en: 'Pool' },
  'beachfront': { zh: '海滨', en: 'Beachfront' },
  'budget': { zh: '经济型', en: 'Budget' },
  'business': { zh: '商务', en: 'Business' },
  'romantic': { zh: '浪漫', en: 'Romantic' },
  'view room': { zh: '景观房', en: 'View Room' },
}

/**
 * 将单语标签转换为 "中文|English" 双语格式。
 * 若已是双语格式则直接返回；若在映射表中则补全；否则原样保留。
 */
function bilingualizeTag(tag: string): string {
  const trimmed = tag.trim()
  if (!trimmed) return ''
  // 已经是双语格式
  if (/^.+\|.+$/.test(trimmed)) return trimmed

  const lower = trimmed.toLowerCase()
  const mapped = TAG_TRANSLATIONS[lower]
  if (mapped) {
    return `${mapped.zh}|${mapped.en}`
  }

  // 无法识别: 如果是纯中文，尝试简单处理
  if (/^[\u4e00-\u9fff]+$/.test(trimmed)) {
    return `${trimmed}|${trimmed}`
  }
  // 如果是纯英文，尝试简单处理
  if (/^[a-zA-Z\s]+$/.test(trimmed)) {
    return `${trimmed}|${trimmed}`
  }
  return trimmed
}

function bilingualizeTags(tags: string[]): string[] {
  return tags.map(bilingualizeTag).filter(Boolean)
}

/* ═══════════════════════ Scoring Config ═══════════════════════ */

/** 完整度字段权重 */
const COMPLETENESS_WEIGHTS: Record<string, number> = {
  // 核心四要素 (权重 3)
  coords: 3, namePrimary: 3, address: 3, categoryL1: 3,
  // 重要字段 (权重 1)
  nameZh: 1, nameEn: 1, description: 1, rating: 1, tags: 1, operatingHours: 1,
  // 锦上添花 (权重 0.5)
  addressEn: 0.5, cost: 0.5, visitDuration: 0.5, bestSeasons: 0.5, monthlyIndex: 0.5,
}
const MAX_COMPLETENESS_WEIGHT = Object.values(COMPLETENESS_WEIGHTS).reduce((a, b) => a + b, 0) // 20.5

/** 综合得分权重 */
const COMPLETENESS_FACTOR = 0.55
const CONFIDENCE_FACTOR = 0.45

/** 单源可靠性奖励 */
const SINGLE_SOURCE_BONUS: Record<string, number> = {
  osm: 15, google: 10, foursquare: 10, amap: 10, ai: 5,
}

/** 冲突检测阈值 */
const CONFLICT_THRESHOLDS = {
  namePrimary: 0.70,   // stringSimilarity < 0.70 = conflict
  coords: 500,         // haversineDistance > 500m = conflict
  address: 0.60,       // stringSimilarity < 0.60 = conflict
  rating: 1.5,         // |diff| > 1.5 = conflict
  cost: 3.0,           // max/min > 3.0 = conflict
}

/** 数据丰富度加分 (0-15): 让字段完整、描述优质的多源 POI 拉开差距 */
function computeQualityBonus(poi: RawPOI): number {
  let bonus = 0
  // 描述质量
  if (poi.description) {
    if (poi.description.length >= 80) bonus += 8
    else if (poi.description.length >= 50) bonus += 5
    else if (poi.description.length >= 30) bonus += 2
  }
  // 三名齐全
  if (poi.namePrimary && poi.nameZh && poi.nameEn) bonus += 3
  // 标签丰富
  if (poi.tags && poi.tags.length >= 4) bonus += 2
  // 有月度指数
  if (poi.monthlyIndex && poi.monthlyIndex.length === 12) bonus += 2
  return Math.min(bonus, 15)
}

/** 评分等级 */
export function scoreGrade(score: number): string {
  if (score >= 85) return 'A'
  if (score >= 65) return 'B'
  if (score >= 45) return 'C'
  return 'D'
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
    scoreDistribution: { A: number; B: number; C: number; D: number }
  }
}

/* ═══════════════════════ Conflict Detection & Scoring ═══════════════════════ */

interface ConflictReport {
  sourceCount: number
  sources: string[]
  comparablePairs: number
  conflictPairs: number
  conflictCount: number
  agreementRatio: number
  conflictFields: string[]
}

/** 检测合并组中多源字段冲突 */
function detectConflicts(group: RawPOI[]): ConflictReport {
  const sourceSet = new Set(group.map(p => p.source))
  const sources = [...sourceSet]
  const sourceCount = sourceSet.size

  if (sourceCount < 2 || group.length < 2) {
    return {
      sourceCount, sources,
      comparablePairs: 0, conflictPairs: 0, conflictCount: 0,
      agreementRatio: 1, conflictFields: [],
    }
  }

  let comparablePairs = 0
  let conflictPairs = 0
  const conflictFields: string[] = []

  // Helper: pairwise compare within group
  function compare(field: string, hasValue: (p: RawPOI) => boolean, isConflict: (a: RawPOI, b: RawPOI) => boolean) {
    const valid = group.filter(hasValue)
    if (valid.length < 2) return
    for (let i = 0; i < valid.length; i++) {
      for (let j = i + 1; j < valid.length; j++) {
        comparablePairs++
        if (isConflict(valid[i], valid[j])) {
          conflictPairs++
          if (!conflictFields.includes(field)) conflictFields.push(field)
        }
      }
    }
  }

  // 1. namePrimary
  compare('namePrimary',
    p => !!p.namePrimary?.trim(),
    (a, b) => stringSimilarity(a.namePrimary, b.namePrimary) < CONFLICT_THRESHOLDS.namePrimary,
  )

  // 2. coords
  compare('coords',
    p => p.lat !== 0 || p.lng !== 0,
    (a, b) => haversineDistance(a.lat, a.lng, b.lat, b.lng) > CONFLICT_THRESHOLDS.coords,
  )

  // 3. address
  compare('address',
    p => !!p.address?.trim(),
    (a, b) => stringSimilarity(a.address, b.address) < CONFLICT_THRESHOLDS.address,
  )

  // 4. categoryL1
  compare('categoryL1',
    p => !!p.categoryL1,
    (a, b) => a.categoryL1 !== b.categoryL1,
  )

  // 5. rating
  compare('rating',
    p => !!p.rating && p.rating > 0,
    (a, b) => Math.abs((a.rating || 0) - (b.rating || 0)) > CONFLICT_THRESHOLDS.rating,
  )

  // 6. cost
  compare('cost',
    p => !!p.cost && p.cost > 0,
    (a, b) => {
      const hi = Math.max(a.cost || 0, b.cost || 0)
      const lo = Math.min(a.cost || 0, b.cost || 0)
      return lo > 0 && (hi / lo) > CONFLICT_THRESHOLDS.cost
    },
  )

  const agreementRatio = comparablePairs > 0 ? 1 - (conflictPairs / comparablePairs) : 1

  return { sourceCount, sources, comparablePairs, conflictPairs, conflictCount: conflictFields.length, agreementRatio, conflictFields }
}

/** 计算单个 POI 的完整度得分 */
export function computeCompleteness(poi: RawPOI): number {
  let filled = 0

  // 核心四要素
  if (poi.lat !== 0 || poi.lng !== 0) filled += COMPLETENESS_WEIGHTS.coords
  if (poi.namePrimary && String(poi.namePrimary).trim().length >= 2) filled += COMPLETENESS_WEIGHTS.namePrimary
  if (poi.address && String(poi.address).trim().length > 0) filled += COMPLETENESS_WEIGHTS.address
  if (poi.categoryL1 && L1_CATEGORIES.includes(poi.categoryL1)) filled += COMPLETENESS_WEIGHTS.categoryL1

  // 重要字段
  if (poi.nameZh && String(poi.nameZh).trim()) filled += COMPLETENESS_WEIGHTS.nameZh
  if (poi.nameEn && String(poi.nameEn).trim()) filled += COMPLETENESS_WEIGHTS.nameEn
  if (poi.description && poi.description.length >= 10) filled += COMPLETENESS_WEIGHTS.description
  if (poi.rating && poi.rating > 0) filled += COMPLETENESS_WEIGHTS.rating
  if (poi.tags && poi.tags.length > 0) filled += COMPLETENESS_WEIGHTS.tags
  if (poi.operatingHours && String(poi.operatingHours).trim()) filled += COMPLETENESS_WEIGHTS.operatingHours

  // 锦上添花
  if (poi.addressEn && String(poi.addressEn).trim()) filled += COMPLETENESS_WEIGHTS.addressEn
  if (poi.cost && poi.cost > 0) filled += COMPLETENESS_WEIGHTS.cost
  if (poi.visitDuration && poi.visitDuration > 0) filled += COMPLETENESS_WEIGHTS.visitDuration
  if (poi.bestSeasons && poi.bestSeasons.length > 0) filled += COMPLETENESS_WEIGHTS.bestSeasons
  if (poi.monthlyIndex && poi.monthlyIndex.length === 12) filled += COMPLETENESS_WEIGHTS.monthlyIndex

  return Math.round((filled / MAX_COMPLETENESS_WEIGHT) * 100)
}

/** 计算单个 POI 的置信度得分 */
export function computeConfidence(poi: RawPOI, report: ConflictReport): number {
  const { sourceCount, sources, agreementRatio, conflictCount } = report

  if (sourceCount <= 1) {
    // 单源: 居中 55~70
    const primarySource = sources[0] || poi.source || 'unknown'
    return 55 + (SINGLE_SOURCE_BONUS[primarySource] || 5)
  }

  // 多源: base + sourceBonus + agreementBonus - conflictPenalty
  const base = 55
  const sourceBonus = Math.min(sourceCount, 5) * 6
  const agreementBonus = agreementRatio * 30
  const conflictPenalty = Math.min(conflictCount, 5) * 8

  return Math.round(clamp(base + sourceBonus + agreementBonus - conflictPenalty, 30, 100))
}

/** 计算 POI 综合评分 */
export function computePOIScore(merged: RawPOI, report: ConflictReport): POIScore {
  const completeness = computeCompleteness(merged)
  const confidence = computeConfidence(merged, report)
  const bonus = computeQualityBonus(merged)
  const rawTotal = COMPLETENESS_FACTOR * completeness + CONFIDENCE_FACTOR * confidence + bonus
  const total = Math.round(clamp(rawTotal, 0, 100))

  return {
    total,
    completeness,
    confidence,
    sourceCount: report.sourceCount,
    sources: report.sources,
    conflictCount: report.conflictCount,
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

interface MergedEntry {
  raw: RawPOI
  conflictReport: ConflictReport
}

function mergeGroup(group: RawPOI[]): MergedEntry {
  if (group.length === 1) {
    return { raw: { ...group[0] }, conflictReport: detectConflicts(group) }
  }

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

  // 标签: 并集 + 双语化, max 6
  const allTags = new Set<string>()
  for (const p of group) {
    for (const t of (p.tags || [])) allTags.add(t)
  }
  base.tags = bilingualizeTags([...allTags]).slice(0, MAX_TAGS)

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
    const nonAI = withIndex.find(p => p.source !== 'qwen')
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

  // 检测多源冲突
  const conflictReport = detectConflicts(group)

  return { raw: base, conflictReport }
}

/* ═══════════════════════ 6. RawPOI → POI ═══════════════════════ */

function rawToPOI(raw: RawPOI, cityId: string, index: number, score?: POIScore): POI {
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
    source: raw.source || 'unknown',
    score,
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
        scoreDistribution: { A: 0, B: 0, C: 0, D: 0 },
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
  const mergedEntries: MergedEntry[] = []

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

      const entry = mergeGroup(groupMembers)
      entry.raw.categoryL1 = resolved.l1
      entry.raw.categoryL3 = resolved.l3
      mergedEntries.push(entry)
    } else {
      // 同类目组 — 直接合并
      const entry = mergeGroup(groupMembers)

      // L3 选择: 从候选中选最优
      const l3Candidates = groupMembers.map(p => p.categoryL3)
      entry.raw.categoryL3 = resolveCategoryL3(entry.raw.categoryL1, l3Candidates)

      mergedEntries.push(entry)
    }
  }

  console.log(`  [Merge] After dedup: ${mergedEntries.length} (pairs: ${totalPairs}, cross: ${crossPairs})`)

  // ── Step 7: 后分类检查 ──
  for (const entry of mergedEntries) {
    const poi = entry.raw
    const classification = classifyCategory(poi)

    // AI 来源: 降低阈值到 0.65，分类器置信度超过此值时覆盖 AI 的批次分类
    // 非 AI 来源 (osm/google 等): 保持更高阈值 0.90，尊重可靠数据源的分类
    const threshold = poi.source === 'qwen' ? 0.65 : 0.90

    if (classification.confidence > threshold && classification.l1 !== poi.categoryL1) {
      poi.categoryL1 = classification.l1
      poi.categoryL3 = resolveCategoryL3(classification.l1, [poi.categoryL3])
      categoryReclassifications++
    }

    // 商业综合体硬性检测: 无论来源和置信度，名字+描述双重确认的综合体归入 shopping
    if (poi.categoryL1 === 'scenic' && isCommercialComplex(poi)) {
      poi.categoryL1 = 'shopping'
      poi.categoryL3 = resolveCategoryL3('shopping', [poi.categoryL3])
      categoryReclassifications++
    }
  }

  // ── 按 L1 类目分组 & 排序 & 截取 top N ──
  const grouped = new Map<L1Category, MergedEntry[]>()
  for (const entry of mergedEntries) {
    const l1 = entry.raw.categoryL1
    const list = grouped.get(l1) || []
    list.push(entry)
    grouped.set(l1, list)
  }

  const finalPOIs: POI[] = []
  const byCategory: Record<string, number> = {}
  const scoreDistribution = { A: 0, B: 0, C: 0, D: 0 }

  let globalIdx = 0
  for (const l1 of L1_CATEGORIES) {
    const items = grouped.get(l1) || []

    // 按评分排序 (高的在前)
    items.sort((a, b) => (b.raw.rating || 0) - (a.raw.rating || 0))

    // 截取目标数量
    const selected = items.slice(0, targetPerCategory)
    byCategory[l1] = selected.length

    for (const entry of selected) {
      globalIdx++
      const score = computePOIScore(entry.raw, entry.conflictReport)
      const grade = scoreGrade(score.total)
      scoreDistribution[grade as 'A' | 'B' | 'C' | 'D']++
      finalPOIs.push(rawToPOI(entry.raw, city.id, globalIdx, score))
    }
  }

  console.log(`  [Merge] Final: ${finalPOIs.length} POIs ` +
    `(${Object.entries(byCategory).map(([k, v]) => `${k}:${v}`).join(', ')})`)
  console.log(`  [Merge] Score: A=${scoreDistribution.A}, B=${scoreDistribution.B}, C=${scoreDistribution.C}, D=${scoreDistribution.D}`)

  return {
    pois: finalPOIs,
    stats: {
      totalRaw,
      invalidFiltered: invalidCount,
      afterDedup: mergedEntries.length,
      afterMerge: finalPOIs.length,
      byCategory,
      crossCategoryMerges: crossPairs,
      categoryReclassifications,
      duplicatePairs: totalPairs,
      mergeDetails: allMergeDetails,
      scoreDistribution,
    },
  }
}
