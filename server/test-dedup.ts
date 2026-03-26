/**
 * test-dedup.ts – POI 去重算法单元测试
 *
 * 运行: npx tsx server/test-dedup.ts
 */

import { deduplicatePOIs } from './dedup.js'

/* ── 测试用 POI 工厂函数 ── */
function makePOI(overrides: Partial<{
  id: string; name: string; nameZh: string; type: string; description: string;
  address: string; lat: number; lng: number; tags: string[];
  rating: number; duration: number; cost: number; seasonScore: number; recommendReason: string;
}>): any {
  return {
    id: 'ai-test-1',
    name: '测试景点',
    type: 'scenic',
    image: 'https://example.com/img.jpg',
    rating: 4.5,
    duration: 120,
    cost: 50,
    description: '一个美丽的公园',
    address: '东京都新宿区1-1',
    lat: 35.6895,
    lng: 139.6917,
    tags: ['景点', '公园'],
    openTime: '09:00',
    closeTime: '18:00',
    recommendReason: '非常值得一游',
    seasonScore: 8,
    ...overrides,
  }
}

let passed = 0
let failed = 0

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++
    console.log(`  ✅ ${message}`)
  } else {
    failed++
    console.error(`  ❌ ${message}`)
  }
}

/* ═══════════════════════ 测试用例 ═══════════════════════ */

console.log('\n🧪 POI 去重算法单元测试\n')

// ── 测试1: 完全相同的 POI 应该被合并 ──
console.log('── 测试1: 完全相同的 POI 应被合并 ──')
{
  const pois = [
    makePOI({ id: 'ai-test-1', name: '新宿御苑', type: 'scenic', description: '位于东京的大型公园', address: '东京都新宿区内藤町11' }),
    makePOI({ id: 'ai-test-2', name: '新宿御苑', type: 'activity', description: '位于东京的大型公园', address: '东京都新宿区内藤町11' }),
  ]
  const { pois: result, stats } = deduplicatePOIs(pois)
  assert(result.length === 1, `合并后应剩1个POI (实际: ${result.length})`)
  assert(stats.duplicatePairs === 1, `应发现1对重复 (实际: ${stats.duplicatePairs})`)
  assert(stats.removedCount === 1, `应移除1个 (实际: ${stats.removedCount})`)
}

// ── 测试2: 名称高度相似但不完全相同 ──
console.log('\n── 测试2: 名称高度相似（90%+）应合并 ──')
{
  const pois = [
    makePOI({ id: 'ai-test-1', name: '浅草寺', type: 'scenic',
      description: '位于东京浅草的古老寺庙', address: '东京都台东区浅草2-3-1',
      lat: 35.7148, lng: 139.7967 }),
    makePOI({ id: 'ai-test-2', name: '浅草寺', type: 'activity',
      description: '体验浅草寺的传统文化活动', address: '东京都台东区浅草2-3-1',
      lat: 35.7148, lng: 139.7967 }),
  ]
  const { pois: result, stats } = deduplicatePOIs(pois)
  assert(result.length === 1, `合并后应剩1个POI (实际: ${result.length})`)
  assert(result[0].type === 'scenic', `浅草寺是地点，应归入scenic (实际: ${result[0].type})`)
}

// ── 测试3: 完全不同的 POI 不应被合并 ──
console.log('\n── 测试3: 不同的 POI 不应被合并 ──')
{
  const pois = [
    makePOI({ id: 'ai-test-1', name: '东京塔', type: 'scenic',
      description: '东京标志性铁塔', address: '东京都港区芝公园4-2-8',
      lat: 35.6586, lng: 139.7454 }),
    makePOI({ id: 'ai-test-2', name: '富士山', type: 'scenic',
      description: '日本最高峰', address: '静冈县富士宫市',
      lat: 35.3606, lng: 138.7274 }),
    makePOI({ id: 'ai-test-3', name: '传统茶道体验', type: 'activity',
      description: '可以体验日本传统茶道文化', address: '东京都中央区银座3-5',
      lat: 35.6717, lng: 139.7649 }),
  ]
  const { pois: result, stats } = deduplicatePOIs(pois)
  assert(result.length === 3, `3个不同POI应全部保留 (实际: ${result.length})`)
  assert(stats.duplicatePairs === 0, `应无重复对 (实际: ${stats.duplicatePairs})`)
}

// ── 测试4: 活动类型判定 ──
console.log('\n── 测试4: 活动体验类POI应归入activity ──')
{
  const pois = [
    makePOI({ id: 'ai-test-1', name: '和服体验', type: 'scenic',
      description: '可以体验穿着传统和服在浅草漫步的活动', address: '东京都台东区浅草1-2',
      lat: 35.7117, lng: 139.7946, tags: ['体验', '文化'] }),
    makePOI({ id: 'ai-test-2', name: '和服体验活动', type: 'activity',
      description: '提供和服穿着体验服务', address: '东京都台东区浅草1-2',
      lat: 35.7117, lng: 139.7946, tags: ['和服', '体验'] }),
  ]
  const { pois: result } = deduplicatePOIs(pois)
  assert(result.length === 1, `合并后应剩1个POI (实际: ${result.length})`)
  assert(result[0].type === 'activity', `体验活动应归入activity (实际: ${result[0].type})`)
}

// ── 测试5: 地址略有差异但同一地点 ──
console.log('\n── 测试5: 地址略有差异但同一地点应合并 ──')
{
  const pois = [
    makePOI({ id: 'ai-test-1', name: '明治神宫', type: 'scenic',
      description: '坐落于东京涩谷的著名神社', address: '东京都涩谷区代代木神园町1-1',
      lat: 35.6764, lng: 139.6993 }),
    makePOI({ id: 'ai-test-2', name: '明治神宫', type: 'activity',
      description: '参观明治神宫，体验神社文化', address: '东京都渋谷区代々木神園町1-1',
      lat: 35.6764, lng: 139.6993 }),
  ]
  const { pois: result } = deduplicatePOIs(pois)
  assert(result.length === 1, `同一地点应合并 (实际: ${result.length})`)
  assert(result[0].type === 'scenic', `明治神宫是地点，应归入scenic (实际: ${result[0].type})`)
}

// ── 测试6: food/shopping 类型不参与去重 ──
console.log('\n── 测试6: food/shopping 类型不参与去重 ──')
{
  const pois = [
    makePOI({ id: 'ai-test-1', name: '一蘭拉面', type: 'food',
      description: '知名拉面连锁', address: '东京都新宿区歌舞伎町1-1',
      lat: 35.6938, lng: 139.7035 }),
    makePOI({ id: 'ai-test-2', name: '一蘭拉面', type: 'food',
      description: '知名拉面连锁', address: '东京都新宿区歌舞伎町1-1',
      lat: 35.6938, lng: 139.7035 }),
    makePOI({ id: 'ai-test-3', name: '上野公园', type: 'scenic',
      description: '东京著名公园', address: '东京都台东区上野公园',
      lat: 35.7146, lng: 139.7732 }),
  ]
  const { pois: result } = deduplicatePOIs(pois)
  // food 类型即使名称一样也不会被去重
  assert(result.length === 3, `food不参与去重，应保留3个 (实际: ${result.length})`)
}

// ── 测试7: 合并时保留更优质数据 ──
console.log('\n── 测试7: 合并时保留更优质的数据 ──')
{
  const pois = [
    makePOI({ id: 'ai-test-1', name: '皇居', type: 'scenic',
      description: '日本天皇居所', address: '东京都千代田区千代田1-1',
      lat: 35.6852, lng: 139.7528, rating: 4.2, tags: ['景点'] }),
    makePOI({ id: 'ai-test-2', name: '皇居', type: 'activity',
      description: '日本天皇居所，皇居外苑是东京市中心最大的绿地公园之一，可以在此散步游览', address: '东京都千代田区千代田1-1',
      lat: 35.6852, lng: 139.7528, rating: 4.8, tags: ['皇室', '历史'] }),
  ]
  const { pois: result } = deduplicatePOIs(pois)
  assert(result.length === 1, `应合并为1个 (实际: ${result.length})`)
  assert(result[0].rating === 4.8, `应保留更高评分4.8 (实际: ${result[0].rating})`)
  assert(result[0].tags.length >= 2, `标签应合并 (实际: ${result[0].tags.length}个)`)
  // 描述更详细的那个应作为primary
  assert(result[0].description.length > 10, `应保留更长的描述`)
}

// ── 测试8: 传递性合并 (A≈B, B≈C → A,B,C合为一个) ──
console.log('\n── 测试8: 传递性重复应归为一组 ──')
{
  const pois = [
    makePOI({ id: 'ai-test-1', name: '上野公园', type: 'scenic',
      description: '位于东京都台东区的大型公园', address: '东京都台东区上野公园',
      lat: 35.7146, lng: 139.7732 }),
    makePOI({ id: 'ai-test-2', name: '上野公园', type: 'activity',
      description: '在上野公园赏花体验', address: '东京都台东区上野公園',
      lat: 35.7146, lng: 139.7732 }),
    makePOI({ id: 'ai-test-3', name: '上野恩赐公园', type: 'scenic',
      description: '位于东京台东区的大型公园', address: '东京都台东区上野公园5-20',
      lat: 35.7146, lng: 139.7732 }),
  ]
  const { pois: result, stats } = deduplicatePOIs(pois)
  // 前两个完全匹配，第三个名称不完全相同但地址和坐标一样
  // 至少前两个应该合并
  assert(result.length <= 2, `至少应合并出重复 (实际: ${result.length})`)
  assert(stats.removedCount >= 1, `至少应移除1个 (实际: ${stats.removedCount})`)
}

// ── 测试9: 景点内的体验活动应归入 activity ──
console.log('\n── 测试9: 景点内的体验活动应归入activity ──')
{
  const pois = [
    makePOI({ id: 'ai-test-1', name: '富士山登山体验', type: 'scenic',
      description: '可以参加富士山的登山活动，体验攀岩和徒步的乐趣', address: '静冈县富士宫市',
      lat: 35.3606, lng: 138.7274, tags: ['登山', '体验', '户外'] }),
  ]
  const { pois: result } = deduplicatePOIs(pois)
  assert(result[0].type === 'activity', `登山体验应归入activity (实际: ${result[0].type})`)
}

// ── 测试10: 空数组和单元素 ──
console.log('\n── 测试10: 边界情况 ──')
{
  const { pois: r1 } = deduplicatePOIs([])
  assert(r1.length === 0, `空数组应返回空 (实际: ${r1.length})`)

  const single = [makePOI({ id: 'ai-test-1' })]
  const { pois: r2 } = deduplicatePOIs(single)
  assert(r2.length === 1, `单个POI应保留 (实际: ${r2.length})`)
}

// ── 测试11: 大批量POI性能测试 ──
console.log('\n── 测试11: 大批量POI性能 ──')
{
  const bigList: any[] = []
  for (let i = 0; i < 200; i++) {
    bigList.push(makePOI({
      id: `ai-test-${i}`,
      name: `景点${i}`,
      type: i % 2 === 0 ? 'scenic' : 'activity',
      address: `地址${i}`,
      lat: 35 + i * 0.01,
      lng: 139 + i * 0.01,
      description: `第${i}个景点描述`,
    }))
  }
  // 添加10对重复
  for (let i = 0; i < 10; i++) {
    bigList.push(makePOI({
      id: `ai-test-dup-${i}`,
      name: `景点${i}`,
      type: 'activity',
      address: `地址${i}`,
      lat: 35 + i * 0.01,
      lng: 139 + i * 0.01,
      description: `第${i}个景点重复描述`,
    }))
  }

  const start = performance.now()
  const { pois: result, stats } = deduplicatePOIs(bigList)
  const elapsed = performance.now() - start

  assert(stats.removedCount === 10, `应移除10个重复 (实际: ${stats.removedCount})`)
  assert(result.length === 200, `应剩200个 (实际: ${result.length})`)
  assert(elapsed < 1000, `210个POI去重应<1s (实际: ${elapsed.toFixed(0)}ms)`)
  console.log(`    ⏱️ 210个POI去重耗时: ${elapsed.toFixed(1)}ms`)
}

// ═══════════════════════ v3 新增测试：防误合并 ═══════════════════════

// ── 测试12: 跨类型保护 — 六义园(scenic) vs 六义园(activity) 不应合并 ──
console.log('\n── 测试12: [v3] 跨类型不同体验不应合并 (六义园) ──')
{
  const pois = [
    makePOI({ id: 'ai-test-1', name: '六义园', nameZh: '六义园', type: 'scenic',
      description: '东京著名的日式庭园，以精美的回游式泉水庭园闻名', address: '东京都文京区本�.駒込6-16-3',
      lat: 35.7329, lng: 139.7474, cost: 30, tags: ['庭园', '红叶', '赏樱'] }),
    makePOI({ id: 'ai-test-2', name: '六义园', nameZh: '六义园', type: 'activity',
      description: '在六义园内体验传统抹茶茶道，感受日本文化', address: '东京都文京区本駒込6-16-3',
      lat: 35.7329, lng: 139.7474, cost: 300, tags: ['抹茶', '文化体验', '茶道'] }),
  ]
  const { pois: result } = deduplicatePOIs(pois)
  assert(result.length === 2, `不同体验(¥30赏景 vs ¥300抹茶)应保留2个 (实际: ${result.length})`)
}

// ── 测试13: 跨类型保护 — 清澄庭园(scenic) vs 清澄庭园(activity) 不应合并 ──
console.log('\n── 测试13: [v3] 跨类型不同体验不应合并 (清澄庭园) ──')
{
  const pois = [
    makePOI({ id: 'ai-test-1', name: '清澄庭园', nameZh: '清澄庭园', type: 'scenic',
      description: '明治时代建造的回游式林泉庭园', address: '东京都江东区清澄3-3-9',
      lat: 35.6811, lng: 139.7988, cost: 15, tags: ['庭园', '池泉', '石组'] }),
    makePOI({ id: 'ai-test-2', name: '清澄庭园', nameZh: '清澄庭园', type: 'activity',
      description: '在清澄庭园内的茶室品抹茶体验日式点心', address: '东京都江东区清澄3-3-9',
      lat: 35.6811, lng: 139.7988, cost: 1000, tags: ['抹茶体验', '茶室', '日式点心'] }),
  ]
  const { pois: result } = deduplicatePOIs(pois)
  assert(result.length === 2, `不同体验(¥15庭园 vs ¥1000抹茶)应保留2个 (实际: ${result.length})`)
}

// ── 测试14: 同类型内容变体 — 目黑川×2 不应合并 ──
console.log('\n── 测试14: [v3] 同类型不同角度不应合并 (目黑川) ──')
{
  const pois = [
    makePOI({ id: 'ai-test-1', name: '目黑川', nameZh: '目黑川', type: 'scenic',
      description: '目黑川沿岸的樱花步道，春季赏樱名所', address: '东京都目黑区',
      lat: 35.6413, lng: 139.6989, cost: 0, duration: 150,
      tags: ['赏樱', '河川', '步道', '春季', '夜樱'] }),
    makePOI({ id: 'ai-test-2', name: '目黑川', nameZh: '目黑川', type: 'scenic',
      description: '东京时尚商业区旁的河岸散步道', address: '东京都目黑区',
      lat: 35.6413, lng: 139.6989, cost: 0, duration: 150,
      tags: ['中目黑', '咖啡店', '散步', '时尚', '商业'] }),
  ]
  const { pois: result } = deduplicatePOIs(pois)
  assert(result.length === 2, `不同角度(赏樱 vs 时尚散步)应保留2个 (实际: ${result.length})`)
}

// ── 测试15: 同类型不同价格 — 隅田公园不应合并 ──
console.log('\n── 测试15: [v3] 同类型不同价格不应合并 (隅田公园) ──')
{
  const pois = [
    makePOI({ id: 'ai-test-1', name: '隅田公园', nameZh: '隅田公园', type: 'scenic',
      description: '隅田川沿岸的开放式公园，可远眺晴空塔', address: '东京都台东区花川户1-1',
      lat: 35.7168, lng: 139.8014, cost: 0, duration: 90, tags: ['公园', '樱花', '河川'] }),
    makePOI({ id: 'ai-test-2', name: '隅田公园', nameZh: '隅田公园', type: 'scenic',
      description: '参加隅田川水上巴士游览，欣赏两岸风景', address: '东京都台东区花川户1-1',
      lat: 35.7168, lng: 139.8014, cost: 200, duration: 60, tags: ['游船', '晴空塔', '水上巴士'] }),
  ]
  const { pois: result } = deduplicatePOIs(pois)
  assert(result.length === 2, `免费公园 vs ¥200游船体验应保留2个 (实际: ${result.length})`)
}

// ── 测试16: 真正重复的跨类型同内容应合并 — 千鸟渊绿道 ──
console.log('\n── 测试16: [v3] 真正的跨类型重复应合并 (千鸟渊绿道) ──')
{
  const pois = [
    makePOI({ id: 'ai-test-1', name: '千鸟渊绿道', nameZh: '千鸟渊绿道', type: 'scenic',
      description: '沿皇居护城河的步道，是东京最著名的赏樱地之一', address: '东京都千代田区三番町',
      lat: 35.6908, lng: 139.7468, cost: 0, duration: 90, tags: ['赏樱', '步道', '皇居'] }),
    makePOI({ id: 'ai-test-2', name: '千鸟渊绿道', nameZh: '千鸟渊绿道', type: 'activity',
      description: '千鸟渊步道赏樱散步，东京最美樱花隧道', address: '东京都千代田区三番町先',
      lat: 35.6905, lng: 139.7470, cost: 0, duration: 90, tags: ['赏樱', '散步', '护城河'] }),
  ]
  const { pois: result } = deduplicatePOIs(pois)
  assert(result.length === 1, `相同内容的跨类型重复应合并为1个 (实际: ${result.length})`)
}

// ── 测试17: 异名合并保留 — 上野公园 ↔ 上野恩赐公园 仍应合并 ──
console.log('\n── 测试17: [v3] 简称-全称仍应合并 (上野公园↔上野恩赐公园) ──')
{
  const pois = [
    makePOI({ id: 'ai-test-1', name: '上野公园', nameZh: '上野公园', type: 'scenic',
      description: '东京最大的公园，内有动物园和多座博物馆', address: '东京都台东区上野公园',
      lat: 35.7146, lng: 139.7732, cost: 0, duration: 120, tags: ['公园', '樱花', '博物馆'] }),
    makePOI({ id: 'ai-test-2', name: '上野恩赐公园', nameZh: '上野恩赐公园', type: 'scenic',
      description: '正式名称为上野恩赐公园，是东京最知名的公园之一', address: '东京都台东区上野公園5-20',
      lat: 35.7146, lng: 139.7732, cost: 0, duration: 120, tags: ['公园', '赏樱', '上野'] }),
  ]
  const { pois: result } = deduplicatePOIs(pois)
  assert(result.length === 1, `简称-全称应合并为1个 (实际: ${result.length})`)
}

/* ═══════════════════════ 汇总 ═══════════════════════ */
console.log(`\n${'═'.repeat(50)}`)
console.log(`📊 测试结果: ${passed} 通过, ${failed} 失败`)
console.log(`${'═'.repeat(50)}\n`)

process.exit(failed > 0 ? 1 : 0)
