import type { City } from '@/types'

/* ═══════════════════════════════════════════════════════════════════
 * 目的地数据 – 国内 Top 100 + 国际 Top 100（当季热门）
 * 包含拼音索引 / 旅游热度 / 国家分组等元数据
 * ═══════════════════════════════════════════════════════════════════ */

export interface DestinationCity extends City {
  /** 大洲 */
  continent: string
  /** 省份/州 */
  province: string
  /** Full pinyin (no tones, no spaces), e.g. "dongjing" */
  pinyin: string
  /** Abbreviated pinyin initials, e.g. "dj" for 东京 */
  pinyinAbbr: string
  /** First letter, uppercase, e.g. "D" */
  pinyinInitial: string
  /** Whether it's a domestic (China) city */
  isDomestic: boolean
  /** Seasonal hotness index 0-100 */
  hotness: number
  /** Country pinyin, e.g. "riben" for 日本 */
  countryPinyin: string
  /** Country pinyin first letter, e.g. "R" */
  countryPinyinInitial: string
  /** Country flag emoji */
  countryFlag: string
}

/* ── Helper: convert DestinationCity → City (strip extra fields) ── */
export function toCity(d: DestinationCity): City {
  return {
    id: d.id,
    name: d.name,
    nameEn: d.nameEn,
    continent: d.continent,
    country: d.country,
    province: d.province,
    image: d.image,
    description: d.description,
    avgDailyBudget: d.avgDailyBudget,
    currency: d.currency,
    timezone: d.timezone,
    tags: d.tags,
    lat: d.lat,
    lng: d.lng,
    isDomestic: d.isDomestic,
  }
}

/* ═══════════════════════════════════════════════════════════════════
 * 国内 Top 100 城市（含当季热度）
 * ═══════════════════════════════════════════════════════════════════ */

const domesticCities: DestinationCity[] = [
  {
    id: 'sanya', name: '三亚', nameEn: 'Sanya',
    pinyin: 'sanya', pinyinAbbr: 'sy', pinyinInitial: 'S',
    country: '中国', countryPinyin: 'hainan', countryPinyinInitial: 'H', continent: '亚洲', province: '海南',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 93,
    image: 'https://images.unsplash.com/photo-1559628233-100c798642d4?w=800&h=600&fit=crop',
    description: '中国最南端的热带滨海旅游城市，椰风海韵四季如夏',
    avgDailyBudget: 800, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['海滩', '度假', '潜水', '热带'],
    lat: 18.2528, lng: 109.5120,
  },
  {
    id: 'chengdu', name: '成都', nameEn: 'Chengdu',
    pinyin: 'chengdu', pinyinAbbr: 'cd', pinyinInitial: 'C',
    country: '中国', countryPinyin: 'sichuan', countryPinyinInitial: 'S', continent: '亚洲', province: '四川',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 90,
    image: 'https://images.unsplash.com/photo-1740754588312-08365583271d?w=800&h=600&fit=crop',
    description: '美食之都，大熊猫故乡，悠闲的天府之国',
    avgDailyBudget: 500, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['美食', '熊猫', '休闲', '火锅'],
    lat: 30.5728, lng: 104.0668,
  },
  {
    id: 'hangzhou', name: '杭州', nameEn: 'Hangzhou',
    pinyin: 'hangzhou', pinyinAbbr: 'hz', pinyinInitial: 'H',
    country: '中国', countryPinyin: 'zhejiang', countryPinyinInitial: 'Z', continent: '亚洲', province: '浙江',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 91,
    image: 'https://images.unsplash.com/photo-1675764031141-80368d518cc4?w=800&h=600&fit=crop',
    description: '人间天堂，西湖春色满园，江南最美的城市',
    avgDailyBudget: 600, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['西湖', '江南', '茶文化', '园林'],
    lat: 30.2741, lng: 120.1551,
  },
  {
    id: 'chongqing', name: '重庆', nameEn: 'Chongqing',
    pinyin: 'chongqing', pinyinAbbr: 'cq', pinyinInitial: 'C',
    country: '中国', countryPinyin: 'chongqing', countryPinyinInitial: 'C', continent: '亚洲', province: '重庆',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 88,
    image: 'https://images.unsplash.com/photo-1740575864268-c9f3b13d1aa3?w=800&h=600&fit=crop',
    description: '8D魔幻山城，洪崖洞夜景与火锅之城',
    avgDailyBudget: 450, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['火锅', '夜景', '山城', '网红'],
    lat: 29.5630, lng: 106.5516,
  },
  {
    id: 'beijing', name: '北京', nameEn: 'Beijing',
    pinyin: 'beijing', pinyinAbbr: 'bj', pinyinInitial: 'B',
    country: '中国', countryPinyin: 'beijing', countryPinyinInitial: 'B', continent: '亚洲', province: '北京',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 85,
    image: 'https://images.unsplash.com/photo-1508804185872-d7badad00f7d?w=800&h=600&fit=crop',
    description: '千年古都，故宫长城颐和园，文化底蕴深厚',
    avgDailyBudget: 700, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['历史', '故宫', '长城', '文化'],
    lat: 39.9042, lng: 116.4074,
  },
  {
    id: 'shanghai', name: '上海', nameEn: 'Shanghai',
    pinyin: 'shanghai', pinyinAbbr: 'sh', pinyinInitial: 'S',
    country: '中国', countryPinyin: 'shanghai', countryPinyinInitial: 'S', continent: '亚洲', province: '上海',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 86,
    image: 'https://images.unsplash.com/photo-1647066501166-54b17d88e61b?w=800&h=600&fit=crop',
    description: '东方明珠璀璨夜景，外滩万国建筑群的都市风情',
    avgDailyBudget: 750, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['都市', '购物', '外滩', '时尚'],
    lat: 31.2304, lng: 121.4737,
  },
  {
    id: 'xian', name: '西安', nameEn: "Xi'an",
    pinyin: 'xian', pinyinAbbr: 'xa', pinyinInitial: 'X',
    country: '中国', countryPinyin: 'shaanxi', countryPinyinInitial: 'S', continent: '亚洲', province: '陕西',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 82,
    image: 'https://images.unsplash.com/photo-1547981609-4b6bfe67ca0b?w=800&h=600&fit=crop',
    description: '十三朝古都，兵马俑与大唐不夜城的历史穿越',
    avgDailyBudget: 500, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['兵马俑', '古都', '美食', '历史'],
    lat: 34.3416, lng: 108.9398,
  },
  {
    id: 'xiamen', name: '厦门', nameEn: 'Xiamen',
    pinyin: 'xiamen', pinyinAbbr: 'xm', pinyinInitial: 'X',
    country: '中国', countryPinyin: 'fujian', countryPinyinInitial: 'F', continent: '亚洲', province: '福建',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 84,
    image: 'https://images.unsplash.com/photo-1564415315949-7a0c4c73aab4?w=800&h=600&fit=crop',
    description: '海上花园城市，鼓浪屿的文艺与闽南风情',
    avgDailyBudget: 550, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['鼓浪屿', '文艺', '海滨', '闽南'],
    lat: 24.4798, lng: 118.0894,
  },
  {
    id: 'dali', name: '大理', nameEn: 'Dali',
    pinyin: 'dali', pinyinAbbr: 'dl', pinyinInitial: 'D',
    country: '中国', countryPinyin: 'yunnan', countryPinyinInitial: 'Y', continent: '亚洲', province: '云南',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 89,
    image: 'https://images.unsplash.com/photo-1528181304800-259b08848526?w=800&h=600&fit=crop',
    description: '风花雪月，苍山洱海间的诗意栖居',
    avgDailyBudget: 400, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['洱海', '古城', '文艺', '自然'],
    lat: 25.6065, lng: 100.2676,
  },
  {
    id: 'lijiang', name: '丽江', nameEn: 'Lijiang',
    pinyin: 'lijiang', pinyinAbbr: 'lj', pinyinInitial: 'L',
    country: '中国', countryPinyin: 'yunnan', countryPinyinInitial: 'Y', continent: '亚洲', province: '云南',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 87,
    image: 'https://images.unsplash.com/photo-1583417319070-4a69db38a482?w=800&h=600&fit=crop',
    description: '世界文化遗产古城，玉龙雪山下的纳西风情',
    avgDailyBudget: 450, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['古城', '雪山', '纳西族', '慢生活'],
    lat: 26.8721, lng: 100.2299,
  },
  {
    id: 'guilin', name: '桂林', nameEn: 'Guilin',
    pinyin: 'guilin', pinyinAbbr: 'gl', pinyinInitial: 'G',
    country: '中国', countryPinyin: 'guangxi', countryPinyinInitial: 'G', continent: '亚洲', province: '广西',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 83,
    image: 'https://images.unsplash.com/photo-1773318901379-aac92fdf5611?w=800&h=600&fit=crop',
    description: '山水甲天下，漓江竹筏与阳朔西街的田园诗',
    avgDailyBudget: 400, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['山水', '漓江', '溶洞', '田园'],
    lat: 25.2742, lng: 110.2900,
  },
  {
    id: 'suzhou', name: '苏州', nameEn: 'Suzhou',
    pinyin: 'suzhou', pinyinAbbr: 'sz', pinyinInitial: 'S',
    country: '中国', countryPinyin: 'jiangsu', countryPinyinInitial: 'J', continent: '亚洲', province: '江苏',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 80,
    image: 'https://images.unsplash.com/photo-1647594701022-e995313b6fe4?w=800&h=600&fit=crop',
    description: '上有天堂下有苏杭，古典园林与江南水乡',
    avgDailyBudget: 550, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['园林', '江南', '水乡', '昆曲'],
    lat: 31.2989, lng: 120.5853,
  },
  {
    id: 'nanjing', name: '南京', nameEn: 'Nanjing',
    pinyin: 'nanjing', pinyinAbbr: 'nj', pinyinInitial: 'N',
    country: '中国', countryPinyin: 'jiangsu', countryPinyinInitial: 'J', continent: '亚洲', province: '江苏',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 78,
    image: 'https://images.unsplash.com/photo-1594736797933-d0501ba2fe65?w=800&h=600&fit=crop',
    description: '六朝古都，梅花山春色与秦淮河畔的历史韵味',
    avgDailyBudget: 500, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['古都', '梅花', '秦淮河', '历史'],
    lat: 32.0603, lng: 118.7969,
  },
  {
    id: 'qingdao', name: '青岛', nameEn: 'Qingdao',
    pinyin: 'qingdao', pinyinAbbr: 'qd', pinyinInitial: 'Q',
    country: '中国', countryPinyin: 'shandong', countryPinyinInitial: 'S', continent: '亚洲', province: '山东',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 76,
    image: 'https://images.unsplash.com/photo-1569937756447-1d44f657dc69?w=800&h=600&fit=crop',
    description: '红瓦绿树碧海蓝天，啤酒之都的海滨风情',
    avgDailyBudget: 500, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['海滨', '啤酒', '欧式', '海鲜'],
    lat: 36.0671, lng: 120.3826,
  },
  {
    id: 'changsha', name: '长沙', nameEn: 'Changsha',
    pinyin: 'changsha', pinyinAbbr: 'cs', pinyinInitial: 'C',
    country: '中国', countryPinyin: 'hunan', countryPinyinInitial: 'H', continent: '亚洲', province: '湖南',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 79,
    image: 'https://images.unsplash.com/photo-1655213353803-520e7863a4fe?w=800&h=600&fit=crop',
    description: '美食娱乐之城，橘子洲头与超级文和友的城市活力',
    avgDailyBudget: 400, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['美食', '夜生活', '臭豆腐', '网红'],
    lat: 28.2282, lng: 112.9388,
  },
  {
    id: 'wuhan', name: '武汉', nameEn: 'Wuhan',
    pinyin: 'wuhan', pinyinAbbr: 'wh', pinyinInitial: 'W',
    country: '中国', countryPinyin: 'hubei', countryPinyinInitial: 'H', continent: '亚洲', province: '湖北',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 92,
    image: 'https://images.unsplash.com/photo-1522383225653-ed111181a951?w=800&h=600&fit=crop',
    description: '春季赏樱胜地，武大樱花与黄鹤楼的诗意城市',
    avgDailyBudget: 450, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['樱花', '黄鹤楼', '热干面', '历史'],
    lat: 30.5928, lng: 114.3055,
  },
  {
    id: 'lasa', name: '拉萨', nameEn: 'Lhasa',
    pinyin: 'lasa', pinyinAbbr: 'ls', pinyinInitial: 'L',
    country: '中国', countryPinyin: 'xizang', countryPinyinInitial: 'X', continent: '亚洲', province: '西藏',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 70,
    image: 'https://images.unsplash.com/photo-1626359909709-8067b64e1655?w=800&h=600&fit=crop',
    description: '日光之城，布达拉宫与藏传佛教的心灵圣地',
    avgDailyBudget: 600, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['圣地', '布达拉宫', '藏文化', '高原'],
    lat: 29.6500, lng: 91.1000,
  },
  {
    id: 'zhangjiajie', name: '张家界', nameEn: 'Zhangjiajie',
    pinyin: 'zhangjiajie', pinyinAbbr: 'zjj', pinyinInitial: 'Z',
    country: '中国', countryPinyin: 'hunan', countryPinyinInitial: 'H', continent: '亚洲', province: '湖南',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 75,
    image: 'https://images.unsplash.com/photo-1513415564515-763d91423bdd?w=800&h=600&fit=crop',
    description: '阿凡达取景地，奇峰异石的世界地质奇观',
    avgDailyBudget: 450, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['奇峰', '玻璃桥', '自然', '探险'],
    lat: 29.1170, lng: 110.4793,
  },
  {
    id: 'huangshan', name: '黄山', nameEn: 'Huangshan',
    pinyin: 'huangshan', pinyinAbbr: 'hs', pinyinInitial: 'H',
    country: '中国', countryPinyin: 'anhui', countryPinyinInitial: 'A', continent: '亚洲', province: '安徽',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 77,
    image: 'https://images.unsplash.com/photo-1543158181-e6f9f6712055?w=800&h=600&fit=crop',
    description: '五岳归来不看山，迎客松与云海日出的绝美仙境',
    avgDailyBudget: 500, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['云海', '日出', '迎客松', '徒步'],
    lat: 30.1313, lng: 118.1680,
  },
  {
    id: 'kunming', name: '昆明', nameEn: 'Kunming',
    pinyin: 'kunming', pinyinAbbr: 'km', pinyinInitial: 'K',
    country: '中国', countryPinyin: 'yunnan', countryPinyinInitial: 'Y', continent: '亚洲', province: '云南',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 81,
    image: 'https://images.unsplash.com/photo-1596895111956-bf1cf0599ce5?w=800&h=600&fit=crop',
    description: '四季如春的春城，滇池与石林的自然画卷',
    avgDailyBudget: 400, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['春城', '滇池', '鲜花', '气候宜人'],
    lat: 25.0389, lng: 102.7183,
  },
  // ═══ 千问 API 生成的国内城市数据（2026-03-24）═══
  {
    id: 'guangzhou', name: '广州', nameEn: 'Guangzhou',
    pinyin: 'guangzhou', pinyinAbbr: 'gz', pinyinInitial: 'G',
    country: '中国', countryPinyin: 'guangdong', countryPinyinInitial: 'G', continent: '亚洲', province: '广东',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 82,
    image: 'https://images.unsplash.com/photo-1585669666867-f4eee227eb04?w=800&h=600&fit=crop',
    description: '千年商都，早茶烟火气与珠江夜韵交织',
    avgDailyBudget: 550, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['早茶', '粤菜', '珠江', '岭南'],
    lat: 23.1291, lng: 113.2644,
  },
  {
    id: 'shenzhen', name: '深圳', nameEn: 'Shenzhen',
    pinyin: 'shenzhen', pinyinAbbr: 'szh', pinyinInitial: 'S',
    country: '中国', countryPinyin: 'guangdong', countryPinyinInitial: 'G', continent: '亚洲', province: '广东',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 81,
    image: 'https://images.unsplash.com/photo-1724243040324-aa945e452d8b?w=800&h=600&fit=crop',
    description: '先锋都市森林，科技与滨海生态共生之地',
    avgDailyBudget: 680, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['科技', '滨海', '设计', '年轻'],
    lat: 22.5431, lng: 114.0579,
  },
  {
    id: 'tianjin', name: '天津', nameEn: 'Tianjin',
    pinyin: 'tianjin', pinyinAbbr: 'tj', pinyinInitial: 'T',
    country: '中国', countryPinyin: 'tianjin', countryPinyinInitial: 'T', continent: '亚洲', province: '天津',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 79,
    image: 'https://images.unsplash.com/photo-1721029065200-2605130cc2db?w=800&h=600&fit=crop',
    description: '曲艺码头，海河蜿蜒处的中西建筑交响',
    avgDailyBudget: 420, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['相声', '海河', '洋楼', '小吃'],
    lat: 39.0842, lng: 117.1993,
  },
  {
    id: 'ningbo', name: '宁波', nameEn: 'Ningbo',
    pinyin: 'ningbo', pinyinAbbr: 'nb', pinyinInitial: 'N',
    country: '中国', countryPinyin: 'zhejiang', countryPinyinInitial: 'Z', continent: '亚洲', province: '浙江',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 77,
    image: 'https://images.unsplash.com/photo-1591474200742-8e512e6f98f8?w=800&h=600&fit=crop',
    description: '书藏古今，港通天下，江南儒商精神原乡',
    avgDailyBudget: 460, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['藏书楼', '港口', '浙东', '海鲜'],
    lat: 29.8683, lng: 121.5440,
  },
  {
    id: 'quanzhou', name: '泉州', nameEn: 'Quanzhou',
    pinyin: 'quanzhou', pinyinAbbr: 'qz', pinyinInitial: 'Q',
    country: '中国', countryPinyin: 'fujian', countryPinyinInitial: 'F', continent: '亚洲', province: '福建',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 75,
    image: 'https://images.unsplash.com/photo-1739113167050-38795d0af8bd?w=800&h=600&fit=crop',
    description: '宋元中国的世界海洋商贸中心，半城烟火半城神',
    avgDailyBudget: 380, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['世遗', '海丝', '闽南', '古寺'],
    lat: 24.8915, lng: 118.6735,
  },
  {
    id: 'luoyang', name: '洛阳', nameEn: 'Luoyang',
    pinyin: 'luoyang', pinyinAbbr: 'ly', pinyinInitial: 'L',
    country: '中国', countryPinyin: 'henan', countryPinyinInitial: 'H', continent: '亚洲', province: '河南',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 74,
    image: 'https://images.unsplash.com/photo-1767900186506-349896a45a83?w=800&h=600&fit=crop',
    description: '十三朝古都，牡丹灼灼，龙门石窟静默千年',
    avgDailyBudget: 400, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['牡丹', '石窟', '古都', '汉服'],
    lat: 34.6634, lng: 112.4342,
  },
  {
    id: 'kaifeng', name: '开封', nameEn: 'Kaifeng',
    pinyin: 'kaifeng', pinyinAbbr: 'kf', pinyinInitial: 'K',
    country: '中国', countryPinyin: 'henan', countryPinyinInitial: 'H', continent: '亚洲', province: '河南',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 73,
    image: 'https://images.unsplash.com/photo-1677607220717-20d71984a207?w=800&h=600&fit=crop',
    description: '东京梦华录里的汴京风雅，一城宋韵半城水',
    avgDailyBudget: 360, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['宋文化', '包公', '清明上河图', '夜市'],
    lat: 34.7923, lng: 114.3019,
  },
  {
    id: 'wuzhen', name: '乌镇', nameEn: 'Wuzhen',
    pinyin: 'wuzhen', pinyinAbbr: 'wz', pinyinInitial: 'W',
    country: '中国', countryPinyin: 'zhejiang', countryPinyinInitial: 'Z', continent: '亚洲', province: '浙江',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 72,
    image: 'https://images.unsplash.com/photo-1706851240454-25574aedd490?w=800&h=600&fit=crop',
    description: '水墨江南活标本，枕水人家与戏剧节共呼吸',
    avgDailyBudget: 580, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['水乡', '戏剧', '民宿', '慢生活'],
    lat: 30.8475, lng: 120.5429,
  },
  {
    id: 'yangshuo', name: '阳朔', nameEn: 'Yangshuo',
    pinyin: 'yangshuo', pinyinAbbr: 'ys', pinyinInitial: 'Y',
    country: '中国', countryPinyin: 'guangxi', countryPinyinInitial: 'G', continent: '亚洲', province: '广西',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 71,
    image: 'https://images.unsplash.com/photo-1557750223-53916b138a90?w=800&h=600&fit=crop',
    description: '喀斯特山水画廊，骑行遇峰林，漓江泛轻舟',
    avgDailyBudget: 440, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['山水', '骑行', '攀岩', '西街'],
    lat: 25.2502, lng: 110.2825,
  },
  {
    id: 'beihai', name: '北海', nameEn: 'Beihai',
    pinyin: 'beihai', pinyinAbbr: 'bh', pinyinInitial: 'B',
    country: '中国', countryPinyin: 'guangxi', countryPinyinInitial: 'G', continent: '亚洲', province: '广西',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 70,
    image: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&h=600&fit=crop',
    description: '北部湾明珠，银滩绵延，老街骑楼诉说百年海事',
    avgDailyBudget: 410, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['银滩', '老街', '海岛', '海鲜'],
    lat: 21.4837, lng: 109.1149,
  },
  {
    id: 'jiuzhaigou', name: '九寨沟', nameEn: 'Jiuzhaigou',
    pinyin: 'jiuzhaigou', pinyinAbbr: 'jzg', pinyinInitial: 'J',
    country: '中国', countryPinyin: 'sichuan', countryPinyinInitial: 'S', continent: '亚洲', province: '四川',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 68,
    image: 'https://images.unsplash.com/photo-1516496636080-14fb876e029d?w=800&h=600&fit=crop',
    description: '童话世界，翠海叠瀑与藏寨经幡共绘人间秘境',
    avgDailyBudget: 620, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['彩池', '藏族', '秋色', '徒步'],
    lat: 33.2192, lng: 103.8267,
  },
  {
    id: 'hulunbuir', name: '呼伦贝尔', nameEn: 'Hulunbuir',
    pinyin: 'hulunbeier', pinyinAbbr: 'hlbe', pinyinInitial: 'H',
    country: '中国', countryPinyin: 'neimenggu', countryPinyinInitial: 'N', continent: '亚洲', province: '内蒙古',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 64,
    image: 'https://images.unsplash.com/photo-1501854140801-50d01698950b?w=800&h=600&fit=crop',
    description: '天下第一草原，莫日格勒河弯成蓝色哈达',
    avgDailyBudget: 560, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['草原', '牧民', '敖包', '星空'],
    lat: 49.1926, lng: 119.7444,
  },
  {
    id: 'xianggelila', name: '香格里拉', nameEn: 'Shangri-La',
    pinyin: 'xianggelila', pinyinAbbr: 'xgll', pinyinInitial: 'X',
    country: '中国', countryPinyin: 'yunnan', countryPinyinInitial: 'Y', continent: '亚洲', province: '云南',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 63,
    image: 'https://images.unsplash.com/photo-1494548162494-384bba4ab999?w=800&h=600&fit=crop',
    description: '滇西北秘境，松赞林寺金顶辉映普达措高原湖泊',
    avgDailyBudget: 490, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['藏区', '高原', '寺庙', '湖泊'],
    lat: 27.8123, lng: 99.7048,
  },
  {
    id: 'xishuangbanna', name: '西双版纳', nameEn: 'Xishuangbanna',
    pinyin: 'xishuangbanna', pinyinAbbr: 'xsbn', pinyinInitial: 'X',
    country: '中国', countryPinyin: 'yunnan', countryPinyinInitial: 'Y', continent: '亚洲', province: '云南',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 62,
    image: 'https://images.unsplash.com/photo-1590523277543-a94d2e4eb00b?w=800&h=600&fit=crop',
    description: '北纬21°热带雨林，傣家竹楼与泼水节狂欢不息',
    avgDailyBudget: 450, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['雨林', '傣族', '泼水节', '野象'],
    lat: 22.0005, lng: 100.7942,
  },
  {
    id: 'weizhoudao', name: '涠洲岛', nameEn: 'Weizhou Island',
    pinyin: 'weizhoudao', pinyinAbbr: 'wzd', pinyinInitial: 'W',
    country: '中国', countryPinyin: 'guangxi', countryPinyinInitial: 'G', continent: '亚洲', province: '广西',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 60,
    image: 'https://images.unsplash.com/photo-1654428161447-7cbd09cb41f8?w=800&h=600&fit=crop',
    description: '火山海岛秘境，蓝眼泪与珊瑚屋在北部湾心跳',
    avgDailyBudget: 530, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['火山', '海岛', '潜水', '灯塔'],
    lat: 21.0998, lng: 109.1241,
  },
  {
    id: 'yantai', name: '烟台', nameEn: 'Yantai',
    pinyin: 'yantai', pinyinAbbr: 'yt', pinyinInitial: 'Y',
    country: '中国', countryPinyin: 'shandong', countryPinyinInitial: 'S', continent: '亚洲', province: '山东',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 59,
    image: 'https://images.unsplash.com/photo-1772541225216-bd4418ed0397?w=800&h=600&fit=crop',
    description: '仙境海岸，蓬莱阁下葡萄美酒与渔火共长天',
    avgDailyBudget: 440, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['葡萄酒', '仙境', '海滨', '海鲜'],
    lat: 37.4722, lng: 121.4402,
  },
  {
    id: 'qinhuangdao', name: '秦皇岛', nameEn: 'Qinhuangdao',
    pinyin: 'qinhuangdao', pinyinAbbr: 'qhd', pinyinInitial: 'Q',
    country: '中国', countryPinyin: 'hebei', countryPinyinInitial: 'H', continent: '亚洲', province: '河北',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 58,
    image: 'https://images.unsplash.com/photo-1501594907352-04cda38ebc29?w=800&h=600&fit=crop',
    description: '长城入海处，阿那亚与鸽子窝共守渤海之滨',
    avgDailyBudget: 570, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['长城', '阿那亚', '观鸟', '海滨'],
    lat: 39.9342, lng: 119.5843,
  },
  {
    id: 'hongcun', name: '宏村', nameEn: 'Hongcun',
    pinyin: 'hongcun', pinyinAbbr: 'hc', pinyinInitial: 'H',
    country: '中国', countryPinyin: 'anhui', countryPinyinInitial: 'A', continent: '亚洲', province: '安徽',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 57,
    image: 'https://images.unsplash.com/photo-1759569272198-8feb74b0c476?w=800&h=600&fit=crop',
    description: '画里乡村，南湖月沼倒映马头墙徽派水墨',
    avgDailyBudget: 420, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['徽派', '古村', '摄影', '水墨'],
    lat: 29.8775, lng: 117.9737,
  },
  {
    id: 'pingyao', name: '平遥', nameEn: 'Pingyao',
    pinyin: 'pingyao', pinyinAbbr: 'py', pinyinInitial: 'P',
    country: '中国', countryPinyin: 'shanxi', countryPinyinInitial: 'S', continent: '亚洲', province: '山西',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 56,
    image: 'https://images.unsplash.com/photo-1766020716754-d354965670b6?w=800&h=600&fit=crop',
    description: '活着的明清古城，票号风云与青砖巷陌未褪色',
    avgDailyBudget: 370, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['古城', '晋商', '票号', '城墙'],
    lat: 37.1907, lng: 112.1720,
  },
  {
    id: 'dandong', name: '丹东', nameEn: 'Dandong',
    pinyin: 'dandong', pinyinAbbr: 'dd', pinyinInitial: 'D',
    country: '中国', countryPinyin: 'liaoning', countryPinyinInitial: 'L', continent: '亚洲', province: '辽宁',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 55,
    image: 'https://images.unsplash.com/photo-1772353991254-4b1781482d43?w=800&h=600&fit=crop',
    description: '鸭绿江畔国门之城，断桥夕照与朝鲜风情一线牵',
    avgDailyBudget: 350, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['边境', '鸭绿江', '断桥', '朝鲜'],
    lat: 40.1292, lng: 124.3741,
  },
  {
    id: 'yichang', name: '宜昌', nameEn: 'Yichang',
    pinyin: 'yichang', pinyinAbbr: 'yc', pinyinInitial: 'Y',
    country: '中国', countryPinyin: 'hubei', countryPinyinInitial: 'H', continent: '亚洲', province: '湖北',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 54,
    image: 'https://images.unsplash.com/photo-1626457799609-83ecf393c55f?w=800&h=600&fit=crop',
    description: '三峡门户，屈原故里，高峡平湖与清江画廊并秀',
    avgDailyBudget: 400, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['三峡', '屈原', '水电', '清江'],
    lat: 30.6988, lng: 111.2820,
  },
  {
    id: 'zhuhai', name: '珠海', nameEn: 'Zhuhai',
    pinyin: 'zhuhai', pinyinAbbr: 'zh', pinyinInitial: 'Z',
    country: '中国', countryPinyin: 'guangdong', countryPinyinInitial: 'G', continent: '亚洲', province: '广东',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 53,
    image: 'https://images.unsplash.com/photo-1760372560037-877894f3c334?w=800&h=600&fit=crop',
    description: '百岛之城，情侣路海风拂面，港珠澳大桥飞虹跨海',
    avgDailyBudget: 520, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['海岛', '情侣路', '大桥', '澳门'],
    lat: 22.2708, lng: 113.5569,
  },
  {
    id: 'lanzhou', name: '兰州', nameEn: 'Lanzhou',
    pinyin: 'lanzhou', pinyinAbbr: 'lz', pinyinInitial: 'L',
    country: '中国', countryPinyin: 'gansu', countryPinyinInitial: 'G', continent: '亚洲', province: '甘肃',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 52,
    image: 'https://images.unsplash.com/photo-1542332213-31f87348057f?w=800&h=600&fit=crop',
    description: '黄河穿城而过，一碗牛肉面热腾着丝路千年烟火',
    avgDailyBudget: 380, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['黄河', '牛肉面', '丝路', '清真'],
    lat: 36.0611, lng: 103.8343,
  },
  {
    id: 'zhangye', name: '张掖', nameEn: 'Zhangye',
    pinyin: 'zhangye', pinyinAbbr: 'zy', pinyinInitial: 'Z',
    country: '中国', countryPinyin: 'gansu', countryPinyinInitial: 'G', continent: '亚洲', province: '甘肃',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 51,
    image: 'https://images.unsplash.com/photo-1769695239369-2f264f587c9c?w=800&h=600&fit=crop',
    description: '七彩丹霞燃尽祁连山麓，马蹄寺悬于千仞绝壁',
    avgDailyBudget: 460, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['丹霞', '祁连山', '石窟', '河西走廊'],
    lat: 38.9222, lng: 100.4503,
  },
  {
    id: 'dunhuang', name: '敦煌', nameEn: 'Dunhuang',
    pinyin: 'dunhuang', pinyinAbbr: 'dh', pinyinInitial: 'D',
    country: '中国', countryPinyin: 'gansu', countryPinyinInitial: 'G', continent: '亚洲', province: '甘肃',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 67,
    image: 'https://images.unsplash.com/photo-1509316785289-025f5b846b35?w=800&h=600&fit=crop',
    description: '丝绸之路明珠，莫高窟飞天与鸣沙山月牙泉共舞',
    avgDailyBudget: 500, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['莫高窟', '沙漠', '丝路', '飞天'],
    lat: 40.1421, lng: 94.6618,
  },
  {
    id: 'harbin', name: '哈尔滨', nameEn: 'Harbin',
    pinyin: 'haerbin', pinyinAbbr: 'heb', pinyinInitial: 'H',
    country: '中国', countryPinyin: 'heilongjiang', countryPinyinInitial: 'H', continent: '亚洲', province: '黑龙江',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 78,
    image: 'https://images.unsplash.com/photo-1610595161872-a2118a7940f0?w=800&h=600&fit=crop',
    description: '冰城夏都，冰雪大世界与索菲亚教堂的东方莫斯科',
    avgDailyBudget: 500, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['冰雪', '教堂', '俄式', '红肠'],
    lat: 45.7575, lng: 126.6521,
  },

  // ═══ 千问批量生成：国内补充城市 ═══
  {
    id: 'jilin', name: '吉林市', nameEn: 'Jilin',
    pinyin: 'jilinshi', pinyinAbbr: 'jls', pinyinInitial: 'J',
    country: '中国', countryPinyin: 'jilin', countryPinyinInitial: 'J', continent: '亚洲', province: '吉林',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 69,
    image: 'https://images.unsplash.com/photo-1477601263568-180e2c6d046e?w=800&h=600&fit=crop',
    description: '雾凇之都，松花江畔银装世界（25字以内）',
    avgDailyBudget: 380, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['雾凇', '松花江', '滑雪', '北国'],
    lat: 43.8362, lng: 126.5561,
  },
  {
    id: 'shenyang', name: '沈阳', nameEn: 'Shenyang',
    pinyin: 'shenyang', pinyinAbbr: 'sy', pinyinInitial: 'S',
    country: '中国', countryPinyin: 'liaoning', countryPinyinInitial: 'L', continent: '亚洲', province: '辽宁',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 65,
    image: 'https://images.unsplash.com/photo-1655297492646-fa9e101dbce6?w=800&h=600&fit=crop',
    description: '盛京遗韵，故宫钟鼓回响千年（25字以内）',
    avgDailyBudget: 360, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['清宫', '工业', '东北菜', '历史'],
    lat: 41.7921, lng: 123.4326,
  },
  {
    id: 'changchun', name: '长春', nameEn: 'Changchun',
    pinyin: 'changchun', pinyinAbbr: 'cc', pinyinInitial: 'C',
    country: '中国', countryPinyin: 'jilin', countryPinyinInitial: 'J', continent: '亚洲', province: '吉林',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 64,
    image: 'https://images.unsplash.com/photo-1706533893969-e9a8e52fb70a?w=800&h=600&fit=crop',
    description: '林荫春城，伪满遗迹与电影摇篮（25字以内）',
    avgDailyBudget: 350, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['电影', '伪满', '森林', '汽车'],
    lat: 43.8171, lng: 125.3235,
  },
  {
    id: 'xuzhou', name: '徐州', nameEn: 'Xuzhou',
    pinyin: 'xuzhou', pinyinAbbr: 'xz', pinyinInitial: 'X',
    country: '中国', countryPinyin: 'jiangsu', countryPinyinInitial: 'J', continent: '亚洲', province: '江苏',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 63,
    image: 'https://images.unsplash.com/photo-1758092320415-bdadb93e57e6?w=800&h=600&fit=crop',
    description: '五省通衢，汉高故里楚韵悠长（25字以内）',
    avgDailyBudget: 340, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['汉文化', '战争史', '彭祖', '两汉'],
    lat: 34.2616, lng: 117.1846,
  },
  {
    id: 'nanchang', name: '南昌', nameEn: 'Nanchang',
    pinyin: 'nanchang', pinyinAbbr: 'nc', pinyinInitial: 'N',
    country: '中国', countryPinyin: 'jiangxi', countryPinyinInitial: 'J', continent: '亚洲', province: '江西',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 60,
    image: 'https://images.unsplash.com/photo-1597531922242-823dbfca45bd?w=800&h=600&fit=crop',
    description: '英雄城头，滕王阁外赣江潮涌（25字以内）',
    avgDailyBudget: 330, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['红色', '滕王阁', '赣江', '海昏侯'],
    lat: 28.6765, lng: 115.8922,
  },
  {
    id: 'shaoxing', name: '绍兴', nameEn: 'Shaoxing',
    pinyin: 'shaoxing', pinyinAbbr: 'sx', pinyinInitial: 'S',
    country: '中国', countryPinyin: 'zhejiang', countryPinyinInitial: 'Z', continent: '亚洲', province: '浙江',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 59,
    image: 'https://images.unsplash.com/photo-1748577507003-f4d683fdd220?w=800&h=600&fit=crop',
    description: '水乡墨韵，鲁迅故里黄酒飘香（25字以内）',
    avgDailyBudget: 370, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['水乡', '黄酒', '鲁迅', '乌篷船'],
    lat: 30.0442, lng: 120.5849,
  },
  {
    id: 'jingdezhen', name: '景德镇', nameEn: 'Jingdezhen',
    pinyin: 'jingdezhen', pinyinAbbr: 'jdz', pinyinInitial: 'J',
    country: '中国', countryPinyin: 'jiangxi', countryPinyinInitial: 'J', continent: '亚洲', province: '江西',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 58,
    image: 'https://images.unsplash.com/photo-1767039549826-58890cdccf19?w=800&h=600&fit=crop',
    description: '千年瓷都，高岭土烧出青花梦（25字以内）',
    avgDailyBudget: 380, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['陶瓷', '古窑', '手作', '非遗'],
    lat: 29.2924, lng: 117.2165,
  },
  {
    id: 'tongli', name: '同里', nameEn: 'Tongli',
    pinyin: 'tongli', pinyinAbbr: 'tl', pinyinInitial: 'T',
    country: '中国', countryPinyin: 'jiangsu', countryPinyinInitial: 'J', continent: '亚洲', province: '江苏',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 57,
    image: 'https://images.unsplash.com/photo-1739713899197-3f3f40713619?w=800&h=600&fit=crop',
    description: '东方小威尼斯，退思园里水墨江南（25字以内）',
    avgDailyBudget: 410, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['古镇', '园林', '小桥', '慢生活'],
    lat: 31.1598, lng: 120.7257,
  },
  {
    id: 'zhengzhou', name: '郑州', nameEn: 'Zhengzhou',
    pinyin: 'zhengzhou', pinyinAbbr: 'zz', pinyinInitial: 'Z',
    country: '中国', countryPinyin: 'henan', countryPinyinInitial: 'H', continent: '亚洲', province: '河南',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 56,
    image: 'https://images.unsplash.com/photo-1712654656313-eeb524dbe015?w=800&h=600&fit=crop',
    description: '天地之中，商都遗址青铜回响（25字以内）',
    avgDailyBudget: 320, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['商都', '嵩山', '少林', '中原'],
    lat: 34.7466, lng: 113.6254,
  },
  {
    id: 'hohhot', name: '呼和浩特', nameEn: 'Hohhot',
    pinyin: 'huhehaote', pinyinAbbr: 'hhht', pinyinInitial: 'H',
    country: '中国', countryPinyin: 'neimenggu', countryPinyinInitial: 'N', continent: '亚洲', province: '内蒙古',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 54,
    image: 'https://images.unsplash.com/photo-1771760290511-5803dfe1896a?w=800&h=600&fit=crop',
    description: '青城草原，大召寺金顶映白云（25字以内）',
    avgDailyBudget: 370, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['草原', '召庙', '蒙古族', '奶食'],
    lat: 40.8185, lng: 111.6707,
  },
  {
    id: 'xining', name: '西宁', nameEn: 'Xining',
    pinyin: 'xining', pinyinAbbr: 'xn', pinyinInitial: 'X',
    country: '中国', countryPinyin: 'qinghai', countryPinyinInitial: 'Q', continent: '亚洲', province: '青海',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 53,
    image: 'https://images.unsplash.com/photo-1766721063480-f6920edb59d6?w=800&h=600&fit=crop',
    description: '夏都西陲，塔尔寺酥油花绽雪域（25字以内）',
    avgDailyBudget: 360, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['青藏门户', '藏传佛教', '清真', '高原'],
    lat: 36.6232, lng: 101.7777,
  },
  {
    id: 'yinchuan', name: '银川', nameEn: 'Yinchuan',
    pinyin: 'yinchuan', pinyinAbbr: 'yc', pinyinInitial: 'Y',
    country: '中国', countryPinyin: 'ningxia', countryPinyinInitial: 'N', continent: '亚洲', province: '宁夏',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 52,
    image: 'https://images.unsplash.com/photo-1769089220066-1a5bea9cd6bc?w=800&h=600&fit=crop',
    description: '塞上江南，贺兰山下西夏王陵静默（25字以内）',
    avgDailyBudget: 350, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['西夏', '黄河', '贺兰山', '枸杞'],
    lat: 38.4831, lng: 106.2713,
  },
  {
    id: 'wulumuqi', name: '乌鲁木齐', nameEn: 'Urumqi',
    pinyin: 'wulumuqi', pinyinAbbr: 'wlmq', pinyinInitial: 'W',
    country: '中国', countryPinyin: 'xinjiang', countryPinyinInitial: 'X', continent: '亚洲', province: '新疆',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 51,
    image: 'https://images.unsplash.com/photo-1727478432594-a6eb28ca0515?w=800&h=600&fit=crop',
    description: '亚心之都，大巴扎烟火烤馕飘香（25字以内）',
    avgDailyBudget: 420, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['亚心', '大巴扎', '天山', '维吾尔'],
    lat: 43.8257, lng: 87.6173,
  },
  {
    id: 'jiujiang', name: '九江', nameEn: 'Jiujiang',
    pinyin: 'jiujiang', pinyinAbbr: 'jj', pinyinInitial: 'J',
    country: '中国', countryPinyin: 'jiangxi', countryPinyinInitial: 'J', continent: '亚洲', province: '江西',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 48,
    image: 'https://images.unsplash.com/photo-1760286044593-f1b0045faac1?w=800&h=600&fit=crop',
    description: '浔阳江头，庐山云雾茶香漫山（25字以内）',
    avgDailyBudget: 340, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['庐山', '长江', '白鹿洞', '茶乡'],
    lat: 29.7139, lng: 115.9825,
  },
  {
    id: 'yibin', name: '宜宾', nameEn: 'Yibin',
    pinyin: 'yibin', pinyinAbbr: 'yb', pinyinInitial: 'Y',
    country: '中国', countryPinyin: 'sichuan', countryPinyinInitial: 'S', continent: '亚洲', province: '四川',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 47,
    image: 'https://images.unsplash.com/photo-1720625922851-0cc03e1f65eb?w=800&h=600&fit=crop',
    description: '万里长江第一城，五粮液香醉三江口（25字以内）',
    avgDailyBudget: 360, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['长江', '白酒', '蜀南竹海', '李庄'],
    lat: 28.758, lng: 104.6332,
  },
  {
    id: 'baotou', name: '包头', nameEn: 'Baotou',
    pinyin: 'baotou', pinyinAbbr: 'bt', pinyinInitial: 'B',
    country: '中国', countryPinyin: 'neimenggu', countryPinyinInitial: 'N', continent: '亚洲', province: '内蒙古',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 45,
    image: 'https://images.unsplash.com/photo-1772013972478-dd280c2d2a35?w=800&h=600&fit=crop',
    description: '稀土之都，赛汗塔拉草原城中绿肺（25字以内）',
    avgDailyBudget: 330, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['稀土', '草原', '黄河', '军工'],
    lat: 40.6564, lng: 109.8417,
  },
  {
    id: 'qufu', name: '曲阜', nameEn: 'Qufu',
    pinyin: 'qufu', pinyinAbbr: 'qf', pinyinInitial: 'Q',
    country: '中国', countryPinyin: 'shandong', countryPinyinInitial: 'S', continent: '亚洲', province: '山东',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 44,
    image: 'https://images.unsplash.com/photo-1764520680863-9c20e0cc5700?w=800&h=600&fit=crop',
    description: '东方圣城，孔庙杏坛礼乐悠扬（25字以内）',
    avgDailyBudget: 320, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['孔子', '三孔', '儒家', '古建'],
    lat: 35.5923, lng: 116.9925,
  },
  {
    id: 'hefei', name: '合肥', nameEn: 'Hefei',
    pinyin: 'hefei', pinyinAbbr: 'hf', pinyinInitial: 'H',
    country: '中国', countryPinyin: 'anhui', countryPinyinInitial: 'A', continent: '亚洲', province: '安徽',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 42,
    image: 'https://images.unsplash.com/photo-1570118799544-cc67fb268dfa?w=800&h=600&fit=crop',
    description: '江淮首郡，巢湖烟波包公故里（25字以内）',
    avgDailyBudget: 310, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['科教', '巢湖', '包公', '徽菜'],
    lat: 31.8206, lng: 117.2272,
  },
  {
    id: 'lishan', name: '丽山', nameEn: 'Lishan',
    pinyin: 'lishan', pinyinAbbr: 'ls', pinyinInitial: 'L',
    country: '中国', countryPinyin: 'taiwan', countryPinyinInitial: 'T', continent: '亚洲', province: '台湾',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 78,
    image: 'https://images.unsplash.com/photo-1470004914212-05527e49370b?w=800&h=600&fit=crop',
    description: '日月潭畔雾霭轻，邵族歌谣绕青山（25字以内）',
    avgDailyBudget: 500, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['日月潭', '阿里山', '邵族文化', '红茶'],
    lat: 23.8728, lng: 120.8927,
  },
  {
    id: 'zunyi', name: '遵义', nameEn: 'Zunyi',
    pinyin: 'zunyi', pinyinAbbr: 'zy', pinyinInitial: 'Z',
    country: '中国', countryPinyin: 'guizhou', countryPinyinInitial: 'G', continent: '亚洲', province: '贵州',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 88,
    image: 'https://images.unsplash.com/photo-1759751104677-ca520b691687?w=800&h=600&fit=crop',
    description: '红色圣地，茅台故乡，喀斯特山水（25字以内）',
    avgDailyBudget: 380, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['红色旅游', '白酒文化', '喀斯特', '世界遗产'],
    lat: 27.6948, lng: 106.9333,
  },
  {
    id: 'datong', name: '大同', nameEn: 'Datong',
    pinyin: 'datong', pinyinAbbr: 'dt', pinyinInitial: 'D',
    country: '中国', countryPinyin: 'shanxi', countryPinyinInitial: 'S', continent: '亚洲', province: '山西',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 84,
    image: 'https://images.unsplash.com/photo-1664980329978-ba559c713693?w=800&h=600&fit=crop',
    description: '北魏古都，云冈石窟悬空寺双世遗（25字以内）',
    avgDailyBudget: 410, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['世界遗产', '石窟', '古镇', '边塞'],
    lat: 40.078, lng: 113.3017,
  },
  {
    id: 'kashgar', name: '喀什', nameEn: 'Kashgar',
    pinyin: 'kashi', pinyinAbbr: 'ks', pinyinInitial: 'K',
    country: '中国', countryPinyin: 'xinjiang', countryPinyinInitial: 'X', continent: '亚洲', province: '新疆',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 83,
    image: 'https://images.unsplash.com/photo-1762529483828-147465642277?w=800&h=600&fit=crop',
    description: '丝路活化石，喀什古城千年不熄（25字以内）',
    avgDailyBudget: 450, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['世界遗产预备', '古镇', '民俗', '网红'],
    lat: 39.4711, lng: 75.9889,
  },
  {
    id: 'shantou', name: '汕头', nameEn: 'Shantou',
    pinyin: 'shantou', pinyinAbbr: 'st', pinyinInitial: 'S',
    country: '中国', countryPinyin: 'guangdong', countryPinyinInitial: 'G', continent: '亚洲', province: '广东',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 82,
    image: 'https://images.unsplash.com/photo-1772550835915-d2e1e2a428c7?w=800&h=600&fit=crop',
    description: '潮汕文化核心区，小公园骑楼与牛肉丸天堂（25字以内）',
    avgDailyBudget: 390, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['美食', '侨乡', '古镇', '非遗'],
    lat: 23.3541, lng: 116.682,
  },
  {
    id: 'wuyishan', name: '武夷山', nameEn: 'Wuyishan',
    pinyin: 'wuyishan', pinyinAbbr: 'wys', pinyinInitial: 'W',
    country: '中国', countryPinyin: 'fujian', countryPinyinInitial: 'F', continent: '亚洲', province: '福建',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 79,
    image: 'https://images.unsplash.com/photo-1763809678146-3c26c158d780?w=800&h=600&fit=crop',
    description: '双世遗丹霞茶乡，九曲溪竹筏漂流首选（25字以内）',
    avgDailyBudget: 470, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['世界遗产', '茶文化', '山水', '温泉'],
    lat: 27.7575, lng: 118.0172,
  },
  {
    id: 'tengchong', name: '腾冲', nameEn: 'Tengchong',
    pinyin: 'tengchong', pinyinAbbr: 'tc', pinyinInitial: 'T',
    country: '中国', countryPinyin: 'yunnan', countryPinyinInitial: 'Y', continent: '亚洲', province: '云南',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 78,
    image: 'https://images.unsplash.com/photo-1760288203048-92c8dc86db49?w=800&h=600&fit=crop',
    description: '火山热海边境小城，和顺古镇侨乡典范（25字以内）',
    avgDailyBudget: 440, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['温泉', '古镇', '边境', '世界遗产预备'],
    lat: 25.0227, lng: 98.49,
  },
  {
    id: 'jinhua', name: '金华', nameEn: 'Jinhua',
    pinyin: 'jinhuai', pinyinAbbr: 'jh', pinyinInitial: 'J',
    country: '中国', countryPinyin: 'zhejiang', countryPinyinInitial: 'Z', continent: '亚洲', province: '浙江',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 75,
    image: 'https://images.unsplash.com/photo-1701070658926-5a7844890fb6?w=800&h=600&fit=crop',
    description: '浙中枢纽，双龙洞+诸葛八卦村奇观（25字以内）',
    avgDailyBudget: 360, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['古镇', '溶洞', '非遗', '网红'],
    lat: 29.0788, lng: 119.6473,
  },
  {
    id: 'binzhou', name: '滨州', nameEn: 'Binzhou',
    pinyin: 'binzhou', pinyinAbbr: 'bz', pinyinInitial: 'B',
    country: '中国', countryPinyin: 'shandong', countryPinyinInitial: 'S', continent: '亚洲', province: '山东',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 74,
    image: 'https://images.unsplash.com/photo-1566250768478-d13b7b337838?w=800&h=600&fit=crop',
    description: '黄河三角洲生态城，魏集古镇水乡风情（25字以内）',
    avgDailyBudget: 330, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['古镇', '生态', '非遗', '温泉'],
    lat: 37.3833, lng: 118.0222,
  },
  {
    id: 'fuzhou', name: '福州', nameEn: 'Fuzhou',
    pinyin: 'fuzhou', pinyinAbbr: 'fz', pinyinInitial: 'F',
    country: '中国', countryPinyin: 'fujian', countryPinyinInitial: 'F', continent: '亚洲', province: '福建',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 72,
    image: 'https://images.unsplash.com/photo-1736134081329-04dd25a29f0d?w=800&h=600&fit=crop',
    description: '三山两塔一水，三坊七巷明清活化石（25字以内）',
    avgDailyBudget: 410, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['古镇', '世界遗产预备', '温泉', '非遗'],
    lat: 26.0753, lng: 119.3062,
  },
  {
    id: 'hengyang', name: '衡阳', nameEn: 'Hengyang',
    pinyin: 'hengyang', pinyinAbbr: 'hy', pinyinInitial: 'H',
    country: '中国', countryPinyin: 'hunan', countryPinyinInitial: 'H', continent: '亚洲', province: '湖南',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 71,
    image: 'https://images.unsplash.com/photo-1598105409854-a3146d87bae7?w=800&h=600&fit=crop',
    description: '南岳衡山五岳独秀，温泉康养胜地（25字以内）',
    avgDailyBudget: 340, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['名山', '温泉', '宗教', '网红'],
    lat: 27.2142, lng: 112.624,
  },
  {
    id: 'liaocheng', name: '聊城', nameEn: 'Liaocheng',
    pinyin: 'liaocheng', pinyinAbbr: 'lc', pinyinInitial: 'L',
    country: '中国', countryPinyin: 'shandong', countryPinyinInitial: 'S', continent: '亚洲', province: '山东',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 70,
    image: 'https://images.unsplash.com/photo-1734333107771-ab819133e9f7?w=800&h=600&fit=crop',
    description: '江北水城，东昌湖环抱光岳楼古韵（25字以内）',
    avgDailyBudget: 320, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['古镇', '运河', '非遗', '网红'],
    lat: 36.4453, lng: 115.978,
  },
  {
    id: 'baiyin', name: '白银', nameEn: 'Baiyin',
    pinyin: 'baiyin', pinyinAbbr: 'by', pinyinInitial: 'B',
    country: '中国', countryPinyin: 'gansu', countryPinyinInitial: 'G', continent: '亚洲', province: '甘肃',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 69,
    image: 'https://images.unsplash.com/photo-1770622978047-00cdaf561ac6?w=800&h=600&fit=crop',
    description: '黄河石林地质奇观，丝路驿站新晋网红（25字以内）',
    avgDailyBudget: 310, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['地质公园', '网红', '摄影', '世界遗产预备'],
    lat: 36.5542, lng: 104.1815,
  },
  {
    id: 'jixi', name: '鸡西', nameEn: 'Jixi',
    pinyin: 'jixi', pinyinAbbr: 'jx', pinyinInitial: 'J',
    country: '中国', countryPinyin: 'heilongjiang', countryPinyinInitial: 'H', continent: '亚洲', province: '黑龙江',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 68,
    image: 'https://images.unsplash.com/photo-1763910796838-9a16985c7023?w=800&h=600&fit=crop',
    description: '兴凯湖畔雪乡门户，中俄界湖冬捕胜地（25字以内）',
    avgDailyBudget: 330, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['滑雪', '湖泊', '边境', '温泉'],
    lat: 45.2972, lng: 130.9799,
  },
  {
    id: 'guiyang', name: '贵阳', nameEn: 'Guiyang',
    pinyin: 'guiyang', pinyinAbbr: 'gy', pinyinInitial: 'G',
    country: '中国', countryPinyin: 'guizhou', countryPinyinInitial: 'G', continent: '亚洲', province: '贵州',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 72,
    image: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=800&h=600&fit=crop',
    description: '林城绿肺苗侗风情',
    avgDailyBudget: 400, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['避暑', '喀斯特', '少数民族', '美食'],
    lat: 26.647, lng: 106.63,
  },
  {
    id: 'libo', name: '荔波', nameEn: 'Libo',
    pinyin: 'libo', pinyinAbbr: 'lb', pinyinInitial: 'L',
    country: '中国', countryPinyin: 'guizhou', countryPinyinInitial: 'G', continent: '亚洲', province: '贵州',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 68,
    image: 'https://images.unsplash.com/photo-1773975346311-086fbbe1edf8?w=800&h=600&fit=crop',
    description: '地球绿宝石喀斯特秘境',
    avgDailyBudget: 380, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['世界自然遗产', '小七孔', '瑶山风情', '森林氧吧'],
    lat: 25.409, lng: 107.883,
  },
  {
    id: 'wuyuan', name: '婺源', nameEn: 'Wuyuan',
    pinyin: 'wuyuan', pinyinAbbr: 'wy', pinyinInitial: 'W',
    country: '中国', countryPinyin: 'jiangxi', countryPinyinInitial: 'J', continent: '亚洲', province: '江西',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 75,
    image: 'https://images.unsplash.com/photo-1767428254057-ddfb9498e341?w=800&h=600&fit=crop',
    description: '中国最美乡村水墨画境',
    avgDailyBudget: 360, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['油菜花海', '徽派古村', '晒秋', '生态田园'],
    lat: 29.234, lng: 117.876,
  },
  {
    id: 'daocheng', name: '稻城', nameEn: 'Daocheng',
    pinyin: 'daocheng', pinyinAbbr: 'dc', pinyinInitial: 'D',
    country: '中国', countryPinyin: 'sichuan', countryPinyinInitial: 'S', continent: '亚洲', province: '四川',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 70,
    image: 'https://images.unsplash.com/photo-1773428050189-b0641c4a0313?w=800&h=600&fit=crop',
    description: '最后的香格里拉雪山圣境',
    avgDailyBudget: 420, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['高原湖泊', '雪山垭口', '藏地秘境', '摄影天堂'],
    lat: 29.042, lng: 100.25,
  },
  {
    id: 'sedan', name: '色达', nameEn: 'Seda',
    pinyin: 'seda', pinyinAbbr: 'sd', pinyinInitial: 'S',
    country: '中国', countryPinyin: 'sichuan', countryPinyinInitial: 'S', continent: '亚洲', province: '四川',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 66,
    image: 'https://images.unsplash.com/photo-1761047176873-6fdee5b43e5b?w=800&h=600&fit=crop',
    description: '红衣僧海天葬台信仰高地',
    avgDailyBudget: 430, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['藏传佛教', '佛学院', '高海拔', '人文震撼'],
    lat: 32.029, lng: 100.307,
  },
  {
    id: 'waning', name: '万宁', nameEn: 'Wanning',
    pinyin: 'wanning', pinyinAbbr: 'wn', pinyinInitial: 'W',
    country: '中国', countryPinyin: 'hainan', countryPinyinInitial: 'H', continent: '亚洲', province: '海南',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 64,
    image: 'https://images.unsplash.com/photo-1699019493395-8a1f0c7883a9?w=800&h=600&fit=crop',
    description: '冲浪天堂热带滨海秘境',
    avgDailyBudget: 450, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['冲浪', '滨海温泉', '兴隆咖啡', '热带雨林'],
    lat: 18.797, lng: 110.388,
  },
  {
    id: 'fenghuang', name: '凤凰古城', nameEn: 'Fenghuang',
    pinyin: 'fenghuang', pinyinAbbr: 'fh', pinyinInitial: 'F',
    country: '中国', countryPinyin: 'hunan', countryPinyinInitial: 'H', continent: '亚洲', province: '湖南',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 73,
    image: 'https://images.unsplash.com/photo-1556837675-f48f2f7d3882?w=800&h=600&fit=crop',
    description: '湘西边城吊脚楼水墨画卷',
    avgDailyBudget: 370, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['古镇夜景', '沱江泛舟', '苗家银饰', '沈从文故里'],
    lat: 27.943, lng: 109.607,
  },
  {
    id: 'luguhu', name: '泸沽湖', nameEn: 'Lugu Lake',
    pinyin: 'luguhu', pinyinAbbr: 'lgh', pinyinInitial: 'L',
    country: '中国', countryPinyin: 'yunnan', countryPinyinInitial: 'Y', continent: '亚洲', province: '云南',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 69,
    image: 'https://images.unsplash.com/photo-1771406117596-e7a09655527b?w=800&h=600&fit=crop',
    description: '高原明珠摩梭母系秘境',
    avgDailyBudget: 410, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['走婚桥', '猪槽船', '女神山', '星空露营'],
    lat: 27.794, lng: 101.23,
  },
  {
    id: 'lishui', name: '丽水', nameEn: 'Lishui',
    pinyin: 'lishui', pinyinAbbr: 'ls', pinyinInitial: 'L',
    country: '中国', countryPinyin: 'zhejiang', countryPinyinInitial: 'Z', continent: '亚洲', province: '浙江',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 67,
    image: 'https://images.unsplash.com/photo-1765883958680-bfc9345be81b?w=800&h=600&fit=crop',
    description: '浙南林海古村山水画廊',
    avgDailyBudget: 390, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['云和梯田', '古堰画乡', '畲族文化', '生态康养'],
    lat: 28.452, lng: 119.923,
  },
  {
    id: 'xiapu', name: '霞浦', nameEn: 'Xiapu',
    pinyin: 'xiapu', pinyinAbbr: 'xp', pinyinInitial: 'X',
    country: '中国', countryPinyin: 'fujian', countryPinyinInitial: 'F', continent: '亚洲', province: '福建',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 65,
    image: 'https://images.unsplash.com/photo-1773146817243-64b538f0f5a5?w=800&h=600&fit=crop',
    description: '中国海带之乡光影滩涂',
    avgDailyBudget: 360, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['滩涂摄影', '海上牧场', '闽东渔村', '日出日落'],
    lat: 26.887, lng: 120.032,
  },
  {
    id: 'yanji', name: '延吉', nameEn: 'Yanji',
    pinyin: 'yanji', pinyinAbbr: 'yj', pinyinInitial: 'Y',
    country: '中国', countryPinyin: 'jilin', countryPinyinInitial: 'J', continent: '亚洲', province: '吉林',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 68,
    image: 'https://images.unsplash.com/photo-1766470656788-8bee0e7840a2?w=800&h=600&fit=crop',
    description: '中国朝鲜族文化第一城',
    avgDailyBudget: 380, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['韩风美食', '民俗园', '帽儿山', '边境风情'],
    lat: 42.913, lng: 129.517,
  },
  {
    id: 'mohe', name: '漠河', nameEn: 'Mohe',
    pinyin: 'mohe', pinyinAbbr: 'mh', pinyinInitial: 'M',
    country: '中国', countryPinyin: 'heilongjiang', countryPinyinInitial: 'H', continent: '亚洲', province: '黑龙江',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 62,
    image: 'https://images.unsplash.com/photo-1766470656797-955cea625f89?w=800&h=600&fit=crop',
    description: '神州北极极光冰雪边陲',
    avgDailyBudget: 460, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['北极村', '极光观测', '圣诞村', '冻土奇观'],
    lat: 53.524, lng: 122.537,
  },
  {
    id: 'yili', name: '伊犁', nameEn: 'Yili',
    pinyin: 'yili', pinyinAbbr: 'yl', pinyinInitial: 'Y',
    country: '中国', countryPinyin: 'xinjiang', countryPinyinInitial: 'X', continent: '亚洲', province: '新疆',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 74,
    image: 'https://images.unsplash.com/photo-1770740098141-4db5fb079dd1?w=800&h=600&fit=crop',
    description: '塞外江南草原花海丝路',
    avgDailyBudget: 480, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['昭苏油菜花', '夏塔古道', '喀赞其', '薰衣草'],
    lat: 43.922, lng: 81.326,
  },
  {
    id: 'foshan', name: '佛山', nameEn: 'Foshan',
    pinyin: 'foshan', pinyinAbbr: 'fs', pinyinInitial: 'F',
    country: '中国', countryPinyin: 'guangdong', countryPinyinInitial: 'G', continent: '亚洲', province: '广东',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 71,
    image: 'https://images.unsplash.com/photo-1763482933744-88f355e3c7d8?w=800&h=600&fit=crop',
    description: '岭南武术陶艺美食名城',
    avgDailyBudget: 420, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['祖庙', '南风古灶', '顺德美食', '咏春发源地'],
    lat: 23.023, lng: 113.123,
  },
  {
    id: 'dalian', name: '大连', nameEn: 'Dalian',
    pinyin: 'dalian', pinyinAbbr: 'dl', pinyinInitial: 'D',
    country: '中国', countryPinyin: 'liaoning', countryPinyinInitial: 'L', continent: '亚洲', province: '辽宁',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 70,
    image: 'https://images.unsplash.com/photo-1730131837032-4a04b2542fd5?w=800&h=600&fit=crop',
    description: '北方明珠滨海浪漫之都',
    avgDailyBudget: 440, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['滨海路', '星海广场', '俄罗斯风情街', '海鲜盛宴'],
    lat: 38.914, lng: 121.619,
  },
  {
    id: 'taiyuan', name: '太原', nameEn: 'Taiyuan',
    pinyin: 'taiyuan', pinyinAbbr: 'ty', pinyinInitial: 'T',
    country: '中国', countryPinyin: 'shanxi', countryPinyinInitial: 'S', continent: '亚洲', province: '山西',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 63,
    image: 'https://images.unsplash.com/photo-1766020715687-de3ed140abba?w=800&h=600&fit=crop',
    description: '晋阳古都晋商文化重镇',
    avgDailyBudget: 350, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['晋祠', '双塔寺', '醋文化', '面食之都'],
    lat: 37.87, lng: 112.549,
  },
  {
    id: 'wuxi', name: '无锡', nameEn: 'Wuxi',
    pinyin: 'wuxi', pinyinAbbr: 'wx', pinyinInitial: 'W',
    country: '中国', countryPinyin: 'jiangsu', countryPinyinInitial: 'J', continent: '亚洲', province: '江苏',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 72,
    image: 'https://images.unsplash.com/photo-1586862118451-efc84a66e704?w=800&h=600&fit=crop',
    description: '太湖明珠江南水韵名城',
    avgDailyBudget: 410, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['鼋头渚', '灵山大佛', '惠山古镇', '太湖佳绝处'],
    lat: 31.575, lng: 120.297,
  },
  {
    id: 'yangzhou', name: '扬州', nameEn: 'Yangzhou',
    pinyin: 'yangzhou', pinyinAbbr: 'yz', pinyinInitial: 'Y',
    country: '中国', countryPinyin: 'jiangsu', countryPinyinInitial: 'J', continent: '亚洲', province: '江苏',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 74,
    image: 'https://images.unsplash.com/photo-1760502431579-1255eed8339c?w=800&h=600&fit=crop',
    description: '淮扬菜发源地千年诗城',
    avgDailyBudget: 390, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['瘦西湖', '个园', '大运河', '早茶文化'],
    lat: 32.393, lng: 119.415,
  },
  {
    id: 'chaozhou', name: '潮州', nameEn: 'Chaozhou',
    pinyin: 'chaozhou', pinyinAbbr: 'cz', pinyinInitial: 'C',
    country: '中国', countryPinyin: 'guangdong', countryPinyinInitial: 'G', continent: '亚洲', province: '广东',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 73,
    image: 'https://images.unsplash.com/photo-1739713908383-1a9a3fb0b628?w=800&h=600&fit=crop',
    description: '岭海名邦潮汕文化活化石',
    avgDailyBudget: 370, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['广济桥', '开元寺', '工夫茶', '牌坊街'],
    lat: 23.667, lng: 116.622,
  },
  {
    id: 'weihai', name: '威海', nameEn: 'Weihai',
    pinyin: 'weihai', pinyinAbbr: 'wh', pinyinInitial: 'W',
    country: '中国', countryPinyin: 'shandong', countryPinyinInitial: 'S', continent: '亚洲', province: '山东',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 66,
    image: 'https://images.unsplash.com/photo-1771933385250-78c31fc3833c?w=800&h=600&fit=crop',
    description: '胶东半岛滨海花园城市',
    avgDailyBudget: 400, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['刘公岛', '成山头', '国际海水浴场', '韩流中转'],
    lat: 37.507, lng: 122.113,
  },
  {
    id: 'haikou', name: '海口', nameEn: 'Haikou',
    pinyin: 'haikou', pinyinAbbr: 'hk', pinyinInitial: 'H',
    country: '中国', countryPinyin: 'hainan', countryPinyinInitial: 'H', continent: '亚洲', province: '海南',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 67,
    image: 'https://images.unsplash.com/photo-1655779282200-2b4d3d3bdc53?w=800&h=600&fit=crop',
    description: '椰城骑楼老街热带门户',
    avgDailyBudget: 380, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['骑楼老街', '火山群', '五公祠', '热带果园'],
    lat: 20.044, lng: 110.199,
  },
  {
    id: 'yabuli', name: '亚布力', nameEn: 'Yabuli',
    pinyin: 'yabuli', pinyinAbbr: 'ybl', pinyinInitial: 'Y',
    country: '中国', countryPinyin: 'heilongjiang', countryPinyinInitial: 'H', continent: '亚洲', province: '黑龙江',
    countryFlag: '🇨🇳',
    isDomestic: true, hotness: 61,
    image: 'https://images.unsplash.com/photo-1766470656440-d698d947d454?w=800&h=600&fit=crop',
    description: '中国首席滑雪胜地林海雪原',
    avgDailyBudget: 490, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: ['滑雪度假', '森林小火车', '雪乡中转', '松峰山'],
    lat: 44.62, lng: 128.5,
  },
]

/* ═══════════════════════════════════════════════════════════════════
 * 国际 Top 100 城市（含当季热度）
 * ═══════════════════════════════════════════════════════════════════ */

const internationalCities: DestinationCity[] = [
  {
    id: 'tokyo', name: '东京', nameEn: 'Tokyo',
    pinyin: 'dongjing', pinyinAbbr: 'dj', pinyinInitial: 'D',
    country: '日本', countryPinyin: 'riben', countryPinyinInitial: 'R', continent: '亚洲', province: '',
    countryFlag: '🇯🇵',
    isDomestic: false, hotness: 96,
    image: 'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=800&h=600&fit=crop',
    description: '传统与现代完美融合的魅力都市，美食天堂与文化殿堂',
    avgDailyBudget: 1200, currency: 'CNY', timezone: 'Asia/Tokyo',
    tags: ['美食', '购物', '文化', '动漫'],
    lat: 35.6762, lng: 139.6503,
  },
  {
    id: 'kyoto', name: '京都', nameEn: 'Kyoto',
    pinyin: 'jingdu', pinyinAbbr: 'jd', pinyinInitial: 'J',
    country: '日本', countryPinyin: 'riben', countryPinyinInitial: 'R', continent: '亚洲', province: '',
    countryFlag: '🇯🇵',
    isDomestic: false, hotness: 94,
    image: 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=800&h=600&fit=crop',
    description: '千年古都，禅意庭园与传统文化的宝库',
    avgDailyBudget: 1000, currency: 'CNY', timezone: 'Asia/Tokyo',
    tags: ['古寺', '和服', '庭园', '抹茶'],
    lat: 35.0116, lng: 135.7681,
  },
  {
    id: 'osaka', name: '大阪', nameEn: 'Osaka',
    pinyin: 'daban', pinyinAbbr: 'db', pinyinInitial: 'D',
    country: '日本', countryPinyin: 'riben', countryPinyinInitial: 'R', continent: '亚洲', province: '',
    countryFlag: '🇯🇵',
    isDomestic: false, hotness: 92,
    image: 'https://images.unsplash.com/photo-1590559899731-a382839e5549?w=800&h=600&fit=crop',
    description: '天下厨房，道顿堀的热闹与大阪城的历史交织',
    avgDailyBudget: 1000, currency: 'CNY', timezone: 'Asia/Tokyo',
    tags: ['美食', '购物', '环球影城', '热闹'],
    lat: 34.6937, lng: 135.5023,
  },
  {
    id: 'hokkaido', name: '北海道', nameEn: 'Hokkaido',
    pinyin: 'beihaidao', pinyinAbbr: 'bhd', pinyinInitial: 'B',
    country: '日本', countryPinyin: 'riben', countryPinyinInitial: 'R', continent: '亚洲', province: '',
    countryFlag: '🇯🇵',
    isDomestic: false, hotness: 80,
    image: 'https://images.unsplash.com/photo-1578271887552-5ac3a72752bc?w=800&h=600&fit=crop',
    description: '薰衣草花田与雪国温泉，北国大地的四季浪漫',
    avgDailyBudget: 1100, currency: 'CNY', timezone: 'Asia/Tokyo',
    tags: ['温泉', '雪景', '薰衣草', '海鲜'],
    lat: 43.0621, lng: 141.3544,
  },
  {
    id: 'bangkok', name: '曼谷', nameEn: 'Bangkok',
    pinyin: 'mangu', pinyinAbbr: 'mg', pinyinInitial: 'M',
    country: '泰国', countryPinyin: 'taiguo', countryPinyinInitial: 'T', continent: '亚洲', province: '',
    countryFlag: '🇹🇭',
    isDomestic: false, hotness: 88,
    image: 'https://images.unsplash.com/photo-1563492065599-3520f775eeed?w=800&h=600&fit=crop',
    description: '活力四射的东南亚之心，寺庙与美食的盛宴',
    avgDailyBudget: 500, currency: 'CNY', timezone: 'Asia/Bangkok',
    tags: ['美食', '寺庙', '按摩', '夜市'],
    lat: 13.7563, lng: 100.5018,
  },
  {
    id: 'chiangmai', name: '清迈', nameEn: 'Chiang Mai',
    pinyin: 'qingmai', pinyinAbbr: 'qm', pinyinInitial: 'Q',
    country: '泰国', countryPinyin: 'taiguo', countryPinyinInitial: 'T', continent: '亚洲', province: '',
    countryFlag: '🇹🇭',
    isDomestic: false, hotness: 82,
    image: 'https://images.unsplash.com/photo-1674807309284-85829b05df6f?w=800&h=600&fit=crop',
    description: '泰北玫瑰，古城寺庙与山间清幽的慢生活',
    avgDailyBudget: 350, currency: 'CNY', timezone: 'Asia/Bangkok',
    tags: ['古城', '寺庙', '慢生活', '手作'],
    lat: 18.7883, lng: 98.9853,
  },
  {
    id: 'phuket', name: '普吉岛', nameEn: 'Phuket',
    pinyin: 'pujidao', pinyinAbbr: 'pjd', pinyinInitial: 'P',
    country: '泰国', countryPinyin: 'taiguo', countryPinyinInitial: 'T', continent: '亚洲', province: '',
    countryFlag: '🇹🇭',
    isDomestic: false, hotness: 85,
    image: 'https://images.unsplash.com/photo-1589394815804-964ed0be2eb5?w=800&h=600&fit=crop',
    description: '安达曼海上的明珠，碧海白沙与夜生活的天堂',
    avgDailyBudget: 500, currency: 'CNY', timezone: 'Asia/Bangkok',
    tags: ['海岛', '潜水', '沙滩', '夜生活'],
    lat: 7.8804, lng: 98.3923,
  },
  {
    id: 'seoul', name: '首尔', nameEn: 'Seoul',
    pinyin: 'shouer', pinyinAbbr: 'se', pinyinInitial: 'S',
    country: '韩国', countryPinyin: 'hanguo', countryPinyinInitial: 'H', continent: '亚洲', province: '',
    countryFlag: '🇰🇷',
    isDomestic: false, hotness: 86,
    image: 'https://images.unsplash.com/photo-1534274988757-a28bf1a57c17?w=800&h=600&fit=crop',
    description: 'K-pop与韩流文化的心脏，时尚美食与传统并存',
    avgDailyBudget: 800, currency: 'CNY', timezone: 'Asia/Seoul',
    tags: ['韩流', '美食', '购物', '文化'],
    lat: 37.5665, lng: 126.9780,
  },
  {
    id: 'jeju', name: '济州岛', nameEn: 'Jeju Island',
    pinyin: 'jizhoudao', pinyinAbbr: 'jzd', pinyinInitial: 'J',
    country: '韩国', countryPinyin: 'hanguo', countryPinyinInitial: 'H', continent: '亚洲', province: '',
    countryFlag: '🇰🇷',
    isDomestic: false, hotness: 83,
    image: 'https://images.unsplash.com/photo-1590523741831-ab7e8b8f9c7f?w=800&h=600&fit=crop',
    description: '韩国最美海岛，汉拿山与油菜花田的浪漫',
    avgDailyBudget: 700, currency: 'CNY', timezone: 'Asia/Seoul',
    tags: ['海岛', '火山', '自然', '浪漫'],
    lat: 33.4996, lng: 126.5312,
  },
  {
    id: 'bali', name: '巴厘岛', nameEn: 'Bali',
    pinyin: 'balidao', pinyinAbbr: 'bld', pinyinInitial: 'B',
    country: '印度尼西亚', countryPinyin: 'yindunixiya', countryPinyinInitial: 'Y', continent: '亚洲', province: '',
    countryFlag: '🇮🇩',
    isDomestic: false, hotness: 87,
    image: 'https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=800&h=600&fit=crop',
    description: '热带天堂，悠闲海滩与神秘庙宇的完美结合',
    avgDailyBudget: 600, currency: 'CNY', timezone: 'Asia/Makassar',
    tags: ['海滩', '度假', '冲浪', '寺庙'],
    lat: -8.3405, lng: 115.0920,
  },
  {
    id: 'paris', name: '巴黎', nameEn: 'Paris',
    pinyin: 'bali', pinyinAbbr: 'bl', pinyinInitial: 'B',
    country: '法国', countryPinyin: 'faguo', countryPinyinInitial: 'F', continent: '欧洲', province: '',
    countryFlag: '🇫🇷',
    isDomestic: false, hotness: 85,
    image: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800&h=600&fit=crop',
    description: '浪漫之都，世界艺术与时尚的中心',
    avgDailyBudget: 1500, currency: 'CNY', timezone: 'Europe/Paris',
    tags: ['浪漫', '艺术', '美食', '时尚'],
    lat: 48.8566, lng: 2.3522,
  },
  {
    id: 'singapore', name: '新加坡', nameEn: 'Singapore',
    pinyin: 'xinjiapo', pinyinAbbr: 'xjp', pinyinInitial: 'X',
    country: '新加坡', countryPinyin: 'xinjiapo', countryPinyinInitial: 'X', continent: '亚洲', province: '',
    countryFlag: '🇸🇬',
    isDomestic: false, hotness: 81,
    image: 'https://images.unsplash.com/photo-1525625293386-3f8f99389edd?w=800&h=600&fit=crop',
    description: '花园城市，多元文化与现代建筑的完美融合',
    avgDailyBudget: 900, currency: 'CNY', timezone: 'Asia/Singapore',
    tags: ['花园', '美食', '购物', '现代'],
    lat: 1.3521, lng: 103.8198,
  },
  {
    id: 'maldives', name: '马尔代夫', nameEn: 'Maldives',
    pinyin: 'maerdaifu', pinyinAbbr: 'medf', pinyinInitial: 'M',
    country: '马尔代夫', countryPinyin: 'maerdaifu', countryPinyinInitial: 'M', continent: '其他', province: '',
    countryFlag: '🇲🇻',
    isDomestic: false, hotness: 90,
    image: 'https://images.unsplash.com/photo-1514282401047-d79a71a590e8?w=800&h=600&fit=crop',
    description: '印度洋上的人间天堂，水上别墅与绝美珊瑚礁',
    avgDailyBudget: 2500, currency: 'CNY', timezone: 'Indian/Maldives',
    tags: ['海岛', '蜜月', '潜水', '度假'],
    lat: 3.2028, lng: 73.2207,
  },
  {
    id: 'london', name: '伦敦', nameEn: 'London',
    pinyin: 'lundun', pinyinAbbr: 'ld', pinyinInitial: 'L',
    country: '英国', countryPinyin: 'yingguo', countryPinyinInitial: 'Y', continent: '欧洲', province: '',
    countryFlag: '🇬🇧',
    isDomestic: false, hotness: 72,
    image: 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=800&h=600&fit=crop',
    description: '日不落帝国的心脏，大英博物馆与泰晤士河畔的优雅',
    avgDailyBudget: 1600, currency: 'CNY', timezone: 'Europe/London',
    tags: ['博物馆', '皇室', '历史', '音乐剧'],
    lat: 51.5074, lng: -0.1278,
  },
  {
    id: 'rome', name: '罗马', nameEn: 'Rome',
    pinyin: 'luoma', pinyinAbbr: 'lm', pinyinInitial: 'L',
    country: '意大利', countryPinyin: 'yidali', countryPinyinInitial: 'Y', continent: '欧洲', province: '',
    countryFlag: '🇮🇹',
    isDomestic: false, hotness: 80,
    image: 'https://images.unsplash.com/photo-1552832230-c0197dd311b5?w=800&h=600&fit=crop',
    description: '永恒之城，斗兽场与许愿池的千年浪漫',
    avgDailyBudget: 1200, currency: 'CNY', timezone: 'Europe/Rome',
    tags: ['古迹', '美食', '艺术', '浪漫'],
    lat: 41.9028, lng: 12.4964,
  },
  {
    id: 'santorini', name: '圣托里尼', nameEn: 'Santorini',
    pinyin: 'shengtuolini', pinyinAbbr: 'stln', pinyinInitial: 'S',
    country: '希腊', countryPinyin: 'xila', countryPinyinInitial: 'X', continent: '欧洲', province: '',
    countryFlag: '🇬🇷',
    isDomestic: false, hotness: 78,
    image: 'https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?w=800&h=600&fit=crop',
    description: '爱琴海上的蓝白梦境，最美日落观赏地',
    avgDailyBudget: 1300, currency: 'CNY', timezone: 'Europe/Athens',
    tags: ['日落', '海景', '蜜月', '摄影'],
    lat: 36.3932, lng: 25.4615,
  },
  {
    id: 'sydney', name: '悉尼', nameEn: 'Sydney',
    pinyin: 'xini', pinyinAbbr: 'xn', pinyinInitial: 'X',
    country: '澳大利亚', countryPinyin: 'aodaliya', countryPinyinInitial: 'A', continent: '大洋洲', province: '',
    countryFlag: '🇦🇺',
    isDomestic: false, hotness: 74,
    image: 'https://images.unsplash.com/photo-1506973035872-a4ec16b8e8d9?w=800&h=600&fit=crop',
    description: '歌剧院与海港大桥，阳光沙滩的南半球明珠',
    avgDailyBudget: 1400, currency: 'CNY', timezone: 'Australia/Sydney',
    tags: ['歌剧院', '海滩', '袋鼠', '自然'],
    lat: -33.8688, lng: 151.2093,
  },
  {
    id: 'barcelona', name: '巴塞罗那', nameEn: 'Barcelona',
    pinyin: 'basailuona', pinyinAbbr: 'bsln', pinyinInitial: 'B',
    country: '西班牙', countryPinyin: 'xibanya', countryPinyinInitial: 'X', continent: '欧洲', province: '',
    countryFlag: '🇪🇸',
    isDomestic: false, hotness: 76,
    image: 'https://images.unsplash.com/photo-1583422409516-2895a77efded?w=800&h=600&fit=crop',
    description: '高迪的建筑奇迹与地中海的热情阳光',
    avgDailyBudget: 1100, currency: 'CNY', timezone: 'Europe/Madrid',
    tags: ['建筑', '海滩', '足球', '艺术'],
    lat: 41.3874, lng: 2.1686,
  },
  {
    id: 'danang', name: '岘港', nameEn: 'Da Nang',
    pinyin: 'xiangang', pinyinAbbr: 'xg', pinyinInitial: 'X',
    country: '越南', countryPinyin: 'yuenan', countryPinyinInitial: 'Y', continent: '亚洲', province: '',
    countryFlag: '🇻🇳',
    isDomestic: false, hotness: 79,
    image: 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=800&h=600&fit=crop',
    description: '越南最美海滨城市，会安古城与巴拿山的双重魅力',
    avgDailyBudget: 350, currency: 'CNY', timezone: 'Asia/Ho_Chi_Minh',
    tags: ['海滨', '古城', '美食', '性价比'],
    lat: 16.0544, lng: 108.2022,
  },
  {
    id: 'kualalumpur', name: '吉隆坡', nameEn: 'Kuala Lumpur',
    pinyin: 'jilongpo', pinyinAbbr: 'jlp', pinyinInitial: 'J',
    country: '马来西亚', countryPinyin: 'malaixiya', countryPinyinInitial: 'M', continent: '亚洲', province: '',
    countryFlag: '🇲🇾',
    isDomestic: false, hotness: 77,
    image: 'https://images.unsplash.com/photo-1596422846543-75c6fc197f07?w=800&h=600&fit=crop',
    description: '双子塔下的多元文化之都，美食与购物天堂',
    avgDailyBudget: 450, currency: 'CNY', timezone: 'Asia/Kuala_Lumpur',
    tags: ['双子塔', '美食', '多元文化', '购物'],
    lat: 3.1390, lng: 101.6869,
  },

  // ═══ 千问批量生成：国际补充城市 ═══
  {
    id: 'hongkong', name: '香港', nameEn: 'Hong Kong',
    pinyin: 'xianggang', pinyinAbbr: 'xg', pinyinInitial: 'X',
    country: '中国', countryPinyin: 'zhongguo', countryPinyinInitial: 'Z', continent: '亚洲', province: '',
    countryFlag: '🇨🇳',
    isDomestic: false, hotness: 98,
    image: 'https://images.unsplash.com/photo-1673923927302-c4cff7d56c39?w=800&h=600&fit=crop',
    description: '维港夜色霓虹海风，山海城共舞（25字以内）',
    avgDailyBudget: 850, currency: 'CNY', timezone: 'Asia/Tokyo',
    tags: ['都市', '美食', '购物', '海港'],
    lat: 22.3193, lng: 114.1694,
  },
  {
    id: 'taipei', name: '台北', nameEn: 'Taipei',
    pinyin: 'taibei', pinyinAbbr: 'tb', pinyinInitial: 'T',
    country: '中国', countryPinyin: 'zhongguo', countryPinyinInitial: 'Z', continent: '亚洲', province: '',
    countryFlag: '🇨🇳',
    isDomestic: false, hotness: 95,
    image: 'https://images.unsplash.com/photo-1613553755617-1914f1baac03?w=800&h=600&fit=crop',
    description: '九份山城茶香氤氲，夜市烟火不眠（25字以内）',
    avgDailyBudget: 600, currency: 'CNY', timezone: 'Asia/Tokyo',
    tags: ['古城', '夜市', '茶文化', '文艺'],
    lat: 25.032, lng: 121.5654,
  },
  {
    id: 'luangprabang', name: '琅勃拉邦', nameEn: 'Luang Prabang',
    pinyin: 'langbolabang', pinyinAbbr: 'lblb', pinyinInitial: 'L',
    country: '老挝', countryPinyin: 'laowo', countryPinyinInitial: 'L', continent: '亚洲', province: '',
    countryFlag: '🇱🇦',
    isDomestic: false, hotness: 89,
    image: 'https://images.unsplash.com/photo-1677727644366-d002e7a147b6?w=800&h=600&fit=crop',
    description: '湄公河畔千佛静默，晨光布施如诗流淌（25字以内）',
    avgDailyBudget: 420, currency: 'CNY', timezone: 'Asia/Bangkok',
    tags: ['古城', '佛教', '河流', '慢生活'],
    lat: 19.8975, lng: 102.1278,
  },
  {
    id: 'siemreap', name: '暹粒', nameEn: 'Siem Reap',
    pinyin: 'xianli', pinyinAbbr: 'xl', pinyinInitial: 'X',
    country: '柬埔寨', countryPinyin: 'jianpuzhai', countryPinyinInitial: 'J', continent: '亚洲', province: '',
    countryFlag: '🇰🇭',
    isDomestic: false, hotness: 88,
    image: 'https://images.unsplash.com/photo-1758213452314-a8084a7ccb21?w=800&h=600&fit=crop',
    description: '吴哥微笑千年守望，丛林古寺光影斑驳（25字以内）',
    avgDailyBudget: 450, currency: 'CNY', timezone: 'Asia/Bangkok',
    tags: ['古迹', '丛林', '摄影', '佛教'],
    lat: 13.3622, lng: 103.8599,
  },
  {
    id: 'colombo', name: '科伦坡', nameEn: 'Colombo',
    pinyin: 'kelunpo', pinyinAbbr: 'klp', pinyinInitial: 'K',
    country: '斯里兰卡', countryPinyin: 'sililanka', countryPinyinInitial: 'S', continent: '亚洲', province: '',
    countryFlag: '🇱🇰',
    isDomestic: false, hotness: 86,
    image: 'https://images.unsplash.com/photo-1761566039630-5cc17851a0a1?w=800&h=600&fit=crop',
    description: '印度洋畔殖民风街巷，香料市集热浪翻涌（25字以内）',
    avgDailyBudget: 400, currency: 'CNY', timezone: 'Asia/Kolkata',
    tags: ['港口', '殖民建筑', '香料', '多元文化'],
    lat: 6.9271, lng: 79.8612,
  },
  {
    id: 'kathmandu', name: '加德满都', nameEn: 'Kathmandu',
    pinyin: 'jiademandu', pinyinAbbr: 'jdmdu', pinyinInitial: 'J',
    country: '尼泊尔', countryPinyin: 'niboer', countryPinyinInitial: 'N', continent: '亚洲', province: '',
    countryFlag: '🇳🇵',
    isDomestic: false, hotness: 85,
    image: 'https://images.unsplash.com/photo-1694768736459-eb5a68c91d85?w=800&h=600&fit=crop',
    description: '雪山环抱的神庙之城，转经筒声绕云端（25字以内）',
    avgDailyBudget: 380, currency: 'CNY', timezone: 'Asia/Kolkata',
    tags: ['宗教', '雪山', '手工艺', '徒步起点'],
    lat: 27.7172, lng: 85.324,
  },
  {
    id: 'vientiane', name: '万象', nameEn: 'Vientiane',
    pinyin: 'wanxiang', pinyinAbbr: 'wx', pinyinInitial: 'W',
    country: '老挝', countryPinyin: 'laowo', countryPinyinInitial: 'L', continent: '亚洲', province: '',
    countryFlag: '🇱🇦',
    isDomestic: false, hotness: 84,
    image: 'https://images.unsplash.com/photo-1768158186714-7a1b9df6d2c2?w=800&h=600&fit=crop',
    description: '湄公河畔法式慵懒，金色塔銮映霞光（25字以内）',
    avgDailyBudget: 430, currency: 'CNY', timezone: 'Asia/Bangkok',
    tags: ['首都', '法式风情', '佛教', '河景'],
    lat: 17.9678, lng: 102.6033,
  },
  {
    id: 'yangon', name: '仰光', nameEn: 'Yangon',
    pinyin: 'yangguang', pinyinAbbr: 'yg', pinyinInitial: 'Y',
    country: '缅甸', countryPinyin: 'miandian', countryPinyinInitial: 'M', continent: '亚洲', province: '',
    countryFlag: '🇲🇲',
    isDomestic: false, hotness: 83,
    image: 'https://images.unsplash.com/photo-1758177799559-f8c554b3d79b?w=800&h=600&fit=crop',
    description: '大金塔金光刺破晨雾，殖民街巷时光凝滞（25字以内）',
    avgDailyBudget: 460, currency: 'CNY', timezone: 'Asia/Bangkok',
    tags: ['佛塔', '殖民建筑', '历史', '市井'],
    lat: 16.8409, lng: 96.1735,
  },
  {
    id: 'hochiminhcity', name: '胡志明市', nameEn: 'Ho Chi Minh City',
    pinyin: 'huzhimingshi', pinyinAbbr: 'hzms', pinyinInitial: 'H',
    country: '越南', countryPinyin: 'yuenan', countryPinyinInitial: 'Y', continent: '亚洲', province: '',
    countryFlag: '🇻🇳',
    isDomestic: false, hotness: 82,
    image: 'https://images.unsplash.com/photo-1768158186746-e225fdfd9931?w=800&h=600&fit=crop',
    description: '西贡旧梦咖啡香浓，法越混血街巷生辉（25字以内）',
    avgDailyBudget: 480, currency: 'CNY', timezone: 'Asia/Bangkok',
    tags: ['都市', '法式建筑', '咖啡', '战争遗迹'],
    lat: 10.7703, lng: 106.7017,
  },
  {
    id: 'hanoi', name: '河内', nameEn: 'Hanoi',
    pinyin: 'henoi', pinyinAbbr: 'hn', pinyinInitial: 'H',
    country: '越南', countryPinyin: 'yuenan', countryPinyinInitial: 'Y', continent: '亚洲', province: '',
    countryFlag: '🇻🇳',
    isDomestic: false, hotness: 80,
    image: 'https://images.unsplash.com/photo-1770789992703-b2899b911b6f?w=800&h=600&fit=crop',
    description: '还剑湖畔法越交融，三十六行街烟火人间（25字以内）',
    avgDailyBudget: 470, currency: 'CNY', timezone: 'Asia/Tokyo',
    tags: ['古城', '湖泊', '法式', '小吃'],
    lat: 21.0278, lng: 105.8342,
  },
  {
    id: 'cagayan', name: '卡加延', nameEn: 'Cagayan de Oro',
    pinyin: 'kajiayan', pinyinAbbr: 'kjy', pinyinInitial: 'K',
    country: '菲律宾', countryPinyin: 'feilvbin', countryPinyinInitial: 'F', continent: '亚洲', province: '',
    countryFlag: '🇵🇭',
    isDomestic: false, hotness: 79,
    image: 'https://images.unsplash.com/photo-1523805009345-7448845a9e53?w=800&h=600&fit=crop',
    description: '白水漂流激荡山野，棉兰老岛秘境心跳（25字以内）',
    avgDailyBudget: 410, currency: 'CNY', timezone: 'UTC',
    tags: ['漂流', '自然', '冒险', '小众'],
    lat: 8.4775, lng: 124.8422,
  },
  {
    id: 'boracay', name: '长滩岛', nameEn: 'Boracay',
    pinyin: 'changtan dao', pinyinAbbr: 'ctd', pinyinInitial: 'C',
    country: '菲律宾', countryPinyin: 'feilvbin', countryPinyinInitial: 'F', continent: '亚洲', province: '',
    countryFlag: '🇵🇭',
    isDomestic: false, hotness: 78,
    image: 'https://images.unsplash.com/photo-1634645995827-885f9a67be50?w=800&h=600&fit=crop',
    description: '白沙滩细如面粉，落日帆影醉染碧海（25字以内）',
    avgDailyBudget: 650, currency: 'CNY', timezone: 'UTC',
    tags: ['海岛', '白沙', '日落', '水上活动'],
    lat: 11.9885, lng: 121.9203,
  },
  {
    id: 'chittagong', name: '吉大港', nameEn: 'Chittagong',
    pinyin: 'jidagang', pinyinAbbr: 'jdg', pinyinInitial: 'J',
    country: '孟加拉国', countryPinyin: 'mengjialaguo', countryPinyinInitial: 'M', continent: '亚洲', province: '',
    countryFlag: '🇧🇩',
    isDomestic: false, hotness: 77,
    image: 'https://images.unsplash.com/photo-1763920427595-d34290dd6ca4?w=800&h=600&fit=crop',
    description: '孟加拉湾畔古老商港，清真寺穹顶映潮汐（25字以内）',
    avgDailyBudget: 350, currency: 'CNY', timezone: 'Asia/Kolkata',
    tags: ['港口', '伊斯兰', '殖民遗迹', '渔港'],
    lat: 22.3381, lng: 91.8218,
  },
  {
    id: 'jaipur', name: '斋浦尔', nameEn: 'Jaipur',
    pinyin: 'zhaiyuer', pinyinAbbr: 'zye', pinyinInitial: 'Z',
    country: '印度', countryPinyin: 'yindu', countryPinyinInitial: 'Y', continent: '亚洲', province: '',
    countryFlag: '🇮🇳',
    isDomestic: false, hotness: 76,
    image: 'https://images.unsplash.com/photo-1603518944268-64850b9f1f1c?w=800&h=600&fit=crop',
    description: '粉红之城宫墙低语，拉贾斯坦瑰丽梦境（25字以内）',
    avgDailyBudget: 390, currency: 'CNY', timezone: 'Asia/Kolkata',
    tags: ['古城', '宫殿', '色彩', '手工艺'],
    lat: 26.9124, lng: 75.7873,
  },
  {
    id: 'varanasi', name: '瓦拉纳西', nameEn: 'Varanasi',
    pinyin: 'walanaxi', pinyinAbbr: 'wlnx', pinyinInitial: 'W',
    country: '印度', countryPinyin: 'yindu', countryPinyinInitial: 'Y', continent: '亚洲', province: '',
    countryFlag: '🇮🇳',
    isDomestic: false, hotness: 75,
    image: 'https://images.unsplash.com/photo-1698938000829-d635259fb332?w=800&h=600&fit=crop',
    description: '恒河晨浴圣火不熄，千年梵音萦绕石阶（25字以内）',
    avgDailyBudget: 360, currency: 'CNY', timezone: 'Asia/Kolkata',
    tags: ['宗教圣地', '恒河', '朝圣', '古老'],
    lat: 25.3167, lng: 83.0122,
  },
  {
    id: 'kandy', name: '康提', nameEn: 'Kandy',
    pinyin: 'kangti', pinyinAbbr: 'kt', pinyinInitial: 'K',
    country: '斯里兰卡', countryPinyin: 'sililanka', countryPinyinInitial: 'S', continent: '亚洲', province: '',
    countryFlag: '🇱🇰',
    isDomestic: false, hotness: 74,
    image: 'https://images.unsplash.com/photo-1592755137605-f53768fd7931?w=800&h=600&fit=crop',
    description: '圣牙寺藏佛牙舍利，山间湖城云雾缭绕（25字以内）',
    avgDailyBudget: 370, currency: 'CNY', timezone: 'Asia/Kolkata',
    tags: ['佛教', '湖泊', '山地', '文化'],
    lat: 7.2906, lng: 80.6337,
  },
  {
    id: 'baguio', name: '碧瑶', nameEn: 'Baguio',
    pinyin: 'biyao', pinyinAbbr: 'by', pinyinInitial: 'B',
    country: '菲律宾', countryPinyin: 'feilvbin', countryPinyinInitial: 'F', continent: '亚洲', province: '',
    countryFlag: '🇵🇭',
    isDomestic: false, hotness: 73,
    image: 'https://images.unsplash.com/photo-1764938385638-6f80f9370fe6?w=800&h=600&fit=crop',
    description: '菲律宾‘夏都’松林环绕，美式山城遗韵悠长（25字以内）',
    avgDailyBudget: 440, currency: 'CNY', timezone: 'UTC',
    tags: ['山城', '避暑', '松林', '美式遗产'],
    lat: 16.4221, lng: 120.5939,
  },
  {
    id: 'sapporo', name: '札幌', nameEn: 'Sapporo',
    pinyin: 'zhahu', pinyinAbbr: 'zh', pinyinInitial: 'Z',
    country: '日本', countryPinyin: 'riben', countryPinyinInitial: 'R', continent: '亚洲', province: '',
    countryFlag: '🇯🇵',
    isDomestic: false, hotness: 72,
    image: 'https://images.unsplash.com/photo-1713049721468-e55a876e4509?w=800&h=600&fit=crop',
    description: '北海道雪国之心，味噌拉面暖冬夜（25字以内）',
    avgDailyBudget: 760, currency: 'CNY', timezone: 'Asia/Tokyo',
    tags: ['都市', '冰雪节', '美食', '滑雪'],
    lat: 43.0618, lng: 141.3545,
  },
  {
    id: 'nagoya', name: '名古屋', nameEn: 'Nagoya',
    pinyin: 'mingguwu', pinyinAbbr: 'mgw', pinyinInitial: 'M',
    country: '日本', countryPinyin: 'riben', countryPinyinInitial: 'R', continent: '亚洲', province: '',
    countryFlag: '🇯🇵',
    isDomestic: false, hotness: 69,
    image: 'https://images.unsplash.com/photo-1736344272746-21079bcb0359?w=800&h=600&fit=crop',
    description: '中部工业重镇藏匠心，热田神宫诉战国风云（25字以内）',
    avgDailyBudget: 700, currency: 'CNY', timezone: 'Asia/Tokyo',
    tags: ['工业', '历史', '美食', '交通枢纽'],
    lat: 35.1815, lng: 136.9066,
  },
  {
    id: 'fukuoka', name: '福冈', nameEn: 'Fukuoka',
    pinyin: 'fugang', pinyinAbbr: 'fg', pinyinInitial: 'F',
    country: '日本', countryPinyin: 'riben', countryPinyinInitial: 'R', continent: '亚洲', province: '',
    countryFlag: '🇯🇵',
    isDomestic: false, hotness: 68,
    image: 'https://images.unsplash.com/photo-1716119387997-492bcb2be042?w=800&h=600&fit=crop',
    description: '博多拉面香飘九州，太宰府梅雨润千年（25字以内）',
    avgDailyBudget: 690, currency: 'CNY', timezone: 'Asia/Tokyo',
    tags: ['美食', '九州', '神社', '港口'],
    lat: 33.5904, lng: 130.4017,
  },
  {
    id: 'busan', name: '釜山', nameEn: 'Busan',
    pinyin: 'fushan', pinyinAbbr: 'fs', pinyinInitial: 'F',
    country: '韩国', countryPinyin: 'hanguo', countryPinyinInitial: 'H', continent: '亚洲', province: '',
    countryFlag: '🇰🇷',
    isDomestic: false, hotness: 67,
    image: 'https://images.unsplash.com/photo-1772017703535-0fd5be4b5bc3?w=800&h=600&fit=crop',
    description: '韩国最大海港，海云台浪花撞碎夕阳（25字以内）',
    avgDailyBudget: 660, currency: 'CNY', timezone: 'Asia/Tokyo',
    tags: ['海滨', '港口', '温泉', '电影'],
    lat: 35.1796, lng: 129.0756,
  },
  {
    id: 'macau', name: '澳门', nameEn: 'Macau',
    pinyin: 'aomen', pinyinAbbr: 'am', pinyinInitial: 'A',
    country: '中国', countryPinyin: 'zhongguo', countryPinyinInitial: 'Z', continent: '亚洲', province: '',
    countryFlag: '🇨🇳',
    isDomestic: false, hotness: 65,
    image: 'https://images.unsplash.com/photo-1772926390243-7acb97ff34f1?w=800&h=600&fit=crop',
    description: '葡韵老城光影斑驳，妈阁庙香火绵延四百年（25字以内）',
    avgDailyBudget: 820, currency: 'CNY', timezone: 'Asia/Tokyo',
    tags: ['博彩', '中西合璧', '历史', '美食'],
    lat: 22.1987, lng: 113.5439,
  },
  {
    id: 'penang', name: '槟城', nameEn: 'Penang',
    pinyin: 'bingcheng', pinyinAbbr: 'bc', pinyinInitial: 'B',
    country: '马来西亚', countryPinyin: 'malaixiya', countryPinyinInitial: 'M', continent: '亚洲', province: '',
    countryFlag: '🇲🇾',
    isDomestic: false, hotness: 64,
    image: 'https://images.unsplash.com/photo-1773912803269-66284196a596?w=800&h=600&fit=crop',
    description: '乔治市涂鸦巷弄生趣，娘惹糕甜入南洋旧梦（25字以内）',
    avgDailyBudget: 500, currency: 'CNY', timezone: 'Asia/Bangkok',
    tags: ['古城', '美食', '殖民', '文化'],
    lat: 5.4149, lng: 100.3292,
  },
  {
    id: 'hualien', name: '花莲', nameEn: 'Hualien',
    pinyin: 'hualien', pinyinAbbr: 'hl', pinyinInitial: 'H',
    country: '中国', countryPinyin: 'zhongguo', countryPinyinInitial: 'Z', continent: '亚洲', province: '',
    countryFlag: '🇨🇳',
    isDomestic: false, hotness: 63,
    image: 'https://images.unsplash.com/photo-1769847764199-98a81af7c408?w=800&h=600&fit=crop',
    description: '太平洋岸断崖惊涛，太鲁阁峡谷翡翠奔流（25字以内）',
    avgDailyBudget: 630, currency: 'CNY', timezone: 'Asia/Tokyo',
    tags: ['峡谷', '海岸', '原住民', '自然'],
    lat: 23.9739, lng: 121.6081,
  },
  {
    id: 'newyork', name: '纽约', nameEn: 'New York',
    pinyin: 'niuyue', pinyinAbbr: 'ny', pinyinInitial: 'N',
    country: '美国', countryPinyin: 'meiguo', countryPinyinInitial: 'M', continent: '北美洲', province: '',
    countryFlag: '🇺🇸',
    isDomestic: false, hotness: 95,
    image: 'https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?w=800&h=600&fit=crop',
    description: '时代广场霓虹不眠，自由女神守望梦想（24字）',
    avgDailyBudget: 1200, currency: 'CNY', timezone: 'America/New_York',
    tags: ['摩天楼', '百老汇', '博物馆', '多元文化'],
    lat: 40.7128, lng: -74.006,
  },
  {
    id: 'amsterdam', name: '阿姆斯特丹', nameEn: 'Amsterdam',
    pinyin: 'anmudan', pinyinAbbr: 'amd', pinyinInitial: 'A',
    country: '荷兰', countryPinyin: 'helan', countryPinyinInitial: 'H', continent: '欧洲', province: '',
    countryFlag: '🇳🇱',
    isDomestic: false, hotness: 91,
    image: 'https://images.unsplash.com/photo-1534351590666-13e3e96b5017?w=800&h=600&fit=crop',
    description: '运河如诗蜿蜒，郁金香与梵高在风中低语（24字）',
    avgDailyBudget: 900, currency: 'CNY', timezone: 'Europe/Paris',
    tags: ['运河', '博物馆', '自行车', '艺术'],
    lat: 52.3676, lng: 4.9041,
  },
  {
    id: 'prague', name: '布拉格', nameEn: 'Prague',
    pinyin: 'bulage', pinyinAbbr: 'blg', pinyinInitial: 'B',
    country: '捷克', countryPinyin: 'jieke', countryPinyinInitial: 'J', continent: '欧洲', province: '',
    countryFlag: '🇨🇿',
    isDomestic: false, hotness: 89,
    image: 'https://images.unsplash.com/photo-1519677100203-a0e668c92439?w=800&h=600&fit=crop',
    description: '查理大桥晨雾未散，童话城堡静立伏尔塔瓦河（25字）',
    avgDailyBudget: 650, currency: 'CNY', timezone: 'Europe/Paris',
    tags: ['古堡', '查理桥', '天文钟', '啤酒'],
    lat: 50.0755, lng: 14.4378,
  },
  {
    id: 'lisbon', name: '里斯本', nameEn: 'Lisbon',
    pinyin: 'lisiben', pinyinAbbr: 'lsb', pinyinInitial: 'L',
    country: '葡萄牙', countryPinyin: 'putaoya', countryPinyinInitial: 'P', continent: '欧洲', province: '',
    countryFlag: '🇵🇹',
    isDomestic: false, hotness: 87,
    image: 'https://images.unsplash.com/photo-1629726685246-692a1916682d?w=800&h=600&fit=crop',
    description: '电车爬坡穿七丘，大西洋落日熔金入海（23字）',
    avgDailyBudget: 720, currency: 'CNY', timezone: 'Europe/London',
    tags: ['电车', '海港', '瓷砖画', '法多音乐'],
    lat: 38.7223, lng: -9.1393,
  },
  {
    id: 'vienna', name: '维也纳', nameEn: 'Vienna',
    pinyin: 'weiyena', pinyinAbbr: 'wyn', pinyinInitial: 'W',
    country: '奥地利', countryPinyin: 'aodili', countryPinyinInitial: 'A', continent: '欧洲', province: '',
    countryFlag: '🇦🇹',
    isDomestic: false, hotness: 86,
    image: 'https://images.unsplash.com/photo-1516550893923-42d28e5677af?w=800&h=600&fit=crop',
    description: '金色大厅音符未落，美泉宫玫瑰正盛（22字）',
    avgDailyBudget: 880, currency: 'CNY', timezone: 'Europe/Paris',
    tags: ['古典音乐', '宫殿', '咖啡馆', '华尔兹'],
    lat: 48.2082, lng: 16.3738,
  },
  {
    id: 'berlin', name: '柏林', nameEn: 'Berlin',
    pinyin: 'bolin', pinyinAbbr: 'bl', pinyinInitial: 'B',
    country: '德国', countryPinyin: 'deguo', countryPinyinInitial: 'D', continent: '欧洲', province: '',
    countryFlag: '🇩🇪',
    isDomestic: false, hotness: 85,
    image: 'https://images.unsplash.com/photo-1560969184-10fe8719e047?w=800&h=600&fit=crop',
    description: '柏林墙涂鸦鲜活，博物馆岛沉淀千年回响（23字）',
    avgDailyBudget: 820, currency: 'CNY', timezone: 'Europe/Paris',
    tags: ['历史遗迹', '街头艺术', '设计', '夜生活'],
    lat: 52.52, lng: 13.405,
  },
  {
    id: 'reykjavik', name: '雷克雅未克', nameEn: 'Reykjavik',
    pinyin: 'leikeyaweike', pinyinAbbr: 'lkwyk', pinyinInitial: 'L',
    country: '冰岛', countryPinyin: 'bingdao', countryPinyinInitial: 'B', continent: '欧洲', province: '',
    countryFlag: '🇮🇸',
    isDomestic: false, hotness: 84,
    image: 'https://images.unsplash.com/photo-1504829857797-ddff29c27927?w=800&h=600&fit=crop',
    description: '极光掠过火山口，蓝湖蒸汽氤氲北欧冬夜（24字）',
    avgDailyBudget: 1300, currency: 'CNY', timezone: 'UTC',
    tags: ['极光', '温泉', '火山', '极昼极夜'],
    lat: 64.1466, lng: -21.9426,
  },
  {
    id: 'copenhaguen', name: '哥本哈根', nameEn: 'Copenhagen',
    pinyin: 'gebenhagen', pinyinAbbr: 'gbhg', pinyinInitial: 'G',
    country: '丹麦', countryPinyin: 'danmai', countryPinyinInitial: 'D', continent: '欧洲', province: '',
    countryFlag: '🇩🇰',
    isDomestic: false, hotness: 83,
    image: 'https://images.unsplash.com/photo-1764948935325-6a70829ffd73?w=800&h=600&fit=crop',
    description: '小美人鱼静望海港，新港彩屋倒映碧波（22字）',
    avgDailyBudget: 950, currency: 'CNY', timezone: 'Europe/Paris',
    tags: ['童话', '设计', '自行车', '港口'],
    lat: 55.6761, lng: 12.5683,
  },
  {
    id: 'zurich', name: '苏黎世', nameEn: 'Zurich',
    pinyin: 'sulishi', pinyinAbbr: 'sls', pinyinInitial: 'S',
    country: '瑞士', countryPinyin: 'ruishi', countryPinyinInitial: 'R', continent: '欧洲', province: '',
    countryFlag: '🇨🇭',
    isDomestic: false, hotness: 82,
    image: 'https://images.unsplash.com/photo-1515488764276-beab7607c1e6?w=800&h=600&fit=crop',
    description: '利马特河穿城而过，雪山为幕咖啡飘香（22字）',
    avgDailyBudget: 1100, currency: 'CNY', timezone: 'Europe/Paris',
    tags: ['金融中心', '湖泊', '雪山', '巧克力'],
    lat: 47.3769, lng: 8.5417,
  },
  {
    id: 'dubrovnik', name: '杜布罗夫尼克', nameEn: 'Dubrovnik',
    pinyin: 'duboluowenik', pinyinAbbr: 'dblwnk', pinyinInitial: 'D',
    country: '克罗地亚', countryPinyin: 'keluodiya', countryPinyinInitial: 'K', continent: '欧洲', province: '',
    countryFlag: '🇭🇷',
    isDomestic: false, hotness: 81,
    image: 'https://images.unsplash.com/photo-1679589170510-ecc0c498d755?w=800&h=600&fit=crop',
    description: '城墙环抱亚得里亚海，红瓦白墙如中世纪明信片（25字）',
    avgDailyBudget: 780, currency: 'CNY', timezone: 'Europe/Paris',
    tags: ['古城墙', '海景', ' Game of Thrones', '石板路'],
    lat: 42.6507, lng: 18.0944,
  },
  {
    id: 'budapest', name: '布达佩斯', nameEn: 'Budapest',
    pinyin: 'budaipesi', pinyinAbbr: 'bdps', pinyinInitial: 'B',
    country: '匈牙利', countryPinyin: 'xiongyali', countryPinyinInitial: 'X', continent: '欧洲', province: '',
    countryFlag: '🇭🇺',
    isDomestic: false, hotness: 80,
    image: 'https://images.unsplash.com/photo-1549923746-c502d488b3ea?w=800&h=600&fit=crop',
    description: '多瑙河畔双城辉映，链子桥灯火点亮千年（24字）',
    avgDailyBudget: 620, currency: 'CNY', timezone: 'Europe/Paris',
    tags: ['温泉浴场', '国会大厦', '多瑙河', '城堡山'],
    lat: 47.4979, lng: 19.0402,
  },
  {
    id: 'quebec', name: '魁北克市', nameEn: 'Quebec City',
    pinyin: 'kuibeikeye', pinyinAbbr: 'kbky', pinyinInitial: 'K',
    country: '加拿大', countryPinyin: 'jianada', countryPinyinInitial: 'J', continent: '北美洲', province: '',
    countryFlag: '🇨🇦',
    isDomestic: false, hotness: 79,
    image: 'https://images.unsplash.com/photo-1519832979-6fa011b87667?w=800&h=600&fit=crop',
    description: '北美最古老法语城，芳堤娜城堡守望圣劳伦斯（25字）',
    avgDailyBudget: 800, currency: 'CNY', timezone: 'America/New_York',
    tags: ['法语文化', '古城墙', '冬季嘉年华', '枫糖'],
    lat: 46.8139, lng: -71.208,
  },
  {
    id: 'vancouver', name: '温哥华', nameEn: 'Vancouver',
    pinyin: 'wengehua', pinyinAbbr: 'wgh', pinyinInitial: 'W',
    country: '加拿大', countryPinyin: 'jianada', countryPinyinInitial: 'J', continent: '北美洲', province: '',
    countryFlag: '🇨🇦',
    isDomestic: false, hotness: 78,
    image: 'https://images.unsplash.com/photo-1757266562608-2bbf67f92e71?w=800&h=600&fit=crop',
    description: '雪山入城，斯坦利公园海风拂面四季皆宜（23字）',
    avgDailyBudget: 920, currency: 'CNY', timezone: 'America/Los_Angeles',
    tags: ['自然城市', '太平洋', '滑雪', '多元移民'],
    lat: 49.2827, lng: -123.1207,
  },
  {
    id: 'mexicocity', name: '墨西哥城', nameEn: 'Mexico City',
    pinyin: 'moxigecheng', pinyinAbbr: 'mxgc', pinyinInitial: 'M',
    country: '墨西哥', countryPinyin: 'moxige', countryPinyinInitial: 'M', continent: '北美洲', province: '',
    countryFlag: '🇲🇽',
    isDomestic: false, hotness: 77,
    image: 'https://images.unsplash.com/photo-1518659526054-190340b32735?w=800&h=600&fit=crop',
    description: '阿兹特克遗址之上，壁画与美食共舞千年（23字）',
    avgDailyBudget: 550, currency: 'CNY', timezone: 'America/New_York',
    tags: ['古文明', '壁画', '辣椒美食', '高原湖城'],
    lat: 19.4326, lng: -99.1332,
  },
  {
    id: 'cancun', name: '坎昆', nameEn: 'Cancun',
    pinyin: 'kanqun', pinyinAbbr: 'kq', pinyinInitial: 'K',
    country: '墨西哥', countryPinyin: 'moxige', countryPinyinInitial: 'M', continent: '北美洲', province: '',
    countryFlag: '🇲🇽',
    isDomestic: false, hotness: 76,
    image: 'https://images.unsplash.com/photo-1552074284-5e88ef1aef18?w=800&h=600&fit=crop',
    description: '加勒比蔚蓝泻湖，玛雅丛林掩映白色沙滩（23字）',
    avgDailyBudget: 700, currency: 'CNY', timezone: 'America/New_York',
    tags: ['海岛度假', '玛雅遗址', '潜水', '夜生活'],
    lat: 21.1619, lng: -86.8515,
  },
  {
    id: 'lima', name: '利马', nameEn: 'Lima',
    pinyin: 'lima', pinyinAbbr: 'lm', pinyinInitial: 'L',
    country: '秘鲁', countryPinyin: 'milu', countryPinyinInitial: 'M', continent: '南美洲', province: '',
    countryFlag: '🇵🇪',
    isDomestic: false, hotness: 75,
    image: 'https://images.unsplash.com/photo-1687835071877-141868cd558a?w=800&h=600&fit=crop',
    description: '太平洋畔殖民明珠，悬崖边品一杯皮斯科酸（24字）',
    avgDailyBudget: 480, currency: 'CNY', timezone: 'America/New_York',
    tags: ['殖民建筑', '美食之都', '悬崖海景', '秘鲁菜'],
    lat: -12.0464, lng: -77.0428,
  },
  {
    id: 'cusco', name: '库斯科', nameEn: 'Cusco',
    pinyin: 'kuskou', pinyinAbbr: 'ksk', pinyinInitial: 'K',
    country: '秘鲁', countryPinyin: 'milu', countryPinyinInitial: 'M', continent: '南美洲', province: '',
    countryFlag: '🇵🇪',
    isDomestic: false, hotness: 74,
    image: 'https://images.unsplash.com/photo-1526392060635-9d6019884377?w=800&h=600&fit=crop',
    description: '印加帝国心脏，石墙无声诉说安第斯荣光（23字）',
    avgDailyBudget: 420, currency: 'CNY', timezone: 'America/New_York',
    tags: ['印加遗址', '高原', '圣谷', '传统纺织'],
    lat: -13.5164, lng: -71.9774,
  },
  {
    id: 'santiago', name: '圣地亚哥', nameEn: 'Santiago',
    pinyin: 'shengdiya ge', pinyinAbbr: 'sdyg', pinyinInitial: 'S',
    country: '智利', countryPinyin: 'zhili', countryPinyinInitial: 'Z', continent: '南美洲', province: '',
    countryFlag: '🇨🇱',
    isDomestic: false, hotness: 73,
    image: 'https://images.unsplash.com/photo-1597006438013-0f0cca2c1a03?w=800&h=600&fit=crop',
    description: '安第斯雪峰作背景，中央山谷红酒微醺（23字）',
    avgDailyBudget: 600, currency: 'CNY', timezone: 'America/New_York',
    tags: ['雪山', '葡萄酒', '殖民广场', '铜矿文化'],
    lat: -33.4484, lng: -70.6693,
  },
  {
    id: 'valparaiso', name: '瓦尔帕莱索', nameEn: 'Valparaiso',
    pinyin: 'waerpalaisuo', pinyinAbbr: 'welps', pinyinInitial: 'W',
    country: '智利', countryPinyin: 'zhili', countryPinyinInitial: 'Z', continent: '南美洲', province: '',
    countryFlag: '🇨🇱',
    isDomestic: false, hotness: 72,
    image: 'https://images.unsplash.com/photo-1773992476452-72b42409d4fd?w=800&h=600&fit=crop',
    description: '彩色山城攀陡坡，太平洋浪花吻上百年电梯（25字）',
    avgDailyBudget: 520, currency: 'CNY', timezone: 'America/New_York',
    tags: ['彩色建筑', '港口', '街头涂鸦', '诗人故居'],
    lat: -33.0458, lng: -71.6197,
  },
  {
    id: 'buenosaires', name: '布宜诺斯艾利斯', nameEn: 'Buenos Aires',
    pinyin: 'buyinosailisi', pinyinAbbr: 'bnsls', pinyinInitial: 'B',
    country: '阿根廷', countryPinyin: 'argentina', countryPinyinInitial: 'A', continent: '南美洲', province: '',
    countryFlag: '🇦🇷',
    isDomestic: false, hotness: 71,
    image: 'https://images.unsplash.com/photo-1589909202802-8f4aadce1849?w=800&h=600&fit=crop',
    description: '探戈在博卡区街角旋转，五月广场鸽群飞过（24字）',
    avgDailyBudget: 580, currency: 'CNY', timezone: 'UTC',
    tags: ['探戈', '欧式建筑', '牛肉', '文学'],
    lat: -34.6037, lng: -58.3816,
  },
  {
    id: 'rio', name: '里约热内卢', nameEn: 'Rio de Janeiro',
    pinyin: 'liyuoreneilu', pinyinAbbr: 'lyrnl', pinyinInitial: 'L',
    country: '巴西', countryPinyin: 'baxi', countryPinyinInitial: 'B', continent: '南美洲', province: '',
    countryFlag: '🇧🇷',
    isDomestic: false, hotness: 70,
    image: 'https://images.unsplash.com/photo-1483729558449-99ef09a8c325?w=800&h=600&fit=crop',
    description: '基督像俯瞰海湾，科帕卡巴纳沙滩永不落幕（24字）',
    avgDailyBudget: 650, currency: 'CNY', timezone: 'UTC',
    tags: ['海滩', '基督像', '狂欢节', '山海之城'],
    lat: -22.9068, lng: -43.1729,
  },
  {
    id: 'salvador', name: '萨尔瓦多', nameEn: 'Salvador',
    pinyin: 'saerwaduo', pinyinAbbr: 'sewd', pinyinInitial: 'S',
    country: '巴西', countryPinyin: 'baxi', countryPinyinInitial: 'B', continent: '南美洲', province: '',
    countryFlag: '🇧🇷',
    isDomestic: false, hotness: 69,
    image: 'https://images.unsplash.com/photo-1759375242319-b0a3ad1398ed?w=800&h=600&fit=crop',
    description: '巴西首个首都，葡式彩墙沿悬崖跌入大西洋（25字）',
    avgDailyBudget: 460, currency: 'CNY', timezone: 'UTC',
    tags: ['殖民遗产', '非洲文化', '悬崖教堂', '海鲜'],
    lat: -12.9714, lng: -38.5111,
  },
  {
    id: 'tromso', name: '特罗姆瑟', nameEn: 'Tromso',
    pinyin: 'teluomshe', pinyinAbbr: 'tlms', pinyinInitial: 'T',
    country: '挪威', countryPinyin: 'nuowei', countryPinyinInitial: 'N', continent: '欧洲', province: '',
    countryFlag: '🇳🇴',
    isDomestic: false, hotness: 68,
    image: 'https://images.unsplash.com/photo-1719932409557-0a639d488537?w=800&h=600&fit=crop',
    description: '北极圈内不夜城，极光猎人集结的玻璃屋营地（25字）',
    avgDailyBudget: 1400, currency: 'CNY', timezone: 'Europe/Paris',
    tags: ['极光', '北极圈', '峡湾', '萨米文化'],
    lat: 69.6492, lng: 18.9553,
  },
  {
    id: 'stockholm', name: '斯德哥尔摩', nameEn: 'Stockholm',
    pinyin: 'sidedegeomu', pinyinAbbr: 'sdgem', pinyinInitial: 'S',
    country: '瑞典', countryPinyin: 'ruidian', countryPinyinInitial: 'R', continent: '欧洲', province: '',
    countryFlag: '🇸🇪',
    isDomestic: false, hotness: 67,
    image: 'https://images.unsplash.com/photo-1729897101718-457e04670f48?w=800&h=600&fit=crop',
    description: '水道穿城如丝带，老城鹅卵石路通向维京传说（25字）',
    avgDailyBudget: 980, currency: 'CNY', timezone: 'Europe/Paris',
    tags: ['水上城市', '老城', '设计', '诺贝尔奖'],
    lat: 59.3293, lng: 18.0686,
  },
  {
    id: 'helsinki', name: '赫尔辛基', nameEn: 'Helsinki',
    pinyin: 'erxinsiji', pinyinAbbr: 'exsj', pinyinInitial: 'E',
    country: '芬兰', countryPinyin: 'fenlan', countryPinyinInitial: 'F', continent: '欧洲', province: '',
    countryFlag: '🇫🇮',
    isDomestic: false, hotness: 66,
    image: 'https://images.unsplash.com/photo-1538332576228-eb5b4c4de6f5?w=800&h=600&fit=crop',
    description: '白夜漫游设计之都，海港教堂静听波罗的海潮（25字）',
    avgDailyBudget: 930, currency: 'CNY', timezone: 'Europe/Paris',
    tags: ['设计', '海港', '桑拿', '白夜'],
    lat: 60.1699, lng: 24.9384,
  },
  {
    id: 'krakow', name: '克拉科夫', nameEn: 'Krakow',
    pinyin: 'kelakefu', pinyinAbbr: 'klkf', pinyinInitial: 'K',
    country: '波兰', countryPinyin: 'bolan', countryPinyinInitial: 'B', continent: '欧洲', province: '',
    countryFlag: '🇵🇱',
    isDomestic: false, hotness: 65,
    image: 'https://images.unsplash.com/photo-1657892479099-24fe3be52490?w=800&h=600&fit=crop',
    description: '欧洲最古老大学城，瓦维尔城堡见证千年王冠（25字）',
    avgDailyBudget: 500, currency: 'CNY', timezone: 'Europe/Paris',
    tags: ['中世纪老城', '犹太区', '盐矿', '学术氛围'],
    lat: 50.0647, lng: 19.945,
  },
  {
    id: 'edmonton', name: '埃德蒙顿', nameEn: 'Edmonton',
    pinyin: 'aidemendun', pinyinAbbr: 'adem', pinyinInitial: 'A',
    country: '加拿大', countryPinyin: 'jianada', countryPinyinInitial: 'J', continent: '北美洲', province: '',
    countryFlag: '🇨🇦',
    isDomestic: false, hotness: 64,
    image: 'https://images.unsplash.com/photo-1714539928024-7341c9fcea0c?w=800&h=600&fit=crop',
    description: '北方门户之城，西埃德蒙顿商城与河谷步道共生（25字）',
    avgDailyBudget: 760, currency: 'CNY', timezone: 'America/New_York',
    tags: ['河谷公园', '冬季活动', '原住民文化', '石油城'],
    lat: 53.5461, lng: -113.4938,
  },
  {
    id: 'halifax', name: '哈利法克斯', nameEn: 'Halifax',
    pinyin: 'halifaxi', pinyinAbbr: 'hlfx', pinyinInitial: 'H',
    country: '加拿大', countryPinyin: 'jianada', countryPinyinInitial: 'J', continent: '北美洲', province: '',
    countryFlag: '🇨🇦',
    isDomestic: false, hotness: 63,
    image: 'https://images.unsplash.com/photo-1714540764924-6102f1bfdd59?w=800&h=600&fit=crop',
    description: '大西洋畔军港城，灯塔守望帆影，龙虾鲜甜正当时（25字）',
    avgDailyBudget: 740, currency: 'CNY', timezone: 'America/New_York',
    tags: ['海港', '灯塔', '龙虾', '英伦风情'],
    lat: 44.6488, lng: -63.5752,
  },
  {
    id: 'santafe', name: '圣菲', nameEn: 'Santa Fe',
    pinyin: 'shengfei', pinyinAbbr: 'sf', pinyinInitial: 'S',
    country: '美国', countryPinyin: 'meiguo', countryPinyinInitial: 'M', continent: '北美洲', province: '',
    countryFlag: '🇺🇸',
    isDomestic: false, hotness: 62,
    image: 'https://images.unsplash.com/photo-1759375253713-bde59f4f5596?w=800&h=600&fit=crop',
    description: '北美最古老州府，土坯建筑与沙漠阳光共绘新墨西哥（25字）',
    avgDailyBudget: 860, currency: 'CNY', timezone: 'America/New_York',
    tags: ['土坯建筑', '艺术村', '印第安文化', '沙漠景观'],
    lat: 35.687, lng: -105.9378,
  },
  {
    id: 'dubai', name: '迪拜', nameEn: 'Dubai',
    pinyin: 'dubi', pinyinAbbr: 'db', pinyinInitial: 'D',
    country: '阿联酋', countryPinyin: 'alianqiu', countryPinyinInitial: 'A', continent: '亚洲', province: '',
    countryFlag: '🇦🇪',
    isDomestic: false, hotness: 96,
    image: 'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=800&h=600&fit=crop',
    description: '沙漠奇迹之城，帆船酒店耀夜空',
    avgDailyBudget: 1200, currency: 'CNY', timezone: 'Asia/Dubai',
    tags: ['奢华', '沙漠', '购物', '摩天楼'],
    lat: 25.2769, lng: 55.2962,
  },
  {
    id: 'cairo', name: '开罗', nameEn: 'Cairo',
    pinyin: 'kailuo', pinyinAbbr: 'kl', pinyinInitial: 'K',
    country: '埃及', countryPinyin: 'ejí', countryPinyinInitial: 'E', continent: '非洲', province: '',
    countryFlag: '🇪🇬',
    isDomestic: false, hotness: 93,
    image: 'https://images.unsplash.com/photo-1572252009286-268acec5ca0a?w=800&h=600&fit=crop',
    description: '尼罗河畔金字塔，千年法老守晨光',
    avgDailyBudget: 480, currency: 'CNY', timezone: 'Europe/Istanbul',
    tags: ['金字塔', '博物馆', '古城', '尼罗河'],
    lat: 30.0444, lng: 31.2357,
  },
  {
    id: 'telaviv', name: '特拉维夫', nameEn: 'Tel Aviv',
    pinyin: 'telawei fu', pinyinAbbr: 'tlwf', pinyinInitial: 'T',
    country: '以色列', countryPinyin: 'yiselie', countryPinyinInitial: 'Y', continent: '亚洲', province: '',
    countryFlag: '🇮🇱',
    isDomestic: false, hotness: 91,
    image: 'https://images.unsplash.com/photo-1544967082-d9d25d867d66?w=800&h=600&fit=crop',
    description: '地中海蓝岸，白城包豪斯跃动青春',
    avgDailyBudget: 850, currency: 'CNY', timezone: 'Europe/Istanbul',
    tags: ['海滨', '设计', '夜生活', '历史'],
    lat: 32.0853, lng: 34.7818,
  },
  {
    id: 'istanbul', name: '伊斯坦布尔', nameEn: 'Istanbul',
    pinyin: 'yisitanbuer', pinyinAbbr: 'ystbe', pinyinInitial: 'Y',
    country: '土耳其', countryPinyin: 'tuerqi', countryPinyinInitial: 'T', continent: '亚洲', province: '',
    countryFlag: '🇹🇷',
    isDomestic: false, hotness: 89,
    image: 'https://images.unsplash.com/photo-1524231757912-21f4fe3a7200?w=800&h=600&fit=crop',
    description: '横跨欧亚的千年帝都，蓝色清真寺映晚霞',
    avgDailyBudget: 700, currency: 'CNY', timezone: 'Europe/Istanbul',
    tags: ['清真寺', '集市', '海峡', '美食'],
    lat: 41.0082, lng: 28.9784,
  },
  {
    id: 'antalya', name: '安塔利亚', nameEn: 'Antalya',
    pinyin: 'antaliya', pinyinAbbr: 'atly', pinyinInitial: 'A',
    country: '土耳其', countryPinyin: 'tuerqi', countryPinyinInitial: 'T', continent: '亚洲', province: '',
    countryFlag: '🇹🇷',
    isDomestic: false, hotness: 87,
    image: 'https://images.unsplash.com/photo-1771236466067-c5e2600f81e4?w=800&h=600&fit=crop',
    description: '地中海翡翠海岸，古罗马门迎海风',
    avgDailyBudget: 620, currency: 'CNY', timezone: 'Europe/Istanbul',
    tags: ['海滨', '古城', '悬崖', '温泉'],
    lat: 36.8969, lng: 30.7133,
  },
  {
    id: 'cape town', name: '开普敦', nameEn: 'Cape Town',
    pinyin: 'kaipudun', pinyinAbbr: 'kpd', pinyinInitial: 'K',
    country: '南非', countryPinyin: 'nanfei', countryPinyinInitial: 'N', continent: '非洲', province: '',
    countryFlag: '🇿🇦',
    isDomestic: false, hotness: 85,
    image: 'https://images.unsplash.com/photo-1709136242318-937b7ae73073?w=800&h=600&fit=crop',
    description: '桌山云海间，好望角浪击天涯石',
    avgDailyBudget: 760, currency: 'CNY', timezone: 'Europe/Paris',
    tags: ['山海', '观景台', '葡萄酒', '野生动物'],
    lat: -33.9249, lng: 18.4241,
  },
  {
    id: 'marrakech', name: '马拉喀什', nameEn: 'Marrakech',
    pinyin: 'malakaishi', pinyinAbbr: 'mlks', pinyinInitial: 'M',
    country: '摩洛哥', countryPinyin: 'moluoge', countryPinyinInitial: 'M', continent: '非洲', province: '',
    countryFlag: '🇲🇦',
    isDomestic: false, hotness: 84,
    image: 'https://images.unsplash.com/photo-1587974928442-77dc3e0dba72?w=800&h=600&fit=crop',
    description: '红墙迷宫市集，撒哈拉风拂玫瑰香',
    avgDailyBudget: 520, currency: 'CNY', timezone: 'Europe/London',
    tags: ['集市', '庭院', '沙漠', '手工艺'],
    lat: 31.6295, lng: -7.9811,
  },
  {
    id: 'nairobi', name: '内罗毕', nameEn: 'Nairobi',
    pinyin: 'neiluobi', pinyinAbbr: 'nlb', pinyinInitial: 'N',
    country: '肯尼亚', countryPinyin: 'keniya', countryPinyinInitial: 'K', continent: '非洲', province: '',
    countryFlag: '🇰🇪',
    isDomestic: false, hotness: 82,
    image: 'https://images.unsplash.com/photo-1698320950193-d8ab1f94a7ee?w=800&h=600&fit=crop',
    description: '非洲之心跳动处，长颈鹿庄园共早餐',
    avgDailyBudget: 680, currency: 'CNY', timezone: 'Europe/Istanbul',
    tags: ['野生动物', '草原', '城市公园', '文化'],
    lat: -1.2864, lng: 36.8172,
  },
  {
    id: 'fiji', name: '斐济', nameEn: 'Fiji',
    pinyin: 'feiji', pinyinAbbr: 'fj', pinyinInitial: 'F',
    country: '斐济', countryPinyin: 'feiji', countryPinyinInitial: 'F', continent: '大洋洲', province: '',
    countryFlag: '🇫🇯',
    isDomestic: false, hotness: 81,
    image: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&h=600&fit=crop',
    description: '南太平洋微笑之国，珊瑚环抱白沙眠',
    avgDailyBudget: 950, currency: 'CNY', timezone: 'Australia/Sydney',
    tags: ['海岛', '潜水', '度假村', '文化'],
    lat: -18.1439, lng: 178.431,
  },
  {
    id: 'auckland', name: '奥克兰', nameEn: 'Auckland',
    pinyin: 'aikelan', pinyinAbbr: 'akl', pinyinInitial: 'A',
    country: '新西兰', countryPinyin: 'xinxilan', countryPinyinInitial: 'X', continent: '大洋洲', province: '',
    countryFlag: '🇳🇿',
    isDomestic: false, hotness: 80,
    image: 'https://images.unsplash.com/photo-1507699622108-4be3abd695ad?w=800&h=600&fit=crop',
    description: '千帆之都枕火山湾，毛利纹样融现代街',
    avgDailyBudget: 820, currency: 'CNY', timezone: 'Australia/Sydney',
    tags: ['港口', '火山', '毛利文化', '美食'],
    lat: -36.8485, lng: 174.7633,
  },
  {
    id: 'queenstown', name: '皇后镇', nameEn: 'Queenstown',
    pinyin: 'huanghouzhen', pinyinAbbr: 'hqz', pinyinInitial: 'H',
    country: '新西兰', countryPinyin: 'xinxilan', countryPinyinInitial: 'X', continent: '大洋洲', province: '',
    countryFlag: '🇳🇿',
    isDomestic: false, hotness: 79,
    image: 'https://images.unsplash.com/photo-1600476018932-d422d68cbbd1?w=800&h=600&fit=crop',
    description: '南岛心脏跳动地，雪山湖光冒险天堂',
    avgDailyBudget: 900, currency: 'CNY', timezone: 'Australia/Sydney',
    tags: ['湖泊', '雪山', '极限运动', '徒步'],
    lat: -45.0312, lng: 168.6626,
  },
  {
    id: 'tahiti', name: '大溪地', nameEn: 'Tahiti',
    pinyin: 'daxidi', pinyinAbbr: 'dxd', pinyinInitial: 'D',
    country: '法属波利尼西亚', countryPinyin: 'fashu bolinixiya', countryPinyinInitial: 'F', continent: '大洋洲', province: '',
    countryFlag: '🇵🇫',
    isDomestic: false, hotness: 78,
    image: 'https://images.unsplash.com/photo-1692903438784-6c5415a2d217?w=800&h=600&fit=crop',
    description: '波利尼西亚明珠，碧水浮屋听潮眠',
    avgDailyBudget: 1300, currency: 'CNY', timezone: 'America/Los_Angeles',
    tags: ['海岛', '水上屋', '泻湖', '文化'],
    lat: -17.651, lng: -149.4239,
  },
  {
    id: 'almaty', name: '阿拉木图', nameEn: 'Almaty',
    pinyin: 'alamu tu', pinyinAbbr: 'alt', pinyinInitial: 'A',
    country: '哈萨克斯坦', countryPinyin: 'hasakestan', countryPinyinInitial: 'H', continent: '亚洲', province: '',
    countryFlag: '🇰🇿',
    isDomestic: false, hotness: 77,
    image: 'https://images.unsplash.com/photo-1759518158486-59839bfc01b5?w=800&h=600&fit=crop',
    description: '天山脚下的绿洲城，苏联遗韵混中亚风',
    avgDailyBudget: 420, currency: 'CNY', timezone: 'Asia/Kolkata',
    tags: ['山脉', '苏联建筑', '果园', '滑雪'],
    lat: 43.2389, lng: 76.8897,
  },
  {
    id: 'bishkek', name: '比什凯克', nameEn: 'Bishkek',
    pinyin: 'bishenke', pinyinAbbr: 'bsk', pinyinInitial: 'B',
    country: '吉尔吉斯斯坦', countryPinyin: 'jierjisisitan', countryPinyinInitial: 'J', continent: '亚洲', province: '',
    countryFlag: '🇰🇬',
    isDomestic: false, hotness: 75,
    image: 'https://images.unsplash.com/photo-1763144967763-2a8a98cb8431?w=800&h=600&fit=crop',
    description: '天山北麓静谧都，列宁广场飘雪与诗',
    avgDailyBudget: 380, currency: 'CNY', timezone: 'Asia/Kolkata',
    tags: ['广场', '山脉', '苏联遗迹', '市场'],
    lat: 42.8746, lng: 74.5698,
  },
  {
    id: 'tashkent', name: '塔什干', nameEn: 'Tashkent',
    pinyin: 'tashen', pinyinAbbr: 'ts', pinyinInitial: 'T',
    country: '乌兹别克斯坦', countryPinyin: 'wuzibiekesitan', countryPinyinInitial: 'W', continent: '亚洲', province: '',
    countryFlag: '🇺🇿',
    isDomestic: false, hotness: 74,
    image: 'https://images.unsplash.com/photo-1742973266609-7ef932ecd21a?w=800&h=600&fit=crop',
    description: '丝路明珠焕新生，蓝穹清真寺诉千年',
    avgDailyBudget: 450, currency: 'CNY', timezone: 'Asia/Kolkata',
    tags: ['古城', '清真寺', '地铁', '丝绸'],
    lat: 41.2995, lng: 69.2401,
  },
  {
    id: 'samarkand', name: '撒马尔罕', nameEn: 'Samarkand',
    pinyin: 'samaerhan', pinyinAbbr: 'smeh', pinyinInitial: 'S',
    country: '乌兹别克斯坦', countryPinyin: 'wuzibiekesitan', countryPinyinInitial: 'W', continent: '亚洲', province: '',
    countryFlag: '🇺🇿',
    isDomestic: false, hotness: 73,
    image: 'https://images.unsplash.com/photo-1744873331959-f9afb81ec7de?w=800&h=600&fit=crop',
    description: '帖木儿帝国金心，雷吉斯坦广场星穹耀',
    avgDailyBudget: 430, currency: 'CNY', timezone: 'Asia/Kolkata',
    tags: ['古城', '伊斯兰建筑', '天文台', '手工地毯'],
    lat: 39.6541, lng: 66.9743,
  },
  {
    id: 'port louis', name: '路易港', nameEn: 'Port Louis',
    pinyin: 'luyigang', pinyinAbbr: 'lyg', pinyinInitial: 'L',
    country: '毛里求斯', countryPinyin: 'maoliqu', countryPinyinInitial: 'M', continent: '非洲', province: '',
    countryFlag: '🇲🇺',
    isDomestic: false, hotness: 72,
    image: 'https://images.unsplash.com/photo-1765978372751-aa89dc6d30e5?w=800&h=600&fit=crop',
    description: '印度洋彩虹港，殖民老城撞糖田海风',
    avgDailyBudget: 880, currency: 'CNY', timezone: 'Asia/Dubai',
    tags: ['港口', '多元文化', '蔗田', '海港'],
    lat: -20.1619, lng: 57.4999,
  },
  {
    id: 'grand baie', name: '大湾', nameEn: 'Grand Baie',
    pinyin: 'dawan', pinyinAbbr: 'dw', pinyinInitial: 'D',
    country: '毛里求斯', countryPinyin: 'maoliqu', countryPinyinInitial: 'M', continent: '非洲', province: '',
    countryFlag: '🇲🇺',
    isDomestic: false, hotness: 71,
    image: 'https://images.unsplash.com/photo-1768737817241-bbf91eb38158?w=800&h=600&fit=crop',
    description: '毛里求斯派对湾，粉沙滩上落日微醺',
    avgDailyBudget: 920, currency: 'CNY', timezone: 'Asia/Dubai',
    tags: ['海滩', '夜生活', '游艇', '潜水'],
    lat: -20.0292, lng: 57.6372,
  },
  {
    id: 'petra', name: '佩特拉', nameEn: 'Petra',
    pinyin: 'peitrala', pinyinAbbr: 'ptl', pinyinInitial: 'P',
    country: '约旦', countryPinyin: 'yuedan', countryPinyinInitial: 'Y', continent: '亚洲', province: '',
    countryFlag: '🇯🇴',
    isDomestic: false, hotness: 70,
    image: 'https://images.unsplash.com/photo-1771692639394-f3c63ff63ea1?w=800&h=600&fit=crop',
    description: '玫瑰古城凿岩中，西克峡谷光引秘境',
    avgDailyBudget: 560, currency: 'CNY', timezone: 'Europe/Istanbul',
    tags: ['古城', '峡谷', '岩石建筑', '考古'],
    lat: 30.3128, lng: 35.4729,
  },
  {
    id: 'amman', name: '安曼', nameEn: 'Amman',
    pinyin: 'anman', pinyinAbbr: 'am', pinyinInitial: 'A',
    country: '约旦', countryPinyin: 'yuedan', countryPinyinInitial: 'Y', continent: '亚洲', province: '',
    countryFlag: '🇯🇴',
    isDomestic: false, hotness: 69,
    image: 'https://images.unsplash.com/photo-1604157885654-5e2891bfacbe?w=800&h=600&fit=crop',
    description: '七丘之城叠古今，罗马剧场俯望橄榄山',
    avgDailyBudget: 490, currency: 'CNY', timezone: 'Europe/Istanbul',
    tags: ['古城', '罗马遗迹', '山顶城堡', '市场'],
    lat: 31.9539, lng: 35.9106,
  },
  {
    id: 'windhoek', name: '温得和克', nameEn: 'Windhoek',
    pinyin: 'wendeheke', pinyinAbbr: 'wdhk', pinyinInitial: 'W',
    country: '纳米比亚', countryPinyin: 'namibiya', countryPinyinInitial: 'N', continent: '非洲', province: '',
    countryFlag: '🇳🇦',
    isDomestic: false, hotness: 68,
    image: 'https://images.unsplash.com/photo-1668693313476-e2376f26bc59?w=800&h=600&fit=crop',
    description: '非洲高原德式城，独立纪念碑映赭石山',
    avgDailyBudget: 640, currency: 'CNY', timezone: 'Europe/Paris',
    tags: ['殖民建筑', '高原', '纪念碑', '自然'],
    lat: -22.5705, lng: 17.0834,
  },
  {
    id: 'zanzibar', name: '桑给巴尔', nameEn: 'Zanzibar',
    pinyin: 'sanggeibaer', pinyinAbbr: 'sgbe', pinyinInitial: 'S',
    country: '坦桑尼亚', countryPinyin: 'tansangniya', countryPinyinInitial: 'T', continent: '非洲', province: '',
    countryFlag: '🇹🇿',
    isDomestic: false, hotness: 67,
    image: 'https://images.unsplash.com/photo-1760815153677-d7984323db5d?w=800&h=600&fit=crop',
    description: '香料群岛老城，石头城月光染珊瑚巷',
    avgDailyBudget: 720, currency: 'CNY', timezone: 'Europe/Istanbul',
    tags: ['古城', '香料', '海滩', '斯瓦希里文化'],
    lat: -6.165, lng: 39.1967,
  },
  {
    id: 'luanda', name: '罗安达', nameEn: 'Luanda',
    pinyin: 'luoan da', pinyinAbbr: 'lad', pinyinInitial: 'L',
    country: '安哥拉', countryPinyin: 'angela', countryPinyinInitial: 'A', continent: '非洲', province: '',
    countryFlag: '🇦🇴',
    isDomestic: false, hotness: 66,
    image: 'https://images.unsplash.com/photo-1613457231357-a5db3bc5bd81?w=800&h=600&fit=crop',
    description: '大西洋畔葡式都，殖民教堂守棕榈海岸',
    avgDailyBudget: 1100, currency: 'CNY', timezone: 'Europe/Paris',
    tags: ['海滨', '殖民建筑', '夜生活', '美食'],
    lat: -8.8382, lng: 13.2392,
  },
  {
    id: 'astana', name: '努尔苏丹', nameEn: 'Nur-Sultan',
    pinyin: 'nuer sudi an', pinyinAbbr: 'nsda', pinyinInitial: 'N',
    country: '哈萨克斯坦', countryPinyin: 'hasakestan', countryPinyinInitial: 'H', continent: '亚洲', province: '',
    countryFlag: '🇰🇿',
    isDomestic: false, hotness: 65,
    image: 'https://images.unsplash.com/photo-1761731099628-9c4bd008140e?w=800&h=600&fit=crop',
    description: '未来主义草原都，可汗之帐穹顶耀星辰',
    avgDailyBudget: 460, currency: 'CNY', timezone: 'Asia/Kolkata',
    tags: ['现代建筑', '草原', '政治中心', '雕塑'],
    lat: 51.1694, lng: 71.4491,
  },
  {
    id: 'george town', name: '乔治市', nameEn: 'George Town',
    pinyin: 'qiaozhizhi', pinyinAbbr: 'qzz', pinyinInitial: 'Q',
    country: '马来西亚', countryPinyin: 'malaixiya', countryPinyinInitial: 'M', continent: '亚洲', province: '',
    countryFlag: '🇲🇾',
    isDomestic: false, hotness: 64,
    image: 'https://images.unsplash.com/photo-1759476313138-7934a8ed94c5?w=800&h=600&fit=crop',
    description: '槟城壁画小巷，娘惹瓷光映百年骑楼',
    avgDailyBudget: 390, currency: 'CNY', timezone: 'Asia/Bangkok',
    tags: ['壁画', '娘惹文化', '骑楼', '世界遗产'],
    lat: 5.4149, lng: 100.3292,
  },
  {
    id: 'valletta', name: '瓦莱塔', nameEn: 'Valletta',
    pinyin: 'waleita', pinyinAbbr: 'wlt', pinyinInitial: 'W',
    country: '马耳他', countryPinyin: 'maer_ta', countryPinyinInitial: 'M', continent: '欧洲', province: '',
    countryFlag: '🇲🇹',
    isDomestic: false, hotness: 62,
    image: 'https://images.unsplash.com/photo-1672155411078-75c98b88606e?w=800&h=600&fit=crop',
    description: '地中海骑士堡，巴洛克巷口望蓝洞天光',
    avgDailyBudget: 780, currency: 'CNY', timezone: 'Europe/Paris',
    tags: ['古城', '骑士团', '海港', '巴洛克'],
    lat: 35.8992, lng: 14.5141,
  },
  {
    id: 'la paz', name: '拉巴斯', nameEn: 'La Paz',
    pinyin: 'labasi', pinyinAbbr: 'lbs', pinyinInitial: 'L',
    country: '玻利维亚', countryPinyin: 'bolivya', countryPinyinInitial: 'B', continent: '南美洲', province: '',
    countryFlag: '🇧🇴',
    isDomestic: false, hotness: 60,
    image: 'https://images.unsplash.com/photo-1760726394506-855463da8979?w=800&h=600&fit=crop',
    description: '世界最高首都，缆车穿云掠印加山谷',
    avgDailyBudget: 470, currency: 'CNY', timezone: 'America/New_York',
    tags: ['高原', '缆车', '印加文化', '市场'],
    lat: -16.5, lng: -68.15,
  },
]

/* ═══════════════════════════════════════════════════════════════════
 * 导出 & 工具函数
 * ═══════════════════════════════════════════════════════════════════ */

export const allDestinations: DestinationCity[] = [...domesticCities, ...internationalCities]

/** Get only domestic cities */
export function getDomesticCities(): DestinationCity[] {
  return domesticCities
}

/** Get only international cities */
export function getInternationalCities(): DestinationCity[] {
  return internationalCities
}

/* ── Grouping ── */

export interface LetterGroup {
  letter: string
  cities: DestinationCity[]
}

/** Group domestic cities by pinyin initial, sorted by letter;
 *  within each letter, sorted by hotness descending */
export function groupDomesticByLetter(): LetterGroup[] {
  const map = new Map<string, DestinationCity[]>()
  for (const c of domesticCities) {
    const letter = c.pinyinInitial
    if (!map.has(letter)) map.set(letter, [])
    map.get(letter)!.push(c)
  }
  // Sort within each letter by hotness desc
  for (const cities of map.values()) {
    cities.sort((a, b) => b.hotness - a.hotness)
  }
  // Sort letters alphabetically
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([letter, cities]) => ({ letter, cities }))
}

export interface CountryGroup {
  country: string
  countryEn: string
  countryPinyin: string
  countryPinyinInitial: string
  countryFlag: string
  /** Average hotness of all cities in this country */
  avgHotness: number
  cities: DestinationCity[]
}

/** Group international cities by country, sorted by country pinyin initial;
 *  same initial → sorted by average hotness descending */
export function groupInternationalByCountry(): CountryGroup[] {
  const map = new Map<string, DestinationCity[]>()
  for (const c of internationalCities) {
    if (!map.has(c.country)) map.set(c.country, [])
    map.get(c.country)!.push(c)
  }

  const groups: CountryGroup[] = []
  for (const [country, cities] of map.entries()) {
    const first = cities[0]
    const avgHotness = Math.round(cities.reduce((s, c) => s + c.hotness, 0) / cities.length)
    // Sort cities within country by hotness desc
    cities.sort((a, b) => b.hotness - a.hotness)
    groups.push({
      country,
      countryEn: first.nameEn, // Not perfect but OK for display
      countryPinyin: first.countryPinyin,
      countryPinyinInitial: first.countryPinyinInitial,
      countryFlag: first.countryFlag,
      avgHotness,
      cities,
    })
  }

  // Sort by country pinyin initial, then by avgHotness desc for same initial
  groups.sort((a, b) => {
    const cmp = a.countryPinyinInitial.localeCompare(b.countryPinyinInitial)
    if (cmp !== 0) return cmp
    return b.avgHotness - a.avgHotness
  })

  return groups
}

/* ── Continent-based Grouping (大洲 → 国家 → 热门 + 拼音索引) ── */

const COUNTRY_TO_CONTINENT: Record<string, string> = {
  // 亚洲
  '日本': '亚洲', '韩国': '亚洲', '泰国': '亚洲', '越南': '亚洲',
  '马来西亚': '亚洲', '新加坡': '亚洲', '印度尼西亚': '亚洲', '菲律宾': '亚洲',
  '柬埔寨': '亚洲', '老挝': '亚洲', '缅甸': '亚洲', '印度': '亚洲',
  '斯里兰卡': '亚洲', '尼泊尔': '亚洲', '孟加拉国': '亚洲', '中国': '亚洲',
  // 中东/中亚 归入亚洲
  '阿联酋': '亚洲', '土耳其': '亚洲', '以色列': '亚洲', '约旦': '亚洲',
  '哈萨克斯坦': '亚洲', '吉尔吉斯斯坦': '亚洲', '乌兹别克斯坦': '亚洲',
  // 欧洲
  '法国': '欧洲', '英国': '欧洲', '意大利': '欧洲', '西班牙': '欧洲',
  '希腊': '欧洲', '荷兰': '欧洲', '捷克': '欧洲', '葡萄牙': '欧洲',
  '奥地利': '欧洲', '德国': '欧洲', '瑞士': '欧洲', '冰岛': '欧洲',
  '丹麦': '欧洲', '克罗地亚': '欧洲', '匈牙利': '欧洲', '挪威': '欧洲',
  '瑞典': '欧洲', '芬兰': '欧洲', '波兰': '欧洲', '马耳他': '欧洲',
  // 美洲
  '美国': '美洲', '加拿大': '美洲', '墨西哥': '美洲',
  '巴西': '美洲', '阿根廷': '美洲', '秘鲁': '美洲', '智利': '美洲', '玻利维亚': '美洲',
  // 非洲
  '埃及': '非洲', '南非': '非洲', '摩洛哥': '非洲', '肯尼亚': '非洲',
  '毛里求斯': '非洲', '坦桑尼亚': '非洲', '纳米比亚': '非洲', '安哥拉': '非洲',
  // 大洋洲
  '澳大利亚': '大洋洲', '新西兰': '大洋洲', '斐济': '大洋洲',
  '法属波利尼西亚': '大洋洲', '马尔代夫': '大洋洲',
}

const CONTINENT_ORDER: { name: string; emoji: string }[] = [
  { name: '亚洲', emoji: '🌏' },
  { name: '欧洲', emoji: '🏰' },
  { name: '美洲', emoji: '🌎' },
  { name: '非洲', emoji: '🌍' },
  { name: '大洋洲', emoji: '🏖️' },
]

export interface CountrySection {
  country: string
  countryFlag: string
  countryPinyin: string
  /** Top hot cities for this season (hotness >= threshold or top N) */
  hotCities: DestinationCity[]
  /** Remaining cities grouped by pinyin initial */
  otherByLetter: { letter: string; cities: DestinationCity[] }[]
  /** All cities count */
  totalCities: number
  avgHotness: number
}

export interface ContinentGroup {
  continent: string
  continentEmoji: string
  countries: CountrySection[]
  totalCities: number
}

/** Group international cities: Continent → Country → (Hot + Pinyin-indexed) */
export function groupInternationalByContinent(): ContinentGroup[] {
  // 1. Assign continent to each city
  const continentMap = new Map<string, Map<string, DestinationCity[]>>()

  for (const c of internationalCities) {
    const continent = COUNTRY_TO_CONTINENT[c.country] || '其他'
    if (!continentMap.has(continent)) continentMap.set(continent, new Map())
    const countryMap = continentMap.get(continent)!
    if (!countryMap.has(c.country)) countryMap.set(c.country, [])
    countryMap.get(c.country)!.push(c)
  }

  // 2. Build continent groups in predefined order
  const result: ContinentGroup[] = []

  for (const { name, emoji } of CONTINENT_ORDER) {
    const countryMap = continentMap.get(name)
    if (!countryMap) continue

    const countries: CountrySection[] = []

    for (const [country, cities] of countryMap.entries()) {
      // Sort all cities by hotness desc
      cities.sort((a, b) => b.hotness - a.hotness)
      const avgHotness = Math.round(cities.reduce((s, c) => s + c.hotness, 0) / cities.length)
      const first = cities[0]

      // Split: hot cities (top 3 or hotness >= 75) vs rest
      const hotThreshold = Math.min(3, cities.length)
      const hotCities = cities.slice(0, hotThreshold)
      const restCities = cities.slice(hotThreshold)

      // Group rest by pinyin initial
      const letterMap = new Map<string, DestinationCity[]>()
      for (const c of restCities) {
        const letter = c.pinyinInitial
        if (!letterMap.has(letter)) letterMap.set(letter, [])
        letterMap.get(letter)!.push(c)
      }
      const otherByLetter = Array.from(letterMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([letter, cs]) => ({ letter, cities: cs }))

      countries.push({
        country,
        countryFlag: first.countryFlag,
        countryPinyin: first.countryPinyin,
        hotCities,
        otherByLetter,
        totalCities: cities.length,
        avgHotness,
      })
    }

    // Sort countries by avgHotness desc within continent
    countries.sort((a, b) => b.avgHotness - a.avgHotness)

    result.push({
      continent: name,
      continentEmoji: emoji,
      countries,
      totalCities: countries.reduce((s, c) => s + c.totalCities, 0),
    })
  }

  // Handle "其他" continent if any
  const otherMap = continentMap.get('其他')
  if (otherMap && otherMap.size > 0) {
    const countries: CountrySection[] = []
    for (const [country, cities] of otherMap.entries()) {
      cities.sort((a, b) => b.hotness - a.hotness)
      const avgHotness = Math.round(cities.reduce((s, c) => s + c.hotness, 0) / cities.length)
      const first = cities[0]
      countries.push({
        country,
        countryFlag: first.countryFlag,
        countryPinyin: first.countryPinyin,
        hotCities: cities.slice(0, 3),
        otherByLetter: [],
        totalCities: cities.length,
        avgHotness,
      })
    }
    result.push({ continent: '其他', continentEmoji: '🌐', countries, totalCities: countries.reduce((s, c) => s + c.totalCities, 0) })
  }

  return result
}

/* ── Search ── */

export interface SearchResult {
  city: DestinationCity
  score: number
}

/** Search destinations by keyword (Chinese, English, or pinyin).
 *  Returns results sorted by relevance score descending. */
/** Sub-region → countries mapping for region-based search (e.g. "东南亚") */
const REGION_COUNTRIES: Record<string, string[]> = {
  '东南亚': ['泰国', '越南', '马来西亚', '新加坡', '印度尼西亚', '菲律宾', '柬埔寨', '老挝', '缅甸'],
  '南亚': ['印度', '斯里兰卡', '尼泊尔', '孟加拉国'],
  '中东': ['阿联酋', '土耳其', '以色列', '约旦'],
  '北欧': ['丹麦', '挪威', '瑞典', '芬兰', '冰岛'],
  '南美': ['巴西', '阿根廷', '秘鲁', '智利', '玻利维亚'],
}

/** Get the continent for a given country */
function getContinentForCountry(country: string): string | undefined {
  return COUNTRY_TO_CONTINENT[country]
}

export function searchDestinations(query: string): SearchResult[] {
  const q = query.toLowerCase().trim()
  if (!q) return []

  const results: SearchResult[] = []

  // Pre-compute: check if query matches a continent or sub-region
  const matchedContinentCountries = new Set<string>()

  // Check continent match (e.g. "欧洲", "亚洲", "美洲")
  for (const [country, continent] of Object.entries(COUNTRY_TO_CONTINENT)) {
    if (continent.includes(q)) {
      matchedContinentCountries.add(country)
    }
  }

  // Check sub-region match (e.g. "东南亚", "北欧", "中东")
  for (const [region, countries] of Object.entries(REGION_COUNTRIES)) {
    if (region.includes(q)) {
      countries.forEach(c => matchedContinentCountries.add(c))
    }
  }

  for (const city of allDestinations) {
    let score = 0

    // Exact name match
    if (city.name === q) {
      score = 100
    }
    // Name starts with query
    else if (city.name.startsWith(q)) {
      score = 85
    }
    // Name contains query
    else if (city.name.includes(q)) {
      score = 70
    }
    // English name match
    else if (city.nameEn.toLowerCase() === q) {
      score = 90
    }
    else if (city.nameEn.toLowerCase().startsWith(q)) {
      score = 75
    }
    else if (city.nameEn.toLowerCase().includes(q)) {
      score = 60
    }
    // Pinyin match
    else if (city.pinyin === q) {
      score = 88
    }
    else if (city.pinyin.startsWith(q)) {
      score = 65
    }
    // Abbreviated pinyin match
    else if (city.pinyinAbbr.startsWith(q)) {
      score = 55
    }
    // Country / province name match
    else if (city.country.includes(q) || city.province.includes(q)) {
      score = 50
    }
    // Country pinyin match (domestic cities keep original province pinyin in countryPinyin)
    else if (city.countryPinyin.startsWith(q)) {
      score = 45
    }
    // Tag match
    else if (city.tags.some(t => t.includes(q))) {
      score = 40
    }
    // Extra: match "中国" for domestic cities
    else if (q === '中国' && city.isDomestic) {
      score = 35
    }
    // Continent / sub-region match (e.g. "欧洲", "东南亚")
    else if (matchedContinentCountries.has(city.country)) {
      score = 42
    }
    // English country match
    else if (city.nameEn.toLowerCase().includes(q)) {
      score = 30
    }

    if (score > 0) {
      // Boost by hotness (0-5 bonus)
      score += city.hotness / 20
      results.push({ city, score })
    }
  }

  results.sort((a, b) => b.score - a.score)
  return results
}

/** Get quick search suggestions (popular tags/regions) */
export const quickSearchTags = [
  { label: '日本', emoji: '🇯🇵', query: '日本' },
  { label: '海岛度假', emoji: '🏝️', query: '海岛' },
  { label: '东南亚', emoji: '🌴', query: '东南亚' },
  { label: '欧洲', emoji: '🏰', query: '欧洲' },
  { label: '国内热门', emoji: '🏙️', query: '中国' },
  { label: '蜜月旅行', emoji: '💑', query: '蜜月' },
]

/** Get all unique pinyin initials for domestic cities */
export function getDomesticLetters(): string[] {
  const set = new Set<string>()
  for (const c of domesticCities) set.add(c.pinyinInitial)
  return Array.from(set).sort()
}
