/**
 * agent/sources/foursquare.ts — Foursquare Places API 采集器
 *
 * Foursquare Places API v3，数据质量高，全球覆盖。
 * 免费版 950 请求/月。
 */

import { AGENT_CONFIG, API_KEYS } from '../config.js'
import { RateLimiter, clamp } from '../utils.js'
import { externalCategoryToL3 } from '../categories.js'
import { fillMissingTranslations } from '../translate.js'
import type { SourceCollector, CityInfo, L1Category, RawPOI } from './base.js'
import { roundCoord } from './base.js'

// 2025-06 迁移至新端点，认证改为 Bearer + Service API Key
const BASE_URL = 'https://places-api.foursquare.com/places/search'
const FSQ_API_VERSION = '2025-06-17'

const rateLimiter = new RateLimiter(AGENT_CONFIG.foursquareInterval)

/* ── Foursquare Category IDs (6 大类目) ── */

const CATEGORY_IDS: Record<L1Category, string[]> = {
  scenic: ['10000', '16000'],       // Arts & Entertainment, Landmarks
  food: ['13000', '13032', '13033', '13035', '13065'],  // Food, Chinese Restaurant, Japanese Restaurant, Italian Restaurant, Dessert Shop
  shopping: ['17000', '17114', '17115', '17116', '17117'],  // Shops & Services, Shopping Mall, Department Store, Supermarket, Convenience Store
  entertainment: [
    '10000',  // Arts & Entertainment
    '10001',  // Concert Hall
    '10002',  // Music Venue
    '10003',  // Performing Arts Venue
    '10004',  // Movie Theater
    '10008',  // Comedy Club
    '10025',  // karaoke bar
    '10032',  // Theme Park
    '10033',  // Water Park
    '10035',  // Aquarium
    '10043',  // Bowling Alley
    '16000',  // Nightlife Spot
    '16001',  // Bar
    '16003',  // Lounge
    '16004',  // Nightclub
    '16006',  // Speakeasy
  ],
  experience: ['18000', '16000'],   // Outdoors & Recreation, some Landmarks
  hotel: ['19000'],                  // Travel & Transportation
}

/* ── Foursquare 响应 → RawPOI ── */

/** entertainment 采集时排除的 sub-category（10000 Arts & Entertainment / 16000 Nightlife Spot 太宽泛） */
const EXCLUDE_ENTERTAINMENT_SUBCATS = [
  'Photo Studio', 'Photography Studio', 'Art Gallery', 'Art Museum',
  'Gym', 'Fitness Center', 'Swimming Pool', 'Sports Club',
  'Recreation Center',
  'Bookstore', 'Library', 'School', 'College',
  'Cultural Center', 'Community Center',
]

function transformPlace(place: any, l1: L1Category): RawPOI | null {
  const name = place.name
  if (!name) return null

  // 新端点 (places-api.foursquare.com) 坐标在顶层，旧端点在 geocodes.main
  const rawLat = place.latitude ?? place.geocodes?.main?.latitude
  const rawLng = place.longitude ?? place.geocodes?.main?.longitude
  if (!rawLat || !rawLng) return null

  const addr = place.location?.formatted_address || place.location?.address || ''

  // 提取标签 & 尝试映射 L3
  const tags: string[] = []
  let l3 = `${l1}.${getDefaultL2(l1)}.${getDefaultL3(l1)}`
  let mainCatName = ''
  if (place.categories) {
    for (const cat of place.categories.slice(0, 3)) {
      const catName = cat.short_name || cat.name || ''
      if (catName) tags.push(catName)
      if (!mainCatName) mainCatName = catName
      // 尝试用 Foursquare category name 映射 L3
      const mapped = externalCategoryToL3('foursquare', catName)
      if (mapped && mapped.l1 === l1) {
        l3 = mapped.l3
      }
    }
  }

  // 过滤：entertainment 中排除非娱乐性质的 sub-category
  if (l1 === 'entertainment') {
    const exclude = EXCLUDE_ENTERTAINMENT_SUBCATS.some(k => mainCatName.toLowerCase().includes(k.toLowerCase()))
    if (exclude) return null
  }

  // 费用估算 (Foursquare: 1=cheap, 2=moderate, 3=expensive, 4=very expensive)
  let cost = 0
  if (place.price) {
    const priceMap: Record<number, number> = { 1: 50, 2: 150, 3: 400, 4: 800 }
    cost = priceMap[place.price] || 0
  }

  // 营业时间
  let operatingHours = ''
  if (place.hours?.display) {
    operatingHours = place.hours.display
  }

  return {
    namePrimary: name,
    nameZh: '',  // Foursquare 不提供中文名
    nameEn: name,
    categoryL1: l1,
    categoryL3: l3,
    lat: roundCoord(rawLat),
    lng: roundCoord(rawLng),
    address: addr,
    addressEn: addr,
    rating: place.rating ? clamp(place.rating / 2, 1, 5) : undefined,  // FS rating 0-10 → 1-5
    cost,
    visitDuration: estimateDuration(l1),
    description: place.description || place.tip || '',
    tags: tags.filter(Boolean),
    operatingHours,
    source: 'foursquare',
    sourceId: place.fsq_id,
  }
}

function estimateDuration(l1: L1Category): number {
  const defaults: Record<L1Category, number> = {
    scenic: 90, food: 60, shopping: 90,
    entertainment: 120, experience: 120, hotel: 0,
  }
  return defaults[l1] || 60
}

function getDefaultL2(l1: L1Category): string {
  const map: Record<L1Category, string> = {
    scenic: 'modern', food: 'local', shopping: 'mall',
    entertainment: 'theme', experience: 'outdoor', hotel: 'comfort',
  }
  return map[l1]
}

function getDefaultL3(l1: L1Category): string {
  const map: Record<L1Category, string> = {
    scenic: 'scenic.modern.square', food: 'food.local.signature',
    shopping: 'shopping.mall.comprehensive', entertainment: 'entertainment.theme.amusement',
    experience: 'experience.outdoor.hiking', hotel: 'hotel.comfort.fourstar',
  }
  return map[l1]
}

/* ── API 调用 ── */

interface SearchResult {
  results: any[]
  context?: {
    geo_bounds?: {
      circle?: {
        center?: { latitude: number; longitude: number }
        radius?: number
      }
    }
    cursor?: string
  }
}

async function searchPlaces(
  lat: number,
  lng: number,
  categoryIds: string[],
  limit: number = 50,
  offset: number = 0,
): Promise<SearchResult> {
  await rateLimiter.wait()

  const params = new URLSearchParams({
    ll: `${lat},${lng}`,
    radius: String(AGENT_CONFIG.searchRadiusKm * 1000),
    categories: categoryIds.join(','),
    limit: String(Math.min(limit, 50)),
  })

  // 分页：使用 offset 参数
  if (offset > 0) {
    params.set('offset', String(offset))
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), AGENT_CONFIG.foursquareTimeout)

  try {
    const response = await fetch(`${BASE_URL}?${params}`, {
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${API_KEYS.foursquare}`,
        'X-Places-Api-Version': FSQ_API_VERSION,
      },
      signal: controller.signal,
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({})) as any
      throw new Error(`Foursquare HTTP ${response.status}: ${err.error || 'unknown'}`)
    }

    const data = await response.json() as SearchResult
    return data
  } finally {
    clearTimeout(timeout)
  }
}

/* ── SourceCollector 实现 ── */

export class FoursquareCollector implements SourceCollector {
  readonly name = 'foursquare'

  async isAvailable(): Promise<boolean> {
    return !!API_KEYS.foursquare
  }

  async collect(city: CityInfo, categories: L1Category[]): Promise<RawPOI[]> {
    const allPOIs: RawPOI[] = []
    const MAX_PAGES = 3
    const PAGE_SIZE = 50

    for (const category of categories) {
      try {
        const categoryIds = CATEGORY_IDS[category] || []
        console.log(`  [Foursquare] Searching ${category} for ${city.name}...`)

        let categoryCount = 0
        for (let page = 1; page <= MAX_PAGES; page++) {
          const offset = (page - 1) * PAGE_SIZE
          const data = await searchPlaces(city.lat, city.lng, categoryIds, PAGE_SIZE, offset)
          const places = data.results || []

          // 无结果则提前退出
          if (places.length === 0) break

          for (const place of places) {
            const poi = transformPlace(place, category)
            if (poi) {
              allPOIs.push(poi)
              categoryCount++
            }
          }

          // 本页结果不足一页，说明已到末尾
          if (places.length < PAGE_SIZE) break
        }

        console.log(`  [Foursquare] ${category}: ${categoryCount} POIs`)
      } catch (err) {
        console.error(`  [Foursquare] ${category} failed:`, (err as Error).message)
      }
    }

    // 补齐缺失的中文名/英文名翻译
    await fillMissingTranslations(allPOIs)

    return allPOIs
  }
}
