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
      '咖啡馆', '咖啡厅', '茶馆', '甜品店', '酒馆',
      '烤鸭店', '奶茶店', '饮品店', '轻食店', '果汁店', '面包房',
      'restaurant', 'cafe', 'coffee shop', 'bistro', 'diner', 'eatery', '餐吧',
      'bakery', 'juice bar', 'tea house',
      '餐廳', '料理',
    ],
    nameWords: [
      '美食', '料理', '招牌', '特色菜', '小吃', '火锅', '烧烤', '面',
      '寿司', '刺身', '拉面', '咖喱', '甜点', '蛋糕', '奶茶', '果汁',
      '轻食', '沙拉', '面包', '烤鸭', '咖啡', '茶饮', '现萃', '鲜茶',
      'cuisine', 'kitchen', 'grill', 'sushi', 'ramen', 'noodle', 'bubble tea',
      'グルメ', '食堂',
    ],
    descWords: [
      '招牌菜', '特色菜', '主厨', '口味', '食材', '新鲜',
      '人均', '套餐', '菜单', '推荐菜', '果木挂炉', '烤制',
      '餐饮', '餐厅', '中餐', '快餐', '西餐厅', '日料', '韩料', '烧烤', '火锅', '烤鸭', '铁板烧', '烤肉',
      'chef', 'menu', 'dish', 'flavor', 'ingredient', 'signature',
      'healthy food', 'salad', 'sandwich', 'cold-pressed juice',
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
      '夜总会', '俱乐部', 'KTV', '剧场', '小剧场', '酒吧',
      'park', 'casino', 'theater', 'theatre', 'cinema', 'stadium',
      'arena', 'club', 'pub', 'bar', 'lounge',
      '樂園',
    ],
    nameWords: [
      '表演', '演出', '音乐会', '马戏', '杂技', '歌剧', '脱口秀',
      '夜生活', '娱乐', '迪厅', 'Live', '观演', '声景剧',
      'show', 'concert', 'performance', 'nightlife', 'stand-up comedy',
      'ショー', 'パフォーマンス',
    ],
    descWords: [
      '观看', '欣赏', '门票', '表演时间', '座位', '演出时间',
      '观众', '舞台', '互动', '观演', '文艺晚会',
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
      '度假村', '旅舍',
      // 注: '别墅' 已移至 nameWords — 单独作为后缀会错误匹配历史建筑别墅
      'hotel', 'hostel', 'inn', 'resort', 'motel', 'lodge',
      'ゲストハウス', 'ホテル', '旅館',
    ],
    nameWords: [
      '住宿', '客房', '度假', '套房', '标准间',
      // '别墅' 仅在明确酒店语境下才视为住宿 (配合 descWords 综合判断)
      '别墅酒店', '别墅度假',
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

/* ═══════════════════════ 2. 类目互斥黑名单 ═══════════════════════ */

/**
 * 强制排除规则: 名称或描述含有这些关键词时，对应类目得分清零。
 *
 * 主要用途:
 *   - 防止 AI 批次错误将游泳馆/餐厅/步道归入酒店
 *   - 防止将商业综合体归入景点
 *
 * 结构: { category: { nameExcludes, descExcludes, requiredCategory } }
 *   nameExcludes: 名称中包含这些词 → 该类目得分清零
 *   requiredCategory: 同时给此类目额外加分，引导到正确结果
 */
interface ExclusionRule {
  nameExcludes: string[]
  descExcludes?: string[]
  boostCategory?: L1Category
  boostScore?: number
}

const CATEGORY_EXCLUSIONS: Partial<Record<L1Category, ExclusionRule[]>> = {
  hotel: [
    // 体育/游泳/健身场馆 → entertainment
    {
      nameExcludes: ['游泳馆', '游泳池', '泳池', '体育馆', '体育场', '体育中心', '球场', '赛马场', '溜冰场', '滑冰场'],
      boostCategory: 'entertainment',
      boostScore: 10,
    },
    // 餐饮 → food
    {
      nameExcludes: ['餐厅', '饭店', '菜馆', '食堂', '面馆', '面包房', '咖啡馆', '咖啡厅', '茶馆', '茶室', '甜品店', '酒吧', '烧烤', '火锅', '烤鸭店', '奶茶店', '饮品店', '轻食店'],
      boostCategory: 'food',
      boostScore: 10,
    },
    // 剧场/演出 → entertainment
    {
      nameExcludes: ['剧场', '剧院', '影院', '脱口秀', '演出'],
      boostCategory: 'entertainment',
      boostScore: 10,
    },
    // 公园/步道/自然景区 → scenic 或 experience
    {
      nameExcludes: ['公园', '步道', '绿道', '古道', '森林', '湿地', '植物园', '动物园', '自然保护区', '国家公园', '风景区', '景区'],
      boostCategory: 'scenic',
      boostScore: 10,
    },
    // 历史建筑/文化景点: 别墅/故居/旧居/遗址等 → scenic
    {
      nameExcludes: ['故居', '旧居', '纪念馆', '博物馆', '美术馆', '展览馆', '遗址', '古迹', '历史建筑', '保护建筑'],
      boostCategory: 'scenic',
      boostScore: 10,
    },
    // 别墅 + 非住宿描述词: 描述含旅游/游览/参观关键词时视为景点
    {
      nameExcludes: [],
      descExcludes: ['参观', '游览', '对外开放', '历史保护', '文化遗址'],
      boostCategory: 'scenic',
      boostScore: 8,
    },
  ],
  scenic: [
    // 商业综合体/购物中心 → shopping
    // 注意：'广场' 不能直接排除，会误伤天安门广场、西湖广场等历史/景点广场
    // 只有明确商业综合体词才排除，且必须配合描述词确认
    {
      nameExcludes: ['MALL', 'Mall', 'mall', '商城', '商业区', '商业综合体', '购物广场', '商业广场', '购物中心'],
      descExcludes: ['商业', '品牌', '购物', '零售', '店铺', '百货'],
      boostCategory: 'shopping',
      boostScore: 8,
    },
    {
      nameExcludes: ['餐厅', '饭店', '菜馆', '食堂', '面馆', '咖啡馆', '咖啡厅', '茶馆', '甜品店', '酒吧', '烧烤', '火锅', '烤鸭店', '奶茶店', '饮品店', '轻食店', '果汁店'],
      descExcludes: ['餐厅', '米其林', '主厨', '菜单', '招牌菜', '人均', '果木挂炉', '现萃', '鲜茶', '轻食', '沙拉', '三明治'],
      boostCategory: 'food',
      boostScore: 10,
    },
    // 酒店/民宿/公寓 → hotel
    {
      nameExcludes: ['酒店', '旅馆', '客栈', '民宿', '宾馆', '公寓', '度假村', '旅舍', '别墅酒店', '酒店式公寓'],
      descExcludes: ['入住', '退房', '客房', '前台', '房间', '早餐', '观鸟露台', '自然教育'],
      boostCategory: 'hotel',
      boostScore: 10,
    },
    // 剧场/演出/脱口秀 → entertainment
    {
      nameExcludes: ['剧场', '剧院', '影院', '脱口秀', '演出', 'livehouse', ' Live House'],
      descExcludes: ['演出', '表演', '观演', '文艺晚会', '舞台', '观众', '门票'],
      boostCategory: 'entertainment',
      boostScore: 10,
    },
    // 体验活动 → experience
    {
      nameExcludes: ['探秘', '夜游', '灯光秀', '嘉年华', '冰雪嘉年华', '夜航', '乘船观演', '山地学院', '四季山地学院'],
      descExcludes: ['滑草', '山地车速降', '岩降', '体能训练', '自然教育课程', '乘船观演', '湖面全息', '渔火对歌', '净身仪式'],
      boostCategory: 'experience',
      boostScore: 10,
    },
    // 租车/汽车服务 → 排除出 scenic（无对应类目，降至兜底）
    {
      nameExcludes: ['租车', '汽车租赁', '汽车服务', '驾校', '洗车'],
      boostCategory: 'shopping',
      boostScore: 3,
    },
    // 医疗/卫生服务 → 排除出 scenic
    {
      nameExcludes: ['卫生服务站', '卫生院', '卫生所', '诊所', '医院', '医疗', '药房', '药店', '牙科', '口腔'],
      boostCategory: 'experience',
      boostScore: 2,
    },
  ],
  shopping: [
    // 餐饮场所 → food (购物类目严格排除食品饮料类)
    {
      nameExcludes: ['餐厅', '饭店', '菜馆', '食堂', '面馆', '咖啡馆', '咖啡厅', '茶馆', '茶室', '甜品店', '酒吧', '酒馆', '烧烤', '火锅', '烤鸭店', '奶茶店', '饮品店', '轻食店', '果汁店', '面包房'],
      descExcludes: ['餐厅', '米其林', '主厨', '菜单', '招牌菜', '人均', '果木挂炉', '现萃', '鲜茶', '轻食', '沙拉', '三明治', '茶饮品牌'],
      boostCategory: 'food',
      boostScore: 12,
    },
    // 酒店/民宿/公寓 → hotel
    {
      nameExcludes: ['酒店', '旅馆', '客栈', '民宿', '宾馆', '公寓', '度假村', '旅舍', '别墅酒店', '酒店式公寓', '精品民宿'],
      descExcludes: ['入住', '退房', '客房', '前台', '房间', '早餐', '观鸟露台', '自然教育', '住宿'],
      boostCategory: 'hotel',
      boostScore: 12,
    },
    // 剧场/演出/脱口秀 → entertainment
    {
      nameExcludes: ['剧场', '剧院', '影院', '脱口秀', '演出', 'livehouse', ' Live House', '国潮脱口秀'],
      descExcludes: ['演出', '表演', '观演', '文艺晚会', '舞台', '观众', '门票', '观剧'],
      boostCategory: 'entertainment',
      boostScore: 12,
    },
    // 景点/地标 → scenic
    {
      nameExcludes: ['公园', '寺', '庙', '博物馆', '美术馆', '纪念馆', '遗址', '古迹', '长城', '鸟巢', '水立方', '奥林匹克',
        '天安门', '故宫', '紫禁城', '颐和园', '圆明园', '天坛', '地坛', '雍和宫',
        '西湖', '外滩', '东方明珠', '玉龙雪山', '布达拉宫'],
      descExcludes: ['著名景点', '地标', '文化遗产', '历史建筑', '文物保护单位', '游泳场馆', '世界文化遗产'],
      boostCategory: 'scenic',
      boostScore: 12,
    },
    // 体验活动 → experience
    {
      nameExcludes: ['探秘', '夜游', '灯光秀', '嘉年华', '冰雪嘉年华', '夜航', '乘船观演', '山地学院', '四季山地学院', '滑草', '滑雪中心'],
      descExcludes: ['滑草', '山地车速降', '岩降', '体能训练', '自然教育课程', '乘船观演', '湖面全息', '渔火对歌', '培训', '学习'],
      boostCategory: 'experience',
      boostScore: 12,
    },
  ],

  // P-011~P-016: experience 类目排除规则（forceExclude 强制负分）
  // 地点型/商业型/娱乐型 POI 不应归入体验类
  experience: [
    // P-011: 公园/风景区/皇家园林/遗址等 → scenic
    {
      nameExcludes: ['公园', '御苑', '御花园', '颐和园', '风景区', '景区', '遗址', '古迹', '风景带', '风景道',
        '植物园', '动物园', '大观园', '博览园', '生态园', '湿地公园', '国家公园', '森林公园', '郊野公园',
        '陵寝', '神道', '十三陵', '长城', '故宫', '天坛', '地坛', '北海', '圆明园'],
      boostCategory: 'scenic',
      boostScore: 15,
      forceExclude: true,
    },
    // P-012: 古村落/古镇/工业遗存/历史街道 → scenic
    {
      nameExcludes: ['古村', '古村落', '古镇', '历史村落', '传统村落', '明清村落',
        '工业遗迹', '工业遗址', '工业遗存', '山水画廊', '历史文化游览区', '漕运',
        '创意园', '文创园', '示范区', '爨底下', '首钢园', '会展中心'],
      boostCategory: 'scenic',
      boostScore: 15,
      forceExclude: true,
    },
    // P-014: 宗教场所 → scenic
    {
      nameExcludes: ['清真寺', '教堂', '神社', '大昭寺', '雍和宫', '喇嘛庙', '寺院'],
      boostCategory: 'scenic',
      boostScore: 15,
      forceExclude: true,
    },
    // P-013: 商业综合体 → shopping
    {
      nameExcludes: ['天街', '合生汇', '熙悦', '吾悦广场', '印象城', '壹方城', '购物中心', '商业综合体',
        '太古里', '大悦城', '万象城', '三里屯'],
      descExcludes: ['商业', '品牌', '购物', '零售', '店铺', '楼层', '百货'],
      boostCategory: 'shopping',
      boostScore: 12,
      forceExclude: true,
    },
    // P-016: 主题乐园/娱乐设施 → entertainment
    {
      nameExcludes: ['欢乐谷', '主题乐园', '游乐园', '游乐场', '嘉年华'],
      boostCategory: 'entertainment',
      boostScore: 12,
      forceExclude: true,
    },
  ],
}

/**
 * 应用互斥规则，对分数进行调整。
 * 修改传入的 scores 对象（in-place）。
 */
function applyExclusionRules(
  poi: RawPOI,
  scores: Record<L1Category, number>,
): void {
  const name = (poi.namePrimary + ' ' + (poi.nameZh || '')).toLowerCase()
  const desc = (poi.description || '').toLowerCase()

  for (const [category, rules] of Object.entries(CATEGORY_EXCLUSIONS) as [L1Category, ExclusionRule[]][]) {
    for (const rule of rules) {
      const nameHit = rule.nameExcludes.some(kw => name.includes(kw.toLowerCase()))
      const descHit = rule.descExcludes
        ? rule.descExcludes.some(kw => desc.includes(kw.toLowerCase()))
        : false

      // 名称命中 OR (名称规则为空 + 描述命中) 时触发
      const triggered = nameHit || (rule.nameExcludes.length === 0 && descHit)

      if (triggered) {
        // 清零该类目分数
        scores[category] = 0
        // 给正确类目加分
        if (rule.boostCategory && rule.boostScore) {
          scores[rule.boostCategory] += rule.boostScore
        }
      }
    }
  }
}

/* ═══════════════════════ 2b. 商业综合体检测 ═══════════════════════ */

/**
 * 检测 POI 是否为商业综合体（购物中心/商业广场类）。
 *
 * 商业综合体特征: 名称含综合体关键词 + 描述含商业/品牌/购物词。
 * 此类地点常被 AI 误归为景点。
 */
const COMMERCIAL_COMPLEX_NAME_WORDS = [
  '天地', 'IFC', 'ICC', 'ifc', 'icc', 'K11', 'k11', 'WFC', '万象',
  '环球港', '大悦城', '恒隆', '正大', '南京东路', '陆家嘴', '新天地',
]

const COMMERCIAL_COMPLEX_DESC_WORDS = [
  '商业综合体', '综合体', '购物中心', '商业中心', '零售', '品牌入驻',
  '商业广场', '楼层', '品牌', '店铺', '百货',
]

/**
 * 返回 true 表示该 POI 应归为 shopping，而非 scenic
 */
export function isCommercialComplex(poi: RawPOI): boolean {
  const name = (poi.namePrimary + ' ' + (poi.nameZh || '')).toLowerCase()
  const desc = (poi.description || '').toLowerCase()
  const nameHit = COMMERCIAL_COMPLEX_NAME_WORDS.some(w => name.includes(w.toLowerCase()))
  const descHit = COMMERCIAL_COMPLEX_DESC_WORDS.some(w => desc.includes(w.toLowerCase()))
  return nameHit && descHit
}

/* ═══════════════════════ 3. 来源可靠性 ═══════════════════════ */

const SOURCE_RELIABILITY: Record<string, number> = {
  osm: 3,
  google: 2,
  foursquare: 2,
  amap: 2,
  qwen: 1,
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

  // 应用互斥排除规则 (防止游泳馆/餐厅/步道被错归酒店等)
  applyExclusionRules(poi, scores)

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
