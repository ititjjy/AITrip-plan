/**
 * merge-all-cities.ts
 * 将所有批次的新城市数据合并到 destinations.ts
 */
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

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

function guessTimezone(lat: number, lng: number): string {
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

function esc(s: string): string {
  return s.replace(/'/g, "\\'")
}

function formatDomestic(c: any): string {
  const prov = c.province || '未知'
  const [pp, pi] = PROVINCE_PINYIN[prov] || [prov.toLowerCase(), prov[0]]
  return `  {
    id: '${c.id}', name: '${c.name}', nameEn: '${c.nameEn}',
    pinyin: '${c.pinyin}', pinyinAbbr: '${c.pinyinAbbr}', pinyinInitial: '${c.pinyinInitial}',
    country: '${prov}', countryPinyin: '${pp}', countryPinyinInitial: '${pi}', countryFlag: '🇨🇳',
    isDomestic: true, hotness: ${c.hotness},
    image: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&h=600&fit=crop',
    description: '${esc(c.description)}',
    avgDailyBudget: ${c.avgDailyBudget}, currency: 'CNY', timezone: 'Asia/Shanghai',
    tags: [${c.tags.map((t: string) => `'${esc(t)}'`).join(', ')}],
    lat: ${c.lat}, lng: ${c.lng},
  },`
}

function formatIntl(c: any): string {
  const tz = guessTimezone(c.lat, c.lng)
  return `  {
    id: '${c.id}', name: '${c.name}', nameEn: '${c.nameEn}',
    pinyin: '${c.pinyin}', pinyinAbbr: '${c.pinyinAbbr}', pinyinInitial: '${c.pinyinInitial}',
    country: '${c.country || '未知'}', countryPinyin: '${c.countryPinyin || 'unknown'}', countryPinyinInitial: '${c.countryPinyinInitial || 'U'}', countryFlag: '${c.countryFlag || '🏳️'}',
    isDomestic: false, hotness: ${c.hotness},
    image: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&h=600&fit=crop',
    description: '${esc(c.description)}',
    avgDailyBudget: ${c.avgDailyBudget}, currency: 'CNY', timezone: '${tz}',
    tags: [${c.tags.map((t: string) => `'${esc(t)}'`).join(', ')}],
    lat: ${c.lat}, lng: ${c.lng},
  },`
}

function main() {
  // Load all batches
  const batchMain = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'generated-batch-cities.json'), 'utf8'))
  const batchExtra = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'generated-domestic-extra-clean.json'), 'utf8'))
  const batchFinal = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'generated-domestic-final.json'), 'utf8'))

  // Combine domestic: batch main (19) + extra (13) + final (25) = 57, take up to 54
  const allDomesticNew = [...batchMain.domestic, ...batchExtra, ...batchFinal]
    .filter((c: any) => c && c.name && c.lat && c.lng && c.hotness && c.id)
  
  // Deduplicate by name
  const seenNames = new Set<string>()
  const dedupedDomestic: any[] = []
  for (const c of allDomesticNew) {
    if (!seenNames.has(c.name)) {
      seenNames.add(c.name)
      dedupedDomestic.push(c)
    }
  }
  // Take exactly 54 to reach 100 total (46 existing + 54 new)
  const domesticFinal = dedupedDomestic.slice(0, 54)

  // International: 80 from batch main
  const allIntlNew = batchMain.international
    .filter((c: any) => c && c.name && c.lat && c.lng && c.hotness && c.id)
  const seenIntlNames = new Set<string>()
  const dedupedIntl: any[] = []
  for (const c of allIntlNew) {
    if (!seenIntlNames.has(c.name)) {
      seenIntlNames.add(c.name)
      dedupedIntl.push(c)
    }
  }
  const intlFinal = dedupedIntl.slice(0, 80)

  console.log(`国内新增: ${domesticFinal.length} (目标54)`)
  console.log(`国际新增: ${intlFinal.length} (目标80)`)

  // Read destinations.ts
  const destPath = path.resolve(__dirname, '..', 'src', 'data', 'destinations.ts')
  let code = fs.readFileSync(destPath, 'utf-8')

  // Find insertion point for domestic cities (before the closing ] of domesticCities array)
  // Last entry of domesticCities ends with `},\n]` before international section
  const intlSectionMarker = '/* ═══════════════════════════════════════════════════════════════════\n * 国际 Top 20'
  const intlIdx = code.indexOf(intlSectionMarker)
  if (intlIdx === -1) throw new Error('Cannot find international section marker')

  // Find the `]` that closes domesticCities array (just before intlSection)
  const closingBracketBefore = code.lastIndexOf(']', intlIdx)
  if (closingBracketBefore === -1) throw new Error('Cannot find closing ] for domesticCities')

  // Generate domestic TS
  const domesticTS = domesticFinal.map(formatDomestic).join('\n')
  
  // Insert domestic cities before the ]
  code = code.slice(0, closingBracketBefore) + '\n  // ═══ 千问批量生成：国内补充城市 ═══\n' + domesticTS + '\n' + code.slice(closingBracketBefore)

  // Now find insertion point for international cities (before the closing ] of internationalCities array)
  const exportMarker = '/* ═══════════════════════════════════════════════════════════════════\n * 导出 & 工具函数'
  const exportIdx = code.indexOf(exportMarker)
  if (exportIdx === -1) throw new Error('Cannot find export section marker')

  const intlClosingBracket = code.lastIndexOf(']', exportIdx)
  if (intlClosingBracket === -1) throw new Error('Cannot find closing ] for internationalCities')

  // Generate international TS
  const intlTS = intlFinal.map(formatIntl).join('\n')

  code = code.slice(0, intlClosingBracket) + '\n  // ═══ 千问批量生成：国际补充城市 ═══\n' + intlTS + '\n' + code.slice(intlClosingBracket)

  // Update section headers
  code = code.replace(
    '* 国内 Top 20 城市（3月/春季热度）',
    '* 国内 Top 100 城市（含当季热度）'
  )
  code = code.replace(
    '* 国际 Top 20 城市（3月/春季热度）',
    '* 国际 Top 100 城市（含当季热度）'
  )
  code = code.replace(
    '* 目的地数据 – 国内 Top 20 + 国际 Top 20（当季热门）',
    '* 目的地数据 – 国内 Top 100 + 国际 Top 100（当季热门）'
  )

  fs.writeFileSync(destPath, code, 'utf-8')
  console.log(`\n✅ destinations.ts 已更新!`)
  console.log(`   总行数约: ${code.split('\n').length}`)
}

main()
