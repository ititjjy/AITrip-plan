/**
 * dedup.ts – POI 去重合并模块 (v3 – 内容验证 + 跨类型保护)
 *
 * 解决 AI 模型返回的各类别中 POI 数据重复的问题。
 *
 * v3 改进 (在 v2 基础上)：
 *   - 新增内容相似度验证 (contentSimilarity)：比对费用/标签/时长
 *   - 跨类型保护：scenic+activity 代表不同体验，需三重确认才合并
 *   - 同名内容验证：即使名称完全相同，也需内容对齐才合并
 *   - 保留异名合并：简称-全称模式 (上野公园↔上野恩赐公园) 仍有效
 *
 * v2 保留功能：
 *   - 同时比对原名 (name) 和中文名 (nameZh)，取最大相似度
 *   - 柔和的地理衰减曲线 (500m→0.80 而非旧版 100m→0.50)
 *   - 扩展去重范围到 shopping 类别 (购物)
 *   - 过滤无效 POI (坐标为0、名称为"0"等AI幻觉数据)
 *
 * 合并规则：
 *   a. 跨类型同名：需名称≥90% + 内容≥65% + 地理≤2km 三重确认
 *   b. 同类型同名(≥95%)：需内容相似度≥65% 才合并
 *   c. 同类型近似名(90-95%)：需地理≤2km + 内容≥50% (简称-全称路径)
 *   d. 综合相似度 > 90% → 合并为同一 POI
 *   e. 描述的是一个地点 → 归入 scenic（景点）
 *   f. 描述的是一项活动 / 在某景点内的体验 → 归入 activity（娱乐体验）
 */

/* ═══════════════════════ Types ═══════════════════════ */

interface POI {
  id: string
  name: string
  nameZh?: string
  type: string
  image: string
  rating: number
  duration: number
  cost: number
  description: string
  address: string
  lat: number
  lng: number
  tags: string[]
  openTime: string
  closeTime: string
  recommendReason: string
  mealType?: string
  seasonScore?: number
}

/**
 * 将新格式 POI 归一化为旧格式（dedup 内部统一使用旧字段名）
 *
 * 新格式来自 spark 采集管道：
 *   namePrimary → name, categoryL1 → type, visitDuration → duration,
 *   operatingHours → openTime/closeTime
 */
function normalizePOI(poi: any): POI {
  // 已经是旧格式（有 name 和 type）则直接返回
  if (poi.name && poi.type) return poi as POI

  // 从 operatingHours 解析 openTime / closeTime
  let openTime = poi.openTime || ''
  let closeTime = poi.closeTime || ''
  if (!openTime && poi.operatingHours) {
    const match = String(poi.operatingHours).match(/(\d{1,2}:\d{2})\s*[-~]\s*(\d{1,2}:\d{2})/)
    if (match) { openTime = match[1]; closeTime = match[2] }
  }

  // 类目映射：spark 的 entertainment/experience → activity（前端标准类目）
  const rawCat = poi.categoryL1 || poi.type || 'scenic'
  const mappedType = (rawCat === 'entertainment' || rawCat === 'experience') ? 'activity' : rawCat

  return {
    id: poi.id || '',
    name: poi.namePrimary || poi.name || '',
    nameZh: poi.nameZh || '',
    type: mappedType,
    image: poi.image || '',
    rating: poi.rating || 0,
    duration: poi.visitDuration || poi.duration || 0,
    cost: poi.cost || 0,
    description: poi.description || '',
    address: poi.address || '',
    lat: poi.lat || 0,
    lng: poi.lng || 0,
    tags: poi.tags || [],
    openTime,
    closeTime,
    recommendReason: poi.recommendReason || '',
    mealType: poi.mealType,
    seasonScore: poi.seasonScore,
  }
}

/* ═══════════════════════ 1. 字符串相似度 ═══════════════════════ */

/**
 * 计算两个字符串的 Levenshtein 编辑距离
 * 使用优化的单行 DP 数组实现，空间复杂度 O(min(m,n))
 */
function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  // 让 b 成为更短的字符串以减少内存使用
  if (a.length < b.length) [a, b] = [b, a]

  const bLen = b.length
  const prev = new Array<number>(bLen + 1)

  // 初始化第一行
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

/**
 * 字符串相似度 (0-1)，基于 Levenshtein 距离
 * 1 = 完全相同, 0 = 完全不同
 */
function stringSimilarity(a: string, b: string): number {
  if (a === b) return 1
  if (a.length === 0 && b.length === 0) return 1
  if (a.length === 0 || b.length === 0) return 0

  // 预处理：去除多余空白、统一标点、转小写
  const normalize = (s: string) =>
    s.toLowerCase()
      .replace(/[\s\u3000]+/g, '') // 全角/半角空格
      .replace(/[（(]/g, '(')
      .replace(/[）)]/g, ')')
      .replace(/[，,。.、·・]/g, '')

  const na = normalize(a)
  const nb = normalize(b)

  if (na === nb) return 1
  if (na.length === 0 && nb.length === 0) return 1

  // 子串包含判定：如果一个名称完全包含另一个，视为高度相似
  // 例如 "昭和纪念公园" 完整包含在 "国营昭和纪念公园" 中
  if (na.length > 0 && nb.length > 0) {
    const [shorter, longer] = na.length <= nb.length ? [na, nb] : [nb, na]
    if (longer.includes(shorter)) {
      const containSim = shorter.length / longer.length
      // 当短串占长串 60%+ 时，几乎必定是同一实体的简称/全称
      // 提升到至少 0.92 以触发综合相似度的高相似路径 (含地理安全检查)
      // 当占比 <60% 时保守取 0.85 (如 "公园" 包含在 "上野公园" 中)
      const minSim = containSim >= 0.6 ? 0.92 : 0.85
      return Math.max(containSim, minSim)
    }
  }

  // ── 简称-全称模式 ──
  // 识别 "上野公园" vs "上野恩赐公园" 这类前缀+地理后缀相同、中间有修饰词差异的情况
  // 条件：共享相同的地理后缀 AND 一个前缀是另一个前缀的起始子串 AND 前缀≥2字符
  if (na.length >= 3 && nb.length >= 3) {
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
      // 通用后缀 (英文)
      'park', 'garden', 'gardens', 'museum', 'temple', 'shrine',
      'palace', 'castle', 'square', 'beach', 'university',
    ]

    for (const suffix of GEO_SUFFIXES) {
      const suf = suffix.toLowerCase()
      if (na.endsWith(suf) && nb.endsWith(suf)) {
        const prefA = na.slice(0, -suf.length)
        const prefB = nb.slice(0, -suf.length)
        if (prefA.length >= 2 && prefB.length >= 2) {
          const [shortPref, longPref] = prefA.length <= prefB.length
            ? [prefA, prefB] : [prefB, prefA]
          // 一个前缀是另一个前缀的起始部分 → 简称-全称关系 (中间插入修饰词)
          // 例: "上野" 是 "上野恩赐" 的开头 → 上野公园 = 上野恩赐公园
          if (longPref.startsWith(shortPref)) {
            return Math.max(0.90, shortPref.length / longPref.length)
          }
          // 一个前缀是另一个前缀的结尾部分 → 前缀修饰词模式
          // 例: "昭和纪念" 是 "国营昭和纪念" 的结尾 → 昭和纪念公园 = 国营昭和纪念公园
          if (longPref.endsWith(shortPref)) {
            return Math.max(0.90, shortPref.length / longPref.length)
          }
        }
      }
    }
  }

  const dist = levenshteinDistance(na, nb)
  const maxLen = Math.max(na.length, nb.length)
  return 1 - dist / maxLen
}

/* ═══════════════════════ 2. 经纬度相似度 ═══════════════════════ */

/**
 * 计算两点之间的 Haversine 距离 (米)
 */
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2)
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * 经纬度相似度 (0-1) — v2 柔和衰减
 *
 * AI 模型对同一地点返回的坐标通常有 100-700m 的偏差，
 * 旧版以 100m 为衰减基准导致相同地点被判为不同。
 * v2 以 500m 为衰减基准，更适应 AI 坐标噪声。
 *
 * 距离阈值：
 *   0m   → 1.00    100m → 0.96    200m → 0.86
 *   500m → 0.50    1km  → 0.20    2km  → 0.06
 */
function latlngSimilarity(lat1: number, lng1: number, lat2: number, lng2: number): number {
  if (!lat1 || !lng1 || !lat2 || !lng2) return 0.5
  const distance = haversineDistance(lat1, lng1, lat2, lng2)
  return 1 / (1 + Math.pow(distance / 500, 2))
}

/* ═══════════════════════ 3. 综合相似度 (v3) ═══════════════════════ */

/**
 * 名称相似度 — 同时比对原名和中文名，取较大值
 *
 * AI 模型可能给同一地点返回略微不同的原文名称，
 * 但中文名往往更稳定（由模型翻译统一），因此双轨比对更准确。
 */
function nameSimilarity(a: POI, b: POI): number {
  const origSim = stringSimilarity(a.name, b.name)

  // 跳过无效的 nameZh (如 "0"、空串)
  const aZh = a.nameZh && a.nameZh !== '0' && a.nameZh.length > 1 ? a.nameZh : ''
  const bZh = b.nameZh && b.nameZh !== '0' && b.nameZh.length > 1 ? b.nameZh : ''
  const zhSim = (aZh && bZh) ? stringSimilarity(aZh, bZh) : 0

  return Math.max(origSim, zhSim)
}

/**
 * 内容相似度 — 判断两个同名 POI 的实际内容是否一致 (0-1)
 *
 * 用于区分：
 *   - 真正重复（同一内容的多次出现）→ 内容相似度高 (≥0.65)
 *   - 意图变体（同一地点的不同体验角度）→ 内容相似度低 (<0.65)
 *
 * 例如：
 *   六义园(scenic, ¥30, 庭园/红叶) vs 六义园(activity, ¥300, 抹茶/文化体验)
 *   → costSim=0.1, tagSim=0, durSim=1.0 → contentSim≈0.23 → 非重复 ✓
 *
 *   千鸟渊绿道(scenic) vs 千鸟渊绿道(activity, 相同内容)
 *   → costSim≈1.0, tagSim≈0.5+, durSim≈1.0 → contentSim≈0.75+ → 重复 ✓
 *
 * 权重设计：费用 35% + 标签 45% + 时长 20%
 *
 * 费用差异是最可靠的体验区分信号（¥30赏景 vs ¥300体验课 = 完全不同）；
 * 标签是内容多样性的核心指标（同名POI标签0%重叠 = 不同角度推荐）；
 * 时长是辅助信号。
 */
function contentSimilarity(a: POI, b: POI): number {
  // 1. 费用比值 — 最可靠的体验区分信号
  let costSim: number
  if (a.cost === 0 && b.cost === 0) {
    costSim = 1.0 // 都免费 → 一致
  } else if (a.cost === 0 || b.cost === 0) {
    costSim = 0.0 // 一个免费一个收费 → 很可能不同体验
  } else {
    costSim = Math.min(a.cost, b.cost) / Math.max(a.cost, b.cost)
  }

  // 2. 标签 Jaccard 系数 — 内容多样性核心信号
  const tagsA = new Set(a.tags.map(t => t.toLowerCase()))
  const tagsB = new Set(b.tags.map(t => t.toLowerCase()))
  const intersection = [...tagsA].filter(t => tagsB.has(t)).length
  const unionSize = new Set([...tagsA, ...tagsB]).size
  const tagSim = unionSize > 0 ? intersection / unionSize : 0.5 // 都无标签 → 中性

  // 3. 时长比值 — 辅助信号
  let durSim: number
  if (a.duration > 0 && b.duration > 0) {
    durSim = Math.min(a.duration, b.duration) / Math.max(a.duration, b.duration)
  } else {
    durSim = 0.5 // 缺少数据时取中性值
  }

  // 加权：费用最重要，标签次之，时长辅助
  return costSim * 0.35 + tagSim * 0.45 + durSim * 0.20
}

/**
 * 综合相似度得分 (0-1) — v3 内容验证 + 跨类型保护
 *
 * v3 核心改进（解决误合并问题）：
 *
 *   1. 跨类型保护 (scenic ↔ activity)：
 *      不同类型代表同一地点的不同体验角度（如赏景 vs 活动体验），
 *      仅在名称≥90% + 内容≥55% + 地理≤2km 三重确认下才合并。
 *      阈值较宽松因为跨类型本身已是强保护屏障，只需排除明显不同体验。
 *
 *   2. 同名内容验证 (≥0.95)：
 *      即使名称完全相同，也需内容相似度≥70% 才判定为真正重复。
 *      同类型同名最易误合并（如目黑川×2），因此阈值最严格。
 *
 *   3. 简称-全称路径 (0.90-0.95)：
 *      地理安全检查 + 内容验证≥50%，保留异名合并能力。
 *      确保 上野公园↔上野恩赐公园 仍能正确合并。
 *
 *   4. 常规路径：名称 50% + 地址 25% + 坐标 25%
 */
function compositeSimilarity(a: POI, b: POI): number {
  const nameSim = nameSimilarity(a, b)

  // ── 跨类型保护 ──
  // 不同类型的 POI 代表同一地点的不同体验角度
  // 例：六义园(scenic, ¥30) vs 六义园(activity, ¥300) = 赏庭园 vs 抹茶体验
  // 只有内容也高度一致时才视为真正重复
  const crossType = a.type !== b.type

  if (crossType) {
    const cSim = contentSimilarity(a, b)
    const geoSim = latlngSimilarity(a.lat, a.lng, b.lat, b.lng)

    // 三重确认：名称相似 + 内容一致 + 地理邻近 → 真正重复
    if (nameSim >= 0.90 && cSim >= 0.55 && geoSim >= 0.06) return nameSim

    // 跨类型未通过严格检查 → 内容加权降低分数，防止常规路径误合并
    // 内容占35%权重：不同体验(cSim≈0.2)会将总分拉到≈0.7，远低于0.9阈值
    const addrSim = stringSimilarity(a.address, b.address)
    return nameSim * 0.25 + cSim * 0.35 + addrSim * 0.20 + geoSim * 0.20
  }

  // ── 同类型路径 ──

  // 近完全同名 (≥0.95)：仍需内容验证
  // 防止同名不同体验的变体被误合并 (如 目黑川×2、隅田公园×2)
  if (nameSim >= 0.95) {
    const cSim = contentSimilarity(a, b)
    if (cSim >= 0.70) return nameSim // 名称 + 内容都一致 → 真正重复
    // 内容差异大 → 用混合分数（通常 < 0.9 阈值，避免合并）
    return nameSim * 0.50 + cSim * 0.50
  }

  // 高相似名称 (0.90-0.95)：地理安全检查 + 内容验证
  // 覆盖简称-全称模式 (如 上野公园 ↔ 上野恩赐公园)
  if (nameSim >= 0.90) {
    const geoSim = latlngSimilarity(a.lat, a.lng, b.lat, b.lng)
    if (geoSim >= 0.06) {
      const cSim = contentSimilarity(a, b)
      if (cSim >= 0.50) return nameSim // 地理近 + 内容近 → 合并
    }
    // 地理远或内容差异大 → 降级到常规路径
  }

  // ── 常规加权路径 ──
  const addrSim = stringSimilarity(a.address, b.address)
  const geoSim = latlngSimilarity(a.lat, a.lng, b.lat, b.lng)

  return nameSim * 0.50 + addrSim * 0.25 + geoSim * 0.25
}

/* ═══════════════════════ 4. POI 类型判定 ═══════════════════════ */

/** 景点(地点)关键词 — 描述的是一个物理性的固定地点 */
const SCENIC_KEYWORDS = [
  // 自然景观
  '公园', '花园', '植物园', '动物园', '山', '湖', '河', '海',
  '瀑布', '峡谷', '森林', '岛', '海滩', '沙滩', '湿地', '草原',
  // 人文建筑
  '寺', '庙', '神社', '教堂', '清真寺', '塔', '城堡', '宫殿',
  '故居', '陵墓', '纪念碑', '纪念馆', '博物馆', '美术馆', '画廊',
  '图书馆', '大学',
  // 城市地标
  '广场', '街', '路', '巷', '胡同', '古镇', '古城', '老城',
  '桥', '码头', '港', '灯塔', '钟楼', '鼓楼', '城门', '城墙',
  // 景区/遗址
  '遗址', '遗迹', '世界遗产', '景区', '风景区', '保护区',
  // 通用
  'park', 'garden', 'temple', 'shrine', 'museum', 'castle',
  'palace', 'bridge', 'tower', 'square', 'beach', 'lake',
  'mountain', 'island', 'cathedral', 'monument', 'memorial',
  'gallery', 'library', 'university',
]

/** 娱乐活动关键词 — 描述的是一种活动或体验 */
const ACTIVITY_KEYWORDS = [
  // 体验活动
  '体验', '活动', '表演', '演出', '秀', '节目', '游览',
  '骑行', '徒步', '攀岩', '潜水', '冲浪', '滑雪', '跳伞',
  '漂流', '蹦极', '飞行', '帆船', '皮划艇', '游船',
  // 休闲娱乐
  'SPA', 'spa', '温泉', '按摩', '瑜伽', '冥想',
  '烹饪课', '手工', '工坊', '工作坊', '课程', '学习', '制作',
  '茶道', '花道', '书法', '陶艺', '绘画',
  // 夜生活
  '夜游', '夜景', '酒吧', '夜市', '夜间',
  // 观赏型活动
  '观鲸', '观鸟', '赏花', '赏樱', '看日落', '日出',
  '烟花', '灯光秀',
  // 通用
  'experience', 'tour', 'class', 'workshop', 'cruise',
  'diving', 'surfing', 'skiing', 'hiking', 'cycling',
  'rafting', 'yoga', 'cooking', 'performance', 'show',
]

/**
 * 分析 POI 描述、名称和标签，判定其应归类为 scenic 还是 activity
 *
 * 策略：
 *   1. 名称后缀优先级最高（后缀直接决定类型的强信号）
 *   2. 对名称和描述中的关键词分别打分
 *   3. 名称中的关键词权重 ×2
 *   4. 哪类得分更高就归入哪类
 *   5. 平局时偏向 scenic（保守策略）
 */
function classifyType(poi: POI): 'scenic' | 'activity' {
  let scenicScore = 0
  let activityScore = 0

  const nameText = poi.name.toLowerCase()
  const nameZhText = (poi.nameZh || '').toLowerCase()
  const descText = (poi.description + ' ' + poi.recommendReason).toLowerCase()
  const tagText = poi.tags.join(' ').toLowerCase()
  const allText = nameText + ' ' + nameZhText + ' ' + descText + ' ' + tagText

  // ── 名称后缀强信号（同时检查原名和中文名）──
  const scenicSuffixes = [
    '寺', '庙', '宫', '殿', '阁', '庵', '院', '堂', '观',
    '山', '湖', '河', '海', '岛', '滩', '峰', '谷', '瀑布',
    '公园', '花园', '植物园', '动物园',
    '博物馆', '美术馆', '纪念馆', '展览馆', '科技馆',
    '广场', '古镇', '古城', '遗址',
    '城堡', '教堂', '大教堂', '清真寺',
    '塔', '桥', '城墙', '故居',
    '绿道', '庭园', '庭院', '花苑', '御苑',
    'park', 'garden', 'temple', 'shrine', 'museum',
    'castle', 'palace', 'bridge', 'tower', 'square',
    'beach', 'lake', 'mountain', 'island',
  ]
  const activitySuffixes = [
    '体验', '活动', '课程', '工坊', '工作坊',
    '表演', '演出', '秀',
    '游览', '之旅', '一日游',
    '骑行', '徒步', '潜水', '冲浪', '滑雪', '攀岩',
    '漂流', '蹦极', '跳伞',
    'experience', 'tour', 'class', 'workshop',
    'cruise', 'diving', 'surfing', 'hiking',
  ]

  // 同时对原名和中文名检查后缀
  const namesToCheck = [nameText, nameZhText].filter(Boolean)
  for (const suffix of scenicSuffixes) {
    if (namesToCheck.some(n => n.endsWith(suffix.toLowerCase()))) {
      scenicScore += 5
      break
    }
  }
  for (const suffix of activitySuffixes) {
    if (namesToCheck.some(n => n.endsWith(suffix.toLowerCase()))) {
      activityScore += 5
      break
    }
  }

  // ── 通用关键词匹配 ──
  for (const kw of SCENIC_KEYWORDS) {
    const kwLower = kw.toLowerCase()
    if (nameText.includes(kwLower)) scenicScore += 2
    else if (allText.includes(kwLower)) scenicScore += 1
  }

  for (const kw of ACTIVITY_KEYWORDS) {
    const kwLower = kw.toLowerCase()
    if (nameText.includes(kwLower)) activityScore += 2
    else if (allText.includes(kwLower)) activityScore += 1
  }

  // ── 语义动词判定 ──
  const activityVerbs = /(?:可以|能够|提供|开设|组织|参加|享受|尝试|学习|观看|参与|乘坐|搭乘).{0,10}(?:活动|体验|课程|表演|项目|游览|服务|行程)/
  if (activityVerbs.test(descText)) activityScore += 2

  const scenicVerbs = /(?:位于|坐落|坐落于|建于|始建于|矗立|耸立|占地|修建|重建|落成|开放于)/
  if (scenicVerbs.test(descText)) scenicScore += 2

  // 平局时偏向 scenic
  return activityScore > scenicScore ? 'activity' : 'scenic'
}

/* ═══════════════════════ 5. 合并策略 ═══════════════════════ */

/**
 * 合并两个重复 POI，保留更优质的数据
 *
 * 策略：
 *   - 保留描述更详细的那个作为基础
 *   - 合并标签（去重取并集）
 *   - 保留更高的评分
 *   - 保留更高的 seasonScore
 *   - 保留更长的 description（通常信息更丰富）
 *   - 类型由 classifyType() 重新判定
 */
function mergePOIs(a: POI, b: POI): POI {
  // 选择"基础 POI"：描述更详细的优先
  const aScore = a.description.length + (a.recommendReason?.length || 0)
  const bScore = b.description.length + (b.recommendReason?.length || 0)
  const [primary, secondary] = aScore >= bScore ? [a, b] : [b, a]

  // 合并标签（去重）
  const mergedTags = [...new Set([...primary.tags, ...secondary.tags])].slice(0, 6)

  // 重新判定类型
  const mergedType = classifyType(primary)

  return {
    ...primary,
    type: mergedType,
    rating: Math.max(primary.rating, secondary.rating),
    seasonScore: Math.max(primary.seasonScore || 0, secondary.seasonScore || 0) || undefined,
    tags: mergedTags,
    // 如果 primary 没有推荐理由但 secondary 有，补上
    recommendReason: primary.recommendReason || secondary.recommendReason || '',
  }
}

/* ═══════════════════════ 6. 去重主函数 ═══════════════════════ */

/** 去重统计信息 */
export interface DedupStats {
  /** 去重前 scenic 类 POI 数量 */
  scenicBefore: number
  /** 去重前 activity 类 POI 数量 */
  activityBefore: number
  /** 发现的重复对数量 */
  duplicatePairs: number
  /** 合并后移除的 POI 数量 */
  removedCount: number
  /** 类型被重新分类的 POI 数量 */
  reclassifiedCount: number
  /** 无效数据被过滤的数量 */
  invalidFiltered: number
  /** 去重后 scenic 类 POI 数量 */
  scenicAfter: number
  /** 去重后 activity 类 POI 数量 */
  activityAfter: number
  /** 每对重复的详细信息 */
  details: Array<{
    poiA: string
    poiB: string
    similarity: number
    mergedAs: string
    keptType: string
  }>
}

/**
 * 判断 POI 是否为无效数据 (AI 幻觉)
 *
 * 常见无效模式：
 *   - 坐标为 (0, 0) — 模型未能生成有效坐标
 *   - 名称/中文名为数字或空白 — 解析错误
 *   - 名称长度不足 — 无意义数据
 */
function isInvalidPOI(poi: POI): boolean {
  // 坐标都为 0 或缺失
  if (poi.lat === 0 && poi.lng === 0) return true
  // 名称为数字字符串（如 "0"）
  if (/^\d+$/.test(poi.name.trim())) return true
  // 中文名为数字或空白
  if (poi.nameZh && /^\d*$/.test(poi.nameZh.trim())) return true
  // 名称过短（单字符）
  if (poi.name.trim().length < 2) return true
  return false
}

/**
 * 对 POI 列表进行去重合并 (v2)
 *
 * v2 改进：
 *   - 扩展去重范围：scenic + activity + shopping 全部参与去重
 *   - 增加无效数据预过滤 (坐标0/0、名称为数字等)
 *   - 使用 v2 综合相似度 (nameZh双轨 + 同名快速路径)
 *
 * 算法流程：
 *   1. 过滤无效 POI (AI 幻觉数据)
 *   2. 提取 scenic/activity/shopping 类型参与去重
 *   3. 两两计算综合相似度 (v2)
 *   4. 相似度 ≥ threshold 的标记为重复对
 *   5. Union-Find 将传递性重复归为一组
 *   6. 每组保留一个合并后的 POI，重新判定类型
 *   7. 与 food 类型合并返回
 */
export function deduplicatePOIs(
  rawPois: POI[],
  threshold = 0.9,
): { pois: POI[]; stats: DedupStats } {
  // 0. 归一化 POI 格式（兼容新旧数据）
  const pois = rawPois.map(normalizePOI)

  // 1. 过滤无效 POI
  const validPOIs: POI[] = []
  let invalidCount = 0
  for (const poi of pois) {
    if (isInvalidPOI(poi)) {
      invalidCount++
    } else {
      validPOIs.push(poi)
    }
  }

  // 1. 分离参与去重的类型 (scenic/activity/shopping) 和不参与的 (food)
  const DEDUP_TYPES = ['scenic', 'activity', 'shopping']
  const candidates: POI[] = []
  const others: POI[] = []

  for (const poi of validPOIs) {
    if (DEDUP_TYPES.includes(poi.type)) {
      candidates.push(poi)
    } else {
      others.push(poi)
    }
  }

  const stats: DedupStats = {
    scenicBefore: candidates.filter(p => p.type === 'scenic').length,
    activityBefore: candidates.filter(p => p.type === 'activity').length,
    duplicatePairs: 0,
    removedCount: 0,
    reclassifiedCount: 0,
    invalidFiltered: invalidCount,
    scenicAfter: 0,
    activityAfter: 0,
    details: [],
  }

  if (candidates.length === 0) {
    return { pois: validPOIs, stats }
  }

  // 即使只有1个 candidate 也需要执行类型重分类（仅 scenic/activity）
  if (candidates.length === 1) {
    const poi = candidates[0]
    if (poi.type === 'scenic' || poi.type === 'activity') {
      const newType = classifyType(poi)
      if (newType !== poi.type) stats.reclassifiedCount++
      const reclassified = { ...poi, type: newType }
      stats.scenicAfter = newType === 'scenic' ? 1 : 0
      stats.activityAfter = newType === 'activity' ? 1 : 0
      return { pois: [...others, reclassified], stats }
    }
    return { pois: [...others, poi], stats }
  }

  // 2. Union-Find 数据结构
  const parent = new Map<number, number>()
  const rank = new Map<number, number>()

  function find(x: number): number {
    if (!parent.has(x)) { parent.set(x, x); rank.set(x, 0) }
    if (parent.get(x) !== x) parent.set(x, find(parent.get(x)!))
    return parent.get(x)!
  }

  function union(x: number, y: number) {
    const rx = find(x), ry = find(y)
    if (rx === ry) return
    const rankX = rank.get(rx) || 0
    const rankY = rank.get(ry) || 0
    if (rankX < rankY) parent.set(rx, ry)
    else if (rankX > rankY) parent.set(ry, rx)
    else { parent.set(ry, rx); rank.set(rx, rankX + 1) }
  }

  // 3. 两两比较，找出所有相似度 > threshold 的对
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const sim = compositeSimilarity(candidates[i], candidates[j])
      if (sim >= threshold) {
        union(i, j)
        stats.duplicatePairs++
        stats.details.push({
          poiA: `[${candidates[i].type}] ${candidates[i].name}`,
          poiB: `[${candidates[j].type}] ${candidates[j].name}`,
          similarity: Math.round(sim * 1000) / 1000,
          mergedAs: '', // 稍后填充
          keptType: '', // 稍后填充
        })
      }
    }
  }

  // 4. 按组合并
  const groups = new Map<number, number[]>()
  for (let i = 0; i < candidates.length; i++) {
    const root = find(i)
    if (!groups.has(root)) groups.set(root, [])
    groups.get(root)!.push(i)
  }

  const deduped: POI[] = []
  let detailIdx = 0

  for (const [, indices] of groups) {
    if (indices.length === 1) {
      // 单独的 POI，无重复 — scenic/activity 可重新分类
      const poi = candidates[indices[0]]
      if (poi.type === 'scenic' || poi.type === 'activity') {
        const newType = classifyType(poi)
        if (newType !== poi.type) {
          stats.reclassifiedCount++
        }
        deduped.push({ ...poi, type: newType })
      } else {
        // shopping 类型保持不变
        deduped.push({ ...poi })
      }
    } else {
      // 多个 POI 需要合并
      let merged = candidates[indices[0]]
      for (let k = 1; k < indices.length; k++) {
        merged = mergePOIs(merged, candidates[indices[k]])
      }

      // 如果组内全是 shopping 类型，保持 shopping；否则已由 mergePOIs→classifyType 判定
      const allShopping = indices.every(i => candidates[i].type === 'shopping')
      if (allShopping) {
        merged = { ...merged, type: 'shopping' }
      }

      deduped.push(merged)
      stats.removedCount += indices.length - 1

      // 填充 detail 中的合并信息
      // 遍历 details 找到属于当前 group 的记录
      for (let d = detailIdx; d < stats.details.length; d++) {
        const detail = stats.details[d]
        const namesInGroup = indices.map(i => candidates[i].name)
        if (namesInGroup.some(n => detail.poiA.includes(n)) ||
            namesInGroup.some(n => detail.poiB.includes(n))) {
          detail.mergedAs = merged.name
          detail.keptType = merged.type
        }
      }
    }
  }

  stats.scenicAfter = deduped.filter(p => p.type === 'scenic').length
  stats.activityAfter = deduped.filter(p => p.type === 'activity').length

  // 5. 重新生成 ID（保持连续性）
  const result = [...others, ...deduped]
  let idx = 0
  for (const poi of result) {
    idx++
    // 保持 id 前缀格式一致
    const prefix = poi.id.replace(/-\d+$/, '')
    poi.id = `${prefix}-${idx}`
  }

  return { pois: result, stats }
}
