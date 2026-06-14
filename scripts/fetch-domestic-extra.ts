/**
 * fetch-domestic-extra.ts
 * 补充国内剩余35个城市
 */
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const DASHSCOPE_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'
const MODEL_NAME = 'qwen-turbo'  // 降级为免费档模型

function loadApiKey(): string {
  const envPath = path.resolve(__dirname, '..', '.env.local')
  const content = fs.readFileSync(envPath, 'utf-8')
  const match = content.match(/VITE_DASHSCOPE_API_KEY=(.+)/)
  if (!match) throw new Error('Cannot find VITE_DASHSCOPE_API_KEY in .env.local')
  return match[1].trim()
}

async function callQwen(apiKey: string, prompt: string): Promise<string> {
  const response = await fetch(DASHSCOPE_BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL_NAME,
      messages: [
        { role: 'system', content: '你是一位资深旅行规划师和中国旅游专家。你只输出合法的JSON，不输出任何其他文字或代码块标记。' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 8000,
    }),
  })
  if (!response.ok) {
    const e = await response.json().catch(() => ({})) as any
    throw new Error(`API Error: ${e?.error?.message || response.status}`)
  }
  const data = await response.json() as any
  return data?.choices?.[0]?.message?.content || ''
}

function repairJSON(text: string): any[] {
  let clean = text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim()
  const i = clean.indexOf('[')
  if (i === -1) throw new Error('No array')
  clean = clean.slice(i)
  try { return JSON.parse(clean) } catch {}
  const j = clean.lastIndexOf('}')
  if (j === -1) throw new Error('No object')
  return JSON.parse(clean.slice(0, j + 1) + ']')
}

// ALL existing domestic city names (46 original + 19 from batch)
const ALL_EXISTING = [
  '三亚','成都','杭州','重庆','北京','上海','西安','厦门','大理','丽江',
  '桂林','苏州','南京','青岛','长沙','武汉','拉萨','张家界','黄山','昆明',
  '广州','深圳','天津','宁波','泉州','洛阳','开封','乌镇','阳朔','北海',
  '九寨沟','呼伦贝尔','香格里拉','西双版纳','涠洲岛','烟台','秦皇岛','宏村','平遥','丹东',
  '宜昌','珠海','兰州','张掖','敦煌','哈尔滨',
  // batch new
  '吉林市','沈阳','长春','徐州','南昌','绍兴','景德镇','同里','郑州','呼和浩特',
  '西宁','银川','乌鲁木齐','九江','宜宾','包头','曲阜','合肥','丽山',
  // also exclude
  '梧州','郎木寺','兴城','额尔古纳','五指山',
]

async function main() {
  const apiKey = loadApiKey()
  console.log('✅ API Key 已加载\n')

  const existList = ALL_EXISTING.join('、')

  // Batch A: 20 cities focused on underrepresented regions
  const promptA = `请推荐20个中国国内热门旅游城市，严格不要与以下重复：
${existList}

必须包含以下省份至少各1个：贵州、江西、吉林（非吉林市）、山西（非平遥）、新疆（非乌鲁木齐）、广东（非广州深圳珠海）、海南（非三亚）、福建（非厦门泉州）

额外推荐：网红旅游目的地、世界遗产地、特色古镇、温泉胜地、滑雪胜地等

直接输出JSON数组：
[{"id":"guiyang","name":"贵阳","nameEn":"Guiyang","pinyin":"guiyang","pinyinAbbr":"gy","pinyinInitial":"G","province":"贵州","description":"林城绿肺，酸汤鱼飘香（25字以内）","avgDailyBudget":400,"tags":["酸汤","喀斯特","避暑","苗族"],"lat":26.6470,"lng":106.6302,"hotness":72}]

要求：id拼音小写、pinyin完整拼音、pinyinAbbr首字母缩写、pinyinInitial大写首字母、province省份名、hotness当季热度0-100、按hotness降序、严格20个`

  console.log('📡 [A批] 请求20个城市...')
  const textA = await callQwen(apiKey, promptA)
  const citiesA = repairJSON(textA)
  const cleanA = citiesA.filter((c: any) => !ALL_EXISTING.includes(c.name))
  console.log(`✅ [A批] 获取 ${citiesA.length}，去重后 ${cleanA.length}\n`)

  await new Promise(r => setTimeout(r, 2000))

  // Batch B: 20 more cities
  const newNames = cleanA.map((c: any) => c.name)
  const allNow = [...ALL_EXISTING, ...newNames].join('、')

  const promptB = `请推荐20个中国国内热门旅游城市，严格不要与以下重复：
${allNow}

优先推荐：
- 小众但值得去的地方（如荔波、霞浦、色达、稻城、腾冲、婺源等）
- 知名温泉/滑雪/海滨度假地
- 少数民族文化目的地
- 新晋网红打卡城市

直接输出JSON数组（格式同上），严格20个，按hotness降序`

  console.log('📡 [B批] 请求20个城市...')
  const textB = await callQwen(apiKey, promptB)
  const citiesB = repairJSON(textB)
  const allExistNow = [...ALL_EXISTING, ...newNames]
  const cleanB = citiesB.filter((c: any) => !allExistNow.includes(c.name))
  console.log(`✅ [B批] 获取 ${citiesB.length}，去重后 ${cleanB.length}\n`)

  const allNew = [...cleanA, ...cleanB]
  // Take exactly 35 (or less if not enough)
  const final = allNew.slice(0, 35)
  console.log(`🎯 最终取 ${final.length} 个新国内城市`)

  // Save
  const outPath = path.resolve(__dirname, 'generated-domestic-extra.json')
  fs.writeFileSync(outPath, JSON.stringify(final, null, 2), 'utf-8')
  console.log(`💾 已保存到 ${outPath}`)
}

main().catch(err => { console.error('❌', err.message); process.exit(1) })
