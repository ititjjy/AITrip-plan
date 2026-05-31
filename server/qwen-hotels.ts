/**
 * qwen-hotels.ts - Qwen API integration for hotel recommendations
 *
 * Generates TOP 30 hotel recommendations for a given city,
 * including room types, pricing, amenities, and contact info.
 */

const ARK_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions'
const MODEL_NAME = 'ep-m-20260531112146-l9cfz'

/* -- Hotel image sets from Unsplash -- */
const hotelImages = [
  'photo-1566073771259-6a8506099945', 'photo-1582719508461-905c673771fd',
  'photo-1520250497591-112f2f40a3f4', 'photo-1564501049412-61c2a3083791',
  'photo-1571896349842-33c89424de2d', 'photo-1551882547-ff40c63fe5fa',
  'photo-1542314831-068cd1dbfeeb', 'photo-1578683010236-d716f9a3f461',
  'photo-1445019980597-93fa8acb246c', 'photo-1631049307264-da0ec9d70304',
  'photo-1618773928121-c32f40756c7f', 'photo-1590490360182-c33d57733427',
  'photo-1522798514-97ceb8c4f1c8', 'photo-1596394516093-501ba68a0ba6',
  'photo-1549294413-26f195200c16', 'photo-1612320743219-a5b74e1b6c0b',
  'photo-1568084680786-a84f91d1153c', 'photo-1584132967334-10e028bd69f7',
  'photo-1611892440504-42a792e24d32', 'photo-1587213811864-46e59f6764b4',
  'photo-1590381105924-c72589b9ef3f', 'photo-1563911302283-d2bc129e7570',
  'photo-1586611292717-f828b167408c', 'photo-1574643156929-51fa098b0394',
  'photo-1559508551-44bff1de756b', 'photo-1585255318859-f5c15f4cffe9',
  'photo-1548294735-c47e1e573a9e', 'photo-1561409037-c7be81613c1f',
  'photo-1455587734955-081b22074882', 'photo-1606402179428-a57976d71fa4',
]

function getHotelImageSet(baseIndex: number): string[] {
  return [0, 1, 2, 3, 4].map(offset => {
    const photoId = hotelImages[(baseIndex + offset) % hotelImages.length]
    return `https://images.unsplash.com/${photoId}?w=800&h=500&fit=crop`
  })
}

/* -- Prompt builder -- */
function buildHotelPrompt(cityName: string, cityNameEn: string): string {
  return `推荐${cityName}（${cityNameEn}）最值得入住的30家酒店，涵盖经济型、舒适型、高档型和豪华型各类酒店。

要求必须包含该城市所有知名国际品牌酒店（如W酒店、丽思卡尔顿、四季、瑞吉、华尔道夫、安达仕、柏悦、文华东方、半岛、洲际、香格里拉、希尔顿等在该城市有的品牌），再用本地特色和经济型酒店补齐30家。

直接输出JSON数组，格式如下（不要输出任何说明文字，不要用markdown代码块）：
[
  {
    "name":"酒店名称",
    "address":"详细地址",
    "lat":35.6762,
    "lng":139.6503,
    "rating":4.5,
    "stars":4,
    "description":"酒店简介（30字左右）",
    "amenities":["Wi-Fi","停车场","泳池","健身房","餐厅","商务中心"],
    "phone":"联系电话",
    "checkInTime":"14:00",
    "checkOutTime":"12:00",
    "tags":["商务","亲子","情侣"],
    "reviewCount":1500,
    "distance":2.5,
    "roomTypes":[
      {"name":"标准双床房","bedType":"双床","maxGuests":2,"area":28,"price":450,"originalPrice":580,"breakfast":true,"amenities":["空调","电视","迷你吧"]},
      {"name":"豪华大床房","bedType":"大床","maxGuests":2,"area":35,"price":680,"originalPrice":880,"breakfast":true,"amenities":["空调","电视","浴缸","迷你吧"]}
    ]
  }
]

要求：
1. 酒店真实存在，坐标准确，价格为人民币，按推荐度从高到低排序。
2. 每家酒店包含2-3种房型，价格合理。
3. stars范围2-5，rating范围3.0-5.0，distance为距市中心公里数。
4. amenities从以下选取：Wi-Fi、停车场、泳池、健身房、餐厅、商务中心、SPA、接送机、洗衣服务、行李寄存、24小时前台、会议室。
5. 价格范围：经济型150-400，舒适型400-800，高档型800-1500，豪华型1500+。
6. description尽量简短精炼，不超过30字。`
}

/* -- Response types -- */
interface RawRoomType {
  name?: string
  bedType?: string
  maxGuests?: number
  area?: number
  price?: number
  originalPrice?: number
  breakfast?: boolean
  amenities?: string[]
}

interface RawHotel {
  name?: string
  address?: string
  lat?: number
  lng?: number
  rating?: number
  stars?: number
  description?: string
  amenities?: string[]
  phone?: string
  checkInTime?: string
  checkOutTime?: string
  tags?: string[]
  reviewCount?: number
  distance?: number
  roomTypes?: RawRoomType[]
}

interface HotelResult {
  id: string
  name: string
  address: string
  lat: number
  lng: number
  rating: number
  stars: number
  priceRange: [number, number]
  description: string
  amenities: string[]
  images: string[]
  phone: string
  checkInTime: string
  checkOutTime: string
  roomTypes: Array<{
    id: string
    name: string
    bedType: string
    maxGuests: number
    area: number
    price: number
    originalPrice?: number
    breakfast: boolean
    amenities: string[]
    available: boolean
  }>
  tags: string[]
  reviewCount: number
  distance: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function transformHotels(rawHotels: RawHotel[], cityId: string): HotelResult[] {
  return rawHotels.map((h, idx) => {
    const rooms = (h.roomTypes || []).map((r, rIdx) => ({
      id: `room-${cityId}-${idx}-${rIdx}`,
      name: String(r.name || `房型${rIdx + 1}`),
      bedType: String(r.bedType || '大床'),
      maxGuests: clamp(Number(r.maxGuests) || 2, 1, 6),
      area: clamp(Number(r.area) || 25, 10, 200),
      price: Math.max(100, Number(r.price) || 400),
      originalPrice: r.originalPrice ? Math.max(Number(r.price) || 400, Number(r.originalPrice)) : undefined,
      breakfast: !!r.breakfast,
      amenities: Array.isArray(r.amenities) ? r.amenities.map(String) : [],
      available: true,
    }))

    const prices = rooms.map(r => r.price)
    const minPrice = prices.length > 0 ? Math.min(...prices) : 400
    const maxPrice = prices.length > 0 ? Math.max(...prices) : 1200

    return {
      id: `hotel-${cityId}-${idx + 1}`,
      name: String(h.name || `酒店${idx + 1}`),
      address: String(h.address || ''),
      lat: Number(h.lat) || 0,
      lng: Number(h.lng) || 0,
      rating: clamp(Number(h.rating) || 4.0, 1, 5),
      stars: clamp(Number(h.stars) || 3, 1, 5),
      priceRange: [minPrice, maxPrice] as [number, number],
      description: String(h.description || ''),
      amenities: Array.isArray(h.amenities) ? h.amenities.map(String).slice(0, 12) : [],
      images: getHotelImageSet(idx),
      phone: String(h.phone || ''),
      checkInTime: String(h.checkInTime || '14:00'),
      checkOutTime: String(h.checkOutTime || '12:00'),
      roomTypes: rooms.length > 0 ? rooms : [
        { id: `room-${cityId}-${idx}-0`, name: '标准房', bedType: '大床', maxGuests: 2, area: 25, price: 400, breakfast: false, amenities: ['空调', '电视'], available: true },
      ],
      tags: Array.isArray(h.tags) ? h.tags.map(String).slice(0, 4) : [],
      reviewCount: clamp(Number(h.reviewCount) || 100, 10, 50000),
      distance: clamp(Number(h.distance) || 3, 0.1, 50),
    }
  })
}

/* -- JSON repair helper -- */
function repairTruncatedJSON(text: string): string | null {
  let clean = text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim()
  const arrStart = clean.indexOf('[')
  if (arrStart === -1) return null
  clean = clean.slice(arrStart)
  if (clean.endsWith(']')) return clean

  const lastBrace = clean.lastIndexOf('}')
  if (lastBrace === -1) return null

  const truncated = clean.slice(0, lastBrace + 1) + ']'
  try {
    JSON.parse(truncated)
    return truncated
  } catch {
    return null
  }
}

/* ═══════════════════════ Public API ═══════════════════════ */

export async function fetchHotelsFromQwen(
  cityName: string,
  cityNameEn: string,
  cityId: string,
  apiKey: string,
): Promise<HotelResult[]> {
  const systemPrompt = '你是一位资深酒店行业顾问，精通全球各地酒店资源。你只输出合法的JSON，不输出任何其他文字。'
  const userPrompt = buildHotelPrompt(cityName, cityNameEn)

  console.log(`  [Doubao-Hotels] Requesting hotels for ${cityName}...`)

  // 添加 90 秒超时保护，防止 fetch 无限挂起
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 90_000)

  const response = await fetch(ARK_BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL_NAME,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 16000,
    }),
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout))

  if (!response.ok) {
    const errData = await response.json().catch(() => ({})) as { error?: { message?: string } }
    const msg = errData?.error?.message || `HTTP ${response.status}`
    console.error(`  [Doubao-Hotels] HTTP error: ${msg}`)
    if (response.status === 401) throw new Error(`API_KEY_INVALID: ${msg}`)
    throw new Error(`HOTEL_API_ERROR: ${msg}`)
  }

  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
  const text = data?.choices?.[0]?.message?.content
  if (!text) {
    throw new Error('EMPTY_RESPONSE: API returned no content')
  }

  console.log(`  [Doubao-Hotels] Response (${text.length} chars): ${text.slice(0, 300)}...`)

  let parsed: RawHotel[]
  try {
    const raw = JSON.parse(text)
    parsed = Array.isArray(raw) ? raw : []
  } catch {
    const repaired = repairTruncatedJSON(text)
    if (repaired) {
      try {
        const raw = JSON.parse(repaired)
        parsed = Array.isArray(raw) ? raw : []
        console.log(`  [Doubao-Hotels] Repaired truncated JSON`)
      } catch {
        throw new Error('JSON_PARSE_ERROR: Could not parse hotel response')
      }
    } else {
      throw new Error('JSON_PARSE_ERROR: No valid JSON found')
    }
  }

  if (parsed.length === 0) {
    throw new Error('NO_HOTELS: API returned empty hotel list')
  }

  const hotels = transformHotels(parsed, cityId)
  console.log(`  [Doubao-Hotels] ${cityName}: ${hotels.length} hotels generated`)
  return hotels
}
