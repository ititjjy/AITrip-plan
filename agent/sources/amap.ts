/**
 * agent/sources/amap.ts — 高德地图 POI 采集器
 *
 * 高德 POI 搜索 API，国内及日本城市数据准确。
 * 仅用于中国 (isDomestic = true) 和日本 (country = '日本') 城市。
 * 个人开发者每月 5000 次请求。
 */

import { AGENT_CONFIG, API_KEYS } from '../config.js'
import { RateLimiter, clamp, gcj02ToWgs84 } from '../utils.js'
import { externalCategoryToL3 } from '../categories.js'
import { fillMissingTranslations } from '../translate.js'
import type { SourceCollector, CityInfo, L1Category, RawPOI } from './base.js'
import { roundCoord } from './base.js'

const BASE_URL = 'https://restapi.amap.com/v3/place/around'

const rateLimiter = new RateLimiter(AGENT_CONFIG.amapInterval)

/* ── 高德 POI 类型代码 → 6 大类目 ── */

const CATEGORY_TYPES: Record<L1Category, string> = {
  scenic: '110000',       // 风景名胜
  food: '050100|050200|050300|050500|050600',  // 中餐厅|外国餐厅|快餐|咖啡厅|茶艺馆
  shopping: '060100|060200|060400|060600',     // 购物中心|百货商场|超市|专卖店
  // 娱乐: 只取真正的娱乐场所(0802xx) + 影剧院(0804xx)，排除体育休闲(0801xx/0803xx)和生活服务(07xxxx)
  entertainment: '080201|080202|080203|080204|080205|080206|080207|080208|080209|080210|080211|080212|080401|080402|080403|080404|080405|080406|080407|080408',
  // 体验: 科教文化中排除培训机构(1402xx)、科研机构(1401xx)、文化中心(1412xx)、会展中心(1413xx)
  experience: '140300|140400|140500|140600|140700|140800|140900|141000|141100|141400|141500|141600',
  hotel: '100000',        // 住宿服务
}

/* ── 高德 POI → RawPOI ── */

function transformPOI(poi: any, l1: L1Category): RawPOI | null {
  const name = poi.name
  if (!name) return null

  // 高德坐标格式: "lng,lat" (GCJ-02)
  const location = poi.location?.split(',').map(Number)
  if (!location || location.length < 2) return null

  // GCJ-02 → WGS-84
  const gcjLat = location[1]
  const gcjLng = location[0]
  const { lat, lng } = gcj02ToWgs84(gcjLat, gcjLng)

  // 提取标签 & 映射 L3
  const tags: string[] = []
  let l3 = `${l1}.${getDefaultL2(l1)}.${getDefaultL3(l1)}`

  if (poi.type) tags.push(poi.type)
  if (poi.typecode) {
    const subType = poi.typecode.slice(2, 4)
    if (subType !== '00') tags.push(subType)
  }

  // 尝试用高德 type 映射 L3
  const mapped = externalCategoryToL3('amap', poi.type || '')
  if (mapped && mapped.l1 === l1) {
    l3 = mapped.l3
  }

  // 营业时间
  let operatingHours = ''
  if (poi.biz_ext?.opentime) {
    const match = String(poi.biz_ext.opentime).match(/(\d{2}:\d{2}).*?(\d{2}:\d{2})/)
    if (match) {
      operatingHours = `${match[1]}-${match[2]}`
    } else {
      operatingHours = String(poi.biz_ext.opentime).slice(0, 80)
    }
  }

  // 费用
  let cost = 0
  if (poi.biz_ext?.cost) {
    cost = Math.max(0, Number(poi.biz_ext.cost) || 0)
  }

  // 地址
  const address = poi.address || ''

  return {
    namePrimary: name,
    nameZh: name,  // 高德返回的名称本身就是中文
    nameEn: '',    // 高德不提供英文名
    categoryL1: l1,
    categoryL3: l3,
    lat: roundCoord(lat),
    lng: roundCoord(lng),
    address,
    addressEn: '',  // 高德无英文地址
    rating: poi.biz_ext?.rating ? clamp(Number(poi.biz_ext.rating), 1, 5) : undefined,
    cost,
    visitDuration: estimateDuration(l1),
    description: poi.biz_ext?.tag || '',
    tags: tags.filter(Boolean).slice(0, 4),
    operatingHours,
    source: 'amap',
    sourceId: poi.id,
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

/* ── 高德 API 调用 ── */

async function searchPOIs(
  lat: number,
  lng: number,
  typeCode: string,
  page: number = 1,
): Promise<{ pois: any[]; count: number }> {
  await rateLimiter.wait()

  const params = new URLSearchParams({
    key: API_KEYS.amap,
    location: `${lng},${lat}`,
    types: typeCode,
    radius: String(AGENT_CONFIG.searchRadiusKm * 1000),
    offset: '25',
    page: String(page),
    extensions: 'all',
    output: 'json',
  })

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), AGENT_CONFIG.amapTimeout)

  try {
    const response = await fetch(`${BASE_URL}?${params}`, {
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`Amap HTTP ${response.status}`)
    }

    const data = await response.json() as {
      status: string
      count: string
      pois: any[]
      info?: string
    }

    if (data.status !== '1') {
      throw new Error(`Amap API error: ${data.info || 'unknown'}`)
    }

    return {
      pois: data.pois || [],
      count: parseInt(data.count) || 0,
    }
  } finally {
    clearTimeout(timeout)
  }
}

/* ── SourceCollector 实现 ── */

export class AmapCollector implements SourceCollector {
  readonly name = 'amap'

  async isAvailable(): Promise<boolean> {
    return !!API_KEYS.amap
  }

  async collect(city: CityInfo, categories: L1Category[]): Promise<RawPOI[]> {
    // 仅用于中国和日本城市
    const isSupported = city.isDomestic || city.country === '日本'
    if (!isSupported) {
      console.log(`  [Amap] Skipping ${city.name} (unsupported region: ${city.country})`)
      return []
    }

    const allPOIs: RawPOI[] = []

    for (const category of categories) {
      try {
        const typeCode = CATEGORY_TYPES[category]
        console.log(`  [Amap] Searching ${category} for ${city.name}...`)

        let categoryCount = 0
        for (let page = 1; page <= 5; page++) {
          const { pois, count } = await searchPOIs(city.lat, city.lng, typeCode, page)

          for (const poi of pois) {
            const raw = transformPOI(poi, category)
            if (raw) {
              allPOIs.push(raw)
              categoryCount++
            }
          }

          if (page * 25 >= count) break
        }

        console.log(`  [Amap] ${category}: ${categoryCount} POIs`)
      } catch (err) {
        console.error(`  [Amap] ${category} failed:`, (err as Error).message)
      }
    }

    // 补齐缺失的英文名翻译
    await fillMissingTranslations(allPOIs)

    return allPOIs
  }
}
