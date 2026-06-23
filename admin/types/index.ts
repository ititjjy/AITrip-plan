/* ═══ POI Data Types (mirroring agent model) ═══ */

export interface POIScore {
  total: number
  completeness: number
  confidence: number
  sourceCount: number
  sources: string[]
  conflictCount: number
}

export interface POI {
  id: string
  name: string
  nameZh?: string
  nameEn?: string
  aliases?: string[]
  category: string       // L1.L2.L3 path e.g. "scenic.natural.mountain"
  categoryL1: L1Category
  categoryL2?: string
  categoryL3?: string
  description?: string
  address?: string
  lat: number
  lng: number
  rating?: number
  cost?: string
  duration?: string
  tags?: string[]
  seasons?: string[]
  openingHours?: string
  images?: string[]
  source?: string
  updatedAt?: number
  reviewStatus?: POIReviewStatus
  score?: POIScore
}

export type L1Category = 'scenic' | 'food' | 'shopping' | 'entertainment' | 'experience' | 'hotel' | 'lifestyle'

export const L1_CATEGORIES: L1Category[] = [
  'scenic', 'food', 'shopping', 'entertainment', 'experience', 'hotel', 'lifestyle',
]

export const L1_LABELS: Record<L1Category, { zh: string; en: string; color: string }> = {
  scenic:        { zh: '景点', en: 'Scenic',        color: 'bg-blue-100 text-blue-800' },
  food:          { zh: '餐饮', en: 'Food',          color: 'bg-orange-100 text-orange-800' },
  shopping:      { zh: '购物', en: 'Shopping',      color: 'bg-pink-100 text-pink-800' },
  entertainment: { zh: '娱乐', en: 'Entertainment', color: 'bg-purple-100 text-purple-800' },
  experience:    { zh: '体验', en: 'Experience',    color: 'bg-emerald-100 text-emerald-800' },
  hotel:         { zh: '酒店', en: 'Hotel',         color: 'bg-indigo-100 text-indigo-800' },
  lifestyle:     { zh: '生活服务', en: 'Lifestyle', color: 'bg-gray-100 text-gray-800' },
}

/* ═══ City ═══ */

export interface City {
  id: string
  name: string
  nameEn: string
  continent: string
  country: string
  province: string
  lat: number
  lng: number
  poiCount?: number
  lastUpdated?: number
}

/* ═══ Category Tree ═══ */

export interface CategoryNode {
  id: string
  label: string
  labelEn: string
  children?: CategoryNode[]
}

/* ═══ Field Source Provenance ═══ */

export interface FieldSource {
  poi_id: string
  city_id: string
  field_name: string
  source: string
  value: string
  confidence: number
  is_selected: number  // 0 or 1
}

/* ═══ POI Detail (with sources) ═══ */

export interface POIDetail extends POI {
  cityId: string
  cityName: string
  fieldSources?: Record<string, FieldSource[]>
  createdAt?: number
  reviewStatus?: POIReviewStatus
  serverVersion?: POI | null
}

/* ═══ Update Jobs ═══ */

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed'
export type JobType = 'batch' | 'targeted'

export interface UpdateJob {
  id: number
  type: JobType
  status: JobStatus
  config: {
    country?: string
    city?: string
    cityId?: string
    l1?: string
    poiId?: string
    poiName?: string
  }
  progress?: {
    current: number
    total: number
    message: string
  }
  result?: Record<string, unknown>
  error?: string
  pid?: number
  created_at: number
  started_at?: number
  completed_at?: number
}

/* ═══ API Response Types ═══ */

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  message?: string
  total?: number
  page?: number
  pageSize?: number
}

export interface StatsData {
  totalPOIs: number
  totalCities: number
  categories: number
  lastUpdate: number | null
  freshness: {
    fresh: number
    recent: number
    aging: number
    stale: number
    expired: number
  }
  pendingReviewCities?: number
  pendingReviewPOIs?: number
}

/* ═══ Search & Filter ═══ */

export interface POIFilters {
  city?: string
  l1?: L1Category
  l2?: string
  l3?: string
  q?: string
  page?: number
  pageSize?: number
  scoreMin?: number
  scoreMax?: number
  scoreGrade?: string
}

/* ═══ Score Grade Config ═══ */

export type ScoreGrade = 'A' | 'B' | 'C' | 'D'

export interface ScoreGradeConfig {
  label: string
  range: [number, number]
  color: string
  bgColor: string
  description: string
}

export const SCORE_GRADE_CONFIG: Record<ScoreGrade, ScoreGradeConfig> = {
  A: { label: 'A', range: [80, 100], color: 'text-emerald-700', bgColor: 'bg-emerald-100', description: '优质数据' },
  B: { label: 'B', range: [60, 79], color: 'text-blue-700', bgColor: 'bg-blue-100', description: '良好数据' },
  C: { label: 'C', range: [40, 59], color: 'text-amber-700', bgColor: 'bg-amber-100', description: '需审核' },
  D: { label: 'D', range: [0, 39], color: 'text-red-700', bgColor: 'bg-red-100', description: '低质量' },
}

export function getScoreGrade(score: number | undefined): ScoreGrade | null {
  if (score == null) return null
  if (score >= 80) return 'A'
  if (score >= 60) return 'B'
  if (score >= 40) return 'C'
  return 'D'
}

/* ═══ Review & Publish ═══ */

export type POIReviewStatus = 'new' | 'updated' | 'published'
export type Season = 'spring' | 'summer' | 'autumn' | 'winter'

export const SEASON_LABELS: Record<Season, { zh: string; en: string }> = {
  spring: { zh: '春季', en: 'Spring' },
  summer: { zh: '夏季', en: 'Summer' },
  autumn: { zh: '秋季', en: 'Autumn' },
  winter: { zh: '冬季', en: 'Winter' },
}

export interface CityReviewSummary {
  cityId: string
  cityName: string
  country: string
  totalAgentPOIs: number
  totalServerPOIs: number
  newCount: number
  updatedCount: number
  publishedCount: number
  agentUpdatedAt: number
  serverUpdatedAt: number | null
  avgScore: number | null
}

export interface ReviewPOI extends POI {
  reviewStatus: POIReviewStatus
  cityId: string
  cityName: string
  serverVersion?: POI
}

export interface ReviewSummary {
  cities: CityReviewSummary[]
  totals: { newPOIs: number; updatedPOIs: number; totalPending: number }
}

export interface CityReviewDetail {
  cityId: string
  cityName: string
  pois: ReviewPOI[]
  summary: { new: number; updated: number; published: number; total: number }
}

export interface PublishResult {
  cityId: string
  publishedCount: number
  totalServerPOIs: number
  validationPassed: boolean
  validationMessage: string
}

/* ═══ Pending Updates ═══ */

export interface PendingUpdate {
  cityId: string
  cityName: string
  country: string
  newTotalPOIs: number
  newQualityScore: number | null
  newByCategory: Record<string, number>
  newScoreDist: { A: number; B: number; C: number; D: number }
  newSources: string[]
  newIssuesCount: number
  createdAt: number
  oldTotalPOIs: number
  oldQualityScore: number | null
  oldByCategory: Record<string, number>
  poiDelta: number
}

export interface PendingUpdateDetail extends PendingUpdate {
  newPOIs: ReviewPOI[]
  updatedPOIs: ReviewPOI[]
  removedPOIs: ReviewPOI[]
  unchangedPOIs: ReviewPOI[]
}

/* ── Collection Status Types ── */

export interface CollectionSourceInfo {
  source: string
  items_count: number
  collected_at: number
}

export interface CollectionCitySummary {
  cityId: string
  cityName: string
  cityNameEn: string
  sources: CollectionSourceInfo[]
  sourceCount: number
  totalItems: number
  firstCollectionAt: number | null
  lastCollectionAt: number | null
  collectionCount: number
}

export interface CollectionCitiesOverview {
  summary: {
    totalCities: number
    totalSources: number
    lastCollectionAt: number | null
  }
  cities: CollectionCitySummary[]
}

export interface CollectionLogEntry {
  id: number
  source: string
  status: string
  items_collected: number
  items_accepted: number
  error_message: string
  duration_ms: number
  created_at: number
  by_category: Record<string, number>
}

export interface CollectionBatchInfo {
  id: number
  batchType: string
  status: string
  startedAt: number
  completedAt: number | null
  citiesCount: number
  config: Record<string, any>
  results: Record<string, any>
}

export interface CollectionCityDetail {
  cityId: string
  cityName: string
  cityNameEn: string
  totalRawItems: number
  collectionCount: number
  firstCollectionAt: number | null
  lastCollectionAt: number | null
  rawSources: CollectionSourceInfo[]
  logs: CollectionLogEntry[]
  batches: CollectionBatchInfo[]
}
