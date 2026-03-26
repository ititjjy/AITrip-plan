/**
 * fetch-domestic-final.ts — 最后一批国内城市补充
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
  if (!match) throw new Error('No key')
  return match[1].trim()
}

async function callQwen(apiKey: string, prompt: string): Promise<string> {
  const r = await fetch(DASHSCOPE_BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL_NAME,
      messages: [
        { role: 'system', content: '你是资深旅行规划师。只输出合法JSON数组，不输出任何其他文字。' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.8,
      max_tokens: 8000,
    }),
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const d = await r.json() as any
  return d?.choices?.[0]?.message?.content || ''
}

function parseJSON(text: string): any[] {
  let c = text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim()
  const i = c.indexOf('['); if (i === -1) throw new Error('No [')
  c = c.slice(i)
  try { return JSON.parse(c) } catch {}
  const j = c.lastIndexOf('}'); if (j === -1) throw new Error('No }')
  return JSON.parse(c.slice(0, j + 1) + ']')
}

const ALL_EXISTING = new Set([
  '三亚','成都','杭州','重庆','北京','上海','西安','厦门','大理','丽江',
  '桂林','苏州','南京','青岛','长沙','武汉','拉萨','张家界','黄山','昆明',
  '广州','深圳','天津','宁波','泉州','洛阳','开封','乌镇','阳朔','北海',
  '九寨沟','呼伦贝尔','香格里拉','西双版纳','涠洲岛','烟台','秦皇岛','宏村','平遥','丹东',
  '宜昌','珠海','兰州','张掖','敦煌','哈尔滨',
  '吉林市','沈阳','长春','徐州','南昌','绍兴','景德镇','同里','郑州','呼和浩特',
  '西宁','银川','乌鲁木齐','九江','宜宾','包头','曲阜','合肥',
  '梧州','郎木寺','兴城','额尔古纳','五指山',
  '遵义','大同','喀什','汕头','武夷山','腾冲','金华','滨州','福州','衡阳','聊城','白银','鸡西',
])

async function main() {
  const apiKey = loadApiKey()
  const existing = Array.from(ALL_EXISTING).join('、')
  const results: any[] = []

  // 精确指定 25 个必选城市 + 让AI自由补充
  const prompt = `请推荐以下25个中国旅游城市的数据（如果某个名字不合理可替换为同省份其他热门城市），并额外自选3个热门城市。共28个。

必选清单：
1. 贵阳（贵州）2. 荔波（贵州）3. 婺源（江西）4. 稻城（四川）
5. 色达（四川）6. 万宁（海南）7. 凤凰古城（湖南）8. 泸沽湖（云南/四川）
9. 丽水（浙江）10. 霞浦（福建）11. 延吉（吉林）12. 漠河（黑龙江）
13. 伊犁（新疆）14. 佛山（广东）15. 大连（辽宁）16. 太原（山西）
17. 无锡（江苏）18. 扬州（江苏）19. 潮州（广东）20. 威海（山东）
21. 海口（海南）22. 亚布力（黑龙江）23. 恩施（湖北）24. 黔东南（贵州）
25. 阿坝（四川）

严格不要与以下已有城市重复：${existing}

直接输出JSON数组，每个元素格式：
{"id":"guiyang","name":"贵阳","nameEn":"Guiyang","pinyin":"guiyang","pinyinAbbr":"gy","pinyinInitial":"G","province":"贵州","description":"林城绿肺苗侗风情（20字以内精炼）","avgDailyBudget":400,"tags":["标签1","标签2","标签3","标签4"],"lat":26.647,"lng":106.630,"hotness":72}

严格要求：lat/lng精确、hotness合理（0-100当季）、description 20字内、输出28个`

  console.log('📡 请求28个精选国内城市...')
  const text = await callQwen(apiKey, prompt)
  const cities = parseJSON(text)
  const clean = cities.filter((c: any) => c && c.name && c.lat && c.lng && c.hotness && !ALL_EXISTING.has(c.name))
  results.push(...clean)
  console.log(`✅ 获取 ${cities.length}，有效去重后 ${clean.length}`)

  const outPath = path.resolve(__dirname, 'generated-domestic-final.json')
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2))
  console.log(`💾 已保存 ${results.length} 个城市到 ${outPath}`)
}

main().catch(e => { console.error('❌', e.message); process.exit(1) })
