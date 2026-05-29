/**
 * agent/categories.ts — POI 类目树
 *
 * 六大一级类目 → 二级类目 → 三级类目
 * 用于 POI 数据的组织、打标和搜索筛选。
 */

export interface CategoryNode {
  id: string
  label: string       // 中文
  labelEn: string     // 英文
  children?: CategoryNode[]
}

/* ═══════════════════════ 一级类目 ═══════════════════════ */

export type L1Category = 'scenic' | 'food' | 'shopping' | 'entertainment' | 'experience' | 'hotel'

export const L1_CATEGORIES: L1Category[] = [
  'scenic', 'food', 'shopping', 'entertainment', 'experience', 'hotel',
]

export const L1_LABELS: Record<L1Category, { zh: string; en: string }> = {
  scenic:        { zh: '景点', en: 'Scenic Spots' },
  food:          { zh: '餐饮', en: 'Food & Dining' },
  shopping:      { zh: '购物', en: 'Shopping' },
  entertainment: { zh: '娱乐', en: 'Entertainment' },
  experience:    { zh: '体验', en: 'Experiences' },
  hotel:         { zh: '酒店', en: 'Accommodation' },
}

/* ═══════════════════════ 完整类目树 ═══════════════════════ */

export const CATEGORY_TREE: CategoryNode[] = [
  // ── 1. 景点 ──
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

  // ── 2. 餐饮 ──
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

  // ── 3. 购物 ──
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

  // ── 4. 娱乐 ──
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

  // ── 5. 体验 ──
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

  // ── 6. 酒店 ──
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

/* ═══════════════════════ 工具函数 ═══════════════════════ */

/**
 * 根据 L2/L3 ID 查找类目路径。
 * 例: 'scenic.natural.beach' → ['scenic', 'scenic.natural', 'scenic.natural.beach']
 */
export function resolveCategoryPath(categoryId: string): { l1: string; l2: string; l3: string } | null {
  const parts = categoryId.split('.')
  if (parts.length < 2) return null

  return {
    l1: parts[0],
    l2: parts.slice(0, 2).join('.'),
    l3: categoryId,
  }
}

/**
 * 根据 ID 获取类目标签。
 */
export function getCategoryLabels(categoryId: string): { l1Zh: string; l1En: string; l2Zh: string; l2En: string; l3Zh: string; l3En: string } | null {
  const parts = categoryId.split('.')
  if (parts.length < 3) return null

  const l1 = CATEGORY_TREE.find(n => n.id === parts[0])
  if (!l1) return null

  const l2 = l1.children?.find(n => n.id === `${parts[0]}.${parts[1]}`)
  if (!l2) return null

  const l3 = l2.children?.find(n => n.id === categoryId)
  if (!l3) return null

  return {
    l1Zh: l1.label, l1En: l1.labelEn,
    l2Zh: l2.label, l2En: l2.labelEn,
    l3Zh: l3.label, l3En: l3.labelEn,
  }
}

/**
 * 获取指定一级类目下的所有三级类目 ID 列表。
 */
export function getAllL3Categories(l1: L1Category): string[] {
  const node = CATEGORY_TREE.find(n => n.id === l1)
  if (!node || !node.children) return []

  const result: string[] = []
  for (const l2 of node.children) {
    if (l2.children) {
      for (const l3 of l2.children) {
        result.push(l3.id)
      }
    }
  }
  return result
}

/* ── OSM Tags → 类目映射 ── */

export function osmTagsToCategory(tags: Record<string, string>): { l1: L1Category; l3: string } | null {
  // 景点
  if (tags.tourism === 'attraction' || tags.historic) return { l1: 'scenic', l3: 'scenic.historical.ruins' }
  if (tags.tourism === 'museum') return { l1: 'scenic', l3: 'experience.educational.museum' }
  if (tags.tourism === 'gallery') return { l1: 'scenic', l3: 'experience.educational.gallery' }
  if (tags.tourism === 'viewpoint') return { l1: 'scenic', l3: 'scenic.natural.mountain' }
  if (tags.natural === 'peak' || tags.natural === 'volcano') return { l1: 'scenic', l3: 'scenic.natural.mountain' }
  if (tags.natural === 'water') return { l1: 'scenic', l3: 'scenic.natural.lake' }
  if (tags.natural === 'beach') return { l1: 'scenic', l3: 'scenic.natural.beach' }
  if (tags.natural === 'wood' || tags.natural === 'forest') return { l1: 'scenic', l3: 'scenic.natural.forest' }
  if (tags.natural === 'waterfall') return { l1: 'scenic', l3: 'scenic.natural.waterfall' }
  if (tags.natural === 'cave_entrance') return { l1: 'scenic', l3: 'scenic.natural.canyon' }
  if (tags.place_of_worship) {
    if (tags.religion === 'buddhist' || tags.religion === 'hindu') return { l1: 'scenic', l3: 'scenic.historical.temple' }
    if (tags.religion === 'christian') return { l1: 'scenic', l3: 'scenic.historical.church' }
    return { l1: 'scenic', l3: 'scenic.historical.temple' }
  }
  if (tags.leisure === 'park' || tags.leisure === 'garden') return { l1: 'scenic', l3: 'scenic.park.urban' }
  if (tags.boundary === 'national_park') return { l1: 'scenic', l3: 'scenic.park.national' }
  if (tags.tourism === 'zoo') return { l1: 'scenic', l3: 'scenic.park.zoo' }

  // 餐饮
  if (tags.amenity === 'restaurant') return { l1: 'food', l3: 'food.local.signature' }
  if (tags.amenity === 'cafe') return { l1: 'food', l3: 'food.cafe.coffee' }
  if (tags.amenity === 'fast_food') return { l1: 'food', l3: 'food.local.street' }
  if (tags.amenity === 'bar' || tags.amenity === 'pub') return { l1: 'food', l3: 'food.bar.pub' }
  if (tags.amenity === 'food_court') return { l1: 'food', l3: 'food.market.foodcourt' }

  // 购物
  if (tags.shop === 'mall' || tags.shop === 'department_store') return { l1: 'shopping', l3: 'shopping.mall.comprehensive' }
  if (tags.shop === 'supermarket') return { l1: 'shopping', l3: 'shopping.mall.comprehensive' }
  if (tags.amenity === 'marketplace') return { l1: 'shopping', l3: 'shopping.market.night' }
  if (tags.shop) return { l1: 'shopping', l3: 'shopping.specialty.local' }

  // 娱乐
  if (tags.tourism === 'theme_park') return { l1: 'entertainment', l3: 'entertainment.theme.amusement' }
  if (tags.tourism === 'aquarium') return { l1: 'entertainment', l3: 'entertainment.theme.zoo' }
  if (tags.leisure === 'water_park') return { l1: 'entertainment', l3: 'entertainment.theme.water' }
  if (tags.tourism === 'casino') return { l1: 'entertainment', l3: 'entertainment.casino.casino' }
  if (tags.amenity === 'nightclub') return { l1: 'entertainment', l3: 'entertainment.nightlife.club' }
  if (tags.amenity === 'theatre') return { l1: 'entertainment', l3: 'entertainment.show.theater' }

  // 体验
  if (tags.leisure === 'sports_centre' || tags.leisure === 'stadium') return { l1: 'experience', l3: 'experience.outdoor.hiking' }
  if (tags.sport === 'diving' || tags.sport === 'surfing') return { l1: 'experience', l3: 'experience.outdoor.diving' }
  if (tags.sport === 'skiing') return { l1: 'experience', l3: 'experience.outdoor.skiing' }
  if (tags.tourism === 'spa' || tags.amenity === 'spa') return { l1: 'experience', l3: 'experience.wellness.spa' }
  if (tags.natural === 'hot_spring' || tags.amenity === 'public_bath') return { l1: 'experience', l3: 'experience.wellness.hotspring' }

  // 酒店
  if (tags.tourism === 'hotel') return { l1: 'hotel', l3: 'hotel.comfort.fourstar' }
  if (tags.tourism === 'hostel') return { l1: 'hotel', l3: 'hotel.budget.hostel' }
  if (tags.tourism === 'guest_house') return { l1: 'hotel', l3: 'hotel.budget.guesthouse' }
  if (tags.tourism === 'motel') return { l1: 'hotel', l3: 'hotel.budget.chain' }
  if (tags.tourism === 'camp_site') return { l1: 'hotel', l3: 'hotel.special.tent' }

  return null
}

/* ── Foursquare/Google Category → 类目映射 ── */

export function externalCategoryToL3(
  source: 'foursquare' | 'google' | 'amap',
  externalCategory: string,
): { l1: L1Category; l3: string } | null {
  // 通用映射逻辑 - 根据来源的 category 关键字映射
  const lower = externalCategory.toLowerCase()

  if (/museum|gallery|science/.test(lower)) return { l1: 'experience', l3: 'experience.educational.museum' }
  if (/park|garden|zoo|aquarium/.test(lower)) return { l1: 'scenic', l3: 'scenic.park.urban' }
  if (/temple|church|shrine|mosque/.test(lower)) return { l1: 'scenic', l3: 'scenic.historical.temple' }
  if (/restaurant|dining/.test(lower)) return { l1: 'food', l3: 'food.local.signature' }
  if (/cafe|coffee|tea/.test(lower)) return { l1: 'food', l3: 'food.cafe.coffee' }
  if (/bar|pub|lounge|nightclub/.test(lower)) return { l1: 'food', l3: 'food.bar.pub' }
  if (/mall|shopping|store|market/.test(lower)) return { l1: 'shopping', l3: 'shopping.mall.comprehensive' }
  if (/amusement|theme|water.park/.test(lower)) return { l1: 'entertainment', l3: 'entertainment.theme.amusement' }
  if (/spa|wellness|massage/.test(lower)) return { l1: 'experience', l3: 'experience.wellness.spa' }
  if (/hotel|resort|hostel|inn/.test(lower)) return { l1: 'hotel', l3: 'hotel.comfort.fourstar' }
  if (/hiking|trekking|cycling|diving|surfing/.test(lower)) return { l1: 'experience', l3: 'experience.outdoor.hiking' }
  if (/beach|island/.test(lower)) return { l1: 'scenic', l3: 'scenic.natural.beach' }
  if (/mountain|hill/.test(lower)) return { l1: 'scenic', l3: 'scenic.natural.mountain' }
  if (/lake|river/.test(lower)) return { l1: 'scenic', l3: 'scenic.natural.lake' }
  if (/landmark|monument|attraction|tourist/.test(lower)) return { l1: 'scenic', l3: 'scenic.historical.ruins' }
  if (/street.food|food.court/.test(lower)) return { l1: 'food', l3: 'food.local.street' }

  return null
}
