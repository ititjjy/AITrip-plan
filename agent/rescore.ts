#!/usr/bin/env node
/**
 * agent/rescore.ts — 为已有 POI 数据补充评分
 *
 * 读取 agent DB 中所有城市的 POI 数据，
 * 根据完整度和置信度计算评分，回写到数据库。
 *
 * 用法: npx tsx agent/rescore.ts [--dry-run]
 */

import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = path.join(__dirname, 'data', 'agent.db')

/* ── Scoring Config (mirrors merger.ts) ── */

const L1_CATEGORIES = ['scenic', 'food', 'shopping', 'entertainment', 'experience', 'hotel', 'lifestyle']

const COMPLETENESS_WEIGHTS: Record<string, number> = {
  coords: 3, namePrimary: 3, address: 3, categoryL1: 3,
  nameZh: 1, nameEn: 1, description: 1, rating: 1, tags: 1, operatingHours: 1,
  addressEn: 0.5, cost: 0.5, visitDuration: 0.5, bestSeasons: 0.5, monthlyIndex: 0.5,
}
const MAX_WEIGHT = Object.values(COMPLETENESS_WEIGHTS).reduce((a, b) => a + b, 0)

const COMPLETENESS_FACTOR = 0.55
const CONFIDENCE_FACTOR = 0.45

function computeCompleteness(poi: any): number {
  let filled = 0

  if (poi.lat && poi.lng && (poi.lat !== 0 || poi.lng !== 0)) filled += COMPLETENESS_WEIGHTS.coords
  if (poi.namePrimary && poi.namePrimary.trim().length >= 2) filled += COMPLETENESS_WEIGHTS.namePrimary
  if (poi.address && poi.address.trim().length > 0) filled += COMPLETENESS_WEIGHTS.address
  if (poi.categoryL1 && L1_CATEGORIES.includes(poi.categoryL1)) filled += COMPLETENESS_WEIGHTS.categoryL1

  if (poi.nameZh && poi.nameZh.trim()) filled += COMPLETENESS_WEIGHTS.nameZh
  if (poi.nameEn && poi.nameEn.trim()) filled += COMPLETENESS_WEIGHTS.nameEn
  if (poi.description && poi.description.length >= 10) filled += COMPLETENESS_WEIGHTS.description
  if (poi.rating && poi.rating > 0) filled += COMPLETENESS_WEIGHTS.rating
  if (poi.tags && poi.tags.length > 0) filled += COMPLETENESS_WEIGHTS.tags
  if (poi.operatingHours && poi.operatingHours.trim()) filled += COMPLETENESS_WEIGHTS.operatingHours

  if (poi.addressEn && poi.addressEn.trim()) filled += COMPLETENESS_WEIGHTS.addressEn
  if (poi.cost && poi.cost > 0) filled += COMPLETENESS_WEIGHTS.cost
  if (poi.visitDuration && poi.visitDuration > 0) filled += COMPLETENESS_WEIGHTS.visitDuration
  if (poi.bestSeasons && poi.bestSeasons.length > 0) filled += COMPLETENESS_WEIGHTS.bestSeasons
  if (poi.monthlyIndex && poi.monthlyIndex.length === 12) filled += COMPLETENESS_WEIGHTS.monthlyIndex

  return Math.round((filled / MAX_WEIGHT) * 100)
}

function computeConfidence(poi: any): number {
  // 已存储的 POI 都是合并后的单源数据
  const source = poi.source || 'unknown'
  const bonus: Record<string, number> = { osm: 15, google: 10, foursquare: 10, amap: 10, qwen: 5 }
  return 50 + (bonus[source] || 5)
}

function computeScore(poi: any) {
  const completeness = computeCompleteness(poi)
  const confidence = computeConfidence(poi)
  const total = Math.round(COMPLETENESS_FACTOR * completeness + CONFIDENCE_FACTOR * confidence)

  // Infer source list from source field (IDs are now pure numbers, no source prefix)
  const sources: string[] = []
  if (poi.source) {
    sources.push(poi.source)
  }

  return {
    total,
    completeness,
    confidence,
    sourceCount: sources.length || 1,
    sources: sources.length > 0 ? sources : ['unknown'],
    conflictCount: 0,
  }
}

function gradeLabel(score: number): string {
  if (score >= 85) return 'A'
  if (score >= 65) return 'B'
  if (score >= 45) return 'C'
  return 'D'
}

/* ── Main ── */

const dryRun = process.argv.includes('--dry-run')

console.log(`POI Rescore Migration${dryRun ? ' (DRY RUN)' : ''}`)
console.log(`DB: ${DB_PATH}`)

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')

const rows = db.prepare('SELECT city_id, data FROM city_pois').all() as { city_id: string; data: string }[]
console.log(`Cities with POI data: ${rows.length}`)

const distribution = { A: 0, B: 0, C: 0, D: 0 }
let totalUpdated = 0
let totalSkipped = 0

const updateStmt = db.prepare('UPDATE city_pois SET data = ? WHERE city_id = ?')

for (const row of rows) {
  let pois: any[]
  try {
    pois = JSON.parse(row.data)
  } catch {
    console.log(`  [${row.city_id}] Invalid JSON, skipping`)
    continue
  }

  let updated = 0
  let skipped = 0

  for (const poi of pois) {
    if (poi.score && typeof poi.score.total === 'number') {
      skipped++
      const g = gradeLabel(poi.score.total)
      distribution[g as keyof typeof distribution]++
      continue
    }

    poi.score = computeScore(poi)
    const g = gradeLabel(poi.score.total)
    distribution[g as keyof typeof distribution]++
    updated++
  }

  if (updated > 0 && !dryRun) {
    updateStmt.run(JSON.stringify(pois), row.city_id)
  }

  totalUpdated += updated
  totalSkipped += skipped
  console.log(`  [${row.city_id}] ${pois.length} POIs: ${updated} scored, ${skipped} already had scores`)
}

db.close()

console.log(`\nResults:`)
console.log(`  Updated: ${totalUpdated}`)
console.log(`  Skipped (already scored): ${totalSkipped}`)
console.log(`  Distribution: A=${distribution.A}, B=${distribution.B}, C=${distribution.C}, D=${distribution.D}`)

if (dryRun) {
  console.log(`\n(DRY RUN — no changes written)`)
}
