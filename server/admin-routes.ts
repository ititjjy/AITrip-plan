/**
 * server/admin-routes.ts — POI Admin API
 *
 * Data source: Agent DB (city_pois + city_stats) + JSON registry for metadata.
 *
 * Routes:
 *   GET    /api/admin/stats          — Dashboard statistics
 *   GET    /api/admin/cities         — List cities with POI counts
 *   POST   /api/admin/cities         — Add new city
 *   PUT    /api/admin/cities/:id     — Update city
 *   DELETE /api/admin/cities/:id     — Remove city
 *   GET    /api/admin/categories     — Category tree
 *   GET    /api/admin/pois           — POI list (filtered/paginated)
 *   GET    /api/admin/pois/search    — Global search
 *   GET    /api/admin/pois/:id       — POI detail + field sources
 *   POST   /api/admin/updates/batch  — Trigger batch update
 *   POST   /api/admin/updates/targeted — Trigger single POI update
 *   GET    /api/admin/updates        — List update jobs
 *   GET    /api/admin/updates/:id    — Job status
 *   GET    /api/admin/review/summary  — Review overview (city-level diff)
 *   GET    /api/admin/review/city/:id — POI-level review detail
 *   POST   /api/admin/publish/city    — Publish all POIs for a city
 *   POST   /api/admin/publish/pois    — Publish specific POIs
 *   GET    /api/admin/publish/validate/:id — Post-publish validation
 */

import { Router, type Request, type Response } from 'express'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { spawn } from 'child_process'
import Database from 'better-sqlite3'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const router = Router()

/* ── Agent DB connection ── */

const AGENT_DB_PATH = path.join(__dirname, '..', 'agent', 'data', 'agent.db')
let agentDB: Database.Database | null = null

function getAgentDB(): Database.Database {
  if (agentDB) return agentDB
  if (!fs.existsSync(AGENT_DB_PATH)) {
    throw new Error(`Agent DB not found: ${AGENT_DB_PATH}. Run "npm run agent:init-db" first.`)
  }
  agentDB = new Database(AGENT_DB_PATH, { readonly: true })
  agentDB.pragma('journal_mode = WAL')
  return agentDB
}

/* ── Server DB connection (for publish operations) ── */

import { getDB as getServerDB, upsertPOIs as serverUpsertPOIs } from './db.js'

/** Load POIs from Server DB for a specific city */
function loadServerPOIs(cityId: string): { pois: any[]; updatedAt: number } {
  try {
    const db = getServerDB()
    const row = db.prepare('SELECT data, updated_at FROM city_pois WHERE city_id = ?')
      .get(cityId) as { data: string; updated_at: number } | undefined
    if (!row) return { pois: [], updatedAt: 0 }
    return { pois: JSON.parse(row.data), updatedAt: row.updated_at }
  } catch {
    return { pois: [], updatedAt: 0 }
  }
}

/** Compare Agent POIs vs Server POIs, classify as new/updated/published */
function comparePOIs(agentPOIs: any[], serverPOIs: any[]) {
  const serverMap = new Map(serverPOIs.map((p: any) => [p.id, p]))
  const newPOIs: any[] = []
  const updatedPOIs: any[] = []
  const publishedPOIs: any[] = []

  for (const agentPOI of agentPOIs) {
    const serverPOI = serverMap.get(agentPOI.id)
    if (!serverPOI) {
      newPOIs.push({ ...agentPOI, reviewStatus: 'new' as const })
    } else if (JSON.stringify(agentPOI) !== JSON.stringify(serverPOI)) {
      updatedPOIs.push({ ...agentPOI, reviewStatus: 'updated' as const, serverVersion: serverPOI })
    } else {
      publishedPOIs.push({ ...agentPOI, reviewStatus: 'published' as const })
    }
  }
  return { newPOIs, updatedPOIs, publishedPOIs }
}

/** Merge specific POIs into Server DB (for POI-level publish) */
function mergePOIsIntoServer(cityId: string, poisToMerge: any[]): number {
  const { pois: existing } = loadServerPOIs(cityId)
  const existingMap = new Map(existing.map((p: any) => [p.id, p]))
  for (const poi of poisToMerge) {
    existingMap.set(poi.id, poi)
  }
  const merged = Array.from(existingMap.values())
  serverUpsertPOIs(cityId, merged)
  return poisToMerge.length
}

/* ── City registry (JSON file based) ── */

const CITY_REGISTRY_PATH = path.join(__dirname, '..', 'scripts', 'city-registry.json')
const CITY_COORDS_PATH = path.join(__dirname, '..', 'agent', 'data', 'city-coords.json')

interface CityRecord {
  id: string; name: string; nameEn: string; hotness: number
}
interface CoordRecord {
  lat: number; lng: number; isDomestic: boolean; country: string
}

function loadCityRegistry(): CityRecord[] {
  try {
    return JSON.parse(fs.readFileSync(CITY_REGISTRY_PATH, 'utf-8'))
  } catch { return [] }
}

function loadCityCoords(): Record<string, CoordRecord> {
  try {
    return JSON.parse(fs.readFileSync(CITY_COORDS_PATH, 'utf-8'))
  } catch { return {} }
}

function saveCityRegistry(cities: CityRecord[]) {
  fs.writeFileSync(CITY_REGISTRY_PATH, JSON.stringify(cities, null, 2), 'utf-8')
}

/* ── Category tree ── */

interface CategoryNode {
  id: string; label: string; labelEn: string; children?: CategoryNode[]
}

function loadCategoryTree(): CategoryNode[] {
  return [
    {
      id: 'scenic', label: '景点', labelEn: 'Scenic Spots',
      children: [
        { id: 'scenic.natural', label: '自然风光', labelEn: 'Natural Scenery', children: [
          { id: 'scenic.natural.mountain', label: '山岳', labelEn: 'Mountains' },
          { id: 'scenic.natural.lake', label: '湖泊', labelEn: 'Lakes' },
          { id: 'scenic.natural.beach', label: '海滩', labelEn: 'Beaches' },
          { id: 'scenic.natural.forest', label: '森林', labelEn: 'Forests' },
          { id: 'scenic.natural.waterfall', label: '瀑布', labelEn: 'Waterfalls' },
          { id: 'scenic.natural.canyon', label: '峡谷/溶洞', labelEn: 'Canyons & Caves' },
          { id: 'scenic.natural.island', label: '岛屿', labelEn: 'Islands' },
          { id: 'scenic.natural.desert', label: '沙漠/草原', labelEn: 'Deserts & Grasslands' },
        ]},
        { id: 'scenic.historical', label: '历史古迹', labelEn: 'Historical Sites', children: [
          { id: 'scenic.historical.temple', label: '寺庙/道观', labelEn: 'Temples' },
          { id: 'scenic.historical.church', label: '教堂', labelEn: 'Churches' },
          { id: 'scenic.historical.castle', label: '城堡/宫殿', labelEn: 'Castles & Palaces' },
          { id: 'scenic.historical.ruins', label: '遗址/遗迹', labelEn: 'Ruins' },
          { id: 'scenic.historical.tomb', label: '陵墓', labelEn: 'Tombs' },
          { id: 'scenic.historical.wall', label: '城墙/古城', labelEn: 'Ancient Walls & Towns' },
        ]},
        { id: 'scenic.modern', label: '现代地标', labelEn: 'Modern Landmarks', children: [
          { id: 'scenic.modern.skyscraper', label: '摩天大楼', labelEn: 'Skyscrapers' },
          { id: 'scenic.modern.bridge', label: '桥梁', labelEn: 'Bridges' },
          { id: 'scenic.modern.square', label: '广场', labelEn: 'Squares & Plazas' },
          { id: 'scenic.modern.tower', label: '观景塔', labelEn: 'Observation Towers' },
        ]},
        { id: 'scenic.park', label: '公园园林', labelEn: 'Parks & Gardens', children: [
          { id: 'scenic.park.national', label: '国家公园', labelEn: 'National Parks' },
          { id: 'scenic.park.botanical', label: '植物园', labelEn: 'Botanical Gardens' },
          { id: 'scenic.park.zoo', label: '动物园', labelEn: 'Zoos' },
          { id: 'scenic.park.garden', label: '花园/庭院', labelEn: 'Gardens' },
          { id: 'scenic.park.urban', label: '城市公园', labelEn: 'Urban Parks' },
        ]},
      ],
    },
    {
      id: 'food', label: '餐饮', labelEn: 'Food & Dining',
      children: [
        { id: 'food.local', label: '地方特色', labelEn: 'Local Cuisine', children: [
          { id: 'food.local.signature', label: '招牌菜馆', labelEn: 'Signature Restaurants' },
          { id: 'food.local.street', label: '小吃/夜市', labelEn: 'Street Food & Night Markets' },
          { id: 'food.local.traditional', label: '老字号', labelEn: 'Traditional Brands' },
        ]},
        { id: 'food.international', label: '异国料理', labelEn: 'International', children: [
          { id: 'food.international.western', label: '西餐', labelEn: 'Western' },
          { id: 'food.international.japanese', label: '日料', labelEn: 'Japanese' },
          { id: 'food.international.fusion', label: '融合菜', labelEn: 'Fusion' },
          { id: 'food.international.other', label: '其他异国', labelEn: 'Other International' },
        ]},
        { id: 'food.cafe', label: '咖啡茶饮', labelEn: 'Cafes & Tea', children: [
          { id: 'food.cafe.coffee', label: '咖啡馆', labelEn: 'Coffee Shops' },
          { id: 'food.cafe.tea', label: '茶馆', labelEn: 'Tea Houses' },
          { id: 'food.cafe.dessert', label: '甜品店', labelEn: 'Dessert Shops' },
        ]},
        { id: 'food.bar', label: '酒吧酒馆', labelEn: 'Bars & Pubs', children: [
          { id: 'food.bar.cocktail', label: '鸡尾酒吧', labelEn: 'Cocktail Bars' },
          { id: 'food.bar.pub', label: '啤酒屋', labelEn: 'Pubs & Breweries' },
          { id: 'food.bar.rooftop', label: '屋顶酒吧', labelEn: 'Rooftop Bars' },
        ]},
        { id: 'food.market', label: '美食集市', labelEn: 'Food Markets', children: [
          { id: 'food.market.foodcourt', label: '美食广场', labelEn: 'Food Courts' },
          { id: 'food.market.freshmarket', label: '生鲜市场', labelEn: 'Fresh Markets' },
        ]},
      ],
    },
    {
      id: 'shopping', label: '购物', labelEn: 'Shopping',
      children: [
        { id: 'shopping.mall', label: '商场百货', labelEn: 'Malls & Department Stores', children: [
          { id: 'shopping.mall.luxury', label: '奢侈品商场', labelEn: 'Luxury Malls' },
          { id: 'shopping.mall.comprehensive', label: '综合商场', labelEn: 'Shopping Malls' },
          { id: 'shopping.mall.outlet', label: '奥特莱斯', labelEn: 'Outlets' },
        ]},
        { id: 'shopping.specialty', label: '特色店铺', labelEn: 'Specialty Shops', children: [
          { id: 'shopping.specialty.handicraft', label: '手工艺品', labelEn: 'Handicrafts' },
          { id: 'shopping.specialty.local', label: '土特产', labelEn: 'Local Specialties' },
          { id: 'shopping.specialty.antique', label: '古董/古玩', labelEn: 'Antiques' },
        ]},
        { id: 'shopping.market', label: '集市市场', labelEn: 'Markets', children: [
          { id: 'shopping.market.flea', label: '跳蚤市场', labelEn: 'Flea Markets' },
          { id: 'shopping.market.night', label: '夜市', labelEn: 'Night Markets' },
          { id: 'shopping.market.weekend', label: '周末集市', labelEn: 'Weekend Markets' },
        ]},
        { id: 'shopping.dutyfree', label: '免税店', labelEn: 'Duty-Free', children: [
          { id: 'shopping.dutyfree.airport', label: '机场免税', labelEn: 'Airport Duty-Free' },
          { id: 'shopping.dutyfree.downtown', label: '市内免税', labelEn: 'Downtown Duty-Free' },
        ]},
      ],
    },
    {
      id: 'entertainment', label: '娱乐', labelEn: 'Entertainment',
      children: [
        { id: 'entertainment.theme', label: '主题乐园', labelEn: 'Theme Parks', children: [
          { id: 'entertainment.theme.amusement', label: '游乐园', labelEn: 'Amusement Parks' },
          { id: 'entertainment.theme.water', label: '水上乐园', labelEn: 'Water Parks' },
          { id: 'entertainment.theme.zoo', label: '动物园/水族馆', labelEn: 'Zoos & Aquariums' },
        ]},
        { id: 'entertainment.show', label: '演出表演', labelEn: 'Shows & Performances', children: [
          { id: 'entertainment.show.concert', label: '音乐会', labelEn: 'Concerts' },
          { id: 'entertainment.show.theater', label: '戏剧/歌剧', labelEn: 'Theater & Opera' },
          { id: 'entertainment.show.cultural', label: '民俗表演', labelEn: 'Cultural Shows' },
          { id: 'entertainment.show.circus', label: '马戏/杂技', labelEn: 'Circus & Acrobatics' },
        ]},
        { id: 'entertainment.nightlife', label: '夜生活', labelEn: 'Nightlife', children: [
          { id: 'entertainment.nightlife.club', label: '夜店/迪厅', labelEn: 'Nightclubs' },
          { id: 'entertainment.nightlife.karaoke', label: 'KTV', labelEn: 'Karaoke' },
          { id: 'entertainment.nightlife.livemusic', label: 'Live House', labelEn: 'Live Music' },
        ]},
        { id: 'entertainment.sports', label: '体育赛事', labelEn: 'Sports Events', children: [
          { id: 'entertainment.sports.stadium', label: '体育场馆', labelEn: 'Stadiums' },
          { id: 'entertainment.sports.racing', label: '赛车', labelEn: 'Racing' },
        ]},
        { id: 'entertainment.casino', label: '赌场博彩', labelEn: 'Casinos & Gaming', children: [
          { id: 'entertainment.casino.casino', label: '赌场', labelEn: 'Casinos' },
          { id: 'entertainment.casino.lottery', label: '彩票', labelEn: 'Lottery' },
        ]},
      ],
    },
    {
      id: 'experience', label: '体验', labelEn: 'Experiences',
      children: [
        { id: 'experience.outdoor', label: '户外运动', labelEn: 'Outdoor Activities', children: [
          { id: 'experience.outdoor.hiking', label: '徒步/登山', labelEn: 'Hiking & Trekking' },
          { id: 'experience.outdoor.diving', label: '潜水/冲浪', labelEn: 'Diving & Surfing' },
          { id: 'experience.outdoor.cycling', label: '骑行', labelEn: 'Cycling' },
          { id: 'experience.outdoor.skiing', label: '滑雪', labelEn: 'Skiing' },
          { id: 'experience.outdoor.camping', label: '露营', labelEn: 'Camping' },
        ]},
        { id: 'experience.cultural', label: '文化体验', labelEn: 'Cultural Experiences', children: [
          { id: 'experience.cultural.workshop', label: '手作工坊', labelEn: 'Workshops' },
          { id: 'experience.cultural.cooking', label: '烹饪课程', labelEn: 'Cooking Classes' },
          { id: 'experience.cultural.tradition', label: '传统仪式', labelEn: 'Traditional Ceremonies' },
          { id: 'experience.cultural.costume', label: '服饰体验', labelEn: 'Costume Experiences' },
        ]},
        { id: 'experience.wellness', label: '休闲养生', labelEn: 'Wellness & Spa', children: [
          { id: 'experience.wellness.spa', label: 'SPA', labelEn: 'Spa & Massage' },
          { id: 'experience.wellness.hotspring', label: '温泉', labelEn: 'Hot Springs' },
          { id: 'experience.wellness.yoga', label: '瑜伽/冥想', labelEn: 'Yoga & Meditation' },
        ]},
        { id: 'experience.educational', label: '研学教育', labelEn: 'Educational', children: [
          { id: 'experience.educational.museum', label: '博物馆', labelEn: 'Museums' },
          { id: 'experience.educational.gallery', label: '美术馆', labelEn: 'Art Galleries' },
          { id: 'experience.educational.science', label: '科技馆', labelEn: 'Science Centers' },
        ]},
        { id: 'experience.adventure', label: '冒险运动', labelEn: 'Adventure Sports', children: [
          { id: 'experience.adventure.paragliding', label: '滑翔伞', labelEn: 'Paragliding' },
          { id: 'experience.adventure.bungee', label: '蹦极', labelEn: 'Bungee Jumping' },
          { id: 'experience.adventure.rafting', label: '漂流', labelEn: 'Rafting' },
          { id: 'experience.adventure.skydiving', label: '跳伞', labelEn: 'Skydiving' },
        ]},
      ],
    },
    {
      id: 'hotel', label: '酒店', labelEn: 'Accommodation',
      children: [
        { id: 'hotel.luxury', label: '高端酒店', labelEn: 'Luxury', children: [
          { id: 'hotel.luxury.fivestar', label: '五星级', labelEn: '5-Star Hotels' },
          { id: 'hotel.luxury.resort', label: '度假村', labelEn: 'Resorts' },
          { id: 'hotel.luxury.villa', label: '别墅', labelEn: 'Villas' },
        ]},
        { id: 'hotel.comfort', label: '舒适酒店', labelEn: 'Comfort', children: [
          { id: 'hotel.comfort.fourstar', label: '四星级', labelEn: '4-Star Hotels' },
          { id: 'hotel.comfort.boutique', label: '精品酒店', labelEn: 'Boutique Hotels' },
          { id: 'hotel.comfort.business', label: '商务酒店', labelEn: 'Business Hotels' },
        ]},
        { id: 'hotel.budget', label: '经济住宿', labelEn: 'Budget', children: [
          { id: 'hotel.budget.chain', label: '连锁酒店', labelEn: 'Chain Hotels' },
          { id: 'hotel.budget.hostel', label: '青旅', labelEn: 'Hostels' },
          { id: 'hotel.budget.guesthouse', label: '客栈/民宿', labelEn: 'Guesthouses' },
        ]},
        { id: 'hotel.special', label: '特色住宿', labelEn: 'Unique Stays', children: [
          { id: 'hotel.special.ryokan', label: '温泉旅馆', labelEn: 'Ryokan & Onsen Inns' },
          { id: 'hotel.special.tent', label: '帐篷/营地', labelEn: 'Glamping & Tents' },
          { id: 'hotel.special.treehouse', label: '树屋/船屋', labelEn: 'Treehouses & Houseboats' },
          { id: 'hotel.special.homestay', label: '家庭旅馆', labelEn: 'Homestays' },
        ]},
      ],
    },
  ]
}

/* ── POI data access (Agent DB: city_pois with city_id key) ── */

/** Map Agent DB POI fields to admin frontend format */
function mapAgentPOI(poi: any) {
  return {
    ...poi,
    name: poi.namePrimary || poi.name || '',
    aliases: [poi.nameZh, poi.nameEn].filter(Boolean),
    duration: poi.visitDuration ? `${Math.round(poi.visitDuration / 60 * 10) / 10}小时` : poi.duration,
    openingHours: poi.operatingHours || poi.openingHours,
    images: poi.image ? [poi.image] : (poi.images || []),
    cost: typeof poi.cost === 'number' ? `¥${poi.cost}` : poi.cost,
    seasons: poi.bestSeasons || poi.seasons,
  }
}

/** Score grade mapping */
function getScoreGrade(score: number | undefined): string {
  if (score == null) return 'N/A'
  if (score >= 80) return 'A'
  if (score >= 60) return 'B'
  if (score >= 40) return 'C'
  return 'D'
}

/** Score grade ranges for filtering */
const SCORE_GRADE_RANGES: Record<string, { min: number; max: number }> = {
  A: { min: 80, max: 100 },
  B: { min: 60, max: 79 },
  C: { min: 40, max: 59 },
  D: { min: 0, max: 39 },
}

/** Compute average score from POI array */
function computeAvgScore(pois: any[]): number | null {
  const scores = pois.map((p) => p.score?.total).filter((s): s is number => s != null)
  if (scores.length === 0) return null
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
}

/** Load POIs for a city from Agent DB */
function loadPOIsForCity(cityId: string): { pois: any[]; updatedAt: number } {
  const db = getAgentDB()
  const row = db.prepare('SELECT data, updated_at FROM city_pois WHERE city_id = ?').get(cityId) as { data: string; updated_at: number } | undefined
  if (!row) return { pois: [], updatedAt: 0 }
  try {
    return { pois: JSON.parse(row.data).map(mapAgentPOI), updatedAt: row.updated_at }
  } catch {
    return { pois: [], updatedAt: 0 }
  }
}

/** Load all POIs across all cities from Agent DB */
function loadAllPOIs() {
  const db = getAgentDB()
  const rows = db.prepare('SELECT city_id, data, updated_at FROM city_pois').all() as { city_id: string; data: string; updated_at: number }[]
  const all: any[] = []
  for (const row of rows) {
    try {
      const pois: any[] = JSON.parse(row.data).map(mapAgentPOI)
      all.push(...pois.map((p: any) => ({ ...p, _cityId: row.city_id })))
    } catch {}
  }
  return all
}

/** Get all city stats from Agent DB */
function getAllStats() {
  const db = getAgentDB()
  return db.prepare('SELECT * FROM city_stats ORDER BY last_collection_at DESC').all() as any[]
}

/* ── Search scoring ── */

function scorePOI(poi: any, query: string): number {
  const q = query.toLowerCase()
  const name = (poi.name || '').toLowerCase()
  const nameZh = poi.nameZh || ''

  // Exact match on English or Chinese name
  if (name === q || nameZh === query) return 100
  // Prefix match on either name
  if (name.startsWith(q) || nameZh.startsWith(query)) return 70
  if (Array.isArray(poi.aliases) && poi.aliases.some((a: string) => a.toLowerCase() === q || a === query)) return 60
  // Contains match on either name
  if (name.includes(q) || nameZh.includes(query)) return 40
  if (Array.isArray(poi.aliases) && poi.aliases.some((a: string) => a.toLowerCase().includes(q) || a.includes(query))) return 35
  if (poi.address?.toLowerCase().includes(q) || poi.address?.includes(query)) return 30
  if (poi.categoryL2?.toLowerCase().includes(q) || poi.categoryL2?.includes(query)
    || poi.categoryL3?.toLowerCase().includes(q) || poi.categoryL3?.includes(query)) return 25
  if (Array.isArray(poi.tags) && poi.tags.some((t: string) => t.toLowerCase().includes(q) || t.includes(query))) return 25
  if (poi.description?.toLowerCase().includes(q) || poi.description?.includes(query)) return 20

  return 0
}

/* ═══════════════════════ Stats ═══════════════════════ */

router.get('/stats', (_req: Request, res: Response) => {
  const stats = getAllStats()
  const registry = loadCityRegistry()

  let totalPOIs = 0
  let lastUpdate: number | null = null
  const freshness = { fresh: 0, recent: 0, aging: 0, stale: 0, expired: 0 }
  const now = Date.now()

  // Count pending review (cities with Agent data not yet in Server DB)
  let pendingReviewCities = 0
  let pendingReviewPOIs = 0
  const agentDB = getAgentDB()
  const agentCities = agentDB.prepare('SELECT city_id, data FROM city_pois').all() as
    { city_id: string; data: string }[]

  for (const s of stats) {
    totalPOIs += s.total_pois || 0
    if (s.last_collection_at) {
      const ageDays = (now - s.last_collection_at) / (1000 * 60 * 60 * 24)
      if (ageDays <= 3) freshness.fresh++
      else if (ageDays <= 7) freshness.recent++
      else if (ageDays <= 14) freshness.aging++
      else if (ageDays <= 30) freshness.stale++
      else freshness.expired++
      if (!lastUpdate || s.last_collection_at > lastUpdate) lastUpdate = s.last_collection_at
    }
  }

  for (const ac of agentCities) {
    const agentPOIs = JSON.parse(ac.data) as any[]
    const { pois: serverPOIs } = loadServerPOIs(ac.city_id)
    const { newPOIs, updatedPOIs } = comparePOIs(agentPOIs, serverPOIs)
    const pending = newPOIs.length + updatedPOIs.length
    if (pending > 0) {
      pendingReviewCities++
      pendingReviewPOIs += pending
    }
  }

  res.json({
    success: true,
    data: {
      totalPOIs,
      totalCities: registry.length,
      categories: 6,
      lastUpdate,
      freshness,
      pendingReviewCities,
      pendingReviewPOIs,
    },
  })
})

/* ═══════════════════════ Cities ═══════════════════════ */

router.get('/cities', (_req: Request, res: Response) => {
  const registry = loadCityRegistry()
  const coords = loadCityCoords()
  const stats = getAllStats()

  // Build city stats map from Agent DB
  const dbCityMap = new Map(stats.map((s: any) => [s.city_id, {
    count: s.total_pois || 0,
    updatedAt: s.last_collection_at,
  }]))

  // Merge: all registry cities + any DB cities not in registry
  const registryIds = new Set(registry.map((c) => c.id))
  const cities = registry.map((c) => {
    const coord = coords[c.id]
    const dbInfo = dbCityMap.get(c.id)
    return {
      id: c.id,
      name: c.name,
      nameEn: c.nameEn,
      country: coord?.country || '',
      lat: coord?.lat || 0,
      lng: coord?.lng || 0,
      poiCount: dbInfo?.count || 0,
      lastUpdated: dbInfo?.updatedAt,
    }
  })

  // Add DB cities not in registry
  for (const [cityId, info] of dbCityMap) {
    if (!registryIds.has(cityId)) {
      const coord = coords[cityId]
      cities.push({
        id: cityId,
        name: cityId,
        nameEn: cityId,
        country: coord?.country || '',
        lat: coord?.lat || 0,
        lng: coord?.lng || 0,
        poiCount: info.count,
        lastUpdated: info.updatedAt,
      })
    }
  }

  // Sort: cities with data first, then by name
  cities.sort((a, b) => {
    if (a.poiCount > 0 && b.poiCount === 0) return -1
    if (a.poiCount === 0 && b.poiCount > 0) return 1
    return a.name.localeCompare(b.name)
  })

  res.json({ success: true, data: cities })
})

router.post('/cities', (req: Request, res: Response) => {
  const { id, name, nameEn, country, lat, lng } = req.body
  if (!id || !name || !country) {
    return res.status(400).json({ success: false, error: 'MISSING_FIELDS', message: '城市 ID、名称和国家不能为空' })
  }

  const registry = loadCityRegistry()
  if (registry.some((c) => c.id === id)) {
    return res.status(409).json({ success: false, error: 'DUPLICATE', message: `城市 ${id} 已存在` })
  }

  registry.push({ id, name, nameEn: nameEn || name, hotness: 0 })
  saveCityRegistry(registry)

  const coords = loadCityCoords()
  coords[id] = { lat: lat || 0, lng: lng || 0, isDomestic: true, country }
  fs.writeFileSync(CITY_COORDS_PATH, JSON.stringify(coords, null, 2), 'utf-8')

  res.json({ success: true, data: { id, name, nameEn, country, lat, lng } })
})

router.put('/cities/:id', (req: Request, res: Response) => {
  const id = req.params.id as string
  const { name, nameEn, country, lat, lng } = req.body

  const registry = loadCityRegistry()
  const idx = registry.findIndex((c) => c.id === id)
  if (idx === -1) return res.status(404).json({ success: false, error: 'NOT_FOUND' })

  if (name) registry[idx].name = name
  if (nameEn) registry[idx].nameEn = nameEn
  saveCityRegistry(registry)

  if (country || lat !== undefined || lng !== undefined) {
    const coords = loadCityCoords()
    const existing = coords[id]
    coords[id] = {
      ...existing,
      country: country || existing?.country,
      lat: lat ?? existing?.lat ?? 0,
      lng: lng ?? existing?.lng ?? 0,
      isDomestic: existing?.isDomestic ?? true,
    }
    fs.writeFileSync(CITY_COORDS_PATH, JSON.stringify(coords, null, 2), 'utf-8')
  }

  res.json({ success: true })
})

router.delete('/cities/:id', (req: Request, res: Response) => {
  const id = req.params.id as string
  const registry = loadCityRegistry()
  const filtered = registry.filter((c) => c.id !== id)
  if (filtered.length === registry.length) {
    return res.status(404).json({ success: false, error: 'NOT_FOUND' })
  }
  saveCityRegistry(filtered)

  const coords = loadCityCoords()
  if (coords[id]) {
    delete coords[id]
    fs.writeFileSync(CITY_COORDS_PATH, JSON.stringify(coords, null, 2), 'utf-8')
  }

  res.json({ success: true })
})

/* ═══════════════════════ Categories ═══════════════════════ */

router.get('/categories', (_req: Request, res: Response) => {
  res.json({ success: true, data: loadCategoryTree() })
})

/** Attach reviewStatus to an array of POIs (must have _cityId) */
function attachReviewStatus(pois: any[]): any[] {
  // Group by city
  const cityGroups = new Map<string, any[]>()
  for (const poi of pois) {
    const cid = poi._cityId || poi.cityId || ''
    if (!cityGroups.has(cid)) cityGroups.set(cid, [])
    cityGroups.get(cid)!.push(poi)
  }
  // Load server POIs per city and classify
  const result: any[] = []
  for (const [cityId, cityPOIs] of cityGroups) {
    const { pois: serverPOIs } = loadServerPOIs(cityId)
    const serverMap = new Map(serverPOIs.map((p: any) => [p.id, p]))
    for (const poi of cityPOIs) {
      const serverPOI = serverMap.get(poi.id)
      let status: 'new' | 'updated' | 'published' = 'new'
      if (serverPOI) {
        // Compare mapped fields (exclude internal _cityId)
        const { _cityId: _, ...agentClean } = poi
        const agentStr = JSON.stringify(agentClean)
        const serverStr = JSON.stringify(serverPOI)
        status = agentStr !== serverStr ? 'updated' : 'published'
      }
      result.push({ ...poi, reviewStatus: status })
    }
  }
  return result
}

/* ═══════════════════════ POI List ═══════════════════════ */

router.get('/pois', (req: Request, res: Response) => {
  const { city, l1, l2, l3, page = '1', pageSize = '20', scoreMin, scoreMax, scoreGrade } = req.query
  const pageNum = Math.max(1, Number(page))
  const size = Math.min(50, Math.max(1, Number(pageSize)))

  let allPOIs: any[]

  if (city) {
    const { pois } = loadPOIsForCity(city as string)
    allPOIs = pois.map((p: any) => ({ ...p, _cityId: city as string }))
  } else {
    allPOIs = loadAllPOIs()
  }

  if (l1) allPOIs = allPOIs.filter((p) => p.categoryL1 === l1)
  if (l2) allPOIs = allPOIs.filter((p) => p.categoryL2 === l2)
  if (l3) allPOIs = allPOIs.filter((p) => p.categoryL3 === l3)

  // Score filtering
  if (scoreGrade) {
    const range = SCORE_GRADE_RANGES[scoreGrade as string]
    if (range) {
      allPOIs = allPOIs.filter((p) => {
        const s = p.score?.total
        return s != null && s >= range.min && s <= range.max
      })
    }
  } else {
    if (scoreMin != null) {
      const min = Number(scoreMin)
      allPOIs = allPOIs.filter((p) => (p.score?.total ?? -1) >= min)
    }
    if (scoreMax != null) {
      const max = Number(scoreMax)
      allPOIs = allPOIs.filter((p) => (p.score?.total ?? 101) <= max)
    }
  }

  const total = allPOIs.length
  const start = (pageNum - 1) * size
  const pageData = attachReviewStatus(allPOIs.slice(start, start + size))

  res.json({ success: true, data: pageData, total, page: pageNum, pageSize: size })
})

/* ═══════════════════════ POI Search ═══════════════════════ */

router.get('/pois/search', (req: Request, res: Response) => {
  const { q, city, l1, page = '1', pageSize = '20' } = req.query
  const pageNum = Math.max(1, Number(page))
  const size = Math.min(50, Math.max(1, Number(pageSize)))
  const query = (q as string || '').trim()

  if (!query) {
    return res.json({ success: true, data: [], total: 0 })
  }

  let allPOIs: any[]

  if (city) {
    const { pois } = loadPOIsForCity(city as string)
    allPOIs = pois.map((p: any) => ({ ...p, _cityId: city as string }))
  } else {
    allPOIs = loadAllPOIs()
  }

  if (l1) allPOIs = allPOIs.filter((p) => p.categoryL1 === l1)

  const scored = allPOIs
    .map((p) => ({ poi: p, score: scorePOI(p, query) }))
    .filter((s) => s.score >= 20)
    .sort((a, b) => b.score - a.score)

  const total = scored.length
  const start = (pageNum - 1) * size
  const pageData = attachReviewStatus(scored.slice(start, start + size).map((s) => s.poi))

  res.json({ success: true, data: pageData, total, page: pageNum, pageSize: size })
})

/* ═══════════════════════ POI Detail ═══════════════════════ */

router.get('/pois/:id', (req: Request, res: Response) => {
  const id = req.params.id as string
  const { city } = req.query

  let foundPOI: any = null
  let foundCityId = ''
  let cityUpdatedAt = 0

  // Determine which cities to search
  let citiesToSearch: string[]
  if (city) {
    citiesToSearch = [city as string]
  } else {
    citiesToSearch = (getAgentDB().prepare('SELECT city_id FROM city_pois').all() as { city_id: string }[])
      .map((r) => r.city_id)
  }

  for (const cityId of citiesToSearch) {
    const { pois, updatedAt } = loadPOIsForCity(cityId)
    const match = pois.find((p) => p.id === id)
    if (match) {
      foundPOI = match
      foundCityId = cityId
      cityUpdatedAt = updatedAt
      break
    }
  }

  if (!foundPOI) {
    return res.status(404).json({ success: false, error: 'NOT_FOUND' })
  }

  // Compute review status for this POI
  const { pois: serverPOIs } = loadServerPOIs(foundCityId)
  const serverPOI = serverPOIs.find((p: any) => p.id === foundPOI.id)
  let reviewStatus: 'new' | 'updated' | 'published' = 'new'
  if (serverPOI) {
    reviewStatus = JSON.stringify(foundPOI) !== JSON.stringify(serverPOI) ? 'updated' : 'published'
  }

  const registry = loadCityRegistry()
  const cityRecord = registry.find((c) => c.id === foundCityId)

  res.json({
    success: true,
    data: {
      ...foundPOI,
      cityId: foundCityId,
      cityName: cityRecord?.name || foundCityId,
      createdAt: cityUpdatedAt,
      reviewStatus,
      serverVersion: serverPOI || null,
    },
  })
})

/* ═══════════════════════ Update Jobs ═══════════════════════ */

interface JobRecord {
  id: number; type: 'batch' | 'targeted'; status: string;
  config: Record<string, unknown>; progress?: { current: number; total: number; message: string };
  result?: unknown; error?: string; pid?: number;
  created_at: number; started_at?: number; completed_at?: number;
}

const jobs: JobRecord[] = []
let nextJobId = 1

function createJob(type: 'batch' | 'targeted', config: Record<string, unknown>): JobRecord {
  const job: JobRecord = {
    id: nextJobId++, type, status: 'pending', config,
    created_at: Date.now(),
  }
  jobs.unshift(job)
  return job
}

function executeAgentCLI(job: JobRecord, args: string[]) {
  job.status = 'running'
  job.started_at = Date.now()

  const cwd = path.join(__dirname, '..')
  const child = spawn('npx', ['tsx', 'agent/index.ts', ...args], {
    cwd,
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  job.pid = child.pid
  let step = 0

  child.stdout?.on('data', (data: Buffer) => {
    const lines = data.toString().split('\n').filter(Boolean)
    for (const line of lines) {
      const progressMatch = line.match(/\[PROGRESS]\s*(\d+)\/(\d+)\s*(.*)/)
      if (progressMatch) {
        job.progress = { current: parseInt(progressMatch[1]), total: parseInt(progressMatch[2]), message: progressMatch[3] }
      } else if (line.includes('Collecting') || line.includes('Merging') || line.includes('Done')) {
        step++
        job.progress = { current: step, total: 10, message: line.trim() }
      }
    }
  })

  child.stderr?.on('data', (data: Buffer) => {
    const msg = data.toString().trim()
    if (msg) job.progress = { current: step, total: 10, message: msg.slice(0, 200) }
  })

  child.on('close', (code) => {
    job.completed_at = Date.now()
    if (code === 0) {
      job.status = 'completed'
      job.progress = { current: 1, total: 1, message: '完成' }
      job.result = { exitCode: code }
    } else {
      job.status = 'failed'
      job.error = `Process exited with code ${code}`
    }
  })

  child.on('error', (err) => {
    job.status = 'failed'
    job.error = err.message
    job.completed_at = Date.now()
  })
}

router.post('/updates/batch', (req: Request, res: Response) => {
  const { country, city, l1 } = req.body
  const job = createJob('batch', { country, city, l1 })
  const args = ['collect']
  if (city) args.push('--city', city)
  setTimeout(() => executeAgentCLI(job, args), 100)
  res.json({ success: true, data: { jobId: job.id } })
})

router.post('/updates/targeted', (req: Request, res: Response) => {
  const { poiId, cityId } = req.body
  if (!cityId) {
    return res.status(400).json({ success: false, error: 'MISSING_CITY', message: '需要指定城市 ID' })
  }
  const job = createJob('targeted', { poiId, cityId })
  const args = ['collect', '--city', cityId]
  setTimeout(() => executeAgentCLI(job, args), 100)
  res.json({ success: true, data: { jobId: job.id } })
})

router.get('/updates', (req: Request, res: Response) => {
  const limit = Math.min(100, Number(req.query.limit) || 50)
  res.json({ success: true, data: jobs.slice(0, limit) })
})

router.get('/updates/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id as string)
  const job = jobs.find((j) => j.id === id)
  if (!job) return res.status(404).json({ success: false, error: 'NOT_FOUND' })
  res.json({ success: true, data: job })
})

/* ═══════════════════════ Review & Publish ═══════════════════════ */

/** GET /review/summary — City-level review overview */
router.get('/review/summary', (_req: Request, res: Response) => {
  const db = getAgentDB()
  const registry = loadCityRegistry()
  const coords = loadCityCoords()

  // Get all cities with data in Agent DB
  const agentCities = db.prepare('SELECT city_id, data, updated_at FROM city_pois').all() as
    { city_id: string; data: string; updated_at: number }[]

  const cities: any[] = []
  let totalNew = 0
  let totalUpdated = 0

  for (const ac of agentCities) {
    const agentPOIs = JSON.parse(ac.data) as any[]
    const { pois: serverPOIs } = loadServerPOIs(ac.city_id)
    const { newPOIs, updatedPOIs, publishedPOIs } = comparePOIs(agentPOIs, serverPOIs)

    const cityRecord = registry.find((c) => c.id === ac.city_id)
    const coord = coords[ac.city_id]

    cities.push({
      cityId: ac.city_id,
      cityName: cityRecord?.name || ac.city_id,
      country: coord?.country || '',
      totalAgentPOIs: agentPOIs.length,
      totalServerPOIs: serverPOIs.length,
      newCount: newPOIs.length,
      updatedCount: updatedPOIs.length,
      publishedCount: publishedPOIs.length,
      agentUpdatedAt: ac.updated_at,
      serverUpdatedAt: null,
      avgScore: computeAvgScore(agentPOIs),
    })
    totalNew += newPOIs.length
    totalUpdated += updatedPOIs.length
  }

  // Sort: cities with pending changes first
  cities.sort((a, b) => {
    const aPending = a.newCount + a.updatedCount
    const bPending = b.newCount + b.updatedCount
    if (aPending > 0 && bPending === 0) return -1
    if (aPending === 0 && bPending > 0) return 1
    return a.cityName.localeCompare(b.cityName)
  })

  res.json({
    success: true,
    data: {
      cities,
      totals: { newPOIs: totalNew, updatedPOIs: totalUpdated, totalPending: totalNew + totalUpdated },
    },
  })
})

/** GET /review/city/:cityId — POI-level review detail for a city */
router.get('/review/city/:cityId', (req: Request, res: Response) => {
  const cityId = req.params.cityId as string
  const registry = loadCityRegistry()
  const cityRecord = registry.find((c) => c.id === cityId)

  const { pois: agentPOIs } = loadPOIsForCity(cityId)
  const { pois: serverPOIs } = loadServerPOIs(cityId)
  const { newPOIs, updatedPOIs, publishedPOIs } = comparePOIs(agentPOIs, serverPOIs)

  const pois = [...newPOIs, ...updatedPOIs, ...publishedPOIs].map((p) => ({
    ...p,
    cityId,
    cityName: cityRecord?.name || cityId,
  }))

  res.json({
    success: true,
    data: {
      cityId,
      cityName: cityRecord?.name || cityId,
      pois,
      summary: {
        new: newPOIs.length,
        updated: updatedPOIs.length,
        published: publishedPOIs.length,
        total: pois.length,
      },
    },
  })
})

/** POST /publish/city — Publish all POIs for a city */
router.post('/publish/city', (req: Request, res: Response) => {
  const { cityId } = req.body
  if (!cityId) {
    return res.status(400).json({ success: false, error: 'MISSING_CITY', message: '需要指定城市 ID' })
  }
  const db = getAgentDB()

  const row = db.prepare('SELECT data FROM city_pois WHERE city_id = ?').get(cityId) as { data: string } | undefined
  if (!row) {
    return res.status(404).json({ success: false, error: 'NOT_FOUND', message: `Agent DB 中未找到城市 ${cityId}` })
  }

  const agentPOIs = JSON.parse(row.data) as any[]
  if (agentPOIs.length === 0) {
    return res.status(400).json({ success: false, error: 'EMPTY', message: '该城市没有 POI 数据' })
  }

  // Publish to Server DB
  serverUpsertPOIs(cityId, agentPOIs)

  // Validate
  const { pois: serverPOIs } = loadServerPOIs(cityId)
  const validationPassed = serverPOIs.length === agentPOIs.length

  res.json({
    success: true,
    data: {
      cityId,
      publishedCount: agentPOIs.length,
      totalServerPOIs: serverPOIs.length,
      validationPassed,
      validationMessage: validationPassed
        ? `成功发布 ${agentPOIs.length} 个 POI`
        : `发布数量不匹配: 期望 ${agentPOIs.length}, 实际 ${serverPOIs.length}`,
    },
  })
})

/** POST /publish/pois — Publish specific POIs */
router.post('/publish/pois', (req: Request, res: Response) => {
  const { cityId, poiIds } = req.body
  if (!cityId || !Array.isArray(poiIds) || poiIds.length === 0) {
    return res.status(400).json({ success: false, error: 'INVALID', message: '需要指定城市 ID 和 POI ID 列表' })
  }
  const db = getAgentDB()

  const row = db.prepare('SELECT data FROM city_pois WHERE city_id = ?').get(cityId) as { data: string } | undefined
  if (!row) {
    return res.status(404).json({ success: false, error: 'NOT_FOUND' })
  }

  const agentPOIs = JSON.parse(row.data) as any[]
  const poisToMerge = agentPOIs.filter((p: any) => poiIds.includes(p.id))

  if (poisToMerge.length === 0) {
    return res.status(404).json({ success: false, error: 'POI_NOT_FOUND', message: '指定的 POI 在 Agent DB 中不存在' })
  }

  const publishedCount = mergePOIsIntoServer(cityId, poisToMerge)
  const { pois: serverPOIs } = loadServerPOIs(cityId)

  // Validate: check all published POI IDs exist in server
  const serverIds = new Set(serverPOIs.map((p: any) => p.id))
  const allPresent = poiIds.every((id: string) => serverIds.has(id))

  res.json({
    success: true,
    data: {
      cityId,
      publishedCount,
      totalServerPOIs: serverPOIs.length,
      validationPassed: allPresent,
      validationMessage: allPresent
        ? `成功发布 ${publishedCount} 个 POI`
        : '部分 POI 未成功写入',
    },
  })
})

/** POST /publish/pois-by-score — Publish POIs filtered by score */
router.post('/publish/pois-by-score', (req: Request, res: Response) => {
  const { cityId, scoreMin, scoreMax, scoreGrades } = req.body
  if (!cityId) {
    return res.status(400).json({ success: false, error: 'MISSING_CITY', message: '需要指定城市 ID' })
  }

  // Determine score range from grades or explicit min/max
  let effectiveMin: number | undefined = scoreMin != null ? Number(scoreMin) : undefined
  let effectiveMax: number | undefined = scoreMax != null ? Number(scoreMax) : undefined

  if (Array.isArray(scoreGrades) && scoreGrades.length > 0) {
    // Expand grades to min/max range
    let gMin = 100, gMax = 0
    for (const grade of scoreGrades) {
      const range = SCORE_GRADE_RANGES[grade]
      if (range) {
        gMin = Math.min(gMin, range.min)
        gMax = Math.max(gMax, range.max)
      }
    }
    if (effectiveMin == null) effectiveMin = gMin
    if (effectiveMax == null) effectiveMax = gMax
  }

  const db = getAgentDB()
  const row = db.prepare('SELECT data FROM city_pois WHERE city_id = ?').get(cityId) as { data: string } | undefined
  if (!row) {
    return res.status(404).json({ success: false, error: 'NOT_FOUND', message: `Agent DB 中未找到城市 ${cityId}` })
  }

  const agentPOIs = JSON.parse(row.data) as any[]
  const poisToMerge = agentPOIs.filter((p: any) => {
    const s = p.score?.total
    if (s == null) return false
    if (effectiveMin != null && s < effectiveMin) return false
    if (effectiveMax != null && s > effectiveMax) return false
    return true
  })

  if (poisToMerge.length === 0) {
    return res.status(400).json({ success: false, error: 'NO_MATCH', message: '没有符合评分条件的 POI' })
  }

  const publishedCount = mergePOIsIntoServer(cityId, poisToMerge)
  const { pois: serverPOIs } = loadServerPOIs(cityId)
  const serverIds = new Set(serverPOIs.map((p: any) => p.id))
  const allPresent = poisToMerge.every((p: any) => serverIds.has(p.id))

  res.json({
    success: true,
    data: {
      cityId,
      publishedCount,
      totalServerPOIs: serverPOIs.length,
      validationPassed: allPresent,
      validationMessage: allPresent
        ? `成功发布 ${publishedCount} 个 POI (评分 ${effectiveMin ?? 0}-${effectiveMax ?? 100})`
        : '部分 POI 未成功写入',
    },
  })
})

/** GET /publish/validate/:cityId — Post-publish validation */
router.get('/publish/validate/:cityId', (req: Request, res: Response) => {
  const cityId = req.params.cityId as string
  const db = getAgentDB()

  const row = db.prepare('SELECT data FROM city_pois WHERE city_id = ?').get(cityId) as { data: string } | undefined
  const agentPOIs: any[] = row ? JSON.parse(row.data) : []
  const { pois: serverPOIs } = loadServerPOIs(cityId)

  const serverIds = new Set(serverPOIs.map((p: any) => p.id))
  const missingIds = agentPOIs.filter((p: any) => !serverIds.has(p.id)).map((p: any) => p.id)

  // Basic data quality checks
  const issues: string[] = []
  for (const poi of serverPOIs) {
    if (!poi.name && !poi.namePrimary) issues.push(`POI ${poi.id} 缺少名称`)
    if (!poi.lat || !poi.lng || (poi.lat === 0 && poi.lng === 0)) issues.push(`POI ${poi.id} 坐标无效`)
  }
  if (missingIds.length > 0) issues.push(`${missingIds.length} 个 POI 未同步: ${missingIds.slice(0, 5).join(', ')}...`)

  res.json({
    success: true,
    data: {
      cityId,
      serverPOICount: serverPOIs.length,
      agentPOICount: agentPOIs.length,
      allPOIsSynced: missingIds.length === 0,
      issues,
    },
  })
})

export default router
