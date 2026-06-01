/**
 * agent/similarity.ts — POI 相似度引擎
 *
 * 从 server/dedup.ts (v3) 移植核心算法，
 * 适配 Agent 的 RawPOI 数据模型 (6 L1 类目, 三名系统, 双语地址)。
 *
 * 导出函数:
 *   stringSimilarity, geoSimilarity, contentSimilarity,
 *   nameSimilarity, addressSimilarity, compositeSimilarity,
 *   isInvalidPOI
 */

import type { RawPOI, L1Category } from './sources/base.js'

/* ═══════════════════════ Types ═══════════════════════ */

export interface CompositeResult {
  /** 最终相似度得分 (0-1) */
  score: number
  /** 触发的决策路径 */
  path:
    | 'same-type-perfect'
    | 'same-type-perfect-low-content'
    | 'same-type-high'
    | 'cross-related'
    | 'cross-related-fail'
    | 'cross-unrelated'
    | 'cross-unrelated-fail'
    | 'regular'
  /** 各维度得分 (用于调试日志) */
  details: {
    nameSim: number
    addrSim: number
    geoSim: number
    contentSim: number
  }
}

/* ═══════════════════════ 1. Levenshtein 编辑距离 ═══════════════════════ */

/**
 * 优化的单行 DP 实现，空间复杂度 O(min(m,n))
 */
function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  // 让 b 成为更短的字符串以减少内存
  if (a.length < b.length) [a, b] = [b, a]

  const bLen = b.length
  const prev = new Array<number>(bLen + 1)

  for (let j = 0; j <= bLen; j++) prev[j] = j

  for (let i = 1; i <= a.length; i++) {
    let prevDiag = prev[0]
    prev[0] = i

    for (let j = 1; j <= bLen; j++) {
      const temp = prev[j]
      if (a[i - 1] === b[j - 1]) {
        prev[j] = prevDiag
      } else {
        prev[j] = 1 + Math.min(prevDiag, prev[j], prev[j - 1])
      }
      prevDiag = temp
    }
  }

  return prev[bLen]
}

/* ═══════════════════════ 2. 字符串相似度 ═══════════════════════ */

/** 地理后缀词典 — 用于简称-全称模式检测 */
const GEO_SUFFIXES = [
  // 中文
  '公园', '花园', '公墓', '植物园', '动物园',
  '博物馆', '美术馆', '纪念馆', '展览馆', '科技馆', '水族馆',
  '神社', '寺庙', '教堂', '大教堂', '清真寺',
  '庭园', '庭院', '花苑', '御苑',
  '绿道', '步道', '古道',
  '城堡', '宫殿', '故居', '陵墓',
  '广场', '商店街', '商业街',
  '温泉', '海滩', '沙滩',
  '大学', '学院',
  '餐厅', '饭店', '食堂', '料理店', '咖啡馆', '茶馆',
  '商场', '百货', '市场', '超市',
  '乐园', '游乐园', '剧院', '影院',
  '酒店', '旅馆', '客栈', '民宿',
  // 日文 (漢字)
  '公園', '庭園', '植物園', '動物園',
  '博物館', '美術館', '記念館', '科學館', '水族館',
  '神宮', '大社',
  '御苑', '花苑',
  '緑道', '古道',
  '城跡', '城址',
  '広場', '商店街',
  '大學', '學院',
  '温泉',
  // 英文
  'park', 'garden', 'gardens', 'museum', 'temple', 'shrine',
  'palace', 'castle', 'square', 'beach', 'university',
  'restaurant', 'cafe', 'hotel', 'hostel', 'mall', 'market',
  'theater', 'theatre', 'cinema', 'stadium', 'arena',
  'resort', 'inn', 'lodge',
]

/**
 * 字符串相似度 (0-1)
 *
 * 1 = 完全相同, 0 = 完全不同
 *
 * 预处理 → 子串包含 → 简称-全称 → Levenshtein
 */
export function stringSimilarity(a: string, b: string): number {
  if (a === b) return 1
  if (a.length === 0 && b.length === 0) return 1
  if (a.length === 0 || b.length === 0) return 0

  // 预处理: 小写化, 去空格, 统一标点
  const normalize = (s: string) =>
    s.toLowerCase()
      .replace(/[\s\u3000]+/g, '')
      .replace(/[（(]/g, '(')
      .replace(/[）)]/g, ')')
      .replace(/[，,。.、·・]/g, '')

  const na = normalize(a)
  const nb = normalize(b)

  if (na === nb) return 1
  if (na.length === 0 && nb.length === 0) return 1

  // 子串包含判定
  if (na.length > 0 && nb.length > 0) {
    const [shorter, longer] = na.length <= nb.length ? [na, nb] : [nb, na]
    if (longer.includes(shorter)) {
      const containRatio = shorter.length / longer.length
      const minSim = containRatio >= 0.6 ? 0.92 : 0.85
      return Math.max(containRatio, minSim)
    }
  }

  // 简称-全称模式
  if (na.length >= 3 && nb.length >= 3) {
    for (const suffix of GEO_SUFFIXES) {
      const suf = suffix.toLowerCase()
      if (na.endsWith(suf) && nb.endsWith(suf)) {
        const prefA = na.slice(0, -suf.length)
        const prefB = nb.slice(0, -suf.length)
        if (prefA.length >= 2 && prefB.length >= 2) {
          const [shortPref, longPref] = prefA.length <= prefB.length
            ? [prefA, prefB] : [prefB, prefA]
          if (longPref.startsWith(shortPref)) {
            return Math.max(0.90, shortPref.length / longPref.length)
          }
          if (longPref.endsWith(shortPref)) {
            return Math.max(0.90, shortPref.length / longPref.length)
          }
        }
      }
    }
  }

  // 回退: Levenshtein
  const dist = levenshteinDistance(na, nb)
  const maxLen = Math.max(na.length, nb.length)
  return maxLen > 0 ? 1 - dist / maxLen : 1
}

/* ═══════════════════════ 3. 地理相似度 ═══════════════════════ */

/** Haversine 距离 (米) */
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * 地理相似度 (0-1) — 柔和衰减
 *
 * 0m → 1.00, 100m → 0.96, 200m → 0.86,
 * 500m → 0.50, 1km → 0.20, 2km → 0.06
 *
 * 无效坐标 → 0.5 (中性值)
 */
export function geoSimilarity(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  if (!lat1 || !lng1 || !lat2 || !lng2) return 0.5
  const distance = haversineMeters(lat1, lng1, lat2, lng2)
  return 1 / (1 + (distance / 500) ** 2)
}

/* ═══════════════════════ 4. 内容相似度 ═══════════════════════ */

/**
 * 内容相似度 (0-1) — 费用/标签/时长三维度
 *
 * 权重: costSim(35%) + tagSim(45%) + durationSim(20%)
 */
export function contentSimilarity(a: RawPOI, b: RawPOI): number {
  // 费用比值
  const costA = a.cost || 0
  const costB = b.cost || 0
  let costSim: number
  if (costA === 0 && costB === 0) {
    costSim = 1.0
  } else if (costA === 0 || costB === 0) {
    costSim = 0.0
  } else {
    costSim = Math.min(costA, costB) / Math.max(costA, costB)
  }

  // 标签 Jaccard 系数
  const tagsA = new Set((a.tags || []).map(t => t.toLowerCase()))
  const tagsB = new Set((b.tags || []).map(t => t.toLowerCase()))
  const intersection = [...tagsA].filter(t => tagsB.has(t)).length
  const unionSize = new Set([...tagsA, ...tagsB]).size
  const tagSim = unionSize > 0 ? intersection / unionSize : 0.5

  // 时长比值
  const durA = a.visitDuration || 0
  const durB = b.visitDuration || 0
  let durSim: number
  if (durA > 0 && durB > 0) {
    durSim = Math.min(durA, durB) / Math.max(durA, durB)
  } else {
    durSim = 0.5
  }

  return costSim * 0.35 + tagSim * 0.45 + durSim * 0.20
}

/* ═══════════════════════ 5. 名称相似度 ═══════════════════════ */

/** 检查名称是否有效 (非 "0", 非空, 非单字符) */
function isValidName(name: string | undefined): boolean {
  if (!name) return false
  const trimmed = name.trim()
  return trimmed.length > 1 && trimmed !== '0'
}

/**
 * 名称相似度 (0-1) — 三轨比对
 *
 * 同时比对 namePrimary, nameZh, nameEn，取最大值
 */
export function nameSimilarity(a: RawPOI, b: RawPOI): number {
  const primarySim = stringSimilarity(a.namePrimary, b.namePrimary)

  const aZh = isValidName(a.nameZh) ? a.nameZh : ''
  const bZh = isValidName(b.nameZh) ? b.nameZh : ''
  const zhSim = (aZh && bZh) ? stringSimilarity(aZh, bZh) : 0

  const aEn = isValidName(a.nameEn) ? a.nameEn : ''
  const bEn = isValidName(b.nameEn) ? b.nameEn : ''
  const enSim = (aEn && bEn) ? stringSimilarity(aEn, bEn) : 0

  return Math.max(primarySim, zhSim, enSim)
}

/* ═══════════════════════ 6. 地址相似度 ═══════════════════════ */

/**
 * 地址相似度 (0-1)
 *
 * 比对 address + addressEn，取较大值
 * 都空 → 0.5 (中性)
 */
export function addressSimilarity(a: RawPOI, b: RawPOI): number {
  const addrA = (a.address || '').trim()
  const addrB = (b.address || '').trim()
  const addrEnA = (a.addressEn || '').trim()
  const addrEnB = (b.addressEn || '').trim()

  if (!addrA && !addrB && !addrEnA && !addrEnB) return 0.5

  const localSim = (addrA && addrB) ? stringSimilarity(addrA, addrB) : 0
  const enSim = (addrEnA && addrEnB) ? stringSimilarity(addrEnA, addrEnB) : 0

  if (!addrA && !addrB) return enSim > 0 ? enSim : 0.5
  if (!addrEnA && !addrEnB) return localSim > 0 ? localSim : 0.5

  return Math.max(localSim, enSim)
}

/* ═══════════════════════ 7. 跨类目密切关系 ═══════════════════════ */

/**
 * 密切相关的 L1 类目对:
 *   scenic ↔ experience
 *   entertainment ↔ experience
 *   food ↔ experience
 */
const CLOSELY_RELATED_PAIRS: Set<string> = new Set([
  'scenic|experience',
  'experience|scenic',
  'entertainment|experience',
  'experience|entertainment',
  'food|experience',
  'experience|food',
])

function isCloselyRelated(l1a: L1Category, l1b: L1Category): boolean {
  if (l1a === l1b) return false
  return CLOSELY_RELATED_PAIRS.has(`${l1a}|${l1b}`)
}

/* ═══════════════════════ 8. 综合相似度 ═══════════════════════ */

/**
 * 综合相似度 — 5 路径决策树
 *
 * Path A: 同 L1 + 近完美同名 (≥0.95) → 需内容验证 ≥0.70
 * Path B: 同 L1 + 高相似名 (0.90-0.95) → 需地理 ≤2km + 内容 ≥0.50
 * Path C: 跨 L1 密切相关对 → 需名称 ≥0.90 + 内容 ≥0.65 + 地理 ≤2km
 * Path D: 跨 L1 非相关对 → 极端保护 (0.95 + 0.80 + 0.20)
 * Path E: 常规加权 → name×0.45 + addr×0.25 + geo×0.30
 */
export function compositeSimilarity(a: RawPOI, b: RawPOI): CompositeResult {
  const nSim = nameSimilarity(a, b)
  const aSim = addressSimilarity(a, b)
  const gSim = geoSimilarity(a.lat, a.lng, b.lat, b.lng)
  const cSim = contentSimilarity(a, b)

  const details = { nameSim: nSim, addrSim: aSim, geoSim: gSim, contentSim: cSim }
  const sameL1 = a.categoryL1 === b.categoryL1

  // ── 同 L1 路径 ──
  if (sameL1) {
    // Path A: 近完美同名
    if (nSim >= 0.95) {
      if (cSim >= 0.70) {
        return { score: nSim, path: 'same-type-perfect', details }
      }
      // 名字归一化后完全相同 (nSim=1.0) 且地理距离 ≤2km (geoSim≥0.06) 时视为同一地点
      // 避免仅因 contentSim 数据缺失而漏合并（AI 数据通常缺少 tags/cost）
      // 大型公园/景区不同入口坐标偏差可能达到 1-2km
      if (nSim >= 1.0 && gSim >= 0.06) {
        return { score: nSim, path: 'same-type-perfect', details }
      }
      // 名称高度相似但内容数据缺失时，仍给予较高保底分以避免漏合并
      return {
        score: Math.max(0.88, nSim * 0.50 + cSim * 0.50),
        path: 'same-type-perfect-low-content',
        details,
      }
    }

    // Path B: 高相似名 (0.90-0.95)
    if (nSim >= 0.90) {
      if (gSim >= 0.06 && cSim >= 0.50) {
        return { score: nSim, path: 'same-type-high', details }
      }
      // 地理远或内容差 → 降级到常规路径
    }

    // Path E: 常规加权
    return {
      score: nSim * 0.45 + aSim * 0.25 + gSim * 0.30,
      path: 'regular',
      details,
    }
  }

  // ── 跨 L1 路径 ──

  // Path C: 密切相关对
  if (isCloselyRelated(a.categoryL1, b.categoryL1)) {
    if (nSim >= 0.90 && cSim >= 0.65 && gSim >= 0.06) {
      return { score: nSim, path: 'cross-related', details }
    }
    return {
      score: nSim * 0.25 + cSim * 0.35 + aSim * 0.20 + gSim * 0.20,
      path: 'cross-related-fail',
      details,
    }
  }

  // Path D: 非相关跨类 — 最大保护
  if (nSim >= 0.95 && cSim >= 0.80 && gSim >= 0.20) {
    return { score: nSim, path: 'cross-unrelated', details }
  }
  return {
    score: nSim * 0.20 + cSim * 0.30 + aSim * 0.20 + gSim * 0.30,
    path: 'cross-unrelated-fail',
    details,
  }
}

/* ═══════════════════════ 9. 无效 POI 检测 ═══════════════════════ */

/**
 * 判断 POI 是否为无效数据 (AI 幻觉等)
 */
export function isInvalidPOI(poi: RawPOI): boolean {
  if (poi.lat === 0 && poi.lng === 0) return true
  if (/^\d+$/.test(poi.namePrimary.trim())) return true
  if (poi.nameZh && /^\d*$/.test(poi.nameZh.trim())) return true
  if (poi.namePrimary.trim().length < 2) return true
  return false
}
