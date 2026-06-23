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
  saveRawPOIs, loadRawPOIs, getRawPOIsSummary,
  upsertPendingUpdate, getPendingUpdates, getPendingUpdate,
  getPendingUpdateCount, deletePendingUpdate, applyPendingUpdate,
  insertCollectionBatch, updateCollectionBatch,
} from './db.js'
import { resetAllFallbacks, getFallbackSummary } from './model-fallback.js'
import { runWithConcurrency } from './utils.js'
import { type L1Category, type CityInfo as SourceCityInfo, type RawPOI, type SourceCollector } from './sources/base.js'
import { L1_CATEGORIES, L1_LABELS } from './categories.js'
import { OSMCollector } from './sources/osm.js'
import { AICollector } from './sources/ai.js'
import { SparkCollector } from './sources/spark.js'
import { DoubaoCollector } from './sources/doubao.js'
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
  skipCollect?: boolean
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
      case '--skip-collect':
        result.skipCollect = true
        break
      case '--force':
        result.force = true
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
    new SparkCollector(),
    new DoubaoCollector(),
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
  force = false,
): Promise<{ pois: number; success: boolean; pending?: boolean }> {
  const categories: L1Category[] = [...L1_CATEGORIES]
  const startTime = Date.now()
  const allRawPOIs: RawPOI[] = []
  let hasSuccess = false

  console.log(`\n━━━ ${city.name} (${city.nameEn}) [hotness:${city.hotness}] ━━━`)

  // 串行调用所有数据源（避免并发触发 API 限流）
  for (const collector of collectors) {
    const sourceStart = Date.now()
    try {
      const available = await collector.isAvailable()
      if (!available) {
        console.log(`  [${collector.name}] Skipped (not available)`)
        continue
      }

      const rawPOIs = await collector.collect(city, categories)
      const duration = Date.now() - sourceStart

      // 持久化原始数据 (每来源覆盖式保存，供 reprocess 复用)
      if (rawPOIs.length > 0) {
        saveRawPOIs(city.id, collector.name, rawPOIs)
      }

      // 按 categoryL1 统计各类目数量
      const byCategory: Record<string, number> = {}
      for (const poi of rawPOIs) {
        const cat = poi.categoryL1
        byCategory[cat] = (byCategory[cat] || 0) + 1
      }

      logCollection({
        city_id: city.id,
        source: collector.name,
        status: rawPOIs.length > 0 ? 'success' : 'failed',
        items_collected: rawPOIs.length,
        items_accepted: 0,
        duration_ms: duration,
        byCategory,
      })

      if (rawPOIs.length > 0) {
        hasSuccess = true
        console.log(`  [${collector.name}] ${rawPOIs.length} POIs in ${duration}ms`)
        allRawPOIs.push(...rawPOIs)
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
  }

  if (!hasSuccess || allRawPOIs.length === 0) {
    console.log(`  No POIs collected from any source`)
    updateCityStats(city.id, { success: false })
    return { pois: 0, success: false }
  }

  return processRawData(city, allRawPOIs, collectors.map(c => c.name), force)
}

/* ── 后处理: 合并 / 清洗 / 存储 ── */

/**
 * 对已聚合的 RawPOI[] 执行合并去重、质量清洗、写库。
 * 同时被 collectCity() 和 cmdReprocess() 调用，是两个 phase 的共享核心。
 *
 * 当城市已有 POI 数据且未指定 force 时，存入 pending_updates 待确认，而非直接覆盖。
 */
function processRawData(
  city: SourceCityInfo,
  allRawPOIs: RawPOI[],
  sourceNames: string[],
  force = false,
): { pois: number; success: boolean; pending?: boolean } {
  if (allRawPOIs.length === 0) {
    console.log(`  No raw POIs to process`)
    return { pois: 0, success: false }
  }

  // 合并去重 (每类目 top 100)
  const { pois, stats } = mergeAndDeduplicate(allRawPOIs, city, AGENT_CONFIG.targetPOIsPerCategory)

  // 质量校验 & 清洗
  const cleaned = cleanPOIs(pois, city)
  const report = evaluateQuality(cleaned, city)

  console.log(`  Quality: ${report.overallScore}/100 (Grade ${qualityGrade(report.overallScore)})`)
  console.log(`  Issues: ${report.issues.length} found, ${report.fixedCount} auto-fixed, ${report.discardedCount} discarded`)
  console.log(`  Score Distribution: A=${stats.scoreDistribution.A}, B=${stats.scoreDistribution.B}, C=${stats.scoreDistribution.C}, D=${stats.scoreDistribution.D}`)

  // 检查是否已有数据
  const existingPOIs = getCachedPOIs(city.id)
  const hasExisting = existingPOIs && existingPOIs.length > 0

  if (!hasExisting || force) {
    // 无已有数据或强制模式：直接写入
    if (hasExisting && force) {
      console.log(`  [Force] Overwriting existing ${existingPOIs!.length} POIs`)
    }
    upsertPOIs(city.id, cleaned)

    updateCityStats(city.id, {
      totalPois: cleaned.length,
      qualityScore: report.overallScore,
      source: sourceNames.join(','),
      success: true,
      byCategory: stats.byCategory,
    })

    return { pois: cleaned.length, success: true, pending: false }
  }

  // 有已有数据：存入 pending_updates 待确认
  upsertPendingUpdate(city.id, cleaned, {
    qualityScore: report.overallScore,
    byCategory: stats.byCategory,
    scoreDist: {
      A: stats.scoreDistribution.A,
      B: stats.scoreDistribution.B,
      C: stats.scoreDistribution.C,
      D: stats.scoreDistribution.D,
    },
    totalPois: cleaned.length,
    sourcesUsed: sourceNames,
    issuesCount: report.issues.length,
  })

  console.log(`  ⏸ Pending update stored (${cleaned.length} POIs). Existing ${existingPOIs!.length} POIs unchanged.`)
  console.log(`  Use 'confirm --city ${city.id}' to apply, or Admin UI to review.`)

  return { pois: 0, success: true, pending: true }
}

/* ── 命令: collect ── */

async function cmdCollect(args: CLIArgs): Promise<void> {
  // 新采集周期开始，重置模型降级状态（免费额度可能已刷新）
  resetAllFallbacks()
  console.log(`[Model Fallback] 降级状态已重置，当前模型:\n${getFallbackSummary()}`)

  // --skip-collect: 跳过 API 采集阶段，直接用已存储的 raw data 重处理
  if (args.skipCollect) {
    console.log(`[collect --skip-collect] Skipping API collection, loading raw data from DB...`)
    return cmdReprocess(args)
  }

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

  // 创建采集批次记录
  const batchId = insertCollectionBatch({
    batch_type: args.city ? 'incremental' : 'init',
    status: 'running',
    cities_count: targetCities.length,
    config: {
      cities: targetCities.map(c => c.id),
      sources: availableCollectors.map(c => c.name),
      force: args.force || false,
      concurrency,
    },
  })

  const tasks = targetCities.map(city => () => collectCity(city, availableCollectors, args.force))
  const results = await runWithConcurrency(tasks, concurrency)

  // 汇总
  const succeeded = results.filter(r => r.status === 'fulfilled' && (r as any).value?.success).length
  const failed = results.length - succeeded
  const pendingCount = results
    .filter((r): r is PromiseFulfilledResult<{ pois: number; success: boolean; pending?: boolean }> =>
      r.status === 'fulfilled' && r.value?.pending === true)
    .length
  const totalPOIs = results
    .filter((r): r is PromiseFulfilledResult<{ pois: number; success: boolean }> =>
      r.status === 'fulfilled')
    .reduce((sum, r) => sum + r.value.pois, 0)

  // 更新采集批次状态
  const batchStatus = failed === 0 ? 'completed' : (succeeded > 0 ? 'partial' : 'failed')
  updateCollectionBatch(batchId, {
    status: batchStatus,
    results: {
      succeeded,
      failed,
      totalPOIs,
      pendingCount,
    },
  })

  console.log(`\n${'='.repeat(50)}`)
  console.log(`Collection complete:`)
  console.log(`  Success: ${succeeded}/${results.length}`)
  console.log(`  Failed: ${failed}`)
  console.log(`  Total POIs: ${totalPOIs}`)
  if (pendingCount > 0) {
    console.log(`  Pending updates: ${pendingCount} (use 'pending' to review, 'confirm' to apply)`)
  }
  console.log(`${'='.repeat(50)}`)
}

/* ── 命令: reprocess ── */

/**
 * 从 raw_pois 表加载原始数据，重新执行合并/清洗/存储，不调用任何外部 API。
 * 适用于调整了 merger/classifier/similarity 策略后需要重新生成处理结果的场景。
 */
async function cmdReprocess(args: CLIArgs): Promise<void> {
  const allCities = loadCities()
  if (allCities.length === 0) {
    console.error('No cities loaded. Check city-registry.json.')
    process.exit(1)
  }

  // 确定目标城市 (与 cmdCollect 相同逻辑)
  let targetCities: SourceCityInfo[]
  if (args.city) {
    const city = allCities.find(c => c.id === args.city)
    if (!city) {
      console.error(`City not found: ${args.city}`)
      process.exit(1)
    }
    targetCities = [city]
  } else if (args.all) {
    targetCities = allCities
    console.log(`Reprocess mode: all ${allCities.length} cities`)
  } else {
    const batchSize = args.batch || AGENT_CONFIG.concurrentCities
    targetCities = allCities.slice(0, batchSize)
    console.log(`Reprocess mode: batch of ${targetCities.length} cities`)
  }

  console.log(`\nReprocessing ${targetCities.length} cities from raw data...`)
  console.log(`(No API calls will be made)\n`)

  let successCount = 0
  let failCount = 0
  let skipCount = 0
  let pendingCount = 0
  let totalPOIs = 0

  for (const city of targetCities) {
    const entries = loadRawPOIs(city.id)

    if (entries.length === 0) {
      console.log(`\n━━━ ${city.name} ━━━`)
      console.log(`  [Skip] No raw data found. Run 'collect' first.`)
      skipCount++
      continue
    }

    const allRawPOIs = entries.flatMap(e => e.data)
    const sourceNames = entries.map(e => e.source)
    const ages = entries.map(e => {
      const ageDays = Math.round((Date.now() - e.collected_at) / 86_400_000)
      return `${e.source}(${e.data.length}, ${ageDays}d ago)`
    })

    console.log(`\n━━━ ${city.name} (${city.nameEn}) ━━━`)
    console.log(`  Raw sources: ${ages.join(', ')} → ${allRawPOIs.length} total`)

    const result = processRawData(city, allRawPOIs, sourceNames, args.force)
    if (result.success) {
      successCount++
      if (result.pending) {
        pendingCount++
      } else {
        totalPOIs += result.pois
        console.log(`  ${result.pois} POIs saved`)
      }
    } else {
      failCount++
    }
  }

  console.log(`\n${'='.repeat(50)}`)
  console.log(`Reprocess complete:`)
  console.log(`  Success: ${successCount}, Failed: ${failCount}, Skipped: ${skipCount}`)
  console.log(`  Total POIs: ${totalPOIs}`)
  if (pendingCount > 0) {
    console.log(`  Pending updates: ${pendingCount}`)
  }
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

  // 待确认更新
  const pendingCount = getPendingUpdateCount()
  if (pendingCount > 0) {
    console.log(`  Pending updates: ${pendingCount}`)
  }

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

  // Raw Data 覆盖情况
  const rawSummary = getRawPOIsSummary()
  if (rawSummary.length > 0) {
    // 按城市分组
    const byCityMap = new Map<string, typeof rawSummary>()
    for (const row of rawSummary) {
      const list = byCityMap.get(row.city_id) || []
      list.push(row)
      byCityMap.set(row.city_id, list)
    }
    const totalItems = rawSummary.reduce((s, r) => s + r.items_count, 0)
    console.log(`\n  Raw Data Coverage (${rawSummary.length} city×source pairs, ${totalItems} total items):`)
    for (const [cityId, rows] of byCityMap) {
      const cityName = loadCities().find(c => c.id === cityId)?.name || cityId
      const detail = rows.map(r => {
        const ageDays = Math.round((Date.now() - r.collected_at) / 86_400_000)
        return `${r.source}(${r.items_count}, ${ageDays}d)`
      }).join(' ')
      const total = rows.reduce((s, r) => s + r.items_count, 0)
      console.log(`    ${cityName}: ${detail} = ${total} raw`)
    }
    console.log(`  Run 'reprocess' to re-merge/clean without re-collecting.`)
  } else {
    console.log(`\n  Raw Data Coverage: none (run 'collect' to populate)`)
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
      const result = await collectCity(city, collectors, args.force)
      if (result.success) {
        successCount++
        if (!result.pending) incrementCityVersion(city.id)
        results.push({ city: city.name, status: result.pending ? 'pending' : 'collected', pois: result.pois })
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
            saveRawPOIs(city.id, collector.name, raw)
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

        if (args.force) {
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
          // 增量结果也存 pending
          upsertPendingUpdate(city.id, cleaned, {
            byCategory: {},
            scoreDist: { A: 0, B: 0, C: 0, D: 0 },
            totalPois: cleaned.length,
            sourcesUsed: collectors.map(c => c.name),
            issuesCount: 0,
          })
          successCount++
          console.log(`  ⏸ Incremental result stored as pending (${cleaned.length} POIs, +${mergeStats.newAdded} new)`)
          results.push({ city: city.name, status: 'pending', pois: 0 })
        }
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

/* ── 命令: pending ── */

function cmdPending(): void {
  const pending = getPendingUpdates()
  const cities = loadCities()

  if (pending.length === 0) {
    console.log('\nNo pending updates.')
    return
  }

  console.log(`\n--- Pending Updates (${pending.length}) ---\n`)

  for (const p of pending) {
    const city = cities.find(c => c.id === p.city_id)
    const cityName = city?.name || p.city_id
    const byCat = JSON.parse(p.by_category) as Record<string, number>
    const sources = JSON.parse(p.sources_used) as string[]
    const ageHours = Math.round((Date.now() - p.created_at) / 3_600_000)

    // 获取旧数据对比
    const existing = getCachedPOIs(p.city_id)
    const oldCount = existing?.length || 0
    const stats = getAllCityStats().find(s => s.city_id === p.city_id)
    const oldScore = stats?.quality_score ?? null

    console.log(`  ${cityName} (${p.city_id})`)
    console.log(`    POIs: ${oldCount} → ${p.total_pois} (${p.total_pois - oldCount >= 0 ? '+' : ''}${p.total_pois - oldCount})`)
    console.log(`    Quality: ${oldScore ?? '?'} → ${p.quality_score ?? '?'}`)
    console.log(`    Categories: ${Object.entries(byCat).map(([k, v]) => `${k}:${v}`).join(', ')}`)
    console.log(`    Sources: ${sources.join(', ')} | Issues: ${p.issues_count} | Age: ${ageHours}h`)
    console.log()
  }

  console.log(`Use 'confirm --city <id>' to apply, or 'reject --city <id>' to discard.`)
}

/* ── 命令: confirm ── */

function cmdConfirm(args: CLIArgs): void {
  const cities = loadCities()

  if (args.all) {
    const pending = getPendingUpdates()
    if (pending.length === 0) {
      console.log('No pending updates to confirm.')
      return
    }

    console.log(`\nConfirming ${pending.length} pending updates...`)
    let totalPOIs = 0
    for (const p of pending) {
      const count = applyPendingUpdate(p.city_id)
      const city = cities.find(c => c.id === p.city_id)
      console.log(`  ${city?.name || p.city_id}: ${count} POIs applied`)
      totalPOIs += count
    }
    console.log(`\nDone. ${pending.length} cities confirmed, ${totalPOIs} POIs applied.`)
    return
  }

  if (!args.city) {
    console.error('Specify --city <id> or --all')
    return
  }

  const pending = getPendingUpdate(args.city)
  if (!pending) {
    console.error(`No pending update for city: ${args.city}`)
    return
  }

  const count = applyPendingUpdate(args.city)
  const city = cities.find(c => c.id === args.city)
  console.log(`\nConfirmed ${city?.name || args.city}: ${count} POIs applied.`)
}

/* ── 命令: reject ── */

function cmdReject(args: CLIArgs): void {
  const cities = loadCities()

  if (args.all) {
    const pending = getPendingUpdates()
    if (pending.length === 0) {
      console.log('No pending updates to reject.')
      return
    }

    console.log(`\nRejecting ${pending.length} pending updates...`)
    for (const p of pending) {
      deletePendingUpdate(p.city_id)
      const city = cities.find(c => c.id === p.city_id)
      console.log(`  ${city?.name || p.city_id}: discarded`)
    }
    console.log(`\nDone. ${pending.length} pending updates rejected.`)
    return
  }

  if (!args.city) {
    console.error('Specify --city <id> or --all')
    return
  }

  const pending = getPendingUpdate(args.city)
  if (!pending) {
    console.error(`No pending update for city: ${args.city}`)
    return
  }

  deletePendingUpdate(args.city)
  const city = cities.find(c => c.id === args.city)
  console.log(`\nRejected pending update for ${city?.name || args.city}.`)
}

/* ── 命令: help ── */

function cmdHelp(): void {
  console.log(`
POI Agent v0.3.0 — 本地旅游 POI 数据采集工具

Categories: ${L1_CATEGORIES.map(c => L1_LABELS[c].zh).join(' / ')}

Commands:
  collect     采集 POI 数据并保存原始数据
    --city <id>         指定城市 (如: sanya, tokyo)
    --batch <N>         采集 N 个城市 (默认: 3)
    --all               全量采集所有城市
    --sources <names>   指定数据源 (逗号分隔: osm,qwen)
    --concurrency <N>   并发城市数 (默认: 3)
    --skip-collect      跳过 API 采集，直接用已存储的 raw data 重处理
    --force             强制覆盖已有数据 (跳过 pending 确认)

  reprocess   从已保存的原始数据重新执行合并/清洗 (不调用 API)
    --city <id>         指定城市
    --batch <N>         处理 N 个城市
    --all               处理所有有 raw data 的城市
    --force             强制覆盖已有数据

  pending     查看待确认的更新列表

  confirm     确认应用待更新数据
    --city <id>         确认指定城市
    --all               确认所有待更新

  reject      丢弃待确认的更新数据
    --city <id>         丢弃指定城市
    --all               丢弃所有待更新

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
    --force             强制覆盖已有数据

  validate    验证 POI 有效性
    --city <id>         指定城市

Examples:
  npx tsx agent/index.ts collect --city sanya
  npx tsx agent/index.ts collect --batch 5 --sources osm,qwen
  npx tsx agent/index.ts collect --all --concurrency 5
  npx tsx agent/index.ts collect --city sanya --force
  npx tsx agent/index.ts reprocess --city sanya
  npx tsx agent/index.ts reprocess --all
  npx tsx agent/index.ts collect --city sanya --skip-collect
  npx tsx agent/index.ts pending
  npx tsx agent/index.ts confirm --city sanya
  npx tsx agent/index.ts confirm --all
  npx tsx agent/index.ts reject --city sanya
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
      case 'reprocess':
        await cmdReprocess(args)
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
      case 'pending':
        cmdPending()
        break
      case 'confirm':
        cmdConfirm(args)
        break
      case 'reject':
        cmdReject(args)
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
