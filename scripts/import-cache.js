/**
 * import-cache.js – 将 export-cache.json 中的 POI 和 Hotel 缓存数据导入到数据库
 *
 * 用法: node scripts/import-cache.js
 */

import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PERSISTENT_DIR = '/data/aitrip'
const DB_DIR = process.env.DB_DIR
  || (fs.existsSync(PERSISTENT_DIR) ? PERSISTENT_DIR : path.join(__dirname, '..', 'server', 'data'))
const DB_PATH = path.join(DB_DIR, 'pois.db')

const CACHE_FILE = path.join(__dirname, '..', 'data-sync', 'cache-export.json')

if (!fs.existsSync(CACHE_FILE)) {
  console.error(`❌ 缓存数据文件不存在: ${CACHE_FILE}`)
  process.exit(1)
}

console.log(`📦 Database: ${DB_PATH}`)
console.log(`📄 Cache file: ${CACHE_FILE}`)

// 确保目录存在
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true })
}

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// 创建表（如果不存在）
db.exec(`
  CREATE TABLE IF NOT EXISTS city_pois (
    city_id    TEXT    NOT NULL,
    season     TEXT    NOT NULL,
    data       TEXT    NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (city_id, season)
  )
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS hotels (
    city_id    TEXT    PRIMARY KEY,
    data       TEXT    NOT NULL,
    updated_at INTEGER NOT NULL
  )
`)

// 读取缓存数据
const cacheData = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'))

// 导入 POI 数据
let poiCount = 0
if (cacheData.pois && Array.isArray(cacheData.pois)) {
  const upsertPoi = db.prepare(`
    INSERT INTO city_pois (city_id, season, data, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(city_id, season)
    DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
  `)

  for (const row of cacheData.pois) {
    const dataStr = typeof row.data === 'string' ? row.data : JSON.stringify(row.data)
    upsertPoi.run(row.city_id, row.season, dataStr, row.updated_at)
    poiCount++
    console.log(`  ✓ POI: ${row.city_id}/${row.season} (${(dataStr.length / 1024).toFixed(1)} KB)`)
  }
}

// 导入 Hotel 数据
let hotelCount = 0
if (cacheData.hotels && Array.isArray(cacheData.hotels)) {
  const upsertHotel = db.prepare(`
    INSERT INTO hotels (city_id, data, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(city_id)
    DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
  `)

  for (const row of cacheData.hotels) {
    const dataStr = typeof row.data === 'string' ? row.data : JSON.stringify(row.data)
    upsertHotel.run(row.city_id, dataStr, row.updated_at)
    hotelCount++
    console.log(`  ✓ Hotel: ${row.city_id} (${(dataStr.length / 1024).toFixed(1)} KB)`)
  }
}

db.close()

console.log(`\n✅ 导入完成: ${poiCount} 个城市POI缓存, ${hotelCount} 个城市酒店缓存`)
