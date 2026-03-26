/**
 * fetch-cities-batch.ts
 * 批量调用千问 API，补齐国内100 + 国际100城市数据
 *
 * Usage: npx tsx scripts/fetch-cities-batch.ts
 */

import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const DASHSCOPE_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'
const MODEL_NAME = 'qwen-plus'

function loadApiKey(): string {
  const envPath = path.resolve(__dirname, '..', '.env.local')
  const content = fs.readFileSync(envPath, 'utf-8')
  const match = content.match(/VITE_DASHSCOPE_API_KEY=(.+)/)
  if (!match) throw new Error('Cannot find VITE_DASHSCOPE_API_KEY in .env.local')
  return match[1].trim()
}

interface CityRaw {
  id: string
  name: string
  nameEn: string
  pinyin: string
  pinyinAbbr: string
  pinyinInitial: string
  province?: string
  country?: string
  countryEn?: string
  countryPinyin?: string
  countryPinyinInitial?: string
  countryFlag?: string
  description: string
  avgDailyBudget: number
  tags: string[]
  lat: number
  lng: number
  hotness: number
}

async function callQwen(apiKey: string, prompt: string, systemPrompt: string): Promise<string> {
  const response = await fetch(DASHSCOPE_BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL_NAME,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 8000,
    }),
  })

  if (!response.ok) {
    const errData = await response.json().catch(() => ({})) as any
    throw new Error(`API Error: ${errData?.error?.message || response.status}`)
  }

  const data = await response.json() as any
  const text = data?.choices?.[0]?.message?.content
  if (!text) throw new Error('Empty response from Qwen')
  return text
}

function repairJSON(text: string): any[] {
  let clean = text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim()
  const arrStart = clean.indexOf('[')
  if (arrStart === -1) throw new Error('No JSON array found')
  clean = clean.slice(arrStart)

  // Try parse directly
  try { return JSON.parse(clean) } catch {}

  // Repair: find last complete object
  const lastBrace = clean.lastIndexOf('}')
  if (lastBrace === -1) throw new Error('No complete object found')
  const truncated = clean.slice(0, lastBrace + 1) + ']'
  try { return JSON.parse(truncated) } catch {}

  throw new Error('JSON repair failed')
}

const SYSTEM_PROMPT = '你是一位资深旅行规划师和全球旅游专家。你只输出合法的JSON，不输出任何其他文字或代码块标记。'

// ═══════════════════════════════════════════
// DOMESTIC CITIES
// ═══════════════════════════════════════════

const EXISTING_DOMESTIC = [
  '三亚', '成都', '杭州', '重庆', '北京', '上海', '西安', '厦门',
  '大理', '丽江', '桂林', '苏州', '南京', '青岛', '长沙', '武汉',
  '拉萨', '张家界', '黄山', '昆明',
  // 千问第1批
  '广州', '深圳', '天津', '宁波', '泉州', '洛阳', '开封', '乌镇',
  '阳朔', '北海', '梧州', '九寨沟', '郎木寺', '兴城', '额尔古纳',
  '呼伦贝尔', '香格里拉', '西双版纳', '五指山', '涠洲岛', '烟台',
  '秦皇岛', '宏村', '平遥', '丹东', '宜昌', '珠海', '兰州', '张掖',
  '敦煌', '哈尔滨',
]

async function fetchDomesticBatch(apiKey: string, existingNames: string[], batchNum: number, count: number): Promise<CityRaw[]> {
  const existList = existingNames.join('、')
  const prompt = `请推荐${count}个中国国内热门旅游城市/目的地，严格不要与以下已有城市重复：
${existList}

请覆盖多种类型：省会城市、地级市、县级旅游目的地、古镇古村、自然景区等。
要覆盖全国各省份（东北、华北、华东、华中、华南、西南、西北）。

直接输出JSON数组，格式如下：
[
  {
    "id": "wuyishan",
    "name": "武夷山",
    "nameEn": "Wuyishan",
    "pinyin": "wuyishan",
    "pinyinAbbr": "wys",
    "pinyinInitial": "W",
    "province": "福建",
    "description": "碧水丹山，大红袍茶香飘九曲溪（25字以内）",
    "avgDailyBudget": 450,
    "tags": ["岩茶", "丹霞", "竹筏", "九曲溪"],
    "lat": 27.7564,
    "lng": 118.0353,
    "hotness": 72
  }
]

要求：
1. id 使用拼音小写，无空格无声调
2. pinyin 完整拼音小写无声调，pinyinAbbr 取每个字拼音首字母
3. pinyinInitial 拼音首字母大写
4. province 填所属省份/自治区/直辖市
5. description 25字以内，文艺有吸引力
6. tags 4个标签
7. lat/lng 精确到小数点后4位
8. hotness 当季（3月春季）旅游热度 0-100
9. avgDailyBudget 人民币日均预算
10. 按 hotness 从高到低排序
11. 严格输出${count}个城市，不多不少`

  console.log(`  📡 [国内第${batchNum}批] 请求 ${count} 个城市...`)
  const text = await callQwen(apiKey, prompt, SYSTEM_PROMPT)
  const cities = repairJSON(text)
  console.log(`  ✅ [国内第${batchNum}批] 获取到 ${cities.length} 个`)
  return cities
}

// ═══════════════════════════════════════════
// INTERNATIONAL CITIES
// ═══════════════════════════════════════════

const EXISTING_INTL = [
  '东京', '京都', '大阪', '北海道', '曼谷', '清迈', '普吉岛',
  '首尔', '济州岛', '巴厘岛', '巴黎', '新加坡', '马尔代夫',
  '伦敦', '罗马', '圣托里尼', '悉尼', '巴塞罗那', '岘港', '吉隆坡',
]

async function fetchInternationalBatch(apiKey: string, existingNames: string[], batchNum: number, count: number, regionHint: string): Promise<CityRaw[]> {
  const existList = existingNames.join('、')
  const prompt = `请推荐${count}个国际热门旅游城市/目的地，严格不要与以下已有城市重复：
${existList}

重点推荐区域：${regionHint}
包含各种类型：首都/大城市、海岛度假、历史古城、自然景观、小众但热门的目的地。

直接输出JSON数组，格式如下：
[
  {
    "id": "istanbul",
    "name": "伊斯坦布尔",
    "nameEn": "Istanbul",
    "pinyin": "yisitanbuer",
    "pinyinAbbr": "ystbe",
    "pinyinInitial": "Y",
    "country": "土耳其",
    "countryEn": "Turkey",
    "countryPinyin": "tuerqi",
    "countryPinyinInitial": "T",
    "countryFlag": "🇹🇷",
    "description": "横跨欧亚的千年帝都，蓝色清真寺映晚霞（25字以内）",
    "avgDailyBudget": 700,
    "tags": ["清真寺", "集市", "海峡", "美食"],
    "lat": 41.0082,
    "lng": 28.9784,
    "hotness": 82
  }
]

要求：
1. id 使用英文名小写，无空格（如 newyork, capetown）
2. pinyin 是中文名的拼音小写无声调，pinyinAbbr 取每个字拼音首字母
3. pinyinInitial 拼音首字母大写
4. country 中文国名, countryEn 英文国名
5. countryPinyin 国名拼音, countryPinyinInitial 国名拼音首字母大写
6. countryFlag 对应国旗 emoji
7. description 25字以内，文艺有吸引力
8. tags 4个标签
9. lat/lng 精确到小数点后4位
10. hotness 对中国游客的当季旅游热度 0-100
11. avgDailyBudget 人民币日均预算
12. 按 hotness 从高到低排序
13. 严格输出${count}个城市`

  console.log(`  📡 [国际第${batchNum}批] 请求 ${count} 个 (${regionHint})...`)
  const text = await callQwen(apiKey, prompt, SYSTEM_PROMPT)
  const cities = repairJSON(text)
  console.log(`  ✅ [国际第${batchNum}批] 获取到 ${cities.length} 个`)
  return cities
}

// ═══════════════════════════════════════════
// Province pinyin mapping for domestic cities
// ═══════════════════════════════════════════

const PROVINCE_PINYIN: Record<string, [string, string]> = {
  '北京': ['beijing', 'B'], '天津': ['tianjin', 'T'], '上海': ['shanghai', 'S'],
  '重庆': ['chongqing', 'C'], '河北': ['hebei', 'H'], '山西': ['shanxi', 'S'],
  '辽宁': ['liaoning', 'L'], '吉林': ['jilin', 'J'], '黑龙江': ['heilongjiang', 'H'],
  '江苏': ['jiangsu', 'J'], '浙江': ['zhejiang', 'Z'], '安徽': ['anhui', 'A'],
  '福建': ['fujian', 'F'], '江西': ['jiangxi', 'J'], '山东': ['shandong', 'S'],
  '河南': ['henan', 'H'], '湖北': ['hubei', 'H'], '湖南': ['hunan', 'H'],
  '广东': ['guangdong', 'G'], '海南': ['hainan', 'H'], '四川': ['sichuan', 'S'],
  '贵州': ['guizhou', 'G'], '云南': ['yunnan', 'Y'], '陕西': ['shaanxi', 'S'],
  '甘肃': ['gansu', 'G'], '青海': ['qinghai', 'Q'], '台湾': ['taiwan', 'T'],
  '内蒙古': ['neimenggu', 'N'], '广西': ['guangxi', 'G'], '西藏': ['xizang', 'X'],
  '宁夏': ['ningxia', 'N'], '新疆': ['xinjiang', 'X'],
  '香港': ['xianggang', 'X'], '澳门': ['aomen', 'A'],
}

// ═══════════════════════════════════════════
// Format cities as TypeScript code
// ═══════════════════════════════════════════

function formatDomesticCity(c: CityRaw): string {
  const prov = c.province || '未知'
  const [provPinyin, provInitial] = PROVINCE_PINYIN[prov] || [prov.toLowerCase(), prov[0]]
  const tags = c.tags.map(t => `'${t.replace(/'/g, "\\'")}'`).join(', ')
  const desc = c.description.replace(/'/g, "\\'")
  const img = `https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&h=600&fit=crop`

  return `  {
    id: '${c.id}', name: '${c.name}', nameEn: '${c.nameEn}',
    pinyin: '${c.pinyin}', pinyinAbbr: '${c.pinyinAbbr}', pinyinInitial: '${c.pinyinInitial}',
    country: '${prov}', countryPinyin: '${provPinyin}', countryPinyinInitial: '${provInitial}', countryFlag: '🇨🇳',
    isDomestic: true, hotness: ${c.hotness},
    image: '${img}',
    description: '${desc}',
    avgDailyBudget: ${c.avgDailyBudget}, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: [${tags}],
    lat: ${c.lat}, lng: ${c.lng},
  },`
}

function formatInternationalCity(c: CityRaw): string {
  const tags = c.tags.map(t => `'${t.replace(/'/g, "\\'")}'`).join(', ')
  const desc = c.description.replace(/'/g, "\\'")
  const country = c.country || '未知'
  const countryPinyin = c.countryPinyin || 'unknown'
  const countryPinyinInitial = c.countryPinyinInitial || 'U'
  const countryFlag = c.countryFlag || '🏳️'
  const img = `https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&h=600&fit=crop`
  const tz = guessTimezone(c.lat, c.lng)

  return `  {
    id: '${c.id}', name: '${c.name}', nameEn: '${c.nameEn}',
    pinyin: '${c.pinyin}', pinyinAbbr: '${c.pinyinAbbr}', pinyinInitial: '${c.pinyinInitial}',
    country: '${country}', countryPinyin: '${countryPinyin}', countryPinyinInitial: '${countryPinyinInitial}', countryFlag: '${countryFlag}',
    isDomestic: false, hotness: ${c.hotness},
    image: '${img}',
    description: '${desc}',
    avgDailyBudget: ${c.avgDailyBudget}, currency: 'CNY', timezone: '${tz}',
    tags: [${tags}],
    lat: ${c.lat}, lng: ${c.lng},
  },`
}

function guessTimezone(lat: number, lng: number): string {
  // Simple timezone estimation based on longitude
  if (lng >= 100 && lng < 150 && lat > 20) return 'Asia/Tokyo'
  if (lng >= 95 && lng < 110 && lat < 30) return 'Asia/Bangkok'
  if (lng >= 100 && lng < 120 && lat > 0 && lat < 20) return 'Asia/Singapore'
  if (lng >= 60 && lng < 95) return 'Asia/Kolkata'
  if (lng >= 25 && lng < 45) return 'Europe/Istanbul'
  if (lng >= 0 && lng < 25) return 'Europe/Paris'
  if (lng >= -15 && lng < 0) return 'Europe/London'
  if (lng >= -120 && lng < -60) return 'America/New_York'
  if (lng >= -180 && lng < -120) return 'America/Los_Angeles'
  if (lat < -10 && lng > 100) return 'Australia/Sydney'
  if (lng >= 35 && lng < 60) return 'Asia/Dubai'
  return 'UTC'
}

// ═══════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════

async function main() {
  const apiKey = loadApiKey()
  console.log('✅ API Key 已加载\n')

  const allDomesticNew: CityRaw[] = []
  const allIntlNew: CityRaw[] = []

  // ── Domestic: need ~54 more to reach 100 ──
  console.log('═══ 国内城市补充（目标100个，已有46个）═══')

  let domesticNames = [...EXISTING_DOMESTIC]

  // Batch 1: 30 cities
  const d1 = await fetchDomesticBatch(apiKey, domesticNames, 1, 30)
  const d1Clean = d1.filter(c => !domesticNames.includes(c.name))
  allDomesticNew.push(...d1Clean)
  domesticNames.push(...d1Clean.map(c => c.name))
  console.log(`  📊 去重后: ${d1Clean.length}, 累计新增: ${allDomesticNew.length}\n`)

  await sleep(2000) // Rate limit pause

  // Batch 2: 30 cities
  const d2 = await fetchDomesticBatch(apiKey, domesticNames, 2, 30)
  const d2Clean = d2.filter(c => !domesticNames.includes(c.name))
  allDomesticNew.push(...d2Clean)
  domesticNames.push(...d2Clean.map(c => c.name))
  console.log(`  📊 去重后: ${d2Clean.length}, 累计新增: ${allDomesticNew.length}\n`)

  // Trim to exactly what we need (54 cities max)
  const domesticNeeded = 54
  const domesticFinal = allDomesticNew.slice(0, domesticNeeded)
  console.log(`  🎯 国内最终取 ${domesticFinal.length} 个城市\n`)

  await sleep(2000)

  // ── International: need ~80 more to reach 100 ──
  console.log('═══ 国际城市补充（目标100个，已有20个）═══')

  let intlNames = [...EXISTING_INTL]

  // Batch 1: 30 (East/SE Asia)
  const i1 = await fetchInternationalBatch(apiKey, intlNames, 1, 30, '东亚（日韩港澳台）、东南亚（越南、菲律宾、柬埔寨、缅甸、老挝等）、南亚（印度、斯里兰卡、尼泊尔）')
  const i1Clean = i1.filter(c => !intlNames.includes(c.name))
  allIntlNew.push(...i1Clean)
  intlNames.push(...i1Clean.map(c => c.name))
  console.log(`  📊 去重后: ${i1Clean.length}, 累计新增: ${allIntlNew.length}\n`)

  await sleep(2000)

  // Batch 2: 30 (Europe + Americas)
  const i2 = await fetchInternationalBatch(apiKey, intlNames, 2, 30, '欧洲（法国、意大利、西班牙、德国、瑞士、荷兰、葡萄牙、捷克、北欧、东欧等）、北美（美国、加拿大、墨西哥）、南美（巴西、阿根廷、秘鲁、智利）')
  const i2Clean = i2.filter(c => !intlNames.includes(c.name))
  allIntlNew.push(...i2Clean)
  intlNames.push(...i2Clean.map(c => c.name))
  console.log(`  📊 去重后: ${i2Clean.length}, 累计新增: ${allIntlNew.length}\n`)

  await sleep(2000)

  // Batch 3: 30 (Middle East, Africa, Oceania, remaining)
  const i3 = await fetchInternationalBatch(apiKey, intlNames, 3, 30, '中东（阿联酋、土耳其、以色列、埃及）、非洲（摩洛哥、南非、肯尼亚、毛里求斯）、大洋洲（新西兰、斐济、大溪地）、中亚、其他未覆盖热门城市')
  const i3Clean = i3.filter(c => !intlNames.includes(c.name))
  allIntlNew.push(...i3Clean)
  intlNames.push(...i3Clean.map(c => c.name))
  console.log(`  📊 去重后: ${i3Clean.length}, 累计新增: ${allIntlNew.length}\n`)

  // Trim to exactly what we need (80 cities max)
  const intlNeeded = 80
  const intlFinal = allIntlNew.slice(0, intlNeeded)
  console.log(`  🎯 国际最终取 ${intlFinal.length} 个城市\n`)

  // ── Generate TypeScript output ──
  console.log('📝 生成 TypeScript 代码...')

  const domesticTS = domesticFinal.map(formatDomesticCity).join('\n')
  const intlTS = intlFinal.map(formatInternationalCity).join('\n')

  const output = `// ═══ 千问 API 批量生成数据（${new Date().toISOString().split('T')[0]}）═══
// 国内新增 ${domesticFinal.length} 个，国际新增 ${intlFinal.length} 个

// ──── 国内城市 ────
${domesticTS}

// ──── 国际城市 ────
${intlTS}
`

  const outputPath = path.resolve(__dirname, 'generated-batch-cities.ts')
  fs.writeFileSync(outputPath, output, 'utf-8')
  console.log(`\n✅ 已保存到 ${outputPath}`)

  // Save raw JSON too
  const jsonPath = path.resolve(__dirname, 'generated-batch-cities.json')
  fs.writeFileSync(jsonPath, JSON.stringify({ domestic: domesticFinal, international: intlFinal }, null, 2), 'utf-8')
  console.log(`📄 JSON 保存到 ${jsonPath}`)

  console.log(`\n🎉 完成！国内新增 ${domesticFinal.length} 个 + 国际新增 ${intlFinal.length} 个`)
  console.log(`   合计目标: 国内 ${46 + domesticFinal.length}/100, 国际 ${20 + intlFinal.length}/100`)
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

main().catch(err => {
  console.error('❌ 执行失败:', err.message)
  process.exit(1)
})
