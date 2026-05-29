/**
 * agent/sources/google.ts — Google Places API 采集器
 *
 * Google Places API (New)，数据最全、评分准确。
 * $200/月免费额度。
 */

import { AGENT_CONFIG, API_KEYS } from '../config.js'
import { RateLimiter, clamp } from '../utils.js'
import { externalCategoryToL3 } from '../categories.js'
import type { SourceCollector, CityInfo, L1Category, RawPOI } from './base.js'
import { roundCoord } from './base.js'

const SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText'

const rateLimiter = new RateLimiter(AGENT_CONFIG.googleInterval)

/* ── Google Place Types → 6 大类目 ── */

const CATEGORY_TYPES: Record<L1Category, string[]> = {
  scenic: ['tourist_attraction', 'museum', 'park', 'landmark'],
  food: ['restaurant', 'cafe', 'bar'],
  shopping: ['shopping_mall', 'store', 'market'],
  entertainment: ['amusement_park', 'zoo', 'aquarium', 'night_club', 'performing_arts_theater'],
  experience: ['spa', 'gym', 'art_gallery', 'museum', 'bowling_alley'],
  hotel: ['lodging', 'hotel', 'resort'],
}

/* ── Google Place → RawPOI ── */

function transformPlace(place: any, l1: L1Category): RawPOI | null {
  const name = place.displayName?.text || place.formattedAddress
  if (!name) return null

  const rawLat = place.location?.latitude
  const rawLng = place.location?.longitude
  if (!rawLat || !rawLng) return null

  // 提取标签 & 映射 L3
  const tags: string[] = []
  let l3 = `${l1}.${getDefaultL2(l1)}.${getDefaultL3(l1)}`

  if (place.types) {
    tags.push(...place.types.slice(0, 3))
    for (const t of place.types) {
      const mapped = externalCategoryToL3('google', t)
      if (mapped && mapped.l1 === l1) {
        l3 = mapped.l3
        break
      }
    }
  }
  if (place.primaryTypeDisplayName?.text) {
    tags.unshift(place.primaryTypeDisplayName.text)
  }

  // 地址
  const address = place.formattedAddress || ''

  // 营业时间
  let operatingHours = ''
  if (place.regularOpeningHours?.weekdayDescriptions) {
    operatingHours = place.regularOpeningHours.weekdayDescriptions.slice(0, 2).join('; ')
  }

  return {
    namePrimary: name,
    nameZh: '',  // Google 中文名称需额外处理
    nameEn: name,
    categoryL1: l1,
    categoryL3: l3,
    lat: roundCoord(rawLat),
    lng: roundCoord(rawLng),
    address,
    addressEn: address,
    rating: place.rating ? clamp(place.rating, 1, 5) : undefined,
    cost: place.priceLevel ? estimateCost(place.priceLevel) : 0,
    visitDuration: estimateDuration(l1),
    description: place.editorialSummary?.text || '',
    tags: [...new Set(tags)].filter(Boolean).slice(0, 4),
    operatingHours,
    source: 'google',
    sourceId: place.id,
  }
}

function estimateCost(priceLevel: number): number {
  const map: Record<number, number> = { 0: 0, 1: 50, 2: 150, 3: 400, 4: 800 }
  return map[priceLevel] || 0
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

/* ── Google API 调用 ── */

async function searchPlaces(
  lat: number,
  lng: number,
  categoryTypes: string[],
  radius: number,
): Promise<any[]> {
  await rateLimiter.wait()

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), AGENT_CONFIG.googleTimeout)

  try {
    const query = categoryTypes.join(' OR ')
    const response = await fetch(SEARCH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': API_KEYS.google,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.types,places.priceLevel,places.regularOpeningHours,places.editorialSummary,places.primaryTypeDisplayName',
      },
      body: JSON.stringify({
        textQuery: query,
        locationRestriction: {
          circle: {
            center: { latitude: lat, longitude: lng },
            radius: radius * 1000,
          },
        },
        maxResultCount: 20,
        languageCode: 'zh-CN',
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({})) as any
      throw new Error(`Google HTTP ${response.status}: ${err.error?.message || 'unknown'}`)
    }

    const data = await response.json() as { places?: any[] }
    return data.places || []
  } finally {
    clearTimeout(timeout)
  }
}

/* ── SourceCollector 实现 ── */

export class GoogleCollector implements SourceCollector {
  readonly name = 'google'

  async isAvailable(): Promise<boolean> {
    return !!API_KEYS.google
  }

  async collect(city: CityInfo, categories: L1Category[]): Promise<RawPOI[]> {
    const allPOIs: RawPOI[] = []

    for (const category of categories) {
      try {
        const types = CATEGORY_TYPES[category] || []
        console.log(`  [Google] Searching ${category} for ${city.name}...`)

        const places = await searchPlaces(
          city.lat, city.lng, types, AGENT_CONFIG.searchRadiusKm
        )

        let count = 0
        for (const place of places) {
          const poi = transformPlace(place, category)
          if (poi) {
            allPOIs.push(poi)
            count++
          }
        }
        console.log(`  [Google] ${category}: ${count} POIs`)
      } catch (err) {
        console.error(`  [Google] ${category} failed:`, (err as Error).message)
      }
    }

    return allPOIs
  }
}
