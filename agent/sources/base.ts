/**
 * agent/sources/base.ts — 数据源采集器统一接口 & POI 数据模型
 *
 * 6 大一级类目 (L1Category) + 三级类目体系 (categories.ts)
 * 三名系统 / 双语地址 / 月度指数 / 最佳季节
 */

import { type L1Category, L1_LABELS } from '../categories.js'

export type { L1Category }

/* ── CityInfo (采集器使用的城市信息) ── */

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

/* ── 体验类目项目描述 ── */

export interface ExperienceItem {
  /** 项目名称，如"皮划艇""陶艺体验""晨间太极课" */
  name: string
  /** 项目简介（1-2句），说明内容、特色或适合人群 */
  summary: string
  /** 时长（分钟），0 表示未知 */
  durationMinutes?: number
  /** 人均费用（当地货币），0 表示免费或未知 */
  pricePerPerson?: number
}

/* ── 采集器返回的原始 POI 数据 ── */

export interface RawPOI {
  /** 主名称 (中文优先，无则当地语言) */
  namePrimary: string
  /** 当地语言别名 (日文/韩文等；国内城市与主名称相同时留空) */
  nameZh: string
  /** 英文别名 (无则空串) */
  nameEn: string

  /** 一级类目 */
  categoryL1: L1Category
  /** 三级类目 ID (如 'scenic.natural.beach')，决定二级 */
  categoryL3: string

  /** 纬度 (WGS-84, 4 位小数) */
  lat: number
  /** 经度 (WGS-84, 4 位小数) */
  lng: number

  /** 本地语言地址 */
  address: string
  /** 英文地址 */
  addressEn: string

  /** 评分 1-5 */
  rating?: number
  /** 人均费用 (当地货币, ≥0) */
  cost?: number
  /** 建议游览时长 (分钟) */
  visitDuration?: number
  /** 简介 */
  description?: string
  /** 标签 */
  tags?: string[]

  /** 营业时间 (人类可读, 如 '09:00-22:00 周一至周日') */
  operatingHours?: string
  /** 最佳游览季节 */
  bestSeasons?: string[]
  /** 1-12 月推荐指数 (0-5) */
  monthlyIndex?: number[]

  /** 数据来源标识 */
  source: string
  /** 来源原始 ID */
  sourceId?: string
  /** 知名度标识 (1=有 wikidata/wikipedia 引用, 0=无) */
  popularity?: number
}

/* ── 数据源采集器接口 ── */

export interface SourceCollector {
  /** 数据源名称 */
  readonly name: string

  /** 检测该数据源是否可用 (API Key 配置等) */
  isAvailable(): Promise<boolean>

  /** 采集指定城市的 POI 数据 */
  collect(city: CityInfo, categories: L1Category[]): Promise<RawPOI[]>
}

/* ── POI 数据评分 ── */

export interface POIScore {
  /** 综合得分 0-100 */
  total: number
  /** 完整度 0-100 */
  completeness: number
  /** 置信度 0-100 */
  confidence: number
  /** 数据来源数量 */
  sourceCount: number
  /** 来源名称列表 */
  sources: string[]
  /** 冲突字段数 */
  conflictCount: number
}

/* ── 网站 POI 最终格式 ── */

export interface POI {
  /** 唯一标识: {source}-{cityId}-{seq} */
  id: string

  /** 主名称 (中文优先) */
  namePrimary: string
  /** 当地语言别名 (日文/韩文等) */
  nameZh: string
  /** 英文别名 */
  nameEn: string

  /** 一级类目 */
  categoryL1: L1Category
  /** 二级类目 ID */
  categoryL2: string
  /** 三级类目 ID */
  categoryL3: string

  /** 图片 URL */
  image: string
  /** 评分 1-5 */
  rating: number
  /** 人均费用 */
  cost: number
  /** 建议游览时长 (分钟) */
  visitDuration: number
  /** 简介 */
  description: string

  /** 本地语言地址 */
  address: string
  /** 英文地址 */
  addressEn: string

  /** 纬度 WGS-84 (4 位小数) */
  lat: number
  /** 经度 WGS-84 (4 位小数) */
  lng: number

  /** 标签 */
  tags: string[]
  /** 营业时间 */
  operatingHours: string
  /** 推荐理由 */
  recommendReason: string

  /** 体验类目专属：可参与的体验项目列表（categoryL1=experience 时填充） */
  experienceItems?: ExperienceItem[]

  /** 最佳游览季节 */
  bestSeasons: string[]
  /** 1-12 月推荐指数 (0-5 星) */
  monthlyIndex: number[]

  /** 数据质量评分 (合并时计算) */
  score?: POIScore

  /** 距离市中心直线距离 (km, 仅 hotel 类目) */
  distanceFromCenter?: number
  /** 行政区/县名 (从地址解析, 仅 hotel 类目) */
  district?: string
}

/* ── Unsplash 图片 URL (6 大类目) ── */

const categoryImageSets: Record<L1Category, string[]> = {
  scenic: [
    'photo-1493976040374-85c8e12f0c0e', 'photo-1506748686214-e9df14d4d9d0',
    'photo-1533929736458-ca588d08c8be', 'photo-1518548419970-58e3b4079ab2',
    'photo-1523731407965-2430cd12f5e4', 'photo-1476514525535-07fb3b4ae5f1',
    'photo-1502602898657-3e91760cbb34', 'photo-1467269204594-9661b134dd2b',
    'photo-1520250497591-112f2f40a3f4', 'photo-1540959733332-eab4deabeeaf',
  ],
  food: [
    'photo-1504674900247-0877df9cc836', 'photo-1414235077428-338989a2e8c0',
    'photo-1476224203421-9ac39bcb3327', 'photo-1555396273-367ea4eb4db5',
    'photo-1567620905732-2d1ec7ab7445', 'photo-1540189549336-e6e99c3679fe',
    'photo-1565299624946-b28f40a0ae38', 'photo-1482049016688-2d3e1b311543',
    'photo-1529692236671-f1f6cf9683ba', 'photo-1551218808-94e220e084d2',
  ],
  shopping: [
    'photo-1441986300917-64674bd600d8', 'photo-1555529669-e69e7aa0ba9a',
    'photo-1472851294608-062f824d29cc', 'photo-1556742049-0cfed4f6a45d',
    'photo-1534452203293-494d7ddbf7e0', 'photo-1555529771-835f59fc5efe',
    'photo-1481437156560-3205f6a55acc', 'photo-1519420573924-65fcd45245f8',
    'photo-1445205170230-053b83016050', 'photo-1556742502-ec7c0e9f34b1',
  ],
  entertainment: [
    'photo-1533174072545-7a4b6ad7a6c3', 'photo-1506197603052-3cc9c3a201bd',
    'photo-1527631746610-bca00a040d60', 'photo-1551632811-561732d1e306',
    'photo-1544551763-46a013bb70d5', 'photo-1530521954074-e64f6810b32d',
    'photo-1519671482749-fd09be7ccebf', 'photo-1517457373958-b7bdd4587205',
    'photo-1492684223066-81342ee5ff30', 'photo-1499363536502-87642509e7b8',
  ],
  experience: [
    'photo-1551632811-561732d1e306', 'photo-1544551763-46a013bb70d5',
    'photo-1530521954074-e64f6810b32d', 'photo-1527631746610-bca00a040d60',
    'photo-1506197603052-3cc9c3a201bd', 'photo-1533174072545-7a4b6ad7a6c3',
    'photo-1519671482749-fd09be7ccebf', 'photo-1517457373958-b7bdd4587205',
    'photo-1492684223066-81342ee5ff30', 'photo-1499363536502-87642509e7b8',
  ],
  hotel: [
    'photo-1566073771259-6a8506099945', 'photo-1582719508461-905c673771fd',
    'photo-1571896349842-33c89424de2d', 'photo-1520250497591-112f2f40a3f4',
    'photo-1564501049412-61c2a3083791', 'photo-1551882547-ff40c63fe5fa',
    'photo-1542314831-068cd1dbfeeb', 'photo-1455587734955-081b22074882',
    'photo-1578683010236-d716f9a3f461', 'photo-1596394516093-501ba68a0ba6',
  ],
}

export function getImageUrl(category: L1Category, index: number): string {
  const set = categoryImageSets[category] || categoryImageSets.scenic
  const photoId = set[index % set.length]
  return `https://images.unsplash.com/${photoId}?w=400&h=300&fit=crop`
}

/* ── 当前季节 ── */

export function getCurrentSeason(): string {
  const m = new Date().getMonth() + 1
  if (m >= 3 && m <= 5) return 'spring'
  if (m >= 6 && m <= 8) return 'summer'
  if (m >= 9 && m <= 11) return 'autumn'
  return 'winter'
}

/* ── 坐标精度工具 ── */

/** 将坐标四舍五入到 4 位小数 */
export function roundCoord(val: number): number {
  return Math.round(val * 10000) / 10000
}

/* ── L1 类目标签 (便捷导出) ── */

export { L1_LABELS }
