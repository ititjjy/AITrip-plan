/* ═══ POI Data Types (mirroring agent model) ═══ */

export interface POI {
  id: string
  name: string
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
}

export type L1Category = 'scenic' | 'food' | 'shopping' | 'entertainment' | 'experience' | 'hotel'

export const L1_CATEGORIES: L1Category[] = [
  'scenic', 'food', 'shopping', 'entertainment', 'experience', 'hotel',
]

export const L1_LABELS: Record<L1Category, { zh: string; en: string; color: string }> = {
  scenic:        { zh: '景点', en: 'Scenic',        color: 'bg-blue-100 text-blue-800' },
  food:          { zh: '餐饮', en: 'Food',          color: 'bg-orange-100 text-orange-800' },
  shopping:      { zh: '购物', en: 'Shopping',      color: 'bg-pink-100 text-pink-800' },
  entertainment: { zh: '娱乐', en: 'Entertainment', color: 'bg-purple-100 text-purple-800' },
  experience:    { zh: '体验', en: 'Experience',    color: 'bg-emerald-100 text-emerald-800' },
  hotel:         { zh: '酒店', en: 'Hotel',         color: 'bg-indigo-100 text-indigo-800' },
}

/* ═══ City ═══ */

export interface City {
  id: string
  name: string
  nameEn: string
  country: string
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
}

export interface ReviewPOI extends POI {
  reviewStatus: POIReviewStatus
  cityId: string
  cityName: string
  serverVersion?: POI
}

export interface ReviewSummary {
  season: string
  cities: CityReviewSummary[]
  totals: { newPOIs: number; updatedPOIs: number; totalPending: number }
}

export interface CityReviewDetail {
  cityId: string
  cityName: string
  season: string
  pois: ReviewPOI[]
  summary: { new: number; updated: number; published: number; total: number }
}

export interface PublishResult {
  cityId: string
  season: string
  publishedCount: number
  totalServerPOIs: number
  validationPassed: boolean
  validationMessage: string
}
