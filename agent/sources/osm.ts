/**
 * agent/sources/osm.ts — OpenStreetMap 数据采集器
 *
 * 通过 Overpass API 查询全球城市 POI 数据。
 * 免费、无限制、数据真实可靠。
 */

import { AGENT_CONFIG } from '../config.js'
import { RateLimiter } from '../utils.js'
import { osmTagsToCategory } from '../categories.js'
import type { SourceCollector, CityInfo, L1Category, RawPOI } from './base.js'
import { roundCoord } from './base.js'

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'

const rateLimiter = new RateLimiter(AGENT_CONFIG.osmInterval)

/* ── L1 类目 → Overpass 查询片段 ── */

const CATEGORY_QUERIES: Record<L1Category, string> = {
  scenic: `
    nwr["tourism"~"attraction|viewpoint|artwork"](around:{radius},{lat},{lng});
    nwr["historic"](around:{radius},{lat},{lng});
    nwr["place_of_worship"]["tourism"](around:{radius},{lat},{lng});
    nwr["monument"]["tourism"](around:{radius},{lat},{lng});
    nwr["memorial"]["tourism"](around:{radius},{lat},{lng});
    nwr["natural"~"peak|volcano|water|beach|wood|forest|waterfall|cave_entrance"](around:{radius},{lat},{lng});
    nwr["boundary"="national_park"](around:{radius},{lat},{lng});
    nwr["leisure"~"park|garden"](around:{radius},{lat},{lng});
    nwr["tourism"="zoo"](around:{radius},{lat},{lng});
  `,
  food: `
    nwr["amenity"="restaurant"](around:{radius},{lat},{lng});
    nwr["amenity"="cafe"](around:{radius},{lat},{lng});
    nwr["amenity"="fast_food"]["name"](around:{radius},{lat},{lng});
    nwr["amenity"~"bar|pub"]["name"](around:{radius},{lat},{lng});
    nwr["amenity"="food_court"](around:{radius},{lat},{lng});
  `,
  shopping: `
    nwr["shop"~"mall|department_store|supermarket"](around:{radius},{lat},{lng});
    nwr["amenity"="marketplace"](around:{radius},{lat},{lng});
    nwr["shop"~"gift|souvenir|clothes|shoes|electronics|antiques|craft"](around:{radius},{lat},{lng});
  `,
  entertainment: `
    nwr["tourism"~"theme_park|aquarium|casino"](around:{radius},{lat},{lng});
    nwr["leisure"~"water_park|stadium|sports_centre"](around:{radius},{lat},{lng});
    nwr["amenity"~"nightclub|theatre"](around:{radius},{lat},{lng});
  `,
  experience: `
    nwr["tourism"~"museum|gallery|spa"](around:{radius},{lat},{lng});
    nwr["sport"~"diving|surfing|skiing|climbing|cycling"](around:{radius},{lat},{lng});
    nwr["amenity"~"public_bath|spa"](around:{radius},{lat},{lng});
    nwr["natural"="hot_spring"](around:{radius},{lat},{lng});
    nwr["leisure"~"golf_course|horse_riding"](around:{radius},{lat},{lng});
  `,
  hotel: `
    nwr["tourism"~"hotel|hostel|guest_house|motel|camp_site|alpine_hut"](around:{radius},{lat},{lng});
  `,
}

/* ── OSM 标签提取 ── */

function extractTags(tags: Record<string, string>): string[] {
  const result: string[] = []
  if (tags.cuisine) {
    result.push(...tags.cuisine.split(';').map(c => c.trim()).slice(0, 3))
  }
  if (tags.tourism) result.push(tags.tourism)
  if (tags.historic) result.push(tags.historic)
  if (tags.leisure) result.push(tags.leisure)
  if (tags.sport) result.push(tags.sport)
  if (tags.shop) result.push(tags.shop)
  if (tags.amenity) result.push(tags.amenity)
  if (tags.natural) result.push(tags.natural)
  return [...new Set(result)].slice(0, 4)
}

/* ── OSM opening_hours → 可读格式 ── */

function parseOperatingHours(oh: string | undefined): string {
  if (!oh) return '09:00-22:00'
  if (oh === '24/7') return '全天开放'
  // 尝试提取 "HH:MM-HH:MM" 格式
  const match = oh.match(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/)
  if (match) return `${match[1]}-${match[2]}`
  return oh.length < 80 ? oh : '09:00-22:00'
}

/* ── 地址构建 ── */

function buildAddress(tags: Record<string, string>): string {
  const parts: string[] = []
  if (tags['addr:province']) parts.push(tags['addr:province'])
  if (tags['addr:city']) parts.push(tags['addr:city'])
  if (tags['addr:district']) parts.push(tags['addr:district'])
  if (tags['addr:street']) parts.push(tags['addr:street'])
  if (tags['addr:housenumber']) parts.push(tags['addr:housenumber'])
  if (parts.length > 0) return parts.join(' ')
  if (tags['addr:full']) return tags['addr:full']
  return ''
}

/* ── 游览时长估算 ── */

function estimateDuration(l1: L1Category, tags: Record<string, string>): number {
  switch (l1) {
    case 'scenic':
      if (tags.tourism === 'museum' || tags.tourism === 'gallery') return 120
      if (tags.historic) return 60
      if (tags.boundary === 'national_park') return 240
      return 90
    case 'food':
      return 60
    case 'shopping':
      if (tags.shop === 'mall' || tags.shop === 'department_store') return 180
      return 90
    case 'entertainment':
      if (tags.tourism === 'theme_park') return 360
      if (tags.leisure === 'water_park') return 240
      return 120
    case 'experience':
      if (tags.tourism === 'museum') return 120
      if (tags.sport === 'diving' || tags.sport === 'surfing') return 180
      return 90
    case 'hotel':
      return 0  // 酒店无游览时长
    default:
      return 60
  }
}

/* ── OSM 元素 → RawPOI ── */

function osmElementToPOI(element: any): RawPOI | null {
  const tags = element.tags || {}

  // 必须有名称
  const namePrimary = tags.name || tags['name:en'] || tags['name:local']
  if (!namePrimary) return null

  // 必须有坐标
  const rawLat = element.lat ?? element.center?.lat
  const rawLng = element.lon ?? element.center?.lon
  if (!rawLat || !rawLng) return null

  // 使用 categories.ts 的映射确定类目
  const category = osmTagsToCategory(tags)
  if (!category) return null  // 无法映射到已知类目则跳过

  return {
    namePrimary: tags.name || tags['name:en'] || '',
    nameZh: tags['name:zh'] || tags['name:zh-Hans'] || '',
    nameEn: tags['name:en'] || tags.name || '',
    categoryL1: category.l1,
    categoryL3: category.l3,
    lat: roundCoord(rawLat),
    lng: roundCoord(rawLng),
    address: buildAddress(tags),
    addressEn: [tags['addr:housenumber'], tags['addr:street'], tags['addr:city']]
      .filter(Boolean).join(', ') || '',
    rating: undefined,  // OSM 无评分
    cost: 0,
    visitDuration: estimateDuration(category.l1, tags),
    description: tags.description || tags.note || (tags.wikipedia ? `参考: ${tags.wikipedia}` : ''),
    tags: extractTags(tags),
    operatingHours: parseOperatingHours(tags.opening_hours),
    source: 'osm',
    sourceId: `${element.type}/${element.id}`,
  }
}

/* ── Overpass 查询构建 ── */

function buildOverpassQuery(
  lat: number,
  lng: number,
  radius: number,
  category: L1Category,
  maxResults: number,
): string {
  const query = CATEGORY_QUERIES[category]
    .replace(/\{radius\}/g, String(radius * 1000))
    .replace(/\{lat\}/g, String(lat))
    .replace(/\{lng\}/g, String(lng))

  return `[out:json][timeout:180];
(
${query}
);
out body ${maxResults};
>;
out skel qt;`
}

/* ── Overpass API 调用 ── */

async function queryOverpass(query: string): Promise<any[]> {
  await rateLimiter.wait()

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), AGENT_CONFIG.osmTimeout)

  try {
    const response = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal,
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`Overpass HTTP ${response.status}: ${text.slice(0, 200)}`)
    }

    const data = await response.json()
    return data.elements || []
  } finally {
    clearTimeout(timeout)
  }
}

/* ── SourceCollector 实现 ── */

export class OSMCollector implements SourceCollector {
  readonly name = 'osm'

  async isAvailable(): Promise<boolean> {
    return true  // 免费无需 Key
  }

  async collect(city: CityInfo, categories: L1Category[]): Promise<RawPOI[]> {
    const allPOIs: RawPOI[] = []
    const radius = AGENT_CONFIG.searchRadiusKm
    const maxPerCategory = AGENT_CONFIG.maxPOIsPerCategory

    for (const category of categories) {
      try {
        console.log(`  [OSM] Querying ${category} for ${city.name}...`)
        const query = buildOverpassQuery(city.lat, city.lng, radius, category, maxPerCategory)
        const elements = await queryOverpass(query)

        let count = 0
        for (const element of elements) {
          const poi = osmElementToPOI(element)
          if (poi) {
            allPOIs.push(poi)
            count++
          }
        }
        console.log(`  [OSM] ${category}: ${count} POIs from ${elements.length} elements`)
      } catch (err) {
        console.error(`  [OSM] ${category} failed:`, (err as Error).message)
      }
    }

    return allPOIs
  }
}
