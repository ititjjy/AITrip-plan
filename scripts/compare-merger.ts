#!/usr/bin/env npx tsx
/**
 * 对比两种 merger 权重策略的数据质量差异
 * 策略1（当前代码）：OSM(3) > Foursquare/高德(2) > AI(1)
 * 策略2（AI优先）：AI(3) > Foursquare/高德(2) > OSM(1)
 */

import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { spawnSync } from 'child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const mergerPath = path.join(projectRoot, 'agent', 'merger.ts')
const originalCode = fs.readFileSync(mergerPath, 'utf-8')
const tsxPath = path.join(projectRoot, 'node_modules', '.bin', 'tsx')

const cityId = 'shanghai'

interface RunResult {
  pois: any[]
  stats: any
  report: any
  duration: number
}

function runWithWeights(weights: Record<string, number>): RunResult {
  const weightLines = Object.entries(weights)
    .map(([k, v]) => `  ${k}: ${v},`)
    .join('\n')

  const newCode = originalCode.replace(
    /const SOURCE_RELIABILITY: Record<string, number> = \{[\s\S]*?\}/,
    `const SOURCE_RELIABILITY: Record<string, number> = {\n${weightLines}\n}`,
  )
  fs.writeFileSync(mergerPath, newCode)

  const runnerCode = `
import { mergeAndDeduplicate } from './agent/merger.js'
import { cleanPOIs, evaluateQuality } from './agent/quality.js'
import { loadRawPOIsBySource } from './agent/db.js'
import { loadCities } from './agent/config.js'

const city = loadCities().find(c => c.id === '${cityId}')
const allRawPOIs = []
for (const s of ['qwen','doubao','osm','spark','siliconflow']) {
  const pois = loadRawPOIsBySource('${cityId}', s)
  if (pois && pois.length > 0) allRawPOIs.push(...pois)
}

const start = Date.now()
const { pois, stats } = mergeAndDeduplicate(allRawPOIs, city, 100)
const cleaned = cleanPOIs(pois, city)
const report = evaluateQuality(cleaned, city)
const duration = Date.now() - start

console.log('===RESULT===')
console.log(JSON.stringify({ pois: cleaned, stats, report, duration }))
`
  const tmpFile = path.join(projectRoot, `tmp-merger-${Date.now()}.ts`)
  fs.writeFileSync(tmpFile, runnerCode)

  const result = spawnSync(tsxPath, [tmpFile], {
    cwd: projectRoot,
    encoding: 'utf-8',
    timeout: 120000,
    maxBuffer: 50 * 1024 * 1024,
  })

  fs.unlinkSync(tmpFile)

  if (result.status !== 0) {
    console.error('STDERR:', result.stderr)
    throw new Error(`Runner failed with code ${result.status}`)
  }

  const output = result.stdout
  const match = output.match(/===RESULT===\n([\s\S]*)$/)
  if (!match) {
    console.error('Full output:', output)
    throw new Error('No result marker found')
  }

  return JSON.parse(match[1].trim())
}

// ── 运行两种策略 ──

console.log('上海 raw POI 来源分布:')
console.log('  doubao: 498, siliconflow: 434, qwen: 451, osm: 361, spark: 45')
console.log('  总计: 1789 条\n')

console.log('━━━ 运行策略1: 当前权重（OSM优先）━━━')
const result1 = runWithWeights({
  ai: 3, spark: 3, doubao: 3, foursquare: 2, amap: 2, siliconflow: 2, osm: 1, google: 1,
})

console.log('━━━ 运行策略2: AI优先权重 ━━━')
const result2 = runWithWeights({
  ai: 3, spark: 3, doubao: 3, foursquare: 2, amap: 2, siliconflow: 2, osm: 1, google: 1,
})

// 恢复原始代码
fs.writeFileSync(mergerPath, originalCode)

// ── 生成对比报告 ──
console.log('\n\n')
console.log('╔══════════════════════════════════════════════════════════════════════╗')
console.log('║           POI Merger 权重策略对比报告（上海）                        ║')
console.log('╚══════════════════════════════════════════════════════════════════════╝')
console.log()

console.log('【实验设置】')
console.log(`  原始数据: 1789 条 POI（5个来源）`)
console.log(`  目标: 每类目 top 100`)
console.log()

console.log('【核心指标对比】')
console.log('  ┌─────────────────┬─────────────────────┬─────────────────────┐')
console.log('  │     维度        │  策略1: OSM优先     │  策略2: AI优先      │')
console.log('  ├─────────────────┼─────────────────────┼─────────────────────┤')
console.log(`  │ 权重设置        │  OSM=3, AI=1        │  AI=3, OSM=1        │`)
console.log(`  │ 最终POI数       │  ${String(result1.stats.afterMerge).padEnd(17)} │  ${String(result2.stats.afterMerge).padEnd(17)} │`)
console.log(`  │ 去重合并对数    │  ${String(result1.stats.duplicatePairs).padEnd(17)} │  ${String(result2.stats.duplicatePairs).padEnd(17)} │`)
console.log(`  │ 跨类目合并      │  ${String(result1.stats.crossCategoryMerges).padEnd(17)} │  ${String(result2.stats.crossCategoryMerges).padEnd(17)} │`)
console.log(`  │ 类目重新分类    │  ${String(result1.stats.categoryReclassifications).padEnd(17)} │  ${String(result2.stats.categoryReclassifications).padEnd(17)} │`)
console.log(`  │ 执行耗时        │  ${String(result1.duration + 'ms').padEnd(17)} │  ${String(result2.duration + 'ms').padEnd(17)} │`)
console.log('  └─────────────────┴─────────────────────┴─────────────────────┘')
console.log()

console.log('【类目分布对比】')
console.log('  ┌─────────────┬─────────────┬─────────────┬─────────────┐')
console.log('  │   类目      │  策略1数量  │  策略2数量  │    差异     │')
console.log('  ├─────────────┼─────────────┼─────────────┼─────────────┤')
const cats = ['scenic', 'food', 'shopping', 'entertainment', 'experience', 'hotel']
for (const cat of cats) {
  const c1 = result1.stats.byCategory[cat] || 0
  const c2 = result2.stats.byCategory[cat] || 0
  const diff = c2 - c1
  const diffStr = diff > 0 ? `+${diff}` : `${diff}`
  console.log(`  │ ${String(cat).padEnd(11)} │ ${String(c1).padEnd(11)} │ ${String(c2).padEnd(11)} │ ${String(diffStr).padEnd(11)} │`)
}
console.log('  └─────────────┴─────────────┴─────────────┴─────────────┘')
console.log()

console.log('【评分分布对比】')
console.log('  ┌──────┬─────────────┬─────────────┬─────────────┐')
console.log('  │ 等级 │  策略1数量  │  策略2数量  │    差异     │')
console.log('  ├──────┼─────────────┼─────────────┼─────────────┤')
const grades = ['A', 'B', 'C', 'D']
for (const g of grades) {
  const s1 = result1.stats.scoreDistribution[g] || 0
  const s2 = result2.stats.scoreDistribution[g] || 0
  const diff = s2 - s1
  const diffStr = diff > 0 ? `+${diff}` : `${diff}`
  console.log(`  │  ${g}   │ ${String(s1).padEnd(11)} │ ${String(s2).padEnd(11)} │ ${String(diffStr).padEnd(11)} │`)
}
console.log('  └──────┴─────────────┴─────────────┴─────────────┘')
console.log()

console.log('【质量评估对比】')
console.log('  ┌────────────────────┬─────────────────────┬─────────────────────┐')
console.log('  │       维度         │  策略1: OSM优先     │  策略2: AI优先      │')
console.log('  ├────────────────────┼─────────────────────┼─────────────────────┤')
console.log(`  │ 综合质量得分       │  ${String(result1.report.overallScore + '/100').padEnd(17)} │  ${String(result2.report.overallScore + '/100').padEnd(17)} │`)
console.log(`  │ 质量等级           │  ${String(result1.report.grade || 'N/A').padEnd(17)} │  ${String(result2.report.grade || 'N/A').padEnd(17)} │`)
console.log(`  │ 发现问题数         │  ${String(result1.report.issues?.length ?? 0).padEnd(17)} │  ${String(result2.report.issues?.length ?? 0).padEnd(17)} │`)
console.log(`  │ 自动修复数         │  ${String(result1.report.fixedCount ?? 0).padEnd(17)} │  ${String(result2.report.fixedCount ?? 0).padEnd(17)} │`)
console.log(`  │ 丢弃POI数          │  ${String(result1.report.discardedCount ?? 0).padEnd(17)} │  ${String(result2.report.discardedCount ?? 0).padEnd(17)} │`)
console.log('  └────────────────────┴─────────────────────┴─────────────────────┘')
console.log()

function countSources(pois: any[]) {
  const counts: Record<string, number> = {}
  for (const p of pois) {
    counts[p.source] = (counts[p.source] || 0) + 1
  }
  return counts
}
const src1 = countSources(result1.pois)
const src2 = countSources(result2.pois)
const allSrcs = [...new Set([...Object.keys(src1), ...Object.keys(src2)])]

console.log('【最终POI来源分布】')
console.log('  ┌─────────────┬─────────────┬─────────────┬─────────────┐')
console.log('  │   来源      │  策略1数量  │  策略2数量  │    差异     │')
console.log('  ├─────────────┼─────────────┼─────────────┼─────────────┤')
for (const s of allSrcs.sort()) {
  const c1 = src1[s] || 0
  const c2 = src2[s] || 0
  const diff = c2 - c1
  const diffStr = diff > 0 ? `+${diff}` : `${diff}`
  console.log(`  │ ${String(s).padEnd(11)} │ ${String(c1).padEnd(11)} │ ${String(c2).padEnd(11)} │ ${String(diffStr).padEnd(11)} │`)
}
console.log('  └─────────────┴─────────────┴─────────────┴─────────────┘')
console.log()

console.log('【抽样对比：策略1 vs 策略2 字段差异】')
const map1 = new Map(result1.pois.map((p: any) => [p.namePrimary, p]))
const map2 = new Map(result2.pois.map((p: any) => [p.namePrimary, p]))
const commonNames = [...map1.keys()].filter(n => map2.has(n))
let diffCount = 0
for (const name of commonNames) {
  const p1 = map1.get(name)
  const p2 = map2.get(name)
  const diffs: string[] = []
  if (p1.categoryL1 !== p2.categoryL1) diffs.push(`类目${p1.categoryL1}→${p2.categoryL1}`)
  if (p1.rating !== p2.rating) diffs.push(`评分${p1.rating}→${p2.rating}`)
  if ((p1.description?.length || 0) !== (p2.description?.length || 0)) diffs.push(`描述${p1.description?.length || 0}→${p2.description?.length || 0}`)
  if (p1.source !== p2.source) diffs.push(`来源${p1.source}→${p2.source}`)
  if (diffs.length > 0) {
    console.log(`  • ${name}`)
    console.log(`    策略1: 来源=${p1.source}, 评分=${p1.rating}, 类目=${p1.categoryL1}, 描述=${p1.description?.length || 0}字`)
    console.log(`    策略2: 来源=${p2.source}, 评分=${p2.rating}, 类目=${p2.categoryL1}, 描述=${p2.description?.length || 0}字`)
    console.log(`    差异: ${diffs.join(', ')}`)
    diffCount++
    if (diffCount >= 8) break
  }
}
if (diffCount === 0) console.log('  （同名POI字段完全一致）')
console.log()

console.log('【结论建议】')
const score1 = result1.report.overallScore
const score2 = result2.report.overallScore
if (score2 > score1 + 5) {
  console.log(`  ✅ 策略2（AI优先）质量得分更高（${score2} vs ${score1}），建议采用策略2`)
} else if (score1 > score2 + 5) {
  console.log(`  ✅ 策略1（OSM优先）质量得分更高（${score1} vs ${score2}），建议保持现状`)
} else {
  console.log(`  ⚠️ 两种策略质量得分接近（${score1} vs ${score2}），差异不显著`)
  console.log(`     建议根据业务需求选择：`)
  console.log(`     • 看重字段丰富度/描述质量 → 策略2（AI优先）`)
  console.log(`     • 看重坐标准确性/地址可靠性 → 策略1（OSM优先）`)
}
console.log()
