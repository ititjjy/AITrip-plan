#!/usr/bin/env node
/**
 * agent/index.ts — 本地旅游 POI 采集 Agent
 *
 * 独立的 CLI 工具，从全网多个数据源批量采集 POI 数据，
 * 在本地完成合并去重和质量校验后导出为网站兼容格式。
 *
 * 6 大类目: scenic / food / shopping / entertainment / experience / hotel
 *
 * 用法:
 *   npx tsx agent/index.ts collect [--city <id>] [--batch N] [--all] [--source <name>]
 *   npx tsx agent/index.ts export [--city <id>]
 *   npx tsx agent/index.ts quality [--city <id>]
 *   npx tsx agent/index.ts status
 *   npx tsx agent/index.ts sources
 *   npx tsx agent/index.ts refresh [--baseline] [--full] [--city <id>] [--max-cities N]
 *   npx tsx agent/index.ts validate [--city <id>]
 */

import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

import { AGENT_CONFIG, getSourceAvailability, loadCities } from './config.js'
import {
  getDB, upsertPOIs, updateCityStats, logCollection,
  getAllCityStats, getCityCount, closeDB, getCachedPOIs,
  insertRefreshCycle, updateRefreshCycle,
  getRefreshHistory, incrementCityVersion,
} from './db.js'
import { runWithConcurrency } from './utils.js'
import { type L1Category, type CityInfo as SourceCityInfo, type RawPOI, type SourceCollector } from './sources/base.js'
import { L1_CATEGORIES, L1_LABELS } from './categories.js'
import { OSMCollector } from './sources/osm.js'
import { AICollector } from './sources/ai.js'
import { FoursquareCollector } from './sources/foursquare.js'
import { GoogleCollector } from './sources/google.js'
import { AmapCollector } from './sources/amap.js'
import { mergeAndDeduplicate } from './merger.js'
import { evaluateQuality, cleanPOIs, qualityGrade, evaluateFreshness } from './quality.js'
import { calculatePriorities, selectNextBatch } from './scheduler.js'
import { exportToCache } from './exporter.js'
import {
  shouldRunIncremental, selectIncrementalCities,
  selectIncrementalSources, mergeIncremental, checkValidity,
} from './incremental.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/* ── CLI 参数解析 ── */

interface CLIArgs {
  command: string
  city?: string
  batch?: number
  all?: boolean
  sources?: string[]
  concurrency?: number
  baseline?: boolean
  full?: boolean
  maxCities?: number
}

function parseArgs(): CLIArgs {
  const args = process.argv.slice(2)
  const result: CLIArgs = { command: args[0] || 'help' }

  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case '--city':
        result.city = args[++i]
        break
      case '--batch':
        result.batch = Number(args[++i])
        break
      case '--all':
        result.all = true
        break
      case '--source':
      case '--sources':
        result.sources = args[++i].split(',').map(s => s.trim())
        break
      case '--concurrency':
        result.concurrency = Number(args[++i])
        break
      case '--baseline':
        result.baseline = true
        break
      case '--full':
        result.full = true
        break
      case '--max-cities':
        result.maxCities = Number(args[++i])
        break
    }
  }

  return result
}

/* ── 数据源工厂 ── */

function createCollectors(filterSources?: string[]): SourceCollector[] {
  const all: SourceCollector[] = [
    new OSMCollector(),
    new FoursquareCollector(),
    new GoogleCollector(),
    new AmapCollector(),
    new AICollector(),
  ]

  if (filterSources && filterSources.length > 0) {
    return all.filter(c => filterSources.includes(c.name))
  }
  return all
}

/* ── 单城市采集 ── */

async function collectCity(
  city: SourceCityInfo,
  collectors: SourceCollector[],
): Promise<{ pois: number; success: boolean }> {
  const categories: L1Category[] = [...L1_CATEGORIES]
  const startTime = Date.now()
  const allRawPOIs: RawPOI[] = []
  let hasSuccess = false

  console.log(`\n━━━ ${city.name} (${city.nameEn}) [hotness:${city.hotness}] ━━━`)

  // 并行调用所有数据源
  const sourcePromises = collectors.map(async (collector) => {
    const sourceStart = Date.now()
    try {
      const available = await collector.isAvailable()
      if (!available) {
        console.log(`  [${collector.name}] Skipped (not available)`)
        return
      }

      const rawPOIs = await collector.collect(city, categories)
      const duration = Date.now() - sourceStart

      logCollection({
        city_id: city.id,
        source: collector.name,
        status: rawPOIs.length > 0 ? 'success' : 'failed',
        items_collected: rawPOIs.length,
        items_accepted: 0,
        duration_ms: duration,
      })

      if (rawPOIs.length > 0) {
        hasSuccess = true
        console.log(`  [${collector.name}] ${rawPOIs.length} POIs in ${duration}ms`)
        return rawPOIs
      }
    } catch (err) {
      const duration = Date.now() - sourceStart
      logCollection({
        city_id: city.id,
        source: collector.name,
        status: 'failed',
        items_collected: 0,
        items_accepted: 0,
        error_message: (err as Error).message,
        duration_ms: duration,
      })
      console.error(`  [${collector.name}] Failed: ${(err as Error).message}`)
    }
    return []
  })

  const results = await Promise.allSettled(sourcePromises)
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) {
      allRawPOIs.push(...result.value)
    }
  }

  if (!hasSuccess || allRawPOIs.length === 0) {
    console.log(`  No POIs collected from any source`)
    updateCityStats(city.id, { success: false })
    return { pois: 0, success: false }
  }

  // 合并去重 (每类目 top 100)
  const { pois, stats } = mergeAndDeduplicate(allRawPOIs, city, AGENT_CONFIG.targetPOIsPerCategory)

  // 质量校验 & 清洗
  const cleaned = cleanPOIs(pois, city)
  const report = evaluateQuality(cleaned, city)

  console.log(`  Quality: ${report.overallScore}/100 (Grade ${qualityGrade(report.overallScore)})`)
  console.log(`  Issues: ${report.issues.length} found, ${report.fixedCount} auto-fixed, ${report.discardedCount} discarded`)

  // 存储到数据库
  upsertPOIs(city.id, cleaned)

  // 更新统计
  updateCityStats(city.id, {
    totalPois: cleaned.length,
    qualityScore: report.overallScore,
    source: collectors.map(c => c.name).join(','),
    success: true,
    byCategory: stats.byCategory,
  })

  const totalTime = Date.now() - startTime
  console.log(`  ${cleaned.length} POIs saved (${totalTime}ms total)`)

  return { pois: cleaned.length, success: true }
}

/* ── 命令: collect ── */

async function cmdCollect(args: CLIArgs): Promise<void> {
  const cities = loadCities()
  if (cities.length === 0) {
    console.error('No cities loaded. Check city-registry.json.')
    process.exit(1)
  }

  const collectors = createCollectors(args.sources)
  const availableCollectors = []
  for (const c of collectors) {
    if (await c.isAvailable()) {
      availableCollectors.push(c)
    } else {
      console.log(`[Skip] ${c.name}: not available`)
    }
  }

  if (availableCollectors.length === 0) {
    console.error('No data sources available. Configure at least one API key.')
    process.exit(1)
  }

  console.log(`Active sources: ${availableCollectors.map(c => c.name).join(', ')}`)
  console.log(`Categories: ${L1_CATEGORIES.map(c => L1_LABELS[c].zh).join('/')}`)

  let targetCities: SourceCityInfo[]

  if (args.city) {
    const city = cities.find(c => c.id === args.city)
    if (!city) {
      console.error(`City not found: ${args.city}`)
      process.exit(1)
    }
    targetCities = [city]
  } else if (args.all) {
    targetCities = cities
    console.log(`Batch mode: all ${cities.length} cities`)
  } else {
    const batchSize = args.batch || AGENT_CONFIG.concurrentCities
    const priorities = calculatePriorities(cities)
    const selected = selectNextBatch(priorities, batchSize)
    targetCities = selected.map(p => p.city)
    console.log(`Batch: ${targetCities.length} cities selected by priority`)
    for (const p of selected) {
      console.log(`  ${p.city.name} (score: ${p.score}) ${p.reasons.join(', ')}`)
    }
  }

  const concurrency = args.concurrency || AGENT_CONFIG.concurrentCities
  console.log(`\nCollecting ${targetCities.length} cities (concurrency: ${concurrency})...`)

  const tasks = targetCities.map(city => () => collectCity(city, availableCollectors))
  const results = await runWithConcurrency(tasks, concurrency)

  // 汇总
  const succeeded = results.filter(r => r.status === 'fulfilled' && (r as any).value?.success).length
  const failed = results.length - succeeded
  const totalPOIs = results
    .filter((r): r is PromiseFulfilledResult<{ pois: number; success: boolean }> =>
      r.status === 'fulfilled')
    .reduce((sum, r) => sum + r.value.pois, 0)

  console.log(`\n${'='.repeat(50)}`)
  console.log(`Collection complete:`)
  console.log(`  Success: ${succeeded}/${results.length}`)
  console.log(`  Failed: ${failed}`)
  console.log(`  Total POIs: ${totalPOIs}`)
  console.log(`${'='.repeat(50)}`)
}

/* ── 命令: export ── */

function cmdExport(_args: CLIArgs): void {
  exportToCache()
}

/* ── 命令: quality ── */

function cmdQuality(args: CLIArgs): void {
  const cities = loadCities()

  if (args.city) {
    const city = cities.find(c => c.id === args.city)
    if (!city) {
      console.error(`City not found: ${args.city}`)
      return
    }

    const pois = getCachedPOIs(city.id)
    if (!pois || pois.length === 0) {
      console.log(`No data for ${city.name}`)
      return
    }

    const report = evaluateQuality(pois, city)
    console.log(`\n--- Quality Report: ${city.name} ---`)
    console.log(`  Overall: ${report.overallScore}/100 (Grade ${qualityGrade(report.overallScore)})`)
    console.log(`  Completeness: ${report.dimensions.completeness}`)
    console.log(`  Accuracy: ${report.dimensions.accuracy}`)
    console.log(`  Richness: ${report.dimensions.richness}`)
    console.log(`  Diversity: ${report.dimensions.diversity}`)
    console.log(`  POIs: ${report.totalPOIs} valid, ${report.discardedCount} discarded`)

    // 按类目统计
    console.log(`  By category:`)
    for (const l1 of L1_CATEGORIES) {
      const label = L1_LABELS[l1]
      const count = report.byCategory[l1] || 0
      console.log(`    ${label.zh} (${l1}): ${count}`)
    }

    console.log(`  Issues: ${report.issues.length}`)
    for (const issue of report.issues.slice(0, 10)) {
      console.log(`    [${issue.severity}] ${issue.poiName}: ${issue.issue}`)
    }
    if (report.issues.length > 10) {
      console.log(`    ... and ${report.issues.length - 10} more`)
    }
    return
  }

  // 全量报告
  const stats = getAllCityStats()
  console.log(`\n--- Global Quality Report ---`)
  console.log(`  Cities with data: ${stats.length}`)

  const grades = { A: 0, B: 0, C: 0, D: 0 }
  let totalScore = 0
  for (const s of stats) {
    if (s.quality_score != null) {
      totalScore += s.quality_score
      grades[qualityGrade(s.quality_score) as keyof typeof grades]++
    }
  }

  if (stats.length > 0) {
    console.log(`  Average score: ${Math.round(totalScore / stats.length)}`)
    console.log(`  Grade distribution: A=${grades.A}, B=${grades.B}, C=${grades.C}, D=${grades.D}`)
  }

  const worst = stats
    .filter(s => s.quality_score != null)
    .sort((a, b) => (a.quality_score || 0) - (b.quality_score || 0))
    .slice(0, 10)

  if (worst.length > 0) {
    console.log(`\n  Worst cities:`)
    for (const s of worst) {
      const city = cities.find(c => c.id === s.city_id)
      console.log(`    ${city?.name || s.city_id}: ${s.quality_score}/100 (${qualityGrade(s.quality_score || 0)})`)
    }
  }
}

/* ── 命令: status ── */

function cmdStatus(): void {
  const counts = getCityCount()
  const stats = getAllCityStats()
  const cities = loadCities()

  console.log(`\n--- Agent Status ---`)
  console.log(`  Database: ${AGENT_CONFIG.dbPath}`)
  console.log(`  DB size: ${fs.existsSync(AGENT_CONFIG.dbPath) ? Math.round(fs.statSync(AGENT_CONFIG.dbPath).size / 1024) : 0} KB`)
  console.log(`  Cities in registry: ${cities.length}`)
  console.log(`  Cities with POIs: ${counts.withPois}`)
  console.log(`  Coverage: ${Math.round(counts.withPois / Math.max(cities.length, 1) * 100)}%`)

  // 数据源状态
  const sources = getSourceAvailability()
  console.log(`\n  Data Sources:`)
  for (const s of sources) {
    console.log(`    ${s.name}: ${s.available ? 'available' : (s.reason || 'unavailable')}`)
  }

  // 数据年龄分布
  const now = Date.now()
  const ageDistribution = { fresh: 0, recent: 0, aging: 0, stale: 0, expired: 0, never: 0 }
  for (const s of stats) {
    if (!s.last_collection_at) { ageDistribution.never++; continue }
    const ageDays = (now - s.last_collection_at) / 86_400_000
    if (ageDays <= 3) ageDistribution.fresh++
    else if (ageDays <= 7) ageDistribution.recent++
    else if (ageDays <= 14) ageDistribution.aging++
    else if (ageDays <= 30) ageDistribution.stale++
    else ageDistribution.expired++
  }
  console.log(`\n  Data Age Distribution:`)
  console.log(`    Fresh (≤3d): ${ageDistribution.fresh}, Recent (≤7d): ${ageDistribution.recent}`)
  console.log(`    Aging (≤14d): ${ageDistribution.aging}, Stale (≤30d): ${ageDistribution.stale}`)
  console.log(`    Expired (>30d): ${ageDistribution.expired}, Never: ${ageDistribution.never}`)

  // 最近采集
  const recent = stats.slice(0, 5)
  if (recent.length > 0) {
    console.log(`\n  Recent collections:`)
    for (const s of recent) {
      const city = cities.find(c => c.id === s.city_id)
      const date = s.last_collection_at ? new Date(s.last_collection_at).toLocaleString() : 'never'
      const byCat = s.by_category ? JSON.parse(s.by_category) : {}
      const catStr = Object.entries(byCat).map(([k, v]) => `${k}:${v}`).join(' ')
      console.log(`    ${city?.name || s.city_id}: ${s.total_pois} POIs [${catStr}], score ${s.quality_score || '?'}, ${date}`)
    }
  }

  // 刷新历史
  const refreshHistory = getRefreshHistory(5)
  if (refreshHistory.length > 0) {
    console.log(`\n  Recent Refresh Cycles:`)
    for (const r of refreshHistory) {
      const date = new Date(r.started_at).toLocaleString()
      console.log(`    #${r.id} [${r.cycle_type}] ${r.status} — ${date}`)
    }
  }

  // 导出状态
  const exportPath = AGENT_CONFIG.exportPath
  if (fs.existsSync(exportPath)) {
    const stat = fs.statSync(exportPath)
    console.log(`\n  Export file: ${exportPath}`)
    console.log(`    Size: ${Math.round(stat.size / 1024)} KB`)
    console.log(`    Modified: ${stat.mtime.toLocaleString()}`)
  } else {
    console.log(`\n  Export file: not generated yet`)
  }
}

/* ── 命令: sources ── */

async function cmdSources(): Promise<void> {
  const sources = getSourceAvailability()
  console.log(`\n--- Data Source Status ---`)
  for (const s of sources) {
    const status = s.available ? 'Available' : 'Unavailable'
    console.log(`  ${s.name}: ${status}`)
    if (s.reason) console.log(`    Reason: ${s.reason}`)
  }
}

/* ── 命令: refresh ── */

async function cmdRefresh(args: CLIArgs): Promise<void> {
  const cities = loadCities()
  if (cities.length === 0) {
    console.error('No cities loaded. Check city-registry.json.')
    process.exit(1)
  }

  // 判断模式
  let mode: 'baseline' | 'incremental' | 'full_refresh'
  if (args.baseline) {
    mode = 'baseline'
  } else if (args.full) {
    mode = 'full_refresh'
  } else {
    const decision = shouldRunIncremental()
    if (decision.mode === 'none') {
      console.log(`No refresh needed: ${decision.reason}`)
      return
    }
    mode = decision.mode
    console.log(`Auto-decided mode: ${mode} — ${decision.reason}`)
  }

  // baseline = 全量采集 (同 collect --all)
  if (mode === 'baseline') {
    console.log('\n--- Baseline Collection ---')
    args.all = true
    await cmdCollect(args)
    return
  }

  // full_refresh / incremental
  const allCollectors = createCollectors(args.sources)
  const available: SourceCollector[] = []
  for (const c of allCollectors) {
    if (await c.isAvailable()) available.push(c)
  }
  if (available.length === 0) {
    console.error('No data sources available.')
    process.exit(1)
  }

  const isFullRefresh = mode === 'full_refresh'
  const collectors = selectIncrementalSources(available, isFullRefresh)
  console.log(`Sources: ${collectors.map(c => c.name).join(', ')}`)

  // 选取城市
  let targetCities: SourceCityInfo[]
  if (args.city) {
    const city = cities.find(c => c.id === args.city)
    if (!city) {
      console.error(`City not found: ${args.city}`)
      process.exit(1)
    }
    targetCities = [city]
  } else {
    const max = args.maxCities || AGENT_CONFIG.incrementalMaxCities
    targetCities = selectIncrementalCities(cities, max)
    console.log(`Selected ${targetCities.length} cities for ${mode}`)
  }

  if (targetCities.length === 0) {
    console.log('No cities need updating.')
    return
  }

  // 记录 refresh cycle
  const cycleId = insertRefreshCycle({
    cycle_type: isFullRefresh ? 'full_refresh' : 'incremental',
    status: 'running',
    config: { cities: targetCities.length, sources: collectors.map(c => c.name) },
  })

  let successCount = 0
  let failCount = 0
  const results: { city: string; status: string; pois: number }[] = []

  for (const city of targetCities) {
    const existingPOIs = getCachedPOIs(city.id)

    if (!existingPOIs || existingPOIs.length === 0 || isFullRefresh) {
      // 无已有数据或全量刷新: 直接采集
      const result = await collectCity(city, collectors)
      if (result.success) {
        successCount++
        incrementCityVersion(city.id)
        results.push({ city: city.name, status: 'collected', pois: result.pois })
      } else {
        failCount++
        results.push({ city: city.name, status: 'failed', pois: 0 })
      }
    } else {
      // 增量模式: 采集 + 融入
      console.log(`\n━━━ [Incremental] ${city.name} ━━━`)
      const categories: L1Category[] = [...L1_CATEGORIES]
      const allRaw: RawPOI[] = []

      for (const collector of collectors) {
        try {
          const avail = await collector.isAvailable()
          if (!avail) continue
          const raw = await collector.collect(city, categories)
          if (raw.length > 0) {
            allRaw.push(...raw)
            console.log(`  [${collector.name}] ${raw.length} raw POIs`)
          }
        } catch (err) {
          console.error(`  [${collector.name}] Failed: ${(err as Error).message}`)
        }
      }

      if (allRaw.length > 0) {
        const { pois: mergedPOIs, stats: mergeStats } = mergeIncremental(existingPOIs, allRaw, city)
        const cleaned = cleanPOIs(mergedPOIs, city)
        upsertPOIs(city.id, cleaned)
        incrementCityVersion(city.id)
        updateCityStats(city.id, {
          totalPois: cleaned.length,
          source: collectors.map(c => c.name).join(','),
          success: true,
        })
        successCount++
        console.log(`  Merged: ${mergeStats.matched} matched, ${mergeStats.newAdded} new, ${mergeStats.augmented} augmented`)
        results.push({ city: city.name, status: 'incremental', pois: cleaned.length })
      } else {
        failCount++
        results.push({ city: city.name, status: 'no_data', pois: 0 })
      }
    }
  }

  // 更新 cycle
  updateRefreshCycle(cycleId, {
    status: failCount === 0 ? 'completed' : (successCount > 0 ? 'completed' : 'failed'),
    results: { success: successCount, failed: failCount, details: results },
  })

  console.log(`\n${'='.repeat(50)}`)
  console.log(`Refresh complete (${mode}):`)
  console.log(`  Success: ${successCount}`)
  console.log(`  Failed: ${failCount}`)
  console.log(`${'='.repeat(50)}`)
}

/* ── 命令: validate ── */

async function cmdValidate(args: CLIArgs): Promise<void> {
  const cities = loadCities()

  const targetCities = args.city
    ? cities.filter(c => c.id === args.city)
    : cities.filter(c => getCachedPOIs(c.id)?.length)

  if (targetCities.length === 0) {
    console.log(args.city ? `City not found or no data: ${args.city}` : 'No cities with data.')
    return
  }

  const allCollectors = createCollectors(args.sources)
  const available: SourceCollector[] = []
  for (const c of allCollectors) {
    if (await c.isAvailable()) available.push(c)
  }

  console.log(`\n--- Validating ${targetCities.length} cities ---`)
  console.log(`Sources: ${available.map(c => c.name).join(', ') || 'none available'}`)

  let totalValid = 0
  let totalStale = 0
  let totalNew = 0

  for (const city of targetCities) {
    const existingPOIs = getCachedPOIs(city.id)
    if (!existingPOIs || existingPOIs.length === 0) continue

    if (available.length === 0) {
      // 无来源: 仅报告数据年龄
      const stats = getAllCityStats().find(s => s.city_id === city.id)
      const freshness = evaluateFreshness(stats?.last_collection_at || null)
      console.log(`  ${city.name}: ${existingPOIs.length} POIs, freshness=${freshness.score} (${freshness.grade}, ${freshness.ageDays}d)`)
      continue
    }

    // 用廉价来源采集对比
    const cheapSources = selectIncrementalSources(available, false)
    const categories: L1Category[] = [...L1_CATEGORIES]
    const newRaw: RawPOI[] = []

    for (const collector of cheapSources) {
      try {
        const avail = await collector.isAvailable()
        if (!avail) continue
        const raw = await collector.collect(city, categories)
        newRaw.push(...raw)
      } catch {
        // skip
      }
    }

    const report = checkValidity(existingPOIs, newRaw, city)
    totalValid += report.valid
    totalStale += report.stale
    totalNew += report.newAdded

    console.log(`  ${city.name}: ${report.total} existing, ${report.valid} valid, ${report.stale} stale, ${report.newAdded} new available`)
  }

  console.log(`\n--- Validation Summary ---`)
  console.log(`  Total valid: ${totalValid}`)
  console.log(`  Potentially stale: ${totalStale}`)
  console.log(`  New available: ${totalNew}`)
}

/* ── 命令: help ── */

function cmdHelp(): void {
  console.log(`
POI Agent v0.3.0 — 本地旅游 POI 数据采集工具

Categories: ${L1_CATEGORIES.map(c => L1_LABELS[c].zh).join(' / ')}

Commands:
  collect     采集 POI 数据
    --city <id>         指定城市 (如: sanya, tokyo)
    --batch <N>         采集 N 个城市 (默认: 3)
    --all               全量采集所有城市
    --sources <names>   指定数据源 (逗号分隔: osm,ai)
    --concurrency <N>   并发城市数 (默认: 3)

  export      导出到 data-sync/cache-export.json

  quality     查看质量报告
    --city <id>         单城市报告

  status      查看采集状态和覆盖率

  sources     检测各数据源可用性

  refresh     增量更新 / 全量刷新
    --baseline          强制 baseline (首次全量)
    --full              强制全量刷新 (含验证)
    --city <id>         指定城市
    --max-cities <N>    限制城市数

  validate    验证 POI 有效性
    --city <id>         指定城市

Examples:
  npx tsx agent/index.ts collect --city sanya
  npx tsx agent/index.ts collect --batch 5 --sources osm,ai
  npx tsx agent/index.ts collect --all --concurrency 5
  npx tsx agent/index.ts export
  npx tsx agent/index.ts quality --city sanya
  npx tsx agent/index.ts status
  npx tsx agent/index.ts refresh
  npx tsx agent/index.ts refresh --baseline --city sanya
  npx tsx agent/index.ts validate --city sanya
`)
}

/* ── Main ── */

async function main(): Promise<void> {
  const args = parseArgs()

  console.log(`POI Agent v0.3.0`)

  // 初始化数据库
  getDB()

  try {
    switch (args.command) {
      case 'collect':
        await cmdCollect(args)
        break
      case 'export':
        cmdExport(args)
        break
      case 'quality':
        cmdQuality(args)
        break
      case 'status':
        cmdStatus()
        break
      case 'sources':
        await cmdSources()
        break
      case 'refresh':
        await cmdRefresh(args)
        break
      case 'validate':
        await cmdValidate(args)
        break
      case 'help':
      default:
        cmdHelp()
        break
    }
  } finally {
    closeDB()
  }
}

main().catch(err => {
  console.error('FATAL:', err)
  process.exit(1)
})
