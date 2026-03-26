/**
 * fetch-domestic-cities.ts
 * 调用千问大模型 API，批量生成国内热门旅游城市数据
 * 输出 TypeScript 格式，可直接粘贴到 destinations.ts
 *
 * Usage: npx tsx scripts/fetch-domestic-cities.ts
 */

import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const DASHSCOPE_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'
const MODEL_NAME = 'qwen-plus'

// 从 .env.local 读取 API Key
function loadApiKey(): string {
  const envPath = path.resolve(__dirname, '..', '.env.local')
  const content = fs.readFileSync(envPath, 'utf-8')
  const match = content.match(/VITE_DASHSCOPE_API_KEY=(.+)/)
  if (!match) throw new Error('Cannot find VITE_DASHSCOPE_API_KEY in .env.local')
  return match[1].trim()
}

// 已存在的城市列表（避免重复）
const EXISTING_CITIES = [
  '三亚', '成都', '杭州', '重庆', '北京', '上海', '西安', '厦门',
  '大理', '丽江', '桂林', '苏州', '南京', '青岛', '长沙', '武汉',
  '拉萨', '张家界', '黄山', '昆明',
]

interface QwenCityData {
  id: string
  name: string
  nameEn: string
  pinyin: string
  pinyinAbbr: string
  pinyinInitial: string
  province: string
  description: string
  avgDailyBudget: number
  tags: string[]
  lat: number
  lng: number
  hotness: number
  bestSeason: string
  image_keyword: string
}

async function callQwen(apiKey: string, prompt: string, systemPrompt: string): Promise<string> {
  console.log('  正在调用千问 API...')
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

function repairJSON(text: string): string {
  let clean = text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim()
  const arrStart = clean.indexOf('[')
  if (arrStart === -1) throw new Error('No JSON array found')
  clean = clean.slice(arrStart)
  if (clean.endsWith(']')) return clean

  const lastBrace = clean.lastIndexOf('}')
  if (lastBrace === -1) throw new Error('No complete object found')
  const truncated = clean.slice(0, lastBrace + 1) + ']'
  JSON.parse(truncated) // validate
  return truncated
}

// Unsplash 中国城市相关图片（通用备选）
const CITY_IMAGES: Record<string, string> = {
  '广州': 'https://images.unsplash.com/photo-1583996120517-3c7811c35ced?w=800&h=600&fit=crop',
  '深圳': 'https://images.unsplash.com/photo-1533464268036-5331b3fba110?w=800&h=600&fit=crop',
  '哈尔滨': 'https://images.unsplash.com/photo-1548919973-5cef591cdbc9?w=800&h=600&fit=crop',
  '九寨沟': 'https://images.unsplash.com/photo-1513415564515-763d91423bdd?w=800&h=600&fit=crop',
  '西双版纳': 'https://images.unsplash.com/photo-1528181304800-259b08848526?w=800&h=600&fit=crop',
  '敦煌': 'https://images.unsplash.com/photo-1509316785289-025f5b846b35?w=800&h=600&fit=crop',
  '泉州': 'https://images.unsplash.com/photo-1580197557722-77c1a7b08d33?w=800&h=600&fit=crop',
  '洛阳': 'https://images.unsplash.com/photo-1547981609-4b6bfe67ca0b?w=800&h=600&fit=crop',
  '珠海': 'https://images.unsplash.com/photo-1559628233-100c798642d4?w=800&h=600&fit=crop',
  '天津': 'https://images.unsplash.com/photo-1508804185872-d7badad00f7d?w=800&h=600&fit=crop',
  '贵阳': 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&h=600&fit=crop',
  '福州': 'https://images.unsplash.com/photo-1580197557722-77c1a7b08d33?w=800&h=600&fit=crop',
  '郑州': 'https://images.unsplash.com/photo-1547981609-4b6bfe67ca0b?w=800&h=600&fit=crop',
  '呼伦贝尔': 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&h=600&fit=crop',
  '乌鲁木齐': 'https://images.unsplash.com/photo-1509316785289-025f5b846b35?w=800&h=600&fit=crop',
}

const DEFAULT_IMAGE = 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&h=600&fit=crop'

function getCityImage(name: string, keyword: string): string {
  if (CITY_IMAGES[name]) return CITY_IMAGES[name]
  // Use Unsplash search-based URL with the keyword
  return `https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&h=600&fit=crop`
}

async function main() {
  const apiKey = loadApiKey()
  console.log('✅ API Key 已加载')

  const existingList = EXISTING_CITIES.join('、')

  const systemPrompt = `你是一位资深旅行规划师和中国旅游专家。你只输出合法的JSON，不输出任何其他文字或代码块标记。`

  const prompt = `请推荐30个中国国内热门旅游城市/目的地，注意不要与以下已有城市重复：
${existingList}

请包含不同地域、不同类型的旅游目的地，如：
- 一二线城市中尚未收录的（如广州、深圳、天津等）
- 自然风光目的地（如九寨沟、呼伦贝尔、香格里拉等）
- 历史文化名城（如洛阳、泉州、开封等）
- 新兴网红目的地（如西双版纳、阿那亚等）
- 海岛/海滨（如涠洲岛等）

直接输出JSON数组，格式如下：
[
  {
    "id": "guangzhou",
    "name": "广州",
    "nameEn": "Guangzhou",
    "pinyin": "guangzhou",
    "pinyinAbbr": "gz",
    "pinyinInitial": "G",
    "province": "广东",
    "description": "千年商都，早茶文化与岭南建筑的城市名片（30字以内简洁有力）",
    "avgDailyBudget": 550,
    "tags": ["早茶", "粤菜", "岭南", "商都"],
    "lat": 23.1291,
    "lng": 113.2644,
    "hotness": 83,
    "bestSeason": "10-3月",
    "image_keyword": "guangzhou city skyline"
  }
]

要求：
1. id 使用拼音小写，无空格无声调
2. pinyin 使用完整拼音小写无声调（如 "xianggelila"），pinyinAbbr 取每个字拼音首字母（如 "xgll"）
3. pinyinInitial 取拼音首字母大写（如 "X"）
4. province 填所属省份/自治区/直辖市名称
5. description 30字以内，文艺有吸引力
6. tags 4个标签
7. lat/lng 精确到小数点后4位
8. hotness 为当季（3月春季）旅游热度 0-100
9. avgDailyBudget 为人民币日均预算（合理估算）
10. 按 hotness 从高到低排序
11. 严格输出30个城市`

  console.log('\n📡 第1批：调用千问生成30个国内城市数据...')
  const text1 = await callQwen(apiKey, prompt, systemPrompt)

  let cities1: QwenCityData[]
  try {
    cities1 = JSON.parse(text1)
  } catch {
    console.log('  ⚠️ JSON解析失败，尝试修复...')
    const repaired = repairJSON(text1)
    cities1 = JSON.parse(repaired)
  }
  console.log(`  ✅ 获取到 ${cities1.length} 个城市`)

  // 去重检查
  const allCities = cities1.filter(c => !EXISTING_CITIES.includes(c.name))
  console.log(`  📊 去重后剩余 ${allCities.length} 个城市`)

  // 如果不够30个，再请求一批
  if (allCities.length < 25) {
    const alreadyHave = [...EXISTING_CITIES, ...allCities.map(c => c.name)].join('、')
    const prompt2 = `请再推荐 ${30 - allCities.length} 个中国国内热门旅游城市，不要与以下已有城市重复：
${alreadyHave}

输出格式与之前完全相同。`

    console.log(`\n📡 第2批：补充请求 ${30 - allCities.length} 个城市...`)
    const text2 = await callQwen(apiKey, prompt2, systemPrompt)
    let cities2: QwenCityData[]
    try {
      cities2 = JSON.parse(text2)
    } catch {
      const repaired = repairJSON(text2)
      cities2 = JSON.parse(repaired)
    }
    const newOnes = cities2.filter(c => !EXISTING_CITIES.includes(c.name) && !allCities.find(x => x.name === c.name))
    allCities.push(...newOnes)
    console.log(`  ✅ 补充获取 ${newOnes.length} 个，总计 ${allCities.length} 个`)
  }

  // 生成 TypeScript 代码
  console.log('\n📝 生成 TypeScript 代码...')

  const tsLines: string[] = allCities.map(city => {
    const image = getCityImage(city.name, city.image_keyword || city.nameEn)
    const tags = city.tags.map(t => `'${t}'`).join(', ')
    return `  {
    id: '${city.id}', name: '${city.name}', nameEn: '${city.nameEn}',
    pinyin: '${city.pinyin}', pinyinAbbr: '${city.pinyinAbbr}', pinyinInitial: '${city.pinyinInitial}',
    country: '${city.province}', countryPinyin: '${city.pinyin.split('').slice(0, 2).join('')}', countryPinyinInitial: '${city.pinyinInitial}', countryFlag: '🇨🇳',
    isDomestic: true, hotness: ${city.hotness},
    image: '${image}',
    description: '${city.description.replace(/'/g, "\\'")}',
    avgDailyBudget: ${city.avgDailyBudget}, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: [${tags}],
    lat: ${city.lat}, lng: ${city.lng},
  },`
  })

  const output = `// ═══ 千问 API 生成的国内城市数据（${new Date().toISOString().split('T')[0]}）═══\n// 共 ${allCities.length} 个城市\n\n` + tsLines.join('\n')

  const outputPath = path.resolve(__dirname, '..', 'scripts', 'generated-domestic-cities.ts')
  fs.writeFileSync(outputPath, output, 'utf-8')
  console.log(`\n✅ 已保存到 ${outputPath}`)

  // 同时保存原始 JSON 供参考
  const jsonPath = path.resolve(__dirname, '..', 'scripts', 'generated-domestic-cities.json')
  fs.writeFileSync(jsonPath, JSON.stringify(allCities, null, 2), 'utf-8')
  console.log(`📄 原始 JSON 保存到 ${jsonPath}`)

  console.log(`\n🎉 完成！共生成 ${allCities.length} 个新国内城市数据`)
  console.log('   接下来将数据合并到 src/data/destinations.ts 中')
}

main().catch(err => {
  console.error('❌ 执行失败:', err.message)
  process.exit(1)
})
