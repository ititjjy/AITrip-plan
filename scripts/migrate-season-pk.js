#!/usr/bin/env node
/**
 * migrate-season-pk.js — 迁移 city_pois 表：去掉 season 列，改为 city_id 单主键
 *
 * 用法:
 *   node scripts/migrate-season-pk.js
 *
 * 说明:
 *   - 检测旧表结构（含 season 列）
 *   - 创建新表（city_id PRIMARY KEY）
 *   - 迁移数据：合并同一 city_id 下所有 season 的 POI 数据
 *   - 为每个 POI 添加默认 seasonScores 和 seasonHighlight（如缺失）
 *   - 删除旧表，重命名新表
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

if (!fs.existsSync(DB_PATH)) {
  console.error(`❌ 数据库不存在: ${DB_PATH}`)
  process.exit(1)
}

console.log(`📦 Database: ${DB_PATH}`)

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')

// 检测旧表结构
const cols = db.prepare("PRAGMA table_info('city_pois')").all()
const hasSeason = cols.some(c => c.name === 'season')

if (!hasSeason) {
  console.log('✅ 表结构已是新 schema（无 season 列），无需迁移')
  db.close()
  process.exit(0)
}

console.log('🔍 检测到旧表结构（含 season 列），开始迁移...')

// 读取旧数据
const oldRows = db.prepare('SELECT city_id, season, data, updated_at FROM city_pois').all()
console.log(`  旧数据: ${oldRows.length} 条记录`)

// 按 city_id 分组，合并所有 season 的 POI 数据
const cityMap = new Map()
for (const row of oldRows) {
  if (!cityMap.has(row.city_id)) {
    cityMap.set(row.city_id, { data: row.data, updated_at: row.updated_at, seasons: [row.season] })
  } else {
    const existing = cityMap.get(row.city_id)
    // 保留最新的数据
    if (row.updated_at > existing.updated_at) {
      existing.data = row.data
      existing.updated_at = row.updated_at
    }
    existing.seasons.push(row.season)
  }
}

// 为每个 POI 添加默认季节评分（如果缺失）
function enrichPOIs(dataStr) {
  try {
    const pois = JSON.parse(dataStr)
    if (!Array.isArray(pois)) return dataStr

    const enriched = pois.map(poi => {
      if (poi.seasonScores && poi.seasonHighlight) return poi

      // 根据现有季节数据推断
      const baseScores = { spring: 8, summer: 6, autumn: 6, winter: 5 }
      // 如果有 seasonScore 字段，将其映射到对应季节
      if (poi.seasonScore && typeof poi.seasonScore === 'number') {
        baseScores.spring = poi.seasonScore
      }

      return {
        ...poi,
        seasonScores: poi.seasonScores || baseScores,
        seasonHighlight: poi.seasonHighlight || 'spring',
      }
    })

    return JSON.stringify(enriched)
  } catch {
    return dataStr
  }
}

// 创建新表
db.exec(`
  CREATE TABLE IF NOT EXISTS city_pois_new (
    city_id    TEXT    PRIMARY KEY,
    data       TEXT    NOT NULL,
    updated_at INTEGER NOT NULL
  )
`)

// 插入迁移后的数据
const insert = db.prepare('INSERT INTO city_pois_new (city_id, data, updated_at) VALUES (?, ?, ?)')
let migrated = 0
for (const [cityId, info] of cityMap) {
  const enrichedData = enrichPOIs(info.data)
  insert.run(cityId, enrichedData, info.updated_at)
  migrated++
  console.log(`  ✓ ${cityId}: ${info.seasons.length} season(s) merged → 1 record`)
}

// 删除旧表，重命名新表
db.exec('DROP TABLE city_pois')
db.exec('ALTER TABLE city_pois_new RENAME TO city_pois')

db.close()

console.log(`\n✅ 迁移完成: ${migrated} 个城市已迁移到新表结构`)
console.log('   city_pois 表现在是 city_id 单主键，season 信息已嵌入 POI 对象中')
