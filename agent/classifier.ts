/**
 * agent/classifier.ts — 6 类目分类器 & 冲突解决
 *
 * 三层关键词打分: 后缀(+5) / 名称(+2) / 描述(+1)
 * 冲突解决: 多数投票 → 来源可靠性加权 → 分类器裁决
 */

import type { RawPOI, L1Category } from './sources/base.js'
import { L1_CATEGORIES, resolveCategoryPath } from './categories.js'

/* ═══════════════════════ Types ═══════════════════════ */

export interface ClassifyResult {
  l1: L1Category
  confidence: number
  scores: Record<L1Category, number>
}

export interface ConflictResult {
  l1: L1Category
  l3: string
  method: 'majority' | 'weighted' | 'classifier'
}

/* ═══════════════════════ 1. 关键词词典 ═══════════════════════ */

interface CategoryKeywords {
  suffixes: string[]   // 后缀词 (+5)
  nameWords: string[]  // 名称词 (+2)
  descWords: string[]  // 描述词 (+1)
}

const KEYWORDS: Record<L1Category, CategoryKeywords> = {
  scenic: {
    suffixes: [
      '公园', '花园', '寺', '庙', '山', '湖', '海', '岛', '峡', '洞',
      '城堡', '宫殿', '遗址', '古迹', '城墙', '陵墓', '教堂', '神社',
      '广场', '大桥', '塔', '峰', '瀑布', '泉', '滩', '湾',
      'park', 'garden', 'temple', 'shrine', 'palace', 'castle',
      'square', 'beach', 'island', 'waterfall', 'cave',
      '公園', '庭園', '植物園', '動物園', '博物館', '神社', '大社', '御苑',
    ],
    nameWords: [
      '景区', '景点', '风景', '观光', '名胜', '古迹', '世界遗产',
      'monument', 'landmark', 'attraction', 'heritage', 'viewpoint',
      '景区', '名所', '旧迹',
    ],
    descWords: [
      '位于', '坐落于', '建于', '历史悠久', '文化遗产', '自然景观',
      '著名景点', '标志性', '俯瞰', '远眺',
      'located', 'situated', 'built in', 'historic', 'panoramic',
    ],
  },

  food: {
    suffixes: [
      '餐厅', '饭店', '食堂', '料理店', '菜馆', '小馆', '面馆',
      '咖啡馆', '茶馆', '甜品店', '酒吧', '酒馆',
      'restaurant', 'cafe', 'bistro', 'diner', 'eatery', 'pub', 'bar',
      '餐廳', '料理',
    ],
    nameWords: [
      '美食', '料理', '招牌', '特色菜', '小吃', '火锅', '烧烤', '面',
      '寿司', '刺身', '拉面', '咖喱', '甜点', '蛋糕',
      'cuisine', 'kitchen', 'grill', 'sushi', 'ramen', 'noodle',
      'グルメ', '食堂',
    ],
    descWords: [
      '招牌菜', '特色菜', '主厨', '口味', '食材', '新鲜',
      '人均', '套餐', '菜单', '推荐菜',
      'chef', 'menu', 'dish', 'flavor', 'ingredient', 'signature',
    ],
  },

  shopping: {
    suffixes: [
      '商场', '百货', '市场', '超市', '店铺', '商城',
      'mall', 'outlet', 'market', 'store', 'shop', 'plaza',
      '商場', '百貨',
    ],
    nameWords: [
      '购物', '免税', '品牌', '折扣', '精品', '专卖',
      'shopping', 'boutique', 'duty-free', 'luxury',
      '買い物',
    ],
    descWords: [
      '购物', '品牌', '折扣', '商品', '纪念品', '特产',
      '楼层', '营业面积', '入驻品牌',
      'brands', 'stores', 'floors', 'shops',
    ],
  },

  entertainment: {
    suffixes: [
      '乐园', '游乐园', '赌场', '剧院', '影院', '体育馆',
      '夜总会', '俱乐部', 'KTV',
      'park', 'casino', 'theater', 'theatre', 'cinema', 'stadium',
      'arena', 'club',
      '樂園',
    ],
    nameWords: [
      '表演', '演出', '音乐会', '马戏', '杂技', '歌剧',
      '夜生活', '娱乐', '迪厅', 'Live',
      'show', 'concert', 'performance', 'nightlife',
      'ショー', 'パフォーマンス',
    ],
    descWords: [
      '观看', '欣赏', '门票', '表演时间', '座位', '演出时间',
      '观众', '舞台', '互动',
      'watch', 'enjoy', 'tickets', 'seats', 'audience', 'stage',
    ],
  },

  experience: {
    suffixes: [
      '体验', '工坊', '课程', '中心', '基地', '会馆',
      '温泉', 'SPA', 'spa',
      'workshop', 'class', 'studio', 'center', 'experience',
      '体験', '工房',
    ],
    nameWords: [
      '徒步', '登山', '潜水', '冲浪', '滑雪', '骑行', '露营',
      '瑜伽', '冥想', '手作', '陶艺', '烹饪',
      'hiking', 'diving', 'surfing', 'skiing', 'cycling', 'camping',
      'yoga', 'cooking', 'pottery',
      '体験', 'アクティビティ',
    ],
    descWords: [
      '参加', '体验', '学习', '亲手', '教练', '指导',
      '提供体验', '可以参加', '互动体验',
      'participate', 'learn', 'instructor', 'guide', 'hands-on',
    ],
  },

  hotel: {
    suffixes: [
      '酒店', '旅馆', '客栈', '民宿', '宾馆', '公寓',
      '度假村', '别墅', '旅舍',
      'hotel', 'hostel', 'inn', 'resort', 'motel', 'lodge',
      'ゲストハウス', 'ホテル', '旅館',
    ],
    nameWords: [
      '住宿', '客房', '度假', '套房', '标准间',
      'accommodation', 'room', 'suite', 'resort',
      '宿泊',
    ],
    descWords: [
      '入住', '退房', '房间', '前台', '客房', '早餐',
      '设施', '泳池', '健身房', '停车场',
      'check-in', 'check-out', 'rooms', 'breakfast', 'amenities',
    ],
  },
}

/* ═══════════════════════ 2. 来源可靠性 ═══════════════════════ */

const SOURCE_RELIABILITY: Record<string, number> = {
  osm: 3,
  google: 2,
  foursquare: 2,
  amap: 2,
  ai: 1,
}

function getSourceWeight(source: string): number {
  return SOURCE_RELIABILITY[source] || 1
}

/* ═══════════════════════ 3. 分类器 ═══════════════════════ */

/**
 * 对单个 POI 进行 6 类目打分分类。
 *
 * 三层关键词:
 *   后缀词 (+5): namePrimary/nameZh 结尾匹配
 *   名称词 (+2): namePrimary/nameZh 包含
 *   描述词 (+1): description/tags 包含
 */
export function classifyCategory(poi: RawPOI): ClassifyResult {
  const scores: Record<L1Category, number> = {
    scenic: 0, food: 0, shopping: 0,
    entertainment: 0, experience: 0, hotel: 0,
  }

  const namePrimary = (poi.namePrimary || '').toLowerCase()
  const nameZh = (poi.nameZh || '').toLowerCase()
  const desc = (poi.description || '').toLowerCase()
  const tags = (poi.tags || []).map(t => t.toLowerCase()).join(' ')

  for (const l1 of L1_CATEGORIES) {
    const kw = KEYWORDS[l1]

    // 后缀词 +5
    for (const suffix of kw.suffixes) {
      const s = suffix.toLowerCase()
      if (namePrimary.endsWith(s) || nameZh.endsWith(s)) {
        scores[l1] += 5
      }
    }

    // 名称词 +2
    for (const word of kw.nameWords) {
      const w = word.toLowerCase()
      if (namePrimary.includes(w) || nameZh.includes(w)) {
        scores[l1] += 2
      }
    }

    // 描述词 +1
    for (const word of kw.descWords) {
      const w = word.toLowerCase()
      if (desc.includes(w) || tags.includes(w)) {
        scores[l1] += 1
      }
    }
  }

  // 找最高分
  const sorted = [...L1_CATEGORIES].sort((a, b) => scores[b] - scores[a])
  const winner = sorted[0]
  const totalScore = L1_CATEGORIES.reduce((sum, c) => sum + scores[c], 0)
  const confidence = totalScore > 0 ? scores[winner] / totalScore : 0

  return { l1: winner, confidence, scores }
}

/* ═══════════════════════ 4. 类目冲突解决 ═══════════════════════ */

/**
 * 解决多个来源对同一 POI 的 L1 类目分歧。
 *
 * Step 1: 多数投票 (>50% 来源一致)
 * Step 2: 来源可靠性加权
 * Step 3: 分类器裁决 (tiebreaker)
 */
export function resolveCategoryConflict(
  pois: RawPOI[],
  classifierResult?: ClassifyResult,
): ConflictResult {
  if (pois.length === 0) {
    throw new Error('resolveCategoryConflict: empty pois array')
  }

  if (pois.length === 1) {
    const p = pois[0]
    return { l1: p.categoryL1, l3: p.categoryL3, method: 'majority' }
  }

  // Step 1: 多数投票
  const voteCount = new Map<L1Category, number>()
  for (const p of pois) {
    voteCount.set(p.categoryL1, (voteCount.get(p.categoryL1) || 0) + 1)
  }

  const totalVotes = pois.length
  for (const [l1, count] of voteCount) {
    if (count > totalVotes / 2) {
      return { l1, l3: pickBestL3(l1, pois), method: 'majority' }
    }
  }

  // Step 2: 来源可靠性加权
  const weightedScores = new Map<L1Category, number>()
  for (const p of pois) {
    const weight = getSourceWeight(p.source)
    weightedScores.set(p.categoryL1, (weightedScores.get(p.categoryL1) || 0) + weight)
  }

  const sortedWeighted = [...weightedScores.entries()].sort((a, b) => b[1] - a[1])

  // 检查是否有唯一最高分
  if (sortedWeighted.length > 0) {
    const [topL1, topScore] = sortedWeighted[0]
    const secondScore = sortedWeighted.length > 1 ? sortedWeighted[1][1] : 0

    if (topScore > secondScore) {
      return { l1: topL1, l3: pickBestL3(topL1, pois), method: 'weighted' }
    }
  }

  // Step 3: 分类器裁决
  if (classifierResult && classifierResult.confidence > 0) {
    return {
      l1: classifierResult.l1,
      l3: pickBestL3(classifierResult.l1, pois),
      method: 'classifier',
    }
  }

  // 最终回退: 优先级 scenic > experience > entertainment > food > shopping > hotel
  const priority: L1Category[] = ['scenic', 'experience', 'entertainment', 'food', 'shopping', 'hotel']
  for (const l1 of priority) {
    if (voteCount.has(l1)) {
      return { l1, l3: pickBestL3(l1, pois), method: 'weighted' }
    }
  }

  return { l1: pois[0].categoryL1, l3: pois[0].categoryL3, method: 'weighted' }
}

/* ═══════════════════════ 5. L3 选择 ═══════════════════════ */

/**
 * 在已确定的 L1 下，从多个候选 L3 中选最具体的。
 *
 * 策略: 优先与 L1 一致的 L3 → 出现次数最多的 → 第一个有效的
 */
export function resolveCategoryL3(l1: L1Category, candidates: string[]): string {
  if (candidates.length === 0) {
    return `${l1}.${getDefaultL2(l1)}.default`
  }

  // 只保留属于目标 L1 的候选
  const matching = candidates.filter(c => {
    const path = resolveCategoryPath(c)
    return path && path.l1 === l1
  })

  if (matching.length === 0) {
    // 没有匹配的 L3，构造默认值
    return `${l1}.${getDefaultL2(l1)}.default`
  }

  // 选出现次数最多的
  const counts = new Map<string, number>()
  for (const c of matching) {
    counts.set(c, (counts.get(c) || 0) + 1)
  }

  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1])
  return sorted[0][0]
}

/* ═══════════════════════ Helpers ═══════════════════════ */

function pickBestL3(l1: L1Category, pois: RawPOI[]): string {
  const candidates = pois.map(p => p.categoryL3).filter(Boolean)
  return resolveCategoryL3(l1, candidates)
}

function getDefaultL2(l1: L1Category): string {
  const map: Record<L1Category, string> = {
    scenic: 'modern', food: 'local', shopping: 'mall',
    entertainment: 'theme', experience: 'outdoor', hotel: 'comfort',
  }
  return map[l1]
}
