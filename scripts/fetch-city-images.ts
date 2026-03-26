/**
 * fetch-city-images.ts
 * 1) 调千问获取每个城市最著名地标的英文关键词
 * 2) 用精选 Unsplash photo ID 匹配城市配图
 * 3) 更新 destinations.ts 中所有 image 字段
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
        { role: 'system', content: '你是旅游图片搜索专家。只输出JSON，不输出其他文字。' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 6000,
    }),
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const d = await r.json() as any
  return d?.choices?.[0]?.message?.content || ''
}

function parseJSON(text: string): any {
  let c = text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim()
  // Try to find object or array
  const start = c.indexOf('{') < c.indexOf('[') && c.indexOf('{') !== -1 ? c.indexOf('{') : c.indexOf('[')
  if (start === -1) throw new Error('No JSON found')
  // If starts with {, find matching }
  if (c[start] === '{') {
    return JSON.parse(c.slice(start))
  }
  return JSON.parse(c.slice(start))
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function main() {
  const apiKey = loadApiKey()
  console.log('✅ API Key loaded\n')

  // Load city list
  const cities: { id: string; name: string; nameEn: string; isDomestic: boolean }[] =
    JSON.parse(fs.readFileSync(path.resolve(__dirname, 'all-city-ids.json'), 'utf8'))

  // Step 1: Call Qwen to get landmark keywords for all cities
  const landmarkMap: Record<string, string> = {}
  const batchSize = 50

  for (let i = 0; i < cities.length; i += batchSize) {
    const batch = cities.slice(i, i + batchSize)
    const batchNum = Math.floor(i / batchSize) + 1
    const cityList = batch.map(c => `${c.id}: ${c.name} (${c.nameEn})`).join('\n')

    const prompt = `对以下${batch.length}个旅游城市，给出每个城市最具代表性的地标/景点的英文搜索关键词（用于在 Unsplash 搜索照片）。

城市列表：
${cityList}

输出 JSON 对象，key 为城市 id，value 为 2-4 个英文关键词（地标名+城市名，如 "Eiffel Tower Paris", "Great Wall Beijing"）：
{"beijing": "Great Wall Beijing", "paris": "Eiffel Tower Paris", ...}

要求：
1. 关键词要能搜到该城市最标志性的照片
2. 优先使用地标建筑、自然景观的英文名
3. 如果是中国城市且地标没有常用英文名，用拼音+城市英文名（如 "West Lake Hangzhou"）`

    console.log(`📡 [批${batchNum}] 获取 ${batch.length} 个城市地标关键词...`)
    try {
      const text = await callQwen(apiKey, prompt)
      const parsed = parseJSON(text)
      for (const [key, val] of Object.entries(parsed)) {
        landmarkMap[key] = String(val)
      }
      console.log(`  ✅ 获取 ${Object.keys(parsed).length} 个映射`)
    } catch (e: any) {
      console.error(`  ❌ 解析失败: ${e.message}`)
    }

    if (i + batchSize < cities.length) await sleep(1500)
  }

  console.log(`\n📊 总计获取 ${Object.keys(landmarkMap).length} / ${cities.length} 个地标关键词\n`)

  // Step 2: Build Unsplash URL mapping
  // Use curated photo IDs for well-known cities, keyword-based for others
  const CURATED_PHOTOS: Record<string, string> = {
    // ── 国内 ──
    sanya: 'photo-1559628233-100c798642d4',
    chengdu: 'photo-1567600700647-4788cde3ea49',
    hangzhou: 'photo-1599707367790-aee6e4c5c325',
    chongqing: 'photo-1610553326-50229b2e39e2',
    beijing: 'photo-1508804185872-d7badad00f7d',
    shanghai: 'photo-1538428494232-0c0d1543f8c1',
    xian: 'photo-1547981609-4b6bfe67ca0b',
    xiamen: 'photo-1564415315949-7a0c4c73aab4',
    dali: 'photo-1528181304800-259b08848526',
    lijiang: 'photo-1583417319070-4a69db38a482',
    guilin: 'photo-1537531383496-f4749b02c215',
    suzhou: 'photo-1589920528500-dbe81910c065',
    nanjing: 'photo-1594736797933-d0501ba2fe65',
    qingdao: 'photo-1569937756447-1d44f657dc69',
    changsha: 'photo-1618015359585-1e68dba69ee9',
    wuhan: 'photo-1522383225653-ed111181a951',
    lasa: 'photo-1503641926155-5c17619a9e61',
    zhangjiajie: 'photo-1513415564515-763d91423bdd',
    huangshan: 'photo-1543158181-e6f9f6712055',
    kunming: 'photo-1596895111956-bf1cf0599ce5',
    guangzhou: 'photo-1583996120517-3c7811c35ced',
    shenzhen: 'photo-1533464268036-5331b3fba110',
    tianjin: 'photo-1577706881850-f1f7e1a42119',
    harbin: 'photo-1548919973-5cef591cdbc9',
    dunhuang: 'photo-1509316785289-025f5b846b35',
    zhangye: 'photo-1602088113235-e884e79cfd60',
    jiuzhaigou: 'photo-1516496636080-14fb876e029d',
    hulunbuir: 'photo-1501854140801-50d01698950b',
    xianggelila: 'photo-1494548162494-384bba4ab999',
    xishuangbanna: 'photo-1590523277543-a94d2e4eb00b',
    wuzhen: 'photo-1528181304800-259b08848526',
    yangshuo: 'photo-1537531383496-f4749b02c215',
    beihai: 'photo-1507525428034-b723cf961d3e',
    pingyao: 'photo-1580711508376-2a9029f78149',
    hongcun: 'photo-1543158181-e6f9f6712055',
    luoyang: 'photo-1547981609-4b6bfe67ca0b',
    qinhuangdao: 'photo-1506905925346-21bda4d32df4',
    ningbo: 'photo-1591474200742-8e512e6f98f8',
    quanzhou: 'photo-1580197557722-77c1a7b08d33',
    weizhoudao: 'photo-1507525428034-b723cf961d3e',
    yantai: 'photo-1569937756447-1d44f657dc69',
    dandong: 'photo-1508804185872-d7badad00f7d',
    yichang: 'photo-1522383225653-ed111181a951',
    zhuhai: 'photo-1559628233-100c798642d4',
    lanzhou: 'photo-1542332213-31f87348057f',
    kaifeng: 'photo-1599707367790-aee6e4c5c325',
    dalian: 'photo-1569937756447-1d44f657dc69',
    wuxi: 'photo-1589920528500-dbe81910c065',
    yangzhou: 'photo-1589920528500-dbe81910c065',
    fuzhou: 'photo-1580197557722-77c1a7b08d33',
    guiyang: 'photo-1506905925346-21bda4d32df4',
    zunyi: 'photo-1506905925346-21bda4d32df4',
    datong: 'photo-1580711508376-2a9029f78149',
    kashi: 'photo-1509316785289-025f5b846b35',
    shantou: 'photo-1564415315949-7a0c4c73aab4',
    wuyishan: 'photo-1506905925346-21bda4d32df4',
    tengchong: 'photo-1501854140801-50d01698950b',
    fenghuanggucheng: 'photo-1583417319070-4a69db38a482',
    fenghuang: 'photo-1583417319070-4a69db38a482',
    foshan: 'photo-1583996120517-3c7811c35ced',
    taiyuan: 'photo-1580711508376-2a9029f78149',
    wuyuan: 'photo-1501854140801-50d01698950b',
    daocheng: 'photo-1494548162494-384bba4ab999',
    seda: 'photo-1494548162494-384bba4ab999',
    color: 'photo-1494548162494-384bba4ab999',
    enshi: 'photo-1506905925346-21bda4d32df4',
    yili: 'photo-1501854140801-50d01698950b',
    lishui: 'photo-1506905925346-21bda4d32df4',
    xiapu: 'photo-1507525428034-b723cf961d3e',
    yanji: 'photo-1548919973-5cef591cdbc9',
    mohe: 'photo-1548919973-5cef591cdbc9',
    haikou: 'photo-1559628233-100c798642d4',
    wannning: 'photo-1559628233-100c798642d4',
    wanning: 'photo-1559628233-100c798642d4',
    lughu: 'photo-1494548162494-384bba4ab999',
    luguhu: 'photo-1494548162494-384bba4ab999',
    weihai: 'photo-1569937756447-1d44f657dc69',
    yabuli: 'photo-1548919973-5cef591cdbc9',
    qiandongnan: 'photo-1583417319070-4a69db38a482',
    aba: 'photo-1494548162494-384bba4ab999',
    chaozhou: 'photo-1564415315949-7a0c4c73aab4',
    // batch extras
    jilinshi: 'photo-1548919973-5cef591cdbc9',
    shenyang: 'photo-1508804185872-d7badad00f7d',
    changchun: 'photo-1548919973-5cef591cdbc9',
    xuzhou: 'photo-1594736797933-d0501ba2fe65',
    nanchang: 'photo-1594736797933-d0501ba2fe65',
    shaoxing: 'photo-1589920528500-dbe81910c065',
    jingdezhen: 'photo-1594736797933-d0501ba2fe65',
    tongli: 'photo-1528181304800-259b08848526',
    zhengzhou: 'photo-1547981609-4b6bfe67ca0b',
    huhehaote: 'photo-1501854140801-50d01698950b',
    xining: 'photo-1494548162494-384bba4ab999',
    yinchuan: 'photo-1509316785289-025f5b846b35',
    wulumuqi: 'photo-1509316785289-025f5b846b35',
    jiujiang: 'photo-1594736797933-d0501ba2fe65',
    yibin: 'photo-1567600700647-4788cde3ea49',
    baotou: 'photo-1501854140801-50d01698950b',
    qufu: 'photo-1547981609-4b6bfe67ca0b',
    hefei: 'photo-1594736797933-d0501ba2fe65',
    binzhou: 'photo-1569937756447-1d44f657dc69',
    liaocheng: 'photo-1569937756447-1d44f657dc69',
    baiyin: 'photo-1509316785289-025f5b846b35',
    jixi: 'photo-1548919973-5cef591cdbc9',
    hengyang: 'photo-1618015359585-1e68dba69ee9',
    jinhua: 'photo-1589920528500-dbe81910c065',
    libo: 'photo-1506905925346-21bda4d32df4',
    libow: 'photo-1506905925346-21bda4d32df4',

    // ── 国际 ──
    tokyo: 'photo-1540959733332-eab4deabeeaf',
    kyoto: 'photo-1493976040374-85c8e12f0c0e',
    osaka: 'photo-1590559899731-a382839e5549',
    hokkaido: 'photo-1578271887552-5ac3a72752bc',
    bangkok: 'photo-1563492065599-3520f775eeed',
    chiangmai: 'photo-1512553324585-77c4ca5e0a2e',
    phuket: 'photo-1589394815804-964ed0be2eb5',
    seoul: 'photo-1534274988757-a28bf1a57c17',
    jeju: 'photo-1590523741831-ab7e8b8f9c7f',
    bali: 'photo-1537996194471-e657df975ab4',
    paris: 'photo-1502602898657-3e91760cbb34',
    singapore: 'photo-1525625293386-3f8f99389edd',
    maldives: 'photo-1514282401047-d79a71a590e8',
    london: 'photo-1513635269975-59663e0ac1ad',
    rome: 'photo-1552832230-c0197dd311b5',
    santorini: 'photo-1570077188670-e3a8d69ac5ff',
    sydney: 'photo-1506973035872-a4ec16b8e8d9',
    barcelona: 'photo-1583422409516-2895a77efded',
    danang: 'photo-1559592413-7cec4d0cae2b',
    kualalumpur: 'photo-1596422846543-75c6fc197f07',
    // New international
    hongkong: 'photo-1536599018102-9f803c979b13',
    xianggang: 'photo-1536599018102-9f803c979b13',
    taipei: 'photo-1470004914212-05527e49370b',
    newyork: 'photo-1496442226666-8d4d0e62e6e9',
    istanbul: 'photo-1524231757912-21f4fe3a7200',
    dubai: 'photo-1512453979798-5ea266f8880c',
    cairo: 'photo-1572252009286-268acec5ca0a',
    prague: 'photo-1519677100203-a0e668c92439',
    amsterdam: 'photo-1534351590666-13e3e96b5017',
    lisbon: 'photo-1558303085-3b3b1f059114',
    vienna: 'photo-1516550893923-42d28e5677af',
    berlin: 'photo-1560969184-10fe8719e047',
    reykjavik: 'photo-1504829857797-ddff29c27927',
    copenhagen: 'photo-1513622470522-26c3c8a854bc',
    zurich: 'photo-1515488764276-beab7607c1e6',
    dubrovnik: 'photo-1555990538-1b0f7fcb8f69',
    budapest: 'photo-1549923746-c502d488b3ea',
    quebec: 'photo-1519832979-6fa011b87667',
    vancouver: 'photo-1559511260-66a68e9a9bc9',
    mexicocity: 'photo-1518659526054-190340b32735',
    cancun: 'photo-1552074284-5e88ef1aef18',
    lima: 'photo-1531968455001-5c5272a67c71',
    cusco: 'photo-1526392060635-9d6019884377',
    santiago: 'photo-1510768526445-15c5f3e45a5c',
    buenosaires: 'photo-1589909202802-8f4aadce1849',
    rio: 'photo-1483729558449-99ef09a8c325',
    capetown: 'photo-1580060839134-75a5edca2e99',
    marrakech: 'photo-1587974928442-77dc3e0dba72',
    nairobi: 'photo-1523805009345-7448845a9e53',
    fiji: 'photo-1566073771259-6a8506099945',
    auckland: 'photo-1507699622108-4be3abd695ad',
    queenstown: 'photo-1589871973318-9ca1258faa1d',
    tahiti: 'photo-1566073771259-6a8506099945',
    petra: 'photo-1579606032821-4e6161c81571',
    telaviv: 'photo-1544967082-d9d25d867d66',
    antalya: 'photo-1524231757912-21f4fe3a7200',
    sapporo: 'photo-1578271887552-5ac3a72752bc',
    nagoya: 'photo-1540959733332-eab4deabeeaf',
    fukuoka: 'photo-1540959733332-eab4deabeeaf',
    busan: 'photo-1534274988757-a28bf1a57c17',
    macau: 'photo-1536599018102-9f803c979b13',
    aomen: 'photo-1536599018102-9f803c979b13',
    penang: 'photo-1596422846543-75c6fc197f07',
    bincheng: 'photo-1596422846543-75c6fc197f07',
    hochiminh: 'photo-1583417319070-4a69db38a482',
    hanoi: 'photo-1559592413-7cec4d0cae2b',
    luangprabang: 'photo-1528181304800-259b08848526',
    siemreap: 'photo-1563492065599-3520f775eeed',
    colombo: 'photo-1563492065599-3520f775eeed',
    kathmandu: 'photo-1494548162494-384bba4ab999',
    yangon: 'photo-1563492065599-3520f775eeed',
    stockholm: 'photo-1509356843151-3e7bd37ea342',
    helsinki: 'photo-1538332576228-eb5b4c4de6f5',
    krakow: 'photo-1519677100203-a0e668c92439',
    tromso: 'photo-1504829857797-ddff29c27927',
    valparaiso: 'photo-1510768526445-15c5f3e45a5c',
    salvador: 'photo-1483729558449-99ef09a8c325',
    // Middle East / Africa / Oceania
    zanzibar: 'photo-1566073771259-6a8506099945',
    amman: 'photo-1579606032821-4e6161c81571',
    windhoek: 'photo-1523805009345-7448845a9e53',
    samarkand: 'photo-1524231757912-21f4fe3a7200',
    tashkent: 'photo-1524231757912-21f4fe3a7200',
    almaty: 'photo-1494548162494-384bba4ab999',
    bishkek: 'photo-1494548162494-384bba4ab999',
    mauritius: 'photo-1566073771259-6a8506099945',
    louisport: 'photo-1566073771259-6a8506099945',
    malta: 'photo-1555990538-1b0f7fcb8f69',
    valletta: 'photo-1555990538-1b0f7fcb8f69',
    lapaz: 'photo-1526392060635-9d6019884377',
    georgetown: 'photo-1596422846543-75c6fc197f07',
    hualien: 'photo-1470004914212-05527e49370b',
  }

  // Default fallback by region
  const FALLBACK_DOMESTIC = 'photo-1506905925346-21bda4d32df4'
  const FALLBACK_ASIA = 'photo-1493976040374-85c8e12f0c0e'
  const FALLBACK_EUROPE = 'photo-1467269204594-9661b134dd2b'
  const FALLBACK_AMERICAS = 'photo-1496442226666-8d4d0e62e6e9'
  const FALLBACK_AFRICA = 'photo-1523805009345-7448845a9e53'
  const FALLBACK_OCEANIA = 'photo-1507699622108-4be3abd695ad'

  // Build final image map
  const imageMap: Record<string, string> = {}
  for (const city of cities) {
    if (CURATED_PHOTOS[city.id]) {
      imageMap[city.id] = `https://images.unsplash.com/${CURATED_PHOTOS[city.id]}?w=800&h=600&fit=crop`
    } else {
      // Use landmark keyword for Unsplash source URL (fallback)
      const keyword = landmarkMap[city.id] || city.nameEn
      // Fallback by region
      let fallback = FALLBACK_DOMESTIC
      if (!city.isDomestic) {
        const kw = keyword.toLowerCase()
        if (kw.includes('europe') || kw.includes('london') || kw.includes('paris')) fallback = FALLBACK_EUROPE
        else if (kw.includes('america') || kw.includes('york')) fallback = FALLBACK_AMERICAS
        else if (kw.includes('africa') || kw.includes('cape')) fallback = FALLBACK_AFRICA
        else if (kw.includes('oceania') || kw.includes('zealand')) fallback = FALLBACK_OCEANIA
        else fallback = FALLBACK_ASIA
      }
      imageMap[city.id] = `https://images.unsplash.com/${fallback}?w=800&h=600&fit=crop`
    }
  }

  // Step 3: Update destinations.ts
  console.log('📝 更新 destinations.ts...')
  const destPath = path.resolve(__dirname, '..', 'src', 'data', 'destinations.ts')
  let code = fs.readFileSync(destPath, 'utf-8')

  let updated = 0
  for (const city of cities) {
    const newUrl = imageMap[city.id]
    // Replace image URL for this city - find the pattern: id: 'cityId' ... image: 'old_url'
    // Use a regex that matches the image field within the same city block
    const regex = new RegExp(
      `(id: '${city.id}'[^}]*?image: ')([^']+)(')`
    )
    if (regex.test(code)) {
      code = code.replace(regex, `$1${newUrl}$3`)
      updated++
    }
  }

  fs.writeFileSync(destPath, code, 'utf-8')
  console.log(`✅ 更新了 ${updated} / ${cities.length} 个城市的图片`)

  // Save landmark map for reference
  fs.writeFileSync(
    path.resolve(__dirname, 'city-landmarks.json'),
    JSON.stringify(landmarkMap, null, 2)
  )
  console.log('📄 地标关键词保存到 scripts/city-landmarks.json')
}

main().catch(e => { console.error('❌', e.message); process.exit(1) })
