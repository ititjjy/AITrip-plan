#!/usr/bin/env node
/**
 * db-export.js — 将本地数据库导出为 data-sync/cache-export.json
 *
 * 用法:
 *   node scripts/db-export.js
 *
 * 由 "全球城市POI大师" Agent 更新本地数据库后执行
 */

import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = path.join(__dirname, '..', 'server', 'data', 'pois.db')
const SYNC_DIR = path.join(__dirname, '..', 'data-sync')
const SYNC_FILE = path.join(SYNC_DIR, 'cache-export.json')

if (!fs.existsSync(DB_PATH)) {
  console.error(`❌ 数据库不存在: ${DB_PATH}`)
  console.error('   请先由 Agent 更新本地数据库后再执行导出')
  process.exit(1)
}

console.log(`📦 Database: ${DB_PATH}`)

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')

// 读取 POI 缓存
const poiRows = db.prepare('SELECT city_id, season, data, updated_at FROM city_pois').all()
console.log(`  POI 缓存: ${poiRows.length} 条`)

// 读取酒店缓存
const hotelRows = db.prepare('SELECT city_id, data, updated_at FROM hotels').all()
console.log(`  酒店缓存: ${hotelRows.length} 条`)

// 统计各城市POI数量
const cityStats = poiRows.map(r => {
  try {
    const items = JSON.parse(r.data)
    return { city: r.city_id, season: r.season, count: Array.isArray(items) ? items.length : 0, updated: new Date(r.updated_at).toLocaleString('zh-CN') }
  } catch {
    return { city: r.city_id, season: r.season, count: 0, updated: new Date(r.updated_at).toLocaleString('zh-CN') }
  }
})

db.close()

// 导出
if (!fs.existsSync(SYNC_DIR)) fs.mkdirSync(SYNC_DIR, { recursive: true })

const exportData = {
  version: `export-${Date.now()}`,
  exportedAt: Date.now(),
  exportedAtStr: new Date().toLocaleString('zh-CN'),
  exportedFrom: 'local-agent',
  poiCityCount: poiRows.length,
  hotelCityCount: hotelRows.length,
  cities: cityStats,
  pois: poiRows,
  hotels: hotelRows,
}

fs.writeFileSync(SYNC_FILE, JSON.stringify(exportData))

const sizeKB = (fs.statSync(SYNC_FILE).size / 1024).toFixed(1)
console.log(`\n✅ 导出完成: ${SYNC_FILE} (${sizeKB} KB)`)
console.log(`\n📊 城市数据概览:`)
for (const s of cityStats) {
  console.log(`  • ${s.city}/${s.season}: ${s.count} 个POI (更新于 ${s.updated})`)
}
