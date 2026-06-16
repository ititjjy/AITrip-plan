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
  getSemanticGroup,
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

/* ── 语言检测辅助函数 ── */

/** 检测字符串是否主要是中文（排除含日文假名/韩文的文本） */
function isChinese(text: string): boolean {
  if (!text) return false
  // 含日文假名（平假名/片假名）→ 不是中文
  if (/[\u3040-\u309f\u30a0-\u30ff]/.test(text)) return false
  // 含韩文 → 不是中文
  if (/[\uac00-\ud7af\u1100-\u11ff]/.test(text)) return false
  const cjk = text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []
  return cjk.length > text.length * 0.3
}

/** 检测字符串是否主要是拉丁字母（英文等） */
function isLatin(text: string): boolean {
  if (!text) return false
  const latin = text.match(/[a-zA-Z]/g) || []
  return latin.length > text.length * 0.3
}

/** 检测字符串是否含日文假名 */
function hasJapanese(text: string): boolean {
  if (!text) return false
  return /[\u3040-\u309f\u30a0-\u30ff]/.test(text)
}

/** 名称重排：确保 namePrimary=中文, nameZh=当地语言, nameEn=英文
 *
 * 核心判断逻辑：
 *   如果 nameZh 有值、且是中文、且与 namePrimary 不同，
 *   则 nameZh 视为中文名，namePrimary 视为当地语言名，交换两者。
 *   nameZh 不是中文时（如被误填为日文），不视为有效中文名，不交换。
 */
function rearrangeNames(poi: RawPOI): void {
  const nameZh = poi.nameZh?.trim() || ''
  const namePrimary = poi.namePrimary?.trim() || ''
  // nameZh 必须是中文且与 namePrimary 不同才视为有效中文名
  const zhIsValid = nameZh && nameZh !== namePrimary && isChinese(nameZh)

  if (zhIsValid) {
    poi.namePrimary = nameZh
    poi.nameZh = (namePrimary && namePrimary !== nameZh) ? namePrimary : ''
  } else if (nameZh && nameZh === namePrimary) {
    // namePrimary 和 nameZh 相同 → 国内城市场景，nameZh 留空
    poi.nameZh = ''
  } else if (nameZh && !isChinese(nameZh)) {
    // nameZh 不是中文（如被误填为日文/英文）→ 清空，避免歧义
    // namePrimary 保持原值
    poi.nameZh = ''
  }
  // 没有有效中文名时，namePrimary 保持原值（当地语言名或英文名）
}

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
    p => !!String(p.address || '').trim(),
    (a, b) => stringSimilarity(String(a.address || ''), String(b.address || '')) < CONFLICT_THRESHOLDS.address,
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

/**
 * 计算 POI 热门度得分（用于最终排序）
 * 公式: 0.4*综合评分 + 0.3*rating + 0.2*知名度 + 0.1*多源数
 */
function computeHotnessScore(poi: RawPOI, report: ConflictReport): number {
  const completeness = computeCompleteness(poi)
  const confidence = computeConfidence(poi, report)
  const qualityBonus = computeQualityBonus(poi)
  const totalScore = COMPLETENESS_FACTOR * completeness + CONFIDENCE_FACTOR * confidence + qualityBonus

  // rating 因子 (0-30分)
  const ratingScore = (poi.rating || 0) * 6  // 5分制 → 30分

  // 知名度因子 (0-20分)
  let popularityScore = 0
  // OSM wikidata/wikipedia 标签
  if ((poi as any).popularity) popularityScore += 20
  // Foursquare popularity 字段 (如果存在)
  if ((poi as any).fsqPopularity) popularityScore += Math.min((poi as any).fsqPopularity * 2, 20)
  // 多源印证 = 更可能是知名地标
  popularityScore += Math.min(report.sourceCount * 5, 15)

  // 无名小店惩罚
  if ((poi as any).isLowQuality) {
    popularityScore -= 15
  }

  // 多源数因子 (0-10分)
  const sourceScore = Math.min(report.sourceCount * 2, 10)

  return totalScore * 0.4 + ratingScore * 0.3 + popularityScore * 0.2 + sourceScore * 0.1
}

/* ═══════════════════════ 1. Pre-filter ═══════════════════════ */

/** AI 来源 — 坐标可信度较低，需要用可信来源校正 */
const AI_SOURCES = new Set(['spark', 'doubao', 'qwen', 'ai', 'siliconflow'])
/** 可信坐标来源 */
const TRUSTED_COORD_SOURCES = new Set(['amap', 'osm', 'foursquare', 'google'])

/**
 * AI 坐标修正：用可信来源（amap/osm/foursquare）的同名坐标校正 AI 来源的异常坐标。
 * 如果 AI 坐标与可信来源同名 POI 相差超过 5km，则认为 AI 坐标不可信，用最近的可信坐标替换。
 */
function correctAICoordinates(pois: RawPOI[]): void {
  // 先收集可信来源的名称→坐标映射
  const trustedCoords = new Map<string, { lat: number; lng: number }>()
  for (const poi of pois) {
    if (!TRUSTED_COORD_SOURCES.has(poi.source)) continue
    const key = String(poi.namePrimary || '').trim().toLowerCase().replace(/[\s\u3000]+/g, '')
    if (!key || key.length < 2) continue
    if (!trustedCoords.has(key)) {
      trustedCoords.set(key, { lat: poi.lat, lng: poi.lng })
    }
  }

  if (trustedCoords.size === 0) return

  // 对 AI 来源做坐标校验和修正
  for (const poi of pois) {
    if (!AI_SOURCES.has(poi.source)) continue
    const key = String(poi.namePrimary || '').trim().toLowerCase().replace(/[\s\u3000]+/g, '')
    if (!key || key.length < 2) continue

    const trusted = trustedCoords.get(key)
    if (!trusted) continue

    const dist = haversineDistance(poi.lat, poi.lng, trusted.lat, trusted.lng)
    if (dist > 5) {
      // 坐标偏差超过 5km → 用可信坐标替换（保留该 POI 的描述/标签等信息，仅修正坐标）
      poi.lat = trusted.lat
      poi.lng = trusted.lng
    }
  }
}

/**
 * 检测并修正"坐标污染"来源：
 * 如果某个 AI 来源中，超过 30% 的 POI 使用相同坐标，说明该来源坐标批量造假/占位，
 * 对这些 POI 逐一尝试用可信来源（精确匹配或名称包含匹配）修正坐标。
 * 修正失败的 POI 将坐标标记为 (0, 0)，在 preFilter 中被过滤掉。
 */
function fixCoordinatePollution(pois: RawPOI[]): void {
  // 按来源分组，找出坐标集中度超标的来源
  const sourceGroups = new Map<string, RawPOI[]>()
  for (const poi of pois) {
    if (!AI_SOURCES.has(poi.source)) continue
    const grp = sourceGroups.get(poi.source) || []
    grp.push(poi)
    sourceGroups.set(poi.source, grp)
  }

  // 构建可信来源名称→坐标（精确 + 包含关系）
  const trustedList: { key: string; lat: number; lng: number }[] = []
  for (const poi of pois) {
    if (!TRUSTED_COORD_SOURCES.has(poi.source)) continue
    const key = String(poi.namePrimary || '').trim().toLowerCase().replace(/[\s\u3000]+/g, '')
    if (key.length >= 2) trustedList.push({ key, lat: poi.lat, lng: poi.lng })
  }

  for (const [, group] of sourceGroups) {
    if (group.length < 5) continue

    // 统计坐标分布
    const coordCount = new Map<string, number>()
    for (const poi of group) {
      const ck = `${poi.lat.toFixed(3)}|${poi.lng.toFixed(3)}`
      coordCount.set(ck, (coordCount.get(ck) || 0) + 1)
    }

    // 找出最多条目的坐标
    const sorted = [...coordCount.entries()].sort((a, b) => b[1] - a[1])
    const [topCoord, topCount] = sorted[0]

    // 超过 30% 相同坐标 → 坐标污染
    if (topCount / group.length < 0.3) continue

    const [topLat, topLng] = topCoord.split('|').map(Number)

    for (const poi of group) {
      if (poi.lat.toFixed(3) !== topLat.toFixed(3) || poi.lng.toFixed(3) !== topLng.toFixed(3)) continue

      // 此 POI 的坐标是污染坐标，尝试修正
      const aiKey = String(poi.namePrimary || '').trim().toLowerCase().replace(/[\s\u3000]+/g, '')
      let fixed = false

      for (const trusted of trustedList) {
        const isMatch = trusted.key === aiKey ||
          (aiKey.length >= 2 && trusted.key.includes(aiKey)) ||
          (trusted.key.length >= 2 && aiKey.includes(trusted.key))
        if (isMatch) {
          poi.lat = trusted.lat
          poi.lng = trusted.lng
          fixed = true
          break
        }
      }

      if (!fixed) {
        // 无法修正 → 标记为无效坐标，preFilter 将过滤掉
        poi.lat = 0
        poi.lng = 0
      }
    }
  }
}

/**
 * 跨名称坐标修正：针对"故宫" vs "故宫博物院"这类简称↔全称，
 * 用可信来源中**名称包含关系**的条目坐标来校正 AI 来源的异常坐标。
 */
function correctAICoordinatesByContainment(pois: RawPOI[]): void {
  // 收集可信来源 POI 的名称+坐标
  const trustedPOIs: { key: string; lat: number; lng: number }[] = []
  for (const poi of pois) {
    if (!TRUSTED_COORD_SOURCES.has(poi.source)) continue
    const key = String(poi.namePrimary || '').trim().toLowerCase().replace(/[\s\u3000]+/g, '')
    if (key.length >= 2) trustedPOIs.push({ key, lat: poi.lat, lng: poi.lng })
  }
  if (trustedPOIs.length === 0) return

  for (const poi of pois) {
    if (!AI_SOURCES.has(poi.source)) continue
    const aiKey = String(poi.namePrimary || '').trim().toLowerCase().replace(/[\s\u3000]+/g, '')
    if (aiKey.length < 2) continue

    // 已经被精确匹配过的跳过
    for (const trusted of trustedPOIs) {
      // 名称包含关系（"故宫" in "故宫博物院" 或反向）
      const isContained =
        (aiKey.length >= 2 && trusted.key.includes(aiKey)) ||
        (trusted.key.length >= 2 && aiKey.includes(trusted.key))
      if (!isContained) continue

      const dist = haversineDistance(poi.lat, poi.lng, trusted.lat, trusted.lng)
      if (dist > 5) {
        poi.lat = trusted.lat
        poi.lng = trusted.lng
        break
      }
    }
  }
}

function preFilter(
  pois: RawPOI[],
  city: CityInfo,
): { valid: RawPOI[]; filtered: number } {
  const valid: RawPOI[] = []
  let filtered = 0

  // 同源内部去重：相同来源中名称+坐标完全相同的只保留第一条（忽略类目差异）
  // 语义等价组：如果两个 POI 名称属于同一语义组（故宫=紫禁城）且坐标相同，也视为重复
  const sourceSeen = new Map<string, Set<string>>()
  const deduped: RawPOI[] = []
  for (const poi of pois) {
    const src = poi.source || ''
    if (!sourceSeen.has(src)) sourceSeen.set(src, new Set())
    const seen = sourceSeen.get(src)!
    // key = 名称（优先用语义组ID，不含类目），坐标保留2位小数精度（约1km范围内视为同一地点）
    // 不纳入 categoryL1，避免同一地点被多个类目重复采集（foursquare常见问题）
    const nameKey = getSemanticGroup(poi.namePrimary || '') || String(poi.namePrimary || '').trim()
    const key = `${nameKey}|${poi.lat.toFixed(2)}|${poi.lng.toFixed(2)}`
    if (seen.has(key)) {
      filtered++
      continue
    }
    seen.add(key)
    deduped.push(poi)
  }

  for (const poi of deduped) {
    // 无效 POI 检测
    if (isInvalidPOI(poi)) {
      filtered++
      continue
    }

    // 过滤非旅游相关的本地生活服务（邮局、银行、医院、加油站、租车、美容美发、洗浴推拿等）
    const tagsStr = (poi.tags || []).join(' ')
    const nameStr = String(poi.namePrimary || poi.nameZh || '').toLowerCase()
    if (
      tagsStr.includes('邮局') || tagsStr.includes('邮政') ||
      tagsStr.includes('银行') || tagsStr.includes('ATM') ||
      tagsStr.includes('医院') || tagsStr.includes('诊所') || tagsStr.includes('药店') ||
      tagsStr.includes('加油站') || tagsStr.includes('加气站') ||
      tagsStr.includes('派出所') || tagsStr.includes('公安局') ||
      tagsStr.includes('居委会') || tagsStr.includes('街道办') ||
      tagsStr.includes('税务') || tagsStr.includes('社保') ||
      tagsStr.includes('租车') || tagsStr.includes('汽车租赁') || tagsStr.includes('汽车服务') ||
      tagsStr.includes('美容美发') || tagsStr.includes('洗浴推拿') || tagsStr.includes('按摩') ||
      nameStr.includes('邮政所') || nameStr.includes('邮政局') ||
      nameStr.includes('储蓄所') || nameStr.includes('营业所') ||
      nameStr.includes('租车') || nameStr.includes('推拿') || nameStr.includes('美容')
    ) {
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
  // ±2 桶 (约 2.2km)，覆盖大型景区不同坐标标注（如八达岭长城坐标偏差可达 3km）
  for (let dlat = -2; dlat <= 2; dlat++) {
    for (let dlng = -2; dlng <= 2; dlng++) {
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
  // same-type-perfect-low-content: 保底分已提到 0.92，允许合并；仅阻止低分情况
  if (result.path === 'same-type-perfect-low-content' && result.score < MERGE_THRESHOLD) return false
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
    const single = { ...group[0] }
    // 单源 POI 也需要名称重排：确保 namePrimary 是中文名
    rearrangeNames(single)
    return { raw: single, conflictReport: detectConflicts(group) }
  }

  // 选择最佳基础 POI: 优先非 AI 来源中信息最丰富的
  const sorted = [...group].sort((a, b) => {
    const wA = SOURCE_RELIABILITY[a.source] || 1
    const wB = SOURCE_RELIABILITY[b.source] || 1
    if (wA !== wB) return wB - wA
    return (b.description?.length || 0) - (a.description?.length || 0)
  })

  const base: RawPOI = { ...sorted[0] }

  // 保留知名度标记（来自 OSM 的 wikidata/wikipedia）
  const anyPopularity = group.find(p => (p as any).popularity)?.popularity
  if (anyPopularity) {
    (base as any).popularity = anyPopularity
  }

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

  // ── 三名合并：namePrimary=中文, nameZh=当地语言, nameEn=英文 ──
  //
  // 策略:
  //   1. 从各来源收集中文名、英文名、当地语言名
  //   2. namePrimary 优先中文名（用户默认中文主名称）
  //   3. nameZh 存当地语言名（日文/韩文等；国内城市与 namePrimary 相同则留空）
  //   4. nameEn 存英文名

  // 收集中文名：
  //   优先从 namePrimary 中检测中文（更直接可靠，尤其是 AI 数据的 namePrimary 就是中文名）
  //   其次从 nameZh（作为辅助翻译名，如 foursquare 的 nameZh）
  //   排除明显错误的情况（nameZh 是中文但来源不可信的 AI 批量数据）
  const zhName =
    group.find(p => p.namePrimary && isChinese(p.namePrimary))?.namePrimary ||
    group.find(p => p.nameZh?.trim() && p.nameZh.trim() !== (p.namePrimary?.trim() || '') && isChinese(p.nameZh.trim()))?.nameZh?.trim() ||
    ''
  // 收集英文名
  const enName =
    group.find(p => p.nameEn?.trim())?.nameEn?.trim() ||
    group.find(p => p.namePrimary && isLatin(p.namePrimary) && !isChinese(p.namePrimary))?.namePrimary ||
    ''
  // 收集当地语言名（namePrimary 中非中文、非拉丁的，如日文/韩文）
  // 也包含 namePrimary 含日文假名但 nameZh 与之不同的情况
  const localName =
    group.find(p => {
      const np = p.namePrimary?.trim() || ''
      return np && np !== zhName && np !== enName && !isLatin(np) && (hasJapanese(np) || !isChinese(np))
    })?.namePrimary?.trim() ||
    group.find(p => {
      const np = p.namePrimary?.trim() || ''
      return np && np !== zhName && np !== enName && !isChinese(np)
    })?.namePrimary?.trim() ||
    ''

  // 应用名称策略
  if (zhName) {
    base.namePrimary = zhName
    // nameZh = 当地语言名（如果与中文名不同）
    base.nameZh = (localName && localName !== zhName) ? localName : ''
  } else {
    // 没有中文名时，namePrimary 保持 base 原值（当地语言名或英文名）
    // nameZh 存当地语言名（如果 namePrimary 是英文名）
    if (localName && isLatin(base.namePrimary)) {
      base.nameZh = localName
    }
  }
  base.nameEn = enName || base.nameEn

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

function rawToPOI(raw: RawPOI, city: CityInfo, index: number, score?: POIScore): POI {
  const l1 = raw.categoryL1
  const path = resolveCategoryPath(raw.categoryL3)

  const poi: POI = {
    id: `${raw.source || 'agent'}-${city.id}-${index}`,
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

  // Hotel-only fields: distance from city center + district
  if (l1 === 'hotel') {
    poi.distanceFromCenter = Math.round(haversineDistance(raw.lat, raw.lng, city.lat, city.lng) * 10) / 10
    poi.district = extractDistrict(raw.address, raw.addressEn, city.isDomestic)
  }

  return poi
}

/** 从地址中解析行政区/县名 */
function extractDistrict(address: string | unknown, addressEn: string | unknown, isDomestic: boolean): string {
  const addrStr = String(address || '')
  const addrEnStr = String(addressEn || '')
  if (isDomestic && addrStr) {
    // 国内地址: 匹配 "XX区" 或 "XX县" (排除省、市)
    const m = addrStr.match(/([^省市]+(?:区|县))/)
    if (m) return m[1]
  }
  if (addrEnStr) {
    // 国外英文地址: 提取常见的 district/area 名称
    // 优先匹配 "Xxx District", "Xxx Regency", "Xxx County" 等
    const enPatterns = [
      /([A-Z][a-zA-Z\s]+(?:District|Regency|County|Borough)),/,
      /,\s*([A-Z][a-zA-Z\s]+(?:District|Regency|County|Borough)),/,
    ]
    for (const p of enPatterns) {
      const m = addrEnStr.match(p)
      if (m) return m[1].trim()
    }
    // 回退: 尝试匹配逗号分隔的倒数第二个字段 (通常是区/县)
    const parts = addrEnStr.split(',').map(s => s.trim()).filter(Boolean)
    if (parts.length >= 3) {
      const candidate = parts[parts.length - 2]
      if (candidate && !/\d/.test(candidate)) return candidate
    }
  }
  return ''
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

  // ── Step 0: AI 坐标修正 (用可信来源坐标校正 AI 来源异常坐标) ──
  fixCoordinatePollution(allRawPOIs)       // 先处理批量坐标污染（>30%相同坐标）
  correctAICoordinates(allRawPOIs)         // 再处理精确名称匹配的个别偏差
  correctAICoordinatesByContainment(allRawPOIs) // 最后处理简称↔全称的坐标偏差

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

  // ── Step 1.5: AI 来源预分类修正 ──
  // 在 L1 分组之前，先对 AI 来源 POI 运行 classifier，修正明显错误的分类。
  // 这样 dedup 阶段就能将不同来源的同名 POI（类目可能不同）放在正确的 L1 组里比较。
  for (const poi of filteredPois) {
    // tags 强制覆盖（最高优先级）
    const tagsStr = (poi.tags || []).join(' ')
    if (tagsStr.includes('住宿服务')) {
      poi.categoryL1 = 'hotel'
      poi.categoryL3 = resolveCategoryL3('hotel', [poi.categoryL3])
      continue
    }
    if (tagsStr.includes('购物服务') || tagsStr.includes('购物相关场所')) {
      // 例外：名称含明显餐饮关键词的，纠正为food（避免数据源标签错误，如"牛将军雪花牛·火锅烤肉铁板烧"被标为购物服务）
      const nameLower = String(poi.namePrimary || poi.nameZh || '').toLowerCase()
      const hasStrongFoodSignal = /火锅|烤肉|铁板烧|烤鸭|烧烤|餐厅|饭店|料理|面馆|菜馆|小馆|食堂/.test(nameLower)
      if (hasStrongFoodSignal) {
        poi.categoryL1 = 'food'
        poi.categoryL3 = resolveCategoryL3('food', [poi.categoryL3])
        continue
      }
      poi.categoryL1 = 'shopping'
      poi.categoryL3 = resolveCategoryL3('shopping', [poi.categoryL3])
      continue
    }
    if (tagsStr.includes('餐饮服务') || tagsStr.includes('中餐厅') || tagsStr.includes('快餐厅') || tagsStr.includes('外国餐厅')) {
      poi.categoryL1 = 'food'
      poi.categoryL3 = resolveCategoryL3('food', [poi.categoryL3])
      continue
    }
    // AI 来源：用 classifier 修正明显错误的分类（置信度 > 0.80）
    if (AI_SOURCES.has(poi.source)) {
      const cls = classifyCategory(poi)
      if (cls.confidence > 0.80 && cls.l1 !== poi.categoryL1) {
        poi.categoryL1 = cls.l1
        poi.categoryL3 = resolveCategoryL3(cls.l1, [poi.categoryL3])
      }
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

  // ── Step 2.5: 语义词典跨源去重 ──
  // 名称属于同一语义组的 POI（如"鸟巢"和"北京国家体育场"），无论地理距离，直接合并。
  // 这解决了 AI 来源污染坐标导致的地理分桶无法命中问题。
  {
    // 按语义组收集 POI 索引
    const semanticGroups = new Map<string, number[]>()
    for (let i = 0; i < filteredPois.length; i++) {
      const group = getSemanticGroup(filteredPois[i].namePrimary || '')
      if (!group) continue
      const list = semanticGroups.get(group) || []
      list.push(i)
      semanticGroups.set(group, list)
    }
    for (const [, indices] of semanticGroups) {
      if (indices.length <= 1) continue
      // 同一语义组的所有 POI 合并成一组
      for (let k = 1; k < indices.length; k++) {
        globalUF.union(indices[0], indices[k])
        totalPairs++
        allMergeDetails.push({
          indices: [indices[0], indices[k]],
          path: 'same-type-perfect',
          score: 0.98,
        })
      }
    }
  }

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

    // ① 基于 tags 的强制覆盖（最高优先级，无视来源和分类器置信度）
    const tagsStr = (poi.tags || []).join(' ')
    const hasHotelTag = tagsStr.includes('住宿服务')
    const hasShoppingTag = tagsStr.includes('购物服务') || tagsStr.includes('购物相关场所')
    if (hasHotelTag) {
      if (poi.categoryL1 !== 'hotel') {
        poi.categoryL1 = 'hotel'
        poi.categoryL3 = resolveCategoryL3('hotel', [poi.categoryL3])
        categoryReclassifications++
      }
      continue  // 无论原来是什么分类，都跳过后续 classifyCategory，保护 hotel
    }
    if (hasShoppingTag) {
      // 例外：名称含明显餐饮关键词的，纠正为food（避免数据源标签错误）
      const nameLower = String(poi.namePrimary || poi.nameZh || '').toLowerCase()
      const hasStrongFoodSignal = /火锅|烤肉|铁板烧|烤鸭|烧烤|餐厅|饭店|料理|面馆|菜馆|小馆|食堂/.test(nameLower)
      if (hasStrongFoodSignal) {
        if (poi.categoryL1 !== 'food') {
          poi.categoryL1 = 'food'
          poi.categoryL3 = resolveCategoryL3('food', [poi.categoryL3])
          categoryReclassifications++
        }
        continue  // 跳过后续 classifyCategory
      }
      if (poi.categoryL1 !== 'shopping') {
        poi.categoryL1 = 'shopping'
        poi.categoryL3 = resolveCategoryL3('shopping', [poi.categoryL3])
        categoryReclassifications++
      }
      continue  // 跳过后续 classifyCategory
    }
    const hasFoodTag = tagsStr.includes('餐饮服务') || tagsStr.includes('中餐厅') || tagsStr.includes('快餐厅') || tagsStr.includes('外国餐厅')
    if (hasFoodTag) {
      if (poi.categoryL1 !== 'food') {
        poi.categoryL1 = 'food'
        poi.categoryL3 = resolveCategoryL3('food', [poi.categoryL3])
        categoryReclassifications++
      }
      continue  // 跳过后续 classifyCategory
    }

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

  // ── 餐饮/购物类目：标记无名小店 ──
  for (const entry of mergedEntries) {
    const name = String(entry.raw.namePrimary || '').trim()
    const l1 = entry.raw.categoryL1
    if ((l1 === 'food' || l1 === 'shopping') && name.length < 3) {
      // 标记为低质量，但不删除（让排序将其自然沉底）
      (entry.raw as any).isLowQuality = true
    }
  }

  // ── 按 L1 类目分组 & 综合热门度排序 & 截取 top N ──
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

    // 按综合热门度排序（解决 OSM 无 rating 导致知名 POI 被挤掉的问题）
    items.sort((a, b) => {
      const scoreA = computeHotnessScore(a.raw, a.conflictReport)
      const scoreB = computeHotnessScore(b.raw, b.conflictReport)
      return scoreB - scoreA
    })

    // 截取目标数量
    const selected = items.slice(0, targetPerCategory)
    byCategory[l1] = selected.length

    for (const entry of selected) {
      globalIdx++
      const score = computePOIScore(entry.raw, entry.conflictReport)
      const grade = scoreGrade(score.total)
      scoreDistribution[grade as 'A' | 'B' | 'C' | 'D']++
      finalPOIs.push(rawToPOI(entry.raw, city, globalIdx, score))
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
