/**
 * agent/config.ts — Agent 配置加载
 *
 * 从 .env.local 加载 API Keys 和运行参数。
 * 未配置的数据源自动跳过。
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// 加载项目根目录的 .env.local
dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

/* ── API Keys ── */

export const API_KEYS = {
  dashscope: process.env.VITE_DASHSCOPE_API_KEY || process.env.DASHSCOPE_API_KEY || '',
  foursquare: process.env.FOURSQUARE_API_KEY || '',
  google: process.env.GOOGLE_PLACES_API_KEY || '',
  amap: process.env.AMAP_API_KEY || '',
  sparkApiKey: process.env.SPARK_API_KEY || '',
  sparkApiSecret: process.env.SPARK_API_SECRET || '',
  doubaoApiKey: process.env.DOUBAO_API_KEY || '',
}

/* ── Agent 运行参数 ── */

export const AGENT_CONFIG = {
  concurrentCities: Number(process.env.AGENT_CONCURRENT_CITIES) || 3,
  exportPath: process.env.AGENT_EXPORT_PATH || path.join(__dirname, '..', 'data-sync', 'cache-export.json'),
  dbPath: path.join(__dirname, 'data', 'agent.db'),

  // 数据源超时 (毫秒)
  osmTimeout: 180_000,
  foursquareTimeout: 30_000,
  googleTimeout: 30_000,
  amapTimeout: 30_000,
  aiTimeout: 300_000,

  // 速率限制 (毫秒间隔)
  osmInterval: 10_000,       // Overpass 公平使用: 10s
  foursquareInterval: 1_000, // 1 req/s
  googleInterval: 500,       // 2 req/s
  amapInterval: 1000,        // 1 req/s (个人账号 QPS=5, 并发3城需保守)
  aiCategoryDelay: 3_000,    // AI 分类间延迟
  sparkCategoryDelay: 3_000, // Spark 分类间延迟
  sparkTimeout: 300_000,     // Spark 单类目超时
  doubaoCategoryDelay: 3_000, // 豆包 分类间延迟
  doubaoTimeout: 300_000,     // 豆包 单类目超时

  // 采集参数
  searchRadiusKm: 15,        // OSM 搜索半径
  maxPOIsPerCategory: 100,   // 每类别最大采集数 (合并后截取 top 100)
  targetPOIsPerCategory: 100, // 目标每类目 POI 数 (top 100)
  retryCount: 2,
  retryDelayMs: 5_000,

  // 合并参数
  mergeThreshold: 0.90,              // 综合相似度阈值
  crossCategoryMergeEnabled: true,   // 允许跨类目合并 (密切对)
  crossCategoryThreshold: 0.90,      // 跨类目合并阈值

  // 增量更新参数
  incrementalMaxCities: 50,          // 增量模式最大城市数
  incrementalMinDaysGap: 3,          // 跳过 N 天内已采集的城市
  staleThresholdDays: 30,            // 数据过期阈值
  validityCheckSampleSize: 10,       // 全量校验时抽样数

  // 来源可靠性权重
  sourceReliability: {
    osm: 3, google: 2, foursquare: 2, amap: 2, ai: 1, spark: 1, doubao: 1,
  } as Record<string, number>,
}

/* ── 数据源可用性检测 ── */

export interface SourceAvailability {
  name: string
  available: boolean
  reason?: string
}

export function getSourceAvailability(): SourceAvailability[] {
  return [
    {
      name: 'osm',
      available: true,  // 免费无需 Key
      reason: undefined,
    },
    {
      name: 'foursquare',
      available: !!API_KEYS.foursquare,
      reason: API_KEYS.foursquare ? undefined : 'FOURSQUARE_API_KEY not configured',
    },
    {
      name: 'google',
      available: !!API_KEYS.google,
      reason: API_KEYS.google ? undefined : 'GOOGLE_PLACES_API_KEY not configured',
    },
    {
      name: 'amap',
      available: !!API_KEYS.amap,
      reason: API_KEYS.amap ? undefined : 'AMAP_API_KEY not configured',
    },
    {
      name: 'qwen',
      available: !!API_KEYS.dashscope,
      reason: API_KEYS.dashscope ? undefined : 'VITE_DASHSCOPE_API_KEY not configured',
    },
    {
      name: 'spark',
      available: !!(API_KEYS.sparkApiKey && API_KEYS.sparkApiSecret),
      reason: (API_KEYS.sparkApiKey && API_KEYS.sparkApiSecret) ? undefined : 'SPARK_API_KEY or SPARK_API_SECRET not configured',
    },
    {
      name: 'doubao',
      available: !!API_KEYS.doubaoApiKey,
      reason: API_KEYS.doubaoApiKey ? undefined : 'DOUBAO_API_KEY not configured',
    },
  ]
}

/* ── 城市数据加载 ── */

export interface CityInfo {
  id: string
  name: string
  nameEn: string
  lat: number
  lng: number
  hotness: number
  isDomestic: boolean
  continent: string
  country: string
  province: string
}

let cachedCities: CityInfo[] | null = null

export function loadCities(): CityInfo[] {
  if (cachedCities) return cachedCities

  // 从 city-registry.json 加载基础信息
  const registryPath = path.join(__dirname, '..', 'scripts', 'city-registry.json')
  if (!fs.existsSync(registryPath)) {
    console.error(`City registry not found: ${registryPath}`)
    return []
  }
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'))

  // 从 city-coords.json 补充 lat/lng/isDomestic/continent/country/province
  const coordsPath = path.join(__dirname, 'data', 'city-coords.json')
  let coordsMap: Record<string, { lat: number; lng: number; isDomestic: boolean; continent: string; country: string; province: string }> = {}
  if (fs.existsSync(coordsPath)) {
    coordsMap = JSON.parse(fs.readFileSync(coordsPath, 'utf-8'))
  }

  cachedCities = registry.map((c: any) => {
    const coords = coordsMap[c.id]
    const country = coords?.country ?? c.country ?? ''
    const isDomestic = coords?.isDomestic ?? c.isDomestic ?? (country === '中国')
    return {
      id: c.id,
      name: c.name,
      nameEn: c.nameEn,
      lat: coords?.lat ?? c.lat ?? 0,
      lng: coords?.lng ?? c.lng ?? 0,
      hotness: c.hotness || 50,
      isDomestic,
      continent: coords?.continent ?? (isDomestic ? '亚洲' : ''),
      country,
      province: coords?.province ?? (isDomestic ? country : ''),
    }
  })

  return cachedCities
}
